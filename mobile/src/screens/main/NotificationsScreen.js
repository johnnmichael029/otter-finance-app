import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, FlatList, TouchableOpacity,
    ActivityIndicator, RefreshControl, Platform, Alert, Image, Animated as RNAnimated
} from 'react-native';
import Animated, { ZoomIn, ZoomOut } from 'react-native-reanimated';
import { Swipeable } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useAuth, API_BASE } from '../../context/AuthContext';
import { getNotifications, markNotificationRead, markAllNotificationsRead, deleteNotification, respondFriendRequest, respondDebtRequest } from '../../api/api';
import { connectSocket, disconnectSocket, getSocket } from '../../utils/socket';
import { spacing, radius, typography, shadow } from '../../theme/colors';
import CustomAlertModal from '../../components/CustomAlertModal';

const NOTIF_ICONS = {
    budget_alert: { name: 'pie-chart', color: '#f59e0b', bg: '#fef3c7' },
    savings_goal: { name: 'target', color: '#8b5cf6', bg: '#ede9fe' },
    debt_reminder: { name: 'clock', color: '#06b6d4', bg: '#ecfeff' },
    system: { name: 'info', color: '#3b82f6', bg: '#eff6ff' },
    transaction: { name: 'shopping-bag', color: '#e91e8c', bg: '#fdf2f8' },
    friend_request: { name: 'user-plus', color: '#22c55e', bg: '#f0fdf4' },
    friend_accepted: { name: 'check-circle', color: '#8b5cf6', bg: '#ede9fe' },
    debt_request: { name: 'dollar-sign', color: '#f59e0b', bg: '#fff7ed' },
    debt_accepted: { name: 'check-circle', color: '#22c55e', bg: '#f0fdf4' },
    debt_payment: { name: 'check-circle', color: '#8b5cf6', bg: '#ede9fe' }
};

