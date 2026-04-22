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
    const { COLORS } = useTheme();
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
        <View style={StyleSheet.absoluteFill}>
            <StatusBar barStyle="light-content" backgroundColor="#0d0d1a" />
            <LinearGradient
                colors={['#0d0d1a', '#1a0a1c', '#12062b']}
                style={StyleSheet.absoluteFill}
            />

            <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
                <SafeAreaView style={styles.safe}>
                    {/* Top Wordmark */}
                    <View style={styles.top}>
                        <Image source={otterIcon} style={styles.logo} />
                        <Text style={styles.wordmarkSub}>Finance</Text>
                    </View>

                    {/* Icon */}
                    <Animated.View style={[
                        styles.iconWrap,
                        { transform: [{ translateX: shakeAnim }, { scale: pulseAnim }] }
                    ]}>
                        <LinearGradient
                            colors={['#E91E8C', '#7b0f4e']}
                            style={styles.iconGrad}
                        >
                            <MaterialCommunityIcons name={getIcon()} size={52} color="#fff" />
                        </LinearGradient>
                    </Animated.View>

                    {/* Text */}
                    <Text style={styles.title}>App Locked</Text>
                    <Text style={styles.subtitle}>
                        Use {getLabel()} to unlock your OTTER account
                    </Text>

                    {/* Error */}
                    {error ? (
                        <View style={styles.errorBox}>
                            <Feather name="alert-circle" size={14} color="#ef4444" />
                            <Text style={styles.errorText}>{error}</Text>
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
                                colors={['#E91E8C', '#B0146A']}
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
                        <TouchableOpacity style={styles.signOutBtn} onPress={logout}>
                            <Feather name="log-out" size={16} color="#ef4444" style={{ marginRight: 6 }} />
                            <Text style={styles.signOutText}>Sign out & Re-login</Text>
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
    wordmark: { fontSize: 28, fontWeight: '900', color: '#fff', letterSpacing: 2 },
    wordmarkSub: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.4)', letterSpacing: 6, textTransform: 'uppercase' },
    iconWrap: { marginBottom: spacing.xl },
    iconGrad: {
        width: 110, height: 110, borderRadius: 55,
        justifyContent: 'center', alignItems: 'center',
        shadowColor: '#E91E8C', shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6, shadowRadius: 24, elevation: 12,
    },
    title: { fontSize: 28, fontWeight: '800', color: '#fff', marginBottom: spacing.sm, textAlign: 'center' },
    subtitle: { fontSize: 15, color: 'rgba(255,255,255,0.55)', textAlign: 'center', lineHeight: 22, marginBottom: spacing.xl },
    errorBox: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: 'rgba(239,68,68,0.12)', borderRadius: radius.md,
        paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
        marginBottom: spacing.lg, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)'
    },
    errorText: { fontSize: 13, color: '#ef4444', fontWeight: '500' },
    unlockBtn: { width: '100%', borderRadius: radius.xl, overflow: 'hidden' },
    unlockGrad: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        paddingVertical: 18, borderRadius: radius.xl,
    },
    unlockText: { color: '#fff', fontSize: 16, fontWeight: '800' },
    signOutBtn: {
        flexDirection: 'row', alignItems: 'center',
        paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
        borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
    },
    signOutText: { color: '#ef4444', fontSize: 15, fontWeight: '700' },
    logo: {
        width: 100, height: 100, marginRight: 5, marginTop: 5
    },
});
