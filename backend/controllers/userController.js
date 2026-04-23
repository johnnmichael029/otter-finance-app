const User = require('../models/userModel');
const { convertUserFinances } = require('../services/currencyConversionService');

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/users/me
//  Returns the authenticated user's profile
// ─────────────────────────────────────────────────────────────────────────────
const getProfile = async (req, res) => {
    try {
        res.json({
            _id: req.user._id,
            name: req.user.name,
            email: req.user.email,
            currency: req.user.currency,
            avatarUrl: req.user.avatarUrl,
            isOnboarded: req.user.isOnboarded,
            pushToken: req.user.pushToken,
            createdAt: req.user.createdAt,
        });
    } catch (err) {
        console.error('[USER] getProfile error:', err.message);
        res.status(500).json({ error: 'Failed to fetch profile.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
const updateProfile = async (req, res) => {
    try {
        const { name, currency, avatarUrl, isOnboarded } = req.body;
        const updates = {};
        if (name) updates.name = name;
        if (avatarUrl !== undefined) updates.avatarUrl = avatarUrl;
        if (isOnboarded !== undefined) updates.isOnboarded = isOnboarded;

        // ── Handle Currency Migration ──────────────────────────────────────────
        if (currency && currency !== req.user.currency) {
            try {
                await convertUserFinances(req.userId, req.user.currency, currency);
                updates.currency = currency;
                
                // Fire a real-time event to the user's active devices to re-sync dashboard
                const io = req.app.get('io');
                if (io) {
                    io.to(`user:${req.userId}`).emit('currency_updated');
                }
            } catch (err) {
                return res.status(503).json({ error: 'Currency conversion service is currently unavailable. Please try again later.' });
            }
        } else if (currency) {
            updates.currency = currency;
        }

        const user = await User.findByIdAndUpdate(
            req.userId,
            { $set: updates },
            { new: true, runValidators: true }
        ).select('-password');

        res.json(user);
    } catch (err) {
        console.error('[USER] updateProfile error:', err.message);
        res.status(500).json({ error: 'Failed to update profile.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/users/push-token
//  Body: { pushToken }
//  Called by the mobile app after Expo grants a push token on login
// ─────────────────────────────────────────────────────────────────────────────
const savePushToken = async (req, res) => {
    try {
        const { pushToken } = req.body;

        if (!pushToken) {
            return res.status(400).json({ error: 'pushToken is required.' });
        }

        await User.findByIdAndUpdate(req.userId, { $set: { pushToken } });
        res.json({ message: 'Push token saved.' });
    } catch (err) {
        console.error('[USER] savePushToken error:', err.message);
        res.status(500).json({ error: 'Failed to save push token.' });
    }
};

const completeOnboarding = async (req, res) => {
    try {
        const { currency } = req.body;
        const updates = { isOnboarded: true };

        // ── Handle Currency Migration ──────────────────────────────────────────
        // If they already have data (legacy user) and choose a different currency
        if (currency && currency !== req.user.currency) {
            try {
                await convertUserFinances(req.userId, req.user.currency, currency);
                updates.currency = currency;
            } catch (err) {
                return res.status(503).json({ error: 'Currency conversion service unavailable. Conversion failed.' });
            }
        } else if (currency) {
            updates.currency = currency;
        }

        const user = await User.findByIdAndUpdate(
            req.userId,
            { $set: updates },
            { new: true }
        ).select('-password');

        res.json(user);
    } catch (err) {
        console.error('[USER] completeOnboarding error:', err.message);
        res.status(500).json({ error: 'Failed to complete onboarding.' });
    }
};

module.exports = { getProfile, updateProfile, savePushToken, completeOnboarding };
