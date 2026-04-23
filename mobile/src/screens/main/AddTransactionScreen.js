import React, { useState } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, TextInput,
    ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
    Modal, TouchableWithoutFeedback, Keyboard, Alert, Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../context/ThemeContext';
import { radius, spacing } from '../../theme/colors';
import * as ImagePicker from 'expo-image-picker';
import { createTransaction, getTransactions, getCurrencyList, convertCurrency, uploadReceipt, getCategories } from '../../api/api';
import CustomAlertModal from '../../components/CustomAlertModal';
import { useSecurity } from '../../context/SecurityContext';
import { useFinanceStore } from '../../store/financeStore';
import WalletSelector, { calcNativeDeduct, hasEnoughBalance } from '../../components/WalletSelector';

const CATEGORIES = {
    income: [
        { label: 'Salary', icon: 'briefcase', color: '#22c55e' },
        { label: 'Freelance', icon: 'code', color: '#3b82f6' },
        { label: 'Investment', icon: 'trending-up', color: '#8b5cf6' },
        { label: 'Gift', icon: 'gift', color: '#f59e0b' },
    ],
    expense: [
        { label: 'Food', icon: 'coffee', color: '#f59e0b' },
        { label: 'Transport', icon: 'truck', color: '#3b82f6' },
        { label: 'Shopping', icon: 'shopping-bag', color: '#ec4899' },
        { label: 'Bills', icon: 'file-text', color: '#ef4444' },
        { label: 'Health', icon: 'heart', color: '#22c55e' },
        { label: 'Entertainment', icon: 'tv', color: '#8b5cf6' },
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
    'smile', 'heart', 'briefcase', 'coffee', 'truck', 'shopping-bag', 'file-text',
    'piggy-bank-outline', 'account-cash'
];

const DynamicIcon = ({ name, size, color, style }) => {
    const MCI_ICONS = ['piggy-bank-outline', 'account-cash'];
    if (MCI_ICONS.includes(name)) {
        return <MaterialCommunityIcons name={name} size={size} color={color} style={style} />;
    }
    return <Feather name={name} size={size} color={color} style={style} />;
};


export default function AddTransactionScreen({ navigation, route }) {
    const { type = 'expense', prefillData = null } = route.params || {};
    const { COLORS } = useTheme();
    const { setShouldIgnoreLock } = useSecurity();

    const [amount, setAmount] = useState(prefillData?.price ? String(prefillData.price) : '');
    const [note, setNote] = useState(prefillData?.name || '');
    const [category, setCategory] = useState(null);
    const [selectedWallet, setSelectedWallet] = useState(null);   // full wallet object
    const [isLoading, setIsLoading] = useState(false);

    const cryptoPrices = useFinanceStore(state => state.cryptoPrices);
    const [alert, setAlert] = useState({ visible: false, type: 'info', title: '', message: '' });

    const [image, setImage] = useState(null);
    const [isUploading, setIsUploading] = useState(false);

    // Multi-Currency States
    const [currency, setCurrency] = useState({ code: 'PHP', symbol: '₱', flag: '🇵🇭' });
    const [currencyList, setCurrencyList] = useState([]);
    const [currencyModalVisible, setCurrencyModalVisible] = useState(false);
    const [convertedPreview, setConvertedPreview] = useState(null);
    const [exchangeRate, setExchangeRate] = useState(1);

    const [remoteCats, setRemoteCats] = useState([]);
    const formatIconName = (name) => {
        return name.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    };

    const showAlert = (type, title, message, onConfirm = null) => setAlert({ visible: true, type, title, message, onConfirm });
    const closeAlert = () => setAlert(a => ({ ...a, visible: false }));

    const [frequentTxs, setFrequentTxs] = useState([]);

    React.useEffect(() => {
        const fetchEssential = async () => {
            try {
                const catRes = await getCategories();
                if (catRes?.categories?.length > 0) {
                    setRemoteCats(catRes.categories.map(c => ({ label: c.name, icon: c.icon, color: c.color, type: c.type })));
                }

                // Fetch templates
                const res = await getTransactions({ type, limit: 20 });
                if (res?.transactions) {
                    const unique = [];
                    const seen = new Set();
                    for (const tx of res.transactions) {
                        const key = `${tx.category}-${tx.amount}-${tx.note || ''}`;
                        if (!seen.has(key)) { seen.add(key); unique.push(tx); }
                    }
                    setFrequentTxs(unique.slice(0, 5));
                }
                // Fetch currencies
                const curRes = await getCurrencyList();
                if (curRes?.currencies) setCurrencyList(curRes.currencies);
            } catch (e) {
                console.warn('Failed to load essential data:', e.message);
            }
        };
        fetchEssential();
    }, [type]);

    const handlePickImage = async (useCamera = false) => {
        try {
            setShouldIgnoreLock(true);
            const permissionResult = useCamera
                ? await ImagePicker.requestCameraPermissionsAsync()
                : await ImagePicker.requestMediaLibraryPermissionsAsync();

            if (permissionResult.granted === false) {
                showAlert('warning', 'Permission Required', `Allow access to your ${useCamera ? 'camera' : 'gallery'} to attach photos.`);
                return;
            }

            const result = useCamera
                ? await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.5 })
                : await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, quality: 0.5 });

            if (!result.canceled) {
                setImage(result.assets[0].uri);
            }
        } catch (e) {
            console.warn('Image error:', e);
        } finally {
            // Restore security lock behavior after a short delay to ensure app is active
            setTimeout(() => setShouldIgnoreLock(false), 1000);
        }
    };

    // Live Conversion logic
    React.useEffect(() => {
        const fetchConversion = async () => {
            if (!amount || isNaN(parseFloat(amount)) || currency.code === 'PHP') {
                setConvertedPreview(null);
                setExchangeRate(1);
                return;
            }
            try {
                const res = await convertCurrency(currency.code, 'PHP', parseFloat(amount));
                setConvertedPreview(res.convertedAmount);
                setExchangeRate(res.rate);
            } catch (e) {
                console.warn('Conversion failed:', e.message);
            }
        };

        const timeout = setTimeout(fetchConversion, 500); // Debounce API calls
        return () => clearTimeout(timeout);
    }, [amount, currency]);

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
    const fallbackCats = CATEGORIES[type];
    const serverCats = remoteCats.filter(c => c.type === type);
    const cats = serverCats.length > 0 ? serverCats : fallbackCats;
    const accentColor = isIncome ? '#22c55e' : '#ef4444';
    const gradientColors = isIncome ? ['#22c55e', '#16a34a'] : ['#ef4444', '#b91c1c'];

    const handleSubmit = async () => {
        if (!amount || isNaN(parseFloat(amount))) {
            return showAlert('warning', 'Missing Amount', 'Please enter a valid amount.');
        }
        if (!category) {
            return showAlert('warning', 'No Category', 'Please select a category for this transaction.');
        }

        // ── Wallet balance pre-check ──────────────────────────────────
        const finalAmountPHPForCheck = convertedPreview !== null ? convertedPreview : parseFloat(amount);
        if (!isIncome && selectedWallet) {
            if (!hasEnoughBalance(selectedWallet, finalAmountPHPForCheck, cryptoPrices)) {
                const label = selectedWallet.type === 'Crypto'
                    ? `${selectedWallet.coinSymbol?.toUpperCase() || 'COIN'}`
                    : '₱';
                return showAlert('warning', 'Insufficient Balance',
                    `Your ${selectedWallet.name} wallet doesn't have enough balance to cover this expense.`);
            }
        }
        setIsLoading(true);
        try {
            let finalAttachmentUrl = null;

            // 1. Upload image if present
            if (image) {
                setIsUploading(true);
                const formData = new FormData();
                const uriParts = image.split('.');
                const fileType = uriParts[uriParts.length - 1];

                formData.append('receipt', {
                    uri: image,
                    name: `receipt.${fileType}`,
                    type: `image/${fileType}`,
                });

                const uploadRes = await uploadReceipt(formData);
                finalAttachmentUrl = uploadRes.url;
                setIsUploading(false);
            }

            // 2. Create transaction
            const finalAmountPHP = convertedPreview !== null ? convertedPreview : parseFloat(amount);

            // Calculate native deduct amount for crypto/stocks wallets
            let walletDeductAmount = null;
            if (selectedWallet) {
                const deduct = calcNativeDeduct(selectedWallet, finalAmountPHP, cryptoPrices);
                walletDeductAmount = deduct?.nativeAmount ?? null;
            }

            await createTransaction({
                type,
                amount: finalAmountPHP,
                currency: currency.code,
                originalAmount: currency.code !== 'PHP' ? parseFloat(amount) : null,
                exchangeRate: currency.code !== 'PHP' ? exchangeRate : null,
                category: category.label,
                categoryIcon: category.icon,
                categoryColor: category.color,
                note,
                date: new Date().toISOString(),
                attachment: finalAttachmentUrl,
                walletId: selectedWallet?._id || null,
                walletDeductAmount,
            });
            showAlert('success', isIncome ? 'Income Added!' : 'Expense Logged!',
                `${currency.symbol}${parseFloat(amount).toFixed(2)} recorded.${currency.code !== 'PHP' ? ` (≈ ₱${finalAmountPHP.toFixed(2)})` : ''}`
            );
        } catch (err) {
            const errorData = err?.response?.data;
            let errorMsg = errorData?.error || errorData?.message || 'Something went wrong. Please try again.';

            if (errorData?.details && Array.isArray(errorData.details) && errorData.details.length > 0) {
                errorMsg = errorData.details[0].message;
            }

            showAlert('error', 'Failed', errorMsg);
            setIsUploading(false);
        } finally {
            setIsLoading(false);
        }
    };



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
                                            <DynamicIcon name={tx.categoryIcon || 'tag'} size={14} color={tx.categoryColor || accentColor} />
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
                            <TouchableOpacity
                                onPress={() => setCurrencyModalVisible(true)}
                                style={[styles.currencyPicker, { backgroundColor: COLORS.background, borderColor: COLORS.border }]}
                            >
                                <Text style={styles.currencyFlag}>{currency.flag}</Text>
                                <Text style={[styles.currencyCode, { color: COLORS.text }]}>{currency.code}</Text>
                                <Feather name="chevron-down" size={14} color={COLORS.textMuted} />
                            </TouchableOpacity>
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

                        {convertedPreview !== null && (
                            <View style={styles.conversionInfo}>
                                <Text style={[styles.conversionText, { color: COLORS.textMuted }]}>
                                    ≈ ₱{convertedPreview.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </Text>
                                <View style={[styles.rateTag, { backgroundColor: COLORS.primary + '15' }]}>
                                    <Text style={[styles.rateText, { color: COLORS.primary }]}>1 {currency.code} = ₱{exchangeRate.toFixed(4)}</Text>
                                </View>
                            </View>
                        )}
                    </View>

                    {/* Wallet Selector */}
                    <View style={styles.section}>
                        <Text style={[styles.sectionTitle, { color: COLORS.textMuted }]}>
                            {isIncome ? 'RECEIVE TO WALLET' : 'PAY FROM WALLET'}
                        </Text>
                        <WalletSelector
                            selectedWalletId={selectedWallet?._id}
                            onSelect={(w) => setSelectedWallet(w)}
                            COLORS={COLORS}
                            amountPHP={convertedPreview !== null ? convertedPreview : parseFloat(amount) || 0}
                            isExpense={!isIncome}
                        />
                    </View>
                    
                    {/* Category Picker */}
                    <View style={styles.section}>
                        <Text style={[styles.sectionTitle, { color: COLORS.textMuted }]}>CATEGORY</Text>
                        <View style={styles.categoryGrid}>
                            {cats.map((cat) => {
                                const isSelected = category?.label === cat.label;
                                return (
                                    <TouchableOpacity
                                        key={cat.label}
                                        style={[
                                            styles.categoryBtn,
                                            { backgroundColor: isSelected ? cat.color : COLORS.surface, borderColor: isSelected ? cat.color : COLORS.border }
                                        ]}
                                        onPress={() => setCategory(cat)}
                                        activeOpacity={0.75}
                                    >
                                        <DynamicIcon name={cat.icon} size={18} color={isSelected ? '#fff' : cat.color} />
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

                    {/* Attachment Section */}
                    <View style={styles.section}>
                        <Text style={[styles.sectionTitle, { color: COLORS.textMuted }]}>ATTACHMENT</Text>
                        {image ? (
                            <View style={[styles.imagePreviewContainer, { borderColor: COLORS.border }]}>
                                <Image source={{ uri: image }} style={styles.imagePreview} />
                                <TouchableOpacity onPress={() => setImage(null)} style={styles.removeImageBtn}>
                                    <Feather name="x" size={20} color="#fff" />
                                </TouchableOpacity>
                                <View style={styles.imageInfo}>
                                    <View style={styles.imageBadge}>
                                        <Feather name="image" size={12} color="#fff" />
                                        <Text style={styles.imageBadgeText}>Receipt Attached</Text>
                                    </View>
                                </View>
                            </View>
                        ) : (
                            <View style={styles.attachmentButtons}>
                                <TouchableOpacity
                                    onPress={() => handlePickImage(true)}
                                    style={[styles.attachBtn, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
                                >
                                    <Feather name="camera" size={20} color={COLORS.primary} />
                                    <Text style={[styles.attachBtnText, { color: COLORS.text }]}>Take Photo</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={() => handlePickImage(false)}
                                    style={[styles.attachBtn, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
                                >
                                    <Feather name="image" size={20} color={COLORS.textMuted} />
                                    <Text style={[styles.attachBtnText, { color: COLORS.text }]}>Gallery</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>

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

            {/* Currency Selection Modal */}
            <Modal
                visible={currencyModalVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setCurrencyModalVisible(false)}
            >
                <TouchableWithoutFeedback onPress={() => setCurrencyModalVisible(false)}>
                    <View style={styles.modalOverlay}>
                        <View style={[styles.modalSheet, { backgroundColor: COLORS.surface, maxHeight: '60%' }]}>
                            <View style={styles.modalHeaderRow}>
                                <Text style={[styles.modalTitle, { color: COLORS.text }]}>Select Currency</Text>
                                <TouchableOpacity onPress={() => setCurrencyModalVisible(false)}>
                                    <Feather name="x" size={24} color={COLORS.textMuted} />
                                </TouchableOpacity>
                            </View>

                            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingVertical: spacing.md }}>
                                {currencyList.map((item) => (
                                    <TouchableOpacity
                                        key={item.code}
                                        onPress={() => {
                                            setCurrency(item);
                                            setCurrencyModalVisible(false);
                                        }}
                                        style={[
                                            styles.currencyItem,
                                            { backgroundColor: currency.code === item.code ? COLORS.primary + '10' : 'transparent' }
                                        ]}
                                    >
                                        <Text style={styles.itemFlag}>{item.flag}</Text>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.itemCode, { color: COLORS.text }]}>{item.code}</Text>
                                            <Text style={[styles.itemName, { color: COLORS.textMuted }]}>{item.name}</Text>
                                        </View>
                                        {currency.code === item.code && <Feather name="check" size={20} color={COLORS.primary} />}
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>
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
    amountRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    currencyPicker: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 10, paddingVertical: 8,
        borderRadius: radius.md, borderWidth: 1.5,
    },
    currencyFlag: { fontSize: 20 },
    currencyCode: { fontSize: 16, fontWeight: '800' },
    amountInput: { fontSize: 40, fontWeight: '800', flex: 1 },

    conversionInfo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)' },
    conversionText: { fontSize: 16, fontWeight: '700' },
    rateTag: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.xs },
    rateText: { fontSize: 11, fontWeight: '800' },

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

    // Attachment Styles
    attachmentButtons: { flexDirection: 'row', gap: 12 },
    attachBtn: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 8, paddingVertical: 14, borderRadius: radius.lg, borderWidth: 1.5,
    },
    attachBtnText: { fontSize: 14, fontWeight: '700' },
    imagePreviewContainer: {
        width: '100%', height: 200, borderRadius: radius.xl,
        overflow: 'hidden', borderWidth: 1.5, position: 'relative'
    },
    imagePreview: { width: '100%', height: '100%', resizeMode: 'cover' },
    removeImageBtn: {
        position: 'absolute', top: 12, right: 12, width: 36, height: 36,
        borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center', alignItems: 'center'
    },
    imageInfo: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 12, backgroundColor: 'rgba(0,0,0,0.3)' },
    imageBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    imageBadgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },

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
    modalSaveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

    currencyItem: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 12, borderRadius: radius.lg },
    itemFlag: { fontSize: 28 },
    itemCode: { fontSize: 16, fontWeight: '800' },
    itemName: { fontSize: 12, fontWeight: '600' }
});
