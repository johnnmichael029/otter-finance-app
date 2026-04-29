const GroupWallet = require('../models/groupWalletModel');
const Notification = require('../models/Notification');
const Debt = require('../models/debtModel');
const User = require('../models/userModel');
const mongoose = require('mongoose');
const { invalidatePrefixes } = require('../utils/cache');
const { sendPushNotification } = require('../utils/pushNotification');

// ── Trip Management ───────────────────────────────────────────────────────────

// POST /api/group-wallets
const createGroupWallet = async (req, res) => {
    try {
        const { name, emoji, color, participantIds, currency } = req.body;
        if (!name) return res.status(400).json({ error: 'Name is required.' });

        const participants = (participantIds || []).map(id => ({
            user: id,
            status: 'pending'
        }));

        const group = await GroupWallet.create({
            owner: req.userId,
            name,
            emoji,
            color,
            currency: currency || 'PHP',
            participants
        });

        // Send Notifications
        const io = req.app.get('io');
        const creator = await User.findById(req.userId).select('name avatarUrl');

        for (const p of participants) {
            // Fetch participant push token
            const receiver = await User.findById(p.user).select('pushToken');

            const n = await Notification.create({
                user: p.user,
                type: 'trip_invite',
                title: '✈️ Trip Invite',
                message: `${creator.name} invited you to join "${name}"!`,
                data: {
                    groupId: group._id,
                    type: 'trip_invite',
                    senderId: req.userId,
                    senderName: creator.name,
                    senderAvatar: creator.avatarUrl
                }
            }).catch(() => null);

            if (n) {
                if (io) io.to(`user:${p.user}`).emit('new_notification', n);

                // Send Push Notification
                if (receiver?.pushToken) {
                    await sendPushNotification(
                        receiver.pushToken,
                        '✈️ Trip Invite',
                        `${creator.name} invited you to join "${name}"!`,
                        { groupId: group._id, type: 'trip_invite' }
                    );
                }
            }
        }

        invalidatePrefixes('group_wallet');
        res.status(201).json(group);
    } catch (err) {
        res.status(500).json({ error: 'Failed to create group trip.' });
    }
};

// GET /api/group-wallets
const getGroupWallets = async (req, res) => {
    try {
        const groups = await GroupWallet.find({
            $or: [
                { owner: req.userId },
                {
                    participants: {
                        $elemMatch: {
                            user: req.userId,
                            status: { $ne: 'rejected' }
                        }
                    }
                }
            ]
        })
            .populate('owner', 'name otterTag avatarUrl')
            .populate('participants.user', 'name otterTag avatarUrl')
            .sort({ updatedAt: -1 });

        res.json(groups);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch trips.' });
    }
};

// GET /api/group-wallets/:id
const getGroupWalletDetail = async (req, res) => {
    try {
        const group = await GroupWallet.findById(req.params.id)
            .populate('owner', 'name otterTag avatarUrl')
            .populate('participants.user', 'name otterTag avatarUrl')
            .populate('expenses.paidBy', 'name otterTag avatarUrl')
            .populate('expenses.splitAmong', 'name otterTag avatarUrl');

        if (!group) return res.status(404).json({ error: 'Trip not found.' });

        // Check access
        const isOwner = group.owner._id.toString() === req.userId;
        const isParticipant = group.participants.some(p =>
            p.user._id.toString() === req.userId && p.status !== 'rejected'
        );
        if (!isOwner && !isParticipant) return res.status(403).json({ error: 'Access denied.' });

        res.json(group);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch trip details.' });
    }
};

