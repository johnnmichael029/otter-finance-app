import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView,
    TextInput, ActivityIndicator, RefreshControl, Modal, TouchableWithoutFeedback, Image,
    FlatList
} from 'react-native';
import Animated, { ZoomIn, ZoomOut, LinearTransition } from 'react-native-reanimated';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth, API_BASE } from '../../context/AuthContext';
import { getTransactions, archiveTransaction as archiveTxApi, deleteTransaction, emptyArchives } from '../../api/api';
import { spacing, radius } from '../../theme/colors';
import Skeleton from '../../components/Skeleton';
import CustomAlertModal from '../../components/CustomAlertModal';
import SubscriptionSuggestionCard from '../../components/SubscriptionSuggestionCard';
import { getSocket, connectSocket } from '../../utils/socket';
import { useDebounce } from '../../utils/debounce';
import { useFinanceStore } from '../../store/financeStore';
import { formatCurrency, formatDate, formatDateTime, getIconName, getIconColor, IconRenderer } from '../../utils/formatters';
import { triggerHaptic } from '../../utils/haptics';



const TABS = ['All', 'Income', 'Expense', 'Ledger', 'Archive'];

const TransactionsScreen = () => {
    const COLORS = useTheme(state => state.COLORS);
    const { userInfo, hapticsEnabled } = useAuth();
    const navigation = useNavigation();
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
    const [revertModalVisible, setRevertModalVisible] = useState(false);
    const [revertingTx, setRevertingTx] = useState(null);
    const [infoAlert, setInfoAlert] = useState({ visible: false, title: '', message: '', type: 'info' });
    const [emptyModalVisible, setEmptyModalVisible] = useState(false);

    const [suggestedSubscription, setSuggestedSubscription] = useState(null);
    const [dismissedSuggestions, setDismissedSuggestions] = useState([]);
    const recurringBills = useFinanceStore(state => state.recurringBills);

    const typeFilter = activeTab === 'Income' ? 'income' : activeTab === 'Expense' ? 'expense' : '';
    const isArchiveView = activeTab === 'Archive';

    useEffect(() => {
        if (transactions.length < 2 || isArchiveView) return;

        const groups = {};
        transactions.forEach(tx => {
            if (tx.type !== 'expense' || tx.isArchived) return;
            const merchant = (tx.description || tx.category || '').trim();
            if (!merchant) return;

            const key = `${merchant.toLowerCase()}_${tx.amount}`;
            if (!groups[key]) {
                groups[key] = { merchant, amount: tx.amount, category: tx.category, dates: [], txIds: [] };
            }
            groups[key].dates.push(new Date(tx.date || tx.createdAt));
            groups[key].txIds.push(tx._id);
        });

        let found = null;
        for (const key in groups) {
            const group = groups[key];
            if (group.dates.length >= 2) {
                if (dismissedSuggestions.includes(key)) continue;

                const alreadyBilled = recurringBills.some(b =>
                    b.name.toLowerCase() === group.merchant.toLowerCase() ||
                    b.amount === group.amount
                );

                if (!alreadyBilled) {
                    found = { ...group, key };
                    break;
                }
            }
        }
        setSuggestedSubscription(found);
    }, [transactions, recurringBills, dismissedSuggestions, isArchiveView]);

    const load = useCallback(async (showSkeleton = false) => {
        if (showSkeleton) setLoading(true);
        try {
            const params = { limit: 15, page: 1, isArchived: isArchiveView };
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
    }, [typeFilter, isArchiveView]);

    useEffect(() => { load(transactions.length === 0); }, [load]);

    useEffect(() => {
        if (!userInfo?._id) return;
        connectSocket(userInfo._id);
        const socket = getSocket();

        const handleNew = (tx) => {
            if (isArchiveView && !tx.isArchived) return;
            if (!isArchiveView && tx.isArchived) return;

            if (!typeFilter || tx.type === typeFilter) {
                setTransactions(prev => {
                    const exists = prev.find(t => t._id === tx._id);
                    if (exists) return prev;
                    return [tx, ...prev];
                });
            }
        };

        const handleUpdate = (tx) => {
            setTransactions(prev => {
                // If the archive status changed, remove it from the current view
                if ((isArchiveView && !tx.isArchived) || (!isArchiveView && tx.isArchived)) {
                    return prev.filter(t => t._id !== tx._id);
                }
                return prev.map(t => t._id === tx._id ? tx : t);
            });
        };

        const handleDelete = (data) => {
            setTransactions(prev => prev.filter(t => t._id !== data._id));
        };

        const handleArchive = (data) => {
            // Remove from current list if the status doesn't match the view
            if ((isArchiveView && !data.isArchived) || (!isArchiveView && data.isArchived)) {
                setTransactions(prev => prev.filter(t => t._id !== data._id));
            }
        };

        socket.on('new_transaction', handleNew);
        socket.on('update_transaction', handleUpdate);
        socket.on('delete_transaction', handleDelete);
        socket.on('transaction_archived', handleArchive);

        return () => {
            socket.off('new_transaction', handleNew);
            socket.off('update_transaction', handleUpdate);
            socket.off('delete_transaction', handleDelete);
            socket.off('transaction_archived', handleArchive);
        };
    }, [userInfo?._id, typeFilter, isArchiveView]);

    const fetchMore = async () => {
        if (!hasMore || loadingMore) return;
        setLoadingMore(true);
        try {
            const params = { limit: 15, page, isArchived: isArchiveView };
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

    const handleArchiveToggle = async (id) => {
        try {
            triggerHaptic(hapticsEnabled, 'impactLight'); // Haptic feedback
            await archiveTxApi(id);
            // The list will update via socket handleArchive or handleUpdate in useEffect
        } catch (e) {
            console.error('Archive failed:', e);
            const isNetworkError = !e.response && e.request;
            const msg = isNetworkError 
                ? 'Unable to connect to the server. Please check your internet connection.'
                : (e?.response?.data?.error || 'Could not update transaction status.');
            
            setInfoAlert({
                visible: true,
                title: isNetworkError ? 'Network Error' : 'Action Restricted',
                message: msg,
                type: 'error'
            });
            load(); // Refresh to ensure UI matches DB
        }
    };

    const handleRevertConfirm = async () => {
        if (!revertingTx) return;
        try {
            const txId = revertingTx._id;
            setRevertingTx(null);
            setRevertModalVisible(false);
            await deleteTransaction(txId);
            // List will update via socket handleDeleted already in this file
        } catch (e) {
            console.error('Revert failed:', e);
            const isNetworkError = !e.response && e.request;
            const msg = isNetworkError 
                ? 'Unable to connect to the server. Please check your internet connection.'
                : (e?.response?.data?.error || 'Could not revert transaction.');

            setInfoAlert({
                visible: true,
                title: isNetworkError ? 'Network Error' : 'Revert Failed',
                message: msg,
                type: 'error'
            });
            load();
        }
    };

    const handleDeleteTransaction = async (id) => {
        try {
            triggerHaptic(hapticsEnabled, 'impactMedium');
            await deleteTransaction(id);
            // List will update via socket handleDeleted in useEffect
        } catch (e) {
            console.error('Delete failed:', e);
            const isNetworkError = !e.response && e.request;
            const msg = isNetworkError 
                ? 'Unable to connect to the server. Please check your internet connection.'
                : (e?.response?.data?.error || 'Could not delete transaction.');

            setInfoAlert({
                visible: true,
                title: isNetworkError ? 'Network Error' : 'Action Restricted',
                message: msg,
                type: 'error'
            });
            load();
        }
    };


    const handleEmptyArchivesConfirm = async () => {
        try {
            setEmptyModalVisible(false);
            await emptyArchives();
            setTransactions([]); // Clear local state for archive
            setInfoAlert({
                visible: true,
                title: 'Archives Emptied',
                message: 'All archived transactions have been permanently deleted.',
                type: 'success'
            });
        } catch (e) {
            console.error('Empty archives failed:', e);
        }
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

    const renderRightActions = (id, isArchived) => {
        return (
            <TouchableOpacity
                style={styles.archiveAction}
                onPress={() => handleArchiveToggle(id)}
                activeOpacity={0.8}
            >
                <MaterialCommunityIcons
                    name={isArchived ? "archive-arrow-up-outline" : "archive-arrow-down-outline"}
                    size={28}
                    color="#fff"
                />
                <Text style={styles.archiveActionText}>{isArchived ? 'Restore' : 'Archive'}</Text>
            </TouchableOpacity>
        );
    };

    const renderLeftActions = (id) => {
        if (!isArchiveView) return null;
        return (
            <TouchableOpacity
                style={styles.deleteAction}
                onPress={() => handleDeleteTransaction(id)}
                activeOpacity={0.8}
            >
                <MaterialCommunityIcons name="trash-can-outline" size={28} color="#fff" />
                <Text style={styles.archiveActionText}>Delete</Text>
            </TouchableOpacity>
        );
    };


    return (
        <SafeAreaView style={styles.safe}>
            <View style={[styles.header, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                <Text style={styles.headerTitle}>Transactions</Text>
                {isArchiveView && transactions.length > 0 && (
                    <TouchableOpacity onPress={() => setEmptyModalVisible(true)} style={{ padding: 4 }}>
                        <Feather name="trash-2" size={20} color={COLORS.error || '#ef4444'} />
                    </TouchableOpacity>
                )}
            </View>

            <View style={{ height: 48, marginBottom: spacing.sm }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow} style={{ flexGrow: 0 }}>
                    {TABS.map(tab => {
                        const active = activeTab === tab;
                        return (
                            <TouchableOpacity key={tab} onPress={() => {
                                if (activeTab !== tab) {
                                    setTransactions([]);
                                    setActiveTab(tab);
                                }
                            }} style={[styles.tab, active && { backgroundColor: COLORS.primary }]}>
                                <Text style={[styles.tabText, { color: active ? '#fff' : COLORS.textMuted }]}>{tab}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </View>

            {isArchiveView && (
                <View style={{ marginHorizontal: spacing.lg, marginBottom: spacing.sm, padding: 12, backgroundColor: COLORS.primary + '15', borderRadius: radius.md, flexDirection: 'row', alignItems: 'flex-start' }}>
                    <Feather name="info" size={16} color={COLORS.primary} style={{ marginRight: 8, marginTop: 2 }} />
                    <Text style={{ flex: 1, fontSize: 12, color: COLORS.textMuted, lineHeight: 18 }}>
                        Archived transactions are hidden from your main ledgers but still count toward your mathematical balance. They will be automatically deleted after 30 days.
                    </Text>
                </View>
            )}

            {suggestedSubscription && !isArchiveView && activeTab === 'All' && (
                <View style={{ marginBottom: spacing.sm }}>
                    <SubscriptionSuggestionCard
                        merchant={suggestedSubscription.merchant}
                        amount={suggestedSubscription.amount}
                        category={suggestedSubscription.category}
                        onDismiss={() => {
                            setDismissedSuggestions(prev => [...prev, suggestedSubscription.key]);
                            setSuggestedSubscription(null);
                        }}
                        onAdd={() => {
                            navigation.navigate('RecurringBills', {
                                prefill: {
                                    name: suggestedSubscription.merchant,
                                    amount: suggestedSubscription.amount.toString(),
                                    category: suggestedSubscription.category
                                }
                            });
                            setDismissedSuggestions(prev => [...prev, suggestedSubscription.key]);
                            setSuggestedSubscription(null);
                        }}
                    />
                </View>
            )}

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
                <FlatList
                    contentContainerStyle={styles.listContent}
                    data={flatData}
                    keyExtractor={item => item._id}
                    showsVerticalScrollIndicator={false}
                    // estimatedItemSize={60}
                    // getItemType={item => item.type}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.primary} />}
                    onEndReached={() => fetchMore()}
                    onEndReachedThreshold={0.5}
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <Text style={styles.emptyEmoji}>{isArchiveView ? '📦' : '📭'}</Text>
                            <Text style={[styles.emptyText, { color: COLORS.textMuted }]}>
                                {isArchiveView ? 'Your archive is empty.' : 'No transactions found.'}
                            </Text>
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
                                <Animated.View key={tx._id} layout={LinearTransition.springify()} entering={ZoomIn.springify().damping(50).mass(0.9)} exiting={ZoomOut.duration(100)}>
                                    <Swipeable
                                        renderRightActions={() => renderRightActions(tx._id, tx.isArchived)}
                                        renderLeftActions={() => renderLeftActions(tx._id)}
                                        onSwipeableOpen={(direction) => {
                                            if (direction === 'right') {
                                                handleArchiveToggle(tx._id);
                                            } else if (direction === 'left' && isArchiveView) {
                                                handleDeleteTransaction(tx._id);
                                            }
                                        }}
                                        friction={2}
                                        overshootRight={false}
                                        overshootLeft={false}
                                        containerStyle={{ borderRadius: radius.md, marginBottom: spacing.xs }}
                                    >
                                        <TouchableOpacity
                                            style={[styles.txRow, { backgroundColor: COLORS.surface, marginBottom: 0 }]}
                                            onPress={() => setSelectedTx(tx)}
                                            activeOpacity={0.7}
                                            onLongPress={() => {
                                                triggerHaptic(hapticsEnabled, 'impactMedium');
                                                if (tx.relatedType === 'Debt') {
                                                    setInfoAlert({
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
                                                    {tx.isPending && (
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 4 }}>
                                                            <Feather name="clock" size={10} color={COLORS.primary} style={{ marginRight: 2 }} />
                                                            <Text style={{ fontSize: 9, color: COLORS.primary, fontWeight: 'bold' }}>OFFLINE</Text>
                                                        </View>
                                                    )}
                                                    {tx.attachment && <Feather name="camera" size={12} color={COLORS.primary} />}
                                                    {activeTab === 'Ledger' ? (
                                                        <Text style={[styles.txType, { color: tx.type === 'income' ? '#22c55e' : (tx.type === 'transfer' ? '#3b82f6' : '#ef4444'), fontSize: 9 }]}>
                                                            {tx.type === 'income' ? '↑ CREDIT' : (tx.type === 'transfer' ? '⇅ MOVE' : '↓ DEBIT')}
                                                        </Text>
                                                    ) : (
                                                        <Text style={[styles.txDateSimple, { color: COLORS.textMuted }]}>
                                                            {new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(tx.date || tx.createdAt))}
                                                        </Text>
                                                    )}
                                                </View>
                                                <Text style={[styles.txAmt, { color: tx.type === 'income' ? COLORS.income : (tx.type === 'transfer' ? '#3b82f6' : COLORS.expense) }]}>
                                                    {tx.type === 'income' ? '+' : (tx.type === 'transfer' ? '' : '-')}{formatCurrency(tx.amount, userInfo?.currency)}
                                                </Text>
                                            </View>
                                        </TouchableOpacity>
                                    </Swipeable>
                                </Animated.View>
                            );
                        }
                    }}
                    ListFooterComponent={loadingMore && <ActivityIndicator size="small" color={COLORS.primary} style={{ marginVertical: 16 }} />}
                />
            )}

            <CustomAlertModal
                visible={revertModalVisible}
                onClose={() => setRevertModalVisible(false)}
                onConfirm={handleRevertConfirm}
                title="Revert Transaction"
                message={`Are you sure you want to undo this ${revertingTx?.type || 'transaction'}? This will restore your wallet balances and permanently delete the record.`}
                type="confirm"
                confirmText="Revert"
            />

            <CustomAlertModal
                visible={emptyModalVisible}
                onClose={() => setEmptyModalVisible(false)}
                onConfirm={handleEmptyArchivesConfirm}
                title="Empty Archives"
                message="Are you sure you want to permanently delete ALL archived transactions? This will reverse their effect on your balances and cannot be undone."
                type="danger"
                confirmText="Delete All"
            />

            <CustomAlertModal
                visible={infoAlert.visible}
                onClose={() => setInfoAlert({ ...infoAlert, visible: false })}
                title={infoAlert.title}
                message={infoAlert.message}
                type={infoAlert.type}
            />

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
                                            <Text style={[styles.modalAmt, { color: selectedTx.type === 'income' ? COLORS.income : (selectedTx.type === 'transfer' ? '#3b82f6' : COLORS.expense) }]}>
                                                {selectedTx.type === 'income' ? '+' : (selectedTx.type === 'transfer' ? '' : '-')}{formatCurrency(selectedTx.amount, userInfo?.currency)}
                                            </Text>
                                            <Text style={[styles.modalCat, { color: COLORS.text }]}>{selectedTx.category}</Text>

                                            <View style={[styles.detailBox, { backgroundColor: COLORS.background, borderColor: COLORS.border }]}>
                                                <View style={styles.detailRow}>
                                                    <Text style={[styles.detailLabel, { color: COLORS.textMuted }]}>Type</Text>
                                                    <Text style={[styles.detailVal, { color: COLORS.text, textTransform: 'capitalize' }]}>{selectedTx.type}</Text>
                                                </View>
                                                <View style={styles.detailRow}>
                                                    <Text style={[styles.detailLabel, { color: COLORS.textMuted }]}>Date</Text>
                                                    <Text style={[styles.detailVal, { color: COLORS.text }]}>{formatDateTime(selectedTx.date || selectedTx.createdAt)}</Text>
                                                </View>
                                                {/* Payment Source / From Row */}
                                                <View style={styles.detailRow}>
                                                    <Text style={[styles.detailLabel, { color: COLORS.textMuted }]}>Payment Source</Text>
                                                    <View style={[styles.walletBadge, { backgroundColor: ((selectedTx.type === 'income' ? selectedTx.sourceWallet?.color : selectedTx.wallet?.color) || COLORS.primary) + '20' }]}>
                                                        <Text style={[styles.walletBadgeText, { color: (selectedTx.type === 'income' ? selectedTx.sourceWallet?.color : selectedTx.wallet?.color) || COLORS.primary }]}>
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
                                                    <View style={[styles.detailRow]}>
                                                        <Text style={[styles.detailLabel, { color: COLORS.textMuted }]}>Deposit To</Text>
                                                        <View style={[styles.walletBadge, { backgroundColor: (selectedTx.wallet?.color || COLORS.primary) + '20' }]}>
                                                            <Text style={[styles.walletBadgeText, { color: selectedTx.wallet?.color || COLORS.primary }]}>
                                                                {selectedTx.wallet ? selectedTx.wallet.name : 'HAND'}
                                                            </Text>
                                                        </View>
                                                    </View>
                                                )}
                                                {/* Native Cost Row */}
                                                {((selectedTx.type === 'income' && selectedTx.sourceWalletAmount) || (selectedTx.type === 'expense' && selectedTx.walletAmount)) && (
                                                    <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
                                                        <Text style={[styles.detailLabel, { color: COLORS.textMuted }]}>Native Cost</Text>
                                                        <Text style={[styles.detailVal, { color: COLORS.text, fontWeight: '700' }]}>
                                                            {selectedTx.type === 'income'
                                                                ? `${selectedTx.sourceWalletAmount?.toLocaleString(undefined, { maximumFractionDigits: 8 })} ${selectedTx.sourceWalletCurrency}`
                                                                : `${selectedTx.walletAmount?.toLocaleString(undefined, { maximumFractionDigits: 8 })} ${selectedTx.walletCurrency}`
                                                            }
                                                        </Text>
                                                    </View>
                                                )}
                                                {selectedTx.description || selectedTx.note ? (
                                                    <View style={[styles.detailRow, { borderBottomWidth: 0, paddingBottom: 0, marginTop: 4, alignItems: 'flex-start' }]}>
                                                        <Text style={[styles.detailLabel, { color: COLORS.textMuted }]}>Note</Text>
                                                        <Text style={[styles.detailVal, { color: COLORS.text, textAlign: 'left' }]}>{selectedTx.description || selectedTx.note}</Text>
                                                    </View>
                                                ) : null}
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
    txRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.md },
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
    archiveAction: {
        backgroundColor: '#ef4444',
        justifyContent: 'center',
        alignItems: 'center',
        width: 80,
        height: '100%',
        borderRadius: radius.md,
    },
    archiveActionText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: '700',
        marginTop: 4
    },
    deleteAction: {
        backgroundColor: COLORS.error || '#ef4444',
        justifyContent: 'center',
        alignItems: 'center',
        width: 80,
        height: '100%',
        borderRadius: radius.md,
    },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalSheet: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: 40, maxHeight: '80%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
    modalTitle: { fontSize: 18, fontWeight: '800' },
    modalBody: { width: '100%' },
    modalIconHero: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', marginBottom: spacing.sm, alignSelf: 'center' },
    modalAmt: { fontSize: 32, fontWeight: '800', marginBottom: 4, alignSelf: 'center' },
    modalCat: { fontSize: 16, fontWeight: '600', marginBottom: spacing.lg, alignSelf: 'center' },
    detailBox: { width: '100%', borderWidth: 1, borderRadius: radius.lg, padding: spacing.md },
    detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
    detailLabel: { fontSize: 13, fontWeight: '600' },
    detailVal: { fontSize: 13, fontWeight: '700', maxWidth: '60%', textAlign: 'right' },
    attachmentSection: { width: '100%', marginTop: spacing.md },
    modalReceipt: { width: '100%', height: 300, borderRadius: radius.lg, resizeMode: 'contain', backgroundColor: '#000' },
    walletBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    walletBadgeText: { fontSize: 11, fontWeight: '800' },
});

export default TransactionsScreen;
