import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator, SafeAreaView, Image, Animated } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { spacing, radius } from '../../theme/colors';
import { getConversation, sendMessage, markAsRead } from '../../api/api';
import { getSocket } from '../../utils/socket';
import { API_BASE } from '../../store/authStore';

import { formatTime } from '../../utils/formatters';

const isSameDay = (date1, date2) => {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
};

const formatDateLabel = (isoString) => {
    const d = new Date(isoString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (isSameDay(d, today)) return 'Today';
    if (isSameDay(d, yesterday)) return 'Yesterday';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const MessageItem = React.memo(({ item, isMine, showDateSeparator, COLORS }) => {
    return (
        <View>
            <View style={[styles.msgWrapper, isMine ? styles.msgRight : styles.msgLeft]}>
                <View style={[
                    styles.msgBubble,
                    isMine ? [styles.myBubble, { backgroundColor: COLORS.primary }] : [styles.theirBubble, { backgroundColor: COLORS.surface }]
                ]}>
                    <Text style={[styles.msgText, { color: isMine ? '#fff' : COLORS.text }]}>
                        {item.content}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', marginTop: 4 }}>
                        <Text style={[styles.msgTime, { color: isMine ? 'rgba(255,255,255,0.7)' : COLORS.textMuted }]}>
                            {formatTime(item.createdAt)}
                        </Text>
                        {isMine && (
                            <Ionicons 
                                name={item.read ? "checkmark-done" : "checkmark"} 
                                size={14} 
                                color={item.read ? "#60a5fa" : "rgba(255,255,255,0.7)"} 
                                style={{ marginLeft: 4 }}
                            />
                        )}
                    </View>
                </View>
            </View>
            {/* Since list is inverted, rendering BELOW means visually ABOVE */}
            {showDateSeparator && (
                <View style={styles.dateSeparator}>
                    <Text style={styles.dateSeparatorText}>{formatDateLabel(item.createdAt)}</Text>
                </View>
            )}
        </View>
    );
});

const TypingIndicator = ({ color }) => {
    const dot1 = useRef(new Animated.Value(0)).current;
    const dot2 = useRef(new Animated.Value(0)).current;
    const dot3 = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const animateDot = (dot, delay) => {
            Animated.loop(
                Animated.sequence([
                    Animated.delay(delay),
                    Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true }),
                    Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true }),
                    Animated.delay(300)
                ])
            ).start();
        };

        animateDot(dot1, 0);
        animateDot(dot2, 150);
        animateDot(dot3, 300);
    }, []);

    const dotStyle = (dot) => ({
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: color,
        marginHorizontal: 3,
        transform: [{
            translateY: dot.interpolate({
                inputRange: [0, 1],
                outputRange: [0, -5]
            })
        }]
    });

    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', height: 20, paddingHorizontal: 4 }}>
            <Animated.View style={dotStyle(dot1)} />
            <Animated.View style={dotStyle(dot2)} />
            <Animated.View style={dotStyle(dot3)} />
        </View>
    );
};

