const Budget = require('../models/budgetModel');
const Transaction = require('../models/transactionModel');

// GET /api/budgets?month=YYYY-MM
// Returns budgets with their actual spending computed
const getBudgets = async (req, res) => {
    try {
        const month = req.query.month || new Date().toISOString().slice(0, 7);
        const [year, mon] = month.split('-').map(Number);

        const startDate = new Date(year, mon - 1, 1);
        const endDate = new Date(year, mon, 0, 23, 59, 59);

        // Fetch budgets & actual spending in parallel
        const [budgets, transactions] = await Promise.all([
            Budget.find({ user: req.userId, month }),
            Transaction.find({
                user: req.userId,
                type: 'expense',
                date: { $gte: startDate, $lte: endDate },
            }).lean(),
        ]);

        // Group spending by category
        const spendingMap = {};
        let totalSpent = 0;
        for (const tx of transactions) {
            spendingMap[tx.category] = (spendingMap[tx.category] || 0) + tx.amount;
            totalSpent += tx.amount;
        }

        const enriched = budgets.map(b => ({
            ...b.toObject(),
            spent: b.category === 'Overall' ? totalSpent : (spendingMap[b.category] || 0),
        }));

        res.json({ budgets: enriched, spendingMap, totalSpent });
    } catch (err) {
        console.error('[BUDGET] getBudgets error:', err.message);
        res.status(500).json({ error: 'Failed to fetch budgets.' });
    }
};

// POST /api/budgets — upsert (one per user+month+category)
const upsertBudget = async (req, res) => {
    try {
        const { month, category, categoryIcon, categoryColor, allocatedAmount, reminderAmount } = req.body;
        if (!month || !category || allocatedAmount === undefined) {
            return res.status(400).json({ error: 'month, category, and allocatedAmount are required.' });
        }

        const budget = await Budget.findOneAndUpdate(
            { user: req.userId, month, category },
            { $set: { allocatedAmount, categoryIcon, categoryColor, reminderAmount } },
            { returnDocument: 'after', upsert: true, runValidators: true }
        );

        const io = req.app.get('io');
        if (io) {
            io.to(`user:${req.userId}`).emit('update_budget', budget);
        }

        res.status(201).json(budget);
    } catch (err) {
        console.error('[BUDGET] upsertBudget error:', err.message);
        res.status(500).json({ error: 'Failed to save budget.' });
    }
};

// DELETE /api/budgets/:id
const deleteBudget = async (req, res) => {
    try {
        const budget = await Budget.findOneAndDelete({ _id: req.params.id, user: req.userId });
        if (!budget) return res.status(404).json({ error: 'Budget not found.' });

        const io = req.app.get('io');
        if (io) {
            io.to(`user:${req.userId}`).emit('delete_budget', { _id: budget._id });
        }

        res.json({ message: 'Deleted.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete budget.' });
    }
};

module.exports = { getBudgets, upsertBudget, deleteBudget };
