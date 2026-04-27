import React, { useState, useCallback, useEffect } from 'react';
import Reanimated, { ZoomIn, ZoomOut, LinearTransition } from 'react-native-reanimated';
import { useFocusEffect } from '@react-navigation/native';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView,
    RefreshControl, ActivityIndicator, Image, Dimensions, LayoutAnimation
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { getGroupWallets, respondToTripInvite, deleteTrip, updateTrip } from '../../api/api';
import CustomAlertModal from '../../components/CustomAlertModal';
import Skeleton from '../../components/Skeleton';
import { formatCurrency } from '../../utils/formatters';
import { API_BASE } from '../../store/authStore';
import { Swipeable } from 'react-native-gesture-handler';
import { triggerHaptic } from '../../utils/haptics';

const { width } = Dimensions.get('window');

const TripCard = ({ trip, onPress, onRespond, COLORS, userId }) => {
    const isOwner = trip.owner._id === userId;
    const myStatus = trip.participants.find(p => p.user._id === userId)?.status || (isOwner ? 'accepted' : 'pending');

    // Count active participants
    const activeCount = trip.participants.filter(p => p.status === 'accepted').length + 1;
    const totalSpent = trip.expenses.reduce((sum, exp) => sum + exp.amount, 0);

    return (
        <TouchableOpacity
            onPress={() => onPress(trip)}
            style={[styles.card, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
            activeOpacity={0.8}
        >
            <View style={styles.cardHeader}>
                <View style={[styles.emojiContainer, { backgroundColor: trip.color + '20' }]}>
                    <Text style={styles.emojiText}>{trip.emoji}</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[styles.tripName, { color: COLORS.text }]} numberOfLines={1}>{trip.name}</Text>
                    <Text style={[styles.tripMeta, { color: COLORS.textMuted }]}>
                        {activeCount} member{activeCount !== 1 ? 's' : ''} • {trip.expenses.length} expenses
                    </Text>
                </View>
                {trip.isSettled ? (
                    <View style={[styles.settledBadge, { backgroundColor: COLORS.primary + 80 }]}>
                        <Text style={[styles.settledText, { color: COLORS.textMuted }]}>SETTLED</Text>
                    </View>
                ) : trip.isArchived ? (
                    <View style={[styles.pendingBadge, { backgroundColor: COLORS.primary }]}>
                        <Text style={[styles.pendingText, { color: '#fff' }]}>ARCHIVED</Text>
                    </View>
                ) : myStatus === 'pending' && (
                    <View style={styles.pendingBadge}>
                        <Text style={styles.pendingText}>INVITED</Text>
                    </View>
                )}
            </View>

            <View style={styles.cardBody}>
                <View>
                    <Text style={[styles.label, { color: COLORS.textMuted }]}>TOTAL SPENT</Text>
                    <Text style={[styles.amount, { color: COLORS.text }]}>{formatCurrency(totalSpent, trip.currency)}</Text>
                </View>
                <View style={styles.avatarStack}>
                    {[trip.owner, ...trip.participants.filter(p => p.status === 'accepted').map(p => p.user)].slice(0, 4).map((user, i) => (
                        <View key={user._id} style={[styles.avatarOverlap, { marginLeft: i === 0 ? 0 : -10, zIndex: 10 - i, borderColor: COLORS.surface }]}>
                            {(user.avatarUrl || user.avatar) ? (
                                <Image
                                    source={{
                                        uri: (user.avatarUrl || user.avatar).startsWith('http')
                                            ? (user.avatarUrl || user.avatar)
                                            : `${API_BASE.replace('/api', '')}/${user.avatarUrl || user.avatar}`
                                    }}
                                    style={styles.avatarImg}
                                    resizeMode="cover"
                                />
                            ) : (
                                <View style={[styles.avatarInitial, { backgroundColor: COLORS.primary }]}>
                                    <Text style={styles.initialText}>{user.name[0]}</Text>
                                </View>
                            )}
                        </View>
                    ))}
                    {activeCount > 4 && (
                        <View style={[styles.avatarOverlap, { marginLeft: -10, zIndex: 0, backgroundColor: COLORS.border, borderColor: COLORS.surface }]}>
                            <Text style={[styles.moreText, { color: COLORS.textMuted }]}>+{activeCount - 4}</Text>
                        </View>
                    )}
                </View>
            </View>

            {myStatus === 'pending' && (
                <View style={styles.actionRow}>
                    <TouchableOpacity
                        onPress={() => onRespond(trip._id, 'accepted')}
                        style={[styles.actionBtn, { backgroundColor: '#22c55e20' }]}
                    >
                        <Feather name="check" size={16} color="#22c55e" />
                        <Text style={[styles.actionBtnText, { color: '#22c55e' }]}>Accept</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => onRespond(trip._id, 'rejected')}
                        style={[styles.actionBtn, { backgroundColor: '#ef444420' }]}
                    >
                        <Feather name="x" size={16} color="#ef4444" />
                        <Text style={[styles.actionBtnText, { color: '#ef4444' }]}>Decline</Text>
                    </TouchableOpacity>
                </View>
            )}
        </TouchableOpacity>
    );
};

