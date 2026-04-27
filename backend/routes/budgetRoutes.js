const express = require('express');
const router = express.Router();
const { getBudgets, upsertBudget, deleteBudget, respondToBudgetInvite } = require('../controllers/budgetController');
const requireAuth = require('../middleware/requireAuth');

router.use(requireAuth);

router.get('/', getBudgets);
router.post('/', upsertBudget);
router.post('/respond/:id', respondToBudgetInvite);
router.delete('/:id', deleteBudget);

module.exports = router;
