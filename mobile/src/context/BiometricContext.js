import React, {
    createContext, useContext, useState, useEffect, useCallback, useRef
} from 'react';
import * as LocalAuthentication from 'expo-local-authentication';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BiometricContext = createContext();
export const useBiometric = () => useContext(BiometricContext);

const BIOMETRIC_ENABLED_KEY = '@otter_biometric_enabled';
const AUTO_LOCK_DELAY = 15000; // 15 seconds in background before locking

export const BiometricProvider = ({ children }) => {
    const [isLocked, setIsLocked] = useState(false);
    const [biometricEnabled, setBiometricEnabled] = useState(false);
    const [isSupported, setIsSupported] = useState(false);
    const [biometricType, setBiometricType] = useState(null); // 'face' | 'fingerprint' | null
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const appState = useRef(AppState.currentState);
    const backgroundTimer = useRef(null);

    // ─── Check device biometric support ───────────────────────────────────────
    useEffect(() => {
        checkBiometricSupport();
        loadBiometricSetting();
    }, []);

    const checkBiometricSupport = async () => {
        const compatible = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        setIsSupported(compatible && enrolled);

        if (compatible && enrolled) {
            const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();
            if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
                setBiometricType('face');
            } else if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
                setBiometricType('fingerprint');
            }
        }
    };

    const loadBiometricSetting = async () => {
        const val = await AsyncStorage.getItem(BIOMETRIC_ENABLED_KEY);
        setBiometricEnabled(val === 'true');
    };

    // ─── Toggle biometric lock on/off ─────────────────────────────────────────
    const toggleBiometric = async (enabled) => {
        if (enabled) {
            // Verify before enabling
            const result = await authenticate();
            if (!result.success) return { success: false, message: result.message };
        }
        await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY, enabled ? 'true' : 'false');
        setBiometricEnabled(enabled);
        return { success: true };
    };

    // ─── Authenticate ─────────────────────────────────────────────────────────
    const authenticate = useCallback(async () => {
        try {
            const result = await LocalAuthentication.authenticateAsync({
                promptMessage: 'Verify your identity to access OTTER',
                fallbackLabel: 'Use Passcode',
                cancelLabel: 'Cancel',
                disableDeviceFallback: false,
            });

            if (result.success) {
                setIsLocked(false);
                setIsAuthenticated(true);
                return { success: true };
            } else {
                return { success: false, message: 'Authentication failed or cancelled.' };
            }
        } catch (err) {
            return { success: false, message: err.message };
        }
    }, []);

    // ─── App State listener: lock when backgrounded ───────────────────────────
    useEffect(() => {
        const subscription = AppState.addEventListener('change', (nextState) => {
            if (appState.current === 'active' && nextState !== 'active') {
                // App going to background — start timer
                if (biometricEnabled) {
                    backgroundTimer.current = setTimeout(() => {
                        setIsLocked(true);
                        setIsAuthenticated(false);
                    }, AUTO_LOCK_DELAY);
                }
            } else if (nextState === 'active') {
                // App coming back to foreground — clear timer
                if (backgroundTimer.current) {
                    clearTimeout(backgroundTimer.current);
                    backgroundTimer.current = null;
                }
            }
            appState.current = nextState;
        });

        return () => {
            subscription.remove();
            if (backgroundTimer.current) clearTimeout(backgroundTimer.current);
        };
    }, [biometricEnabled]);

    // ─── Lock immediately when biometric is first enabled ─────────────────────
    const lockNow = () => {
        if (biometricEnabled) {
            setIsLocked(true);
            setIsAuthenticated(false);
        }
    };

    return (
        <BiometricContext.Provider value={{
            isLocked,
            biometricEnabled,
            isSupported,
            biometricType,
            isAuthenticated,
            authenticate,
            toggleBiometric,
            lockNow,
        }}>
            {children}
        </BiometricContext.Provider>
    );
};
