import React, {
    createContext, useContext, useState, useEffect, useCallback, useRef
} from 'react';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';

// Safe storage helpers with AsyncStorage fallback
const safeGet = async (key) => {
    try { return await SecureStore.getItemAsync(key); }
    catch { return await AsyncStorage.getItem(key); }
};
const safeSet = async (key, value) => {
    try { await SecureStore.setItemAsync(key, value); }
    catch { await AsyncStorage.setItem(key, value); }
};
const safeDel = async (key) => {
    try { await SecureStore.deleteItemAsync(key); }
    catch { await AsyncStorage.removeItem(key); }
};

const SecurityContext = createContext();
export const useSecurity = () => useContext(SecurityContext);

const KEYS = {
    biometricEnabled: '@otter_biometric_enabled',
    pinEnabled: '@otter_pin_enabled',
    pinCode: '@otter_pin_code',
};

const AUTO_LOCK_DELAY = 15000; // 15s in background

export const SecurityProvider = ({ children }) => {
    const [isLocked, setIsLocked] = useState(false);
    const [biometricEnabled, setBiometricEnabled] = useState(false);
    const [pinEnabled, setPinEnabled] = useState(false);
    const [isHardwareSupported, setIsHardwareSupported] = useState(false);
    const [biometricType, setBiometricType] = useState(null); // 'face' | 'fingerprint'
    const [setupReady, setSetupReady] = useState(false);

    const appState = useRef(AppState.currentState);
    const lockTimer = useRef(null);

    // ─── Boot: load persisted settings & check hardware ───────────────────────
    useEffect(() => {
        (async () => {
            const [hwOk, enrolled] = await Promise.all([
                LocalAuthentication.hasHardwareAsync(),
                LocalAuthentication.isEnrolledAsync(),
            ]);
            const supported = hwOk && enrolled;
            setIsHardwareSupported(supported);

            if (supported) {
                const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
                if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
                    setBiometricType('face');
                } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
                    setBiometricType('fingerprint');
                }
            }

            const [bio, pin] = await Promise.all([
                safeGet(KEYS.biometricEnabled),
                safeGet(KEYS.pinEnabled),
            ]);
            const isBio = bio === 'true';
            const isPin = pin === 'true';
            setBiometricEnabled(isBio);
            setPinEnabled(isPin);

            // If security is enabled, app starts LOCKED (GCash style)
            if (isBio || isPin) {
                setIsLocked(true);
            }

            setSetupReady(true);
        })();
    }, []);

    // ─── App State: auto-lock immediately on background ───────────────────────
    useEffect(() => {
        const sub = AppState.addEventListener('change', (next) => {
            const isAppLockEnabled = biometricEnabled || pinEnabled;
            
            if (next !== 'active' && isAppLockEnabled) {
                // Lock instantly when app goes to background
                setIsLocked(true);
            }
            
            appState.current = next;
        });
        return () => sub.remove();
    }, [biometricEnabled, pinEnabled]);

    // ─── Biometric auth ───────────────────────────────────────────────────────
    const authenticateBiometric = useCallback(async () => {
        try {
            const result = await LocalAuthentication.authenticateAsync({
                promptMessage: 'Verify your identity to access OTTER',
                fallbackLabel: 'Use PIN',
                cancelLabel: 'Cancel',
                disableDeviceFallback: false, // Allow OS PIN as last resort
            });
            if (result.success) {
                setIsLocked(false);
                return { success: true };
            }
            return { success: false, reason: result.error };
        } catch (e) {
            return { success: false, reason: e.message };
        }
    }, []);

    // ─── PIN verify ───────────────────────────────────────────────────────────
    const verifyPin = useCallback(async (enteredPin) => {
        try {
            const stored = await safeGet(KEYS.pinCode);
            if (enteredPin === stored) {
                setIsLocked(false);
                return { success: true };
            }
            return { success: false };
        } catch (e) {
            return { success: false };
        }
    }, []);

    // ─── Setup PIN ────────────────────────────────────────────────────────────
    const setupPin = async (pin) => {
        try {
            await safeSet(KEYS.pinCode, pin);
            await safeSet(KEYS.pinEnabled, 'true');
            setPinEnabled(true);
            return { success: true };
        } catch (e) {
            console.warn('[Security] setupPin error:', e.message);
            // Still update in-memory state even if storage fails
            setPinEnabled(true);
            return { success: true };
        }
    };

    const removePin = async () => {
        try {
            await safeDel(KEYS.pinCode);
            await safeSet(KEYS.pinEnabled, 'false');
        } catch (e) {
            console.warn('[Security] removePin error:', e.message);
        }
        setPinEnabled(false);
    };

    // ─── Toggle biometric ─────────────────────────────────────────────────────
    const toggleBiometric = async (enabled) => {
        try {
            if (enabled) {
                const result = await authenticateBiometric();
                if (!result.success) return { success: false, message: 'Authentication cancelled.' };
            }
            await safeSet(KEYS.biometricEnabled, enabled ? 'true' : 'false');
            setBiometricEnabled(enabled);
            if (!enabled && !pinEnabled) setIsLocked(false);
            return { success: true };
        } catch (e) {
            console.warn('[Security] toggleBiometric error:', e.message);
            // Still save in-memory state
            setBiometricEnabled(enabled);
            return { success: true };
        }
    };

    // ─── Lock now ─────────────────────────────────────────────────────────────
    const lockNow = () => {
        if (biometricEnabled || pinEnabled) setIsLocked(true);
    };

    const unlock = () => setIsLocked(false);

    return (
        <SecurityContext.Provider value={{
            // State
            isLocked,
            biometricEnabled,
            pinEnabled,
            isHardwareSupported,
            biometricType,
            setupReady,
            // Actions
            authenticateBiometric,
            verifyPin,
            setupPin,
            removePin,
            toggleBiometric,
            lockNow,
            unlock,
        }}>
            {children}
        </SecurityContext.Provider>
    );
};
