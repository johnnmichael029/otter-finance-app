import React, { useState } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, TextInput,
    ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
    Modal, TouchableWithoutFeedback, Keyboard, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../context/ThemeContext';
import { radius, spacing } from '../../theme/colors';
import { createTransaction, getTransactions } from '../../api/api';
import CustomAlertModal from '../../components/CustomAlertModal';

const CATEGORIES = {
    income: [
        { label: 'Salary', icon: 'briefcase', color: '#22c55e' },
        { label: 'Freelance', icon: 'code', color: '#3b82f6' },
        { label: 'Investment', icon: 'trending-up', color: '#8b5cf6' },
        { label: 'Gift', icon: 'gift', color: '#f59e0b' },
        { label: 'Other', icon: 'plus-circle', color: '#6b7280' },
    ],
    expense: [
        { label: 'Food', icon: 'coffee', color: '#f59e0b' },
        { label: 'Transport', icon: 'truck', color: '#3b82f6' },
        { label: 'Shopping', icon: 'shopping-bag', color: '#ec4899' },
        { label: 'Bills', icon: 'file-text', color: '#ef4444' },
        { label: 'Health', icon: 'heart', color: '#22c55e' },
        { label: 'Entertainment', icon: 'tv', color: '#8b5cf6' },
        { label: 'Other', icon: 'more-horizontal', color: '#6b7280' },
    ],
};

const EXTRA_ICONS = [
    'tag', 'book', 'camera', 'headphones', 'monitor', 'smartphone',
    'speaker', 'tv', 'watch', 'wifi', 'anchor', 'award', 'box',
    'cloud', 'compass', 'cpu', 'database', 'droplet', 'feather',
    'flag', 'globe', 'home', 'image', 'key', 'layers', 'map',
    'mic', 'moon', 'music', 'package', 'paperclip', 'pen-tool',
    'phone', 'printer', 'radio', 'scissors', 'shield', 'star',
    'sun', 'tool', 'trash', 'umbrella', 'unlock', 'user', 'video',
    'smile', 'heart', 'briefcase', 'coffee', 'truck', 'shopping-bag', 'file-text'
];


