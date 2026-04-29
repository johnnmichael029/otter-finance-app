import React, { useState, useCallback, useEffect } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, RefreshControl, ScrollView, ActivityIndicator
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import Animated, { ZoomIn, ZoomOut, LinearTransition } from 'react-native-reanimated';
import SwipeableRow from '../../components/SwipeableRow';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useFinanceStore } from '../../store/financeStore';
import { spacing, radius } from '../../theme/colors';
import CustomAlertModal from '../../components/CustomAlertModal';
import { formatCurrency, IconRenderer } from '../../utils/formatters';
import { respondToChallengeInvite, updateChallenge, deleteChallenge, emptyChallengeArchives } from '../../api/api';
import { triggerHaptic } from '../../utils/haptics';

const TABS = ['Active', 'Archived'];

export default function SavingsChallengesScreen({ navigation }) {
    const COLORS = useTheme(state => state.COLORS);
    const { userInfo } = useAuth();
    const styles = getStyles(COLORS);

    const challengesFromStore = useFinanceStore(state => state.challenges);
    const { refreshAll } = useFinanceStore.getState();

    const [activeTab, setActiveTab] = useState('Active');
    const [refreshing, setRefreshing] = useState(false);
    const [alertConfig, setAlertConfig] = useState({ visible: false, title: '', message: '', type: 'info', onConfirm: null });
    const { hapticsEnabled } = useAuth();

    const loadData = useCallback(async () => {
        setRefreshing(true);
        await refreshAll(true);
        setRefreshing(false);
    }, [refreshAll]);


    const handleArchiveToggle = async (id, currentStatus) => {
        try {
            triggerHaptic(hapticsEnabled, 'impactLight');
            const newStatus = currentStatus === 'archived' ? 'active' : 'archived';
            await updateChallenge(id, { status: newStatus });
            refreshAll(true);
        } catch (e) {
            console.error('Archive toggle failed:', e);
        }
    };

    const handleDeleteChallenge = async (id, skipModal = false) => {
        const executeDelete = async () => {
            try {
                setRefreshing(true);
                await deleteChallenge(id);
                refreshAll(true);
                setAlertConfig(p => ({ ...p, visible: false }));
            } catch (e) {
                console.error('Delete failed:', e);
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
            title: 'Delete Challenge',
            message: 'Are you sure you want to permanently delete this challenge? This action cannot be undone.',
            type: 'danger',
            onConfirm: executeDelete
        });
    };

    const handleEmptyArchives = () => {
        const archivedCount = challengesFromStore.filter(c => c.status === 'archived').length;
        if (archivedCount === 0) return;

        setAlertConfig({
            visible: true,
            title: 'Empty Archives?',
            message: `This will permanently delete all ${archivedCount} archived challenges. This action cannot be undone.`,
            type: 'danger',
            onConfirm: async () => {
                try {
                    setRefreshing(true);
                    await emptyChallengeArchives();
                    refreshAll(true);
                    setAlertConfig(p => ({ ...p, visible: false }));
                } catch (err) {
                    console.error('Empty archives failed:', err);
                } finally {
                    setRefreshing(false);
                }
            }
        });
    };

    const handleInviteResponse = async (challengeId, status) => {
        try {
            setRefreshing(true);
            await respondToChallengeInvite(challengeId, status);
            setAlertConfig({
                visible: true,
                title: status === 'accepted' ? 'Accepted!' : 'Declined',
                message: status === 'accepted' ? 'You joined the challenge.' : 'Invitation removed.',
                type: 'success',
                onConfirm: () => setAlertConfig(p => ({ ...p, visible: false }))
            });
            await loadData();
        } catch (e) {
            setAlertConfig({
                visible: true, title: 'Error',
                message: e.response?.data?.error || 'Action failed.', type: 'error',
                onConfirm: () => setAlertConfig(p => ({ ...p, visible: false }))
            });
        } finally {
            setRefreshing(false);
        }
    };

    const renderChallengeCard = ({ item }) => {
        const isInvite = item.participants?.some(p => p.user?._id === userInfo._id && p.status === 'pending');
        const isParticipant = item.participants?.some(p => p.user?._id === userInfo._id && p.status === 'accepted');

        const pIndex = item.participants?.findIndex(p => p.user?._id === userInfo._id);
        const myAmount = (isParticipant && pIndex !== -1) ? item.participants[pIndex].currentAmount : item.currentAmount;
        const myTarget = item.targetAmount;

        const pct = myTarget > 0 ? Math.min((myAmount / myTarget) * 100, 100) : 0;
        const isComplete = item.status === 'completed' || pct >= 100;
        const isArchived = item.status === 'archived';

        let leftAction = null;
        let rightAction = null;

        if (isArchived) {
            leftAction = {
                color: COLORS.error || '#ef4444',
                icon: 'trash-2',
                label: 'Delete',
                onPress: () => handleDeleteChallenge(item._id, true)
            };
            rightAction = {
                color: COLORS.primary,
                icon: 'archive-arrow-up-outline',
                iconFamily: 'MaterialCommunityIcons',
                label: 'Restore',
                onPress: () => handleArchiveToggle(item._id, item.status)
            };
        } else {
            rightAction = {
                color: COLORS.primary,
                icon: 'archive-arrow-down-outline',
                iconFamily: 'MaterialCommunityIcons',
                label: 'Archive',
                onPress: () => handleArchiveToggle(item._id, item.status)
            };
        }

        return (
            <Animated.View layout={LinearTransition.springify()} entering={ZoomIn.springify().damping(50).mass(0.9)} exiting={ZoomOut.duration(100)} style={{ marginBottom: 16 }}>
                <SwipeableRow
                    leftAction={leftAction}
                    rightAction={rightAction}
                    containerStyle={{ marginBottom: 0 }}
                >
                    <View style={[styles.card, { backgroundColor: COLORS.surface, marginBottom: 0 }]}>
                        <TouchableOpacity
                            activeOpacity={0.7}
                            onPress={() => !isInvite && navigation.navigate('ChallengeDetail', { challenge: item })}
                            disabled={isInvite || isArchived}
                        >
                            <View style={styles.cardHeader}>
                                <View style={[styles.iconBox, { backgroundColor: (item.color || COLORS.primary) + '20' }]}>
                                    <IconRenderer name={item.icon || 'award'} family="Feather" size={20} color={item.color || COLORS.primary} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        <Text style={[styles.cardTitle, { color: COLORS.text }]}>{item.title}</Text>
                                        {item.isShared && <Ionicons name="people" size={14} color={COLORS.primary} />}
                                    </View>
                                    <Text style={[styles.cardSub, { color: COLORS.textMuted }]}>
                                        {isInvite ? `Invited by ${item.user?.name || 'Friend'}` : item.type.toUpperCase().replace('-', ' ')}
                                    </Text>
                                </View>
                                {isComplete && !isInvite && <Feather name="check-circle" size={18} color="#22c55e" />}
                            </View>

                            {!isInvite && (
                                <>
                                    <View style={styles.barContainer}>
                                        <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: item.color || COLORS.primary }]} />
                                    </View>
                                    <View style={styles.cardFooter}>
                                        <Text style={[styles.cardPct, { color: COLORS.textMuted }]}>{Math.round(pct)}% reached</Text>
                                        <Text style={[styles.cardTarget, { color: COLORS.textMuted }]}>
                                            {myTarget > 0 ? `Target: ${formatCurrency(myTarget, userInfo?.currency)}` : `Saved: ${formatCurrency(myAmount, userInfo?.currency)}`}
                                        </Text>
                                    </View>
                                </>
                            )}
                        </TouchableOpacity>

                        {isInvite && (
                            <View style={styles.inviteActions}>
                                <TouchableOpacity
                                    style={[styles.inviteBtn, { backgroundColor: COLORS.primary }]}
                                    onPress={() => handleInviteResponse(item._id, 'accepted')}
                                >
                                    <Text style={styles.inviteBtnText}>Accept</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.inviteBtn, { backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border }]}
                                    onPress={() => handleInviteResponse(item._id, 'rejected')}
                                >
                                    <Text style={[styles.inviteBtnText, { color: COLORS.text }]}>Decline</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                </SwipeableRow>
            </Animated.View>
        );
    };

    const filteredChallenges = challengesFromStore.filter(c => {
        if (activeTab === 'Archived') return c.status === 'archived';
        return c.status !== 'archived';
    });

    return (
        <SafeAreaView style={styles.safe}>
            <View style={styles.header}>
                <View style={styles.topRow}>
                    <View>
                        <Text style={styles.title}>Challenges</Text>
                        <Text style={[styles.sub, { color: COLORS.textMuted }]}>Gamify your savings journey</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        {activeTab === 'Archived' && challengesFromStore.some(c => c.status === 'archived') && (
                            <TouchableOpacity
                                onPress={handleEmptyArchives}
                                style={{ padding: 4 }}
                            >
                                <Feather name="trash-2" size={20} color={COLORS.error || '#ef4444'} />
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity
                            style={[styles.backBtn, { backgroundColor: COLORS.surface }]}
                            onPress={() => navigation.goBack()}
                        >
                            <Feather name="x" size={24} color={COLORS.text} />
                        </TouchableOpacity>
                    </View>
                </View>

                <View style={{ height: 48, marginTop: spacing.md }}>
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
            </View>

            <View style={{ flex: 1 }}>
                <FlashList
                    data={filteredChallenges}
                    renderItem={renderChallengeCard}
                    estimatedItemSize={100}
                    keyExtractor={item => item._id}
                    contentContainerStyle={styles.listContent}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadData} tintColor={COLORS.primary} />}
                    ListEmptyComponent={() => (
                        <View style={styles.emptyContainer}>
                            <Text style={styles.emptyEmoji}>{activeTab === 'Archived' ? '📦' : '⚔️'}</Text>
                            <Text style={[styles.emptyText, { color: COLORS.textMuted }]}>
                                {activeTab === 'Archived' ? 'No archived challenges.' : 'No active challenges.'}
                            </Text>
                            {activeTab === 'Active' && (
                                <TouchableOpacity
                                    style={[styles.createBtn, { backgroundColor: COLORS.primary }]}
                                    onPress={() => navigation.navigate('CreateChallenge')}
                                >
                                    <Text style={styles.createBtnText}>Create a Challenge</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    )}
                />
            </View>

            {challengesFromStore.length > 0 && (
                <TouchableOpacity
                    style={[styles.fab, { backgroundColor: COLORS.primary }]}
                    onPress={() => navigation.navigate('CreateChallenge')}
                >
                    <Feather name="plus" size={24} color="#fff" />
                </TouchableOpacity>
            )}

            <CustomAlertModal
                visible={alertConfig.visible}
                onClose={() => setAlertConfig(p => ({ ...p, visible: false }))}
                title={alertConfig.title}
                message={alertConfig.message}
                type={alertConfig.type}
                onConfirm={alertConfig.onConfirm}
            />
        </SafeAreaView>
    );
}

const getStyles = (COLORS) => StyleSheet.create({
    safe: { flex: 1, backgroundColor: COLORS.background },
    listContent: { paddingHorizontal: spacing.lg, paddingBottom: 100 },
    header: { padding: spacing.lg, paddingBottom: 0 },
    topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    title: { fontSize: 26, fontWeight: '900', color: COLORS.text },
    sub: { fontSize: 13, fontWeight: '600', marginTop: 2 },
    backBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
    tabsRow: { gap: 8, alignItems: 'center' },
    tab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: COLORS.surface, justifyContent: 'center', height: 36 },
    tabText: { fontSize: 13, fontWeight: '700' },
    card: { borderRadius: radius.xl, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
    iconBox: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
    cardTitle: { fontSize: 16, fontWeight: '900' },
    cardSub: { fontSize: 12, fontWeight: '600', marginTop: 2 },
    barContainer: { height: 8, backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 4, overflow: 'hidden', marginBottom: 12 },
    barFill: { height: '100%', borderRadius: 4 },
    cardFooter: { flexDirection: 'row', justifyContent: 'space-between' },
    cardPct: { fontSize: 11, fontWeight: '700' },
    cardTarget: { fontSize: 11, fontWeight: '700' },
    inviteActions: { flexDirection: 'row', gap: 10, marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)' },
    inviteBtn: { flex: 1, height: 40, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center' },
    inviteBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
    emptyContainer: { alignItems: 'center', marginTop: 60 },
    emptyEmoji: { fontSize: 48, marginBottom: 16 },
    emptyText: { fontSize: 15, fontWeight: '600', marginBottom: 24 },
    createBtn: { paddingHorizontal: 24, paddingVertical: 14, borderRadius: radius.lg },
    createBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
    swipeActions: { flexDirection: 'row', height: '100%' },
    archiveAction: {
        width: 70,
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: radius.xl,
        marginHorizontal: 4,
    },
    deleteAction: {
        width: 70,
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: radius.xl,
        marginHorizontal: 4,
    },
    archiveActionText: { color: '#fff', fontSize: 10, fontWeight: '800', marginTop: 4 },
    fab: { position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', elevation: 8, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } }
});
