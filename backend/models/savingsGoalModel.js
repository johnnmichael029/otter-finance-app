const mongoose = require('mongoose');

const savingsGoalSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true },
    icon: { type: String, default: 'target' },
    family: { type: String, default: 'feather' },
    color: { type: String, default: '#E91E8C' },
    targetAmount: { type: Number, required: true, min: 0 },
    currentAmount: { type: Number, default: 0 },
    deadline: { type: Date, default: null },
    isCompleted: { type: Boolean, default: false },
    isArchived: { type: Boolean, default: false },
    isShared: { type: Boolean, default: false },
    participants: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
        joinedAt: { type: Date }
    }],
    note: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('SavingsGoal', savingsGoalSchema);
