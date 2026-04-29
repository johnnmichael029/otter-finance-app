import React, { useState, useCallback, useEffect } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, RefreshControl, ActivityIndicator
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import SwipeableRow from '../../components/SwipeableRow';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useFinanceStore } from '../../store/financeStore';
import { spacing, radius, shadow } from '../../theme/colors';
import CustomAlertModal from '../../components/CustomAlertModal';
import { formatCurrency } from '../../utils/formatters';
import { getDebts, updateDebt, deleteDebt, emptyDebtArchives } from '../../api/api';
import { triggerHaptic } from '../../utils/haptics';

export default function DebtArchiveScreen({ navigation }) {
    const COLORS = useTheme(state => state.COLORS);
    const { userInfo } = useAuth();
    const hapticsEnabled = userInfo?.hapticsEnabled;
    const styles = getStyles(COLORS);

    const [archivedDebts, setArchivedDebts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [alertConfig, setAlertConfig] = useState({ visible: false, title: '', message: '', type: 'info', onConfirm: null });

    const loadData = useCallback(async () => {
        try {
            setRefreshing(true);
            const res = await getDebts({ isArchived: true, limit: 100 });
            setArchivedDebts(res.data || []);
        } catch (e) {
            console.error('Load debt archives failed:', e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const handleRestoreDebt = async (id) => {
        // Optimistic UI Update: Remove from list immediately
        setArchivedDebts(prev => prev.filter(d => d._id !== id));

        try {
            triggerHaptic(hapticsEnabled, 'impactLight');
            await updateDebt(id, { isArchived: false });
            // Background refresh of the global finance store
            useFinanceStore.getState().debouncedRefreshDebts(true);
        } catch (e) {
            console.error('Restore debt failed:', e);
            // Rollback on error
            loadData();
        }
    };

    const handleDeleteDebt = async (debt, skipModal = false) => {
        const executeDelete = async () => {
            // Optimistic UI Update: Remove from list immediately
            setArchivedDebts(prev => prev.filter(d => d._id !== debt._id));

            try {
                setRefreshing(true);
                await deleteDebt(debt._id);
                useFinanceStore.getState().debouncedRefreshDebts(true);
                setAlertConfig(p => ({ ...p, visible: false }));
            } catch (e) {
                console.error('Delete debt failed:', e);
                // Rollback on error
                loadData();
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
            title: 'Delete Debt',
            message: `Are you sure you want to permanently delete the debt for "${debt.personName}"? This action cannot be undone.`,
            type: 'danger',
            onConfirm: executeDelete
        });
    };

    const handleEmptyArchives = () => {
        if (archivedDebts.length === 0) return;

        setAlertConfig({
            visible: true,
            title: 'Empty Archives?',
            message: `This will permanently delete all ${archivedDebts.length} archived debts. This action cannot be undone.`,
            type: 'danger',
            onConfirm: async () => {
                // Optimistic clear
                setArchivedDebts([]);
                setAlertConfig(p => ({ ...p, visible: false }));

                try {
                    setRefreshing(true);
                    await emptyDebtArchives();
                    // Background refresh of global store
                    useFinanceStore.getState().debouncedRefreshDebts(true);
                    await loadData();
                } catch (err) {
                    console.error('Empty archives failed:', err);
                    loadData(); // Rollback/Restore if failed
                } finally {
                    setRefreshing(false);
                }
            }
        });
    };

    const renderDebtCard = ({ item: debt }) => {
        const remaining = debt.amount - debt.amountPaid;
        const progress = debt.amount > 0 ? Math.min(1, debt.amountPaid / debt.amount) : 0;
        const isOwedToMe = debt.direction === 'owed_to_me';

        return (
            <SwipeableRow
                key={debt._id}
                rightAction={{
                    color: COLORS.primary,
                    icon: 'archive-arrow-up-outline',
                    iconFamily: 'MaterialCommunityIcons',
                    label: 'Restore',
                    onPress: () => handleRestoreDebt(debt._id)
                }}
                leftAction={{
                    color: '#ef4444',
                    icon: 'trash-2',
                    label: 'Delete',
                    onPress: () => handleDeleteDebt(debt, true)
                }}
                containerStyle={{ marginBottom: spacing.md }}
            >
                <View style={[styles.debtCard, { backgroundColor: COLORS.surface, marginBottom: 0 }]}>
                    <View style={styles.debtHeader}>
                        <View style={[styles.debtIconBox, { backgroundColor: (isOwedToMe ? '#8b5cf6' : '#f59e0b') + '15' }]}>
                            <MaterialCommunityIcons
                                name={isOwedToMe ? 'cash-plus' : 'credit-card-clock-outline'}
                                size={20}
                                color={isOwedToMe ? '#8b5cf6' : '#f59e0b'}
                            />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.debtName, { color: COLORS.text }]}>{debt.personName}</Text>
                            <Text style={[styles.debtSub, { color: COLORS.textMuted }]}>
                                {formatCurrency(remaining)} remaining of {formatCurrency(debt.amount)}
                            </Text>
                        </View>
                        <View style={styles.statusBadge}>
                            <Text style={[styles.statusText, { color: COLORS.textMuted }]}>Archived</Text>
                        </View>
                    </View>
                    <View style={styles.barContainer}>
                        <View style={[styles.barFill, { width: `${progress * 100}%`, backgroundColor: isOwedToMe ? '#8b5cf6' : '#f59e0b' }]} />
                    </View>
                </View>
            </SwipeableRow>
        );
    };

    return (
        <SafeAreaView style={styles.safe}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Feather name="arrow-left" size={24} color={COLORS.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: COLORS.text }]}>Archived Debts</Text>
                <TouchableOpacity onPress={handleEmptyArchives} disabled={archivedDebts.length === 0}>
                    <Feather name="trash-2" size={22} color={archivedDebts.length > 0 ? '#ef4444' : COLORS.textMuted} />
                </TouchableOpacity>
            </View>

            {loading ? (
                <View style={styles.centered}><ActivityIndicator color={COLORS.primary} /></View>
            ) : (
                <FlashList
                    data={archivedDebts}
                    renderItem={renderDebtCard}
                    keyExtractor={item => item._id}
                    contentContainerStyle={styles.listContent}
                    estimatedItemSize={100}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadData} tintColor={COLORS.primary} />}
                    ListEmptyComponent={() => (
                        <View style={styles.emptyContainer}>
                            <View style={[styles.emptyIconBox, { backgroundColor: COLORS.surface }]}>
                                <Feather name="archive" size={48} color={COLORS.textMuted} />
                            </View>
                            <Text style={[styles.emptyTitle, { color: COLORS.text }]}>No archived debts</Text>
                            <Text style={[styles.emptySub, { color: COLORS.textMuted }]}>Debts you archive will appear here.</Text>
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
    debtCard: {
        padding: spacing.md, borderRadius: radius.xl, marginBottom: spacing.md,
        ...shadow.small
    },
    debtHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
    debtIconBox: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
    debtName: { fontSize: 16, fontWeight: '700' },
    debtSub: { fontSize: 12, marginTop: 2 },
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
