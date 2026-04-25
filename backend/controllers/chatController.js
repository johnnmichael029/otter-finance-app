const Message = require('../models/messageModel');
const User = require('../models/userModel');

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/chat/:friendId
//  Fetch conversation history with a specific friend
// ─────────────────────────────────────────────────────────────────────────────
const getConversation = async (req, res) => {
    try {
        const { friendId } = req.params;
        const { page = 1, limit = 50 } = req.query;

        // Verify friend exists
        const friend = await User.findById(friendId).select('name otterTag');
        if (!friend) return res.status(404).json({ error: 'User not found.' });

        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Find messages where either:
        // (sender is me AND receiver is friend) OR (sender is friend AND receiver is me)
        const messages = await Message.find({
            $or: [
                { sender: req.userId, receiver: friendId },
                { sender: friendId, receiver: req.userId }
            ]
        })
        .sort({ createdAt: -1 }) // Sort newest first for pagination
        .skip(skip)
        .limit(parseInt(limit))
        .lean();

        // Optional: Mark received messages as read
        const unreadIds = messages
            .filter(m => m.receiver.toString() === req.userId && !m.read)
            .map(m => m._id);

        if (unreadIds.length > 0) {
            await Message.updateMany(
                { _id: { $in: unreadIds } },
                { $set: { read: true } }
            );
        }

        res.json({
            friend,
            messages // Return newest first for inverted FlashList UI
        });
    } catch (err) {
        console.error('[CHAT] getConversation error:', err.message);
        res.status(500).json({ error: 'Failed to fetch conversation.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/chat/:friendId/send
//  Send a message to a friend
// ─────────────────────────────────────────────────────────────────────────────
const sendMessage = async (req, res) => {
    try {
        const { friendId } = req.params;
        const { content } = req.body;

        if (!content || !content.trim()) {
            return res.status(400).json({ error: 'Message content cannot be empty.' });
        }

        // Must be friends (ObjectId comparison requires .toString())
        const sender = await User.findById(req.userId).select('friends');
        if (!sender.friends.some(id => id.toString() === friendId)) {
            return res.status(403).json({ error: 'You can only message your friends.' });
        }

        const message = await Message.create({
            sender: req.userId,
            receiver: friendId,
            content: content.trim()
        });

        const io = req.app.get('io');
        if (io) {
            // Notify the receiver
            io.to(`user:${friendId}`).emit('receive_message', message);
            // Also emit back to the sender just in case they have multiple devices open
            io.to(`user:${req.userId}`).emit('message_sent_ack', message);
        }

        res.status(201).json(message);
    } catch (err) {
        console.error('[CHAT] sendMessage error:', err.message);
        res.status(500).json({ error: 'Failed to send message.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  PATCH /api/chat/:friendId/read
//  Mark all messages from this friend as read
// ─────────────────────────────────────────────────────────────────────────────
const markAsRead = async (req, res) => {
    try {
        const { friendId } = req.params;

        await Message.updateMany(
            { sender: friendId, receiver: req.userId, read: false },
            { $set: { read: true } }
        );

        res.json({ message: 'Messages marked as read.' });
    } catch (err) {
        console.error('[CHAT] markAsRead error:', err.message);
        res.status(500).json({ error: 'Failed to mark messages as read.' });
    }
};

module.exports = { getConversation, sendMessage, markAsRead };
