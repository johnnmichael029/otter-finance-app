const RecurringBill = require('../models/recurringBillModel');
const User = require('../models/userModel');
const Wallet = require('../models/walletModel');
const SavingsGoal = require('../models/savingsGoalModel');
const Transaction = require('../models/transactionModel');
const { encrypt } = require('../utils/encryption');
const mongoose = require('mongoose');

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


// POST /api/recurring-bills/:id/paid — advance the next due date by one cycle and auto-log expense
const markBillPaid = async (req, res) => {
    try {
        const io = req.app.get('io');
        const bill = await RecurringBill.findOne({ _id: req.params.id, user: req.userId });
        if (!bill) return res.status(404).json({ error: 'Bill not found.' });

        const { walletId, walletDeductAmount, sourceType, note, amount } = req.body;
        const paidAmount = amount || bill.amount;

        // Calculate current total balance of "HAND" money (wallet: null)
        const balanceAgg = await Transaction.aggregate([
            { $match: { user: new mongoose.Types.ObjectId(req.userId), wallet: null } },
            { $group: { _id: '$type', total: { $sum: '$amount' } } },
        ]);
        let currentHandBalance = 0;
        balanceAgg.forEach(r => {
            if (r._id === 'income') currentHandBalance += r.total;
            if (r._id === 'expense') currentHandBalance -= r.total;
        });

        let transactionOptions = {
            user: req.userId,
            type: 'expense',
            amount: paidAmount,
            category: bill.category,
            categoryIcon: bill.categoryIcon,
            categoryColor: bill.categoryColor,
            description: bill.name,
            note: encrypt(note || 'Auto-paid bill'),
            date: new Date(),
            wallet: walletId || null,
            runningBalance: walletId ? currentHandBalance : (currentHandBalance - paidAmount)
        };

        if (sourceType === 'wallet' && walletId) {
            const wallet = await Wallet.findOne({ _id: walletId, userId: req.userId });
            if (wallet) {
                const fiatTypes = ['Debit', 'Credit', 'Cash', 'E-Wallet'];
                const isFiat = fiatTypes.includes(wallet.type);
                const isCrypto = wallet.type === 'Crypto';
                const isStocks = wallet.type === 'Stocks';

                const nativeAmount = (isCrypto || isStocks)
                    ? (walletDeductAmount != null ? Math.abs(parseFloat(walletDeductAmount)) : paidAmount)
                    : paidAmount;

                if (isFiat || isCrypto || isStocks) {
                    const isCredit = wallet.type === 'Credit';
                    if (isCredit) {
                        wallet.balance += nativeAmount; // Expense on credit increases balance
                    } else {
                        wallet.balance -= nativeAmount;
                    }
                    if (!isCredit && wallet.balance < 0) wallet.balance = 0;
                    await wallet.save();

                    transactionOptions.walletAmount = nativeAmount;
                    transactionOptions.walletCurrency = isCrypto ? wallet.coinSymbol : (isStocks ? (wallet.stockSymbol || wallet.stockTicker) : 'PHP');
                    
                    if (io) io.to(`user:${req.userId}`).emit('wallet_updated', wallet.toObject());
                }
            }
        } else if (sourceType === 'savings') {
            const masterPot = await SavingsGoal.findOne({ user: req.userId, name: 'Savings Balance' });
            if (masterPot) {
                masterPot.currentAmount -= paidAmount;
                if (masterPot.currentAmount < 0) masterPot.currentAmount = 0;
                await masterPot.save();
                if (io) io.to(`user:${req.userId}`).emit('update_savings_pot', masterPot);
            }
        } else {
            // Default to hand
            const user = await User.findById(req.userId);
            if (user) {
                user.handBalance -= paidAmount;
                await user.save();
                if (io) io.to(`user:${req.userId}`).emit('wallet_updated', { _id: 'main', balance: user.handBalance });
            }
        }

        const transaction = await Transaction.create(transactionOptions);

        // Advance due date
        bill.nextDueDate = computeNextDueDate(bill.nextDueDate, bill.frequency);
        bill.notified = false;
        await bill.save();

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
