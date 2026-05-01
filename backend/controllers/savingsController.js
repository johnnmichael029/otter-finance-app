const SavingsGoal = require('../models/savingsGoalModel');
const SavingsTransfer = require('../models/savingsTransferModel');
const Transaction = require('../models/transactionModel');
const Notification = require('../models/Notification');
const Wallet = require('../models/walletModel');
const User = require('../models/userModel');
const { invalidatePrefixes } = require('../utils/cache');
const mongoose = require('mongoose');
const { sendPushNotification } = require('../utils/pushNotification');
const { encrypt } = require('../utils/encryption');

// GET /api/savings/goals
const getGoals = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const isArchivedParam = req.query.isArchived === 'true';

        // 1. Always ensure Master Pot exists and get it
        let masterPot = await SavingsGoal.findOne({
            user: req.userId,
            name: 'Savings Balance'
        });

        if (!masterPot) {
            masterPot = await SavingsGoal.create({
                user: req.userId,
                name: 'Savings Balance',
                targetAmount: 0,
                currentAmount: 0,
                icon: 'piggy-bank-outline',
                family: 'MaterialCommunityIcons',
                color: '#E91E8C',
                isCompleted: false,
                isArchived: false
            });
        } else {
            // Self-healing for master pot
            if (masterPot.icon !== 'piggy-bank-outline' || masterPot.family !== 'MaterialCommunityIcons' || masterPot.isArchived) {
                masterPot.icon = 'piggy-bank-outline';
                masterPot.family = 'MaterialCommunityIcons';
                masterPot.isArchived = false;
                await masterPot.save();
            }
        }

        // 2. Fetch the filtered goals
        const query = {
            $and: [
                { $or: [{ user: req.userId }, { "participants.user": req.userId }] },
                { name: { $ne: 'Savings Balance' } }, // Exclude master pot from main list to avoid duplication
                { isArchived: isArchivedParam ? true : { $ne: true } }
            ]
        };

        const otherGoals = await SavingsGoal.find(query)
            .sort({ createdAt: -1 })
            .populate('user', 'name otterTag avatarUrl')
            .populate('participants.user', 'name otterTag avatarUrl');

        // 3. Combine for results
        // Master Pot only appears in the non-archived view
        const allUserGoals = isArchivedParam ? otherGoals : [masterPot, ...otherGoals];

        const totalSaved = allUserGoals
            .filter(g => !g.isCompleted)
            .reduce((sum, g) => sum + g.currentAmount, 0);

        // Slice for pagination
        const paginatedGoals = allUserGoals.slice(skip, skip + limit);

        res.json({
            goals: paginatedGoals,
            totalSaved,
            totalCount: allUserGoals.length,
            hasMore: skip + limit < allUserGoals.length
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch savings goals.' });
    }
};

// POST /api/savings/goals/complete/:id
const completeGoal = async (req, res) => {
    try {
        const { mode } = req.body || {}; // 'spend' or 'return'
        if (!mode) return res.status(400).json({ error: 'mode (spend/return) is required.' });
        const goal = await SavingsGoal.findOne({
            _id: req.params.id,
            user: req.userId
        });
        if (!goal) return res.status(403).json({ error: 'Only the goal owner can finalize it.' });

        if (goal.isCompleted && goal.currentAmount <= 0) {
            return res.status(400).json({ error: 'Goal is already completed and finalized.' });
        }

        const amountToProcess = goal.currentAmount;
        const io = req.app.get('io');
        let transferRecord;

        if (mode === 'return') {
            // Move back to Wallet (Income in main ledger)
            // Calculate current total balance for running balance snapshot
            const balanceAgg = await Transaction.aggregate([
                { $match: { user: new mongoose.Types.ObjectId(req.userId) } },
                { $group: { _id: '$type', total: { $sum: '$amount' } } },
            ]);
            let currentBalance = 0;
            balanceAgg.forEach(r => {
                if (r._id === 'income') currentBalance += r.total;
                if (r._id === 'expense') currentBalance -= r.total;
            });

            const ledgerTx = await Transaction.create({
                user: req.userId, type: 'income', amount: amountToProcess, category: 'Savings',
                categoryIcon: goal.icon, categoryColor: goal.color, description: `Goal Returned: ${goal.name}`,
                note: 'Goal ended, funds back to wallet.', date: new Date(),
                runningBalance: currentBalance + amountToProcess
            });
            if (io) io.to(`user:${req.userId}`).emit('new_transaction', ledgerTx);

            transferRecord = await SavingsTransfer.create({
                user: req.userId, direction: 'from_savings', amount: amountToProcess,
                goal: goal._id, goalName: goal.name, note: 'Returned to wallet.',
                runningBalance: 0
            });
        } else if (mode === 'spend') {
            // Spend (Visual log only in Savings History, no double deduction in Wallet)
            transferRecord = await SavingsTransfer.create({
                user: req.userId, direction: 'spent_from_savings', amount: amountToProcess,
                goal: goal._id, goalName: goal.name, note: `Successfully utilized for ${goal.name}! 🎉`,
                runningBalance: 0,
                performedBy: req.userId
            });
        }

        goal.currentAmount = 0;
        goal.isCompleted = true;
        await goal.save();
        invalidatePrefixes('savings');
        invalidatePrefixes('transaction');

        if (io) {
            io.to(`user:${req.userId}`).emit('update_savings_goal', goal);
            io.to(`user:${req.userId}`).emit('new_savings_transfer', transferRecord);
        }

        // ── Notification ───────────────────────────────────────────
        await Notification.create({
            user: req.userId,
            type: 'savings_goal',
            title: '🎉 Goal Finalized!',
            message: `You've officially completed "${goal.name}". Great job staying disciplined!`,
            data: { goalId: goal._id }
        }).then(n => {
            if (io) io.to(`user:${req.userId}`).emit('new_notification', n);
        }).catch(() => { });

        res.json(goal);
    } catch (err) {
        console.error('[CompleteGoal Error]:', err);
        res.status(500).json({ error: 'Failed to complete goal.' });
    }
};

