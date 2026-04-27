const Budget = require('../models/budgetModel');
const Transaction = require('../models/transactionModel');
const Notification = require('../models/Notification');
const User = require('../models/userModel');
const { sendPushNotification } = require('../utils/pushNotification');

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

        // Fetch budgets where user is owner OR accepted participant
        const budgets = await Budget.find({
            $or: [
                { user: req.userId, period: periodParam },
                { participants: { $elemMatch: { user: req.userId, status: 'accepted' } }, period: periodParam }
            ]
        });

        // Identify all users involved to fetch transactions
        const userIds = [req.userId];
        budgets.forEach(b => {
            if (b.isShared && b.participants) {
                b.participants.forEach(p => {
                    if (p.status === 'accepted') userIds.push(p.user.toString());
                });
                userIds.push(b.user.toString()); // Ensure owner is included
            }
        });
        const uniqueUserIds = [...new Set(userIds)];

        // Fetch transactions for all involved users in parallel
        const transactions = await Transaction.find({
            user: { $in: uniqueUserIds },
            type: 'expense',
            date: { $gte: startDate, $lte: endDate },
        }).lean();

        // Compute spent for each budget
        const enriched = budgets.map(b => {
            const bObj = b.toObject();
            let budgetSpent = 0;
            const subSpentMap = {};
            
            if (bObj.subBudgets) {
                bObj.subBudgets.forEach(sub => subSpentMap[sub.tag.toLowerCase()] = 0);
            }

            // Get valid users for THIS specific budget
            const budgetUserIds = [b.user.toString()];
            if (b.isShared && b.participants) {
                b.participants.forEach(p => {
                    if (p.status === 'accepted') budgetUserIds.push(p.user.toString());
                });
            }

            for (const tx of transactions) {
                // Transaction must belong to a participant of this budget
                if (!budgetUserIds.includes(tx.user.toString())) continue;

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
                        if (txCat === subTagLower || txTags.includes(subTagLower) || txNote === subTagLower || txNote.includes(subTagLower)) {
                            matchedSubTags.push(subTagLower);
                            belongsToBudget = true;
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

        // Total spent (for dashboard summary) - typically just the user's personal spending
        const userTotalSpent = transactions
            .filter(tx => tx.user.toString() === req.userId)
            .reduce((sum, tx) => sum + tx.amount, 0);

        res.json({ budgets: enriched, spendingMap: {}, totalSpent: userTotalSpent, startDate, endDate, period: periodParam });
    } catch (err) {
        console.error('[BUDGET] getBudgets error:', err.message);
        res.status(500).json({ error: 'Failed to fetch budgets.' });
    }
};

// POST /api/budgets — upsert (one per user+period+category)
const upsertBudget = async (req, res) => {
    try {
        const { 
            period, category, categoryIcon, categoryColor, 
            allocatedAmount, reminderAmount, subBudgets,
            isShared, participants, participantIds 
        } = req.body;

        if (!period || !category || allocatedAmount === undefined) {
            return res.status(400).json({ error: 'period, category, and allocatedAmount are required.' });
        }

        // Only the owner can upsert/edit the budget settings
        let budget = await Budget.findOne({ user: req.userId, category, period });

        // Map participantIds to model structure if provided
        let finalParticipants = participants;
        if (participantIds && Array.isArray(participantIds)) {
            finalParticipants = participantIds.map(id => ({
                user: id,
                status: 'pending'
            }));
        }

        if (budget) {
            // Update existing
            budget.allocatedAmount = allocatedAmount;
            budget.categoryIcon = categoryIcon;
            budget.categoryColor = categoryColor;
            budget.reminderAmount = reminderAmount;
            budget.subBudgets = subBudgets || [];
            budget.isShared = isShared !== undefined ? isShared : budget.isShared;
            
            if (finalParticipants) {
                // If updating, preserve existing statuses for users still in the list
                const oldParticipants = budget.participants || [];
                budget.participants = finalParticipants.map(newP => {
                    const existing = oldParticipants.find(p => p.user.toString() === newP.user.toString());
                    return existing ? existing : newP;
                });
            }
            
            await budget.save();
        } else {
            // Create new
            budget = await Budget.create({
                user: req.userId,
                period,
                category,
                categoryIcon,
                categoryColor,
                allocatedAmount,
                reminderAmount,
                subBudgets: subBudgets || [],
                isShared: isShared || false,
                participants: finalParticipants || []
            });
        }

        // --- Handle Notifications for Shared Budgets ---
        if (budget.isShared && budget.participants && budget.participants.length > 0) {
            const owner = await User.findById(req.userId);
            
            for (const p of budget.participants) {
                if (p.status === 'pending') {
                    // Check if notification already exists to avoid spam
                    const existingNote = await Notification.findOne({
                        user: p.user,
                        type: 'budget_invite',
                        'data.budgetId': budget._id
                    });

                    if (!existingNote) {
                        await Notification.create({
                            user: p.user,
                            type: 'budget_invite',
                            title: 'New Budget Invite',
                            message: `${owner.name} invited you to share their "${budget.category}" budget.`,
                            data: { budgetId: budget._id, ownerId: owner._id }
                        });
                        
                        const io = req.app.get('io');
                        if (io) {
                            io.to(`user:${p.user}`).emit('new_notification', { type: 'budget_invite' });
                        }

                        // Send Push Notification
                        try {
                            const invitedUser = await User.findById(p.user).select('pushToken');
                            if (invitedUser?.pushToken) {
                                await sendPushNotification(
                                    invitedUser.pushToken,
                                    'New Budget Invite',
                                    `${owner.name} invited you to share their "${budget.category}" budget.`,
                                    { budgetId: budget._id.toString() }
                                );
                            }
                        } catch (pushErr) {
                            console.error('[BUDGET] Push failed:', pushErr.message);
                        }
                    }
                }
            }
        }

        const io = req.app.get('io');
        if (io) {
            io.to(`user:${req.userId}`).emit('update_budget', budget);
            // Notify other accepted participants
            if (budget.isShared && budget.participants) {
                budget.participants.forEach(p => {
                    if (p.status === 'accepted') {
                        io.to(`user:${p.user}`).emit('update_budget', budget);
                    }
                });
            }
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

// POST /api/budgets/respond/:id
const respondToBudgetInvite = async (req, res) => {
    try {
        const { status } = req.body; // status: 'accepted' or 'declined'
        const budgetId = req.params.id;

        if (!['accepted', 'declined'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status.' });
        }

        const budget = await Budget.findById(budgetId);
        if (!budget) return res.status(404).json({ error: 'Budget not found.' });

        const participantIndex = budget.participants.findIndex(
            p => p.user.toString() === req.userId
        );

        if (participantIndex === -1) {
            return res.status(403).json({ error: 'You are not invited to this budget.' });
        }

        budget.participants[participantIndex].status = status;
        if (status === 'accepted') {
            budget.participants[participantIndex].joinedAt = new Date();
        }

        await budget.save();
        
        const io = req.app.get('io');

        // --- Update Invitation Notification ---
        const invNotification = await Notification.findOne({
            user: req.userId,
            type: 'budget_invite',
            'data.budgetId': budget._id
        });
        if (invNotification) {
            invNotification.title = status === 'accepted' ? 'Budget Joined! 💹' : 'Invite Declined';
            invNotification.message = status === 'accepted' ? `You joined the "${budget.category}" budget.` : 'You declined the invite.';
            invNotification.isRead = true;
            invNotification.data = { ...invNotification.data, processed: true };
            await invNotification.save();
            if (io) io.to(`user:${req.userId}`).emit('notification_updated', invNotification);
        }

        const responder = await User.findById(req.userId);

        if (status === 'accepted') {
            await Notification.create({
                user: budget.user,
                type: 'budget_invite_accepted',
                title: 'Budget Invite Accepted',
                message: `${responder.name} has joined your "${budget.category}" budget.`,
                data: { budgetId: budget._id, userId: req.userId }
            });
            if (io) io.to(`user:${budget.user}`).emit('new_notification', { type: 'budget_invite_accepted' });
            
            // Send Push Notification to owner
            try {
                const owner = await User.findById(budget.user).select('pushToken');
                if (owner?.pushToken) {
                    await sendPushNotification(
                        owner.pushToken,
                        'Budget Invite Accepted',
                        `${responder.name} has joined your "${budget.category}" budget.`,
                        { budgetId: budget._id.toString() }
                    );
                }
            } catch (pushErr) {
                console.error('[BUDGET] Response push failed:', pushErr.message);
            }
        }

        if (io) {
            // Notify the owner
            io.to(`user:${budget.user}`).emit('budget_invite_response', {
                budgetId: budget._id,
                userId: req.userId,
                status
            });
            // Update the budget for the responder
            io.to(`user:${req.userId}`).emit('update_budget', budget);
        }

        res.json({ message: `Budget invite ${status}.`, budget });
    } catch (err) {
        console.error('[BUDGET] respondToBudgetInvite error:', err.message);
        res.status(500).json({ error: 'Failed to respond to invite.' });
    }
};

module.exports = { getBudgets, upsertBudget, deleteBudget, respondToBudgetInvite };