// POST /api/group-wallets/:id/respond
const respondToInvite = async (req, res) => {
    try {
        const { status } = req.body; // 'accepted' or 'rejected'
        const group = await GroupWallet.findById(req.params.id);
        if (!group) return res.status(404).json({ error: 'Trip not found.' });

        const participant = group.participants.find(p => p.user.toString() === req.userId);
        if (!participant) return res.status(404).json({ error: 'Invite not found.' });

        participant.status = status;
        if (status === 'accepted') participant.joinedAt = new Date();

        await group.save();

        const io = req.app.get('io');

        // Update the notification for the responder
        const notification = await Notification.findOne({
            user: req.userId,
            type: 'trip_invite',
            'data.groupId': group._id
        });
        if (notification) {
            notification.title = status === 'accepted' ? 'Trip Joined! ✈️' : 'Invite Declined';
            notification.message = status === 'accepted' ? 'Pack your bags! You joined the trip.' : 'You declined the invite.';
            notification.isRead = true;
            notification.data = { ...notification.data, processed: true };
            await notification.save();
            if (io) io.to(`user:${req.userId.toString()}`).emit('notification_updated', notification);
        }

        // Notify owner
        const user = await User.findById(req.userId).select('name');

        await Notification.create({
            user: group.owner,
            type: 'trip_response',
            title: status === 'accepted' ? '✅ Trip Joined' : '❌ Trip Invite Declined',
            message: `${user.name} ${status} your invite to "${group.name}".`,
            data: { groupId: group._id, type: 'trip_response' }
        }).then(n => {
            if (io) io.to(`user:${group.owner.toString()}`).emit('new_notification', n);
        }).catch(() => { });

        invalidatePrefixes('group_wallet');

        if (io) {
            io.to(`user:${group.owner}`).emit('update_group_wallet', { groupId: group._id });
        }

        res.json(group);
    } catch (err) {
        res.status(500).json({ error: 'Response failed.' });
    }
};

// ── Expense Management ────────────────────────────────────────────────────────

// POST /api/group-wallets/:id/expense
const addExpense = async (req, res) => {
    try {
        const { amount, description, category, categoryIcon, categoryColor, splitAmongIds, walletId, sourceType, walletDeductAmount } = req.body;
        const group = await GroupWallet.findById(req.params.id);
        if (!group) return res.status(404).json({ error: 'Trip not found.' });

        // Check permission
        const isOwner = group.owner.toString() === req.userId;
        const isAccepted = group.participants.some(p =>
            p.user.toString() === req.userId && p.status === 'accepted'
        );
        if (!isOwner && !isAccepted) {
            return res.status(403).json({ error: 'You must accept the invite to add expenses.' });
        }

        const amountNum = parseFloat(amount);
        const expense = {
            paidBy: req.userId,
            amount: amountNum,
            description,
            category: category || 'General',
            categoryIcon,
            categoryColor,
            date: new Date(),
            splitAmong: splitAmongIds || [] // Empty means everyone accepted
        };

        // ── Process Instant Deduction ──
        const User = mongoose.model('User');
        const Wallet = mongoose.model('Wallet');
        const SavingsGoal = mongoose.model('SavingsGoal');
        const Transaction = mongoose.model('Transaction');

        if (sourceType === 'hand') {
            const user = await User.findById(req.userId);
            user.handBalance -= amountNum;
            await user.save();
        } else if (sourceType === 'savings_balance') {
            const masterPot = await SavingsGoal.findOne({ user: req.userId, name: 'Savings Balance' });
            if (masterPot) {
                masterPot.currentAmount -= amountNum;
                await masterPot.save();
            }
        } else if (walletId) {
            const wallet = await Wallet.findOne({ _id: walletId, userId: req.userId });
            if (wallet) {
                // If walletDeductAmount is provided (e.g. from frontend conversion), use it.
                // Otherwise fallback to amountNum (PHP)
                const deductAmount = walletDeductAmount || amountNum;
                if (wallet.type === 'Credit') wallet.balance += deductAmount;
                else wallet.balance -= deductAmount;
                await wallet.save();
            }
        }

        // ── Create Transaction Log (Non-Reversible) ──
        await Transaction.create({
            user: req.userId,
            type: 'expense',
            amount: amountNum,
            description: `[Trip] ${description}`,
            category: category || 'General',
            categoryIcon: categoryIcon || 'briefcase',
            categoryColor: categoryColor || '#6366f1',
            wallet: (sourceType === 'hand' || sourceType === 'savings_balance') ? null : walletId,
            paymentSource: sourceType === 'hand' ? 'HAND' : (sourceType === 'savings_balance' ? 'Savings Balance' : null),
            isNonReversible: true,
            note: `Group Trip: ${group.name}`
        });

        group.expenses.push(expense);

        // Save to customCategories if it's a new custom category
        if (categoryIcon && category !== 'General' && category !== 'Food' && category !== 'Transport' && category !== 'Hotel' && category !== 'Attraction' && category !== 'Shopping') {
            const exists = group.customCategories.find(c => c.name.toLowerCase() === category.toLowerCase());
            if (!exists) {
                group.customCategories.push({
                    name: category,
                    icon: categoryIcon,
                    color: categoryColor || '#E91E8C'
                });
            }
        }

        await group.save();

        const io = req.app.get('io');
        if (io) {
            // Notify all accepted participants
            const activeUsers = group.participants
                .filter(p => p.status === 'accepted')
                .map(p => p.user.toString());
            activeUsers.push(group.owner.toString());

            const uniqueUsers = [...new Set(activeUsers)];
            uniqueUsers.forEach(uId => {
                io.to(`user:${uId}`).emit('update_group_wallet', { groupId: group._id });
                io.to(`user:${uId}`).emit('wallet_updated');
            });
        }

        invalidatePrefixes('group_wallet');
        invalidatePrefixes('transaction');
        res.status(201).json(group);
    } catch (err) {
        console.error('[AddExpense] Error:', err);
        res.status(500).json({ error: 'Failed to add expense.' });
    }
};

