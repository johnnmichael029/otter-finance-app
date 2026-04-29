const express = require('express');
const router = express.Router();
const { getBudgets, upsertBudget, updateBudgetById, deleteBudget, respondToBudgetInvite } = require('../controllers/budgetController');
const requireAuth = require('../middleware/requireAuth');

router.use(requireAuth);

router.get('/', getBudgets);
router.post('/', upsertBudget);
router.post('/respond/:id', respondToBudgetInvite);
router.patch('/:id', updateBudgetById);
router.delete('/:id', deleteBudget);

module.exports = router;
