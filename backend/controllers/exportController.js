const Transaction = require('../models/transactionModel');
const { Parser } = require('json2csv');
const { decryptNote } = require('../utils/encryption');
const mongoose = require('mongoose');

/**
 * GET /api/transactions/export
 * Query: ?startDate=&endDate=&type=&category=
 * Returns a CSV file of filtered transactions
 */
const exportTransactions = async (req, res) => {
    try {
        const { type, category, startDate, endDate, isArchived } = req.query;

        // 1. Build Filter (Reusing logic from transactionController.js)
        const filter = { user: req.userId };
        
        if (isArchived === 'true') {
            filter.isArchived = true;
        } else if (isArchived === 'false') {
            filter.isArchived = { $ne: true };
        }
        // If undefined, we export everything (archived or not) by default for backup purposes

        if (type) filter.type = type;
        if (category) filter.category = category;
        if (startDate || endDate) {
            filter.date = {};
            if (startDate) filter.date.$gte = new Date(startDate);
            if (endDate) filter.date.$lte = new Date(endDate);
        }

        // 2. Fetch Data
        const transactions = await Transaction.find(filter)
            .sort({ date: -1 })
            .populate('wallet', 'name type')
            .populate('sourceWallet', 'name type')
            .lean();

        if (!transactions || transactions.length === 0) {
            return res.status(404).json({ error: 'No transactions found for the selected criteria.' });
        }

        // 3. Map Data for CSV
        const fields = [
            { label: 'Date', value: (row) => new Date(row.date).toLocaleDateString() },
            { label: 'Type', value: 'type' },
            { label: 'Category', value: 'category' },
            { label: 'Description', value: 'description' },
            { label: 'Amount', value: (row) => row.amount.toFixed(2) },
            { label: 'Currency', value: 'currency' },
            { label: 'Payment Source', value: (row) => row.wallet?.name || row.paymentSource || 'HAND' },
            { label: 'Note', value: (row) => decryptNote(row).note || '' },
            { label: 'Status', value: (row) => row.isArchived ? 'Archived' : 'Active' }
        ];

        const json2csvParser = new Parser({ fields });
        const csv = json2csvParser.parse(transactions);

        // 4. Send File
        const filename = `otter_export_${new Date().toISOString().split('T')[0]}.csv`;
        res.header('Content-Type', 'text/csv');
        res.attachment(filename);
        res.send(csv);

    } catch (err) {
        console.error('[EXPORT] exportTransactions error:', err.message);
        res.status(500).json({ error: 'Failed to generate export file.' });
    }
};

module.exports = {
    exportTransactions
};
