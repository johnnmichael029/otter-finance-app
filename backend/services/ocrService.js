const Tesseract = require('tesseract.js');

/**
 * Processes an image and extracts receipt data (Merchant, Amount, Date)
 * @param {string} imagePath 
 * @returns {Promise<{merchant: string, amount: number, date: Date}>}
 */
const scanReceipt = async (imagePath) => {
    try {
        console.log(`[OCR] Starting scan for: ${imagePath}`);
        
        const result = await Tesseract.recognize(
            imagePath,
            'eng',
            { logger: m => console.log(`[OCR] ${m.status}: ${Math.round(m.progress * 100)}%`) }
        );

        const text = result.data.text;
        console.log('[OCR] Text recognized:', text.substring(0, 100) + '...');

        return parseReceiptText(text);
    } catch (err) {
        console.error('[OCR] scanReceipt error:', err.message);
        throw new Error('Failed to process receipt image.');
    }
};

/**
 * Simple Regex-based parser for receipt text
 */
const parseReceiptText = (text) => {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    let merchant = lines[0] || ''; // Usually first line is merchant
    let amount = 0;
    let date = new Date();

    // 1. Amount Extraction
    // Look for lines containing "TOTAL", "AMOUNT", "DUE", etc.
    const totalRegex = /(TOTAL|AMOUNT|DUE|BALANCE|PAYABLE|SUBTOTAL|NET)[:\s]*[₱$P]?\s?([\d,]+\.?\d*)/i;
    
    // Reverse search because Total is usually at the bottom
    for (let i = lines.length - 1; i >= 0; i--) {
        const match = lines[i].match(totalRegex);
        if (match && match[2]) {
            const foundAmount = parseFloat(match[2].replace(/,/g, ''));
            if (foundAmount > amount) {
                amount = foundAmount;
                // If the line doesn't explicitly say "TOTAL", keep looking for a bigger number
                if (lines[i].toUpperCase().includes('TOTAL')) break;
            }
        }
    }

    // Fallback: If no "TOTAL" keyword, find the largest currency-like number
    if (amount === 0) {
        const fallbackRegex = /[₱$P]?\s?([\d,]+\.\d{2})/g;
        let m;
        while ((m = fallbackRegex.exec(text)) !== null) {
            const val = parseFloat(m[1].replace(/,/g, ''));
            if (val > amount) amount = val;
        }
    }

    // 2. Merchant Refinement
    // If first line is a date or something else, try second line
    if (merchant.match(/\d/) && lines[1]) {
        merchant = lines[1];
    }
    // Clean up common receipt header garbage
    merchant = merchant.replace(/[*#=]/g, '').trim();

    // 3. Date Extraction
    const dateRegex = /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/;
    const dateMatch = text.match(dateRegex);
    if (dateMatch) {
        // Try parsing the date
        const d = new Date(dateMatch[0]);
        if (!isNaN(d.getTime())) date = d;
    }

    return {
        merchant,
        amount,
        date,
        rawText: text.substring(0, 500) // For debugging
    };
};

module.exports = {
    scanReceipt
};
