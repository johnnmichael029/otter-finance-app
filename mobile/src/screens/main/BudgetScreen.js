import React, { useState, useCallback, useEffect } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView,
    ActivityIndicator, RefreshControl, TouchableWithoutFeedback,
    TextInput, Alert, Animated as RNAnimated
} from 'react-native';
import Animated, { ZoomIn, ZoomOut } from 'react-native-reanimated';
import { Swipeable } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import BottomSheetModal from '../../components/BottomSheetModal';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { getBudgets, upsertBudget, deleteBudget, getCategories } from '../../api/api';
import { spacing, radius } from '../../theme/colors';
import Skeleton from '../../components/Skeleton';
import CustomAlertModal from '../../components/CustomAlertModal';

const formatCurrency = (amount, currency = 'PHP') =>
    new Intl.NumberFormat('en-PH', { style: 'currency', currency }).format(amount);

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const PRESET_CATEGORIES = [
    { label: 'Overall', icon: 'pie-chart', color: '#E91E8C' },
    { label: 'Food', icon: 'coffee', color: '#f59e0b' },
    { label: 'Transport', icon: 'truck', color: '#3b82f6' },
    { label: 'Shopping', icon: 'shopping-bag', color: '#ec4899' },
    { label: 'Bills', icon: 'file-text', color: '#ef4444' },
    { label: 'Health', icon: 'heart', color: '#22c55e' },
    { label: 'Entertainment', icon: 'tv', color: '#8b5cf6' },
    { label: 'Subscriptions', icon: 'wifi', color: '#06b6d4' },
];

