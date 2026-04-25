import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, RefreshControl,
    ActivityIndicator, TouchableOpacity, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { getAnalytics } from '../../api/api';
import { PieChart, LineChart } from 'react-native-chart-kit';
import { Dimensions } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import Skeleton from '../../components/Skeleton';
import { spacing, radius, colors } from '../../theme/colors';

const screenWidth = Dimensions.get('window').width;

export default function AnalyticsScreen({ navigation }) {
    const COLORS = useTheme(state => state.COLORS);
    const isDarkMode = useTheme(state => state.isDarkMode);
    const styles = getStyles(COLORS);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [exporting, setExporting] = useState(false);

    const loadData = useCallback(async () => {
        try {
            const res = await getAnalytics();
            setData(res);
        } catch (e) {
            console.warn('[Analytics] Load error:', e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const formatCurrency = (amount) =>
        new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);

    const handleExportPDF = async () => {
        if (!data) return;
        setExporting(true);
        try {
            const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

            // Build simple HTML string for PDF
            const pieList = data.pieChartData.map(d =>
                `<li><span style="color:${d.color}; font-weight:bold;">${d.name}:</span> ${formatCurrency(d.population)}</li>`
            ).join('');

            let trendRows = '';
            const labels = data.trendData.labels;
            const exp = data.trendData.datasets[0].data;
            const inc = data.trendData.datasets[1].data;
            for (let i = 0; i < labels.length; i++) {
                trendRows += `<tr>
                    <td>${labels[i]}</td>
                    <td style="color:red;">${formatCurrency(exp[i])}</td>
                    <td style="color:green;">${formatCurrency(inc[i])}</td>
                </tr>`;
            }

            const htmlContent = `
                <html>
                    <head>
                        <style>
                            body { font-family: 'Helvetica', sans-serif; padding: 40px; color: #333; }
                            h1 { color: #8b5cf6; }
                            h2 { margin-top: 30px; border-bottom: 2px solid #eee; padding-bottom: 5px; }
                            .insight { background: #f0fdf4; padding: 20px; border-radius: 10px; font-style: italic; color: #166534; }
                            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
                            th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
                            th { background-color: #f8f9fa; }
                            .footer { margin-top: 50px; text-align: center; color: #999; font-size: 12px; }
                        </style>
                    </head>
                    <body>
                        <h1>Otter Finance — Monthly Report</h1>
                        <p><strong>Generated on:</strong> ${dateStr}</p>
                        
                        <h2>Otter AI Insight 🤖</h2>
                        <div class="insight">
                            ${data.insight}
                        </div>

                        <h2>Current Month Breakdown</h2>
                        <ul>${pieList || '<li>No expenses recorded this month yet.</li>'}</ul>

                        <h2>6-Month Cash Flow Trends</h2>
                        <table>
                            <tr><th>Month</th><th>Expenses</th><th>Income</th></tr>
                            ${trendRows}
                        </table>

                        <div class="footer">Exported from Otter Finance App</div>
                    </body>
                </html>
            `;

            const { uri } = await Print.printToFileAsync({ html: htmlContent });
            await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });

        } catch (e) {
            Alert.alert('Error', 'Could not generate PDF report.');
        } finally {
            setExporting(false);
        }
    };

    if (loading) {
        return (
            <SafeAreaView style={styles.safe}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backBtn, { backgroundColor: COLORS.surface }]}>
                        <Feather name="arrow-left" size={20} color={COLORS.text} />
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, { color: COLORS.text }]}>Analytics & Insights</Text>
                    <View style={{ width: 40 }} />
                </View>
                <View style={styles.content}>
                    <Skeleton width="100%" height={100} borderRadius={16} style={{ marginBottom: spacing.lg }} />
                    <Skeleton width="100%" height={250} borderRadius={16} style={{ marginBottom: spacing.lg }} />
                    <Skeleton width="100%" height={250} borderRadius={16} />
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.safe}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backBtn, { backgroundColor: COLORS.surface }]}>
                    <Feather name="arrow-left" size={20} color={COLORS.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: COLORS.text }]}>Analytics & Insights</Text>

                <TouchableOpacity onPress={handleExportPDF} disabled={exporting} style={[styles.backBtn, { backgroundColor: COLORS.primary }]}>
                    {exporting ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="download" size={20} color="#fff" />}
                </TouchableOpacity>
            </View>

            <ScrollView
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={COLORS.primary} />}
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
            >
                {/* AI Insight Card */}
                <View style={[styles.card, { backgroundColor: COLORS.surface }]}>
                    <View style={styles.cardHeader}>
                        <MaterialCommunityIcons name="brain" size={20} color="#8b5cf6" />
                        <Text style={[styles.cardTitle, { color: COLORS.text }]}>Otter AI Analysis</Text>
                    </View>
                    {data?.insights?.map((ins, i) => (
                        <View key={i} style={styles.insightRow}>

                            <Text style={[styles.insightText, { color: COLORS.text }]}>"{ins}"</Text>
                        </View>
                    ))}
                </View>

                {/* Monthly Stats Summary */}
                <View style={styles.statsRow}>
                    <View style={[styles.statCard, { backgroundColor: COLORS.surface }]}>
                        <Text style={[styles.statLabel, { color: COLORS.textMuted }]}>INCOME</Text>
                        <Text style={[styles.statValue, { color: '#22c55e' }]}>{formatCurrency(data?.stats?.totalIncome || 0)}</Text>
                    </View>
                    <View style={[styles.statCard, { backgroundColor: COLORS.surface }]}>
                        <Text style={[styles.statLabel, { color: COLORS.textMuted }]}>EXPENSE</Text>
                        <Text style={[styles.statValue, { color: '#ef4444' }]}>{formatCurrency(data?.stats?.totalExpenses || 0)}</Text>
                    </View>
                </View>

                <View style={[styles.statCardFull, { backgroundColor: COLORS.surface, marginBottom: spacing.xl }]}>
                    <Text style={[styles.statLabel, { color: COLORS.textMuted }]}>AVERAGE DAILY SPEND</Text>
                    <Text style={[styles.statValue, { color: COLORS.text }]}>{formatCurrency(data?.stats?.avgDaily || 0)}</Text>
                </View>

                {/* Pie Chart */}
                <View style={[styles.card, { backgroundColor: COLORS.surface, alignItems: 'center' }]}>
                    <View style={styles.cardHeader}>
                        <Feather name="pie-chart" size={18} color="#f59e0b" />
                        <Text style={[styles.cardTitle, { color: COLORS.text }]}>Expense Breakdown (This Month)</Text>
                    </View>
                    {data?.pieChartData?.length > 0 ? (
                        <PieChart
                            data={data.pieChartData}
                            width={screenWidth - 60}
                            height={220}
                            chartConfig={{
                                backgroundColor: COLORS.surface,
                                backgroundGradientFrom: COLORS.surface,
                                backgroundGradientTo: COLORS.surface,
                                color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                            }}
                            accessor={"population"}
                            backgroundColor={"transparent"}
                            paddingLeft={"15"}
                            center={[10, 0]}
                            absolute
                        />
                    ) : (
                        <View style={styles.emptyWrap}>
                            <Text style={[styles.emptyText, { color: COLORS.textMuted }]}>No expenses this month yet.</Text>
                        </View>
                    )}
                </View>

                {/* Line Graph */}
                <View style={[styles.card, { backgroundColor: COLORS.surface, overflow: 'hidden' }]}>
                    <View style={styles.cardHeader}>
                        <Feather name="trending-up" size={18} color="#10b981" />
                        <Text style={[styles.cardTitle, { color: COLORS.text }]}>Cash Flow Trends (6 Months)</Text>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <LineChart
                            data={data?.trendData ? {
                                labels: data.trendData.labels,
                                datasets: data.trendData.datasets.map((ds, idx) => ({
                                    ...ds,
                                    color: (opacity = 1) => idx === 0
                                        ? `rgba(239, 68, 68, ${opacity})` // Expense: Red
                                        : `rgba(34, 197, 94, ${opacity})` // Income: Green
                                }))
                            } : { labels: [''], datasets: [{ data: [0] }] }}
                            width={screenWidth * 1.5} // slightly wider for scroll 
                            height={220}
                            chartConfig={{
                                backgroundColor: COLORS.surface,
                                backgroundGradientFrom: COLORS.surface,
                                backgroundGradientTo: COLORS.surface,
                                decimalPlaces: 0,
                                color: (opacity = 1) => COLORS.text,
                                labelColor: (opacity = 1) => COLORS.textMuted,
                                propsForDots: {
                                    r: "5",
                                    strokeWidth: "2",
                                    stroke: COLORS.surface
                                },
                                propsForBackgroundLines: {
                                    strokeDasharray: "4",
                                    stroke: COLORS.border // Softer grid lines
                                },
                                fillShadowGradientFromOpacity: 0,
                                fillShadowGradientToOpacity: 0
                            }}
                            bezier
                            withShadow={false}
                            style={{
                                marginVertical: 8,
                                borderRadius: 16
                            }}
                        />
                    </ScrollView>
                    <View style={styles.legendRow}>
                        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#ef4444' }]} /><Text style={[{ color: COLORS.text }, styles.legendText]}>Expenses</Text></View>
                        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#22c55e' }]} /><Text style={[{ color: COLORS.text }, styles.legendText]}>Income</Text></View>
                    </View>
                </View>

            </ScrollView>
        </SafeAreaView>
    );
}

