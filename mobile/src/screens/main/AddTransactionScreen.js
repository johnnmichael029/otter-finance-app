import React, { useState, useMemo, useEffect } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, TextInput,
    ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
    Modal, TouchableWithoutFeedback, Keyboard, Alert, Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialIcons, MaterialCommunityIcons, Ionicons, AntDesign, FontAwesome5 } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../context/ThemeContext';
import { radius, spacing } from '../../theme/colors';
import * as ImagePicker from 'expo-image-picker';
import { createTransaction, getTransactions, getCurrencyList, convertCurrency, uploadReceipt, getCategories } from '../../api/api';
import CustomAlertModal from '../../components/CustomAlertModal';
import { useSecurity } from '../../context/SecurityContext';
import { useFinanceStore } from '../../store/financeStore';
import WalletSelector, { calcNativeDeduct, hasEnoughBalance } from '../../components/WalletSelector';
import CalculatorSheet from '../../components/CalculatorSheet';

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


const DynamicIcon = ({ name, size, color, style }) => {
    const MCI_ICONS = ['piggy-bank-outline', 'account-cash', 'jeepney', 'car', 'noodles', 'egg-fried', 'cup',
        'controller-classic-outline'
    ];
    const ION_ICONS = ['train-outline', 'boat-outline', 'egg-outline', 'game-controller-outline'];
    const FA5_ICONS = ['hospital'];
    if (MCI_ICONS.includes(name)) {
        return <MaterialCommunityIcons name={name} size={size} color={color} style={style} />;
    }
    if (ION_ICONS.includes(name)) {
        return <Ionicons name={name} size={size} color={color} style={style} />;
    }
    if (FA5_ICONS.includes(name)) {
        return <FontAwesome5 name={name} size={size} color={color} style={style} />;
    }
    return <Feather name={name} size={size} color={color} style={style} />;
};


