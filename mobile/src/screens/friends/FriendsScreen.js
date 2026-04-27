import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput, ActivityIndicator, Image } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { API_BASE } from '../../store/authStore';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { spacing, radius } from '../../theme/colors';
import { searchFriends, getFriendRequests, respondFriendRequest, getFriends, sendFriendRequest } from '../../api/api';
import { getSocket } from '../../utils/socket';
import CustomAlertModal from '../../components/CustomAlertModal';

const formatTimeAgo = (isoString) => {
    if (!isoString) return '';
    const diff = Math.floor((new Date() - new Date(isoString)) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}d`;
};

export default function FriendsScreen({ navigation }) {
    const COLORS = useTheme(state => state.COLORS);
    const [activeTab, setActiveTab] = useState('Friends'); // 'Friends', 'Requests', 'Find'
    const [friends, setFriends] = useState([]);
    const [requests, setRequests] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [alert, setAlert] = useState({ visible: false, type: 'info', title: '', message: '' });

    useFocusEffect(
        useCallback(() => {
            if (activeTab === 'Friends') fetchFriends();
            else if (activeTab === 'Requests') fetchRequests();
        }, [activeTab])
    );

    useEffect(() => {
        // Real-time listeners
        const socket = getSocket();
        if (socket) {
            const onNewRequest = () => {
                if (activeTab === 'Requests') fetchRequests();
            };
            const onFriendsUpdated = () => {
                if (activeTab === 'Friends') fetchFriends();
                if (activeTab === 'Requests') fetchRequests();
            };

            const onUserOnline = (userId) => {
                setFriends(prev => prev.map(f => f._id === userId ? { ...f, isOnline: true } : f));
            };
            const onUserOffline = (userId) => {
                setFriends(prev => prev.map(f => f._id === userId ? { ...f, isOnline: false } : f));
            };

            const onMessageEvent = () => {
                if (activeTab === 'Friends') fetchFriends();
            };

            socket.on('new_friend_request', onNewRequest);
            socket.on('friend_request_accepted', onFriendsUpdated);
            socket.on('friends_updated', onFriendsUpdated);
            socket.on('user_online', onUserOnline);
            socket.on('user_offline', onUserOffline);
            socket.on('receive_message', onMessageEvent);
            socket.on('message_sent_ack', onMessageEvent);

            return () => {
                socket.off('new_friend_request', onNewRequest);
                socket.off('friend_request_accepted', onFriendsUpdated);
                socket.off('friends_updated', onFriendsUpdated);
                socket.off('user_online', onUserOnline);
                socket.off('user_offline', onUserOffline);
                socket.off('receive_message', onMessageEvent);
                socket.off('message_sent_ack', onMessageEvent);
            };
        }
    }, [activeTab]);

    // Debounced Search Effect
    useEffect(() => {
        if (activeTab !== 'Find') return;

        if (searchQuery.length < 3) {
            setSearchResults([]);
            return;
        }

        const timeoutId = setTimeout(() => {
            performSearch(searchQuery);
        }, 400);

        return () => clearTimeout(timeoutId);
    }, [searchQuery, activeTab]);

    const performSearch = async (text) => {
        setLoading(true);
        try {
            const data = await searchFriends(text);
            setSearchResults(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const fetchFriends = async () => {
        setLoading(true);
        try {
            const data = await getFriends();
            setFriends(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const fetchRequests = async () => {
        setLoading(true);
        try {
            const data = await getFriendRequests();
            setRequests(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = (text) => {
        setSearchQuery(text);
    };

    const handleSendRequest = async (userId) => {
        try {
            await sendFriendRequest(userId);
            setAlert({
                visible: true,
                type: 'success',
                title: 'Request Sent',
                message: 'Your friend request has been sent successfully!'
            });
            setSearchResults(prev => prev.filter(u => u._id !== userId));
        } catch (err) {
            const errorMsg = err.response?.data?.error;
            if (errorMsg === 'incoming_request_exists') {
                setAlert({
                    visible: true,
                    type: 'info',
                    title: 'Request Pending',
                    message: 'This user has already sent you a friend request! Go to the "Requests" tab to accept it.'
                });
            } else {
                setAlert({
                    visible: true,
                    type: 'error',
                    title: 'Error',
                    message: errorMsg || 'Failed to send request'
                });
            }
        }
    };

    const handleRespond = async (requestId, status) => {
        try {
            await respondFriendRequest(requestId, status);
            fetchRequests();
        } catch (err) {
            setAlert({
                visible: true,
                type: 'error',
                title: 'Error',
                message: err.response?.data?.error || 'Failed to respond'
            });
        }
    };

    const renderTab = (title) => {
        const isActive = activeTab === title;
        return (
            <TouchableOpacity
                style={[styles.tab, isActive && { backgroundColor: COLORS.primary }]}
                onPress={() => setActiveTab(title)}
            >
                <Text style={[styles.tabText, { color: isActive ? '#fff' : COLORS.textMuted }]}>{title}</Text>
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView style={[styles.safe, { backgroundColor: COLORS.background }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backBtn, { backgroundColor: COLORS.surface }]}>
                    <Feather name="arrow-left" size={20} color={COLORS.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: COLORS.text }]}>Connections</Text>
                <View style={{ width: 40 }} />
            </View>

            <View style={styles.tabsContainer}>
                {renderTab('Friends')}
                {renderTab('Requests')}
                {renderTab('Find')}
            </View>

            {loading && <ActivityIndicator size="small" color={COLORS.primary} style={{ marginTop: spacing.md }} />}

            {activeTab === 'Friends' && (
                <FlatList
                    data={friends}
                    keyExtractor={item => item._id}
                    contentContainerStyle={styles.listContainer}
                    ListEmptyComponent={<Text style={{ color: COLORS.textMuted, textAlign: 'center', marginTop: 20 }}>No friends yet.</Text>}
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            style={[styles.userCard, { backgroundColor: COLORS.surface }]}
                            activeOpacity={0.7}
                            onPress={() => navigation.navigate('ChatScreen', { friend: item })}
                        >
                            <View style={styles.avatarContainer}>
                                <View style={[styles.avatarPlaceholder, { backgroundColor: COLORS.border, overflow: 'hidden' }]}>
                                    {item.avatarUrl ? (
                                        <Image
                                            source={{ uri: item.avatarUrl.startsWith('http') ? item.avatarUrl : `${API_BASE.replace('/api', '')}/${item.avatarUrl}` }}
                                            style={styles.avatarImg}
                                        />
                                    ) : (
                                        <Text style={{ color: COLORS.text, fontWeight: 'bold' }}>{item.name.charAt(0)}</Text>
                                    )}
                                </View>
                                <View style={[
                                    styles.statusDot,
                                    {
                                        backgroundColor: item.isOnline ? '#22c55e' : '#94a3b8',
                                        borderColor: COLORS.surface
                                    }
                                ]} />
                            </View>
                            <View style={styles.userInfo}>
                                <Text style={[styles.userName, { color: COLORS.text }]}>{item.name}</Text>
                                <Text style={[styles.userTag, { color: COLORS.textMuted }]} numberOfLines={1}>
                                    {item.lastMessage ? (
                                        `${item.lastMessage.sender === item._id ? '' : 'You: '}${item.lastMessage.content} · ${formatTimeAgo(item.lastMessage.createdAt)}`
                                    ) : (
                                        item.otterTag || item.email
                                    )}
                                </Text>
                            </View>
                            {item.unreadCount > 0 && (
                                <View style={[styles.unreadDot, { backgroundColor: COLORS.primary }]} />
                            )}
                        </TouchableOpacity>
                    )}
                />
            )}

            {activeTab === 'Requests' && (
                <FlatList
                    data={requests}
                    keyExtractor={item => item._id}
                    contentContainerStyle={styles.listContainer}
                    ListEmptyComponent={<Text style={{ color: COLORS.textMuted, textAlign: 'center', marginTop: 20 }}>No pending requests.</Text>}
                    renderItem={({ item }) => (
                        <View style={[styles.userCard, { backgroundColor: COLORS.surface }]}>
                            <View style={[styles.avatarPlaceholder, { backgroundColor: COLORS.border, overflow: 'hidden' }]}>
                                {(item.sender.avatarUrl || item.sender.avatar) ? (
                                    <Image
                                        source={{
                                            uri: (item.sender.avatarUrl || item.sender.avatar).startsWith('http')
                                                ? (item.sender.avatarUrl || item.sender.avatar)
                                                : `${API_BASE.replace('/api', '')}/${item.sender.avatarUrl || item.sender.avatar}`
                                        }}
                                        style={styles.avatarImg}
                                        resizeMode="cover"
                                    />
                                ) : (
                                    <View style={[styles.avatarImg, { backgroundColor: COLORS.primary + '15', justifyContent: 'center', alignItems: 'center' }]}>
                                        <Text style={{ color: COLORS.primary, fontWeight: '800' }}>{item.sender.name[0]}</Text>
                                    </View>
                                )}
                            </View>
                            <View style={styles.userInfo}>
                                <Text style={[styles.userName, { color: COLORS.text }]}>{item.sender.name}</Text>
                                <Text style={[styles.userTag, { color: COLORS.textMuted }]}>{item.sender.otterTag || item.sender.email}</Text>
                            </View>
                            <View style={styles.actionButtons}>
                                <TouchableOpacity onPress={() => handleRespond(item._id, 'accepted')} style={[styles.actionBtn, { backgroundColor: '#10b981' }]}>
                                    <Feather name="check" size={16} color="#fff" />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => handleRespond(item._id, 'rejected')} style={[styles.actionBtn, { backgroundColor: '#ef4444', marginLeft: 8 }]}>
                                    <Feather name="x" size={16} color="#fff" />
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}
                />
            )}

            {activeTab === 'Find' && (
                <View style={styles.findContainer}>
                    <View style={[styles.searchBox, { backgroundColor: COLORS.surface }]}>
                        <Feather name="search" size={20} color={COLORS.textMuted} />
                        <TextInput
                            style={[styles.searchInput, { color: COLORS.text }]}
                            placeholder="Search by @otterTag or email"
                            placeholderTextColor={COLORS.textMuted}
                            value={searchQuery}
                            onChangeText={handleSearch}
                            autoCapitalize="none"
                        />
                    </View>
                    <FlatList
                        data={searchResults}
                        keyExtractor={item => item._id}
                        contentContainerStyle={styles.listContainer}
                        ListEmptyComponent={() => {
                            if (searchQuery.length >= 3 && !loading) {
                                return (
                                    <View style={styles.emptySearchContainer}>
                                        <Feather name="search" size={40} color={COLORS.textMuted} style={{ opacity: 0.3, marginBottom: 12 }} />
                                        <Text style={[styles.emptySearchText, { color: COLORS.textMuted }]}>No user found for "{searchQuery}"</Text>
                                    </View>
                                );
                            }
                            return null;
                        }}
                        renderItem={({ item }) => (
                            <View style={[styles.userCard, { backgroundColor: COLORS.surface }]}>
                                <View style={[styles.avatarPlaceholder, { backgroundColor: COLORS.border, overflow: 'hidden', marginRight: spacing.sm }]}>
                                    {item.avatarUrl ? (
                                        <Image
                                            source={{ uri: item.avatarUrl.startsWith('http') ? item.avatarUrl : `${API_BASE.replace('/api', '')}/${item.avatarUrl}` }}
                                            style={styles.avatarImg}
                                        />
                                    ) : (
                                        <Text style={{ color: COLORS.text, fontWeight: 'bold' }}>{item.name.charAt(0)}</Text>
                                    )}
                                </View>
                                <View style={styles.userInfo}>
                                    <Text style={[styles.userName, { color: COLORS.text }]}>{item.name}</Text>
                                    <Text style={[styles.userTag, { color: COLORS.textMuted }]}>{item.otterTag || item.email}</Text>
                                </View>
                                <TouchableOpacity onPress={() => handleSendRequest(item._id)} style={[styles.addBtn, { backgroundColor: COLORS.primary }]}>
                                    <Feather name="user-plus" size={16} color="#fff" />
                                </TouchableOpacity>
                            </View>
                        )}
                    />
                </View>
            )}

            <CustomAlertModal
                visible={alert.visible}
                onClose={() => setAlert(a => ({ ...a, visible: false }))}
                title={alert.title}
                message={alert.message}
                type={alert.type}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1 },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md,
    },
    backBtn: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    headerTitle: { fontSize: 18, fontWeight: '800' },
    tabsContainer: {
        flexDirection: 'row', paddingHorizontal: spacing.lg, marginBottom: spacing.md,
    },
    tab: {
        flex: 1, paddingVertical: spacing.sm, alignItems: 'center', borderRadius: radius.full,
    },
    tabText: { fontSize: 13, fontWeight: '700' },
    listContainer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
    userCard: {
        flexDirection: 'row', alignItems: 'center', padding: spacing.md, borderRadius: radius.lg, marginBottom: spacing.sm,
    },
    avatarContainer: {
        marginRight: spacing.md,
    },
    avatarPlaceholder: {
        width: 44, height: 44, borderRadius: 22,
        justifyContent: 'center', alignItems: 'center',
    },
    avatarImg: { width: '100%', height: '100%' },
    userInfo: { flex: 1 },
    userName: { fontSize: 15, fontWeight: '700' },
    userTag: { fontSize: 13, marginTop: 4 },
    unreadDot: { width: 12, height: 12, borderRadius: 6, marginLeft: 12, alignSelf: 'center' },
    findContainer: { flex: 1 },
    searchBox: {
        flexDirection: 'row', alignItems: 'center', marginHorizontal: spacing.lg, paddingHorizontal: spacing.md,
        borderRadius: radius.lg, height: 48, marginBottom: spacing.md,
    },
    searchInput: { flex: 1, marginLeft: spacing.sm, fontSize: 14 },
    addBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
    actionButtons: { flexDirection: 'row' },
    actionBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
    emptySearchContainer: { alignItems: 'center', marginTop: 60, paddingHorizontal: 40 },
    emptySearchText: { fontSize: 14, fontWeight: '600', textAlign: 'center', lineHeight: 20 },
    statusDot: {
        position: 'absolute',
        bottom: -1,
        right: -1,
        width: 14,
        height: 14,
        borderRadius: 7,
        borderWidth: 2,
    },
});
