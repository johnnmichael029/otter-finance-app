import React, { useState, useCallback, useEffect } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView,
    TextInput, ActivityIndicator, RefreshControl, Modal, TouchableWithoutFeedback, Image
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useAuth, API_BASE } from '../../context/AuthContext';
import { getTransactions } from '../../api/api';
import { spacing, radius } from '../../theme/colors';
import Skeleton from '../../components/Skeleton';
import { getSocket, connectSocket } from '../../utils/socket';
import { useDebounce } from '../../utils/debounce';

const formatCurrency = (amount, currency = 'PHP') =>
    new Intl.NumberFormat('en-PH', { style: 'currency', currency }).format(amount);

const formatDateTime = (dateString) => {
    if (!dateString) return '';
    return new Intl.DateTimeFormat('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit',
    }).format(new Date(dateString));
};

const formatDate = (dateString) => {
    if (!dateString) return '';
    return new Intl.DateTimeFormat('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
    }).format(new Date(dateString));
};

const FALLBACK_ICONS = {
    'Salary': 'briefcase', 'Freelance': 'code', 'Investment': 'trending-up', 'Gift': 'gift',
    'Food': 'coffee', 'Transport': 'truck', 'Shopping': 'shopping-cart', 'Bills': 'file-text',
    'Health': 'heart', 'Entertainment': 'tv', 'Other': 'tag', 'Savings': 'piggy-bank-outline'
};

