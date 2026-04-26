const Budget = require('../models/budgetModel');
const Transaction = require('../models/transactionModel');

// GET /api/budgets?date=YYYY-MM-DD&period=monthly
const getBudgets = async (req, res) => {
    try {
        const dateParam = req.query.date || new Date().toISOString();
        const periodParam = req.query.period || 'monthly'; // 'daily', 'weekly', 'monthly'

        const refDate = new Date(dateParam);
        
        let startDate, endDate;
        if (periodParam === 'daily') {
            startDate = new Date(refDate);
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(refDate);
            endDate.setHours(23, 59, 59, 999);
        } else if (periodParam === 'weekly') {
            // Monday-based week
            const day = refDate.getDay(); // 0 is Sunday, 1 is Monday
            const diff = refDate.getDate() - day + (day === 0 ? -6 : 1); 
            startDate = new Date(refDate);
            startDate.setDate(diff);
            startDate.setHours(0, 0, 0, 0);
            
            endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + 6);
            endDate.setHours(23, 59, 59, 999);
        } else { // monthly
            startDate = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
            endDate = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0, 23, 59, 59, 999);
        }

        // Fetch budgets & actual spending in parallel
        const [budgets, transactions] = await Promise.all([
            Budget.find({ user: req.userId, period: periodParam }),
            Transaction.find({
                user: req.userId,
                type: 'expense',
                date: { $gte: startDate, $lte: endDate },
            }).lean(),
        ]);

        // Compute spent for each budget
        const enriched = budgets.map(b => {
            const bObj = b.toObject();
            let budgetSpent = 0;
            const subSpentMap = {}; // key: subTag, value: amount
            
            if (bObj.subBudgets) {
                bObj.subBudgets.forEach(sub => subSpentMap[sub.tag.toLowerCase()] = 0);
            }

            for (const tx of transactions) {
                let belongsToBudget = false;
                let matchedSubTags = [];

                const txCat = (tx.category || '').toLowerCase();
                const txTags = (tx.tags || []).map(t => t.toLowerCase());
                const txNote = (tx.note || '').toLowerCase();

                if (b.category === 'Overall') {
                    belongsToBudget = true;
                } else if (txCat === b.category.toLowerCase()) {
                    belongsToBudget = true;
                }

                if (bObj.subBudgets) {
                    for (const sub of bObj.subBudgets) {
                        const subTagLower = sub.tag.toLowerCase();
                        // Match if the category, a tag, or the exact note matches the sub-budget tag
                        if (txCat === subTagLower || txTags.includes(subTagLower) || txNote === subTagLower || txNote.includes(subTagLower)) {
                            matchedSubTags.push(subTagLower);
                            belongsToBudget = true; // Auto-rolls up into parent budget
                        }
                    }
                }

                if (belongsToBudget) {
                    budgetSpent += tx.amount;
                    for (const subTag of matchedSubTags) {
                        subSpentMap[subTag] += tx.amount;
                    }
                }
            }

            bObj.spent = budgetSpent;
            if (bObj.subBudgets) {
                bObj.subBudgets = bObj.subBudgets.map(sub => ({
                    ...sub,
                    spent: subSpentMap[sub.tag.toLowerCase()] || 0
                }));
            }
            return bObj;
        });

        const totalSpent = transactions.reduce((sum, tx) => sum + tx.amount, 0);

        res.json({ budgets: enriched, spendingMap: {}, totalSpent, startDate, endDate, period: periodParam });
    } catch (err) {
        console.error('[BUDGET] getBudgets error:', err.message);
        res.status(500).json({ error: 'Failed to fetch budgets.' });
    }
};

// POST /api/budgets — upsert (one per user+period+category)
const upsertBudget = async (req, res) => {
    try {
        const { period, category, categoryIcon, categoryColor, allocatedAmount, reminderAmount, subBudgets } = req.body;
        if (!period || !category || allocatedAmount === undefined) {
            return res.status(400).json({ error: 'period, category, and allocatedAmount are required.' });
        }

        const budget = await Budget.findOneAndUpdate(
            { user: req.userId, category, period },
            { $set: { allocatedAmount, categoryIcon, categoryColor, reminderAmount, subBudgets: subBudgets || [] } },
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