export default function AddTransactionScreen({ navigation, route }) {
    const { type = 'expense', prefillData = null } = route.params || {};
    const { COLORS } = useTheme();

    const [amount, setAmount] = useState(prefillData?.price ? String(prefillData.price) : '');
    const [note, setNote] = useState(prefillData?.name || '');
    const [category, setCategory] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [alert, setAlert] = useState({ visible: false, type: 'info', title: '', message: '' });

    const [customCatModalVisible, setCustomCatModalVisible] = useState(false);
    const [customCatName, setCustomCatName] = useState('Tag');
    const [customCatIcon, setCustomCatIcon] = useState('tag');

    const formatIconName = (name) => {
        return name.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    };

    const handleIconSelect = (iconName) => {
        // Auto-fill the name if the user hasn't typed a custom one yet
        if (!customCatName || customCatName === formatIconName(customCatIcon)) {
            setCustomCatName(formatIconName(iconName));
        }
        setCustomCatIcon(iconName);
    };

    const showAlert = (type, title, message, onConfirm = null) => setAlert({ visible: true, type, title, message, onConfirm });
    const closeAlert = () => setAlert(a => ({ ...a, visible: false }));

    const [frequentTxs, setFrequentTxs] = useState([]);

    React.useEffect(() => {
        const fetchTemplates = async () => {
            try {
                const res = await getTransactions({ type, limit: 20 });
                if (res?.transactions) {
                    // Extract unique combos of category, amount, and note
                    const unique = [];
                    const seen = new Set();
                    for (const tx of res.transactions) {
                        const key = `${tx.category}-${tx.amount}-${tx.note || ''}`;
                        if (!seen.has(key)) {
                            seen.add(key);
                            unique.push(tx);
                        }
                    }
                    setFrequentTxs(unique.slice(0, 5));
                }
            } catch (e) {
                console.warn('Failed to load templates:', e.message);
            }
        };
        fetchTemplates();
    }, [type]);

    const handleQuickAdd = (template) => {
        showAlert(
            'confirm',
            `Quick Add ${template.category}?`,
            `Do you want to instantly log ₱${template.amount} for ${template.note || template.category}?`,
            async () => {
                setIsLoading(true);
                try {
                    await createTransaction({
                        type,
                        amount: template.amount,
                        category: template.category,
                        categoryIcon: template.categoryIcon,
                        categoryColor: template.categoryColor,
                        note: template.note || '',
                        date: new Date().toISOString(),
                    });
                    showAlert('success', 'Logged Successfully', `Quick added ${template.category}.`);
                } catch (err) {
                    showAlert('error', 'Error', 'Failed to quick add.');
                } finally {
                    setIsLoading(false);
                }
            }
        );
    };

    const isIncome = type === 'income';
    const cats = CATEGORIES[type];
    const accentColor = isIncome ? '#22c55e' : '#ef4444';
    const gradientColors = isIncome ? ['#22c55e', '#16a34a'] : ['#ef4444', '#b91c1c'];

    const handleSubmit = async () => {
        if (!amount || isNaN(parseFloat(amount))) {
            return showAlert('warning', 'Missing Amount', 'Please enter a valid amount.');
        }
        if (!category) {
            return showAlert('warning', 'No Category', 'Please select a category for this transaction.');
        }
        setIsLoading(true);
        try {
            await createTransaction({
                type,
                amount: parseFloat(amount),
                category: category.label,
                categoryIcon: category.icon,
                categoryColor: category.color,
                note,
                date: new Date().toISOString(),
            });
            showAlert('success', isIncome ? 'Income Added!' : 'Expense Logged!',
                `₱${parseFloat(amount).toFixed(2)} has been recorded under ${category.label}.`
            );
        } catch (err) {
            showAlert('error', 'Failed', err?.response?.data?.message || 'Something went wrong. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSaveCustomCategory = () => {
        if (!customCatName.trim()) {
            return showAlert('warning', 'Missing Name', 'Please enter a name for your custom category.');
        }
        const newCat = {
            label: customCatName.trim(),
            icon: customCatIcon,
            color: accentColor // Give it the income/expense accent color automatically
        };
        setCategory(newCat);
        setCustomCatModalVisible(false);
    };

    // Inject custom category into the list if it's set and not "Other"
    const displayCats = [...cats];
    if (category && !cats.find(c => c.label === category.label) && category.label !== 'Other') {
        // Insert right before 'Other'
        displayCats.splice(displayCats.length - 1, 0, category);
    }

    return (
        <SafeAreaView style={[styles.safe, { backgroundColor: COLORS.background }]}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

                    {/* Header */}
                    <View style={styles.header}>
                        <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backBtn, { backgroundColor: COLORS.surface }]}>
                            <Feather name="arrow-left" size={20} color={COLORS.text} />
                        </TouchableOpacity>
                        <View>
                            <Text style={[styles.headerTitle, { color: COLORS.text }]}>
                                {isIncome ? 'Add Income' : 'Add Expense'}
                            </Text>
                            <Text style={[styles.headerSub, { color: COLORS.textMuted }]}>
                                {isIncome ? 'Record your earnings' : 'Log your spending'}
                            </Text>
                        </View>
                        <View style={[styles.typeTag, { backgroundColor: accentColor + '20' }]}>
                            <Feather name={isIncome ? 'trending-up' : 'trending-down'} size={16} color={accentColor} />
                        </View>
                    </View>

                    {/* Quick Add Templates */}
                    {frequentTxs.length > 0 && (
                        <View style={{ marginBottom: spacing.md }}>
                            <Text style={[styles.sectionTitle, { color: COLORS.textMuted }]}>RECENT / QUICK ADD</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                                {frequentTxs.map(tx => (
                                    <TouchableOpacity 
                                        key={tx._id} 
                                        onPress={() => handleQuickAdd(tx)}
                                        style={[styles.templateChip, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
                                    >
                                        <View style={[styles.templateIcon, { backgroundColor: (tx.categoryColor || accentColor) + '20' }]}>
                                            <Feather name={tx.categoryIcon || 'tag'} size={14} color={tx.categoryColor || accentColor} />
                                        </View>
                                        <View>
                                            <Text style={[styles.templateCat, { color: COLORS.text }]}>{tx.category}</Text>
                                            <Text style={[styles.templateAmt, { color: accentColor }]}>₱{tx.amount} {tx.note ? `· ${tx.note.substring(0, 10)}` : ''}</Text>
                                        </View>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>
                    )}

                    {/* Amount Card */}
                    <View style={[styles.amountCard, { backgroundColor: COLORS.surface }]}>
                        <Text style={[styles.amountLabel, { color: COLORS.textMuted }]}>AMOUNT</Text>
                        <View style={styles.amountRow}>
                            <Text style={[styles.currency, { color: accentColor }]}>₱</Text>
                            <TextInput
                                style={[styles.amountInput, { color: COLORS.text }]}
                                value={amount}
                                onChangeText={setAmount}
                                keyboardType="decimal-pad"
                                placeholder="0.00"
                                placeholderTextColor={COLORS.textMuted}
                                autoFocus
                            />
                        </View>
                    </View>

                    {/* Category Picker */}
                    <View style={styles.section}>
                        <Text style={[styles.sectionTitle, { color: COLORS.textMuted }]}>CATEGORY</Text>
                        <View style={styles.categoryGrid}>
                            {displayCats.map((cat) => {
                                const isSelected = category?.label === cat.label;
                                return (
                                    <TouchableOpacity
                                        key={cat.label}
                                        style={[
                                            styles.categoryBtn,
                                            { backgroundColor: isSelected ? cat.color : COLORS.surface, borderColor: isSelected ? cat.color : COLORS.border }
                                        ]}
                                        onPress={() => {
                                            if (cat.label === 'Other') {
                                                setCustomCatName('Tag');
                                                setCustomCatIcon('tag');
                                                setCustomCatModalVisible(true);
                                            } else {
                                                setCategory(cat);
                                            }
                                        }}
                                        activeOpacity={0.75}
                                    >
                                        <Feather name={cat.icon} size={18} color={isSelected ? '#fff' : cat.color} />
                                        <Text style={[styles.categoryLabel, { color: isSelected ? '#fff' : COLORS.text }]}>
                                            {cat.label}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </View>

                    {/* Note */}
                    <View style={styles.section}>
                        <Text style={[styles.sectionTitle, { color: COLORS.textMuted }]}>NOTE (OPTIONAL)</Text>
                        <View style={[styles.noteContainer, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
                            <MaterialIcons name="notes" size={18} color={COLORS.textMuted} style={{ marginRight: 8 }} />
                            <TextInput
                                style={[styles.noteInput, { color: COLORS.text }]}
                                value={note}
                                onChangeText={setNote}
                                placeholder={prefillData?.name || 'e.g. Lunch at Jollibee'}
                                placeholderTextColor={COLORS.textMuted}
                                multiline
                            />
                        </View>
                    </View>

                    {/* Prefill badge */}
                    {prefillData && (
                        <View style={[styles.prefillBadge, { backgroundColor: COLORS.primary + '15', borderColor: COLORS.primary + '40' }]}>
                            <Feather name="zap" size={14} color={COLORS.primary} />
                            <Text style={[styles.prefillText, { color: COLORS.primary }]}>
                                Pre-filled from barcode scan: <Text style={{ fontWeight: '800' }}>{prefillData.name}</Text>
                            </Text>
                        </View>
                    )}

                    {/* Submit */}
                    <TouchableOpacity
                        disabled={isLoading}
                        onPress={handleSubmit}
                        activeOpacity={0.8}
                        style={styles.submitBtn}
                    >
                        <LinearGradient colors={gradientColors} style={styles.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                            {isLoading
                                ? <ActivityIndicator color="#fff" />
                                : <>
                                    <Feather name="check-circle" size={18} color="#fff" style={{ marginRight: 8 }} />
                                    <Text style={styles.submitText}>Save {isIncome ? 'Income' : 'Expense'}</Text>
                                  </>
                            }
                        </LinearGradient>
                    </TouchableOpacity>

                </ScrollView>
            </KeyboardAvoidingView>

            {/* Custom Category Modal */}
            <Modal
                visible={customCatModalVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setCustomCatModalVisible(false)}
            >
                <TouchableWithoutFeedback onPress={() => Keyboard.dismiss()}>
                    <View style={styles.modalOverlay}>
                        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalKav}>
                            <View style={[styles.modalSheet, { backgroundColor: COLORS.surface }]}>
                                <View style={styles.modalHeaderRow}>
                                    <Text style={[styles.modalTitle, { color: COLORS.text }]}>Custom Category</Text>
                                    <TouchableOpacity onPress={() => setCustomCatModalVisible(false)}>
                                        <Feather name="x" size={24} color={COLORS.textMuted} />
                                    </TouchableOpacity>
                                </View>

                                <Text style={[styles.sectionTitle, { color: COLORS.textMuted, marginTop: spacing.md }]}>CATEGORY NAME</Text>
                                <View style={[styles.modalInputWrapper, { backgroundColor: COLORS.background, borderColor: COLORS.border }]}>
                                    <Feather name={customCatIcon} size={18} color={accentColor} style={{ marginRight: 10 }} />
                                    <TextInput
                                        style={[styles.modalInput, { color: COLORS.text }]}
                                        placeholder="e.g. Pet Supplies"
                                        placeholderTextColor={COLORS.textMuted}
                                        value={customCatName}
                                        onChangeText={setCustomCatName}
                                        maxLength={20}
                                    />
                                </View>

                                <Text style={[styles.sectionTitle, { color: COLORS.textMuted, marginTop: spacing.lg }]}>CHOOSE ICON</Text>
                                <ScrollView style={{ maxHeight: 200 }} contentContainerStyle={styles.iconGrid} showsVerticalScrollIndicator={false}>
                                    {EXTRA_ICONS.map((iconName) => {
                                        const isIconSelected = customCatIcon === iconName;
                                        return (
                                            <TouchableOpacity
                                                key={iconName}
                                                style={[
                                                    styles.iconBtn,
                                                    { backgroundColor: isIconSelected ? accentColor : COLORS.background, borderColor: isIconSelected ? accentColor : COLORS.border }
                                                ]}
                                                onPress={() => handleIconSelect(iconName)}
                                                activeOpacity={0.7}
                                            >
                                                <Feather name={iconName} size={20} color={isIconSelected ? '#fff' : COLORS.textMuted} />
                                            </TouchableOpacity>
                                        );
                                    })}
                                </ScrollView>

                                <TouchableOpacity onPress={handleSaveCustomCategory} style={[styles.modalSaveBtn, { backgroundColor: accentColor }]}>
                                    <Text style={styles.modalSaveBtnText}>Save Category</Text>
                                </TouchableOpacity>
                            </View>
                        </KeyboardAvoidingView>
                    </View>
                </TouchableWithoutFeedback>
            </Modal>

            <CustomAlertModal
                visible={alert.visible}
                onClose={closeAlert}
                onConfirm={() => {
                    closeAlert();
                    if (alert.onConfirm) {
                        alert.onConfirm();
                    } else if (alert.type === 'success') {
                        navigation.goBack();
                    }
                }}
                title={alert.title}
                message={alert.message}
                type={alert.type}
                confirmText={alert.type === 'confirm' ? 'Add Now' : (alert.type === 'success' ? 'Done' : 'Okay')}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1 },
    container: { padding: spacing.lg, paddingBottom: 40 },
    header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
    backBtn: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    headerTitle: { fontSize: 20, fontWeight: '800' },
    headerSub: { fontSize: 12 },
    typeTag: { marginLeft: 'auto', width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    amountCard: { borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.lg },
    amountLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: spacing.sm },
    amountRow: { flexDirection: 'row', alignItems: 'center' },
    currency: { fontSize: 32, fontWeight: '800', marginRight: 8 },
    amountInput: { fontSize: 40, fontWeight: '800', flex: 1 },
    section: { marginBottom: spacing.lg },
    sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: spacing.sm },
    categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    categoryBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 12, paddingVertical: 9,
        borderRadius: radius.full, borderWidth: 1.5,
    },
    categoryLabel: { fontSize: 13, fontWeight: '600' },
    templateChip: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        padding: spacing.sm, paddingRight: spacing.md, 
        borderRadius: radius.md, borderWidth: 1,
    },
    templateIcon: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
    templateCat: { fontSize: 13, fontWeight: '700' },
    templateAmt: { fontSize: 11, fontWeight: '600', marginTop: 2 },
    noteContainer: {
        flexDirection: 'row', alignItems: 'flex-start',
        borderRadius: radius.lg, borderWidth: 1.5,
        padding: spacing.md,
    },
    noteInput: { flex: 1, fontSize: 14, minHeight: 50 },
    prefillBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        padding: spacing.md, borderRadius: radius.lg, borderWidth: 1,
        marginBottom: spacing.lg,
    },
    prefillText: { flex: 1, fontSize: 12 },
    submitBtn: { borderRadius: radius.xl, overflow: 'hidden', marginTop: spacing.sm },
    gradient: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 16 },
    submitText: { color: '#fff', fontSize: 16, fontWeight: '800' },
    
    // Custom Modal Styles
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalKav: { justifyContent: 'flex-end' },
    modalSheet: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: 40 },
    modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    modalTitle: { fontSize: 18, fontWeight: '800' },
    modalInputWrapper: {
        flexDirection: 'row', alignItems: 'center',
        borderWidth: 1.5, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: 12, marginTop: spacing.xs
    },
    modalInput: { flex: 1, fontSize: 15, fontWeight: '600' },
    iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: spacing.xs, paddingBottom: spacing.lg },
    iconBtn: {
        width: 48, height: 48, borderRadius: 24, borderWidth: 1.5,
        justifyContent: 'center', alignItems: 'center'
    },
    modalSaveBtn: { paddingVertical: 16, borderRadius: radius.xl, alignItems: 'center', marginTop: spacing.md },
    modalSaveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' }
});
