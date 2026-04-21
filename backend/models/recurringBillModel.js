const mongoose = require('mongoose');

const recurringBillSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    name: {
        type: String,
        required: [true, 'Bill name is required.'],
        trim: true,
    },
    amount: {
        type: Number,
        required: [true, 'Amount is required.'],
        min: [0.01, 'Amount must be greater than 0.'],
    },
    category: {
        type: String,
        default: 'Bills',
        trim: true,
    },
    categoryIcon: { type: String, default: 'file-text' },
    categoryColor: { type: String, default: '#ef4444' },
    frequency: {
        type: String,
        enum: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'],
        default: 'monthly',
    },
    // The next date this bill is due
    nextDueDate: {
        type: Date,
        required: true,
    },
    // Whether the user has been notified for the current cycle
    notified: { type: Boolean, default: false },
    // Whether the bill is active
    isActive: { type: Boolean, default: true },
}, { timestamps: true });

recurringBillSchema.index({ user: 1, nextDueDate: 1 });

module.exports = mongoose.model('RecurringBill', recurringBillSchema);
