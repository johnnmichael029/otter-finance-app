import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    Animated, StatusBar, Vibration, Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSecurity } from '../../context/SecurityContext';
import { useAuth } from '../../context/AuthContext';
import { spacing, radius } from '../../theme/colors';

const PIN_LENGTH = 6;

export default function AppLockScreen() {
    const {
        biometricEnabled, pinEnabled, biometricType,
        authenticateBiometric, verifyPin,
    } = useSecurity();
    const { logout } = useAuth();

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
        Vibration.vibrate(300);
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
                            filled && styles.dotFilled,
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
                            <TouchableOpacity key={ki} style={styles.key} onPress={() => handleKeyPress('del')} activeOpacity={0.6}>
                                <Feather name="delete" size={22} color="rgba(255,255,255,0.8)" />
                            </TouchableOpacity>
                        );
                        if (key === 'bio') return (
                            <TouchableOpacity key={ki} style={styles.key} onPress={promptBiometric} activeOpacity={0.6}>
                                <MaterialCommunityIcons name={getBiometricIcon()} size={24} color="#E91E8C" />
                            </TouchableOpacity>
                        );
                        return (
                            <TouchableOpacity
                                key={ki}
                                style={styles.key}
                                onPress={() => handleKeyPress(key)}
                                activeOpacity={0.6}
                                disabled={attempts >= 5}
                            >
                                <Text style={styles.keyText}>{key}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            ))}
        </View>
    );

    return (
        <View style={StyleSheet.absoluteFill}>
            <StatusBar barStyle="light-content" backgroundColor="#0d0d1a" />
            <LinearGradient colors={['#0d0d1a', '#1a0a1c', '#12062b']} style={StyleSheet.absoluteFill} />

            <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
                <SafeAreaView style={styles.safe}>
                    {/* Wordmark */}
                    <View style={styles.wordmarkWrap}>
                        <Image source={otterIcon} style={styles.logo} />
                        <Text style={styles.wordmarkSub}>Otter</Text>
                    </View>

                    {/* Mode: Biometric */}
                    {mode === 'biometric' && (
                        <View style={styles.bioSection}>
                            <TouchableOpacity onPress={promptBiometric} disabled={isAuthenticating} activeOpacity={0.75}>
                                <LinearGradient colors={['#E91E8C', '#7b0f4e']} style={styles.bioIcon}>
                                    <MaterialCommunityIcons name={getBiometricIcon()} size={56} color="#fff" />
                                </LinearGradient>
                            </TouchableOpacity>
                            <Text style={styles.bioTitle}>
                                {isAuthenticating ? 'Verifying…' : 'Tap to unlock'}
                            </Text>
                            <Text style={styles.bioSub}>Use {getBiometricLabel()} to access OTTER</Text>
                            {error ? (
                                <View style={styles.errorBox}>
                                    <Feather name="alert-circle" size={13} color="#ef4444" />
                                    <Text style={styles.errorText}>{error}</Text>
                                </View>
                            ) : null}
                            {pinEnabled && (
                                <TouchableOpacity onPress={() => { setMode('pin'); setError(''); }} style={styles.switchBtn}>
                                    <Text style={styles.switchText}>Use PIN instead</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    )}

                    {/* Mode: PIN */}
                    {mode === 'pin' && (
                        <View style={styles.pinSection}>
                            <MaterialCommunityIcons name="lock" size={32} color="#E91E8C" style={{ marginBottom: 8 }} />
                            <Text style={styles.pinTitle}>Enter your PIN</Text>
                            <Text style={styles.bioSub}>Enter your 6-digit security PIN</Text>

                            {renderDots()}

                            {error ? (
                                <View style={styles.errorBox}>
                                    <Feather name="alert-circle" size={13} color="#ef4444" />
                                    <Text style={styles.errorText}>{error}</Text>
                                </View>
                            ) : <View style={{ height: 36 }} />}

                            {renderKeypad()}

                            {biometricEnabled && (
                                <TouchableOpacity
                                    onPress={() => { setMode('biometric'); setError(''); setPin(''); promptBiometric(); }}
                                    style={styles.switchBtn}
                                >
                                    <MaterialCommunityIcons name={getBiometricIcon()} size={16} color="#E91E8C" />
                                    <Text style={[styles.switchText, { marginLeft: 6 }]}>Use {getBiometricLabel()}</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    )}

                    {/* Sign out fallback */}
                    {attempts >= 5 && (
                        <TouchableOpacity style={styles.signOutBtn} onPress={logout}>
                            <Feather name="log-out" size={15} color="#ef4444" />
                            <Text style={styles.signOutText}> Sign out & Re-login</Text>
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
    wordmark: { fontSize: 26, fontWeight: '900', color: '#fff', letterSpacing: 2 },
    wordmarkSub: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.35)', letterSpacing: 6, textTransform: 'uppercase' },

    // Biometric
    bioSection: { alignItems: 'center', width: '100%' },
    bioIcon: {
        width: 110, height: 110, borderRadius: 55,
        justifyContent: 'center', alignItems: 'center',
        shadowColor: '#E91E8C', shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.55, shadowRadius: 22, elevation: 10,
        marginBottom: 24,
    },
    bioTitle: { fontSize: 22, fontWeight: '800', color: '#fff', marginBottom: 6 },
    bioSub: { fontSize: 14, color: 'rgba(255,255,255,0.45)', textAlign: 'center', marginBottom: 20, lineHeight: 20 },

    // PIN
    pinSection: { alignItems: 'center', width: '100%' },
    pinTitle: { fontSize: 22, fontWeight: '800', color: '#fff', marginBottom: 6 },
    dotsRow: { flexDirection: 'row', gap: 16, marginTop: 20, marginBottom: 8 },
    dot: {
        width: 14, height: 14, borderRadius: 7,
        borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)',
        backgroundColor: 'transparent',
    },
    dotFilled: { backgroundColor: '#E91E8C', borderColor: '#E91E8C' },

    // Keypad
    keypad: { marginTop: 8, width: '100%', maxWidth: 300 },
    keyRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
    key: {
        width: 80, height: 80, borderRadius: 40,
        backgroundColor: 'rgba(255,255,255,0.07)',
        justifyContent: 'center', alignItems: 'center',
    },
    keyPlaceholder: { width: 80, height: 80 },
    keyText: { fontSize: 26, fontWeight: '700', color: '#fff' },

    // Shared
    errorBox: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: 'rgba(239,68,68,0.12)', borderRadius: radius.md,
        paddingHorizontal: spacing.md, paddingVertical: 8,
        marginBottom: 8, borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)',
    },
    errorText: { fontSize: 12, color: '#ef4444', fontWeight: '500', flexShrink: 1 },
    switchBtn: {
        flexDirection: 'row', alignItems: 'center',
        marginTop: 16, paddingVertical: 10, paddingHorizontal: 20,
    },
    switchText: { color: '#E91E8C', fontSize: 14, fontWeight: '700' },
    signOutBtn: {
        flexDirection: 'row', alignItems: 'center', marginTop: 24,
        paddingVertical: 12, paddingHorizontal: 24,
        borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
    },
    signOutText: { color: '#ef4444', fontSize: 15, fontWeight: '700' },
    logo: {
        width: 100, height: 100, marginRight: 5, marginTop: 5, borderRadius: 24, marginBottom: 10
    },
});