// ── Settlement Logic ──────────────────────────────────────────────────────────

// GET /api/group-wallets/:id/settle-preview
// Calculates who owes whom without creating debts
const getSettlementPreview = async (req, res) => {
    try {
        const group = await GroupWallet.findById(req.params.id);
        if (!group) return res.status(404).json({ error: 'Trip not found.' });

        // Check access
        const isOwner = group.owner.toString() === req.userId;
        const isParticipant = group.participants.some(p =>
            p.user.toString() === req.userId && p.status !== 'rejected'
        );
        if (!isOwner && !isParticipant) return res.status(403).json({ error: 'Access denied.' });

        const balances = calculateBalances(group);
        const transfers = calculateTransfers(balances);

        res.json({ balances, suggestedTransfers: transfers });
    } catch (err) {
        res.status(500).json({ error: 'Calculation failed.' });
    }
};

// Helper: Calculate net balance for each user
const calculateBalances = (group) => {
    const acceptedParticipants = group.participants
        .filter(p => p.status === 'accepted')
        .map(p => p.user.toString());

    const allMembers = [...new Set([group.owner.toString(), ...acceptedParticipants])];
    const balances = {};
    allMembers.forEach(m => balances[m] = 0);

    group.expenses.forEach(exp => {
        const amount = exp.amount;
        const payer = exp.paidBy.toString();

        // Who shares this expense?
        let beneficiaries = exp.splitAmong && exp.splitAmong.length > 0
            ? exp.splitAmong.map(b => b.toString())
            : allMembers;

        // Filter beneficiaries to only include those currently in the trip (accepted or owner)
        beneficiaries = beneficiaries.filter(b => allMembers.includes(b));

        if (beneficiaries.length === 0) return;

        const share = amount / beneficiaries.length;

        // Payer gets back what they paid
        balances[payer] += amount;

        // Everyone (including payer if in beneficiaries) pays their share
        beneficiaries.forEach(b => {
            balances[b] -= share;
        });
    });

    return balances;
};

