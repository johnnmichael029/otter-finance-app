const { scanReceipt } = require('../services/ocrService');
const fs = require('fs');

/**
 * POST /api/ocr/scan
 * Receives an image and returns parsed receipt data
 */
const uploadReceipt = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image provided.' });
        }

        const imagePath = req.file.path;
        
        // Process the receipt
        const data = await scanReceipt(imagePath);

        // Optionally delete the file after processing to save space
        // fs.unlinkSync(imagePath); 

        res.json(data);
    } catch (err) {
        console.error('[OCR_CONTROLLER] Error:', err.message);
        res.status(500).json({ error: 'Failed to process receipt. Please try again or enter details manually.' });
    }
};

module.exports = {
    uploadReceipt
};
