const mongoose = require('mongoose');

const challengeSchema = new mongoose.Schema({
    user: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    title: { 
        type: String, 
        required: true 
    },
    description: { 
        type: String, 
        required: true 
    },
    type: { 
        type: String, 
        enum: ['52-week', 'no-spend', 'fixed-target', 'round-up'], 
        required: true 
    },
    status: { 
        type: String, 
        enum: ['active', 'completed', 'failed', 'abandoned', 'archived'], 
        default: 'active' 
    },
    targetAmount: { 
        type: Number, 
        default: 0 
    },
    currentAmount: { 
        type: Number, 
        default: 0 
    },
    startDate: { 
        type: Date, 
        required: true,
        default: Date.now
    },
    endDate: { 
        type: Date 
    },
    // Flexible object to store type-specific progress state
    // e.g., { weeks: [ {week: 1, amount: 100, deposited: true}, ... ] }
    // e.g., { failedDates: [] }
    progressData: { 
        type: mongoose.Schema.Types.Mixed, 
        default: {} 
    },
    icon: { 
        type: String, 
        default: 'award' 
    },
    color: { 
        type: String, 
        default: '#8b5cf6' 
    },
    // Social features
    isShared: { 
        type: Boolean, 
        default: false 
    },
    participants: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
        currentAmount: { type: Number, default: 0 },
        progressData: { type: mongoose.Schema.Types.Mixed, default: {} }
    }]
}, { timestamps: true });

module.exports = mongoose.model('Challenge', challengeSchema);