const IconRenderer = ({ name, size, color }) => {
    if (!name) return <Feather name="circle" size={size} color={color} />;
    if (name.startsWith('material:') || name === 'piggy-bank' || name === 'piggy-bank-outline') {
        const iconName = name.replace('material:', '') || 'piggy-bank';
        return <MaterialCommunityIcons name={iconName} size={size} color={color} />;
    }
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

const TABS = ['All', 'Income', 'Expense', 'Ledger'];

const TransactionsScreen = () => {
    const { COLORS } = useTheme();
    const { userInfo } = useAuth();
    const styles = getStyles(COLORS);

    const [activeTab, setActiveTab] = useState('All');
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebounce(search, 400);
    const [selectedTx, setSelectedTx] = useState(null);

    const typeFilter = activeTab === 'Income' ? 'income' : activeTab === 'Expense' ? 'expense' : '';

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params = { limit: 15, page: 1 };
            if (typeFilter) params.type = typeFilter;
            const res = await getTransactions(params);
            const txs = res.transactions || [];
            setTransactions(txs);
            setPage(2);
            setHasMore(txs.length >= 15);
        } catch (e) {
            console.warn(e.message);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [typeFilter]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        if (!userInfo?._id) return;
        connectSocket(userInfo._id);
        const socket = getSocket();

        const handleNew = (tx) => {
            if (!typeFilter || tx.type === typeFilter) {
                setTransactions(prev => {
                    const exists = prev.find(t => t._id === tx._id);
                    if (exists) return prev;
                    return [tx, ...prev];
                });
            }
        };

        const handleUpdate = (tx) => {
            setTransactions(prev => prev.map(t => t._id === tx._id ? tx : t));
        };

        const handleDelete = (data) => {
            setTransactions(prev => prev.filter(t => t._id !== data._id));
        };

        socket.on('new_transaction', handleNew);
        socket.on('update_transaction', handleUpdate);
        socket.on('delete_transaction', handleDelete);

        return () => {
            socket.off('new_transaction', handleNew);
            socket.off('update_transaction', handleUpdate);
            socket.off('delete_transaction', handleDelete);
        };
    }, [userInfo?._id, typeFilter]);

    const fetchMore = async () => {
        if (!hasMore || loadingMore) return;
        setLoadingMore(true);
        try {
            const params = { limit: 15, page };
            if (typeFilter) params.type = typeFilter;
            const res = await getTransactions(params);
            const incoming = res.transactions || [];
            setTransactions(prev => {
                const merged = [...prev, ...incoming];
                const seen = new Set();
                return merged.filter(t => { if (seen.has(t._id)) return false; seen.add(t._id); return true; });
            });
            setPage(p => p + 1);
            if (incoming.length < 15) setHasMore(false);
        } catch (e) { } finally { setLoadingMore(false); }
    };

    const filtered = debouncedSearch.trim()
        ? transactions.filter(tx =>
            tx.category?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
            tx.description?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
            tx.note?.toLowerCase().includes(debouncedSearch.toLowerCase())
        )
        : transactions;

    const ledgerGroups = {};
    for (const tx of filtered) {
        const key = formatDate(tx.date || tx.createdAt);
        if (!ledgerGroups[key]) ledgerGroups[key] = { date: key, credit: 0, debit: 0, entries: [] };
        if (tx.type === 'income') ledgerGroups[key].credit += tx.amount;
        else ledgerGroups[key].debit += tx.amount;
        ledgerGroups[key].entries.push(tx);
    }
    
    const flatData = [];
    Object.values(ledgerGroups).forEach(day => {
        flatData.push({ type: 'header', date: day.date, credit: day.credit, debit: day.debit, _id: `header-${day.date}` });
        day.entries.forEach(tx => flatData.push({ type: 'item', transaction: tx, _id: tx._id }));
    });

    return (
        <SafeAreaView style={styles.safe}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Transactions</Text>
            </View>

            <View style={{ height: 48, marginBottom: spacing.sm }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow} style={{ flexGrow: 0 }}>
                    {TABS.map(tab => {
                        const active = activeTab === tab;
                        return (
                            <TouchableOpacity key={tab} onPress={() => setActiveTab(tab)} style={[styles.tab, active && { backgroundColor: COLORS.primary }]}>
                                <Text style={[styles.tabText, { color: active ? '#fff' : COLORS.textMuted }]}>{tab}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </View>

            <View style={styles.searchRow}>
                <Feather name="search" size={16} color={COLORS.textMuted} style={{ marginRight: 8 }} />
                <TextInput
                    style={[styles.searchInput, { color: COLORS.text }]}
                    placeholder="Search category, note..."
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

            {loading ? (
                <View style={styles.listContent}>
                    {[1, 2, 3, 4, 5, 6, 7].map(i => (
                        <View key={i} style={[styles.txRow, { backgroundColor: COLORS.surface, elevation: 0, shadowOpacity: 0, borderWidth: 1, borderColor: COLORS.border }]} pointerEvents="none">
                            <Skeleton width={36} height={36} borderRadius={18} style={{ marginRight: spacing.md }} />
                            <View style={{ flex: 1 }}>
                                <Skeleton width={120} height={14} style={{ marginBottom: 8 }} />
                                <Skeleton width={70} height={12} />
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                                <Skeleton width={80} height={14} style={{ marginBottom: 8 }} />
                                <Skeleton width={50} height={10} />
                            </View>
                        </View>
                    ))}
                </View>
            ) : (
                <FlashList
                    contentContainerStyle={styles.listContent}
                    data={flatData}
                    keyExtractor={item => item._id}
                    showsVerticalScrollIndicator={false}
                    estimatedItemSize={60}
                    getItemType={item => item.type}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.primary} />}
                    onEndReached={() => fetchMore()}
                    onEndReachedThreshold={0.5}
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <Text style={styles.emptyEmoji}>📭</Text>
                            <Text style={[styles.emptyText, { color: COLORS.textMuted }]}>No transactions found.</Text>
                        </View>
                    }
                    renderItem={({ item }) => {
                        if (item.type === 'header') {
                            return (
                                <View style={styles.ledgerDayHeader}>
                                    <Text style={[styles.ledgerDate, { color: COLORS.text }]}>{item.date}</Text>
                                    {activeTab === 'Ledger' && (
                                        <View style={styles.ledgerDaySummary}>
                                            <Text style={[styles.ledgerCredit, { color: COLORS.income }]}>+{formatCurrency(item.credit, userInfo?.currency)}</Text>
                                            <Text style={[styles.ledgerDebit, { color: COLORS.expense }]}>-{formatCurrency(item.debit, userInfo?.currency)}</Text>
                                        </View>
                                    )}
                                </View>
                            );
                        } else {
                            const tx = item.transaction;
                            return (
                                <TouchableOpacity style={[styles.txRow, { backgroundColor: COLORS.surface }]} onPress={() => setSelectedTx(tx)} activeOpacity={0.7}>
                                    <View style={[styles.txIcon, { backgroundColor: getIconColor(tx, COLORS) + '20' }]}>
                                        <IconRenderer name={getIconName(tx)} size={16} color={getIconColor(tx, COLORS)} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.txCat, { color: COLORS.text }]}>{tx.category}</Text>
                                        <Text style={[styles.txNote, { color: COLORS.textMuted }]} numberOfLines={1}>
                                            {(tx.description || tx.note) ? `" ${tx.description || tx.note} "` : '—'}
                                        </Text>
                                    </View>
                                    <View style={styles.txRight}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                                            {tx.attachment && <Feather name="camera" size={12} color={COLORS.primary} />}
                                            {activeTab === 'Ledger' ? (
                                                <Text style={[styles.txType, { color: tx.type === 'income' ? '#22c55e' : '#ef4444', fontSize: 9 }]}>
                                                    {tx.type === 'income' ? '↑ CREDIT' : '↓ DEBIT'}
                                                </Text>
                                            ) : (
                                                <Text style={[styles.txDateSimple, { color: COLORS.textMuted }]}>
                                                    {new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(tx.date || tx.createdAt))}
                                                </Text>
                                            )}
                                        </View>
                                        <Text style={[styles.txAmt, { color: tx.type === 'income' ? COLORS.income : COLORS.expense }]}>
                                            {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount, userInfo?.currency)}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            );
                        }
                    }}
                    ListFooterComponent={loadingMore && <ActivityIndicator size="small" color={COLORS.primary} style={{ marginVertical: 16 }} />}
                />
            )}

            <Modal visible={!!selectedTx} transparent animationType="fade" onRequestClose={() => setSelectedTx(null)}>
                <TouchableWithoutFeedback onPress={() => setSelectedTx(null)}>
                    <View style={styles.modalOverlay}>
                        <TouchableWithoutFeedback>
                            <View style={[styles.modalSheet, { backgroundColor: COLORS.surface }]}>
                                {selectedTx && (
                                    <>
                                        <View style={styles.modalHeader}>
                                            <Text style={[styles.modalTitle, { color: COLORS.text }]}>Transaction Details</Text>
                                            <TouchableOpacity onPress={() => setSelectedTx(null)}>
                                                <Feather name="x" size={24} color={COLORS.textMuted} />
                                            </TouchableOpacity>
                                        </View>
                                        <ScrollView contentContainerStyle={styles.modalBody} showsVerticalScrollIndicator={false}>
                                            <View style={[styles.modalIconHero, { backgroundColor: getIconColor(selectedTx, COLORS) + '20' }]}>
                                                <IconRenderer name={getIconName(selectedTx)} size={32} color={getIconColor(selectedTx, COLORS)} />
                                            </View>
                                            <Text style={[styles.modalAmt, { color: selectedTx.type === 'income' ? COLORS.income : COLORS.expense }]}>
                                                {selectedTx.type === 'income' ? '+' : '-'}{formatCurrency(selectedTx.amount, userInfo?.currency)}
                                            </Text>
                                            <Text style={[styles.modalCat, { color: COLORS.text }]}>{selectedTx.category}</Text>
                                            
                                            <View style={[styles.detailBox, { backgroundColor: COLORS.background, borderColor: COLORS.border }]}>
                                                {[
                                                    ['Type', selectedTx.type],
                                                    ['Date', formatDateTime(selectedTx.date || selectedTx.createdAt)],
                                                    ['Source', selectedTx.wallet ? `${selectedTx.wallet.name} (${selectedTx.wallet.type})` : 'HAND'],
                                                    selectedTx.walletAmount !== null && selectedTx.walletAmount !== undefined ? ['Native Cost', `${selectedTx.walletAmount.toLocaleString(undefined, { maximumFractionDigits: 8 })} ${selectedTx.walletCurrency}`] : null,
                                                    selectedTx.description || selectedTx.note ? ['Note', selectedTx.description || selectedTx.note] : null,
                                                ].filter(Boolean).map(([label, val]) => (
                                                    <View key={label} style={[styles.detailRow, { borderColor: COLORS.border, borderBottomWidth: label === 'Note' || label === 'Native Cost' ? 0 : StyleSheet.hairlineWidth }]}>
                                                        <Text style={[styles.detailLabel, { color: COLORS.textMuted }]}>{label}</Text>
                                                        <Text style={[styles.detailVal, { color: COLORS.text, textTransform: label === 'Type' ? 'capitalize' : 'none', fontWeight: (label === 'Native Cost' || label === 'Source') ? '700' : '500' }]}>{val}</Text>
                                                    </View>
                                                ))}
                                            </View>

                                            {selectedTx.attachment && (
                                                <View style={styles.receiptSection}>
                                                    <Text style={[styles.detailLabel, { color: COLORS.textMuted, marginBottom: 8, marginTop: spacing.lg }]}>Receipt Attachment</Text>
                                                    <Image 
                                                        source={{ uri: `${API_BASE.replace('/api', '')}${selectedTx.attachment}` }} 
                                                        style={styles.modalReceipt} 
                                                    />
                                                </View>
                                            )}
                                        </ScrollView>
                                    </>
                                )}
                            </View>
                        </TouchableWithoutFeedback>
                    </View>
                </TouchableWithoutFeedback>
            </Modal>
        </SafeAreaView>
    );
};

