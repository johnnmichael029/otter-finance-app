const User = require('../models/userModel');
const FriendRequest = require('../models/friendRequestModel');
const Notification = require('../models/Notification');
const Message = require('../models/messageModel');

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/friends/search?q=
// Search users by email or otterTag
// ─────────────────────────────────────────────────────────────────────────────
const searchUsers = async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || q.length < 3) return res.json([]);

        const regex = new RegExp(q, 'i');
        const users = await User.find({
            _id: { $ne: req.userId }, // exclude self
            $or: [
                { email: regex },
                { otterTag: regex }
            ]
        })
            .select('_id name email otterTag avatarUrl')
            .limit(10);

        res.json(users);
    } catch (err) {
        console.error('[FRIENDS] searchUsers error:', err);
        res.status(500).json({ error: 'Failed to search users.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/friends/request
// Send a friend request
// ─────────────────────────────────────────────────────────────────────────────
const sendRequest = async (req, res) => {
    try {
        const { receiverId } = req.body;
        if (!receiverId) return res.status(400).json({ error: 'Receiver ID is required.' });
        if (receiverId === req.userId) return res.status(400).json({ error: 'Cannot send request to yourself.' });

        // Check if already friends
        const senderUser = await User.findById(req.userId);
        if (senderUser.friends.includes(receiverId)) {
            return res.status(400).json({ error: 'Already friends.' });
        }

        // Check if request already exists
        const existingReq = await FriendRequest.findOne({
            $or: [
                { sender: req.userId, receiver: receiverId },
                { sender: receiverId, receiver: req.userId }
            ],
            status: { $in: ['pending', 'accepted'] }
        });

        if (existingReq) {
            if (existingReq.status === 'accepted') {
                return res.status(400).json({ error: 'Already friends.' });
            }
            if (existingReq.sender.toString() === req.userId) {
                return res.status(400).json({ error: 'Friend request already sent.' });
            } else {
                // The receiver is actually the one who should accept the request
                return res.status(400).json({ error: 'incoming_request_exists' });
            }
        }

        const friendReq = await FriendRequest.create({
            sender: req.userId,
            receiver: receiverId
        });

        // Notify receiver via Socket
        const io = req.app.get('io');
        if (io) {
            io.to(`user:${receiverId}`).emit('new_friend_request', {
                requestId: friendReq._id,
                sender: { _id: senderUser._id, name: senderUser.name, avatarUrl: senderUser.avatarUrl, otterTag: senderUser.otterTag }
            });
            // Also notify that there's a new notification object
            io.to(`user:${receiverId}`).emit('notification_received');
        }

        // Create persistent Notification
        await Notification.create({
            user: receiverId,
            type: 'friend_request',
            title: 'New Friend Request',
            message: `${senderUser.name} sent you a friend request.`,
            data: { 
                requestId: friendReq._id, 
                senderId: senderUser._id,
                senderName: senderUser.name,
                senderAvatar: senderUser.avatarUrl,
                senderTag: senderUser.otterTag
            }
        });

        res.json({ message: 'Friend request sent.', request: friendReq });
    } catch (err) {
        console.error('[FRIENDS] sendRequest error:', err);
        res.status(500).json({ error: 'Failed to send friend request.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/friends/requests
// Get pending incoming friend requests
// ─────────────────────────────────────────────────────────────────────────────
const getPendingRequests = async (req, res) => {
    try {
        const requests = await FriendRequest.find({ receiver: req.userId, status: 'pending' })
            .populate('sender', 'name email otterTag avatarUrl')
            .sort({ createdAt: -1 });
        res.json(requests);
    } catch (err) {
        console.error('[FRIENDS] getPendingRequests error:', err);
        res.status(500).json({ error: 'Failed to fetch friend requests.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/friends/respond
// Accept or reject friend request
// ─────────────────────────────────────────────────────────────────────────────
const respondRequest = async (req, res) => {
    try {
        const { requestId, status } = req.body; // 'accepted' or 'rejected'
        if (!['accepted', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });

        const friendReq = await FriendRequest.findOne({ _id: requestId, receiver: req.userId });
        if (!friendReq) return res.status(404).json({ error: 'Friend request not found.' });
        if (friendReq.status !== 'pending') return res.status(400).json({ error: 'Request already processed.' });

        friendReq.status = status;
        await friendReq.save();

        // Cleanup the notification associated with this request
        const mongoose = require('mongoose');
        await Notification.deleteMany({ 'data.requestId': new mongoose.Types.ObjectId(requestId) });

        const io = req.app.get('io');

        if (status === 'accepted') {
            // Add to both users' friends arrays
            await User.findByIdAndUpdate(friendReq.sender, { $addToSet: { friends: friendReq.receiver } }, { returnDocument: 'after', runValidators: true });
            const receiverUser = await User.findByIdAndUpdate(friendReq.receiver, { $addToSet: { friends: friendReq.sender } }, { returnDocument: 'after', runValidators: true });
            const senderUser = await User.findById(friendReq.sender).select('name avatarUrl');

            if (io) {  // Notify sender that it was accepted
                io.to(`user:${friendReq.sender}`).emit('friend_request_accepted', {
                    friend: { _id: receiverUser._id, name: receiverUser.name, avatarUrl: receiverUser.avatarUrl, otterTag: receiverUser.otterTag }
                });
                io.to(`user:${friendReq.receiver}`).emit('friends_updated');
            }

            // Create persistent notification for the sender
            await Notification.create({
                user: friendReq.sender,
                type: 'friend_accepted',
                title: 'Friend Request Accepted',
                message: `${receiverUser.name} accepted your friend request! You are now friends.`,
                data: { friendId: receiverUser._id, senderAvatar: receiverUser.avatarUrl }
            }).then(n => {
                if (io) {
                    io.to(`user:${n.user.toString()}`).emit('new_notification', n);
                }
            });
        }

        res.json({ message: `Request ${status}.` });
    } catch (err) {
        console.error('[FRIENDS] respondRequest error:', err);
        res.status(500).json({ error: 'Failed to respond to request.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/friends
// Get list of friends
// ─────────────────────────────────────────────────────────────────────────────
const getFriends = async (req, res) => {
    try {
        const user = await User.findById(req.userId).populate('friends', 'name email otterTag avatarUrl');
        const onlineUsers = req.app.get('onlineUsers') || new Set();
        
        const friendsWithStatus = await Promise.all((user.friends || []).map(async (f) => {
            // Fetch last message
            const lastMessage = await Message.findOne({
                $or: [
                    { sender: req.userId, receiver: f._id },
                    { sender: f._id, receiver: req.userId }
                ]
            }).sort({ createdAt: -1 }).select('content createdAt read sender receiver').lean();

            // Check unread count
            const unreadCount = await Message.countDocuments({
                sender: f._id,
                receiver: req.userId,
                read: false
            });

            return {
                ...f.toObject(),
                isOnline: onlineUsers.has(f._id.toString()),
                lastMessage,
                unreadCount
            };
        }));

        res.json(friendsWithStatus);
    } catch (err) {
        console.error('[FRIENDS] getFriends error:', err);
        res.status(500).json({ error: 'Failed to fetch friends.' });
    }
};

module.exports = {
    searchUsers,
    sendRequest,
    getPendingRequests,
    respondRequest,
    getFriends
};
