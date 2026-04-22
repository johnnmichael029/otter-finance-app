const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const rateLimit = require('express-rate-limit');
const requireAuth = require('../middleware/requireAuth');
const {
    register, login, refresh,
    logout, logoutAll,
    getSessions, revokeSession,
    verify2FA, resend2FA, toggle2FA, verifyPassword,
} = require('../controllers/authController');

// ── Rate Limiters ──────────────────────────────────────────────────────────────
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,   // 15 minutes
    max: 10,                      // Max 10 login/register attempts per window
    message: { error: 'Too many attempts. Please try again in 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const refreshLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,    // 5 minutes
    max: 30,                     // Generous for token refreshes
    message: { error: 'Too many refresh requests. Please try again shortly.' },
});

// ── Input Validators ──────────────────────────────────────────────────────────
const registerValidators = [
    body('name')
        .trim()
        .notEmpty().withMessage('Name is required.')
        .isLength({ max: 100 }).withMessage('Name must be under 100 characters.')
        .escape(),
    body('email')
        .trim()
        .notEmpty().withMessage('Email is required.')
        .isEmail().withMessage('Please enter a valid email address.')
        .normalizeEmail(),
    body('password')
        .notEmpty().withMessage('Password is required.')
        .isLength({ min: 6 }).withMessage('Password must be at least 6 characters.'),
];

const loginValidators = [
    body('email')
        .trim()
        .notEmpty().withMessage('Email is required.')
        .isEmail().withMessage('Please enter a valid email address.')
        .normalizeEmail(),
    body('password')
        .notEmpty().withMessage('Password is required.'),
];

// ── Auth Routes ────────────────────────────────────────────────────────────────

// Public — registration & login (rate-limited + validated)
router.post('/register', authLimiter, registerValidators, register);
router.post('/login',    authLimiter, loginValidators, login);

// Token refresh (no auth required, validated by refresh token)
router.post('/refresh',  refreshLimiter, refresh);

// Logout (no auth required — refresh token in body)
router.post('/logout', logout);

// Protected — session management
router.post('/logout-all',             requireAuth, logoutAll);
router.get('/sessions',                requireAuth, getSessions);
router.delete('/sessions/:sessionId',  requireAuth, revokeSession);

// 2FA routes
router.post('/verify-2fa',  verify2FA);
router.post('/2fa/resend',  resend2FA);
router.post('/2fa/toggle',  requireAuth, toggle2FA);
router.get('/2fa/status',   requireAuth, async (req, res) => {
    try {
        const User = require('../models/userModel');
        const user = await User.findById(req.userId).select('twoFactorEnabled email');
        res.json({ twoFactorEnabled: user?.twoFactorEnabled ?? false });
    } catch { res.status(500).json({ error: 'Failed.' }); }
});

// Step-up authentication — verify master password before sensitive actions
router.post('/verify-password', requireAuth, verifyPassword);

module.exports = router;
