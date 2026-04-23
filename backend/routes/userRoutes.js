const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const validate = require('../middleware/validate');
const { getProfile, updateProfile, savePushToken, completeOnboarding } = require('../controllers/userController');

// All user routes require authentication
router.use(requireAuth);

// GET  /api/users/me           — get own profile
router.get('/me', getProfile);

// PATCH /api/users/me          — update name, currency, avatar
router.patch('/me', validate.updateProfile, updateProfile);

// POST /api/users/push-token   — save Expo push token after login
router.post('/push-token', savePushToken);

// POST /api/users/complete-onboarding — mark as onboarded
router.post('/complete-onboarding', completeOnboarding);

module.exports = router;
