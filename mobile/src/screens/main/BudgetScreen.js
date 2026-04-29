import React, { useState, useCallback, useEffect } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView,
    ActivityIndicator, RefreshControl, TouchableWithoutFeedback,
    TextInput, Alert, KeyboardAvoidingView, Platform, Image, LayoutAnimation, UIManager
} from 'react-native';
import Animated, { ZoomIn, ZoomOut, FadeIn, FadeOut, LinearTransition, Easing } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons, Ionicons, FontAwesome5 } from '@expo/vector-icons';
import BottomSheetModal from '../../components/BottomSheetModal';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { getBudgets, upsertBudget, updateBudget, deleteBudget, getCategories, createCategory, getFriends } from '../../api/api';
import { API_BASE } from '../../context/AuthContext';
import { spacing, radius } from '../../theme/colors';
import Skeleton from '../../components/Skeleton';
import CustomAlertModal from '../../components/CustomAlertModal';
import SwipeableRow from '../../components/SwipeableRow';
import { useFinanceStore } from '../../store/financeStore';
import { formatCurrency, IconRenderer, FALLBACK_ICONS } from '../../utils/formatters';



const ICONS = FALLBACK_ICONS
const COLORS_PALETTE = [
    '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e', '#10b981', '#14b8a6', '#06b6d4',
    '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e',
    '#64748b', '#78716c'
];

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

const PRESET_CATEGORIES = [
    { label: 'Overall', icon: 'pie-chart', color: '#E91E8C' },
    { label: 'Food', icon: 'coffee', color: '#f59e0b' },
    { label: 'Transport', icon: 'truck', color: '#3b82f6' },
    { label: 'Shopping', icon: 'shopping-bag', color: '#ec4899' },
    { label: 'Bills', icon: 'file-text', color: '#ef4444' },
    { label: 'Health', icon: 'heart', color: '#22c55e' },
    { label: 'Entertainment', icon: 'tv', color: '#8b5cf6' },
];

