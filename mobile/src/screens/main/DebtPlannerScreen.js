import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { spacing, radius } from '../../theme/colors';

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
    let balanceHistory = []; // Tracks total balance per month for charts if needed

    // Check if the budget is even enough to cover the minimums
    const totalMinimums = activeDebts.reduce((sum, d) => sum + d.minPay, 0);
    if (totalMonthlyBudget < totalMinimums) {
        return { error: 'Your budget is lower than your minimum payments.' };
    }

    // Simulate months
    // Safety break at 360 months (30 years) to prevent infinite loops
    let currentTotalBalance = activeDebts.reduce((sum, d) => sum + d.balance, 0);
    balanceHistory.push(currentTotalBalance);

    while (activeDebts.length > 0 && months < 360) {
        months++;
        let remainingBudget = totalMonthlyBudget;

        // 1. Pay minimums
        activeDebts.forEach(debt => {
            if (debt.balance > 0) {
                // Calculate monthly interest (rate is usually Annual. If penaltyRate is monthly, we use it directly)
                // Let's assume penaltyRate is an Annual Percentage Rate (APR) for realism, so / 1200
                const interest = debt.balance * (debt.rate / 1200);
                totalInterest += interest;
                debt.balance += interest;

                let payment = Math.min(debt.minPay, debt.balance);
                debt.balance -= payment;
                remainingBudget -= payment;
            }
        });

        // 2. Apply remaining budget (Avalanche/Snowball extra payment) to the top priority debt
        // Find the first debt that still has a balance
        let targetDebt = activeDebts.find(d => d.balance > 0);
        if (targetDebt && remainingBudget > 0) {
            let payment = Math.min(remainingBudget, targetDebt.balance);
            targetDebt.balance -= payment;
        }

        // 3. Filter out paid off debts
        activeDebts = activeDebts.filter(d => d.balance > 0);
        
        currentTotalBalance = activeDebts.reduce((sum, d) => sum + d.balance, 0);
        balanceHistory.push(currentTotalBalance);
    }

    return {
        months,
        totalInterest,
        isInfinite: months >= 360
    };
};