const getStyles = (COLORS) => StyleSheet.create({
    safe: { flex: 1, backgroundColor: COLORS.background },
    header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
    headerTitle: { fontSize: 24, fontWeight: '800', color: COLORS.text },
    tabsRow: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: 8, alignItems: 'center' },
    tab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: COLORS.surface, justifyContent: 'center', height: 36 },
    tabText: { fontSize: 13, fontWeight: '700' },
    searchRow: {
        flexDirection: 'row', alignItems: 'center',
        marginHorizontal: spacing.lg, marginBottom: spacing.sm,
        backgroundColor: COLORS.surface, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: 10,
    },
    searchInput: { flex: 1, fontSize: 14 },
    listContent: { paddingHorizontal: spacing.lg, paddingBottom: 120 },
    empty: { alignItems: 'center', paddingTop: 80 },
    emptyEmoji: { fontSize: 48, marginBottom: 12 },
    emptyText: { fontSize: 14 },
    txRow: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.xs },
    txIcon: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center', marginRight: spacing.sm },
    txCat: { fontWeight: '700', fontSize: 14 },
    txNote: { fontSize: 12, fontStyle: 'italic', marginTop: 2 },
    txRight: { alignItems: 'flex-end' },
    txAmt: { fontWeight: '800', fontSize: 15 },
    txDateSimple: { fontSize: 10, fontWeight: '500' },
    txType: { fontWeight: '800', letterSpacing: 0.5 },
    ledgerDayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs, paddingHorizontal: 4 },
    ledgerDate: { fontWeight: '700', fontSize: 13 },
    ledgerDaySummary: { flexDirection: 'row', gap: 8 },
    ledgerCredit: { fontSize: 12, fontWeight: '700' },
    ledgerDebit: { fontSize: 12, fontWeight: '700' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalSheet: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: 40, maxHeight: '80%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
    modalTitle: { fontSize: 18, fontWeight: '800' },
    modalBody: { width: '100%' },
    modalIconHero: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', marginBottom: spacing.sm, alignSelf: 'center' },
    modalAmt: { fontSize: 32, fontWeight: '800', marginBottom: 4, alignSelf: 'center' },
    modalCat: { fontSize: 16, fontWeight: '600', marginBottom: spacing.lg, alignSelf: 'center' },
    detailBox: { width: '100%', borderWidth: 1, borderRadius: radius.lg, padding: spacing.md },
    detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
    detailLabel: { fontSize: 13, fontWeight: '600' },
    detailVal: { fontSize: 14, fontWeight: '500', maxWidth: '60%', textAlign: 'right' },
    receiptSection: { width: '100%', marginTop: spacing.md },
    modalReceipt: { width: '100%', height: 300, borderRadius: radius.lg, resizeMode: 'contain', backgroundColor: '#000' },
});

export default TransactionsScreen;