export default function ChatScreen({ route, navigation }) {
    const { friend } = route.params; // Expects { _id, name, otterTag }
    const COLORS = useTheme(state => state.COLORS);
    const { userInfo } = useAuth();

    const [messages, setMessages] = useState([]);
    const [inputText, setInputText] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [isOnline, setIsOnline] = useState(friend.isOnline || false);
    const [isTyping, setIsTyping] = useState(false);
    const flatListRef = useRef(null);
    const typingTimeoutRef = useRef(null);

    const loadHistory = useCallback(async (pageNum = 1) => {
        try {
            if (pageNum === 1) setLoading(true);
            const data = await getConversation(friend._id, pageNum);

            if (data.messages.length < 50) {
                setHasMore(false);
            }

            if (pageNum === 1) {
                setMessages(data.messages);
            } else {
                setMessages(prev => {
                    const existingIds = new Set(prev.map(m => m._id));
                    const newMsgs = data.messages.filter(m => !existingIds.has(m._id));
                    return [...prev, ...newMsgs];
                });
            }
        } catch (e) {
            console.warn('[Chat] Load error:', e.message);
        } finally {
            setLoading(false);
        }
    }, [friend._id]);

    useEffect(() => {
        loadHistory(1);

        const socket = getSocket();
        if (socket) {
            const handleReceive = (msg) => {
                const isRelated =
                    (msg.sender === friend._id && msg.receiver === userInfo?._id) ||
                    (msg.sender === userInfo?._id && msg.receiver === friend._id);

                if (!isRelated) return;

                setMessages(prev => {
                    // Deduplicate: skip if we already have this _id
                    if (prev.some(m => m._id === msg._id)) return prev;
                    return [msg, ...prev];
                });

                if (msg.sender === friend._id) {
                    markAsRead(friend._id).catch(() => { });
                }

                setTimeout(() => flatListRef.current?.scrollToOffset({ offset: 0, animated: true }), 100);
            };

            const onUserOnline = (userId) => {
                if (userId === friend._id) setIsOnline(true);
            };
            const onUserOffline = (userId) => {
                if (userId === friend._id) setIsOnline(false);
            };
            const onTyping = ({ senderId }) => {
                if (senderId === friend._id) setIsTyping(true);
            };
            const onStopTyping = ({ senderId }) => {
                if (senderId === friend._id) setIsTyping(false);
            };
            const onMessagesRead = ({ readerId }) => {
                if (readerId === friend._id) {
                    setMessages(prev => prev.map(m => m.receiver === friend._id ? { ...m, read: true } : m));
                }
            };

            socket.on('receive_message', handleReceive);
            socket.on('message_sent_ack', handleReceive);
            socket.on('user_online', onUserOnline);
            socket.on('user_offline', onUserOffline);
            socket.on('typing', onTyping);
            socket.on('stop_typing', onStopTyping);
            socket.on('messages_read', onMessagesRead);

            return () => {
                socket.off('receive_message', handleReceive);
                socket.off('message_sent_ack', handleReceive);
                socket.off('user_online', onUserOnline);
                socket.off('user_offline', onUserOffline);
                socket.off('typing', onTyping);
                socket.off('stop_typing', onStopTyping);
                socket.off('messages_read', onMessagesRead);
            };
        }
    }, [loadHistory, friend._id, userInfo?._id]);

    const handleSend = async () => {
        const text = inputText.trim();
        if (!text) return;
        setInputText('');
        
        // Stop typing immediately upon sending
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        const socket = getSocket();
        if (socket) socket.emit('stop_typing', { senderId: userInfo?._id, receiverId: friend._id });

        setSending(true);
        try {
            await sendMessage(friend._id, text);
            // Socket ack will push the confirmed message into state
        } catch (e) {
            console.warn('[Chat] Send error:', e.message);
            setInputText(text); // restore on failure
        } finally {
            setSending(false);
        }
    };

    const handleInputChange = (text) => {
        setInputText(text);
        
        const socket = getSocket();
        if (!socket) return;

        socket.emit('typing', { senderId: userInfo?._id, receiverId: friend._id });

        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
        }

        typingTimeoutRef.current = setTimeout(() => {
            socket.emit('stop_typing', { senderId: userInfo?._id, receiverId: friend._id });
        }, 2000);
    };

    const renderMessage = useCallback(({ item, index }) => {
        const nextMessage = messages[index + 1];
        const showDateSeparator = !nextMessage || !isSameDay(item.createdAt, nextMessage.createdAt);

        return (
            <MessageItem 
                item={item} 
                isMine={item.sender === userInfo?._id} 
                showDateSeparator={showDateSeparator}
                COLORS={COLORS} 
            />
        );
    }, [userInfo?._id, COLORS, messages]);

    return (
        <SafeAreaView style={[styles.safe, { backgroundColor: COLORS.background }]}>
            <KeyboardAvoidingView 
                behavior="padding"
                style={{ flex: 1 }}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
            >
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backBtn, { backgroundColor: COLORS.surface }]}>
                        <Feather name="arrow-left" size={20} color={COLORS.text} />
                    </TouchableOpacity>
                    <View style={styles.avatarContainer}>
                        <View style={[styles.avatarPlaceholder, { backgroundColor: COLORS.border, overflow: 'hidden' }]}>
                            {friend.avatarUrl ? (
                                <Image
                                    source={{ uri: friend.avatarUrl.startsWith('http') ? friend.avatarUrl : `${API_BASE.replace('/api', '')}/${friend.avatarUrl}` }}
                                    style={styles.avatarImg}
                                />
                            ) : (
                                <Text style={{ color: COLORS.text, fontWeight: 'bold' }}>{friend.name.charAt(0)}</Text>
                            )}
                        </View>
                        <View style={[
                            styles.statusDot,
                            {
                                backgroundColor: isOnline ? '#22c55e' : '#94a3b8',
                                borderColor: COLORS.surface
                            }
                        ]} />
                    </View>
                    <View style={styles.headerInfo}>
                        <Text style={[styles.headerTitle, { color: COLORS.text }]}>{friend.name}</Text>
                        {friend.otterTag && <Text style={[styles.headerTag, { color: COLORS.textMuted }]}>{friend.otterTag}</Text>}
                    </View>
                </View>

                {/* Chat List */}
                <View style={{ flex: 1 }}>
                    {loading && messages.length === 0 ? (
                        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                            <ActivityIndicator size="large" color={COLORS.primary} />
                        </View>
                    ) : (
                        <FlatList
                            ref={flatListRef}
                            data={messages}
                            inverted={true}
                            keyExtractor={(item, index) => item._id ?? `msg-fallback-${index}`}
                            renderItem={renderMessage}
                            contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingVertical: 20 }}
                            showsVerticalScrollIndicator={false}
                            keyboardShouldPersistTaps="handled"
                            keyboardDismissMode="on-drag"
                            ListHeaderComponent={isTyping ? (
                                <View style={[styles.msgWrapper, styles.msgLeft]}>
                                    <View style={[styles.msgBubble, styles.theirBubble, { backgroundColor: COLORS.surface, paddingHorizontal: 16, paddingVertical: 10 }]}>
                                        <TypingIndicator color={COLORS.textMuted} />
                                    </View>
                                </View>
                            ) : null}
                            onEndReached={() => {
                                if (hasMore && !loading) {
                                    const nextPage = page + 1;
                                    setPage(nextPage);
                                    loadHistory(nextPage);
                                }
                            }}
                            onEndReachedThreshold={0.5}
                        />
                    )}
                </View>

                {/* Input Bar */}
                <View style={[styles.inputContainer, { backgroundColor: COLORS.surface, borderTopColor: COLORS.border }]}>
                    <TextInput
                        style={[styles.input, { color: COLORS.text, backgroundColor: COLORS.background, borderColor: COLORS.border }]}
                        placeholder="Type a message..."
                        placeholderTextColor={COLORS.textMuted}
                        value={inputText}
                        onChangeText={handleInputChange}
                        multiline
                    />
                    <TouchableOpacity
                        onPress={handleSend}
                        disabled={!inputText.trim()}
                        style={[styles.sendBtn, { backgroundColor: inputText.trim() ? COLORS.primary : COLORS.border }]}
                    >
                        <Feather name="send" size={18} color="#fff" />
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, paddingBottom: spacing.sm, marginTop: spacing.lg },
    backBtn: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: spacing.md },
    headerInfo: { flex: 1 },
    headerTitle: { fontSize: 18, fontWeight: '800' },
    headerTag: { fontSize: 13, fontWeight: '600' },

    listContainer: { padding: spacing.lg, gap: 12, paddingBottom: 20 },

    msgWrapper: { width: '100%', flexDirection: 'row', marginBottom: 4 },
    msgRight: { justifyContent: 'flex-end' },
    msgLeft: { justifyContent: 'flex-start' },

    msgBubble: { maxWidth: '75%', padding: 12, paddingHorizontal: 16 },
    myBubble: { borderTopLeftRadius: 20, borderBottomLeftRadius: 20, borderTopRightRadius: 20, borderBottomRightRadius: 4 },
    theirBubble: { borderTopLeftRadius: 20, borderBottomRightRadius: 20, borderTopRightRadius: 20, borderBottomLeftRadius: 4 },

    msgText: { fontSize: 15, lineHeight: 22 },
    msgTime: { fontSize: 10, alignSelf: 'flex-end', fontWeight: '600' },
    
    dateSeparator: { alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.1)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, marginVertical: 16 },
    dateSeparatorText: { fontSize: 11, fontWeight: '600', color: '#64748b' },

    inputContainer: { flexDirection: 'row', alignItems: 'flex-end', padding: spacing.md, borderTopWidth: 1 },
    input: { flex: 1, minHeight: 45, maxHeight: 120, borderWidth: 1, borderRadius: 20, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontSize: 15 },
    sendBtn: { width: 45, height: 45, borderRadius: 22.5, justifyContent: 'center', alignItems: 'center', marginLeft: 12 },

    avatarContainer: {
        marginRight: spacing.sm,
    },
    avatarPlaceholder: {
        width: 38, height: 38, borderRadius: 19,
        justifyContent: 'center', alignItems: 'center',
    },
    avatarImg: { width: '100%', height: '100%' },
    statusDot: {
        position: 'absolute',
        bottom: -1,
        right: -1,
        width: 12,
        height: 12,
        borderRadius: 6,
        borderWidth: 2,
    },
});
