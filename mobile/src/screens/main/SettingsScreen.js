import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    Switch, ScrollView, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSecurity } from '../../context/SecurityContext';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { spacing, radius } from '../../theme/colors';
import { get2FAStatus, toggle2FA } from '../../api/api';
import CustomAlertModal from '../../components/CustomAlertModal';
import VerifyIdentityModal from '../../components/VerifyIdentityModal';

export default function SettingsScreen({ navigation }) {
    const { COLORS, isDarkMode, toggleTheme } = useTheme();
    const { userInfo } = useAuth();
    const { logout } = useAuth();
    const {
        biometricEnabled, pinEnabled,
        isHardwareSupported, biometricType,
        toggleBiometric, removePin,
    } = useSecurity();

    const [logoutModal, setLogoutModal] = useState(false);
    const [removePinModal, setRemovePinModal] = useState(false);
    const [togglingBio, setTogglingBio] = useState(false);
    const [twoFAEnabled, setTwoFAEnabled] = useState(false);
    const [loading2FA, setLoading2FA] = useState(false);

    // Step-up verification modal
    const [verifyModal, setVerifyModal] = useState({ visible: false, onSuccess: null, subtitle: '' });
    const openVerify = (onSuccess, subtitle = '') => setVerifyModal({ visible: true, onSuccess, subtitle });
    const closeVerify = () => setVerifyModal({ visible: false, onSuccess: null, subtitle: '' });

    // 2FA Feedback Modal
    const [twoFAModal, setTwoFAModal] = useState({ visible: false, title: '', message: '', type: 'info' });

    useEffect(() => {
        fetch2FAStatus();
    }, []);

    const fetch2FAStatus = async () => {
        try {
            const res = await get2FAStatus();
            setTwoFAEnabled(res.twoFactorEnabled);
        } catch (err) {
            console.warn('[Settings] 2FA status fetch fail');
        }
    };

    const handleToggle2FA = (value) => {
        // Gate the toggle behind PIN/biometric verification
        openVerify(async () => {
            closeVerify();
            setLoading2FA(true);
            try {
                const res = await toggle2FA();
                setTwoFAEnabled(res.twoFactorEnabled);
                setTwoFAModal({
                    visible: true,
                    title: '2FA Updated',
                    message: res.twoFactorEnabled
                        ? 'Two-factor authentication is now enabled. You will need to verify your email on your next login.'
                        : 'Two-factor authentication has been disabled.',
                    type: 'success'
                });
            } catch (err) {
                setTwoFAModal({
                    visible: true,
                    title: 'Update Failed',
                    message: err.response?.data?.error || 'Failed to update 2FA setting. Please check your connection.',
                    type: 'error'
                });
            } finally {
                setLoading2FA(false);
            }
        }, 'Confirm your identity to change Two-Factor Auth');
    };

    const getBiometricLabel = () =>
        biometricType === 'face' ? 'Face ID' : 'Fingerprint';

    const getBiometricIcon = () =>
        biometricType === 'face' ? 'face-recognition' : 'fingerprint';

    const handleToggleBiometric = async (value) => {
        setTogglingBio(true);
        const res = await toggleBiometric(value);
        setTogglingBio(false);
        if (!res.success && value) {
            Alert.alert('Authentication Failed', 'Could not verify your identity. Biometric lock was not enabled.');
        }
    };

    const handleRemovePin = async () => {
        await removePin();
        setRemovePinModal(false);
    };

    // Verify then go to PinSetup (Change PIN)
    const handleChangePinPress = () => {
        openVerify(() => {
            closeVerify();
            navigation.navigate('PinSetup');
        }, 'Confirm your identity to change your PIN');
    };

    // Verify then remove PIN
    const handleRemovePinPress = () => {
        openVerify(() => {
            closeVerify();
            setRemovePinModal(true);
        }, 'Confirm your identity to remove PIN protection');
    };

    // ─── Section / Row helpers ────────────────────────────────────────────────
    const SectionHeader = ({ title, icon }) => (
        <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name={icon} size={14} color={COLORS.primary} style={{ marginRight: 6 }} />
            <Text style={[styles.sectionTitle, { color: COLORS.primary }]}>{title}</Text>
        </View>
    );

    const SettingRow = ({ icon, iconColor = COLORS.primary, label, sublabel, right, onPress, danger = false, noBorder = false }) => (
        <TouchableOpacity
            style={[styles.row, { borderColor: COLORS.border }, noBorder && { borderBottomWidth: 0 }]}
            onPress={onPress}
            activeOpacity={onPress ? 0.7 : 1}
            disabled={!onPress}
        >
            <View style={[styles.rowIcon, { backgroundColor: iconColor + '18' }]}>
                <MaterialCommunityIcons name={icon} size={20} color={iconColor} />
            </View>
            <View style={styles.rowInfo}>
                <Text style={[styles.rowLabel, { color: danger ? COLORS.danger : COLORS.text }]}>{label}</Text>
                {sublabel ? <Text style={[styles.rowSub, { color: COLORS.textMuted }]}>{sublabel}</Text> : null}
            </View>
            <View style={styles.rowRight}>{right}</View>
        </TouchableOpacity>
    );

    return (
        <SafeAreaView style={[styles.safe, { backgroundColor: COLORS.background }]}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: COLORS.border }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Feather name="arrow-left" size={22} color={COLORS.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: COLORS.text }]}>Settings</Text>
                <View style={{ width: 38 }} />
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 80 }}>
                {/* Profile card */}
                <LinearGradient colors={['#E91E8C', '#7b0f4e']} style={styles.profileCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                    <View style={styles.avatarCircle}>
                        <Text style={styles.avatarText}>
                            {userInfo?.name?.charAt(0)?.toUpperCase() || '?'}
                        </Text>
                    </View>
                    <View>
                        <Text style={styles.profileName}>{userInfo?.name || 'OTTER User'}</Text>
                        <Text style={styles.profileEmail}>{userInfo?.email || ''}</Text>
                    </View>
                </LinearGradient>

                {/* ── Security ─────────────────────────────────────────────── */}
                <View style={[styles.card, { backgroundColor: COLORS.surface }]}>
                    <SectionHeader title="SECURITY" icon="shield-lock" />

                    {/* Face ID / Fingerprint toggle */}
                    {isHardwareSupported && (
                        <SettingRow
                            icon={getBiometricIcon()}
                            label={getBiometricLabel()}
                            sublabel={biometricEnabled ? 'Enabled — app will lock using biometrics' : 'Disabled'}
                            right={
                                <Switch
                                    value={biometricEnabled}
                                    onValueChange={handleToggleBiometric}
                                    trackColor={{ false: COLORS.border, true: COLORS.primary + '60' }}
                                    thumbColor={biometricEnabled ? COLORS.primary : '#888'}
                                    disabled={togglingBio}
                                />
                            }
                        />
                    )}

                    {/* PIN Code */}
                    {pinEnabled ? (
                        <>
                            <SettingRow
                                icon="lock-reset"
                                label="Change PIN"
                                sublabel="Update your 6-digit security PIN"
                                right={<Feather name="chevron-right" size={18} color={COLORS.textMuted} />}
                                onPress={handleChangePinPress}
                            />
                            <SettingRow
                                icon="devices"
                                label="Login Sessions"
                                sublabel="Manage and revoke active devices"
                                right={<Feather name="chevron-right" size={18} color={COLORS.textMuted} />}
                                onPress={() => navigation.navigate('Sessions')}
                            />
                            <SettingRow
                                icon="lock-remove"
                                iconColor={COLORS.danger}
                                label="Remove PIN"
                                sublabel="Disable PIN protection"
                                danger
                                noBorder
                                right={<Feather name="chevron-right" size={18} color={COLORS.danger} />}
                                onPress={handleRemovePinPress}
                            />
                            <SettingRow
                                icon="email-check"
                                label="Two-Factor Auth"
                                sublabel="Extra security via email OTP"
                                noBorder
                                right={
                                    <Switch
                                        value={twoFAEnabled}
                                        onValueChange={handleToggle2FA}
                                        trackColor={{ false: COLORS.border, true: COLORS.primary + '60' }}
                                        thumbColor={twoFAEnabled ? COLORS.primary : '#888'}
                                        disabled={loading2FA}
                                    />
                                }
                            />
                        </>
                    ) : (
                        <SettingRow
                            icon="lock-plus"
                            label="Set Up PIN"
                            sublabel="Add a 6-digit PIN as a security layer"
                            noBorder
                            right={<Feather name="chevron-right" size={18} color={COLORS.textMuted} />}
                            onPress={() => navigation.navigate('PinSetup')}
                        />
                    )}
                </View>

                {/* Lock method note */}
                {(biometricEnabled || pinEnabled) && (
                    <View style={[styles.infoBox, { backgroundColor: COLORS.primary + '12', borderColor: COLORS.primary + '30' }]}>
                        <MaterialCommunityIcons name="information-outline" size={16} color={COLORS.primary} />
                        <Text style={[styles.infoText, { color: COLORS.textMuted }]}>
                            {biometricEnabled && pinEnabled
                                ? `Your app uses ${getBiometricLabel()} with PIN as fallback.`
                                : biometricEnabled
                                    ? `Your app is locked with ${getBiometricLabel()}.`
                                    : 'Your app is locked with a 6-digit PIN.'}
                        </Text>
                    </View>
                )}

                {/* ── Appearance ───────────────────────────────────────────── */}
                <View style={[styles.card, { backgroundColor: COLORS.surface, marginTop: 12 }]}>
                    <SectionHeader title="APPEARANCE" icon="palette" />
                    <SettingRow
                        icon={isDarkMode ? 'weather-sunny' : 'weather-night'}
                        label={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                        sublabel={isDarkMode ? 'Currently using dark theme' : 'Currently using light theme'}
                        noBorder
                        right={<Switch
                            value={isDarkMode}
                            onValueChange={toggleTheme}
                            trackColor={{ false: COLORS.border, true: COLORS.primary + '60' }}
                            thumbColor={isDarkMode ? COLORS.primary : '#888'}
                        />}
                    />
                </View>

                {/* ── Account ──────────────────────────────────────────────── */}
                <View style={[styles.card, { backgroundColor: COLORS.surface, marginTop: 12 }]}>
                    <SectionHeader title="ACCOUNT" icon="account-circle" />
                    <SettingRow
                        icon="logout"
                        iconColor={COLORS.danger}
                        label="Sign Out"
                        sublabel="Sign out of your OTTER account"
                        danger
                        noBorder
                        right={<Feather name="chevron-right" size={18} color={COLORS.danger} />}
                        onPress={() => setLogoutModal(true)}
                    />
                </View>

                {/* Version */}
                <Text style={[styles.version, { color: COLORS.textMuted }]}>OTTER Finance v1.0.0</Text>
            </ScrollView>

            {/* Logout Modal */}
            <CustomAlertModal
                visible={logoutModal}
                onClose={() => setLogoutModal(false)}
                onConfirm={() => { setLogoutModal(false); logout(); }}
                title="Sign Out"
                message="Are you sure you want to sign out of your OTTER account?"
                type="confirm"
                confirmText="Sign Out"
            />

            {/* Remove PIN Modal */}
            <CustomAlertModal
                visible={removePinModal}
                onClose={() => setRemovePinModal(false)}
                onConfirm={handleRemovePin}
                title="Remove PIN"
                message="Are you sure you want to remove your PIN? Your app will be less secure."
                type="confirm"
                confirmText="Remove PIN"
            />

            {/* 2FA Result Modal */}
            <CustomAlertModal
                visible={twoFAModal.visible}
                onClose={() => setTwoFAModal({ ...twoFAModal, visible: false })}
                title={twoFAModal.title}
                message={twoFAModal.message}
                type={twoFAModal.type}
            />

            {/* Step-up Identity Verification */}
            <VerifyIdentityModal
                visible={verifyModal.visible}
                subtitle={verifyModal.subtitle}
                onSuccess={verifyModal.onSuccess}
                onCancel={closeVerify}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1 },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
        borderBottomWidth: 1,
    },
    backBtn: { padding: 4 },
    headerTitle: { fontSize: 18, fontWeight: '800' },
    profileCard: {
        margin: spacing.lg, borderRadius: radius.xl,
        padding: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 14,
        shadowColor: '#E91E8C', shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
    },
    avatarCircle: {
        width: 52, height: 52, borderRadius: 26,
        backgroundColor: 'rgba(255,255,255,0.25)',
        justifyContent: 'center', alignItems: 'center',
    },
    avatarText: { fontSize: 22, fontWeight: '900', color: '#fff' },
    profileName: { fontSize: 16, fontWeight: '800', color: '#fff' },
    profileEmail: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
    card: {
        marginHorizontal: spacing.lg, borderRadius: radius.xl,
        overflow: 'hidden', paddingTop: 4, paddingBottom: 4,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12, shadowRadius: 8, elevation: 3,
    },
    sectionHeader: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: 6,
    },
    sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
    row: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: spacing.md, paddingVertical: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    rowIcon: { width: 38, height: 38, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    rowInfo: { flex: 1 },
    rowLabel: { fontSize: 15, fontWeight: '600' },
    rowSub: { fontSize: 12, marginTop: 2 },
    rowRight: { marginLeft: 8 },
    infoBox: {
        flexDirection: 'row', alignItems: 'flex-start', gap: 8,
        marginHorizontal: spacing.lg, marginTop: 10, borderRadius: radius.lg,
        padding: spacing.md, borderWidth: 1,
    },
    infoText: { fontSize: 13, lineHeight: 19, flex: 1 },
    version: { textAlign: 'center', marginTop: 32, fontSize: 12 },
});
