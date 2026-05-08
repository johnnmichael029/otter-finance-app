import React, { useState, useCallback, useEffect } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator,
    TextInput, Alert, Platform, RefreshControl
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import BottomSheetModal from '../../components/BottomSheetModal';
import { useTheme } from '../../context/ThemeContext';
import { useFinanceStore } from '../../store/financeStore';
import { getRecurringBills, createRecurringBill, updateRecurringBill, deleteRecurringBill, markBillPaid } from '../../api/api';
import { spacing, radius } from '../../theme/colors';
import Skeleton from '../../components/Skeleton';
import CustomAlertModal from '../../components/CustomAlertModal';
import SwipeableRow from '../../components/SwipeableRow';
import WalletSelector, { calcNativeDeduct, hasEnoughBalance } from '../../components/WalletSelector';
import { useAuth } from '../../context/AuthContext';
import { getSocket } from '../../utils/socket';
import { formatCurrency } from '../../utils/formatters';

// ── Notification setup ────────────────────────────────────────────────────────
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
    }),
});

const FREQUENCIES = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'];
const FREQ_LABELS = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' };

const CATEGORY_OPTIONS = [
    { label: 'Utilities', icon: 'zap', color: '#f59e0b' },
    { label: 'Rent', icon: 'home', color: '#3b82f6' },
    { label: 'Subscriptions', icon: 'tv', color: '#8b5cf6' },
    { label: 'Insurance', icon: 'shield', color: '#22c55e' },
    { label: 'Internet', icon: 'wifi', color: '#06b6d4' },
    { label: 'Loan', icon: 'credit-card', color: '#ef4444' },
    { label: 'Bills', icon: 'file-text', color: '#6b7280' },
];



const getDaysUntilDue = (dateStr) => {
    const diff = new Date(dateStr) - new Date();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

const isExpoGo = Constants.appOwnership === 'expo';

const scheduleNotification = async (bill) => {
    // Expo Go does NOT support real scheduled notifications.
    // Notifications will only work correctly in a development or production build.
    if (isExpoGo) {
        return;
    }
    try {
        await Notifications.cancelScheduledNotificationAsync(`${bill._id}_upcoming`).catch(() => { });
        await Notifications.cancelScheduledNotificationAsync(`${bill._id}_due`).catch(() => { });

        const dueDate = new Date(bill.nextDueDate);
        const now = new Date();

        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('bill-alerts', {
                name: 'Bill & Payment Reminders',
                importance: Notifications.AndroidImportance.MAX,
                enableVibrate: true,
            });
        }

        // Logic: For triggers > 24 days away, 'seconds' overflows 32-bit int in Android (2^31 ms).
        // We use a Date object trigger which Expo handles more robustly.

        // 1. Upcoming Reminder (3 days before)
        const notifDate = new Date(dueDate.getTime());
        notifDate.setDate(notifDate.getDate() - 3);

        if (notifDate > now) {
            await Notifications.scheduleNotificationAsync({
                identifier: `${bill._id}_upcoming`,
                content: {
                    title: '🔔 Upcoming Bill',
                    body: `${bill.name} — ${formatCurrency(bill.amount)} is due in 3 days!`,
                    data: { billId: bill._id },
                },
                trigger: {
                    date: notifDate,
                    channelId: 'bill-alerts'
                },
            });
        }

        // 2. Due Date Reminder (Day of)
        if (dueDate > now) {
            await Notifications.scheduleNotificationAsync({
                identifier: `${bill._id}_due`,
                content: {
                    title: '💳 Bill Due Today!',
                    body: `${bill.name} — ${formatCurrency(bill.amount)} is due today.`,
                    data: { billId: bill._id },
                },
                trigger: {
                    date: dueDate,
                    channelId: 'bill-alerts'
                },
            });
        }
    } catch (e) {
        console.warn('[RecurringBills] Notification Error:', e.message);
    }
};

const requestNotifPermission = async () => {
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
};

