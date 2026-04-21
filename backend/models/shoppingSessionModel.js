const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema({
    barcode: { type: String, default: '' },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, default: 1 },
}, { _id: true });

const shoppingSessionSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    label: { type: String, default: 'Shopping Trip' },
    budget: { type: Number, required: true },
    items: [cartItemSchema],
    total: { type: Number, default: 0 },
    paymentMethod: { type: String, enum: ['cash', 'gcash', 'card', 'other'], default: 'cash' },
    source: { type: String, enum: ['main_balance', 'savings_balance'], default: 'main_balance' },
    status: { type: String, enum: ['active', 'completed', 'cancelled'], default: 'active' },
    note: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('ShoppingSession', shoppingSessionSchema);
