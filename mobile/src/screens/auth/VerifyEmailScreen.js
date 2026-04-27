import React, { useState, useRef, useEffect } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    Animated, StatusBar, TextInput,
    ActivityIndicator, KeyboardAvoidingView, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { spacing, radius } from '../../theme/colors';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { triggerHaptic } from '../../utils/haptics';

const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 60;

const Cursor = () => {
    const opacity = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        const anim = Animated.loop(
            Animated.sequence([
                Animated.timing(opacity, { toValue: 0, duration: 500, useNativeDriver: true }),
                Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: true }),
            ])
        );
        anim.start();
        return () => anim.stop();
    }, []);

    return <Animated.View style={[styles.cursor, { backgroundColor: '#E91E8C', opacity }]} />;
};

export default function VerifyEmailScreen({ route, navigation }) {
    const COLORS = useTheme(state => state.COLORS);
    const { verifyRegister, register, hapticsEnabled } = useAuth(); // register to resend OTP
    const { email, tempToken, name, password } = route.params;

    const [otp, setOtp] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN);
    const [currentTempToken, setCurrentTempToken] = useState(tempToken);

    const shakeAnim = useRef(new Animated.Value(0)).current;
    const inputRef = useRef(null);
    const cooldownRef = useRef(null);

    const shake = () => {
        triggerHaptic(hapticsEnabled, 'notificationError');
        Animated.sequence([
            Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 6, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
        ]).start();
    };

    const startCooldown = () => {
        setResendCooldown(RESEND_COOLDOWN);
        if (cooldownRef.current) clearInterval(cooldownRef.current);
        cooldownRef.current = setInterval(() => {
            setResendCooldown(prev => {
                if (prev <= 1) { clearInterval(cooldownRef.current); return 0; }
                return prev - 1;
            });
        }, 1000);
    };

    useEffect(() => {
        startCooldown();
        return () => clearInterval(cooldownRef.current);
    }, []);

    const handleVerify = async (codeValue) => {
        setLoading(true);
        setError('');
        const result = await verifyRegister(currentTempToken, codeValue || otp);
        if (result.success) {
            // App state handles auth change, we don't need to navigate manually
            // But if it takes a sec, we can just show loading
        } else {
            setError(result.message || 'Invalid or expired code.');
            setOtp('');
            shake();
            setLoading(false);
        }
    };

    const handleResend = async () => {
        setLoading(true);
        setError('');
        const result = await register(name, email, password);
        if (result.success) {
            setCurrentTempToken(result.tempToken);
            startCooldown();
        } else {
            setError(result.message || 'Failed to resend code.');
        }
        setLoading(false);
    };

    useEffect(() => {
        if (otp.length === OTP_LENGTH) {
            handleVerify(otp);
        }
    }, [otp]);

    const renderOTPBoxes = () => {
        return Array.from({ length: OTP_LENGTH }).map((_, i) => {
            const filled = i < otp.length;
            const active = i === otp.length && !loading;
            return (
                <TouchableOpacity
                    key={i}
                    onPress={() => inputRef.current?.focus()}
                    style={[
                        styles.otpBox,
                        {
                            backgroundColor: COLORS.surface,
                            borderColor: active ? '#E91E8C' : filled ? '#E91E8C50' : COLORS.border,
                            elevation: active ? 8 : 0,
                            shadowColor: '#E91E8C',
                            shadowOffset: { width: 0, height: 4 },
                            shadowOpacity: active ? 0.3 : 0,
                            shadowRadius: 8,
                            transform: [{ scale: active ? 1.05 : 1 }]
                        }
                    ]}
                    activeOpacity={0.8}
                >
                    {filled ? (
                        <Text style={[styles.otpDigit, { color: COLORS.text }]}>{otp[i]}</Text>
                    ) : (
                        active && <Cursor />
                    )}
                </TouchableOpacity>
            );
        });
    };

    return (
        <View style={[styles.container, { backgroundColor: COLORS.background }]}>
            <StatusBar barStyle="dark-content" />
            <SafeAreaView style={styles.safe}>
                <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
                    <Feather name="arrow-left" size={24} color={COLORS.text} />
                </TouchableOpacity>

                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={styles.flex}
                >
                    <View style={styles.stepContainer}>
                        <View style={styles.iconCircle}>
                            <Feather name="mail" size={36} color="#fff" />
                        </View>
                        <Text style={[styles.title, { color: COLORS.text }]}>Verify Email</Text>
                        <Text style={[styles.subtitle, { color: COLORS.textMuted }]}>
                            We sent a secure code to{'\n'}
                            <Text style={{ color: COLORS.primary, fontWeight: '700' }}>{email}</Text>
                        </Text>

                        <TextInput
                            ref={inputRef}
                            value={otp}
                            onChangeText={val => {
                                setError('');
                                setOtp(val.replace(/[^0-9]/g, '').slice(0, OTP_LENGTH));
                            }}
                            keyboardType="number-pad"
                            maxLength={OTP_LENGTH}
                            style={styles.hiddenInput}
                            autoFocus
                        />

                        <Animated.View style={[styles.otpRow, { transform: [{ translateX: shakeAnim }] }]}>
                            {renderOTPBoxes()}
                        </Animated.View>

                        {!!error && (
                            <View style={styles.errorBox}>
                                <Feather name="alert-circle" size={16} color="#ef4444" />
                                <Text style={styles.errorText}>{error}</Text>
                            </View>
                        )}

                        <TouchableOpacity
                            onPress={() => resendCooldown === 0 && handleResend()}
                            disabled={resendCooldown > 0 || loading}
                            style={styles.resendBtn}
                        >
                            <Text style={[styles.resendText, { color: COLORS.textMuted }]}>
                                Didn't get the code?{' '}
                                <Text style={{ color: resendCooldown > 0 ? COLORS.textMuted : '#E91E8C', fontWeight: '700' }}>
                                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend'}
                                </Text>
                            </Text>
                        </TouchableOpacity>
                        
                        {loading && <ActivityIndicator color="#E91E8C" style={{ marginTop: 20 }} />}
                    </View>
                </KeyboardAvoidingView>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    safe: { flex: 1 },
    flex: { flex: 1 },
    backBtn: { padding: spacing.lg, width: 60 },
    stepContainer: { flex: 1, paddingHorizontal: spacing.xl, alignItems: 'center', paddingTop: 20 },
    iconCircle: {
        width: 80, height: 80, borderRadius: 28,
        backgroundColor: '#E91E8C', justifyContent: 'center', alignItems: 'center',
        marginBottom: 24, elevation: 12, shadowColor: '#E91E8C',
        shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16
    },
    title: { fontSize: 26, fontWeight: '900', marginBottom: 12, textAlign: 'center' },
    subtitle: { fontSize: 15, textAlign: 'center', lineHeight: 24, marginBottom: 40, paddingHorizontal: 10 },
    hiddenInput: { position: 'absolute', opacity: 0, width: 1, height: 1 },
    otpRow: { flexDirection: 'row', gap: 12, marginBottom: 20, justifyContent: 'center' },
    otpBox: { width: 50, height: 65, borderRadius: 16, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
    otpDigit: { fontSize: 24, fontWeight: '800' },
    cursor: { width: 2, height: 28, borderRadius: 1 },
    resendBtn: { marginTop: 20 },
    resendText: { fontSize: 14 },
    errorBox: { 
        flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(239,68,68,0.1)', 
        padding: 16, marginHorizontal: spacing.xl, borderRadius: 16, 
        marginTop: 10, borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)' 
    },
    errorText: { color: '#ef4444', fontSize: 14, fontWeight: '600', marginLeft: 10, flex: 1 }
});
