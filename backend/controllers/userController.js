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
        const { name, currency, avatarUrl, isOnboarded, occupation } = req.body;
        const updates = {};
        if (name) updates.name = name;
        if (avatarUrl !== undefined) updates.avatarUrl = avatarUrl;
        if (isOnboarded !== undefined) updates.isOnboarded = isOnboarded;
        if (occupation) updates.occupation = occupation;

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
            { returnDocument: 'after', runValidators: true }
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

        await User.findByIdAndUpdate(req.userId, { $set: { pushToken } }, { runValidators: true });
        res.json({ message: 'Push token saved.' });
    } catch (err) {
        console.error('[USER] savePushToken error:', err.message);
        res.status(500).json({ error: 'Failed to save push token.' });
    }
};

const completeOnboarding = async (req, res) => {
    try {
        const { name, currency, occupation } = req.body;
        const updates = { isOnboarded: true };

        if (name) updates.name = name;
        if (occupation) updates.occupation = occupation;

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
            { returnDocument: 'after', runValidators: true }
        ).select('-password');

        res.json(user);
    } catch (err) {
        console.error('[USER] completeOnboarding error:', err.message);
        res.status(500).json({ error: 'Failed to complete onboarding.' });
    }
};

const bcrypt = require('bcryptjs');
const Transaction = require('../models/transactionModel');
const SavingsGoal = require('../models/savingsGoalModel');
const Debt = require('../models/debtModel');
const Budget = require('../models/budgetModel');
const Wallet = require('../models/walletModel');

// ... (existing functions)

const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Current and new passwords are required.' });
        }

        const user = await User.findById(req.userId);
        const isMatch = await user.comparePassword(currentPassword);

        if (!isMatch) {
            return res.status(401).json({ error: 'Incorrect current password.' });
        }

        user.password = newPassword;
        await user.save();

        res.json({ message: 'Password updated successfully.' });
    } catch (err) {
        console.error('[USER] changePassword error:', err.message);
        res.status(500).json({ error: 'Failed to update password.' });
    }
};

const wipeFinancialData = async (req, res) => {
    try {
        const { password } = req.body;

        if (!password) {
            return res.status(400).json({ error: 'Password is required for verification.' });
        }

        const user = await User.findById(req.userId);
        const isMatch = await user.comparePassword(password);

        if (!isMatch) {
            return res.status(401).json({ error: 'Incorrect password verification failed.' });
        }

        // Delete all associated data
        await Promise.all([
            Transaction.deleteMany({ user: req.userId }),
            SavingsGoal.deleteMany({ user: req.userId }),
            Debt.deleteMany({ user: req.userId }),
            Budget.deleteMany({ user: req.userId }),
            Wallet.deleteMany({ user: req.userId })
        ]);

        // Emit socket event to refresh all active screens
        const io = req.app.get('io');
        if (io) {
            io.to(`user:${req.userId}`).emit('finances_wiped');
        }

        res.json({ message: 'All financial data has been wiped successfully.' });
    } catch (err) {
        console.error('[USER] wipeFinancialData error:', err.message);
        res.status(500).json({ error: 'Failed to wipe financial data.' });
    }
};

const deleteAccount = async (req, res) => {
    try {
        const { password } = req.body;

        if (!password) {
            return res.status(400).json({ error: 'Password is required for verification.' });
        }

        const user = await User.findById(req.userId);
        const isMatch = await user.comparePassword(password);

        if (!isMatch) {
            return res.status(401).json({ error: 'Incorrect password verification failed.' });
        }

        // 1. Delete all financial data first
        await Promise.all([
            Transaction.deleteMany({ user: req.userId }),
            SavingsGoal.deleteMany({ user: req.userId }),
            Debt.deleteMany({ user: req.userId }),
            Budget.deleteMany({ user: req.userId }),
            Wallet.deleteMany({ user: req.userId })
        ]);

        // 2. Delete the user profile
        await User.findByIdAndDelete(req.userId);

        res.json({ message: 'Account and all data deleted successfully.' });
    } catch (err) {
        console.error('[USER] deleteAccount error:', err.message);
        res.status(500).json({ error: 'Failed to delete account.' });
    }
};

module.exports = { 
    getProfile, 
    updateProfile, 
    savePushToken, 
    completeOnboarding, 
    changePassword, 
    wipeFinancialData, 
    deleteAccount 
};
