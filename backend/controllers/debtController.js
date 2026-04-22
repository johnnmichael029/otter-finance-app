const Debt = require('../models/debtModel');
const DebtPayment = require('../models/debtPaymentModel');
const Transaction = require('../models/transactionModel');
const { invalidatePrefixes } = require('../utils/cache');
const { sendPushNotification } = require('../utils/pushNotification');

// ─────────────────────────────────────────────────────────────────────────────
//  HELPER — Calculate live interest accrued on a debt
//  Uses simple interest, daily accrual based on penaltyRate (per month)
//  Interest ONLY kicks in AFTER dueDate (grace period exceeded)
// ─────────────────────────────────────────────────────────────────────────────
const calcAccruedInterest = (debt) => {
    if (!debt.dueDate || !debt.penaltyRate || debt.penaltyRate <= 0) return 0;
    if (debt.status === 'settled') return 0;

    const now = new Date();
    const due = new Date(debt.dueDate);

    // Still within grace period → 0% interest
    if (now <= due) return 0;

    const daysOverdue = Math.floor((now - due) / (1000 * 60 * 60 * 24));
    const principal = Math.max(0, debt.amount - debt.amountPaid);
    const dailyRate = debt.penaltyRate / 100 / 30;  // e.g. 20% / 30 days = 0.6667%/day
    const interest = principal * dailyRate * daysOverdue;

    return Math.round(interest * 100) / 100;
};

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/debts
//  Returns all debts with live interest appended
// ─────────────────────────────────────────────────────────────────────────────
const getDebts = async (req, res) => {
    try {
        const { status, direction } = req.query;
        const filter = { user: req.userId };
        if (status) filter.status = status;
        if (direction) filter.direction = direction;

        const debts = await Debt.find(filter).sort({ dueDate: 1, createdAt: -1 }).lean();

        // Attach live interest to each debt
        const enriched = debts.map(debt => {
            const accruedInterest = calcAccruedInterest(debt);
            const principal = Math.max(0, debt.amount - debt.amountPaid);
            const now = new Date();
            const due = debt.dueDate ? new Date(debt.dueDate) : null;
            const daysOverdue = due && now > due
                ? Math.floor((now - due) / (1000 * 60 * 60 * 24))
                : 0;
            const totalOwed = principal + accruedInterest;

            return {
                ...debt,
                principal,
                accruedInterest,
                totalOwed,
                daysOverdue,
                isOverdue: daysOverdue > 0,
            };
        });

        res.json(enriched);
    } catch (err) {
        console.error('[DEBT] getDebts error:', err.message);
        res.status(500).json({ error: 'Failed to fetch debts.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/debts
//  Creates a new debt (simple or installment plan)
// ─────────────────────────────────────────────────────────────────────────────
const createDebt = async (req, res) => {
    try {
        invalidatePrefixes('debt');

        const {
            direction, personName, amount, description, dateBorrowed, dueDate,
            isInstallment, monthlyPayment, gracePeriodMonths, penaltyRate,
        } = req.body;

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
            isInstallment: !!isInstallment,
            monthlyPayment: monthlyPayment || null,
            gracePeriodMonths: gracePeriodMonths || 0,
            penaltyRate: penaltyRate || 0,
        });
        const io = req.app.get('io');
        if (io) io.to(`user:${req.userId}`).emit('new_debt', debt);

        res.status(201).json(debt);
    } catch (err) {
        console.error('[DEBT] createDebt error:', err.message);
        res.status(500).json({ error: 'Failed to create debt record.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  PATCH /api/debts/:id
// ─────────────────────────────────────────────────────────────────────────────
const updateDebt = async (req, res) => {
    try {
        invalidatePrefixes('debt');

        const debt = await Debt.findOne({ _id: req.params.id, user: req.userId });
        if (!debt) return res.status(404).json({ error: 'Debt record not found.' });

        Object.assign(debt, req.body);

        // Auto-recalculate status
        if (debt.amountPaid >= debt.amount) {
            debt.status = 'settled';
            debt.amountPaid = debt.amount;
        } else if (debt.amountPaid > 0) {
            debt.status = 'partial';
        } else {
            debt.status = 'pending';
        }

        await debt.save();

        const io = req.app.get('io');
        if (io) io.to(`user:${req.userId}`).emit('update_debt', debt);

        res.json(debt);
    } catch (err) {
        console.error('[DEBT] updateDebt error:', err.message);
        res.status(500).json({ error: 'Failed to update debt.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  DELETE /api/debts/:id
// ─────────────────────────────────────────────────────────────────────────────
const deleteDebt = async (req, res) => {
    try {
        invalidatePrefixes('debt');
        const debt = await Debt.findOneAndDelete({ _id: req.params.id, user: req.userId });
        if (!debt) return res.status(404).json({ error: 'Debt record not found.' });

        // Also delete associated payment logs
        await DebtPayment.deleteMany({ debt: debt._id });

        const io = req.app.get('io');
        if (io) io.to(`user:${req.userId}`).emit('delete_debt', { _id: debt._id });

        res.json({ message: 'Debt record deleted successfully.' });
    } catch (err) {
        console.error('[DEBT] deleteDebt error:', err.message);
        res.status(500).json({ error: 'Failed to delete debt record.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/debts/:id/payments
//  Log a payment against a debt (reduces amountPaid, auto-updates status)
// ─────────────────────────────────────────────────────────────────────────────
const logPayment = async (req, res) => {
    try {
        invalidatePrefixes('debt');

        const debt = await Debt.findOne({ _id: req.params.id, user: req.userId });
        if (!debt) return res.status(404).json({ error: 'Debt record not found.' });
        if (debt.status === 'settled') return res.status(400).json({ error: 'This debt is already fully settled.' });

        const { amount, note } = req.body;
        if (!amount || amount <= 0) return res.status(400).json({ error: 'Payment amount must be greater than 0.' });

        // Create payment log
        const payment = await DebtPayment.create({
            debt: debt._id,
            user: req.userId,
            amount,
            note: note || '',
        });

        // ── Auto-Log to Transactions for Recent Activity updates ──
        const txType = debt.direction === 'owed_by_me' ? 'expense' : 'income';
        const txDesc = debt.direction === 'owed_by_me' 
            ? `Paid debt to ${debt.personName}` 
            : `Received debt payment from ${debt.personName}`;

        const newTx = await Transaction.create({
            user: req.userId,
            type: txType,
            amount,
            description: txDesc,
            category: 'Debt Repayment',
            categoryIcon: 'check-circle',
            categoryColor: '#8b5cf6', // purple color for debts
            date: new Date(),
            note: note || ''
        });

        // Invalidate transaction caches since we inject a new transaction
        invalidatePrefixes('transaction');

        const io = req.app.get('io');
        if (io) {
            io.to(`user:${req.userId}`).emit('new_transaction', newTx);
        }

        // Update debt's amountPaid
        debt.amountPaid = Math.min(debt.amount, (debt.amountPaid || 0) + amount);
        if (debt.amountPaid >= debt.amount) {
            debt.status = 'settled';
        } else if (debt.amountPaid > 0) {
            debt.status = 'partial';
        }

        await debt.save();

        if (io) io.to(`user:${req.userId}`).emit('update_debt', debt);

        res.status(201).json({
            payment,
            debt: {
                ...debt.toObject(),
                principal: Math.max(0, debt.amount - debt.amountPaid),
                accruedInterest: calcAccruedInterest(debt),
            },
        });
    } catch (err) {
        console.error('[DEBT] logPayment error:', err.message);
        res.status(500).json({ error: 'Failed to log payment.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/debts/:id/payments
//  Returns all payment history for a specific debt
// ─────────────────────────────────────────────────────────────────────────────
const getPayments = async (req, res) => {
    try {
        const debt = await Debt.findOne({ _id: req.params.id, user: req.userId });
        if (!debt) return res.status(404).json({ error: 'Debt not found.' });

        const payments = await DebtPayment.find({ debt: debt._id }).sort({ paidAt: -1 }).lean();
        res.json(payments);
    } catch (err) {
        console.error('[DEBT] getPayments error:', err.message);
        res.status(500).json({ error: 'Failed to fetch payments.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/debts/:id/remind
// ─────────────────────────────────────────────────────────────────────────────
const sendDebtReminder = async (req, res) => {
    try {
        const debt = await Debt.findOne({ _id: req.params.id, user: req.userId });
        if (!debt) return res.status(404).json({ error: 'Debt record not found.' });

        const user = req.user;
        if (!user.pushToken) return res.status(400).json({ error: 'No push token registered.' });

        const balance = debt.amount - debt.amountPaid;
        const title = debt.direction === 'owed_to_me'
            ? `💰 Reminder: ${debt.personName} owes you`
            : `🔔 Reminder: You owe ${debt.personName}`;
        const body = `₱${balance.toLocaleString()} remaining${debt.description ? ` — ${debt.description}` : ''}`;

        await sendPushNotification(user.pushToken, title, body, { debtId: debt._id });
        debt.reminderSent = true;
        await debt.save();

        res.json({ message: 'Reminder sent successfully.' });
    } catch (err) {
        console.error('[DEBT] sendDebtReminder error:', err.message);
        res.status(500).json({ error: 'Failed to send reminder.' });
    }
};

module.exports = { getDebts, createDebt, updateDebt, deleteDebt, logPayment, getPayments, sendDebtReminder };
