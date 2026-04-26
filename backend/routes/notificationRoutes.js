const express = require('express');
const router = express.Router();
const { 
    getNotifications, 
    markAsRead, 
    markAllAsRead, 
    deleteNotification,
    deleteAllNotifications
} = require('../controllers/notificationController');
const requireAuth = require('../middleware/requireAuth');

// All notification routes require authentication
router.use(requireAuth);

router.get('/', getNotifications);
router.patch('/mark-all-read', markAllAsRead);
router.patch('/:id/read', markAsRead);
router.delete('/bulk-delete', (req, res, next) => {
    console.log(`[NOTIF] Purging all notifications for user: ${req.user._id}`);
    next();
}, deleteAllNotifications);
router.delete('/:id', deleteNotification);

module.exports = router;
