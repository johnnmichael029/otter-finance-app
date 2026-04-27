import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    Animated, StatusBar, Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../context/ThemeContext';
import { useSecurity } from '../../context/SecurityContext';
import { useAuth } from '../../context/AuthContext';
import { triggerHaptic } from '../../utils/haptics';
import { spacing, radius } from '../../theme/colors';

const PIN_LENGTH = 6;

export default function AppLockScreen() {
    const {
        biometricEnabled, pinEnabled, biometricType,
        authenticateBiometric, verifyPin,
    } = useSecurity();
    const { logout, hapticsEnabled } = useAuth();
    const COLORS = useTheme(state => state.COLORS);
    const isDarkMode = useTheme(state => state.isDarkMode);

    // 'biometric' | 'pin'
    const [mode, setMode] = useState(biometricEnabled ? 'biometric' : 'pin');
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [attempts, setAttempts] = useState(0);
    const [isAuthenticating, setIsAuthenticating] = useState(false);

    const shakeAnim = useRef(new Animated.Value(0)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const dotAnims = useRef([...Array(PIN_LENGTH)].map(() => new Animated.Value(1))).current;

    const otterIcon = require('../../../assets/icon/otter.png');

    // Fade in
    useEffect(() => {
        Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }).start();
    }, []);

    // Auto-prompt biometric on mount
    useEffect(() => {
        if (biometricEnabled) {
            setTimeout(() => promptBiometric(), 400);
        }
    }, []);

    const promptBiometric = useCallback(async () => {
        if (isAuthenticating) return;
        setIsAuthenticating(true);
        setError('');
        const result = await authenticateBiometric();
        setIsAuthenticating(false);
        if (!result.success) {
            setError('Biometric failed. Use your PIN instead.');
        }
    }, [isAuthenticating, authenticateBiometric]);

    // ─── PIN input logic ───────────────────────────────────────────────────────
    const handleKeyPress = async (key) => {
        if (attempts >= 5) return;
        if (key === 'del') {
            setPin(p => p.slice(0, -1));
            setError('');
            return;
        }
        const newPin = pin + key;
        setPin(newPin);

        // Animate dot
        const idx = newPin.length - 1;
        Animated.sequence([
            Animated.timing(dotAnims[idx], { toValue: 1.4, duration: 80, useNativeDriver: true }),
            Animated.timing(dotAnims[idx], { toValue: 1, duration: 80, useNativeDriver: true }),
        ]).start();

        if (newPin.length === PIN_LENGTH) {
            await handleVerifyPin(newPin);
        }
    };

    const handleVerifyPin = async (enteredPin) => {
        const result = await verifyPin(enteredPin);
        if (result.success) return;

        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        setPin('');
        triggerHaptic(hapticsEnabled, 'notificationError');
        shake();

        if (newAttempts >= 5) {
            setError('Too many attempts. Please sign out and try again.');
        } else {
            setError(`Incorrect PIN. ${5 - newAttempts} attempt${5 - newAttempts !== 1 ? 's' : ''} remaining.`);
        }
    };

    const shake = () => {
        Animated.sequence([
            Animated.timing(shakeAnim, { toValue: 14, duration: 55, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -14, duration: 55, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 8, duration: 55, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -8, duration: 55, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 0, duration: 55, useNativeDriver: true }),
        ]).start();
    };

    const getBiometricIcon = () =>
        biometricType === 'face' ? 'face-recognition' : 'fingerprint';
    const getBiometricLabel = () =>
        biometricType === 'face' ? 'Face ID' : 'Fingerprint';

    // ─── Render PIN dots ───────────────────────────────────────────────────────
    const renderDots = () => (
        <Animated.View style={[styles.dotsRow, { transform: [{ translateX: shakeAnim }] }]}>
            {[...Array(PIN_LENGTH)].map((_, i) => {
                const filled = i < pin.length;
                return (
                    <Animated.View
                        key={i}
                        style={[
                            styles.dot,
                            { borderColor: COLORS.border },
                            filled && { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
                            { transform: [{ scale: dotAnims[i] }] },
                        ]}
                    />
                );
            })}
        </Animated.View>
    );

    // ─── Render numpad ────────────────────────────────────────────────────────
    const KEYS = [
        ['1', '2', '3'],
        ['4', '5', '6'],
        ['7', '8', '9'],
        [biometricEnabled ? 'bio' : '', '0', 'del'],
    ];

    const renderKeypad = () => (
        <View style={styles.keypad}>
            {KEYS.map((row, ri) => (
                <View key={ri} style={styles.keyRow}>
                    {row.map((key, ki) => {
                        if (key === '') return <View key={ki} style={styles.keyPlaceholder} />;
                        if (key === 'del') return (
                            <TouchableOpacity key={ki} style={[styles.key, { backgroundColor: COLORS.surface }]} onPress={() => handleKeyPress('del')} activeOpacity={0.6}>
                                <Feather name="delete" size={22} color={COLORS.text} />
                            </TouchableOpacity>
                        );
                        if (key === 'bio') return (
                            <TouchableOpacity key={ki} style={[styles.key, { backgroundColor: COLORS.surface }]} onPress={promptBiometric} activeOpacity={0.6}>
                                <MaterialCommunityIcons name={getBiometricIcon()} size={24} color={COLORS.primary} />
                            </TouchableOpacity>
                        );
                        return (
                            <TouchableOpacity
                                key={ki}
                                style={[styles.key, { backgroundColor: COLORS.surface }]}
                                onPress={() => handleKeyPress(key)}
                                activeOpacity={0.6}
                                disabled={attempts >= 5}
                            >
                                <Text style={[styles.keyText, { color: COLORS.text }]}>{key}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            ))}
        </View>
    );

    return (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: COLORS.background }]}>
            <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} backgroundColor={COLORS.background} />

            <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
                <SafeAreaView style={styles.safe}>
                    {/* Wordmark */}
                    <View style={styles.wordmarkWrap}>
                        <Image source={otterIcon} style={styles.logo} />
                        <Text style={[styles.wordmarkSub, { color: COLORS.textMuted }]}>Otter</Text>
                    </View>

                    {/* Mode: Biometric */}
                    {mode === 'biometric' && (
                        <View style={styles.bioSection}>
                            <TouchableOpacity onPress={promptBiometric} disabled={isAuthenticating} activeOpacity={0.75}>
                                <View style={[styles.bioIcon, { backgroundColor: COLORS.primary + '20', shadowColor: COLORS.primary }]}>
                                    <MaterialCommunityIcons name={getBiometricIcon()} size={56} color={COLORS.primary} />
                                </View>
                            </TouchableOpacity>
                            <Text style={[styles.bioTitle, { color: COLORS.text }]}>
                                {isAuthenticating ? 'Verifying…' : 'Tap to unlock'}
                            </Text>
                            <Text style={[styles.bioSub, { color: COLORS.textMuted }]}>Use {getBiometricLabel()} to access OTTER</Text>
                            {error ? (
                                <View style={[styles.errorBox, { backgroundColor: COLORS.expense + '20', borderColor: COLORS.expense + '40' }]}>
                                    <Feather name="alert-circle" size={13} color={COLORS.expense} />
                                    <Text style={[styles.errorText, { color: COLORS.expense }]}>{error}</Text>
                                </View>
                            ) : null}
                            {pinEnabled && (
                                <TouchableOpacity onPress={() => { setMode('pin'); setError(''); }} style={styles.switchBtn}>
                                    <Text style={[styles.switchText, { color: COLORS.primary }]}>Use PIN instead</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    )}

                    {/* Mode: PIN */}
                    {mode === 'pin' && (
                        <View style={styles.pinSection}>
                            <MaterialCommunityIcons name="lock" size={32} color={COLORS.primary} style={{ marginBottom: 8 }} />
                            <Text style={[styles.pinTitle, { color: COLORS.text }]}>Enter your PIN</Text>
                            <Text style={[styles.bioSub, { color: COLORS.textMuted }]}>Enter your 6-digit security PIN</Text>

                            {renderDots()}

                            {error ? (
                                <View style={[styles.errorBox, { backgroundColor: COLORS.expense + '20', borderColor: COLORS.expense + '40' }]}>
                                    <Feather name="alert-circle" size={13} color={COLORS.expense} />
                                    <Text style={[styles.errorText, { color: COLORS.expense }]}>{error}</Text>
                                </View>
                            ) : <View style={{ height: 36 }} />}

                            {renderKeypad()}

                            {biometricEnabled && (
                                <TouchableOpacity
                                    onPress={() => { setMode('biometric'); setError(''); setPin(''); promptBiometric(); }}
                                    style={styles.switchBtn}
                                >
                                    <MaterialCommunityIcons name={getBiometricIcon()} size={16} color={COLORS.primary} />
                                    <Text style={[styles.switchText, { marginLeft: 6, color: COLORS.primary }]}>Use {getBiometricLabel()}</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    )}

                    {/* Sign out fallback */}
                    {attempts >= 5 && (
                        <TouchableOpacity style={[styles.signOutBtn, { borderColor: COLORS.expense + '60' }]} onPress={logout}>
                            <Feather name="log-out" size={15} color={COLORS.expense} />
                            <Text style={[styles.signOutText, { color: COLORS.expense }]}> Sign out & Re-login</Text>
                        </TouchableOpacity>
                    )}
                </SafeAreaView>
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    safe: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
    wordmarkWrap: { alignItems: 'center', marginBottom: 40 },
    wordmarkSub: { fontSize: 11, fontWeight: '600', letterSpacing: 6, textTransform: 'uppercase' },

    // Biometric
    bioSection: { alignItems: 'center', width: '100%' },
    bioIcon: {
        width: 110, height: 110, borderRadius: 55,
        justifyContent: 'center', alignItems: 'center',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.55, shadowRadius: 22, elevation: 10,
        marginBottom: 24,
    },
    bioTitle: { fontSize: 22, fontWeight: '800', marginBottom: 6 },
    bioSub: { fontSize: 14, textAlign: 'center', marginBottom: 20, lineHeight: 20 },

    // PIN
    pinSection: { alignItems: 'center', width: '100%' },
    pinTitle: { fontSize: 22, fontWeight: '800', marginBottom: 6 },
    dotsRow: { flexDirection: 'row', gap: 16, marginTop: 20, marginBottom: 8 },
    dot: {
        width: 14, height: 14, borderRadius: 7,
        borderWidth: 2,
        backgroundColor: 'transparent',
    },

    // Keypad
    keypad: { marginTop: 8, width: '100%', maxWidth: 300 },
    keyRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
    key: {
        width: 80, height: 80, borderRadius: 40,
        justifyContent: 'center', alignItems: 'center',
    },
    keyPlaceholder: { width: 80, height: 80 },
    keyText: { fontSize: 26, fontWeight: '700' },

    // Shared
    errorBox: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        borderRadius: radius.md,
        paddingHorizontal: spacing.md, paddingVertical: 8,
        marginBottom: 8, borderWidth: 1,
    },
    errorText: { fontSize: 12, fontWeight: '500', flexShrink: 1 },
    switchBtn: {
        flexDirection: 'row', alignItems: 'center',
        marginTop: 16, paddingVertical: 10, paddingHorizontal: 20,
    },
    switchText: { fontSize: 14, fontWeight: '700' },
    signOutBtn: {
        flexDirection: 'row', alignItems: 'center', marginTop: 24,
        paddingVertical: 12, paddingHorizontal: 24,
        borderRadius: radius.lg, borderWidth: 1,
    },
    signOutText: { fontSize: 15, fontWeight: '700' },
    logo: {
        width: 100, height: 100, marginRight: 5, marginTop: 5, borderRadius: 24, marginBottom: 10
    },
});
