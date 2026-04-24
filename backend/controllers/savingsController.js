const SavingsGoal = require('../models/savingsGoalModel');
const SavingsTransfer = require('../models/savingsTransferModel');
const Transaction = require('../models/transactionModel');
const Notification = require('../models/Notification');
const Wallet = require('../models/walletModel');
const { invalidatePrefixes } = require('../utils/cache');
const mongoose = require('mongoose');

// GET /api/savings/goals
const getGoals = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const allUserGoals = await SavingsGoal.find({ user: req.userId }).sort({ createdAt: -1 });

        // Ensure master pot exists logic
        let masterPot = allUserGoals.find(g => g.name === 'Savings Balance');
        if (!masterPot) {
            masterPot = await SavingsGoal.create({
                user: req.userId,
                name: 'Savings Balance',
                targetAmount: 0,
                currentAmount: 0,
                icon: 'piggy-bank-outline',
                family: 'MaterialCommunityIcons',
                color: '#E91E8C',
                isCompleted: false
            });
            allUserGoals.unshift(masterPot); // add to top
        } else if (masterPot.icon !== 'piggy-bank-outline' || masterPot.family !== 'MaterialCommunityIcons' || masterPot.isCompleted) {
            masterPot.icon = 'piggy-bank-outline';
            masterPot.family = 'MaterialCommunityIcons';
            masterPot.isCompleted = false;
            await masterPot.save();
        }

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
        const goal = await SavingsGoal.findOne({ _id: req.params.id, user: req.userId });
        if (!goal) return res.status(404).json({ error: 'Goal not found.' });

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
                runningBalance: 0
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
        }).catch(() => {});

        res.json(goal);
    } catch (err) {
        console.error('[CompleteGoal Error]:', err);
        res.status(500).json({ error: 'Failed to complete goal.' });
    }
};

