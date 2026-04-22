import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, FlatList, ScrollView,
    ActivityIndicator, RefreshControl, Animated, Image, Modal, TouchableWithoutFeedback
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { getSavingsGoals, getSavingsTransfers, bulkSavingsAction } from '../../api/api';
import { spacing, radius, typography } from '../../theme/colors';
import { getSocket, connectSocket } from '../../utils/socket';
import Skeleton from '../../components/Skeleton';
import CustomAlertModal from '../../components/CustomAlertModal';
import SavingsBulkActionSheet from '../../components/SavingsBulkActionSheet';

const otterIcon = require('../../../assets/icon/welcomeOtter.png');

const formatCurrency = (amount, currency = 'PHP') =>
    new Intl.NumberFormat('en-PH', { style: 'currency', currency }).format(amount);

const formatDateTime = (dateString) =>
    new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(dateString));

const IconRenderer = ({ name, family, size, color }) => {
    const fam = family?.toLowerCase();
    if (fam === 'materialcommunityicons') {
        return <MaterialCommunityIcons name={name} size={size} color={color} />;
    }
    const hasFamily = family && family !== 'feather';
    const useIonicons = (hasFamily && (fam === 'ionicons')) || name?.includes('-outline');
    if (useIonicons) return <Ionicons name={name} size={size} color={color} />;
    return <Feather name={name} size={size} color={color} />;
};

