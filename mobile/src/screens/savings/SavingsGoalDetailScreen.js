import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    ActivityIndicator, RefreshControl, Alert, FlatList,
    Modal, TouchableWithoutFeedback, Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { API_BASE } from '../../store/authStore';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { getSavingsGoals, deleteSavingsGoal, getSavingsTransfers, completeSavingsGoal } from '../../api/api';
import BottomSheetModal from '../../components/BottomSheetModal';
import { spacing, radius, shadow } from '../../theme/colors';
import { getSocket, connectSocket } from '../../utils/socket';
import CustomAlertModal from '../../components/CustomAlertModal';
import { useFinanceStore } from '../../store/financeStore';

const isIonicon = (name) => name?.includes('-outline') || name?.includes('-sharp');

const IconRenderer = ({ name, family, size, color }) => {
    const hasFamily = family && family !== 'feather';
    const useIonicons = (hasFamily && (family === 'ionicons' || family === 'Ionicons')) || (!hasFamily && isIonicon(name));
    if (useIonicons) {
        return <Ionicons name={name} size={size} color={color} />;
    }
    return <Feather name={name} size={size} color={color} />;
};

const formatCurrency = (amount, currency = 'PHP') =>
    new Intl.NumberFormat('en-PH', { style: 'currency', currency }).format(amount);

const formatDate = (d) => d ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(d)) : null;

