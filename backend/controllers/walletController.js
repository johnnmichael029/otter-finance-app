const Wallet = require('../models/walletModel');

// ── GET /api/wallets ────────────────────────────────────────────────────────
exports.getWallets = async (req, res) => {
    try {
        const wallets = await Wallet.find({ userId: req.userId, isArchived: false }).sort({ createdAt: 1 });
        res.json({ wallets });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch wallets.' });
    }
};

// ── POST /api/wallets ───────────────────────────────────────────────────────
exports.createWallet = async (req, res) => {
    try {
        const {
            name, type, templateId, balance, color, currency,
            coinId, coinSymbol, coinName, coinImageUrl,
            stockTicker, stockSymbol, stockName, stockExchange
        } = req.body;
        const wallet = await Wallet.create({
            userId: req.userId,
            name, type, templateId, balance, color, currency: currency || 'PHP',
            coinId, coinSymbol, coinName, coinImageUrl,
            stockTicker, stockSymbol, stockName, stockExchange
        });
        req.app.get('io')?.to(`user:${req.userId}`).emit('wallet_created', wallet);
        res.status(201).json(wallet);
    } catch (err) {
        res.status(500).json({ error: 'Failed to create wallet.' });
    }
};

// ── PUT /api/wallets/:id ────────────────────────────────────────────────────
exports.updateWallet = async (req, res) => {
    try {
        const updatableFields = ['name', 'type', 'color', 'balance', 'isArchived', 'hideBalance'];
        const updateData = {};
        for (const field of updatableFields) {
            if (req.body[field] !== undefined) updateData[field] = req.body[field];
        }

        const wallet = await Wallet.findOneAndUpdate(
            { _id: req.params.id, userId: req.userId },
            { $set: updateData },
            { returnDocument: 'after', runValidators: true }
        );
        if (!wallet) return res.status(404).json({ error: 'Wallet not found' });
        req.app.get('io')?.to(`user:${req.userId}`).emit('wallet_updated', wallet);
        res.json(wallet);
    } catch (err) {
        res.status(500).json({ error: 'Failed to update wallet.' });
    }
};

// ── DELETE /api/wallets/:id ─────────────────────────────────────────────────
exports.deleteWallet = async (req, res) => {
    try {
        const wallet = await Wallet.findOneAndDelete({ _id: req.params.id, userId: req.userId });
        if (!wallet) return res.status(404).json({ error: 'Wallet not found' });
        req.app.get('io')?.to(`user:${req.userId}`).emit('wallet_deleted', { _id: req.params.id });
        res.json({ message: 'Wallet deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete wallet.' });
    }
};
