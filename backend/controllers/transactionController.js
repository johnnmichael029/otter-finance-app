const Transaction = require('../models/transactionModel');
const Budget = require('../models/budgetModel');
const Wallet = require('../models/walletModel');
const User = require('../models/userModel');
const SavingsGoal = require('../models/savingsGoalModel');
const SavingsTransfer = require('../models/savingsTransferModel');
const Notification = require('../models/Notification');
const Challenge = require('../models/challengeModel');
const Debt = require('../models/debtModel');
const DebtPayment = require('../models/debtPaymentModel');
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
        const { type, category, startDate, endDate, page = 1, limit = 20, isArchived } = req.query;

        const filter = { user: req.userId };
        
        // Handle Archive filtering (default to only non-archived in main feed)
        if (isArchived !== undefined) {
            if (isArchived === 'true') {
                filter.isArchived = true;
            } else {
                filter.isArchived = { $ne: true };
            }
        } else {
            filter.isArchived = { $ne: true };
        }

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
                .populate('wallet', 'name type color')
                .populate('sourceWallet', 'name type color')
                .populate('relatedId', 'name color icon')
                .populate('sourceRelatedId', 'name color icon')
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
                    user: new mongoose.Types.ObjectId(req.userId),
                    date: { $gte: start, $lte: end },
                    type: { $in: ['income', 'expense'] }
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

        // Get persistent Hand balance (with one-time migration check)
        const user = await User.findById(req.userId);
        const forceSync = req.query.forceSync === 'true';

        if (user.handBalance === 0 || forceSync) {
            const hasTxs = await Transaction.exists({ user: req.userId, wallet: null });
            if (hasTxs || forceSync) {
                const syncAgg = await Transaction.aggregate([
                    { $match: { user: new mongoose.Types.ObjectId(req.userId), wallet: null, isArchived: { $ne: true } } },
                    { $group: { _id: '$type', total: { $sum: '$amount' } } }
                ]);
                let syncBalance = 0;
                syncAgg.forEach(r => {
                    if (r._id === 'income') syncBalance += r.total;
                    if (r._id === 'expense') syncBalance -= r.total;
                });
                const deductAgg = await Transaction.aggregate([
                    { $match: { user: new mongoose.Types.ObjectId(req.userId), paymentSource: 'HAND', wallet: { $ne: null }, isArchived: { $ne: true } } },
                    { $group: { _id: null, total: { $sum: '$amount' } } }
                ]);
                if (deductAgg.length > 0) syncBalance -= deductAgg[0].total;
                user.handBalance = syncBalance;
                await user.save();
            }
        }
        let netBalance = user?.handBalance || 0;

        // Convert to Percentages for chart (relative to max in that range)
        const maxVal = Math.max(...incomeDist, ...expenseDist, 100); 
        const normalize = (dist) => dist.map(v => Math.round((v / maxVal) * 100));

        // Get Category Distributions for Pie Charts
        const getPieData = async (type) => {
            const data = await Transaction.aggregate([
                {
                    $match: {
                        user: new mongoose.Types.ObjectId(req.userId),
                        date: { $gte: start, $lte: end },
                        type: type,
                        category: { $ne: 'transfer' }
                    }
                },
                {
                    $group: {
                        _id: '$category',
                        total: { $sum: '$amount' },
                        color: { $first: '$categoryColor' }
                    }
                },
                { $sort: { total: -1 } }
            ]);
            
            return data.map(item => ({
                name: item._id,
                population: item.total,
                color: item.color || (type === 'income' ? '#22c55e' : '#ef4444'),
                legendFontColor: '#7F7F7F',
                legendFontSize: 12
            }));
        };

        const expensePie = await getPieData('expense');
        const incomePie = await getPieData('income');

        res.json({
            ...summary,
            netBalance, // Total wallet balance
            incomeDist: normalize(incomeDist),
            expenseDist: normalize(expenseDist),
            expensePie,
            incomePie
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
        const io = req.app.get('io');
        const { 
            type, amount, category, categoryIcon, categoryColor, 
            description, date, note,
            currency, originalAmount, exchangeRate, attachment,
            walletId, walletDeductAmount,
            sourceWalletId, sourceWalletDeductAmount,
            sourceType   // 'savings_balance' | 'hand' | undefined
        } = req.body;

        if (!type || !amount || !category) {
            return res.status(400).json({ error: 'type, amount, and category are required.' });
        }

        const user = await User.findById(req.userId);
        let currentBalance = user?.handBalance || 0;

        const safeAmount = parseFloat(amount) || 0;
        // Running balance only matters for HAND transactions if this is a HAND transaction
        const runningBalance = !walletId 
            ? (type === 'income' ? currentBalance + safeAmount : currentBalance - safeAmount)
            : currentBalance; // Keep current hand balance if paying from wallet

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
            attachment,
            runningBalance,
            wallet: walletId || null,
            sourceWallet: sourceWalletId || null,
            sourceWalletAmount: null,
            sourceWalletCurrency: null,
            // Store the source type label for display in history
            paymentSource: sourceType === 'savings_balance'
                ? 'Savings Balance'
                : sourceWalletId
                    ? null  // will be set from sourceWallet name
                    : (sourceType === 'hand' ? 'HAND' : 'External Source'),
        });

        // ── Feature: SOURCE WALLET Deduction (for Income/Transfer logic) ──
        if (sourceWalletId) {
            const sWallet = await Wallet.findOne({ _id: sourceWalletId, userId: req.userId });
            if (sWallet) {
                // If it's crypto/stocks or foreign fiat, use the native amount provided
                const isForeign = sWallet.currency && sWallet.currency !== 'PHP';
                const srcNativeAmount = (sWallet.type === 'Crypto' || sWallet.type === 'Stocks' || isForeign)
                    ? (sourceWalletDeductAmount != null ? Math.abs(parseFloat(sourceWalletDeductAmount)) : (walletDeductAmount != null ? Math.abs(parseFloat(walletDeductAmount)) : safeAmount))
                    : safeAmount;

                // We ALWAYS deduct from source wallet
                if (sWallet.type === 'Credit') {
                    sWallet.balance += srcNativeAmount; // Cash advance increases debt
                } else {
                    sWallet.balance -= srcNativeAmount;
                    if (sWallet.balance < 0) sWallet.balance = 0;
                }
                await sWallet.save();

                // Save native info to transaction
                transaction.sourceWalletAmount = srcNativeAmount;
                transaction.sourceWalletCurrency = sWallet.coinSymbol || sWallet.stockSymbol || sWallet.currency || 'PHP';
                await transaction.save();

                if (io) io.to(`user:${req.userId}`).emit('wallet_updated', sWallet.toObject());
            }
        }

        // ── Feature: HAND as Source — validate sufficient balance ─────────────
        // Deduct from HAND when:
        //   - expense/transfer (always deduct from HAND if sourceType is hand)
        //   - income to a wallet (depositing cash from hand into a wallet account)
        if (sourceType === 'hand') {
            const shouldDeduct = type === 'expense' || type === 'transfer' || (type === 'income' && walletId);
            if (shouldDeduct) {
                if (currentBalance < safeAmount) {
                    return res.status(400).json({
                        error: `Insufficient HAND balance. You have ₱${currentBalance.toFixed(2)} but tried to use ₱${safeAmount.toFixed(2)}.`
                    });
                }
                user.handBalance -= safeAmount;
                // Update currentBalance for the destination logic below
                currentBalance = user.handBalance;
                await user.save();
            }
            if (io) io.to(`user:${req.userId}`).emit('wallet_updated', { _id: 'main', balance: user.handBalance });
        }

        // ── Feature: SAVINGS BALANCE as Source ───────────────────────────────
        if (sourceType === 'savings_balance') {
            const masterPot = await SavingsGoal.findOne({ user: req.userId, name: 'Savings Balance' });
            if (masterPot) {
                if (masterPot.currentAmount < safeAmount) {
                    return res.status(400).json({
                        error: `Insufficient Savings Balance. You have ₱${masterPot.currentAmount.toFixed(2)} but tried to use ₱${safeAmount.toFixed(2)}.`
                    });
                } else {
                    masterPot.currentAmount -= safeAmount;
                }
                await masterPot.save();

                transaction.sourceRelatedType = 'SavingsGoal';
                transaction.sourceRelatedId = masterPot._id;
                await transaction.save();

                // Log in savings transfer history so it appears in the savings screen
                const xfer = await SavingsTransfer.create({
                    user: req.userId,
                    direction: 'from_savings',
                    amount: safeAmount,
                    goal: masterPot._id,
                    goalName: masterPot.name,
                    wallet: walletId || null,
                    walletAmount: walletDeductAmount != null ? Math.abs(parseFloat(walletDeductAmount)) : undefined,
                    note: `Wallet Top-up: ${category}`,
                    runningBalance: masterPot.currentAmount,
                });

                if (io) {
                    io.to(`user:${req.userId}`).emit('update_savings_goal', masterPot);
                    io.to(`user:${req.userId}`).emit('new_savings_transfer', xfer);
                }
            }
        }

        // ── Feature: Wallet Balance Sync (Destination) ──────────────────────────
        if (!walletId) {
            // Destination is HAND
            console.log(`[HAND_SYNC] Type: ${type}, Amount: ${safeAmount}, Prev: ${user.handBalance}`);
            user.handBalance += (type === 'income' ? safeAmount : -safeAmount);
            await user.save();
            console.log(`[HAND_SYNC] New Balance: ${user.handBalance}`);
            if (io) io.to(`user:${req.userId}`).emit('wallet_updated', { _id: 'main', balance: user.handBalance });
        } else {
            const wallet = await Wallet.findOne({ _id: walletId, userId: req.userId });
            if (wallet) {
                const fiatTypes = ['Debit', 'Credit', 'Cash', 'E-Wallet'];
                const isFiat = fiatTypes.includes(wallet.type);
                const isCrypto = wallet.type === 'Crypto';
                const isStocks = wallet.type === 'Stocks';

                const isCredit = wallet.type === 'Credit';

                // Determine how much to add/deduct in native units
                const isForeign = wallet.currency && wallet.currency !== 'PHP';
                const nativeAmount = (isCrypto || isStocks || isForeign)
                    ? (walletDeductAmount != null ? Math.abs(parseFloat(walletDeductAmount)) : safeAmount)
                    : safeAmount;

                if (isFiat || isCrypto || isStocks) {
                    if (isCredit) {
                        // FOR CREDIT WALLETS: Expense increases the owed balance, Income decreases it
                        if (type === 'expense') {
                            wallet.balance += nativeAmount;
                        } else {
                            wallet.balance -= nativeAmount;
                        }
                    } else {
                        // NORMAL WALLETS: Income increases balance, Expense decreases it
                        if (type === 'income') {
                            wallet.balance += nativeAmount;
                        } else {
                            wallet.balance -= nativeAmount;
                        }
                    }

                    // Guard against negative balance for non-credit wallets (optional, credit can be negative)
                    if (!isCredit && wallet.balance < 0) wallet.balance = 0;
                    
                    await wallet.save();
                    
                    // Attach native info to the transaction for history view
                    transaction.walletAmount = nativeAmount;
                    transaction.walletCurrency = isCrypto ? wallet.coinSymbol : (isStocks ? (wallet.stockSymbol || wallet.stockTicker) : 'PHP');
                    await transaction.save();

                    if (io) {
                        io.to(`user:${req.userId}`).emit('wallet_updated', wallet.toObject());
                    }
                }
            }
        }

        invalidatePrefixes('transaction');
        invalidatePrefixes('savings');

        // ── Feature #7: Budget Alerter & Challenge Tracking ─────────
        if (type === 'expense') {
            checkBudgetAlerts(req.userId, category, req.app.get('io'));
            triggerNoSpendChallenge(req.userId, date || new Date(), req.app.get('io'));
        }

        const fullTransaction = await Transaction.findById(transaction._id)
            .populate('wallet', 'name type color')
            .populate('sourceWallet', 'name type color')
            .lean();
        const decrypted = decryptNote(fullTransaction);

        // Emit real-time event so connected mobile clients update instantly
        if (io) {
            io.to(`user:${req.userId}`).emit('new_transaction', decrypted);
        }

        res.status(201).json(decrypted);
    } catch (err) {
        console.error('[TRANSACTION] createTransaction error:', err.message);
        res.status(500).json({ error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  PATCH /api/transactions/:id
//  Body: partial transaction fields
// ─────────────────────────────────────────────────────────────────────────────
const updateTransaction = async (req, res) => {
    try {
        // Encrypt note if it's being updated
        if (req.body.note !== undefined) {
            req.body.note = encrypt(req.body.note);
        }

        const transaction = await Transaction.findOneAndUpdate(
            { _id: req.params.id, user: req.userId },
            { $set: req.body },
            { returnDocument: 'after', runValidators: true }
        );

        if (!transaction) {
            return res.status(404).json({ error: 'Transaction not found.' });
        }

        invalidatePrefixes('transaction');
        invalidatePrefixes('savings');

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
        const transaction = await Transaction.findById(req.params.id);
        if (!transaction) return res.status(404).json({ error: 'Transaction not found.' });

        // ── Block Non-Reversible Transaction Deletion ──
        if (transaction.isNonReversible) {
            return res.status(400).json({ error: 'This transaction is part of a finalized group settlement or official record and cannot be reversed to maintain financial integrity.' });
        }

        // ── Block Debt Transaction Deletion ──
        if (transaction.relatedType === 'Debt') {
            return res.status(400).json({ error: 'Debt-related transactions cannot be deleted. They must remain in history to maintain accurate debt balances.' });
        }

        // Authorization check: User must be owner OR participant in linked Goal/Debt
        let isAuthorized = transaction.user.toString() === req.userId;

        let goalObj = null;
        if (transaction.relatedType === 'SavingsGoal' && transaction.relatedId) {
            goalObj = await SavingsGoal.findOne({
                _id: transaction.relatedId,
                $or: [
                    { user: req.userId },
                    { "participants.user": req.userId, "participants.status": "accepted" }
                ]
            });
            if (goalObj) isAuthorized = true;
        }

        if (!isAuthorized && transaction.relatedType === 'Debt' && transaction.relatedId) {
            const debt = await Debt.findOne({
                _id: transaction.relatedId,
                $or: [{ user: req.userId }, { linkedUserId: req.userId }]
            });
            if (debt) isAuthorized = true;
        }

        if (!isAuthorized) return res.status(403).json({ error: 'Access denied.' });

        const io = req.app.get('io');
        const isArchived = transaction.isArchived === true;

        // ── ONLY REVERT BALANCES IF NOT ARCHIVED ──────────────────────────────
        if (!isArchived) {
            // ── Feature: Debt Payment Reversal Sync ──
        if (transaction.relatedType === 'Debt' && transaction.relatedId) {
            const debt = await Debt.findById(transaction.relatedId);
            if (debt) {
                // 1. Revert principal
                debt.amountPaid = Math.max(0, (debt.amountPaid || 0) - transaction.amount);
                // 2. Update status
                if (debt.amountPaid <= 0) debt.status = 'pending';
                else if (debt.amountPaid < debt.amount) debt.status = 'partial';
                await debt.save();

                // 3. Find and delete the DebtPayment log
                await DebtPayment.findOneAndDelete({
                    transactionId: transaction._id
                });


                // 4. Sync linked debt if exists
                if (debt.syncStatus === 'linked' && debt.linkedDebtId) {
                    const friendDebt = await Debt.findById(debt.linkedDebtId);
                    if (friendDebt) {
                        friendDebt.amountPaid = Math.max(0, (friendDebt.amountPaid || 0) - transaction.amount);
                        if (friendDebt.amountPaid <= 0) friendDebt.status = 'pending';
                        else if (friendDebt.amountPaid < friendDebt.amount) friendDebt.status = 'partial';
                        await friendDebt.save();

                        // Delete friend's transaction too
                        const friendTx = await Transaction.findOneAndDelete({
                            user: friendDebt.user,
                            relatedId: friendDebt._id,
                            relatedType: 'Debt',
                            amount: transaction.amount,
                            createdAt: { $gte: new Date(transaction.createdAt.getTime() - 60000), $lte: new Date(transaction.createdAt.getTime() + 60000) }
                        });

                        if (friendTx && io) {
                            io.to(`user:${friendDebt.user}`).emit('delete_transaction', { _id: friendTx._id });
                        }
                        if (io) io.to(`user:${friendDebt.user}`).emit('update_debt', friendDebt);
                    }
                }
                if (io) io.to(`user:${debt.user}`).emit('update_debt', debt);
                invalidatePrefixes('debt');
            }
        }

        // ── Feature: Wallet Balance Reversal Sync (Smart Revert) ──
        // 1. Revert Destination Wallet
        if (transaction.wallet) {
            const wallet = await Wallet.findOne({ _id: transaction.wallet, userId: transaction.user });
            if (wallet) {
                const isCredit = wallet.type === 'Credit';
                const revAmount = transaction.walletAmount != null ? transaction.walletAmount : transaction.amount;
                
                if (isCredit) {
                    if (transaction.type === 'expense') wallet.balance -= revAmount;
                    else wallet.balance += revAmount;
                } else {
                    if (transaction.type === 'expense') wallet.balance += revAmount;
                    else wallet.balance -= revAmount;
                }
                if (!isCredit && wallet.balance < 0) wallet.balance = 0;
                await wallet.save();
                if (io) io.to(`user:${transaction.user}`).emit('wallet_updated', wallet.toObject());
            }
        }

        // 2. Revert Source Wallet (for Transfers / Sourced Income)
        if (transaction.sourceWallet) {
            const sWallet = await Wallet.findOne({ _id: transaction.sourceWallet, userId: transaction.user });
            if (sWallet) {
                const srcRevAmount = transaction.sourceWalletAmount != null ? transaction.sourceWalletAmount : transaction.amount;
                if (sWallet.type === 'Credit') {
                    // Credit card debt was increased when sourced, so we decrease it now
                    sWallet.balance -= srcRevAmount;
                } else {
                    // Normal wallet was deducted when sourced, so we add it back now
                    sWallet.balance += srcRevAmount;
                }
                if (sWallet.type !== 'Credit' && sWallet.balance < 0) sWallet.balance = 0;
                await sWallet.save();
                if (io) io.to(`user:${transaction.user}`).emit('wallet_updated', sWallet.toObject());
            }
        }

        // 3. Revert Savings Goal
        if (transaction.relatedType === 'SavingsGoal' && transaction.relatedId) {
            const goal = goalObj || await SavingsGoal.findById(transaction.relatedId);
            if (goal) {
                if (!isArchived) {
                    if (transaction.type === 'expense' || transaction.type === 'transfer') {
                        goal.currentAmount = Math.max(0, goal.currentAmount - transaction.amount);
                    } else {
                        goal.currentAmount += transaction.amount;
                    }
                    await goal.save();
                    if (io) {
                        io.to(`user:${goal.user}`).emit('update_savings_goal', goal);
                        goal.participants.forEach(p => io.to(`user:${p.user}`).emit('update_savings_goal', goal));
                    }
                }
                
                // ALWAYS delete the transfer log regardless of archive status
                await SavingsTransfer.deleteOne({ relatedTransaction: transaction._id });
                if (io) {
                    io.to(`user:${transaction.user}`).emit('delete_savings_transfer', { goalId: goal._id, amount: transaction.amount });
                }
            }
        }

        // 4. Revert Source Savings Goal
        if (transaction.sourceRelatedType === 'SavingsGoal' && transaction.sourceRelatedId) {
            const sGoal = await SavingsGoal.findById(transaction.sourceRelatedId);
            if (sGoal) {
                if (!isArchived) {
                    sGoal.currentAmount += transaction.amount;
                    await sGoal.save();
                    if (io) {
                        io.to(`user:${sGoal.user}`).emit('update_savings_goal', sGoal);
                        sGoal.participants.forEach(p => io.to(`user:${p.user}`).emit('update_savings_goal', sGoal));
                    }
                }
                
                // ALWAYS delete the transfer log regardless of archive status
                await SavingsTransfer.deleteOne({ relatedTransaction: transaction._id });
                if (io) {
                    io.to(`user:${transaction.user}`).emit('delete_savings_transfer', { goalId: sGoal._id, amount: transaction.amount });
                }
            }
        }

        } // ── End of Non-Archived Reversal Logic ──
        
        // Delete the transaction record
        await transaction.deleteOne();

        const emitHandBalance = async (userId) => {
            const userObj = await User.findById(userId);
            if (userObj && io) {
                io.to(`user:${userId}`).emit('wallet_updated', { _id: 'main', balance: userObj.handBalance });
            }
        };

        // Revert persistent HAND balance if not archived
        if (!isArchived && !transaction.wallet) {
            const userObj = await User.findById(transaction.user);
            if (userObj) {
                const revertAmt = transaction.amount;
                userObj.handBalance += (transaction.type === 'income' ? -revertAmt : revertAmt);
                await userObj.save();
            }
        }

        await emitHandBalance(transaction.user);
        if (req.userId !== transaction.user.toString()) {
            await emitHandBalance(req.userId);
        }

        invalidatePrefixes('transaction');
        invalidatePrefixes('savings');

        if (io) {
            io.to(`user:${transaction.user}`).emit('delete_transaction', { _id: transaction._id });
            if (req.userId !== transaction.user.toString()) {
                io.to(`user:${req.userId}`).emit('delete_transaction', { _id: transaction._id });
            }
        }

        res.json({ message: 'Transaction deleted successfully.' });
    } catch (err) {
        console.error('[TRANSACTION] deleteTransaction error:', err.message);
        res.status(500).json({ error: 'Failed to delete transaction.' });
    }
};


// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/transactions/analytics
//  Generates AI Insight, Pie Chart Data, and 6-month Trends
// ─────────────────────────────────────────────────────────────────────────────
const getAnalytics = async (req, res) => {
    try {
        const { range = 'THIS_MONTH', startDate, endDate } = req.query;
        const now = new Date();
        const firstDayThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        
        let dateFilter = { $gte: firstDayThisMonth }; // Default THIS_MONTH

        if (range === '7D') {
            dateFilter = { $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) };
        } else if (range === '30D') {
            dateFilter = { $gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) };
        } else if (range === 'THIS_YEAR') {
            dateFilter = { $gte: new Date(now.getFullYear(), 0, 1) };
        } else if (range === 'ALL_TIME') {
            dateFilter = { $gte: new Date(0) }; // Beginning of time
        } else if (range === 'CUSTOM' && startDate && endDate) {
            // Include entire end date
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            dateFilter = { $gte: new Date(startDate), $lte: end };
        }

        const firstDay6MonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

        // 1. Category Breakdown (Selected Range)
        const currentMonthAgg = await Transaction.aggregate([
            {
                $match: {
                    user: new mongoose.Types.ObjectId(req.userId),
                    type: 'expense',
                    date: dateFilter
                }
            },
            {
                $group: {
                    _id: '$category',
                    total: { $sum: '$amount' },
                    color: { $first: '$categoryColor' }
                }
            },
            { $sort: { total: -1 } }
        ]);

        const pieChartData = currentMonthAgg.map(item => ({
            name: item._id,
            population: item.total,
            color: item.color || '#E91E8C',
            legendFontColor: '#7F7F7F',
            legendFontSize: 12
        }));

        // 1b. Income Breakdown (Selected Range)
        const incomeMonthAgg = await Transaction.aggregate([
            {
                $match: {
                    user: new mongoose.Types.ObjectId(req.userId),
                    type: 'income',
                    date: dateFilter
                }
            },
            {
                $lookup: {
                    from: 'wallets',
                    localField: 'sourceWallet',
                    foreignField: '_id',
                    as: 'sourceWalletDoc'
                }
            },
            {
                $match: {
                    $or: [
                        { sourceWallet: null, paymentSource: { $ne: 'HAND' } },
                        { "sourceWalletDoc.type": "Credit" }
                    ]
                }
            },
            {
                $group: {
                    _id: '$category',
                    total: { $sum: '$amount' },
                    color: { $first: '$categoryColor' }
                }
            },
            { $sort: { total: -1 } }
        ]);

        const incomePieChartData = incomeMonthAgg.map(item => ({
            name: item._id,
            population: item.total,
            color: item.color || '#10b981',
            legendFontColor: '#7F7F7F',
            legendFontSize: 12
        }));

        // 2. Trend Graph (Full Year — 12 Months)
        const trendYear = parseInt(req.query.trendYear) || now.getFullYear();
        const firstDayOfTrendYear = new Date(trendYear, 0, 1);
        const lastDayOfTrendYear = new Date(trendYear + 1, 0, 1);

        const trendsAgg = await Transaction.aggregate([
            {
                $match: {
                    user: new mongoose.Types.ObjectId(req.userId),
                    type: { $in: ['income', 'expense'] },
                    date: { $gte: firstDayOfTrendYear, $lt: lastDayOfTrendYear }
                }
            },
            {
                $group: {
                    _id: {
                        month: { $month: '$date' },
                        year: { $year: '$date' },
                        type: '$type'
                    },
                    total: { $sum: '$amount' }
                }
            }
        ]);

        // Format full 12-month Trends Data
        const monthsLabel = [];
        const expenseData = [];
        const incomeData = [];

        for (let m = 1; m <= 12; m++) {
            const d = new Date(trendYear, m - 1, 1);
            monthsLabel.push(d.toLocaleString('en-US', { month: 'short' }));

            const exp = trendsAgg.find(t => t._id.month === m && t._id.year === trendYear && t._id.type === 'expense');
            const inc = trendsAgg.find(t => t._id.month === m && t._id.year === trendYear && t._id.type === 'income');

            expenseData.push(exp ? exp.total : 0);
            incomeData.push(inc ? inc.total : 0);
        }

        const trendData = {
            labels: monthsLabel,
            datasets: [
                { data: expenseData, color: (opacity = 1) => `rgba(239, 68, 68, ${opacity})` },  // red
                { data: incomeData, color: (opacity = 1) => `rgba(34, 197, 94, ${opacity})` }    // green
            ],
            trendYear
        };

        // 3. AI Smart Insights (Last vs This month)
        const lastMonthAgg = await Transaction.aggregate([
            {
                $match: {
                    user: new mongoose.Types.ObjectId(req.userId),
                    type: 'expense',
                    date: { $gte: firstDayLastMonth, $lt: firstDayThisMonth }
                }
            },
            {
                $group: {
                    _id: '$category',
                    total: { $sum: '$amount' }
                }
            }
        ]);

        // 4. Advanced AI Smart Insights 🤖
        const insights = [];

        // Insight A: Category Change
        if (currentMonthAgg.length > 0 && lastMonthAgg.length > 0) {
            const topCategory = currentMonthAgg[0];
            const lastMonthSameCat = lastMonthAgg.find(c => c._id === topCategory._id);
            if (lastMonthSameCat && lastMonthSameCat.total > 0) {
                const diff = topCategory.total - lastMonthSameCat.total;
                const pct = Math.round(Math.abs(diff) / lastMonthSameCat.total * 100);
                if (diff > 0 && pct > 10) {
                    insights.push(`Your spending on ${topCategory._id} has increased by ${pct}% this month. Keep an eye on it! ⚠️`);
                } else if (diff < 0 && pct > 5) {
                    insights.push(`Awesome! You've reduced your ${topCategory._id} spending by ${pct}% compared to last month. 🌟`);
                }
            }
        }

        // Insight B: Velocity Check
        const totalExpensesThisMonth = currentMonthAgg.reduce((sum, item) => sum + item.total, 0);
        const totalIncomeThisMonth = incomeMonthAgg.reduce((sum, item) => sum + item.total, 0);
        const totalExpensesLastMonth = lastMonthAgg.reduce((sum, item) => sum + item.total, 0);

        const dayOfMonth = now.getDate();
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

        if (range === 'THIS_MONTH' && totalExpensesLastMonth > 0) {
            const velocityPct = Math.round((totalExpensesThisMonth / totalExpensesLastMonth) * 100);
            const timePct = Math.round((dayOfMonth / daysInMonth) * 100);

            if (velocityPct > timePct + 15) {
                insights.push(`Careful! You've already spent ${velocityPct}% of last month's total budget, but we're only ${timePct}% through the month. 💨`);
            } else if (velocityPct < timePct - 15 && totalExpensesThisMonth > 0) {
                insights.push(`Great pacing! Your spending is significantly lower than this time last month. 🐢`);
            }
        }

        // Insight C: Savings Rate
        if (totalIncomeThisMonth > 0) {
            const savingsRate = Math.round(((totalIncomeThisMonth - totalExpensesThisMonth) / totalIncomeThisMonth) * 100);
            if (savingsRate > 20) {
                insights.push(`Your savings rate is ${savingsRate}% this month. You're building wealth fast! 💰`);
            } else if (savingsRate < 0) {
                insights.push(`Heads up: You've spent more than you earned this month. Let's look for some cuts! 📉`);
            }
        }

        // Final primary insight for legacy compatibility if needed
        const primaryInsight = insights[0] || "Keep tracking your expenses to get personalized insights!";

        res.json({
            pieChartData,
            incomePieChartData,
            trendData,
            insight: primaryInsight,
            insights: insights.length > 0 ? insights : ["No major patterns detected yet. Keep logging!"],
            stats: {
                totalExpenses: totalExpensesThisMonth,
                totalIncome: totalIncomeThisMonth,
                avgDaily: Math.round(totalExpensesThisMonth / (range === 'THIS_MONTH' ? dayOfMonth : 30))
            }
        });

    } catch (err) {
        console.error('[TRANSACTION] getAnalytics error:', err.message);
        res.status(500).json({ error: 'Failed to fetch analytics.' });
    }
};

/**
 * Helper: Budget Alert System
 * Runs in background after a transaction is created
 */
const checkBudgetAlerts = async (userId, categoryName, io) => {
    try {
        const now = new Date();
        const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        // 1. Find the budget for this category
        const budget = await Budget.findOne({ user: userId, month: monthStr, category: categoryName });
        if (!budget) return; // No budget set for this category

        // 2. Calculate total spent this month for this category
        const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        const spendingAgg = await Transaction.aggregate([
            {
                $match: {
                    user: new mongoose.Types.ObjectId(userId),
                    category: categoryName,
                    type: 'expense',
                    date: { $gte: startDate, $lte: endDate }
                }
            },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);

        const totalSpent = spendingAgg.length > 0 ? spendingAgg[0].total : 0;
        const limit = budget.allocatedAmount;
        const percentage = (totalSpent / limit) * 100;

        let alertType = null;
        let alertTitle = '';
        let alertMessage = '';

        if (percentage >= 100) {
            alertType = '100_percent';
            alertTitle = '🚨 Budget Exceeded!';
            alertMessage = `You've spent ${Math.round(percentage)}% of your "${categoryName}" budget for ${monthStr}.`;
        } else if (percentage >= 80) {
            alertType = '80_percent';
            alertTitle = '⚠️ Budget Warning';
            alertMessage = `You've reached ${Math.round(percentage)}% of your "${categoryName}" budget. Watch your spending!`;
        } else if (budget.reminderAmount > 0 && totalSpent >= budget.reminderAmount) {
            alertType = 'reminder';
            alertTitle = '🔔 Budget Reminder';
            alertMessage = `You hit the reminder for your "${categoryName}" spend! Current: ₱${totalSpent.toLocaleString()} (Limit: ₱${limit.toLocaleString()})`;
        }

        if (alertType) {
            // Check if we already sent this specific alert type for this category today
            // (Wait: maybe just check if any exists for this category/month/type combo to avoid spam)
            const exists = await Notification.findOne({
                user: userId,
                type: 'budget_alert',
                'data.category': categoryName,
                'data.threshold': alertType,
                createdAt: { $gte: startDate } // Since it's a monthly budget, maybe once per month per threshold?
            });

            if (!exists) {
                const notif = await Notification.create({
                    user: userId,
                    type: 'budget_alert',
                    title: alertTitle,
                    message: alertMessage,
                    data: { category: categoryName, threshold: alertType, percentage }
                });

                if (io) {
                    io.to(`user:${userId}`).emit('new_notification', notif);
                }
            }
        }
    } catch (e) {
        console.error('[BUDGET_ALERT] Error:', e.message);
    }
};

/**
 * Helper: No-Spend Challenge Tracker
 * Runs in background after an expense is created
 */
const triggerNoSpendChallenge = async (userId, txDateStr, io) => {
    try {
        const txDate = new Date(txDateStr);
        const dayStart = new Date(txDate.getFullYear(), txDate.getMonth(), txDate.getDate());
        
        // Find active no-spend challenges
        const challenges = await Challenge.find({
            type: 'no-spend',
            status: 'active',
            $or: [
                { user: userId },
                { "participants.user": userId, "participants.status": 'accepted' }
            ]
        });

        for (const challenge of challenges) {
            const isOwner = challenge.user.toString() === userId.toString();
            let changed = false;

            if (isOwner) {
                const fails = challenge.progressData?.failedDates || [];
                // Check if this date is already logged
                const alreadyLogged = fails.some(d => {
                    const fd = new Date(d);
                    return fd.getFullYear() === dayStart.getFullYear() &&
                           fd.getMonth() === dayStart.getMonth() &&
                           fd.getDate() === dayStart.getDate();
                });

                if (!alreadyLogged) {
                    fails.push(dayStart.toISOString());
                    challenge.progressData = { ...challenge.progressData, failedDates: fails };
                    changed = true;
                }
            } else {
                const pIndex = challenge.participants.findIndex(p => p.user.toString() === userId.toString());
                if (pIndex !== -1) {
                    const pData = challenge.participants[pIndex].progressData || { failedDates: [] };
                    const fails = pData.failedDates || [];
                    const alreadyLogged = fails.some(d => {
                        const fd = new Date(d);
                        return fd.getFullYear() === dayStart.getFullYear() &&
                               fd.getMonth() === dayStart.getMonth() &&
                               fd.getDate() === dayStart.getDate();
                    });

                    if (!alreadyLogged) {
                        fails.push(dayStart.toISOString());
                        challenge.participants[pIndex].progressData = { ...pData, failedDates: fails };
                        changed = true;
                    }
                }
            }

            if (changed) {
                // Remove required participant check from save
                await challenge.save();
                
                await challenge.populate('user', 'name otterTag avatarUrl');
                await challenge.populate('participants.user', 'name otterTag avatarUrl');
                
                if (io) {
                    io.to(`user:${challenge.user._id}`).emit('update_challenge', challenge);
                    challenge.participants.forEach(p => {
                        io.to(`user:${p.user._id}`).emit('update_challenge', challenge);
                    });
                }
            }
        }
    } catch (e) {
        console.error('[CHALLENGE_TRACKER] Error:', e.message);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  PATCH /api/transactions/:id/archive
//  Toggle isArchived status
// ─────────────────────────────────────────────────────────────────────────────
const archiveTransaction = async (req, res) => {
    try {
        const transaction = await Transaction.findById(req.params.id);
        if (!transaction) return res.status(404).json({ error: 'Transaction not found.' });

        // ── Block Debt Transaction Archiving ──
        if (transaction.relatedType === 'Debt') {
            return res.status(400).json({ error: 'Debt-related transactions cannot be archived. They must remain in your main history for balance integrity.' });
        }

        // Authorization check: User must be owner OR participant in linked Goal/Debt
        let isAuthorized = transaction.user.toString() === req.userId;

        if (!isAuthorized && transaction.relatedType === 'SavingsGoal' && transaction.relatedId) {
            const goal = await SavingsGoal.findOne({
                _id: transaction.relatedId,
                $or: [
                    { user: req.userId },
                    { "participants.user": req.userId, "participants.status": "accepted" }
                ]
            });
            if (goal) isAuthorized = true;
        }

        if (!isAuthorized && transaction.relatedType === 'Debt' && transaction.relatedId) {
            const debt = await Debt.findOne({
                _id: transaction.relatedId,
                $or: [{ user: req.userId }, { linkedUserId: req.userId }]
            });
            if (debt) isAuthorized = true;
        }

        if (!isAuthorized) return res.status(403).json({ error: 'Access denied.' });

        transaction.isArchived = !transaction.isArchived;
        await transaction.save();

        invalidatePrefixes('transaction');
        invalidatePrefixes('savings');

        const io = req.app.get('io');
        if (io) {
            io.to(`user:${req.userId}`).emit('transaction_archived', { 
                _id: transaction._id, 
                isArchived: transaction.isArchived 
            });
            // If user is not the creator, also notify the creator
            if (transaction.user.toString() !== req.userId) {
                io.to(`user:${transaction.user}`).emit('transaction_archived', { 
                    _id: transaction._id, 
                    isArchived: transaction.isArchived 
                });
            }
        }

        res.json({ message: transaction.isArchived ? 'Archived' : 'Restored', isArchived: transaction.isArchived });
    } catch (err) {
        console.error('[TRANSACTION] archiveTransaction error:', err.message);
        res.status(500).json({ error: 'Failed to archive transaction.' });
    }
};


// ─────────────────────────────────────────────────────────────────────────────
//  DELETE /api/transactions/archive/empty
//  Delete all archived transactions permanently
// ─────────────────────────────────────────────────────────────────────────────
const emptyArchives = async (req, res) => {
    try {
        // Find all archived transactions to be deleted
        const archivedTxs = await Transaction.find({ 
            user: req.userId, 
            isArchived: true,
            relatedType: { $ne: 'Debt' } 
        });

        const txIds = archivedTxs.map(t => t._id);

        // Delete related logs first
        await Promise.all([
            SavingsTransfer.deleteMany({ relatedTransaction: { $in: txIds } }),
            DebtPayment.deleteMany({ transactionId: { $in: txIds } })
        ]);

        // Delete the transactions
        await Transaction.deleteMany({ _id: { $in: txIds } });

        invalidatePrefixes('transaction');
        invalidatePrefixes('savings');

        res.json({ message: 'Archives emptied successfully.' });
    } catch (err) {
        console.error('[TRANSACTION] emptyArchives error:', err.message);
        res.status(500).json({ error: 'Failed to empty archives.' });
    }
};

module.exports = { 
    getTransactions, 
    getSummary, 
    createTransaction, 
    updateTransaction, 
    deleteTransaction, 
    getAnalytics,
    archiveTransaction,
    emptyArchives
};
