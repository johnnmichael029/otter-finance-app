/**
 * OTTER — Shared Formatter Utilities
 * Single source of truth for all formatting helpers across the app.
 * Import from here instead of defining locally in each screen.
 */

import { Feather, MaterialCommunityIcons, Ionicons, FontAwesome5 } from '@expo/vector-icons';
import React from 'react';
import { Image } from 'react-native';

// ─── Currency ────────────────────────────────────────────────────────────────

/**
 * Format a number as currency.
 * @param {number} amount
 * @param {string} currency - ISO 4217 code (default 'PHP')
 */
export const formatCurrency = (amount, currency = 'PHP') => {
    try {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency || 'PHP',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(amount || 0);
    } catch {
        const symbol = currency === 'PHP' ? '₱' : '$';
        return `${symbol}${Number(amount || 0).toFixed(2)}`;
    }
};

// ─── Date / Time ─────────────────────────────────────────────────────────────

/**
 * Format a date string as "Jan 1, 2025".
 */
export const formatDate = (dateString) => {
    if (!dateString) return '';
    return new Intl.DateTimeFormat('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
    }).format(new Date(dateString));
};

/**
 * Format a date string as "Jan 1, 2025, 3:45 PM".
 */
export const formatDateTime = (dateString) => {
    if (!dateString) return '';
    return new Intl.DateTimeFormat('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit',
    }).format(new Date(dateString));
};

/**
 * Format a date string as time only, e.g. "3:45 PM".
 */
export const formatTime = (dateString) => {
    if (!dateString) return '';
    return new Intl.DateTimeFormat('en-US', {
        hour: 'numeric', minute: '2-digit', hour12: true,
    }).format(new Date(dateString));
};

/**
 * Format a date as relative time, e.g. "Just now", "5m ago", "2h ago", "Yesterday", or "Jan 1".
 */
export const formatDateRelative = (dateString) => {
    if (!dateString) return '';
    const now = new Date();
    const date = new Date(dateString);
    const diffInSeconds = Math.floor((now - date) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;

    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';

    return formatDate(dateString);
};

// ─── Transaction Icon Helpers ─────────────────────────────────────────────────

export const FALLBACK_ICONS = [
    'briefcase', 'trending-up', 'gift', 'plus-circle', 'coffee', 'truck', 'shopping-bag', 'file-text',
    'heart', 'tv', 'wifi', 'home', 'monitor', 'smartphone', 'headphones', 'book', 'pen-tool',
    'aperture', 'camera', 'music', 'map', 'navigation', 'compass', 'award', 'star', 'sun', 'moon', 'zap',
    'tag', 'speaker', 'watch', 'anchor', 'box', 'cloud', 'cpu', 'database', 'droplet', 'feather',
    'flag', 'globe', 'image', 'key', 'layers', 'mic', 'package', 'paperclip',
    'phone', 'printer', 'radio', 'scissors', 'shield', 'tool', 'trash', 'umbrella', 'unlock', 'user', 'video',
    'smile', 'piggy-bank-outline', 'account-cash', 'jeepney', 'car', 'train-outline', 'boat-outline', 'hospital', 'noodles', 'egg-outline',
    'egg-fried', 'cup', 'game-controller-outline', 'controller-classic-outline', 'rice', 'steam', 'motorbike', 'users', 'shield-check',
    'calendar-day', 'motorcycle', 'fast-food', 'bed', 'ticket', 'dots-horizontal'
];

/**
 * Returns the icon name for a given transaction.
 */
export const getIconName = (tx) => {
    const cat = (tx.category || '').toLowerCase();
    if (cat === 'savings' || cat === 'savings interest' || cat === 'savings balance') return 'piggy-bank';
    if (cat === 'shopping') return 'shopping-cart';
    if (tx.categoryIcon && tx.categoryIcon.startsWith('http')) return tx.categoryIcon;

    if (tx.categoryIcon) return tx.categoryIcon;

    // Hash the category string to pick a consistent random icon from the array
    let hash = 0;
    for (let i = 0; i < cat.length; i++) {
        hash = cat.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % FALLBACK_ICONS.length;

    return FALLBACK_ICONS[index] || 'circle';
};

/**
 * Returns the icon color for a given transaction.
 */
export const getIconColor = (tx, COLORS) => {
    const cat = (tx.category || '').toLowerCase();
    if (cat === 'shopping') return '#E91E8C';
    if (tx.type === 'transfer') return '#3b82f6';
    return tx.categoryColor || (tx.type === 'income' ? COLORS.income : COLORS.expense);
};

// ─── Icon Renderer Component ──────────────────────────────────────────────────

const MCI_ICONS = [
    'piggy-bank-outline', 'account-cash', 'jeepney', 'car', 'noodles', 'egg-fried', 'cup',
    'controller-classic-outline', 'piggy-bank', 'archive-arrow-up-outline', 'archive-arrow-down-outline', 'motorbike', 'rice',
    'shield-check', 'dots-horizontal',
];
const ION_ICONS = ['train-outline', 'boat-outline', 'egg-outline', 'game-controller-outline', 'fast-food', 'ticket'];
const FA5_ICONS = ['hospital', 'steam', 'users', 'calendar-day', 'motorcycle', 'award', 'bed', 'shopping-bag'];

/**
 * Renders a Feather, MaterialCommunityIcons, or Ionicons icon by name.
 * Automatically picks the correct icon library.
 */
export const IconRenderer = ({ name, family, size, color, style }) => {
    if (name && typeof name === 'string' && name.startsWith('http')) {
        return <Image source={{ uri: name }} style={[{ width: size, height: size, borderRadius: size / 2 }, style]} />;
    }

    const fam = family?.toLowerCase();
    if (fam === 'materialcommunityicons' || MCI_ICONS.includes(name)) {
        return <MaterialCommunityIcons name={name} size={size} color={color} style={style} />;
    }
    if (fam === 'ionicons' || ION_ICONS.includes(name) || name?.includes('-outline') || name?.includes('-sharp')) {
        return <Ionicons name={name} size={size} color={color} style={style} />;
    }
    if (fam === 'fontawesome5' || FA5_ICONS.includes(name)) {
        return <FontAwesome5 name={name} size={size} color={color} style={style} />;
    }
    return <Feather name={name || 'circle'} size={size} color={color} style={style} />;
};