// POST /api/savings/goals
const createGoal = async (req, res) => {
    try {
        const { name, icon, color, targetAmount, deadline, note, participantIds } = req.body;
        if (!name || !targetAmount) return res.status(400).json({ error: 'name and targetAmount are required.' });

        const isShared = participantIds && participantIds.length > 0;
        const participants = isShared ? participantIds.map(id => ({ user: id, status: 'pending' })) : [];

        const goal = await SavingsGoal.create({
            user: req.userId,
            name, icon, color, targetAmount,
            deadline: deadline || null,
            note: note || '',
            isShared,
            participants
        });

        // ── Notifications for Participants ────────────────────────
        if (isShared) {
            const io = req.app.get('io');
            const creator = await User.findById(req.userId);

            for (const p of participants) {
                const n = await Notification.create({
                    user: p.user,
                    type: 'goal_invite',
                    title: '🤝 Shared Goal Invite',
                    message: `${creator.name} invited you to join the "${goal.name}" goal!`,
                    data: { goalId: goal._id, type: 'goal_invite' }
                });

                if (io) io.to(`user:${p.user}`).emit('new_notification', n);

                // Send Push Notification
                try {
                    const invitedUser = await User.findById(p.user).select('pushToken');
                    if (invitedUser?.pushToken) {
                        await sendPushNotification(
                            invitedUser.pushToken,
                            '🤝 Shared Goal Invite',
                            `${creator.name} invited you to join the "${goal.name}" goal!`,
                            { goalId: goal._id.toString() }
                        );
                    }
                } catch (pushErr) {
                    console.error('[SAVINGS] Push failed:', pushErr.message);
                }
            }
        }

        // Emit real-time event
        const io = req.app.get('io');
        invalidatePrefixes('savings');

        if (io) {
            io.to(`user:${req.userId}`).emit('new_savings_goal', goal);
        }

        res.status(201).json(goal);
    } catch (err) {
        res.status(500).json({ error: 'Failed to create savings goal.' });
    }
};

// PATCH /api/savings/goals/:id
const updateGoal = async (req, res) => {
    try {
        const goal = await SavingsGoal.findOneAndUpdate(
            { _id: req.params.id, user: req.userId },
            { $set: req.body },
            { returnDocument: 'after', runValidators: true }
        );
        if (!goal) return res.status(404).json({ error: 'Goal not found.' });

        // Emit real-time event
        const io = req.app.get('io');
        invalidatePrefixes('savings');

        if (io) {
            io.to(`user:${req.userId}`).emit('update_savings_goal', goal);
        }

        res.json(goal);
    } catch (err) {
        res.status(500).json({ error: 'Failed to update savings goal.' });
    }
};

// DELETE /api/savings/goals/:id
const deleteGoal = async (req, res) => {
    try {
        const goal = await SavingsGoal.findOne({ _id: req.params.id, user: req.userId });
        if (!goal) return res.status(403).json({ error: 'Only the owner can delete this goal.' });

        const io = req.app.get('io');

        // If goal has funds, transfer back to Master Pot
        if (goal.currentAmount > 0) {
            let masterPot = await SavingsGoal.findOne({ user: req.userId, name: 'Savings Balance' });

            // Safety: Create Master Pot if somehow missing
            if (!masterPot) {
                masterPot = await SavingsGoal.create({
                    user: req.userId, name: 'Savings Balance',
                    targetAmount: 0, currentAmount: 0,
                    icon: 'piggy-bank-outline', family: 'MaterialCommunityIcons', color: '#E91E8C'
                });
            }

            const refundAmt = goal.currentAmount;
            masterPot.currentAmount += refundAmt;
            await masterPot.save();

            // Log the refund
            const refundLog = await SavingsTransfer.create({
                user: req.userId,
                direction: 'transfer_goal',
                amount: refundAmt,
                goal: masterPot._id,
                goalName: masterPot.name,
                note: `Refund from deleted goal: ${goal.name}`,
                runningBalance: masterPot.currentAmount,
                performedBy: req.userId
            });

            if (io) {
                io.to(`user:${req.userId}`).emit('update_savings_goal', masterPot);
                io.to(`user:${req.userId}`).emit('new_savings_transfer', refundLog);
            }
        }

        await goal.deleteOne();

        invalidatePrefixes('savings');

        // Emit real-time event to owner and all participants
        if (io) {
            io.to(`user:${goal.user}`).emit('delete_savings_goal', { _id: goal._id });
            goal.participants.forEach(p => {
                if (p.status === 'accepted') {
                    io.to(`user:${p.user}`).emit('delete_savings_goal', { _id: goal._id });
                }
            });
        }

        res.json({ message: 'Deleted and balance refunded if any.' });
    } catch (err) {
        console.error('[DeleteGoal Error]:', err);
        res.status(500).json({ error: 'Failed to delete savings goal.' });
    }
};

