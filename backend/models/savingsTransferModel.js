const mongoose = require('mongoose');

const savingsTransferSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // 'to_savings' = Main → Savings Goal, 'from_savings' = Savings Goal → Main, 'spent_from_savings' = Goal completed/bought
    direction: { type: String, enum: ['to_savings', 'from_savings', 'spent_from_savings', 'transfer_goal', 'income'], required: true },
    amount: { type: Number, required: true, min: 0 },
    goal: { type: mongoose.Schema.Types.ObjectId, ref: 'SavingsGoal', required: true },
    goalName: { type: String },
    wallet: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet' },
    walletAmount: { type: Number },
    walletCurrency: { type: String },
    note: { type: String, default: '' },
    runningBalance: { type: Number }, // Snapshot of goal balance after transfer
    relatedTransaction: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // The user who actually made the transfer
    isArchived: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('SavingsTransfer', savingsTransferSchema);
