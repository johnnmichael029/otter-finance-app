import React, { useState } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions,
    ActivityIndicator, Modal, Image, Alert, TouchableWithoutFeedback
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useFinanceStore } from '../../store/financeStore';
import { spacing, radius, shadow } from '../../theme/colors';
import { formatCurrency, IconRenderer } from '../../utils/formatters';
import { updateChallengeProgress, savingsTransfer } from '../../api/api';
import CustomAlertModal from '../../components/CustomAlertModal';

export default function ChallengeDetailScreen({ route, navigation }) {
    const { challenge } = route.params;
    const COLORS = useTheme(state => state.COLORS);
    const { userInfo } = useAuth();
    const styles = getStyles(COLORS);
    const { refreshAll } = useFinanceStore.getState();

    const [loading, setLoading] = useState(false);

    // Get current user's participation status
    const isOwner = challenge.user?._id === userInfo._id || challenge.user === userInfo._id;
    const pIndex = challenge.participants?.findIndex(p => p.user?._id === userInfo._id);
    const isParticipant = pIndex !== -1;
    
    const myAmount = isParticipant ? challenge.participants[pIndex].currentAmount : challenge.currentAmount;
    const myProgressData = isParticipant ? challenge.participants[pIndex].progressData : challenge.progressData;

    const pct = challenge.targetAmount > 0 ? Math.min((myAmount / challenge.targetAmount) * 100, 100) : 0;
    
    const [walletModalVisible, setWalletModalVisible] = useState(false);
    const [pendingAction, setPendingAction] = useState(null);
    const wallets = useFinanceStore(state => state.wallets);
    const cryptoPrices = useFinanceStore(state => state.cryptoPrices);
    const transactionSummary = useFinanceStore(state => state.transactionSummary);
    const savingsMasterPot = useFinanceStore(state => state.savingsMasterPot);
    const handBalance = userInfo?.handBalance || 0;
    const [revertModalVisible, setRevertModalVisible] = useState(false);
    
    const isCompleted = challenge.targetAmount > 0 && myAmount >= challenge.targetAmount;
    const isArchived = challenge.status === 'archived';

    const handleAddProgress = (amountToAdd) => {
        if (isCompleted || isArchived) return;
        if (amountToAdd > 0) {
            setPendingAction({ type: 'add', amount: amountToAdd });
            setWalletModalVisible(true);
        } else {
            executeProgressAction({ type: 'add', amount: amountToAdd }, null);
        }
    };

    const handleToggleWeek = (weekIndex, isCompleted, amount) => {
        if (loading || isArchived) return;
        if (isCompleted) {
            setRevertModalVisible(true);
            return;
        }

        // completing it -> adding money
        setPendingAction({ type: 'toggleWeek', weekIndex, isCompleted, amount });
        setWalletModalVisible(true);
    };

    const executeProgressAction = async (action, selectedWallet) => {
        setLoading(true);
        setWalletModalVisible(false);
        try {
            // 1. Log transaction if adding money and not explicitly skipping
            if (selectedWallet !== 'SKIP_TRANSACTION' && action.amount > 0) {
                let walletDeductAmount = null;
                if (selectedWallet && selectedWallet.type === 'Crypto' && selectedWallet.coinId) {
                    const price = cryptoPrices[selectedWallet.coinId];
                    if (price) {
                        walletDeductAmount = action.amount / price;
                    }
                }

                // Handle deduction from source
                if (selectedWallet && selectedWallet.isSavings) {
                    // 1a. DEDUCT from Savings Stash
                    await savingsTransfer({
                        goalId: savingsMasterPot._id,
                        amount: action.amount,
                        direction: 'from_savings', // Pull money out of the stash
                        note: `Used Stash for Challenge: ${challenge.title}`,
                        sourceWalletId: null // No physical wallet, just internal move
                    });
                } else if (savingsMasterPot) {
                    // 1b. DEPOSIT into Savings Stash (Normal behavior for Hand/Wallets)
                    await savingsTransfer({
                        goalId: savingsMasterPot._id,
                        amount: action.amount,
                        direction: 'to_savings',
                        note: `Funded Challenge: ${challenge.title}`,
                        sourceWalletId: selectedWallet ? selectedWallet._id : null, // null means HAND wallet
                        walletDeductAmount
                    });
                }
            }

            // 2. Update challenge progress
            if (action.type === 'add') {
                await updateChallengeProgress(challenge._id, {
                    amount: action.amount,
                    isParticipant: !isOwner
                });
            } else if (action.type === 'toggleWeek') {
                const newWeeks = [...myProgressData.weeks];
                newWeeks[action.weekIndex].completed = !action.isCompleted;
                newWeeks[action.weekIndex].amount = action.amount;
                
                await updateChallengeProgress(challenge._id, {
                    amount: !action.isCompleted ? action.amount : -action.amount,
                    progressDataUpdate: { weeks: newWeeks },
                    isParticipant: !isOwner
                });
            }
            
            await refreshAll(true);
            navigation.goBack();
        } catch (error) {
            console.warn(error);
        } finally {
            setLoading(false);
            setPendingAction(null);
        }
    };

    const render52Weeks = () => {
        if (!myProgressData?.weeks) return null;
        
        return (
            <View style={styles.weeksContainer}>
                <Text style={[styles.sectionTitle, { color: COLORS.text }]}>Weeks Overview</Text>
                <View style={styles.weeksGrid}>
                    {myProgressData.weeks.map((w, i) => {
                        // Formula for classic 52-week: week * base (e.g., 100)
                        // This allows reaching 137800. For flexibility, let's assume base is targetAmount / 1378
                        const baseAmount = (challenge.targetAmount > 0 ? challenge.targetAmount / 1378 : 100);
                        const expectedAmount = w.week * baseAmount;

                        return (
                            <TouchableOpacity
                                key={w.week}
                                style={[
                                    styles.weekBox,
                                    { backgroundColor: w.completed ? COLORS.primary + '20' : COLORS.surface },
                                    { borderColor: w.completed ? COLORS.primary : COLORS.border }
                                ]}
                                onPress={() => handleToggleWeek(i, w.completed, expectedAmount)}
                            >
                                <Text style={[styles.weekLabel, { color: COLORS.textMuted }]}>W{w.week}</Text>
                                {w.completed ? (
                                    <Feather name="check" size={16} color={COLORS.primary} />
                                ) : (
                                    <Text style={[styles.weekAmount, { color: COLORS.text }]}>{Math.round(expectedAmount)}</Text>
                                )}
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </View>
        );
    };

    const renderNoSpend = () => {
        const fails = myProgressData?.failedDates || [];
        return (
            <View style={[styles.card, { backgroundColor: COLORS.surface }]}>
                <Text style={[styles.sectionTitle, { color: COLORS.text, marginBottom: 8 }]}>No-Spend Tracker</Text>
                <Text style={[styles.subText, { color: COLORS.textMuted, marginBottom: 16 }]}>
                    Your transactions are automatically monitored. Days with spending will appear below.
                </Text>
                
                {fails.length === 0 ? (
                    <View style={styles.emptyFails}>
                        <Feather name="shield" size={32} color="#22c55e" style={{ marginBottom: 8 }} />
                        <Text style={[styles.emptyFailsText, { color: COLORS.text }]}>Perfect Record!</Text>
                        <Text style={[styles.subText, { color: COLORS.textMuted }]}>No spending detected yet.</Text>
                    </View>
                ) : (
                    fails.map((d, i) => (
                        <View key={i} style={[styles.failRow, { borderBottomColor: COLORS.border }]}>
                            <Feather name="x-circle" size={18} color="#ef4444" />
                            <Text style={[styles.failDate, { color: COLORS.text }]}>
                                {new Date(d).toLocaleDateString()}
                            </Text>
                        </View>
                    ))
                )}
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.safe}>
            <ScrollView contentContainerStyle={styles.content}>
                
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backBtn, { backgroundColor: COLORS.surface }]}>
                        <Feather name="arrow-left" size={20} color={COLORS.text} />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.headerTitle, { color: COLORS.text }]}>Challenge Details</Text>
                    </View>
                </View>

                {/* Hero */}
                <View style={[styles.heroCard, { backgroundColor: COLORS.surface }]}>
                    <View style={styles.heroTop}>
                        <View style={[styles.iconBox, { backgroundColor: (challenge.color || COLORS.primary) + '20' }]}>
                            <IconRenderer name={challenge.icon || 'award'} family="Feather" size={24} color={challenge.color || COLORS.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.title, { color: COLORS.text }]}>{challenge.title}</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Text style={[styles.typeBadge, { color: COLORS.primary }]}>{challenge.type.toUpperCase()}</Text>
                                {isArchived && (
                                    <View style={{ backgroundColor: COLORS.border, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                        <Text style={{ fontSize: 10, fontWeight: '800', color: COLORS.textMuted }}>ARCHIVED</Text>
                                    </View>
                                )}
                            </View>
                        </View>
                    </View>
                    <Text style={[styles.desc, { color: COLORS.textMuted }]}>{challenge.description}</Text>

                    {challenge.type !== 'no-spend' && (
                        <View style={styles.progressSection}>
                            <View style={styles.progressLabels}>
                                <Text style={[styles.progressAmount, { color: COLORS.text }]}>{formatCurrency(myAmount, userInfo?.currency)}</Text>
                                <Text style={[styles.progressTarget, { color: COLORS.textMuted }]}>of {formatCurrency(challenge.targetAmount, userInfo?.currency)}</Text>
                            </View>
                            <View style={styles.barContainer}>
                                <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: challenge.color || COLORS.primary }]} />
                            </View>
                            <Text style={[styles.pctLabel, { color: COLORS.textMuted }]}>{Math.round(pct)}% Completed</Text>
                        </View>
                    )}
                </View>

                {/* Content based on type */}
                {challenge.type === '52-week' && render52Weeks()}
                {challenge.type === 'no-spend' && renderNoSpend()}
                
                {challenge.type === 'fixed-target' && (
                    <View style={[styles.card, { backgroundColor: COLORS.surface }]}>
                        <Text style={[styles.sectionTitle, { color: COLORS.text, marginBottom: 16 }]}>Update Progress</Text>
                        <TouchableOpacity
                            onPress={() => handleAddProgress(100)} // Quick action example
                            style={[
                                styles.quickBtn, 
                                { backgroundColor: (isCompleted || isArchived) ? COLORS.border : COLORS.primary }
                            ]}
                            disabled={loading || isCompleted || isArchived}
                        >
                            {loading ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <Text style={[styles.quickBtnText, (isCompleted || isArchived) && { color: COLORS.textMuted }]}>
                                    {isArchived ? 'Challenge Archived' : (isCompleted ? 'Goal Reached!' : 'Add ₱100')}
                                </Text>
                            )}
                        </TouchableOpacity>
                    </View>
                )}

            </ScrollView>

            {/* Wallet Selection Modal */}
            <Modal visible={walletModalVisible} transparent animationType="slide">
                <TouchableWithoutFeedback onPress={() => { setWalletModalVisible(false); setPendingAction(null); }}>
                    <View style={styles.modalOverlay}>
                        <TouchableWithoutFeedback>
                            <View style={[styles.walletModal, { backgroundColor: COLORS.background }]}>
                                <Text style={[styles.modalTitle, { color: COLORS.text }]}>Fund Challenge</Text>
                                <Text style={[styles.modalSub, { color: COLORS.textMuted }]}>
                                    Where is the {formatCurrency(pendingAction?.amount || 0, userInfo?.currency)} coming from?
                                </Text>
                                
                                <ScrollView style={{ maxHeight: 350, width: '100%', marginVertical: 16 }}>
                                    {/* SAVINGS STASH Option */}
                                    {savingsMasterPot && (
                                        <TouchableOpacity 
                                            style={[styles.walletOption, { backgroundColor: COLORS.surface, borderColor: COLORS.primary + '40' }]}
                                            onPress={() => executeProgressAction(pendingAction, { _id: 'savings_stash', isSavings: true })}
                                        >
                                            <View style={[styles.walletIcon, { backgroundColor: '#E91E8C' }]}>
                                                <MaterialCommunityIcons name="piggy-bank-outline" color="#fff" size={20} />
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={[styles.walletName, { color: COLORS.text }]}>Savings Stash</Text>
                                                <Text style={[styles.walletBal, { color: COLORS.primary, fontWeight: '800' }]}>
                                                    Available: {formatCurrency(savingsMasterPot.currentAmount, userInfo?.currency)}
                                                </Text>
                                            </View>
                                            <Feather name="chevron-right" size={16} color={COLORS.textMuted} />
                                        </TouchableOpacity>
                                    )}

                                    {/* HAND Wallet Option */}
                                    <TouchableOpacity 
                                        style={[styles.walletOption, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
                                        onPress={() => executeProgressAction(pendingAction, { _id: null, isHand: true })}
                                    >
                                        <View style={[styles.walletIcon, { backgroundColor: '#E91E8C' }]}>
                                            <MaterialCommunityIcons name="hand-coin-outline" color="#fff" size={18} />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.walletName, { color: COLORS.text }]}>Cash (HAND)</Text>
                                            <Text style={[styles.walletBal, { color: COLORS.textMuted }]}>Available: {formatCurrency(handBalance, userInfo?.currency)}</Text>
                                        </View>
                                    </TouchableOpacity>

                                    {/* Other Wallets */}
                                    {wallets.map(w => (
                                        <TouchableOpacity 
                                            key={w._id} 
                                            style={[styles.walletOption, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
                                            onPress={() => executeProgressAction(pendingAction, w)}
                                        >
                                            <View style={[styles.walletIcon, { backgroundColor: w.color || COLORS.primary }]}>
                                                {w.type === 'Crypto' ? (
                                                    w.coinImageUrl?.startsWith('http') ? (
                                                        <Image source={{ uri: w.coinImageUrl }} style={{ width: 16, height: 16, borderRadius: 8 }} />
                                                    ) : (
                                                        <IconRenderer name={w.coinImageUrl || 'bitcoin'} family="MaterialCommunityIcons" color="#fff" size={16} />
                                                    )
                                                ) : w.type === 'Credit' ? (
                                                    <Feather name="credit-card" color="#fff" size={16} />
                                                ) : (
                                                    <Feather name="briefcase" color="#fff" size={16} />
                                                )}
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={[styles.walletName, { color: COLORS.text }]}>{w.name || 'Unnamed Wallet'}</Text>
                                                <Text style={[styles.walletBal, { color: COLORS.textMuted }]}>
                                                    {w.type === 'Crypto' && w.coinSymbol ? `${w.balance} ${w.coinSymbol.toUpperCase()}` : formatCurrency(w.balance, userInfo?.currency)}
                                                </Text>
                                            </View>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>

                                <TouchableOpacity 
                                    style={[styles.cancelBtn, { borderColor: COLORS.border }]}
                                    onPress={() => { setWalletModalVisible(false); setPendingAction(null); }}
                                >
                                    <Text style={[styles.cancelBtnText, { color: COLORS.text }]}>Cancel</Text>
                                </TouchableOpacity>
                            </View>
                        </TouchableWithoutFeedback>
                    </View>
                </TouchableWithoutFeedback>
            </Modal>

            <CustomAlertModal
                visible={revertModalVisible}
                onClose={() => setRevertModalVisible(false)}
                title="Cannot Revert"
                message="You cannot revert a week that has already been funded."
                type="warning"
                confirmText="Got it"
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
    headerTitle: { fontSize: 20, fontWeight: '800' },
    
    heroCard: { borderRadius: radius.xl, padding: 20, marginBottom: spacing.xl, borderWidth: 1, borderColor: COLORS.border },
    heroTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    iconBox: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
    title: { fontSize: 20, fontWeight: '900', marginBottom: 4 },
    typeBadge: { fontSize: 12, fontWeight: '800', letterSpacing: 1 },
    desc: { fontSize: 14, lineHeight: 20, marginBottom: 20 },
    
    progressSection: { marginTop: 8 },
    progressLabels: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 12 },
    progressAmount: { fontSize: 28, fontWeight: '900', marginRight: 8 },
    progressTarget: { fontSize: 14, fontWeight: '600', paddingBottom: 4 },
    barContainer: { height: 12, backgroundColor: 'rgba(0,0,0,0.05)', borderRadius: 6, overflow: 'hidden', marginBottom: 8 },
    barFill: { height: '100%', borderRadius: 6 },
    pctLabel: { fontSize: 12, fontWeight: '700', textAlign: 'right' },
    
    sectionTitle: { fontSize: 18, fontWeight: '800', marginBottom: 16 },
    weeksContainer: { marginTop: 8 },
    weeksGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    weekBox: { 
        width: (windowWidth - spacing.lg * 2 - 24) / 4, 
        paddingVertical: 12, 
        borderRadius: radius.md, 
        borderWidth: 1.5, 
        justifyContent: 'center', 
        alignItems: 'center' 
    },
    weekLabel: { fontSize: 11, fontWeight: '700', marginBottom: 4 },
    weekAmount: { fontSize: 13, fontWeight: '800' },
    
    card: { borderRadius: radius.xl, padding: 20, borderWidth: 1, borderColor: COLORS.border },
    subText: { fontSize: 13, lineHeight: 18 },
    emptyFails: { alignItems: 'center', paddingVertical: 32 },
    emptyFailsText: { fontSize: 18, fontWeight: '800', marginBottom: 4 },
    failRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1 },
    failDate: { fontSize: 15, fontWeight: '600', marginLeft: 12 },
    
    quickBtn: { padding: 16, borderRadius: radius.lg, alignItems: 'center' },
    quickBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    walletModal: { padding: 24, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, maxHeight: '80%' },
    modalTitle: { fontSize: 22, fontWeight: '900', marginBottom: 8 },
    modalSub: { fontSize: 14, lineHeight: 20 },
    walletOption: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: radius.lg, borderWidth: 1, marginBottom: 12 },
    walletIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    walletName: { fontSize: 15, fontWeight: '800', marginBottom: 4 },
    walletBal: { fontSize: 12, fontWeight: '600' },
    cancelBtn: { padding: 16, borderRadius: radius.lg, borderWidth: 1, alignItems: 'center', marginTop: 8 },
    cancelBtnText: { fontSize: 16, fontWeight: '800' }
});
