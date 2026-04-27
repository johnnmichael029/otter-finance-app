const mongoose = require('mongoose');

const groupWalletSchema = new mongoose.Schema({
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true },
    emoji: { type: String, default: '✈️' },
    color: { type: String, default: '#6366f1' },
    coverPhoto: { type: String, default: null },
    currency: { type: String, default: 'PHP' },
    participants: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
        joinedAt: { type: Date }
    }],
    expenses: [{
        paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        amount: { type: Number, required: true, min: 0 },
        description: { type: String, required: true },
        category: { type: String, default: 'General' },
        categoryIcon: { type: String },
        categoryColor: { type: String },
        date: { type: Date, default: Date.now },
        splitAmong: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }] // If empty, split among all accepted participants
    }],
    customCategories: [{
        name: { type: String, required: true },
        icon: { type: String, required: true },
        color: { type: String, default: '#E91E8C' }
    }],
    isArchived: { type: Boolean, default: false },
    isSettled: { type: Boolean, default: false },
    archivedAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('GroupWallet', groupWalletSchema);
