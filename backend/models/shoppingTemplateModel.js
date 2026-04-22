const mongoose = require('mongoose');

const templateItemSchema = new mongoose.Schema({
    name: { type: String, required: true },
    price: { type: Number, default: 0 },
    quantity: { type: Number, default: 1 },
    barcode: { type: String, default: '' },
}, { _id: false });

const shoppingTemplateSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },  // e.g. "Weekly Groceries"
    emoji: { type: String, default: '🛒' },
    items: [templateItemSchema],
    defaultBudget: { type: Number, default: 0 },
    usageCount: { type: Number, default: 0 },
}, { timestamps: true });

shoppingTemplateSchema.index({ user: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('ShoppingTemplate', shoppingTemplateSchema);
