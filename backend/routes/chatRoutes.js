const express = require('express');
const router = express.Router();
const { getConversation, sendMessage, markAsRead } = require('../controllers/chatController');
const requireAuth = require('../middleware/requireAuth');

router.use(requireAuth);

// Fetch conversation with a specific friend
router.get('/:friendId', getConversation);

// Send a message
router.post('/:friendId/send', sendMessage);

// Mark as read
router.patch('/:friendId/read', markAsRead);

module.exports = router;