const getDaysLeft = (deadline) => {
    if (!deadline) return null;
    const diff = new Date(deadline) - new Date();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

export default function SavingsGoalDetailScreen({ route, navigation }) {
    const { goal: initialGoal } = route.params;
    const COLORS = useTheme(state => state.COLORS);
    const { userInfo } = useAuth();
    const styles = getStyles(COLORS);

    // ── STORE DATA ──
    const goal = useFinanceStore(state =>
        state.savingsGoals.find(g => g._id === initialGoal._id) ||
        (state.savingsMasterPot?._id === initialGoal._id ? state.savingsMasterPot : initialGoal)
    );
    const { debouncedRefreshSavings, debouncedRefreshSummary } = useFinanceStore.getState();

    const [transfers, setTransfers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [completeModalVisible, setCompleteModalVisible] = useState(false);
    const [finishing, setFinishing] = useState(false);
    const [alertConfig, setAlertConfig] = useState({ visible: false, title: '', message: '', type: 'info', onConfirm: null });

    // Modal State
    const [selectedTransfer, setSelectedTransfer] = useState(null);
    const [modalVisible, setModalVisible] = useState(false);

    // Infinite Scroll State
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);

    const load = useCallback(async () => {
        try {
            setRefreshing(true);
            // Refresh global savings to ensure the current goal is up to date in the store
            await useFinanceStore.getState().refreshAll(true);

            const transfersRes = await getSavingsTransfers({ goalId: initialGoal._id, limit: 15, page: 1 });
            setTransfers(transfersRes.transfers || []);
            setPage(2);
            setHasMore((transfersRes.transfers || []).length >= 15);
        } catch (e) {
            if (e.response?.status !== 403) console.warn('[GoalDetail] load error:', e.message);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [initialGoal._id]);

    const fetchMore = async () => {
        if (!hasMore || loadingMore) return;
        setLoadingMore(true);
        try {
            const res = await getSavingsTransfers({ goalId: initialGoal._id, limit: 15, page });
            if (res.transfers?.length > 0) {
                setTransfers(prev => {
                    const existingIds = new Set(prev.map(t => t._id));
                    const uniqueNew = res.transfers.filter(t => !existingIds.has(t._id));
                    return [...prev, ...uniqueNew];
                });
                setPage(prev => prev + 1);
                setHasMore(res.transfers.length >= 15);
            } else {
                setHasMore(false);
            }
        } catch (e) {
            // Ignore 403 during deletion transitions
            if (e.response?.status !== 403) console.warn('[FetchMore Detail Error]:', e);
        } finally {
            setLoadingMore(false);
        }
    };

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        if (!userInfo?._id) return;
        connectSocket(userInfo._id);
        const socket = getSocket();

        const handleUpdate = () => {
            debouncedRefreshSavings();
            debouncedRefreshSummary();
            // Still need to refresh local transfers history manually
            load();
        };

        socket.on('update_savings_goal', handleUpdate);
        socket.on('new_savings_transfer', handleUpdate);
        socket.on('delete_savings_goal', (data) => {
            if (data._id === initialGoal._id && navigation.isFocused()) {
                if (navigation.canGoBack()) navigation.goBack();
            }
        });

        return () => {
            socket.off('update_savings_goal', handleUpdate);
            socket.off('new_savings_transfer', handleUpdate);
            socket.off('delete_savings_goal');
        };
    }, [userInfo?._id, initialGoal._id, navigation]);

    // Guard: goal may be briefly undefined during navigation transitions
    const safeGoal = goal || initialGoal;
    const pct = safeGoal.targetAmount > 0 ? Math.min((safeGoal.currentAmount / safeGoal.targetAmount) * 100, 100) : 0;
    const daysLeft = getDaysLeft(safeGoal.deadline);

    const handleComplete = () => setCompleteModalVisible(true);

    const executeComplete = async (mode) => {
        setCompleteModalVisible(false);
        setFinishing(true);
        try {
            await completeSavingsGoal(goal._id, { mode });
            load();
            setAlertConfig({
                visible: true,
                title: mode === 'spend' ? 'Goal Spent! 🎉' : 'Funds Returned! 💰',
                message: mode === 'spend'
                    ? `Awesome! "${goal.name}" has been recorded as a successful expense.`
                    : `Done! Your savings from "${goal.name}" are back in your wallet.`,
                type: 'success'
            });
        } catch (e) {
            setAlertConfig({
                visible: true,
                title: 'Error',
                message: e.response?.data?.error || 'Failed to complete goal.',
                type: 'error'
            });
        } finally {
            setFinishing(false);
        }
    };

    const handleDelete = () => {
        const hasFunds = goal.currentAmount > 0;
        setAlertConfig({
            visible: true,
            title: hasFunds ? 'Delete & Refund?' : 'Delete Goal?',
            message: hasFunds
                ? `This goal has a remaining balance of ${formatCurrency(goal.currentAmount, userInfo?.currency)}. It will be automatically returned to your Savings Balance upon deletion.`
                : 'This goal and all its transfer history will be deleted. Are you sure?',
            type: hasFunds ? 'info' : 'confirm',
            confirmText: 'Delete',
            onConfirm: async () => {
                setAlertConfig(p => ({ ...p, visible: false }));
                await deleteSavingsGoal(goal._id);
                if (navigation.canGoBack()) navigation.goBack();
            }
        });
    };

    const renderHeader = () => (
        <View style={{ paddingBottom: spacing.md }}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backBtn, { backgroundColor: COLORS.surface }]}>
                    <Feather name="arrow-left" size={20} color={COLORS.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: COLORS.text }]} numberOfLines={1}>{goal.name}</Text>
                <TouchableOpacity onPress={handleDelete} style={[styles.backBtn, { backgroundColor: COLORS.surface }]}>
                    <Feather name="trash-2" size={18} color="#ef4444" />
                </TouchableOpacity>
            </View>

            <LinearGradient
                colors={[goal.isCompleted ? '#22c55e' : (goal.color || '#E91E8C'), (goal.isCompleted ? '#16a34a' : (goal.color || '#E91E8C')) + '88']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={styles.goalHero}
            >
                <View style={styles.heroIcon}>
                    <IconRenderer name={goal.icon || 'target'} family={goal.family} size={32} color="#fff" />
                </View>
                <Text style={styles.heroSaved}>{formatCurrency(goal.currentAmount, userInfo?.currency)}</Text>
                <Text style={styles.heroLabel}>{goal.isCompleted ? 'total successfully saved!' : `saved of ${formatCurrency(goal.targetAmount, userInfo?.currency)}`}</Text>
                <View style={styles.heroBarBg}>
                    <View style={[styles.heroBarFill, { width: `${pct}%` }]} />
                </View>
                <View style={styles.heroFooter}>
                    <Text style={styles.heroFooterTxt}>{goal.isCompleted ? 'Goal Successfully Completed!' : `${Math.round(pct)}% complete`}</Text>
                    {daysLeft !== null && !goal.isCompleted && (
                        <Text style={styles.heroFooterTxt}>
                            {daysLeft > 0 ? `${daysLeft} days left` : daysLeft === 0 ? 'Due today' : 'Past deadline'}
                        </Text>
                    )}
                </View>
            </LinearGradient>

            {pct >= 100 && (!goal.isCompleted || goal.currentAmount > 0) && (
                <TouchableOpacity
                    onPress={handleComplete}
                    style={[styles.completeBtn, { borderStyle: 'dashed', borderWidth: 2, borderColor: '#22c55e' }]}
                    activeOpacity={0.8}
                >
                    <LinearGradient colors={['#22c55e', '#16a34a']} style={styles.completeBtnContent}>
                        <View style={styles.completeBtnIcon}><Feather name="award" size={24} color="#fff" /></View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.completeBtnTitle}>Goal Reached! 🎉</Text>
                            <Text style={styles.completeBtnSub}>Click here to spend or use your savings</Text>
                        </View>
                        <Feather name="chevron-right" size={20} color="#fff" />
                    </LinearGradient>
                </TouchableOpacity>
            )}

            <View style={[styles.detailsCard, { backgroundColor: COLORS.surface }]}>
                <View style={[styles.infoRow, { backgroundColor: COLORS.background + '80' }]}>
                    <View style={styles.infoCell}>
                        <Text style={[styles.infoLabel, { color: COLORS.textMuted }]}>TARGET</Text>
                        <Text style={[styles.infoVal, { color: COLORS.text }]}>{formatCurrency(goal.targetAmount, userInfo?.currency)}</Text>
                    </View>
                    <View style={[styles.infoDivider, { backgroundColor: COLORS.border }]} />
                    <View style={styles.infoCell}>
                        <Text style={[styles.infoLabel, { color: COLORS.textMuted }]}>REMAINING</Text>
                        <Text style={[styles.infoVal, { color: COLORS.primary }]}>{formatCurrency(Math.max(0, goal.targetAmount - goal.currentAmount), userInfo?.currency)}</Text>
                    </View>
                    <View style={[styles.infoDivider, { backgroundColor: COLORS.border }]} />
                    <View style={styles.infoCell}>
                        <Text style={[styles.infoLabel, { color: COLORS.textMuted }]}>DEADLINE</Text>
                        <Text style={[styles.infoVal, { color: COLORS.text }]}>{formatDate(goal.deadline) || 'No deadline'}</Text>
                    </View>
                </View>

                {(!goal.isCompleted || goal.currentAmount > 0) ? (
                    <View style={styles.actionRow}>
                        {!goal.isCompleted && (
                            <TouchableOpacity
                                style={[styles.actionBtn, { backgroundColor: COLORS.primary }]}
                                onPress={() => navigation.navigate('SavingsTransfer', { goal, direction: 'to_savings', fromSavings: true })}
                            >
                                <Feather name="arrow-down-circle" size={18} color="#fff" />
                                <Text style={styles.actionBtnText}>Add Money</Text>
                            </TouchableOpacity>
                        )}
                        {/* Only owner can withdraw from shared goal */}
                        {(goal.user?._id === userInfo._id || goal.user === userInfo._id) ? (
                            <TouchableOpacity
                                style={[goal.isCompleted ? styles.actionBtn : styles.actionBtnOutline, { backgroundColor: goal.isCompleted ? COLORS.primary : 'transparent', borderColor: COLORS.primary, marginLeft: !goal.isCompleted ? spacing.md : 0 }]}
                                onPress={() => navigation.navigate('SavingsTransfer', { goal, direction: 'from_savings', fromSavings: true })}
                            >
                                <Feather name="arrow-up-circle" size={18} color={goal.isCompleted ? '#fff' : COLORS.primary} />
                                <Text style={[styles.actionBtnText, { color: goal.isCompleted ? '#fff' : COLORS.primary }]}>Withdraw</Text>
                            </TouchableOpacity>
                        ) : (
                            <View style={[styles.actionBtnDisabled, { marginLeft: !goal.isCompleted ? spacing.md : 0, borderColor: COLORS.border, borderWidth: 1 }]}>
                                <Feather name="lock" size={16} color={COLORS.textMuted} />
                                <Text style={[styles.actionBtnText, { color: COLORS.textMuted }]}>Withdraw</Text>
                            </View>
                        )}
                    </View>
                ) : (
                    <View style={[styles.archivedBanner, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
                        <View style={styles.archivedIconBg}><Feather name="award" size={22} color={COLORS.primary} /></View>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.archivedTitle, { color: COLORS.text }]}>Goal Finalized! 🎉</Text>
                            <Text style={[styles.archivedSub, { color: COLORS.textMuted }]}>This goal has been successfully completed and all funds processed.</Text>
                        </View>
                    </View>
                )}
            </View>

            {goal.isShared && (
                <View style={[styles.detailsCard, { backgroundColor: COLORS.surface, marginTop: -spacing.md }]}>
                    <Text style={[styles.sectionTitle, { color: COLORS.textMuted, marginBottom: 12 }]}>PARTICIPANTS</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                        {/* Owner */}
                        <View style={styles.participantItem}>
                            <View style={[styles.avatarSmall, { borderColor: COLORS.primary, borderWidth: 1.5 }]}>
                                {goal.user?.avatar || goal.user?.avatarUrl ? (
                                    <Image
                                        source={{
                                            uri: (goal.user.avatar || goal.user.avatarUrl).startsWith('http')
                                                ? (goal.user.avatar || goal.user.avatarUrl)
                                                : `${API_BASE.replace('/api', '')}/${goal.user.avatar || goal.user.avatarUrl}`
                                        }}
                                        style={styles.avatarImg}
                                        resizeMode="cover"
                                    />
                                ) : (
                                    <Feather name="user" size={12} color={COLORS.text} />
                                )}
                                <View style={styles.ownerBadge}><Text style={styles.ownerBadgeText}>★</Text></View>
                            </View>
                            <Text style={[styles.participantName, { color: COLORS.text }]} numberOfLines={1}>{goal.user?.name || 'Owner'}</Text>
                        </View>
                        {/* Accepted Participants */}
                        {goal.participants?.filter(p => p.status === 'accepted').map(p => (
                            <View key={p.user?._id} style={styles.participantItem}>
                                <View style={styles.avatarSmall}>
                                    {p.user?.avatar || p.user?.avatarUrl ? (
                                        <Image
                                            source={{
                                                uri: (p.user.avatar || p.user.avatarUrl).startsWith('http')
                                                    ? (p.user.avatar || p.user.avatarUrl)
                                                    : `${API_BASE.replace('/api', '')}/${p.user.avatar || p.user.avatarUrl}`
                                            }}
                                            style={styles.avatarImg}
                                            resizeMode="cover"
                                        />
                                    ) : (
                                        <Feather name="user" size={12} color={COLORS.text} />
                                    )}
                                </View>
                                <Text style={[styles.participantName, { color: COLORS.text }]} numberOfLines={1}>{p.user?.name || 'Member'}</Text>
                            </View>
                        ))}
                    </View>
                </View>
            )}

            <Text style={[styles.sectionTitle, { color: COLORS.textMuted, marginHorizontal: spacing.lg }]}>RECENT TRANSFERS</Text>
        </View>
    );

    return (
        <SafeAreaView style={styles.safe}>
            <FlatList
                data={transfers}
                renderItem={({ item: t }) => {
                    const isDeposit = t.direction === 'to_savings' || t.direction === 'income' || t.direction === 'transfer_goal';
                    const color = isDeposit ? '#22c55e' : '#f59e0b';
                    return (
                        <TouchableOpacity
                            style={{ marginHorizontal: spacing.lg }}
                            activeOpacity={0.7}
                            onPress={() => {
                                setSelectedTransfer(t);
                                setModalVisible(true);
                            }}
                        >
                            <View style={[styles.txRow, { backgroundColor: COLORS.surface }]}>
                                <View style={[styles.txIcon, { backgroundColor: color + '20' }]}>
                                    <Feather name={isDeposit ? 'arrow-down-circle' : 'arrow-up-circle'} size={16} color={color} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.txLabel, { color: COLORS.text }]}>
                                        {t.direction === 'to_savings' ? 'Saved to Pot' : (t.direction === 'transfer_goal' ? 'Goal Transfer' : (t.direction === 'income' ? 'Savings Income' : 'Withdrawn'))}
                                    </Text>
                                    {t.performedBy && t.performedBy?._id !== userInfo?._id && (
                                        <Text style={[styles.contributorName, { color: COLORS.primary }]}>by {t.performedBy.name}</Text>
                                    )}
                                    <Text style={[styles.txDate, { color: COLORS.textMuted }]}>
                                        {new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(t.createdAt))}
                                    </Text>
                                </View>
                                <View style={{ alignItems: 'flex-end' }}>
                                    <Text style={[styles.txAmt, { color }]}>
                                        {isDeposit ? '+' : '-'}{formatCurrency(t.amount, userInfo?.currency)}
                                    </Text>
                                    {t.runningBalance !== undefined && (
                                        <Text style={[styles.txBalance, { color: COLORS.textMuted }]}>Bal: {formatCurrency(t.runningBalance, userInfo?.currency)}</Text>
                                    )}
                                </View>
                            </View>
                        </TouchableOpacity>
                    );
                }}
                keyExtractor={(item, index) => `${item._id}-${index}`}
                ListHeaderComponent={renderHeader}
                ListFooterComponent={
                    loadingMore ? <ActivityIndicator color={COLORS.primary} style={{ padding: 20 }} /> :
                        transfers.length === 0 && !loading ? <Text style={[styles.noTx, { color: COLORS.textMuted }]}>No transfers yet</Text> :
                            <View style={{ height: 100 }} />
                }
                onEndReached={fetchMore}
                onEndReachedThreshold={0.5}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={COLORS.primary} />}
                contentContainerStyle={{ paddingBottom: 40 }}
                showsVerticalScrollIndicator={false}
            />

            <BottomSheetModal visible={completeModalVisible} onClose={() => setCompleteModalVisible(false)} title="Goal Achieved! 🎉">
                <Text style={{ fontSize: 14, color: COLORS.textMuted, textAlign: 'center', marginBottom: 24, paddingHorizontal: 20 }}>
                    Congratulations on reaching your target! How would you like to handle your savings?
                </Text>
                <View style={{ gap: 12, paddingBottom: 20 }}>
                    <TouchableOpacity style={[styles.choiceBtn, { backgroundColor: '#22c55e' }]} onPress={() => executeComplete('spend')}>
                        <View style={styles.choiceIcon}><Feather name="shopping-bag" size={20} color="#fff" /></View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.choiceTitle}>Mark as Spent</Text>
                            <Text style={styles.choiceSub}>Log as an expense and archive goal</Text>
                        </View>
                        <Feather name="chevron-right" size={18} color="rgba(255,255,255,0.7)" />
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.choiceBtn, { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border }]} onPress={() => executeComplete('return')}>
                        <View style={[styles.choiceIcon, { backgroundColor: COLORS.primary + '20' }]}><Feather name="corner-up-left" size={20} color={COLORS.primary} /></View>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.choiceTitle, { color: COLORS.text }]}>Back to Wallet</Text>
                            <Text style={[styles.choiceSub, { color: COLORS.textMuted }]}>Return funds to your main balance</Text>
                        </View>
                        <Feather name="chevron-right" size={18} color={COLORS.textMuted} />
                    </TouchableOpacity>
                </View>
            </BottomSheetModal>

            {/* Transfer Detail Modal */}
            <Modal
                visible={modalVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setModalVisible(false)}
            >
                <TouchableWithoutFeedback onPress={() => setModalVisible(false)}>
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
                                                <TouchableOpacity onPress={() => setModalVisible(false)}>
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
                                                        <Text style={[styles.modalDetailValue, { color: COLORS.text }]}>
                                                            {new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(selectedTransfer.createdAt))}
                                                        </Text>
                                                    </View>

                                                    {/* Payment Source — shown for deposits AND wallet withdrawals */}
                                                    {(isDeposit || selectedTransfer.direction === 'from_savings') && (
                                                        <View style={styles.modalDetailRow}>
                                                            <Text style={[styles.modalDetailLabel, { color: COLORS.textMuted }]}>
                                                                {isDeposit ? 'Payment Source' : 'Destination Wallet'}
                                                            </Text>
                                                            <View style={[styles.walletBadge, { backgroundColor: (selectedTransfer.wallet?.color || COLORS.primary) + '20' }]}>
                                                                <Text style={[styles.walletBadgeText, { color: selectedTransfer.wallet?.color || COLORS.primary }]}>
                                                                    {selectedTransfer.wallet
                                                                        ? `${selectedTransfer.wallet.name} (${selectedTransfer.wallet.type})`
                                                                        : (isGoal ? 'Internal Transfer' : 'Main Balance')}
                                                                </Text>
                                                            </View>
                                                        </View>
                                                    )}

                                                    {selectedTransfer.walletAmount !== null && selectedTransfer.walletAmount !== undefined && (
                                                        <View style={[styles.modalDetailRow, { borderBottomWidth: 0 }]}>
                                                            <Text style={[styles.modalDetailLabel, { color: COLORS.textMuted }]}>Native Cost</Text>
                                                            <Text style={[styles.modalDetailValue, { color: COLORS.text, fontWeight: '700' }]}>
                                                                {selectedTransfer.walletAmount.toLocaleString(undefined, { maximumFractionDigits: 8 })} {selectedTransfer.walletCurrency}
                                                            </Text>
                                                        </View>
                                                    )}

                                                    {selectedTransfer.note ? (
                                                        <View style={[styles.modalDetailRow, { alignItems: 'flex-start' }]}>
                                                            <Text style={[styles.modalDetailLabel, { color: COLORS.textMuted, marginBottom: 4 }]}>Note</Text>
                                                            <Text style={[styles.modalDetailValue, { color: COLORS.text }]}>{selectedTransfer.note}</Text>
                                                        </View>
                                                    ) : null}

                                                    {selectedTransfer.performedBy && (
                                                        <View style={[styles.modalDetailRow, { borderBottomWidth: 0, paddingTop: 12 }]}>
                                                            <Text style={[styles.modalDetailLabel, { color: COLORS.textMuted }]}>Contributor</Text>
                                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                                <Text style={[styles.modalDetailValue, { color: COLORS.primary }]}>{selectedTransfer.performedBy.name}</Text>
                                                                <Feather name="user" size={12} color={COLORS.primary} />
                                                            </View>
                                                        </View>
                                                    )}
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

            <CustomAlertModal
                visible={alertConfig.visible} title={alertConfig.title} message={alertConfig.message} type={alertConfig.type} confirmText={alertConfig.confirmText}
                onConfirm={alertConfig.onConfirm || (() => setAlertConfig(p => ({ ...p, visible: false })))}
                onClose={() => setAlertConfig(p => ({ ...p, visible: false }))}
            />
        </SafeAreaView>
    );
}

