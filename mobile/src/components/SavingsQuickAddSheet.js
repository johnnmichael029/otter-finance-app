import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { spacing, radius } from '../theme/colors';
import BottomSheetModal from './BottomSheetModal';
import { getTransactionSummary, getSavingsGoals } from '../api/api';

const SavingsQuickAddSheet = ({ visible, onClose, navigation, activeGoals = [] }) => {
    const COLORS = useTheme(state => state.COLORS);
    const { userInfo } = useAuth();
    const styles = getStyles(COLORS);

    const [showSourceSelection, setShowSourceSelection] = useState(false);
    const [mainBalance, setMainBalance] = useState(0);
    const [savingsPot, setSavingsPot] = useState(null);

    useEffect(() => {
        if (visible) {
            const fetchBalances = async () => {
                try {
                    const summary = await getTransactionSummary({ range: 'all' });
                    setMainBalance(summary?.netBalance || 0);

                    const goalsRes = await getSavingsGoals();
                    const master = goalsRes.goals?.find(g => g.name === 'Savings Balance');
                    if (master) setSavingsPot(master);
                } catch (e) {}
            };
            fetchBalances();
        } else {
            setShowSourceSelection(false);
        }
    }, [visible]);

    const formatCurrency = (amount) =>
        new Intl.NumberFormat('en-PH', { style: 'currency', currency: userInfo?.currency || 'PHP' }).format(amount);

    const QuickAddOption = ({ icon, color, title, subtitle, onPress, isMCI = false }) => (
        <TouchableOpacity 
            style={[styles.quickOption, { backgroundColor: COLORS.background, borderColor: COLORS.border }]} 
            onPress={onPress}
        >
            <View style={[styles.quickIconBox, { backgroundColor: color + '20' }]}>
                {isMCI ? (
                    <MaterialCommunityIcons name={icon} size={20} color={color} />
                ) : (
                    <Feather name={icon} size={20} color={color} />
                )}
            </View>
            <View style={{ flex: 1 }}>
                <Text style={[styles.quickTitle, { color: COLORS.text }]}>{title}</Text>
                <Text style={[styles.quickSub, { color: COLORS.textMuted }]}>{subtitle}</Text>
            </View>
            <Feather name="chevron-right" size={18} color={COLORS.textMuted} />
        </TouchableOpacity>
    );

    const handleSelectSource = (type) => {
        onClose();
        if (type === 'main') {
            navigation.navigate('SavingsGoalSelector', { action: 'deposit' });
        } else {
            // If from savings balance, we go directly to picking the TARGET goal
            // We pass the savingsPot as the sourceGoal
            navigation.navigate('SavingsGoalSelector', { 
                action: 'move_to', 
                sourceGoal: savingsPot,
                titleOverride: 'Select Target Goal'
            });
        }
    };

    return (
        <BottomSheetModal 
            visible={visible} 
            onClose={onClose}
            title={showSourceSelection ? "Select Source" : "Quick Add (Savings)"}
        >
            {!showSourceSelection ? (
                <>
                    <View style={styles.quickHeader}>
                        <View style={styles.quickHandle} />
                        <Text style={[styles.quickMainTitle, { color: COLORS.text }]}>Quick Add (Savings)</Text>
                        <Text style={[styles.quickTagline, { color: COLORS.textMuted }]}>What would you like to record?</Text>
                    </View>

                    <View style={styles.quickList}>
                        <QuickAddOption 
                            icon="target" 
                            color="#E91E8C" 
                            title="Add New Goal" 
                            subtitle="Start a new dream or saving target" 
                            onPress={() => { onClose(); navigation.navigate('AddSavingsGoal'); }} 
                        />
                        <QuickAddOption 
                            icon="plus-circle" 
                            color="#22c55e" 
                            title="Add Money to Goal" 
                            subtitle="Save from your wallet or savings pot" 
                            onPress={() => setShowSourceSelection(true)} 
                        />
                        <QuickAddOption 
                            icon="piggy-bank-outline" 
                            color="#3b82f6" 
                            isMCI={true}
                            title="Move Money" 
                            subtitle="Transfer funds between different goals" 
                            onPress={() => { onClose(); navigation.navigate('SavingsGoalSelector', { action: 'move_from' }); }} 
                        />
                    </View>
                </>
            ) : (
                <View style={styles.sourceSelection}>
                    <View style={styles.quickHeader}>
                        <Text style={[styles.quickMainTitle, { color: COLORS.text }]}>Choose Source</Text>
                        <Text style={[styles.quickTagline, { color: COLORS.textMuted }]}>Where is the money coming from?</Text>
                    </View>

                    <View style={styles.sourceGrid}>
                        <TouchableOpacity
                            style={[styles.sourceItem, { backgroundColor: COLORS.background, borderColor: COLORS.border }]}
                            onPress={() => handleSelectSource('main')}
                        >
                            <View style={[styles.sourceIconBox, { backgroundColor: COLORS.primary + '20' }]}>
                                <Feather name="home" size={24} color={COLORS.primary} />
                            </View>
                            <Text style={[styles.sourceLabel, { color: COLORS.text }]}>Main Balance</Text>
                            <Text style={[styles.sourceValue, { color: COLORS.primary }]}>{formatCurrency(mainBalance)}</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.sourceItem, { backgroundColor: COLORS.background, borderColor: COLORS.border }]}
                            onPress={() => handleSelectSource('savings')}
                        >
                            <View style={[styles.sourceIconBox, { backgroundColor: '#3b82f620' }]}>
                                <MaterialCommunityIcons name="piggy-bank-outline" size={24} color="#3b82f6" />
                            </View>
                            <Text style={[styles.sourceLabel, { color: COLORS.text }]}>Savings Balance</Text>
                            <Text style={[styles.sourceValue, { color: '#3b82f6' }]}>{formatCurrency(savingsPot?.currentAmount || 0)}</Text>
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity 
                        style={styles.backBtn}
                        onPress={() => setShowSourceSelection(false)}
                    >
                        <Text style={[styles.backBtnText, { color: COLORS.textMuted }]}>Back to Options</Text>
                    </TouchableOpacity>
                </View>
            )}

            <TouchableOpacity 
                style={[styles.quickCancel, { backgroundColor: COLORS.background }]} 
                onPress={onClose}
            >
                <Text style={[styles.quickCancelText, { color: COLORS.text }]}>Cancel</Text>
            </TouchableOpacity>
        </BottomSheetModal>
    );
};