// Helper: Greedy algorithm to minimize transfers
const calculateTransfers = (balances) => {
    const debtors = [];
    const creditors = [];

    for (const user in balances) {
        const bal = balances[user];
        if (bal < -0.01) debtors.push({ user, amount: Math.abs(bal) });
        else if (bal > 0.01) creditors.push({ user, amount: bal });
    }

    const transfers = [];
    let d = 0, c = 0;

    while (d < debtors.length && c < creditors.length) {
        const amount = Math.min(debtors[d].amount, creditors[c].amount);
        transfers.push({
            from: debtors[d].user,
            to: creditors[c].user,
            amount: Math.round(amount * 100) / 100
        });

        debtors[d].amount -= amount;
        creditors[c].amount -= amount;

        if (debtors[d].amount < 0.01) d++;
        if (creditors[c].amount < 0.01) c++;
    }

    return transfers;
};

// POST /api/group-wallets/:id/settle
const settleGroupWallet = async (req, res) => {
    try {
        const { walletId, sourceType, walletDeductAmount, note } = req.body;
        const group = await GroupWallet.findById(req.params.id);
        if (!group) return res.status(404).json({ error: 'Trip not found.' });

        // Only owner can settle
        if (group.owner.toString() !== req.userId) {
            return res.status(403).json({ error: 'Only the trip owner can settle the trip.' });
        }

        const balances = calculateBalances(group);
        const transfers = calculateTransfers(balances);

        const io = req.app.get('io');
        const DebtModel = mongoose.model('Debt');
        const UserModel = mongoose.model('User');
        const TransactionModel = mongoose.model('Transaction');
        const WalletModel = mongoose.model('Wallet');
        const SavingsGoalModel = mongoose.model('SavingsGoal');

        const settlerId = req.userId;
        let settlerPaymentProcessed = false;

        // Atomically create debts for these transfers
        for (const t of transfers) {
            const creditor = await UserModel.findById(t.to).select('name avatarUrl');
            const debtor = await UserModel.findById(t.from).select('name avatarUrl');

            const isSettlerPaying = t.from === settlerId && (walletId || sourceType);
            
            // 1. Create debt for the debtor (You owe Creditor)
            const debtData = {
                user: t.from,
                direction: 'owed_by_me',
                personName: creditor.name,
                amount: t.amount,
                description: `Settlement: ${group.name}`,
                linkedUserId: t.to,
                syncStatus: 'pending' // Default for others
            };

            // ── Feature: Instant Payment for Settler ──
            if (isSettlerPaying && !settlerPaymentProcessed) {
                // Process payment from chosen source
                const amount = t.amount;
                const user = await UserModel.findById(settlerId);

                if (sourceType === 'hand' || !walletId) {
                    user.handBalance -= amount;
                    await user.save();
                } else if (sourceType === 'savings_balance') {
                    const masterPot = await SavingsGoalModel.findOne({ user: settlerId, name: 'Savings Balance' });
                    if (masterPot) {
                        masterPot.currentAmount -= amount;
                        await masterPot.save();
                    }
                } else if (walletId) {
                    const wallet = await WalletModel.findById(walletId);
                    if (wallet) {
                        const nativeAmount = walletDeductAmount || amount;
                        if (wallet.type === 'Credit') wallet.balance += nativeAmount;
                        else wallet.balance -= nativeAmount;
                        await wallet.save();
                    }
                }

                // Create Non-Reversible Transaction
                await TransactionModel.create({
                    user: settlerId,
                    type: 'expense',
                    amount: amount,
                    category: 'Travel',
                    categoryIcon: 'briefcase',
                    categoryColor: group.color || '#6366f1',
                    description: `Settle Trip: ${group.name}`,
                    note: `Settled payment to ${creditor.name}. ${note || ''}`,
                    isNonReversible: true,
                    wallet: (sourceType === 'hand' || sourceType === 'savings_balance') ? null : walletId,
                    paymentSource: sourceType === 'hand' ? 'HAND' : (sourceType === 'savings_balance' ? 'Savings Balance' : null)
                });

                debtData.amountPaid = amount;
                debtData.status = 'settled';
                debtData.syncStatus = 'linked'; // Auto-link since paid
                settlerPaymentProcessed = true;
            }

            const debt = await DebtModel.create(debtData);

            if (io) {
                io.to(`user:${t.from}`).emit('new_debt', debt);
                io.to(`user:${t.to}`).emit('new_debt_request', debt);
                if (isSettlerPaying) {
                    io.to(`user:${settlerId}`).emit('wallet_updated');
                }
            }
        }

        group.isArchived = true;
        group.isSettled = true;
        group.archivedAt = new Date();
        await group.save();

        if (io) {
            const participants = [group.owner.toString(), ...group.participants.map(p => p.user.toString())];
            participants.forEach(uId => {
                io.to(`user:${uId}`).emit('update_group_wallet', { groupId: group._id });
            });
        }

        invalidatePrefixes('group_wallet');
        invalidatePrefixes('debt');
        invalidatePrefixes('transaction');

        res.json({ message: 'Trip settled and archived.', transfers });
    } catch (err) {
        console.error('[SETTLE] Error:', err);
        res.status(500).json({ error: 'Settlement failed.' });
    }
};

