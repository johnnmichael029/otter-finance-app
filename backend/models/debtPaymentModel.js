/**
 * OTTER — Debt Payment Log Model
 * Records each installment payment made against a debt.
 */
const mongoose = require('mongoose');

const debtPaymentSchema = new mongoose.Schema({
    debt: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Debt',
        required: true,
        index: true,
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    amount: {
        type: Number,
        required: true,
        min: [0.01, 'Payment must be greater than 0.'],
    },
    note: {
        type: String,
        default: '',
        trim: true,
    },
    paidAt: {
        type: Date,
        default: Date.now,
    },
    wallet: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Wallet',
        default: null,
    },
    walletAmount: {
        type: Number,
        default: null,
    },
    walletCurrency: {
        type: String,
        default: null,
    },
    transactionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Transaction',
        default: null,
    },
}, { timestamps: true });


debtPaymentSchema.index({ debt: 1, paidAt: -1 });

module.exports = mongoose.model('DebtPayment', debtPaymentSchema);