const getStyles = (COLORS) => StyleSheet.create({
    safe: { flex: 1, backgroundColor: COLORS.background },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg, paddingHorizontal: spacing.lg },
    backBtn: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    headerTitle: { fontSize: 17, fontWeight: '800', flex: 1, textAlign: 'center', marginHorizontal: 8 },
    goalHero: { borderRadius: radius.xl, padding: spacing.lg, alignItems: 'center', marginBottom: spacing.md, marginHorizontal: spacing.lg },
    heroIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center', marginBottom: spacing.md },
    heroSaved: { fontSize: 40, fontWeight: '900', color: '#fff' },
    heroLabel: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginBottom: spacing.md },
    heroBarBg: { width: '100%', height: 8, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
    heroBarFill: { height: '100%', backgroundColor: '#fff', borderRadius: 4 },
    heroFooter: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
    heroFooterTxt: { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '700' },
    completeBtn: { marginHorizontal: spacing.lg, marginBottom: spacing.lg, borderRadius: radius.xl, overflow: 'hidden', ...shadow.medium },
    completeBtnContent: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, gap: 16 },
    completeBtnIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
    completeBtnTitle: { color: '#fff', fontSize: 16, fontWeight: '900' },
    completeBtnSub: { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '600', marginTop: 2 },
    detailsCard: { marginHorizontal: spacing.lg, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.lg },
    infoRow: { flexDirection: 'row', borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
    infoCell: { flex: 1, alignItems: 'center' },
    infoDivider: { width: 1, marginHorizontal: spacing.xs },
    infoLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginBottom: 4 },
    infoVal: { fontSize: 13, fontWeight: '800' },
    actionRow: { flexDirection: 'row', gap: 12 },
    actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: radius.xl },
    actionBtnOutline: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: radius.xl, borderWidth: 2 },
    actionBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
    sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: spacing.sm },
    noTx: { fontSize: 13, textAlign: 'center', paddingVertical: 40 },
    txRow: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.xs, gap: 12 },
    txIcon: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
    txLabel: { fontWeight: '700', fontSize: 14 },
    txDate: { fontSize: 11, marginTop: 2 },
    txAmt: { fontWeight: '800', fontSize: 15 },
    txBalance: { fontSize: 10, fontWeight: '600', marginTop: 2, textAlign: 'right' },
    choiceBtn: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: radius.xl, gap: 16 },
    choiceIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
    choiceTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
    choiceSub: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '600' },
    archivedBanner: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, borderRadius: radius.xl, borderWidth: 1, marginTop: spacing.sm, marginBottom: spacing.lg },
    archivedIconBg: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.primary + '15', justifyContent: 'center', alignItems: 'center', marginRight: spacing.md },
    archivedTitle: { fontSize: 16, fontWeight: '800', marginBottom: 2 },
    archivedSub: { fontSize: 13, lineHeight: 18 },

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
    modalDetailValue: { fontSize: 13, fontWeight: '700' },
    walletBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    walletBadgeText: { fontSize: 11, fontWeight: '800' },
    participantItem: { width: 60, alignItems: 'center' },
    avatarSmall: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.05)', justifyContent: 'center', alignItems: 'center', marginBottom: 4, overflow: 'hidden' },
    avatarImg: { width: '100%', height: '100%' },
    participantName: { fontSize: 10, fontWeight: '700', textAlign: 'center' },
    ownerBadge: { position: 'absolute', bottom: -2, right: -2, width: 14, height: 14, borderRadius: 7, backgroundColor: '#E91E8C', justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: '#fff' },
    ownerBadgeText: { color: '#fff', fontSize: 8, fontWeight: '900' },
    actionBtnDisabled: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: radius.xl, opacity: 0.6 },
    contributorName: { fontSize: 11, fontWeight: '700', marginTop: -2, marginBottom: 2 },
});
