const User = require('../models/userModel');
const jwt = require('jsonwebtoken');

// ── Helper: Sign a JWT for a user ─────────────────────────────────────────────
const signToken = (userId) => {
    return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '8h' });
};

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/auth/register
//  Body: { name, email, password }
//  Returns: { user, token }
// ─────────────────────────────────────────────────────────────────────────────
const register = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Name, email, and password are required.' });
        }

        const existing = await User.findOne({ email: email.toLowerCase().trim() });
        if (existing) {
            return res.status(409).json({ error: 'An account with this email already exists.' });
        }

        const user = await User.create({ name, email, password });
        const token = signToken(user._id);

        res.status(201).json({
            token,
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                currency: user.currency,
                avatarUrl: user.avatarUrl,
            }
        });
    } catch (err) {
        console.error('[AUTH] Register error:', err.message);
        res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/auth/login
//  Body: { email, password, source: 'mobile' }
//  Returns: { user, token }
// ─────────────────────────────────────────────────────────────────────────────
const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required.' });
        }

        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        const token = signToken(user._id);

        res.json({
            token,
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                currency: user.currency,
                avatarUrl: user.avatarUrl,
                pushToken: user.pushToken,
            }
        });
    } catch (err) {
        console.error('[AUTH] Login error:', err.message);
        res.status(500).json({ error: 'Login failed. Please try again.' });
    }
};

module.exports = { register, login };
