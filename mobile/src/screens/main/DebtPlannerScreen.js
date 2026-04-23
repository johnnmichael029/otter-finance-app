import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { spacing, radius } from '../../theme/colors';
import { getDebts, logDebtPayment } from '../../api/api';
import { connectSocket, getSocket } from '../../utils/socket';
import BottomSheetModal from '../../components/BottomSheetModal';
import CustomAlertModal from '../../components/CustomAlertModal';

const { width } = Dimensions.get('window');

// ── Debt Calculation Strategies ────────────────────────────────────────────────
// Balances are simulated month-by-month.

const simulatePayoff = (debts, strategy, totalMonthlyBudget) => {
    // Clone debts to avoid mutating state
    let activeDebts = debts.map(d => ({
        id: d._id,
        name: d.personName,
        balance: Math.max(0, d.amount - (d.amountPaid || 0)),
        minPay: d.monthlyPayment || 100, // assume at least 100 if none provided to avoid infinite loops
        rate: d.penaltyRate || 0,
        payoffMonth: null
    }));

    // Filter out already settled
    activeDebts = activeDebts.filter(d => d.balance > 0);
    
    // Sort based on strategy
    if (strategy === 'snowball') {
        // Snowball: lowest balance first
        activeDebts.sort((a, b) => a.balance - b.balance);
    } else {
        // Avalanche: highest interest rate first
        activeDebts.sort((a, b) => b.rate - a.rate);
    }

    let months = 0;
    let totalInterest = 0;
    let balanceHistory = []; 
    let payoffOrder = [];

    // Check if the budget is even enough to cover the minimums
    const totalMinimums = activeDebts.reduce((sum, d) => sum + d.minPay, 0);
    if (totalMonthlyBudget < totalMinimums) {
        return { error: 'Your budget is lower than your minimum payments.' };
    }

    // Safety break at 360 months (30 years) to prevent infinite loops
    let currentTotalBalance = activeDebts.reduce((sum, d) => sum + d.balance, 0);
    balanceHistory.push(currentTotalBalance);

    while (activeDebts.length > 0 && months < 360) {
        months++;
        let remainingBudget = totalMonthlyBudget;

        // 1. Pay minimums
        activeDebts.forEach(debt => {
            if (debt.balance > 0) {
                const interest = debt.balance * (debt.rate / 1200);
                totalInterest += interest;
                debt.balance += interest;

                let payment = Math.min(debt.minPay, debt.balance);
                debt.balance -= payment;
                remainingBudget -= payment;
            }
        });

        // 2. Apply remaining budget
        let targetDebt = activeDebts.find(d => d.balance > 0);
        if (targetDebt && remainingBudget > 0) {
            let payment = Math.min(remainingBudget, targetDebt.balance);
            targetDebt.balance -= payment;
        }

        // 3. Mark paid off debts
        activeDebts.forEach(d => {
            if (d.balance <= 0.01 && !d.payoffMonth) {
                d.payoffMonth = months;
                payoffOrder.push({ ...d });
            }
        });

        // Filter out paid off debts for next loop
        activeDebts = activeDebts.filter(d => d.balance > 0.01);
        
        currentTotalBalance = activeDebts.reduce((sum, d) => sum + d.balance, 0);
        balanceHistory.push(currentTotalBalance);
    }

    // Any remaining active debts (if hit 360 loop limit)
    activeDebts.forEach(d => {
        d.payoffMonth = "Never";
        payoffOrder.push({ ...d });
    });

    return {
        months,
        totalInterest,
        isInfinite: months >= 360,
        payoffOrder
    };
};