const getStyles = (COLORS) => StyleSheet.create({
    safe: { flex: 1, backgroundColor: COLORS.background },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md,
    },
    backBtn: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    headerTitle: { fontSize: 18, fontWeight: '800' },
    content: { padding: spacing.lg, paddingBottom: 60 },
    card: {
        borderRadius: radius.xl,
        padding: spacing.md,
        marginBottom: spacing.xl,
        borderWidth: 1, borderColor: 'rgba(0,0,0,0.03)',
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 3
    },
    cardHeader: {
        flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: spacing.md,
        borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)', paddingBottom: spacing.sm
    },
    cardTitle: { fontSize: 13, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
    insightRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
    insightDot: { width: 6, height: 6, borderRadius: 3, marginTop: 8 },
    insightText: { fontSize: 14, lineHeight: 22, fontWeight: '500', fontStyle: 'italic' },
    statsRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
    statCard: { flex: 1, borderRadius: radius.xl, padding: spacing.md, borderWidth: 1, borderColor: 'rgba(0,0,0,0.03)' },
    statCardFull: { width: '100%', borderRadius: radius.xl, padding: spacing.md, borderWidth: 1, borderColor: 'rgba(0,0,0,0.03)' },
    statLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 4 },
    statValue: { fontSize: 18, fontWeight: '800' },
    emptyWrap: { height: 150, justifyContent: 'center', alignItems: 'center' },
    emptyText: { fontSize: 13 },
    legendRow: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 8 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendDot: { width: 10, height: 10, borderRadius: 5 },
    legendText: { fontSize: 12, fontWeight: '600' }
});
