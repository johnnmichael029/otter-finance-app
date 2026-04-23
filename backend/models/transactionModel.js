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
    categoryIcon: {
        type: String,
        default: 'circle',
    },
    categoryColor: {
        type: String,
        default: '#6b7280',
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

    // ── Multi-Currency Support ────────────────────────────────────────────────
    // `amount`         → always in the user's BASE currency (e.g. PHP) — used for all math
    // `currency`       → the currency the user entered (e.g. 'USD')
    // `originalAmount` → what the user typed (e.g. 100) in that foreign currency
    // `exchangeRate`   → rate at transaction time (1 USD = X PHP)
    currency: {
        type: String,
        default: 'PHP',
        uppercase: true,
        trim: true,
    },
    originalAmount: {
        type: Number,   // null if transaction was already in base currency
        default: null,
    },
    exchangeRate: {
        type: Number,   // null if no conversion was needed
        default: null,
    },

    runningBalance: {
        type: Number, // Total wallet balance after this transaction
    },
    
    // Link to other entities
    relatedId: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'relatedType',
        default: null,
    },
    relatedType: {
        type: String,
        enum: ['Debt', 'SavingsGoal', null],
        default: null,
    },

    attachment: {
        type: String, // URL/Path to the receipt photo
        default: null,
    },
    wallet: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Wallet',
        default: null,
        index: true,
    },
    // The actual amount deducted from the wallet in its native unit (e.g. BTC, Shares, USD)
    walletAmount: {
        type: Number,
        default: null,
    },
    walletCurrency: {
        type: String,
        default: null,
    },
}, { timestamps: true });

// ── Index for fast user + date range queries ──────────────────────────────────
transactionSchema.index({ user: 1, date: -1 });
transactionSchema.index({ user: 1, type: 1, date: -1 });

module.exports = mongoose.model('Transaction', transactionSchema);