export default function AddTransactionScreen({ navigation, route }) {
    const { type = 'expense', prefillData = null } = route.params || {};
    const COLORS = useTheme(state => state.COLORS);
    const { setShouldIgnoreLock } = useSecurity();

    const [amount, setAmount] = useState(prefillData?.price ? String(prefillData.price) : '');
    const [note, setNote] = useState(prefillData?.name || '');
    const [category, setCategory] = useState(null);
    const [selectedWallet, setSelectedWallet] = useState(null);   // Destination wallet (locked if passed from Wallet screen)
    const [sourceWallet, setSourceWallet] = useState(null);       // source wallet object (for income)
    const [sourceType, setSourceType] = useState('none');         // 'none' | 'hand' | 'savings_balance' | 'wallet'
    const [isLoading, setIsLoading] = useState(false);
    const [calculatorVisible, setCalculatorVisible] = useState(false);

    // If we came from the Wallet Screen, pre-set the destination wallet
    useEffect(() => {
        if (route.params?.preselectedWallet) {
            setSelectedWallet(route.params.preselectedWallet);
        }
    }, [route.params?.preselectedWallet]);

    const cryptoPrices = useFinanceStore(state => state.cryptoPrices);
    const savingsMasterPot = useFinanceStore(state => state.savingsMasterPot);
    const handBalance = useFinanceStore(state => state.handBalance);
    const [alert, setAlert] = useState({ visible: false, type: 'info', title: '', message: '' });

    const [image, setImage] = useState(null);
    const [isUploading, setIsUploading] = useState(false);

    // Multi-Currency States
    const [currency, setCurrency] = useState({ code: 'PHP', symbol: '₱', flag: '🇵🇭' });
    const [currencyList, setCurrencyList] = useState([]);
    const [currencyModalVisible, setCurrencyModalVisible] = useState(false);
    const [convertedPreview, setConvertedPreview] = useState(null);
    const [exchangeRate, setExchangeRate] = useState(1);
    const [sourceExchangeRate, setSourceExchangeRate] = useState(1);
    const [sourceConvertedAmount, setSourceConvertedAmount] = useState(null);

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
        setShouldIgnoreLock(true);
        try {
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

    const [destExchangeRate, setDestExchangeRate] = useState(1);
    const [destConvertedAmount, setDestConvertedAmount] = useState(null);

    // Live Conversion for Source & Destination Wallets
    React.useEffect(() => {
        const fetchWalletConversions = async () => {
            if (!amount || isNaN(parseFloat(amount))) return;

            // 1. Source Wallet Conversion
            if (sourceWallet) {
                if (sourceWallet.type === 'Crypto' && sourceWallet.coinId) {
                    const price = cryptoPrices[sourceWallet.coinId];
                    if (price) {
                        setSourceExchangeRate(price);
                        setSourceConvertedAmount(parseFloat(amount) / price);
                    }
                } else {
                    const walletCurrency = sourceWallet.currency || 'PHP';
                    if (walletCurrency === 'PHP') {
                        setSourceConvertedAmount(null);
                        setSourceExchangeRate(1);
                    } else {
                        try {
                            const res = await convertCurrency(walletCurrency, 'PHP', 1);
                            setSourceExchangeRate(res.rate);
                            setSourceConvertedAmount(parseFloat(amount) / res.rate);
                        } catch (e) { console.warn('Source conversion failed:', e.message); }
                    }
                }
            }

            // 2. Destination (Selected) Wallet Conversion
            if (selectedWallet) {
                if (selectedWallet.type === 'Crypto' && selectedWallet.coinId) {
                    const price = cryptoPrices[selectedWallet.coinId];
                    if (price) {
                        setDestExchangeRate(price);
                        setDestConvertedAmount(parseFloat(amount) / price);
                    }
                } else {
                    const walletCurrency = selectedWallet.currency || 'PHP';
                    if (walletCurrency === 'PHP') {
                        setDestConvertedAmount(null);
                        setDestExchangeRate(1);
                    } else {
                        try {
                            const res = await convertCurrency(walletCurrency, 'PHP', 1);
                            setDestExchangeRate(res.rate);
                            setDestConvertedAmount(parseFloat(amount) / res.rate);
                        } catch (e) { console.warn('Dest conversion failed:', e.message); }
                    }
                }
            }
        };

        const timeout = setTimeout(fetchWalletConversions, 500);
        return () => clearTimeout(timeout);
    }, [amount, sourceWallet, selectedWallet, cryptoPrices]);

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

    const handleMaxPress = () => {
        let maxAmt = 0;
        let isCrypto = false;

        if (isIncome) {
            // Pulling money FROM a source to HAND or Destination
            if (sourceType === 'hand') {
                maxAmt = handBalance;
            } else if (sourceType === 'savings_balance') {
                maxAmt = savingsMasterPot?.currentAmount || 0;
            } else if (sourceType === 'wallet' && sourceWallet) {
                if (sourceWallet.type === 'Credit') {
                    return showAlert('info', 'No Limit', 'Credit cards do not have a maximum withdrawable balance.');
                }
                maxAmt = sourceWallet.balance;
                isCrypto = sourceWallet.type === 'Crypto';
            } else {
                return showAlert('warning', 'No Source Selected', 'Please select a source wallet first to use the MAX feature.');
            }
        } else {
            // Pulling money FROM selectedWallet (or HAND) for an Expense
            if (!selectedWallet) {
                maxAmt = handBalance;
            } else {
                if (selectedWallet.type === 'Credit') {
                    return showAlert('info', 'No Limit', 'Credit cards do not have a maximum limit.');
                }
                maxAmt = selectedWallet.balance;
                isCrypto = selectedWallet.type === 'Crypto';
            }
        }

        if (maxAmt > 0) {
            const formattedAmt = Number.isInteger(maxAmt) ? maxAmt.toString() : maxAmt.toFixed(isCrypto ? 8 : 2);
            setAmount(formattedAmt);
        } else {
            showAlert('warning', 'Zero Balance', 'The selected source has a balance of 0.');
        }
    };

    const handleSubmit = async () => {
        if (!amount || isNaN(parseFloat(amount))) {
            return showAlert('warning', 'Missing Amount', 'Please enter a valid amount.');
        }
        if (!category) {
            return showAlert('warning', 'No Category', 'Please select a category for this transaction.');
        }

        // ── Wallet / Savings balance pre-check ──────────────────────────────────
        const finalAmountPHPForCheck = convertedPreview !== null ? convertedPreview : parseFloat(amount);

        if (isIncome && sourceType === 'savings_balance') {
            const savingsBal = savingsMasterPot?.currentAmount || 0;
            if (savingsBal < finalAmountPHPForCheck) {
                return showAlert('warning', 'Insufficient Savings',
                    `Your Savings Balance only has ₱${savingsBal.toFixed(2)}, which is not enough for this transaction.`);
            }
        }
        if (!isIncome && selectedWallet) {
            if (!hasEnoughBalance(selectedWallet, finalAmountPHPForCheck, cryptoPrices)) {
                const label = selectedWallet.type === 'Crypto'
                    ? `${selectedWallet.coinSymbol?.toUpperCase() || 'COIN'}`
                    : '₱';
                return showAlert('warning', 'Insufficient Balance',
                    `Your ${selectedWallet.name} wallet doesn't have enough balance to cover this expense.`);
            }
        }

        if (isIncome && selectedWallet && selectedWallet.type === 'Credit') {
            if (selectedWallet.balance <= 0) {
                return showAlert('warning', 'No Liabilities',
                    `You cannot add balance to a Credit wallet that does not have any outstanding liabilities.`);
            }
            if (finalAmountPHPForCheck > selectedWallet.balance) {
                return showAlert('warning', 'Overpayment Detected',
                    `You only owe ₱${selectedWallet.balance.toFixed(2)} on this credit card. You cannot pay more than your outstanding balance.`);
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

            // Calculate native amounts for both wallets independently
            let walletDeductAmount = null;
            let sourceWalletDeductAmount = null;

            if (selectedWallet) {
                const deduct = calcNativeDeduct(selectedWallet, finalAmountPHP, cryptoPrices, destExchangeRate);
                walletDeductAmount = deduct?.nativeAmount ?? null;
            }
            if (sourceWallet) {
                const deduct = calcNativeDeduct(sourceWallet, finalAmountPHP, cryptoPrices, sourceExchangeRate);
                sourceWalletDeductAmount = deduct?.nativeAmount ?? null;
            }

            const txData = {
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
                sourceWalletId: sourceWallet?._id || null,
                sourceWalletDeductAmount,
                sourceType: sourceWallet ? 'wallet' : sourceType, // 'hand' | 'savings_balance' | 'wallet'
            };

            await createTransaction(txData);

            // Refresh store to reflect new balance and transaction
            useFinanceStore.getState().refreshAll();

            showAlert('success', isIncome ? 'Income Added!' : 'Expense Logged!',
                `${currency.symbol}${parseFloat(amount).toFixed(2)} recorded.${currency.code !== 'PHP' ? ` (≈ ₱${finalAmountPHP.toFixed(2)})` : ''}`,
                () => navigation.goBack()
            );

        } catch (err) {
            setIsLoading(false);
            const errorMsg = err?.response?.data?.message || 'Something went wrong. Please check your inputs.';
            showAlert('error', 'Error', errorMsg);
        } finally {
            setIsLoading(false);
            setIsUploading(false);
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
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
                            <Text style={[styles.amountLabel, { color: COLORS.textMuted, marginBottom: 0 }]}>AMOUNT</Text>
                            <TouchableOpacity onPress={handleMaxPress} style={[styles.maxBtn, { backgroundColor: COLORS.primary + '20' }]}>
                                <Text style={[styles.maxBtnText, { color: COLORS.primary }]}>MAX</Text>
                            </TouchableOpacity>
                        </View>
                        <View style={styles.amountRow}>
                            <TouchableOpacity
                                onPress={() => setCurrencyModalVisible(true)}
                                style={[styles.currencyPicker, { backgroundColor: COLORS.background, borderColor: COLORS.border }]}
                            >
                                <Text style={styles.currencyFlag}>{currency.flag}</Text>
                                <Text style={[styles.currencyCode, { color: COLORS.text }]}>{currency.code}</Text>
                                <Feather name="chevron-down" size={14} color={COLORS.textMuted} />
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={{ flex: 1, paddingVertical: 4 }}
                                onPress={() => setCalculatorVisible(true)}
                                activeOpacity={0.7}
                            >
                                <Text style={[
                                    styles.amountInput,
                                    { color: amount ? COLORS.text : COLORS.textMuted }
                                ]}>
                                    {amount ? Number(amount).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 8 }) : '0.00'}
                                </Text>
                            </TouchableOpacity>
                        </View>

                        {/* Main Transaction Conversion Preview */}
                        {currency.code !== 'PHP' && convertedPreview !== null && (
                            <View style={styles.conversionInfo}>
                                <Text style={[styles.conversionText, { color: COLORS.textMuted }]}>
                                    ≈ ₱{convertedPreview.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </Text>
                                <View style={[styles.rateTag, { backgroundColor: COLORS.primary + '15' }]}>
                                    <Text style={[styles.rateText, { color: COLORS.primary }]}>1 {currency.code} is = to ₱{exchangeRate.toFixed(2)}</Text>
                                </View>
                            </View>
                        )}

                        {/* Source Wallet Conversion Preview (If main is PHP but source isn't) */}
                        {currency.code === 'PHP' && sourceWallet && (sourceWallet.currency !== 'PHP' || sourceWallet.type === 'Crypto') && (
                            <View style={styles.conversionInfo}>
                                <Text style={[styles.conversionText, { color: COLORS.textMuted }]}>
                                    ≈ {sourceConvertedAmount?.toLocaleString(undefined, { maximumFractionDigits: 8 })} {sourceWallet.coinSymbol || sourceWallet.currency || 'USD'} deducted
                                </Text>
                                <View style={[styles.rateTag, { backgroundColor: COLORS.primary + '15' }]}>
                                    <Text style={[styles.rateText, { color: COLORS.primary }]}>
                                        1 {sourceWallet.coinSymbol || sourceWallet.currency || 'USD'} is = to ₱{sourceExchangeRate.toFixed(2)}
                                    </Text>
                                </View>
                            </View>
                        )}
                        {/* Wallet Conversion Preview for Expense (When main is PHP but wallet isn't) */}
                        {!isIncome && currency.code === 'PHP' && selectedWallet && (selectedWallet.currency !== 'PHP' || selectedWallet.type === 'Crypto') && (
                            <View style={styles.conversionInfo}>
                                <Text style={[styles.conversionText, { color: COLORS.textMuted }]}>
                                    ≈ {destConvertedAmount?.toLocaleString(undefined, { maximumFractionDigits: 8 })} {selectedWallet.coinSymbol || selectedWallet.currency || 'USD'} deducted
                                </Text>
                                <View style={[styles.rateTag, { backgroundColor: COLORS.primary + '15' }]}>
                                    <Text style={[styles.rateText, { color: COLORS.primary }]}>
                                        1 {selectedWallet.coinSymbol || selectedWallet.currency || 'USD'} is = to ₱{destExchangeRate.toFixed(2)}
                                    </Text>
                                </View>
                            </View>
                        )}
                    </View>
                    {/* Destination Info Badge (Always for Income) */}
                    {isIncome && (
                        <View style={[styles.prefillBadge, { backgroundColor: COLORS.primary + '15', borderColor: COLORS.primary + '40', marginBottom: 15 }]}>
                            <MaterialCommunityIcons
                                name={selectedWallet ? "wallet-plus" : "hand-coin-outline"}
                                size={16}
                                color={COLORS.primary}
                            />
                            <Text style={[styles.prefillText, { color: COLORS.primary }]}>
                                Depositing to: <Text style={{ fontWeight: '800' }}>{selectedWallet ? selectedWallet.name : 'Main Wallet (HAND)'}</Text>
                            </Text>
                        </View>
                    )}

                    {/* Source Wallet Selector (Only for Income) */}
                    {isIncome && (
                        <View style={styles.section}>
                            <Text style={[styles.sectionTitle, { color: COLORS.textMuted }]}>
                                SOURCE (DEDUCT FROM)
                            </Text>

                            {/* ── Virtual source: HAND, Savings, & External ── */}
                            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                                {/* ── Virtual source: No Deduction (External Cash) ── */}
                                <TouchableOpacity
                                    style={[styles.sourceChip, {
                                        borderColor: sourceType === 'none' && !sourceWallet ? COLORS.text : COLORS.border,
                                        borderWidth: sourceType === 'none' && !sourceWallet ? 2 : 1,
                                        backgroundColor: COLORS.surface,
                                        flex: 1,
                                    }]}
                                    onPress={() => { setSourceType('none'); setSourceWallet(null); }}
                                    activeOpacity={0.8}
                                >
                                    <Feather name="globe" size={18} color={COLORS.text} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.sourceChipLabel, { color: COLORS.text }]}>Cash / Other</Text>
                                        <Text style={[styles.sourceChipSub, { color: COLORS.textMuted }]}>No deduction</Text>
                                    </View>
                                    {sourceType === 'none' && !sourceWallet && (
                                        <View style={[styles.sourceCheckDot, { backgroundColor: COLORS.text }]}>
                                            <Feather name="check" size={9} color={COLORS.background} />
                                        </View>
                                    )}
                                </TouchableOpacity>

                                {/* Hide HAND source if destination is already HAND */}
                                {selectedWallet !== null && (
                                    <TouchableOpacity
                                        style={[styles.sourceChip, {
                                            borderColor: sourceType === 'hand' && !sourceWallet ? '#E91E8C' : COLORS.border,
                                            borderWidth: sourceType === 'hand' && !sourceWallet ? 2 : 1,
                                            backgroundColor: COLORS.surface,
                                            flex: 1,
                                        }]}
                                        onPress={() => { setSourceType('hand'); setSourceWallet(null); }}
                                        activeOpacity={0.8}
                                    >
                                        <MaterialCommunityIcons name="hand-coin-outline" size={18} color="#E91E8C" />
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.sourceChipLabel, { color: COLORS.text }]}>HAND</Text>
                                            <Text style={[styles.sourceChipSub, { color: COLORS.textMuted }]}>Main Balance</Text>
                                        </View>
                                        {sourceType === 'hand' && !sourceWallet && (
                                            <View style={[styles.sourceCheckDot, { backgroundColor: '#E91E8C' }]}>
                                                <Feather name="check" size={9} color="#fff" />
                                            </View>
                                        )}
                                    </TouchableOpacity>
                                )}

                                {/* ── Virtual source: Savings Balance ── */}
                                <TouchableOpacity
                                    style={[styles.sourceChip, {
                                        borderColor: sourceType === 'savings_balance' && !sourceWallet ? '#8b5cf6' : COLORS.border,
                                        borderWidth: sourceType === 'savings_balance' && !sourceWallet ? 2 : 1,
                                        backgroundColor: COLORS.surface,
                                        flex: 1,
                                    }]}
                                    onPress={() => { setSourceType('savings_balance'); setSourceWallet(null); }}
                                    activeOpacity={0.8}
                                >
                                    <MaterialCommunityIcons name="piggy-bank-outline" size={18} color="#8b5cf6" />
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.sourceChipLabel, { color: COLORS.text }]}>Savings</Text>
                                        <Text style={[styles.sourceChipSub, { color: COLORS.textMuted }]}>
                                            ₱{(savingsMasterPot?.currentAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </Text>
                                    </View>
                                    {sourceType === 'savings_balance' && !sourceWallet && (
                                        <View style={[styles.sourceCheckDot, { backgroundColor: '#8b5cf6' }]}>
                                            <Feather name="check" size={9} color="#fff" />
                                        </View>
                                    )}
                                </TouchableOpacity>
                            </View>

                            {/* ── Wallet Selector ── */}
                            <WalletSelector
                                selectedWalletId={sourceWallet?._id}
                                onSelect={(w) => {
                                    if (sourceWallet?._id === w?._id) {
                                        setSourceWallet(null);
                                        setSourceType('none');
                                    } else {
                                        setSourceWallet(w);
                                        setSourceType('wallet');
                                    }
                                }}
                                COLORS={COLORS}
                                amountPHP={convertedPreview !== null ? convertedPreview : parseFloat(amount) || 0}
                                isExpense={true}
                                excludeId={selectedWallet?._id}
                            />
                        </View>
                    )}

                    {/* Pay From Wallet Selector (Only for Expense) */}
                    {!isIncome && (
                        <View style={styles.section}>
                            <Text style={[styles.sectionTitle, { color: COLORS.textMuted }]}>
                                PAY FROM WALLET
                            </Text>
                            <WalletSelector
                                selectedWalletId={selectedWallet?._id}
                                onSelect={(w) => setSelectedWallet(w)}
                                COLORS={COLORS}
                                amountPHP={convertedPreview !== null ? convertedPreview : parseFloat(amount) || 0}
                                isExpense={true}
                            />
                            <Text style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 6, fontStyle: 'italic', paddingHorizontal: 4 }}>
                                * If no wallet is selected, it will automatically deduct from HAND.
                            </Text>
                        </View>
                    )}

                    {/* Note shown only for Income / Add Balance */}
                    {isIncome && (
                        <View style={styles.section}>
                            <Text style={{ fontSize: 10, color: COLORS.text, fontStyle: 'italic', paddingHorizontal: 4 }}>
                                * If no source wallet is selected, it means you are adding income/balance with no deduction from any wallet.
                            </Text>
                        </View>
                    )}


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
                    // Close alert instantly to give immediate feedback
                    closeAlert();
                    // Slight delay allows the modal to start its fade out before the heavy screen unmount
                    setTimeout(() => {
                        if (alert.onConfirm) {
                            alert.onConfirm();
                        } else if (alert.type === 'success') {
                            navigation.goBack();
                        }
                    }, 50);
                }}
                title={alert.title}
                message={alert.message}
                type={alert.type}
                confirmText={alert.type === 'confirm' ? 'Add Now' : (alert.type === 'success' ? 'Done' : 'Okay')}
                isLoading={isLoading && alert.type === 'success'}
            />

            {/* Calculator Sheet */}
            <CalculatorSheet
                visible={calculatorVisible}
                onClose={() => setCalculatorVisible(false)}
                onConfirm={(val) => setAmount(val)}
                initialValue={amount}
                currencySymbol={currency.symbol}
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
    maxBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.sm },
    maxBtnText: { fontSize: 10, fontWeight: '800' },
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
    itemName: { fontSize: 12, fontWeight: '600' },

    // Source chip styles (HAND / Savings Balance virtual source cards)
    sourceChip: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        padding: 12, borderRadius: 14, borderWidth: 1,
        position: 'relative', overflow: 'hidden',
    },
    sourceChipLabel: { fontSize: 13, fontWeight: '800' },
    sourceChipSub: { fontSize: 10, fontWeight: '600', marginTop: 1 },
    sourceCheckDot: {
        width: 16, height: 16, borderRadius: 8,
        justifyContent: 'center', alignItems: 'center',
    },
});