const TABS = ['Active', 'Archived'];

export default function GroupWalletScreen({ navigation }) {
    const COLORS = useTheme(state => state.COLORS);
    const { userInfo } = useAuth();
    const [trips, setTrips] = useState([]);
    const [activeTab, setActiveTab] = useState('Active');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [alert, setAlert] = useState({ visible: false, title: '', message: '', type: 'info', onConfirm: null });
    const { hapticsEnabled } = useAuth();

    const load = useCallback(async () => {
        try {
            const data = await getGroupWallets();
            setTrips(data);
        } catch (err) {
            console.error('[GroupWallet] Load error:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            load();
        }, [load])
    );

    const handleRespond = async (id, status) => {
        try {
            await respondToTripInvite(id, status);
            load();
            setAlert({
                visible: true,
                title: status === 'accepted' ? 'Trip Joined!' : 'Invite Declined',
                message: status === 'accepted' ? 'You can now view and add expenses to this trip.' : 'The invite has been removed.',
                type: 'success'
            });
        } catch (err) {
            setAlert({
                visible: true,
                title: 'Error',
                message: 'Failed to respond to invite. Please try again.',
                type: 'error'
            });
        }
    };

    const handleDeleteTrip = async (id, skipModal = false) => {
        const executeDelete = async () => {
            try {
                setRefreshing(true);
                await deleteTrip(id);
                load();
                setAlert(p => ({ ...p, visible: false }));
            } catch (e) {
                console.error('Delete failed:', e);
                setAlert({
                    visible: true,
                    title: 'Error',
                    message: 'Failed to remove trip.',
                    type: 'error'
                });
            } finally {
                setRefreshing(false);
            }
        };

        if (skipModal) {
            triggerHaptic(hapticsEnabled, 'impactHeavy');
            return executeDelete();
        }

        setAlert({
            visible: true,
            title: 'Remove Trip',
            message: 'Are you sure you want to remove this trip? This action cannot be undone.',
            type: 'danger',
            onConfirm: executeDelete
        });
    };

    const handleRestoreTrip = async (id) => {
        try {
            triggerHaptic(hapticsEnabled, 'impactLight');
            await updateTrip(id, { isArchived: false });
            load();
        } catch (e) {
            console.error('Restore failed:', e);
        }
    };

    const handleArchiveTrip = async (id) => {
        try {
            triggerHaptic(hapticsEnabled, 'impactLight');
            await updateTrip(id, { isArchived: true });
            load();
        } catch (e) {
            console.error('Archive failed:', e);
        }
    };

    const renderLeftActions = (tripId) => (
        <View style={styles.swipeActions}>
            <TouchableOpacity
                onPress={() => handleDeleteTrip(tripId)}
                style={[styles.deleteAction, { backgroundColor: COLORS.error || '#ef4444' }]}
                activeOpacity={0.8}
            >
                <Feather name="trash-2" size={24} color="#fff" />
                <Text style={styles.swipeActionText}>Delete</Text>
            </TouchableOpacity>
        </View>
    );

    const renderRightActions = (trip) => {
        const isOwner = trip.owner._id === userInfo?._id;

        // If it's an active trip, show "Archive"
        if (!trip.isArchived) {
            if (!isOwner) return null;
            return (
                <View style={styles.swipeActions}>
                    <TouchableOpacity
                        onPress={() => handleArchiveTrip(trip._id)}
                        style={[styles.archiveAction, { backgroundColor: COLORS.primary }]}
                        activeOpacity={0.8}
                    >
                        <Feather name="archive" size={24} color="#fff" />
                        <Text style={styles.swipeActionText}>Archive</Text>
                    </TouchableOpacity>
                </View>
            );
        }

        // If it's an archived trip, show "Restore" (only if not settled)
        if (trip.isSettled || !isOwner) return null;

        return (
            <View style={styles.swipeActions}>
                <TouchableOpacity
                    onPress={() => handleRestoreTrip(trip._id)}
                    style={[styles.archiveAction, { backgroundColor: COLORS.primary }]}
                    activeOpacity={0.8}
                >
                    <MaterialCommunityIcons name="archive-arrow-up-outline" size={24} color="#fff" />
                    <Text style={styles.swipeActionText}>Restore</Text>
                </TouchableOpacity>
            </View>
        );
    };

    const filteredTrips = trips.filter(t => {
        if (activeTab === 'Archived') return t.isArchived;
        return !t.isArchived;
    });

    if (loading) {
        return (
            <SafeAreaView style={[styles.safe, { backgroundColor: COLORS.background }]}>
                <View style={styles.header}>
                    <Text style={[styles.title, { color: COLORS.text }]}>Group Trips</Text>
                </View>
                <View style={{ padding: 20 }}>
                    {[1, 2, 3].map(i => <Skeleton key={i} width="100%" height={150} borderRadius={16} style={{ marginBottom: 16 }} />)}
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={[styles.safe, { backgroundColor: COLORS.background }]}>
            <View style={styles.header}>
                <View style={styles.headerTop}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backBtn, { backgroundColor: COLORS.surface }]}>
                        <Feather name="arrow-left" size={20} color={COLORS.text} />
                    </TouchableOpacity>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={[styles.title, { color: COLORS.text }]}>Group Trips</Text>
                        <Text style={[styles.subtitle, { color: COLORS.textMuted }]}>Shared expenses with friends</Text>
                    </View>
                    <TouchableOpacity
                        onPress={() => navigation.navigate('CreateTripScreen')}
                        style={[styles.addBtn, { backgroundColor: COLORS.primary }]}
                    >
                        <Feather name="plus" size={20} color="#fff" />
                    </TouchableOpacity>
                </View>

                <View style={styles.tabsWrapper}>
                    <View style={[styles.tabsRow, { backgroundColor: COLORS.surface }]}>
                        {TABS.map(tab => {
                            const active = activeTab === tab;
                            return (
                                <TouchableOpacity
                                    key={tab}
                                    onPress={() => {
                                        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                        setActiveTab(tab);
                                    }}
                                    style={[styles.tab, active && { backgroundColor: COLORS.primary }]}
                                >
                                    <Text style={[styles.tabText, { color: active ? '#fff' : COLORS.textMuted, fontWeight: active ? '800' : '600' }]}>
                                        {tab}
                                    </Text>
                                    {trips.filter(t => tab === 'Active' ? !t.isArchived : t.isArchived).length > 0 && (
                                        <View style={[styles.tabBadge, { backgroundColor: active ? 'rgba(255,255,255,0.3)' : COLORS.primary + '20' }]}>
                                            <Text style={[styles.tabBadgeText, { color: active ? '#fff' : COLORS.primary }]}>
                                                {trips.filter(t => tab === 'Active' ? !t.isArchived : t.isArchived).length}
                                            </Text>
                                        </View>
                                    )}
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>
            </View>

            <ScrollView
                contentContainerStyle={styles.scroll}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.primary} />}
            >
                {filteredTrips.length === 0 ? (
                    <View style={styles.empty}>
                        <LinearGradient colors={[COLORS.primary + '20', 'transparent']} style={styles.emptyIcon}>
                            <MaterialCommunityIcons
                                name={activeTab === 'Archived' ? "archive-outline" : "airplane-takeoff"}
                                size={48}
                                color={COLORS.primary}
                            />
                        </LinearGradient>
                        <Text style={[styles.emptyTitle, { color: COLORS.text }]}>
                            {activeTab === 'Archived' ? 'No archives yet' : 'No trips yet'}
                        </Text>
                        <Text style={[styles.emptySub, { color: COLORS.textMuted }]}>
                            {activeTab === 'Archived'
                                ? 'Archived trips are kept here for your records. Any final balances were moved to your Debts section.'
                                : 'Create a group trip to start tracking shared expenses with your friends.'}
                        </Text>
                        {activeTab === 'Active' && (
                            <TouchableOpacity
                                onPress={() => navigation.navigate('CreateTripScreen')}
                                style={[styles.createBtn, { backgroundColor: COLORS.primary }]}
                            >
                                <Text style={styles.createBtnText}>Plan a New Trip</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                ) : (
                    filteredTrips.map(trip => (
                        <Reanimated.View entering={ZoomIn} exiting={ZoomOut} layout={LinearTransition} key={trip._id}>
                            <Swipeable
                                renderLeftActions={activeTab === 'Archived' ? () => renderLeftActions(trip._id) : null}
                                renderRightActions={() => renderRightActions(trip)}
                                onSwipeableOpen={(direction) => {
                                    if (direction === 'left' && activeTab === 'Archived') {
                                        handleDeleteTrip(trip._id, true);
                                    } else if (direction === 'right') {
                                        const isOwner = trip.owner._id === userInfo?._id;
                                        if (isOwner) {
                                            if (activeTab === 'Active') {
                                                handleArchiveTrip(trip._id);
                                            } else if (activeTab === 'Archived' && !trip.isSettled) {
                                                handleRestoreTrip(trip._id);
                                            }
                                        }
                                    }
                                }}
                                friction={2}
                                overshootRight={false}
                                overshootLeft={false}
                                rightThreshold={40}
                                leftThreshold={40}
                                containerStyle={{ marginBottom: 16 }}
                            >
                                <TripCard
                                    trip={trip}
                                    userId={userInfo?._id}
                                    COLORS={COLORS}
                                    onPress={(t) => navigation.navigate('GroupWalletDetailScreen', { id: t._id })}
                                    onRespond={handleRespond}
                                />
                            </Swipeable>
                        </Reanimated.View>
                    ))
                )}
            </ScrollView>

            <CustomAlertModal
                visible={alert.visible}
                title={alert.title}
                message={alert.message}
                type={alert.type}
                onConfirm={alert.onConfirm}
                onClose={() => setAlert({ ...alert, visible: false })}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1 },
    header: { padding: 20, paddingBottom: 10 },
    headerTop: { flexDirection: 'row', alignItems: 'center' },
    tabsWrapper: { marginTop: 15 },
    tabsRow: { flexDirection: 'row', borderRadius: 14, padding: 4, gap: 4 },
    tab: { flex: 1, height: 38, borderRadius: 10, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 },
    tabText: { fontSize: 13 },
    tabBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
    tabBadgeText: { fontSize: 10, fontWeight: '800' },
    backBtn: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    title: { fontSize: 24, fontWeight: '800' },
    subtitle: { fontSize: 14, marginTop: 2 },
    addBtn: { width: 44, height: 44, borderRadius: 15, justifyContent: 'center', alignItems: 'center', elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8 },
    scroll: { padding: 20 },
    card: { padding: 16, borderRadius: 20, borderWidth: 1, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4 },
    cardHeader: { flexDirection: 'row', alignItems: 'center' },
    emojiContainer: { width: 50, height: 50, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
    emojiText: { fontSize: 24 },
    tripName: { fontSize: 18, fontWeight: '700' },
    tripMeta: { fontSize: 12, marginTop: 2 },
    pendingBadge: { backgroundColor: '#f59e0b20', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    pendingText: { color: '#f59e0b', fontSize: 10, fontWeight: '800' },
    settledBadge: { backgroundColor: '#22c55e20', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    settledText: { color: '#22c55e', fontSize: 10, fontWeight: '800' },
    cardBody: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 20 },
    label: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
    amount: { fontSize: 20, fontWeight: '800', marginTop: 4 },
    avatarStack: { flexDirection: 'row', alignItems: 'center' },
    avatarOverlap: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
    avatarImg: { width: '100%', height: '100%' },
    avatarInitial: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
    initialText: { color: '#fff', fontSize: 14, fontWeight: '700' },
    moreText: { fontSize: 10, fontWeight: '700' },
    actionRow: { flexDirection: 'row', gap: 12, marginTop: 16, borderTopWidth: 1, borderTopColor: '#00000008', paddingTop: 16 },
    actionBtn: { flex: 1, height: 38, borderRadius: 10, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 },
    actionBtnText: { fontSize: 14, fontWeight: '700' },
    empty: { alignItems: 'center', justifyContent: 'center', marginTop: 60, paddingHorizontal: 40 },
    emptyIcon: { width: 100, height: 100, borderRadius: 50, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
    emptyTitle: { fontSize: 20, fontWeight: '800', marginBottom: 8 },
    emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
    createBtn: { marginTop: 24, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 16 },
    createBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    swipeActions: { flexDirection: 'row', height: '100%' },
    deleteAction: { width: 80, height: '100%', justifyContent: 'center', alignItems: 'center', borderRadius: 20, marginLeft: 0 },
    archiveAction: { width: 80, height: '100%', justifyContent: 'center', alignItems: 'center', borderRadius: 20, marginRight: 0 },
    swipeActionText: { color: '#fff', fontSize: 10, fontWeight: '800', marginTop: 4 }
});
