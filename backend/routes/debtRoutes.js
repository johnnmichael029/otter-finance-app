const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const cache = require('../middleware/cacheMiddleware');
const {
    getDebts,
    createDebt,
    updateDebt,
    deleteDebt,
    sendDebtReminder,
} = require('../controllers/debtController');

// All debt routes require authentication
router.use(requireAuth);

// GET /api/debts             — all debts for user (cached 90s)
router.get('/', cache('debt', 90), getDebts);

// POST /api/debts            — create debt (invalidates cache)
router.post('/', createDebt);

// PATCH /api/debts/:id       — update / mark partial/settled (invalidates cache)
router.patch('/:id', updateDebt);

// DELETE /api/debts/:id      — delete (invalidates cache)
router.delete('/:id', deleteDebt);

// POST /api/debts/:id/remind — send push notification reminder
router.post('/:id/remind', sendDebtReminder);

module.exports = router;
