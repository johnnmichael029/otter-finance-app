const mongoose = require('mongoose');

/**
 * OTTER — Transaction Model
 * Covers both EXPENSE and INCOME entries.
 * Discriminated by the `type` field.
 */
const transactionSchema = new mongoose.Schema({
    // ── Ownership ─────────────────────────────────────────────────────────────
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },

    // ── Core Fields ───────────────────────────────────────────────────────────
    type: {
        type: String,
        enum: ['expense', 'income'],
        required: [true, 'Transaction type is required.'],
    },
    amount: {
        type: Number,
        required: [true, 'Amount is required.'],
        min: [0.01, 'Amount must be greater than 0.'],
    },
    description: {
        type: String,
        trim: true,
        default: '',
    },

    // ── Category ──────────────────────────────────────────────────────────────
    // Expense categories: Food, Bills, Transport, Shopping, Health, Entertainment, Other
    // Income categories: Salary, Freelance, Business, Investment, Other
    category: {
        type: String,
        required: [true, 'Category is required.'],
        trim: true,
    },

    // ── Date (user-specified, not necessarily createdAt) ──────────────────────
    date: {
        type: Date,
        required: true,
        default: Date.now,
    },

    // ── Optional Note / Tag ───────────────────────────────────────────────────
    note: {
        type: String,
        trim: true,
        default: '',
    },

}, { timestamps: true });

// ── Index for fast user + date range queries ──────────────────────────────────
transactionSchema.index({ user: 1, date: -1 });
transactionSchema.index({ user: 1, type: 1, date: -1 });

module.exports = mongoose.model('Transaction', transactionSchema);
