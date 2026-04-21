/**
 * Otter Barcode Price Cache
 * Strategy:
 *   - Primary: Backend MongoDB (persists across devices / reinstalls)
 *   - Fallback: AsyncStorage (works offline, syncs when online)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getBarcodePrice, upsertBarcodePrice } from '../api/api';

const LOCAL_KEY = '@otter_barcode_prices';

// ── Local AsyncStorage helpers ──────────────────────────────────────────────

const loadLocal = async () => {
    try {
        const raw = await AsyncStorage.getItem(LOCAL_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
};

const saveLocal = async (barcode, entry) => {
    try {
        const cache = await loadLocal();
        cache[barcode] = entry;
        await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(cache));
    } catch { }
};

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Get cached price for a barcode.
 * Tries the backend first; falls back to AsyncStorage if offline.
 * Returns { name, brand, price, count, updatedAt } or null.
 */
export const getCachedBarcode = async (barcode) => {
    try {
        // Primary: hit the backend
        const entry = await getBarcodePrice(barcode);
        // Sync local copy so offline fallback stays fresh
        await saveLocal(barcode, entry);
        return entry;
    } catch (err) {
        // 404 = not found (not an error)
        if (err?.response?.status === 404) return null;
        // Network error → fall back to local AsyncStorage
        try {
            const local = await loadLocal();
            return local[barcode] || null;
        } catch {
            return null;
        }
    }
};

/**
 * Save / update a barcode price entry.
 * Writes to backend and keeps AsyncStorage in sync as offline fallback.
 */
export const saveBarcodePriceCache = async (barcode, { name, brand, price }) => {
    const payload = { barcode, name, brand: brand || '', price };
    try {
        // Primary: save to backend
        const saved = await upsertBarcodePrice(payload);
        // Keep local copy in sync
        await saveLocal(barcode, saved);
    } catch {
        // Offline → save locally and retry next time
        const localEntry = {
            barcode, name, brand: brand || '', price,
            count: 1, updatedAt: new Date().toISOString(),
        };
        await saveLocal(barcode, localEntry);
    }
};

/**
 * Format a relative time string like "3 days ago", "just now", etc.
 */
export const formatRelativeTime = (isoString) => {
    if (!isoString) return '';
    const diff = Date.now() - new Date(isoString).getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 2) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return 'yesterday';
    return `${days} days ago`;
};
