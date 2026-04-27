const Debt = require('../models/debtModel');
const DebtPayment = require('../models/debtPaymentModel');
const Notification = require('../models/Notification');
const Wallet = require('../models/walletModel');
const Transaction = require('../models/transactionModel');
const User = require('../models/userModel');
const mongoose = require('mongoose');
const { invalidatePrefixes } = require('../utils/cache');
const { sendPushNotification } = require('../utils/pushNotification');
const { encrypt, decryptNote } = require('../utils/encryption');

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
        const { status, direction, page = 1, limit = 20 } = req.query;

        // Match debts owned by the user, OR debts where the user is the linkedUserId and it's pending
        const filter = {
            $or: [
                { user: req.userId },
                { linkedUserId: req.userId, syncStatus: 'pending' }
            ]
        };

        if (status) filter.status = status;
        // Direction is tricky for pending requests because it's inverse for the receiver,
        // but for now we apply it normally or skip it if it breaks filtering.
        // To be safe, let's only apply direction/status if they exist and aren't over-restricting pending requests.
        if (direction) {
            filter.$or = [
                { user: req.userId, direction },
                // If I am the receiver, the direction on the sender's side is the opposite
                { linkedUserId: req.userId, syncStatus: 'pending', direction: direction === 'owed_to_me' ? 'owed_by_me' : 'owed_to_me' }
            ];
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [debts, total] = await Promise.all([
            Debt.find(filter).populate('user', 'name otterTag').sort({ dueDate: 1, createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
            Debt.countDocuments(filter)
        ]);

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

        res.json({
            data: enriched,
            total,
            page: parseInt(page),
            pages: Math.ceil(total / parseInt(limit))
        });
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

        const {
            direction, personName, amount, description, dateBorrowed, dueDate,
            isInstallment, monthlyPayment, gracePeriodMonths, penaltyRate, linkedUserId
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
            linkedUserId: linkedUserId || null,
            syncStatus: linkedUserId ? 'pending' : 'none'
        });

        invalidatePrefixes('debt');
        const io = req.app.get('io');
        if (io) {
            io.to(`user:${req.userId}`).emit('new_debt', debt);
            if (linkedUserId) {
                // Notify the friend via Socket
                io.to(`user:${linkedUserId.toString()}`).emit('new_debt_request', debt);
                io.to(`user:${linkedUserId.toString()}`).emit('notification_received');
            }
        }

        if (linkedUserId) {
            const senderUser = await User.findById(req.userId).select('name avatarUrl');
            // Create persistent Notification for the receiver
            const n = await Notification.create({
                user: linkedUserId,
                type: 'debt_request',
                title: 'New Debt Request',
                message: `${senderUser?.name || 'Someone'} sent you a debt request for ₱${amount.toLocaleString()}.`,
                data: {
                    debtId: debt._id,
                    senderId: req.userId,
                    senderName: senderUser?.name,
                    senderAvatar: senderUser?.avatarUrl,
                    amount: amount,
                    direction: direction
                }
            });

            if (io) io.to(`user:${linkedUserId}`).emit('new_notification', n);

            // Send Push Notification
            try {
                const receiver = await User.findById(linkedUserId).select('pushToken');
                if (receiver?.pushToken) {
                    await sendPushNotification(
                        receiver.pushToken,
                        'New Debt Request',
                        `${senderUser?.name || 'Someone'} sent you a debt request for ₱${amount.toLocaleString()}.`,
                        { debtId: debt._id.toString() }
                    );
                }
            } catch (pushErr) {
                console.error('[DEBT] Push failed:', pushErr.message);
            }
        }

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

        invalidatePrefixes('debt');

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
        const debt = await Debt.findOneAndDelete({ _id: req.params.id, user: req.userId });
        if (!debt) return res.status(404).json({ error: 'Debt record not found.' });

        // Also delete associated payment logs
        await DebtPayment.deleteMany({ debt: debt._id });

        // Choice: undoPayments (default) vs keepHistory
        const keepHistory = req.query.keepTransactions === 'true';
        const io = req.app.get('io');

        if (!keepHistory && debt.amountPaid > 0) {
            // Create a reversal transaction so it shows in Recent Activity
            const reverseType = debt.direction === 'owed_by_me' ? 'income' : 'expense';
            const reverseDesc = `Undo payment for ${debt.personName}`;

            // Calculate current balance for the snapshot
            const balanceAgg = await Transaction.aggregate([
                { $match: { user: new mongoose.Types.ObjectId(req.userId) } },
                { $group: { _id: '$type', total: { $sum: '$amount' } } },
            ]);
            let currentBalance = 0;
            balanceAgg.forEach(r => {
                if (r._id === 'income') currentBalance += r.total;
                if (r._id === 'expense') currentBalance -= r.total;
            });

            const reversalTx = await Transaction.create({
                user: req.userId,
                type: reverseType,
                amount: debt.amountPaid,
                description: reverseDesc,
                category: 'Debt Reversal',
                categoryIcon: 'rotate-ccw',
                categoryColor: '#ef4444',
                date: new Date(),
                note: `Refund from deleted debt record: ${debt.personName}`,
                runningBalance: reverseType === 'income' ? (currentBalance + debt.amountPaid) : (currentBalance - debt.amountPaid)
            });

            invalidatePrefixes('transaction');
            if (io) io.to(`user:${req.userId}`).emit('new_transaction', reversalTx);
        }

        invalidatePrefixes('debt');

        if (io) io.to(`user:${req.userId}`).emit('delete_debt', { _id: debt._id });

        res.json({ message: 'Debt record and associated logs/transactions deleted.' });
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
        const io = req.app.get('io');

        const debt = await Debt.findOne({ _id: req.params.id, user: req.userId });
        if (!debt) return res.status(404).json({ error: 'Debt record not found.' });
        if (debt.status === 'settled') return res.status(400).json({ error: 'This debt is already fully settled.' });

        const { amount, note, walletId, walletDeductAmount } = req.body;
        if (!amount || amount <= 0) return res.status(400).json({ error: 'Payment amount must be greater than 0.' });

        const remaining = debt.amount - debt.amountPaid;
        // Small epsilon check for floating point precision issues
        if (amount > (remaining + 0.01)) {
            return res.status(400).json({
                error: `Payment exceeds remaining debt. You only owe ₱${remaining.toLocaleString()}.`
            });
        }

        // Create payment log
        const payment = await DebtPayment.create({
            debt: debt._id,
            user: req.userId,
            amount,
            note: note || '',
            wallet: walletId || null
        });

        // ── Auto-Log to Transactions for Recent Activity updates ──
        const txType = debt.direction === 'owed_by_me' ? 'expense' : 'income';
        const txDesc = debt.direction === 'owed_by_me'
            ? `Paid debt to ${debt.personName}`
            : `Received debt payment from ${debt.personName}`;

        // Calculate current total balance of "HAND" money (wallet: null)
        const balanceAgg = await Transaction.aggregate([
            { $match: { user: new mongoose.Types.ObjectId(req.userId), wallet: null } },
            { $group: { _id: '$type', total: { $sum: '$amount' } } },
        ]);
        let currentBalance = 0;
        balanceAgg.forEach(r => {
            if (r._id === 'income') currentBalance += r.total;
            if (r._id === 'expense') currentBalance -= r.total;
        });

        const newTx = await Transaction.create({
            user: req.userId,
            type: txType,
            amount,
            description: txDesc,
            category: 'Debt Repayment',
            categoryIcon: 'check-circle',
            categoryColor: '#8b5cf6', // purple color for debts
            date: new Date(),
            note: encrypt(note || ''),
            runningBalance: walletId ? currentBalance : (txType === 'expense' ? (currentBalance - amount) : (currentBalance + amount)),
            relatedId: debt._id,
            relatedType: 'Debt',
            wallet: walletId || null
        });

        // Link transaction to payment log
        payment.transactionId = newTx._id;
        await payment.save();

        // ── Feature: Wallet Balance Sync ──────────────────────────
        if (walletId) {
            const wallet = await Wallet.findOne({ _id: walletId, userId: req.userId });
            if (wallet) {
                const fiatTypes = ['Debit', 'Credit', 'Cash', 'E-Wallet'];
                const isFiat = fiatTypes.includes(wallet.type);
                const isCrypto = wallet.type === 'Crypto';
                const isStocks = wallet.type === 'Stocks';

                // Use walletDeductAmount (already in native coin units) for crypto/stocks,
                // fall back to PHP amount for fiat wallets
                const nativeAmount = (isCrypto || isStocks)
                    ? (walletDeductAmount != null ? Math.abs(parseFloat(walletDeductAmount)) : amount)
                    : amount;

                if (isFiat || isCrypto || isStocks) {
                    const isCredit = wallet.type === 'Credit';

                    if (isCredit) {
                        // FOR CREDIT WALLETS: Expense (paying debt) increases the owed balance, Income decreases it
                        if (txType === 'expense') {
                            wallet.balance += nativeAmount;
                        } else {
                            wallet.balance -= nativeAmount;
                        }
                    } else {
                        // NORMAL WALLETS: Income increases balance, Expense decreases it
                        if (txType === 'income') {
                            wallet.balance += nativeAmount;
                        } else {
                            wallet.balance -= nativeAmount;
                        }
                    }

                    // Guard against negative balance for non-credit wallets
                    if (!isCredit && wallet.balance < 0) wallet.balance = 0;

                    await wallet.save();

                    // Attach native info to the transaction (newTx) for history view
                    newTx.walletAmount = nativeAmount;
                    newTx.walletCurrency = isCrypto ? wallet.coinSymbol : (isStocks ? (wallet.stockSymbol || wallet.stockTicker) : 'PHP');
                    await newTx.save();

                    // Attach native info to the payment log record
                    payment.walletAmount = nativeAmount;
                    payment.walletCurrency = newTx.walletCurrency;
                    await payment.save();

                    if (io) {
                        io.to(`user:${req.userId}`).emit('wallet_updated', wallet.toObject());
                    }
                }
            }
        }

        // Invalidate transaction caches since we inject a new transaction
        invalidatePrefixes('transaction');

        const fullTx = await Transaction.findById(newTx._id).populate('wallet', 'name type color').lean();
        const decryptedTx = decryptNote(fullTx);

        if (io) {
            io.to(`user:${req.userId}`).emit('new_transaction', decryptedTx);
        }

        // Update debt's amountPaid
        debt.amountPaid = Math.min(debt.amount, (debt.amountPaid || 0) + amount);
        if (debt.amountPaid >= debt.amount) {
            debt.status = 'settled';
        } else if (debt.amountPaid > 0) {
            debt.status = 'partial';
        }

        await debt.save();
        invalidatePrefixes('debt');
        if (io) io.to(`user:${req.userId}`).emit('update_debt', debt);

        // ── P2P Linked Debt Synchronization ───────────────────────
        if (debt.syncStatus === 'linked' && debt.linkedDebtId && debt.linkedUserId) {
            const friendDebt = await Debt.findById(debt.linkedDebtId).populate('user', 'name');
            if (friendDebt) {
                // Log payment on friend's debt
                const friendPayment = await DebtPayment.create({
                    debt: friendDebt._id,
                    user: friendDebt.user._id,
                    amount,
                    note: `Payment synced from ${req.user.name}`,
                    wallet: null // Received in HAND by default
                });

                // Update friend's debt status
                friendDebt.amountPaid = Math.min(friendDebt.amount, (friendDebt.amountPaid || 0) + amount);
                if (friendDebt.amountPaid >= friendDebt.amount) {
                    friendDebt.status = 'settled';
                } else if (friendDebt.amountPaid > 0) {
                    friendDebt.status = 'partial';
                }
                await friendDebt.save();

                // Log Transaction for friend's HAND balance
                const friendTxType = friendDebt.direction === 'owed_by_me' ? 'expense' : 'income';
                const friendTxDesc = friendDebt.direction === 'owed_by_me'
                    ? `Paid debt to ${friendDebt.personName}`
                    : `Received debt payment from ${friendDebt.personName}`;

                const friendBalanceAgg = await Transaction.aggregate([
                    { $match: { user: new mongoose.Types.ObjectId(friendDebt.user._id), wallet: null } },
                    { $group: { _id: '$type', total: { $sum: '$amount' } } },
                ]);
                let friendCurrentBalance = 0;
                friendBalanceAgg.forEach(r => {
                    if (r._id === 'income') friendCurrentBalance += r.total;
                    if (r._id === 'expense') friendCurrentBalance -= r.total;
                });

                const friendTx = await Transaction.create({
                    user: friendDebt.user._id,
                    type: friendTxType,
                    amount,
                    description: friendTxDesc,
                    category: 'Debt Repayment',
                    categoryIcon: 'check-circle',
                    categoryColor: '#8b5cf6',
                    date: new Date(),
                    note: encrypt(`Payment synced from ${req.user.name}`),
                    runningBalance: friendTxType === 'income' ? (friendCurrentBalance + amount) : (friendCurrentBalance - amount),
                    relatedId: friendDebt._id,
                    relatedType: 'Debt',
                    wallet: null
                });

                // Link friend's transaction to their payment log
                friendPayment.transactionId = friendTx._id;
                await friendPayment.save();

                if (io) {
                    io.to(`user:${friendDebt.user._id.toString()}`).emit('update_debt', friendDebt);
                    const friendFullTx = await Transaction.findById(friendTx._id).populate('wallet', 'name type color').lean();
                    io.to(`user:${friendDebt.user._id.toString()}`).emit('new_transaction', decryptNote(friendFullTx));
                    io.to(`user:${friendDebt.user._id.toString()}`).emit('wallet_updated'); // Trigger HAND balance refresh

                    // Create persistent notification for the recipient
                    const n = await Notification.create({
                        user: friendDebt.user._id,
                        type: 'debt_payment',
                        title: 'Debt Payment Received',
                        message: `${req.user.name} has paid you ₱${amount.toLocaleString()}.`,
                        data: { debtId: friendDebt._id, senderAvatar: req.user.avatarUrl }
                    });

                    io.to(`user:${n.user.toString()}`).emit('new_notification', n);

                    // Send Push Notification
                    try {
                        const receiver = await User.findById(friendDebt.user._id).select('pushToken');
                        if (receiver?.pushToken) {
                            await sendPushNotification(
                                receiver.pushToken,
                                'Debt Payment Received',
                                `${req.user.name} has paid you ₱${amount.toLocaleString()}.`,
                                { debtId: friendDebt._id.toString() }
                            );
                        }
                    } catch (pushErr) {
                        console.error('[DEBT] Payment push failed:', pushErr.message);
                    }
                }
            }
        }
        // ─────────────────────────────────────────────────────────

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

        const payments = await DebtPayment.find({ debt: debt._id })
            .populate('wallet', 'name type color')
            .sort({ paidAt: -1 })
            .lean();
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

        // ── In-App Notification ───────────────────────────────────
        await Notification.create({
            user: req.userId,
            type: 'debt_reminder',
            title,
            message: body,
            data: { debtId: debt._id }
        }).then(n => {
            const io = req.app.get('io');
            if (io) io.to(`user:${req.userId}`).emit('new_notification', n);
        }).catch(() => { });

        debt.reminderSent = true;
        await debt.save();

        res.json({ message: 'Reminder sent successfully.' });
    } catch (err) {
        console.error('[DEBT] sendDebtReminder error:', err.message);
        res.status(500).json({ error: 'Failed to send reminder.' });
    }
};
// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/debts/:id/respond
//  Accept or reject a P2P debt request
// ─────────────────────────────────────────────────────────────────────────────
const respondDebtRequest = async (req, res) => {
    try {
        const { status } = req.body; // 'linked' (accepted) or 'rejected'
        if (!['linked', 'rejected'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status. Use linked or rejected.' });
        }

        // The request ID is the ID of the original debt created by the OTHER user,
        // which has linkedUserId = req.userId and syncStatus = 'pending'
        const originalDebt = await Debt.findOne({ _id: req.params.id, linkedUserId: req.userId, syncStatus: 'pending' }).populate('user', 'name');
        if (!originalDebt) return res.status(404).json({ error: 'Debt request not found or already processed.' });

        const io = req.app.get('io');
        originalDebt.syncStatus = status;

        if (status === 'rejected') {
            await originalDebt.save();
            // Cleanup notification
            await Notification.deleteMany({ 'data.debtId': new mongoose.Types.ObjectId(req.params.id) });

            if (io) io.to(`user:${originalDebt.user._id}`).emit('debt_request_rejected', originalDebt);
            return res.json({ message: 'Debt request rejected.' });
        }

        // If accepted, we must create the counterpart debt for the CURRENT user
        const counterpartDirection = originalDebt.direction === 'owed_to_me' ? 'owed_by_me' : 'owed_to_me';

        const myDebt = await Debt.create({
            user: req.userId,
            direction: counterpartDirection,
            personName: originalDebt.user.name,
            amount: originalDebt.amount,
            description: originalDebt.description,
            dateBorrowed: originalDebt.dateBorrowed,
            dueDate: originalDebt.dueDate,
            isInstallment: originalDebt.isInstallment,
            monthlyPayment: originalDebt.monthlyPayment,
            gracePeriodMonths: originalDebt.gracePeriodMonths,
            penaltyRate: originalDebt.penaltyRate,
            linkedUserId: originalDebt.user._id,
            linkedDebtId: originalDebt._id,
            syncStatus: 'linked'
        });

        // Update the original debt to link back
        originalDebt.linkedDebtId = myDebt._id;
        await originalDebt.save();

        // Cleanup notification
        await Notification.deleteMany({ 'data.debtId': new mongoose.Types.ObjectId(req.params.id) });

        invalidatePrefixes('debt');
        if (io) {
            // Notify original sender it was accepted and updated
            io.to(`user:${originalDebt.user._id}`).emit('debt_request_accepted', originalDebt);
            // Notify me that a new debt was created in my account
            io.to(`user:${req.userId}`).emit('new_debt', myDebt);
            // Signal notification cleanup
            io.to(`user:${req.userId}`).emit('notification_deleted', { debtId: req.params.id });
        }

        // Create notification for the SENDER to let them know it was accepted
        const receiverUser = await User.findById(req.userId).select('name avatarUrl');
        const n = await Notification.create({
            user: originalDebt.user._id,
            type: 'debt_accepted',
            title: 'Debt Request Accepted',
            message: `${receiverUser?.name || 'Your friend'} accepted your debt request for ₱${originalDebt.amount.toLocaleString()}.`,
            data: { debtId: originalDebt._id, senderAvatar: receiverUser?.avatarUrl }
        });

        if (io) {
            io.to(`user:${n.user.toString()}`).emit('new_notification', n);
        }

        // Send Push Notification
        try {
            const sender = await User.findById(originalDebt.user._id).select('pushToken');
            if (sender?.pushToken) {
                await sendPushNotification(
                    sender.pushToken,
                    'Debt Request Accepted',
                    `${receiverUser?.name || 'Your friend'} accepted your debt request for ₱${originalDebt.amount.toLocaleString()}.`,
                    { debtId: originalDebt._id.toString() }
                );
            }
        } catch (pushErr) {
            console.error('[DEBT] Response push failed:', pushErr.message);
        }

        res.json({ message: 'Debt request accepted successfully.', debt: myDebt });
    } catch (err) {
        console.error('[DEBT] respondDebtRequest error:', err.message);
        res.status(500).json({ error: 'Failed to respond to debt request.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/debts/split
//  Atomically creates multiple debts for a split bill
// ─────────────────────────────────────────────────────────────────────────────
const splitDebt = async (req, res) => {
    try {
        const { reason, totalAmount, splits } = req.body;
        // splits should be an array of { debtorId, amount }

        if (!reason || !totalAmount || !splits || !splits.length) {
            return res.status(400).json({ error: 'reason, totalAmount, and splits array are required.' });
        }

        const io = req.app.get('io');
        const createdDebts = [];

        // Ensure user data is fetched for notifications
        const senderUser = await User.findById(req.userId).select('name avatarUrl');

        for (const split of splits) {
            const { debtorId, amount } = split;

            // Fetch friend to get their name for the 'personName' field
            const friend = await User.findById(debtorId).select('name');
            if (!friend) continue;

            const debt = await Debt.create({
                user: req.userId,
                direction: 'owed_to_me',
                personName: friend.name,
                amount: amount,
                description: reason,
                dateBorrowed: new Date(),
                linkedUserId: debtorId,
                syncStatus: 'pending'
            });

            createdDebts.push(debt);

            if (io) {
                // Notify the creator (req.userId) about the new pending debt
                io.to(`user:${req.userId}`).emit('new_debt', debt);
                // Notify the friend via Socket
                io.to(`user:${debtorId.toString()}`).emit('new_debt_request', debt);
                io.to(`user:${debtorId.toString()}`).emit('notification_received');
            }

            // Create persistent Notification for the receiver
            const n = await Notification.create({
                user: debtorId,
                type: 'debt_request',
                title: 'Split Bill Request',
                message: `${senderUser?.name || 'Someone'} requested ₱${amount.toLocaleString()} for "${reason}".`,
                data: {
                    debtId: debt._id,
                    senderId: req.userId,
                    senderName: senderUser?.name,
                    senderAvatar: senderUser?.avatarUrl,
                    amount: amount,
                    direction: 'owed_to_me',
                    isSplit: true
                }
            });

            if (io) io.to(`user:${debtorId}`).emit('new_notification', n);

            // Send Push Notification
            try {
                const receiver = await User.findById(debtorId).select('pushToken');
                if (receiver?.pushToken) {
                    await sendPushNotification(
                        receiver.pushToken,
                        'Split Bill Request',
                        `${senderUser?.name || 'Someone'} requested ₱${amount.toLocaleString()} for "${reason}".`,
                        { debtId: debt._id.toString() }
                    );
                }
            } catch (pushErr) {
                console.error('[DEBT] Split push failed:', pushErr.message);
            }
        }

        invalidatePrefixes('debt');

        res.status(201).json({ message: 'Split bill requests sent successfully.', debts: createdDebts });
    } catch (err) {
        console.error('[DEBT] splitDebt error:', err.message);
        res.status(500).json({ error: 'Failed to split bill.' });
    }
};

module.exports = { getDebts, createDebt, updateDebt, deleteDebt, logPayment, getPayments, sendDebtReminder, respondDebtRequest, splitDebt };
