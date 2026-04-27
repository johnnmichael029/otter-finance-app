import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, FlatList,
    ActivityIndicator, RefreshControl, Animated as RNAnimated
} from 'react-native';
import Animated, { ZoomIn, ZoomOut } from 'react-native-reanimated';
import { Swipeable } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { getShoppingSessions, deleteShoppingSession } from '../../api/api';
import { spacing, radius } from '../../theme/colors';
import Skeleton from '../../components/Skeleton';
import { formatCurrency, formatDate } from '../../utils/formatters';

const PM_ICONS = { cash: 'cash', gcash: 'cellphone', card: 'credit-card', other: 'dots-horizontal' };
const STATUS_COLORS = { completed: '#22c55e', cancelled: '#ef4444', active: '#f59e0b' };

export default function ShoppingHomeScreen({ navigation }) {
    const COLORS = useTheme(state => state.COLORS);
    const { userInfo } = useAuth();
    const styles = getStyles(COLORS);

    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [startModal, setStartModal] = useState(false);

    const loadSessions = useCallback(async () => {
        try {
            setRefreshing(true);
            const res = await getShoppingSessions({ limit: 50 });
            setSessions(res.sessions || []);
        } catch (e) {
            console.warn('[Shopping] load error:', e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        const unsub = navigation.addListener('focus', loadSessions);
        return unsub;
    }, [navigation, loadSessions]);

    const completedSessions = sessions.filter(s => s.status === 'completed');
    const totalSpent = completedSessions.reduce((sum, s) => sum + s.total, 0);

    const handleDelete = (id) => {
        deleteShoppingSession(id).then(() => {
            loadSessions();
        }).catch(() => { });
    };

    const renderRightActions = (progress, dragX, item) => {
        const scale = dragX.interpolate({
            inputRange: [-80, 0],
            outputRange: [1, 0],
            extrapolate: 'clamp',
        });

        return (
            <TouchableOpacity
                onPress={() => handleDelete(item._id)}
                style={[styles.hiddenDeleteBtn, { backgroundColor: '#ef4444' }]}
                activeOpacity={0.8}
            >
                <RNAnimated.View style={{ transform: [{ scale }] }}>
                    <Feather name="trash-2" size={24} color="#fff" />
                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800', marginTop: 4 }}>Delete</Text>
                </RNAnimated.View>
            </TouchableOpacity>
        );
    };

    const renderItem = ({ item }) => {
        const statusColor = STATUS_COLORS[item.status] || COLORS.textMuted;
        const pmIconName = PM_ICONS[item.paymentMethod] || 'dots-horizontal';

        const content = (
            <TouchableOpacity
                style={[styles.sessionCard, { backgroundColor: COLORS.surface, marginBottom: 0 }]}
                onPress={() => {
                    if (item.status === 'active') {
                        navigation.navigate('ShoppingSession', { resumeSession: item });
                    } else {
                        navigation.navigate('ShoppingHistoryDetail', { session: item });
                    }
                }}
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
                            <Text style={[styles.statusText, { color: statusColor }]}>
                                {item.status === 'active' ? 'Resume Shopping' : item.status}
                            </Text>
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
            <Animated.View key={item._id} entering={ZoomIn.springify().damping(50).mass(0.9)} exiting={ZoomOut.duration(100)}>
                {item.status === 'cancelled' ? (
                    <Swipeable
                        renderRightActions={(prog, drag) => renderRightActions(prog, drag, item)}
                        friction={1}
                        overshootRight={false}
                        containerStyle={{ marginBottom: spacing.sm }}
                    >
                        {content}
                    </Swipeable>
                ) : (
                    <View style={{ marginBottom: spacing.sm }}>
                        {content}
                    </View>
                )}
            </Animated.View>
        );
    };

    return (
        <SafeAreaView style={[styles.safe, { backgroundColor: COLORS.background }]}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('HomeRoot')}
                    style={[styles.backBtn, { backgroundColor: COLORS.surface }]}
                >
                    <Feather name="arrow-left" size={20} color={COLORS.text} />
                </TouchableOpacity>
                <View>
                    <Text style={[styles.headerTitle, { color: COLORS.text }]}>Smart Shopping</Text>
                    <Text style={[styles.headerSub, { color: COLORS.textMuted }]}>
                        {completedSessions.length} trips · {formatCurrency(totalSpent, userInfo?.currency)} total
                    </Text>
                </View>
                <View style={styles.headerActions}>
                    <TouchableOpacity
                        style={[styles.templateBtn, { backgroundColor: COLORS.surface, borderWeight: 1, borderColor: COLORS.border }]}
                        onPress={() => navigation.navigate('ShoppingTemplates')}
                    >
                        <Feather name="list" size={16} color={COLORS.text} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.startBtn, { backgroundColor: COLORS.primary }]}
                        onPress={() => navigation.navigate('ShoppingSession', { newSession: true })}
                        activeOpacity={0.85}
                    >
                        <Feather name="shopping-cart" size={16} color="#fff" />
                        <Text style={styles.startBtnText}>Start</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Stats Card */}
            <View style={[styles.statsCard, { backgroundColor: COLORS.primary }]}>
                <View style={styles.statItem}>
                    <Text style={styles.statValue}>{completedSessions.length}</Text>
                    <Text style={styles.statLabel}>Trips</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                    <Text style={styles.statValue}>{formatCurrency(totalSpent, userInfo?.currency)}</Text>
                    <Text style={styles.statLabel}>Total Spent</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                    <Text style={styles.statValue}>
                        {completedSessions.length > 0
                            ? formatCurrency(totalSpent / completedSessions.length, userInfo?.currency)
                            : '—'}
                    </Text>
                    <Text style={styles.statLabel}>Avg Trip</Text>
                </View>
            </View>

            {/* History List */}
            <Text style={[styles.sectionTitle, { color: COLORS.text }]}>Shopping History</Text>

            {loading ? (
                <View style={{ padding: spacing.lg }}>
                    {[1, 2, 3, 4].map(i => (
                        <View key={i} style={[styles.sessionCard, { backgroundColor: COLORS.surface, elevation: 0, borderWidth: 1, borderColor: COLORS.border }]}>
                            <Skeleton width={44} height={44} borderRadius={22} />
                            <View style={{ flex: 1 }}>
                                <Skeleton width={130} height={15} style={{ marginBottom: 6 }} />
                                <Skeleton width={90} height={12} style={{ marginBottom: 8 }} />
                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                    <Skeleton width={70} height={18} borderRadius={8} />
                                    <Skeleton width={50} height={18} borderRadius={8} />
                                </View>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                                <Skeleton width={60} height={16} style={{ marginBottom: 6 }} />
                                <Skeleton width={40} height={12} />
                            </View>
                        </View>
                    ))}
                </View>
            ) : (
                <FlatList
                    data={sessions}
                    keyExtractor={item => item._id}
                    renderItem={renderItem}
                    contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 120 }}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadSessions} tintColor={COLORS.primary} />}
                    ListEmptyComponent={() => (
                        <View style={styles.emptyContainer}>
                            <Text style={styles.emptyEmoji}>🛒</Text>
                            <Text style={[styles.emptyText, { color: COLORS.textMuted }]}>No shopping trips yet!</Text>
                            <Text style={[styles.emptySubText, { color: COLORS.textMuted }]}>Tap "Start" to begin your smart shopping experience.</Text>
                        </View>
                    )}
                />
            )}
        </SafeAreaView>
    );
}

