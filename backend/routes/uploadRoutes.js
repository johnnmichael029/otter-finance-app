const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { uploadAttachment } = require('../controllers/uploadController');
const verifyToken = require('../middleware/requireAuth');

/**
 * OTTER — Upload Routes
 */

// Configure Multer storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'receipt-' + uniqueSuffix + path.extname(file.originalname));
    }
});

// File filter (images only)
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed!'), false);
    }
};

const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// POST /api/uploads/receipt
router.post('/receipt', verifyToken, upload.single('receipt'), uploadAttachment);

module.exports = router;
