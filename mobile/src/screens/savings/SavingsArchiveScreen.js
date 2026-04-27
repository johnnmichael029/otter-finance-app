import React, { useState, useCallback, useEffect } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, FlatList, RefreshControl, ActivityIndicator
} from 'react-native';
import Reanimated, { ZoomIn, ZoomOut, LinearTransition } from 'react-native-reanimated';
import { Swipeable } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useFinanceStore } from '../../store/financeStore';
import { spacing, radius, shadow } from '../../theme/colors';
import CustomAlertModal from '../../components/CustomAlertModal';
import { formatCurrency, IconRenderer } from '../../utils/formatters';
import { updateSavingsGoal, deleteSavingsGoal, emptySavingsGoalArchives } from '../../api/api';
import { triggerHaptic } from '../../utils/haptics';

export default function SavingsArchiveScreen({ navigation }) {
    const COLORS = useTheme(state => state.COLORS);
    const { userInfo, hapticsEnabled } = useAuth();
    const styles = getStyles(COLORS);

    const { refreshAll } = useFinanceStore.getState();
    const [archivedGoals, setArchivedGoals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [alertConfig, setAlertConfig] = useState({ visible: false, title: '', message: '', type: 'info', onConfirm: null });

    const loadData = useCallback(async () => {
        try {
            setRefreshing(true);
            const { getSavingsGoals } = require('../../api/api');
            const res = await getSavingsGoals({ isArchived: true });
            setArchivedGoals(res.goals || []);
        } catch (e) {
            console.error('Load archives failed:', e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const handleRestoreGoal = async (id) => {
        try {
            triggerHaptic(hapticsEnabled, 'impactLight');
            await updateSavingsGoal(id, { isArchived: false });
            refreshAll(true);
            loadData();
        } catch (e) {
            console.error('Restore goal failed:', e);
        }
    };

    const handleDeleteGoal = async (id, skipModal = false) => {
        const executeDelete = async () => {
            try {
                setRefreshing(true);
                await deleteSavingsGoal(id);
                refreshAll(true);
                loadData();
                setAlertConfig(p => ({ ...p, visible: false }));
            } catch (e) {
                console.error('Delete goal failed:', e);
            } finally {
                setRefreshing(false);
            }
        };

        if (skipModal) {
            triggerHaptic(hapticsEnabled, 'impactHeavy');
            return executeDelete();
        }

        setAlertConfig({
            visible: true,
            title: 'Delete Goal',
            message: 'Are you sure you want to permanently delete this goal? This action cannot be undone.',
            type: 'danger',
            onConfirm: executeDelete
        });
    };

    const handleEmptyArchives = () => {
        if (archivedGoals.length === 0) return;

        setAlertConfig({
            visible: true,
            title: 'Empty Archives?',
            message: `This will permanently delete all ${archivedGoals.length} archived goals. This action cannot be undone.`,
            type: 'danger',
            onConfirm: async () => {
                try {
                    setRefreshing(true);
                    await emptySavingsGoalArchives();
                    refreshAll(true);
                    loadData();
                    setAlertConfig(p => ({ ...p, visible: false }));
                } catch (err) {
                    console.error('Empty archives failed:', err);
                } finally {
                    setRefreshing(false);
                }
            }
        });
    };

    const renderLeftActions = (goalId) => (
        <View style={styles.swipeActions}>
            <TouchableOpacity
                onPress={() => handleDeleteGoal(goalId, true)}
                style={[styles.swipeAction, { backgroundColor: '#ef4444' }]}
                activeOpacity={0.8}
            >
                <Feather name="trash-2" size={22} color="#fff" />
                <Text style={styles.swipeActionText}>Delete</Text>
            </TouchableOpacity>
        </View>
    );

    const renderRightActions = (goalId) => (
        <View style={styles.swipeActions}>
            <TouchableOpacity
                onPress={() => handleRestoreGoal(goalId)}
                style={[styles.swipeAction, { backgroundColor: COLORS.primary, marginLeft: 0 }]}
                activeOpacity={0.8}
            >
                <MaterialCommunityIcons name="archive-arrow-up-outline" size={24} color="#fff" />
                <Text style={styles.swipeActionText}>Restore</Text>
            </TouchableOpacity>
        </View>
    );

    const renderGoalCard = ({ item }) => {
        const pct = item.targetAmount > 0 ? Math.min((item.currentAmount / item.targetAmount) * 100, 100) : 0;

        return (
            <Reanimated.View entering={ZoomIn} exiting={ZoomOut} layout={LinearTransition}>
                <Swipeable
                    renderLeftActions={() => renderLeftActions(item._id)}
                    renderRightActions={() => renderRightActions(item._id)}
                    overshootLeft={false}
                    overshootRight={false}
                    onSwipeableOpen={(direction) => {
                        if (direction === 'left') {
                            handleDeleteGoal(item._id, true);
                        } else if (direction === 'right') {
                            handleRestoreGoal(item._id);
                        }
                    }}
                    leftThreshold={40}
                    rightThreshold={40}
                >
                    <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => navigation.navigate('SavingsGoalDetail', { goal: item })}
                        style={[styles.goalCard, { backgroundColor: COLORS.surface }]}
                    >
                        <View style={styles.goalHeader}>
                            <View style={[styles.goalIconBox, { backgroundColor: (item.color || COLORS.primary) + '15' }]}>
                                <IconRenderer name={item.icon || 'target'} family={item.family} size={20} color={item.color || COLORS.primary} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.goalName, { color: COLORS.text }]}>{item.name}</Text>
                                <Text style={[styles.goalSub, { color: COLORS.textMuted }]}>
                                    {formatCurrency(item.currentAmount, userInfo?.currency)} saved
                                </Text>
                            </View>
                            <View style={styles.statusBadge}>
                                <Text style={[styles.statusText, { color: COLORS.textMuted }]}>{item.isCompleted ? 'Completed' : 'Archived'}</Text>
                            </View>
                        </View>
                        <View style={styles.barContainer}>
                            <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: item.color || COLORS.primary }]} />
                        </View>
                    </TouchableOpacity>
                </Swipeable>
            </Reanimated.View>
        );
    };

    return (
        <SafeAreaView style={styles.safe}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Feather name="arrow-left" size={24} color={COLORS.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: COLORS.text }]}>Completed Goals</Text>
                <TouchableOpacity onPress={handleEmptyArchives} disabled={archivedGoals.length === 0}>
                    <Feather name="trash-2" size={22} color={archivedGoals.length > 0 ? '#ef4444' : COLORS.textMuted} />
                </TouchableOpacity>
            </View>

            {loading ? (
                <View style={styles.centered}><ActivityIndicator color={COLORS.primary} /></View>
            ) : (
                <FlatList
                    data={archivedGoals}
                    renderItem={renderGoalCard}
                    keyExtractor={item => item._id}
                    contentContainerStyle={styles.listContent}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadData} tintColor={COLORS.primary} />}
                    ListEmptyComponent={() => (
                        <View style={styles.emptyContainer}>
                            <View style={[styles.emptyIconBox, { backgroundColor: COLORS.surface }]}>
                                <Feather name="archive" size={48} color={COLORS.textMuted} />
                            </View>
                            <Text style={[styles.emptyTitle, { color: COLORS.text }]}>No completed goals</Text>
                            <Text style={[styles.emptySub, { color: COLORS.textMuted }]}>Goals you finish or archive will appear here.</Text>
                        </View>
                    )}
                />
            )}

            <CustomAlertModal
                visible={alertConfig.visible}
                title={alertConfig.title}
                message={alertConfig.message}
                type={alertConfig.type}
                onConfirm={alertConfig.onConfirm}
                onClose={() => setAlertConfig(p => ({ ...p, visible: false }))}
            />
        </SafeAreaView>
    );
}