const getStyles = (COLORS) => StyleSheet.create({
    safe: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, paddingBottom: spacing.md },
    headerTitle: { fontSize: 15, fontWeight: '800' },
    headerSub: { fontSize: 13, fontWeight: '600', marginTop: 2 },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: 'auto' },
    templateBtn: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
    startBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
    startBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
    statsCard: { marginHorizontal: spacing.lg, marginBottom: spacing.lg, borderRadius: radius.xl, padding: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
    statItem: { alignItems: 'center' },
    statValue: { color: '#fff', fontSize: 16, fontWeight: '900' },
    statLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '600', marginTop: 2 },
    statDivider: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.3)' },
    sectionTitle: { fontSize: 18, fontWeight: '900', paddingHorizontal: spacing.lg, marginBottom: 12 },
    sessionCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: spacing.md, borderRadius: radius.xl, marginBottom: spacing.sm },
    sessionIconBox: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
    sessionLabel: { fontSize: 15, fontWeight: '800' },
    sessionMeta: { fontSize: 12, fontWeight: '500', marginTop: 2 },
    sessionFooter: { flexDirection: 'row', gap: 8, marginTop: 6, alignItems: 'center' },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
    statusText: { fontSize: 10, fontWeight: '800', textTransform: 'capitalize' },
    pmRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    pmText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
    sessionTotal: { fontSize: 15, fontWeight: '900' },
    sessionBudget: { fontSize: 11, fontWeight: '600', marginTop: 2 },
    emptyContainer: { alignItems: 'center', paddingTop: 60 },
    emptyEmoji: { fontSize: 56, marginBottom: 16 },
    emptyText: { fontSize: 16, fontWeight: '800', marginBottom: 8 },
    emptySubText: { fontSize: 13, fontWeight: '500', textAlign: 'center', paddingHorizontal: 32 },
    backBtn: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    hiddenDeleteBtn: { width: 80, height: '100%', borderRadius: radius.xl, justifyContent: 'center', alignItems: 'center', marginLeft: 12, elevation: 1 },
});