module.exports = {
    createGroupWallet,
    getGroupWallets,
    getGroupWalletDetail,
    respondToInvite,
    addExpense,
    getSettlementPreview,
    settleGroupWallet,
    updateGroupWallet: async (req, res) => {
        try {
            const { name, emoji, color, isArchived } = req.body;
            const group = await GroupWallet.findById(req.params.id);
            if (!group) return res.status(404).json({ error: 'Trip not found.' });
            if (group.owner.toString() !== req.userId) return res.status(403).json({ error: 'Only owners can edit.' });

            if (name) group.name = name;
            if (emoji) group.emoji = emoji;
            if (color) group.color = color;

            if (isArchived !== undefined) {
                // Prevent unarchiving settled trips
                if (isArchived === false && group.isSettled) {
                    return res.status(400).json({ error: 'Settled trips cannot be restored.' });
                }
                group.isArchived = isArchived;
            }

            await group.save();

            const io = req.app.get('io');
            if (io) {
                const participants = [group.owner.toString(), ...group.participants.map(p => p.user.toString())];
                participants.forEach(uId => {
                    io.to(`user:${uId}`).emit('update_group_wallet', { groupId: group._id });
                });
            }

            invalidatePrefixes('group_wallet');
            res.json(group);
        } catch (err) {
            res.status(500).json({ error: 'Update failed.' });
        }
    },
    leaveGroupWallet: async (req, res) => {
        try {
            const group = await GroupWallet.findById(req.params.id);
            if (!group) return res.status(404).json({ error: 'Trip not found.' });

            if (group.owner.toString() === req.userId) {
                return res.status(400).json({ error: 'Owners cannot leave. Please settle or delete the trip instead.' });
            }

            group.participants = group.participants.filter(p => p.user.toString() !== req.userId);
            await group.save();

            invalidatePrefixes('group_wallet');
            res.json({ message: 'Successfully left the trip.' });
        } catch (err) {
            res.status(500).json({ error: 'Failed to leave trip.' });
        }
    },
    deleteGroupWallet: async (req, res) => {
        try {
            const group = await GroupWallet.findById(req.params.id);
            if (!group) return res.status(404).json({ error: 'Trip not found.' });

            // If owner, delete the whole thing. If participant, just leave.
            if (group.owner.toString() === req.userId) {
                await GroupWallet.findByIdAndDelete(req.params.id);
            } else {
                group.participants = group.participants.filter(p => p.user.toString() !== req.userId);
                await group.save();
            }

            const io = req.app.get('io');
            if (io) {
                const participants = [group.owner.toString(), ...group.participants.map(p => p.user.toString())];
                participants.forEach(uId => {
                    io.to(`user:${uId}`).emit('update_group_wallet', { groupId: req.params.id });
                });
            }

            invalidatePrefixes('group_wallet');
            res.json({ message: 'Trip removed successfully.' });
        } catch (err) {
            res.status(500).json({ error: 'Failed to remove trip.' });
        }
    }
};
