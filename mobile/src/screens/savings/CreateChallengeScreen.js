import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView,
    TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, Dimensions, Image
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { API_BASE } from '../../store/authStore';
import { useTheme } from '../../context/ThemeContext';
import { createChallenge, getFriends } from '../../api/api';
import CustomAlertModal from '../../components/CustomAlertModal';
import { spacing, radius } from '../../theme/colors';
import { useFinanceStore } from '../../store/financeStore';

const CHALLENGE_TYPES = [
    { id: '52-week', title: '52-Week Challenge', icon: 'calendar', desc: 'Save an increasing amount each week for a year' },
    { id: 'no-spend', title: 'No-Spend Challenge', icon: 'x-circle', desc: 'Track days without spending money' },
    { id: 'fixed-target', title: 'Fixed Target', icon: 'target', desc: 'Reach a specific goal with friends' }
];

export default function CreateChallengeScreen({ navigation }) {
    const COLORS = useTheme(state => state.COLORS);
    const styles = getStyles(COLORS);

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [type, setType] = useState('52-week');
    const [targetAmount, setTargetAmount] = useState('');
    const [endDate, setEndDate] = useState(null);
    const [showDatePicker, setShowDatePicker] = useState(false);

    const [friends, setFriends] = useState([]);
    const [selectedParticipantIds, setSelectedParticipantIds] = useState([]);

    const [saving, setSaving] = useState(false);
    const [alert, setAlert] = useState({ visible: false, type: 'info', title: '', message: '' });

    useEffect(() => {
        const fetchFriendsList = async () => {
            try {
                const res = await getFriends();
                setFriends(Array.isArray(res) ? res : (res.friends || []));
            } catch (e) { }
        };
        fetchFriendsList();
    }, []);

    const showAlert = (type, title, message) => setAlert({ visible: true, type, title, message });
    const closeAlert = () => setAlert(a => ({ ...a, visible: false }));

    const handleSave = async () => {
        if (!title.trim()) return showAlert('warning', 'Missing Title', 'Please give your challenge a name.');

        let target = 0;
        if (type !== 'no-spend') {
            target = parseFloat(targetAmount);
            if (!targetAmount || isNaN(target) || target <= 0) {
                return showAlert('warning', 'Invalid Amount', 'Please enter a valid target amount.');
            }
        }

        let finalEndDate = endDate ? endDate.toISOString() : null;
        if (type === '52-week') {
            const date = new Date();
            date.setDate(date.getDate() + 365);
            finalEndDate = date.toISOString();
        }

        setSaving(true);
        try {
            await createChallenge({
                title: title.trim(),
                description: description.trim() || 'A fun savings challenge',
                type,
                targetAmount: target,
                endDate: finalEndDate,
                participantIds: selectedParticipantIds
            });

            // Refresh challenges
            useFinanceStore.getState().fetchChallenges(true);

            showAlert('success', 'Challenge Created! ⚔️', `"${title}" is ready to begin.`);
        } catch (err) {
            showAlert('error', 'Failed', err.response?.data?.error || 'Could not create challenge.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <SafeAreaView style={styles.safe}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

                    {/* Header */}
                    <View style={styles.header}>
                        <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backBtn, { backgroundColor: COLORS.surface }]}>
                            <Feather name="arrow-left" size={20} color={COLORS.text} />
                        </TouchableOpacity>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.headerTitle, { color: COLORS.text }]}>New Challenge</Text>
                            <Text style={[styles.headerSub, { color: COLORS.textMuted }]}>Create a gamified savings objective</Text>
                        </View>
                    </View>

                    {/* Type Selection */}
                    <Text style={[styles.label, { color: COLORS.textMuted, marginTop: 0 }]}>CHALLENGE TYPE</Text>
                    <View style={styles.typeGrid}>
                        {CHALLENGE_TYPES.map(item => {
                            const isSelected = type === item.id;
                            return (
                                <TouchableOpacity
                                    key={item.id}
                                    onPress={() => setType(item.id)}
                                    style={[styles.typeCard, {
                                        backgroundColor: isSelected ? COLORS.primary + '15' : COLORS.surface,
                                        borderColor: isSelected ? COLORS.primary : COLORS.border
                                    }]}
                                >
                                    <View style={[styles.typeIcon, { backgroundColor: isSelected ? COLORS.primary : COLORS.background }]}>
                                        <Feather name={item.icon} size={18} color={isSelected ? '#fff' : COLORS.textMuted} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.typeTitle, { color: isSelected ? COLORS.primary : COLORS.text }]}>{item.title}</Text>
                                        <Text style={[styles.typeDesc, { color: COLORS.textMuted }]}>{item.desc}</Text>
                                    </View>
                                    {isSelected && <Feather name="check-circle" size={20} color={COLORS.primary} />}
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    {/* Name */}
                    <Text style={[styles.label, { color: COLORS.textMuted }]}>CHALLENGE NAME</Text>
                    <View style={[styles.inputContainer, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
                        <TextInput
                            style={[styles.input, { color: COLORS.text }]}
                            value={title}
                            onChangeText={setTitle}
                            placeholder={type === '52-week' ? "My 52-Week Challenge" : "Title"}
                            placeholderTextColor={COLORS.textMuted + 80}
                        />
                    </View>

                    {/* Amount */}
                    {type !== 'no-spend' && (
                        <>
                            <Text style={[styles.label, { color: COLORS.textMuted }]}>TARGET AMOUNT (₱)</Text>
                            <View style={[styles.inputContainer, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
                                <Text style={[styles.currencyPrefix, { color: COLORS.primary }]}>₱</Text>
                                <TextInput
                                    style={[styles.input, { color: COLORS.text }]}
                                    value={targetAmount}
                                    onChangeText={setTargetAmount}
                                    placeholder={type === '52-week' ? "137800" : "0.00"}
                                    placeholderTextColor={COLORS.textMuted + 80}
                                    keyboardType="decimal-pad"
                                />
                            </View>
                            {type === '52-week' && (
                                <Text style={styles.hint}>Pro tip: A classic 52-week challenge (base ₱100) targets ₱137,800.</Text>
                            )}
                        </>
                    )}

                    {/* Deadline */}
                    {type !== '52-week' && (
                        <>
                            <Text style={[styles.label, { color: COLORS.textMuted }]}>END DATE {type === 'no-spend' ? '' : '(OPTIONAL)'}</Text>
                            <TouchableOpacity
                                onPress={() => setShowDatePicker(true)}
                                style={[styles.inputContainer, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
                            >
                                <Feather name="calendar" size={16} color={COLORS.textMuted} style={{ marginRight: 8 }} />
                                <Text style={{ color: endDate ? COLORS.text : COLORS.textMuted, fontSize: 16, fontWeight: '600', flex: 1 }}>
                                    {endDate ? endDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'Set end date'}
                                </Text>
                            </TouchableOpacity>

                            {showDatePicker && (
                                <DateTimePicker
                                    value={endDate || new Date()}
                                    mode="date"
                                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                    minimumDate={new Date()}
                                    onChange={(event, selectedDate) => {
                                        setShowDatePicker(Platform.OS === 'ios');
                                        if (selectedDate) setEndDate(selectedDate);
                                    }}
                                />
                            )}
                        </>
                    )}

                    {/* Shared Section */}
                    {friends.length > 0 && (
                        <>
                            <Text style={[styles.label, { color: COLORS.textMuted }]}>CHALLENGE FRIENDS</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.friendList}>
                                {friends.map(friend => {
                                    const isSelected = selectedParticipantIds.includes(friend._id);
                                    return (
                                        <TouchableOpacity
                                            key={friend._id}
                                            onPress={() => {
                                                if (isSelected) {
                                                    setSelectedParticipantIds(prev => prev.filter(id => id !== friend._id));
                                                } else {
                                                    setSelectedParticipantIds(prev => [...prev, friend._id]);
                                                }
                                            }}
                                            style={[styles.friendChip, {
                                                backgroundColor: isSelected ? COLORS.primary + '15' : COLORS.surface,
                                                borderColor: isSelected ? COLORS.primary : COLORS.border
                                            }]}
                                        >
                                            <View style={styles.friendAvatar}>
                                                {friend.avatar || friend.avatarUrl ? (
                                                    <Image
                                                        source={{
                                                            uri: (friend.avatar || friend.avatarUrl).startsWith('http')
                                                                ? (friend.avatar || friend.avatarUrl)
                                                                : `${API_BASE.replace('/api', '')}/${friend.avatar || friend.avatarUrl}`
                                                        }}
                                                        style={styles.avatarImg}
                                                        resizeMode="cover"
                                                    />
                                                ) : (
                                                    <Feather name="user" size={14} color={isSelected ? COLORS.primary : COLORS.textMuted} />
                                                )}
                                            </View>
                                            <Text style={[styles.friendName, { color: isSelected ? COLORS.primary : COLORS.text }]} numberOfLines={1}>
                                                {friend.name}
                                            </Text>
                                            {isSelected && <Feather name="check-circle" size={12} color={COLORS.primary} style={{ marginLeft: 4 }} />}
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>
                        </>
                    )}

                    {/* Submit */}
                    <TouchableOpacity
                        onPress={handleSave}
                        disabled={saving}
                        style={[styles.submitBtn, { backgroundColor: COLORS.primary }]}
                        activeOpacity={0.8}
                    >
                        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Launch Challenge</Text>}
                    </TouchableOpacity>

                </ScrollView>
            </KeyboardAvoidingView>

            <CustomAlertModal
                visible={alert.visible}
                onClose={closeAlert}
                onConfirm={() => { closeAlert(); if (alert.type === 'success') navigation.goBack(); }}
                title={alert.title}
                message={alert.message}
                type={alert.type}
            />
        </SafeAreaView>
    );
}

const windowWidth = Dimensions.get('window').width;

const getStyles = (COLORS) => StyleSheet.create({
    safe: { flex: 1, backgroundColor: COLORS.background },
    content: { padding: spacing.lg, paddingBottom: 60 },
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xl },
    backBtn: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: spacing.md },
    headerTitle: { fontSize: 22, fontWeight: '800' },
    headerSub: { fontSize: 13, marginTop: 2 },

    label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 8, marginTop: spacing.lg },
    inputContainer: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.lg, borderWidth: 1.5, paddingHorizontal: spacing.md, height: 56 },
    input: { flex: 1, fontSize: 16, fontWeight: '600' },
    currencyPrefix: { fontSize: 20, fontWeight: '800', marginRight: 8 },
    hint: { fontSize: 11, color: COLORS.textMuted, marginTop: 6, fontStyle: 'italic' },

    typeGrid: { gap: 12 },
    typeCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: radius.xl, borderWidth: 2 },
    typeIcon: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
    typeTitle: { fontSize: 15, fontWeight: '800', marginBottom: 2 },
    typeDesc: { fontSize: 12 },

    submitBtn: { height: 60, borderRadius: radius.xl, justifyContent: 'center', alignItems: 'center', marginTop: spacing.xxl },
    submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

    friendList: { gap: 10, paddingRight: spacing.lg, marginTop: 4 },
    friendChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 16,
        borderWidth: 1.5
    },
    friendAvatar: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: 'rgba(0,0,0,0.05)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 8
    },
    friendName: { fontSize: 12, fontWeight: '700' },
    avatarImg: { width: '100%', height: '100%', borderRadius: 12 }
});
