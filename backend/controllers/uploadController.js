const path = require('path');
const fs = require('fs');

/**
 * OTTER — Upload Controller
 * Handles receipt photo uploads for transactions.
 */
const uploadAttachment = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded.' });
        }

        // Relative path for storage in DB, e.g. /uploads/receipt-123.jpg
        const fileUrl = `/uploads/${req.file.filename}`;

        res.json({
            message: 'File uploaded successfully',
            url: fileUrl,
            filename: req.file.filename
        });
    } catch (err) {
        console.error('[UPLOAD] Error:', err.message);
        res.status(500).json({ error: 'Failed to upload file.' });
    }
};

module.exports = {
    uploadAttachment
};
