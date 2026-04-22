const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const cache = require('../middleware/cacheMiddleware');
const validate = require('../middleware/validate');
const {
    getDebts,
    createDebt,
    updateDebt,
    deleteDebt,
    logPayment,
    getPayments,
    sendDebtReminder,
} = require('../controllers/debtController');

// All debt routes require authentication
router.use(requireAuth);

// GET /api/debts             — all debts for user (with live interest, cached 30s)
router.get('/', cache('debt', 30), getDebts);

// POST /api/debts            — create debt
router.post('/', validate.createDebt, createDebt);

// PATCH /api/debts/:id       — update (edit details, mark partial/settled)
router.patch('/:id', validate.updateDebt, updateDebt);

// DELETE /api/debts/:id      — delete debt + all payment logs
router.delete('/:id', deleteDebt);

// POST /api/debts/:id/payments  — log an installment payment
router.post('/:id/payments', logPayment);

// GET  /api/debts/:id/payments  — fetch payment history for a debt
router.get('/:id/payments', getPayments);

// POST /api/debts/:id/remind — send push notification reminder
router.post('/:id/remind', sendDebtReminder);

module.exports = router;
