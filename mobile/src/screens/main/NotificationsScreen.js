import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, FlatList, TouchableOpacity,
    ActivityIndicator, RefreshControl, Platform, Alert, Animated as RNAnimated
} from 'react-native';
import Animated, { ZoomIn, ZoomOut } from 'react-native-reanimated';
import { Swipeable } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { getNotifications, markNotificationRead, markAllNotificationsRead, deleteNotification } from '../../api/api';
import { spacing, radius, typography, shadow } from '../../theme/colors';

const NOTIF_ICONS = {
    budget_alert: { name: 'pie-chart', color: '#f59e0b', bg: '#fef3c7' },
    savings_goal: { name: 'target', color: '#8b5cf6', bg: '#ede9fe' },
    debt_reminder: { name: 'clock', color: '#06b6d4', bg: '#ecfeff' },
    system: { name: 'info', color: '#3b82f6', bg: '#eff6ff' },
    transaction: { name: 'shopping-bag', color: '#e91e8c', bg: '#fdf2f8' }
};

export default function NotificationsScreen({ navigation }) {
    const { COLORS } = useTheme();
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

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
    }, [loadData]);

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
                        <View style={[styles.iconContainer, { backgroundColor: config.bg }]}>
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
                                {new Date(item.createdAt).toLocaleDateString()} • {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </Text>
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
});
