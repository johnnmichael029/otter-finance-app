const Challenge = require('../models/challengeModel');
const Notification = require('../models/Notification');
const mongoose = require('mongoose');
const { sendPushNotification } = require('../utils/pushNotification');

// GET /api/challenges
const getChallenges = async (req, res) => {
    try {
        const challenges = await Challenge.find({
            $or: [
                { user: req.userId },
                { "participants.user": req.userId }
            ]
        }).sort({ createdAt: -1 })
            .populate('user', 'name otterTag avatarUrl')
            .populate('participants.user', 'name otterTag avatarUrl');

        res.json({ challenges });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch challenges.' });
    }
};

// POST /api/challenges
const createChallenge = async (req, res) => {
    try {
        const { title, description, type, targetAmount, endDate, icon, color, participantIds } = req.body;

        let progressData = {};
        if (type === '52-week') {
            const weeks = [];
            for (let i = 1; i <= 52; i++) {
                weeks.push({ week: i, amount: 0, completed: false });
            }
            progressData = { weeks };
        } else if (type === 'no-spend') {
            progressData = { failedDates: [] };
        }

        const isShared = participantIds && participantIds.length > 0;
        const participants = isShared ? participantIds.map(id => ({ user: id, status: 'pending', progressData })) : [];

        const challenge = await Challenge.create({
            user: req.userId,
            title, description, type,
            targetAmount: targetAmount || 0,
            endDate, icon, color,
            progressData,
            isShared,
            participants
        });

        // Notifications for Participants
        try {
            if (isShared) {
                const io = req.app.get('io');
                const creator = await mongoose.model('User').findById(req.userId);
                const creatorName = creator?.name || 'A friend';

                for (const p of participants) {
                    // 1. Emit real-time socket events (updates badge + notification list)
                    if (io) {
                        io.to(`user:${p.user.toString()}`).emit('notification_received');
                    }

                    // 2. Create persistent DB notification
                    const notif = await Notification.create({
                        user: p.user,
                        type: 'challenge_invite',
                        title: '⚔️ Challenge Invite',
                        message: `${creatorName} challenged you to "${challenge.title}"!`,
                        data: { challengeId: challenge._id, type: 'challenge_invite' }
                    });

                    // 3. Emit the full notification object for live feed
                    if (io) io.to(`user:${p.user.toString()}`).emit('new_notification', notif);

                    // 4. Send push notification if user has a token
                    try {
                        const invitedUser = await mongoose.model('User').findById(p.user).select('pushToken');
                        if (invitedUser?.pushToken) {
                            await sendPushNotification(
                                invitedUser.pushToken,
                                '⚔️ Challenge Invite',
                                `${creatorName} challenged you to "${challenge.title}"!`,
                                { challengeId: challenge._id.toString() }
                            );
                        }
                    } catch (pushErr) {
                        console.error('[CHALLENGE] Push failed for', p.user, pushErr.message);
                    }
                }
            }
        } catch (notifErr) {
            console.error('[CHALLENGE] Notification block failed:', notifErr.message);
            // We don't throw here so the challenge creation is still considered a success
        }

        const io = req.app.get('io');
        if (io) io.to(`user:${req.userId}`).emit('new_challenge', challenge);

        res.status(201).json(challenge);
    } catch (err) {
        res.status(500).json({ error: 'Failed to create challenge.' });
    }
};

// PATCH /api/challenges/:id
const updateChallenge = async (req, res) => {
    try {
        const challenge = await Challenge.findOneAndUpdate(
            {
                _id: req.params.id,
                $or: [
                    { user: req.userId },
                    { "participants.user": req.userId }
                ]
            },
            { $set: req.body },
            { returnDocument: 'after', runValidators: true }
        ).populate('user', 'name otterTag avatarUrl').populate('participants.user', 'name otterTag avatarUrl');

        if (!challenge) return res.status(404).json({ error: 'Challenge not found.' });

        const io = req.app.get('io');
        if (io) {
            io.to(`user:${challenge.user._id}`).emit('update_challenge', challenge);
            challenge.participants.forEach(p => {
                io.to(`user:${p.user._id}`).emit('update_challenge', challenge);
            });
        }

        res.json(challenge);
    } catch (err) {
        res.status(500).json({ error: 'Failed to update challenge.' });
    }
};

