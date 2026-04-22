const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const {
    createSession, getSessions, getSession,
    updateCartItems, checkoutSession, cancelSession, lookupBarcode, deleteSession
} = require('../controllers/shoppingController');
const {
    getTemplates, createTemplate, updateTemplate, deleteTemplate, useTemplate, getPriceHistory
} = require('../controllers/shoppingTemplateController');

router.use(requireAuth);

// ── Sessions ──────────────────────────────────────────────────────────────────
router.get('/sessions', getSessions);
router.post('/sessions', createSession);
router.get('/sessions/:id', getSession);
router.patch('/sessions/:id/items', updateCartItems);
router.post('/sessions/:id/checkout', checkoutSession);
router.patch('/sessions/:id/cancel', cancelSession);
router.delete('/sessions/:id', deleteSession);

// ── Barcode ───────────────────────────────────────────────────────────────────
router.get('/barcode/:barcode', lookupBarcode);

// ── Shopping Templates (Feature 14) ──────────────────────────────────────────
router.get('/templates', getTemplates);
router.post('/templates', createTemplate);
router.patch('/templates/:id', updateTemplate);
router.delete('/templates/:id', deleteTemplate);
router.post('/templates/:id/use', useTemplate);

// ── Price History (Feature 15) ────────────────────────────────────────────────
router.get('/price-history/:barcode', getPriceHistory);

module.exports = router;

