import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, TextInput, TouchableOpacity,
    StyleSheet, ActivityIndicator, KeyboardAvoidingView,
    Platform, ScrollView, Alert, Image, SafeAreaView,
    BackHandler, ToastAndroid
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { spacing, radius, typography } from '../../theme/colors';
import CustomAlertModal from '../../components/CustomAlertModal';

import * as AuthSession from 'expo-auth-session';

WebBrowser.maybeCompleteAuthSession();

const otterIcon = require('../../../assets/icon/otter.png');

// We dynamically determine the URI so it works for Expo Go AND standalone builds
// We dynamically determine the URI so it works for Expo Go AND standalone builds
const REDIRECT_URI = AuthSession.makeRedirectUri({
    scheme: 'otter'
});

export default function LoginScreen({ navigation }) {
    const { login, socialLogin, isLoading } = useAuth();
    const COLORS = useTheme(state => state.COLORS);
    const toggleTheme = useTheme(state => state.toggleTheme);
    const isDarkMode = useTheme(state => state.isDarkMode);
    const [lastBackPressed, setLastBackPressed] = useState(0);

    // ── Double Tap to Exit ──
    useEffect(() => {
        const backAction = () => {
            const currentTime = Date.now();
            if (currentTime - lastBackPressed < 2000) {
                BackHandler.exitApp();
                return true;
            }

            setLastBackPressed(currentTime);
            if (Platform.OS === 'android') {
                ToastAndroid.show('Press back again to exit', ToastAndroid.SHORT);
            }
            return true;
        };

        const backHandler = BackHandler.addEventListener(
            'hardwareBackPress',
            backAction
        );

        return () => backHandler.remove();
    }, [lastBackPressed]);

    // ── Google Auth Setup ──
    const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
        // For Expo Go / Personal Testing
        webClientId: '368902982049-1d7rsbq19pip9hmd3imrv6j5e3pcj3dt.apps.googleusercontent.com',
        // For Standalone Build
        androidClientId: '368902982049-7t1l2u3m97780l8ffkhejcu1i5o1p6q3.apps.googleusercontent.com', 
        clientId: '368902982049-1d7rsbq19pip9hmd3imrv6j5e3pcj3dt.apps.googleusercontent.com',
        redirectUri: REDIRECT_URI,
        responseType: 'id_token',
    });

    useEffect(() => {
        if (response?.type === 'success') {
            const { id_token } = response.params;
            handleSocialLogin('google', id_token);
        }
    }, [response]);

    const handleSocialLogin = async (provider, idToken) => {
        const result = await socialLogin(provider, idToken);
        if (!result.success) {
            setAlertTitle('Login Failed');
            setAlertMessage(result.message);
            setAlertVisible(true);
        }
        // Navigation is handled automatically by AppNavigator based on userToken presence
    };

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [lockUntil, setLockUntil] = useState(null);   // Date when lockout expires
    const [countdown, setCountdown] = useState('');      // Human-readable countdown
    const countdownRef = useRef(null);

    // Custom Alert State
    const [alertVisible, setAlertVisible] = useState(false);
    const [alertTitle, setAlertTitle] = useState('Error');
    const [alertMessage, setAlertMessage] = useState('');

    // Live countdown ticker
    useEffect(() => {
        if (!lockUntil) { setCountdown(''); return; }
        const tick = () => {
            const ms = new Date(lockUntil) - Date.now();
            if (ms <= 0) { setLockUntil(null); setCountdown(''); clearInterval(countdownRef.current); return; }
            const h = Math.floor(ms / 3600000);
            const m = Math.floor((ms % 3600000) / 60000);
            const s = Math.floor((ms % 60000) / 1000);
            setCountdown(h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`);
        };
        tick();
        countdownRef.current = setInterval(tick, 1000);
        return () => clearInterval(countdownRef.current);
    }, [lockUntil]);

    const isLocked = lockUntil && new Date(lockUntil) > new Date();

    const handleLogin = async () => {
        if (isLocked) return;
        if (!email.trim() || !password) {
            setAlertTitle('Missing Fields');
            setAlertMessage('Please enter your email and password.');
            setAlertVisible(true);
            return;
        }
        const result = await login(email.trim(), password);
        if (!result.success) {
            // Check if the server sent a lockedUntil timestamp (smart lockout)
            if (result.lockedUntil) {
                setLockUntil(result.lockedUntil);
            } else {
                setAlertTitle('Login Failed');
                setAlertMessage(result.message);
                setAlertVisible(true);
            }
        } else if (result.requires2FA) {
            // ── Navigate to 2FA Screen ─────────────────────────────────────────
            navigation.navigate('TwoFA', {
                tempToken: result.tempToken,
                maskedEmail: result.maskedEmail
            });
        }
    };

    const handleGoogleLogin = () => {
        promptAsync();
    };

    return (
        <View style={[styles.flex, { backgroundColor: COLORS.background }]}>
            <SafeAreaView style={styles.flex}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
                    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

                        {/* Logo / Mascot area */}
                        <View style={styles.header}>
                            <View style={[styles.logoCircle, { borderColor: COLORS.primary }]}>
                                <Image source={otterIcon} style={styles.logoImage} resizeMode="contain" />
                            </View>
                            <Text style={[styles.tagline, { color: COLORS.textMuted }]}>Eyes wide open on your wallet.</Text>
                        </View>

                        {/* Form Card */}
                        <View style={[styles.card, { backgroundColor: COLORS.cardBackground, borderColor: COLORS.border }]}>
                            <Text style={[styles.cardTitle, { color: COLORS.text }]}>Welcome back</Text>

                            <View style={styles.inputGroup}>
                                <Text style={[styles.label, { color: COLORS.textMuted }]}>EMAIL</Text>
                                <TextInput
                                    style={[styles.input, { backgroundColor: COLORS.inputBackground, borderColor: COLORS.inputBorder, color: COLORS.text }]}
                                    placeholder="you@example.com"
                                    placeholderTextColor={COLORS.textMuted}
                                    value={email}
                                    onChangeText={setEmail}
                                    keyboardType="email-address"
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                />
                            </View>

                            <View style={styles.inputGroup}>
                                <Text style={[styles.label, { color: COLORS.textMuted }]}>PASSWORD</Text>
                                <View style={[styles.inputContainer, { backgroundColor: COLORS.inputBackground, borderColor: COLORS.inputBorder }]}>
                                    <TextInput
                                        style={[styles.inputFlex, { color: COLORS.text }]}
                                        placeholder="••••••••"
                                        placeholderTextColor={COLORS.textMuted}
                                        value={password}
                                        onChangeText={setPassword}
                                        secureTextEntry={!showPassword}
                                        autoCapitalize="none"
                                    />
                                    <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
                                        <Feather name={showPassword ? 'eye' : 'eye-off'} size={20} color={COLORS.textMuted} />
                                    </TouchableOpacity>
                                </View>
                            </View>

                            <TouchableOpacity
                                style={styles.forgotBtn}
                                onPress={() => navigation.navigate('ForgotPassword')}
                            >
                                <Text style={[styles.forgotText, { color: COLORS.primary }]}>Forgot Password?</Text>
                            </TouchableOpacity>

                            {/* Lockout Warning Banner */}
                            {isLocked && (
                                <View style={styles.lockBanner}>
                                    <MaterialCommunityIcons name="lock-clock" size={20} color="#ef4444" />
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.lockBannerTitle}>Account Temporarily Locked</Text>
                                        <Text style={styles.lockBannerSub}>Try again in <Text style={{ fontWeight: '800' }}>{countdown}</Text></Text>
                                    </View>
                                </View>
                            )}

                            <TouchableOpacity
                                style={[styles.btn, (isLoading || isLocked) && styles.btnDisabled]}
                                onPress={handleLogin}
                                disabled={isLoading || isLocked}
                                activeOpacity={0.8}
                            >
                                <LinearGradient
                                    colors={isLocked ? ['#555', '#444'] : ['#E91E8C', '#B0146A']}
                                    style={styles.btnGradient}
                                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                >
                                    {isLoading
                                        ? <ActivityIndicator color="#fff" />
                                        : <Text style={styles.btnText}>{isLocked ? `Locked • ${countdown}` : 'Sign In'}</Text>
                                    }
                                </LinearGradient>
                            </TouchableOpacity>

                            <TouchableOpacity onPress={() => navigation.navigate('Register')} style={styles.switchRow}>
                                <Text style={[styles.switchText, { color: COLORS.textMuted }]}>
                                    Don't have an account?{' '}
                                    <Text style={[styles.switchLink, { color: COLORS.primary }]}>Register</Text>
                                </Text>
                            </TouchableOpacity>

                            {/* Divider */}
                            <View style={styles.dividerRow}>
                                <View style={[styles.dividerLine, { backgroundColor: COLORS.border }]} />
                                <Text style={[styles.dividerText, { color: COLORS.textMuted }]}>OR CONTINUE WITH</Text>
                                <View style={[styles.dividerLine, { backgroundColor: COLORS.border }]} />
                            </View>

                            {/* Social Buttons */}
                            <View style={styles.socialRow}>
                                <TouchableOpacity
                                    style={[styles.socialBtn, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
                                    onPress={handleGoogleLogin}
                                    disabled={!request || isLoading}
                                    activeOpacity={0.7}
                                >
                                    {isLoading ? <ActivityIndicator size="small" color={COLORS.primary} /> : (
                                        <>
                                            <MaterialCommunityIcons name="google" size={24} color="#EA4335" />
                                            <Text style={[styles.socialBtnText, { color: COLORS.text }]}>Sign in with Google</Text>
                                        </>
                                    )}
                                </TouchableOpacity>
                            </View>
                        </View>
                    </ScrollView>
                </KeyboardAvoidingView>

                <CustomAlertModal
                    visible={alertVisible}
                    onClose={() => setAlertVisible(false)}
                    title={alertTitle}
                    message={alertMessage}
                    type="error"
                />
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    flex: { flex: 1 },
    themeToggle: { position: 'absolute', top: spacing.md, right: spacing.md, zIndex: 10, padding: 8 },
    container: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
    header: { alignItems: 'center', marginBottom: spacing.xl },
    logoCircle: {
        width: 104, height: 104, borderRadius: 32,
        backgroundColor: 'rgba(233,30,140,0.05)',
        borderWidth: 2,
        alignItems: 'center', justifyContent: 'center',
        marginBottom: spacing.md, overflow: 'hidden'
    },
    logoImage: { width: 100, height: 100 },
    tagline: { ...typography.bodyMuted, marginTop: 4 },
    card: {
        width: '100%',
        borderRadius: radius.lg, padding: spacing.lg,
        borderWidth: 1,
    },
    cardTitle: { ...typography.h2, marginBottom: spacing.lg },
    inputGroup: { marginBottom: spacing.md },
    label: { ...typography.label, marginBottom: spacing.xs },
    input: {
        borderWidth: 1, borderRadius: radius.md,
        paddingHorizontal: spacing.md, paddingVertical: 14,
        fontSize: 15,
    },
    inputContainer: {
        flexDirection: 'row', alignItems: 'center',
        borderWidth: 1, borderRadius: radius.md,
        paddingHorizontal: spacing.md,
    },
    inputFlex: {
        flex: 1, paddingVertical: 14, fontSize: 15,
    },
    eyeIcon: { padding: 8 },
    forgotBtn: { alignSelf: 'flex-end', padding: 4 },
    forgotText: { fontSize: 14, fontWeight: '700' },
    btn: { borderRadius: radius.md, overflow: 'hidden', marginTop: spacing.sm },
    btnGradient: { paddingVertical: 16, alignItems: 'center' },
    btnDisabled: { opacity: 0.6 },
    btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    switchRow: { alignItems: 'center', marginTop: spacing.md },
    switchText: { ...typography.bodyMuted },
    switchLink: { fontWeight: '600' },
    lockBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: 'rgba(239,68,68,0.1)',
        borderWidth: 1,
        borderColor: 'rgba(239,68,68,0.25)',
        borderRadius: radius.md,
        padding: spacing.md,
        marginBottom: spacing.sm,
    },
    lockBannerTitle: { color: '#ef4444', fontWeight: '700', fontSize: 13 },
    lockBannerSub: { color: '#ef4444', fontSize: 12, marginTop: 2 },
    dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.lg, gap: 12 },
    dividerLine: { flex: 1, height: 1 },
    dividerText: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
    socialRow: { flexDirection: 'row', gap: 12 },
    socialBtn: {
        flex: 1, height: 56, borderRadius: radius.md, borderWidth: 1,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10
    },
    socialBtnText: { fontSize: 14, fontWeight: '700' },
});