export default function DebtPlannerScreen({ navigation }) {
    const { COLORS, isBaseDark } = useTheme();
    const { userToken } = useAuth();
    
    const [debts, setDebts] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // Total required minimum payments
    const [totalMinPayments, setTotalMinPayments] = useState(0);
    
    // User input: extra payment on top of minimums
    const [extraPaymentStr, setExtraPaymentStr] = useState('500');

    useEffect(() => {
        fetchDebts();
    }, []);

    const fetchDebts = async () => {
        try {
            const res = await fetch('http://192.168.100.86:5000/api/debts', {
                headers: { 'Authorization': `Bearer ${userToken}` }
            });
            const data = await res.json();
            
            // Only care about money Owed By Me that is not settled
            const myDebts = data.filter(d => d.direction === 'owed_by_me' && d.status !== 'settled');
            
            // Calculate baseline minimums
            let mins = 0;
            myDebts.forEach(d => {
                mins += (d.monthlyPayment || 100); 
            });
            
            setDebts(myDebts);
            setTotalMinPayments(mins);
            
            // If they have no budget set, default to 10% extra over minimum
            setExtraPaymentStr(Math.round(mins * 0.1).toString());
        } catch (err) {
            console.error('[DebtPlanner] fetch error:', err);
        } finally {
            setLoading(false);
        }
    };

    // Derived states
    const extraPayment = parseFloat(extraPaymentStr) || 0;
    const totalBudget = totalMinPayments + extraPayment;

    const snowballSim = useMemo(() => simulatePayoff(debts, 'snowball', totalBudget), [debts, totalBudget]);
    const avalancheSim = useMemo(() => simulatePayoff(debts, 'avalanche', totalBudget), [debts, totalBudget]);

    // Format helpers
    const formatCurrency = (val) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(val);
    const formatMonths = (m) => {
        if (m >= 360) return "Never (30+ yrs)";
        const yrs = Math.floor(m / 12);
        const rem = m % 12;
        if (yrs === 0) return `${m} month${m !== 1 ? 's' : ''}`;
        return `${yrs}y ${rem}m`;
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
                            <Text style={[styles.importantMetric, { color: COLORS.text }]}>
                                {debts.length} {debts.length === 1 ? 'Account' : 'Accounts'}
                            </Text>
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
                                {/* Comparison Visualizer */}
                                <Text style={[styles.sectionHeading, { color: COLORS.text }]}>Payoff Strategy</Text>
                                
                                {/* Avalanche vs Snowball List */}
                                <View style={styles.strategiesRow}>
                                    
                                    {/* SNOWBALL */}
                                    <View style={[styles.strategyCol, { backgroundColor: COLORS.surface, borderTopWidth: 4, borderTopColor: '#3b82f6' }]}>
                                        <Text style={[styles.stratName, { color: COLORS.text }]}>Snowball ⛄</Text>
                                        <Text style={[styles.stratCaption, { color: COLORS.textMuted }]}>Smallest balance first</Text>
                                        
                                        <Text style={[styles.stratValTitle, { color: COLORS.textMuted, marginTop: 16 }]}>DEBT FREE IN</Text>
                                        <Text style={[styles.stratValLarge, { color: COLORS.text }]}>{formatMonths(snowballSim.months)}</Text>
                                        
                                        <View style={{ flex: 1 }} />

                                        <Text style={[styles.stratValTitle, { color: COLORS.textMuted, marginTop: 12 }]}>TOTAL INTEREST</Text>
                                        <Text style={[styles.stratInterestVal, { color: '#ef4444' }]}>{formatCurrency(snowballSim.totalInterest)}</Text>
                                        
                                        {snowballSim.totalInterest > avalancheSim.totalInterest && (
                                            <Text style={styles.differenceWarning}>Costs {formatCurrency(snowballSim.totalInterest - avalancheSim.totalInterest)} more</Text>
                                        )}
                                    </View>

                                    {/* AVALANCHE */}
                                    <View style={[styles.strategyCol, { backgroundColor: COLORS.surface, borderTopWidth: 4, borderTopColor: '#f59e0b' }]}>
                                        <Text style={[styles.stratName, { color: COLORS.text }]}>Avalanche 🏔️</Text>
                                        <Text style={[styles.stratCaption, { color: COLORS.textMuted }]}>Highest interest first</Text>

                                        <Text style={[styles.stratValTitle, { color: COLORS.textMuted, marginTop: 16 }]}>DEBT FREE IN</Text>
                                        <Text style={[styles.stratValLarge, { color: COLORS.text }]}>{formatMonths(avalancheSim.months)}</Text>
                                        
                                        <View style={{ flex: 1 }} />

                                        <Text style={[styles.stratValTitle, { color: COLORS.textMuted, marginTop: 12 }]}>TOTAL INTEREST</Text>
                                        <Text style={[styles.stratInterestVal, { color: '#22c55e' }]}>{formatCurrency(avalancheSim.totalInterest)}</Text>
                                        
                                        {avalancheSim.totalInterest < snowballSim.totalInterest && (
                                            <View style={styles.bestBadge}>
                                                <Text style={styles.bestBadgeText}>SAVES MONEY</Text>
                                            </View>
                                        )}
                                    </View>
                                </View>

                                {/* Educational Context */}
                                <View style={[styles.eduCard, { backgroundColor: COLORS.surface }]}>
                                    <Text style={[styles.eduText, { color: COLORS.textMuted }]}>
                                        <Text style={{ fontWeight: 'bold', color: COLORS.text }}>Tip: </Text>
                                        The <Text style={{ color: '#f59e0b', fontWeight: 'bold' }}>Avalanche</Text> method focuses on high interest debt first, mathematically saving you the most money. 
                                        The <Text style={{ color: '#3b82f6', fontWeight: 'bold' }}>Snowball</Text> method focuses on small balances first, giving you quick psychological wins!
                                    </Text>
                                </View>
                            </>
                        )}
                        
                    </ScrollView>
                )}
            </KeyboardAvoidingView>
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
    currencyInputShell: { 
        flexDirection: 'row', alignItems: 'center', 
        borderWidth: 2, borderRadius: radius.lg, 
        paddingHorizontal: 16, paddingVertical: 12
    },
    currencySymbol: { fontSize: 20, fontWeight: '800', marginRight: 8 },
    payoffInput: { flex: 1, fontSize: 24, fontWeight: '800' },
    totalBudgetNote: { fontSize: 11, marginTop: 12, textAlign: 'center' },

    sectionHeading: { fontSize: 18, fontWeight: '800', marginBottom: spacing.md },
    strategiesRow: { flexDirection: 'row', gap: 12, marginBottom: spacing.xl },
    strategyCol: { 
        flex: 1, padding: spacing.md, borderRadius: radius.xl, 
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
        minHeight: 200
    },
    stratName: { fontSize: 16, fontWeight: '800' },
    stratCaption: { fontSize: 11, marginTop: 2, fontStyle: 'italic' },
    
    stratValTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
    stratValLarge: { fontSize: 18, fontWeight: '900', marginTop: 4 },
    stratInterestVal: { fontSize: 16, fontWeight: '800', marginTop: 4 },

    differenceWarning: { fontSize: 10, color: '#ef4444', fontWeight: '700', marginTop: 6 },
    bestBadge: { alignSelf: 'flex-start', backgroundColor: '#22c55e', paddingHorizontal: 6, paddingVertical: 3, borderRadius: radius.xs, marginTop: 6 },
    bestBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },

    eduCard: { padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' },
    eduText: { fontSize: 13, lineHeight: 20 }
});
