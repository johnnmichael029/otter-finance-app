const User = require('../models/userModel');

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
            pushToken: req.user.pushToken,
            createdAt: req.user.createdAt,
        });
    } catch (err) {
        console.error('[USER] getProfile error:', err.message);
        res.status(500).json({ error: 'Failed to fetch profile.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  PATCH /api/users/me
//  Body: { name, currency, avatarUrl }
//  Update profile fields (not password — use dedicated endpoint for that)
// ─────────────────────────────────────────────────────────────────────────────
const updateProfile = async (req, res) => {
    try {
        const { name, currency, avatarUrl } = req.body;
        const updates = {};
        if (name) updates.name = name;
        if (currency) updates.currency = currency;
        if (avatarUrl !== undefined) updates.avatarUrl = avatarUrl;

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

module.exports = { getProfile, updateProfile, savePushToken };
