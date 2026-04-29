/**
 * OTTER — Exchange Rate Service
 * ──────────────────────────────────────────────────────────────────────────────
 * Fetches live currency exchange rates from Open Exchange Rates API (free, no key).
 * Caches results for 1 hour to avoid excessive API calls.
 *
 * API: https://open.er-api.com/v6/latest/USD  (free, updates every 24h)
 */

const axios = require('axios');
const { getCryptoPrices } = require('../services/cryptoService');

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// In-memory cache: { USD: { rates: {...}, fetchedAt: Date } }
const rateCache = {};

// ── Fetch rates for a given base currency ─────────────────────────────────────
const getRates = async (base = 'USD') => {
    const now = Date.now();
    const cached = rateCache[base];

    // Return cache if still fresh
    if (cached && (now - cached.fetchedAt) < CACHE_TTL_MS) {
        return { rates: cached.rates, updatedAt: cached.updatedAt || null };
    }

    try {
        // 1. Fetch Fiat Rates
        const url = `https://open.er-api.com/v6/latest/${base}`;
        const res = await axios.get(url);
        const data = res.data;

        if (data.result !== 'success') {
            throw new Error(`Exchange API error: ${data['error-type'] || 'unknown'}`);
        }

        const rates = { ...data.rates };

        // 2. Fetch Crypto Prices (using our internal cryptoService/CoinGecko)
        try {
            // Mapping common symbols to Coingecko IDs
            const cryptoMap = {
                'BTC': 'bitcoin',
                'ETH': 'ethereum',
                'USDT': 'tether',
                'BNB': 'binancecoin',
                'SOL': 'solana'
            };
            
            const cryptoIds = Object.values(cryptoMap);
            const phpPrices = await getCryptoPrices(cryptoIds);
            
            if (Object.keys(phpPrices).length > 0) {
                const baseCurrency = base.toUpperCase();
                const phpPerBase = rates['PHP'] || 1; // e.g., 56 PHP per 1 USD
                
                // Convert PHP prices from CoinGecko to our target base currency
                // If base is PHP: rate = 1 / php_price
                // If base is USD: rate = (1 / php_price) * phpPerBase
                for (const [symbol, cgId] of Object.entries(cryptoMap)) {
                    const phpPrice = phpPrices[cgId];
                    if (phpPrice) {
                        rates[symbol] = (1 / phpPrice) * phpPerBase;
                    }
                }
                console.log(`[Currency] ₿ Added ${Object.keys(phpPrices).length} crypto rates to ${baseCurrency}`);
            }
        } catch (btcErr) {
            console.warn('[Currency] ⚠️ Could not fetch crypto prices, skipping.');
        }

        rateCache[base] = { rates, fetchedAt: now, updatedAt: data.time_last_update_utc || null };
        console.log(`[Currency] ✅ Fetched fresh rates for ${base} (${Object.keys(rates).length} currencies)`);
        return { rates, updatedAt: data.time_last_update_utc || null };
    } catch (err) {
        console.error('[Currency] ❌ Failed to fetch rates:', err.message);
        // Return stale cache if available rather than crashing
        if (cached) {
            console.warn('[Currency] ⚠️  Returning stale cache due to fetch error');
            return { rates: cached.rates, updatedAt: cached.updatedAt || null };
        }
        throw err;
    }
};

// ── Convert an amount between two currencies ──────────────────────────────────
// Returns { convertedAmount, rate }
const convert = async (amount, fromCurrency, toCurrency) => {
    if (fromCurrency === toCurrency) {
        return { convertedAmount: amount, rate: 1 };
    }

    // Always fetch via USD as the universal pivot to maximize cache reuse
    const { rates: usdRates } = await getRates('USD');

    const fromRate = usdRates[fromCurrency];
    const toRate   = usdRates[toCurrency];

    if (!fromRate || !toRate) {
        throw new Error(`Unsupported currency: ${!fromRate ? fromCurrency : toCurrency}`);
    }

    // Convert via USD pivot: fromCurrency → USD → toCurrency
    const inUSD = amount / fromRate;
    const convertedAmount = inUSD * toRate;
    const rate = toRate / fromRate;

    return {
        convertedAmount: Math.round(convertedAmount * 100) / 100,
        rate: Math.round(rate * 10000) / 10000,
    };
};

// ── List of popular currencies with flags and names ───────────────────────────
const POPULAR_CURRENCIES = [
    { code: 'PHP', name: 'Philippine Peso',      symbol: '₱',  flag: '🇵🇭' },
    { code: 'USD', name: 'US Dollar',             symbol: '$',  flag: '🇺🇸' },
    { code: 'EUR', name: 'Euro',                  symbol: '€',  flag: '🇪🇺' },
    { code: 'GBP', name: 'British Pound',         symbol: '£',  flag: '🇬🇧' },
    { code: 'JPY', name: 'Japanese Yen',          symbol: '¥',  flag: '🇯🇵' },
    { code: 'KRW', name: 'South Korean Won',      symbol: '₩',  flag: '🇰🇷' },
    { code: 'SGD', name: 'Singapore Dollar',      symbol: 'S$', flag: '🇸🇬' },
    { code: 'AUD', name: 'Australian Dollar',     symbol: 'A$', flag: '🇦🇺' },
    { code: 'CAD', name: 'Canadian Dollar',       symbol: 'C$', flag: '🇨🇦' },
    { code: 'HKD', name: 'Hong Kong Dollar',      symbol: 'HK$',flag: '🇭🇰' },
    { code: 'CNY', name: 'Chinese Yuan',          symbol: '¥',  flag: '🇨🇳' },
    { code: 'INR', name: 'Indian Rupee',          symbol: '₹',  flag: '🇮🇳' },
    { code: 'MYR', name: 'Malaysian Ringgit',     symbol: 'RM', flag: '🇲🇾' },
    { code: 'IDR', name: 'Indonesian Rupiah',     symbol: 'Rp', flag: '🇮🇩' },
    { code: 'THB', name: 'Thai Baht',             symbol: '฿',  flag: '🇹🇭' },
    { code: 'SAR', name: 'Saudi Riyal',           symbol: '﷼',  flag: '🇸🇦' },
    { code: 'AED', name: 'UAE Dirham',            symbol: 'د.إ',flag: '🇦🇪' },
];

module.exports = { getRates, convert, POPULAR_CURRENCIES };
