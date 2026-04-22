import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
    View, Text, ScrollView, StyleSheet, Image,
    TouchableOpacity, RefreshControl, ActivityIndicator, Animated,
    Modal, TouchableWithoutFeedback
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { Feather, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { getTransactionSummary, getTransactions, getSavingsGoals, getDebts } from '../../api/api';
import { spacing, radius, typography, shadow, colors } from '../../theme/colors';
import CustomAlertModal from '../../components/CustomAlertModal';
import Skeleton from '../../components/Skeleton';
import { connectSocket, disconnectSocket, getSocket } from '../../utils/socket';
import { useWalletMode } from '../../../App';

const otterIcon = require('../../../assets/icon/welcomeOtter.png');

const formatCurrency = (amount, currency = 'PHP') =>
    new Intl.NumberFormat('en-PH', { style: 'currency', currency }).format(amount);

const formatDateTime = (dateString) => {
    if (!dateString) return '';
    return new Intl.DateTimeFormat('en-US', {
        month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit',
    }).format(new Date(dateString));
};

const FALLBACK_ICONS = {
    'Salary': 'briefcase', 'Freelance': 'code', 'Investment': 'trending-up', 'Gift': 'gift',
    'Food': 'coffee', 'Transport': 'truck', 'Shopping': 'shopping-cart', 'Bills': 'file-text',
    'Health': 'heart', 'Entertainment': 'tv', 'Other': 'tag', 'Savings': 'piggy-bank-outline'
};

const IconRenderer = ({ name, size, color }) => {
    if (!name) return <Feather name="circle" size={size} color={color} />;

    // Support for Material Icons
    if (name.startsWith('material:') || name === 'piggy-bank' || name === 'piggy-bank-outline') {
        const iconName = name.replace('material:', '') || 'piggy-bank';
        return <MaterialCommunityIcons name={iconName} size={size} color={color} />;
    }

    // Support for Ionicons (often used for outlines)
    if (name.includes('-outline') || name.includes('-sharp')) {
        return <Ionicons name={name} size={size} color={color} />;
    }

    return <Feather name={name} size={size} color={color} />;
};

const getIconName = (tx) => {
    const cat = (tx.category || '').toLowerCase();
    if (cat === 'savings' || cat === 'savings interest' || cat === 'savings balance') return 'piggy-bank';
    if (cat === 'shopping') return 'shopping-cart';
    return tx.categoryIcon || FALLBACK_ICONS[tx.category] || FALLBACK_ICONS[tx.category.charAt(0).toUpperCase() + tx.category.slice(1).toLowerCase()] || 'circle';
};
const getIconColor = (tx, COLORS) => {
    const cat = (tx.category || '').toLowerCase();
    if (cat === 'shopping') return '#E91E8C';
    return tx.categoryColor || (tx.type === 'income' ? COLORS.income : COLORS.expense);
};

export default function HomeScreen({ navigation }) {
    const { userInfo, userToken, logout } = useAuth();
    const { COLORS, toggleTheme, isDarkMode } = useTheme();
    const { setIsSavingsMode } = useWalletMode();
    // Security context is used by Settings screen — lock state managed globally
    const [savingsTotalSaved, setSavingsTotalSaved] = React.useState(0);
    const [debtStats, setDebtStats] = React.useState({ iOwe: 0, owedToMe: 0 });
    const [summary, setSummary] = useState({ totalIncome: 0, totalExpenses: 0, balance: 0, incomeDist: [], expenseDist: [] });
    const [recent, setRecent] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [logoutModalVisible, setLogoutModalVisible] = useState(false);
    const [dateRange, setDateRange] = useState('Week');

    // Transaction Details Modal State
    const [selectedTx, setSelectedTx] = useState(null);
    const [txModalVisible, setTxModalVisible] = useState(false);

    const statsTitle = dateRange === 'Day' ? 'Today' : (dateRange === 'Week' ? 'This Week' : 'This Month');

    // Dynamically calculate which bar should be highlighted active based on time
    const currentHour = new Date().getHours();
    let dayActiveIndex = 4; // default late night 12A
    if (currentHour < 10) dayActiveIndex = 0;      // 8A
    else if (currentHour < 14) dayActiveIndex = 1; // 12P
    else if (currentHour < 18) dayActiveIndex = 2; // 4P
    else if (currentHour < 22) dayActiveIndex = 3; // 8P

    const currentDayOfWeek = new Date().getDay(); // 0(Sun) - 6(Sat)

    const chartConfig = {
        Day: {
            label: "TODAY'S ACTIVITY",
            income: summary.incomeDist || [0, 0, 0, 0, 0],
            expense: summary.expenseDist || [0, 0, 0, 0, 0],
            labels: ['8A', '12P', '4P', '8P', '12A'],
            activeIndex: dayActiveIndex
        },
        Week: {
            label: "LAST 7 DAYS",
            income: summary.incomeDist || [0, 0, 0, 0, 0, 0, 0],
            expense: summary.expenseDist || [0, 0, 0, 0, 0, 0, 0],
            labels: ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
            activeIndex: currentDayOfWeek
        },
        Month: {
            label: "THIS MONTH",
            income: summary.incomeDist || [0, 0, 0, 0],
            expense: summary.expenseDist || [0, 0, 0, 0],
            labels: ['W1', 'W2', 'W3', 'W4'],
            activeIndex: 2
        }
    };
    const currentChart = chartConfig[dateRange];

    const load = useCallback(async () => {
        // Guard: don't attempt authenticated requests without a valid token
        if (!userToken) return;
        try {
            const [s, t, savRes, debtsRes] = await Promise.all([
                getTransactionSummary({ range: dateRange.toLowerCase() }),
                getTransactions({ limit: 10, page: 1 }),
                getSavingsGoals().catch(() => ({ totalSaved: 0 })),
                getDebts().catch(() => ([])),
            ]);
            setSavingsTotalSaved(savRes?.totalSaved || 0);

            // Calculate debt totals for real net worth
            let iOwe = 0;
            let owedToMe = 0;
            if (Array.isArray(debtsRes)) {
                debtsRes.forEach(d => {
                    if (d.status === 'settled') return;
                    const amount = d.totalOwed ?? ((d.amount || 0) - (d.amountPaid || 0));
                    if (d.direction === 'owed_by_me') iOwe += amount;
                    if (d.direction === 'owed_to_me') owedToMe += amount;
                });
            }
            setDebtStats({ iOwe, owedToMe });

            setSummary(s);
            const txs = t.transactions || [];
            setRecent(txs);
            setPage(2);
            setHasMore(txs.length >= 10);
        } catch (err) {
            console.warn('[Home] Load error:', err.message);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [dateRange, userToken]);

    const fetchMore = async () => {
        if (!hasMore || loadingMore) return;
        setLoadingMore(true);
        try {
            const res = await getTransactions({ limit: 10, page });
            const incoming = res.transactions || [];
            if (incoming.length > 0) {
                setRecent(prev => {
                    const merged = [...prev, ...incoming];
                    const seen = new Set();
                    return merged.filter(item => {
                        if (seen.has(item._id)) return false;
                        seen.add(item._id);
                        return true;
                    });
                });
                setPage(p => p + 1);
            }
            if (incoming.length < 10) setHasMore(false);
        } catch (err) {
            console.warn('[Home] fetchMore error:', err.message);
        } finally {
            setLoadingMore(false);
        }
    };

    const handleActivityScroll = ({ nativeEvent }) => {
        const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
        const isNearEnd = layoutMeasurement.height + contentOffset.y >= contentSize.height - 40;
        if (isNearEnd) fetchMore();
    };

    const isToday = (dateString) => {
        if (!dateString) return false;
        const d = new Date(dateString);
        const today = new Date();
        return d.getDate() === today.getDate() &&
            d.getMonth() === today.getMonth() &&
            d.getFullYear() === today.getFullYear();
    };

    const todaysRecent = recent.filter(tx => isToday(tx.date || tx.createdAt));

    useEffect(() => { load(); }, [dateRange, userToken, load]);

    // ── Socket.IO — real-time transaction updates ──────────────────────────────
    useEffect(() => {
        if (!userInfo?._id) return;

        connectSocket(userInfo._id);
        const socket = getSocket();

        const refreshSummary = () => {
            getTransactionSummary({ range: dateRange.toLowerCase() })
                .then(s => setSummary(s))
                .catch(() => { });
        };

        const handleNewTransaction = (tx) => {
            setRecent(prev => {
                const merged = [tx, ...prev];
                const seen = new Set();
                return merged.filter(item => {
                    if (seen.has(item._id)) return false;
                    seen.add(item._id);
                    return true;
                });
            });
            refreshSummary();
        };

        const handleUpdateTransaction = (tx) => {
            setRecent(prev => prev.map(t => t._id === tx._id ? tx : t));
            refreshSummary();
        };

        const handleDeleteTransaction = (data) => {
            setRecent(prev => prev.filter(t => t._id !== data._id));
            refreshSummary();
        };

        const handleSavingsChange = () => {
            getSavingsGoals().then(res => setSavingsTotalSaved(res.totalSaved || 0)).catch(() => { });
            refreshSummary();
        };

        socket.on('new_transaction', handleNewTransaction);
        socket.on('update_transaction', handleUpdateTransaction);
        socket.on('delete_transaction', handleDeleteTransaction);
        socket.on('new_savings_goal', handleSavingsChange);
        socket.on('update_savings_goal', handleSavingsChange);
        socket.on('delete_savings_goal', handleSavingsChange);
        socket.on('new_savings_transfer', handleSavingsChange);

        return () => {
            socket.off('new_transaction', handleNewTransaction);
            socket.off('update_transaction', handleUpdateTransaction);
            socket.off('delete_transaction', handleDeleteTransaction);
            socket.off('new_savings_goal', handleSavingsChange);
            socket.off('update_savings_goal', handleSavingsChange);
            socket.off('delete_savings_goal', handleSavingsChange);
            socket.off('new_savings_transfer', handleSavingsChange);
        };
    }, [userInfo?._id, dateRange]);

    const onRefresh = () => { setRefreshing(true); load(); };

    // Calculations for Net Worth Tracker
    const walletBal = summary.netBalance ?? summary.balance ?? 0;
    const savingBal = savingsTotalSaved ?? 0;
    const netDebt = debtStats.owedToMe - debtStats.iOwe;
    const netWorth = walletBal + savingBal + netDebt;

    // Otter mood based on net worth
    const otterMood = () => {
        if (netWorth > 0) return { mood: "You're looking great! Keep tracking exactly where your money goes.", color: COLORS.income };
        if (netWorth === 0) return { mood: "Neutral net worth today. Start building your savings and track your expenses!", color: COLORS.warning };
        return { mood: "Nasa red ang net worth mo. Try to hold off on non-essentials and pay down debts!", color: COLORS.expense };
    };
    const mood = otterMood();

    if (loading) {
        return (
            <SafeAreaView style={[styles.safe, { backgroundColor: COLORS.background }]}>
                {/* Header Skeleton */}
                <View style={styles.header}>
                    <View>
                        <Skeleton width={100} height={10} style={{ marginBottom: 6 }} />
                        <Skeleton width={140} height={20} />
                    </View>
                    <View style={{ flexDirection: 'row' }}>
                        <Skeleton width={36} height={36} borderRadius={18} style={{ marginRight: spacing.sm }} />
                        <Skeleton width={36} height={36} borderRadius={18} style={{ marginRight: spacing.sm }} />
                        <Skeleton width={36} height={36} borderRadius={18} />
                    </View>
                </View>

                {/* Balance Card Skeleton */}
                <View style={[styles.balanceCard, { backgroundColor: COLORS.surface, elevation: 0, shadowOpacity: 0, borderColor: COLORS.border, borderWidth: 1 }]}>
                    <View style={styles.messageRow}>
                        <Skeleton width={90} height={90} borderRadius={45} style={{ marginRight: spacing.sm, marginTop: 5 }} />
                        <View style={{ flex: 1, marginTop: 15 }}>
                            <Skeleton width="100%" height={60} borderRadius={radius.lg} />
                        </View>
                    </View>
                    <Skeleton width={90} height={10} style={{ marginBottom: 8 }} />
                    <Skeleton width={180} height={36} borderRadius={8} />
                </View>

                {/* Analytics Row Skeleton */}
                <View style={styles.analyticsRow}>
                    <View style={[styles.analyticsCard, { backgroundColor: COLORS.surface, marginRight: spacing.sm }]}>
                        <Skeleton width={100} height={10} style={{ marginBottom: spacing.md }} />
                        <Skeleton width="100%" height={90} borderRadius={8} />
                    </View>
                    <View style={[styles.analyticsCard, { backgroundColor: COLORS.surface, marginLeft: spacing.sm }]}>
                        <Skeleton width={60} height={14} style={{ marginBottom: spacing.md }} />
                        <Skeleton width={110} height={14} style={{ marginBottom: 8 }} />
                        <Skeleton width={80} height={14} style={{ marginBottom: 'auto' }} />
                        <Skeleton width="100%" height={24} borderRadius={15} style={{ marginTop: 'auto' }} />
                    </View>
                </View>

                {/* Recent Activity Skeleton */}
                <View style={styles.section}>
                    <Skeleton width={130} height={18} style={{ marginBottom: spacing.sm }} />
                    {[1, 2, 3].map(i => (
                        <View key={i} style={[styles.txRow, { backgroundColor: COLORS.surface }]}>
                            <Skeleton width={36} height={36} borderRadius={18} style={{ marginRight: spacing.md }} />
                            <View style={{ flex: 1 }}>
                                <Skeleton width={110} height={14} style={{ marginBottom: 6 }} />
                                <Skeleton width={60} height={10} />
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                                <Skeleton width={70} height={14} style={{ marginBottom: 6 }} />
                                <Skeleton width={40} height={10} />
                            </View>
                        </View>
                    ))}
                </View>
            </SafeAreaView>
        );
    }

    const currentDate = new Intl.DateTimeFormat('en-US', {
        weekday: 'long', month: 'long', day: 'numeric'
    }).format(new Date());

    return (
        <SafeAreaView style={[styles.safe, { backgroundColor: COLORS.background }]}>
            <ScrollView
                style={styles.scroll}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
                showsVerticalScrollIndicator={false}
            >
                {/* Header */}
                <View style={styles.header}>
                    <View>
                        <Text style={[styles.greeting, { color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 11, marginBottom: 2 }]}>{currentDate}</Text>
                        <Text style={[styles.userName, { color: COLORS.text }]}>Good day, <Text style={{ fontWeight: 'bold', color: COLORS.primary }}>{userInfo?.name?.split(' ')[0] || 'User'} 👋</Text></Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <TouchableOpacity
                            onPress={() => setIsSavingsMode(true)}
                            style={[{ marginRight: spacing.sm, padding: 8, backgroundColor: COLORS.primary + '20', borderRadius: 12 }]}
                        >

                            <MaterialCommunityIcons name="piggy-bank-outline" size={20} color={COLORS.primary} />
                        </TouchableOpacity>
                        {/* <TouchableOpacity onPress={toggleTheme} style={{ marginRight: spacing.sm, padding: 8, backgroundColor: COLORS.surface, borderRadius: 12 }}>
                            <Feather name={isDarkMode ? 'sun' : 'moon'} size={22} color={COLORS.textMuted} />
                        </TouchableOpacity> */}
                        <TouchableOpacity
                            onPress={() => navigation.navigate('Settings')}
                            style={{ padding: 8, backgroundColor: COLORS.surface, borderRadius: 12 }}
                        >
                            <Feather name="settings" size={22} color={COLORS.textMuted} />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Otter Mascot + Balance Card */}
                <LinearGradient colors={['#E91E8C', '#B0146A', '#7b0f4e']} style={styles.balanceCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                    <View style={styles.messageRow}>
                        <Image source={otterIcon} style={styles.mascotAvatar} resizeMode="contain" />

                        <View style={styles.speechContainer}>
                            <View style={styles.triangle} />
                            <View style={styles.speechBubble}>
                                <Text style={[styles.mascotName, { color: '#B0146A' }]}>Otter</Text>
                                <Text style={styles.mascotMoodText}>{mood.mood}</Text>
                            </View>
                        </View>
                    </View>

                    <Text style={styles.balanceLabel}>TOTAL NET WORTH</Text>
                    <Text style={styles.balanceAmount}>{formatCurrency(netWorth, userInfo?.currency)}</Text>

                    {/* Net Worth Breakdown */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.2)' }}>
                        <View>
                            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '700' }}>WALLET</Text>
                            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>{formatCurrency(walletBal, userInfo?.currency)}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-start', paddingLeft: 12 }}>
                            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '700' }}>SAVINGS</Text>
                            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>+{formatCurrency(savingBal, userInfo?.currency)}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end', marginLeft: 'auto' }}>
                            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '700' }}>NET DEBT</Text>
                            <Text style={{ color: netDebt < 0 ? '#fca5a5' : (netDebt > 0 ? '#86efac' : '#fff'), fontSize: 13, fontWeight: '800' }}>
                                {netDebt > 0 ? '+' : ''}{formatCurrency(netDebt, userInfo?.currency)}
                            </Text>
                        </View>
                    </View>
                </LinearGradient>

                {/* Analytics Row */}
                <View style={styles.analyticsRow}>
                    {/* Left: Dynamic Chart */}
                    <View style={[styles.analyticsCard, { backgroundColor: COLORS.surface, marginRight: spacing.sm }]}>
                        <Text style={[styles.analyticsLabel, { color: COLORS.textMuted }]}>{currentChart.label}</Text>
                        <View style={styles.chartContainer}>
                            {currentChart.labels.map((L, i) => {
                                const isActive = i === currentChart.activeIndex;
                                const inc = currentChart.income[i];
                                const exp = currentChart.expense[i];

                                return (
                                    <View key={i} style={styles.chartCol}>
                                        <View style={styles.chartBarGroup}>
                                            <View style={[styles.chartBar, { height: `${inc}%`, backgroundColor: COLORS.income, opacity: inc > 0 ? (isActive ? 1 : 0.6) : 0.1 }]} />
                                            <View style={[styles.chartBar, { height: `${exp}%`, backgroundColor: COLORS.expense, opacity: exp > 0 ? (isActive ? 1 : 0.6) : 0.1 }]} />
                                        </View>
                                        <Text style={[styles.chartDay, { color: COLORS.textMuted, fontWeight: isActive ? '800' : '500' }]}>
                                            {L}
                                        </Text>
                                    </View>
                                );
                            })}
                        </View>
                    </View>

                    {/* Right: Today Summary */}
                    <View style={[styles.analyticsCard, { backgroundColor: COLORS.surface, marginLeft: spacing.sm }]}>
                        <Text style={[styles.analyticsTitle, { color: COLORS.text }]}>{statsTitle}</Text>

                        <View style={styles.statsContainer}>
                            <View style={styles.statRow}>
                                <Feather name="trending-up" size={14} color={COLORS.income} style={styles.statIcon} />
                                <Text style={[styles.statValue, { color: COLORS.income }]}>{formatCurrency(summary.totalIncome, userInfo?.currency)}</Text>
                            </View>
                            <View style={styles.statRow}>
                                <Feather name="trending-down" size={14} color={COLORS.expense} style={styles.statIcon} />
                                <Text style={[styles.statValue, { color: COLORS.text }]}>{formatCurrency(summary.totalExpenses, userInfo?.currency)}</Text>
                            </View>
                        </View>
                        <View style={styles.filterPills}>
                            {['Day', 'Week', 'Month'].map((filter) => {
                                const isActive = dateRange === filter;
                                return (
                                    <TouchableOpacity
                                        key={filter}
                                        onPress={() => setDateRange(filter)}
                                        activeOpacity={0.7}
                                        style={[styles.filterPill, isActive && { backgroundColor: COLORS.primary }]}
                                    >
                                        <Text style={[styles.filterPillText, { color: isActive ? '#fff' : COLORS.textMuted }]}>{filter}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </View>
                </View>

                {/* Quick Actions — GCash Style */}
                <View style={[styles.quickActionsCard, { backgroundColor: COLORS.surface }]}>
                    <Text style={[styles.quickActionsTitle, { color: COLORS.textMuted }]}>QUICK ACTIONS</Text>
                    <View style={styles.quickActionsRow}>
                        {[
                            { icon: 'shopping-cart', label: 'Shopping', color: '#E91E8C', onPress: () => navigation.navigate('ShoppingHome') },
                            { icon: 'credit-card', label: 'Debts', color: '#f59e0b', onPress: () => navigation.navigate('DebtScreen') },
                            { icon: 'maximize', label: 'Scanner', color: '#8b5cf6', onPress: () => navigation.navigate('BarcodeScanner') },
                            { icon: 'repeat', label: 'Bills', color: '#22c55e', onPress: () => navigation.navigate('Bills') },
                        ].map((action) => (
                            <TouchableOpacity
                                key={action.label}
                                style={styles.quickActionItem}
                                onPress={action.onPress}
                                activeOpacity={0.75}
                            >
                                <View style={[styles.quickActionIcon, { backgroundColor: action.color + '18' }]}>
                                    <Feather name={action.icon} size={20} color={action.color} />
                                </View>
                                <Text style={[styles.quickActionLabel, { color: COLORS.textMuted }]}>{action.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* Recent Transactions */}
                <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: COLORS.text }]}>Recent Activity</Text>
                    {todaysRecent.length === 0 ? (
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyEmoji}>📭</Text>
                            <Text style={[styles.emptyText, { color: COLORS.textMuted }]}>No transactions today. Start tracking!</Text>
                        </View>
                    ) : (
                        <ScrollView
                            style={styles.activityScroll}
                            nestedScrollEnabled={true}
                            showsVerticalScrollIndicator={false}
                            onScroll={handleActivityScroll}
                            scrollEventThrottle={200}
                        >
                            {todaysRecent.map((tx) => (
                                <TouchableOpacity
                                    key={tx._id}
                                    style={[styles.txRow, { backgroundColor: COLORS.surface }]}
                                    activeOpacity={0.7}
                                    onPress={() => {
                                        setSelectedTx(tx);
                                        setTxModalVisible(true);
                                    }}
                                >
                                    <View style={[styles.txIconWrapper, { backgroundColor: getIconColor(tx, COLORS) + '20' }]}>
                                        <IconRenderer name={getIconName(tx)} size={16} color={getIconColor(tx, COLORS)} />
                                    </View>
                                    <View style={styles.txInfo}>
                                        <Text style={[styles.txCategory, { color: COLORS.text }]}>{tx.category}</Text>
                                        <Text style={[styles.txDesc, { color: COLORS.textMuted }]} numberOfLines={1}>
                                            " {tx.description || tx.note || '—'} "
                                        </Text>
                                    </View>
                                    <View style={styles.txRight}>
                                        <Text style={[styles.txAmount, { color: tx.type === 'income' ? COLORS.income : COLORS.expense }]}>
                                            {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount, userInfo?.currency)}
                                        </Text>
                                        <View style={{ alignItems: 'flex-end' }}>
                                            <Text style={[styles.txDate, { color: COLORS.textMuted }]}>
                                                {new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(tx.date || tx.createdAt))}
                                            </Text>
                                        </View>
                                    </View>
                                </TouchableOpacity>
                            ))}
                            {loadingMore && (
                                <View style={styles.loadMoreIndicator}>
                                    <ActivityIndicator size="small" color={COLORS.primary} />
                                </View>
                            )}
                        </ScrollView>
                    )}

                    {recent.length > 0 && (
                        <TouchableOpacity
                            style={styles.viewAllBtn}
                            onPress={() => navigation.navigate('Transactions')}
                        >
                            <Text style={[styles.viewAllText, { color: COLORS.primary }]}>View All History</Text>
                            <Feather name="arrow-right" size={14} color={COLORS.primary} />
                        </TouchableOpacity>
                    )}
                </View>
                <View style={{ height: 100 }} />
            </ScrollView>

            <CustomAlertModal
                visible={logoutModalVisible}
                onClose={() => setLogoutModalVisible(false)}
                onConfirm={() => {
                    setLogoutModalVisible(false);
                    logout();
                }}
                title="Sign Out"
                message="Are you sure you want to sign out of your OTTER account?"
                type="confirm"
                confirmText="Sign Out"
            />

            {/* Transaction Detail Modal */}
            <Modal
                visible={txModalVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setTxModalVisible(false)}
            >
                <TouchableWithoutFeedback onPress={() => setTxModalVisible(false)}>
                    <View style={styles.modalOverlay}>
                        <TouchableWithoutFeedback>
                            <View style={[styles.modalSheet, { backgroundColor: COLORS.surface }]}>
                                {selectedTx && (
                                    <>
                                        <View style={styles.modalHeaderRow}>
                                            <Text style={[styles.modalTitle, { color: COLORS.text }]}>Transaction Details</Text>
                                            <TouchableOpacity onPress={() => setTxModalVisible(false)}>
                                                <Feather name="x" size={24} color={COLORS.textMuted} />
                                            </TouchableOpacity>
                                        </View>

                                        <View style={styles.modalContent}>
                                            <View style={[styles.modalIconHero, { backgroundColor: getIconColor(selectedTx, COLORS) + '20' }]}>
                                                <IconRenderer name={getIconName(selectedTx)} size={32} color={getIconColor(selectedTx, COLORS)} />
                                            </View>

                                            <Text style={[styles.modalAmount, { color: selectedTx.type === 'income' ? COLORS.income : COLORS.expense }]}>
                                                {selectedTx.type === 'income' ? '+' : '-'}{formatCurrency(selectedTx.amount, userInfo?.currency)}
                                            </Text>
                                            <Text style={[styles.modalCatName, { color: COLORS.text }]}>{selectedTx.category}</Text>

                                            <View style={[styles.modalDetailBox, { backgroundColor: COLORS.background, borderColor: COLORS.border }]}>
                                                <View style={styles.modalDetailRow}>
                                                    <Text style={[styles.modalDetailLabel, { color: COLORS.textMuted }]}>Type</Text>
                                                    <Text style={[styles.modalDetailValue, { color: COLORS.text, textTransform: 'capitalize' }]}>{selectedTx.type}</Text>
                                                </View>
                                                <View style={styles.modalDetailRow}>
                                                    <Text style={[styles.modalDetailLabel, { color: COLORS.textMuted }]}>Date</Text>
                                                    <Text style={[styles.modalDetailValue, { color: COLORS.text }]}>{formatDateTime(selectedTx.date || selectedTx.createdAt)}</Text>
                                                </View>
                                                {(selectedTx.description || selectedTx.note) ? (
                                                    <View style={[styles.modalDetailRow, { borderBottomWidth: 0, paddingBottom: 0, marginTop: 4, flexDirection: 'column', alignItems: 'flex-start' }]}>
                                                        <Text style={[styles.modalDetailLabel, { color: COLORS.textMuted, marginBottom: 4 }]}>Note</Text>
                                                        <Text style={[styles.modalDetailValue, { color: COLORS.text }]}>{selectedTx.description || selectedTx.note}</Text>
                                                    </View>
                                                ) : null}
                                            </View>
                                        </View>
                                    </>
                                )}
                            </View>
                        </TouchableWithoutFeedback>
                    </View>
                </TouchableWithoutFeedback>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1 },
    scroll: { flex: 1 },
    loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, paddingBottom: spacing.sm },
    greeting: { ...typography.bodyMuted },
    userName: { ...typography.h2 },
    balanceCard: {
        marginHorizontal: spacing.lg, borderRadius: radius.xl, padding: spacing.lg,
        paddingBottom: spacing.xl, marginBottom: spacing.md, ...shadow.glow,
    },
    messageRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.lg },
    mascotAvatar: { width: 100, height: 100, marginRight: 5, marginTop: 5 },
    speechContainer: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', marginTop: 20 },
    triangle: {
        width: 0, height: 0, backgroundColor: 'transparent', borderStyle: 'solid',
        borderTopWidth: 8, borderBottomWidth: 8, borderRightWidth: 10,
        borderTopColor: 'transparent', borderBottomColor: 'transparent',
        borderRightColor: '#ffffff',
        marginTop: 18
    },
    speechBubble: {
        flex: 1, backgroundColor: '#fff', borderRadius: radius.lg,
        padding: spacing.md,
    },
    mascotName: { fontWeight: '800', fontSize: 13, marginBottom: 2 },
    mascotMoodText: { color: '#333', fontSize: 13, lineHeight: 18 },
    balanceLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600', letterSpacing: 1 },
    balanceAmount: { color: '#fff', fontSize: 36, fontWeight: '800', marginTop: 4 },
    analyticsRow: { flexDirection: 'row', paddingHorizontal: spacing.lg, marginBottom: spacing.md, height: 170 },
    quickActionsCard: { marginHorizontal: spacing.lg, marginBottom: spacing.lg, borderRadius: radius.xl, padding: spacing.md, paddingVertical: 14 },
    quickActionsTitle: { fontSize: 10, fontWeight: '900', letterSpacing: 1.2, marginBottom: 12 },
    quickActionsRow: { flexDirection: 'row', justifyContent: 'space-around' },
    quickActionItem: { alignItems: 'center', gap: 6 },
    quickActionIcon: { width: 52, height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center' },
    quickActionLabel: { fontSize: 11, fontWeight: '700' },
    analyticsCard: {
        flex: 1, backgroundColor: '#fff', borderRadius: radius.xl, padding: spacing.md,
        borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)',
        elevation: 0, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }
    },
    analyticsLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5, marginBottom: spacing.md },
    analyticsTitle: { fontSize: 16, fontWeight: '800', marginBottom: spacing.md },
    chartContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', flex: 1, paddingTop: 10, paddingHorizontal: 4 },
    chartCol: { alignItems: 'center', flex: 1 },
    chartBarGroup: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 3 },
    chartBar: { width: 5, borderRadius: 2.5 },
    chartDay: { fontSize: 9, marginTop: 8 },
    statsContainer: { flex: 1, justifyContent: 'center', gap: 6 },
    statRow: { flexDirection: 'row', alignItems: 'center' },
    statIcon: { marginRight: 6 },
    statValue: { fontSize: 13, fontWeight: '800' },
    filterPills: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: 'transparent', marginTop: 'auto' },
    filterPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
    filterPillText: { fontSize: 9, fontWeight: '700' },
    section: { paddingHorizontal: spacing.lg, marginBottom: spacing.lg },
    sectionTitle: { ...typography.h3, marginBottom: spacing.sm },
    emptyState: { alignItems: 'center', paddingVertical: spacing.xl },
    emptyEmoji: { fontSize: 40, marginBottom: spacing.sm },
    emptyText: { ...typography.bodyMuted },
    txRow: {
        flexDirection: 'row', alignItems: 'center',
        borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.xs,
    },
    txIconWrapper: {
        width: 36, height: 36, borderRadius: 18,
        justifyContent: 'center', alignItems: 'center',
        marginRight: spacing.md
    },
    txInfo: { flex: 1 },
    txRight: { alignItems: 'flex-end' },
    txCategory: { ...typography.body, fontWeight: '600' },
    txDesc: { ...typography.caption, fontStyle: 'italic' },
    txAmount: { fontSize: 15, fontWeight: '800' },
    txDate: { fontSize: 10, marginTop: 2 },
    txBalance: { fontSize: 9, fontWeight: '700', marginTop: 1, opacity: 0.8 },
    activityScroll: { maxHeight: 280 },
    viewAllBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        gap: 8,
        marginTop: 4
    },
    viewAllText: {
        fontSize: 13,
        fontWeight: '800'
    },
    loadMoreIndicator: { paddingVertical: 12, alignItems: 'center' },

    // Modal Styles
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalSheet: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: 40 },
    modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    modalTitle: { fontSize: 18, fontWeight: '800' },
    modalContent: { alignItems: 'center', marginTop: spacing.md },
    modalIconHero: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', marginBottom: spacing.md },
    modalAmount: { fontSize: 32, fontWeight: '800', marginBottom: 4 },
    modalCatName: { fontSize: 16, fontWeight: '600', marginBottom: spacing.lg },
    modalDetailBox: { width: '100%', borderWidth: 1, borderRadius: radius.lg, padding: spacing.md },
    modalDetailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
    modalDetailLabel: { fontSize: 13, fontWeight: '600' },
    modalDetailValue: { fontSize: 14, fontWeight: '500' },
});