export default function BudgetScreen() {
    const { COLORS } = useTheme();
    const { userInfo } = useAuth();
    const styles = getStyles(COLORS);

    const now = new Date();
    const [selectedMonth, setSelectedMonth] = useState(now.toISOString().slice(0, 7));
    const [budgets, setBudgets] = useState([]);
    const [remoteCats, setRemoteCats] = useState([]);
    const [totalSpent, setTotalSpent] = useState(0);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({ category: 'Overall', categoryIcon: 'pie-chart', categoryColor: '#E91E8C', allocatedAmount: '', customCategory: '' });
    const [useCustom, setUseCustom] = useState(false);
    const [alertConfig, setAlertConfig] = useState({ visible: false, title: '', message: '', type: 'info', onConfirm: null });

    const load = useCallback(async () => {
        try {
            const [bRes, cRes] = await Promise.all([
                getBudgets(selectedMonth),
                getCategories()
            ]);
            setBudgets(bRes.budgets || []);
            setTotalSpent(bRes.totalSpent || 0);
            if (cRes?.categories) {
                const expCats = cRes.categories.filter(c => c.type === 'expense')
                    .map(c => ({ label: c.name, icon: c.icon, color: c.color }));
                setRemoteCats(expCats);
            }
        } catch (e) {
            console.warn(e.message);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [selectedMonth]);

    useEffect(() => { load(); }, [load]);

    const handleSave = async () => {
        const cat = useCustom ? form.customCategory.trim() : form.category;
        if (!cat) return Alert.alert('Missing', 'Please select or type a category.');
        if (!form.allocatedAmount || isNaN(parseFloat(form.allocatedAmount))) {
            return Alert.alert('Missing', 'Please enter a valid amount.');
        }
        setSaving(true);
        try {
            await upsertBudget({
                month: selectedMonth,
                category: cat,
                categoryIcon: useCustom ? 'tag' : form.categoryIcon,
                categoryColor: useCustom ? '#6b7280' : form.categoryColor,
                allocatedAmount: parseFloat(form.allocatedAmount),
            });
            setModalVisible(false);
            setForm({ category: 'Overall', categoryIcon: 'pie-chart', categoryColor: '#E91E8C', allocatedAmount: '', customCategory: '' });
            setUseCustom(false);
            load();
        } catch (e) {
            Alert.alert('Error', 'Could not save budget.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = (id) => {
        setAlertConfig({
            visible: true,
            title: 'Remove Budget?',
            message: 'This budget limit will be deleted.',
            type: 'confirm',
            confirmText: 'Delete',
            onConfirm: async () => {
                setAlertConfig(p => ({ ...p, visible: false }));
                await deleteBudget(id);
                setBudgets(prev => prev.filter(b => b._id !== id));
            }
        });
    };

    // Month navigation
    const changeMonth = (dir) => {
        const [y, m] = selectedMonth.split('-').map(Number);
        const d = new Date(y, m - 1 + dir, 1);
        setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    };

    const [yr, mn] = selectedMonth.split('-').map(Number);
    const monthLabel = `${MONTH_LABELS[mn - 1]} ${yr}`;

    const PRESET_CATS = [
        { label: 'Overall', icon: 'pie-chart', color: '#E91E8C' },
        ...(remoteCats.length > 0 ? remoteCats : PRESET_CATEGORIES.slice(1))
    ];

    const overallBudget = budgets.find(b => b.category === 'Overall');
    const categoryBudgets = budgets.filter(b => b.category !== 'Overall');

    const renderRightActions = (progress, dragX, id) => {
        const scale = dragX.interpolate({
            inputRange: [-80, 0],
            outputRange: [1, 0],
            extrapolate: 'clamp',
        });

        return (
            <TouchableOpacity
                onPress={() => handleDelete(id)}
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

    const renderBudgetCard = (budget) => {
        const pct = budget.allocatedAmount > 0 ? Math.min((budget.spent / budget.allocatedAmount) * 100, 100) : 0;
        const over = budget.spent > budget.allocatedAmount;
        const warn = pct >= 80 && !over;
        const barColor = over ? '#ef4444' : warn ? '#f59e0b' : budget.categoryColor || COLORS.primary;
        const remaining = budget.allocatedAmount - budget.spent;

        return (
            <Animated.View key={budget._id} entering={ZoomIn.springify().damping(50).mass(0.9)} exiting={ZoomOut.duration(100)}>
                <Swipeable
                    renderRightActions={(prog, drag) => renderRightActions(prog, drag, budget._id)}
                    friction={1}
                    overshootRight={false}
                    containerStyle={{ marginBottom: spacing.sm }}
                >
                    <View style={[styles.budgetCard, { backgroundColor: COLORS.surface, marginBottom: 0 }]}>
                        <View style={styles.budgetCardTop}>
                            <View style={[styles.budgetIcon, { backgroundColor: (budget.categoryColor || '#E91E8C') + '20' }]}>
                                <Feather name={budget.categoryIcon || 'pie-chart'} size={18} color={budget.categoryColor || '#E91E8C'} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.budgetCat, { color: COLORS.text }]}>{budget.category}</Text>
                                <Text style={[styles.budgetSub, { color: over ? '#ef4444' : warn ? '#f59e0b' : COLORS.textMuted }]}>
                                    {over ? `Over by ${formatCurrency(Math.abs(remaining), userInfo?.currency)}` : `${formatCurrency(remaining, userInfo?.currency)} left`}
                                </Text>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                                <Text style={[styles.budgetAmt, { color: COLORS.text }]}>{formatCurrency(budget.allocatedAmount, userInfo?.currency)}</Text>
                                <Text style={[styles.budgetSpent, { color: COLORS.textMuted }]}>Spent: {formatCurrency(budget.spent, userInfo?.currency)}</Text>
                            </View>
                        </View>

                {/* Progress Bar */}
                <View style={styles.barBg}>
                    <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: barColor }]} />
                </View>
                <View style={styles.barLabels}>
                    <Text style={[styles.barPct, { color: barColor }]}>{Math.round(pct)}%</Text>
                    {over && <Text style={[styles.overTag, { color: '#ef4444', backgroundColor: '#ef444415' }]}>Over Budget</Text>}
                    {warn && <Text style={[styles.overTag, { color: '#f59e0b', backgroundColor: '#f59e0b15' }]}>Almost Full</Text>}
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
                    <Text style={styles.headerTitle}>Budget</Text>
                    <Text style={[styles.headerSub, { color: COLORS.textMuted }]}>Monthly spending limits</Text>
                </View>
                <TouchableOpacity style={[styles.addBtn, { backgroundColor: COLORS.primary }]} onPress={() => setModalVisible(true)}>
                    <Feather name="plus" size={20} color="#fff" />
                </TouchableOpacity>
            </View>

            {/* Month Picker */}
            <View style={[styles.monthRow, { backgroundColor: COLORS.surface }]}>
                <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.monthArrow}>
                    <Feather name="chevron-left" size={20} color={COLORS.text} />
                </TouchableOpacity>
                <Text style={[styles.monthLabel, { color: COLORS.text }]}>{monthLabel}</Text>
                <TouchableOpacity onPress={() => changeMonth(1)} style={styles.monthArrow}>
                    <Feather name="chevron-right" size={20} color={COLORS.text} />
                </TouchableOpacity>
            </View>

            {loading ? (
                <View style={styles.content}>
                    <Skeleton width={180} height={16} style={{ marginBottom: spacing.md, marginTop: spacing.md }} />
                    {[1, 2, 3].map(i => (
                        <View key={i} style={[styles.budgetCard, { backgroundColor: COLORS.surface, elevation: 0, shadowOpacity: 0, borderWidth: 1, borderColor: COLORS.border }]} pointerEvents="none">
                            <View style={styles.budgetCardTop}>
                                <Skeleton width={42} height={42} borderRadius={21} style={{ marginRight: spacing.md }} />
                                <View style={{ flex: 1 }}>
                                    <Skeleton width={110} height={16} style={{ marginBottom: 6 }} />
                                    <Skeleton width={80} height={12} />
                                </View>
                                <View style={{ alignItems: 'flex-end', marginLeft: spacing.sm }}>
                                    <Skeleton width={80} height={16} style={{ marginBottom: 6 }} />
                                    <Skeleton width={50} height={12} />
                                </View>
                            </View>
                            <View style={{ marginTop: spacing.md }}>
                                <Skeleton width="100%" height={8} borderRadius={4} />
                            </View>
                        </View>
                    ))}
                </View>
            ) : (
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.primary} />}
                    contentContainerStyle={styles.content}
                >
                    {budgets.length === 0 ? (
                        <View style={styles.empty}>
                            <Text style={styles.emptyEmoji}>📊</Text>
                            <Text style={[styles.emptyTitle, { color: COLORS.text }]}>No Budgets Set</Text>
                            <Text style={[styles.emptyText, { color: COLORS.textMuted }]}>Tap + to set a monthly budget limit for any category.</Text>
                        </View>
                    ) : (
                        <>
                            {/* Overall Budget */}
                            {overallBudget && (
                                <View>
                                    <Text style={[styles.groupTitle, { color: COLORS.textMuted }]}>OVERALL MONTHLY LIMIT</Text>
                                    {renderBudgetCard(overallBudget)}
                                </View>
                            )}

                            {/* Category Budgets */}
                            {categoryBudgets.length > 0 && (
                                <View>
                                    <Text style={[styles.groupTitle, { color: COLORS.textMuted }]}>BY CATEGORY</Text>
                                    {categoryBudgets.map(renderBudgetCard)}
                                </View>
                            )}
                        </>
                    )}
                </ScrollView>
            )}

            {/* Add Budget Modal */}
            <BottomSheetModal visible={modalVisible} onClose={() => setModalVisible(false)}>
                <View style={styles.sheetHandle} />
                <Text style={[styles.sheetTitle, { color: COLORS.text }]}>Set Budget</Text>

                {/* Category Selection */}
                <Text style={[styles.label, { color: COLORS.textMuted }]}>CATEGORY</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: spacing.sm }}>
                    {PRESET_CATS.map(cat => {
                        const selected = !useCustom && form.category === cat.label;
                        return (
                            <TouchableOpacity key={cat.label} onPress={() => { setUseCustom(false); setForm(f => ({ ...f, category: cat.label, categoryIcon: cat.icon, categoryColor: cat.color })); }}
                                style={[styles.catChip, { backgroundColor: selected ? cat.color : COLORS.background, borderColor: selected ? cat.color : COLORS.border }]}>
                                <Feather name={cat.icon} size={14} color={selected ? '#fff' : cat.color} />
                                <Text style={{ color: selected ? '#fff' : COLORS.text, fontSize: 12, fontWeight: '600' }}>{cat.label}</Text>
                            </TouchableOpacity>
                        );
                    })}
                    <TouchableOpacity onPress={() => setUseCustom(true)}
                        style={[styles.catChip, { backgroundColor: useCustom ? COLORS.primary : COLORS.background, borderColor: useCustom ? COLORS.primary : COLORS.border }]}>
                        <Feather name="edit-2" size={14} color={useCustom ? '#fff' : COLORS.textMuted} />
                        <Text style={{ color: useCustom ? '#fff' : COLORS.text, fontSize: 12, fontWeight: '600' }}>Custom</Text>
                    </TouchableOpacity>
                </ScrollView>

                {/* Custom Category Input */}
                {useCustom && (
                    <TextInput style={[styles.input, { backgroundColor: COLORS.background, color: COLORS.text, borderColor: COLORS.border }]}
                        placeholder="Category name..." placeholderTextColor={COLORS.textMuted}
                        value={form.customCategory} onChangeText={v => setForm(f => ({ ...f, customCategory: v }))} />
                )}

                {/* Budget Amount */}
                <Text style={[styles.label, { color: COLORS.textMuted }]}>MONTHLY LIMIT (₱)</Text>
                <TextInput style={[styles.input, { backgroundColor: COLORS.background, color: COLORS.text, borderColor: COLORS.border }]}
                    placeholder="e.g. 5000" placeholderTextColor={COLORS.textMuted} keyboardType="decimal-pad"
                    value={form.allocatedAmount} onChangeText={v => setForm(f => ({ ...f, allocatedAmount: v }))} />

                <TouchableOpacity onPress={handleSave} disabled={saving}
                    style={[styles.saveBtn, { backgroundColor: COLORS.primary }]}>
                    {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save Budget</Text>}
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
    monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: spacing.lg, marginBottom: spacing.md, borderRadius: radius.xl, paddingVertical: 10, paddingHorizontal: spacing.md },
    monthArrow: { padding: 4 },
    monthLabel: { fontWeight: '800', fontSize: 16 },
    content: { paddingHorizontal: spacing.lg, paddingBottom: 120 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    empty: { alignItems: 'center', paddingTop: 80 },
    emptyEmoji: { fontSize: 52, marginBottom: 12 },
    emptyTitle: { fontSize: 18, fontWeight: '800', marginBottom: 6 },
    emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
    groupTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 8, marginTop: spacing.md },
    // Budget Card
    budgetCard: { borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm },
    budgetCardTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: spacing.sm },
    budgetIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
    budgetCat: { fontWeight: '700', fontSize: 15 },
    budgetSub: { fontSize: 12, marginTop: 1 },
    budgetAmt: { fontWeight: '800', fontSize: 14 },
    budgetSpent: { fontSize: 11, marginTop: 1 },
    hiddenDeleteBtn: { width: 80, height: '100%', borderRadius: radius.lg, justifyContent: 'center', alignItems: 'center', marginLeft: 12, elevation: 1 },
    barBg: { height: 8, backgroundColor: COLORS.border, borderRadius: 4, overflow: 'hidden' },
    barFill: { height: '100%', borderRadius: 4 },
    barLabels: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
    barPct: { fontSize: 11, fontWeight: '700' },
    overTag: { fontSize: 10, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
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
