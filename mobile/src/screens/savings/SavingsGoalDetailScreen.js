import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    ActivityIndicator, RefreshControl, Alert, FlatList
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { getSavingsGoals, deleteSavingsGoal, getSavingsTransfers, completeSavingsGoal } from '../../api/api';
import BottomSheetModal from '../../components/BottomSheetModal';
import { spacing, radius, shadow } from '../../theme/colors';
import { getSocket, connectSocket } from '../../utils/socket';
import CustomAlertModal from '../../components/CustomAlertModal';

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
    const { COLORS, isDarkMode } = useTheme();
    const { userInfo } = useAuth();
    const styles = getStyles(COLORS);

    const [goal, setGoal] = useState(initialGoal);
    const [transfers, setTransfers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [completeModalVisible, setCompleteModalVisible] = useState(false);
    const [finishing, setFinishing] = useState(false);
    const [alertConfig, setAlertConfig] = useState({ visible: false, title: '', message: '', type: 'info', onConfirm: null });

    // Infinite Scroll State
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);

    const load = useCallback(async () => {
        try {
            setRefreshing(true);
            const [goalsRes, transfersRes] = await Promise.all([
                getSavingsGoals(),
                getSavingsTransfers({ goalId: initialGoal._id, limit: 15, page: 1 }),
            ]);
            const updated = (goalsRes.goals || []).find(g => g._id === initialGoal._id);
            if (updated) setGoal(updated);
            
            setTransfers(transfersRes.transfers || []);
            setPage(2);
            setHasMore((transfersRes.transfers || []).length >= 15);
        } catch (e) {
            console.warn(e.message);
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
            console.warn('[FetchMore Detail Error]:', e);
        } finally {
            setLoadingMore(false);
        }
    };

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        if (!userInfo?._id) return;
        const socket = getSocket() || connectSocket(userInfo._id);

        const handleUpdate = () => { load(); };

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
    }, [userInfo?._id, load, initialGoal._id, navigation]);

    const pct = goal.targetAmount > 0 ? Math.min((goal.currentAmount / goal.targetAmount) * 100, 100) : 0;
    const daysLeft = getDaysLeft(goal.deadline);

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
                            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: COLORS.primary }]} onPress={() => navigation.navigate('SavingsTransfer', { goal, direction: 'to_savings', fromSavings: true })}>
                                <Feather name="arrow-down-circle" size={18} color="#fff" /><Text style={styles.actionBtnText}>Add Money</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity
                            style={[goal.isCompleted ? styles.actionBtn : styles.actionBtnOutline, { backgroundColor: goal.isCompleted ? COLORS.primary : 'transparent', borderColor: COLORS.primary, marginLeft: !goal.isCompleted ? spacing.md : 0 }]}
                            onPress={() => navigation.navigate('SavingsTransfer', { goal, direction: 'from_savings', fromSavings: true })}
                        >
                            <Feather name="arrow-up-circle" size={18} color={goal.isCompleted ? '#fff' : COLORS.primary} />
                            <Text style={[styles.actionBtnText, { color: goal.isCompleted ? '#fff' : COLORS.primary }]}>Withdraw</Text>
                        </TouchableOpacity>
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
                        <View style={{ marginHorizontal: spacing.lg }}>
                            <View style={[styles.txRow, { backgroundColor: COLORS.surface }]}>
                                <View style={[styles.txIcon, { backgroundColor: color + '20' }]}>
                                    <Feather name={isDeposit ? 'arrow-down-circle' : 'arrow-up-circle'} size={16} color={color} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.txLabel, { color: COLORS.text }]}>{isDeposit ? 'Deposited' : 'Withdrawn'}</Text>
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
                        </View>
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
    archivedSub: { fontSize: 13, lineHeight: 18 }
});
