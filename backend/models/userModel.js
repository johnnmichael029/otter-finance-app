const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

/**
 * OTTER — User Model
 * Represents a registered app user.
 * Auth is Bearer-token only (mobile-first).
 */
const userSchema = new mongoose.Schema({
    // ── Identity ──────────────────────────────────────────────────────────────
    name: {
        type: String,
        required: [true, 'Name is required.'],
        trim: true,
    },
    email: {
        type: String,
        required: [true, 'Email is required.'],
        unique: true,
        lowercase: true,
        trim: true,
    },
    password: {
        type: String,
        required: [true, 'Password is required.'],
        minlength: [6, 'Password must be at least 6 characters.'],
    },

    // ── Push Notifications ────────────────────────────────────────────────────
    // Stored after Expo issues a push token on the device
    pushToken: {
        type: String,
        default: null,
    },

    // ── App Preferences ───────────────────────────────────────────────────────
    currency: {
        type: String,
        default: 'PHP', // Default to Philippine Peso
    },
    avatarUrl: {
        type: String,
        default: null,
    },

}, { timestamps: true });

// ── Pre-save hook: hash password before storing ───────────────────────────────
userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

// ── Instance method: compare plain password to hash ──────────────────────────
userSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
