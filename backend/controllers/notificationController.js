const Notification = require('../models/Notification');

/**
 * Get all notifications for the authenticated user
 */
const getNotifications = async (req, res) => {
    try {
        const notifications = await Notification.find({ user: req.user._id })
            .sort({ createdAt: -1 })
            .limit(100);
        
        const unreadCount = await Notification.countDocuments({ 
            user: req.user._id, 
            isRead: false 
        });

        res.status(200).json({ notifications, unreadCount });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Mark a specific notification as read
 */
const markAsRead = async (req, res) => {
    try {
        const notification = await Notification.findOneAndUpdate(
            { _id: req.params.id, user: req.user._id },
            { isRead: true },
            { new: true }
        );

        if (!notification) {
            return res.status(404).json({ error: 'Notification not found' });
        }

        const io = req.app.get('io');
        if (io) {
            io.to(`user:${req.user._id}`).emit('notification_read', { id: notification._id });
        }

        res.status(200).json(notification);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Mark all notifications as read for the user
 */
const markAllAsRead = async (req, res) => {
    try {
        await Notification.updateMany(
            { user: req.user._id, isRead: false },
            { isRead: true }
        );

        const io = req.app.get('io');
        if (io) {
            io.to(`user:${req.user._id}`).emit('all_notifications_read');
        }

        res.status(200).json({ message: 'All notifications marked as read' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Delete a notification
 */
const deleteNotification = async (req, res) => {
    try {
        const notification = await Notification.findOneAndDelete({ 
            _id: req.params.id, 
            user: req.user._id 
        });

        if (!notification) {
            return res.status(404).json({ error: 'Notification not found' });
        }

        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    getNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification
};
