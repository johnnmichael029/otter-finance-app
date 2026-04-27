import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
    View, Text, ScrollView, StyleSheet, Image,
    TouchableOpacity, RefreshControl, ActivityIndicator, Animated,
    Modal, TouchableWithoutFeedback, BackHandler, ToastAndroid, Platform,
    LayoutAnimation, UIManager
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useSecurity } from '../../context/SecurityContext';
import { useFinanceStore } from '../../store/financeStore';
import { API_BASE } from '../../store/authStore';
import { Feather, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { getTransactionSummary, getTransactions, getSavingsGoals, getDebts, getNotifications, deleteTransaction, getFriendRequests, getGroupWallets } from '../../api/api';
import { spacing, radius, typography, shadow, colors } from '../../theme/colors';
import CustomAlertModal from '../../components/CustomAlertModal';
import Skeleton from '../../components/Skeleton';
import OnboardingTour from '../../components/OnboardingTour';
import { connectSocket, disconnectSocket, getSocket } from '../../utils/socket';
import { updateWidgetBalance } from '../../utils/widget';
import { PieChart } from 'react-native-chart-kit';
import Svg, { Circle } from 'react-native-svg';
import { formatCurrency, formatDateTime, getIconName, getIconColor, IconRenderer } from '../../utils/formatters';
import { triggerHaptic } from '../../utils/haptics';
import { checkAchievements } from '../../utils/achievementUtils';
import { calculateForecast } from '../../utils/forecastUtils';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

const otterIcon = require('../../../assets/icon/welcomeOtter.png');



export default function HomeScreen({ navigation }) {
    const userInfo = useAuth(state => state.userInfo);
    const userToken = useAuth(state => state.userToken);
    const logout = useAuth(state => state.logout);
    const hapticsEnabled = useAuth(state => state.hapticsEnabled);
    const COLORS = useTheme(state => state.COLORS);
    const toggleTheme = useTheme(state => state.toggleTheme);
    const isDarkMode = useTheme(state => state.isDarkMode);
    const setIsSavingsMode = useTheme(state => state.setIsSavingsMode);

    // ── UI State ──
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [logoutModalVisible, setLogoutModalVisible] = useState(false);
    const [dateRange, setDateRange] = useState('Week');
    const [lastBackPressed, setLastBackPressed] = useState(0);
    const [chartView, setChartView] = useState(0); // 0 = Bar, 1 = Expense, 2 = Income
    const [achievementModal, setAchievementModal] = useState({ visible: false, badge: null });
    const slideAnim = useRef(new Animated.Value(dateRange === 'Day' ? 0 : dateRange === 'Week' ? 1 : 2)).current;
    const statsSlideAnim = useRef(new Animated.Value(0)).current;
    const statsOpacityAnim = useRef(new Animated.Value(1)).current;
    const chartSlideAnim = useRef(new Animated.Value(0)).current;
    const chartOpacityAnim = useRef(new Animated.Value(1)).current;
    const dateRangeIndexRef = useRef(dateRange === 'Day' ? 0 : dateRange === 'Week' ? 1 : 2);

    const FILTER_ORDER = ['Day', 'Week', 'Month'];

    const switchDateRange = (filter) => {
        const currentIdx = dateRangeIndexRef.current;
        const nextIdx = FILTER_ORDER.indexOf(filter);
        if (currentIdx === nextIdx) return;

        const direction = nextIdx > currentIdx ? 1 : -1; // 1 = forward (up), -1 = backward (down)
        const SLIDE_DISTANCE = 28;

        // Trigger data update immediately so it happens WHILE sliding
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setDateRange(filter);
        dateRangeIndexRef.current = nextIdx;

        // Slide pill immediately
        Animated.spring(slideAnim, {
            toValue: nextIdx,
            useNativeDriver: true,
            bounciness: 4,
            speed: 12
        }).start();

        // Slide BOTH cards out simultaneously
        Animated.parallel([
            Animated.timing(statsSlideAnim, {
                toValue: -direction * SLIDE_DISTANCE,
                duration: 150,
                useNativeDriver: true,
            }),
            Animated.timing(statsOpacityAnim, {
                toValue: 0,
                duration: 120,
                useNativeDriver: true,
            }),
            Animated.timing(chartSlideAnim, {
                toValue: -direction * SLIDE_DISTANCE,
                duration: 150,
                useNativeDriver: true,
            }),
            Animated.timing(chartOpacityAnim, {
                toValue: 0,
                duration: 120,
                useNativeDriver: true,
            }),
        ]).start(() => {
            // Reset both to opposite side instantly
            statsSlideAnim.setValue(direction * SLIDE_DISTANCE);
            statsOpacityAnim.setValue(0);
            chartSlideAnim.setValue(direction * SLIDE_DISTANCE);
            chartOpacityAnim.setValue(0);

            // Slide both into center
            Animated.parallel([
                Animated.spring(statsSlideAnim, {
                    toValue: 0,
                    useNativeDriver: true,
                    bounciness: 5,
                    speed: 14,
                }),
                Animated.timing(statsOpacityAnim, {
                    toValue: 1,
                    duration: 160,
                    useNativeDriver: true,
                }),
                Animated.spring(chartSlideAnim, {
                    toValue: 0,
                    useNativeDriver: true,
                    bounciness: 5,
                    speed: 14,
                }),
                Animated.timing(chartOpacityAnim, {
                    toValue: 1,
                    duration: 160,
                    useNativeDriver: true,
                }),
            ]).start();
        });
    };

    // Transaction Details Modal State
    const [selectedTx, setSelectedTx] = useState(null);
    const [txModalVisible, setTxModalVisible] = useState(false);
    const [revertModalVisible, setRevertModalVisible] = useState(false);
    const [revertingTx, setRevertingTx] = useState(null);
    const [alert, setAlert] = useState({ visible: false, title: '', message: '', type: 'info' });

    // ── STORE DATA ──
    const refreshAll = useFinanceStore(state => state.refreshAll);
    const wallets = useFinanceStore(state => state.wallets);
    const cryptoPrices = useFinanceStore(state => state.cryptoPrices);
    const hideGlobalBalance = useFinanceStore(state => state.hideGlobalBalance);
    const setHideGlobalBalance = useFinanceStore(state => state.setHideGlobalBalance);
    const { debouncedRefreshAll, debouncedRefreshSummary, debouncedRefreshSavings, debouncedRefreshDebts } = useFinanceStore.getState();

    // ── DERIVED DATA ──
    const debts = useFinanceStore(state => state.debts);
    const savingsGoals = useFinanceStore(state => state.savingsGoals);
    const savingsMasterPot = useFinanceStore(state => state.savingsMasterPot);
    const summary = useFinanceStore(state => state.transactionSummary);
    const recent = useFinanceStore(state => state.transactions);
    const isLoadingSummary = useFinanceStore(state => state.isLoadingSummary);
    const isLoadingTransactions = useFinanceStore(state => state.isLoadingTransactions);
    const addAchievement = useFinanceStore(state => state.addAchievement);
    const achievements = useFinanceStore(state => state.achievements);
    const recurringBills = useFinanceStore(state => state.recurringBills);
    const budgets = useFinanceStore(state => state.budgets);
    const unreadNotifCount = useFinanceStore(state => state.unreadNotifCount);
    const pendingRequestsCount = useFinanceStore(state => state.pendingRequestsCount);
    const activeTrips = useFinanceStore(state => state.activeTrips);

    const prevSummaryRef = useRef(summary);
    if (prevSummaryRef.current !== summary) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        prevSummaryRef.current = summary;
    }

    const savingsTotalSaved = (savingsMasterPot?.currentAmount || 0) +
        savingsGoals.reduce((acc, g) => acc + (g.currentAmount || 0), 0);

    const debtStats = (() => {
        let iOwe = 0;
        let owedToMe = 0;
        debts.forEach(d => {
            if (d.status === 'settled') return;
            const amount = d.totalOwed ?? ((d.amount || 0) - (d.amountPaid || 0));
            if (d.direction === 'owed_by_me') iOwe += amount;
            if (d.direction === 'owed_to_me') owedToMe += amount;
        });
        return { iOwe, owedToMe };
    })();

    const statsTitle = dateRange === 'Day' ? 'Today' : (dateRange === 'Week' ? 'This Week' : 'This Month');

    // ── Double Tap to Exit ──
    useFocusEffect(
        useCallback(() => {
            const onBackPress = () => {
                const currentTime = Date.now();
                if (currentTime - lastBackPressed < 2000) {
                    BackHandler.exitApp();
                    return true;
                }

                setLastBackPressed(currentTime);
                if (Platform.OS === 'android') {
                    ToastAndroid.show('Press back again to exit', ToastAndroid.SHORT);
                }
                return true;
            };

            const backHandler = BackHandler.addEventListener(
                'hardwareBackPress',
                onBackPress
            );

            return () => backHandler.remove();
        }, [lastBackPressed])
    );

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
        if (!userToken) return;
        try {
            // Fetch everything fresh via the global refresher
            await refreshAll(true);

            // Reset infinite scroll pagination
            setPage(2);
            setHasMore(true);
        } catch (err) {
            console.warn('[Home] Load error:', err.message);
            const isNetworkError = !err.response && err.request;
            if (isNetworkError) {
                setAlert({
                    visible: true,
                    title: 'Network Error',
                    message: 'Unable to connect to the server. Please check your internet connection and try again.',
                    type: 'error'
                });
            }
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [userToken, dateRange]);

    const fetchMore = async () => {
        if (!hasMore || loadingMore) return;
        setLoadingMore(true);
        try {
            const res = await getTransactions({ limit: 10, page });
            const incoming = res.transactions || [];
            if (incoming.length > 0) {
                useFinanceStore.getState().appendTransactionsSync(incoming);
                setPage(p => p + 1);
            }
            if (incoming.length < 10) setHasMore(false);
        } catch (err) {
            console.warn('[Home] fetchMore error:', err.message);
            const isNetworkError = !err.response && err.request;
            if (isNetworkError) {
                setAlert({
                    visible: true,
                    title: 'Network Error',
                    message: 'Unable to connect to the server. Please check your internet connection and try again.',
                    type: 'error'
                });
            }
        } finally {
            setLoadingMore(false);
        }
    };

    const handleRevertConfirm = async () => {
        if (!revertingTx) return;
        try {
            const txId = revertingTx._id;
            setRevertingTx(null);
            setRevertModalVisible(false);
            setTxModalVisible(false);  // Also close the details modal if open
            setSelectedTx(null);
            await deleteTransaction(txId);
            // Socket will handle the rest (removing from list, updating balance)
        } catch (err) {
            console.warn('[Home] Revert error:', err.message);
            const isNetworkError = !err.response && err.request;
            setAlert({
                visible: true,
                title: isNetworkError ? 'Network Error' : 'Revert Failed',
                message: isNetworkError
                    ? 'Unable to connect to the server. Please check your internet connection and try again.'
                    : (err?.response?.data?.error || 'Could not undo this transaction. Please try again.'),
                type: 'error'
            });
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

    // Initial full load on mount / token change
    useEffect(() => { load(); }, [userToken]);

    // Re-fetch summary whenever the date range pill changes
    useEffect(() => {
        useFinanceStore.getState().fetchTransactionSummary(dateRange.toLowerCase(), true);
    }, [dateRange]);


    // ── Achievement Engine ──
    useEffect(() => {
        if (loading) return;
        const timer = setTimeout(() => {
            const newlyEarned = checkAchievements({
                transactions: recent,
                savingsGoals,
                savingsMasterPot,
                recurringBills,
                debts,
                budgets,
                summary,
            }, addAchievement);

            if (newlyEarned.length > 0) {
                setAchievementModal({ visible: true, badge: newlyEarned[0] });
                triggerHaptic('success');
            }
        }, 1500);
        return () => clearTimeout(timer);
    }, [recent, savingsGoals, savingsMasterPot, recurringBills, debts, budgets, loading]);

    const onRefresh = () => { setRefreshing(true); load(); };

    const walletBal = (summary.netBalance ?? summary.balance ?? 0);
    const savingBal = savingsTotalSaved ?? 0;
    const netDebt = debtStats.owedToMe - debtStats.iOwe;

    // Calculate total accounts/wallets worth (Banks, GCash, Crypto, etc.)
    const walletsWorth = (wallets || []).reduce((acc, w) => {
        if (w.type === 'Crypto' && w.coinId) {
            const price = cryptoPrices?.[w.coinId] || 0;
            return acc + (w.balance * price);
        }
        if (w.type === 'Credit') {
            return acc - (w.balance || 0); // Credit is a liability
        }
        return acc + (w.balance || 0);
    }, 0);

    const netWorth = walletBal + savingBal + netDebt + walletsWorth;

    // Calculate Health Score (0-100)
    const getHealthScore = () => {
        let score = 50; // Base score

        // 1. Net Worth Factor
        if (netWorth > 10000) score += 20;
        else if (netWorth > 0) score += 10;
        else if (netWorth < 0) score -= 20;

        // 2. Savings Factor
        if (savingBal > 0) {
            if (savingBal > (netWorth * 0.2)) score += 20;
        }

        // 3. Debt Factor
        if (debtStats.iOwe > 0) {
            if (debtStats.iOwe > (walletBal + savingBal)) score -= 20;
            else score -= 10;
        }

        // 4. Cash Flow Factor (Monthly summary approximation)
        const inc = summary.totalIncome || 0;
        const exp = summary.totalExpenses || 0;
        if (inc > exp) {
            score += 20;
            if (inc > exp * 1.5) score += 10;
        } else if (exp > inc && inc > 0) {
            score -= 10;
        }

        return Math.max(0, Math.min(100, score));
    };

    const healthScore = getHealthScore();

    // Calculate Forecast Data
    const forecast = calculateForecast({
        transactions: recent,
        transactionSummary: summary,
        recurringBills,
    });

    const getOtterMood = () => {
        if (healthScore >= 80) return { mood: "You're looking great! Your finances are very healthy.", color: COLORS.income };
        if (healthScore >= 50) return { mood: "You're doing okay, but there's room to improve your cash flow.", color: COLORS.warning };
        return { mood: "Your health score is low. Try to hold off on non-essentials and pay down debts!", color: COLORS.expense };
    };
    const mood = getOtterMood();

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
                    <TouchableOpacity
                        onPress={() => navigation.navigate('ProfileScreen')}
                        style={styles.headerProfileWrap}
                    >
                        <View style={[styles.headerAvatar, { backgroundColor: COLORS.primary + '20' }]}>
                            {userInfo?.avatarUrl ? (
                                <Image
                                    source={{ uri: userInfo.avatarUrl.startsWith('http') ? userInfo.avatarUrl : `${API_BASE.replace('/api', '')}/${userInfo.avatarUrl}` }}
                                    style={styles.headerAvatarImg}
                                />
                            ) : (
                                <Text style={[styles.headerAvatarText, { color: COLORS.primary }]}>
                                    {userInfo?.name?.charAt(0)?.toUpperCase() || '?'}
                                </Text>
                            )}
                        </View>
                        <View>
                            <Text style={[styles.greeting, { color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 10, marginBottom: 1 }]}>{currentDate}</Text>
                            <Text style={[styles.userName, { color: COLORS.text }]} numberOfLines={1}>
                                Hi, <Text style={{ fontWeight: 'bold', color: COLORS.primary }}>{userInfo?.name?.split(' ')[0] || 'User'}</Text>
                            </Text>
                        </View>
                    </TouchableOpacity>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <TouchableOpacity
                            onPress={() => {
                                setIsSavingsMode(true);
                            }}
                            style={[{ marginRight: 6, padding: 6, backgroundColor: COLORS.primary + '20', borderRadius: 10 }]}
                        >
                            <MaterialCommunityIcons name="piggy-bank-outline" size={18} color={COLORS.primary} />
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={() => navigation.navigate('FriendsScreen')}
                            style={[{ marginRight: 6, padding: 6, backgroundColor: COLORS.surface, borderRadius: 10 }]}
                        >
                            <Feather name="users" size={18} color={COLORS.textMuted} />
                            {pendingRequestsCount > 0 && (
                                <View style={[styles.badge, { backgroundColor: COLORS.primary, right: -4, top: -4 }]}>
                                    <Text style={[styles.badgeText, { fontSize: 8 }]}>{pendingRequestsCount > 9 ? '9+' : pendingRequestsCount}</Text>
                                </View>
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={() => navigation.navigate('BillCalendar')}
                            style={[{ marginRight: 6, padding: 6, backgroundColor: COLORS.surface, borderRadius: 10 }]}
                        >
                            <Feather name="calendar" size={18} color={COLORS.textMuted} />
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={() => navigation.navigate('Notifications')}
                            style={[{ marginRight: 6, padding: 6, backgroundColor: COLORS.surface, borderRadius: 10 }]}
                        >
                            <Feather name="bell" size={18} color={COLORS.textMuted} />
                            {unreadNotifCount > 0 && (
                                <View style={[styles.badge, { backgroundColor: COLORS.primary, right: -4, top: -4 }]}>
                                    <Text style={[styles.badgeText, { fontSize: 8 }]}>{unreadNotifCount > 9 ? '9+' : unreadNotifCount}</Text>
                                </View>
                            )}
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => navigation.navigate('Settings')}
                            style={{ padding: 6, backgroundColor: COLORS.surface, borderRadius: 10 }}
                        >
                            <Feather name="settings" size={18} color={COLORS.textMuted} />
                        </TouchableOpacity>
                    </View>
                </View>

                <LinearGradient colors={['#E91E8C', '#B0146A', '#7b0f4e']} style={styles.balanceCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                    {/* Finalized Option 2: Premium Health Badge */}
                    <View style={{
                        position: 'absolute',
                        top: 12,
                        right: 12,
                        backgroundColor: mood.color + '30',
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: 20,
                        flexDirection: 'row',
                        alignItems: 'center',
                        borderColor: mood.color,
                        borderWidth: 1.5,
                        zIndex: 10,
                        shadowColor: mood.color,
                        shadowOffset: { width: 0, height: 0 },
                        shadowOpacity: 0.8,
                        shadowRadius: 10,
                        elevation: 5
                    }}>
                        <MaterialCommunityIcons name="shield-check" size={14} color="#fff" style={{ marginRight: 4 }} />
                        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 }}>{healthScore}</Text>
                    </View>

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

                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={styles.balanceLabel}>HAND</Text>
                        <TouchableOpacity onPress={() => setHideGlobalBalance(!hideGlobalBalance)} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}>
                            <Feather name={hideGlobalBalance ? 'eye-off' : 'eye'} size={18} color="rgba(255,255,255,0.8)" style={{ marginRight: 4 }} />
                        </TouchableOpacity>
                    </View>
                    <Text style={styles.balanceAmount}>{hideGlobalBalance ? '••••••••' : formatCurrency(walletBal, userInfo?.currency)}</Text>


                    {/* Net Worth Breakdown */}
                    <TouchableOpacity
                        activeOpacity={0.9}
                        onPress={() => {
                            navigation.navigate('NetWorth');
                        }}
                        style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.2)' }}
                    >
                        <View>

                            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '700' }}>SAVINGS</Text>
                            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>{hideGlobalBalance ? '••••' : `+${formatCurrency(savingBal, userInfo?.currency)}`}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-start', paddingLeft: 12 }}>
                            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '700' }}>WALLETS</Text>
                            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>
                                {hideGlobalBalance ? '••••' : formatCurrency(walletsWorth, userInfo?.currency)}
                            </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end', marginLeft: 'auto' }}>
                            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '700' }}>TOTAL NET WORTH</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>{hideGlobalBalance ? '••••••••' : formatCurrency(netWorth, userInfo?.currency)}</Text>

                            </View>
                        </View>
                    </TouchableOpacity>
                </LinearGradient>

                {/* Analytics Row */}
                <View style={[styles.analyticsRow, { flexDirection: 'column', height: 'auto', gap: 12 }]}>
                    {/* Top: Dynamic Chart */}
                    <TouchableOpacity
                        style={[styles.analyticsCard, { backgroundColor: COLORS.surface, marginHorizontal: 0, padding: 20 }]}
                        activeOpacity={0.8}
                        onPress={() => {
                            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                            setChartView((prev) => (prev + 1) % 3);
                        }}
                    >
                        <Animated.View style={{ transform: [{ translateY: chartSlideAnim }], opacity: chartOpacityAnim }}>
                            {chartView === 0 && (
                                <>
                                    <Text style={[styles.analyticsLabel, { color: COLORS.textMuted }]}>{currentChart.label}</Text>
                                    <View style={[styles.chartContainer, { height: 120, marginTop: 10 }]}>
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
                                </>
                            )}
                            {chartView === 1 && (
                                <View style={{ flex: 1 }}>
                                    <View style={{ marginBottom: 16 }}>
                                        <Text style={{ fontSize: 16, fontWeight: 'bold', color: COLORS.text }}>Expense Distribution</Text>
                                        <Text style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>Tap to switch views</Text>
                                    </View>
                                    {summary.expensePie && summary.expensePie.length > 0 ? (
                                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                            <View style={{ width: 120, height: 120, justifyContent: 'center', alignItems: 'center' }}>
                                                <PieChart
                                                    data={summary.expensePie}
                                                    width={140}
                                                    height={140}
                                                    chartConfig={{ color: () => '#000' }}
                                                    accessor={"population"}
                                                    backgroundColor={"transparent"}
                                                    paddingLeft={"35"}
                                                    center={[0, 0]}
                                                    hasLegend={false}
                                                    absolute
                                                />
                                                <View style={{ position: 'absolute', width: 70, height: 70, borderRadius: 35, backgroundColor: COLORS.surface, justifyContent: 'center', alignItems: 'center', elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 }}>
                                                    <Text style={{ fontSize: 18, fontWeight: '900', color: COLORS.text }}>
                                                        {Math.round((summary.expensePie[0].population / summary.expensePie.reduce((a, b) => a + b.population, 0)) * 100)}%
                                                    </Text>
                                                </View>
                                            </View>
                                            <View style={{ flex: 1, height: 120, marginLeft: 20 }}>
                                                <ScrollView showsVerticalScrollIndicator={false} nestedScrollEnabled>
                                                    {summary.expensePie.map((item, idx) => (
                                                        <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                                            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
                                                                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: item.color, marginRight: 8 }} />
                                                                <Text style={{ color: COLORS.text, fontSize: 12, fontWeight: '500' }} numberOfLines={1}>{item.name}</Text>
                                                            </View>
                                                            <Text style={{ color: COLORS.text, fontSize: 12, fontWeight: 'bold' }}>
                                                                {formatCurrency(item.population, userInfo?.currency)}
                                                            </Text>
                                                        </View>
                                                    ))}
                                                </ScrollView>
                                            </View>
                                        </View>
                                    ) : (
                                        <Text style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 20 }}>No expenses recorded.</Text>
                                    )}
                                </View>
                            )}
                            {chartView === 2 && (
                                <View style={{ flex: 1 }}>
                                    <View style={{ marginBottom: 16 }}>
                                        <Text style={{ fontSize: 16, fontWeight: 'bold', color: COLORS.text }}>Income Distribution</Text>
                                        <Text style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>Tap to switch views</Text>
                                    </View>
                                    {summary.incomePie && summary.incomePie.length > 0 ? (
                                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                            <View style={{ width: 120, height: 120, justifyContent: 'center', alignItems: 'center' }}>
                                                <PieChart
                                                    data={summary.incomePie}
                                                    width={140}
                                                    height={140}
                                                    chartConfig={{ color: () => '#000' }}
                                                    accessor={"population"}
                                                    backgroundColor={"transparent"}
                                                    paddingLeft={"35"}
                                                    center={[0, 0]}
                                                    hasLegend={false}
                                                    absolute
                                                />
                                                <View style={{ position: 'absolute', width: 70, height: 70, borderRadius: 35, backgroundColor: COLORS.surface, justifyContent: 'center', alignItems: 'center', elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 }}>
                                                    <Text style={{ fontSize: 18, fontWeight: '900', color: COLORS.text }}>
                                                        {Math.round((summary.incomePie[0].population / summary.incomePie.reduce((a, b) => a + b.population, 0)) * 100)}%
                                                    </Text>
                                                </View>
                                            </View>
                                            <View style={{ flex: 1, height: 120, marginLeft: 20 }}>
                                                <ScrollView showsVerticalScrollIndicator={false} nestedScrollEnabled>
                                                    {summary.incomePie.map((item, idx) => (
                                                        <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                                            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
                                                                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: item.color, marginRight: 8 }} />
                                                                <Text style={{ color: COLORS.text, fontSize: 12, fontWeight: '500' }} numberOfLines={1}>{item.name}</Text>
                                                            </View>
                                                            <Text style={{ color: COLORS.text, fontSize: 12, fontWeight: 'bold' }}>
                                                                {formatCurrency(item.population, userInfo?.currency)}
                                                            </Text>
                                                        </View>
                                                    ))}
                                                </ScrollView>
                                            </View>
                                        </View>
                                    ) : (
                                        <Text style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 20 }}>No income recorded.</Text>
                                    )}
                                </View>
                            )}
                        </Animated.View>
                    </TouchableOpacity>

                    {/* Bottom: Today Summary */}
                    <View style={[styles.analyticsCard, { backgroundColor: COLORS.surface, marginHorizontal: 0, padding: 16, paddingHorizontal: 20, overflow: 'hidden' }]}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Animated.View style={{ transform: [{ translateY: statsSlideAnim }], opacity: statsOpacityAnim }}>
                                <Text style={[styles.analyticsTitle, { color: COLORS.text, marginBottom: 8 }]}>{statsTitle}</Text>
                                <View style={{ flexDirection: 'row', gap: 16 }}>
                                    <View style={styles.statRow}>
                                        <Feather name="trending-up" size={14} color={COLORS.income} style={styles.statIcon} />
                                        <Text style={[styles.statValue, { color: COLORS.income }]}>{formatCurrency(summary.totalIncome, userInfo?.currency)}</Text>
                                    </View>
                                    <View style={styles.statRow}>
                                        <Feather name="trending-down" size={14} color={COLORS.expense} style={styles.statIcon} />
                                        <Text style={[styles.statValue, { color: COLORS.text }]}>{formatCurrency(summary.totalExpenses, userInfo?.currency)}</Text>
                                    </View>
                                </View>
                            </Animated.View>

                            <View style={[styles.filterPills, { marginTop: 0, flexDirection: 'column', gap: 6, position: 'relative' }]}>
                                {/* Animated Sliding Pill */}
                                <Animated.View
                                    style={{
                                        position: 'absolute',
                                        top: 0, left: 0, right: 0,
                                        height: 24, // Fixed height for calculation
                                        backgroundColor: COLORS.primary,
                                        borderRadius: 12,
                                        transform: [{
                                            translateY: slideAnim.interpolate({
                                                inputRange: [0, 1, 2],
                                                outputRange: [0, 30, 60] // height (24) + gap (6)
                                            })
                                        }]
                                    }}
                                />
                                {['Day', 'Week', 'Month'].map((filter) => {
                                    const isActive = dateRange === filter;
                                    return (
                                        <TouchableOpacity
                                            key={filter}
                                            onPress={() => switchDateRange(filter)}
                                            activeOpacity={0.7}
                                            style={[styles.filterPill, { paddingVertical: 0, height: 24, justifyContent: 'center', backgroundColor: 'transparent' }]}
                                        >
                                            <Text style={[styles.filterPillText, { color: isActive ? '#fff' : COLORS.textMuted, textAlign: 'center' }]}>{filter}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </View>
                    </View>
                </View>

                {/* Quick Actions — GCash Style */}
                <View style={[styles.quickActionsCard, { backgroundColor: COLORS.surface }]}>
                    <Text style={[styles.quickActionsTitle, { color: COLORS.textMuted }]}>QUICK ACTIONS</Text>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.quickActionsRow}
                    >
                        {[
                            { icon: 'shopping-cart', label: 'Shopping', color: '#E91E8C', onPress: () => navigation.navigate('ShoppingHome') },
                            { icon: 'credit-card', label: 'Debts', color: '#f59e0b', onPress: () => navigation.navigate('DebtScreen') },
                            { icon: 'dollar-sign', label: 'Convert', color: '#8b5cf6', onPress: () => navigation.navigate('CurrencyConverter') },
                            { icon: 'repeat', label: 'Bills', color: '#22c55e', onPress: () => navigation.navigate('RecurringBills') },
                            { icon: 'maximize', label: 'Scanner', color: '#06b6d4', onPress: () => navigation.navigate('BarcodeScanner') },
                            { icon: 'grid', label: 'View All', color: '#6b7280', onPress: () => navigation.navigate('AllServices') },
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
                    </ScrollView>
                </View>

                {/* ── Spending Forecaster Card ── */}
                <View style={[styles.forecastCard, { backgroundColor: COLORS.surface }]}>
                    <View style={styles.forecastHeader}>
                        <View style={[styles.forecastIconWrap, { backgroundColor: COLORS.primary + '15' }]}>
                            <MaterialCommunityIcons name="crystal-ball" size={20} color={COLORS.primary} />
                        </View>
                        <View>
                            <Text style={[styles.forecastTitle, { color: COLORS.text }]}>Spending Forecast</Text>
                            <Text style={[styles.forecastSub, { color: COLORS.textMuted }]}>Based on your recent habits</Text>
                        </View>
                    </View>

                    <View style={styles.forecastContent}>
                        <View style={styles.runwaySection}>
                            <Text style={[styles.runwayLabel, { color: COLORS.textMuted }]}>Est. Runway</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                                <Text style={[styles.runwayValue, { color: forecast.runwayDays > 30 ? '#22c55e' : (forecast.runwayDays > 14 ? '#f59e0b' : '#ef4444') }]}>
                                    {forecast.runwayDays > 90 ? '90+' : forecast.runwayDays}
                                </Text>
                                <Text style={[styles.runwayUnit, { color: COLORS.textMuted }]}>days</Text>
                            </View>
                        </View>

                        <View style={styles.forecastDivider} />

                        <View style={styles.projectionSection}>
                            <Text style={[styles.runwayLabel, { color: COLORS.textMuted }]}>End of Month Est.</Text>
                            <Text style={[styles.projectionValue, { color: forecast.endOfMonthBalance > 0 ? COLORS.text : '#ef4444' }]}>
                                {formatCurrency(forecast.endOfMonthBalance, userInfo?.currency)}
                            </Text>
                        </View>
                    </View>

                    {/* Pro-tip / Alert line */}
                    <View style={[styles.forecastAlert, { backgroundColor: COLORS.background + '80' }]}>
                        <Feather
                            name={forecast.runwayDays < 15 ? "alert-triangle" : "info"}
                            size={14}
                            color={forecast.runwayDays < 15 ? '#ef4444' : COLORS.primary}
                        />
                        <Text style={[styles.forecastAlertText, { color: COLORS.textMuted }]}>
                            {forecast.runwayDays < 15
                                ? "Watch out! Your balance might run low soon."
                                : `You're spending ~${formatCurrency(forecast.dailyBurn, userInfo?.currency)} daily.`}
                        </Text>
                    </View>
                </View>

                {/* Active Trips scroller */}
                {activeTrips.length > 0 && (
                    <View style={[styles.section, { marginBottom: 0 }]}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <Text style={[styles.sectionTitle, { color: COLORS.text, marginBottom: 0 }]}>Active Trips</Text>
                            <TouchableOpacity onPress={() => navigation.navigate('GroupWalletScreen')}>
                                <Text style={{ fontSize: 12, color: COLORS.primary, fontWeight: '700' }}>Manage</Text>
                            </TouchableOpacity>
                        </View>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: 10 }}>
                            {activeTrips.map(trip => {
                                return (
                                    <TouchableOpacity
                                        key={trip._id}
                                        onPress={() => navigation.navigate('GroupWalletDetailScreen', { id: trip._id })}
                                        style={[styles.tripHomeCard, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
                                        activeOpacity={0.8}
                                    >
                                        <View style={[styles.tripHomeEmoji, { backgroundColor: trip.color + '20' }]}>
                                            <Text style={{ fontSize: 20 }}>{trip.emoji}</Text>
                                        </View>
                                        <View style={{ flex: 1, marginRight: 8 }}>
                                            <Text style={[styles.tripHomeName, { color: COLORS.text }]} numberOfLines={1}>{trip.name}</Text>
                                            <Text style={[styles.tripHomeStatus, { color: COLORS.textMuted }]}>
                                                {trip.expenses?.length || 0} expenses logged
                                            </Text>
                                        </View>
                                        <Feather name="chevron-right" size={16} color={COLORS.textMuted} />
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    </View>
                )}

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
                                    onLongPress={() => {
                                        triggerHaptic(hapticsEnabled, 'impactMedium');
                                        if (tx.relatedType === 'Debt') {
                                            setAlert({
                                                visible: true,
                                                title: 'Cannot Revert Debt',
                                                message: 'Debt transactions cannot be reverted from here. To undo a payment, please manage it within the Debt Tracker screen.',
                                                type: 'info'
                                            });
                                            return;
                                        }
                                        setRevertingTx(tx);
                                        setRevertModalVisible(true);
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

            <CustomAlertModal
                visible={achievementModal.visible}
                onClose={() => setAchievementModal({ visible: false, badge: null })}
                title="🏆 Achievement Unlocked!"
                message={achievementModal.badge ? `You've earned the "${achievementModal.badge.name}" badge!\n\n${achievementModal.badge.description}` : ''}
                type="success"
                confirmText="Awesome!"
                iconName={achievementModal.badge?.icon}
                iconColor={achievementModal.badge?.color}
            />

            <CustomAlertModal
                visible={revertModalVisible}
                onClose={() => setRevertModalVisible(false)}
                onConfirm={handleRevertConfirm}
                title="Revert Transaction"
                message={revertingTx?.relatedType === 'Debt'
                    ? "You can revert back this Debt transaction. This will undo the payment and restore the remaining balance of the debt."
                    : `Are you sure you want to undo this ${revertingTx?.type || 'transaction'}? This will restore your wallet balances and permanently delete the record.`
                }
                type="confirm"
                confirmText="Revert"
            />

            <CustomAlertModal
                visible={alert.visible}
                onClose={() => setAlert({ ...alert, visible: false })}
                onConfirm={() => setAlert({ ...alert, visible: false })}
                title={alert.title}
                message={alert.message}
                type={alert.type}
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
                                                {/* Payment Source / From Row */}
                                                <View style={[styles.modalDetailRow]}>
                                                    <Text style={[styles.modalDetailLabel, { color: COLORS.textMuted }]}>
                                                        {selectedTx.type === 'income' ? 'Payment Source' : 'Payment Source'}
                                                    </Text>
                                                    <View style={[styles.walletBadge, { backgroundColor: ((selectedTx.type === 'income' ? selectedTx.sourceWallet?.color : (selectedTx.sourceRelatedType === 'SavingsGoal' ? selectedTx.sourceRelatedId?.color : selectedTx.wallet?.color)) || COLORS.primary) + '20' }]}>
                                                        <Text style={[styles.walletBadgeText, { color: (selectedTx.type === 'income' ? selectedTx.sourceWallet?.color : (selectedTx.sourceRelatedType === 'SavingsGoal' ? selectedTx.sourceRelatedId?.color : selectedTx.wallet?.color)) || COLORS.primary }]}>
                                                            {selectedTx.type === 'income'
                                                                ? (selectedTx.sourceWallet ? selectedTx.sourceWallet.name : (selectedTx.paymentSource || 'External Source'))
                                                                : (selectedTx.sourceRelatedType === 'SavingsGoal'
                                                                    ? 'Internal Transfer'
                                                                    : (selectedTx.relatedType === 'SavingsGoal'
                                                                        ? 'Savings Balance'
                                                                        : (selectedTx.wallet ? selectedTx.wallet.name : 'HAND')))
                                                            }
                                                        </Text>
                                                    </View>
                                                </View>

                                                {/* Deposit To Row (Only for Income) */}
                                                {selectedTx.type === 'income' && (
                                                    <View style={[styles.modalDetailRow]}>
                                                        <Text style={[styles.modalDetailLabel, { color: COLORS.textMuted }]}>Deposit To</Text>
                                                        <View style={[styles.walletBadge, { backgroundColor: (selectedTx.wallet?.color || COLORS.primary) + '20' }]}>
                                                            <Text style={[styles.walletBadgeText, { color: selectedTx.wallet?.color || COLORS.primary }]}>
                                                                {selectedTx.wallet ? selectedTx.wallet.name : 'HAND'}
                                                            </Text>
                                                        </View>
                                                    </View>
                                                )}
                                                {/* Native Cost Row (Shows deduction amount in native unit) */}
                                                {((selectedTx.type === 'income' && selectedTx.sourceWalletAmount) || (selectedTx.type === 'expense' && selectedTx.walletAmount)) && (
                                                    <View style={[styles.modalDetailRow, { borderBottomWidth: 0 }]}>
                                                        <Text style={[styles.modalDetailLabel, { color: COLORS.textMuted }]}>Native Cost</Text>
                                                        <Text style={[styles.modalDetailValue, { color: COLORS.text, fontWeight: '700' }]}>
                                                            {selectedTx.type === 'income'
                                                                ? `${selectedTx.sourceWalletAmount?.toLocaleString(undefined, { maximumFractionDigits: 8 })} ${selectedTx.sourceWalletCurrency}`
                                                                : `${selectedTx.walletAmount?.toLocaleString(undefined, { maximumFractionDigits: 8 })} ${selectedTx.walletCurrency}`
                                                            }
                                                        </Text>
                                                    </View>
                                                )}
                                                {(selectedTx.description || selectedTx.note) ? (
                                                    <View style={[styles.modalDetailRow, { borderBottomWidth: 0, paddingBottom: 0, marginTop: 4, alignItems: 'flex-start' }]}>
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
            <OnboardingTour />
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
    quickActionsCard: { marginHorizontal: spacing.lg, marginBottom: spacing.md, borderRadius: radius.xl, paddingVertical: 14 },
    quickActionsTitle: { fontSize: 10, fontWeight: '900', letterSpacing: 1.2, marginBottom: 12, paddingHorizontal: spacing.md },
    quickActionsRow: { flexDirection: 'row', gap: 20, paddingHorizontal: spacing.md },
    quickActionItem: { alignItems: 'center', gap: 6, width: 60 },
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
    section: { paddingHorizontal: spacing.lg, marginTop: 16 },
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
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 24, paddingTop: 12, paddingBottom: 16,
    },
    headerProfileWrap: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 12 },
    headerAvatar: {
        width: 40, height: 40, borderRadius: 12, marginRight: 12,
        justifyContent: 'center', alignItems: 'center', overflow: 'hidden'
    },
    headerAvatarImg: { width: '100%', height: '100%' },
    headerAvatarText: { fontSize: 16, fontWeight: '900' },
    userName: { fontSize: 15 },
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
    modalDetailValue: { fontSize: 13, fontWeight: '700', textAlign: 'right' },
    walletBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    walletBadgeText: { fontSize: 11, fontWeight: '800' },
    badge: {
        position: 'absolute',
        top: 2,
        right: 2,
        minWidth: 16,
        paddingHorizontal: 2,
        height: 16,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1.5,
        borderColor: 'transparent'
    },
    badgeText: {
        color: 'white',
        fontSize: 8,
        fontWeight: '900'
    },

    // Forecast Styles
    forecastCard: {
        marginHorizontal: spacing.lg, borderRadius: 24, padding: 20,
        borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', marginBottom: spacing.md
    },
    forecastHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
    forecastIconWrap: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    forecastTitle: { fontSize: 16, fontWeight: '800' },
    forecastSub: { fontSize: 12, marginTop: 2 },
    forecastContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
    runwaySection: { flex: 1 },
    runwayLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 4 },
    runwayValue: { fontSize: 24, fontWeight: '900' },
    runwayUnit: { fontSize: 14, fontWeight: '700' },
    forecastDivider: { width: 1, height: 40, backgroundColor: 'rgba(0,0,0,0.1)', marginHorizontal: 20 },
    projectionSection: { flex: 1.5 },
    projectionValue: { fontSize: 18, fontWeight: '800' },
    forecastAlert: {
        flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12,
    },
    forecastAlertText: { fontSize: 12, fontWeight: '600' },

    // Trip Home Card Styles
    tripHomeCard: {
        width: 220,
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 18,
        borderWidth: 1,
    },
    tripHomeEmoji: {
        width: 44,
        height: 44,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12
    },
    tripHomeName: {
        fontSize: 14,
        fontWeight: '700'
    },
    tripHomeStatus: {
        fontSize: 10,
        fontWeight: '600',
        marginTop: 2
    }
});
