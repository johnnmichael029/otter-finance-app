/**
 * OTTER — Exchange Rate Service
 * ──────────────────────────────────────────────────────────────────────────────
 * Fetches live currency exchange rates from Open Exchange Rates API (free, no key).
 * Caches results for 1 hour to avoid excessive API calls.
 *
 * API: https://open.er-api.com/v6/latest/USD  (free, updates every 24h)
 */

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// In-memory cache: { USD: { rates: {...}, fetchedAt: Date } }
const rateCache = {};

// ── Fetch rates for a given base currency ─────────────────────────────────────
const getRates = async (base = 'USD') => {
    const now = Date.now();
    const cached = rateCache[base];

    // Return cache if still fresh
    if (cached && (now - cached.fetchedAt) < CACHE_TTL_MS) {
        return cached.rates;
    }

    try {
        const url = `https://open.er-api.com/v6/latest/${base}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Exchange API responded with ${res.status}`);
        const data = await res.json();

        if (data.result !== 'success') {
            throw new Error(`Exchange API error: ${data['error-type'] || 'unknown'}`);
        }

        rateCache[base] = { rates: data.rates, fetchedAt: now };
        console.log(`[Currency] ✅ Fetched fresh rates for ${base} (${Object.keys(data.rates).length} currencies)`);
        return data.rates;
    } catch (err) {
        console.error('[Currency] ❌ Failed to fetch rates:', err.message);
        // Return stale cache if available rather than crashing
        if (cached) {
            console.warn('[Currency] ⚠️  Returning stale cache due to fetch error');
            return cached.rates;
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
    const usdRates = await getRates('USD');

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
