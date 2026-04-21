const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const {
    getBarcode,
    upsertBarcode,
    listBarcodes,
    deleteBarcode,
} = require('../controllers/barcodePriceController');

// All barcode routes require authentication
router.use(requireAuth);

// GET  /api/barcodes             — list all saved barcodes for the user
router.get('/', listBarcodes);

// GET  /api/barcodes/:barcode    — look up a single barcode
router.get('/:barcode', getBarcode);

// POST /api/barcodes             — upsert a barcode price entry
router.post('/', upsertBarcode);

// DELETE /api/barcodes/:barcode  — remove a barcode entry
router.delete('/:barcode', deleteBarcode);

module.exports = router;
