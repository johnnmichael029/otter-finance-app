import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView,
    TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { getFriends, createGroupWallet } from '../../api/api';
import { API_BASE } from '../../store/authStore';
import CustomAlertModal from '../../components/CustomAlertModal';

const PRESET_COLORS = [
    '#6366f1', '#3b82f6', '#22c55e', '#f59e0b',
    '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899',
    '#f97316', '#14b8a6', '#a855f7', '#84cc16',
];

const EMOJIS = ['✈️', '🏝️', '🏔️', '🌉', '⛺', '🥘', '🚗', '🗺️', '📸', '🏨', '🎟️', '🍹'];

export default function CreateTripScreen({ navigation }) {
    const COLORS = useTheme(state => state.COLORS);
    
    const [name, setName] = useState('');
    const [selectedEmoji, setSelectedEmoji] = useState('✈️');
    const [selectedColor, setSelectedColor] = useState('#6366f1');
    const [friends, setFriends] = useState([]);
    const [selectedFriendIds, setSelectedFriendIds] = useState([]);
    const [loading, setLoading] = useState(false);
    const [fetchingFriends, setFetchingFriends] = useState(true);
    const [alert, setAlert] = useState({ visible: false, title: '', message: '', type: 'info' });

    useEffect(() => {
        const loadFriends = async () => {
            try {
                const res = await getFriends();
                setFriends(Array.isArray(res) ? res : (res.friends || []));
            } catch (e) {
                console.error('[CreateTrip] Friends load error:', e);
            } finally {
                setFetchingFriends(false);
            }
        };
        loadFriends();
    }, []);

    const handleCreate = async () => {
        if (!name.trim()) {
            return setAlert({ visible: true, title: 'Name Required', message: 'Please give your trip a name.', type: 'warning' });
        }

        setLoading(true);
        try {
            await createGroupWallet({
                name: name.trim(),
                emoji: selectedEmoji,
                color: selectedColor,
                participantIds: selectedFriendIds
            });
            setAlert({
                visible: true,
                title: 'Trip Created! 🌍',
                message: `"${name}" is ready. Invites have been sent to your friends.`,
                type: 'success'
            });
        } catch (err) {
            setAlert({ visible: true, title: 'Error', message: 'Failed to create trip. Please try again.', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={[styles.safe, { backgroundColor: COLORS.background }]}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backBtn, { backgroundColor: COLORS.surface }]}>
                        <Feather name="x" size={20} color={COLORS.text} />
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, { color: COLORS.text }]}>New Trip</Text>
                    <View style={{ width: 40 }} />
                </View>

                <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                    {/* Visual Identity */}
                    <View style={styles.previewContainer}>
                        <View style={[styles.emojiPreview, { backgroundColor: selectedColor + '20', borderColor: selectedColor }]}>
                            <Text style={styles.emojiPreviewText}>{selectedEmoji}</Text>
                        </View>
                        <Text style={[styles.previewLabel, { color: COLORS.textMuted }]}>PREVIEW</Text>
                    </View>

                    {/* Trip Name */}
                    <Text style={[styles.label, { color: COLORS.textMuted }]}>TRIP NAME</Text>
                    <View style={[styles.inputContainer, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
                        <TextInput
                            style={[styles.input, { color: COLORS.text }]}
                            placeholder="e.g. Japan Spring 2024"
                            placeholderTextColor={COLORS.textMuted}
                            value={name}
                            onChangeText={setName}
                            maxLength={30}
                        />
                    </View>

                    {/* Emoji Picker */}
                    <Text style={[styles.label, { color: COLORS.textMuted }]}>CHOOSE EMOJI</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScroll}>
                        {EMOJIS.map(e => (
                            <TouchableOpacity
                                key={e}
                                onPress={() => setSelectedEmoji(e)}
                                style={[styles.emojiBtn, { backgroundColor: selectedEmoji === e ? selectedColor + '20' : COLORS.surface, borderColor: selectedEmoji === e ? selectedColor : COLORS.border }]}
                            >
                                <Text style={styles.emojiBtnText}>{e}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>

                    {/* Color Picker */}
                    <Text style={[styles.label, { color: COLORS.textMuted }]}>CHOOSE COLOR</Text>
                    <View style={styles.colorGrid}>
                        {PRESET_COLORS.map(c => (
                            <TouchableOpacity
                                key={c}
                                onPress={() => setSelectedColor(c)}
                                style={[styles.colorCircle, { backgroundColor: c }]}
                            >
                                {selectedColor === c && <Feather name="check" size={16} color="#fff" />}
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* Friend Invites */}
                    <View style={styles.sectionHeader}>
                        <Text style={[styles.label, { color: COLORS.textMuted, marginTop: 0 }]}>INVITE FRIENDS</Text>
                        <Text style={[styles.count, { color: COLORS.primary }]}>{selectedFriendIds.length} selected</Text>
                    </View>
                    
                    {fetchingFriends ? (
                        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 20 }} />
                    ) : friends.length === 0 ? (
                        <View style={[styles.emptyFriends, { backgroundColor: COLORS.surface }]}>
                            <Feather name="users" size={24} color={COLORS.textMuted} />
                            <Text style={[styles.emptyText, { color: COLORS.textMuted }]}>No friends found. Add friends to invite them to trips!</Text>
                        </View>
                    ) : (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScroll}>
                            {friends.map(friend => {
                                const isSelected = selectedFriendIds.includes(friend._id);
                                return (
                                    <TouchableOpacity
                                        key={friend._id}
                                        onPress={() => {
                                            if (isSelected) setSelectedFriendIds(prev => prev.filter(id => id !== friend._id));
                                            else setSelectedFriendIds(prev => [...prev, friend._id]);
                                        }}
                                        style={[styles.friendChip, { backgroundColor: isSelected ? selectedColor + '15' : COLORS.surface, borderColor: isSelected ? selectedColor : COLORS.border }]}
                                    >
                                        <View style={styles.avatar}>
                                            {(friend.avatarUrl || friend.avatar) ? (
                                                <Image 
                                                    source={{ 
                                                        uri: (friend.avatarUrl || friend.avatar).startsWith('http')
                                                            ? (friend.avatarUrl || friend.avatar)
                                                            : `${API_BASE.replace('/api', '')}/${friend.avatarUrl || friend.avatar}`
                                                    }} 
                                                    style={styles.avatarImg} 
                                                    resizeMode="cover"
                                                />
                                            ) : (
                                                <View style={[styles.avatarInitial, { backgroundColor: COLORS.primary + '15' }]}>
                                                    <Text style={[styles.avatarInitialText, { color: COLORS.primary }]}>{friend.name[0]}</Text>
                                                </View>
                                            )}
                                        </View>
                                        <Text style={[styles.friendName, { color: isSelected ? selectedColor : COLORS.text }]}>{friend.name}</Text>
                                        {isSelected && <Feather name="check-circle" size={12} color={selectedColor} style={{ marginLeft: 6 }} />}
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    )}

                    <TouchableOpacity
                        onPress={handleCreate}
                        disabled={loading}
                        style={[styles.createBtn, { backgroundColor: selectedColor }]}
                        activeOpacity={0.8}
                    >
                        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.createBtnText}>Create Group Trip</Text>}
                    </TouchableOpacity>
                </ScrollView>
            </KeyboardAvoidingView>

            <CustomAlertModal
                visible={alert.visible}
                title={alert.title}
                message={alert.message}
                type={alert.type}
                onClose={() => {
                    setAlert({ ...alert, visible: false });
                    if (alert.type === 'success') navigation.goBack();
                }}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20 },
    backBtn: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    headerTitle: { fontSize: 20, fontWeight: '800' },
    scroll: { padding: 20, paddingBottom: 60 },
    previewContainer: { alignItems: 'center', marginBottom: 30 },
    emojiPreview: { width: 90, height: 90, borderRadius: 30, borderWidth: 2, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
    emojiPreviewText: { fontSize: 44 },
    previewLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
    label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 10, marginTop: 24 },
    inputContainer: { height: 56, borderRadius: 16, borderWidth: 1.5, paddingHorizontal: 16, justifyContent: 'center' },
    input: { fontSize: 16, fontWeight: '600' },
    horizontalScroll: { gap: 10, paddingBottom: 4 },
    emojiBtn: { width: 56, height: 56, borderRadius: 16, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
    emojiBtnText: { fontSize: 24 },
    colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    colorCircle: { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center' },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 32, marginBottom: 10 },
    count: { fontSize: 12, fontWeight: '700' },
    friendChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 16, borderWidth: 1.5 },
    avatar: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.05)', justifyContent: 'center', alignItems: 'center', marginRight: 8 },
    avatarImg: { width: '100%', height: '100%', borderRadius: 12 },
    avatarInitial: { fontSize: 12, fontWeight: '700' },
    friendName: { fontSize: 13, fontWeight: '700' },
    emptyFriends: { padding: 20, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 8 },
    emptyText: { fontSize: 12, textAlign: 'center', lineHeight: 18 },
    createBtn: { height: 60, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginTop: 40 },
    createBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' }
});