const getStyles = (COLORS) => StyleSheet.create({
    quickHeader: { alignItems: 'center', marginBottom: spacing.xl },
    quickHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.1)', marginBottom: spacing.lg },
    quickMainTitle: { fontSize: 20, fontWeight: '800', marginBottom: 4 },
    quickTagline: { fontSize: 13, fontWeight: '500' },
    quickList: { gap: 12, marginBottom: spacing.xl },
    quickOption: {
        flexDirection: 'row', alignItems: 'center', padding: spacing.md,
        borderRadius: radius.xl, borderWidth: 1, gap: 12
    },
    quickIconBox: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
    quickTitle: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
    quickSub: { fontSize: 12 },
    quickCancel: { width: '100%', paddingVertical: 16, borderRadius: radius.xl, alignItems: 'center' },
    quickCancelText: { fontWeight: '700', fontSize: 15 },

    // Source Selection Styles
    sourceSelection: { paddingBottom: spacing.lg },
    sourceGrid: { flexDirection: 'row', gap: 12, marginBottom: spacing.xl },
    sourceItem: { flex: 1, padding: 20, borderRadius: radius.xl, borderWidth: 1, alignItems: 'center' },
    sourceIconBox: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
    sourceLabel: { fontSize: 14, fontWeight: '800', marginBottom: 6, textAlign: 'center' },
    sourceValue: { fontSize: 11, fontWeight: '900' },
    backBtn: { alignSelf: 'center', padding: 12 },
    backBtnText: { fontSize: 13, fontWeight: '700' }
});

export default SavingsQuickAddSheet;
