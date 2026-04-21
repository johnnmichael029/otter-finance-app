const ShoppingSession = require('../models/shoppingSessionModel');
const BarcodePrice = require('../models/barcodePriceModel');
const SavingsGoal = require('../models/savingsGoalModel');
const SavingsTransfer = require('../models/savingsTransferModel');
const Transaction = require('../models/transactionModel');
const { invalidatePrefixes } = require('../utils/cache');

// ─── POST /api/shopping/sessions ─────────────────────────────────────────────
// Create a new active shopping session
const createSession = async (req, res) => {
    try {
        const { label, budget } = req.body;
        if (!budget || budget <= 0) return res.status(400).json({ error: 'A valid budget is required.' });

        const session = await ShoppingSession.create({
            user: req.userId,
            label: label || 'Shopping Trip',
            budget,
            items: [],
            total: 0,
            status: 'active',
        });

        const io = req.app.get('io');
        if (io) io.to(`user:${req.userId}`).emit('new_shopping_session', session);

        res.status(201).json(session);
    } catch (err) {
        console.error('[Shopping] createSession error:', err);
        res.status(500).json({ error: 'Failed to create session.' });
    }
};

// ─── GET /api/shopping/sessions ──────────────────────────────────────────────
// Get all sessions for the user (paginated, newest first)
const getSessions = async (req, res) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;
        const filter = { user: req.userId };
        if (status) filter.status = status;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [sessions, total] = await Promise.all([
            ShoppingSession.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
            ShoppingSession.countDocuments(filter),
        ]);

        res.json({ sessions, total, hasMore: skip + sessions.length < total });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch sessions.' });
    }
};

// ─── GET /api/shopping/sessions/:id ──────────────────────────────────────────
const getSession = async (req, res) => {
    try {
        const session = await ShoppingSession.findOne({ _id: req.params.id, user: req.userId });
        if (!session) return res.status(404).json({ error: 'Session not found.' });
        res.json(session);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch session.' });
    }
};

// ─── PATCH /api/shopping/sessions/:id/items ───────────────────────────────────
// Update cart items (add/update/remove)
const updateCartItems = async (req, res) => {
    try {
        const { items } = req.body;
        const session = await ShoppingSession.findOne({ _id: req.params.id, user: req.userId });
        if (!session) return res.status(404).json({ error: 'Session not found.' });
        if (session.status !== 'active') return res.status(400).json({ error: 'Session is no longer active.' });

        session.items = items;
        session.total = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        await session.save();

        const io = req.app.get('io');
        if (io) io.to(`user:${req.userId}`).emit('update_shopping_session', session);

        res.json(session);
    } catch (err) {
        res.status(500).json({ error: 'Failed to update cart.' });
    }
};

// ─── POST /api/shopping/sessions/:id/checkout ────────────────────────────────
// Confirm checkout: deduct balance, log transaction, complete session
const checkoutSession = async (req, res) => {
    try {
        const { paymentMethod, source, note } = req.body;
        const session = await ShoppingSession.findOne({ _id: req.params.id, user: req.userId });
        if (!session) return res.status(404).json({ error: 'Session not found.' });
        if (session.status !== 'active') return res.status(400).json({ error: 'Session already completed.' });
        if (session.items.length === 0) return res.status(400).json({ error: 'Cart is empty.' });

        const total = session.total;
        const io = req.app.get('io');

        // ── Deduct from chosen source ─────────────────────────────────────────
        if (source === 'savings_balance') {
            // Deduct from Savings Master Pot
            const masterPot = await SavingsGoal.findOne({ user: req.userId, name: 'Savings Balance' });
            if (!masterPot) return res.status(400).json({ error: 'Savings Balance not found.' });
            if (masterPot.currentAmount < total) return res.status(400).json({ error: 'Insufficient savings balance.' });

            masterPot.currentAmount -= total;
            await masterPot.save();

            // Log in savings transfer history
            const xfer = await SavingsTransfer.create({
                user: req.userId,
                direction: 'from_savings',
                amount: total,
                goal: masterPot._id,
                goalName: masterPot.name,
                note: `Shopping: ${session.label}`,
                runningBalance: masterPot.currentAmount,
            });

            if (io) {
                io.to(`user:${req.userId}`).emit('update_savings_goal', masterPot);
                io.to(`user:${req.userId}`).emit('new_savings_transfer', xfer);
            }
        } else {
            // Deduct from Main Balance via a transaction record
            const tx = await Transaction.create({
                user: req.userId,
                type: 'expense',
                category: 'Shopping',
                amount: total,
                description: `Shopping: ${session.label}`,
                note: note || paymentMethod,
                date: new Date(),
            });

            if (io) io.to(`user:${req.userId}`).emit('new_transaction', tx);
        }

        // ── Save Barcoded Items to User's Personal Price DB ───────────────────
        for (const item of session.items) {
            if (item.barcode && item.barcode.trim() !== '') {
                await BarcodePrice.findOneAndUpdate(
                    { user: req.userId, barcode: item.barcode },
                    { $set: { name: item.name, price: item.price }, $inc: { count: 1 } },
                    { upsert: true, new: true }
                );
            }
        }

        // ── Complete the session ──────────────────────────────────────────────
        session.status = 'completed';
        session.paymentMethod = paymentMethod || 'cash';
        session.source = source || 'main_balance';
        session.note = note || '';
        await session.save();

        invalidatePrefixes('shopping');
        if (io) io.to(`user:${req.userId}`).emit('update_shopping_session', session);

        res.json(session);
    } catch (err) {
        console.error('[Shopping] checkoutSession error:', err);
        res.status(500).json({ error: 'Checkout failed.' });
    }
};

// ─── PATCH /api/shopping/sessions/:id/cancel ─────────────────────────────────
const cancelSession = async (req, res) => {
    try {
        const session = await ShoppingSession.findOne({ _id: req.params.id, user: req.userId });
        if (!session) return res.status(404).json({ error: 'Session not found.' });

        session.status = 'cancelled';
        await session.save();

        const io = req.app.get('io');
        if (io) io.to(`user:${req.userId}`).emit('update_shopping_session', session);

        res.json({ message: 'Session cancelled.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to cancel session.' });
    }
};

// ─── GET /api/shopping/barcode/:barcode ──────────────────────────────────────
// Lookup a barcode price for this specific user
const lookupBarcode = async (req, res) => {
    try {
        const item = await BarcodePrice.findOne({ user: req.userId, barcode: req.params.barcode });
        if (!item) return res.status(404).json({ found: false });
        res.json({ found: true, item });
    } catch (err) {
        res.status(500).json({ error: 'Barcode lookup failed.' });
    }
};

// ─── DELETE /api/shopping/sessions/:id ──────────────────────────────────────
// Only allow deletion of CANCELLED sessions
const deleteSession = async (req, res) => {
    try {
        const session = await ShoppingSession.findOne({ _id: req.params.id, user: req.userId });
        if (!session) return res.status(404).json({ error: 'Session not found.' });
        if (session.status !== 'cancelled') {
            return res.status(403).json({ error: 'Only cancelled sessions can be deleted.' });
        }

        await ShoppingSession.deleteOne({ _id: session._id });

        const io = req.app.get('io');
        if (io) io.to(`user:${req.userId}`).emit('delete_shopping_session', { _id: session._id });

        res.json({ message: 'Session deleted.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete session.' });
    }
};

module.exports = { createSession, getSessions, getSession, updateCartItems, checkoutSession, cancelSession, lookupBarcode, deleteSession };

