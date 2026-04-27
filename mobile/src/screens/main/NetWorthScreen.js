import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView,
    ActivityIndicator, RefreshControl, Dimensions, Animated
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import { LineChart } from 'react-native-chart-kit';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { getNetWorth, getNetWorthHistory, createNetWorthSnapshot } from '../../api/api';
import { formatCurrency } from '../../utils/formatters';
import { spacing, radius, shadow } from '../../theme/colors';

const { width } = Dimensions.get('window');

export default function NetWorthScreen({ navigation }) {
    const COLORS = useTheme(state => state.COLORS);
    const { userInfo } = useAuth();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [data, setData] = useState(null);
    const [history, setHistory] = useState([]);
    const [takingSnapshot, setTakingSnapshot] = useState(false);

    const loadData = useCallback(async () => {
        try {
            const [nwRes, histRes] = await Promise.all([
                getNetWorth(),
                getNetWorthHistory()
            ]);
            setData(nwRes);
            setHistory(histRes.history || []);
        } catch (error) {
            console.error('[NetWorth] Load error:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleTakeSnapshot = async () => {
        setTakingSnapshot(true);
        try {
            await createNetWorthSnapshot();
            loadData();
        } catch (error) {
            console.error('[NetWorth] Snapshot error:', error);
        } finally {
            setTakingSnapshot(false);
        }
    };

    const renderChart = () => {
        if (history.length < 2) {
            return (
                <View style={[styles.emptyChart, { backgroundColor: COLORS.surface }]}>
                    <Feather name="activity" size={32} color={COLORS.textMuted} style={{ opacity: 0.3 }} />
                    <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 10, textAlign: 'center' }}>
                        Not enough data for a history graph. Tap the Snapshot button to start tracking!
                    </Text>
                </View>
            );
        }

        const chartData = {
            labels: history.slice(-7).map(h => new Date(h.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })),
            datasets: [{
                data: history.slice(-7).map(h => h.netWorth),
                color: (opacity = 1) => `rgba(233, 30, 140, ${opacity})`,
                strokeWidth: 3
            }]
        };

        return (
            <LineChart
                data={chartData}
                width={width - 40}
                height={220}
                chartConfig={{
                    backgroundColor: COLORS.surface,
                    backgroundGradientFrom: COLORS.surface,
                    backgroundGradientTo: COLORS.surface,
                    decimalPlaces: 0,
                    color: (opacity = 1) => COLORS.primary,
                    labelColor: (opacity = 1) => COLORS.textMuted,
                    style: { borderRadius: 16 },
                    propsForDots: { r: "4", strokeWidth: "2", stroke: COLORS.primary },
                    propsForBackgroundLines: { strokeDasharray: "", stroke: COLORS.border, opacity: 0.5 }
                }}
                bezier
                style={{ marginVertical: 16, borderRadius: 16 }}
            />
        );
    };

    if (loading && !data) {
        return (
            <View style={[styles.center, { backgroundColor: COLORS.background }]}>
                <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
        );
    }

    const { netWorth, totalAssets, totalLiabilities, breakdown } = data || {};

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: COLORS.background }]} edges={['top']}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Feather name="arrow-left" size={24} color={COLORS.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: COLORS.text }]}>Net Worth Tracker</Text>
                <TouchableOpacity onPress={handleTakeSnapshot} disabled={takingSnapshot} style={styles.snapshotBtn}>
                    {takingSnapshot ? <ActivityIndicator size="small" color={COLORS.primary} /> : <Feather name="camera" size={20} color={COLORS.primary} />}
                </TouchableOpacity>
            </View>

            <ScrollView
                contentContainerStyle={styles.scrollContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={COLORS.primary} />}
            >
                <View style={[styles.mainCard, { backgroundColor: COLORS.surface }]}>
                    <Text style={[styles.cardLabel, { color: COLORS.textMuted }]}>CURRENT NET WORTH</Text>
                    <Text style={[styles.mainAmount, { color: COLORS.text }]}>{formatCurrency(netWorth, userInfo?.currency)}</Text>

                    <View style={styles.summaryRow}>
                        <View style={styles.summaryItem}>
                            <View style={[styles.dot, { backgroundColor: '#22c55e' }]} />
                            <Text style={[styles.summaryLabel, { color: COLORS.textMuted }]}>Assets</Text>
                            <Text style={[styles.summaryValue, { color: '#22c55e' }]}>{formatCurrency(totalAssets, userInfo?.currency)}</Text>
                        </View>
                        <View style={styles.summaryItem}>
                            <View style={[styles.dot, { backgroundColor: '#ef4444' }]} />
                            <Text style={[styles.summaryLabel, { color: COLORS.textMuted }]}>Liabilities</Text>
                            <Text style={[styles.summaryValue, { color: '#ef4444' }]}>{formatCurrency(totalLiabilities, userInfo?.currency)}</Text>
                        </View>
                    </View>
                </View>

                <Text style={[styles.sectionTitle, { color: COLORS.text }]}>Growth History</Text>
                {renderChart()}

                <Text style={[styles.sectionTitle, { color: COLORS.text }]}>Breakdown</Text>

                <View style={styles.breakdownGrid}>
                    <BreakdownItem
                        title="In-Hand Cash"
                        amount={breakdown?.cash}
                        icon="dollar-sign"
                        color="#22c55e"
                        COLORS={COLORS}
                        currency={userInfo?.currency}
                    />
                    <BreakdownItem
                        title="Wallets"
                        amount={breakdown?.wallets}
                        icon="wallet"
                        color="#3b82f6"
                        COLORS={COLORS}
                        currency={userInfo?.currency}
                    />
                    <BreakdownItem
                        title="Savings"
                        amount={breakdown?.savings}
                        icon="piggy-bank"
                        color="#8b5cf6"
                        COLORS={COLORS}
                        currency={userInfo?.currency}
                    />
                    <BreakdownItem
                        title="Receivables"
                        amount={breakdown?.receivables}
                        icon="arrow-down-left"
                        color="#10b981"
                        COLORS={COLORS}
                        currency={userInfo?.currency}
                    />
                    <BreakdownItem
                        title="Debts"
                        amount={breakdown?.debts}
                        icon="arrow-up-right"
                        color="#f59e0b"
                        COLORS={COLORS}
                        currency={userInfo?.currency}
                    />
                    <BreakdownItem
                        title="Credit Cards"
                        amount={breakdown?.creditCards}
                        icon="credit-card"
                        color="#ef4444"
                        COLORS={COLORS}
                        currency={userInfo?.currency}

                    />
                </View>

                <View style={{ height: 40 }} />
            </ScrollView>
        </SafeAreaView>
    );
}

