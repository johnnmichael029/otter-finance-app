const ShoppingTemplate = require('../models/shoppingTemplateModel');
const BarcodePrice = require('../models/barcodePriceModel');

// ─── GET /api/shopping/templates ─────────────────────────────────────────────
const getTemplates = async (req, res) => {
    try {
        const templates = await ShoppingTemplate.find({ user: req.userId }).sort({ usageCount: -1 }).lean();
        res.json({ templates });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch templates.' });
    }
};

// ─── POST /api/shopping/templates ────────────────────────────────────────────
const createTemplate = async (req, res) => {
    try {
        const { name, emoji, items, defaultBudget } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ error: 'Template name is required.' });

        const template = await ShoppingTemplate.create({
            user: req.userId,
            name: name.trim(),
            emoji: emoji || '🛒',
            items,
            defaultBudget: parseFloat(defaultBudget) || 0,
        });

        const io = req.app.get('io');
        if (io) io.to(`user:${req.userId}`).emit('new_shopping_template', template);

        res.status(201).json(template);
    } catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({ error: 'A template with this name already exists.' });
        }
        console.error('[Template] create error:', err);
        res.status(500).json({ error: 'Failed to create template.' });
    }
};

// ─── PATCH /api/shopping/templates/:id ────────────────────────────────────────
const updateTemplate = async (req, res) => {
    try {
        const { name, emoji, items, defaultBudget } = req.body;
        const template = await ShoppingTemplate.findOneAndUpdate(
            { _id: req.params.id, user: req.userId },
            { $set: { name, emoji, items, defaultBudget } },
            { new: true }
        );
        if (!template) return res.status(404).json({ error: 'Template not found.' });

        const io = req.app.get('io');
        if (io) io.to(`user:${req.userId}`).emit('update_shopping_template', template);

        res.json(template);
    } catch (err) {
        res.status(500).json({ error: 'Failed to update template.' });
    }
};

// ─── DELETE /api/shopping/templates/:id ──────────────────────────────────────
const deleteTemplate = async (req, res) => {
    try {
        const template = await ShoppingTemplate.findOneAndDelete({ _id: req.params.id, user: req.userId });
        if (!template) return res.status(404).json({ error: 'Template not found.' });

        const io = req.app.get('io');
        if (io) io.to(`user:${req.userId}`).emit('delete_shopping_template', { _id: req.params.id });

        res.json({ message: 'Template deleted.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete template.' });
    }
};

// ─── POST /api/shopping/templates/:id/use ────────────────────────────────────
// Increment usage count when user loads a template
const useTemplate = async (req, res) => {
    try {
        const template = await ShoppingTemplate.findOneAndUpdate(
            { _id: req.params.id, user: req.userId },
            { $inc: { usageCount: 1 } },
            { new: true }
        );
        if (!template) return res.status(404).json({ error: 'Template not found.' });
        res.json(template);
    } catch (err) {
        res.status(500).json({ error: 'Failed to update usage count.' });
    }
};

// ─── GET /api/shopping/price-history/:barcode ─────────────────────────────────
// Get full price history for a specific barcode
const getPriceHistory = async (req, res) => {
    try {
        const item = await BarcodePrice.findOne({ user: req.userId, barcode: req.params.barcode }).lean();
        if (!item) return res.status(404).json({ found: false });
        res.json({
            found: true,
            name: item.name,
            brand: item.brand,
            currentPrice: item.price,
            count: item.count,
            history: item.priceHistory || [],
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch price history.' });
    }
};

module.exports = { getTemplates, createTemplate, updateTemplate, deleteTemplate, useTemplate, getPriceHistory };
