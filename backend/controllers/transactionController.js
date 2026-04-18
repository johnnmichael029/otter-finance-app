const Transaction = require('../models/transactionModel');
const { invalidatePrefixes } = require('../utils/cache');

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
            transactions,
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
const getSummary = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const now = new Date();

        const start = startDate ? new Date(startDate) : new Date(now.getFullYear(), now.getMonth(), 1);
        const end = endDate ? new Date(endDate) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        const results = await Transaction.aggregate([
            {
                $match: {
                    user: req.user._id,
                    date: { $gte: start, $lte: end },
                }
            },
            {
                $group: {
                    _id: '$type',
                    total: { $sum: '$amount' },
                }
            }
        ]);

        const summary = { totalIncome: 0, totalExpenses: 0, balance: 0 };
        for (const r of results) {
            if (r._id === 'income') summary.totalIncome = r.total;
            if (r._id === 'expense') summary.totalExpenses = r.total;
        }
        summary.balance = summary.totalIncome - summary.totalExpenses;

        res.json(summary);
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

        const { type, amount, category, description, date, note } = req.body;

        if (!type || !amount || !category) {
            return res.status(400).json({ error: 'type, amount, and category are required.' });
        }

        const transaction = await Transaction.create({
            user: req.userId,
            type,
            amount,
            category,
            description,
            date: date || new Date(),
            note,
        });

        res.status(201).json(transaction);
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

        const transaction = await Transaction.findOneAndUpdate(
            { _id: req.params.id, user: req.userId }, // Scoped to owner
            { $set: req.body },
            { new: true, runValidators: true }
        );

        if (!transaction) {
            return res.status(404).json({ error: 'Transaction not found.' });
        }

        res.json(transaction);
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

        res.json({ message: 'Transaction deleted successfully.' });
    } catch (err) {
        console.error('[TRANSACTION] deleteTransaction error:', err.message);
        res.status(500).json({ error: 'Failed to delete transaction.' });
    }
};

module.exports = { getTransactions, getSummary, createTransaction, updateTransaction, deleteTransaction };
