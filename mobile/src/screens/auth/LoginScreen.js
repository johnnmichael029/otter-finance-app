import React, { useState } from 'react';
import {
    View, Text, TextInput, TouchableOpacity,
    StyleSheet, ActivityIndicator, KeyboardAvoidingView,
    Platform, ScrollView, Alert, Image, SafeAreaView
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { spacing, radius, typography } from '../../theme/colors';
import { Feather } from '@expo/vector-icons';

const otterIcon = require('../../../assets/icon/otter.png');

export default function LoginScreen({ navigation }) {
    const { login, isLoading } = useAuth();
    const { COLORS, toggleTheme, isDarkMode } = useTheme();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const handleLogin = async () => {
        if (!email.trim() || !password) {
            return Alert.alert('Missing Fields', 'Please enter your email and password.');
        }
        const result = await login(email.trim(), password);
        if (!result.success) {
            Alert.alert('Login Failed', result.message);
        }
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
                                    />
                                    <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
                                        <Feather name={showPassword ? 'eye' : 'eye-off'} size={20} color={COLORS.textMuted} />
                                    </TouchableOpacity>
                                </View>
                            </View>

                            <TouchableOpacity
                                style={[styles.btn, isLoading && styles.btnDisabled]}
                                onPress={handleLogin}
                                disabled={isLoading}
                                activeOpacity={0.8}
                            >
                                <LinearGradient
                                    colors={['#E91E8C', '#B0146A']}
                                    style={styles.btnGradient}
                                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                >
                                    {isLoading
                                        ? <ActivityIndicator color="#fff" />
                                        : <Text style={styles.btnText}>Sign In</Text>
                                    }
                                </LinearGradient>
                            </TouchableOpacity>

                            <TouchableOpacity onPress={() => navigation.navigate('Register')} style={styles.switchRow}>
                                <Text style={[styles.switchText, { color: COLORS.textMuted }]}>
                                    Don't have an account?{' '}
                                    <Text style={[styles.switchLink, { color: COLORS.primary }]}>Register</Text>
                                </Text>
                            </TouchableOpacity>
                        </View>

                    </ScrollView>
                </KeyboardAvoidingView>
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
    eyeIcon: { padding: 4 },
    btn: { borderRadius: radius.md, overflow: 'hidden', marginTop: spacing.sm },
    btnGradient: { paddingVertical: 16, alignItems: 'center' },
    btnDisabled: { opacity: 0.6 },
    btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    switchRow: { alignItems: 'center', marginTop: spacing.md },
    switchText: { ...typography.bodyMuted },
    switchLink: { fontWeight: '600' },
});
