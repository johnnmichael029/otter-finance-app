const express = require('express');
const router = express.Router();
const {
    searchUsers,
    sendRequest,
    getPendingRequests,
    respondRequest,
    getFriends
} = require('../controllers/friendController');
const requireAuth = require('../middleware/requireAuth');

router.use(requireAuth); // All routes require authentication

router.get('/search', searchUsers);
router.post('/request', sendRequest);
router.get('/requests', getPendingRequests);
router.post('/respond', respondRequest);
router.get('/', getFriends);

module.exports = router;
