const Transaction = require('../models/transactionModel');
const { invalidatePrefixes } = require('../utils/cache');
const { encrypt, decryptNote } = require('../utils/encryption');
const mongoose = require('mongoose');

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/transactions
//  Query: ?type=expense|income&category=Food&startDate=&endDate=&page=1&limit=20
//  Returns paginated transactions for the authenticated user
// ─────────────────────────────────────────────────────────────────────────────
const getTransactions = async (req, res) => {
    try {
        const { type, category, startDate, endDate, page = 1, limit = 20 } = req.query;

        const filter = { user: req.userId };
        if (type) filter.type = type;
        if (category) filter.category = category;
        if (startDate || endDate) {
            filter.date = {};
            if (startDate) filter.date.$gte = new Date(startDate);
            if (endDate) filter.date.$lte = new Date(endDate);
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [transactions, total] = await Promise.all([
            Transaction.find(filter)
                .sort({ date: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            Transaction.countDocuments(filter),
        ]);

        res.json({
            transactions: transactions.map(decryptNote),
            total,
            page: parseInt(page),
            pages: Math.ceil(total / parseInt(limit)),
        });
    } catch (err) {
        console.error('[TRANSACTION] getTransactions error:', err.message);
        res.status(500).json({ error: 'Failed to fetch transactions.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/transactions/summary
//  Returns: { totalIncome, totalExpenses, balance } for current month (default)
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/transactions/summary
// Query: ?range=day|week|month
const getSummary = async (req, res) => {
    try {
        const { range = 'month' } = req.query;
        const now = new Date();
        let start, end, groupFormat, buckets;

        if (range === 'day') {
            start = new Date(now.setHours(0, 0, 0, 0));
            end = new Date(now.setHours(23, 59, 59, 999));
            groupFormat = { $hour: { date: '$date', timezone: '+08:00' } };
            buckets = [8, 12, 16, 20, 24]; // 8A, 12P, 4P, 8P, 12A
        } else if (range === 'week') {
            const first = now.getDate() - now.getDay();
            start = new Date(now.setDate(first));
            start.setHours(0, 0, 0, 0);
            end = new Date(now.setDate(first + 6));
            end.setHours(23, 59, 59, 999);
            groupFormat = { $dayOfWeek: { date: '$date', timezone: '+08:00' } }; // 1(Sun)-7(Sat)
            buckets = [1, 2, 3, 4, 5, 6, 7];
        } else if (range === 'all') {
            start = new Date(0); // Epoch start
            end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
            groupFormat = { $month: { date: '$date', timezone: '+08:00' } };
            buckets = [1];
        } else {
            start = new Date(now.getFullYear(), now.getMonth(), 1);
            end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
            groupFormat = { $ceil: { $divide: [{ $dayOfMonth: { date: '$date', timezone: '+08:00' } }, 7] } }; // Week 1-4/5
            buckets = [1, 2, 3, 4];
        }

        const stats = await Transaction.aggregate([
            {
                $match: {
                    user: req.user._id,
                    date: { $gte: start, $lte: end },
                }
            },
            {
                $group: {
                    _id: { bucket: groupFormat, type: '$type' },
                    total: { $sum: '$amount' }
                }
            }
        ]);

        // Process Totals
        const summary = { totalIncome: 0, totalExpenses: 0, balance: 0 };
        const incomeDist = buckets.map(() => 0);
        const expenseDist = buckets.map(() => 0);

        stats.forEach(s => {
            if (s._id.type === 'income') summary.totalIncome += s.total;
            if (s._id.type === 'expense') summary.totalExpenses += s.total;

            // Map to buckets
            let bIndex = -1;
            const bValue = s._id.bucket;

            if (range === 'day') {
                // Find nearest bucket: 8, 12, 16, 20, 24
                if (bValue < 10) bIndex = 0;
                else if (bValue < 14) bIndex = 1;
                else if (bValue < 18) bIndex = 2;
                else if (bValue < 22) bIndex = 3;
                else bIndex = 4;
            } else if (range === 'week') {
                bIndex = bValue - 1; // 1-7 to 0-6
            } else {
                bIndex = Math.min(bValue - 1, 3); // cap at 4 weeks
            }

            if (bIndex >= 0 && bIndex < buckets.length) {
                if (s._id.type === 'income') incomeDist[bIndex] += s.total;
                else expenseDist[bIndex] += s.total;
            }
        });

        summary.balance = summary.totalIncome - summary.totalExpenses;

        // Calculate Lifetime Net Balance (regardless of range) for the Home Card
        const lifetimeAgg = await Transaction.aggregate([
            { $match: { user: new mongoose.Types.ObjectId(req.user._id) } },
            { $group: { _id: '$type', total: { $sum: '$amount' } } }
        ]);
        let netBalance = 0;
        lifetimeAgg.forEach(r => {
            if (r._id === 'income') netBalance += r.total;
            if (r._id === 'expense') netBalance -= r.total;
        });

        // Convert to Percentages for chart (relative to max in that range)
        const maxVal = Math.max(...incomeDist, ...expenseDist, 100); 
        const normalize = (dist) => dist.map(v => Math.round((v / maxVal) * 100));

        res.json({
            ...summary,
            netBalance, // Total wallet balance
            incomeDist: normalize(incomeDist),
            expenseDist: normalize(expenseDist)
        });
    } catch (err) {
        console.error('[TRANSACTION] getSummary error:', err.message);
        res.status(500).json({ error: 'Failed to fetch summary.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/transactions
//  Body: { type, amount, category, description, date, note }
// ─────────────────────────────────────────────────────────────────────────────
const createTransaction = async (req, res) => {
    try {
        invalidatePrefixes('transaction');

        const { 
            type, amount, category, categoryIcon, categoryColor, 
            description, date, note,
            currency, originalAmount, exchangeRate 
        } = req.body;

        if (!type || !amount || !category) {
            return res.status(400).json({ error: 'type, amount, and category are required.' });
        }

        // Calculate current total balance to store snapshot
        const balanceAgg = await Transaction.aggregate([
            { $match: { user: new Transaction.base.constructor.Types.ObjectId(req.userId) } },
            { $group: { _id: '$type', total: { $sum: '$amount' } } },
        ]);
        let currentBalance = 0;
        balanceAgg.forEach(r => {
            if (r._id === 'income') currentBalance += r.total;
            if (r._id === 'expense') currentBalance -= r.total;
        });

        const runningBalance = type === 'income' ? currentBalance + parseFloat(amount) : currentBalance - parseFloat(amount);

        const transaction = await Transaction.create({
            user: req.userId,
            type,
            amount,
            category,
            categoryIcon,
            categoryColor,
            description,
            date: date || new Date(),
            note: encrypt(note),    // 🔒 Encrypt at rest
            currency: currency || 'PHP',
            originalAmount,
            exchangeRate,
            runningBalance
        });

        const decrypted = decryptNote(transaction.toObject());

        // Emit real-time event so connected mobile clients update instantly
        const io = req.app.get('io');
        if (io) {
            io.to(`user:${req.userId}`).emit('new_transaction', decrypted);
        }

        res.status(201).json(decrypted);
    } catch (err) {
        console.error('[TRANSACTION] createTransaction error:', err.message);
        res.status(500).json({ error: 'Failed to create transaction.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  PATCH /api/transactions/:id
//  Body: partial transaction fields
// ─────────────────────────────────────────────────────────────────────────────
const updateTransaction = async (req, res) => {
    try {
        invalidatePrefixes('transaction');

        // Encrypt note if it's being updated
        if (req.body.note !== undefined) {
            req.body.note = encrypt(req.body.note);
        }

        const transaction = await Transaction.findOneAndUpdate(
            { _id: req.params.id, user: req.userId },
            { $set: req.body },
            { new: true, runValidators: true }
        );

        if (!transaction) {
            return res.status(404).json({ error: 'Transaction not found.' });
        }

        const decrypted = decryptNote(transaction.toObject());

        const io = req.app.get('io');
        if (io) {
            io.to(`user:${req.userId}`).emit('update_transaction', decrypted);
        }

        res.json(decrypted);
    } catch (err) {
        console.error('[TRANSACTION] updateTransaction error:', err.message);
        res.status(500).json({ error: 'Failed to update transaction.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  DELETE /api/transactions/:id
// ─────────────────────────────────────────────────────────────────────────────
const deleteTransaction = async (req, res) => {
    try {
        invalidatePrefixes('transaction');

        const transaction = await Transaction.findOneAndDelete({
            _id: req.params.id,
            user: req.userId,
        });

        if (!transaction) {
            return res.status(404).json({ error: 'Transaction not found.' });
        }

        const io = req.app.get('io');
        if (io) {
            io.to(`user:${req.userId}`).emit('delete_transaction', { _id: transaction._id });
        }

        res.json({ message: 'Transaction deleted successfully.' });
    } catch (err) {
        console.error('[TRANSACTION] deleteTransaction error:', err.message);
        res.status(500).json({ error: 'Failed to delete transaction.' });
    }
};

module.exports = { getTransactions, getSummary, createTransaction, updateTransaction, deleteTransaction };
