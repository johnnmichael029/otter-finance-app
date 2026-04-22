import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView,
    RefreshControl, Modal, TextInput, KeyboardAvoidingView,
    Platform, TouchableWithoutFeedback, Keyboard, ActivityIndicator,
    Animated, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../context/ThemeContext';
import { spacing, radius } from '../../theme/colors';
import {
    getDebts, createDebt, updateDebt, deleteDebt,
    logDebtPayment, getDebtPayments,
} from '../../api/api';
import CustomAlertModal from '../../components/CustomAlertModal';
import Skeleton from '../../components/Skeleton';

const formatCurrency = (v) =>
    new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(v ?? 0);

const formatDate = (d) => {
    if (!d) return '—';
    return new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(d));
};

const daysUntil = (dateStr) => {
    if (!dateStr) return null;
    return Math.ceil((new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24));
};

// ── Debt Card ─────────────────────────────────────────────────────────────────
const DebtCard = ({ debt, onPay, onView, COLORS }) => {
    const isOverdue = debt.isOverdue;
    const isPaid = debt.status === 'settled';
    const isOwedToMe = debt.direction === 'owed_to_me';

    const remaining = debt.principal ?? (debt.amount - debt.amountPaid);
    const totalOwed = debt.totalOwed ?? remaining;
    const progress = debt.amount > 0 ? Math.min(1, debt.amountPaid / debt.amount) : 0;
    const daysLeft = daysUntil(debt.dueDate);

    const accentColor = isPaid ? '#22c55e'
        : isOverdue ? '#ef4444'
            : isOwedToMe ? '#8b5cf6' : '#f59e0b';

    return (
        <TouchableOpacity
            onPress={() => onView(debt)}
            style={[styles.card, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
            activeOpacity={0.85}
        >
            {/* Header */}
            <View style={styles.cardHeader}>
                <View style={[styles.cardIcon, { backgroundColor: accentColor + '20' }]}>
                    <MaterialCommunityIcons
                        name={isOwedToMe ? 'cash-plus' : 'credit-card-clock-outline'}
                        size={22} color={accentColor}
                    />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[styles.cardName, { color: COLORS.text }]} numberOfLines={1}>
                        {debt.personName}
                    </Text>
                    <Text style={[styles.cardDesc, { color: COLORS.textMuted }]} numberOfLines={1}>
                        {debt.description || (isOwedToMe ? 'Owed to you' : 'You owe')}
                    </Text>
                </View>
                {/* Status Badge */}
                <View style={[styles.badge, {
                    backgroundColor: isPaid ? '#22c55e20' : isOverdue ? '#ef444420' : accentColor + '20'
                }]}>
                    <Text style={[styles.badgeText, {
                        color: isPaid ? '#22c55e' : isOverdue ? '#ef4444' : accentColor
                    }]}>
                        {isPaid ? 'PAID' : isOverdue ? `${debt.daysOverdue}d OVERDUE` : 'ACTIVE'}
                    </Text>
                </View>
            </View>

            {/* Amount Row */}
            <View style={styles.amountRow}>
                <View>
                    <Text style={[styles.amountLabel, { color: COLORS.textMuted }]}>TOTAL OWED</Text>
                    <Text style={[styles.amountValue, { color: isOverdue ? '#ef4444' : COLORS.text }]}>
                        {formatCurrency(totalOwed)}
                    </Text>
                    {debt.accruedInterest > 0 && (
                        <Text style={[styles.interestBadge, { color: '#ef4444' }]}>
                            +{formatCurrency(debt.accruedInterest)} penalty
                        </Text>
                    )}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.amountLabel, { color: COLORS.textMuted }]}>REMAINING</Text>
                    <Text style={[styles.amountSmall, { color: COLORS.text }]}>
                        {formatCurrency(remaining)}
                    </Text>
                    {daysLeft !== null && !isPaid && (
                        <Text style={[styles.dueDateText, {
                            color: daysLeft < 0 ? '#ef4444' : daysLeft < 7 ? '#f59e0b' : COLORS.textMuted
                        }]}>
                            {daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? 'Due today!' : `${daysLeft}d left`}
                        </Text>
                    )}
                </View>
            </View>

            {/* Progress Bar */}
            {!isPaid && debt.amount > 0 && (
                <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, {
                        width: `${Math.round(progress * 100)}%`,
                        backgroundColor: isOverdue ? '#ef4444' : accentColor
                    }]} />
                </View>
            )}

            {/* Quick Action Buttons */}
            {!isPaid && (
                <View style={styles.cardActions}>
                    {!isOwedToMe && (
                        <TouchableOpacity
                            onPress={() => onPay(debt)}
                            style={[styles.payBtn, { backgroundColor: accentColor + '15', borderColor: accentColor }]}
                        >
                            <Feather name="dollar-sign" size={14} color={accentColor} />
                            <Text style={[styles.payBtnText, { color: accentColor }]}>Log Payment</Text>
                        </TouchableOpacity>
                    )}
                    {debt.isInstallment && debt.monthlyPayment && (
                        <View style={[styles.installmentTag, { backgroundColor: COLORS.background }]}>
                            <Text style={[styles.installmentText, { color: COLORS.textMuted }]}>
                                {formatCurrency(debt.monthlyPayment)}/mo
                            </Text>
                        </View>
                    )}
                </View>
            )}
        </TouchableOpacity>
    );
};

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function DebtScreen({ navigation }) {
    const { COLORS } = useTheme();
    const [debts, setDebts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [filter, setFilter] = useState('all'); // 'all' | 'owed_by_me' | 'owed_to_me' | 'settled'

    // Modals
    const [addModal, setAddModal] = useState(false);
    const [payModal, setPayModal] = useState({ visible: false, debt: null });
    const [detailModal, setDetailModal] = useState({ visible: false, debt: null, payments: [] });
    const [alert, setAlert] = useState({ visible: false, type: 'info', title: '', message: '', onConfirm: null });

    // Form state
    const [form, setForm] = useState({
        direction: 'owed_by_me',
        personName: '',
        amount: '',
        description: '',
        isInstallment: false,
        monthlyPayment: '',
        gracePeriodMonths: '12',
        penaltyRate: '20',
        dueDate: '',
    });
    const [payAmount, setPayAmount] = useState('');
    const [payNote, setPayNote] = useState('');
    const [saving, setSaving] = useState(false);

    // ── Animated sheet refs ───────────────────────────────────────────────────
    const SCREEN_H = Dimensions.get('window').height;

    const addSlide = useRef(new Animated.Value(SCREEN_H)).current;
    const addFade = useRef(new Animated.Value(0)).current;
    const [addMounted, setAddMounted] = useState(false);

    const paySlide = useRef(new Animated.Value(SCREEN_H)).current;
    const payFade = useRef(new Animated.Value(0)).current;
    const [payMounted, setPayMounted] = useState(false);

    const detailSlide = useRef(new Animated.Value(SCREEN_H)).current;
    const detailFade = useRef(new Animated.Value(0)).current;
    const [detailMounted, setDetailMounted] = useState(false);

    const animateIn = (slide, fade, setMounted) => {
        setMounted(true);
        slide.setValue(SCREEN_H);
        fade.setValue(0);
        Animated.parallel([
            Animated.timing(fade, { toValue: 1, duration: 280, useNativeDriver: true }),
            Animated.spring(slide, { toValue: 0, tension: 65, friction: 11, useNativeDriver: true }),
        ]).start();
    };

    const animateOut = (slide, fade, setMounted, cb) => {
        Animated.parallel([
            Animated.timing(fade, { toValue: 0, duration: 220, useNativeDriver: true }),
            Animated.timing(slide, { toValue: SCREEN_H, duration: 260, useNativeDriver: true }),
        ]).start(() => { setMounted(false); cb?.(); });
    };

    useEffect(() => {
        if (addModal) animateIn(addSlide, addFade, setAddMounted);
        else animateOut(addSlide, addFade, setAddMounted);
    }, [addModal]);

    useEffect(() => {
        if (payModal.visible) animateIn(paySlide, payFade, setPayMounted);
        else animateOut(paySlide, payFade, setPayMounted);
    }, [payModal.visible]);

    useEffect(() => {
        if (detailModal.visible) animateIn(detailSlide, detailFade, setDetailMounted);
        else animateOut(detailSlide, detailFade, setDetailMounted);
    }, [detailModal.visible]);

    const showAlert = (type, title, message, onConfirm = null) =>
        setAlert({ visible: true, type, title, message, onConfirm });
    const closeAlert = () => setAlert(a => ({ ...a, visible: false }));

    const load = useCallback(async () => {
        try {
            const data = await getDebts();
            setDebts(data);
        } catch (e) {
            console.warn('[DebtScreen] Load error:', e.message);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const onRefresh = () => { setRefreshing(true); load(); };

    // Filtered debts
    const filtered = debts.filter(d => {
        if (filter === 'all') return d.status !== 'settled';
        if (filter === 'settled') return d.status === 'settled';
        return d.direction === filter && d.status !== 'settled';
    });

    // Summary totals
    const iOwe = debts.filter(d => d.direction === 'owed_by_me' && d.status !== 'settled')
        .reduce((s, d) => s + (d.totalOwed ?? d.amount - d.amountPaid), 0);
    const owedToMe = debts.filter(d => d.direction === 'owed_to_me' && d.status !== 'settled')
        .reduce((s, d) => s + (d.totalOwed ?? d.amount - d.amountPaid), 0);

    // Build due date from grace period months
    const buildDueDate = () => {
        if (!form.isInstallment) return form.dueDate || null;
        const months = parseInt(form.gracePeriodMonths) || 0;
        if (!months) return null;
        const d = new Date();
        d.setMonth(d.getMonth() + months);
        return d.toISOString();
    };

    const handleCreate = async () => {
        if (!form.personName.trim()) return showAlert('warning', 'Missing Name', 'Please enter a name or label.');
        if (!form.amount || isNaN(parseFloat(form.amount))) return showAlert('warning', 'Invalid Amount', 'Please enter a valid amount.');

        setSaving(true);
        try {
            await createDebt({
                direction: form.direction,
                personName: form.personName.trim(),
                amount: parseFloat(form.amount),
                description: form.description.trim(),
                isInstallment: form.isInstallment,
                monthlyPayment: form.isInstallment ? parseFloat(form.monthlyPayment) || null : null,
                gracePeriodMonths: form.isInstallment ? parseInt(form.gracePeriodMonths) || 0 : 0,
                penaltyRate: form.isInstallment ? parseFloat(form.penaltyRate) || 0 : 0,
                dueDate: buildDueDate(),
            });
            setAddModal(false);
            resetForm();
            load();
            showAlert('success', 'Debt Added!', 'Your debt record has been created.');
        } catch (e) {
            showAlert('error', 'Failed', e?.response?.data?.error || 'Could not save.');
        } finally {
            setSaving(false);
        }
    };

    const handleLogPayment = async () => {
        const amount = parseFloat(payAmount);
        if (!amount || amount <= 0) return showAlert('warning', 'Invalid Amount', 'Enter a valid payment amount.');
        setSaving(true);
        try {
            await logDebtPayment(payModal.debt._id, { amount, note: payNote });
            setPayModal({ visible: false, debt: null });
            setPayAmount('');
            setPayNote('');
            load();
            showAlert('success', 'Payment Logged!', `${formatCurrency(amount)} recorded as paid.`);
        } catch (e) {
            showAlert('error', 'Failed', e?.response?.data?.error || 'Could not log payment.');
        } finally {
            setSaving(false);
        }
    };

    const handleViewDetail = async (debt) => {
        try {
            const payments = await getDebtPayments(debt._id);
            setDetailModal({ visible: true, debt, payments });
        } catch (e) {
            setDetailModal({ visible: true, debt, payments: [] });
        }
    };

    const handleDelete = (debt) => {
        showAlert('confirm', 'Delete Debt?', `Remove "${debt.personName}" from your debt records?`, async () => {
            try {
                await deleteDebt(debt._id);
                load();
            } catch (e) {
                showAlert('error', 'Failed', 'Could not delete.');
            }
        });
    };

    const resetForm = () => setForm({
        direction: 'owed_by_me', personName: '', amount: '', description: '',
        isInstallment: false, monthlyPayment: '',
        gracePeriodMonths: '12', penaltyRate: '20', dueDate: '',
    });

    if (loading) {
        return (
            <SafeAreaView style={[styles.safe, { backgroundColor: COLORS.background }]}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backBtn, { backgroundColor: COLORS.surface }]}>
                        <Feather name="arrow-left" size={20} color={COLORS.text} />
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, { color: COLORS.text }]}>Debts</Text>
                </View>

                {/* Summary Skeleton */}
                <View style={styles.summaryRow}>
                    <View style={[styles.summaryCard, { backgroundColor: COLORS.surface, marginRight: spacing.sm, borderWidth: 1, borderColor: COLORS.border }]}>
                        <Skeleton width={80} height={10} style={{ marginBottom: 6 }} />
                        <Skeleton width={110} height={20} />
                    </View>
                    <View style={[styles.summaryCard, { backgroundColor: COLORS.surface, marginLeft: spacing.sm, borderWidth: 1, borderColor: COLORS.border }]}>
                        <Skeleton width={80} height={10} style={{ marginBottom: 6 }} />
                        <Skeleton width={110} height={20} />
                    </View>
                </View>

                {/* Filters Skeleton */}
                <View style={[styles.filters, { paddingBottom: 16 }]}>
                    {[1, 2, 3].map(i => <Skeleton key={i} width={70} height={30} borderRadius={15} style={{ marginRight: 8 }} />)}
                </View>

                {/* Cards Skeleton */}
                <View style={styles.list}>
                    {[1, 2, 3].map(i => (
                        <View key={i} style={[styles.card, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
                            <View style={styles.cardHeader}>
                                <Skeleton width={44} height={44} borderRadius={12} style={{ marginRight: 12 }} />
                                <View style={{ flex: 1 }}>
                                    <Skeleton width={120} height={16} style={{ marginBottom: 6 }} />
                                    <Skeleton width={80} height={12} />
                                </View>
                                <Skeleton width={40} height={16} borderRadius={4} />
                            </View>
                            <Skeleton width="100%" height={5} borderRadius={3} style={{ marginBottom: 8 }} />
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 }}>
                                <Skeleton width={90} height={22} />
                                <Skeleton width={60} height={16} />
                            </View>
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                                <Skeleton width={100} height={30} borderRadius={15} />
                                <Skeleton width={70} height={30} borderRadius={15} />
                            </View>
                        </View>
                    ))}
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={[styles.safe, { backgroundColor: COLORS.background }]}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backBtn, { backgroundColor: COLORS.surface }]}>
                    <Feather name="arrow-left" size={20} color={COLORS.text} />
                </TouchableOpacity>
                <View>
                    <Text style={[styles.headerTitle, { color: COLORS.text }]}>Debt Tracker</Text>
                    <Text style={[styles.headerSub, { color: COLORS.textMuted }]}>Installments & loans</Text>
                </View>
                <TouchableOpacity
                    onPress={() => { resetForm(); setAddModal(true); }}
                    style={[styles.addBtn, { backgroundColor: COLORS.primary }]}
                >
                    <Feather name="plus" size={20} color="#fff" />
                    <Text style={styles.startBtnText}>Debt</Text>
                </TouchableOpacity>
            </View>

            {/* Summary Cards */}
            <View style={styles.summaryRow}>
                <LinearGradient colors={['#ef4444', '#b91c1c']} style={[styles.summaryCard, { marginRight: 8 }]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                    <Text style={styles.summaryLabel}>I OWE</Text>
                    <Text style={styles.summaryAmount}>{formatCurrency(iOwe)}</Text>
                </LinearGradient>
                <LinearGradient colors={['#8b5cf6', '#6d28d9']} style={[styles.summaryCard, { marginLeft: 8 }]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                    <Text style={styles.summaryLabel}>OWED TO ME</Text>
                    <Text style={styles.summaryAmount}>{formatCurrency(owedToMe)}</Text>
                </LinearGradient>
            </View>

            {/* Filter Pills */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtersScroll} contentContainerStyle={styles.filters}>
                {[
                    { key: 'all', label: 'Active' },
                    { key: 'owed_by_me', label: 'I Owe' },
                    { key: 'owed_to_me', label: 'Owed to Me' },
                    { key: 'settled', label: 'Settled' },
                ].map(f => (
                    <TouchableOpacity
                        key={f.key}
                        onPress={() => setFilter(f.key)}
                        style={[styles.pill, filter === f.key && { backgroundColor: COLORS.primary }]}
                    >
                        <Text style={[styles.pillText, { color: filter === f.key ? '#fff' : COLORS.textMuted }]}>
                            {f.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            {/* Debt List */}
            <ScrollView
                contentContainerStyle={styles.list}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
            >
                {filtered.length === 0 ? (
                    <View style={styles.empty}>
                        <MaterialCommunityIcons name="credit-card-check-outline" size={56} color={COLORS.textMuted} />
                        <Text style={[styles.emptyTitle, { color: COLORS.text }]}>
                            {filter === 'settled' ? 'No settled debts yet' : 'No active debts!'}
                        </Text>
                        <Text style={[styles.emptySub, { color: COLORS.textMuted }]}>
                            {filter === 'settled' ? 'Pay off debts to see them here.' : 'Tap + to add an installment or loan.'}
                        </Text>
                    </View>
                ) : (
                    filtered.map(debt => (
                        <DebtCard
                            key={debt._id}
                            debt={debt}
                            COLORS={COLORS}
                            onPay={(d) => { setPayModal({ visible: true, debt: d }); setPayAmount(''); setPayNote(''); }}
                            onView={handleViewDetail}
                        />
                    ))
                )}
            </ScrollView>

            {/* ── Add Debt Sheet ─────────────────────────────────────────────────────── */}
            <Modal transparent visible={addMounted} animationType="none" onRequestClose={() => setAddModal(false)} statusBarTranslucent>
                <TouchableWithoutFeedback onPress={() => setAddModal(false)}>
                    <Animated.View style={[styles.overlay, { opacity: addFade }]} />
                </TouchableWithoutFeedback>
                <Animated.View style={[styles.sheet, { backgroundColor: COLORS.surface, transform: [{ translateY: addSlide }] }]}>
                    <View style={[styles.handle, { backgroundColor: COLORS.border }]} />
                    <View style={styles.sheetHeader}>
                        <Text style={[styles.sheetTitle, { color: COLORS.text }]}>Add Debt</Text>
                        <TouchableOpacity onPress={() => setAddModal(false)}>
                            <Feather name="x" size={24} color={COLORS.textMuted} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false}>
                        {/* Direction Toggle */}
                        <Text style={[styles.formLabel, { color: COLORS.textMuted }]}>TYPE</Text>
                        <View style={styles.toggleRow}>
                            {[
                                { key: 'owed_by_me', label: 'I Owe', icon: 'arrow-up-right', lib: 'feather', color: '#ef4444' },
                                { key: 'owed_to_me', label: 'Owed to Me', icon: 'arrow-down-left', lib: 'feather', color: '#8b5cf6' },
                            ].map(opt => {
                                const isActive = form.direction === opt.key;
                                return (
                                    <TouchableOpacity
                                        key={opt.key}
                                        onPress={() => setForm(f => ({ ...f, direction: opt.key }))}
                                        style={[styles.toggleBtn, isActive && { backgroundColor: COLORS.primary }]}
                                    >
                                        <Feather
                                            name={opt.icon}
                                            size={16}
                                            color={isActive ? '#fff' : opt.color}
                                            style={{ marginRight: 6 }}
                                        />
                                        <Text style={[styles.toggleText, { color: isActive ? '#fff' : COLORS.textMuted }]}>
                                            {opt.label}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        {/* Name */}
                        <Text style={[styles.formLabel, { color: COLORS.textMuted }]}>NAME / LABEL</Text>
                        <View style={[styles.inputWrap, { backgroundColor: COLORS.background, borderColor: COLORS.border }]}>
                            <Feather name="user" size={16} color={COLORS.textMuted} style={{ marginRight: 8 }} />
                            <TextInput
                                style={[styles.input, { color: COLORS.text }]}
                                placeholder="e.g. BDO Phone Installment"
                                placeholderTextColor={COLORS.textMuted}
                                value={form.personName}
                                onChangeText={v => setForm(f => ({ ...f, personName: v }))}
                            />
                        </View>

                        {/* Amount */}
                        <Text style={[styles.formLabel, { color: COLORS.textMuted }]}>TOTAL AMOUNT</Text>
                        <View style={[styles.inputWrap, { backgroundColor: COLORS.background, borderColor: COLORS.border }]}>
                            <Text style={{ color: COLORS.primary, fontWeight: '800', marginRight: 8 }}>₱</Text>
                            <TextInput
                                style={[styles.input, { color: COLORS.text }]}
                                placeholder="0.00"
                                placeholderTextColor={COLORS.textMuted}
                                keyboardType="decimal-pad"
                                value={form.amount}
                                onChangeText={v => setForm(f => ({ ...f, amount: v }))}
                            />
                        </View>

                        {/* Description */}
                        <Text style={[styles.formLabel, { color: COLORS.textMuted }]}>DESCRIPTION (OPTIONAL)</Text>
                        <View style={[styles.inputWrap, { backgroundColor: COLORS.background, borderColor: COLORS.border }]}>
                            <Feather name="file-text" size={16} color={COLORS.textMuted} style={{ marginRight: 8 }} />
                            <TextInput
                                style={[styles.input, { color: COLORS.text }]}
                                placeholder="e.g. Samsung S25 via GCash"
                                placeholderTextColor={COLORS.textMuted}
                                value={form.description}
                                onChangeText={v => setForm(f => ({ ...f, description: v }))}
                            />
                        </View>

                        {/* Installment Toggle */}
                        <TouchableOpacity
                            onPress={() => setForm(f => ({ ...f, isInstallment: !f.isInstallment }))}
                            style={[styles.installmentToggle, { backgroundColor: COLORS.background, borderColor: COLORS.border }]}
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <MaterialCommunityIcons
                                    name="calendar-clock"
                                    size={20}
                                    color={form.isInstallment ? COLORS.primary : COLORS.textMuted}
                                />
                                <View>
                                    <Text style={[styles.toggleMainText, { color: COLORS.text }]}>Installment Plan</Text>
                                    <Text style={[styles.toggleSubText, { color: COLORS.textMuted }]}>
                                        Set monthly payments & penalty rate
                                    </Text>
                                </View>
                            </View>
                            <View style={[styles.checkCircle, form.isInstallment && { backgroundColor: COLORS.primary }]}>
                                {form.isInstallment && <Feather name="check" size={14} color="#fff" />}
                            </View>
                        </TouchableOpacity>

                        {form.isInstallment && (
                            <View style={[styles.installmentBox, { backgroundColor: COLORS.background, borderColor: COLORS.border }]}>
                                <Text style={[styles.formLabel, { color: COLORS.textMuted }]}>MONTHLY PAYMENT</Text>
                                <View style={[styles.inputWrap, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
                                    <Text style={{ color: '#f59e0b', fontWeight: '800', marginRight: 8 }}>₱</Text>
                                    <TextInput
                                        style={[styles.input, { color: COLORS.text }]}
                                        placeholder="e.g. 1000"
                                        placeholderTextColor={COLORS.textMuted}
                                        keyboardType="decimal-pad"
                                        value={form.monthlyPayment}
                                        onChangeText={v => setForm(f => ({ ...f, monthlyPayment: v }))}
                                    />
                                </View>

                                <Text style={[styles.formLabel, { color: COLORS.textMuted }]}>GRACE PERIOD (MONTHS)</Text>
                                <View style={[styles.inputWrap, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
                                    <Feather name="calendar" size={16} color={COLORS.textMuted} style={{ marginRight: 8 }} />
                                    <TextInput
                                        style={[styles.input, { color: COLORS.text }]}
                                        placeholder="e.g. 12"
                                        placeholderTextColor={COLORS.textMuted}
                                        keyboardType="number-pad"
                                        value={form.gracePeriodMonths}
                                        onChangeText={v => setForm(f => ({ ...f, gracePeriodMonths: v }))}
                                    />
                                </View>

                                <Text style={[styles.formLabel, { color: COLORS.textMuted }]}>PENALTY RATE (% PER MONTH)</Text>
                                <View style={[styles.inputWrap, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
                                    <Feather name="percent" size={16} color={COLORS.textMuted} style={{ marginRight: 8 }} />
                                    <TextInput
                                        style={[styles.input, { color: COLORS.text }]}
                                        placeholder="e.g. 20"
                                        placeholderTextColor={COLORS.textMuted}
                                        keyboardType="decimal-pad"
                                        value={form.penaltyRate}
                                        onChangeText={v => setForm(f => ({ ...f, penaltyRate: v }))}
                                    />
                                </View>

                                {form.gracePeriodMonths ? (
                                    <View style={[styles.dueDatePreview, { backgroundColor: '#f59e0b10', borderColor: '#f59e0b50' }]}>
                                        <Feather name="calendar" size={14} color="#f59e0b" />
                                        <Text style={[styles.dueDatePreviewText, { color: '#f59e0b' }]}>
                                            Due date: {formatDate(
                                                (() => {
                                                    const d = new Date();
                                                    d.setMonth(d.getMonth() + (parseInt(form.gracePeriodMonths) || 0));
                                                    return d;
                                                })()
                                            )}
                                        </Text>
                                    </View>
                                ) : null}
                            </View>
                        )}

                        <TouchableOpacity
                            onPress={handleCreate}
                            disabled={saving}
                            style={[styles.saveBtn, { backgroundColor: COLORS.primary }]}
                        >
                            {saving
                                ? <ActivityIndicator color="#fff" />
                                : <Text style={styles.saveBtnText}>Save Debt</Text>}
                        </TouchableOpacity>
                    </ScrollView>
                </Animated.View>
            </Modal>

            {/* ── Log Payment Sheet ───────────────────────────────────────────────── */}
            <Modal transparent visible={payMounted} animationType="none" onRequestClose={() => setPayModal({ visible: false, debt: null })} statusBarTranslucent>
                <TouchableWithoutFeedback onPress={() => setPayModal({ visible: false, debt: null })}>
                    <Animated.View style={[styles.overlay, { opacity: payFade }]} />
                </TouchableWithoutFeedback>
                <Animated.View style={[styles.sheet, { backgroundColor: COLORS.surface, transform: [{ translateY: paySlide }] }]}>
                    <View style={[styles.handle, { backgroundColor: COLORS.border }]} />
                    <View style={styles.sheetHeader}>
                        <View>
                            <Text style={[styles.sheetTitle, { color: COLORS.text }]}>Log Payment</Text>
                            <Text style={[styles.sheetSub, { color: COLORS.textMuted }]}>
                                {payModal.debt?.personName} · {formatCurrency(payModal.debt?.principal)} remaining
                            </Text>
                        </View>
                        <TouchableOpacity onPress={() => setPayModal({ visible: false, debt: null })}>
                            <Feather name="x" size={24} color={COLORS.textMuted} />
                        </TouchableOpacity>
                    </View>

                    {payModal.debt?.monthlyPayment && (
                        <TouchableOpacity
                            onPress={() => setPayAmount(String(payModal.debt.monthlyPayment))}
                            style={[styles.quickFill, { backgroundColor: COLORS.background }]}
                        >
                            <Feather name="zap" size={14} color={COLORS.primary} />
                            <Text style={[styles.quickFillText, { color: COLORS.primary }]}>
                                Use monthly payment: {formatCurrency(payModal.debt.monthlyPayment)}
                            </Text>
                        </TouchableOpacity>
                    )}

                    <Text style={[styles.formLabel, { color: COLORS.textMuted }]}>AMOUNT PAID</Text>
                    <View style={[styles.inputWrap, { backgroundColor: COLORS.background, borderColor: COLORS.border }]}>
                        <Text style={{ color: '#22c55e', fontWeight: '800', marginRight: 8 }}>₱</Text>
                        <TextInput
                            style={[styles.input, { color: COLORS.text }]}
                            placeholder="0.00"
                            placeholderTextColor={COLORS.textMuted}
                            keyboardType="decimal-pad"
                            value={payAmount}
                            onChangeText={setPayAmount}
                            autoFocus
                        />
                    </View>

                    <Text style={[styles.formLabel, { color: COLORS.textMuted }]}>NOTE (OPTIONAL)</Text>
                    <View style={[styles.inputWrap, { backgroundColor: COLORS.background, borderColor: COLORS.border }]}>
                        <TextInput
                            style={[styles.input, { color: COLORS.text }]}
                            placeholder="e.g. GCash transfer"
                            placeholderTextColor={COLORS.textMuted}
                            value={payNote}
                            onChangeText={setPayNote}
                        />
                    </View>

                    <TouchableOpacity
                        onPress={handleLogPayment}
                        disabled={saving}
                        style={[styles.saveBtn, { backgroundColor: '#22c55e' }]}
                    >
                        {saving
                            ? <ActivityIndicator color="#fff" />
                            : <><Feather name="check-circle" size={18} color="#fff" style={{ marginRight: 8 }} />
                                <Text style={styles.saveBtnText}>Confirm Payment</Text></>
                        }
                    </TouchableOpacity>
                </Animated.View>
            </Modal>

            {/* ── Detail / Payment History Sheet ─────────────────────────────────── */}
            <Modal transparent visible={detailMounted} animationType="none" onRequestClose={() => setDetailModal(s => ({ ...s, visible: false }))} statusBarTranslucent>
                <TouchableWithoutFeedback onPress={() => setDetailModal(s => ({ ...s, visible: false }))}>
                    <Animated.View style={[styles.overlay, { opacity: detailFade }]} />
                </TouchableWithoutFeedback>
                <Animated.View style={[styles.sheet, { backgroundColor: COLORS.surface, maxHeight: '82%', transform: [{ translateY: detailSlide }] }]}>
                    <View style={[styles.handle, { backgroundColor: COLORS.border }]} />
                    <View style={styles.sheetHeader}>
                        <View>
                            <Text style={[styles.sheetTitle, { color: COLORS.text }]}>{detailModal.debt?.personName}</Text>
                            <Text style={[styles.sheetSub, { color: COLORS.textMuted }]}>Payment History</Text>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                            <TouchableOpacity onPress={() => { setDetailModal(s => ({ ...s, visible: false })); handleDelete(detailModal.debt); }}>
                                <Feather name="trash-2" size={20} color="#ef4444" />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => setDetailModal(s => ({ ...s, visible: false }))}>
                                <Feather name="x" size={24} color={COLORS.textMuted} />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Debt Summary */}
                    {detailModal.debt && (
                        <View style={[styles.detailSummary, { backgroundColor: COLORS.background }]}>
                            <View style={styles.detailRow}>
                                <Text style={[styles.detailKey, { color: COLORS.textMuted }]}>Original</Text>
                                <Text style={[styles.detailVal, { color: COLORS.text }]}>{formatCurrency(detailModal.debt.amount)}</Text>
                            </View>
                            <View style={styles.detailRow}>
                                <Text style={[styles.detailKey, { color: COLORS.textMuted }]}>Paid</Text>
                                <Text style={[styles.detailVal, { color: '#22c55e' }]}>{formatCurrency(detailModal.debt.amountPaid)}</Text>
                            </View>
                            {detailModal.debt.accruedInterest > 0 && (
                                <View style={styles.detailRow}>
                                    <Text style={[styles.detailKey, { color: COLORS.textMuted }]}>Penalty</Text>
                                    <Text style={[styles.detailVal, { color: '#ef4444' }]}>+{formatCurrency(detailModal.debt.accruedInterest)}</Text>
                                </View>
                            )}
                            <View style={[styles.detailRow, { borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: 8, paddingTop: 8 }]}>
                                <Text style={[styles.detailKey, { color: COLORS.textMuted }]}>Total Owed</Text>
                                <Text style={[styles.detailVal, { color: COLORS.primary, fontWeight: '800' }]}>{formatCurrency(detailModal.debt.totalOwed)}</Text>
                            </View>
                            {detailModal.debt.dueDate && (
                                <View style={styles.detailRow}>
                                    <Text style={[styles.detailKey, { color: COLORS.textMuted }]}>Due Date</Text>
                                    <Text style={[styles.detailVal, { color: COLORS.text }]}>{formatDate(detailModal.debt.dueDate)}</Text>
                                </View>
                            )}
                            {detailModal.debt.penaltyRate > 0 && (
                                <View style={styles.detailRow}>
                                    <Text style={[styles.detailKey, { color: COLORS.textMuted }]}>Penalty Rate</Text>
                                    <Text style={[styles.detailVal, { color: '#ef4444' }]}>{detailModal.debt.penaltyRate}%/month</Text>
                                </View>
                            )}
                        </View>
                    )}

                    <Text style={[styles.formLabel, { color: COLORS.textMuted, marginTop: spacing.md }]}>PAYMENT HISTORY</Text>
                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
                        {detailModal.payments.length === 0 ? (
                            <Text style={[styles.emptySub, { color: COLORS.textMuted, textAlign: 'center', marginTop: 16 }]}>
                                No payments logged yet.
                            </Text>
                        ) : (
                            detailModal.payments.map(pay => (
                                <View key={pay._id} style={[styles.paymentItem, { borderBottomColor: COLORS.border }]}>
                                    <View style={[styles.payDot, { backgroundColor: '#22c55e' }]} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.payAmount, { color: '#22c55e' }]}>{formatCurrency(pay.amount)}</Text>
                                        {pay.note ? <Text style={[styles.payNote, { color: COLORS.textMuted }]}>{pay.note}</Text> : null}
                                    </View>
                                    <Text style={[styles.payDate, { color: COLORS.textMuted }]}>{formatDate(pay.paidAt)}</Text>
                                </View>
                            ))
                        )}
                    </ScrollView>
                </Animated.View>
            </Modal>

            <CustomAlertModal
                visible={alert.visible}
                onClose={closeAlert}
                onConfirm={() => { closeAlert(); alert.onConfirm?.(); }}
                title={alert.title}
                message={alert.message}
                type={alert.type}
                confirmText={alert.type === 'confirm' ? 'Yes, Delete' : 'OK'}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, paddingBottom: spacing.md },
    backBtn: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    headerTitle: { fontSize: 20, fontWeight: '800' },
    headerSub: { fontSize: 12 },
    addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, marginLeft: 'auto' },

    summaryRow: { flexDirection: 'row', paddingHorizontal: spacing.lg, marginBottom: spacing.md },
    summaryCard: { flex: 1, borderRadius: radius.xl, padding: spacing.md, paddingVertical: 14 },
    summaryLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
    summaryAmount: { color: '#fff', fontSize: 20, fontWeight: '800', marginTop: 4 },

    filtersScroll: { flexGrow: 0 },
    filters: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: 8, flexDirection: 'row', alignItems: 'center' },
    pill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.full, backgroundColor: 'rgba(128,128,128,0.12)' },
    pillText: { fontSize: 13, fontWeight: '700' },

    list: { padding: spacing.lg, paddingTop: 4, gap: 12, paddingBottom: 40 },

    card: { borderRadius: radius.xl, padding: spacing.md, borderWidth: 1 },
    cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
    cardIcon: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    cardName: { fontSize: 15, fontWeight: '800' },
    cardDesc: { fontSize: 12, marginTop: 2 },
    badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.lg },
    badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },

    amountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: spacing.sm },
    amountLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
    amountValue: { fontSize: 22, fontWeight: '800', marginTop: 2 },
    amountSmall: { fontSize: 16, fontWeight: '700', marginTop: 2 },
    interestBadge: { fontSize: 11, fontWeight: '700', marginTop: 2 },
    dueDateText: { fontSize: 11, fontWeight: '700', marginTop: 2 },

    progressTrack: { height: 5, borderRadius: 3, backgroundColor: 'rgba(128,128,128,0.15)', marginBottom: spacing.sm },
    progressFill: { height: 5, borderRadius: 3 },

    cardActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
    payBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.full, borderWidth: 1.5 },
    payBtnText: { fontSize: 12, fontWeight: '700' },
    installmentTag: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.full },
    installmentText: { fontSize: 11, fontWeight: '700' },

    empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
    emptyTitle: { fontSize: 18, fontWeight: '800' },
    emptySub: { fontSize: 13 },

    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.55)',
    },
    handle: {
        width: 40, height: 4, borderRadius: 2,
        alignSelf: 'center', marginBottom: spacing.md,
    },
    kav: { justifyContent: 'flex-end' },
    sheet: {
        position: 'absolute', bottom: 0, left: 0, right: 0,
        borderTopLeftRadius: 28, borderTopRightRadius: 28,
        padding: spacing.lg, paddingBottom: 44, maxHeight: '92%',
    },
    sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
    sheetTitle: { fontSize: 20, fontWeight: '800' },
    sheetSub: { fontSize: 12, marginTop: 2 },

    formLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: spacing.xs, marginTop: spacing.md },
    inputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: 12 },
    input: { flex: 1, fontSize: 15, fontWeight: '600' },

    toggleRow: { flexDirection: 'row', gap: 10 },
    toggleBtn: { flex: 1, flexDirection: 'row', paddingVertical: 12, borderRadius: radius.lg, backgroundColor: 'rgba(128,128,128,0.1)', alignItems: 'center', justifyContent: 'center' },
    toggleText: { fontSize: 14, fontWeight: '700' },

    installmentToggle: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        borderWidth: 1.5, borderRadius: radius.lg, padding: spacing.md, marginTop: spacing.md,
    },
    toggleMainText: { fontSize: 15, fontWeight: '700' },
    toggleSubText: { fontSize: 12, marginTop: 2 },
    checkCircle: {
        width: 24, height: 24, borderRadius: 12, borderWidth: 2,
        borderColor: 'rgba(128,128,128,0.3)', justifyContent: 'center', alignItems: 'center',
    },

    installmentBox: { borderWidth: 1.5, borderRadius: radius.lg, padding: spacing.md, marginTop: spacing.md },
    dueDatePreview: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, marginTop: spacing.md },
    dueDatePreviewText: { fontSize: 13, fontWeight: '700' },

    saveBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 16, borderRadius: radius.xl, marginTop: spacing.lg },
    saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

    quickFill: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: spacing.md, borderRadius: radius.lg, marginBottom: spacing.sm },
    quickFillText: { fontSize: 13, fontWeight: '700' },

    detailSummary: { borderRadius: radius.lg, padding: spacing.md, gap: 4 },
    detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
    detailKey: { fontSize: 13, fontWeight: '600' },
    detailVal: { fontSize: 14, fontWeight: '700' },

    paymentItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1 },
    payDot: { width: 10, height: 10, borderRadius: 5 },
    payAmount: { fontSize: 15, fontWeight: '800' },
    payNote: { fontSize: 12, marginTop: 2 },
    payDate: { fontSize: 12, fontWeight: '600' },
    startBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