export default function RecurringBillsScreen({ navigation, route }) {
    const COLORS = useTheme(state => state.COLORS);
    const { userInfo } = useAuth();
    const styles = getStyles(COLORS);

    const bills = useFinanceStore(state => state.recurringBills);
    const fetchRecurringBills = useFinanceStore(state => state.fetchRecurringBills);
    const loadingBills = useFinanceStore(state => state.isLoadingBills);
    const cryptoPrices = useFinanceStore(state => state.cryptoPrices);
    const netBalance = useFinanceStore(state => state.netBalance);
    const savingsMasterPot = useFinanceStore(state => state.savingsMasterPot);

    const prefill = route?.params?.prefill || null;

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [modalVisible, setModalVisible] = useState(!!prefill);
    const [form, setForm] = useState({
        name: prefill?.name || '',
        amount: prefill?.amount || '',
        category: prefill?.category || 'Bills',
        categoryIcon: 'file-text',
        categoryColor: '#6b7280',
        frequency: 'monthly',
        startDate: ''
    });
    const [saving, setSaving] = useState(false);
    const [alertConfig, setAlertConfig] = useState({ visible: false, title: '', message: '', type: 'info', onConfirm: null });
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [editingBill, setEditingBill] = useState(null);
    const [editForm, setEditForm] = useState({ name: '', amount: '', category: 'Bills', categoryIcon: 'file-text', categoryColor: '#6b7280', frequency: 'monthly' });
    const [editSaving, setEditSaving] = useState(false);

    // Pay Modal State
    const [payModalVisible, setPayModalVisible] = useState(false);
    const [payingBill, setPayingBill] = useState(null);
    const [selectedWallet, setSelectedWallet] = useState(null);
    const [paySourceType, setPaySourceType] = useState(null); // 'hand' | 'savings' | null
    const [paySaving, setPaySaving] = useState(false);

    const load = useCallback(async (force = false) => {
        try {
            await fetchRecurringBills(force);
        } catch (e) {
            console.warn(e.message);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [fetchRecurringBills]);

    useEffect(() => {
        requestNotifPermission();
        load(false);
    }, [load]);

    useEffect(() => {
        if (!userInfo?._id) return;
        const socket = getSocket();

        const handleNew = (bill) => {
            load(true);
            scheduleNotification(bill);
        };

        const handleUpdate = (bill) => {
            load(true);
            scheduleNotification(bill);
        };

        const handleDelete = (data) => {
            load(true);
            Notifications.cancelScheduledNotificationAsync(data._id).catch(() => { });
        };

        socket.on('new_recurring_bill', handleNew);
        socket.on('update_recurring_bill', handleUpdate);
        socket.on('delete_recurring_bill', handleDelete);

        return () => {
            socket.off('new_recurring_bill', handleNew);
            socket.off('update_recurring_bill', handleUpdate);
            socket.off('delete_recurring_bill', handleDelete);
        };
    }, [userInfo?._id]);

    const handleCreate = async () => {
        if (!form.name.trim() || !form.amount) {
            return setAlertConfig({
                visible: true,
                title: 'Missing Fields',
                message: 'Please fill in the name and amount.',
                type: 'info'
            });
        }
        setSaving(true);
        try {
            const bill = await createRecurringBill({
                ...form,
                amount: parseFloat(form.amount),
                startDate: form.startDate || undefined,
            });
            setModalVisible(false);
            setForm({ name: '', amount: '', category: 'Bills', categoryIcon: 'file-text', categoryColor: '#6b7280', frequency: 'monthly', startDate: '' });
        } catch (e) {
            setAlertConfig({
                visible: true,
                title: 'Error',
                message: 'Could not save bill.',
                type: 'error'
            });
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = (id) => {
        setAlertConfig({
            visible: true,
            title: 'Remove Bill?',
            message: 'This will delete this recurring bill permanently.',
            type: 'confirm',
            confirmText: 'Delete',
            onConfirm: async () => {
                setAlertConfig(p => ({ ...p, visible: false }));
                await deleteRecurringBill(id);
                Notifications.cancelScheduledNotificationAsync(id).catch(() => { });
                load(true);
            }
        });
    };

    const openPayModal = (bill) => {
        setPayingBill(bill);
        setSelectedWallet(null);
        setPaySourceType(null);
        setPayModalVisible(true);
    };

    const handleConfirmPay = async () => {
        if (!selectedWallet && !paySourceType) {
            return setAlertConfig({ visible: true, title: 'Select Wallet', message: 'Please select where this payment goes (HAND, Savings, or a wallet).', type: 'info' });
        }

        const amount = payingBill.amount;

        if (selectedWallet) {
            if (!hasEnoughBalance(selectedWallet, amount, cryptoPrices)) {
                return setAlertConfig({ visible: true, title: 'Insufficient Balance', message: `Your ${selectedWallet.name} wallet doesn't have enough balance to cover this payment.`, type: 'warning' });
            }
        } else if (paySourceType === 'hand') {
            const handBal = netBalance || 0;
            if (handBal < amount) {
                return setAlertConfig({ visible: true, title: 'Insufficient Balance', message: `You don't have enough money on HAND. (Available: ${formatCurrency(handBal)})`, type: 'warning' });
            }
        }

        setPaySaving(true);
        try {
            let walletDeductAmount = null;
            if (selectedWallet) {
                const deduct = calcNativeDeduct(selectedWallet, amount, cryptoPrices);
                walletDeductAmount = deduct?.nativeAmount ?? null;
            }

            const updated = await markBillPaid(payingBill._id, {
                walletId: selectedWallet?._id || null,
                walletDeductAmount,
                sourceType: selectedWallet ? 'wallet' : paySourceType,
            });

            await scheduleNotification(updated);
            setPayModalVisible(false);
            setPayingBill(null);
            load(true);
            setAlertConfig({ visible: true, title: 'Bill Marked Paid', message: 'Next due date has been advanced.', type: 'success' });
        } catch (e) {
            setAlertConfig({ visible: true, title: 'Error', message: 'Could not update bill.', type: 'error' });
        } finally {
            setPaySaving(false);
        }
    };

    const selectCategory = (cat) => {
        setForm(f => ({ ...f, category: cat.label, categoryIcon: cat.icon, categoryColor: cat.color }));
    };

    const openEdit = (bill) => {
        setEditingBill(bill);
        setEditForm({
            name: bill.name || '',
            amount: String(bill.amount || ''),
            category: bill.category || 'Bills',
            categoryIcon: bill.categoryIcon || 'file-text',
            categoryColor: bill.categoryColor || '#6b7280',
            frequency: bill.frequency || 'monthly',
        });
        setEditModalVisible(true);
    };

    const handleEditSave = async () => {
        if (!editForm.name.trim() || !editForm.amount) {
            return setAlertConfig({ visible: true, title: 'Missing Fields', message: 'Please fill in the name and amount.', type: 'info' });
        }
        setEditSaving(true);
        try {
            const updated = await updateRecurringBill(editingBill._id, {
                ...editForm,
                amount: parseFloat(editForm.amount),
            });
            await scheduleNotification(updated);
            setEditModalVisible(false);
            setEditingBill(null);
            load(true);
        } catch (e) {
            setAlertConfig({ visible: true, title: 'Error', message: 'Could not update bill.', type: 'error' });
        } finally {
            setEditSaving(false);
        }
    };

    const overdue = bills.filter(b => getDaysUntilDue(b.nextDueDate) <= 0);
    const upcoming = bills.filter(b => getDaysUntilDue(b.nextDueDate) > 0 && getDaysUntilDue(b.nextDueDate) <= 7);
    const rest = bills.filter(b => getDaysUntilDue(b.nextDueDate) > 7);

    const flatData = [];
    if (overdue.length > 0) {
        flatData.push({ type: 'header', title: '⚠️ Overdue', color: '#ef4444', id: 'head-overdue' });
        flatData.push(...overdue.map(b => ({ type: 'bill', item: b, id: b._id })));
    }
    if (upcoming.length > 0) {
        flatData.push({ type: 'header', title: '⏰ Due This Week', color: '#f59e0b', id: 'head-upcoming' });
        flatData.push(...upcoming.map(b => ({ type: 'bill', item: b, id: b._id })));
    }
    if (rest.length > 0) {
        flatData.push({ type: 'header', title: '📋 Upcoming', color: COLORS.textMuted, id: 'head-rest' });
        flatData.push(...rest.map(b => ({ type: 'bill', item: b, id: b._id })));
    }



    const renderBill = (bill) => {
        const days = getDaysUntilDue(bill.nextDueDate);
        const isOverdue = days <= 0;
        const isUrgent = days > 0 && days <= 3;
        const statusColor = isOverdue ? '#ef4444' : isUrgent ? '#f59e0b' : COLORS.income;
        const statusLabel = isOverdue ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today' : `Due in ${days}d`;

        return (
            <SwipeableRow
                key={bill._id}
                rightAction={{
                    color: '#ef4444',
                    icon: 'trash-2',
                    label: 'Delete',
                    onPress: () => handleDelete(bill._id),
                }}
                containerStyle={{ marginBottom: spacing.xs }}
            >
                <View style={[styles.billCard, { backgroundColor: COLORS.surface, borderLeftColor: statusColor, borderLeftWidth: 3, marginBottom: 0 }]}>
                    <View style={[styles.billIcon, { backgroundColor: (bill.categoryColor || '#6b7280') + '20' }]}>
                        <Feather name={bill.categoryIcon || 'file-text'} size={18} color={bill.categoryColor || '#6b7280'} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.billName, { color: COLORS.text }]}>{bill.name}</Text>
                        <Text style={[styles.billMeta, { color: COLORS.textMuted }]}>{FREQ_LABELS[bill.frequency]} · {bill.category}</Text>
                    </View>
                    <View style={styles.billRight}>
                        <Text style={[styles.billAmount, { color: COLORS.expense }]}>-{formatCurrency(bill.amount)}</Text>
                        <Text style={[styles.billDue, { color: statusColor }]}>{statusLabel}</Text>
                    </View>
                    <View style={styles.billActions}>
                        <TouchableOpacity onPress={() => openEdit(bill)} style={[styles.actionBtn, { backgroundColor: COLORS.primary + '20' }]}>
                            <Feather name="edit-2" size={15} color={COLORS.primary} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => openPayModal(bill)} style={[styles.actionBtn, { backgroundColor: COLORS.income + '20' }]}>
                            <Feather name="check" size={16} color={COLORS.income} />
                        </TouchableOpacity>
                    </View>
                </View>
            </SwipeableRow>
        );
    };

    return (
        <SafeAreaView style={styles.safe}>
            {/* Header */}
            <View style={styles.header}>
                <View>
                    <Text style={styles.headerTitle}>Recurring Bills</Text>
                    <Text style={[styles.headerSub, { color: COLORS.textMuted }]}>{bills.length} active bill{bills.length !== 1 ? 's' : ''}</Text>
                </View>
                <TouchableOpacity style={[styles.addBtn, { backgroundColor: COLORS.primary }]} onPress={() => setModalVisible(true)}>
                    <Feather name="plus" size={20} color="#fff" />
                </TouchableOpacity>
            </View>

            {loading ? (
                <View style={styles.content}>
                    <Skeleton width={130} height={18} style={{ marginBottom: spacing.md, marginTop: spacing.md }} />
                    {[1, 2, 3].map(i => (
                        <View key={i} style={[styles.billCard, { backgroundColor: COLORS.surface, elevation: 0, shadowOpacity: 0, borderWidth: 1, borderColor: COLORS.border }]} pointerEvents="none">
                            <Skeleton width={42} height={42} borderRadius={21} style={{ marginRight: spacing.md }} />
                            <View style={{ flex: 1 }}>
                                <Skeleton width={120} height={16} style={{ marginBottom: 6 }} />
                                <Skeleton width={80} height={12} />
                            </View>
                            <View style={{ flex: 0.8, alignItems: 'flex-end', marginLeft: spacing.sm }}>
                                <Skeleton width={70} height={16} style={{ marginBottom: 6 }} />
                                <Skeleton width={50} height={12} />
                            </View>
                        </View>
                    ))}
                </View>
            ) : (
                <View style={{ flex: 1, height: '100%' }}>
                    <FlashList
                        contentContainerStyle={styles.content}
                        data={flatData}
                        keyExtractor={item => item.id}
                        getItemType={item => item.type}
                        estimatedItemSize={90}
                        showsVerticalScrollIndicator={false}
                        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={COLORS.primary} />}
                        ListEmptyComponent={() => (
                            <View style={styles.empty}>
                                <Text style={styles.emptyEmoji}>🔁</Text>
                                <Text style={[styles.emptyTitle, { color: COLORS.text }]}>No Recurring Bills</Text>
                                <Text style={[styles.emptyText, { color: COLORS.textMuted }]}>Tap + to add a bill and get reminded automatically.</Text>
                            </View>
                        )}
                        renderItem={({ item }) => {
                            if (item.type === 'header') return <Text style={[styles.groupTitle, { color: item.color }]}>{item.title}</Text>;
                            return renderBill(item.item);
                        }}
                    />
                </View>
            )}

            {/* Add Bill Modal */}
            <BottomSheetModal visible={modalVisible} onClose={() => setModalVisible(false)}>
                <Text style={[styles.sheetTitle, { color: COLORS.text }]}>Add Recurring Bill</Text>

                {/* Name */}
                <Text style={[styles.label, { color: COLORS.textMuted }]}>BILL NAME</Text>
                <TextInput style={[styles.input, { backgroundColor: COLORS.background, color: COLORS.text, borderColor: COLORS.border }]}
                    placeholder="e.g. Meralco, Netflix" placeholderTextColor={COLORS.textMuted}
                    value={form.name} onChangeText={v => setForm(f => ({ ...f, name: v }))} />

                {/* Amount */}
                <Text style={[styles.label, { color: COLORS.textMuted }]}>AMOUNT (₱)</Text>
                <TextInput style={[styles.input, { backgroundColor: COLORS.background, color: COLORS.text, borderColor: COLORS.border }]}
                    placeholder="0.00" placeholderTextColor={COLORS.textMuted} keyboardType="decimal-pad"
                    value={form.amount} onChangeText={v => setForm(f => ({ ...f, amount: v }))} />

                {/* Category */}
                <Text style={[styles.label, { color: COLORS.textMuted }]}>CATEGORY</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: spacing.sm }}>
                    {CATEGORY_OPTIONS.map(cat => {
                        const selected = form.category === cat.label;
                        return (
                            <TouchableOpacity key={cat.label} onPress={() => selectCategory(cat)}
                                style={[styles.catChip, { backgroundColor: selected ? cat.color : COLORS.background, borderColor: selected ? cat.color : COLORS.border }]}>
                                <Feather name={cat.icon} size={14} color={selected ? '#fff' : cat.color} />
                                <Text style={{ color: selected ? '#fff' : COLORS.text, fontSize: 12, fontWeight: '600' }}>{cat.label}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>

                {/* Frequency */}
                <Text style={[styles.label, { color: COLORS.textMuted }]}>FREQUENCY</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: spacing.sm }}>
                    {FREQUENCIES.map(freq => {
                        const selected = form.frequency === freq;
                        return (
                            <TouchableOpacity key={freq} onPress={() => setForm(f => ({ ...f, frequency: freq }))}
                                style={[styles.catChip, { backgroundColor: selected ? COLORS.primary : COLORS.background, borderColor: selected ? COLORS.primary : COLORS.border }]}>
                                <Text style={{ color: selected ? '#fff' : COLORS.text, fontSize: 12, fontWeight: '600' }}>{FREQ_LABELS[freq]}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>

                <TouchableOpacity onPress={handleCreate} disabled={saving}
                    style={[styles.saveBtn, { backgroundColor: COLORS.primary }]}>
                    {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save Bill</Text>}
                </TouchableOpacity>
            </BottomSheetModal>

            {/* Edit Bill Modal */}
            <BottomSheetModal visible={editModalVisible} onClose={() => setEditModalVisible(false)}>
                <Text style={[styles.sheetTitle, { color: COLORS.text }]}>Edit Recurring Bill</Text>

                <Text style={[styles.label, { color: COLORS.textMuted }]}>BILL NAME</Text>
                <TextInput style={[styles.input, { backgroundColor: COLORS.background, color: COLORS.text, borderColor: COLORS.border }]}
                    placeholder="e.g. Meralco, Netflix" placeholderTextColor={COLORS.textMuted}
                    value={editForm.name} onChangeText={v => setEditForm(f => ({ ...f, name: v }))} />

                <Text style={[styles.label, { color: COLORS.textMuted }]}>AMOUNT (₱)</Text>
                <TextInput style={[styles.input, { backgroundColor: COLORS.background, color: COLORS.text, borderColor: COLORS.border }]}
                    placeholder="0.00" placeholderTextColor={COLORS.textMuted} keyboardType="decimal-pad"
                    value={editForm.amount} onChangeText={v => setEditForm(f => ({ ...f, amount: v }))} />

                <Text style={[styles.label, { color: COLORS.textMuted }]}>CATEGORY</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: spacing.sm }}>
                    {CATEGORY_OPTIONS.map(cat => {
                        const selected = editForm.category === cat.label;
                        return (
                            <TouchableOpacity key={cat.label}
                                onPress={() => setEditForm(f => ({ ...f, category: cat.label, categoryIcon: cat.icon, categoryColor: cat.color }))}
                                style={[styles.catChip, { backgroundColor: selected ? cat.color : COLORS.background, borderColor: selected ? cat.color : COLORS.border }]}>
                                <Feather name={cat.icon} size={14} color={selected ? '#fff' : cat.color} />
                                <Text style={{ color: selected ? '#fff' : COLORS.text, fontSize: 12, fontWeight: '600' }}>{cat.label}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>

                <Text style={[styles.label, { color: COLORS.textMuted }]}>FREQUENCY</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: spacing.sm }}>
                    {FREQUENCIES.map(freq => {
                        const selected = editForm.frequency === freq;
                        return (
                            <TouchableOpacity key={freq}
                                onPress={() => setEditForm(f => ({ ...f, frequency: freq }))}
                                style={[styles.catChip, { backgroundColor: selected ? COLORS.primary : COLORS.background, borderColor: selected ? COLORS.primary : COLORS.border }]}>
                                <Text style={{ color: selected ? '#fff' : COLORS.text, fontSize: 12, fontWeight: '600' }}>{FREQ_LABELS[freq]}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>

                <TouchableOpacity onPress={handleEditSave} disabled={editSaving}
                    style={[styles.saveBtn, { backgroundColor: COLORS.primary }]}>
                    {editSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save Changes</Text>}
                </TouchableOpacity>
            </BottomSheetModal>

            {/* Pay Bill Modal */}
            <BottomSheetModal visible={payModalVisible} onClose={() => setPayModalVisible(false)}>
                <Text style={[styles.sheetTitle, { color: COLORS.text }]}>Pay Bill</Text>
                {payingBill && (
                    <Text style={[styles.sheetSub, { color: COLORS.textMuted, marginBottom: spacing.md }]}>
                        {payingBill.name} · {formatCurrency(payingBill.amount)}
                    </Text>
                )}

                <Text style={[styles.label, { color: COLORS.textMuted }]}>DEDUCT FROM</Text>

                {/* HAND + Savings virtual chips */}
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                    <TouchableOpacity
                        style={[styles.sourceChip, {
                            borderColor: paySourceType === 'hand' && !selectedWallet ? '#E91E8C' : COLORS.border,
                            borderWidth: paySourceType === 'hand' && !selectedWallet ? 2 : 1,
                            backgroundColor: COLORS.background,
                            flex: 1,
                        }]}
                        onPress={() => { setPaySourceType(paySourceType === 'hand' ? null : 'hand'); setSelectedWallet(null); }}
                        activeOpacity={0.8}
                    >
                        <MaterialCommunityIcons name="hand-coin-outline" size={18} color="#E91E8C" />
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.sourceChipLabel, { color: COLORS.text }]}>HAND</Text>
                            <Text style={[styles.sourceChipSub, { color: COLORS.textMuted }]}>
                                ₱{(netBalance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </Text>
                        </View>
                        {paySourceType === 'hand' && !selectedWallet && (
                            <View style={[styles.sourceCheckDot, { backgroundColor: '#E91E8C' }]}>
                                <Feather name="check" size={9} color="#fff" />
                            </View>
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.sourceChip, {
                            borderColor: paySourceType === 'savings' && !selectedWallet ? '#8b5cf6' : COLORS.border,
                            borderWidth: paySourceType === 'savings' && !selectedWallet ? 2 : 1,
                            backgroundColor: COLORS.background,
                            flex: 1,
                        }]}
                        onPress={() => { setPaySourceType(paySourceType === 'savings' ? null : 'savings'); setSelectedWallet(null); }}
                        activeOpacity={0.8}
                    >
                        <MaterialCommunityIcons name="piggy-bank-outline" size={18} color="#8b5cf6" />
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.sourceChipLabel, { color: COLORS.text }]}>Savings</Text>
                            <Text style={[styles.sourceChipSub, { color: COLORS.textMuted }]}>
                                ₱{(savingsMasterPot?.currentAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </Text>
                        </View>
                        {paySourceType === 'savings' && !selectedWallet && (
                            <View style={[styles.sourceCheckDot, { backgroundColor: '#8b5cf6' }]}>
                                <Feather name="check" size={9} color="#fff" />
                            </View>
                        )}
                    </TouchableOpacity>
                </View>

                {/* Wallet list */}
                <WalletSelector
                    selectedWalletId={selectedWallet?._id}
                    onSelect={(w) => { setSelectedWallet(w); setPaySourceType(null); }}
                    COLORS={COLORS}
                    amountPHP={parseFloat(payingBill?.amount) || 0}
                    isExpense={true}
                />

                <TouchableOpacity onPress={handleConfirmPay} disabled={paySaving}
                    style={[styles.saveBtn, { backgroundColor: '#22c55e', marginTop: spacing.lg }]}>
                    {paySaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Confirm Payment</Text>}
                </TouchableOpacity>
            </BottomSheetModal>

            <CustomAlertModal
                visible={alertConfig.visible}
                title={alertConfig.title}
                message={alertConfig.message}
                type={alertConfig.type}
                confirmText={alertConfig.confirmText}
                onConfirm={alertConfig.onConfirm}
                onClose={() => setAlertConfig(p => ({ ...p, visible: false }))}
            />
        </SafeAreaView>
    );
}

const getStyles = (COLORS) => StyleSheet.create({
    safe: { flex: 1, backgroundColor: COLORS.background },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, paddingBottom: spacing.sm },
    headerTitle: { fontSize: 24, fontWeight: '800', color: COLORS.text },
    headerSub: { fontSize: 13, marginTop: 2 },
    addBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
    content: { paddingHorizontal: spacing.lg, paddingBottom: 120 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    empty: { alignItems: 'center', paddingTop: 80 },
    emptyEmoji: { fontSize: 52, marginBottom: 12 },
    emptyTitle: { fontSize: 18, fontWeight: '800', marginBottom: 6 },
    emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
    groupTitle: { fontSize: 13, fontWeight: '700', marginBottom: 8, marginTop: spacing.md },
    billCard: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.xs, gap: 10 },
    billIcon: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center' },
    billName: { fontWeight: '700', fontSize: 14 },
    billMeta: { fontSize: 12, marginTop: 2 },
    billRight: { alignItems: 'flex-end' },
    billAmount: { fontWeight: '800', fontSize: 14 },
    billDue: { fontSize: 11, fontWeight: '600', marginTop: 2 },
    billActions: { flexDirection: 'row', gap: 6 },
    actionBtn: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },

    // Modal
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    sheet: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: 48 },
    sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#ccc', alignSelf: 'center', marginBottom: spacing.md },
    sheetTitle: { fontSize: 18, fontWeight: '800', marginBottom: spacing.md },
    label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6, marginTop: spacing.sm },
    input: { borderWidth: 1.5, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: 15, marginBottom: 4 },
    catChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5 },
    saveBtn: { paddingVertical: 16, borderRadius: radius.xl, alignItems: 'center', marginTop: spacing.md },
    saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

    // Source chips
    sourceChip: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        padding: 10, paddingRight: 14,
        borderRadius: 16, borderWidth: 1.5,
    },
    sourceChipLabel: { fontSize: 13, fontWeight: '800' },
    sourceChipSub: { fontSize: 11, fontWeight: '600', marginTop: 1 },
    sourceCheckDot: {
        position: 'absolute', top: -6, right: -6,
        width: 18, height: 18, borderRadius: 9,
        backgroundColor: '#fff',
        justifyContent: 'center', alignItems: 'center',
        elevation: 3, shadowOpacity: 0.15, shadowRadius: 4,
    },
});
