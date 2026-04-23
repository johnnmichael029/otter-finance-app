const User = require('../models/userModel');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { validationResult } = require('express-validator');
const { send2FAOTP } = require('../utils/emailService');

// ── Token helpers ──────────────────────────────────────────────────────────────
const signAccessToken = (userId) =>
    jwt.sign({ id: userId, type: 'access' }, process.env.JWT_SECRET, { expiresIn: '15m' });

const signRefreshToken = (userId) =>
    jwt.sign({ id: userId, type: 'refresh' }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });

const hashToken = (token) =>
    crypto.createHash('sha256').update(token).digest('hex');

// ── Smart Account Lockout Tiers ────────────────────────────────────────────────
// loginAttempts is CUMULATIVE across all failed logins (never resets until success).
// Each tier triggers when total failures reach minAttempts, locking for longer each time.
const LOCKOUT_TIERS = [
    { minAttempts:  3, durationMs:           60 * 1000, label: '1 minute'   },
    { minAttempts:  5, durationMs:      15 * 60 * 1000, label: '15 minutes' },
    { minAttempts:  8, durationMs:      60 * 60 * 1000, label: '1 hour'     },
    { minAttempts: 10, durationMs:   6 * 60 * 60 * 1000, label: '6 hours'   },
    { minAttempts: 12, durationMs:  24 * 60 * 60 * 1000, label: '24 hours'  },
];

// Returns the highest lockout tier applicable for the given attempt count.
const getLockoutTier = (attempts) => {
    let tier = null;
    for (const t of LOCKOUT_TIERS) {
        if (attempts >= t.minAttempts) tier = t;
    }
    return tier; // null = no lockout yet (under 3 attempts)
};

// Converts milliseconds to a human-readable "Xh Ym" or "Xm Ys" string.
const formatTimeRemaining = (ms) => {
    const total = Math.ceil(ms / 1000);
    const hours = Math.floor(total / 3600);
    const mins  = Math.floor((total % 3600) / 60);
    const secs  = total % 60;
    if (hours > 0) return `${hours}h${mins > 0 ? ` ${mins}m` : ''}`;
    if (mins  > 0) return `${mins}m${secs > 0 ? ` ${secs}s` : ''}`;
    return `${secs}s`;
};

// ── Format session for client response ────────────────────────────────────────
const formatSession = (s) => ({
    id: s._id,
    deviceInfo: s.deviceInfo,
    platform: s.platform,
    ipAddress: s.ipAddress,
    createdAt: s.createdAt,
    lastUsedAt: s.lastUsedAt,
    expiresAt: s.expiresAt,
});

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/auth/register
// ─────────────────────────────────────────────────────────────────────────────
const register = async (req, res) => {
    // Validate inputs
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
    }

    try {
        const { name, email, password } = req.body;

        const existing = await User.findOne({ email: email.toLowerCase().trim() });
        if (existing) {
            return res.status(409).json({ error: 'An account with this email already exists.' });
        }

        const user = await User.create({ name, email, password });

        // Issue tokens
        const accessToken = signAccessToken(user._id);
        const refreshToken = signRefreshToken(user._id);

        // Create session
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        user.sessions.push({
            tokenHash: hashToken(refreshToken),
            deviceInfo: req.headers['x-device-info'] || 'Unknown Device',
            platform: req.headers['x-platform'] || 'mobile',
            ipAddress: req.ip,
            expiresAt,
        });
        await user.save();

        res.status(201).json({
            accessToken,
            refreshToken,
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                currency: user.currency,
                avatarUrl: user.avatarUrl,
                isOnboarded: user.isOnboarded,
            }
        });
    } catch (err) {
        console.error('[AUTH] Register error:', err.message);
        res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
};