export default function SavingsHomeScreen({ navigation, route }) {
    const isGoalsTab = route.name === 'SavingsGoals';
    const { COLORS, toggleTheme, isDarkMode } = useTheme();
    const { userInfo } = useAuth();
    const styles = getStyles(COLORS);

    // Goals State
    const [goals, setGoals] = useState([]);
    const [goalsPage, setGoalsPage] = useState(1);
    const [goalsHasMore, setGoalsHasMore] = useState(true);
    const [goalsLoading, setGoalsLoading] = useState(false);

    const [masterPot, setMasterPot] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // History State (Infinite Scroll)
    const [history, setHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);

    // Modal State
    const [selectedTransfer, setSelectedTransfer] = useState(null);
    const [transferModalVisible, setTransferModalVisible] = useState(false);
    const [bulkSheetVisible, setBulkSheetVisible] = useState(false);
    const [alertConfig, setAlertConfig] = useState({
        visible: false, title: '', message: '', type: 'confirm', onConfirm: () => { }
    });

    const handleBulkAction = async (actionType) => {
        setBulkSheetVisible(false);
        const title = actionType === 'sweep' ? 'Sweep All Funds?' : 'Distribute Balance?';
        const msg = actionType === 'sweep'
            ? 'This will move all current funds from your goals back into your Savings Balance.'
            : 'This will proportionally distribute your entire Savings Balance across all active goals.';

        setAlertConfig({
            visible: true,
            title,
            message: msg,
            type: 'confirm',
            onConfirm: async () => {
                try {
                    setAlertConfig(p => ({ ...p, visible: false }));
                    setLoading(true);
                    await bulkSavingsAction({ action: actionType });
                    await loadData();
                } catch (err) {
                    console.warn(err);
                } finally {
                    setLoading(false);
                }
            }
        });
    };

    const pulseAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, { toValue: 1.015, duration: 1800, useNativeDriver: true }),
                Animated.timing(pulseAnim, { toValue: 1, duration: 1800, useNativeDriver: true }),
            ])
        ).start();
    }, []);

    const loadData = useCallback(async () => {
        if (!userInfo?._id) return;
        try {
            setRefreshing(true);
            const goalRes = await getSavingsGoals({ page: 1, limit: 15 });
            const allGoals = goalRes.goals || [];
            const mainPot = allGoals.find(g => g.name === 'Savings Balance');

            setMasterPot(mainPot);
            // Hide archived goals (Completed + Emptied) from the main list
            const activeGoals = allGoals.filter(g =>
                g.name !== 'Savings Balance' &&
                !(g.isCompleted && g.currentAmount === 0)
            );
            setGoals(activeGoals);
            setGoalsPage(2);
            setGoalsHasMore(goalRes.hasMore);

            const histRes = await getSavingsTransfers({ limit: 15, page: 1 });
            setHistory(histRes.transfers || []);
            setPage(2);
            setHasMore((histRes.transfers || []).length >= 15);
        } catch (e) {
            console.warn(e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [userInfo?._id]);

    useEffect(() => { loadData(); }, [loadData, userInfo?._id]);

    const fetchMoreGoals = async () => {
        if (!goalsHasMore || goalsLoading) return;
        setGoalsLoading(true);
        try {
            const res = await getSavingsGoals({ page: goalsPage, limit: 15 });
            const incoming = res.goals || [];
            setGoals(prev => {
                const filteredIncoming = incoming.filter(g => g.name !== 'Savings Balance');
                const seen = new Set(prev.map(g => g._id));
                return [...prev, ...filteredIncoming.filter(g => !seen.has(g._id))];
            });
            setGoalsHasMore(res.hasMore);
            setGoalsPage(p => p + 1);
        } catch (e) {
        } finally {
            setGoalsLoading(false);
        }
    };

    const fetchMoreHistory = async () => {
        if (!hasMore || historyLoading) return;
        setHistoryLoading(true);
        try {
            const res = await getSavingsTransfers({ limit: 15, page });
            const incoming = res.transfers || [];
            if (incoming.length < 15) setHasMore(false);
            setHistory(prev => {
                const seen = new Set(prev.map(t => t._id));
                return [...prev, ...incoming.filter(t => !seen.has(t._id))];
            });
            setPage(p => p + 1);
        } catch (e) {
        } finally {
            setHistoryLoading(false);
        }
    };

    const handleDashboardScroll = ({ nativeEvent }) => {
        const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
        const isNearEnd = layoutMeasurement.height + contentOffset.y >= contentSize.height - 40;
        if (isNearEnd) fetchMoreHistory();
    };

    const isToday = (dateString) => {
        if (!dateString) return false;
        const d = new Date(dateString);
        const today = new Date();
        return d.getDate() === today.getDate() &&
            d.getMonth() === today.getMonth() &&
            d.getFullYear() === today.getFullYear();
    };

    const todaysHistory = history.filter(h => isToday(h.createdAt));

    useEffect(() => {
        if (!userInfo?._id) return;
        const socket = getSocket() || connectSocket(userInfo._id);
        const handleUpdate = () => loadData();
        socket.on('new_savings_transfer', handleUpdate);
        socket.on('new_savings_goal', handleUpdate);
        socket.on('update_savings_goal', handleUpdate);
        socket.on('delete_savings_goal', handleUpdate);
        return () => {
            socket.off('new_savings_transfer', handleUpdate);
            socket.off('new_savings_goal', handleUpdate);
            socket.off('update_savings_goal', handleUpdate);
            socket.off('delete_savings_goal', handleUpdate);
        };
    }, [userInfo?._id, loadData]);

    const activeGoals = goals.filter(g => !g.isCompleted);

    const renderActivityItem = (item) => {
        const isDeposit = item.direction === 'to_savings' || item.direction === 'income' || item.direction === 'transfer_goal';
        const color = isDeposit ? '#22c55e' : '#f59e0b';
        const icon = isDeposit ? 'plus-circle' : 'minus-circle';
        return (
            <TouchableOpacity
                key={item._id}
                style={[styles.activityItem, { backgroundColor: COLORS.surface }]}
                activeOpacity={0.7}
                onPress={() => {
                    setSelectedTransfer(item);
                    setTransferModalVisible(true);
                }}
            >
                <View style={[styles.activityIcon, { backgroundColor: color + '15' }]}>
                    <Feather name={icon} size={16} color={color} />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={[styles.activityGoal, { color: COLORS.text }]}>{item.goalName}</Text>
                    <Text style={[styles.txDesc, { color: COLORS.textMuted }]} numberOfLines={1}>
                        " {item.description || item.note || '—'} "
                    </Text>

                </View>
                <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.activityAmount, { color }]}>
                        {isDeposit ? '+' : '-'}{formatCurrency(item.amount, userInfo?.currency)}
                    </Text>
                    <Text style={[styles.activityDate, { color: COLORS.textMuted }]}>
                        {new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(item.createdAt))}
                    </Text>
                </View>
            </TouchableOpacity>
        );
    };

    const renderGoalCard = (goal) => {
        const pct = goal.targetAmount > 0 ? Math.min((goal.currentAmount / goal.targetAmount) * 100, 100) : 0;
        const isComplete = goal.isCompleted || pct >= 100;
        return (
            <TouchableOpacity
                key={goal._id}
                style={[styles.goalCard, { backgroundColor: COLORS.surface }]}
                onPress={() => navigation.navigate('SavingsGoalDetail', { goal })}
            >
                <View style={styles.goalHeader}>
                    <View style={[styles.goalIconBox, { backgroundColor: (goal.color || COLORS.primary) + '20' }]}>
                        <IconRenderer name={goal.icon || 'target'} family={goal.family} size={20} color={goal.color || COLORS.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.goalHeaderName, { color: COLORS.text }]}>{goal.name}</Text>
                        <Text style={[styles.goalHeaderSub, { color: COLORS.textMuted }]}>
                            {formatCurrency(goal.currentAmount, userInfo?.currency)} saved
                        </Text>
                    </View>
                    {isComplete && <Feather name="check-circle" size={18} color="#22c55e" />}
                </View>
                <View style={styles.barContainer}>
                    <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: goal.color || COLORS.primary }]} />
                </View>
                <View style={styles.goalFooter}>
                    <Text style={[styles.goalPct, { color: COLORS.textMuted }]}>{Math.round(pct)}% reached</Text>
                    <Text style={[styles.goalTarget, { color: COLORS.textMuted }]}>Target: {formatCurrency(goal.targetAmount, userInfo?.currency)}</Text>
                </View>
            </TouchableOpacity>
        );
    };

    if (loading) {
        return (
            <SafeAreaView style={styles.safe}>
                <View style={styles.flatContent}>
                    <View style={styles.headerContainer}>
                        <View style={styles.topRow}>
                            <View>
                                <Skeleton width={130} height={26} style={{ marginBottom: 4 }} />
                                <Skeleton width={160} height={13} />
                            </View>
                            <Skeleton width={36} height={36} borderRadius={12} />
                        </View>
                    </View>

                    {/* Hero Card Skeleton */}
                    <View style={[styles.heroCard, { backgroundColor: COLORS.surface, elevation: 0, shadowOpacity: 0, borderWidth: 1, borderColor: COLORS.border, marginBottom: spacing.lg }]}>
                        <View style={styles.mascotRow}>
                            <Skeleton width={64} height={64} borderRadius={32} />
                            <View style={styles.speechContainer}>
                                <Skeleton width="100%" height={50} borderRadius={16} />
                            </View>
                        </View>
                        <Skeleton width={80} height={10} style={{ marginBottom: 4 }} />
                        <Skeleton width={180} height={36} style={{ marginBottom: 16 }} />
                        <Skeleton width={90} height={24} borderRadius={12} />
                    </View>

                    {/* Action Row Skeleton */}
                    <View style={styles.actionRow}>
                        {[1, 2, 3].map(i => (
                            <View key={i} style={[styles.actionBtn, { backgroundColor: COLORS.surface, elevation: 0, borderWidth: 1, borderColor: COLORS.border }]}>
                                <Skeleton width={36} height={36} borderRadius={18} style={{ marginBottom: 8 }} />
                                <Skeleton width={60} height={10} />
                            </View>
                        ))}
                    </View>

                    {/* Goals Preview Skeleton */}
                    <View style={[styles.goalsPreviewCard, { backgroundColor: COLORS.surface, elevation: 0, borderWidth: 1, borderColor: COLORS.border, marginBottom: 28 }]}>
                        <View style={{ flex: 1 }}>
                            <Skeleton width={100} height={16} style={{ marginBottom: 4 }} />
                            <Skeleton width={140} height={12} />
                        </View>
                        <Skeleton width={20} height={20} />
                    </View>

                    <Skeleton width={130} height={18} style={{ marginBottom: 16 }} />
                    {[1, 2].map(i => (
                        <View key={i} style={[styles.activityItem, { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border }]}>
                            <Skeleton width={36} height={36} borderRadius={18} style={{ marginRight: 12 }} />
                            <View style={{ flex: 1 }}>
                                <Skeleton width={100} height={14} style={{ marginBottom: 6 }} />
                                <Skeleton width={140} height={10} />
                            </View>
                            <Skeleton width={60} height={16} />
                        </View>
                    ))}
                </View>
            </SafeAreaView>
        );
    }

    if (isGoalsTab) {
        return (
            <SafeAreaView style={styles.safe}>
                <FlatList
                    data={goals}
                    renderItem={({ item }) => renderGoalCard(item)}
                    keyExtractor={item => item._id}
                    ListHeaderComponent={() => (
                        <View style={styles.topRow}>
                            <View>
                                <Text style={styles.headerTitle}>Savings Goals</Text>
                                <Text style={[styles.headerSub, { color: COLORS.textMuted }]}>Showing all target pots</Text>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <TouchableOpacity
                                    onPress={() => navigation.navigate('SavingsArchive')}
                                    style={[styles.themeToggle, { marginRight: spacing.sm }]}
                                >
                                    <Feather name="archive" size={20} color={COLORS.textMuted} />
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}
                    contentContainerStyle={styles.flatContent}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadData} tintColor="#E91E8C" />}
                    onEndReached={fetchMoreGoals}
                    onEndReachedThreshold={0.5}
                    ListFooterComponent={goalsLoading && <ActivityIndicator color={COLORS.primary} style={{ padding: 20 }} />}
                    ListEmptyComponent={() => (
                        <View style={styles.emptyContainer}>
                            <Text style={styles.emptyEmoji}>🎯</Text>
                            <Text style={[styles.emptyText, { color: COLORS.textMuted }]}>No goals created yet</Text>
                        </View>
                    )}
                />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.safe}>
            <ScrollView
                contentContainerStyle={styles.flatContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadData} tintColor="#E91E8C" />}
            >
                <View style={styles.topRow}>
                    <View>
                        <Text style={styles.headerTitle}>{isGoalsTab ? 'Savings Goals' : 'My Savings'}</Text>
                        <Text style={[styles.headerSub, { color: COLORS.textMuted }]}>{isGoalsTab ? 'Showing all target pots' : 'Your financial fortress'}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <TouchableOpacity
                            onPress={() => setBulkSheetVisible(true)}
                            style={[styles.themeToggle, { marginRight: spacing.sm, backgroundColor: COLORS.primary + '20' }]}
                        >
                            <Feather name="zap" size={20} color={COLORS.primary} />
                        </TouchableOpacity>
                        {isGoalsTab && (
                            <TouchableOpacity
                                onPress={() => navigation.navigate('SavingsArchive')}
                                style={[styles.themeToggle, { marginRight: spacing.sm }]}
                            >
                                <Feather name="archive" size={20} color={COLORS.textMuted} />
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity onPress={toggleTheme} style={styles.themeToggle}>
                            <Feather name={isDarkMode ? 'sun' : 'moon'} size={20} color={COLORS.textMuted} />
                        </TouchableOpacity>
                    </View>
                </View>

                <Animated.View style={{ transform: [{ scale: pulseAnim }], marginBottom: spacing.lg }}>
                    <LinearGradient
                        colors={['#E91E8C', '#B0146A', '#7b0f4e']}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                        style={styles.heroCard}
                    >
                        <View style={styles.mascotRow}>
                            <Image source={otterIcon} style={styles.otterAvatar} resizeMode="contain" />
                            <View style={styles.speechContainer}>
                                <View style={styles.speechBubble}>
                                    <Text style={styles.bubbleName}>Otter</Text>
                                    <Text style={styles.bubbleText}>
                                        {(masterPot?.currentAmount || 0) > 0 ? "You're doing great! Keep stacking those coins." : "Ready to start? Let's build your future!"}
                                    </Text>
                                </View>
                            </View>
                        </View>
                        <Text style={styles.heroLabel}>CURRENT STASH</Text>
                        <Text style={styles.heroAmount}>{formatCurrency(masterPot?.currentAmount || 0, userInfo?.currency)}</Text>
                        <View style={styles.heroFooter}>
                            <View style={styles.statChip}>
                                <View style={styles.statDot} />
                                <Text style={styles.statText}>{activeGoals.length} Active Goals</Text>
                            </View>
                        </View>
                    </LinearGradient>
                </Animated.View>

                {/* Actions */}
                <View style={styles.actionRow}>
                    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: COLORS.surface }]} onPress={() => navigation.navigate('SavingsTransfer', { direction: 'to_savings', isDirect: true, fromSavings: true })}>
                        <View style={[styles.actionIcon, { backgroundColor: '#22c55e20' }]}><Feather name="plus" size={18} color="#22c55e" /></View>
                        <Text style={[styles.actionLabel, { color: COLORS.text }]}>Add Funds</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: COLORS.surface }]} onPress={() => navigation.navigate('SavingsTransfer', { direction: 'from_savings', isDirect: true, fromSavings: true })}>
                        <View style={[styles.actionIcon, { backgroundColor: '#f59e0b20' }]}><Feather name="arrow-up" size={18} color="#f59e0b" /></View>
                        <Text style={[styles.actionLabel, { color: COLORS.text }]}>Withdraw</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: COLORS.surface }]} onPress={() => navigation.navigate('SavingsGoalSelector', { action: 'move_from' })}>
                        <View style={[styles.actionIcon, { backgroundColor: '#3b82f620' }]}><Feather name="repeat" size={18} color="#3b82f6" /></View>
                        <Text style={[styles.actionLabel, { color: COLORS.text }]}>Move Money</Text>
                    </TouchableOpacity>
                </View>

                {/* Goals Link */}
                <TouchableOpacity style={[styles.goalsPreviewCard, { backgroundColor: COLORS.surface }]} onPress={() => navigation.navigate('SavingsGoals')}>
                    <View style={styles.goalsPreviewInfo}>
                        <Text style={[styles.goalsPreviewTitle, { color: COLORS.text }]}>My Targets</Text>
                        <Text style={[styles.goalsPreviewSub, { color: COLORS.textMuted }]}>{activeGoals.length} goals in progress</Text>
                    </View>
                    <View style={styles.goalsPreviewArrow}><Feather name="chevron-right" size={20} color={COLORS.textMuted} /></View>
                </TouchableOpacity>

                <Text style={[styles.sectionTitle, { color: COLORS.text }]}>Recent Activity</Text>

                <View style={styles.activityContainer}>
                    <ScrollView
                        style={styles.nestedActivityScroll}
                        nestedScrollEnabled={true}
                        showsVerticalScrollIndicator={false}
                        onScroll={handleDashboardScroll}
                        scrollEventThrottle={200}
                    >
                        {todaysHistory.length === 0 ? (
                            <View style={styles.innerEmpty}>
                                <Text style={styles.emptyText}>No transfers today</Text>
                            </View>
                        ) : (
                            todaysHistory.map(renderActivityItem)
                        )}
                        {historyLoading && <ActivityIndicator color={COLORS.primary} style={{ padding: 12 }} />}
                    </ScrollView>

                    {history.length > 0 && (
                        <TouchableOpacity style={styles.dashboardViewAll} onPress={() => navigation.navigate('SavingsTransferHistory')}>
                            <Text style={[styles.viewAllText, { color: COLORS.primary }]}>View All History</Text>
                            <Feather name="arrow-right" size={14} color={COLORS.primary} />
                        </TouchableOpacity>
                    )}
                </View>
                <View style={{ height: 100 }} />
            </ScrollView>

            {/* Transfer Detail Modal */}
            <Modal
                visible={transferModalVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setTransferModalVisible(false)}
            >
                <TouchableWithoutFeedback onPress={() => setTransferModalVisible(false)}>
                    <View style={styles.modalOverlay}>
                        <TouchableWithoutFeedback>
                            <View style={[styles.modalSheet, { backgroundColor: COLORS.surface }]}>
                                {selectedTransfer && (() => {
                                    const isDeposit = selectedTransfer.direction === 'to_savings' || selectedTransfer.direction === 'income' || selectedTransfer.direction === 'transfer_goal';
                                    const isGoal = selectedTransfer.direction === 'transfer_goal';
                                    const color = isDeposit ? '#22c55e' : '#f59e0b';
                                    const icon = isDeposit ? 'plus-circle' : 'minus-circle';
                                    const label = selectedTransfer.direction === 'to_savings' ? 'Saved to Pot' : (isGoal ? 'Goal Transfer' : (selectedTransfer.direction === 'income' ? 'Savings Income' : 'Withdrawal'));

                                    return (
                                        <>
                                            <View style={styles.modalHeaderRow}>
                                                <Text style={[styles.modalTitle, { color: COLORS.text }]}>Transfer Details</Text>
                                                <TouchableOpacity onPress={() => setTransferModalVisible(false)}>
                                                    <Feather name="x" size={24} color={COLORS.textMuted} />
                                                </TouchableOpacity>
                                            </View>

                                            <View style={styles.modalContent}>
                                                <View style={[styles.modalIconHero, { backgroundColor: color + '15' }]}>
                                                    <Feather name={icon} size={32} color={color} />
                                                </View>

                                                <Text style={[styles.modalAmount, { color }]}>
                                                    {isDeposit ? '+' : '-'}{formatCurrency(selectedTransfer.amount, userInfo?.currency)}
                                                </Text>
                                                <Text style={[styles.modalCatName, { color: COLORS.text }]}>{selectedTransfer.goalName}</Text>

                                                <View style={[styles.modalDetailBox, { backgroundColor: COLORS.background, borderColor: COLORS.border }]}>
                                                    <View style={styles.modalDetailRow}>
                                                        <Text style={[styles.modalDetailLabel, { color: COLORS.textMuted }]}>Action</Text>
                                                        <Text style={[styles.modalDetailValue, { color: COLORS.text }]}>{label}</Text>
                                                    </View>
                                                    <View style={styles.modalDetailRow}>
                                                        <Text style={[styles.modalDetailLabel, { color: COLORS.textMuted }]}>Date</Text>
                                                        <Text style={[styles.modalDetailValue, { color: COLORS.text }]}>{formatDateTime(selectedTransfer.createdAt)}</Text>
                                                    </View>
                                                    {selectedTransfer.note ? (
                                                        <View style={[styles.modalDetailRow, { borderBottomWidth: 0, paddingBottom: 0, marginTop: 4, flexDirection: 'column', alignItems: 'flex-start' }]}>
                                                            <Text style={[styles.modalDetailLabel, { color: COLORS.textMuted, marginBottom: 4 }]}>Note</Text>
                                                            <Text style={[styles.modalDetailValue, { color: COLORS.text }]}>{selectedTransfer.note}</Text>
                                                        </View>
                                                    ) : null}
                                                </View>
                                            </View>
                                        </>
                                    );
                                })()}
                            </View>
                        </TouchableWithoutFeedback>
                    </View>
                </TouchableWithoutFeedback>
            </Modal>

            <SavingsBulkActionSheet
                visible={bulkSheetVisible}
                onClose={() => setBulkSheetVisible(false)}
                onAction={handleBulkAction}
            />

            <CustomAlertModal
                visible={alertConfig.visible}
                onClose={() => setAlertConfig(p => ({ ...p, visible: false }))}
                title={alertConfig.title}
                message={alertConfig.message}
                type={alertConfig.type}
                onConfirm={alertConfig.onConfirm}
            />
        </SafeAreaView>
    );
}

