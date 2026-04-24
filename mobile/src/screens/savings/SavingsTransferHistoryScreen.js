import React, { useState, useCallback, useEffect } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    ActivityIndicator, RefreshControl, Modal, TouchableWithoutFeedback,
    TextInput
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { getSavingsTransfers } from '../../api/api';
import { spacing, radius } from '../../theme/colors';
import Skeleton from '../../components/Skeleton';
import { useDebounce } from '../../utils/debounce';

const formatCurrency = (amount, currency = 'PHP') =>
    new Intl.NumberFormat('en-PH', { style: 'currency', currency }).format(amount);

const formatDateTime = (dateString, isLong = false) => {
    if (!dateString) return '';
    return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: isLong ? 'numeric' : undefined,
        hour: 'numeric',
        minute: '2-digit'
    }).format(new Date(dateString));
};

const formatDate = (dateString) => {
    if (!dateString) return '';
    return new Intl.DateTimeFormat('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
    }).format(new Date(dateString));
};

export default function SavingsTransferHistoryScreen({ navigation }) {
    const { COLORS } = useTheme();
    const { userInfo } = useAuth();
    const styles = getStyles(COLORS);

    const [transfers, setTransfers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [activeTab, setActiveTab] = useState('All');
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebounce(search, 400);

    // Modal State
    const [selectedTransfer, setSelectedTransfer] = useState(null);
    const [modalVisible, setModalVisible] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = { limit: 20, page: 1 };
            if (activeTab === 'In') params.type = 'in'; // Assuming backend handles this or we filter client side if not
            if (activeTab === 'Out') params.type = 'out';

            const res = await getSavingsTransfers(params);
            setTransfers(res.transfers || []);
            setPage(2);
            setHasMore((res.transfers || []).length >= 20);
        } catch (e) {
            console.warn(e.message);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [activeTab]);

    useEffect(() => { load(); }, [load]);

    const fetchMore = async () => {
        if (!hasMore || loadingMore) return;
        setLoadingMore(true);
        try {
            const params = { limit: 20, page };
            if (activeTab === 'In') params.type = 'in';
            if (activeTab === 'Out') params.type = 'out';

            const res = await getSavingsTransfers(params);
            const incoming = res.transfers || [];
            setTransfers(prev => {
                const seen = new Set(prev.map(t => t._id));
                return [...prev, ...incoming.filter(t => !seen.has(t._id))];
            });
            setPage(p => p + 1);
            if (incoming.length < 20) setHasMore(false);
        } catch (e) { } finally { setLoadingMore(false); }
    };

    const filtered = debouncedSearch.trim()
        ? transfers.filter(t =>
            t.goalName?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
            t.note?.toLowerCase().includes(debouncedSearch.toLowerCase())
        )
        : transfers;

    // Grouping by date
    const groups = {};
    for (const t of filtered) {
        const key = formatDate(t.createdAt);
        if (!groups[key]) groups[key] = { title: key, data: [] };
        groups[key].data.push(t);
    }
    const flatData = [];
    Object.values(groups).forEach(g => {
        flatData.push({ type: 'header', title: g.title, _id: `header-${g.title}` });
        g.data.forEach(item => flatData.push({ type: 'item', transaction: item, _id: item._id }));
    });

    const renderItem = ({ item }) => {
        if (item.type === 'header') {
            return (
                <View style={styles.sectionHeader}>
                    <Text style={[styles.sectionTitle, { color: COLORS.text }]}>{item.title}</Text>
                </View>
            );
        }

        const t = item.transaction;
        const isDeposit = t.direction === 'to_savings' || t.direction === 'income' || t.direction === 'transfer_goal';
        const isGoal = t.direction === 'transfer_goal';
        const color = isDeposit ? '#22c55e' : '#f59e0b';
        const icon = isDeposit ? 'plus-circle' : 'minus-circle';
        const label = t.direction === 'to_savings' ? 'Saved to Pot' : (isGoal ? 'Goal Transfer' : (t.direction === 'income' ? 'Savings Income' : 'Withdrawal'));

        return (
            <TouchableOpacity
                style={[styles.row, { backgroundColor: COLORS.surface }]}
                activeOpacity={0.7}
                onPress={() => {
                    setSelectedTransfer(t);
                    setModalVisible(true);
                }}
            >
                <View style={[styles.rowIcon, { backgroundColor: color + '15' }]}>
                    <Feather name={icon} size={18} color={color} />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={[styles.rowGoal, { color: COLORS.text }]}>{t.goalName}</Text>
                    <Text style={[styles.rowLabel, { color: COLORS.textMuted }]}>
                        {label}
                    </Text>
                    {t.note ? <Text style={[styles.rowNote, { color: COLORS.text }]} numberOfLines={1}>" {t.note} "</Text> : null}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.rowTime, { color: COLORS.textMuted }]}>
                        {new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(t.createdAt))}
                    </Text>
                    <Text style={[styles.rowAmt, { color }]}>
                        {isDeposit ? '+' : '-'}{formatCurrency(t.amount, userInfo?.currency)}
                    </Text>
                    {t.runningBalance !== undefined && (
                        <Text style={[styles.rowBalance, { color: COLORS.textMuted }]}>
                            Bal: {formatCurrency(t.runningBalance, userInfo?.currency)}
                        </Text>
                    )}
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView style={styles.safe}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backBtn, { backgroundColor: COLORS.surface }]}>
                    <Feather name="arrow-left" size={20} color={COLORS.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: COLORS.text }]}>Transfer History</Text>
                <View style={{ width: 40 }} />
            </View>

            <View style={styles.searchContainer}>
                <View style={styles.tabsRow}>
                    {['All', 'In', 'Out'].map(tab => {
                        const active = activeTab === tab;
                        return (
                            <TouchableOpacity
                                key={tab}
                                onPress={() => setActiveTab(tab)}
                                style={[styles.tab, active && { backgroundColor: COLORS.primary }]}
                            >
                                <Text style={[styles.tabText, { color: active ? '#fff' : COLORS.textMuted }]}>{tab}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
                <View style={[styles.searchRow, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
                    <Feather name="search" size={16} color={COLORS.textMuted} style={{ marginRight: 8 }} />
                    <TextInput
                        style={[styles.searchInput, { color: COLORS.text }]}
                        placeholder="Search transfers, notes..."
                        placeholderTextColor={COLORS.textMuted}
                        value={search}
                        onChangeText={setSearch}
                    />
                    {search.length > 0 && (
                        <TouchableOpacity onPress={() => setSearch('')}>
                            <Feather name="x" size={16} color={COLORS.textMuted} />
                        </TouchableOpacity>
                    )}
                </View>


            </View>

            {loading ? (
                <View style={styles.list}>
                    {[1, 2, 3, 4, 5, 6, 7].map(i => (
                        <View key={i} style={[styles.row, { backgroundColor: COLORS.surface, elevation: 0, shadowOpacity: 0, borderWidth: 1, borderColor: COLORS.border }]} pointerEvents="none">
                            <Skeleton width={40} height={40} borderRadius={20} style={{ marginRight: spacing.sm }} />
                            <View style={{ flex: 1 }}>
                                <Skeleton width={110} height={14} style={{ marginBottom: 6 }} />
                                <Skeleton width={150} height={10} />
                            </View>
                            <Skeleton width={60} height={16} style={{ marginLeft: spacing.md }} />
                        </View>
                    ))}
                </View>
            ) : (
                <FlashList
                    data={flatData}
                    keyExtractor={item => item._id}
                    renderItem={renderItem}
                    contentContainerStyle={styles.list}
                    showsVerticalScrollIndicator={false}
                    estimatedItemSize={70}
                    getItemType={item => item.type}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.primary} />}
                    onEndReached={fetchMore}
                    onEndReachedThreshold={0.5}
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <Text style={styles.emptyEmoji}>📭</Text>
                            <Text style={[styles.emptyText, { color: COLORS.textMuted }]}>No transfers found.</Text>
                        </View>
                    }
                    ListFooterComponent={loadingMore && <ActivityIndicator size="small" color={COLORS.primary} style={{ marginVertical: 16 }} />}
                />
            )}

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
                                                        <Text style={[styles.modalDetailValue, { color: COLORS.text }]}>{formatDateTime(selectedTransfer.createdAt, true)}</Text>
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
                                                        <View style={[styles.modalDetailRow, { borderBottomWidth: 0, paddingBottom: 0, marginTop: 4, alignItems: 'flex-start' }]}>
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
        </SafeAreaView>
    );
}

const getStyles = (COLORS) => StyleSheet.create({
    safe: { flex: 1, backgroundColor: COLORS.background },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg, paddingBottom: spacing.sm },
    backBtn: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    headerTitle: { fontSize: 18, fontWeight: '800' },
    list: { paddingHorizontal: spacing.lg, paddingBottom: 120 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    row: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.xs, gap: 12 },
    rowIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
    rowGoal: { fontWeight: '700', fontSize: 14 },
    rowLabel: { fontSize: 12, marginTop: 2 },
    rowNote: { fontSize: 11, marginTop: 2, fontStyle: 'italic', color: COLORS.textMuted },
    rowAmt: { fontWeight: '800', fontSize: 15 },
    rowBalance: { fontSize: 10, fontWeight: '600', marginTop: 2, textAlign: 'right' },
    empty: { alignItems: 'center', paddingTop: 80 },
    emptyEmoji: { fontSize: 48, marginBottom: 12 },
    emptyText: { fontSize: 15, fontWeight: '700' },
    // Search
    searchContainer: { paddingHorizontal: spacing.lg },
    searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: 10, borderWidth: 1 },
    searchInput: { flex: 1, fontSize: 14 },
    tabsRow: { flexDirection: 'row', gap: 8, marginBottom: spacing.md, marginTop: spacing.sm },
    tab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: COLORS.surface, justifyContent: 'center', height: 36 },
    tabText: { fontSize: 13, fontWeight: '700' },
    // Sections
    sectionHeader: { paddingVertical: 8 },
    sectionTitle: { fontSize: 13, fontWeight: '800' },
    rowTime: { fontSize: 10, fontWeight: '500', marginBottom: 2 },
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
});