export default function BudgetScreen() {
    const COLORS = useTheme(state => state.COLORS);
    const { userInfo } = useAuth();
    const styles = getStyles(COLORS);

    const now = new Date();
    const [selectedDate, setSelectedDate] = useState(now.toISOString());
    const [selectedPeriod, setSelectedPeriod] = useState('monthly'); // 'daily', 'weekly', 'monthly'

    const [budgets, setBudgets] = useState([]);
    const [remoteCats, setRemoteCats] = useState([]);
    const [totalSpent, setTotalSpent] = useState(0);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [friends, setFriends] = useState([]);
    const [modalVisible, setModalVisible] = useState(false);
    const [saving, setSaving] = useState(false);
    const [showAllCats, setShowAllCats] = useState(false);
    const [showAllIcons, setShowAllIcons] = useState(false);
    const [form, setForm] = useState({
        period: 'monthly',
        category: 'Overall',
        categoryIcon: 'pie-chart',
        categoryColor: '#E91E8C',
        allocatedAmount: '',
        reminderAmount: '',
        customCategory: '',
        customIcon: 'tag',
        customColor: '#6b7280',
        subBudgets: [], // Array of { tag: '', amount: '', icon: '' }
        isShared: false,
        participantIds: []
    });
    const [subIconIndex, setSubIconIndex] = useState(null);
    const [useCustom, setUseCustom] = useState(false);
    const [alertConfig, setAlertConfig] = useState({ visible: false, title: '', message: '', type: 'info', onConfirm: null });
    const [expandedBudgetIds, setExpandedBudgetIds] = useState([]);
    const [editingBudget, setEditingBudget] = useState(null);

    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
        UIManager.setLayoutAnimationEnabledExperimental(true);
    }

    const toggleBudget = (id) => {
        setExpandedBudgetIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const load = useCallback(async () => {
        try {
            const [bRes, cRes] = await Promise.all([
                getBudgets(selectedDate, selectedPeriod),
                getCategories()
            ]);
            setBudgets(bRes.budgets || []);
            setTotalSpent(bRes.totalSpent || 0);
            if (cRes?.categories) {
                const expCats = cRes.categories.filter(c => c.type === 'expense')
                    .map(c => ({ label: c.name, icon: c.icon, color: c.color }));
                setRemoteCats(expCats);
            }

            const fRes = await getFriends();
            setFriends(Array.isArray(fRes) ? fRes : (fRes.friends || []));

            // Show all budgets by default
            if (bRes.budgets) {
                setExpandedBudgetIds(bRes.budgets.map(b => b._id));
            }
        } catch (e) {
            console.warn(e.message);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [selectedDate, selectedPeriod]);

    // Merge budgets
    const processedBudgets = budgets.map(b => ({
        ...b,
        spent: b.spent || 0
    }));

    useEffect(() => {
        load();

        const { getSocket } = require('../../utils/socket');
        const socket = getSocket();

        if (socket) {
            const handleRefresh = () => {
                load();
            };

            socket.on('new_transaction', handleRefresh);
            socket.on('delete_transaction', handleRefresh);

            return () => {
                socket.off('new_transaction', handleRefresh);
                socket.off('delete_transaction', handleRefresh);
            };
        }
    }, [load]);

    const handleSave = async () => {
        const cat = useCustom ? form.customCategory.trim() : form.category;
        if (!cat) {
            return setAlertConfig({ visible: true, title: 'Missing Category', message: 'Please select a category.', type: 'warning' });
        }

        if (!form.allocatedAmount || isNaN(parseFloat(form.allocatedAmount))) {
            return setAlertConfig({ visible: true, title: 'Missing Amount', message: 'Please enter a valid budget amount.', type: 'warning' });
        }

        const limit = parseFloat(form.allocatedAmount);
        const reminder = form.reminderAmount ? parseFloat(form.reminderAmount) : 0;

        if (reminder > limit) {
            return setAlertConfig({ visible: true, title: 'Invalid Reminder', message: 'Reminder cannot be higher than your budget limit!', type: 'warning' });
        }

        const cleanedSubBudgets = form.subBudgets
            .filter(sub => sub.tag.trim() && sub.amount && !isNaN(parseFloat(sub.amount)))
            .map(sub => ({ tag: sub.tag.trim(), amount: parseFloat(sub.amount), icon: sub.icon || 'tag' }));

        const budgetData = {
            period: form.period,
            category: cat,
            categoryIcon: useCustom ? form.customIcon : form.categoryIcon,
            categoryColor: useCustom ? form.customColor : form.categoryColor,
            allocatedAmount: limit,
            reminderAmount: reminder,
            subBudgets: cleanedSubBudgets,
            isShared: form.isShared,
            participantIds: form.participantIds
        };

        setSaving(true);
        try {
            if (editingBudget) {
                // EDIT path: PATCH directly by _id to avoid duplicate key error
                await updateBudget(editingBudget._id, {
                    categoryIcon: useCustom ? form.customIcon : form.categoryIcon,
                    categoryColor: useCustom ? form.customColor : form.categoryColor,
                    allocatedAmount: limit,
                    reminderAmount: reminder,
                    subBudgets: cleanedSubBudgets,
                    isShared: form.isShared,
                    participantIds: form.participantIds,
                });
            } else {
                // CREATE path: upsert by category+period
                if (useCustom) {
                    const catName = form.customCategory.trim();
                    const exists = remoteCats.find(c => c.label.toLowerCase() === catName.toLowerCase());
                    if (!exists) {
                        try {
                            await createCategory({ name: catName, icon: form.customIcon, color: form.customColor, type: 'expense' });
                        } catch (catErr) {
                            console.error('[Budget] Auto-category creation failed:', catErr);
                        }
                    }
                }
                await upsertBudget(budgetData);
            }
            setModalVisible(false);
            setEditingBudget(null);
            setForm({
                period: selectedPeriod,
                category: 'Overall',
                categoryIcon: 'pie-chart',
                categoryColor: '#E91E8C',
                allocatedAmount: '',
                reminderAmount: '',
                customCategory: '',
                customIcon: 'tag',
                customColor: '#6b7280',
                subBudgets: [],
                isShared: false,
                participantIds: []
            });
            setUseCustom(false);
            load();
        } catch (e) {
            setAlertConfig({ visible: true, title: 'Error', message: 'Failed to save budget. Please check your connection.', type: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = (id) => {
        setAlertConfig({
            visible: true, title: 'Remove Budget?', message: 'This budget will be deleted.', type: 'confirm', confirmText: 'Delete',
            onConfirm: async () => {
                setAlertConfig(p => ({ ...p, visible: false }));
                try {
                    await deleteBudget(id);
                    setBudgets(prev => prev.filter(b => b._id !== id));
                } catch (err) {
                    setAlertConfig({ visible: true, title: 'Error', message: 'Failed to delete budget.', type: 'error' });
                }
            }
        });
    };

    const openEditBudget = (budget) => {
        const isCustom = !PRESET_CATEGORIES.some(c => c.label === budget.category);
        setEditingBudget(budget);
        setForm({
            period: budget.period || selectedPeriod,
            category: budget.category,
            categoryIcon: budget.categoryIcon || 'tag',
            categoryColor: budget.categoryColor || COLORS.primary,
            allocatedAmount: String(budget.allocatedAmount || ''),
            reminderAmount: budget.reminderAmount ? String(budget.reminderAmount) : '',
            customCategory: isCustom ? budget.category : '',
            customIcon: isCustom ? (budget.categoryIcon || 'tag') : 'tag',
            customColor: isCustom ? (budget.categoryColor || '#6b7280') : '#6b7280',
            subBudgets: (budget.subBudgets || []).map(s => ({ tag: s.tag, amount: String(s.amount), icon: s.icon || 'tag' })),
            isShared: budget.isShared || false,
            participantIds: (budget.participants || []).map(p => typeof p.user === 'object' ? p.user._id : p.user),
        });
        setUseCustom(isCustom);
        setModalVisible(true);
    };

    // --- Date Navigation ---
    const changeDate = (dir) => {
        const d = new Date(selectedDate);
        if (selectedPeriod === 'daily') {
            d.setDate(d.getDate() + dir);
        } else if (selectedPeriod === 'weekly') {
            d.setDate(d.getDate() + (dir * 7));
        } else {
            d.setMonth(d.getMonth() + dir);
        }
        setSelectedDate(d.toISOString());
    };

    const getDateLabel = () => {
        const d = new Date(selectedDate);
        if (selectedPeriod === 'daily') {
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        } else if (selectedPeriod === 'weekly') {
            const day = d.getDay();
            const diff = d.getDate() - day + (day === 0 ? -6 : 1);
            const start = new Date(d); start.setDate(diff);
            const end = new Date(start); end.setDate(start.getDate() + 6);
            return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
        } else {
            return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        }
    };

    const PRESET_CATS = [
        { label: 'Overall', icon: 'pie-chart', color: '#E91E8C' },
        ...(remoteCats.length > 0 ? remoteCats : PRESET_CATEGORIES.slice(1))
    ];

    const overallBudget = processedBudgets.find(b => b.category === 'Overall');
    const categoryBudgets = processedBudgets.filter(b => b.category !== 'Overall');



    const renderSubBudgets = (budget) => {
        if (!budget.subBudgets || budget.subBudgets.length === 0) return null;

        return (
            <View style={styles.subBudgetsContainer}>
                {budget.subBudgets.map((sub, index) => {
                    const pct = sub.amount > 0 ? Math.min((sub.spent / sub.amount) * 100, 100) : 0;
                    const over = sub.spent > sub.amount;
                    return (
                        <View key={index} style={styles.subBudgetRow}>
                            <View style={[styles.subBudgetIconBg, { backgroundColor: COLORS.surfaceAlt }]}>
                                <IconRenderer name={sub.icon || 'tag'} size={12} color={COLORS.primary} />
                            </View>
                            <Text style={[styles.subBudgetTag, { color: COLORS.textMuted }]}>{sub.tag}</Text>
                            <View style={{ flex: 1 }} />
                            <Text style={[styles.subBudgetAmt, { color: over ? '#ef4444' : COLORS.textMuted }]}>
                                {formatCurrency(sub.spent, userInfo?.currency)} <Text style={{ fontSize: 10 }}> / {formatCurrency(sub.amount, userInfo?.currency)}</Text>
                            </Text>
                        </View>
                    );
                })}
            </View>
        );
    }

    const renderParticipants = (budget) => {
        if (!budget.isShared || !budget.participants || budget.participants.length === 0) return null;

        return (
            <View style={styles.participantsContainer}>
                {budget.participants.map((p, idx) => {
                    const participantUser = typeof p.user === 'object' ? p.user : { _id: p.user };
                    // If it's just ID, we might not have the avatar yet unless enriched by backend
                    // But our backend 'getBudgets' should populate 'participants.user'
                    const avatar = participantUser.avatar || participantUser.avatarUrl;
                    const name = participantUser.name || 'User';

                    return (
                        <View key={idx} style={[styles.participantMiniAvatar, { marginLeft: idx === 0 ? 0 : -8, zIndex: 10 - idx, borderColor: COLORS.surface }]}>
                            {participantUser.avatar || participantUser.avatarUrl ? (
                                <Image
                                    source={{
                                        uri: (participantUser.avatar || participantUser.avatarUrl).startsWith('http')
                                            ? (participantUser.avatar || participantUser.avatarUrl)
                                            : `${API_BASE.replace('/api', '')}/${participantUser.avatar || participantUser.avatarUrl}`
                                    }}
                                    style={styles.miniAvatarImg}
                                    resizeMode="cover"
                                />
                            ) : (
                                <View style={[styles.miniAvatarFallback, { backgroundColor: COLORS.surfaceAlt }]}>
                                    <Feather name="user" size={10} color={COLORS.textMuted} />
                                </View>
                            )}
                        </View>
                    );
                })}
                <Text style={{ fontSize: 10, color: COLORS.textMuted, marginLeft: 6 }}>
                    Shared with {budget.participants.length} friend{budget.participants.length > 1 ? 's' : ''}
                </Text>
            </View>
        );
    };

    const renderBudgetCard = (budget) => {
        const pct = budget.allocatedAmount > 0 ? Math.min((budget.spent / budget.allocatedAmount) * 100, 100) : 0;
        const over = budget.spent > budget.allocatedAmount;
        const warn = pct >= 80 && !over;
        const barColor = over ? '#ef4444' : warn ? '#f59e0b' : budget.categoryColor || COLORS.primary;
        const remaining = budget.allocatedAmount - budget.spent;
        const isExpanded = expandedBudgetIds.includes(budget._id);

        return (
            <SwipeableRow
                key={budget._id}
                entering={ZoomIn.springify().damping(50).mass(0.9)}
                exiting={ZoomOut.duration(100)}
                leftAction={{
                    color: COLORS.primary,
                    icon: 'edit-2',
                    label: 'Edit',
                    onPress: () => openEditBudget(budget),
                }}
                rightAction={{
                    color: '#ef4444',
                    icon: 'trash-2',
                    label: 'Delete',
                    onPress: () => handleDelete(budget._id),
                }}
                containerStyle={{ marginBottom: spacing.sm }}
            >
                <AnimatedTouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => toggleBudget(budget._id)}
                    layout={LinearTransition.duration(200).easing(Easing.bezier(0.4, 0, 0.2, 1))}
                    style={[styles.budgetCard, { backgroundColor: COLORS.surface, marginBottom: 0 }]}
                >
                        <View style={styles.budgetCardTop}>
                            <View style={[styles.budgetIcon, { backgroundColor: (budget.categoryColor || '#E91E8C') + '20' }]}>
                                <IconRenderer name={budget.categoryIcon || 'pie-chart'} size={18} color={budget.categoryColor || '#E91E8C'} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.budgetCat, { color: COLORS.text }]}>{budget.category}</Text>
                                <Text style={[styles.budgetSub, { color: over ? '#ef4444' : warn ? '#f59e0b' : COLORS.textMuted }]}>
                                    {over ? `Over by ${formatCurrency(Math.abs(remaining), userInfo?.currency)}` : `${formatCurrency(remaining, userInfo?.currency)} left`}
                                </Text>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                                    <Text style={[styles.budgetAmt, { color: COLORS.text }]}>{formatCurrency(budget.allocatedAmount, userInfo?.currency)}</Text>
                                    <Feather
                                        name={isExpanded ? "chevron-up" : "chevron-down"}
                                        size={14}
                                        color={COLORS.textMuted}
                                        style={{ marginLeft: 6 }}
                                    />
                                </View>
                                <Text style={[styles.budgetSpent, { color: COLORS.textMuted }]}>Spent: {formatCurrency(budget.spent, userInfo?.currency)}</Text>
                            </View>
                        </View>

                        <View style={styles.barBg}>
                            <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: barColor }]} />
                        </View>
                        <View style={styles.barLabels}>
                            <Text style={[styles.barPct, { color: barColor }]}>{Math.round(pct)}%</Text>
                            {over && <Text style={[styles.overTag, { color: '#ef4444', backgroundColor: '#ef444415' }]}>Over Budget</Text>}
                            {warn && <Text style={[styles.overTag, { color: '#f59e0b', backgroundColor: '#f59e0b15' }]}>Almost Full</Text>}
                        </View>

                        {/* Sub-Budgets and Participants rendering with Reanimated */}
                        {isExpanded && (
                            <Animated.View entering={FadeIn.duration(400)} exiting={FadeOut.duration(400)}>
                                {renderSubBudgets(budget)}
                                {renderParticipants(budget)}
                            </Animated.View>
                        )}
                    </AnimatedTouchableOpacity>
            </SwipeableRow>
        );
    };

    return (
        <SafeAreaView style={styles.safe}>
            {/* Header */}
            <View style={styles.header}>
                <View>
                    <Text style={styles.headerTitle}>Budget</Text>
                    <Text style={[styles.headerSub, { color: COLORS.textMuted }]}>Spending limits</Text>
                </View>
                <TouchableOpacity style={[styles.addBtn, { backgroundColor: COLORS.primary }]} onPress={() => {
                    setEditingBudget(null);
                    setForm({ period: selectedPeriod, category: 'Overall', categoryIcon: 'pie-chart', categoryColor: '#E91E8C', allocatedAmount: '', reminderAmount: '', customCategory: '', customIcon: 'tag', customColor: '#6b7280', subBudgets: [], isShared: false, participantIds: [] });
                    setUseCustom(false);
                    setModalVisible(true);
                }}>
                    <Feather name="plus" size={20} color="#fff" />
                </TouchableOpacity>
            </View>

            {/* Period Selector Tabs */}
            <View style={[styles.periodTabs, { backgroundColor: COLORS.surface }]}>
                {['daily', 'weekly', 'monthly'].map(p => (
                    <TouchableOpacity key={p} style={[styles.periodTab, selectedPeriod === p && { backgroundColor: COLORS.primary }]} onPress={() => setSelectedPeriod(p)}>
                        <Text style={[styles.periodTabText, { color: selectedPeriod === p ? '#fff' : COLORS.textMuted }]}>
                            {p.charAt(0).toUpperCase() + p.slice(1)}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Date Picker */}
            <View style={styles.monthRow}>
                <TouchableOpacity onPress={() => changeDate(-1)} style={styles.monthArrow}>
                    <Feather name="chevron-left" size={20} color={COLORS.text} />
                </TouchableOpacity>
                <Text style={[styles.monthLabel, { color: COLORS.text }]}>{getDateLabel()}</Text>
                <TouchableOpacity onPress={() => changeDate(1)} style={styles.monthArrow}>
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
                    {processedBudgets.length === 0 ? (
                        <View style={styles.empty}>
                            <Text style={styles.emptyEmoji}>📊</Text>
                            <Text style={[styles.emptyTitle, { color: COLORS.text }]}>No Budgets Set</Text>
                            <Text style={[styles.emptyText, { color: COLORS.textMuted }]}>Tap + to set a {selectedPeriod} budget limit.</Text>
                        </View>
                    ) : (
                        <>
                            {overallBudget && (
                                <View>
                                    <Text style={[styles.groupTitle, { color: COLORS.textMuted }]}>OVERALL LIMIT</Text>
                                    {renderBudgetCard(overallBudget)}
                                </View>
                            )}

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
            <BottomSheetModal visible={modalVisible} onClose={() => { setModalVisible(false); setEditingBudget(null); }}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 60} style={{ flexShrink: 1 }}>
                    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ flexShrink: 1 }} contentContainerStyle={{ paddingBottom: 250 }}>
                        <Text style={[styles.sheetTitle, { color: COLORS.text }]}>{editingBudget ? 'Edit Budget' : 'Set Budget'}</Text>

                        {/* Period Selection */}
                        <Text style={[styles.label, { color: COLORS.textMuted, marginBottom: 8 }]}>
                            BUDGET PERIOD {editingBudget && <Text style={{ fontSize: 9, fontStyle: 'italic', textTransform: 'none' }}>(Cannot be changed during edit)</Text>}
                        </Text>
                        <View style={[styles.modalPeriodTabs, { opacity: editingBudget ? 0.6 : 1 }]}>
                            {['daily', 'weekly', 'monthly'].map(p => (
                                <TouchableOpacity 
                                    key={p} 
                                    disabled={!!editingBudget}
                                    style={[styles.modalPeriodTab, form.period === p && { backgroundColor: COLORS.primary, borderColor: COLORS.primary }]} 
                                    onPress={() => setForm({ ...form, period: p })}
                                >
                                    <Text style={[styles.modalPeriodText, { color: form.period === p ? '#fff' : COLORS.textMuted }]}>
                                        {p.charAt(0).toUpperCase() + p.slice(1)}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* Category Selection */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, marginTop: spacing.sm }}>
                            <Text style={[styles.label, { color: COLORS.textMuted, marginBottom: 0 }]}>CATEGORY</Text>
                            {PRESET_CATS.length > 4 && (
                                <TouchableOpacity onPress={() => setShowAllCats(!showAllCats)}>
                                    <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.primary }}>{showAllCats ? 'Show Less' : 'See All'}</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        {showAllCats ? (
                            <View style={styles.catGrid}>
                                {PRESET_CATS.map(cat => {
                                    const selected = !useCustom && form.category === cat.label;
                                    return (
                                        <TouchableOpacity key={cat.label} onPress={() => { setUseCustom(false); setForm(f => ({ ...f, category: cat.label, categoryIcon: cat.icon, categoryColor: cat.color })); }}
                                            style={[styles.catChipGrid, { backgroundColor: selected ? cat.color : COLORS.background, borderColor: selected ? cat.color : COLORS.border }]}>
                                            <IconRenderer name={cat.icon} size={14} color={selected ? '#fff' : cat.color} />
                                            <Text style={{ color: selected ? '#fff' : COLORS.text, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>{cat.label}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                                <TouchableOpacity onPress={() => setUseCustom(true)} style={[styles.catChipGrid, { backgroundColor: useCustom ? COLORS.primary : COLORS.background, borderColor: useCustom ? COLORS.primary : COLORS.border }]}>
                                    <Feather name="edit-2" size={14} color={useCustom ? '#fff' : COLORS.textMuted} />
                                    <Text style={{ color: useCustom ? '#fff' : COLORS.text, fontSize: 12, fontWeight: '600' }}>Custom</Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: spacing.sm }}>
                                {PRESET_CATS.map(cat => {
                                    const selected = !useCustom && form.category === cat.label;
                                    return (
                                        <TouchableOpacity key={cat.label} onPress={() => { setUseCustom(false); setForm(f => ({ ...f, category: cat.label, categoryIcon: cat.icon, categoryColor: cat.color })); }}
                                            style={[styles.catChip, { backgroundColor: selected ? cat.color : COLORS.background, borderColor: selected ? cat.color : COLORS.border }]}>
                                            <IconRenderer name={cat.icon} size={14} color={selected ? '#fff' : cat.color} />
                                            <Text style={{ color: selected ? '#fff' : COLORS.text, fontSize: 12, fontWeight: '600' }}>{cat.label}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                                <TouchableOpacity onPress={() => setUseCustom(true)} style={[styles.catChip, { backgroundColor: useCustom ? COLORS.primary : COLORS.background, borderColor: useCustom ? COLORS.primary : COLORS.border }]}>
                                    <Feather name="edit-2" size={14} color={useCustom ? '#fff' : COLORS.textMuted} />
                                    <Text style={{ color: useCustom ? '#fff' : COLORS.text, fontSize: 12, fontWeight: '600' }}>Custom</Text>
                                </TouchableOpacity>
                            </ScrollView>
                        )}

                        {useCustom && (
                            <View style={{ marginTop: spacing.sm }}>
                                <TextInput style={[styles.input, { backgroundColor: COLORS.background, color: COLORS.text, borderColor: COLORS.border }]} placeholder="Category name..." placeholderTextColor={COLORS.textMuted} value={form.customCategory} onChangeText={v => setForm(f => ({ ...f, customCategory: v }))} />
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md, marginBottom: 6 }}>
                                    <Text style={[styles.label, { color: COLORS.textMuted, marginBottom: 0 }]}>PICK ICON</Text>
                                    <TouchableOpacity onPress={() => setShowAllIcons(!showAllIcons)}>
                                        <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.primary }}>{showAllIcons ? 'Show Less' : 'See All'}</Text>
                                    </TouchableOpacity>
                                </View>
                                {showAllIcons ? (
                                    <View style={styles.iconGrid}>
                                        {ICONS.map(ix => (
                                            <TouchableOpacity key={ix} onPress={() => setForm(f => ({ ...f, customIcon: ix }))} style={[styles.iconBoxSmall, { backgroundColor: form.customIcon === ix ? COLORS.primary + '20' : COLORS.background, borderColor: form.customIcon === ix ? COLORS.primary : COLORS.border, width: '18%' }]}>
                                                <IconRenderer name={ix} size={18} color={form.customIcon === ix ? COLORS.primary : COLORS.textMuted} />
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                ) : (
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: spacing.sm }}>
                                        {ICONS.slice(0, 15).map(ix => (
                                            <TouchableOpacity key={ix} onPress={() => setForm(f => ({ ...f, customIcon: ix }))} style={[styles.iconBoxSmall, { backgroundColor: form.customIcon === ix ? COLORS.primary + '20' : COLORS.background, borderColor: form.customIcon === ix ? COLORS.primary : COLORS.border }]}>
                                                <IconRenderer name={ix} size={18} color={form.customIcon === ix ? COLORS.primary : COLORS.textMuted} />
                                            </TouchableOpacity>
                                        ))}
                                    </ScrollView>
                                )}
                                <Text style={[styles.label, { color: COLORS.textMuted, marginTop: spacing.sm }]}>PICK COLOR</Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: spacing.sm }}>
                                    {COLORS_PALETTE.map(cx => (
                                        <TouchableOpacity key={cx} onPress={() => setForm(f => ({ ...f, customColor: cx }))} style={[styles.colorCircleSmall, { backgroundColor: cx }, form.customColor === cx && { borderWidth: 3, borderColor: COLORS.text }]} />
                                    ))}
                                </ScrollView>
                            </View>
                        )}

                        <Text style={[styles.label, { color: COLORS.textMuted, marginTop: spacing.md }]}>LIMIT AMOUNT (₱)</Text>
                        <TextInput style={[styles.input, { backgroundColor: COLORS.background, color: COLORS.text, borderColor: COLORS.border }]} placeholder="e.g. 5000" placeholderTextColor={COLORS.textMuted} keyboardType="decimal-pad" value={form.allocatedAmount} onChangeText={v => setForm(f => ({ ...f, allocatedAmount: v }))} />

                        {/* Sub-Budgets UI */}
                        <View style={{ marginTop: spacing.md }}>
                            <Text style={[styles.label, { color: COLORS.textMuted }]}>GROUP TAGS / SUB-BUDGETS (OPTIONAL)</Text>
                            <Text style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 8, marginTop: -4 }}>Track specific items inside this category (e.g., Jeep, Tricycle)</Text>

                            {form.subBudgets.map((sub, index) => (
                                <View key={index} style={{ marginBottom: 8 }}>
                                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                                        <TouchableOpacity
                                            style={[styles.input, { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', paddingVertical: 0, paddingHorizontal: 0, marginBottom: 0, backgroundColor: COLORS.background, borderColor: COLORS.border }]}
                                            onPress={() => setSubIconIndex(subIconIndex === index ? null : index)}
                                        >
                                            <IconRenderer name={sub.icon || 'tag'} size={18} color={COLORS.primary} />
                                        </TouchableOpacity>
                                        <TextInput
                                            style={[styles.input, { flex: 1.5, backgroundColor: COLORS.background, color: COLORS.text, borderColor: COLORS.border, paddingVertical: 8, height: 44, marginBottom: 0 }]}
                                            placeholder="Tag name"
                                            placeholderTextColor={COLORS.textMuted}
                                            value={sub.tag}
                                            onChangeText={v => {
                                                const newSub = [...form.subBudgets];
                                                newSub[index].tag = v;
                                                setForm(f => ({ ...f, subBudgets: newSub }));
                                            }}
                                        />
                                        <TextInput
                                            style={[styles.input, { flex: 1, backgroundColor: COLORS.background, color: COLORS.text, borderColor: COLORS.border, paddingVertical: 8, height: 44, marginBottom: 0 }]}
                                            placeholder="₱ Amount"
                                            placeholderTextColor={COLORS.textMuted}
                                            keyboardType="decimal-pad"
                                            value={sub.amount}
                                            onChangeText={v => {
                                                const newSub = [...form.subBudgets];
                                                newSub[index].amount = v;
                                                setForm(f => ({ ...f, subBudgets: newSub }));
                                            }}
                                        />
                                        <TouchableOpacity
                                            onPress={() => {
                                                const newSub = [...form.subBudgets];
                                                newSub.splice(index, 1);
                                                setForm(f => ({ ...f, subBudgets: newSub }));
                                            }}
                                            style={{ padding: 8 }}>
                                            <Feather name="x" size={20} color="#ef4444" />
                                        </TouchableOpacity>
                                    </View>
                                    {subIconIndex === index && (
                                        <View style={{ marginTop: 8 }}>
                                            <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.textMuted, marginBottom: 6, marginLeft: 4 }}>
                                                ICONS FROM YOUR CATEGORIES
                                            </Text>
                                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4, paddingHorizontal: 4 }}>
                                                {/* Unique icons from remoteCats */}
                                                {[...new Set(remoteCats.map(c => c.icon))].map(ix => (
                                                    <TouchableOpacity key={ix} onPress={() => {
                                                        const newSub = [...form.subBudgets];
                                                        newSub[index].icon = ix;
                                                        // AUTO-NAME: find category name for this icon
                                                        const matchedCat = remoteCats.find(c => c.icon === ix);
                                                        if (matchedCat && !newSub[index].tag) {
                                                            newSub[index].tag = matchedCat.label;
                                                        }
                                                        setForm(f => ({ ...f, subBudgets: newSub }));
                                                        setSubIconIndex(null);
                                                    }} style={[styles.iconBoxSmall, { backgroundColor: sub.icon === ix ? COLORS.primary + '20' : COLORS.background, borderColor: sub.icon === ix ? COLORS.primary : COLORS.border, width: 36, height: 36 }]}>
                                                        <IconRenderer name={ix} size={14} color={sub.icon === ix ? COLORS.primary : COLORS.textMuted} />
                                                    </TouchableOpacity>
                                                ))}
                                                {/* If remoteCats is empty or small, show some standard ones too */}
                                                {remoteCats.length < 5 && ICONS.slice(0, 10).map(ix => (
                                                    <TouchableOpacity key={ix} onPress={() => {
                                                        const newSub = [...form.subBudgets];
                                                        newSub[index].icon = ix;
                                                        setForm(f => ({ ...f, subBudgets: newSub }));
                                                        setSubIconIndex(null);
                                                    }} style={[styles.iconBoxSmall, { backgroundColor: sub.icon === ix ? COLORS.primary + '20' : COLORS.background, borderColor: sub.icon === ix ? COLORS.primary : COLORS.border, width: 36, height: 36 }]}>
                                                        <IconRenderer name={ix} size={14} color={sub.icon === ix ? COLORS.primary : COLORS.textMuted} />
                                                    </TouchableOpacity>
                                                ))}
                                            </ScrollView>
                                        </View>
                                    )}
                                </View>
                            ))}

                            <TouchableOpacity
                                onPress={() => setForm(f => ({ ...f, subBudgets: [...f.subBudgets, { tag: '', amount: '', icon: 'tag' }] }))}
                                style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, paddingVertical: 6 }}>
                                <Feather name="plus-circle" size={16} color={COLORS.primary} />
                                <Text style={{ color: COLORS.primary, fontWeight: '700', fontSize: 13, marginLeft: 6 }}>Add Tag Rule</Text>
                            </TouchableOpacity>
                        </View>

                        <Text style={[styles.label, { color: COLORS.textMuted, marginTop: spacing.md }]}>SET REMINDER AT (₱)</Text>
                        <TextInput style={[styles.input, { backgroundColor: COLORS.background, color: COLORS.text, borderColor: COLORS.border }]} placeholder="e.g. 4000 (Optional)" placeholderTextColor={COLORS.textMuted} keyboardType="decimal-pad" value={form.reminderAmount} onChangeText={v => setForm(f => ({ ...f, reminderAmount: v }))} />
                        <Text style={{ fontSize: 10, color: COLORS.textMuted, marginTop: -2 }}>We'll notify you when you hit this amount.</Text>

                        {/* Sharing Section */}
                        <View style={{ marginTop: spacing.md }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                <View>
                                    <Text style={[styles.label, { color: COLORS.textMuted, marginTop: 0 }]}>SHARED BUDGET</Text>
                                    <Text style={{ fontSize: 10, color: COLORS.textMuted }}>Collaborate on spending with friends.</Text>
                                </View>
                                <TouchableOpacity
                                    onPress={() => setForm(f => ({ ...f, isShared: !f.isShared }))}
                                    style={[styles.toggleBtn, { backgroundColor: form.isShared ? COLORS.primary : COLORS.border }]}
                                >
                                    <View style={[styles.toggleCircle, { transform: [{ translateX: form.isShared ? 20 : 0 }], backgroundColor: '#fff' }]} />
                                </TouchableOpacity>
                            </View>

                            {form.isShared && friends.length > 0 && (
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
                                    {friends.map(friend => {
                                        const isSelected = form.participantIds.includes(friend._id);
                                        return (
                                            <TouchableOpacity
                                                key={friend._id}
                                                onPress={() => {
                                                    const newIds = isSelected
                                                        ? form.participantIds.filter(id => id !== friend._id)
                                                        : [...form.participantIds, friend._id];
                                                    setForm(f => ({ ...f, participantIds: newIds }));
                                                }}
                                                style={[styles.friendChip, {
                                                    backgroundColor: isSelected ? COLORS.primary + '15' : COLORS.background,
                                                    borderColor: isSelected ? COLORS.primary : COLORS.border
                                                }]}
                                            >
                                                <View style={styles.friendAvatar}>
                                                    {(friend.avatar || friend.avatarUrl) ? (
                                                        <Image
                                                            source={{
                                                                uri: (friend.avatar || friend.avatarUrl).startsWith('http')
                                                                    ? (friend.avatar || friend.avatarUrl)
                                                                    : `${API_BASE.replace('/api', '')}/${friend.avatar || friend.avatarUrl}`
                                                            }}
                                                            style={styles.avatarImg}
                                                            resizeMode="cover"
                                                        />
                                                    ) : (
                                                        <Feather name="user" size={14} color={isSelected ? COLORS.primary : COLORS.textMuted} />
                                                    )}
                                                </View>
                                                <Text style={{ fontSize: 12, fontWeight: '700', color: isSelected ? COLORS.primary : COLORS.text }}>{friend.name}</Text>
                                                {isSelected && <Feather name="check-circle" size={12} color={COLORS.primary} style={{ marginLeft: 4 }} />}
                                            </TouchableOpacity>
                                        );
                                    })}
                                </ScrollView>
                            )}

                            {form.isShared && friends.length === 0 && (
                                <Text style={{ fontSize: 11, color: '#ef4444', fontStyle: 'italic' }}>You don't have any friends to share with yet.</Text>
                            )}
                        </View>

                        <TouchableOpacity onPress={handleSave} disabled={saving} style={[styles.saveBtn, { backgroundColor: COLORS.primary }]}>
                            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>{editingBudget ? 'Update Budget' : 'Save Budget'}</Text>}
                        </TouchableOpacity>
                    </ScrollView>
                </KeyboardAvoidingView>
            </BottomSheetModal>

            <CustomAlertModal visible={alertConfig.visible} title={alertConfig.title} message={alertConfig.message} type={alertConfig.type} confirmText={alertConfig.confirmText} onConfirm={alertConfig.onConfirm} onClose={() => setAlertConfig(p => ({ ...p, visible: false }))} />
        </SafeAreaView>
    );
}

