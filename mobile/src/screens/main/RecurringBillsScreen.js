import React, { useState, useCallback, useEffect } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator,
    TextInput, Alert, Platform, Animated as RNAnimated, RefreshControl
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import Animated, { ZoomIn, FadeOut, ZoomOut } from 'react-native-reanimated';
import { Swipeable } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import BottomSheetModal from '../../components/BottomSheetModal';
import { useTheme } from '../../context/ThemeContext';
import { useFinanceStore } from '../../store/financeStore';
import { getRecurringBills, createRecurringBill, deleteRecurringBill, markBillPaid } from '../../api/api';
import { spacing, radius } from '../../theme/colors';
import Skeleton from '../../components/Skeleton';
import CustomAlertModal from '../../components/CustomAlertModal';
import { useAuth } from '../../context/AuthContext';
import { getSocket, connectSocket } from '../../utils/socket';

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

const formatCurrency = (amount, currency = 'PHP') =>
    new Intl.NumberFormat('en-PH', { style: 'currency', currency }).format(amount);

const getDaysUntilDue = (dateStr) => {
    const diff = new Date(dateStr) - new Date();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

const isExpoGo = Constants.appOwnership === 'expo';

const scheduleNotification = async (bill) => {
    // Expo Go does NOT support real scheduled notifications.
    // Notifications will only work correctly in a development or production build.
    if (isExpoGo) {
        console.log(`[NotifLog] Skipping notification scheduling in Expo Go for: ${bill.name}`);
        return;
    }
    try {
        await Notifications.cancelScheduledNotificationAsync(`${bill._id}_upcoming`).catch(() => { });
        await Notifications.cancelScheduledNotificationAsync(`${bill._id}_due`).catch(() => { });

        const dueDate = new Date(bill.nextDueDate);
        const now = new Date();

        console.log(`[NotifLog] Scheduling for ${bill.name}. Due: ${dueDate.toLocaleString()}, Now: ${now.toLocaleString()}`);

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
            console.log(`[NotifLog] Scheduling upcoming for: ${notifDate.toLocaleString()}`);
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
            console.log(`[NotifLog] Scheduling due date for: ${dueDate.toLocaleString()}`);
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

export default function RecurringBillsScreen({ navigation }) {
    const COLORS = useTheme(state => state.COLORS);
    const { userInfo } = useAuth();
    const styles = getStyles(COLORS);

    const bills = useFinanceStore(state => state.recurringBills);
    const fetchRecurringBills = useFinanceStore(state => state.fetchRecurringBills);
    const loadingBills = useFinanceStore(state => state.isLoadingBills);

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [form, setForm] = useState({ name: '', amount: '', category: 'Bills', categoryIcon: 'file-text', categoryColor: '#6b7280', frequency: 'monthly', startDate: '' });
    const [saving, setSaving] = useState(false);
    const [alertConfig, setAlertConfig] = useState({ visible: false, title: '', message: '', type: 'info', onConfirm: null });

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
        connectSocket(userInfo._id);
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
        if (!form.name.trim() || !form.amount) return Alert.alert('Missing Fields', 'Please fill in the name and amount.');
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
            Alert.alert('Error', 'Could not save bill.');
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
                setBills(prev => prev.filter(b => b._id !== id));
            }
        });
    };

    const handleMarkPaid = async (id) => {
        try {
            const updated = await markBillPaid(id);
            setBills(prev => prev.map(b => b._id === id ? updated : b));
            await scheduleNotification(updated);
            Alert.alert('✅ Bill Marked Paid', 'Next due date has been advanced.');
        } catch (e) {
            Alert.alert('Error', 'Could not update bill.');
        }
    };

    const selectCategory = (cat) => {
        setForm(f => ({ ...f, category: cat.label, categoryIcon: cat.icon, categoryColor: cat.color }));
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

    const renderRightActions = (progress, dragX, bill) => {
        const scale = dragX.interpolate({
            inputRange: [-80, 0],
            outputRange: [1, 0],
            extrapolate: 'clamp',
        });

        return (
            <TouchableOpacity
                onPress={() => handleDelete(bill._id)}
                style={[styles.hiddenDeleteBtn, { backgroundColor: '#ef4444' }]}
                activeOpacity={0.8}
            >
                <RNAnimated.View style={{ transform: [{ scale }] }}>
                    <Feather name="trash-2" size={24} color="#fff" />
                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800', marginTop: 4 }}>Delete</Text>
                </RNAnimated.View>
            </TouchableOpacity>
        );
    };

    const renderBill = (bill) => {
        const days = getDaysUntilDue(bill.nextDueDate);
        const isOverdue = days <= 0;
        const isUrgent = days > 0 && days <= 3;
        const statusColor = isOverdue ? '#ef4444' : isUrgent ? '#f59e0b' : COLORS.income;
        const statusLabel = isOverdue ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today' : `Due in ${days}d`;

        return (
            <Animated.View key={bill._id} entering={ZoomIn.springify().damping(50).mass(0.9)} exiting={ZoomOut.duration(100)}>
                <Swipeable
                    renderRightActions={(prog, drag) => renderRightActions(prog, drag, bill)}
                    friction={1}
                    overshootRight={false}
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
                            <TouchableOpacity onPress={() => handleMarkPaid(bill._id)} style={[styles.actionBtn, { backgroundColor: COLORS.income + '20' }]}>
                                <Feather name="check" size={16} color={COLORS.income} />
                            </TouchableOpacity>
                        </View>
                    </View>
                </Swipeable>
            </Animated.View>
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
                <View style={styles.sheetHandle} />
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
    hiddenDeleteBtn: { width: 80, height: '100%', borderRadius: radius.xl, justifyContent: 'center', alignItems: 'center', marginLeft: 12, elevation: 1 },
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
});
