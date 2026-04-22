/**
 * OTTER — Currency Routes
 * GET /api/currency/rates?base=PHP       — get all rates for a base currency
 * GET /api/currency/convert              — convert amount between currencies
 * GET /api/currency/list                 — list popular supported currencies
 */
const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const { getRates, convert, POPULAR_CURRENCIES } = require('../utils/exchangeRateService');

// All currency routes require authentication
router.use(requireAuth);

// ── GET /api/currency/list ─────────────────────────────────────────────────────
// Returns the curated list of popular currencies with flags and symbols
router.get('/list', (req, res) => {
    res.json({ currencies: POPULAR_CURRENCIES });
});

// ── GET /api/currency/rates?base=PHP ──────────────────────────────────────────
// Returns all exchange rates relative to the given base currency
router.get('/rates', async (req, res) => {
    try {
        const base = (req.query.base || 'PHP').toUpperCase();
        const { rates, updatedAt } = await getRates(base);
        res.json({ base, rates, time_last_update_utc: updatedAt });
    } catch (err) {
        console.error('[Currency] /rates error:', err.message);
        res.status(503).json({ error: 'Exchange rate service temporarily unavailable. Please try again.' });
    }
});

// ── GET /api/currency/convert?from=USD&to=PHP&amount=100 ──────────────────────
// Converts an amount between two currencies and returns the result + rate used
router.get('/convert', async (req, res) => {
    try {
        const { from, to, amount } = req.query;

        if (!from || !to || !amount) {
            return res.status(400).json({ error: 'from, to, and amount are required query parameters.' });
        }

        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            return res.status(400).json({ error: 'amount must be a positive number.' });
        }

        const { convertedAmount, rate } = await convert(
            parsedAmount,
            from.toUpperCase(),
            to.toUpperCase()
        );

        res.json({
            from: from.toUpperCase(),
            to: to.toUpperCase(),
            originalAmount: parsedAmount,
            convertedAmount,
            rate,
        });
    } catch (err) {
        console.error('[Currency] /convert error:', err.message);
        if (err.message.startsWith('Unsupported currency')) {
            return res.status(400).json({ error: err.message });
        }
        res.status(503).json({ error: 'Conversion failed. Please try again.' });
    }
});

module.exports = router;
