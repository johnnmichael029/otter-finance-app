const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const validate = require('../middleware/validate');
const upload = require('../middleware/upload');
const { 
    getProfile, 
    updateProfile, 
    savePushToken, 
    completeOnboarding,
    changePassword,
    wipeFinancialData,
    deleteAccount,
    uploadAvatar,
    checkTagAvailability
} = require('../controllers/userController');

// All user routes require authentication
router.use(requireAuth);

// GET  /api/users/me           — get own profile
router.get('/me', getProfile);

// POST /api/users/avatar        — upload profile picture
router.post('/avatar', upload.single('avatar'), uploadAvatar);

// PATCH /api/users/me          — update name, currency, avatar
router.patch('/me', validate.updateProfile, updateProfile);

// POST /api/users/push-token   — save Expo push token after login
router.post('/push-token', savePushToken);

// POST /api/users/complete-onboarding — mark as onboarded
router.post('/complete-onboarding', completeOnboarding);

// GET /api/users/check-tag — check if otterTag is available
router.get('/check-tag', checkTagAvailability);

// ── Security & Data Management ──────────────────────────────────────────────

// POST /api/users/change-password — change account password
router.post('/change-password', changePassword);

// POST /api/users/wipe-data       — delete all financial data
router.post('/wipe-data', wipeFinancialData);

// DELETE /api/users/me           — delete entire account
router.delete('/me', deleteAccount);

module.exports = router;