// POST /api/savings/transfer
// body: { goalId, amount, direction: 'to_savings' | 'from_savings' | 'income' | 'transfer_goal', sourceGoalId, note }
const transfer = async (req, res) => {
    try {
        const { goalId, amount, direction, note, sourceGoalId, sourceWalletId } = req.body;
        if (!goalId || !amount || !direction) return res.status(400).json({ error: 'goalId, amount, and direction are required.' });
        if (direction === 'transfer_goal' && goalId === sourceGoalId) return res.status(400).json({ error: 'Cannot transfer to the same goal.' });

        const goal = await SavingsGoal.findOne({
            _id: goalId,
            $or: [
                { user: req.userId },
                { "participants.user": req.userId, "participants.status": "accepted" }
            ]
        });
        if (!goal) return res.status(404).json({ error: 'Savings goal not found or you are not a member.' });

        if (direction === 'from_savings' && goal.user.toString() !== req.userId) {
            return res.status(403).json({ error: 'Only the owner can withdraw from this goal.' });
        }

        const amt = parseFloat(amount);
        if (isNaN(amt) || amt <= 0) return res.status(400).json({ error: 'Invalid amount.' });

        const io = req.app.get('io');
        let ledgerTx;

        if (direction === 'to_savings') {
            if (goal.isCompleted) return res.status(400).json({ error: 'Goal is already completed.' });

            let walletId = sourceWalletId || null;
            let currentHandBalance = 0;
            let targetWallet = null;

            // 1. Calculate and Validate Balance
            if (walletId) {
                targetWallet = await Wallet.findOne({ _id: walletId, userId: req.userId });
                if (!targetWallet) return res.status(404).json({ error: 'Source wallet not found.' });

                const isCrypto = targetWallet.type === 'Crypto';
                const isStocks = targetWallet.type === 'Stocks';
                const isCredit = targetWallet.type === 'Credit';

                // Calculate native units needed (if crypto/stocks)
                // For simplified deposit: we use the PHP amount, and deduct matching native units
                // If it's crypto/stocks, the 'amount' from frontend is PHP, we need to know the 'walletDeductAmount' (units)
                // OR we can calculate here if we have the rate. For now, let's look for 'walletDeductAmount' in body
                const nativeAmount = (isCrypto || isStocks)
                    ? (req.body.walletDeductAmount != null ? Math.abs(parseFloat(req.body.walletDeductAmount)) : amt)
                    : amt;

                if (isCredit) {
                    // Credit wallets can 'transfer', but they increase their owed balance
                    targetWallet.balance += nativeAmount;
                } else {
                    if (targetWallet.balance < nativeAmount) {
                        return res.status(400).json({ error: `Insufficient funds in ${targetWallet.name} (${targetWallet.type}).` });
                    }
                    targetWallet.balance -= nativeAmount;
                }

                await targetWallet.save();
                if (io) io.to(`user:${req.userId}`).emit('wallet_updated', targetWallet.toObject());

                // Prepare native info for transaction
                req.body.nativeAmount = nativeAmount;
                req.body.nativeCurrency = isCrypto ? targetWallet.coinSymbol : (isStocks ? (targetWallet.stockSymbol || targetWallet.stockTicker) : null);
                const user = await User.findById(req.userId);
                currentHandBalance = user?.handBalance || 0;
                if (amt > currentHandBalance) return res.status(400).json({ error: `Insufficient balance (₱${currentHandBalance.toFixed(2)})` });
            }

            let sourceName = 'HAND';
            if (walletId) {
                const sWallet = await Wallet.findById(walletId);
                sourceName = sWallet ? sWallet.name : 'Wallet';
            }

            goal.currentAmount += amt;

            // 2. Create Ledger Transaction (Expense: Savings)
            ledgerTx = await Transaction.create({
                user: req.userId,
                type: 'expense',
                amount: amt,
                category: 'Savings',
                categoryIcon: goal.icon,
                categoryColor: goal.color,
                description: `${sourceName} → ${goal.name}`,
                note: note || '',
                date: new Date(),
                runningBalance: walletId ? currentHandBalance : (currentHandBalance - amt),
                wallet: walletId,
                walletAmount: req.body.nativeAmount || null,
                walletCurrency: req.body.nativeCurrency || null,
                relatedId: goal._id,
                relatedType: 'SavingsGoal'
            });

            if (io) {
                io.to(`user:${req.userId}`).emit('new_transaction', ledgerTx);
                if (!walletId) {
                    const user = await User.findById(req.userId);
                    if (user) {
                        user.handBalance -= amt;
                        await user.save();
                        io.to(`user:${req.userId}`).emit('wallet_updated', { _id: 'main', balance: user.handBalance });
                    }
                }
                io.to(`user:${req.userId}`).emit('update_savings_goal', goal);
                io.to(`user:${req.userId}`).emit('new_savings_transfer', { goalId: goal._id });
            }

        } else if (direction === 'from_savings') {
            if (amt > goal.currentAmount) return res.status(400).json({ error: 'Insufficient savings.' });

            let walletId = sourceWalletId || null;
            let currentHandBalance = 0;
            let targetWallet = null;

            if (walletId) {
                targetWallet = await Wallet.findOne({ _id: walletId, userId: req.userId });
                if (!targetWallet) return res.status(404).json({ error: 'Destination wallet not found.' });

                const isCrypto = targetWallet.type === 'Crypto';
                const isStocks = targetWallet.type === 'Stocks';
                const isCredit = targetWallet.type === 'Credit';

                const nativeAmount = (isCrypto || isStocks)
                    ? (req.body.walletDeductAmount != null ? Math.abs(parseFloat(req.body.walletDeductAmount)) : amt)
                    : amt;

                if (isCredit) {
                    // Withdrawing to credit wallet REDUCES debt
                    targetWallet.balance = Math.max(0, targetWallet.balance - nativeAmount);
                } else {
                    targetWallet.balance += nativeAmount;
                }

                await targetWallet.save();
                if (io) io.to(`user:${req.userId}`).emit('wallet_updated', targetWallet.toObject());

                req.body.nativeAmount = nativeAmount;
                req.body.nativeCurrency = isCrypto ? targetWallet.coinSymbol : (isStocks ? (targetWallet.stockSymbol || targetWallet.stockTicker) : null);
            } else {
                const user = await User.findById(req.userId);
                currentHandBalance = user?.handBalance || 0;
            }

            let destName = 'HAND';
            if (walletId && targetWallet) destName = targetWallet.name;

            goal.currentAmount -= amt;
            // Record as income in main ledger
            ledgerTx = await Transaction.create({
                user: req.userId, type: 'income', amount: amt, category: 'Savings',
                categoryIcon: goal.icon, categoryColor: goal.color, description: `${goal.name} → ${destName}`,
                note: note || '',
                date: new Date(),
                runningBalance: walletId ? currentHandBalance : (currentHandBalance + amt),
                wallet: walletId,
                walletAmount: req.body.nativeAmount || null,
                walletCurrency: req.body.nativeCurrency || null,
                relatedId: goal._id,
                relatedType: 'SavingsGoal'
            });
            if (io) {
                io.to(`user:${req.userId}`).emit('new_transaction', ledgerTx);
                if (!walletId) {
                    const user = await User.findById(req.userId);
                    if (user) {
                        user.handBalance += amt;
                        await user.save();
                        io.to(`user:${req.userId}`).emit('wallet_updated', { _id: 'main', balance: user.handBalance });
                    }
                }
                io.to(`user:${req.userId}`).emit('update_savings_goal', goal);
                io.to(`user:${req.userId}`).emit('new_savings_transfer', { goalId: goal._id });
            }

        } else if (direction === 'income') {
            // Direct Savings Income (Interest/Gift)
            // Calculate current total balance for running balance snapshot
            const balanceAgg = await Transaction.aggregate([
                { $match: { user: new mongoose.Types.ObjectId(req.userId) } },
                { $group: { _id: '$type', total: { $sum: '$amount' } } },
            ]);
            let mainIncBalance = 0;
            balanceAgg.forEach(r => {
                if (r._id === 'income') mainIncBalance += r.total;
                if (r._id === 'expense') mainIncBalance -= r.total;
            });

            goal.currentAmount += amt;
            ledgerTx = await Transaction.create({
                user: req.userId,
                type: 'income',
                amount: amt,
                category: 'Savings Interest',
                categoryIcon: 'trending-up', categoryColor: '#8b5cf6', description: `Savings Interest: ${goal.name}`, note, date: new Date(),
                runningBalance: mainIncBalance + amt,
                relatedId: goal._id,
                relatedType: 'SavingsGoal'
            });
            if (io) {
                io.to(`user:${req.userId}`).emit('new_transaction', ledgerTx);
                io.to(`user:${req.userId}`).emit('update_savings_goal', goal);
                io.to(`user:${req.userId}`).emit('new_savings_transfer', { goalId: goal._id });
            }

        } else if (direction === 'transfer_goal') {
            if (!sourceGoalId) return res.status(400).json({ error: 'sourceGoalId required for goal transfer.' });
            const sourceGoal = await SavingsGoal.findOne({ _id: sourceGoalId, user: req.userId });
            if (!sourceGoal) return res.status(404).json({ error: 'Source goal not found.' });
            if (amt > sourceGoal.currentAmount) return res.status(400).json({ error: 'Insufficient funds in source goal.' });

            sourceGoal.currentAmount -= amt;
            await sourceGoal.save();

            goal.currentAmount += amt;

            // 2. Create Ledger Transaction for History/Revert Support
            ledgerTx = await Transaction.create({
                user: req.userId,
                type: 'transfer',
                amount: amt,
                category: 'Savings Transfer',
                categoryIcon: 'repeat',
                categoryColor: '#8b5cf6',
                description: `Goal Transfer: ${sourceGoal.name} → ${goal.name}`,
                note: note || '',
                date: new Date(),
                runningBalance: 0,
                relatedId: goal._id,
                relatedType: 'SavingsGoal',
                sourceRelatedId: sourceGoal._id,
                sourceRelatedType: 'SavingsGoal'
            });

            if (io) {
                const recipients = new Set();
                recipients.add(req.userId.toString());

                // Add owners and participants of both goals
                if (goal.user) recipients.add(goal.user.toString());
                if (sourceGoal.user) recipients.add(sourceGoal.user.toString());

                goal.participants?.forEach(p => { if (p.status === 'accepted') recipients.add(p.user.toString()); });
                sourceGoal.participants?.forEach(p => { if (p.status === 'accepted') recipients.add(p.user.toString()); });

                recipients.forEach(userId => {
                    io.to(`user:${userId}`).emit('update_savings_goal', goal);
                    io.to(`user:${userId}`).emit('update_savings_goal', sourceGoal);
                    io.to(`user:${userId}`).emit('new_transaction', ledgerTx);
                });
            }

        } else {
            return res.status(400).json({ error: 'Invalid direction.' });
        }

        // --- FEE HANDLING ---
        const feeAmt = req.body.fee ? parseFloat(req.body.fee) : 0;
        const feeSourceWalletId = req.body.feeSourceWalletId || null;
        if (feeAmt > 0) {
            const feeDescription = `Transfer Fee (${direction.replace(/_/g, ' ')}: ${goal.name})`;
            if (feeSourceWalletId) {
                // Deduct fee from source wallet
                const feeWallet = await Wallet.findOne({ _id: feeSourceWalletId, userId: req.userId });
                if (feeWallet) {
                    feeWallet.balance = Math.max(0, feeWallet.balance - feeAmt);
                    await feeWallet.save();
                    const feeTx = await Transaction.create({
                        user: req.userId, type: 'expense', amount: feeAmt,
                        category: 'Bank Fee', categoryIcon: 'percent', categoryColor: '#ef4444',
                        description: feeDescription,
                        note: req.body.feeNote ? encrypt(req.body.feeNote) : undefined,
                        date: new Date(),
                        runningBalance: feeWallet.balance, wallet: feeWallet._id
                    });
                    if (io) {
                        io.to(`user:${req.userId}`).emit('new_transaction', feeTx);
                        io.to(`user:${req.userId}`).emit('wallet_updated', feeWallet.toObject());
                    }
                }
            } else {
                // Deduct fee from HAND
                const feeUser = await User.findById(req.userId);
                if (feeUser) {
                    feeUser.handBalance = Math.max(0, (feeUser.handBalance || 0) - feeAmt);
                    await feeUser.save();
                    const feeTx = await Transaction.create({
                        user: req.userId, type: 'expense', amount: feeAmt,
                        category: 'Bank Fee', categoryIcon: 'percent', categoryColor: '#ef4444',
                        description: feeDescription,
                        note: req.body.feeNote ? encrypt(req.body.feeNote) : undefined,
                        date: new Date(),
                        runningBalance: feeUser.handBalance
                    });
                    if (io) {
                        io.to(`user:${req.userId}`).emit('new_transaction', feeTx);
                        io.to(`user:${req.userId}`).emit('wallet_updated', { _id: 'main', balance: feeUser.handBalance });
                    }
                }
            }
        }

        await goal.save();

        invalidatePrefixes('savings');
        invalidatePrefixes('transaction');

        let transferRecord;
        if (direction === 'transfer_goal') {
            const sourceGoal = await SavingsGoal.findById(sourceGoalId);

            // Only log withdrawal for source if it's NOT the Master Pot (keeps Master Pot history clean for wallet moves only)
            if (sourceGoal && sourceGoal.targetAmount > 0) {
                await SavingsTransfer.create({
                    user: req.userId,
                    direction: 'from_savings',
                    amount: amt,
                    goal: sourceGoalId,
                    goalName: sourceGoal?.name || 'Source Goal',
                    note: note || `Transfer to ${goal.name}`,
                    runningBalance: sourceGoal.currentAmount,
                    relatedTransaction: ledgerTx._id,
                    performedBy: req.userId
                });
            }

            // Target Goal Record (Deposit)
            transferRecord = await SavingsTransfer.create({
                user: req.userId,
                direction: 'transfer_goal',
                amount: amt,
                goal: goal._id,
                goalName: goal.name,
                note: note || `Transfer from ${sourceGoal?.name || 'Savings'}`,
                runningBalance: goal.currentAmount,
                relatedTransaction: ledgerTx._id,
                performedBy: req.userId
            });
        } else {
            transferRecord = await SavingsTransfer.create({
                user: req.userId,
                direction,
                amount: amt,
                goal: goal._id,
                goalName: goal.name,
                note: note || '',
                runningBalance: goal.currentAmount,
                wallet: sourceWalletId || null,
                walletAmount: req.body.nativeAmount || null,
                walletCurrency: req.body.nativeCurrency || null,
                relatedTransaction: ledgerTx._id,
                performedBy: req.userId
            });
        }

        if (io) {
            // Final sync for creator and participants
            io.to(`user:${goal.user}`).emit('update_savings_goal', goal);
            io.to(`user:${goal.user}`).emit('new_savings_transfer', transferRecord);

            goal.participants?.forEach(p => {
                if (p.status === 'accepted') {
                    io.to(`user:${p.user}`).emit('update_savings_goal', goal);
                    io.to(`user:${p.user}`).emit('new_savings_transfer', transferRecord);
                }
            });
        }

        // ── Feature #7: Goal Reached Alert ────────────────────────
        if (goal.targetAmount > 0 && goal.currentAmount >= goal.targetAmount && !goal.isCompleted) {
            // Check if alert already sent for this goal
            const exists = await Notification.findOne({
                user: req.userId,
                type: 'savings_goal',
                'data.goalId': goal._id,
                'data.type': 'target_reached'
            });

            if (!exists) {
                await Notification.create({
                    user: req.userId,
                    type: 'savings_goal',
                    title: '🎯 Target Reached!',
                    message: `Congratulations! You've reached your target for "${goal.name}".`,
                    data: { goalId: goal._id, type: 'target_reached' }
                }).then(n => {
                    if (io) io.to(`user:${req.userId}`).emit('new_notification', n);
                }).catch(() => { });
            }
        }

        res.json({ goal, transfer: transferRecord });
    } catch (err) {
        console.error('[SavingsTransfer Error]:', err);
        res.status(500).json({ error: 'Transfer failed.' });
    }
};

