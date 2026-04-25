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
import CustomAlertModal from '../../components/CustomAlertModal';

const otterIcon = require('../../../assets/icon/otter.png');

export default function RegisterScreen({ navigation }) {
    const { register, isLoading } = useAuth();
    const COLORS = useTheme(state => state.COLORS);
    const toggleTheme = useTheme(state => state.toggleTheme);
    const isDarkMode = useTheme(state => state.isDarkMode);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [alert, setAlert] = useState({ visible: false, type: 'info', title: '', message: '', onSuccess: null });

    const showAlert = (type, title, message, onSuccess = null) => {
        setAlert({ visible: true, type, title, message, onSuccess });
    };
    
    const closeAlert = () => {
        setAlert((prev) => ({ ...prev, visible: false }));
        if (alert.onSuccess) alert.onSuccess();
    };

    const handleRegister = async () => {
        if (!name.trim() || !email.trim() || !password) {
            return showAlert('warning', 'Missing Fields', 'All fields are required.');
        }
        if (password !== confirmPassword) {
            return showAlert('warning', 'Password Mismatch', 'Passwords do not match.');
        }
        if (password.length < 6) {
            return showAlert('error', 'Weak Password', 'Password must be at least 6 characters.');
        }
        const result = await register(name.trim(), email.trim(), password);
        if (result.success) {
            showAlert('success', 'Success', 'Account created successfully!', () => {
                navigation.navigate('Login');
            });
        } else {
            showAlert('error', 'Registration Failed', result.message || 'An error occurred.');
        }
    };

    return (
        <View style={[styles.flex, { backgroundColor: COLORS.background }]}>
            <SafeAreaView style={styles.flex}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
                    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

                        <View style={styles.header}>
                            <View style={[styles.logoCircle, { borderColor: COLORS.primary }]}>
                                <Image source={otterIcon} style={styles.logoImage} resizeMode="contain" />
                            </View>
                            <Text style={[styles.tagline, { color: COLORS.textMuted }]}>Start tracking your wallet.</Text>
                        </View>

                        <View style={[styles.card, { backgroundColor: COLORS.cardBackground, borderColor: COLORS.border }]}>
                            <Text style={[styles.cardTitle, { color: COLORS.text }]}>Create Account</Text>

                            {[
                                { label: 'FULL NAME', value: name, onChange: setName, placeholder: 'Juan dela Cruz' },
                                { label: 'EMAIL', value: email, onChange: setEmail, placeholder: 'you@example.com', keyboard: 'email-address' },
                                { label: 'PASSWORD', value: password, onChange: setPassword, placeholder: '••••••••', secure: true },
                                { label: 'CONFIRM PASSWORD', value: confirmPassword, onChange: setConfirmPassword, placeholder: '••••••••', secure: true },
                            ].map((field) => (
                                <View style={styles.inputGroup} key={field.label}>
                                    <Text style={[styles.label, { color: COLORS.textMuted }]}>{field.label}</Text>
                                    {field.secure ? (
                                        <View style={[styles.inputContainer, { backgroundColor: COLORS.inputBackground, borderColor: COLORS.inputBorder }]}>
                                            <TextInput
                                                style={[styles.inputFlex, { color: COLORS.text }]}
                                                placeholder={field.placeholder}
                                                placeholderTextColor={COLORS.textMuted}
                                                value={field.value}
                                                onChangeText={field.onChange}
                                                secureTextEntry={!showPassword}
                                                autoCapitalize="none"
                                                autoCorrect={false}
                                            />
                                            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
                                                <Feather name={showPassword ? 'eye' : 'eye-off'} size={20} color={COLORS.textMuted} />
                                            </TouchableOpacity>
                                        </View>
                                    ) : (
                                        <TextInput
                                            style={[styles.input, { backgroundColor: COLORS.inputBackground, borderColor: COLORS.inputBorder, color: COLORS.text }]}
                                            placeholder={field.placeholder}
                                            placeholderTextColor={COLORS.textMuted}
                                            value={field.value}
                                            onChangeText={field.onChange}
                                            keyboardType={field.keyboard || 'default'}
                                            autoCapitalize={field.keyboard === 'email-address' ? 'none' : 'words'}
                                            autoCorrect={false}
                                        />
                                    )}
                                </View>
                            ))}

                            <TouchableOpacity
                                style={[styles.btn, isLoading && styles.btnDisabled]}
                                onPress={handleRegister}
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
                                        : <Text style={styles.btnText}>Create Account</Text>
                                    }
                                </LinearGradient>
                            </TouchableOpacity>

                            <TouchableOpacity onPress={() => navigation.navigate('Login')} style={styles.switchRow}>
                                <Text style={[styles.switchText, { color: COLORS.textMuted }]}>
                                    Already have an account?{' '}
                                    <Text style={[styles.switchLink, { color: COLORS.primary }]}>Sign In</Text>
                                </Text>
                            </TouchableOpacity>
                        </View>

                    </ScrollView>
                </KeyboardAvoidingView>
            </SafeAreaView>

            <CustomAlertModal
                visible={alert.visible}
                onClose={closeAlert}
                onConfirm={closeAlert}
                title={alert.title}
                message={alert.message}
                type={alert.type}
            />
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
