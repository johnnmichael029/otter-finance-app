const jwt = require('jsonwebtoken');
const User = require('../models/userModel');

/**
 * Middleware: requireAuth (Mobile Bearer Token Strategy)
 * Verifies the JWT sent in the Authorization: Bearer <token> header.
 * OTTER is mobile-only — no cookie-based auth.
 * Usage: router.get('/me', requireAuth, getProfile)
 */
const requireAuth = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authorization token required.' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const user = await User.findById(decoded.id).select('-password');
        if (!user) {
            return res.status(401).json({ error: 'Session invalid: User not found.' });
        }

        req.user = user;       // Full user object for controllers
        req.userId = decoded.id;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Session expired or invalid. Please log in again.' });
    }
};

module.exports = requireAuth;
