import React, { useState, useCallback, useEffect } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, FlatList,
    ActivityIndicator, RefreshControl, Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { getSavingsGoals } from '../../api/api';
import { spacing, radius, typography } from '../../theme/colors';
import Skeleton from '../../components/Skeleton';

const otterIcon = require('../../../assets/icon/welcomeOtter.png');

const formatCurrency = (amount, currency = 'PHP') =>
    new Intl.NumberFormat('en-PH', { style: 'currency', currency }).format(amount);

const IconRenderer = ({ name, family, size, color }) => {
    if (family?.toLowerCase() === 'materialcommunityicons') {
        return <MaterialCommunityIcons name={name} size={size} color={color} />;
    }
    return <Feather name={name || 'archive'} size={size} color={color} />;
};

export default function SavingsArchiveScreen({ navigation }) {
    const { COLORS } = useTheme();
    const { userInfo } = useAuth();
    const [goals, setGoals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const loadArchived = useCallback(async () => {
        try {
            setRefreshing(true);
            const res = await getSavingsGoals({ page: 1, limit: 100 });
            // Only goals that are completed AND have 0 balance are truly "Archived"
            const archived = (res.goals || []).filter(g => g.isCompleted && g.currentAmount === 0);
            setGoals(archived);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { loadArchived(); }, [loadArchived]);

    const renderItem = ({ item: goal }) => (
        <TouchableOpacity
            style={[styles.archiveCard, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
            onPress={() => navigation.navigate('SavingsGoalDetail', { goal })}
        >
            <View style={[styles.iconBox, { backgroundColor: (goal.color || COLORS.primary) + '15' }]}>
                <IconRenderer name={goal.icon} family={goal.family} size={22} color={goal.color || COLORS.primary} />
            </View>
            <View style={{ flex: 1 }}>
                <Text style={[styles.goalName, { color: COLORS.text }]}>{goal.name}</Text>
                <Text style={[styles.goalSub, { color: COLORS.textMuted }]}>
                    Target reached: {formatCurrency(goal.targetAmount, userInfo?.currency)}
                </Text>
            </View>
            <Feather name="chevron-right" size={18} color={COLORS.textMuted} />
        </TouchableOpacity>
    );

    if (loading && !refreshing) {
        return (
            <SafeAreaView style={[styles.safe, { backgroundColor: COLORS.background }]}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                        <Feather name="arrow-left" size={20} color={COLORS.text} />
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, { color: COLORS.text }]}>Archived Goals</Text>
                    <View style={{ width: 40 }} />
                </View>
                <View style={{ padding: spacing.lg }}>
                    {[1, 2, 3].map(i => <Skeleton key={i} width="100%" height={80} borderRadius={radius.lg} style={{ marginBottom: spacing.md }} />)}
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={[styles.safe, { backgroundColor: COLORS.background }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backBtn, { backgroundColor: COLORS.surface }]}>
                    <Feather name="arrow-left" size={20} color={COLORS.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: COLORS.text }]}>Archived Goals</Text>
                <View style={{ width: 40 }} />
            </View>

            <FlatList
                data={goals}
                renderItem={renderItem}
                keyExtractor={item => item._id}
                contentContainerStyle={styles.list}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadArchived} tintColor={COLORS.primary} />}
                ListEmptyComponent={() => (
                    <View style={styles.emptyContainer}>
                        <Image source={otterIcon} style={styles.emptyImage} resizeMode="contain" />
                        <Text style={[styles.emptyTitle, { color: COLORS.text }]}>No archives yet</Text>
                        <Text style={[styles.emptySub, { color: COLORS.textMuted }]}>Successfully completed goals will appear here once finalized.</Text>
                    </View>
                )}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1 },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: spacing.lg, paddingVertical: spacing.md
    },
    backBtn: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    headerTitle: { fontSize: 18, fontWeight: '800' },
    list: { padding: spacing.lg },
    archiveCard: {
        flexDirection: 'row', alignItems: 'center', padding: spacing.md,
        borderRadius: radius.lg, borderWidth: 1, marginBottom: spacing.md
    },
    iconBox: { width: 48, height: 48, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginRight: spacing.md },
    goalName: { fontSize: 16, fontWeight: '700' },
    goalSub: { fontSize: 12, marginTop: 2 },
    emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 100, paddingHorizontal: 40 },
    emptyImage: { width: 140, height: 140, opacity: 0.5, marginBottom: 20 },
    emptyTitle: { fontSize: 18, fontWeight: '800', marginBottom: 8 },
    emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20 }
});
