const RecurringBill = require('../models/recurringBillModel');

// Helper: compute next due date from a frequency
const computeNextDueDate = (fromDate, frequency) => {
    const d = new Date(fromDate);
    switch (frequency) {
        case 'daily':     d.setDate(d.getDate() + 1); break;
        case 'weekly':    d.setDate(d.getDate() + 7); break;
        case 'monthly':   d.setMonth(d.getMonth() + 1); break;
        case 'quarterly': d.setMonth(d.getMonth() + 3); break;
        case 'yearly':    d.setFullYear(d.getFullYear() + 1); break;
        default:          d.setMonth(d.getMonth() + 1);
    }
    return d;
};

// GET /api/recurring-bills
const getBills = async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [bills, total] = await Promise.all([
            RecurringBill.find({ user: req.userId, isActive: true }).sort({ nextDueDate: 1 }).skip(skip).limit(parseInt(limit)).lean(),
            RecurringBill.countDocuments({ user: req.userId, isActive: true })
        ]);
        
        res.json({
            data: bills,
            total,
            page: parseInt(page),
            pages: Math.ceil(total / parseInt(limit))
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch recurring bills.' });
    }
};

// POST /api/recurring-bills
const createBill = async (req, res) => {
    try {
        const { name, amount, category, categoryIcon, categoryColor, frequency, startDate } = req.body;
        if (!name || !amount) return res.status(400).json({ error: 'name and amount are required.' });

        const nextDueDate = startDate ? new Date(startDate) : computeNextDueDate(new Date(), frequency || 'monthly');

        const bill = await RecurringBill.create({
            user: req.userId,
            name,
            amount,
            category: category || 'Bills',
            categoryIcon: categoryIcon || 'file-text',
            categoryColor: categoryColor || '#ef4444',
            frequency: frequency || 'monthly',
            nextDueDate,
        });

        const io = req.app.get('io');
        if (io) {
            io.to(`user:${req.userId}`).emit('new_recurring_bill', bill);
        }

        res.status(201).json(bill);
    } catch (err) {
        res.status(500).json({ error: 'Failed to create recurring bill.' });
    }
};

// PATCH /api/recurring-bills/:id
const updateBill = async (req, res) => {
    try {
        const bill = await RecurringBill.findOneAndUpdate(
            { _id: req.params.id, user: req.userId },
            { $set: req.body },
            { returnDocument: 'after', runValidators: true }
        );
        if (!bill) return res.status(404).json({ error: 'Bill not found.' });

        const io = req.app.get('io');
        if (io) {
            io.to(`user:${req.userId}`).emit('update_recurring_bill', bill);
        }

        res.json(bill);
    } catch (err) {
        res.status(500).json({ error: 'Failed to update bill.' });
    }
};

// DELETE /api/recurring-bills/:id
const deleteBill = async (req, res) => {
    try {
        const bill = await RecurringBill.findOneAndDelete({ _id: req.params.id, user: req.userId });
        if (!bill) return res.status(404).json({ error: 'Bill not found.' });

        const io = req.app.get('io');
        if (io) {
            io.to(`user:${req.userId}`).emit('delete_recurring_bill', { _id: bill._id });
        }

        res.json({ message: 'Deleted.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete bill.' });
    }
};

const Transaction = require('../models/transactionModel');

// POST /api/recurring-bills/:id/paid — advance the next due date by one cycle and auto-log expense
const markBillPaid = async (req, res) => {
    try {
        const bill = await RecurringBill.findOne({ _id: req.params.id, user: req.userId });
        if (!bill) return res.status(404).json({ error: 'Bill not found.' });

        // Auto-log the expense to the ledger
        const transaction = await Transaction.create({
            user: req.userId,
            type: 'expense',
            amount: bill.amount,
            category: bill.category,
            categoryIcon: bill.categoryIcon,
            categoryColor: bill.categoryColor,
            description: `Auto-paid: ${bill.name}`,
            date: new Date(),
        });

        // Advance due date
        bill.nextDueDate = computeNextDueDate(bill.nextDueDate, bill.frequency);
        bill.notified = false;
        await bill.save();

        // Emit real-time event
        const io = req.app.get('io');
        if (io) {
            io.to(`user:${req.userId}`).emit('new_transaction', transaction);
            io.to(`user:${req.userId}`).emit('update_recurring_bill', bill);
        }

        res.json(bill);
    } catch (err) {
        console.error('[recurringBill] markBillPaid error:', err.message);
        res.status(500).json({ error: 'Failed to mark bill as paid.' });
    }
};

module.exports = { getBills, createBill, updateBill, deleteBill, markBillPaid };