function BreakdownItem({ title, amount, icon, color, COLORS, currency, fullWidth }) {
    return (
        <View style={[styles.breakdownCard, { backgroundColor: COLORS.surface, width: fullWidth ? '100%' : '48%' }]}>
            <View style={[styles.iconBox, { backgroundColor: color + '15' }]}>
                {icon === 'piggy-bank' ? (
                    <MaterialCommunityIcons name={icon} size={20} color={color} />
                ) :
                    icon === 'wallet' ? (
                        <FontAwesome5 name={icon} size={20} color={color} />
                    ) : (
                        <Feather name={icon} size={20} color={color} />
                    )}
            </View>
            <View style={{ flex: 1 }}>
                <Text style={[styles.breakdownLabel, { color: COLORS.textMuted }]}>{title.toUpperCase()}</Text>
                <Text style={[styles.breakdownValue, { color: COLORS.text }]}>{formatCurrency(amount || 0, currency)}</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.md },
    backBtn: { padding: 4 },
    headerTitle: { fontSize: 20, fontWeight: '800', flex: 1 },
    snapshotBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(233, 30, 140, 0.1)' },
    scrollContent: { padding: spacing.md },
    mainCard: { padding: 24, borderRadius: 24, ...shadow.soft, marginBottom: spacing.lg },
    cardLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 1, marginBottom: 8 },
    mainAmount: { fontSize: 36, fontWeight: '900', marginBottom: 20 },
    summaryRow: { flexDirection: 'row', gap: 20, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)', paddingTop: 20 },
    summaryItem: { flex: 1 },
    dot: { width: 8, height: 8, borderRadius: 4, marginBottom: 4 },
    summaryLabel: { fontSize: 10, fontWeight: '700', marginBottom: 2 },
    summaryValue: { fontSize: 16, fontWeight: '800' },
    sectionTitle: { fontSize: 18, fontWeight: '800', marginBottom: 12, marginTop: 8 },
    emptyChart: { height: 220, borderRadius: 16, justifyContent: 'center', alignItems: 'center', padding: 40, marginVertical: 16 },
    breakdownGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    breakdownCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 20, gap: 12, ...shadow.soft },
    iconBox: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    breakdownLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5, marginBottom: 2 },
    breakdownValue: { fontSize: 14, fontWeight: '800' }
});
