import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, FlatList,
    TextInput, ActivityIndicator, Image, KeyboardAvoidingView,
    Platform, ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { spacing, radius } from '../../theme/colors';
import { getFriends, splitDebt } from '../../api/api';
import { formatCurrency } from '../../utils/formatters';
import { triggerHaptic } from '../../utils/haptics';
import CustomAlertModal from '../../components/CustomAlertModal';
import { API_BASE } from '../../store/authStore';

export default function SplitBillScreen({ navigation }) {
    const COLORS = useTheme(state => state.COLORS);
    const { userInfo } = useAuth();
    const hapticsEnabled = useAuth(state => state.hapticsEnabled);
    const styles = getStyles(COLORS);

    // ─── State ───────────────────────────────────────────────────────────────────
    const [friends, setFriends] = useState([]);
    const [loadingFriends, setLoadingFriends] = useState(true);
    const [selectedIds, setSelectedIds] = useState([]);
    const [reason, setReason] = useState('');
    const [totalAmount, setTotalAmount] = useState('');
    const [splitMode, setSplitMode] = useState('equal'); // 'equal' | 'custom'
    const [customAmounts, setCustomAmounts] = useState({}); // { [friendId]: string }
    const [saving, setSaving] = useState(false);
    const [alert, setAlert] = useState({ visible: false, type: 'info', title: '', message: '', onConfirm: null });

    // ─── Load Friends ─────────────────────────────────────────────────────────────
    useEffect(() => {
        (async () => {
            try {
                const data = await getFriends();
                setFriends(data || []);
            } catch (err) {
                console.error('[SplitBill] Failed to load friends:', err.message);
            } finally {
                setLoadingFriends(false);
            }
        })();
    }, []);

    // ─── Derived Calculations ─────────────────────────────────────────────────────
    const total = parseFloat(totalAmount) || 0;
    const participantCount = selectedIds.length; // excludes "you" — you paid, they owe you

    const equalShare = participantCount > 0 ? total / participantCount : 0;

    const customTotal = Object.entries(customAmounts)
        .filter(([id]) => selectedIds.includes(id))
        .reduce((sum, [, val]) => sum + (parseFloat(val) || 0), 0);

    // ─── Handlers ─────────────────────────────────────────────────────────────────
    const toggleFriend = (id) => {
        triggerHaptic(hapticsEnabled, 'selection');
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const handleSplitModeToggle = (mode) => {
        triggerHaptic(hapticsEnabled, 'impactLight');
        setSplitMode(mode);
    };

    const handleCustomAmount = (id, val) => {
        setCustomAmounts(prev => ({ ...prev, [id]: val }));
    };

    const validate = () => {
        if (!reason.trim()) {
            setAlert({ visible: true, type: 'warning', title: 'Missing Reason', message: 'Please enter what this split is for (e.g., "Dinner at Jollibee").' });
            return false;
        }
        if (!total || total <= 0) {
            setAlert({ visible: true, type: 'warning', title: 'Missing Amount', message: 'Please enter the total bill amount.' });
            return false;
        }
        if (participantCount === 0) {
            setAlert({ visible: true, type: 'warning', title: 'No Friends Selected', message: 'Please select at least one friend to split with.' });
            return false;
        }
        if (splitMode === 'custom') {
            const hasInvalid = selectedIds.some(id => !(parseFloat(customAmounts[id]) > 0));
            if (hasInvalid) {
                setAlert({ visible: true, type: 'warning', title: 'Incomplete Amounts', message: 'Please enter a valid amount for each selected friend.' });
                return false;
            }
            if (customTotal > total + 0.01) {
                setAlert({ visible: true, type: 'warning', title: 'Amounts Too High', message: `The sum of individual shares (${formatCurrency(customTotal, userInfo?.currency)}) exceeds the total (${formatCurrency(total, userInfo?.currency)}).` });
                return false;
            }
        }
        return true;
    };

    const handleSubmit = () => {
        if (!validate()) return;

        const splits = selectedIds.map(id => ({
            debtorId: id,
            amount: splitMode === 'equal'
                ? Math.round(equalShare * 100) / 100
                : Math.round((parseFloat(customAmounts[id]) || 0) * 100) / 100
        }));

        setAlert({
            visible: true,
            type: 'confirm',
            title: 'Send Split Requests?',
            message: `This will send ${splits.length} debt request${splits.length > 1 ? 's' : ''} for "${reason}".`,
            confirmText: 'Send',
            onConfirm: async () => {
                setAlert(p => ({ ...p, visible: false }));
                setSaving(true);
                try {
                    await splitDebt({ reason: reason.trim(), totalAmount: total, splits });
                    triggerHaptic(hapticsEnabled, 'notificationSuccess');
                    setAlert({
                        visible: true, type: 'success', title: 'Requests Sent! 🎉',
                        message: `${splits.length} friend${splits.length > 1 ? 's have' : ' has'} been notified about the split.`,
                        onConfirm: () => {
                            setAlert(p => ({ ...p, visible: false }));
                            navigation.goBack();
                        }
                    });
                } catch (err) {
                    triggerHaptic(hapticsEnabled, 'notificationError');
                    setAlert({ visible: true, type: 'error', title: 'Failed', message: err?.response?.data?.error || 'Could not send split requests. Please try again.' });
                } finally {
                    setSaving(false);
                }
            }
        });
    };

    // ─── Render ───────────────────────────────────────────────────────────────────
    const renderFriendItem = useCallback(({ item }) => {
        const isSelected = selectedIds.includes(item._id);
        const share = splitMode === 'equal' && total > 0 && participantCount > 0 && isSelected
            ? equalShare
            : null;

        return (
            <TouchableOpacity
                key={item._id}
                style={[
                    styles.friendCard,
                    { backgroundColor: COLORS.surface, borderColor: isSelected ? COLORS.primary : 'transparent', borderWidth: 2 }
                ]}
                onPress={() => toggleFriend(item._id)}
                activeOpacity={0.75}
            >
                {/* Avatar */}
                <View style={styles.avatarWrap}>
                    <View style={[styles.avatar, { backgroundColor: COLORS.border, overflow: 'hidden' }]}>
                        {item.avatarUrl ? (
                            <Image
                                source={{ uri: item.avatarUrl.startsWith('http') ? item.avatarUrl : `${API_BASE.replace('/api', '')}/${item.avatarUrl}` }}
                                style={styles.avatarImg}
                            />
                        ) : (
                            <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 16 }}>{item.name.charAt(0)}</Text>
                        )}
                    </View>
                    {/* Online dot */}
                    <View style={[styles.onlineDot, { backgroundColor: item.isOnline ? '#22c55e' : '#94a3b8', borderColor: COLORS.surface }]} />
                </View>

                {/* Info */}
                <View style={{ flex: 1 }}>
                    <Text style={[styles.friendName, { color: COLORS.text }]}>{item.name}</Text>
                    <Text style={[styles.friendTag, { color: COLORS.textMuted }]} numberOfLines={1}>
                        {item.otterTag || item.email}
                    </Text>
                </View>

                {/* Equal share preview */}
                {share !== null && (
                    <Text style={[styles.shareAmt, { color: COLORS.primary }]}>
                        {formatCurrency(share, userInfo?.currency)}
                    </Text>
                )}

                {/* Checkbox */}
                <View style={[
                    styles.checkbox,
                    { backgroundColor: isSelected ? COLORS.primary : COLORS.background, borderColor: isSelected ? COLORS.primary : COLORS.border }
                ]}>
                    {isSelected && <Feather name="check" size={12} color="#fff" />}
                </View>
            </TouchableOpacity>
        );
    }, [selectedIds, splitMode, equalShare, total, participantCount, COLORS, userInfo]);

    return (
        <SafeAreaView style={[styles.safe, { backgroundColor: COLORS.background }]}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backBtn, { backgroundColor: COLORS.surface }]}>
                    <Feather name="arrow-left" size={20} color={COLORS.text} />
                </TouchableOpacity>
                <View>
                    <Text style={[styles.headerTitle, { color: COLORS.text }]}>Split a Bill</Text>
                    <Text style={[styles.headerSub, { color: COLORS.textMuted }]}>Request money from friends</Text>
                </View>
                <View style={{ width: 40 }} />
            </View>

            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

                    {/* ── Bill Details ── */}
                    <View style={[styles.section, { backgroundColor: COLORS.surface }]}>
                        <Text style={[styles.sectionLabel, { color: COLORS.textMuted }]}>BILL DETAILS</Text>

                        <TextInput
                            style={[styles.input, { color: COLORS.text, borderColor: COLORS.border, backgroundColor: COLORS.background }]}
                            placeholder={'What\'s this for? (e.g. "Dinner at Jollibee")'}
                            placeholderTextColor={COLORS.textMuted + 80}
                            value={reason}
                            onChangeText={setReason}
                            maxLength={80}
                        />

                        <View style={[styles.amountRow, { borderColor: COLORS.border, backgroundColor: COLORS.background }]}>
                            <Text style={[styles.currencySymbol, { color: COLORS.primary }]}>{userInfo?.currencySymbol || '₱'}</Text>
                            <TextInput
                                style={[styles.amountInput, { color: COLORS.text }]}
                                placeholder="0.00"
                                placeholderTextColor={COLORS.textMuted + 80}
                                keyboardType="decimal-pad"
                                value={totalAmount}
                                onChangeText={setTotalAmount}
                            />
                        </View>
                    </View>

                    {/* ── Split Mode ── */}
                    <View style={[styles.section, { backgroundColor: COLORS.surface }]}>
                        <Text style={[styles.sectionLabel, { color: COLORS.textMuted }]}>SPLIT METHOD</Text>
                        <View style={[styles.modeToggle, { backgroundColor: COLORS.background }]}>
                            {['equal', 'custom'].map(mode => (
                                <TouchableOpacity
                                    key={mode}
                                    style={[styles.modeBtn, splitMode === mode && { backgroundColor: COLORS.primary }]}
                                    onPress={() => handleSplitModeToggle(mode)}
                                >
                                    <Feather
                                        name={mode === 'equal' ? 'divide' : 'sliders'}
                                        size={14}
                                        color={splitMode === mode ? '#fff' : COLORS.textMuted}
                                    />
                                    <Text style={[styles.modeBtnText, { color: splitMode === mode ? '#fff' : COLORS.textMuted }]}>
                                        {mode === 'equal' ? 'Split Equally' : 'Custom Amounts'}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        {splitMode === 'equal' && participantCount > 0 && total > 0 && (
                            <View style={[styles.equalBadge, { backgroundColor: COLORS.primary + '15' }]}>
                                <Feather name="info" size={13} color={COLORS.primary} />
                                <Text style={[styles.equalBadgeText, { color: COLORS.primary }]}>
                                    Each friend owes you {formatCurrency(equalShare, userInfo?.currency)}
                                </Text>
                            </View>
                        )}
                    </View>

                    {/* ── Friend Selector ── */}
                    <View style={[styles.section, { backgroundColor: COLORS.surface }]}>
                        <View style={styles.sectionHeaderRow}>
                            <Text style={[styles.sectionLabel, { color: COLORS.textMuted }]}>SELECT FRIENDS</Text>
                            {participantCount > 0 && (
                                <View style={[styles.selectedBadge, { backgroundColor: COLORS.primary }]}>
                                    <Text style={styles.selectedBadgeText}>{participantCount}</Text>
                                </View>
                            )}
                        </View>

                        {loadingFriends ? (
                            <ActivityIndicator color={COLORS.primary} style={{ marginVertical: spacing.lg }} />
                        ) : friends.length === 0 ? (
                            <View style={styles.emptyFriends}>
                                <Feather name="users" size={32} color={COLORS.textMuted} style={{ opacity: 0.4, marginBottom: 8 }} />
                                <Text style={[styles.emptyText, { color: COLORS.textMuted }]}>You have no friends added yet.</Text>
                            </View>
                        ) : (
                            friends.map(item => renderFriendItem({ item }))
                        )}
                    </View>

                    {/* ── Custom Amounts Section ── */}
                    {splitMode === 'custom' && selectedIds.length > 0 && (
                        <View style={[styles.section, { backgroundColor: COLORS.surface }]}>
                            <Text style={[styles.sectionLabel, { color: COLORS.textMuted }]}>CUSTOM AMOUNTS</Text>
                            {selectedIds.map(id => {
                                const friend = friends.find(f => f._id === id);
                                if (!friend) return null;
                                return (
                                    <View key={id} style={[styles.customRow, { borderColor: COLORS.border }]}>
                                        <Text style={[styles.customName, { color: COLORS.text }]} numberOfLines={1}>{friend.name}</Text>
                                        <View style={[styles.customInputWrap, { borderColor: COLORS.border, backgroundColor: COLORS.background }]}>
                                            <Text style={{ color: COLORS.textMuted, marginRight: 4, fontWeight: '600' }}>₱</Text>
                                            <TextInput
                                                style={[styles.customInput, { color: COLORS.text }]}
                                                placeholder="0.00"
                                                placeholderTextColor={COLORS.textMuted}
                                                keyboardType="decimal-pad"
                                                value={customAmounts[id] || ''}
                                                onChangeText={v => handleCustomAmount(id, v)}
                                            />
                                        </View>
                                    </View>
                                );
                            })}

                            {/* Running total for custom mode */}
                            <View style={[styles.customTotalRow, { borderTopColor: COLORS.border }]}>
                                <Text style={[styles.customTotalLabel, { color: COLORS.textMuted }]}>Friends' total</Text>
                                <Text style={[styles.customTotalAmt, {
                                    color: customTotal > total + 0.01 ? '#ef4444' : customTotal === total ? '#22c55e' : COLORS.text
                                }]}>
                                    {formatCurrency(customTotal, userInfo?.currency)} / {formatCurrency(total, userInfo?.currency)}
                                </Text>
                            </View>
                        </View>
                    )}

                    {/* ── Submit ── */}
                    <TouchableOpacity
                        style={[styles.submitBtn, { backgroundColor: COLORS.primary, opacity: saving ? 0.7 : 1 }]}
                        onPress={handleSubmit}
                        disabled={saving}
                        activeOpacity={0.8}
                    >
                        {saving ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <>
                                <Feather name="send" size={18} color="#fff" />
                                <Text style={styles.submitText}>
                                    Send {participantCount > 0 ? `${participantCount} ` : ''}Request{participantCount !== 1 ? 's' : ''}
                                </Text>
                            </>
                        )}
                    </TouchableOpacity>

                </ScrollView>
            </KeyboardAvoidingView>

            <CustomAlertModal
                visible={alert.visible}
                type={alert.type}
                title={alert.title}
                message={alert.message}
                confirmText={alert.confirmText}
                onConfirm={alert.onConfirm}
                onClose={() => setAlert(p => ({ ...p, visible: false }))}
            />
        </SafeAreaView>
    );
}

