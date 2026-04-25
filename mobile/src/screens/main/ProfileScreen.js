import React, { useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView,
    TextInput, ActivityIndicator, Animated, Platform, Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { spacing, radius } from '../../theme/colors';
import { updateProfile as apiUpdateProfile, uploadAvatar as apiUploadAvatar, checkTagAvailability, getProfile as apiGetProfile } from '../../api/api';
import { API_BASE } from '../../store/authStore';
import CustomAlertModal from '../../components/CustomAlertModal';
import * as ImagePicker from 'expo-image-picker';

export default function ProfileScreen({ navigation }) {
    const COLORS = useTheme(state => state.COLORS);
    const { userInfo, updateLocalUser } = useAuth();

    // Editable form state seeded from current user info
    const [name, setName] = useState(userInfo?.name || '');
    const [otterTag, setOtterTag] = useState(
        userInfo?.otterTag ? userInfo.otterTag.replace('@', '') : ''
    );
    const [occupation, setOccupation] = useState(userInfo?.occupation || '');

    const [saving, setSaving] = useState(false);
    const [editing, setEditing] = useState(false);
    const [alert, setAlert] = useState({ visible: false, type: 'info', title: '', message: '' });

    const [isTagChecking, setIsTagChecking] = useState(false);
    const [isTagAvailable, setIsTagAvailable] = useState(null);
    const [tagError, setTagError] = useState('');

    // Initial Refresh
    React.useEffect(() => {
        const refresh = async () => {
            try {
                const profile = await apiGetProfile();
                await updateLocalUser(profile);
            } catch (e) {
                console.warn('[Profile] Refresh fail', e.message);
            }
        };
        refresh();
    }, []);

    // Real-time tag availability check
    React.useEffect(() => {
        if (!otterTag || !editing) {
            setIsTagAvailable(null);
            setTagError('');
            return;
        }

        // If the tag is the same as the current one, it's "available"
        if (`@${otterTag.toLowerCase()}` === userInfo?.otterTag) {
            setIsTagAvailable(true);
            setTagError('');
            return;
        }

        if (otterTag.length < 3) {
            setIsTagAvailable(null);
            setTagError('Too short');
            return;
        }

        if (!/^[a-zA-Z0-9_]+$/.test(otterTag)) {
            setTagError('Only letters, numbers, and underscores allowed.');
            setIsTagAvailable(false);
            return;
        }

        setTagError('');
        const timeoutId = setTimeout(async () => {
            setIsTagChecking(true);
            try {
                const { available } = await checkTagAvailability(otterTag);
                setIsTagAvailable(available);
                if (!available) setTagError('This tag is already taken.');
            } catch (err) {
                console.error('Tag check error', err);
            } finally {
                setIsTagChecking(false);
            }
        }, 600);

        return () => clearTimeout(timeoutId);
    }, [otterTag, editing]);

    const handlePickImage = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            showAlert('error', 'Permission Denied', 'We need permission to access your photos.');
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.6,
        });

        if (!result.canceled) {
            setSaving(true);
            try {
                const asset = result.assets[0];
                const formData = new FormData();

                // Construct file object for FormData
                const filename = asset.uri.split('/').pop();
                const match = /\.(\w+)$/.exec(filename);
                const type = match ? `image/${match[1]}` : `image`;

                formData.append('avatar', {
                    uri: Platform.OS === 'ios' ? asset.uri.replace('file://', '') : asset.uri,
                    name: filename,
                    type,
                });

                const res = await apiUploadAvatar(formData);
                await updateLocalUser({ avatarUrl: res.avatarUrl });
                showAlert('success', 'Success', 'Profile picture updated!');
            } catch (err) {
                console.error('[Profile] Upload error:', err);
                showAlert('error', 'Upload Failed', 'Failed to upload image. Please try again.');
            } finally {
                setSaving(false);
            }
        }
    };

    const showAlert = (type, title, message) =>
        setAlert({ visible: true, type, title, message });

    const handleSave = async () => {
        if (!name.trim()) {
            return showAlert('error', 'Name Required', 'Your display name cannot be empty.');
        }

        // Validate otterTag
        if (otterTag && otterTag.length < 3) {
            return showAlert('error', 'Too Short', 'Otter Tag must be at least 3 characters.');
        }

        if (otterTag && isTagAvailable === false) {
            return showAlert('error', 'Tag Unavailable', 'This Otter Tag is already taken.');
        }

        if (otterTag && !/^[a-zA-Z0-9_]+$/.test(otterTag)) {
            return showAlert('error', 'Invalid Tag', 'Otter Tag can only contain letters, numbers, and underscores.');
        }

        setSaving(true);
        try {
            const payload = {
                name: name.trim(),
                occupation: occupation.trim(),
            };
            if (otterTag.trim()) {
                payload.otterTag = otterTag.trim().toLowerCase();
            }

            const updated = await apiUpdateProfile(payload);
            await updateLocalUser(updated);
            setEditing(false);
            showAlert('success', 'Profile Updated!', 'Your changes have been saved.');
        } catch (err) {
            const msg = err?.response?.data?.error || 'Failed to save profile. Please try again.';
            showAlert('error', 'Update Failed', msg);
        } finally {
            setSaving(false);
        }
    };

    const handleDiscard = () => {
        setName(userInfo?.name || '');
        setOtterTag(userInfo?.otterTag ? userInfo.otterTag.replace('@', '') : '');
        setOccupation(userInfo?.occupation || '');
        setEditing(false);
    };

    const displayInitial = (userInfo?.name || '?').charAt(0).toUpperCase();

    return (
        <SafeAreaView style={[styles.safe, { backgroundColor: COLORS.background }]}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    onPress={() => editing ? handleDiscard() : navigation.goBack()}
                    style={[styles.backBtn, { backgroundColor: COLORS.surface }]}
                >
                    <Feather name="arrow-left" size={20} color={COLORS.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: COLORS.text }]}>My Profile</Text>
                {editing ? (
                    <TouchableOpacity
                        onPress={handleSave}
                        disabled={saving}
                        style={[styles.saveHeaderBtn, { backgroundColor: COLORS.primary }]}
                    >
                        {saving
                            ? <ActivityIndicator size="small" color="#fff" />
                            : <Text style={styles.saveHeaderBtnText}>Save</Text>
                        }
                    </TouchableOpacity>
                ) : (
                    <TouchableOpacity
                        onPress={() => setEditing(true)}
                        style={[styles.editHeaderBtn, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
                    >
                        <Feather name="edit-2" size={15} color={COLORS.primary} />
                        <Text style={[styles.editHeaderBtnText, { color: COLORS.primary }]}>Edit</Text>
                    </TouchableOpacity>
                )}
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>

                {/* Hero Avatar Card */}
                <LinearGradient
                    colors={['#E91E8C', '#7b0f4e']}
                    style={styles.heroCard}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                >
                    {/* Avatar Circle */}
                    <TouchableOpacity
                        style={styles.avatarRing}
                        onPress={handlePickImage}
                        disabled={saving}
                    >
                        <View style={styles.avatarInner}>
                            {userInfo?.avatarUrl ? (
                                <Image
                                    source={{ uri: userInfo.avatarUrl.startsWith('http') ? userInfo.avatarUrl : `${API_BASE.replace('/api', '')}/${userInfo.avatarUrl}` }}
                                    style={styles.avatarImg}
                                />
                            ) : (
                                <Text style={styles.avatarText}>{displayInitial}</Text>
                            )}
                            <View style={[styles.cameraBadge, { backgroundColor: COLORS.primary }]}>
                                <Feather name="camera" size={12} color="#fff" />
                            </View>
                        </View>
                        {saving && (
                            <View style={styles.avatarOverlay}>
                                <ActivityIndicator color="#fff" />
                            </View>
                        )}
                    </TouchableOpacity>

                    <Text style={styles.heroName}>{userInfo?.name || 'OTTER User'}</Text>

                    {userInfo?.otterTag ? (
                        <View style={styles.tagBadge}>
                            <MaterialCommunityIcons name="at" size={14} color="#fff" />
                            <Text style={styles.tagBadgeText}>{userInfo.otterTag.replace('@', '')}</Text>
                        </View>
                    ) : (
                        <TouchableOpacity onPress={() => setEditing(true)} style={styles.noTagBadge}>
                            <Feather name="plus" size={12} color="rgba(255,255,255,0.8)" />
                            <Text style={styles.noTagText}>Set your @OtterTag</Text>
                        </TouchableOpacity>
                    )}

                    {/* Stats Row */}
                    <View style={styles.statsRow}>
                        <View style={styles.statItem}>
                            <Text style={styles.statValue}>{userInfo?.currency || 'PHP'}</Text>
                            <Text style={styles.statLabel}>Currency</Text>
                        </View>
                        <View style={styles.statDivider} />
                        <View style={styles.statItem}>
                            <Text style={styles.statValue}>
                                {userInfo?.createdAt
                                    ? new Date(userInfo.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                                    : '—'}
                            </Text>
                            <Text style={styles.statLabel}>Member Since</Text>
                        </View>
                        <View style={styles.statDivider} />
                        <View style={styles.statItem}>
                            <Text style={styles.statValue}>{userInfo?.occupation || '—'}</Text>
                            <Text style={styles.statLabel}>Occupation</Text>
                        </View>
                    </View>
                </LinearGradient>

                {/* ── Identity Section ─────────────────────────────────── */}
                <View style={[styles.sectionCard, { backgroundColor: COLORS.surface }]}>
                    <Text style={[styles.sectionTitle, { color: COLORS.primary }]}>
                        <MaterialCommunityIcons name="account-circle" size={13} color={COLORS.primary} />
                        {'  '}IDENTITY
                    </Text>

                    {/* Display Name */}
                    <FieldRow
                        label="Display Name"
                        icon="account-outline"
                        value={name}
                        onChangeText={setName}
                        editing={editing}
                        placeholder="Your full name"
                        COLORS={COLORS}
                    />

                    {/* Otter Tag */}
                    <FieldRow
                        label="Otter Tag"
                        icon="at"
                        value={otterTag}
                        onChangeText={(t) => setOtterTag(t.replace(/\s/g, '').toLowerCase())}
                        editing={editing}
                        placeholder="e.g. johanna_grace"
                        prefix="@"
                        autoCapitalize="none"
                        hint={tagError ? tagError : "Your unique ID used by friends to find you."}
                        COLORS={COLORS}
                        noBorder
                        statusIcon={isTagChecking ? 'loading' : (isTagAvailable ? 'check' : (isTagAvailable === false ? 'error' : null))}
                    />
                </View>

                {/* ── Professional Section ─────────────────────────────── */}
                <View style={[styles.sectionCard, { backgroundColor: COLORS.surface, marginTop: 12 }]}>
                    <Text style={[styles.sectionTitle, { color: COLORS.primary }]}>
                        <MaterialCommunityIcons name="briefcase-outline" size={13} color={COLORS.primary} />
                        {'  '}PROFESSIONAL
                    </Text>

                    <FieldRow
                        label="Occupation"
                        icon="briefcase-outline"
                        value={occupation}
                        onChangeText={setOccupation}
                        editing={editing}
                        placeholder="e.g. Software Engineer"
                        COLORS={COLORS}
                        noBorder
                    />
                </View>

                {/* ── Account Info (Read-only) ──────────────────────────── */}
                <View style={[styles.sectionCard, { backgroundColor: COLORS.surface, marginTop: 12 }]}>
                    <Text style={[styles.sectionTitle, { color: COLORS.primary }]}>
                        <MaterialCommunityIcons name="shield-account-outline" size={13} color={COLORS.primary} />
                        {'  '}ACCOUNT
                    </Text>

                    <ReadOnlyRow label="Email" value={userInfo?.email || '—'} icon="email-outline" COLORS={COLORS} />
                    <ReadOnlyRow label="Account ID" value={userInfo?._id ? `…${userInfo._id.slice(-8)}` : '—'} icon="identifier" COLORS={COLORS} noBorder />
                </View>

                {/* OtterTag Info Banner */}
                {!userInfo?.otterTag && (
                    <View style={[styles.infoBanner, { backgroundColor: COLORS.primary + '12', borderColor: COLORS.primary + '30' }]}>
                        <MaterialCommunityIcons name="lightbulb-on-outline" size={18} color={COLORS.primary} />
                        <Text style={[styles.infoBannerText, { color: COLORS.textMuted }]}>
                            <Text style={{ color: COLORS.primary, fontWeight: '800' }}>Set your @OtterTag </Text>
                            to let friends find you and send P2P debt requests directly to your account.
                        </Text>
                    </View>
                )}

                {/* Edit CTA when not editing */}
                {!editing && (
                    <TouchableOpacity
                        onPress={() => setEditing(true)}
                        style={[styles.editCTA, { backgroundColor: COLORS.primary }]}
                    >
                        <Feather name="edit-2" size={16} color="#fff" />
                        <Text style={styles.editCTAText}>Edit Profile</Text>
                    </TouchableOpacity>
                )}

                {/* Save / Discard when editing */}
                {editing && (
                    <View style={styles.actionRow}>
                        <TouchableOpacity
                            onPress={handleDiscard}
                            style={[styles.discardBtn, { borderColor: COLORS.border }]}
                        >
                            <Text style={[styles.discardBtnText, { color: COLORS.textMuted }]}>Discard</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={handleSave}
                            disabled={saving}
                            style={[styles.saveBtn, { backgroundColor: COLORS.primary }]}
                        >
                            {saving
                                ? <ActivityIndicator color="#fff" />
                                : <><Feather name="check" size={16} color="#fff" /><Text style={styles.saveBtnText}>Save Changes</Text></>
                            }
                        </TouchableOpacity>
                    </View>
                )}
            </ScrollView>

            <CustomAlertModal
                visible={alert.visible}
                onClose={() => setAlert(a => ({ ...a, visible: false }))}
                title={alert.title}
                message={alert.message}
                type={alert.type}
            />
        </SafeAreaView>
    );
}

// ── Subcomponents ─────────────────────────────────────────────────────────────

const FieldRow = ({ label, icon, value, onChangeText, editing, placeholder, prefix, hint, COLORS, noBorder, autoCapitalize, statusIcon }) => (
    <View style={[styles.fieldRow, { borderBottomColor: COLORS.border }, noBorder && { borderBottomWidth: 0 }]}>
        <View style={[styles.fieldIconWrap, { backgroundColor: COLORS.primary + '15' }]}>
            <MaterialCommunityIcons name={icon} size={18} color={COLORS.primary} />
        </View>
        <View style={{ flex: 1 }}>
            <Text style={[styles.fieldLabel, { color: COLORS.textMuted }]}>{label}</Text>
            {editing ? (
                <View style={styles.fieldInputWrap}>
                    {prefix && <Text style={[styles.fieldPrefix, { color: COLORS.primary }]}>{prefix}</Text>}
                    <TextInput
                        style={[styles.fieldInput, { color: COLORS.text }]}
                        value={value}
                        onChangeText={onChangeText}
                        placeholder={placeholder}
                        placeholderTextColor={COLORS.textMuted}
                        autoCapitalize={autoCapitalize || 'words'}
                    />
                    {statusIcon === 'loading' && <ActivityIndicator size="small" color={COLORS.primary} style={styles.fieldStatusIcon} />}
                    {statusIcon === 'check' && <Feather name="check-circle" size={16} color="#22c55e" style={styles.fieldStatusIcon} />}
                    {statusIcon === 'error' && <Feather name="alert-circle" size={16} color="#ef4444" style={styles.fieldStatusIcon} />}
                </View>
            ) : (
                <Text style={[styles.fieldValue, { color: value ? COLORS.text : COLORS.textMuted }]}>
                    {prefix && value ? `${prefix}${value}` : value || `(not set)`}
                </Text>
            )}
            {hint && editing && (
                <Text style={[styles.fieldHint, { color: statusIcon === 'error' ? '#ef4444' : COLORS.textMuted }]}>{hint}</Text>
            )}
        </View>
    </View>
);

const ReadOnlyRow = ({ label, icon, value, COLORS, noBorder }) => (
    <View style={[styles.fieldRow, { borderBottomColor: COLORS.border }, noBorder && { borderBottomWidth: 0 }]}>
        <View style={[styles.fieldIconWrap, { backgroundColor: COLORS.border }]}>
            <MaterialCommunityIcons name={icon} size={18} color={COLORS.textMuted} />
        </View>
        <View style={{ flex: 1 }}>
            <Text style={[styles.fieldLabel, { color: COLORS.textMuted }]}>{label}</Text>
            <Text style={[styles.fieldValue, { color: COLORS.text }]}>{value}</Text>
        </View>
        <MaterialCommunityIcons name="lock-outline" size={14} color={COLORS.textMuted} />
    </View>
);

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    safe: { flex: 1 },

    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    },
    backBtn: {
        width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center',
    },
    headerTitle: { fontSize: 18, fontWeight: '800' },
    saveHeaderBtn: {
        paddingHorizontal: 20, paddingVertical: 8, borderRadius: radius.full, minWidth: 70, alignItems: 'center',
    },
    saveHeaderBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
    editHeaderBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full, borderWidth: 1.5,
    },
    editHeaderBtnText: { fontSize: 14, fontWeight: '700' },

    heroCard: {
        marginHorizontal: spacing.lg, borderRadius: 24, padding: spacing.lg,
        alignItems: 'center', paddingTop: 40, paddingBottom: 28, marginBottom: 0,
    },
    avatarRing: {
        width: 96, height: 96, borderRadius: 48, borderWidth: 3, borderColor: 'rgba(255,255,255,0.4)',
        justifyContent: 'center', alignItems: 'center', marginBottom: 16,
    },
    avatarInner: {
        width: 84, height: 84, borderRadius: 42, backgroundColor: 'rgba(255,255,255,0.2)',
        justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
    },
    avatarImg: { width: '100%', height: '100%' },
    cameraBadge: {
        position: 'absolute', bottom: 0, right: 0,
        width: 24, height: 24, borderRadius: 12,
        justifyContent: 'center', alignItems: 'center',
        borderWidth: 2, borderColor: '#7b0f4e',
    },
    avatarOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 48,
        justifyContent: 'center', alignItems: 'center',
    },
    avatarText: { fontSize: 36, fontWeight: '900', color: '#fff' },
    heroName: { fontSize: 22, fontWeight: '900', color: '#fff', marginBottom: 8 },

    tagBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 14, paddingVertical: 6,
        borderRadius: radius.full, marginBottom: 24,
    },
    tagBadgeText: { fontSize: 14, fontWeight: '800', color: '#fff' },
    noTagBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        backgroundColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 14, paddingVertical: 6,
        borderRadius: radius.full, marginBottom: 24, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)',
        borderStyle: 'dashed',
    },
    noTagText: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.8)' },

    statsRow: {
        flexDirection: 'row', width: '100%',
        backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 16, padding: spacing.md,
    },
    statItem: { flex: 1, alignItems: 'center' },
    statValue: { fontSize: 13, fontWeight: '800', color: '#fff', textAlign: 'center' },
    statLabel: { fontSize: 10, color: 'rgba(255,255,255,0.6)', marginTop: 4, fontWeight: '600', letterSpacing: 0.5 },
    statDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.2)' },

    sectionCard: {
        marginHorizontal: spacing.lg, borderRadius: 20, marginTop: 12, overflow: 'hidden',
    },
    sectionTitle: {
        fontSize: 11, fontWeight: '800', letterSpacing: 1,
        paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: 4,
    },

    fieldRow: {
        flexDirection: 'row', alignItems: 'center', gap: 14,
        paddingHorizontal: spacing.md, paddingVertical: 14, borderBottomWidth: 1,
    },
    fieldIconWrap: {
        width: 38, height: 38, borderRadius: 10, justifyContent: 'center', alignItems: 'center',
    },
    fieldLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 2 },
    fieldValue: { fontSize: 15, fontWeight: '600' },
    fieldInputWrap: { flexDirection: 'row', alignItems: 'center' },
    fieldPrefix: { fontSize: 16, fontWeight: '800', marginRight: 2 },
    fieldInput: { flex: 1, fontSize: 15, fontWeight: '600', paddingVertical: 0 },
    fieldStatusIcon: { marginLeft: 8 },
    fieldHint: { fontSize: 11, marginTop: 4, fontStyle: 'italic' },

    infoBanner: {
        flexDirection: 'row', alignItems: 'flex-start', gap: 12,
        marginHorizontal: spacing.lg, marginTop: 16, borderRadius: 14,
        padding: spacing.md, borderWidth: 1,
    },
    infoBannerText: { flex: 1, fontSize: 13, lineHeight: 20 },

    actionRow: {
        flexDirection: 'row', gap: 12,
        marginHorizontal: spacing.lg, marginTop: 24,
    },
    discardBtn: {
        flex: 1, paddingVertical: 16, borderRadius: radius.xl, borderWidth: 1.5,
        alignItems: 'center', justifyContent: 'center',
    },
    discardBtnText: { fontSize: 15, fontWeight: '700' },
    saveBtn: {
        flex: 2, flexDirection: 'row', gap: 8,
        paddingVertical: 16, borderRadius: radius.xl,
        alignItems: 'center', justifyContent: 'center',
    },
    saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },

    editCTA: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
        marginHorizontal: spacing.lg, marginTop: 24, paddingVertical: 16, borderRadius: radius.xl,
    },
    editCTAText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
