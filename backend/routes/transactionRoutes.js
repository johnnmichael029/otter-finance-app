const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const cache = require('../middleware/cacheMiddleware');
const validate = require('../middleware/validate');
const {
    getTransactions,
    getSummary,
    createTransaction,
    updateTransaction,
    deleteTransaction,
    getAnalytics,
} = require('../controllers/transactionController');

// All transaction routes require authentication
router.use(requireAuth);

// GET /api/transactions          — paginated list (cached 90s)
router.get('/', cache('transaction', 90), getTransactions);

// GET /api/transactions/summary  — monthly summary (cached 90s)
router.get('/summary', cache('transaction', 90), getSummary);

// GET /api/transactions/analytics — deep AI analytics (cached 90s)
router.get('/analytics', cache('transaction', 90), getAnalytics);

// POST /api/transactions         — create (invalidates cache)
router.post('/', validate.createTransaction, createTransaction);

// PATCH /api/transactions/:id    — update (invalidates cache)
router.patch('/:id', validate.updateTransaction, updateTransaction);

// DELETE /api/transactions/:id   — delete (invalidates cache)
router.delete('/:id', deleteTransaction);

module.exports = router;
