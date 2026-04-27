import React, { useEffect, useRef, useState } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    Animated, StatusBar, ActivityIndicator, Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useBiometric } from '../../context/BiometricContext';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { spacing, radius } from '../../theme/colors';

export default function BiometricLockScreen() {
    const { authenticate, biometricType, isLocked } = useBiometric();
    const COLORS = useTheme(state => state.COLORS);
    const isDarkMode = useTheme(state => state.isDarkMode);
    const { logout } = useAuth();

    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [attempts, setAttempts] = useState(0);

    const shakeAnim = useRef(new Animated.Value(0)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;

    const otterIcon = require('../../../assets/icon/otter.png');

    // Fade in on mount
    useEffect(() => {
        Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
        }).start();
    }, []);

    // Pulse the icon
    useEffect(() => {
        const pulse = Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, { toValue: 1.08, duration: 1200, useNativeDriver: true }),
                Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
            ])
        );
        pulse.start();
        return () => pulse.stop();
    }, []);

    // Auto-prompt on lock screen appear
    useEffect(() => {
        if (isLocked) {
            setTimeout(() => handleAuthenticate(), 500);
        }
    }, [isLocked]);

    const shake = () => {
        Animated.sequence([
            Animated.timing(shakeAnim, { toValue: 12, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -12, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
        ]).start();
    };

    const handleAuthenticate = async () => {
        if (loading) return;
        setLoading(true);
        setError('');
        const result = await authenticate();
        setLoading(false);

        if (!result.success) {
            const newAttempts = attempts + 1;
            setAttempts(newAttempts);
            shake();
            if (newAttempts >= 5) {
                setError('Too many failed attempts. Please sign in again.');
            } else {
                setError('Authentication failed. Please try again.');
            }
        }
    };

    const getIcon = () => {
        if (biometricType === 'face') return 'face-recognition';
        if (biometricType === 'fingerprint') return 'fingerprint';
        return 'lock';
    };

    const getLabel = () => {
        if (biometricType === 'face') return 'Face ID';
        if (biometricType === 'fingerprint') return 'Fingerprint';
        return 'Biometric';
    };

    return (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: COLORS.background }]}>
            <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} backgroundColor={COLORS.background} />

            <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
                <SafeAreaView style={styles.safe}>
                    {/* Top Wordmark */}
                    <View style={styles.top}>
                        <Image source={otterIcon} style={styles.logo} />
                        <Text style={[styles.wordmarkSub, { color: COLORS.textMuted }]}>Finance</Text>
                    </View>

                    {/* Icon */}
                    <Animated.View style={[
                        styles.iconWrap,
                        { transform: [{ translateX: shakeAnim }, { scale: pulseAnim }] }
                    ]}>
                        <View style={[styles.iconGrad, { backgroundColor: COLORS.primary + '20', shadowColor: COLORS.primary }]}>
                            <MaterialCommunityIcons name={getIcon()} size={52} color={COLORS.primary} />
                        </View>
                    </Animated.View>

                    {/* Text */}
                    <Text style={[styles.title, { color: COLORS.text }]}>App Locked</Text>
                    <Text style={[styles.subtitle, { color: COLORS.textMuted }]}>
                        Use {getLabel()} to unlock your OTTER account
                    </Text>

                    {/* Error */}
                    {error ? (
                        <View style={[styles.errorBox, { backgroundColor: COLORS.expense + '20', borderColor: COLORS.expense + '40' }]}>
                            <Feather name="alert-circle" size={14} color={COLORS.expense} />
                            <Text style={[styles.errorText, { color: COLORS.expense }]}>{error}</Text>
                        </View>
                    ) : null}

                    {/* Unlock Button */}
                    {attempts < 5 ? (
                        <TouchableOpacity
                            style={styles.unlockBtn}
                            onPress={handleAuthenticate}
                            activeOpacity={0.8}
                            disabled={loading}
                        >
                            <LinearGradient
                                colors={[COLORS.primary, COLORS.primary + 'CC']}
                                style={styles.unlockGrad}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                            >
                                {loading ? (
                                    <ActivityIndicator color="#fff" size="small" />
                                ) : (
                                    <>
                                        <MaterialCommunityIcons name={getIcon()} size={20} color="#fff" style={{ marginRight: 8 }} />
                                        <Text style={styles.unlockText}>Unlock with {getLabel()}</Text>
                                    </>
                                )}
                            </LinearGradient>
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity style={[styles.signOutBtn, { borderColor: COLORS.expense + '60' }]} onPress={logout}>
                            <Feather name="log-out" size={16} color={COLORS.expense} style={{ marginRight: 6 }} />
                            <Text style={[styles.signOutText, { color: COLORS.expense }]}>Sign out & Re-login</Text>
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
    top: { alignItems: 'center', marginBottom: spacing.xxl },
    wordmarkSub: { fontSize: 12, fontWeight: '600', letterSpacing: 6, textTransform: 'uppercase' },
    iconWrap: { marginBottom: spacing.xl },
    iconGrad: {
        width: 110, height: 110, borderRadius: 55,
        justifyContent: 'center', alignItems: 'center',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6, shadowRadius: 24, elevation: 12,
    },
    title: { fontSize: 28, fontWeight: '800', marginBottom: spacing.sm, textAlign: 'center' },
    subtitle: { fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: spacing.xl },
    errorBox: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        borderRadius: radius.md,
        paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
        marginBottom: spacing.lg, borderWidth: 1
    },
    errorText: { fontSize: 13, fontWeight: '500' },
    unlockBtn: { width: '100%', borderRadius: radius.xl, overflow: 'hidden' },
    unlockGrad: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        paddingVertical: 18, borderRadius: radius.xl,
    },
    unlockText: { color: '#fff', fontSize: 16, fontWeight: '800' },
    signOutBtn: {
        flexDirection: 'row', alignItems: 'center',
        paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
        borderRadius: radius.lg, borderWidth: 1,
    },
    signOutText: { fontSize: 15, fontWeight: '700' },
    logo: {
        width: 100, height: 100, marginRight: 5, marginTop: 5
    },
});
