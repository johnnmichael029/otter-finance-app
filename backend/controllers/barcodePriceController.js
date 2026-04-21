const BarcodePrice = require('../models/barcodePriceModel');

// GET /api/barcodes/:barcode — lookup a single barcode for the authenticated user
exports.getBarcode = async (req, res) => {
    try {
        const entry = await BarcodePrice.findOne({
            user: req.user._id,
            barcode: req.params.barcode,
        });
        if (!entry) return res.status(404).json({ message: 'Not found' });
        res.json(entry);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// POST /api/barcodes — upsert a barcode price entry (create or update)
exports.upsertBarcode = async (req, res) => {
    try {
        const { barcode, name, brand, price } = req.body;
        if (!barcode || !name || price == null) {
            return res.status(400).json({ error: 'barcode, name, and price are required.' });
        }

        const entry = await BarcodePrice.findOneAndUpdate(
            { user: req.user._id, barcode },
            {
                $set: { name, brand: brand || '', price },
                $inc: { count: 1 },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        res.status(200).json(entry);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// GET /api/barcodes — list all saved barcodes for the user
exports.listBarcodes = async (req, res) => {
    try {
        const entries = await BarcodePrice.find({ user: req.user._id })
            .sort({ updatedAt: -1 })
            .limit(200);
        res.json(entries);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// DELETE /api/barcodes/:barcode — remove a single barcode entry
exports.deleteBarcode = async (req, res) => {
    try {
        await BarcodePrice.findOneAndDelete({
            user: req.user._id,
            barcode: req.params.barcode,
        });
        res.json({ message: 'Deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
