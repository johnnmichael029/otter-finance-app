const ShoppingSession = require('../models/shoppingSessionModel');
const BarcodePrice = require('../models/barcodePriceModel');
const SavingsGoal = require('../models/savingsGoalModel');
const SavingsTransfer = require('../models/savingsTransferModel');
const Wallet = require('../models/walletModel');
const Transaction = require('../models/transactionModel');
const mongoose = require('mongoose');
const { invalidatePrefixes } = require('../utils/cache');
const { encrypt, decryptNote } = require('../utils/encryption');

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
        const io = req.app.get('io');
        const { paymentMethod, source, note, walletDeductAmount } = req.body;
        const session = await ShoppingSession.findOne({ _id: req.params.id, user: req.userId });
        if (!session) return res.status(404).json({ error: 'Session not found.' });
        if (session.status !== 'active') return res.status(400).json({ error: 'Session already completed.' });
        if (session.items.length === 0) return res.status(400).json({ error: 'Cart is empty.' });

        const total = session.total;

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
            // Deduct from a specific Wallet or Main Balance
            let walletId = null;
            if (mongoose.Types.ObjectId.isValid(source)) {
                walletId = source;
            }

            // Calculate current total balance of "HAND" money (wallet: null)
            const balanceAgg = await Transaction.aggregate([
                { $match: { user: new mongoose.Types.ObjectId(req.userId), wallet: null } },
                { $group: { _id: '$type', total: { $sum: '$amount' } } },
            ]);
            let currentBalance = 0;
            balanceAgg.forEach(r => {
                if (r._id === 'income') currentBalance += r.total;
                if (r._id === 'expense') currentBalance -= r.total;
            });

            const tx = await Transaction.create({
                user: req.userId,
                type: 'expense',
                category: 'Shopping',
                amount: total,
                description: `Shopping: ${session.label}`,
                note: encrypt(note || paymentMethod),
                date: new Date(),
                runningBalance: walletId ? currentBalance : (currentBalance - total),
                wallet: walletId
            });

            if (walletId) {
                const wallet = await Wallet.findOne({ _id: walletId, userId: req.userId });
                if (wallet) {
                    const fiatTypes = ['Debit', 'Credit', 'Cash', 'E-Wallet'];
                    const isFiat = fiatTypes.includes(wallet.type);
                    const isCrypto = wallet.type === 'Crypto';
                    const isStocks = wallet.type === 'Stocks';

                    // Use walletDeductAmount (native coin units) for crypto/stocks
                    const nativeAmount = (isCrypto || isStocks)
                        ? (walletDeductAmount != null ? Math.abs(parseFloat(walletDeductAmount)) : total)
                        : total;

                    if (isFiat || isCrypto || isStocks) {
                        const isCredit = wallet.type === 'Credit';
                        
                        if (isCredit) {
                            // FOR CREDIT WALLETS: Shopping (expense) increases the owed balance
                            wallet.balance += nativeAmount;
                        } else {
                            // NORMAL WALLETS: Expense decreases balance
                            wallet.balance -= nativeAmount;
                        }

                        // Guard against negative balance for non-credit wallets
                        if (!isCredit && wallet.balance < 0) wallet.balance = 0;
                        
                        await wallet.save();
                        
                        // Attach native info to the transaction (tx) for history view
                        tx.walletAmount = nativeAmount;
                        tx.walletCurrency = isCrypto ? wallet.coinSymbol : (isStocks ? (wallet.stockSymbol || wallet.stockTicker) : 'PHP');
                        await tx.save();
                        if (io) io.to(`user:${req.userId}`).emit('wallet_updated', wallet.toObject());
                    }
                }
            }

            const fullTx = await Transaction.findById(tx._id).populate('wallet', 'name type color').lean();
            const decryptedTx = decryptNote(fullTx);

            if (io) io.to(`user:${req.userId}`).emit('new_transaction', decryptedTx);
        }

        // ── Save Barcoded Items to User's Personal Price DB ───────────────────
        for (const item of session.items) {
            if (item.barcode && item.barcode.trim() !== '') {
                await BarcodePrice.findOneAndUpdate(
                    { user: req.userId, barcode: item.barcode },
                    {
                        $set: { name: item.name, price: item.price },
                        $inc: { count: 1 },
                        $push: { priceHistory: { price: item.price, recordedAt: new Date() } }
                    },
                    { 
                        upsert: true, 
                        returnDocument: 'after', 
                        runValidators: true 
                    }
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

