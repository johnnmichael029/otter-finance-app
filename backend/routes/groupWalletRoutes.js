const express = require('express');
const router = express.Router();
const groupWalletController = require('../controllers/groupWalletController');
const requireAuth = require('../middleware/requireAuth');

router.use(requireAuth);

router.post('/', groupWalletController.createGroupWallet);
router.get('/', groupWalletController.getGroupWallets);
router.get('/:id', groupWalletController.getGroupWalletDetail);
router.post('/:id/respond', groupWalletController.respondToInvite);
router.post('/:id/expense', groupWalletController.addExpense);
router.patch('/:id', groupWalletController.updateGroupWallet);
router.delete('/:id/leave', groupWalletController.leaveGroupWallet);
router.get('/:id/settle-preview', groupWalletController.getSettlementPreview);
router.post('/:id/settle', groupWalletController.settleGroupWallet);
router.delete('/:id', groupWalletController.deleteGroupWallet);

module.exports = router;
