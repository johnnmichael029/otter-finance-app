const mongoose = require('mongoose');

const budgetSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    // 'daily', 'weekly', 'monthly'
    period: {
        type: String,
        enum: ['daily', 'weekly', 'monthly'],
        default: 'monthly',
        required: true,
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
    reminderAmount: {
        type: Number,
        default: 0,
        min: [0, 'Reminder cannot be negative.'],
    },
    // Sub-budgets (Tags mapping to amounts)
    subBudgets: [{
        tag: { type: String, required: true, trim: true },
        amount: { type: Number, required: true, min: 0 },
        icon: { type: String, default: 'tag' }
    }],
    isShared: { type: Boolean, default: false },
    participants: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
        joinedAt: { type: Date }
    }],
}, { timestamps: true });

// Each user can only have one budget rule per category per period
budgetSchema.index({ user: 1, category: 1, period: 1 }, { unique: true });

module.exports = mongoose.model('Budget', budgetSchema);
