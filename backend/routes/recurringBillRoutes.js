const express = require('express');
const router = express.Router();
const { getBills, createBill, updateBill, deleteBill, markBillPaid } = require('../controllers/recurringBillController');
const requireAuth = require('../middleware/requireAuth');

router.use(requireAuth);

router.get('/', getBills);
router.post('/', createBill);
router.patch('/:id', updateBill);
router.delete('/:id', deleteBill);
router.post('/:id/paid', markBillPaid);

module.exports = router;
