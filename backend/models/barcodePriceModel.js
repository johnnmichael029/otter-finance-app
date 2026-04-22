const mongoose = require('mongoose');

const priceHistorySchema = new mongoose.Schema({
    price: { type: Number, required: true },
    recordedAt: { type: Date, default: Date.now },
}, { _id: false });

const barcodePriceSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    barcode: { type: String, required: true, trim: true },
    name: { type: String, required: true },
    brand: { type: String, default: '' },
    price: { type: Number, required: true },  // latest/current price
    count: { type: Number, default: 1 },      // how many times confirmed
    priceHistory: [priceHistorySchema],       // full price change history
}, { timestamps: true });

// Compound index: one entry per user per barcode
barcodePriceSchema.index({ user: 1, barcode: 1 }, { unique: true });

module.exports = mongoose.model('BarcodePrice', barcodePriceSchema);

