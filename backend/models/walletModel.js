const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema({
    userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name:         { type: String, required: true },
    type:         { type: String, enum: ['Debit', 'Credit', 'Stocks', 'Crypto', 'Cash', 'E-Wallet'], required: true },
    templateId:   { type: String, default: 'custom' },
    balance:      { type: Number, default: 0 },
    color:        { type: String, default: '#374151' },
    isArchived:   { type: Boolean, default: false },
    hideBalance:  { type: Boolean, default: false },
    // ── Crypto fields ──────────────────────────────────────────────
    coinId:       { type: String, default: null },
    coinSymbol:   { type: String, default: null },
    coinName:     { type: String, default: null },
    coinImageUrl: { type: String, default: null },
    // ── Stocks fields ─────────────────────────────────────────────
    stockTicker:   { type: String, default: null },  // e.g. 'JFC.PS'
    stockSymbol:   { type: String, default: null },  // e.g. 'JFC'
    stockName:     { type: String, default: null },  // e.g. 'Jollibee Foods Corp'
    stockExchange: { type: String, default: null },  // e.g. 'PSE'
}, { timestamps: true });

module.exports = mongoose.model('Wallet', walletSchema);

