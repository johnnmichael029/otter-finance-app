const express = require('express');
const router = express.Router();
const { getGoals, createGoal, updateGoal, deleteGoal, transfer, getTransfers, completeGoal, bulkAction } = require('../controllers/savingsController');
const requireAuth = require('../middleware/requireAuth');

router.use(requireAuth);

router.get('/goals', getGoals);
router.post('/goals', createGoal);
router.post('/goals/complete/:id', completeGoal);
router.patch('/goals/:id', updateGoal);
router.delete('/goals/:id', deleteGoal);

router.post('/transfer', transfer);
router.get('/transfers', getTransfers);
router.post('/bulk-action', bulkAction);

module.exports = router;