// POST /api/challenges/:id/progress
const updateProgress = async (req, res) => {
    try {
        const { amount, progressDataUpdate, isParticipant } = req.body;
        const challenge = await Challenge.findById(req.params.id);
        if (!challenge) return res.status(404).json({ error: 'Challenge not found.' });

        if (isParticipant) {
            const pIndex = challenge.participants.findIndex(p => p.user.toString() === req.userId);
            if (pIndex === -1) return res.status(403).json({ error: 'You are not a participant.' });

            if (amount !== undefined) challenge.participants[pIndex].currentAmount += amount;
            if (progressDataUpdate) {
                challenge.participants[pIndex].progressData = { ...challenge.participants[pIndex].progressData, ...progressDataUpdate };
            }
        } else {
            if (challenge.user.toString() !== req.userId) return res.status(403).json({ error: 'You do not own this challenge.' });

            if (amount !== undefined) challenge.currentAmount += amount;
            if (progressDataUpdate) {
                challenge.progressData = { ...challenge.progressData, ...progressDataUpdate };
            }
        }

        // Check if completed (for host)
        if (!isParticipant && challenge.targetAmount > 0 && challenge.currentAmount >= challenge.targetAmount && challenge.status !== 'completed') {
            challenge.status = 'completed';
            // Optional: send completion notification
            const io = req.app.get('io');
            await Notification.create({
                user: req.userId,
                type: 'challenge',
                title: '🏆 Challenge Completed!',
                message: `You conquered the "${challenge.title}" challenge!`,
                data: { challengeId: challenge._id }
            }).then(n => {
                if (io) io.to(`user:${req.userId}`).emit('new_notification', n);
            }).catch(() => { });
        }

        await challenge.save();
        await challenge.populate('user', 'name otterTag avatarUrl');
        await challenge.populate('participants.user', 'name otterTag avatarUrl');

        const io = req.app.get('io');
        if (io) {
            io.to(`user:${challenge.user._id}`).emit('update_challenge', challenge);
            challenge.participants.forEach(p => {
                io.to(`user:${p.user._id}`).emit('update_challenge', challenge);
            });
        }

        res.json(challenge);
    } catch (err) {
        res.status(500).json({ error: 'Failed to update progress.' });
    }
};

// POST /api/challenges/:id/respond
const respondToInvite = async (req, res) => {
    try {
        const { status } = req.body; // 'accepted' or 'rejected'
        const challenge = await Challenge.findById(req.params.id);
        if (!challenge) return res.status(404).json({ error: 'Challenge not found.' });

        const pIndex = challenge.participants.findIndex(p => p.user.toString() === req.userId);
        if (pIndex === -1) return res.status(403).json({ error: 'You are not invited to this challenge.' });

        challenge.participants[pIndex].status = status;
        await challenge.save();

        // Cleanup notification
        try {
            await Notification.deleteMany({
                user: req.userId,
                type: 'challenge_invite',
                'data.challengeId': challenge._id
            });
            const io = req.app.get('io');
            if (io) io.to(`user:${req.userId}`).emit('notification_received'); // Trigger refresh
        } catch (notifErr) {
            console.error('[CHALLENGE] Notification cleanup failed:', notifErr.message);
        }
        await challenge.populate('user', 'name otterTag avatarUrl');
        await challenge.populate('participants.user', 'name otterTag avatarUrl');

        const io = req.app.get('io');
        if (io) {
            io.to(`user:${challenge.user._id}`).emit('update_challenge', challenge);
            io.to(`user:${req.userId}`).emit('update_challenge', challenge);
        }

        // Notification for Owner if accepted
        if (status === 'accepted') {
            try {
                const responder = challenge.participants[pIndex].user;
                const ownerId = challenge.user._id;

                const notif = await Notification.create({
                    user: ownerId,
                    type: 'challenge_accepted',
                    title: '🤝 Challenge Accepted!',
                    message: `${responder.name} joined your challenge "${challenge.title}"!`,
                    data: { challengeId: challenge._id, type: 'challenge_accepted' }
                });

                if (io) {
                    io.to(`user:${ownerId.toString()}`).emit('notification_received');
                    io.to(`user:${ownerId.toString()}`).emit('new_notification', notif);
                }

                // Push for owner
                const ownerUser = await mongoose.model('User').findById(ownerId).select('pushToken');
                if (ownerUser?.pushToken) {
                    await sendPushNotification(
                        ownerUser.pushToken,
                        '🤝 Challenge Accepted!',
                        `${responder.name} joined your challenge "${challenge.title}"!`,
                        { challengeId: challenge._id.toString() }
                    );
                }
            } catch (notifErr) {
                console.error('[CHALLENGE] Accept notification failed:', notifErr.message);
            }
        } else if (status === 'rejected') {
            try {
                const responder = await mongoose.model('User').findById(req.userId).select('name');
                const ownerId = challenge.user._id;

                const notif = await Notification.create({
                    user: ownerId,
                    type: 'system',
                    title: '❌ Challenge Declined',
                    message: `${responder?.name || 'Someone'} declined your challenge "${challenge.title}".`,
                    data: { challengeId: challenge._id, type: 'challenge_declined' }
                });

                if (io) {
                    io.to(`user:${ownerId.toString()}`).emit('notification_received');
                    io.to(`user:${ownerId.toString()}`).emit('new_notification', notif);
                }

                const ownerUser = await mongoose.model('User').findById(ownerId).select('pushToken');
                if (ownerUser?.pushToken) {
                    await sendPushNotification(
                        ownerUser.pushToken,
                        '❌ Challenge Declined',
                        `${responder?.name || 'Someone'} declined your challenge "${challenge.title}".`,
                        { challengeId: challenge._id.toString() }
                    );
                }
            } catch (notifErr) {
                console.error('[CHALLENGE] Reject notification failed:', notifErr.message);
            }
        }

        res.json(challenge);
    } catch (err) {
        res.status(500).json({ error: 'Failed to respond to invite.' });
    }
};