export default function NotificationsScreen({ navigation }) {
    const COLORS = useTheme(state => state.COLORS);
    const { userInfo } = useAuth();
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [alertConfig, setAlertConfig] = useState({ visible: false, title: '', message: '', type: 'info' });

    const loadData = useCallback(async () => {
        try {
            const res = await getNotifications();
            setNotifications(res.notifications || []);
            setUnreadCount(res.unreadCount || 0);
        } catch (error) {
            console.error('[Notifications] Load error:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        loadData();

        if (userInfo?._id) {
            connectSocket(userInfo._id);
        }

        const socket = getSocket();
        if (socket) {
            socket.on('new_notification', (notif) => {
                setNotifications(prev => [notif, ...prev]);
                setUnreadCount(prev => prev + 1);
            });
            socket.on('notification_deleted', ({ debtId }) => {
                setNotifications(prev => prev.filter(n => n.data?.debtId !== debtId));
            });
        }

        return () => {
            if (socket) {
                socket.off('new_notification');
                socket.off('notification_deleted');
            }
        };
    }, [loadData, userInfo?._id]);

    const handleMarkAsRead = async (id) => {
        try {
            await markNotificationRead(id);
            setNotifications(prev => prev.map(n => n._id === id ? { ...n, isRead: true } : n));
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch (error) {
            console.error('[Notifications] Mark read error:', error);
        }
    };

    const handleMarkAllRead = async () => {
        try {
            await markAllNotificationsRead();
            setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
            setUnreadCount(0);
        } catch (error) {
            console.error('[Notifications] Mark all read error:', error);
        }
    };

    const handleDelete = async (id) => {
        try {
            await deleteNotification(id);
            const wasUnread = !notifications.find(n => n._id === id)?.isRead;
            setNotifications(prev => prev.filter(n => n._id !== id));
            if (wasUnread) setUnreadCount(prev => Math.max(0, prev - 1));
        } catch (error) {
            console.error('[Notifications] Delete error:', error);
        }
    };

    const handleRespondFriendRequest = async (notifId, requestId, status) => {
        try {
            await respondFriendRequest(requestId, status);
            // Delete the notification or mark it as read after responding?
            // Usually, once responded, the notification is "done"
            handleDelete(notifId);
            setAlertConfig({ visible: true, title: 'Success', message: `Friend request ${status}!`, type: 'success' });
        } catch (error) {
            console.error('[Notifications] Respond error:', error);
            const msg = error.response?.data?.error || 'Failed to respond to request.';
            setAlertConfig({ visible: true, title: 'Error', message: msg, type: 'error' });
        }
    };

    const handleRespondDebtRequest = async (notifId, debtId, status) => {
        try {
            await respondDebtRequest(debtId, status === 'accepted' ? 'linked' : 'rejected');
            handleDelete(notifId);
            setAlertConfig({ visible: true, title: 'Success', message: `Debt request ${status}!`, type: 'success' });
        } catch (error) {
            console.error('[Notifications] Debt Respond error:', error);
            const msg = error.response?.data?.error || 'Failed to respond to debt request.';
            setAlertConfig({ visible: true, title: 'Error', message: msg, type: 'error' });
            // If it's already processed, clean up the notification so it goes away
            if (error.response?.status === 404) {
                handleDelete(notifId);
            }
        }
    };

    const renderRightActions = (progress, dragX, id) => {
        const scale = dragX.interpolate({
            inputRange: [-80, 0],
            outputRange: [1, 0],
            extrapolate: 'clamp',
        });

        return (
            <TouchableOpacity
                onPress={() => handleDelete(id)}
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
        const config = NOTIF_ICONS[item.type] || NOTIF_ICONS.system;

        return (
            <Animated.View key={item._id} entering={ZoomIn.springify().damping(50).mass(0.9)} exiting={ZoomOut.duration(100)}>
                <Swipeable
                    renderRightActions={(prog, drag) => renderRightActions(prog, drag, item._id)}
                    friction={1}
                    overshootRight={false}
                    containerStyle={{ marginBottom: spacing.md }}
                >
                    <TouchableOpacity
                        style={[styles.notifItem, { backgroundColor: COLORS.surface, marginBottom: 0 }]}
                        activeOpacity={0.7}
                        onPress={() => !item.isRead && handleMarkAsRead(item._id)}
                    >
                        <View style={[styles.iconContainer, { backgroundColor: config.bg, overflow: 'hidden' }]}>
                            <Feather name={config.name} size={20} color={config.color} />
                        </View>

                        <View style={styles.contentContainer}>
                            <View style={styles.headerRow}>
                                <Text style={[styles.title, { color: COLORS.text, fontWeight: item.isRead ? '600' : '800' }]}>
                                    {item.title}
                                </Text>
                                {!item.isRead && <View style={[styles.unreadDot, { backgroundColor: COLORS.primary }]} />}
                            </View>
                            <Text style={[styles.message, { color: COLORS.textMuted }]} numberOfLines={2}>
                                {item.message}
                            </Text>
                            <Text style={[styles.date, { color: COLORS.textMuted }]}>
                                {new Date(item.createdAt).toLocaleDateString('en-GB')} • {new Date(item.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                            </Text>

                            {item.type === 'friend_request' && item.data?.requestId && (
                                <View style={styles.actionRow}>
                                    <TouchableOpacity 
                                        style={[styles.actionBtn, { backgroundColor: '#22c55e' }]} 
                                        onPress={() => handleRespondFriendRequest(item._id, item.data.requestId, 'accepted')}
                                    >
                                        <Feather name="check" size={14} color="#fff" />
                                        <Text style={styles.actionBtnText}>Accept</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity 
                                        style={[styles.actionBtn, { backgroundColor: COLORS.border }]} 
                                        onPress={() => handleRespondFriendRequest(item._id, item.data.requestId, 'rejected')}
                                    >
                                        <Feather name="x" size={14} color={COLORS.text} />
                                        <Text style={[styles.actionBtnText, { color: COLORS.text }]}>Decline</Text>
                                    </TouchableOpacity>
                                </View>
                            )}

                            {item.type === 'debt_request' && item.data?.debtId && (
                                <View style={styles.actionRow}>
                                    <TouchableOpacity 
                                        style={[styles.actionBtn, { backgroundColor: COLORS.primary }]} 
                                        onPress={() => handleRespondDebtRequest(item._id, item.data.debtId, 'accepted')}
                                    >
                                        <Feather name="check" size={14} color="#fff" />
                                        <Text style={styles.actionBtnText}>Confirm</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity 
                                        style={[styles.actionBtn, { backgroundColor: COLORS.border }]} 
                                        onPress={() => handleRespondDebtRequest(item._id, item.data.debtId, 'rejected')}
                                    >
                                        <Feather name="x" size={14} color={COLORS.text} />
                                        <Text style={[styles.actionBtnText, { color: COLORS.text }]}>Reject</Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>
                    </TouchableOpacity>
                </Swipeable>
            </Animated.View>
        );
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: COLORS.background }]} edges={['top']}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Feather name="arrow-left" size={24} color={COLORS.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: COLORS.text }]}>Notification Center</Text>
                {unreadCount > 0 && (
                    <TouchableOpacity onPress={handleMarkAllRead}>
                        <Text style={[styles.markAllText, { color: COLORS.primary }]}>Mark all as read</Text>
                    </TouchableOpacity>
                )}
            </View>

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={COLORS.primary} />
                </View>
            ) : notifications.length === 0 ? (
                <View style={styles.center}>
                    <MaterialCommunityIcons name="bell-off-outline" size={64} color={COLORS.textMuted} style={{ opacity: 0.3 }} />
                    <Text style={[styles.emptyTitle, { color: COLORS.text }]}>No alerts yet</Text>
                    <Text style={[styles.emptySub, { color: COLORS.textMuted }]}>We'll notify you here when there's an update to your balance or budget.</Text>
                </View>
            ) : (
                <FlatList
                    data={notifications}
                    keyExtractor={item => item._id}
                    renderItem={renderItem}
                    contentContainerStyle={styles.list}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={COLORS.primary} />
                    }
                />
            )}

            <CustomAlertModal
                visible={alertConfig.visible}
                title={alertConfig.title}
                message={alertConfig.message}
                type={alertConfig.type}
                onClose={() => setAlertConfig(p => ({ ...p, visible: false }))}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        gap: spacing.md
    },
    backBtn: { padding: 4 },
    headerTitle: { fontSize: 20, fontWeight: '800', flex: 1 },
    markAllText: { fontSize: 13, fontWeight: '700' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xl },
    emptyTitle: { fontSize: 18, fontWeight: '800', marginTop: spacing.md },
    emptySub: { fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 },
    list: { padding: spacing.lg },
    notifItem: {
        flexDirection: 'row',
        padding: spacing.md,
        borderRadius: radius.lg,
        marginBottom: spacing.md,
        ...shadow.soft
    },
    iconContainer: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: spacing.md
    },
    contentContainer: { flex: 1 },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    title: { fontSize: 15, paddingRight: 12 },
    unreadDot: { width: 8, height: 8, borderRadius: 4 },
    message: { fontSize: 13, lineHeight: 18, marginBottom: 6 },
    message: { fontSize: 13, lineHeight: 18, marginBottom: 6 },
    date: { fontSize: 11, fontWeight: '600', opacity: 0.7 },
    hiddenDeleteBtn: { width: 80, height: '100%', borderRadius: radius.lg, justifyContent: 'center', alignItems: 'center', marginLeft: 12, elevation: 1 },
    actionRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
    actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
    actionBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },
});
