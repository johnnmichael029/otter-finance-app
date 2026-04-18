const mongoose = require('mongoose');

/**
 * OTTER — Debt Model (Debt Sentinel)
 * Tracks money you OWE to someone, or money someone OWES you.
 * "Otter Pocket" UI shows all unsettled debts.
 */
const debtSchema = new mongoose.Schema({
    // ── Ownership ─────────────────────────────────────────────────────────────
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },

    // ── Direction ─────────────────────────────────────────────────────────────
    // 'owed_by_me'   → I owe money to someone (I borrowed)
    // 'owed_to_me'   → Someone owes me money (I lent)
    direction: {
        type: String,
        enum: ['owed_by_me', 'owed_to_me'],
        required: [true, 'Debt direction is required.'],
    },

    // ── The Other Party ───────────────────────────────────────────────────────
    personName: {
        type: String,
        required: [true, 'Person name is required.'],
        trim: true,
    },

    // ── Amount ────────────────────────────────────────────────────────────────
    amount: {
        type: Number,
        required: [true, 'Amount is required.'],
        min: [0.01, 'Amount must be greater than 0.'],
    },

    // ── Description ───────────────────────────────────────────────────────────
    description: {
        type: String,
        trim: true,
        default: '',
    },

    // ── Dates ─────────────────────────────────────────────────────────────────
    dateBorrowed: {
        type: Date,
        default: Date.now,
    },
    dueDate: {
        type: Date,
        default: null, // Optional due date for reminders
    },

    // ── Status ────────────────────────────────────────────────────────────────
    status: {
        type: String,
        enum: ['pending', 'partial', 'settled'],
        default: 'pending',
    },
    amountPaid: {
        type: Number,
        default: 0, // Tracks partial payments
        min: 0,
    },

    // ── Push Reminder ─────────────────────────────────────────────────────────
    reminderSent: {
        type: Boolean,
        default: false,
    },

}, { timestamps: true });

// ── Virtual: remaining balance ────────────────────────────────────────────────
debtSchema.virtual('balance').get(function () {
    return Math.max(0, this.amount - this.amountPaid);
});

// ── Index for fast user + status queries ─────────────────────────────────────
debtSchema.index({ user: 1, status: 1 });
debtSchema.index({ user: 1, dueDate: 1 });

module.exports = mongoose.model('Debt', debtSchema);