export default function DebtPlannerScreen({ navigation }) {
    const { COLORS, isBaseDark } = useTheme();
    const { userToken, userInfo } = useAuth();
    
    const [debts, setDebts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [totalMinPayments, setTotalMinPayments] = useState(0);
    const [extraPaymentStr, setExtraPaymentStr] = useState('500');
    
    // Interactive state
    const [activeStrategy, setActiveStrategy] = useState('snowball');
    
    // Payment Modal State
    const [payModal, setPayModal] = useState({ visible: false, debtId: null, name: '', amount: '', minPay: 0 });
    const [paying, setPaying] = useState(false);
    const [alert, setAlert] = useState({ visible: false, title: '', message: '', type: 'info' });

    const fetchDebts = React.useCallback(async () => {
        try {
            const data = await getDebts();
            
            // Only care about money Owed By Me that is not settled
            const myDebts = data.filter(d => d.direction === 'owed_by_me' && d.status !== 'settled');
            
            let mins = 0;
            myDebts.forEach(d => { mins += (d.monthlyPayment || 100); });
            
            setDebts(myDebts);
            setTotalMinPayments(mins);
            setExtraPaymentStr(Math.round(mins * 0.1).toString());
        } catch (err) {
            console.error('[DebtPlanner] fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchDebts();
    }, [fetchDebts]);

    useEffect(() => {
        if (!userInfo?._id) return;
        connectSocket(userInfo._id);
        const socket = getSocket();

        const handleUpdate = () => { fetchDebts(); };

        socket.on('new_debt', handleUpdate);
        socket.on('update_debt', handleUpdate);
        socket.on('delete_debt', handleUpdate);

        return () => {
            socket.off('new_debt', handleUpdate);
            socket.off('update_debt', handleUpdate);
            socket.off('delete_debt', handleUpdate);
        };
    }, [userInfo?._id, fetchDebts]);

    const handleLogPayment = async () => {
        const amt = parseFloat(payModal.amount);
        if (!amt || amt <= 0) return setAlert({ visible: true, type: 'warning', title: 'Invalid Amount', message: 'Enter a valid payment amount.' });
        
        setPaying(true);
        try {
            await logDebtPayment(payModal.debtId, { amount: amt, note: 'Planner targeted payment' });
            setAlert({ visible: true, type: 'success', title: 'Payment Logged!', message: 'Awesome job knocking out that debt!' });
            setPayModal({ visible: false, debtId: null, name: '', amount: '', minPay: 0 });
            setLoading(true);
            fetchDebts(); // Refetch
        } catch (e) {
            setAlert({ visible: true, type: 'error', title: 'Payment Failed', message: e?.response?.data?.error || 'Could not log payment.' });
        } finally {
            setPaying(false);
        }
    };

    // Derived states
    const extraPayment = parseFloat(extraPaymentStr) || 0;
    const totalBudget = totalMinPayments + extraPayment;

    const snowballSim = useMemo(() => simulatePayoff(debts, 'snowball', totalBudget), [debts, totalBudget]);
    const avalancheSim = useMemo(() => simulatePayoff(debts, 'avalanche', totalBudget), [debts, totalBudget]);

    const activeSim = activeStrategy === 'snowball' ? snowballSim : avalancheSim;

    // Format helpers
    const formatCurrency = (val) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(val);
    const formatMonths = (m) => {
        if (m === "Never") return "Never (30+ yrs)";
        if (m >= 360) return "Never (30+ yrs)";
        const yrs = Math.floor(m / 12);
        const rem = m % 12;
        if (yrs === 0) return `${m} month${m !== 1 ? 's' : ''}`;
        return `${yrs}y ${rem}m`;
    };

    const computeFutureDate = (months) => {
        if (months >= 360 || months === 'Never') return 'Never';
        const d = new Date();
        d.setMonth(d.getMonth() + months);
        return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(d);
    };

    if (loading) {
        return (
            <SafeAreaView style={[styles.safe, { backgroundColor: COLORS.background, justifyContent: 'center' }]}>
                <ActivityIndicator size="large" color={COLORS.primary} />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={[styles.safe, { backgroundColor: COLORS.background }]}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
                
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => { if (navigation.canGoBack()) navigation.goBack(); }} style={[styles.backBtn, { backgroundColor: COLORS.surface }]}>
                        <Feather name="arrow-left" size={20} color={COLORS.text} />
                    </TouchableOpacity>
                    <View style={styles.headerTitleContainer}>
                        <Text style={[styles.headerTitle, { color: COLORS.text }]}>Payoff Planner</Text>
                    </View>
                    <View style={{ width: 40 }} />
                </View>

                {debts.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Text style={{ fontSize: 60, marginBottom: 20 }}>🎉</Text>
                        <Text style={[styles.emptyText, { color: COLORS.text }]}>You are completely debt free!</Text>
                        <Text style={[styles.emptySub, { color: COLORS.textMuted }]}>This planner activates when you owe money.</Text>
                    </View>
                ) : (
                    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                        
                        {/* Summary Card */}
                        <View style={[styles.card, { backgroundColor: COLORS.surface }]}>
                            <Text style={[styles.cardTitle, { color: COLORS.textMuted }]}>ACTIVE DEBTS</Text>
                            <Text style={[styles.importantMetric, { color: COLORS.text }]}>{debts.length} {debts.length === 1 ? 'Account' : 'Accounts'}</Text>
                            <View style={styles.divider} />
                            <Text style={[styles.cardTitle, { color: COLORS.textMuted, marginTop: 10 }]}>REQUIRED MINIMUMS</Text>
                            <Text style={[styles.importantDesc, { color: COLORS.textMuted }]}>
                                <Text style={{ color: COLORS.text, fontWeight: '800' }}>{formatCurrency(totalMinPayments)}</Text> / month
                            </Text>
                        </View>

                        {/* Extra Contribution Input */}
                        <View style={[styles.inputCard, { borderColor: COLORS.border, backgroundColor: isBaseDark ? '#1F2937' : '#F3F4F6' }]}>
                            <View style={styles.inputHeaderRow}>
                                <Feather name="trending-down" size={18} color="#22c55e" />
                                <Text style={[styles.inputTitle, { color: COLORS.text }]}>Extra Monthly Payment</Text>
                            </View>
                            <Text style={[styles.inputSub, { color: COLORS.textMuted }]}>How much extra cash can you put towards your debts each month?</Text>
                            
                            <View style={[styles.currencyInputShell, { backgroundColor: COLORS.background, borderColor: COLORS.primary }]}>
                                <Text style={[styles.currencySymbol, { color: COLORS.textMuted }]}>₱</Text>
                                <TextInput
                                    style={[styles.payoffInput, { color: COLORS.text }]}
                                    keyboardType="numeric"
                                    value={extraPaymentStr}
                                    onChangeText={setExtraPaymentStr}
                                    placeholder="0"
                                    placeholderTextColor={COLORS.textMuted}
                                />
                            </View>

                            <Text style={[styles.totalBudgetNote, { color: COLORS.textMuted }]}>
                                Total assumed monthly payment: <Text style={{ color: COLORS.text, fontWeight: 'bold' }}>{formatCurrency(totalBudget)}</Text>
                            </Text>
                        </View>

                        {(snowballSim.error || avalancheSim.error) ? (
                            <View style={[styles.card, { backgroundColor: '#fee2e2', borderColor: '#f87171', borderWidth: 1 }]}>
                                <Feather name="alert-circle" size={24} color="#ef4444" style={{ marginBottom: 10 }} />
                                <Text style={{ color: '#b91c1c', fontWeight: '600' }}>Warning: Budget too low</Text>
                                <Text style={{ color: '#991b1b', fontSize: 13, marginTop: 4 }}>You need at least {formatCurrency(totalMinPayments)} to cover your existing minimum payments.</Text>
                            </View>
                        ) : (
                            <>
                                <Text style={[styles.sectionHeading, { color: COLORS.text }]}>Choose Your Strategy</Text>
                                
                                {/* Strategy Selector */}
                                <View style={styles.strategiesRow}>
                                    {/* SNOWBALL */}
                                    <TouchableOpacity 
                                        onPress={() => setActiveStrategy('snowball')}
                                        style={[
                                            styles.strategyCol, 
                                            { backgroundColor: COLORS.surface, borderTopWidth: 4, borderTopColor: '#3b82f6' },
                                            activeStrategy === 'snowball' && { borderColor: '#3b82f6', borderWidth: 2 }
                                        ]}
                                    >
                                        <Text style={[styles.stratName, { color: COLORS.text }]}>Snowball ⛄</Text>
                                        <Text style={[styles.stratCaption, { color: COLORS.textMuted }]}>Fast wins</Text>
                                        <Text style={[styles.stratValTitle, { color: COLORS.textMuted, marginTop: 16 }]}>DEBT FREE IN</Text>
                                        <Text style={[styles.stratValLarge, { color: COLORS.text }]}>{formatMonths(snowballSim.months)}</Text>
                                        <View style={{ flex: 1 }} />
                                        <Text style={[styles.stratValTitle, { color: COLORS.textMuted, marginTop: 12 }]}>TOTAL INTEREST</Text>
                                        <Text style={[styles.stratInterestVal, { color: '#ef4444' }]}>{formatCurrency(snowballSim.totalInterest)}</Text>
                                    </TouchableOpacity>

                                    {/* AVALANCHE */}
                                    <TouchableOpacity 
                                        onPress={() => setActiveStrategy('avalanche')}
                                        style={[
                                            styles.strategyCol, 
                                            { backgroundColor: COLORS.surface, borderTopWidth: 4, borderTopColor: '#f59e0b' },
                                            activeStrategy === 'avalanche' && { borderColor: '#f59e0b', borderWidth: 2 }
                                        ]}
                                    >
                                        <Text style={[styles.stratName, { color: COLORS.text }]}>Avalanche 🏔️</Text>
                                        <Text style={[styles.stratCaption, { color: COLORS.textMuted }]}>Save money</Text>
                                        <Text style={[styles.stratValTitle, { color: COLORS.textMuted, marginTop: 16 }]}>DEBT FREE IN</Text>
                                        <Text style={[styles.stratValLarge, { color: COLORS.text }]}>{formatMonths(avalancheSim.months)}</Text>
                                        <View style={{ flex: 1 }} />
                                        <Text style={[styles.stratValTitle, { color: COLORS.textMuted, marginTop: 12 }]}>TOTAL INTEREST</Text>
                                        <Text style={[styles.stratInterestVal, { color: '#22c55e' }]}>{formatCurrency(avalancheSim.totalInterest)}</Text>
                                    </TouchableOpacity>
                                </View>

                                {/* Priority Order List */}
                                <Text style={[styles.sectionHeading, { color: COLORS.text, marginTop: spacing.md }]}>Target Priority</Text>
                                <Text style={[styles.inputSub, { color: COLORS.textMuted, marginBottom: spacing.md }]}>
                                    Based on the <Text style={{ color: COLORS.text, fontWeight: 'bold' }}>{activeStrategy}</Text> method, attack your debts in this exact order.
                                </Text>

                                {activeSim.payoffOrder && activeSim.payoffOrder.map((debt, index) => {
                                    const isTopPriority = index === 0;
                                    return (
                                        <View key={debt.id} style={[styles.priorityCard, { backgroundColor: COLORS.surface, borderColor: isTopPriority ? COLORS.primary : COLORS.border }]}>
                                            <View style={styles.priorityHeader}>
                                                <View style={[styles.rankCircle, { backgroundColor: isTopPriority ? COLORS.primary : COLORS.background }]}>
                                                    <Text style={[styles.rankText, { color: isTopPriority ? '#fff' : COLORS.textMuted }]}>{index + 1}</Text>
                                                </View>
                                                <View style={{ flex: 1, marginLeft: 12 }}>
                                                    <Text style={[styles.priorityName, { color: COLORS.text }]}>{debt.name}</Text>
                                                    <Text style={[styles.priorityTargetDate, { color: COLORS.textMuted }]}>
                                                        Target Payoff: <Text style={{ color: COLORS.text, fontWeight: '700' }}>{computeFutureDate(debt.payoffMonth)}</Text>
                                                    </Text>
                                                </View>
                                                <View style={{ alignItems: 'flex-end' }}>
                                                    <Text style={[styles.priorityBalance, { color: COLORS.text }]}>{formatCurrency(debt.balance)}</Text>
                                                    <Text style={[styles.priorityRate, { color: COLORS.textMuted }]}>{debt.rate}% APR</Text>
                                                </View>
                                            </View>
                                            
                                            {isTopPriority && (
                                                <TouchableOpacity 
                                                    style={[styles.payNowBtn, { backgroundColor: COLORS.primary }]}
                                                    onPress={() => setPayModal({ visible: true, debtId: debt.id, name: debt.name, amount: '', minPay: debt.minPay })}
                                                >
                                                    <Feather name="zap" size={16} color="#fff" />
                                                    <Text style={styles.payNowText}>Log Payment</Text>
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                    );
                                })}
                            </>
                        )}
                    </ScrollView>
                )}
            </KeyboardAvoidingView>

            {/* Payment Modal */}
            <BottomSheetModal visible={payModal.visible} onClose={() => !paying && setPayModal({ ...payModal, visible: false })} title="Log Payment">
                <Text style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 16 }}>
                    Paying towards top priority: <Text style={{ fontWeight: 'bold', color: COLORS.text }}>{payModal.name}</Text>
                </Text>
                
                <Text style={[styles.cardTitle, { color: COLORS.textMuted, marginBottom: 8 }]}>PAYMENT AMOUNT</Text>
                <View style={[styles.currencyInputShell, { backgroundColor: COLORS.background, borderColor: COLORS.border, marginBottom: 16 }]}>
                    <Text style={[styles.currencySymbol, { color: COLORS.textMuted }]}>₱</Text>
                    <TextInput
                        style={[styles.payoffInput, { color: COLORS.text }]}
                        keyboardType="numeric"
                        value={payModal.amount}
                        onChangeText={v => setPayModal({ ...payModal, amount: v })}
                        placeholder="0.00"
                        placeholderTextColor={COLORS.textMuted}
                    />
                </View>

                {payModal.minPay > 0 && (
                    <TouchableOpacity 
                        style={[styles.fillerBtn, { backgroundColor: COLORS.surface }]}
                        onPress={() => setPayModal({ ...payModal, amount: payModal.minPay.toString() })}
                    >
                        <Text style={[styles.fillerBtnText, { color: COLORS.primary }]}>Fill Minimum ({formatCurrency(payModal.minPay)})</Text>
                    </TouchableOpacity>
                )}

                <TouchableOpacity 
                    style={[styles.submitPayBtn, { backgroundColor: COLORS.primary }]}
                    onPress={handleLogPayment}
                    disabled={paying}
                >
                    {paying ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitPayText}>Confirm Payment</Text>}
                </TouchableOpacity>
            </BottomSheetModal>

            <CustomAlertModal
                visible={alert.visible} title={alert.title} message={alert.message} type={alert.type}
                onClose={() => setAlert({ ...alert, visible: false })} onConfirm={() => setAlert({ ...alert, visible: false })}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
    backBtn: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    headerTitleContainer: { flex: 1, alignItems: 'center' },
    headerTitle: { fontSize: 18, fontWeight: '800' },
    content: { padding: spacing.lg, paddingBottom: 60 },
    
    emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
    emptyText: { fontSize: 20, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
    emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },

    card: { padding: spacing.lg, borderRadius: radius.xl, marginBottom: spacing.lg },
    cardTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
    importantMetric: { fontSize: 24, fontWeight: '800', marginTop: 4 },
    divider: { height: 1, backgroundColor: 'rgba(0,0,0,0.05)', marginVertical: 12 },
    importantDesc: { fontSize: 14, marginTop: 4 },

    inputCard: { padding: spacing.lg, borderRadius: radius.xl, borderWidth: 1, marginBottom: spacing.xl },
    inputHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
    inputTitle: { fontSize: 16, fontWeight: '800' },
    inputSub: { fontSize: 12, lineHeight: 18, marginBottom: 16 },
    currencyInputShell: { flexDirection: 'row', alignItems: 'center', borderWidth: 2, borderRadius: radius.lg, paddingHorizontal: 16, paddingVertical: 12 },
    currencySymbol: { fontSize: 20, fontWeight: '800', marginRight: 8 },
    payoffInput: { flex: 1, fontSize: 24, fontWeight: '800' },
    totalBudgetNote: { fontSize: 11, marginTop: 12, textAlign: 'center' },

    sectionHeading: { fontSize: 18, fontWeight: '800', marginBottom: spacing.md },
    strategiesRow: { flexDirection: 'row', gap: 12, marginBottom: spacing.xl },
    strategyCol: { flex: 1, padding: spacing.md, borderRadius: radius.xl, minHeight: 180 },
    stratName: { fontSize: 16, fontWeight: '800' },
    stratCaption: { fontSize: 11, marginTop: 2, fontStyle: 'italic' },
    stratValTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
    stratValLarge: { fontSize: 18, fontWeight: '900', marginTop: 4 },
    stratInterestVal: { fontSize: 16, fontWeight: '800', marginTop: 4 },

    priorityCard: { padding: spacing.md, borderRadius: radius.xl, borderWidth: 1, marginBottom: spacing.md },
    priorityHeader: { flexDirection: 'row', alignItems: 'center' },
    rankCircle: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
    rankText: { fontSize: 14, fontWeight: '800' },
    priorityName: { fontSize: 16, fontWeight: '800' },
    priorityTargetDate: { fontSize: 12, marginTop: 4 },
    priorityBalance: { fontSize: 16, fontWeight: '800' },
    priorityRate: { fontSize: 11, marginTop: 4 },
    
    payNowBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 16, padding: 12, borderRadius: radius.lg, gap: 8 },
    payNowText: { color: '#fff', fontWeight: '800', fontSize: 14 },

    submitPayBtn: { height: 50, borderRadius: radius.lg, justifyContent: 'center', alignItems: 'center', marginTop: 16 },
    submitPayText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    fillerBtn: { padding: 8, borderRadius: radius.sm, alignSelf: 'flex-start' },
    fillerBtnText: { fontSize: 12, fontWeight: '600' }
});
