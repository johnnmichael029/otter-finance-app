import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    FlatList, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { getSessions, revokeSession, revokeAllSessions } from '../../api/api';
import { useTheme } from '../../context/ThemeContext';
import { spacing, radius } from '../../theme/colors';
import CustomAlertModal from '../../components/CustomAlertModal';

export default function SessionManagementScreen({ navigation }) {
    const COLORS = useTheme(state => state.COLORS);
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [revokingId, setRevokingId] = useState(null);
    const [revokeAllModal, setRevokeAllModal] = useState(false);

    useEffect(() => {
        fetchSessions();
    }, []);

    const fetchSessions = async () => {
        try {
            const data = await getSessions();
            setSessions(data.sessions);
        } catch (err) {
            console.error('[Sessions] Fetch error:', err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleRevoke = (id, isCurrent) => {
        if (isCurrent) {
            Alert.alert('Active Session', 'This is your current session. If you want to log out, use the Sign Out button in Settings.');
            return;
        }

        Alert.alert(
            'Revoke Session',
            'Are you sure you want to log this device out? They will need to log in again.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Revoke',
                    style: 'destructive',
                    onPress: async () => {
                        setRevokingId(id);
                        try {
                            await revokeSession(id);
                            setSessions(s => s.filter(item => item.id !== id));
                        } catch (err) {
                            Alert.alert('Error', 'Failed to revoke session.');
                        } finally {
                            setRevokingId(null);
                        }
                    }
                }
            ]
        );
    };

    const handleRevokeAll = async () => {
        setLoading(true);
        try {
            await revokeAllSessions();
            // After revoking all, only the current one should technically be active on next fetch,
            // or the user might be booted depending on implementation. 
            // For safety, we just fetch again.
            await fetchSessions();
            setRevokeAllModal(false);
        } catch (err) {
            Alert.alert('Error', 'Failed to revoke all sessions.');
            setLoading(false);
        }
    };

    const renderSessionItem = ({ item }) => {
        // Simple detection if it's "this device" (simplified for demo)
        const isCurrent = false; // In a real app, we'd compare with a stored sessionId

        return (
            <View style={[styles.sessionCard, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
                <View style={[styles.iconWrap, { backgroundColor: item.platform === 'ios' ? '#000' : '#3DDC84' + '20' }]}>
                    <MaterialCommunityIcons 
                        name={item.platform === 'ios' ? 'apple' : 'android'} 
                        size={24} 
                        color={item.platform === 'ios' ? '#fff' : '#3DDC84'} 
                    />
                </View>
                
                <View style={styles.sessionInfo}>
                    <Text style={[styles.deviceName, { color: COLORS.text }]}>
                        {item.deviceInfo} {isCurrent && <Text style={{ color: COLORS.primary, fontSize: 10 }}> (This Device)</Text>}
                    </Text>
                    <Text style={[styles.sessionSub, { color: COLORS.textMuted }]}>
                        IP: {item.ipAddress}
                    </Text>
                    <Text style={[styles.sessionSub, { color: COLORS.textMuted }]}>
                        Last used: {new Date(item.lastUsedAt).toLocaleDateString()}
                    </Text>
                </View>

                {!isCurrent && (
                    <TouchableOpacity 
                        onPress={() => handleRevoke(item.id, isCurrent)}
                        disabled={revokingId === item.id}
                        style={styles.revokeBtn}
                    >
                        {revokingId === item.id ? (
                            <ActivityIndicator size="small" color={COLORS.danger} />
                        ) : (
                            <Feather name="log-out" size={18} color={COLORS.danger} />
                        )}
                    </TouchableOpacity>
                )}
            </View>
        );
    };

    return (
        <SafeAreaView style={[styles.safe, { backgroundColor: COLORS.background }]}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Feather name="arrow-left" size={22} color={COLORS.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: COLORS.text }]}>Active Sessions</Text>
                <TouchableOpacity onPress={() => setRevokeAllModal(true)} style={styles.headerRight}>
                    <Text style={[styles.revokeAllText, { color: COLORS.danger }]}>Revoke All</Text>
                </TouchableOpacity>
            </View>

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={COLORS.primary} />
                </View>
            ) : (
                <FlatList
                    data={sessions}
                    keyExtractor={item => item.id}
                    renderItem={renderSessionItem}
                    contentContainerStyle={styles.list}
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <MaterialCommunityIcons name="shield-check-outline" size={60} color={COLORS.border} />
                            <Text style={[styles.emptyText, { color: COLORS.textMuted }]}>No other active sessions found.</Text>
                        </View>
                    }
                    ListHeaderComponent={
                        <View style={styles.infoBox}>
                            <Feather name="info" size={16} color={COLORS.primary} style={{ marginTop: 2 }} />
                            <Text style={[styles.infoText, { color: COLORS.textMuted }]}>
                                These are the devices that have recently logged into your OTTER account. You can revoke any session to instantly log that device out.
                            </Text>
                        </View>
                    }
                />
            )}

            <CustomAlertModal
                visible={revokeAllModal}
                onClose={() => setRevokeAllModal(false)}
                onConfirm={handleRevokeAll}
                title="Revoke All Sessions"
                message="This will log you out of all other devices except this one. Continue?"
                type="confirm"
                confirmText="Revoke All"
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1 },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    },
    backBtn: { padding: 4 },
    headerTitle: { fontSize: 18, fontWeight: '800' },
    headerRight: { padding: 4 },
    revokeAllText: { fontSize: 13, fontWeight: '700' },
    list: { padding: spacing.lg },
    infoBox: {
        flexDirection: 'row', gap: 10,
        backgroundColor: 'rgba(233,30,140,0.05)',
        padding: spacing.md, borderRadius: radius.lg,
        marginBottom: spacing.xl,
        borderWidth: 1, borderColor: 'rgba(233,30,140,0.1)',
    },
    infoText: { fontSize: 13, lineHeight: 18, flex: 1 },
    sessionCard: {
        flexDirection: 'row', alignItems: 'center',
        padding: spacing.md, borderRadius: radius.xl,
        marginBottom: spacing.md, borderWidth: 1,
    },
    iconWrap: {
        width: 44, height: 44, borderRadius: 12,
        justifyContent: 'center', alignItems: 'center',
        marginRight: 14,
    },
    sessionInfo: { flex: 1 },
    deviceName: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
    sessionSub: { fontSize: 11, marginTop: 1 },
    revokeBtn: { padding: 10 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    empty: { alignItems: 'center', marginTop: 100 },
    emptyText: { marginTop: 16, fontSize: 15 },
});
