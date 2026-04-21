const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const {
    createSession, getSessions, getSession,
    updateCartItems, checkoutSession, cancelSession, lookupBarcode, deleteSession
} = require('../controllers/shoppingController');

router.use(requireAuth);

router.get('/sessions', getSessions);
router.post('/sessions', createSession);
router.get('/sessions/:id', getSession);
router.patch('/sessions/:id/items', updateCartItems);
router.post('/sessions/:id/checkout', checkoutSession);
router.patch('/sessions/:id/cancel', cancelSession);
router.delete('/sessions/:id', deleteSession);
router.get('/barcode/:barcode', lookupBarcode);

module.exports = router;
