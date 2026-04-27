const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    type: {
        type: String,
        enum: [
            'budget_alert', 'savings_goal', 'debt_reminder', 'system', 
            'transaction', 'friend_request', 'debt_request', 'friend_accepted', 
            'debt_accepted', 'debt_payment', 'budget_invite', 'budget_invite_accepted',
            'challenge_invite', 'challenge_accepted', 'goal_invite', 'group_trip',
            'trip_invite', 'trip_response'
        ],
        required: true
    },
    title: {
        type: String,
        required: true
    },
    message: {
        type: String,
        required: true
    },
    data: {
        type: mongoose.Schema.Types.Mixed, // For storing extra context like IDs
        default: {}
    },
    isRead: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

// Index for fast fetching of unread notifications
notificationSchema.index({ user: 1, isRead: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