const getStyles = (COLORS) => StyleSheet.create({
    safe: { flex: 1, backgroundColor: COLORS.background },
    flatContent: { padding: spacing.lg },
    headerContainer: { marginBottom: spacing.md },
    topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xl },
    headerTitle: { fontSize: 26, fontWeight: '900', color: COLORS.text },
    headerSub: { fontSize: 13, fontWeight: '600', marginTop: 2 },
    themeToggle: { padding: 8, borderRadius: 12, backgroundColor: COLORS.surface },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    heroCard: { borderRadius: radius.xl, padding: 24, elevation: 12, shadowColor: '#E91E8C', shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: 0, height: 10 } },
    mascotRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
    otterAvatar: { width: 64, height: 64 },
    speechContainer: { flex: 1, marginLeft: 12 },
    speechBubble: { backgroundColor: 'rgba(255,255,255,0.15)', padding: 12, borderRadius: 16, borderTopLeftRadius: 4 },
    bubbleName: { color: '#fff', fontSize: 11, fontWeight: '900', marginBottom: 2 },
    bubbleText: { color: '#fff', fontSize: 12, fontWeight: '600', lineHeight: 16 },
    heroLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '900', letterSpacing: 1.2, marginBottom: 4 },
    heroAmount: { color: '#fff', fontSize: 36, fontWeight: '900', marginBottom: 16 },
    heroFooter: { flexDirection: 'row' },
    statChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
    statDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22c55e', marginRight: 8 },
    statText: { color: '#fff', fontSize: 11, fontWeight: '800' },
    actionRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.lg },
    actionBtn: { width: '31%', alignItems: 'center', paddingVertical: 16, borderRadius: radius.xl, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8 },
    actionIcon: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
    actionLabel: { fontSize: 11, fontWeight: '800' },
    goalsPreviewCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: radius.xl, marginBottom: 28 },
    goalsPreviewInfo: { flex: 1 },
    goalsPreviewTitle: { fontSize: 16, fontWeight: '900' },
    goalsPreviewSub: { fontSize: 12, fontWeight: '600', marginTop: 2 },
    goalsPreviewArrow: { padding: 4 },
    sectionTitle: { fontSize: 18, fontWeight: '900', marginBottom: 16 },
    activityContainer: { borderRadius: radius.xl, marginBottom: 20 },
    nestedActivityScroll: { maxHeight: 280 },
    innerEmpty: { padding: 40, alignItems: 'center' },
    activityItem: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: radius.lg, marginBottom: 8 },
    activityIcon: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    activityGoal: { fontSize: 14, fontWeight: '800' },
    activityDate: { fontSize: 10, marginTop: 2 },
    activityAmount: { fontSize: 15, fontWeight: '900' },
    dashboardViewAll: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, gap: 8 },
    viewAllText: { fontSize: 13, fontWeight: '800' },
    goalCard: { borderRadius: radius.xl, padding: 16, marginBottom: 16, backgroundColor: '#fff' },
    goalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
    goalIconBox: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
    goalHeaderName: { fontSize: 16, fontWeight: '900' },
    goalHeaderSub: { fontSize: 12, fontWeight: '600', marginTop: 2 },
    barContainer: { height: 8, backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 4, overflow: 'hidden', marginBottom: 12 },
    barFill: { height: '100%', borderRadius: 4 },
    goalFooter: { flexDirection: 'row', justifyContent: 'space-between' },
    goalPct: { fontSize: 11, fontWeight: '700' },
    goalTarget: { fontSize: 11, fontWeight: '700' },
    emptyContainer: { alignItems: 'center', marginTop: 60 },
    emptyEmoji: { fontSize: 48, marginBottom: 12 },
    emptyText: { fontSize: 14, fontWeight: '600' },

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
    txDesc: { ...typography.caption, fontStyle: 'italic' },
});
