import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    RefreshControl
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { getShoppingSessions, deleteShoppingSession, toggleArchiveShoppingSession } from '../../api/api';
import { spacing, radius } from '../../theme/colors';
import Skeleton from '../../components/Skeleton';
import { formatCurrency, formatDate } from '../../utils/formatters';
import SwipeableRow from '../../components/SwipeableRow';

const PM_ICONS = { cash: 'cash', gcash: 'cellphone', card: 'credit-card', other: 'dots-horizontal' };
const STATUS_COLORS = { completed: '#22c55e', cancelled: '#ef4444', active: '#f59e0b' };

export default function ShoppingArchiveScreen({ navigation }) {
    const COLORS = useTheme(state => state.COLORS);
    const { userInfo } = useAuth();
    const styles = getStyles(COLORS);

    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const loadSessions = useCallback(async () => {
        try {
            setRefreshing(true);
            // Fetch ONLY archived sessions
            const res = await getShoppingSessions({ limit: 50, isArchived: 'true' });
            setSessions(res.sessions || []);
        } catch (e) {
            console.warn('[Shopping Archive] load error:', e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        const unsub = navigation.addListener('focus', loadSessions);
        return unsub;
    }, [navigation, loadSessions]);

    const handleDelete = (id) => {
        deleteShoppingSession(id).then(() => {
            loadSessions();
        }).catch(() => { });
    };

    const handleUnarchive = (id) => {
        toggleArchiveShoppingSession(id).then(() => {
            loadSessions();
        }).catch(() => { });
    };

    const renderItem = ({ item }) => {
        const statusColor = STATUS_COLORS[item.status] || COLORS.textMuted;
        const pmIconName = PM_ICONS[item.paymentMethod] || 'dots-horizontal';

        const content = (
            <TouchableOpacity
                style={[styles.sessionCard, { backgroundColor: COLORS.surface, marginBottom: 0 }]}
                onPress={() => navigation.navigate('ShoppingHistoryDetail', { session: item })}
                activeOpacity={0.8}
            >
                <View style={[styles.sessionIconBox, { backgroundColor: statusColor + '20' }]}>
                    <Feather name="shopping-cart" size={20} color={statusColor} />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={[styles.sessionLabel, { color: COLORS.text }]}>{item.label}</Text>
                    <Text style={[styles.sessionMeta, { color: COLORS.textMuted }]}>
                        {item.items?.length || 0} items · {formatDate(item.createdAt)}
                    </Text>
                    <View style={styles.sessionFooter}>
                        <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
                            <Text style={[styles.statusText, { color: statusColor }]}>Archived</Text>
                        </View>
                        <View style={styles.pmRow}>
                            <MaterialCommunityIcons name={pmIconName} size={12} color={COLORS.textMuted} />
                            <Text style={[styles.pmText, { color: COLORS.textMuted }]}>{item.paymentMethod}</Text>
                        </View>
                    </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.sessionTotal, { color: COLORS.text }]}>
                        {formatCurrency(item.total, userInfo?.currency)}
                    </Text>
                    <Text style={[styles.sessionBudget, { color: COLORS.textMuted }]}>
                        of {formatCurrency(item.budget, userInfo?.currency)}
                    </Text>
                </View>
            </TouchableOpacity>
        );

        return (
            <SwipeableRow
                key={item._id}
                // Swipe Left -> Unarchive
                rightAction={{
                    color: COLORS.primary,
                    icon: 'archive-arrow-up-outline',
                    iconFamily: 'MaterialCommunityIcons',
                    label: 'Restore',
                    onPress: () => handleUnarchive(item._id)
                }}

                // Swipe Right -> Delete
                leftAction={{
                    color: '#ef4444',
                    icon: 'trash-2',
                    label: 'Delete',
                    onPress: () => handleDelete(item._id)
                }}

                containerStyle={{ marginBottom: spacing.sm }}
            >
                {content}
            </SwipeableRow>
        );
    };

    return (
        <SafeAreaView style={[styles.safe, { backgroundColor: COLORS.background }]}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    style={[styles.backBtn, { backgroundColor: COLORS.surface }]}
                    onPress={() => navigation.goBack()}
                >
                    <Feather name="arrow-left" size={20} color={COLORS.text} />
                </TouchableOpacity>
                <View>
                    <Text style={[styles.headerTitle, { color: COLORS.text }]}>Archived Trips</Text>
                    <Text style={[styles.headerSub, { color: COLORS.textMuted }]}>
                        {sessions.length} trips hidden from main view
                    </Text>
                </View>
            </View>

            {loading ? (
                <View style={{ padding: spacing.lg }}>
                    {[1, 2, 3].map(i => (
                        <View key={i} style={[styles.sessionCard, { backgroundColor: COLORS.surface, elevation: 0, borderWidth: 1, borderColor: COLORS.border }]}>
                            <Skeleton width={44} height={44} borderRadius={22} />
                            <View style={{ flex: 1 }}>
                                <Skeleton width={130} height={15} style={{ marginBottom: 6 }} />
                                <Skeleton width={90} height={12} />
                            </View>
                        </View>
                    ))}
                </View>
            ) : (
                <View style={{ flex: 1 }}>
                    <FlashList
                        data={sessions}
                        keyExtractor={item => item._id}
                        renderItem={renderItem}
                        estimatedItemSize={100}
                        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 120, paddingTop: 10 }}
                        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadSessions} tintColor={COLORS.primary} />}
                        ListEmptyComponent={() => (
                            <View style={styles.emptyContainer}>
                                <MaterialCommunityIcons name="archive-outline" size={48} color={COLORS.textMuted} style={{ marginBottom: 12 }} />
                                <Text style={[styles.emptyText, { color: COLORS.textMuted }]}>No archived trips</Text>
                                <Text style={[styles.emptySubText, { color: COLORS.textMuted }]}>When you archive a trip, it will appear here.</Text>
                            </View>
                        )}
                    />
                </View>
            )}
        </SafeAreaView>
    );
}

const getStyles = (COLORS) => StyleSheet.create({
    safe: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, paddingBottom: spacing.md },
    headerTitle: { fontSize: 20, fontWeight: '800' },
    headerSub: { fontSize: 13, fontWeight: '600', marginTop: 2 },
    backBtn: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },

    sessionCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: radius.xl, gap: 14, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 },
    sessionIconBox: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
    sessionLabel: { fontSize: 15, fontWeight: '700' },
    sessionMeta: { fontSize: 12, marginTop: 4 },
    sessionFooter: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    statusText: { fontSize: 10, fontWeight: '800', textTransform: 'capitalize' },
    pmRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    pmText: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
    sessionTotal: { fontSize: 15, fontWeight: '800' },
    sessionBudget: { fontSize: 11, marginTop: 4 },

    emptyContainer: { alignItems: 'center', justifyContent: 'center', marginTop: 80, paddingHorizontal: 40 },
    emptyText: { fontSize: 16, fontWeight: '800', marginBottom: 6 },
    emptySubText: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
});
