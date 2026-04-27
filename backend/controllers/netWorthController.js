const Wallet = require('../models/walletModel');
const SavingsGoal = require('../models/savingsGoalModel');
const Debt = require('../models/debtModel');
const Transaction = require('../models/transactionModel');
const NetWorthSnapshot = require('../models/NetWorthSnapshot');
const cryptoService = require('../services/cryptoService');
const mongoose = require('mongoose');

// Helper to calculate totals with crypto conversion
const calculateTotals = async (userId) => {
    const [wallets, savings, debts] = await Promise.all([
        Wallet.find({ userId, isArchived: false }),
        SavingsGoal.find({ user: userId }),
        Debt.find({ user: userId, status: { $ne: 'settled' } })
    ]);

    // 1. Calculate HAND (In-Hand Cash) from transactions
    // Lifetime balance of transactions NOT linked to a specific wallet
    const lifetimeAgg = await Transaction.aggregate([
        { $match: { user: new mongoose.Types.ObjectId(userId), wallet: null, isArchived: { $ne: true } } },
        { $group: { _id: '$type', total: { $sum: '$amount' } } }
    ]);
    let handBalance = 0;
    lifetimeAgg.forEach(r => {
        if (r._id === 'income') handBalance += r.total;
        if (r._id === 'expense') handBalance -= r.total;
    });

    // Subtract money transferred from HAND to a physical wallet
    const handDeductionsAgg = await Transaction.aggregate([
        { $match: { user: new mongoose.Types.ObjectId(userId), paymentSource: 'HAND', wallet: { $ne: null }, isArchived: { $ne: true } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    if (handDeductionsAgg.length > 0) {
        handBalance -= handDeductionsAgg[0].total;
    }

    // 2. Get Crypto Prices
    const cryptoIds = wallets
        .filter(w => w.type === 'Crypto' && w.coinId)
        .map(w => w.coinId);
    
    const prices = await cryptoService.getCryptoPrices(cryptoIds);

    let walletAssets = 0;
    let creditLiabilities = 0;

    wallets.forEach(w => {
        if (w.type === 'Credit') {
            creditLiabilities += Math.abs(w.balance);
        } else if (w.type === 'Crypto' && w.coinId && prices[w.coinId]) {
            walletAssets += w.balance * prices[w.coinId];
        } else {
            walletAssets += w.balance;
        }
    });

    const savingsAssets = savings.reduce((sum, g) => sum + (g.currentAmount || 0), 0);

    let owedToMe = 0;
    let owedByMe = 0;

    debts.forEach(d => {
        const remaining = d.amount - d.amountPaid;
        if (d.direction === 'owed_to_me') {
            owedToMe += remaining;
        } else {
            owedByMe += remaining;
        }
    });

    const totalAssets = handBalance + walletAssets + savingsAssets + owedToMe;
    const totalLiabilities = creditLiabilities + owedByMe;
    const netWorth = totalAssets - totalLiabilities;

    return {
        netWorth,
        totalAssets,
        totalLiabilities,
        breakdown: {
            cash: handBalance,
            wallets: walletAssets,
            savings: savingsAssets,
            debts: owedByMe,
            receivables: owedToMe,
            creditCards: creditLiabilities
        }
    };
};

// ── GET /api/net-worth ───────────────────────────────────────────────────────
exports.getCurrentNetWorth = async (req, res) => {
    try {
        const result = await calculateTotals(req.userId);
        res.json(result);
    } catch (err) {
        console.error('[NetWorth] Error:', err.message);
        res.status(500).json({ error: 'Failed to calculate net worth.' });
    }
};

// ── GET /api/net-worth/history ───────────────────────────────────────────────
exports.getNetWorthHistory = async (req, res) => {
    try {
        const history = await NetWorthSnapshot.find({ user: req.userId })
            .sort({ date: 1 })
            .limit(30);
        res.json({ history });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch history.' });
    }
};

// ── POST /api/net-worth/snapshot ─────────────────────────────────────────────
exports.createSnapshot = async (req, res) => {
    try {
        const userId = req.userId;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const totals = await calculateTotals(userId);

        const snapshot = await NetWorthSnapshot.findOneAndUpdate(
            { user: userId, date: today },
            {
                totalAssets: totals.totalAssets,
                totalLiabilities: totals.totalLiabilities,
                netWorth: totals.netWorth,
                breakdown: totals.breakdown
            },
            { upsert: true, returnDocument: 'after', runValidators: true }
        );

        res.json(snapshot);
    } catch (err) {
        console.error('[NetWorthSnapshot] Error:', err.message);
        res.status(500).json({ error: 'Failed to create snapshot.' });
    }
};
