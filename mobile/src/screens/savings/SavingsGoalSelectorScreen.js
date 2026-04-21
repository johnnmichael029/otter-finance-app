import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { getSavingsGoals } from '../../api/api';
import { spacing, radius } from '../../theme/colors';

const isIonicon = (name) => name?.includes('-outline') || name?.includes('-sharp');

const IconRenderer = ({ name, family, size, color }) => {
    const fam = family?.toLowerCase();
    const isMCI = fam === 'materialcommunityicons' || name === 'piggy-bank-outline';

    if (isMCI) {
        return <MaterialCommunityIcons name={name === 'piggy-bank-outline' ? 'piggy-bank-outline' : name} size={size} color={color} />;
    }

    const hasFamily = family && family !== 'feather';
    const useIonicons = (hasFamily && (fam === 'ionicons')) || (!hasFamily && isIonicon(name));
    if (useIonicons) {
        return <Ionicons name={name} size={size} color={color} />;
    }
    return <Feather name={name} size={size} color={color} />;
};

export default function SavingsGoalSelectorScreen({ route, navigation }) {
    const { action } = route.params; // 'deposit', 'income', 'move_from', 'move_to'
    const { COLORS } = useTheme();
    const { userInfo } = useAuth();
    const [goals, setGoals] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            try {
                const res = await getSavingsGoals();
                const fetchedGoals = res.goals?.filter(g => !g.isCompleted) || [];
                setGoals(fetchedGoals);

                // Auto-select logic for direct "Save Money" from Main Balance
                if (route.params?.autoSelect) {
                    const target = fetchedGoals.find(g => g.name === route.params.autoSelect);
                    if (target) {
                        // Small delay to ensure smooth navigation transition
                        setTimeout(() => handleSelect(target), 0);
                        return;
                    }
                }
            } catch (e) {
                console.warn(e);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const handleSelect = (goal) => {
        if (action === 'deposit') {
            navigation.navigate('SavingsTransfer', { goal, direction: 'to_savings', isDirect: true });
        } else if (action === 'income') {
            navigation.navigate('SavingsTransfer', { goal, direction: 'to_savings', isIncome: true, isDirect: true });
        } else if (action === 'move_from') {
             // Pick target goal next
             navigation.navigate('SavingsGoalSelector', { action: 'move_to', sourceGoal: goal });
        } else if (action === 'move_to') {
            navigation.navigate('SavingsTransfer', { 
                goal: goal, 
                direction: 'transfer_goal', 
                sourceGoal: route.params.sourceGoal 
            });
        }
    };

    const getTitle = () => {
        switch (action) {
            case 'deposit': return 'Select Target Goal';
            case 'income': return 'Add Income To...';
            case 'move_from': return 'Move Money FROM...';
            case 'move_to': return 'Move Money TO...';
            default: return 'Select Goal';
        }
    };

    return (
        <SafeAreaView style={[styles.safe, { backgroundColor: COLORS.background }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backBtn, { backgroundColor: COLORS.surface }]}>
                    <Feather name="arrow-left" size={20} color={COLORS.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: COLORS.text }]}>{getTitle()}</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                {loading ? (
                    <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 100 }} />
                ) : goals.length === 0 ? (
                    <View style={styles.empty}>
                        <Text style={styles.emptyEmoji}>🏦</Text>
                        <Text style={[styles.emptyText, { color: COLORS.textMuted }]}>Create a savings goal first!</Text>
                        <TouchableOpacity 
                            style={[styles.createBtn, { backgroundColor: COLORS.primary }]}
                            onPress={() => navigation.navigate('AddSavingsGoal')}
                        >
                            <Text style={styles.createBtnText}>New Goal</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    goals.map(goal => (
                        <TouchableOpacity 
                            key={goal._id} 
                            style={[styles.goalItem, { backgroundColor: COLORS.surface }]}
                            onPress={() => handleSelect(goal)}
                        >
                            <View style={[styles.iconBox, { backgroundColor: (goal.color || COLORS.primary) + '20' }]}>
                                <IconRenderer name={goal.icon || 'target'} family={goal.family} size={20} color={goal.color || COLORS.primary} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.goalName, { color: COLORS.text }]}>{goal.name}</Text>
                                <Text style={[styles.goalBal, { color: COLORS.textMuted }]}>
                                    Balance: ₱{goal.currentAmount.toFixed(2)}
                                </Text>
                            </View>
                            <Feather name="chevron-right" size={20} color={COLORS.textMuted} />
                        </TouchableOpacity>
                    ))
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg },
    backBtn: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    headerTitle: { fontSize: 18, fontWeight: '800' },
    content: { padding: spacing.lg },
    goalItem: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, borderRadius: radius.xl, marginBottom: spacing.md, gap: 16 },
    iconBox: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
    goalName: { fontSize: 16, fontWeight: '800' },
    goalBal: { fontSize: 13, fontWeight: '600', marginTop: 2 },
    empty: { alignItems: 'center', marginTop: 100 },
    emptyEmoji: { fontSize: 64, marginBottom: 20 },
    emptyText: { fontSize: 16, fontWeight: '600', marginBottom: 24 },
    createBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: radius.lg },
    createBtnText: { color: '#fff', fontWeight: '800' },
});