// DELETE /api/challenges/:id
const deleteChallenge = async (req, res) => {
    try {
        const challenge = await Challenge.findById(req.params.id);
        if (!challenge) return res.status(404).json({ error: 'Challenge not found.' });

        const isOwner = challenge.user.toString() === req.userId;
        const pIndex = challenge.participants.findIndex(p => p.user.toString() === req.userId);

        if (!isOwner && pIndex === -1) {
            return res.status(403).json({ error: 'Unauthorized.' });
        }

        const io = req.app.get('io');

        if (isOwner) {
            await Challenge.deleteOne({ _id: req.params.id });
            await Notification.deleteMany({ 'data.challengeId': new mongoose.Types.ObjectId(req.params.id) });

            if (io) {
                io.to(`user:${req.userId}`).emit('delete_challenge', { _id: req.params.id });
                challenge.participants.forEach(p => {
                    io.to(`user:${p.user}`).emit('delete_challenge', { _id: req.params.id });
                });
            }
        } else {
            // Participant leaving
            challenge.participants.splice(pIndex, 1);
            await challenge.save();

            if (io) {
                const updated = await Challenge.findById(req.params.id).populate('user', 'name otterTag avatarUrl').populate('participants.user', 'name otterTag avatarUrl');
                io.to(`user:${challenge.user}`).emit('update_challenge', updated);
                challenge.participants.forEach(p => {
                    io.to(`user:${p.user}`).emit('update_challenge', updated);
                });
                // Also tell the person who left to remove it from their list
                io.to(`user:${req.userId}`).emit('delete_challenge', { _id: req.params.id });
            }
        }

        res.json({ message: isOwner ? 'Challenge deleted.' : 'You left the challenge.' });
    } catch (err) {
        console.error('[CHALLENGE] deleteChallenge error:', err.message);
        res.status(500).json({ error: 'Failed to process request.' });
    }
};

// DELETE /api/challenges/archives
const emptyArchives = async (req, res) => {
    try {
        const archivedIds = await Challenge.find({ user: req.userId, status: 'archived' }).distinct('_id');

        await Challenge.deleteMany({ user: req.userId, status: 'archived' });

        // Clean up notifications for these challenges
        if (archivedIds.length > 0) {
            await Notification.deleteMany({ 'data.challengeId': { $in: archivedIds } });
        }

        const io = req.app.get('io');
        if (io) {
            archivedIds.forEach(id => {
                io.to(`user:${req.userId}`).emit('delete_challenge', { _id: id.toString() });
            });
        }

        res.json({ message: 'Archives emptied.' });
    } catch (err) {
        console.error('[CHALLENGE] emptyArchives error:', err.message);
        res.status(500).json({ error: 'Failed to empty archives.' });
    }
};

module.exports = {
    getChallenges,
    createChallenge,
    updateChallenge,
    updateProgress,
    respondToInvite,
    deleteChallenge,
    emptyArchives
};
