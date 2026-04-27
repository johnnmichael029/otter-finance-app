const mongoose = require('mongoose');

const NetWorthSnapshotSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    date: {
        type: Date,
        default: Date.now
    },
    totalAssets: {
        type: Number,
        default: 0
    },
    totalLiabilities: {
        type: Number,
        default: 0
    },
    netWorth: {
        type: Number,
        default: 0
    },
    breakdown: {
        wallets: Number,
        savings: Number,
        debts: Number,
        creditCards: Number
    }
}, { timestamps: true });

// Ensure one snapshot per user per day
NetWorthSnapshotSchema.index({ user: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('NetWorthSnapshot', NetWorthSnapshotSchema);