const getStyles = (COLORS) => StyleSheet.create({
    safe: { flex: 1, backgroundColor: COLORS.background },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: spacing.lg, paddingVertical: spacing.md
    },
    backBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
    headerTitle: { fontSize: 20, fontWeight: '800', flex: 1, marginLeft: 12 },
    listContent: { padding: spacing.lg, paddingBottom: 100 },
    goalCard: {
        padding: spacing.md, borderRadius: radius.xl, marginBottom: spacing.md,
        ...shadow.small
    },
    goalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
    goalIconBox: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
    goalName: { fontSize: 16, fontWeight: '700' },
    goalSub: { fontSize: 12, marginTop: 2 },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.05)' },
    statusText: { fontSize: 10, fontWeight: '700' },
    barContainer: { height: 6, backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 3, overflow: 'hidden' },
    barFill: { height: '100%', borderRadius: 3 },
    swipeActions: { flexDirection: 'row', height: '100%', paddingBottom: spacing.md },
    swipeAction: {
        width: 80, height: '100%', justifyContent: 'center', alignItems: 'center',
        borderRadius: radius.xl, marginHorizontal: 4
    },
    swipeActionText: { color: '#fff', fontSize: 10, fontWeight: '800', marginTop: 4 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    emptyContainer: { alignItems: 'center', marginTop: 100, paddingHorizontal: 40 },
    emptyIconBox: { width: 100, height: 100, borderRadius: 50, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
    emptyTitle: { fontSize: 18, fontWeight: '800', marginBottom: 8 },
    emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
