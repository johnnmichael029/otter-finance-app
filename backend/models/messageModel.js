const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    receiver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    content: {
        type: String,
        required: true,
        trim: true,
    },
    read: {
        type: Boolean,
        default: false,
    },
}, { timestamps: true });

// Index for fetching conversation history between two users quickly
messageSchema.index({ sender: 1, receiver: 1 });

module.exports = mongoose.model('Message', messageSchema);
