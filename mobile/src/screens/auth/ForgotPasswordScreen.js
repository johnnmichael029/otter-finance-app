import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    Animated, StatusBar, TextInput,
    ActivityIndicator, Dimensions, KeyboardAvoidingView, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import axios from 'axios';
import { API_BASE, useAuth } from '../../context/AuthContext';
import { spacing, radius, typography } from '../../theme/colors';
import { useTheme } from '../../context/ThemeContext';
import { triggerHaptic } from '../../utils/haptics';

const { width } = Dimensions.get('window');
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

export default function ForgotPasswordScreen({ navigation }) {
    const COLORS = useTheme(state => state.COLORS);
    const hapticsEnabled = useAuth(state => state.hapticsEnabled);

    // ── Steps: 0 (Email), 1 (OTP), 2 (Reset Password) ──
    const [step, setStep] = useState(0);
    const [email, setEmail] = useState('');
    const [otp, setOtp] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [resetToken, setResetToken] = useState(null); // Temporary JWT from backend

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [resendCooldown, setResendCooldown] = useState(0);

    const fadeAnim = useRef(new Animated.Value(1)).current;
    const shakeAnim = useRef(new Animated.Value(0)).current;
    const inputRef = useRef(null);
    const cooldownRef = useRef(null);

    // ── Password Strength Logic ──
    const getStrength = (pass) => {
        let score = 0;
        if (pass.length > 5) score += 1;
        if (pass.length > 8) score += 1;
        if (/[A-Z]/.test(pass)) score += 1;
        if (/[0-9]/.test(pass)) score += 1;
        if (/[^A-Za-z0-9]/.test(pass)) score += 1;
        return score; // Max 5
    };

    const strengthColor = () => {
        const score = getStrength(newPassword);
        if (score <= 2) return '#ef4444'; // Red
        if (score <= 3) return '#f59e0b'; // Orange
        if (score <= 4) return '#fbbf24'; // Yellow
        return '#10b981'; // Green
    };

    const strengthLabel = () => {
        const score = getStrength(newPassword);
        if (score === 0) return '';
        if (score <= 2) return 'Weak';
        if (score <= 4) return 'Good';
        return 'Strong! 🦾';
    };

    // ── Animations ──
    const transitionTo = (nextStep) => {
        Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
            setStep(nextStep);
            setError('');
            Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
        });
    };

    const shake = () => {
        triggerHaptic(hapticsEnabled, 'notificationError');
        Animated.sequence([
            Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 6, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
        ]).start();
    };

    // ── Step 0: Request Code ──
    const handleRequestCode = async () => {
        if (!email.includes('@')) {
            setError('Please enter a valid email address.');
            return;
        }
        setLoading(true);
        setError('');
        try {
            await axios.post(`${API_BASE}/auth/forgot-password`, { email: email.trim() });
            startCooldown();
            transitionTo(1);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to send code.');
        } finally {
            setLoading(false);
        }
    };

    // ── Step 1: Verify Code ──
    const handleVerifyCode = async (codeValue) => {
        setLoading(true);
        setError('');
        try {
            const res = await axios.post(`${API_BASE}/auth/verify-reset-code`, {
                email: email.trim(),
                code: codeValue || otp
            });
            setResetToken(res.data.resetToken);
            transitionTo(2);
        } catch (err) {
            setError(err.response?.data?.error || 'Invalid or expired code.');
            setOtp('');
            shake();
        } finally {
            setLoading(false);
        }
    };

    // ── Step 2: Reset Password ──
    const handleResetPassword = async () => {
        if (newPassword.length < 6) {
            setError('Password must be at least 6 characters.');
            return;
        }
        if (newPassword !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }
        setLoading(true);
        setError('');
        try {
            await axios.post(`${API_BASE}/auth/reset-password`, {
                resetToken,
                newPassword
            });
            // Success! Send back to login
            navigation.navigate('Login', {
                successMessage: 'Password reset successful. Please log in.'
            });
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to reset password.');
        } finally {
            setLoading(false);
        }
    };

    // ── OTP Logic (Magic Boxes) ──
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
        if (step === 1 && otp.length === OTP_LENGTH) {
            handleVerifyCode(otp);
        }
    }, [otp, step]);

    // ── UI Components ──
    const renderStep0 = () => (
        <View style={styles.stepContainer}>
            <View style={styles.iconCircle}>
                <Feather name="mail" size={36} color="#fff" />
            </View>
            <Text style={[styles.title, { color: COLORS.text }]}>Forgot Password?</Text>
            <Text style={[styles.subtitle, { color: COLORS.textMuted }]}>
                No worries! Enter your email and we'll send you a recovery code to restart your raft.
            </Text>

            <View style={[styles.inputWrapper, { backgroundColor: COLORS.surface, borderColor: error ? '#ef4444' : COLORS.border }]}>
                <Feather name="at-sign" size={18} color={COLORS.textMuted} />
                <TextInput
                    style={[styles.input, { color: COLORS.text }]}
                    placeholder="Email Address"
                    placeholderTextColor={COLORS.textMuted}
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                />
            </View>

            <TouchableOpacity style={styles.primaryBtn} onPress={handleRequestCode} disabled={loading}>
                <LinearGradient colors={['#E91E8C', '#B0146A']} style={styles.btnGrad}>
                    {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Send Code</Text>}
                </LinearGradient>
            </TouchableOpacity>
        </View>
    );

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

    const renderStep1 = () => (
        <View style={styles.stepContainer}>
            <View style={styles.iconCircle}>
                <Feather name="shield" size={36} color="#fff" />
            </View>
            <Text style={[styles.title, { color: COLORS.text }]}>Verify Code</Text>
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

            <TouchableOpacity
                onPress={() => resendCooldown === 0 && handleRequestCode()}
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
        </View>
    );

    const renderStep2 = () => (
        <View style={styles.stepContainer}>
            <View style={styles.iconCircle}>
                <Feather name="lock" size={36} color="#fff" />
            </View>
            <Text style={[styles.title, { color: COLORS.text }]}>New Password</Text>
            <Text style={[styles.subtitle, { color: COLORS.textMuted }]}>
                Choose a strong password to keep your Otter raft safe and secure.
            </Text>

            {/* New Password Input */}
            <View style={[styles.inputWrapper, { backgroundColor: COLORS.surface, borderColor: COLORS.border, marginBottom: 8 }]}>
                <Feather name="lock" size={18} color={COLORS.textMuted} />
                <TextInput
                    style={[styles.input, { color: COLORS.text }]}
                    placeholder="New Password"
                    placeholderTextColor={COLORS.textMuted}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
                    <Feather name={showPassword ? "eye" : "eye-off"} size={18} color={COLORS.textMuted} />
                </TouchableOpacity>
            </View>

            {/* Strength Meter */}
            <View style={styles.strengthContainer}>
                <View style={styles.strengthRow}>
                    <Text style={[styles.strengthText, { color: COLORS.textMuted }]}>Security Level</Text>
                    <Text style={[styles.strengthLabel, { color: strengthColor(), fontWeight: '800' }]}>{strengthLabel()}</Text>
                </View>
                <View style={styles.segmentedBar}>
                    {[1, 2, 3, 4, 5].map((segment) => {
                        const score = getStrength(newPassword);
                        const isActive = segment <= score;
                        return (
                            <View 
                                key={segment}
                                style={[
                                    styles.segment, 
                                    { 
                                        backgroundColor: isActive ? strengthColor() : COLORS.border,
                                        opacity: isActive ? 1 : 0.3
                                    }
                                ]} 
                            />
                        );
                    })}
                </View>
            </View>

            {/* Confirm Password Input */}
            <View style={[styles.inputWrapper, { backgroundColor: COLORS.surface, borderColor: COLORS.border, marginTop: 12 }]}>
                <Feather name="check-circle" size={18} color={COLORS.textMuted} />
                <TextInput
                    style={[styles.input, { color: COLORS.text }]}
                    placeholder="Confirm New Password"
                    placeholderTextColor={COLORS.textMuted}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showConfirmPassword}
                    autoCapitalize="none"
                />
                <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={styles.eyeIcon}>
                    <Feather name={showConfirmPassword ? "eye" : "eye-off"} size={18} color={COLORS.textMuted} />
                </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.primaryBtn} onPress={handleResetPassword} disabled={loading}>
                <LinearGradient colors={['#E91E8C', '#B0146A']} style={styles.btnGrad}>
                    {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Reset Password</Text>}
                </LinearGradient>
            </TouchableOpacity>
        </View>
    );

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
                    <Animated.View style={[styles.flex, { opacity: fadeAnim }]}>
                        {step === 0 && renderStep0()}
                        {step === 1 && renderStep1()}
                        {step === 2 && renderStep2()}

                        {!!error && (
                            <View style={styles.errorBox}>
                                <Feather name="alert-circle" size={16} color="#ef4444" />
                                <Text style={styles.errorText}>{error}</Text>
                            </View>
                        )}
                    </Animated.View>
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
    inputWrapper: {
        width: '100%', height: 60, borderRadius: 18, borderWidth: 1,
        flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
        marginBottom: 24
    },
    input: { flex: 1, marginLeft: 12, fontSize: 16, fontWeight: '600' },
    primaryBtn: { width: '100%', height: 60, borderRadius: 18, marginTop: 10, overflow: 'hidden', elevation: 8, shadowColor: '#E91E8C', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
    btnGrad: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    btnText: { color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: 1 },
    hiddenInput: { position: 'absolute', opacity: 0, width: 1, height: 1 },
    otpRow: { flexDirection: 'row', gap: 12, marginBottom: 40, justifyContent: 'center' },
    otpBox: { width: 50, height: 65, borderRadius: 16, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
    otpDigit: { fontSize: 24, fontWeight: '800' },
    cursor: { width: 2, height: 28, borderRadius: 1 },
    resendBtn: { marginTop: 20 },
    resendText: { fontSize: 14 },
    eyeIcon: { padding: 10 },
    strengthContainer: { width: '100%', marginBottom: 20, paddingHorizontal: 4 },
    strengthRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    strengthText: { fontSize: 13, fontWeight: '600' },
    strengthLabel: { fontSize: 13 },
    segmentedBar: { flexDirection: 'row', gap: 6, height: 6, width: '100%' },
    segment: { flex: 1, borderRadius: 3 },
    errorBox: { 
        flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(239,68,68,0.1)', 
        padding: 16, marginHorizontal: spacing.xl, borderRadius: 16, 
        marginTop: 20, borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)' 
    },
    errorText: { color: '#ef4444', fontSize: 14, fontWeight: '600', marginLeft: 10, flex: 1 }
});