const getStyles = (COLORS) => StyleSheet.create({
    safe: { flex: 1, backgroundColor: COLORS.background },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, paddingBottom: spacing.sm },
    headerTitle: { fontSize: 24, fontWeight: '800', color: COLORS.text },
    headerSub: { fontSize: 13, marginTop: 2 },
    addBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
    periodTabs: { flexDirection: 'row', marginHorizontal: spacing.lg, borderRadius: radius.xl, padding: 4, marginBottom: spacing.md },
    periodTab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: radius.lg },
    periodTabText: { fontWeight: '700', fontSize: 14 },
    monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: spacing.lg, marginBottom: spacing.md, paddingHorizontal: 4 },
    monthArrow: { padding: 4 },
    monthLabel: { fontWeight: '800', fontSize: 16 },
    content: { paddingHorizontal: spacing.lg, paddingBottom: 120 },
    empty: { alignItems: 'center', paddingTop: 80 },
    emptyEmoji: { fontSize: 52, marginBottom: 12 },
    emptyTitle: { fontSize: 18, fontWeight: '800', marginBottom: 6 },
    emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
    groupTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 8, marginTop: spacing.md },
    budgetCard: { borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm },
    budgetCardTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: spacing.sm },
    budgetIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
    budgetCat: { fontWeight: '700', fontSize: 15 },
    budgetSub: { fontSize: 12, marginTop: 1 },
    budgetAmt: { fontWeight: '800', fontSize: 14 },
    budgetSpent: { fontSize: 11, marginTop: 1 },

    barBg: { height: 8, backgroundColor: COLORS.border, borderRadius: 4, overflow: 'hidden' },
    barFill: { height: '100%', borderRadius: 4 },
    barLabels: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
    barPct: { fontSize: 11, fontWeight: '700' },
    overTag: { fontSize: 10, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
    subBudgetsContainer: { marginTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 12, gap: 8 },
    subBudgetRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    subBudgetIconBg: { width: 24, height: 24, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
    subBudgetTag: { fontSize: 13, fontWeight: '600' },
    subBudgetAmt: { fontSize: 13, fontWeight: '800' },
    sheetTitle: { fontSize: 18, fontWeight: '800', marginBottom: spacing.md },
    label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6, marginTop: spacing.sm },
    modalPeriodTabs: { flexDirection: 'row', gap: 8, marginBottom: spacing.md },
    modalPeriodTab: { flex: 1, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: radius.lg, paddingVertical: 10, alignItems: 'center' },
    modalPeriodText: { fontWeight: '700', fontSize: 13 },
    input: { borderWidth: 1.5, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: 15, marginBottom: 4 },
    catChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5 },
    saveBtn: { paddingVertical: 16, borderRadius: radius.xl, alignItems: 'center', marginTop: spacing.lg },
    saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
    iconBoxSmall: { width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5 },
    colorCircleSmall: { width: 34, height: 34, borderRadius: 17 },
    catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.sm },
    catChipGrid: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, width: '31%' },
    iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.sm },
    toggleBtn: { width: 44, height: 24, borderRadius: 12, padding: 2, justifyContent: 'center' },
    toggleCircle: { width: 20, height: 20, borderRadius: 10 },
    friendChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, borderWidth: 1.5 },
    participantsContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 12 },
    participantMiniAvatar: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, overflow: 'hidden' },
    miniAvatarImg: { width: '100%', height: '100%' },
    miniAvatarFallback: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
    friendAvatar: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: 'rgba(0,0,0,0.05)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 8
    },
    avatarImg: { width: '100%', height: '100%', borderRadius: 12 },
});