// GET /api/savings/transfers
const getTransfers = async (req, res) => {
    try {
        const { goalId, limit = 30, page = 1, type, isArchived } = req.query;
        let filter = { isArchived: isArchived === 'true' ? true : { $ne: true } };

        if (goalId) {
            // Find goal first to check if user has access
            const goal = await SavingsGoal.findOne({
                _id: goalId,
                $or: [
                    { user: req.userId },
                    { "participants.user": req.userId, "participants.status": "accepted" }
                ]
            });
            if (!goal) return res.status(403).json({ error: 'Access denied.' });
            filter.goal = goalId;
        } else {
            // For global transfers, show what user performed OR transfers related to goals they own/participate in
            const accessibleGoals = await SavingsGoal.find({
                $or: [
                    { user: req.userId },
                    { "participants.user": req.userId, "participants.status": "accepted" }
                ]
            }).select('_id');
            const goalIds = accessibleGoals.map(g => g._id);

            filter.$or = [
                { user: req.userId },
                { goal: { $in: goalIds } }
            ];
        }

        if (type === 'in') {
            filter.direction = { $in: ['to_savings', 'income', 'transfer_goal'] };
        } else if (type === 'out') {
            filter.direction = { $in: ['from_savings', 'withdrawal', 'spent_from_savings'] };
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [transfers, total] = await Promise.all([
            SavingsTransfer.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .populate('wallet')
                .populate('relatedTransaction')
                .populate('performedBy', 'name avatarUrl')
                .lean(),
            SavingsTransfer.countDocuments(filter),
        ]);
        res.json({ transfers, total });
    } catch (err) {
        console.error('[GetTransfers Error]:', err);
        res.status(500).json({ error: 'Failed to fetch transfer history.' });
    }
};


// PATCH /api/savings/transfers/:id/archive
const archiveTransfer = async (req, res) => {
    try {
        const transfer = await SavingsTransfer.findById(req.params.id);
        if (!transfer) return res.status(404).json({ error: 'Transfer not found.' });

        // Check if user has access to the goal associated with this transfer
        const goal = await SavingsGoal.findOne({
            _id: transfer.goal,
            $or: [
                { user: req.userId },
                { "participants.user": req.userId, "participants.status": "accepted" }
            ]
        });

        if (!goal && transfer.user.toString() !== req.userId) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        transfer.isArchived = !transfer.isArchived;
        await transfer.save();

        const io = req.app.get('io');
        if (io) {
            io.to(`user:${req.userId}`).emit(transfer.isArchived ? 'delete_savings_transfer' : 'new_savings_transfer', transfer);
        }

        res.json(transfer);
    } catch (err) {
        console.error('[ArchiveTransfer Error]:', err);
        res.status(500).json({ error: 'Failed to toggle archive status.' });
    }
};

// DELETE /api/savings/transfers/:id
const deleteTransfer = async (req, res) => {
    try {
        const transfer = await SavingsTransfer.findById(req.params.id);
        if (!transfer) return res.status(404).json({ error: 'Transfer not found.' });

        // Check if user has access to the goal associated with this transfer
        const goal = await SavingsGoal.findOne({
            _id: transfer.goal,
            $or: [
                { user: req.userId },
                { "participants.user": req.userId, "participants.status": "accepted" }
            ]
        });

        if (!goal && transfer.user.toString() !== req.userId) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        await transfer.deleteOne();

        const io = req.app.get('io');
        if (io) {
            io.to(`user:${req.userId}`).emit('delete_savings_transfer', { _id: transfer._id });
        }

        res.json({ message: 'Transfer deleted successfully.' });
    } catch (err) {
        console.error('[DeleteTransfer Error]:', err);
        res.status(500).json({ error: 'Failed to delete transfer.' });
    }
};



// DELETE /api/savings/transfers/archive/empty
const emptyTransfersArchives = async (req, res) => {
    try {
        const result = await SavingsTransfer.deleteMany({ user: req.userId, isArchived: true });

        // Let frontend know to refresh list
        const io = req.app.get('io');
        if (io) io.to(`user:${req.userId}`).emit('update_savings_goal', {});

        res.json({ message: 'Archives emptied successfully.', count: result.deletedCount });
    } catch (err) {
        console.error('[EmptyArchives Error]:', err);
        res.status(500).json({ error: 'Failed to empty archives.' });
    }
};

// POST /api/savings/bulk-action
const bulkAction = async (req, res) => {
    try {
        const { action } = req.body; // 'sweep' or 'distribute'
        const goals = await SavingsGoal.find({ user: req.userId, isCompleted: false });
        let masterPot = goals.find(g => g.name === 'Savings Balance');

        if (!masterPot) {
            masterPot = await SavingsGoal.create({
                user: req.userId, name: 'Savings Balance',
                targetAmount: 0, currentAmount: 0,
                icon: 'piggy-bank-outline', family: 'MaterialCommunityIcons', color: '#E91E8C'
            });
        }

        const otherGoals = goals.filter(g => g._id.toString() !== masterPot._id.toString());
        const io = req.app.get('io');
        const transfers = [];

        if (action === 'sweep') {
            let totalToSweep = 0;
            for (const g of otherGoals) {
                if (g.currentAmount > 0) {
                    const amt = g.currentAmount;
                    totalToSweep += amt;
                    g.currentAmount = 0;
                    await g.save();

                    // Log for goal
                    const t = await SavingsTransfer.create({
                        user: req.userId, direction: 'from_savings', amount: amt,
                        goal: g._id, goalName: g.name, note: 'Bulk Action', runningBalance: 0
                    });
                    transfers.push(t);
                    if (io) io.to(`user:${req.userId}`).emit('update_savings_goal', g);
                }
            }

            if (totalToSweep > 0) {
                masterPot.currentAmount += totalToSweep;
                await masterPot.save();

                // Log for master
                const t = await SavingsTransfer.create({
                    user: req.userId, direction: 'transfer_goal', amount: totalToSweep,
                    goal: masterPot._id, goalName: masterPot.name, note: 'Bulk Action',
                    runningBalance: masterPot.currentAmount
                });
                transfers.push(t);
                if (io) io.to(`user:${req.userId}`).emit('update_savings_goal', masterPot);
            }

        } else if (action === 'distribute') {
            const available = masterPot.currentAmount;
            if (available <= 0) return res.status(400).json({ error: 'No funds in Savings Balance to distribute.' });

            const remainingTargets = otherGoals.map(g => ({
                goal: g,
                needed: Math.max(0, g.targetAmount - g.currentAmount)
            })).filter(r => r.needed > 0);

            if (remainingTargets.length === 0) return res.status(400).json({ error: 'All goals are already reached!' });

            const totalNeeded = remainingTargets.reduce((sum, r) => sum + r.needed, 0);
            let totalDistributed = 0;

            for (const r of remainingTargets) {
                let share = 0;
                if (available >= totalNeeded) {
                    // Full coverage: Each goal gets exactly what it needs
                    share = r.needed;
                } else {
                    // Limited funds: Proportional distribution
                    share = (r.needed / totalNeeded) * available;
                    // Round down to 2 decimal places to be safe
                    share = Math.floor(share * 100) / 100;
                }

                if (share > 0) {
                    r.goal.currentAmount += share;
                    totalDistributed += share;
                    await r.goal.save();

                    // Log for goal
                    const t = await SavingsTransfer.create({
                        user: req.userId, direction: 'transfer_goal', amount: share,
                        goal: r.goal._id, goalName: r.goal.name, note: 'Bulk Action',
                        runningBalance: r.goal.currentAmount
                    });
                    transfers.push(t);
                    if (io) io.to(`user:${req.userId}`).emit('update_savings_goal', r.goal);
                }
            }

            if (totalDistributed > 0) {
                masterPot.currentAmount -= totalDistributed;
                await masterPot.save();

                // Log for master
                const t = await SavingsTransfer.create({
                    user: req.userId, direction: 'from_savings', amount: totalDistributed,
                    goal: masterPot._id, goalName: masterPot.name, note: 'Bulk Action',
                    runningBalance: masterPot.currentAmount
                });
                transfers.push(t);
                if (io) io.to(`user:${req.userId}`).emit('update_savings_goal', masterPot);
            }
        } else {
            return res.status(400).json({ error: 'Invalid bulk action.' });
        }

        invalidatePrefixes('savings');
        if (io && transfers.length > 0) {
            // Emitting only the last one to trigger a refresh in UI if not using real-time for all
            io.to(`user:${req.userId}`).emit('new_savings_transfer', transfers[transfers.length - 1]);
        }

        res.json({ message: 'Bulk action completed.', transfersCount: transfers.length });
    } catch (err) {
        console.error('[BulkAction Error]:', err);
        res.status(500).json({ error: 'Bulk action failed.' });
    }
};

// POST /api/savings/goals/respond/:id
const respondToGoalInvite = async (req, res) => {
    try {
        const { status } = req.body; // 'accepted' or 'rejected'
        if (!['accepted', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });

        const goal = await SavingsGoal.findOne({
            _id: req.params.id,
            "participants.user": req.userId
        });
        if (!goal) return res.status(404).json({ error: 'Invite not found.' });

        const participantIdx = goal.participants.findIndex(p => p.user.toString() === req.userId);
        goal.participants[participantIdx].status = status;
        if (status === 'accepted') {
            goal.participants[participantIdx].joinedAt = new Date();
        }

        await goal.save();

        // ── Notification Update for Responder ───────────────────
        const notification = await Notification.findOne({
            user: req.userId,
            'data.goalId': goal._id,
            type: 'goal_invite', // Corrected type
            'data.type': 'goal_invite'
        });
        if (notification) {
            notification.title = status === 'accepted' ? 'Goal Joined! 🤝' : 'Invite Declined';
            notification.message = status === 'accepted'
                ? `You joined "${goal.name}". Let's start saving!`
                : `You declined the invite to join "${goal.name}".`;
            notification.isRead = true; // Corrected property
            notification.data = { ...notification.data, processed: true };
            await notification.save();
            const io = req.app.get('io');
            if (io) io.to(`user:${req.userId}`).emit('notification_updated', notification);
        }

        // ── Real-time & Notifications ───────────────────────────
        const io = req.app.get('io');
        const responder = await mongoose.model('User').findById(req.userId);

        if (io) {
            // Notify owner
            io.to(`user:${goal.user}`).emit('goal_invite_responded', { goalId: goal._id, userId: req.userId, status });
            // Notify other participants? (Maybe later)
            io.to(`user:${req.userId}`).emit('update_savings_goal', goal);
        }

        // Notification for the owner
        const n = await Notification.create({
            user: goal.user,
            type: 'savings_goal',
            title: `🤝 Goal ${status === 'accepted' ? 'Accepted' : 'Declined'}`,
            message: `${responder.name} has ${status} your invite to join "${goal.name}".`,
            data: { goalId: goal._id, type: 'goal_invite_response', status }
        });

        if (io) io.to(`user:${goal.user}`).emit('new_notification', n);

        // Send Push Notification to owner
        try {
            const owner = await User.findById(goal.user).select('pushToken');
            if (owner?.pushToken) {
                await sendPushNotification(
                    owner.pushToken,
                    `🤝 Goal ${status === 'accepted' ? 'Accepted' : 'Declined'}`,
                    `${responder.name} has ${status} your invite to join "${goal.name}".`,
                    { goalId: goal._id.toString() }
                );
            }
        } catch (pushErr) {
            console.error('[SAVINGS] Response push failed:', pushErr.message);
        }

        // If rejected, maybe remove from participants entirely to clean up the user's view?
        if (status === 'rejected') {
            goal.participants.pull({ user: req.userId });
            await goal.save();
        }

        res.json({ message: `Goal invitation ${status}.`, goal });
    } catch (err) {
        console.error('[RespondToGoalInvite Error]:', err);
        res.status(500).json({ error: 'Failed to respond to invite.' });
    }
};

// DELETE /api/savings/goals/archive/empty
const emptyGoalArchives = async (req, res) => {
    try {
        const result = await SavingsGoal.deleteMany({ user: req.userId, isArchived: true });
        invalidatePrefixes('savings');
        res.json({ message: 'Goal archives emptied.', count: result.deletedCount });
    } catch (err) {
        res.status(500).json({ error: 'Failed to empty archives.' });
    }
};

module.exports = { getGoals, createGoal, updateGoal, deleteGoal, transfer, getTransfers, completeGoal, bulkAction, respondToGoalInvite, archiveTransfer, emptyTransfersArchives, deleteTransfer, emptyGoalArchives };
