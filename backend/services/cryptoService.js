const axios = require('axios');
const NodeCache = require('node-cache');
const priceCache = new NodeCache({ stdTTL: 300 }); // Cache for 5 minutes

/**
 * Fetches crypto prices from Coingecko
 * @param {string[]} ids - Array of coingecko coin IDs (e.g., ['bitcoin', 'ethereum'])
 * @returns {Promise<Object>} - Object with prices in PHP
 */
exports.getCryptoPrices = async (ids) => {
    if (!ids || ids.length === 0) return {};

    const uniqueIds = [...new Set(ids)];
    const cacheKey = `prices_${uniqueIds.sort().join(',')}`;
    
    const cached = priceCache.get(cacheKey);
    if (cached) return cached;

    try {
        const url = `https://api.coingecko.com/api/v3/simple/price?ids=${uniqueIds.join(',')}&vs_currencies=php`;
        const response = await axios.get(url);
        const data = response.data;

        const prices = {};
        for (const id in data) {
            prices[id] = data[id].php;
        }

        priceCache.set(cacheKey, prices);
        return prices;
    } catch (err) {
        console.error('[CryptoService] Error fetching prices:', err.message);
        return {};
    }
};
