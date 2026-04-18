const Debt = require('../models/debtModel');
const { invalidatePrefixes } = require('../utils/cache');
const { sendPushNotification } = require('../utils/pushNotification');

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/debts
//  Query: ?status=pending|partial|settled&direction=owed_by_me|owed_to_me
//  Returns all debts for the authenticated user (Otter Pocket)
// ─────────────────────────────────────────────────────────────────────────────
const getDebts = async (req, res) => {
    try {
        const { status, direction } = req.query;

        const filter = { user: req.userId };
        if (status) filter.status = status;
        if (direction) filter.direction = direction;

        const debts = await Debt.find(filter)
            .sort({ dueDate: 1, createdAt: -1 })
            .lean();

        res.json(debts);
    } catch (err) {
        console.error('[DEBT] getDebts error:', err.message);
        res.status(500).json({ error: 'Failed to fetch debts.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/debts
//  Body: { direction, personName, amount, description, dateBorrowed, dueDate }
// ─────────────────────────────────────────────────────────────────────────────
const createDebt = async (req, res) => {
    try {
        invalidatePrefixes('debt');

        const { direction, personName, amount, description, dateBorrowed, dueDate } = req.body;

        if (!direction || !personName || !amount) {
            return res.status(400).json({ error: 'direction, personName, and amount are required.' });
        }

        const debt = await Debt.create({
            user: req.userId,
            direction,
            personName,
            amount,
            description,
            dateBorrowed: dateBorrowed || new Date(),
            dueDate: dueDate || null,
        });

        res.status(201).json(debt);
    } catch (err) {
        console.error('[DEBT] createDebt error:', err.message);
        res.status(500).json({ error: 'Failed to create debt record.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  PATCH /api/debts/:id
//  Body: partial debt fields (e.g. { amountPaid, status })
//  Automatically recalculates status based on amountPaid vs amount
// ─────────────────────────────────────────────────────────────────────────────
const updateDebt = async (req, res) => {
    try {
        invalidatePrefixes('debt');

        const debt = await Debt.findOne({ _id: req.params.id, user: req.userId });
        if (!debt) {
            return res.status(404).json({ error: 'Debt record not found.' });
        }

        // Apply updates
        Object.assign(debt, req.body);

        // Auto-recalculate status if amountPaid changed
        if (req.body.amountPaid !== undefined) {
            if (debt.amountPaid >= debt.amount) {
                debt.status = 'settled';
                debt.amountPaid = debt.amount; // Cap at full amount
            } else if (debt.amountPaid > 0) {
                debt.status = 'partial';
            } else {
                debt.status = 'pending';
            }
        }

        await debt.save();
        res.json(debt);
    } catch (err) {
        console.error('[DEBT] updateDebt error:', err.message);
        res.status(500).json({ error: 'Failed to update debt record.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  DELETE /api/debts/:id
// ─────────────────────────────────────────────────────────────────────────────
const deleteDebt = async (req, res) => {
    try {
        invalidatePrefixes('debt');

        const debt = await Debt.findOneAndDelete({ _id: req.params.id, user: req.userId });
        if (!debt) {
            return res.status(404).json({ error: 'Debt record not found.' });
        }

        res.json({ message: 'Debt record deleted successfully.' });
    } catch (err) {
        console.error('[DEBT] deleteDebt error:', err.message);
        res.status(500).json({ error: 'Failed to delete debt record.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/debts/:id/remind
//  Sends a push notification reminder about an unsettled debt
// ─────────────────────────────────────────────────────────────────────────────
const sendDebtReminder = async (req, res) => {
    try {
        const debt = await Debt.findOne({ _id: req.params.id, user: req.userId });
        if (!debt) {
            return res.status(404).json({ error: 'Debt record not found.' });
        }

        const user = req.user;
        if (!user.pushToken) {
            return res.status(400).json({ error: 'No push token registered for this account.' });
        }

        const balance = debt.amount - debt.amountPaid;
        const title = debt.direction === 'owed_to_me'
            ? `💰 Reminder: ${debt.personName} owes you`
            : `🔔 Reminder: You owe ${debt.personName}`;
        const body = `₱${balance.toLocaleString()} remaining — ${debt.description || 'No description'}`;

        await sendPushNotification(user.pushToken, title, body, { debtId: debt._id });

        debt.reminderSent = true;
        await debt.save();

        res.json({ message: 'Reminder sent successfully.' });
    } catch (err) {
        console.error('[DEBT] sendDebtReminder error:', err.message);
        res.status(500).json({ error: 'Failed to send reminder.' });
    }
};

module.exports = { getDebts, createDebt, updateDebt, deleteDebt, sendDebtReminder };
