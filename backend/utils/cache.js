/* ══════════════════════════════════════════════════════════════
   OTTER — In-Memory Cache Utility

   A lightweight, zero-dependency caching layer.
   - Stores data in a Map with TTL-based expiry
   - Supports prefix-based invalidation (e.g., clear all 'transaction:*')
   - Thread-safe for single-process Node.js
   ══════════════════════════════════════════════════════════════ */

const store = new Map();

/**
 * Get a cached value. Returns null if missing or expired.
 * @param {string} key
 */
const getCache = (key) => {
    const item = store.get(key);
    if (!item) return null;
    if (Date.now() > item.expiresAt) {
        store.delete(key);
        return null;
    }
    return item.data;
};

/**
 * Store a value in cache with a TTL.
 * @param {string} key
 * @param {*} data
 * @param {number} ttlSeconds - Default: 60s
 */
const setCache = (key, data, ttlSeconds = 60) => {
    store.set(key, {
        data,
        expiresAt: Date.now() + ttlSeconds * 1000,
        cachedAt: new Date().toISOString(),
    });
};

/**
 * Delete a specific cache key.
 * @param {string} key
 */
const deleteCache = (key) => {
    store.delete(key);
};

/**
 * Invalidate all cache keys that start with a given prefix.
 * e.g., invalidatePrefix('transaction') clears 'transaction:/api/transactions?...'
 * @param {string} prefix
 */
const invalidatePrefix = (prefix) => {
    let count = 0;
    for (const key of store.keys()) {
        if (key.startsWith(prefix)) {
            store.delete(key);
            count++;
        }
    }
    if (count > 0) {
        console.log(`[CACHE] Invalidated ${count} key(s) with prefix "${prefix}"`);
    }
};

/**
 * Invalidate multiple prefixes at once.
 * @param {...string} prefixes
 */
const invalidatePrefixes = (...prefixes) => {
    prefixes.forEach(invalidatePrefix);
};

/**
 * Clear the entire cache.
 */
const clearAll = () => {
    store.clear();
    console.log('[CACHE] Full cache cleared.');
};

/**
 * Get cache stats for debugging.
 */
const getStats = () => {
    const now = Date.now();
    let active = 0, expired = 0;
    for (const item of store.values()) {
        if (now > item.expiresAt) expired++;
        else active++;
    }
    return { totalKeys: store.size, activeKeys: active, expiredKeys: expired };
};

module.exports = { getCache, setCache, deleteCache, invalidatePrefix, invalidatePrefixes, clearAll, getStats };
