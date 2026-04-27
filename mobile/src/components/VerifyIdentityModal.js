import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    Modal, Animated, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../context/ThemeContext';
import { useSecurity } from '../context/SecurityContext';
import { useAuth } from '../context/AuthContext';
import { triggerHaptic } from '../utils/haptics';
import { spacing, radius } from '../theme/colors';

const PIN_LENGTH = 6;
const otterIcon = require('../../assets/icon/otter.png');

/**
 * VerifyIdentityModal
 *
 * Props:
 *   visible      {boolean}  — show/hide
 *   onSuccess    {fn}       — called when identity is verified
 *   onCancel     {fn}       — called when user dismisses
 *   subtitle     {string}   — optional sub-label under the title
 */
export default function VerifyIdentityModal({ visible, onSuccess, onCancel, subtitle }) {
    const {
        biometricEnabled, pinEnabled, biometricType,
        authenticateBiometric, verifyPin,
    } = useSecurity();
    const hapticsEnabled = useAuth(state => state.hapticsEnabled);
    const COLORS = useTheme(state => state.COLORS);

    const [mode, setMode] = useState(biometricEnabled ? 'biometric' : 'pin');
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [attempts, setAttempts] = useState(0);
    const [isAuthenticating, setIsAuthenticating] = useState(false);

    const shakeAnim = useRef(new Animated.Value(0)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const dotAnims = useRef([...Array(PIN_LENGTH)].map(() => new Animated.Value(1))).current;

    // Reset state every time modal opens
    useEffect(() => {
        if (visible) {
            setPin('');
            setError('');
            setAttempts(0);
            setMode(biometricEnabled ? 'biometric' : 'pin');
            Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
            if (biometricEnabled) {
                setTimeout(() => promptBiometric(), 450);
            }
        } else {
            fadeAnim.setValue(0);
        }
    }, [visible]);

    const promptBiometric = useCallback(async () => {
        if (isAuthenticating) return;
        setIsAuthenticating(true);
        setError('');
        const result = await authenticateBiometric();
        setIsAuthenticating(false);
        if (result.success) {
            onSuccess?.();
        } else {
            setError('Biometric failed. Use your PIN instead.');
        }
    }, [isAuthenticating, authenticateBiometric, onSuccess]);

    const shake = () => {
        Animated.sequence([
            Animated.timing(shakeAnim, { toValue: 14, duration: 55, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -14, duration: 55, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 8, duration: 55, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -8, duration: 55, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 0, duration: 55, useNativeDriver: true }),
        ]).start();
    };

    const handleKeyPress = async (key) => {
        if (attempts >= 5) return;
        if (key === 'del') {
            setPin(p => p.slice(0, -1));
            setError('');
            return;
        }
        const newPin = pin + key;
        setPin(newPin);

        // Bounce dot
        const idx = newPin.length - 1;
        Animated.sequence([
            Animated.timing(dotAnims[idx], { toValue: 1.4, duration: 80, useNativeDriver: true }),
            Animated.timing(dotAnims[idx], { toValue: 1, duration: 80, useNativeDriver: true }),
        ]).start();

        if (newPin.length === PIN_LENGTH) {
            const result = await verifyPin(newPin);
            if (result.success) {
                onSuccess?.();
            } else {
                const newAttempts = attempts + 1;
                setAttempts(newAttempts);
                setPin('');
                triggerHaptic(hapticsEnabled, 'notificationError');
                shake();
                if (newAttempts >= 5) {
                    setError('Too many incorrect attempts.');
                } else {
                    setError(`Incorrect PIN. ${5 - newAttempts} attempt${5 - newAttempts !== 1 ? 's' : ''} remaining.`);
                }
            }
        }
    };

    const getBiometricIcon = () =>
        biometricType === 'face' ? 'face-recognition' : 'fingerprint';
    const getBiometricLabel = () =>
        biometricType === 'face' ? 'Face ID' : 'Fingerprint';

    const KEYS = [
        ['1', '2', '3'],
        ['4', '5', '6'],
        ['7', '8', '9'],
        [biometricEnabled ? 'bio' : '', '0', 'del'],
    ];

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
                            { transform: [{ scale: dotAnims[i] }] }
                        ]}
                    />
                );
            })}
        </Animated.View>
    );

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
        <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onCancel}>
            <Animated.View style={[StyleSheet.absoluteFill, { opacity: fadeAnim, backgroundColor: COLORS.background }]}>
                <SafeAreaView style={styles.safe}>
                    {/* Cancel */}
                    <TouchableOpacity style={[styles.cancelBtn, { backgroundColor: COLORS.surface }]} onPress={onCancel}>
                        <Feather name="x" size={22} color={COLORS.text} />
                    </TouchableOpacity>

                    {/* Logo */}
                    <View style={styles.logoWrap}>
                        <Image source={otterIcon} style={styles.logo} />
                        <Text style={[styles.appName, { color: COLORS.textMuted }]}>Otter</Text>
                    </View>

                    {/* Biometric Mode */}
                    {mode === 'biometric' && (
                        <View style={styles.section}>
                            <TouchableOpacity onPress={promptBiometric} disabled={isAuthenticating} activeOpacity={0.75}>
                                <View style={[styles.bioIcon, { backgroundColor: COLORS.primary + '20', shadowColor: COLORS.primary }]}>
                                    <MaterialCommunityIcons name={getBiometricIcon()} size={52} color={COLORS.primary} />
                                </View>
                            </TouchableOpacity>
                            <Text style={[styles.title, { color: COLORS.text }]}>
                                {isAuthenticating ? 'Verifying…' : 'Verify it\'s you'}
                            </Text>
                            <Text style={[styles.sub, { color: COLORS.textMuted }]}>
                                {subtitle || `Use ${getBiometricLabel()} to continue`}
                            </Text>
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

                    {/* PIN Mode */}
                    {mode === 'pin' && (
                        <View style={styles.section}>
                            <MaterialCommunityIcons name="lock" size={32} color={COLORS.primary} style={{ marginBottom: 8 }} />
                            <Text style={[styles.title, { color: COLORS.text }]}>Verify it's you</Text>
                            <Text style={[styles.sub, { color: COLORS.textMuted }]}>{subtitle || 'Enter your 6-digit PIN to continue'}</Text>

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
                </SafeAreaView>
            </Animated.View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
    cancelBtn: {
        position: 'absolute', top: 56, right: 24,
        width: 40, height: 40, borderRadius: 20,
        justifyContent: 'center', alignItems: 'center',
    },
    logoWrap: { alignItems: 'center', marginBottom: 36 },
    logo: { width: 72, height: 72, borderRadius: 18, marginBottom: 8 },
    appName: { fontSize: 11, fontWeight: '600', letterSpacing: 6, textTransform: 'uppercase' },
    section: { alignItems: 'center', width: '100%' },
    bioIcon: {
        width: 100, height: 100, borderRadius: 50,
        justifyContent: 'center', alignItems: 'center',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5, shadowRadius: 20, elevation: 10,
        marginBottom: 24,
    },
    title: { fontSize: 22, fontWeight: '800', marginBottom: 6, textAlign: 'center' },
    sub: { fontSize: 14, textAlign: 'center', marginBottom: 20, lineHeight: 20 },
    dotsRow: { flexDirection: 'row', gap: 16, marginTop: 20, marginBottom: 8 },
    dot: {
        width: 14, height: 14, borderRadius: 7,
        borderWidth: 2,
        backgroundColor: 'transparent',
    },
    keypad: { marginTop: 8, width: '100%', maxWidth: 300 },
    keyRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
    key: {
        width: 80, height: 80, borderRadius: 40,
        justifyContent: 'center', alignItems: 'center',
    },
    keyPlaceholder: { width: 80, height: 80 },
    keyText: { fontSize: 26, fontWeight: '700' },
    errorBox: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        borderRadius: radius.md,
        paddingHorizontal: spacing.md, paddingVertical: 8,
        marginBottom: 8, borderWidth: 1,
    },
    errorText: { fontSize: 12, fontWeight: '500', flexShrink: 1 },
    switchBtn: { flexDirection: 'row', alignItems: 'center', marginTop: 16, paddingVertical: 10, paddingHorizontal: 20 },
    switchText: { fontSize: 14, fontWeight: '700' },
});
