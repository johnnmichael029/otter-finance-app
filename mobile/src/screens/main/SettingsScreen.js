import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    Switch, ScrollView, Alert, ActivityIndicator,
    TextInput, Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSecurity } from '../../context/SecurityContext';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useFinanceStore } from '../../store/financeStore';
import { spacing, radius } from '../../theme/colors';
import { API_BASE } from '../../store/authStore';
import {
    get2FAStatus, toggle2FA, getCurrencyList,
    updateProfile as apiUpdateProfile, getTransactions,
    changePassword as apiChangePassword,
    wipeData as apiWipeData,
    deleteAccount as apiDeleteAccount,
    getProfile as apiGetProfile
} from '../../api/api';
import { triggerHaptic } from '../../utils/haptics';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import BottomSheetModal from '../../components/BottomSheetModal';
import CustomAlertModal from '../../components/CustomAlertModal';
import VerifyIdentityModal from '../../components/VerifyIdentityModal';

export default function SettingsScreen({ navigation }) {
    const COLORS = useTheme(state => state.COLORS);
    const isDarkMode = useTheme(state => state.isDarkMode);
    const toggleTheme = useTheme(state => state.toggleTheme);
    const { userInfo, updateLocalUser, logout, hapticsEnabled, toggleHaptics, savingsFabStyle, toggleSavingsFabStyle } = useAuth();


    const [currencyModalVisible, setCurrencyModalVisible] = useState(false);
    const [currencyList, setCurrencyList] = useState([]);
    const [updatingCurrency, setUpdatingCurrency] = useState(false);

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
    const [exporting, setExporting] = useState(false);
    const [exportModalVisible, setExportModalVisible] = useState(false);
    const [exportFormat, setExportFormat] = useState('csv'); // 'csv' or 'pdf'
    const [exportRange, setExportRange] = useState('all'); // 'month', 'last_month', 'year', 'all'

    // Security States
    const [changePasswordModal, setChangePasswordModal] = useState(false);
    const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' });
    const [wipeDataModal, setWipeDataModal] = useState(false);
    const [deleteAccountModal, setDeleteAccountModal] = useState(false);
    const [verifyPassword, setVerifyPassword] = useState('');
    const [confirmText, setConfirmText] = useState('');
    const [isActionLoading, setIsActionLoading] = useState(false);

    // Step-up verification modal
    const [verifyModal, setVerifyModal] = useState({ visible: false, onSuccess: null, subtitle: '' });
    const openVerify = (onSuccess, subtitle = '') => setVerifyModal({ visible: true, onSuccess, subtitle });
    const closeVerify = () => setVerifyModal({ visible: false, onSuccess: null, subtitle: '' });

    // 2FA Feedback Modal
    const [twoFAModal, setTwoFAModal] = useState({ visible: false, title: '', message: '', type: 'info' });

    useEffect(() => {
        fetchInitialData();
    }, []);

    const fetchInitialData = async () => {
        try {
            // Refresh user info to ensure createdAt and other fields are up to date
            const fullProfile = await apiGetProfile();
            await updateLocalUser(fullProfile);

            const res = await get2FAStatus();
            setTwoFAEnabled(res.twoFactorEnabled);

            // Also fetch currency list
            const curRes = await getCurrencyList();
            if (curRes.currencies) setCurrencyList(curRes.currencies);
        } catch (err) {
            console.warn('[Settings] Initial fetch fail');
        }
    };

    const handleUpdateCurrency = async (currencyCode) => {
        triggerHaptic(hapticsEnabled, 'notificationSuccess');
        setUpdatingCurrency(true);
        try {
            const res = await apiUpdateProfile({ currency: currencyCode });
            await updateLocalUser(res);
            setCurrencyModalVisible(false);
        } catch (err) {
            console.error('[Settings] Currency update fail');
        } finally {
            setUpdatingCurrency(false);
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

    const handleLogout = async () => {
        setLogoutModal(false);
        await logout();
    };

    const onToggleHaptics = async () => {
        triggerHaptic(hapticsEnabled, 'impactMedium');
        await toggleHaptics();
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

    const handleExportData = async () => {
        setExporting(true);
        setExportModalVisible(false); // close the parameters modal
        try {
            let qs = { limit: 100000 };
            if (exportRange !== 'all') {
                const now = new Date();
                let start, end;
                if (exportRange === 'month') {
                    start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
                    end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
                } else if (exportRange === 'last_month') {
                    start = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
                    end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString();
                } else if (exportRange === 'year') {
                    start = new Date(now.getFullYear(), 0, 1).toISOString();
                    end = new Date(now.getFullYear(), 11, 31, 23, 59, 59).toISOString();
                }
                if (start && end) {
                    qs.startDate = start;
                    qs.endDate = end;
                }
            }

            const response = await getTransactions(qs);
            if (!response?.transactions || response.transactions.length === 0) {
                setTwoFAModal({ visible: true, title: 'No Data', message: 'You have no transactions to export for this range.', type: 'info' });
                return;
            }

            const txs = response.transactions;

            if (exportFormat === 'csv') {
                const csvHeader = 'Date,Type,Category,Amount,Currency,Note,Description,ReceiptURL\n';
                const csvRows = txs.map(tx => {
                    const date = new Date(tx.date).toISOString().split('T')[0];
                    const note = tx.note ? `"${tx.note.replace(/"/g, '""')}"` : '';
                    const desc = tx.description ? `"${tx.description.replace(/"/g, '""')}"` : '';
                    const attach = tx.attachment ? `"${tx.attachment}"` : '';
                    return `${date},${tx.type},${tx.category},${tx.amount},${tx.currency || 'PHP'},${note},${desc},${attach}`;
                }).join('\n');
                const fileUri = FileSystem.documentDirectory + `Otter_Export_${exportRange}.csv`;
                await FileSystem.writeAsStringAsync(fileUri, csvHeader + csvRows);
                if (await Sharing.isAvailableAsync()) {
                    await Sharing.shareAsync(fileUri, { dialogTitle: 'Export Otter Finance Data' });
                } else {
                    setTwoFAModal({ visible: true, title: 'Export Failed', message: 'Sharing is not available on this device.', type: 'error' });
                }
            } else {
                // PDF Export
                const totals = txs.reduce((acc, curr) => {
                    if (curr.type === 'income') acc.income += parseFloat(curr.amount);
                    else acc.expense += parseFloat(curr.amount);
                    return acc;
                }, { income: 0, expense: 0 });

                const txRowsHtml = txs.map(tx => `
                    <tr>
                        <td>${new Date(tx.date).toLocaleDateString()}</td>
                        <td><span style="color: ${tx.type === 'income' ? '#22c55e' : '#ef4444'}; font-weight: bold;">${tx.type.toUpperCase()}</span></td>
                        <td>${tx.category}</td>
                        <td>${tx.description || '-'}</td>
                        <td><b>${tx.currency || 'PHP'} ${parseFloat(tx.amount).toFixed(2)}</b></td>
                        <td>${tx.attachment ? `<a href="${tx.attachment}">View Receipt</a>` : '-'}</td>
                    </tr>
                `).join('');

                const html = `
                <html>
                    <head>
                        <style>
                            body { font-family: 'Helvetica', sans-serif; padding: 20px; color: #333; }
                            h1 { color: #E91E8C; text-align: center; margin-bottom: 5px; }
                            h3 { margin: 0; color: #555; font-size: 14px; text-transform: uppercase; }
                            p { margin: 5px 0; }
                            .user-info { text-align: center; margin-bottom: 20px; color: #666; }
                            .summary { display: flex; justify-content: space-around; background: #fdf2f8; padding: 15px; border-radius: 10px; margin-bottom: 20px; border: 1px solid #fbcfe8; text-align: center; }
                            .income { color: #22c55e; font-size: 20px; font-weight: bold; }
                            .expense { color: #ef4444; font-size: 20px; font-weight: bold; }
                            .net { color: #333; font-size: 20px; font-weight: bold; }
                            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                            th, td { padding: 12px; border-bottom: 1px solid #ddd; text-align: left; font-size: 14px; }
                            th { background-color: #f1f5f9; font-weight: bold; color: #333; text-transform: uppercase; font-size: 12px; }
                            a { color: #3b82f6; text-decoration: none; }
                            tr:nth-child(even) { background-color: #fafafa; }
                        </style>
                    </head>
                    <body>
                        <h1>Otter Finance Report</h1>
                        <div class="user-info">
                            <p>Generated for: <b>${userInfo?.name || 'User'}</b> (${userInfo?.email || ''})</p>
                            <p>Range: ${exportRange.replace('_', ' ').toUpperCase()}</p>
                        </div>
                        <div class="summary">
                            <div><h3>Total Income</h3><p class="income">+ ${totals.income.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p></div>
                            <div><h3>Total Expense</h3><p class="expense">- ${totals.expense.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p></div>
                            <div><h3>Net Flow</h3><p class="net">${(totals.income - totals.expense).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p></div>
                        </div>
                        <table>
                            <tr>
                                <th>Date</th>
                                <th>Type</th>
                                <th>Category</th>
                                <th>Description</th>
                                <th>Amount</th>
                                <th>Receipt</th>
                            </tr>
                            ${txRowsHtml}
                        </table>
                    </body>
                </html>`;
                const { uri } = await Print.printToFileAsync({ html });
                if (await Sharing.isAvailableAsync()) {
                    await Sharing.shareAsync(uri, { dialogTitle: 'Export Otter Finance Report', UTI: 'com.adobe.pdf' });
                } else {
                    setTwoFAModal({ visible: true, title: 'Export Failed', message: 'Sharing is not available on this device.', type: 'error' });
                }
            }

        } catch (err) {
            console.error('Export error:', err);
            setTwoFAModal({ visible: true, title: 'Export Failed', message: 'An error occurred while exporting your data.', type: 'error' });
        } finally {
            setExporting(false);
        }
    };

    // ─── Security Handlers ──────────────────────────────────────────────────

    const handleChangePassword = async () => {
        if (passwords.next !== passwords.confirm) {
            return setTwoFAModal({ visible: true, title: 'Error', message: 'New passwords do not match.', type: 'error' });
        }
        if (passwords.next.length < 8) {
            return setTwoFAModal({ visible: true, title: 'Error', message: 'Password must be at least 8 characters.', type: 'error' });
        }

        setIsActionLoading(true);
        try {
            await apiChangePassword({
                currentPassword: passwords.current,
                newPassword: passwords.next
            });
            setChangePasswordModal(false);
            setPasswords({ current: '', next: '', confirm: '' });
            setTwoFAModal({ visible: true, title: 'Success', message: 'Your password has been updated.', type: 'success' });
        } catch (err) {
            setTwoFAModal({
                visible: true,
                title: 'Update Failed',
                message: err.response?.data?.error || 'Failed to update password. Please check your current password.',
                type: 'error'
            });
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleWipeData = async () => {
        if (confirmText !== 'RESET') {
            return setTwoFAModal({ visible: true, title: 'Verification Failed', message: "Please type 'RESET' exactly to proceed.", type: 'error' });
        }

        setIsActionLoading(true);
        try {
            await apiWipeData(verifyPassword);
            setWipeDataModal(false);
            setVerifyPassword('');
            setConfirmText('');
            // The dashboard will refresh automatically via Socket.io now!
            setTwoFAModal({ visible: true, title: 'Data Wiped', message: 'All your financial records have been deleted successfully.', type: 'success' });
        } catch (err) {
            setTwoFAModal({
                visible: true,
                title: 'Wipe Failed',
                message: err.response?.data?.error || 'Incorrect password verification failed.',
                type: 'error'
            });
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleDeleteAccount = async () => {
        setIsActionLoading(true);
        try {
            await apiDeleteAccount(verifyPassword);
            setDeleteAccountModal(false);
            // Show success briefly before logging out
            setTwoFAModal({ visible: true, title: 'Account Deleted', message: 'Your profile and data have been removed. Goodbye!', type: 'success' });
            setTimeout(logout, 2000);
        } catch (err) {
            setTwoFAModal({
                visible: true,
                title: 'Deletion Failed',
                message: err.response?.data?.error || 'Incorrect password verification failed.',
                type: 'error'
            });
        } finally {
            setIsActionLoading(false);
        }
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
                    <TouchableOpacity onPress={() => navigation.navigate('ProfileScreen')} style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                        <View style={styles.avatarCircle}>
                            {userInfo?.avatarUrl ? (
                                <Image
                                    source={{ uri: userInfo.avatarUrl.startsWith('http') ? userInfo.avatarUrl : `${API_BASE.replace('/api', '')}/${userInfo.avatarUrl}` }}
                                    style={styles.avatarImg}
                                />
                            ) : (
                                <Text style={styles.avatarText}>
                                    {userInfo?.name?.charAt(0)?.toUpperCase() || '?'}
                                </Text>
                            )}
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.profileName}>{userInfo?.name || 'OTTER User'}</Text>
                            <Text style={styles.profileEmail}>
                                {userInfo?.otterTag ? userInfo.otterTag : userInfo?.email || ''}
                            </Text>
                            <Text style={styles.profileJoined}>
                                Member since {userInfo?.createdAt ? new Date(userInfo.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—'}
                            </Text>
                        </View>
                        <View style={{ backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, padding: 6 }}>
                            <Feather name="chevron-right" size={18} color="#fff" />
                        </View>
                    </TouchableOpacity>
                </LinearGradient>

                {/* ── General Settings ─────────────────────────────────────── */}
                <View style={[styles.card, { backgroundColor: COLORS.surface }]}>
                    <SectionHeader title="GENERAL" icon="tune" />
                    <SettingRow
                        icon="currency-php"
                        label="Primary Currency"
                        sublabel={`Current default: ${userInfo?.currency || 'PHP'}`}
                        onPress={() => setCurrencyModalVisible(true)}
                        right={<Feather name="chevron-right" size={18} color={COLORS.textMuted} />}
                    />
                    <SettingRow
                        icon="vibrate"
                        label="Haptic Feedback"
                        sublabel={hapticsEnabled ? 'Enabled — sensory vibrations' : 'Disabled'}
                        noBorder
                        right={
                            <Switch
                                value={hapticsEnabled}
                                onValueChange={onToggleHaptics}
                                trackColor={{ false: COLORS.border, true: COLORS.primary + '60' }}
                                thumbColor={hapticsEnabled ? COLORS.primary : '#888'}
                            />
                        }
                    />
                </View>


                {/* ── Security ─────────────────────────────────────────────── */}
                <View style={[styles.card, { backgroundColor: COLORS.surface, marginTop: 12 }]}>
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
                    <SettingRow
                        icon="gesture-tap"
                        label="FAB Style"
                        sublabel={savingsFabStyle === 'modal' ? 'Opens a sliding bottom menu' : 'Expands into quick actions'}
                        noBorder
                        right={
                            <Switch
                                value={savingsFabStyle === 'modal'}
                                onValueChange={toggleSavingsFabStyle}
                                trackColor={{ false: COLORS.border, true: COLORS.primary + '60' }}
                                thumbColor={savingsFabStyle === 'modal' ? COLORS.primary : '#888'}
                            />
                        }
                    />
                </View>

                {/* ── Customization ─────────────────────────────────────────────── */}
                <View style={[styles.card, { backgroundColor: COLORS.surface, marginTop: 12 }]}>
                    <SectionHeader title="CUSTOMIZATION" icon="view-grid-plus" />
                    <SettingRow
                        icon="tag-multiple"
                        label="Manage Categories"
                        sublabel="Customize transaction categories and icons"
                        right={<Feather name="chevron-right" size={18} color={COLORS.textMuted} />}
                        onPress={() => navigation.navigate('ManageCategories')}
                        noBorder
                    />
                </View>

                {/* ── Data Management ───────────────────────────────────────── */}
                <View style={[styles.card, { backgroundColor: COLORS.surface, marginTop: 12 }]}>
                    <SectionHeader title="DATA MANAGEMENT" icon="database-export" />
                    <SettingRow
                        icon="file-download-outline"
                        iconColor={COLORS.primary}
                        label="Export Data"
                        sublabel="Generate a CSV or PDF report"
                        right={exporting ? <ActivityIndicator color={COLORS.primary} /> : <Feather name="download" size={18} color={COLORS.textMuted} />}
                        onPress={() => {
                            if (!exporting) setExportModalVisible(true);
                        }}
                        noBorder
                    />
                </View>

                {/* ── Privacy & Data ─────────────────────────────────────────── */}
                <View style={[styles.card, { backgroundColor: COLORS.surface, marginTop: 12 }]}>
                    <SectionHeader title="PRIVACY & DATA" icon="shield-account" />

                    <SettingRow
                        icon="key-change"
                        label="Change Password"
                        sublabel="Update your account login credentials"
                        right={<Feather name="chevron-right" size={18} color={COLORS.textMuted} />}
                        onPress={() => setChangePasswordModal(true)}
                    />

                    <SettingRow
                        icon="database-remove"
                        iconColor={COLORS.warning}
                        label="Clear All Financial Data"
                        sublabel="Delete all transactions but keep account"
                        right={<Feather name="chevron-right" size={18} color={COLORS.warning} />}
                        onPress={() => {
                            if (pinEnabled || biometricEnabled) {
                                openVerify(() => { closeVerify(); setWipeDataModal(true); }, 'Verify identity to wipe all data');
                            } else {
                                setWipeDataModal(true);
                            }
                        }}
                    />

                    <SettingRow
                        icon="account-remove"
                        iconColor={COLORS.danger}
                        label="Delete OTTER Account"
                        sublabel="Permanently delete your profile and all data"
                        danger
                        noBorder
                        right={<Feather name="chevron-right" size={18} color={COLORS.danger} />}
                        onPress={() => {
                            if (pinEnabled || biometricEnabled) {
                                openVerify(() => { closeVerify(); setDeleteAccountModal(true); }, 'Verify identity to delete account');
                            } else {
                                setDeleteAccountModal(true);
                            }
                        }}
                    />
                </View>

                {/* ── Account ──────────────────────────────────────────────── */}
                <View style={[styles.card, { backgroundColor: COLORS.surface, marginTop: 12 }]}>
                    <SectionHeader title="ACCOUNT" icon="account-circle" />
                    <SettingRow
                        icon="account-edit"
                        label="My Profile"
                        sublabel={userInfo?.otterTag ? `Tag: ${userInfo.otterTag}` : 'Set your @OtterTag and personal info'}
                        right={<Feather name="chevron-right" size={18} color={COLORS.textMuted} />}
                        onPress={() => navigation.navigate('ProfileScreen')}
                    />
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

            {/* Export Settings Modal */}
            <BottomSheetModal visible={exportModalVisible} onClose={() => setExportModalVisible(false)}>
                <View>
                    <Text style={{ fontSize: 20, fontWeight: '900', color: COLORS.text, marginBottom: 8 }}>Export Data</Text>
                    <Text style={{ fontSize: 14, color: COLORS.textMuted, marginBottom: 24, fontWeight: '500' }}>Generate a detailed report of your transactions.</Text>

                    <Text style={{ fontSize: 12, fontWeight: '800', color: COLORS.textMuted, marginBottom: 12, marginTop: 4, letterSpacing: 0.5 }}>FORMAT</Text>
                    <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
                        <TouchableOpacity onPress={() => setExportFormat('csv')} style={[{ flex: 1, padding: 16, borderRadius: 16, borderWidth: 1.5, borderColor: COLORS.border, alignItems: 'center' }, exportFormat === 'csv' && { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '10' }]}>
                            <MaterialCommunityIcons name="file-excel" size={28} color={exportFormat === 'csv' ? COLORS.primary : COLORS.textMuted} />
                            <Text style={[{ marginTop: 8, fontWeight: '800', color: COLORS.textMuted }, exportFormat === 'csv' && { color: COLORS.primary }]}>CSV (Data)</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setExportFormat('pdf')} style={[{ flex: 1, padding: 16, borderRadius: 16, borderWidth: 1.5, borderColor: COLORS.border, alignItems: 'center' }, exportFormat === 'pdf' && { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '10' }]}>
                            <MaterialCommunityIcons name="file-pdf-box" size={28} color={exportFormat === 'pdf' ? COLORS.primary : COLORS.textMuted} />
                            <Text style={[{ marginTop: 8, fontWeight: '800', color: COLORS.textMuted }, exportFormat === 'pdf' && { color: COLORS.primary }]}>PDF (Print)</Text>
                        </TouchableOpacity>
                    </View>

                    <Text style={{ fontSize: 12, fontWeight: '800', color: COLORS.textMuted, marginBottom: 12, letterSpacing: 0.5 }}>TIME RANGE</Text>
                    <View style={{ gap: 10, marginBottom: 30 }}>
                        <TouchableOpacity onPress={() => setExportRange('month')} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderRadius: 16, backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: exportRange === 'month' ? COLORS.primary : COLORS.border }}>
                            <Text style={{ fontWeight: '700', fontSize: 15, color: exportRange === 'month' ? COLORS.primary : COLORS.text }}>This Month</Text>
                            {exportRange === 'month' && <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center' }}><Feather name="check" size={14} color="#fff" /></View>}
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setExportRange('last_month')} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderRadius: 16, backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: exportRange === 'last_month' ? COLORS.primary : COLORS.border }}>
                            <Text style={{ fontWeight: '700', fontSize: 15, color: exportRange === 'last_month' ? COLORS.primary : COLORS.text }}>Last Month</Text>
                            {exportRange === 'last_month' && <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center' }}><Feather name="check" size={14} color="#fff" /></View>}
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setExportRange('year')} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderRadius: 16, backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: exportRange === 'year' ? COLORS.primary : COLORS.border }}>
                            <Text style={{ fontWeight: '700', fontSize: 15, color: exportRange === 'year' ? COLORS.primary : COLORS.text }}>This Year</Text>
                            {exportRange === 'year' && <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center' }}><Feather name="check" size={14} color="#fff" /></View>}
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setExportRange('all')} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderRadius: 16, backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: exportRange === 'all' ? COLORS.primary : COLORS.border }}>
                            <Text style={{ fontWeight: '700', fontSize: 15, color: exportRange === 'all' ? COLORS.primary : COLORS.text }}>All Time</Text>
                            {exportRange === 'all' && <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center' }}><Feather name="check" size={14} color="#fff" /></View>}
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity onPress={handleExportData} style={{ backgroundColor: COLORS.primary, padding: 18, borderRadius: 16, alignItems: 'center', shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 }}>
                        <Text style={{ color: '#fff', fontSize: 16, fontWeight: '900' }}>{exporting ? 'Generating...' : `Export ${exportFormat.toUpperCase()}`}</Text>
                    </TouchableOpacity>
                </View>
            </BottomSheetModal>

            {/* Currency Selection Modal */}
            <CustomAlertModal
                visible={currencyModalVisible}
                onClose={() => setCurrencyModalVisible(false)}
                title="Change Currency"
                message="Choose your primary currency for all transactions."
                type="info"
                hideButtons={true}
            >
                <ScrollView style={{ width: '100%', maxHeight: 300 }} contentContainerStyle={{ paddingHorizontal: 10 }} showsVerticalScrollIndicator={false}>
                    <View style={{ gap: 8, paddingBottom: 10, width: '100%' }}>
                        {currencyList.map(curr => {
                            const isSelected = userInfo?.currency === curr.code;
                            return (
                                <TouchableOpacity
                                    key={curr.code}
                                    onPress={() => handleUpdateCurrency(curr.code)}
                                    style={[
                                        styles.currencyListBtn,
                                        { backgroundColor: isSelected ? COLORS.primary + '15' : COLORS.background, borderColor: isSelected ? COLORS.primary : COLORS.border }
                                    ]}
                                    disabled={updatingCurrency}
                                >
                                    <Text style={{ fontSize: 20 }}>{curr.flag}</Text>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.currencyListCode, { color: COLORS.text }]}>{curr.code}</Text>
                                        <Text style={[styles.currencyListName, { color: COLORS.textMuted }]}>{curr.name}</Text>
                                    </View>
                                    {isSelected && <Feather name="check" size={18} color={COLORS.primary} />}
                                    {updatingCurrency && isSelected && <ActivityIndicator size="small" color={COLORS.primary} />}
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </ScrollView>
            </CustomAlertModal>

            {/* ── Change Password Modal ────────────────────────────────────── */}
            <BottomSheetModal visible={changePasswordModal} onClose={() => setChangePasswordModal(false)}>
                <View style={{ paddingBottom: 20 }}>
                    <Text style={{ fontSize: 22, fontWeight: '900', color: COLORS.text }}>Change Password</Text>
                    <Text style={{ fontSize: 14, color: COLORS.textMuted, marginBottom: 20 }}>Enter your current and new passwords.</Text>

                    <TextInput
                        style={[styles.input, { backgroundColor: COLORS.background, color: COLORS.text, borderColor: COLORS.border }]}
                        placeholder="Current Password"
                        placeholderTextColor={COLORS.textMuted}
                        secureTextEntry
                        value={passwords.current}
                        onChangeText={(t) => setPasswords({ ...passwords, current: t })}
                    />
                    <TextInput
                        style={[styles.input, { backgroundColor: COLORS.background, color: COLORS.text, borderColor: COLORS.border }]}
                        placeholder="New Password"
                        placeholderTextColor={COLORS.textMuted}
                        secureTextEntry
                        value={passwords.next}
                        onChangeText={(t) => setPasswords({ ...passwords, next: t })}
                    />
                    <TextInput
                        style={[styles.input, { backgroundColor: COLORS.background, color: COLORS.text, borderColor: COLORS.border }]}
                        placeholder="Confirm New Password"
                        placeholderTextColor={COLORS.textMuted}
                        secureTextEntry
                        value={passwords.confirm}
                        onChangeText={(t) => setPasswords({ ...passwords, confirm: t })}
                    />

                    <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: COLORS.primary }]}
                        onPress={handleChangePassword}
                        disabled={isActionLoading}
                    >
                        {isActionLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionButtonText}>Update Password</Text>}
                    </TouchableOpacity>
                </View>
            </BottomSheetModal>

            {/* ── Wipe Data Modal ─────────────────────────────────────────── */}
            <BottomSheetModal visible={wipeDataModal} onClose={() => setWipeDataModal(false)}>
                <View style={{ paddingBottom: 20 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                        <MaterialCommunityIcons name="alert-decagram" size={24} color={COLORS.warning} style={{ marginRight: 8 }} />
                        <Text style={{ fontSize: 22, fontWeight: '900', color: COLORS.text }}>Wipe Financial Data</Text>
                    </View>
                    <Text style={{ fontSize: 14, color: COLORS.textMuted, marginBottom: 20 }}>
                        This will permanently delete ALL transactions, wallets, and goals. Your account profile remains active.
                    </Text>

                    <Text style={{ fontSize: 12, fontWeight: '800', color: COLORS.textMuted, marginBottom: 8 }}>VERIFICATION</Text>
                    <TextInput
                        style={[styles.input, { backgroundColor: COLORS.background, color: COLORS.text, borderColor: COLORS.border }]}
                        placeholder="Account Password"
                        placeholderTextColor={COLORS.textMuted}
                        secureTextEntry
                        value={verifyPassword}
                        onChangeText={setVerifyPassword}
                    />
                    <Text style={{ fontSize: 12, fontWeight: '800', color: COLORS.textMuted, marginBottom: 8, marginTop: 10 }}>CONFIRMATION</Text>
                    <TextInput
                        style={[styles.input, { backgroundColor: COLORS.background, color: COLORS.text, borderColor: COLORS.border }]}
                        placeholder="Type 'RESET' to confirm"
                        placeholderTextColor={COLORS.textMuted}
                        autoCapitalize="characters"
                        value={confirmText}
                        onChangeText={setConfirmText}
                    />

                    <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: COLORS.warning }]}
                        onPress={handleWipeData}
                        disabled={isActionLoading}
                    >
                        {isActionLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionButtonText}>Wipe Everything</Text>}
                    </TouchableOpacity>
                </View>
            </BottomSheetModal>

            {/* ── Delete Account Modal ────────────────────────────────────── */}
            <BottomSheetModal visible={deleteAccountModal} onClose={() => setDeleteAccountModal(false)}>
                <View style={{ paddingBottom: 20 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                        <MaterialCommunityIcons name="account-remove" size={24} color={COLORS.danger} style={{ marginRight: 8 }} />
                        <Text style={{ fontSize: 22, fontWeight: '900', color: COLORS.text }}>Delete Account</Text>
                    </View>
                    <Text style={{ fontSize: 14, color: COLORS.textMuted, marginBottom: 20 }}>
                        We're sad to see you go. This will permanently delete your profile and ALL your financial data. This cannot be undone.
                    </Text>

                    <TextInput
                        style={[styles.input, { backgroundColor: COLORS.background, color: COLORS.text, borderColor: COLORS.border }]}
                        placeholder="Enter Password to Confirm"
                        placeholderTextColor={COLORS.textMuted}
                        secureTextEntry
                        value={verifyPassword}
                        onChangeText={setVerifyPassword}
                    />

                    <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: COLORS.danger }]}
                        onPress={handleDeleteAccount}
                        disabled={isActionLoading}
                    >
                        {isActionLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionButtonText}>Permanently Delete Account</Text>}
                    </TouchableOpacity>
                </View>
            </BottomSheetModal>
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
        marginRight: 14,
        overflow: 'hidden',
    },
    avatarImg: { width: '100%', height: '100%' },
    avatarText: { fontSize: 22, fontWeight: '900', color: '#fff' },
    profileName: { fontSize: 16, fontWeight: '800', color: '#fff' },
    profileEmail: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
    profileJoined: { fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 4, fontWeight: '600' },
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
    currencyListBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16,
        borderRadius: radius.lg, borderWidth: 1, marginBottom: 12,
        width: '100%',
    },
    currencyListCode: { fontSize: 18, fontWeight: '900' },
    currencyListName: { fontSize: 13, fontWeight: '600' },
    input: {
        height: 52,
        borderRadius: 12,
        borderWidth: 1.5,
        paddingHorizontal: 16,
        fontSize: 16,
        marginBottom: 12,
        fontWeight: '600',
    },
    actionButton: {
        height: 56,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 16,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    actionButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '900',
    },
    // ─── Sync Status Styles ───
    syncCard: { marginHorizontal: spacing.lg, padding: spacing.lg, borderRadius: radius.xl, elevation: 2, shadowOpacity: 0.1, shadowRadius: 10, marginBottom: spacing.lg },
    syncHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
    syncTitle: { fontSize: 13, fontWeight: '700' },
    readyBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full },
    readyText: { fontSize: 11, fontWeight: '800' },
    syncInfoRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, borderRadius: radius.lg, gap: 12, marginBottom: spacing.md },
    syncCircle: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
    syncLabel: { fontSize: 11, fontWeight: '700' },
    syncDate: { fontSize: 14, fontWeight: '800' },
    syncBtn: { padding: 16, borderRadius: radius.lg, alignItems: 'center' },
    syncBtnText: { color: '#fff', fontSize: 15, fontWeight: '900' },
    pendingBadge: { marginLeft: 'auto', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    pendingText: { color: '#fff', fontSize: 10, fontWeight: '800' },
});
