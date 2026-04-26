const User = require('../models/userModel');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { validationResult } = require('express-validator');
const { send2FAOTP, sendEmail } = require('../utils/emailService');
const { OAuth2Client } = require('google-auth-library');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

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
                otterTag: user.otterTag,
                occupation: user.occupation,
                createdAt: user.createdAt,
            }
        });
    } catch (err) {
        console.error('[AUTH] Register error:', err.message);
        res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/auth/request-register-otp
// ─────────────────────────────────────────────────────────────────────────────
const requestRegisterOTP = async (req, res) => {
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

        // Generate 6-digit code
        const otp = String(Math.floor(100000 + Math.random() * 900000));
        
        // Hash it for the JWT payload so the raw OTP isn't sent back to the client
        const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

        // Create a temporary token containing the registration data
        const tempToken = jwt.sign(
            { name, email: email.toLowerCase().trim(), password, otpHash, type: 'register_pending' },
            process.env.JWT_SECRET,
            { expiresIn: '10m' }
        );

        // Send Email
        const emailContent = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e1e1e1; border-radius: 10px;">
                <h2 style="color: #E91E8C; text-align: center;">Verify Your Email</h2>
                <p>Hello <strong>${name}</strong>,</p>
                <p>Welcome to Otter Finance! Use the verification code below to complete your registration:</p>
                <div style="background-color: #fce7f3; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
                    <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #B0146A;">${otp}</span>
                </div>
                <p style="color: #6b7280; font-size: 13px;">This code is valid for <strong>10 minutes</strong>. If you did not request this, please ignore this email.</p>
                <hr style="border: 0; border-top: 1px solid #eeeeee; margin: 20px 0;">
                <p style="text-align: center; color: #9ca3af; font-size: 12px;">Otter Finance App &bull; Securely Managing Your Raft</p>
            </div>
        `;

        await sendEmail({
            to: email,
            subject: `[Otter] Registration Verification Code: ${otp}`,
            html: emailContent,
        });

        res.json({ tempToken, message: 'Verification code sent.' });
    } catch (err) {
        console.error('[AUTH] Request Register OTP error:', err.message);
        res.status(500).json({ error: 'Failed to send verification code.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/auth/verify-register-otp
// ─────────────────────────────────────────────────────────────────────────────
const verifyRegisterOTP = async (req, res) => {
    try {
        const { tempToken, otp } = req.body;
        if (!tempToken || !otp) return res.status(400).json({ error: 'Token and code are required.' });

        const decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
        if (decoded.type !== 'register_pending') {
            return res.status(400).json({ error: 'Invalid token type.' });
        }

        const hashedInput = crypto.createHash('sha256').update(otp).digest('hex');
        if (hashedInput !== decoded.otpHash) {
            return res.status(401).json({ error: 'Invalid verification code. Please try again.' });
        }

        const { name, email, password } = decoded;

        // Double check if exists (in case they clicked verify twice or someone else registered)
        const existing = await User.findOne({ email });
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
                otterTag: user.otterTag,
                occupation: user.occupation,
                createdAt: user.createdAt,
            }
        });
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Verification session expired. Please register again.' });
        }
        console.error('[AUTH] Verify Register OTP error:', err.message);
        res.status(500).json({ error: 'Verification failed.' });
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
                otterTag: user.otterTag,
                occupation: user.occupation,
                createdAt: user.createdAt,
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

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/auth/google
// ─────────────────────────────────────────────────────────────────────────────
const googleLogin = async (req, res) => {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ error: 'Google ID Token is required.' });

    try {
        const ticket = await client.verifyIdToken({
            idToken,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        const { sub: googleId, email, name, picture } = payload;

        let user = await User.findOne({ 
            $or: [{ googleId }, { email: email.toLowerCase().trim() }] 
        });

        let isNewUser = false;

        if (!user) {
            // Create a new user (passwordless)
            user = await User.create({
                name,
                email: email.toLowerCase().trim(),
                googleId,
                avatarUrl: picture,
                isOnboarded: false
            });
            isNewUser = true;
        } else {
            // Link googleId if they had a local account
            if (!user.googleId) {
                user.googleId = googleId;
                if (!user.avatarUrl) user.avatarUrl = picture;
                await user.save();
            }
        }

        // Reset lockout
        user.loginAttempts = 0;
        user.lockUntil = null;

        // Session creation
        const now = new Date();
        user.sessions = (user.sessions || []).filter(s => s.expiresAt > now);
        const refreshToken = signRefreshToken(user._id);
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        
        user.sessions.push({
            tokenHash: hashToken(refreshToken),
            deviceInfo: req.headers['x-device-info'] || 'Unknown Device',
            platform: req.headers['x-platform'] || 'mobile',
            ipAddress: req.ip,
            expiresAt,
        });
        await user.save();

        const accessToken = signAccessToken(user._id);

        res.json({
            accessToken,
            refreshToken,
            isNewUser, // Screen redirection flag
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                currency: user.currency,
                avatarUrl: user.avatarUrl,
                pushToken: user.pushToken,
                isOnboarded: user.isOnboarded,
                occupation: user.occupation,
                createdAt: user.createdAt,
            }
        });
    } catch (err) {
        console.error('[AUTH] Google Auth Error:', err.message);
        res.status(401).json({ error: 'Google authentication failed.' });
    }
};

module.exports = { 
    register, requestRegisterOTP, verifyRegisterOTP, login, refresh, logout, logoutAll, 
    getSessions, revokeSession, verify2FA, resend2FA, 
    toggle2FA, verifyPassword, googleLogin,
    forgotPassword, verifyResetCode, resetPassword
};

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
            user: { _id: user._id, name: user.name, email: user.email, currency: user.currency, avatarUrl: user.avatarUrl, pushToken: user.pushToken, isOnboarded: user.isOnboarded, otterTag: user.otterTag, occupation: user.occupation, createdAt: user.createdAt },
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

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/auth/forgot-password
// ─────────────────────────────────────────────────────────────────────────────
async function forgotPassword(req, res) {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email is required.' });

        const user = await User.findOne({ email: email.toLowerCase() });
        
        // HELPFUL MODE: Inform the user if the account doesn't exist
        if (!user) {
            return res.status(404).json({ error: 'No account found with this email address.' });
        }

        // Generate 6-digit code
        const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        user.passwordResetCode = resetCode;
        user.passwordResetExpires = expiresAt;
        await user.save();

        // Send Email
        const emailContent = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e1e1e1; border-radius: 10px;">
                <h2 style="color: #E91E8C; text-align: center;">Reset Your Password</h2>
                <p>Hello <strong>${user.name || 'Otter User'}</strong>,</p>
                <p>We received a request to reset your Otter Finance password. Use the verification code below to proceed:</p>
                <div style="background-color: #fce7f3; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
                    <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #B0146A;">${resetCode}</span>
                </div>
                <p style="color: #6b7280; font-size: 13px;">This code is valid for <strong>10 minutes</strong>. If you did not request this, please ignore this email.</p>
                <hr style="border: 0; border-top: 1px solid #eeeeee; margin: 20px 0;">
                <p style="text-align: center; color: #9ca3af; font-size: 12px;">Otter Finance App &bull; Securely Managing Your Raft</p>
            </div>
        `;

        await sendEmail({
            to: user.email,
            subject: `[Otter] Password Reset Code: ${resetCode}`,
            html: emailContent,
        });

        res.json({ message: 'If an account exists, a verification code was sent.' });
    } catch (error) {
        console.error('[Forgot Password Error]:', error);
        res.status(500).json({ error: 'Failed to send reset code.' });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/auth/verify-reset-code
// ─────────────────────────────────────────────────────────────────────────────
async function verifyResetCode(req, res) {
    try {
        const { email, code } = req.body;
        if (!email || !code) return res.status(400).json({ error: 'Email and code are required.' });

        const user = await User.findOne({ 
            email: email.toLowerCase(),
            passwordResetCode: code,
            passwordResetExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ error: 'Invalid or expired code.' });
        }

        // Generate a temporary reset JWT (valid for 10 mins)
        const resetToken = jwt.sign(
            { id: user._id, type: 'password_reset' },
            process.env.JWT_SECRET,
            { expiresIn: '10m' }
        );

        // Clear code to prevent reuse
        user.passwordResetCode = null;
        user.passwordResetExpires = null;
        await user.save();

        res.json({ resetToken });
    } catch (error) {
        console.error('[Verify Reset Code Error]:', error);
        res.status(500).json({ error: 'Verification failed.' });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/auth/reset-password
// ─────────────────────────────────────────────────────────────────────────────
async function resetPassword(req, res) {
    try {
        const { resetToken, newPassword } = req.body;
        if (!resetToken || !newPassword) return res.status(400).json({ error: 'Missing information.' });

        // Verify token
        const decoded = jwt.verify(resetToken, process.env.JWT_SECRET);
        if (decoded.type !== 'password_reset') {
            return res.status(400).json({ error: 'Invalid token type.' });
        }

        const user = await User.findById(decoded.id);
        if (!user) return res.status(404).json({ error: 'User no longer exists.' });

        // Update password (hashing is handled by userModel's pre-save middleware)
        user.password = newPassword;
        
        // Revoke all existing sessions for security
        user.sessions = [];
        await user.save();

        res.json({ message: 'Password updated successfully.' });
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Reset session expired. Please start over.' });
        }
        console.error('[Reset Password Error]:', error);
        res.status(500).json({ error: 'Failed to reset password.' });
    }
}