const getStyles = (COLORS) => StyleSheet.create({
    safe: { flex: 1 },

    // Header
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md,
    },
    backBtn: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    headerTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
    headerSub: { fontSize: 12, textAlign: 'center', marginTop: 2 },

    // Scroll
    scrollContent: { paddingHorizontal: spacing.lg, paddingBottom: 40, gap: spacing.md },

    // Section card
    section: { borderRadius: radius.xl, padding: spacing.md },
    sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm, gap: 8 },
    sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginBottom: spacing.sm },

    // Input
    input: {
        borderWidth: 1.5, borderRadius: radius.lg, paddingHorizontal: spacing.md,
        paddingVertical: 12, fontSize: 14, marginBottom: spacing.sm
    },
    amountRow: {
        flexDirection: 'row', alignItems: 'center', borderWidth: 1.5,
        borderRadius: radius.lg, paddingHorizontal: spacing.md,
    },
    currencySymbol: { fontSize: 22, fontWeight: '800', marginRight: 4 },
    amountInput: { flex: 1, fontSize: 28, fontWeight: '800', paddingVertical: 12 },

    // Mode Toggle
    modeToggle: { flexDirection: 'row', borderRadius: radius.lg, padding: 4, gap: 4 },
    modeBtn: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 6, paddingVertical: 10, borderRadius: radius.md,
    },
    modeBtnText: { fontSize: 13, fontWeight: '700' },
    equalBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        marginTop: spacing.sm, borderRadius: radius.md, paddingVertical: 8, paddingHorizontal: 12,
    },
    equalBadgeText: { fontSize: 13, fontWeight: '600' },

    // Friend card
    friendCard: {
        flexDirection: 'row', alignItems: 'center', padding: spacing.sm,
        borderRadius: radius.lg, marginBottom: spacing.sm, gap: spacing.sm,
    },
    avatarWrap: { position: 'relative', marginRight: 4 },
    avatar: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
    avatarImg: { width: '100%', height: '100%' },
    onlineDot: {
        position: 'absolute', bottom: -1, right: -1,
        width: 13, height: 13, borderRadius: 7, borderWidth: 2,
    },
    friendName: { fontSize: 14, fontWeight: '700' },
    friendTag: { fontSize: 12, marginTop: 2 },
    shareAmt: { fontSize: 14, fontWeight: '800', marginRight: 4 },
    checkbox: {
        width: 22, height: 22, borderRadius: 11, borderWidth: 2,
        justifyContent: 'center', alignItems: 'center',
    },

    // Selected badge
    selectedBadge: {
        width: 22, height: 22, borderRadius: 11,
        justifyContent: 'center', alignItems: 'center',
    },
    selectedBadgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },

    // Empty
    emptyFriends: { alignItems: 'center', paddingVertical: spacing.xl },
    emptyText: { fontSize: 13, fontWeight: '600', textAlign: 'center' },

    // Custom amounts
    customRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingVertical: spacing.sm, borderBottomWidth: 1, gap: spacing.sm,
    },
    customName: { flex: 1, fontSize: 14, fontWeight: '600' },
    customInputWrap: {
        flexDirection: 'row', alignItems: 'center', borderWidth: 1.5,
        borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: 6, minWidth: 110,
    },
    customInput: { fontSize: 15, fontWeight: '700', flex: 1 },
    customTotalRow: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingTop: spacing.sm, marginTop: spacing.sm, borderTopWidth: 1,
    },
    customTotalLabel: { fontSize: 13, fontWeight: '600' },
    customTotalAmt: { fontSize: 14, fontWeight: '800' },

    // Submit
    submitBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
        paddingVertical: 16, borderRadius: radius.xl, marginTop: spacing.sm,
    },
    submitText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
