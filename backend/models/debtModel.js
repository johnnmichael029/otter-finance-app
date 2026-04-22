const mongoose = require('mongoose');

/**
 * OTTER — Debt Model (Debt Sentinel)
 * Tracks money you OWE to someone, or money someone OWES you.
 * Supports installment plans with penalty interest after grace period.
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
    // 'owed_by_me'   → I owe money to someone (I borrowed / installment plan)
    // 'owed_to_me'   → Someone owes me money (I lent)
    direction: {
        type: String,
        enum: ['owed_by_me', 'owed_to_me'],
        required: [true, 'Debt direction is required.'],
    },

    // ── The Other Party / Label ───────────────────────────────────────────────
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
    amountPaid: {
        type: Number,
        default: 0,
        min: 0,
    },

    // ── Description ───────────────────────────────────────────────────────────
    description: {
        type: String,
        trim: true,
        default: '',
    },

    // ── Installment Plan Settings ─────────────────────────────────────────────
    isInstallment: {
        type: Boolean,
        default: false,             // true = phone plan, credit installment, etc.
    },
    monthlyPayment: {
        type: Number,
        default: null,              // Fixed monthly payment amount (e.g. ₱1,000)
    },
    gracePeriodMonths: {
        type: Number,
        default: 0,                 // # of months at 0% (e.g. 12 for "12-month 0% plan")
    },
    penaltyRate: {
        type: Number,
        default: 0,                 // Monthly penalty % applied AFTER grace period (e.g. 20)
    },

    // ── Dates ─────────────────────────────────────────────────────────────────
    dateBorrowed: {
        type: Date,
        default: Date.now,
    },
    dueDate: {
        type: Date,
        default: null,              // Final due date (end of grace period)
    },

    // ── Status ────────────────────────────────────────────────────────────────
    status: {
        type: String,
        enum: ['pending', 'partial', 'settled'],
        default: 'pending',
    },

    // ── Push Reminder ─────────────────────────────────────────────────────────
    reminderSent: {
        type: Boolean,
        default: false,
    },

}, { timestamps: true });

// ── Virtual: outstanding principal (before interest) ──────────────────────────
debtSchema.virtual('balance').get(function () {
    return Math.max(0, this.amount - this.amountPaid);
});

// ── Index for fast user + status queries ─────────────────────────────────────
debtSchema.index({ user: 1, status: 1 });
debtSchema.index({ user: 1, dueDate: 1 });

module.exports = mongoose.model('Debt', debtSchema);
