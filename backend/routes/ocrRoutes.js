const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const upload = require('../middleware/upload');
const { uploadReceipt } = require('../controllers/ocrController');

// All OCR routes require auth
router.use(requireAuth);

/**
 * Middleware to set the upload type for multer
 */
const setUploadType = (type) => (req, res, next) => {
    req.uploadType = type;
    next();
};

// POST /api/ocr/scan
router.post('/scan', setUploadType('receipts'), upload.single('receipt'), uploadReceipt);

module.exports = router;
