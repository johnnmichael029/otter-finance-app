import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    Animated, StatusBar, Vibration, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import axios from 'axios';
import { API_BASE, useAuth } from '../../context/AuthContext';
import { spacing, radius } from '../../theme/colors';
import { useTheme } from '../../context/ThemeContext';

const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 60; // seconds

export default function TwoFAScreen({ route, navigation }) {
    const { tempToken, maskedEmail } = route.params;
    const { _finalize2FALogin } = useAuth();
    const { COLORS } = useTheme();

    const [otp, setOtp] = useState('');
    const [error, setError] = useState('');
    const [isVerifying, setIsVerifying] = useState(false);
    const [isResending, setIsResending] = useState(false);
    const [resendCooldown, setResendCooldown] = useState(0);

    const fadeAnim = useRef(new Animated.Value(0)).current;
    const shakeAnim = useRef(new Animated.Value(0)).current;
    const inputRef = useRef(null);
    const cooldownRef = useRef(null);

    // Fade in on mount
    useEffect(() => {
        Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }).start();
        setTimeout(() => inputRef.current?.focus(), 400);
    }, []);

    // Auto-verify when 6 digits entered
    useEffect(() => {
        if (otp.length === OTP_LENGTH) {
            handleVerify(otp);
        }
    }, [otp]);

    const shake = () => {
        Vibration.vibrate([0, 60, 60, 60]);
        Animated.sequence([
            Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 6, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
        ]).start();
    };

    const handleVerify = useCallback(async (code) => {
        if (isVerifying) return;
        setIsVerifying(true);
        setError('');
        try {
            const res = await axios.post(`${API_BASE}/auth/verify-2fa`, {
                tempToken, otp: code,
            });
            await _finalize2FALogin(res.data);
        } catch (err) {
            const msg = err.response?.data?.error || 'Verification failed.';
            setError(msg);
            setOtp('');
            shake();
        } finally {
            setIsVerifying(false);
        }
    }, [tempToken, isVerifying]);

    const startCooldown = () => {
        setResendCooldown(RESEND_COOLDOWN);
        cooldownRef.current = setInterval(() => {
            setResendCooldown(prev => {
                if (prev <= 1) { clearInterval(cooldownRef.current); return 0; }
                return prev - 1;
            });
        }, 1000);
    };

    const handleResend = async () => {
        if (resendCooldown > 0 || isResending) return;
        setIsResending(true);
        setError('');
        try {
            await axios.post(`${API_BASE}/auth/2fa/resend`, { tempToken });
            startCooldown();
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to resend. Try again.');
        } finally {
            setIsResending(false);
        }
    };

    // Render OTP digit boxes
    const renderBoxes = () => {
        return Array.from({ length: OTP_LENGTH }).map((_, i) => {
            const filled = i < otp.length;
            const active = i === otp.length && !isVerifying;
            return (
                <TouchableOpacity
                    key={i}
                    onPress={() => inputRef.current?.focus()}
                    style={[
                        styles.otpBox,
                        {
                            backgroundColor: COLORS.surface,
                            borderColor: active ? '#E91E8C' : filled ? '#E91E8C88' : COLORS.border,
                        }
                    ]}
                    activeOpacity={0.8}
                >
                    {filled ? (
                        <Text style={[styles.otpDigit, { color: COLORS.text }]}>
                            {otp[i]}
                        </Text>
                    ) : (
                        active && <View style={styles.cursor} />
                    )}
                </TouchableOpacity>
            );
        });
    };

    return (
        <Animated.View style={[styles.flex, { opacity: fadeAnim, backgroundColor: COLORS.background }]}>
            <StatusBar barStyle="light-content" />
            <SafeAreaView style={styles.safe}>

                {/* Back Button */}
                <TouchableOpacity
                    style={styles.backBtn}
                    onPress={() => navigation.goBack()}
                >
                    <Feather name="arrow-left" size={22} color={COLORS.text} />
                </TouchableOpacity>

                <View style={styles.content}>
                    {/* Icon */}
                    <LinearGradient
                        colors={['#E91E8C', '#B0146A']}
                        style={styles.iconCircle}
                    >
                        <MaterialCommunityIcons name="email-check-outline" size={36} color="#fff" />
                    </LinearGradient>

                    <Text style={[styles.title, { color: COLORS.text }]}>Check your email</Text>
                    <Text style={[styles.subtitle, { color: COLORS.textMuted }]}>
                        We sent a 6-digit verification code to{'\n'}
                        <Text style={{ color: COLORS.primary, fontWeight: '700' }}>{maskedEmail}</Text>
                    </Text>

                    {/* Hidden TextInput for keyboard control */}
                    <TextInput
                        ref={inputRef}
                        value={otp}
                        onChangeText={val => {
                            if (isVerifying) return;
                            setError('');
                            setOtp(val.replace(/[^0-9]/g, '').slice(0, OTP_LENGTH));
                        }}
                        keyboardType="number-pad"
                        maxLength={OTP_LENGTH}
                        style={styles.hiddenInput}
                        caretHidden
                    />

                    {/* OTP Boxes */}
                    <Animated.View
                        style={[styles.otpRow, { transform: [{ translateX: shakeAnim }] }]}
                    >
                        {renderBoxes()}
                    </Animated.View>

                    {/* Error message */}
                    {!!error && (
                        <View style={styles.errorBox}>
                            <Feather name="alert-circle" size={14} color="#ef4444" />
                            <Text style={styles.errorText}>{error}</Text>
                        </View>
                    )}

                    {/* Verify button (also auto-triggers) */}
                    <TouchableOpacity
                        style={[styles.verifyBtn, { opacity: otp.length < OTP_LENGTH || isVerifying ? 0.5 : 1 }]}
                        onPress={() => handleVerify(otp)}
                        disabled={otp.length < OTP_LENGTH || isVerifying}
                        activeOpacity={0.8}
                    >
                        <LinearGradient
                            colors={['#E91E8C', '#B0146A']}
                            style={styles.verifyGrad}
                            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                        >
                            {isVerifying
                                ? <MaterialCommunityIcons name="loading" size={22} color="#fff" />
                                : <Text style={styles.verifyText}>Verify Code</Text>
                            }
                        </LinearGradient>
                    </TouchableOpacity>

                    {/* Resend */}
                    <TouchableOpacity
                        onPress={handleResend}
                        disabled={resendCooldown > 0 || isResending}
                        style={styles.resendBtn}
                    >
                        <Text style={[styles.resendText, { color: COLORS.textMuted }]}>
                            Didn't get the code?{' '}
                            <Text style={{
                                color: resendCooldown > 0 ? COLORS.textMuted : '#E91E8C',
                                fontWeight: '700'
                            }}>
                                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend'}
                            </Text>
                        </Text>
                    </TouchableOpacity>

                    {/* Info */}
                    <View style={[styles.infoBox, { borderColor: COLORS.border }]}>
                        <MaterialCommunityIcons name="information-outline" size={14} color={COLORS.textMuted} />
                        <Text style={[styles.infoText, { color: COLORS.textMuted }]}>
                            The code expires in 10 minutes. Check your spam folder if you don't see it.
                        </Text>
                    </View>
                </View>
            </SafeAreaView>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    flex: { flex: 1 },
    safe: { flex: 1 },
    backBtn: { padding: spacing.md, paddingBottom: 0 },
    content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, marginTop: -40 },
    iconCircle: {
        width: 80, height: 80, borderRadius: 24,
        justifyContent: 'center', alignItems: 'center',
        marginBottom: 24,
        shadowColor: '#E91E8C', shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4, shadowRadius: 20, elevation: 10,
    },
    title: { fontSize: 24, fontWeight: '800', marginBottom: 10, textAlign: 'center' },
    subtitle: { fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 36 },
    hiddenInput: { position: 'absolute', opacity: 0, width: 1, height: 1 },
    otpRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
    otpBox: {
        width: 48, height: 58, borderRadius: 14, borderWidth: 2,
        justifyContent: 'center', alignItems: 'center',
    },
    otpDigit: { fontSize: 22, fontWeight: '800' },
    cursor: { width: 2, height: 24, backgroundColor: '#E91E8C', borderRadius: 1 },
    errorBox: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: 'rgba(239,68,68,0.08)',
        borderRadius: radius.md, padding: spacing.sm,
        marginBottom: 16, borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)',
    },
    errorText: { color: '#ef4444', fontSize: 13, flex: 1 },
    verifyBtn: { width: '100%', borderRadius: radius.xl, overflow: 'hidden', marginBottom: 20 },
    verifyGrad: { paddingVertical: 16, alignItems: 'center', borderRadius: radius.xl },
    verifyText: { color: '#fff', fontSize: 16, fontWeight: '800' },
    resendBtn: { padding: spacing.sm, marginBottom: 24 },
    resendText: { fontSize: 14, textAlign: 'center' },
    infoBox: {
        flexDirection: 'row', gap: 8, padding: spacing.md,
        borderRadius: radius.lg, borderWidth: 1, alignItems: 'flex-start',
    },
    infoText: { fontSize: 12, flex: 1, lineHeight: 18 },
});
