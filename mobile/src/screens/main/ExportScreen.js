import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    ActivityIndicator,
    Alert,
    Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { spacing, radius } from '../../theme/colors';
import { exportTransactions, getCategories, getTransactions } from '../../api/api';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import Toast from 'react-native-toast-message';
import { IconRenderer } from '../../utils/formatters';
import CustomAlertModal from '../../components/CustomAlertModal';
import { useAuth } from '../../context/AuthContext';

export default function ExportScreen({ navigation }) {
    const COLORS = useTheme(state => state.COLORS);
    const { userInfo } = useAuth();
    const [loading, setLoading] = useState(false);
    const [alert, setAlert] = useState({ visible: false, title: '', message: '', type: 'info' });

    // Filters
    const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    const [endDate, setEndDate] = useState(new Date());
    const [showStartPicker, setShowStartPicker] = useState(false);
    const [showEndPicker, setShowEndPicker] = useState(false);
    const [type, setType] = useState('all'); // all, income, expense
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [categories, setCategories] = useState([]);
    const [exportFormat, setExportFormat] = useState('csv');

    React.useEffect(() => {
        const fetchCats = async () => {
            try {
                const res = await getCategories();
                if (res?.categories) {
                    setCategories(res.categories);
                }
            } catch (err) {
                console.error('[EXPORT] Failed to fetch categories:', err);
            }
        };
        fetchCats();
    }, []);

    const handleExport = async () => {
        setLoading(true);
        try {
            const params = {
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString(),
            };
            if (type !== 'all') params.type = type;
            if (selectedCategory !== 'all') params.category = selectedCategory;

            let fileUri = '';

            if (exportFormat === 'csv') {
                const response = await exportTransactions(params);
                const csvData = response.data;
                const filename = `otter_export_${new Date().getTime()}.csv`;
                fileUri = FileSystem.documentDirectory + filename;

                let textData = '';
                if (typeof csvData === 'string') {
                    textData = csvData;
                } else {
                    textData = await new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.readAsText(csvData);
                    });
                }

                await FileSystem.writeAsStringAsync(fileUri, textData, {
                    encoding: 'utf8',
                });
            } else {
                // PDF Export logic
                const txRes = await getTransactions(params);
                const transactions = txRes.transactions || txRes || [];
                
                const html = generateHTML(transactions, {
                    startDate: startDate.toLocaleDateString(),
                    endDate: endDate.toLocaleDateString(),
                    type,
                    category: selectedCategory,
                    user: userInfo?.name || 'Otter User'
                });

                const { uri } = await Print.printToFileAsync({ html });
                fileUri = uri;
            }

            // Share the file
            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(fileUri, {
                    mimeType: exportFormat === 'csv' ? 'text/csv' : 'application/pdf',
                    dialogTitle: `Export Transactions (${exportFormat.toUpperCase()})`,
                    UTI: exportFormat === 'csv' ? 'public.comma-separated-values-text' : 'com.adobe.pdf',
                });
            } else {
                Alert.alert('Sharing not available', 'The file has been saved to your device, but sharing is not supported.');
            }

            // Close loading before showing success alert
            setLoading(false);
            setAlert({
                visible: true,
                type: 'success',
                title: 'Export Complete 🦦',
                message: 'Your transactions have been exported successfully.',
            });

        } catch (err) {
            setLoading(false);
            console.error('[EXPORT] Error:', err);
            setAlert({
                visible: true,
                type: 'error',
                title: 'Export Failed',
                message: err.response?.data?.error || 'Something went wrong while generating the export.',
            });
        } finally {
            setLoading(false);
        }
    };

    const renderDatePicker = (currentDate, onChange, show, setShow) => {
        if (!show) return null;
        return (
            <DateTimePicker
                value={currentDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(event, selectedDate) => {
                    setShow(false);
                    if (selectedDate) onChange(selectedDate);
                }}
            />
        );
    };

    return (
        <SafeAreaView style={[styles.safe, { backgroundColor: COLORS.background }]}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backBtn, { backgroundColor: COLORS.surface }]}>
                    <Feather name="arrow-left" size={20} color={COLORS.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: COLORS.text }]}>Export Data</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                <View style={[styles.card, { backgroundColor: COLORS.surface }]}>
                    <View style={styles.cardHeader}>
                        <View style={[styles.iconBox, { backgroundColor: '#3b82f620' }]}>
                            <Feather name="download" size={24} color="#3b82f6" />
                        </View>
                        <View>
                            <Text style={[styles.cardTitle, { color: COLORS.text }]}>Transaction Export</Text>
                            <Text style={[styles.cardSub, { color: COLORS.textMuted }]}>Download your history as a CSV file</Text>
                        </View>
                    </View>

                    <View style={styles.divider} />

                    {/* Date Range */}
                    <Text style={[styles.label, { color: COLORS.textMuted }]}>DATE RANGE</Text>
                    <View style={styles.row}>
                        <TouchableOpacity
                            style={[styles.dateInput, { backgroundColor: COLORS.background }]}
                            onPress={() => setShowStartPicker(true)}
                        >
                            <Feather name="calendar" size={16} color={COLORS.textMuted} />
                            <Text style={[styles.dateText, { color: COLORS.text }]}>{startDate.toLocaleDateString()}</Text>
                        </TouchableOpacity>
                        <View style={styles.arrowIcon}>
                            <Feather name="arrow-right" size={16} color={COLORS.textMuted} />
                        </View>
                        <TouchableOpacity
                            style={[styles.dateInput, { backgroundColor: COLORS.background }]}
                            onPress={() => setShowEndPicker(true)}
                        >
                            <Feather name="calendar" size={16} color={COLORS.textMuted} />
                            <Text style={[styles.dateText, { color: COLORS.text }]}>{endDate.toLocaleDateString()}</Text>
                        </TouchableOpacity>
                    </View>

                    {renderDatePicker(startDate, setStartDate, showStartPicker, setShowStartPicker)}
                    {renderDatePicker(endDate, setEndDate, showEndPicker, setShowEndPicker)}

                    {/* Transaction Type */}
                    <Text style={[styles.label, { color: COLORS.textMuted, marginTop: spacing.lg }]}>TRANSACTION TYPE</Text>
                    <View style={styles.typeRow}>
                        {['all', 'income', 'expense'].map((t) => (
                            <TouchableOpacity
                                key={t}
                                style={[
                                    styles.typeBtn,
                                    { backgroundColor: type === t ? '#3b82f6' : COLORS.background }
                                ]}
                                onPress={() => setType(t)}
                            >
                                <Text style={[
                                    styles.typeBtnText,
                                    { color: type === t ? '#fff' : COLORS.text }
                                ]}>
                                    {t.toUpperCase()}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* Category Filter */}
                    <Text style={[styles.label, { color: COLORS.textMuted, marginTop: spacing.lg }]}>CATEGORY</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 5 }}>
                        <TouchableOpacity
                            style={[
                                styles.catChip,
                                { backgroundColor: selectedCategory === 'all' ? '#3b82f6' : COLORS.background }
                            ]}
                            onPress={() => setSelectedCategory('all')}
                        >
                            <Feather name="layers" size={14} color={selectedCategory === 'all' ? '#fff' : COLORS.textMuted} />
                            <Text style={[styles.catChipText, { color: selectedCategory === 'all' ? '#fff' : COLORS.text }]}>ALL</Text>
                        </TouchableOpacity>

                        {categories.map((cat) => (
                            <TouchableOpacity
                                key={cat._id}
                                style={[
                                    styles.catChip,
                                    { backgroundColor: selectedCategory === cat.name ? cat.color || '#3b82f6' : COLORS.background }
                                ]}
                                onPress={() => setSelectedCategory(cat.name)}
                            >
                                <IconRenderer
                                    name={cat.icon || 'tag'}
                                    size={14}
                                    color={selectedCategory === cat.name ? '#fff' : cat.color || COLORS.textMuted}
                                />
                                <Text style={[
                                    styles.catChipText,
                                    { color: selectedCategory === cat.name ? '#fff' : COLORS.text }
                                ]}>
                                    {cat.name.toUpperCase()}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>

                    {/* Format Selector */}
                    <Text style={[styles.label, { color: COLORS.textMuted, marginTop: spacing.lg }]}>EXPORT FORMAT</Text>
                    <View style={styles.formatRow}>
                        <TouchableOpacity
                            style={[
                                styles.formatBtn,
                                { borderColor: exportFormat === 'csv' ? '#3b82f6' : COLORS.border, borderWidth: 1 }
                            ]}
                            onPress={() => setExportFormat('csv')}
                        >
                            <IconRenderer name="file-csv" size={24} color={exportFormat === 'csv' ? '#3b82f6' : COLORS.textMuted} />
                            <Text style={[styles.formatText, { color: exportFormat === 'csv' ? '#3b82f6' : COLORS.text }]}>CSV Spreadsheet</Text>
                            {exportFormat === 'csv' && <Feather name="check-circle" size={16} color="#3b82f6" style={styles.checkIcon} />}
                        </TouchableOpacity>

                        <TouchableOpacity 
                            style={[
                                styles.formatBtn, 
                                { borderColor: exportFormat === 'pdf' ? '#ef4444' : COLORS.border, borderWidth: 1 }
                            ]}
                            onPress={() => setExportFormat('pdf')}
                        >
                            <IconRenderer name="file-pdf-box" size={24} color={exportFormat === 'pdf' ? '#ef4444' : COLORS.textMuted} />
                            <Text style={[styles.formatText, { color: COLORS.text }]}>PDF Report</Text>
                            {exportFormat === 'pdf' && <Feather name="check-circle" size={16} color="#ef4444" style={styles.checkIcon} />}
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                        style={[styles.exportBtn, { backgroundColor: '#3b82f6' }]}
                        onPress={handleExport}
                        disabled={loading}
                    >
                        {loading ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <>
                                <Feather name="share-2" size={20} color="#fff" style={{ marginRight: 10 }} />
                                <Text style={styles.exportBtnText}>Generate & Share</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>

                {/* Pro Tip */}
                <View style={[styles.tipCard, { backgroundColor: '#3b82f610' }]}>
                    <Feather name="info" size={20} color="#3b82f6" />
                    <Text style={[styles.tipText, { color: '#3b82f6' }]}>
                        Pro Tip: You can open CSV files in Google Sheets, Excel, or Numbers to create custom charts and reports.
                    </Text>
                </View>
            </ScrollView>

            <CustomAlertModal
                visible={alert.visible}
                title={alert.title}
                message={alert.message}
                type={alert.type}
                onClose={() => setAlert({ ...alert, visible: false })}
            />
        </SafeAreaView>
    );
}

const generateHTML = (transactions, info) => {
    const totalIncome = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const totalExpense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const net = totalIncome - totalExpense;

    const rows = transactions.map(t => `
        <tr>
            <td>${new Date(t.date).toLocaleDateString()}</td>
            <td>${t.category}</td>
            <td>${t.note || '-'}</td>
            <td style="color: ${t.type === 'income' ? '#22c55e' : '#ef4444'}; text-align: right;">
                ${t.type === 'income' ? '+' : '-'}₱${t.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </td>
        </tr>
    `).join('');

    return `
        <html>
            <head>
                <style>
                    body { font-family: 'Helvetica', 'Arial', sans-serif; padding: 40px; color: #1e293b; }
                    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #3b82f6; padding-bottom: 20px; margin-bottom: 30px; }
                    .logo { font-size: 28px; font-weight: 800; color: #3b82f6; }
                    .report-info { text-align: right; font-size: 12px; color: #64748b; }
                    .title { font-size: 24px; font-weight: 700; margin-bottom: 10px; }
                    .summary { display: flex; gap: 20px; margin-bottom: 40px; }
                    .summary-card { flex: 1; padding: 20px; border-radius: 12px; background: #f8fafc; border: 1px solid #e2e8f0; }
                    .summary-label { font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; margin-bottom: 5px; }
                    .summary-value { font-size: 18px; font-weight: 700; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th { text-align: left; padding: 12px; border-bottom: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-transform: uppercase; }
                    td { padding: 12px; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
                    .footer { margin-top: 50px; text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 20px; }
                </style>
            </head>
            <body>
                <div class="header">
                    <div class="logo">Otter Finance 🦦</div>
                    <div class="report-info">
                        <div>Generated for: <b>${info.user}</b></div>
                        <div>Range: ${info.startDate} - ${info.endDate}</div>
                        <div>Filter: ${info.type.toUpperCase()} / ${info.category.toUpperCase()}</div>
                    </div>
                </div>

                <div class="title">Financial Transaction Report</div>
                
                <div class="summary">
                    <div class="summary-card">
                        <div class="summary-label">Total Income</div>
                        <div class="summary-value" style="color: #22c55e;">₱${totalIncome.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                    </div>
                    <div class="summary-card">
                        <div class="summary-label">Total Expenses</div>
                        <div class="summary-value" style="color: #ef4444;">₱${totalExpense.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                    </div>
                    <div class="summary-card" style="background: #3b82f610; border-color: #3b82f640;">
                        <div class="summary-label">Net Balance</div>
                        <div class="summary-value" style="color: #3b82f6;">₱${net.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                    </div>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Category</th>
                            <th>Notes</th>
                            <th style="text-align: right;">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>

                <div class="footer">
                    This report was automatically generated by Otter Finance. Keep tracking, keep saving! 🦦✨
                </div>
            </body>
        </html>
    `;
};

const styles = StyleSheet.create({
    safe: { flex: 1 },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: spacing.lg, paddingVertical: spacing.md
    },
    backBtn: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    headerTitle: { fontSize: 18, fontWeight: '800' },
    content: { padding: spacing.lg },
    card: {
        borderRadius: radius.xl,
        padding: spacing.lg,
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 5
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
    iconBox: { width: 50, height: 50, borderRadius: 15, justifyContent: 'center', alignItems: 'center', marginRight: spacing.md },
    cardTitle: { fontSize: 18, fontWeight: '800' },
    cardSub: { fontSize: 13, marginTop: 2 },
    divider: { height: 1, width: '100%', backgroundColor: '#eee', marginVertical: spacing.md, opacity: 0.5 },
    label: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: spacing.sm },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    dateInput: {
        flex: 1, flexDirection: 'row', alignItems: 'center',
        padding: spacing.md, borderRadius: radius.md,
    },
    dateText: { marginLeft: spacing.sm, fontWeight: '600', fontSize: 14 },
    arrowIcon: { paddingHorizontal: spacing.sm },
    typeRow: { flexDirection: 'row', justifyContent: 'space-between' },
    typeBtn: {
        flex: 1, paddingVertical: spacing.md,
        borderRadius: radius.md, alignItems: 'center',
        marginHorizontal: 4
    },
    typeBtnText: { fontSize: 12, fontWeight: '800' },
    catChip: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: spacing.md, paddingVertical: 10,
        borderRadius: radius.full, marginRight: 8, gap: 8
    },
    catChipText: { fontSize: 10, fontWeight: '800' },
    formatRow: { marginTop: spacing.sm },
    formatBtn: {
        flexDirection: 'row', alignItems: 'center',
        padding: spacing.md, borderRadius: radius.lg,
        marginBottom: spacing.sm
    },
    formatText: { marginLeft: spacing.md, fontWeight: '600', flex: 1 },
    checkIcon: { marginLeft: spacing.sm },
    exportBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        height: 56, borderRadius: radius.lg, marginTop: spacing.xl,
        shadowColor: '#3b82f6', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4
    },
    exportBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
    tipCard: {
        flexDirection: 'row', padding: spacing.lg, borderRadius: radius.lg,
        marginTop: spacing.xl, alignItems: 'center'
    },
    tipText: { flex: 1, marginLeft: spacing.md, fontSize: 13, lineHeight: 18, fontWeight: '500' }
});
