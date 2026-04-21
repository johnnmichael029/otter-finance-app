const mongoose = require('mongoose');

const budgetSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    // 'YYYY-MM' — one budget entry per category per month
    month: {
        type: String,
        required: true,
        match: [/^\d{4}-\d{2}$/, 'Month must be in YYYY-MM format.'],
    },
    // 'Overall' OR a category name like 'Food', 'Transport', etc.
    category: {
        type: String,
        required: true,
        trim: true,
    },
    categoryIcon: { type: String, default: 'pie-chart' },
    categoryColor: { type: String, default: '#E91E8C' },
    allocatedAmount: {
        type: Number,
        required: true,
        min: [0, 'Budget cannot be negative.'],
    },
}, { timestamps: true });

// Each user can only have one budget per category per month
budgetSchema.index({ user: 1, month: 1, category: 1 }, { unique: true });

module.exports = mongoose.model('Budget', budgetSchema);