// ───────────────────────────────────────────────────────────────────────────────────
//  POST /api/auth/login
// ───────────────────────────────────────────────────────────────────────────────────
const login = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
    }

    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email: email.toLowerCase().trim() });

        // ── 1. Unknown email — use vague message to prevent user enumeration
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        // ── 2. Check if account is currently locked
        const now = new Date();
        if (user.lockUntil && user.lockUntil > now) {
            const remainingMs = user.lockUntil - now;
            const timeStr = formatTimeRemaining(remainingMs);
            return res.status(429).json({
                error: `Account temporarily locked. Try again in ${timeStr}.`,
                lockedUntil: user.lockUntil,
                remainingMs,
            });
        }

        // ── 3. Check password
        const isMatch = await user.comparePassword(password);

        if (!isMatch) {
            // Increment cumulative failure counter
            user.loginAttempts = (user.loginAttempts || 0) + 1;

            // Apply the correct lockout tier (or no lock for early attempts)
            const tier = getLockoutTier(user.loginAttempts);
            if (tier) {
                user.lockUntil = new Date(Date.now() + tier.durationMs);
            }

            await user.save();

            // Build a helpful response
            if (tier) {
                return res.status(429).json({
                    error: `Too many failed attempts. Account locked for ${tier.label}.`,
                    lockedUntil: user.lockUntil,
                    remainingMs: tier.durationMs,
                    totalAttempts: user.loginAttempts,
                });
            }

            const attemptsLeft = 3 - user.loginAttempts; // warn before first lock kicks in
            if (attemptsLeft > 0) {
                return res.status(401).json({
                    error: `Invalid email or password. ${attemptsLeft} attempt${attemptsLeft !== 1 ? 's' : ''} remaining before lockout.`,
                });
            }

            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        // ── 4. SUCCESS — reset lockout counters
        user.loginAttempts = 0;
        user.lockUntil     = null;

        // ── 5. Check if 2FA is enabled → send OTP instead of full tokens
        if (user.twoFactorEnabled) {
            const otp = generateOTP();
            user.twoFAOTP    = hashToken(otp);
            user.twoFAExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min
            await user.save();

            // Send OTP email (non-blocking on failure so user still gets tempToken)
            try { await send2FAOTP(user.email, user.name, otp); } catch (e) {
                console.error('[2FA] Email send failed:', e.message);
            }

            const tempToken = signTempToken(user._id);
            return res.json({
                requires2FA: true,
                tempToken,
                maskedEmail: user.email.replace(/(.{2})(.*)(@.*)/, '$1***$3'),
            });
        }

        // ── 6. No 2FA — create session and return full tokens
        user.sessions = (user.sessions || []).filter(s => s.expiresAt > now);
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        user.sessions.push({
            tokenHash:  hashToken(signRefreshToken(user._id)), // placeholder; overwritten below
            deviceInfo: req.headers['x-device-info'] || 'Unknown Device',
            platform:   req.headers['x-platform'] || 'mobile',
            ipAddress:  req.ip,
            expiresAt,
        });
        await user.save();

        const accessToken  = signAccessToken(user._id);
        const refreshToken = signRefreshToken(user._id);

        const lastSession = user.sessions[user.sessions.length - 1];
        lastSession.tokenHash = hashToken(refreshToken);
        await user.save();

        res.json({
            accessToken,
            refreshToken,
            user: {
                _id:       user._id,
                name:      user.name,
                email:     user.email,
                currency:  user.currency,
                avatarUrl: user.avatarUrl,
                pushToken: user.pushToken,
                isOnboarded: user.isOnboarded,
            }
        });

    } catch (err) {
        console.error('[AUTH] Login error:', err.message);
        res.status(500).json({ error: 'Login failed. Please try again.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/auth/refresh  — Exchange refresh token for new access token
// ─────────────────────────────────────────────────────────────────────────────
const refresh = async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) {
        return res.status(401).json({ error: 'Refresh token required.' });
    }

    try {
        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
        if (decoded.type !== 'refresh') {
            return res.status(401).json({ error: 'Invalid token type.' });
        }

        const user = await User.findById(decoded.id);
        if (!user) {
            return res.status(401).json({ error: 'User not found.' });
        }

        // Check if this refresh token matches a stored session
        const tokenHash = hashToken(refreshToken);
        const session = user.sessions.find(
            s => s.tokenHash === tokenHash && s.expiresAt > new Date()
        );
        if (!session) {
            return res.status(401).json({ error: 'Session expired or revoked. Please log in again.' });
        }

        // Update last used
        session.lastUsedAt = new Date();
        await user.save();

        const newAccessToken = signAccessToken(user._id);
        res.json({ accessToken: newAccessToken });
    } catch (err) {
        console.error('[AUTH] Refresh error:', err.message);
        return res.status(401).json({ error: 'Invalid or expired refresh token. Please log in again.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/auth/logout  — Revoke current session
// ─────────────────────────────────────────────────────────────────────────────
const logout = async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.json({ message: 'Logged out.' });

    try {
        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
        const user = await User.findById(decoded.id);
        if (user) {
            const tokenHash = hashToken(refreshToken);
            user.sessions = user.sessions.filter(s => s.tokenHash !== tokenHash);
            await user.save();
        }
    } catch (_) { /* ignore errors on logout */ }

    res.json({ message: 'Logged out successfully.' });
};

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/auth/logout-all  — Revoke ALL sessions (for this user)
// ─────────────────────────────────────────────────────────────────────────────
const logoutAll = async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        if (user) {
            user.sessions = [];
            await user.save();
        }
        res.json({ message: 'All sessions revoked.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to revoke sessions.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/auth/sessions  — List active sessions
// ─────────────────────────────────────────────────────────────────────────────
const getSessions = async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        const now = new Date();
        const active = (user.sessions || [])
            .filter(s => s.expiresAt > now)
            .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
            .map(formatSession);
        res.json({ sessions: active });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch sessions.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  DELETE /api/auth/sessions/:sessionId  — Revoke a specific session
// ─────────────────────────────────────────────────────────────────────────────
const revokeSession = async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        user.sessions = user.sessions.filter(
            s => s._id.toString() !== req.params.sessionId
        );
        await user.save();
        res.json({ message: 'Session revoked.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to revoke session.' });
    }
};

module.exports = { register, login, refresh, logout, logoutAll, getSessions, revokeSession, verify2FA, resend2FA, toggle2FA, verifyPassword };

// ── 2FA Helpers ───────────────────────────────────────────────────────────────
// Signed short-lived temp token used only for 2FA verification step
const signTempToken = (userId) =>
    jwt.sign({ id: userId, type: '2fa_pending' }, process.env.JWT_SECRET, { expiresIn: '10m' });

// Generate a random 6-digit OTP string
const generateOTP = () => String(Math.floor(100000 + Math.random() * 900000));

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/auth/verify-2fa
//  Body: { tempToken, otp }
//  Returns: { accessToken, refreshToken, user }
// ─────────────────────────────────────────────────────────────────────────────
async function verify2FA(req, res) {
    const { tempToken, otp } = req.body;
    if (!tempToken || !otp) {
        return res.status(400).json({ error: 'Token and OTP are required.' });
    }
    try {
        const decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
        if (decoded.type !== '2fa_pending') {
            return res.status(401).json({ error: 'Invalid verification token.' });
        }

        const user = await User.findById(decoded.id);
        if (!user) return res.status(401).json({ error: 'User not found.' });

        // Check OTP expiry
        if (!user.twoFAExpiry || user.twoFAExpiry < new Date()) {
            return res.status(401).json({ error: 'Verification code has expired. Please request a new one.' });
        }

        // Compare hashed OTP
        const hashedInput = hashToken(otp);
        if (hashedInput !== user.twoFAOTP) {
            return res.status(401).json({ error: 'Invalid verification code. Please try again.' });
        }

        // Clear OTP fields
        user.twoFAOTP    = null;
        user.twoFAExpiry = null;
        user.loginAttempts = 0;
        user.lockUntil   = null;

        // Create session
        const now = new Date();
        user.sessions = (user.sessions || []).filter(s => s.expiresAt > now);
        const accessToken  = signAccessToken(user._id);
        const refreshToken = signRefreshToken(user._id);
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        user.sessions.push({
            tokenHash:  hashToken(refreshToken),
            deviceInfo: req.headers['x-device-info'] || 'Unknown Device',
            platform:   req.headers['x-platform']    || 'mobile',
            ipAddress:  req.ip,
            expiresAt,
        });
        await user.save();

        res.json({
            accessToken, refreshToken,
            user: { _id: user._id, name: user.name, email: user.email, currency: user.currency, avatarUrl: user.avatarUrl, pushToken: user.pushToken, isOnboarded: user.isOnboarded },
        });
    } catch (err) {
        console.error('[2FA] Verify error:', err.message);
        res.status(401).json({ error: 'Verification failed. Please log in again.' });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/auth/2fa/resend  (requires tempToken in body)
// ─────────────────────────────────────────────────────────────────────────────
async function resend2FA(req, res) {
    const { tempToken } = req.body;
    if (!tempToken) return res.status(400).json({ error: 'Temp token required.' });
    try {
        const decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
        if (decoded.type !== '2fa_pending') return res.status(401).json({ error: 'Invalid token.' });

        const user = await User.findById(decoded.id);
        if (!user) return res.status(401).json({ error: 'User not found.' });

        const otp = generateOTP();
        user.twoFAOTP    = hashToken(otp);
        user.twoFAExpiry = new Date(Date.now() + 10 * 60 * 1000);
        await user.save();

        await send2FAOTP(user.email, user.name, otp);
        res.json({ message: 'New verification code sent.' });
    } catch (err) {
        console.error('[2FA] Resend error:', err.message);
        res.status(500).json({ error: 'Failed to resend code. Please try again.' });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/auth/2fa/toggle  — Enable or disable 2FA (requires auth)
// ─────────────────────────────────────────────────────────────────────────────
async function toggle2FA(req, res) {
    try {
        const user = await User.findById(req.userId);
        user.twoFactorEnabled = !user.twoFactorEnabled;
        // Clear any pending OTP when toggling
        user.twoFAOTP    = null;
        user.twoFAExpiry = null;
        await user.save();
        res.json({ twoFactorEnabled: user.twoFactorEnabled });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update 2FA setting.' });
    }
}
// -----------------------------------------------------------------------------
//  POST /api/auth/verify-password
// -----------------------------------------------------------------------------
async function verifyPassword(req, res) {
    try {
        const { password } = req.body;
        if (!password) return res.status(400).json({ error: 'Password is required.' });

        const user = await User.findById(req.userId).select('+password');
        if (!user) return res.status(404).json({ error: 'User not found.' });

        const isMatch = await user.comparePassword(password);
        if (!isMatch) return res.status(401).json({ error: 'Incorrect password.' });

        res.json({ success: true, message: 'Password verified.' });
    } catch (err) {
        console.error('[AUTH] Verify password error:', err.message);
        res.status(500).json({ error: 'Failed to verify password.' });
    }
}
