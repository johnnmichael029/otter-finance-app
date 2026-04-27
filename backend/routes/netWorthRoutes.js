const express = require('express');
const router = express.Router();
const netWorthController = require('../controllers/netWorthController');
const requireAuth = require('../middleware/requireAuth');

// All routes are protected
router.use(requireAuth);

router.get('/', netWorthController.getCurrentNetWorth);
router.get('/history', netWorthController.getNetWorthHistory);
router.post('/snapshot', netWorthController.createSnapshot);

module.exports = router;
