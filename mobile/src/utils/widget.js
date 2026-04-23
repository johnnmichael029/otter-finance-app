import { NativeModules, Platform } from 'react-native';

const { WidgetBridge } = NativeModules;

/**
 * OTTER Finance — Widget Bridge Utility
 * Updates the native Android home screen widget with the latest data.
 */
export const updateWidgetBalance = (balance) => {
    if (Platform.OS !== 'android' || !WidgetBridge) return;

    try {
        // Format as Philippine Peso if it's just a number
        const displayBalance = typeof balance === 'number' 
            ? `₱${balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
            : balance;

        WidgetBridge.updateBalance(displayBalance);
    } catch (e) {
        console.warn('[Widget] Failed to update balance:', e.message);
    }
};
