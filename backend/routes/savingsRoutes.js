const express = require('express');
const router = express.Router();
const { getGoals, createGoal, updateGoal, deleteGoal, transfer, getTransfers, completeGoal, bulkAction, respondToGoalInvite, archiveTransfer, emptyTransfersArchives, deleteTransfer, emptyGoalArchives } = require('../controllers/savingsController');
const requireAuth = require('../middleware/requireAuth');
const validate = require('../middleware/validate');

router.use(requireAuth);

router.get('/goals', getGoals);
router.post('/goals', validate.createSavingsGoal, createGoal);
router.post('/goals/complete/:id', completeGoal);
router.post('/goals/respond/:id', respondToGoalInvite);
router.patch('/goals/:id', updateGoal);
router.delete('/goals/archive/empty', emptyGoalArchives);
router.delete('/goals/:id', deleteGoal);

router.post('/transfer', transfer);
router.get('/transfers', getTransfers);
router.patch('/transfers/:id/archive', archiveTransfer);
router.delete('/transfers/archive/empty', emptyTransfersArchives);
router.delete('/transfers/:id', deleteTransfer);

router.post('/bulk-action', bulkAction);

module.exports = router;
