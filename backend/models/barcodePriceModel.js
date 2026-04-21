const mongoose = require('mongoose');

const barcodePriceSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    barcode: { type: String, required: true, trim: true },
    name: { type: String, required: true },
    brand: { type: String, default: '' },
    price: { type: Number, required: true },
    count: { type: Number, default: 1 }, // how many times user has confirmed this item
}, { timestamps: true });

// Compound index: one entry per user per barcode
barcodePriceSchema.index({ user: 1, barcode: 1 }, { unique: true });

module.exports = mongoose.model('BarcodePrice', barcodePriceSchema);