// POST /api/savings/goals
const createGoal = async (req, res) => {
    try {
        const { name, icon, color, targetAmount, deadline, note } = req.body;
        if (!name || !targetAmount) return res.status(400).json({ error: 'name and targetAmount are required.' });

        const goal = await SavingsGoal.create({
            user: req.userId,
            name, icon, color, targetAmount,
            deadline: deadline || null,
            note: note || '',
        });

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
        if (!goal) return res.status(404).json({ error: 'Goal not found.' });

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
                runningBalance: masterPot.currentAmount
            });

            if (io) {
                io.to(`user:${req.userId}`).emit('update_savings_goal', masterPot);
                io.to(`user:${req.userId}`).emit('new_savings_transfer', refundLog);
            }
        }

        await goal.deleteOne();
        
        invalidatePrefixes('savings');

        // Emit real-time event
        if (io) {
            io.to(`user:${req.userId}`).emit('delete_savings_goal', { _id: goal._id });
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

        const goal = await SavingsGoal.findOne({ _id: goalId, user: req.userId });
        if (!goal) return res.status(404).json({ error: 'Savings goal not found.' });

        const amt = parseFloat(amount);
        if (isNaN(amt) || amt <= 0) return res.status(400).json({ error: 'Invalid amount.' });

        const io = req.app.get('io');

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
            } else {
                // Deduct from Hand Money
                const balanceAgg = await Transaction.aggregate([
                    { $match: { user: new mongoose.Types.ObjectId(req.userId), wallet: null } },
                    { $group: { _id: '$type', total: { $sum: '$amount' } } },
                ]);
                balanceAgg.forEach(r => {
                    if (r._id === 'income') currentHandBalance += r.total;
                    if (r._id === 'expense') currentHandBalance -= r.total;
                });
                if (amt > currentHandBalance) return res.status(400).json({ error: `Insufficient balance (₱${currentHandBalance.toFixed(2)})` });
            }

            goal.currentAmount += amt;

            // 2. Create Ledger Transaction (Expense: Savings)
            const ledgerTx = await Transaction.create({
                user: req.userId, 
                type: 'expense', 
                amount: amt, 
                category: 'Savings',
                categoryIcon: goal.icon, 
                categoryColor: goal.color, 
                description: `To Savings: ${goal.name}`, 
                note: note || '', 
                date: new Date(),
                runningBalance: walletId ? currentHandBalance : (currentHandBalance - amt),
                wallet: walletId,
                walletAmount: req.body.nativeAmount || null,
                walletCurrency: req.body.nativeCurrency || null
            });

            if (io) {
                io.to(`user:${req.userId}`).emit('new_transaction', ledgerTx);
                if (!walletId) {
                    io.to(`user:${req.userId}`).emit('wallet_updated', { _id: 'main', balance: currentHandBalance - amt });
                }
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
                // Calculate current total balance for running balance snapshot
                const balanceAgg = await Transaction.aggregate([
                    { $match: { user: new mongoose.Types.ObjectId(req.userId), wallet: null } },
                    { $group: { _id: '$type', total: { $sum: '$amount' } } },
                ]);
                balanceAgg.forEach(r => {
                    if (r._id === 'income') currentHandBalance += r.total;
                    if (r._id === 'expense') currentHandBalance -= r.total;
                });
            }

            goal.currentAmount -= amt;
            // Record as income in main ledger
            const ledgerTx = await Transaction.create({
                user: req.userId, type: 'income', amount: amt, category: 'Savings',
                categoryIcon: goal.icon, categoryColor: goal.color, description: `From Savings: ${goal.name}`, 
                note: note || '', 
                date: new Date(),
                runningBalance: walletId ? currentHandBalance : (currentHandBalance + amt),
                wallet: walletId,
                walletAmount: req.body.nativeAmount || null,
                walletCurrency: req.body.nativeCurrency || null
            });
            if (io) {
                io.to(`user:${req.userId}`).emit('new_transaction', ledgerTx);
                if (!walletId) {
                    io.to(`user:${req.userId}`).emit('wallet_updated', { _id: 'main', balance: currentHandBalance + amt });
                }
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
            const ledgerTx = await Transaction.create({
                user: req.userId, type: 'income', amount: amt, category: 'Savings Interest',
                categoryIcon: 'trending-up', categoryColor: '#8b5cf6', description: `Savings Interest: ${goal.name}`, note, date: new Date(),
                runningBalance: mainIncBalance + amt
            });
            if (io) io.to(`user:${req.userId}`).emit('new_transaction', ledgerTx);

        } else if (direction === 'transfer_goal') {
            if (!sourceGoalId) return res.status(400).json({ error: 'sourceGoalId required for goal transfer.' });
            const sourceGoal = await SavingsGoal.findOne({ _id: sourceGoalId, user: req.userId });
            if (!sourceGoal) return res.status(404).json({ error: 'Source goal not found.' });
            if (amt > sourceGoal.currentAmount) return res.status(400).json({ error: 'Insufficient funds in source goal.' });

            sourceGoal.currentAmount -= amt;
            await sourceGoal.save();

            goal.currentAmount += amt;
            if (io) io.to(`user:${req.userId}`).emit('update_savings_goal', sourceGoal);

        } else {
            return res.status(400).json({ error: 'Invalid direction.' });
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
                    runningBalance: sourceGoal.currentAmount
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
                runningBalance: goal.currentAmount
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
                walletCurrency: req.body.nativeCurrency || null
            });
        }

        if (io) {
            io.to(`user:${req.userId}`).emit('new_savings_transfer', transferRecord);
            io.to(`user:${req.userId}`).emit('update_savings_goal', goal);
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
                }).catch(() => {});
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
        const { goalId, limit = 30, page = 1, type } = req.query;
        const filter = { user: req.userId };
        if (goalId) filter.goal = goalId;

        if (type === 'in') {
            filter.direction = { $in: ['to_savings', 'income', 'transfer_goal'] };
        } else if (type === 'out') {
            filter.direction = { $in: ['from_savings', 'withdrawal', 'spent_from_savings'] };
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [transfers, total] = await Promise.all([
            SavingsTransfer.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).populate('wallet').lean(),
            SavingsTransfer.countDocuments(filter),
        ]);
        res.json({ transfers, total });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch transfer history.' });
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
                // Proportional distribution
                let share = (r.needed / totalNeeded) * available;
                // Round to 2 decimal places
                share = Math.floor(share * 100) / 100;
                
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

module.exports = { getGoals, createGoal, updateGoal, deleteGoal, transfer, getTransfers, completeGoal, bulkAction };
