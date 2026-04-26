import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, RefreshControl,
    ActivityIndicator, TouchableOpacity, Alert, Platform, Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { getAnalytics } from '../../api/api';
import { PieChart, LineChart } from 'react-native-chart-kit';
import { Dimensions } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
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
    const [chartLoading, setChartLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [range, setRange] = useState('THIS_MONTH');
    const [trendYear, setTrendYear] = useState(new Date().getFullYear());
    const [showYearPicker, setShowYearPicker] = useState(false);

    // Custom Date Range State
    const [startDate, setStartDate] = useState(new Date(new Date().setMonth(new Date().getMonth() - 1)));
    const [endDate, setEndDate] = useState(new Date());
    const [showStartDatePicker, setShowStartDatePicker] = useState(false);
    const [showEndDatePicker, setShowEndDatePicker] = useState(false);

    const loadData = useCallback(async () => {
        setChartLoading(true);
        try {
            const params = { range, trendYear };
            if (range === 'CUSTOM') {
                params.startDate = startDate.toISOString();
                params.endDate = endDate.toISOString();
            }
            const res = await getAnalytics(params);
            setData(res);
        } catch (e) {
            console.warn('[Analytics] Load error:', e);
        } finally {
            setLoading(false);
            setChartLoading(false);
            setRefreshing(false);
        }
    }, [range, trendYear, startDate, endDate]);

    useEffect(() => { loadData(); }, [loadData]);

    const formatCurrency = (amount) =>
        new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);

    const DonutChartCard = ({ title, subtitle, data }) => {
        const total = data?.reduce((sum, item) => sum + item.population, 0) || 0;
        const highest = data?.reduce((max, item) => (item.population > max.population ? item : max), data?.[0]);
        const highestPercent = highest && total > 0 ? Math.round((highest.population / total) * 100) : 0;

        return (
            <View style={[styles.card, { backgroundColor: COLORS.surface, paddingVertical: 24, paddingHorizontal: 20 }]}>
                <View style={{ marginBottom: 20 }}>
                    <Text style={{ fontSize: 18, fontWeight: 'bold', color: COLORS.text }}>{title}</Text>
                    <Text style={{ fontSize: 13, color: COLORS.textMuted, marginTop: 4 }}>{subtitle}</Text>
                </View>

                {data?.length > 0 ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        {/* Donut Chart Container */}
                        <View style={{ width: 150, height: 150, justifyContent: 'center', alignItems: 'center' }}>
                            <PieChart
                                data={data}
                                width={180}
                                height={180}
                                chartConfig={{ color: () => '#000' }}
                                accessor={"population"}
                                backgroundColor={"transparent"}
                                paddingLeft={"45"}
                                center={[0, 0]}
                                hasLegend={false}
                                absolute
                            />
                            {/* Inner Circle to make it a Donut - Made larger for thinner ring */}
                            <View style={{
                                position: 'absolute',
                                width: 100,
                                height: 100,
                                borderRadius: 50,
                                backgroundColor: COLORS.surface,
                                justifyContent: 'center',
                                alignItems: 'center',
                                borderWeight: 0,
                                shadowColor: '#000',
                                shadowOffset: { width: 0, height: 4 },
                                shadowOpacity: 0.05,
                                shadowRadius: 8,
                                elevation: 1
                            }}>
                                <Text style={{ fontSize: 26, fontWeight: '900', color: COLORS.text }}>{highestPercent}%</Text>
                                <Text style={{ fontSize: 11, color: COLORS.textMuted, textAlign: 'center', fontWeight: '500', marginTop: -2 }} numberOfLines={1}>{highest?.name}</Text>
                            </View>
                        </View>

                        {/* Scrollable Legend */}
                        <View style={{ flex: 1, height: 140, marginLeft: 20 }}>
                            <ScrollView showsVerticalScrollIndicator={false} nestedScrollEnabled>
                                {data.map((item, idx) => (
                                    <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 4 }}>
                                            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: item.color, marginRight: 10 }} />
                                            <Text style={{ color: COLORS.text, fontSize: 13, fontWeight: '500' }} numberOfLines={1}>{item.name}</Text>
                                        </View>
                                        <Text style={{ color: COLORS.text, fontSize: 13, fontWeight: 'bold' }}>
                                            {formatCurrency(item.population)}
                                        </Text>
                                    </View>
                                ))}
                            </ScrollView>
                        </View>
                    </View>
                ) : (
                    <View style={styles.emptyWrap}>
                        <Text style={[styles.emptyText, { color: COLORS.textMuted }]}>No data available for this month.</Text>
                    </View>
                )}
            </View>
        );
    };

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
                {/* Date Range Selector */}
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.filterBar}
                    contentContainerStyle={styles.filterContent}
                >
                    {[
                        { label: '7D', value: '7D' },
                        { label: '30D', value: '30D' },
                        { label: 'Month', value: 'THIS_MONTH' },
                        { label: 'Year', value: 'THIS_YEAR' },
                        { label: 'All', value: 'ALL_TIME' },
                        { label: 'Custom', value: 'CUSTOM' },
                    ].map((item) => (
                        <TouchableOpacity
                            key={item.value}
                            onPress={() => setRange(item.value)}
                            style={[
                                styles.filterChip,
                                { backgroundColor: range === item.value ? COLORS.primary : COLORS.surface }
                            ]}
                        >
                            <Text style={[
                                styles.filterText,
                                { color: range === item.value ? '#fff' : COLORS.textMuted }
                            ]}>
                                {item.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>

                {/* Custom Date Pickers */}
                {range === 'CUSTOM' && (
                    <View style={{ flexDirection: 'row', gap: 12, marginBottom: spacing.lg }}>
                        <TouchableOpacity
                            style={[styles.customDateCard, { backgroundColor: COLORS.surface }]}
                            onPress={() => setShowStartDatePicker(true)}
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Feather name="calendar" size={14} color={COLORS.textMuted} />
                                <Text style={{ fontSize: 10, color: COLORS.textMuted, fontWeight: '800' }}>START</Text>
                            </View>
                            <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.text, marginTop: 4 }}>
                                {startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.customDateCard, { backgroundColor: COLORS.surface }]}
                            onPress={() => setShowEndDatePicker(true)}
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Feather name="calendar" size={14} color={COLORS.textMuted} />
                                <Text style={{ fontSize: 10, color: COLORS.textMuted, fontWeight: '800' }}>END</Text>
                            </View>
                            <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.text, marginTop: 4 }}>
                                {endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </Text>
                        </TouchableOpacity>
                    </View>
                )}
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

                {/* Stats Summary — updates with filter */}
                {chartLoading ? (
                    <View style={{ alignItems: 'center', paddingVertical: 20, marginBottom: spacing.md }}>
                        <ActivityIndicator size="small" color={COLORS.primary} />
                        <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 8 }}>Updating data…</Text>
                    </View>
                ) : (
                    <>
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

                        <View style={[styles.statsRow, { marginBottom: spacing.xl }]}>
                            <View style={[styles.statCard, { backgroundColor: COLORS.surface }]}>
                                <Text style={[styles.statLabel, { color: COLORS.textMuted }]}>NET FLOW</Text>
                                <Text style={[styles.statValue, {
                                    color: (data?.stats?.totalIncome || 0) - (data?.stats?.totalExpenses || 0) >= 0 ? '#22c55e' : '#ef4444'
                                }]}>
                                    {formatCurrency((data?.stats?.totalIncome || 0) - (data?.stats?.totalExpenses || 0))}
                                </Text>
                            </View>
                            <View style={[styles.statCard, { backgroundColor: COLORS.surface }]}>
                                <Text style={[styles.statLabel, { color: COLORS.textMuted }]}>AVG DAILY SPEND</Text>
                                <Text style={[styles.statValue, { color: COLORS.text }]}>{formatCurrency(data?.stats?.avgDaily || 0)}</Text>
                            </View>
                        </View>
                    </>
                )}

                {/* Expense Donut Chart */}
                <DonutChartCard
                    title="Expense distribution"
                    subtitle={`How your spending splits across categories (${range === '7D' ? 'Last 7 Days' :
                        range === '30D' ? 'Last 30 Days' :
                            range === 'THIS_MONTH' ? 'This Month' :
                                range === 'THIS_YEAR' ? 'This Year' : 'All Time'
                        })`}
                    data={data?.pieChartData || []}
                />

                {/* Income Donut Chart */}
                <DonutChartCard
                    title="Income distribution"
                    subtitle={`How your income splits across sources (${range === '7D' ? 'Last 7 Days' :
                        range === '30D' ? 'Last 30 Days' :
                            range === 'THIS_MONTH' ? 'This Month' :
                                range === 'THIS_YEAR' ? 'This Year' : 'All Time'
                        })`}
                    data={data?.incomePieChartData || []}
                />

                {/* Line Graph — Full Year */}
                <View style={[styles.card, { backgroundColor: COLORS.surface, overflow: 'hidden' }]}>
                    {/* Header with year picker */}
                    <View style={[styles.cardHeader, { justifyContent: 'space-between' }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Feather name="trending-up" size={18} color="#10b981" />
                            <Text style={[styles.cardTitle, { color: COLORS.text }]}>CASH FLOW TRENDS</Text>
                        </View>
                        <TouchableOpacity
                            onPress={() => setShowYearPicker(true)}
                            style={styles.yearBtn}
                        >
                            <Feather name="calendar" size={13} color={COLORS.primary} />
                            <Text style={[styles.yearBtnText, { color: COLORS.primary }]}>{trendYear}</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Custom Year Picker Modal */}
                    <Modal visible={showYearPicker} transparent animationType="fade">
                        <View style={styles.pickerOverlay}>
                            <View style={[styles.pickerBox, { backgroundColor: COLORS.surface, width: '80%', padding: 0 }]}>
                                <View style={{ padding: 20, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
                                    <Text style={[styles.pickerTitle, { color: COLORS.text, marginBottom: 0 }]}>Select Year</Text>
                                </View>
                                <ScrollView style={{ maxHeight: 250 }}>
                                    {[...Array(11)].map((_, i) => {
                                        const y = new Date().getFullYear() - 5 + i;
                                        return (
                                            <TouchableOpacity
                                                key={y}
                                                style={{ paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border, alignItems: 'center', backgroundColor: trendYear === y ? 'rgba(233,30,140,0.05)' : 'transparent' }}
                                                onPress={() => {
                                                    setTrendYear(y);
                                                    setShowYearPicker(false);
                                                }}
                                            >
                                                <Text style={{ fontSize: 16, fontWeight: trendYear === y ? 'bold' : '500', color: trendYear === y ? COLORS.primary : COLORS.text }}>
                                                    {y}
                                                </Text>
                                            </TouchableOpacity>
                                        )
                                    })}
                                </ScrollView>
                                <TouchableOpacity
                                    style={{ paddingVertical: 16, alignItems: 'center' }}
                                    onPress={() => setShowYearPicker(false)}
                                >
                                    <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textMuted }}>CANCEL</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </Modal>

                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <LineChart
                            data={data?.trendData ? {
                                labels: data.trendData.labels,
                                datasets: data.trendData.datasets.map((ds, idx) => ({
                                    ...ds,
                                    color: (opacity = 1) => idx === 0
                                        ? `rgba(239, 68, 68, ${opacity})`
                                        : `rgba(34, 197, 94, ${opacity})`
                                }))
                            } : { labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], datasets: [{ data: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, { data: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }] }}
                            width={screenWidth * 2.4}
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
                                    stroke: COLORS.border
                                },
                                fillShadowGradientFromOpacity: 0,
                                fillShadowGradientToOpacity: 0
                            }}
                            bezier
                            withShadow={false}
                            style={{ marginVertical: 8, borderRadius: 16 }}
                        />
                    </ScrollView>
                    <View style={styles.legendRow}>
                        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#ef4444' }]} /><Text style={[{ color: COLORS.text }, styles.legendText]}>Expenses</Text></View>
                        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#22c55e' }]} /><Text style={[{ color: COLORS.text }, styles.legendText]}>Income</Text></View>
                    </View>
                </View>

            </ScrollView>

            {/* DateTime Pickers for Custom Range */}
            {showStartDatePicker && (
                <DateTimePicker
                    value={startDate}
                    mode="date"
                    display="default"
                    onChange={(e, d) => {
                        setShowStartDatePicker(false);
                        if (d) setStartDate(d);
                    }}
                    maximumDate={endDate}
                />
            )}
            {showEndDatePicker && (
                <DateTimePicker
                    value={endDate}
                    mode="date"
                    display="default"
                    onChange={(e, d) => {
                        setShowEndDatePicker(false);
                        if (d) setEndDate(d);
                    }}
                    minimumDate={startDate}
                    maximumDate={new Date()}
                />
            )}

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
    legendText: { fontSize: 12, fontWeight: '600' },
    filterBar: { marginBottom: spacing.lg, marginHorizontal: -spacing.lg },
    filterContent: { paddingHorizontal: spacing.lg, gap: 10 },
    filterChip: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.05)',
        minWidth: 70,
        alignItems: 'center'
    },
    filterText: { fontSize: 13, fontWeight: '700' },
    customDateCard: {
        flex: 1, padding: 12, borderRadius: 16,
        borderWidth: 1, borderColor: 'rgba(0,0,0,0.03)',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1
    },
    yearBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        paddingHorizontal: 12, paddingVertical: 5,
        borderRadius: 20, borderWidth: 1.5,
        borderColor: 'rgba(233,30,140,0.25)',
        backgroundColor: 'rgba(233,30,140,0.05)'
    },
    yearBtnText: { fontSize: 13, fontWeight: '800' },
    pickerOverlay: {
        flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center', alignItems: 'center'
    },
    pickerBox: {
        width: '85%', borderRadius: 20, padding: 24,
        shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15, shadowRadius: 20, elevation: 10
    },
    pickerTitle: { fontSize: 17, fontWeight: '800', marginBottom: 16, textAlign: 'center' },
    pickerBtn: {
        flex: 1, paddingVertical: 12, borderRadius: 12,
        alignItems: 'center', justifyContent: 'center'
    }
});
