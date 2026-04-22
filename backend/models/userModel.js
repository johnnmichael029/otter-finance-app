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

    // ── Sessions (Refresh Token Store) ────────────────────────────────────────
    // Each login creates a session entry. Used for session management & revocation.
    sessions: [{
        tokenHash:  { type: String, required: true },  // SHA-256 of the refresh token
        deviceInfo: { type: String, default: 'Unknown Device' },
        platform:   { type: String, default: 'mobile' },
        ipAddress:  { type: String, default: null },
        createdAt:  { type: Date, default: Date.now },
        expiresAt:  { type: Date, required: true },
        lastUsedAt: { type: Date, default: Date.now },
    }],
    // ── Smart Account Lockout ──────────────────────────────────────────────────
    // loginAttempts is CUMULATIVE — never resets until a successful login.
    // This drives the exponential backoff: more total failures = longer locks.
    loginAttempts: { type: Number, default: 0 },
    lockUntil:     { type: Date,   default: null },

    // ── Two-Factor Authentication (2FA) ───────────────────────────────────────
    twoFactorEnabled: { type: Boolean, default: false },
    twoFAOTP:         { type: String,  default: null },  // SHA-256 hashed 6-digit OTP
    twoFAExpiry:      { type: Date,    default: null },  // Expires in 10 minutes

}, { timestamps: true });

// ── Pre-save hook: hash password before storing ───────────────────────────────
userSchema.pre('save', async function () {
    if (!this.isModified('password')) return;
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

// ── Instance method: compare plain password to hash ──────────────────────────
userSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
