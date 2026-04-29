import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, Modal, TouchableOpacity, TextInput,
    ActivityIndicator, ScrollView, TouchableWithoutFeedback, Image, Animated, KeyboardAvoidingView, Platform, Dimensions
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { addTripExpense, getWallets, getSavingsGoals, getExchangeRates, getProfile, scanReceipt } from '../../api/api';
import { useAuth } from '../../context/AuthContext';
import * as ImagePicker from 'expo-image-picker';
import { API_BASE } from '../../store/authStore';
import { radius, spacing } from '../../theme/colors';
import { FALLBACK_ICONS, IconRenderer, formatCurrency } from '../../utils/formatters';
import CalculatorSheet from '../../components/CalculatorSheet';
import CustomAlertModal from '../../components/CustomAlertModal';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_GAP = 8;
const CONTAINER_PADDING = 25;
const ICON_SIZE = (SCREEN_WIDTH - (CONTAINER_PADDING * 2) - (GRID_GAP * 4)) / 5;

const CATEGORIES = [
    { name: 'Food', icon: 'fast-food', color: '#f59e0b' },
    { name: 'Transport', icon: 'car', color: '#3b82f6' },
    { name: 'Hotel', icon: 'bed', color: '#8b5cf6' },
    { name: 'Attraction', icon: 'ticket', color: '#ec4899' },
    { name: 'Shopping', icon: 'shopping-bag', color: '#10b981' },
    { name: 'General', icon: 'dots-horizontal', color: '#64748b' },
    { name: 'Custom', icon: 'plus-circle', color: '#E91E8C' }
];

const PRESET_COLORS = ['#E91E8C', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', '#10b981', '#ef4444', '#6366f1', '#06b6d4', '#84cc16'];

export default function GroupWalletExpenseModal({ visible, onClose, onSuccess, groupId, members, currency, customCategories = [] }) {
    const COLORS = useTheme(state => state.COLORS);

    // Combine default categories with trip-specific custom ones
    const allCategories = [
        ...CATEGORIES.filter(c => c.name !== 'Custom'),
        ...(customCategories || []).map(c => ({ ...c, isCustom: true })),
        CATEGORIES.find(c => c.name === 'Custom')
    ];

    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('General');
    const [customCategoryName, setCustomCategoryName] = useState('');
    const [customCategoryIcon, setCustomCategoryIcon] = useState('plus-circle');
    const [customCategoryColor, setCustomCategoryColor] = useState(PRESET_COLORS[0]);
    const [showAllIcons, setShowAllIcons] = useState(false);
    const [showCalculator, setShowCalculator] = useState(false);
    const [splitAmongIds, setSplitAmongIds] = useState([]); // Empty = Everyone
    const [loading, setLoading] = useState(false);
    const [showCalc, setShowCalc] = useState(false);
    const [alert, setAlert] = useState({ visible: false, title: '', message: '', type: 'info' });
    const { userInfo: authUserInfo, updateLocalUser } = useAuth();
    const [freshUserInfo, setFreshUserInfo] = useState(null);
    const userInfo = freshUserInfo || authUserInfo;

    const [wallets, setWallets] = useState([]);
    const [savingsGoals, setSavingsGoals] = useState([]);
    const [rates, setRates] = useState({ PHP: 1 });
    const [conversionInfo, setConversionInfo] = useState(null); // { nativeAmount, rateLabel }
    const [selectedSource, setSelectedSource] = useState({ id: null, type: 'hand' }); // { id, type: 'hand' | 'savings' | 'wallet' }
    const scrollRef = React.useRef(null);

    const fadeAnim = React.useRef(new Animated.Value(0)).current;
    const slideAnim = React.useRef(new Animated.Value(SCREEN_HEIGHT)).current;
    const [modalVisible, setModalVisible] = useState(false);

    useEffect(() => {
        if (visible) {
            setModalVisible(true);
            loadSources();
            Animated.parallel([
                Animated.timing(fadeAnim, { toValue: 1, duration: 280, useNativeDriver: true }),
                Animated.spring(slideAnim, { toValue: 0, tension: 65, friction: 11, useNativeDriver: true })
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(fadeAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
                Animated.timing(slideAnim, { toValue: SCREEN_HEIGHT, duration: 260, useNativeDriver: true })
            ]).start(() => {
                setModalVisible(false);
            });
        }
    }, [visible]);

    const loadSources = async () => {
        try {
            const [wData, sData, rData, pData] = await Promise.all([
                getWallets(),
                getSavingsGoals(),
                getExchangeRates(userInfo?.currency || 'PHP'),
                getProfile()
            ]);
            setWallets(wData?.wallets || wData || []);

            // Unbox savings goals correctly
            const goalsArray = sData?.goals || sData || [];
            setSavingsGoals(Array.isArray(goalsArray) ? goalsArray : []);

            setRates(rData?.rates || { [userInfo?.currency || 'PHP']: 1 });

            if (pData) {
                setFreshUserInfo(pData);
                updateLocalUser(pData);
            }
        } catch (err) {
            console.error('[ExpenseModal] Load sources error:', err);
        }
    };

    const handleScanReceipt = async () => {
        try {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
                setAlert({ visible: true, title: 'Permission Required', message: 'Allow camera access to scan receipts.', type: 'warning' });
                return;
            }

            const result = await ImagePicker.launchCameraAsync({
                allowsEditing: true,
                quality: 0.8,
            });

            if (!result.canceled) {
                const uri = result.assets[0].uri;
                setLoading(true);

                const formData = new FormData();
                formData.append('receipt', {
                    uri: Platform.OS === 'ios' ? uri.replace('file://', '') : uri,
                    type: 'image/jpeg',
                    name: 'receipt.jpg',
                });

                const data = await scanReceipt(formData);

                if (data.amount) setAmount(String(data.amount));
                if (data.merchant) setDescription(data.merchant);
            }
        } catch (e) {
            console.warn('OCR error:', e);
            setAlert({ visible: true, title: 'Scan Failed', message: 'Failed to read the receipt. Please try again or enter details manually.', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!amount || parseFloat(amount) <= 0) {
            setAlert({
                visible: true,
                title: 'Amount Required',
                message: 'Please enter a valid amount for this expense.',
                type: 'warning'
            });
            return;
        }

        if (!description.trim()) {
            setAlert({
                visible: true,
                title: 'Description Required',
                message: 'What was this expense for? Please add a description.',
                type: 'warning'
            });
            return;
        }
        if (selectedCategory === 'Custom' && (!customCategoryName.trim() || !customCategoryIcon)) {
            setAlert({
                visible: true,
                title: 'Custom Category Required',
                message: 'Please enter a name and icon for your custom category.',
                type: 'warning'
            });
            return;
        }
        if (splitAmongIds.length === 0) {
            setAlert({
                visible: true,
                title: 'Selection Required',
                message: 'Who is sharing this expense? Please select participants.',
                type: 'warning'
            });
            return;
        }

        // Balance Validation
        const amountNum = parseFloat(amount);
        if (selectedSource.type === 'hand') {
            const hBal = userInfo?.handBalance || 0;
            if (hBal < amountNum) {
                setAlert({ visible: true, title: 'Insufficient HAND', message: `You need ${formatCurrency(amountNum, userInfo?.currency)} but only have ${formatCurrency(hBal, userInfo?.currency)} in your HAND wallet.`, type: 'error' });
                return;
            }
        } else if (selectedSource.type === 'savings') {
            const masterPot = savingsGoals?.find?.(g => g.name === 'Savings' || g.name === 'Savings Balance');
            const available = masterPot?.currentAmount || 0;
            if (available < amountNum) {
                setAlert({ visible: true, title: 'Insufficient Savings', message: `You need ${formatCurrency(amountNum, userInfo?.currency)} but only have ${formatCurrency(available, userInfo?.currency)} in your Savings Stash.`, type: 'error' });
                return;
            }
        } else if (selectedSource.type === 'wallet') {
            const wallet = wallets?.find?.(w => w._id === selectedSource.id);
            if (wallet && wallet.type !== 'Credit') {
                const symbol = (wallet.coinSymbol || wallet.currency || '').toUpperCase();
                const rate = rates[symbol] || 1;

                // If rate is e.g. 0.0000002 (BTC per 1 PHP)
                // then nativeNeeded = 2000 PHP * 0.0000002 = 0.0004 BTC
                const nativeNeeded = amountNum * rate;
                const currentBalance = wallet.balance || 0;

                if (currentBalance < nativeNeeded) {
                    const unit = wallet.type === 'Crypto' ? wallet.coinSymbol : wallet.currency;
                    const marketPrice = 1 / (rate || 1);
                    setAlert({
                        visible: true,
                        title: 'Insufficient Balance',
                        message: `Your ${wallet.name} wallet doesn't have enough funds. You need ${nativeNeeded.toFixed(wallet.type === 'Crypto' ? 8 : 2)} ${unit} (₱${amountNum.toLocaleString()}) but only have ${currentBalance.toFixed(wallet.type === 'Crypto' ? 8 : 2)} ${unit}.\n\nMarket Rate: 1 ${unit} ≈ ₱${marketPrice.toLocaleString()}`,
                        type: 'error'
                    });
                    return;
                }
            }
        }


        setLoading(true);
        try {
            const isCustom = selectedCategory === 'Custom';
            const catObj = allCategories.find(c => c.name === selectedCategory);

            let walletDeductAmount = null;
            if (selectedSource.type === 'wallet') {
                const wallet = wallets?.find?.(w => w._id === selectedSource.id);
                if (wallet && (wallet.type === 'Crypto' || wallet.currency !== 'PHP')) {
                    const symbol = (wallet.coinSymbol || wallet.currency || '').toUpperCase();
                    const rate = rates[symbol] || 0;
                    if (rate > 0) {
                        walletDeductAmount = parseFloat(amount) * rate;
                    }
                }
            }

            await addTripExpense(groupId, {
                amount: parseFloat(amount),
                description: description.trim(),
                category: isCustom ? (customCategoryName.trim() || 'Custom') : selectedCategory,
                categoryIcon: isCustom ? customCategoryIcon : catObj?.icon,
                categoryColor: isCustom ? customCategoryColor : (catObj?.color || '#64748b'),
                splitAmongIds,
                walletId: selectedSource.type === 'wallet' ? selectedSource.id : null,
                sourceType: selectedSource.type === 'hand' ? 'hand' : (selectedSource.type === 'savings' ? 'savings_balance' : null),
                walletDeductAmount
            });
            reset();
            onSuccess();
        } catch (err) {
            console.error('[AddExpense] Error:', err);
        } finally {
            setLoading(false);
        }
    };

    const reset = () => {
        setAmount('');
        setDescription('');
        setSelectedCategory('General');
        setCustomCategoryName('');
        setCustomCategoryIcon('plus-circle');
        setCustomCategoryColor('#E91E8C');
        setSplitAmongIds([]);
    };

    const toggleSplit = (id) => {
        if (splitAmongIds.includes(id)) {
            setSplitAmongIds(prev => prev.filter(i => i !== id));
        } else {
            setSplitAmongIds(prev => [...prev, id]);
        }
    };

    return (
        <Modal visible={modalVisible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
            {/* Backdrop */}
            <TouchableWithoutFeedback onPress={onClose}>
                <Animated.View style={[styles.modalOverlay, { opacity: fadeAnim }]} />
            </TouchableWithoutFeedback>

            {/* Sliding Content */}
            <Animated.View
                style={[
                    styles.content,
                    {
                        backgroundColor: COLORS.surface,
                        transform: [{ translateY: slideAnim }]
                    }
                ]}
            >
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={{ flexShrink: 1 }}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
                >
                    <View style={styles.header}>
                        <Text style={[styles.title, { color: COLORS.text }]}>Add Expense</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 15 }}>
                            <TouchableOpacity onPress={handleScanReceipt} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <Feather name="maximize" size={18} color={COLORS.primary} />
                                <Text style={{ fontSize: 12, fontWeight: '800', color: COLORS.primary }}>SCAN</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={onClose}>
                                <Feather name="x" size={24} color={COLORS.textMuted} />
                            </TouchableOpacity>
                        </View>
                    </View>

                    <ScrollView
                        ref={scrollRef}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        contentContainerStyle={{ paddingBottom: 20, flexGrow: 1 }}
                        style={{ flexShrink: 1 }}
                    >
                        {/* Amount Input */}
                        <TouchableOpacity
                            style={styles.amountBox}
                            onPress={() => setShowCalc(true)}
                            activeOpacity={0.7}
                        >
                            <Text style={[styles.currency, { color: COLORS.primary }]}>{currency === 'PHP' ? '₱' : '$'}</Text>
                            <Text style={[styles.amountInput, { color: amount ? COLORS.text : COLORS.textMuted }]}>
                                {amount || '0.00'}
                            </Text>
                        </TouchableOpacity>

                        {/* Market Conversion Preview Label */}
                        {selectedSource.type === 'wallet' && amount && parseFloat(amount) > 0 && (() => {
                            const wallet = wallets?.find(w => w._id === selectedSource.id);
                            if (wallet && (wallet.type === 'Crypto' || wallet.currency !== 'PHP')) {
                                const symbol = (wallet.coinSymbol || wallet.currency || '').toUpperCase();
                                const rate = rates[symbol] || 0;
                                if (rate > 0) {
                                    const nativeAmount = parseFloat(amount) * rate;
                                    const marketPrice = 1 / rate;
                                    const unit = wallet.coinSymbol || wallet.currency;
                                    return (
                                        <View style={styles.conversionPreviewContainer}>
                                            <View style={styles.conversionRow}>
                                                <MaterialCommunityIcons name="swap-horizontal" size={16} color={COLORS.textMuted} />
                                                <Text style={[styles.conversionText, { color: COLORS.textMuted }]}>
                                                    ≈ {nativeAmount.toLocaleString(undefined, { maximumFractionDigits: 8 })} {unit} deducted
                                                </Text>
                                            </View>
                                            <View style={[styles.marketRateTag, { backgroundColor: COLORS.primary + '15' }]}>
                                                <Text style={[styles.marketRateText, { color: COLORS.primary }]}>
                                                    1 {unit} is ≈ to ₱{marketPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </Text>
                                            </View>
                                        </View>
                                    );
                                }
                            }
                            return null;
                        })()}

                        {/* Description */}
                        <View style={[styles.inputGroup, { backgroundColor: COLORS.background, borderColor: COLORS.border }]}>
                            <TextInput
                                style={[styles.descInput, { color: COLORS.text }]}
                                placeholder="What was this for?"
                                placeholderTextColor={COLORS.textMuted}
                                value={description}
                                onChangeText={setDescription}
                            />
                        </View>

                        {/* Category */}
                        <Text style={[styles.label, { color: COLORS.textMuted }]}>CATEGORY</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catScroll}>
                            {allCategories.map(cat => (
                                <TouchableOpacity
                                    key={cat.name}
                                    onPress={() => setSelectedCategory(cat.name)}
                                    style={[styles.catBtn, { backgroundColor: selectedCategory === cat.name ? (cat.color || '#64748b') + '20' : COLORS.background, borderColor: selectedCategory === cat.name ? (cat.color || '#64748b') : COLORS.border }]}
                                >
                                    <IconRenderer name={cat.icon} size={20} color={selectedCategory === cat.name ? (cat.color || '#64748b') : COLORS.textMuted} />
                                    <Text style={[styles.catText, { color: selectedCategory === cat.name ? (cat.color || '#64748b') : COLORS.textMuted }]}>{cat.name}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        {/* Custom Category Options */}
                        {selectedCategory === 'Custom' && (
                            <View style={styles.customCatSection}>
                                <Text style={[styles.label, { color: COLORS.textMuted, fontSize: 10, marginTop: 12 }]}>CUSTOM CATEGORY DETAILS</Text>
                                <View style={[styles.inputGroup, { backgroundColor: COLORS.background, borderColor: COLORS.border, marginTop: 8 }]}>
                                    <TextInput
                                        style={[styles.descInput, { color: COLORS.text }]}
                                        placeholder="Category Name (e.g. Souvenirs)"
                                        placeholderTextColor={COLORS.textMuted}
                                        value={customCategoryName}
                                        onChangeText={setCustomCategoryName}
                                    />
                                </View>
                                <View style={styles.iconPickerHeader}>
                                    <Text style={[styles.label, { color: COLORS.textMuted, marginTop: 12, marginBottom: 0 }]}>PICK ICON</Text>
                                    <TouchableOpacity onPress={() => setShowAllIcons(!showAllIcons)}>
                                        <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.primary, marginTop: 12 }}>
                                            {showAllIcons ? 'Show Less' : 'Show More'}
                                        </Text>
                                    </TouchableOpacity>
                                </View>

                                {showAllIcons ? (
                                    <View style={styles.iconGrid}>
                                        {FALLBACK_ICONS.map(icon => {
                                            const isSelected = customCategoryIcon === icon;
                                            return (
                                                <TouchableOpacity
                                                    key={icon}
                                                    onPress={() => setCustomCategoryIcon(icon)}
                                                    style={[
                                                        styles.gridItem,
                                                        {
                                                            backgroundColor: isSelected ? COLORS.primary + '20' : COLORS.background,
                                                            borderColor: isSelected ? COLORS.primary : COLORS.border,
                                                            borderWidth: 1.5,
                                                        }
                                                    ]}
                                                >
                                                    <IconRenderer name={icon} size={20} color={isSelected ? COLORS.primary : COLORS.textMuted} />
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                ) : (
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.iconPickerScroll}>
                                        {FALLBACK_ICONS.slice(0, 15).map(icon => {
                                            const isSelected = customCategoryIcon === icon;
                                            return (
                                                <TouchableOpacity
                                                    key={icon}
                                                    onPress={() => setCustomCategoryIcon(icon)}
                                                    style={[
                                                        styles.iconPickerItem,
                                                        {
                                                            backgroundColor: isSelected ? COLORS.primary + '20' : COLORS.background,
                                                            borderColor: isSelected ? COLORS.primary : COLORS.border,
                                                            borderWidth: 1.5,
                                                        }
                                                    ]}
                                                >
                                                    <IconRenderer name={icon} size={20} color={isSelected ? COLORS.primary : COLORS.textMuted} />
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </ScrollView>
                                )}

                                <Text style={[styles.label, { color: COLORS.textMuted, marginTop: 12, marginBottom: 6 }]}>PICK COLOR</Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.colorPickerScroll}>
                                    {PRESET_COLORS.map(clr => (
                                        <TouchableOpacity
                                            key={clr}
                                            onPress={() => setCustomCategoryColor(clr)}
                                            style={[
                                                styles.colorCircle,
                                                { backgroundColor: clr }
                                            ]}
                                        >
                                            {customCategoryColor === clr && (
                                                <Feather name="check" size={16} color="#fff" />
                                            )}
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>
                        )}

                        {/* Split Logic */}
                        <View style={styles.sectionHeader}>
                            <Text style={[styles.label, { color: COLORS.textMuted }]}>SPLIT AMONG</Text>
                            <TouchableOpacity onPress={() => setSplitAmongIds(members.map(m => m._id || m.user?._id))}>
                                <Text style={[styles.clearText, { color: COLORS.primary }]}>Everyone</Text>
                            </TouchableOpacity>
                        </View>

                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.memberGrid}>
                            {members.map(member => {
                                const mId = member._id || member.user?._id;
                                const isSelected = splitAmongIds.includes(mId);
                                return (
                                    <TouchableOpacity
                                        key={mId}
                                        onPress={() => toggleSplit(mId)}
                                        style={[styles.memberChip, {
                                            backgroundColor: isSelected ? COLORS.primary + '15' : COLORS.background,
                                            borderColor: isSelected ? COLORS.primary : COLORS.border
                                        }]}
                                    >
                                        <View style={styles.miniAvatar}>
                                            {(member.avatarUrl || member.avatar) ? (
                                                <Image
                                                    source={{
                                                        uri: (member.avatarUrl || member.avatar).startsWith('http')
                                                            ? (member.avatarUrl || member.avatar)
                                                            : `${API_BASE.replace('/api', '')}/${member.avatarUrl || member.avatar}`
                                                    }}
                                                    style={styles.avatarImg}
                                                    resizeMode="cover"
                                                />
                                            ) : (
                                                <Feather name="user" size={14} color={isSelected ? COLORS.primary : COLORS.textMuted} />
                                            )}
                                        </View>
                                        <Text style={[styles.memberName, { color: isSelected ? COLORS.primary : COLORS.text }]} numberOfLines={1}>
                                            {member.name}
                                        </Text>
                                        {isSelected && <Feather name="check-circle" size={12} color={COLORS.primary} style={{ marginLeft: 4 }} />}
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>

                        {/* Split Breakdown */}
                        {parseFloat(amount) > 0 && splitAmongIds.length > 0 && (
                            <View style={styles.breakdownContainer}>
                                <Text style={[styles.sectionTitle, { color: COLORS.textMuted, fontSize: 10, marginBottom: 12, marginTop: 10 }]}>SPLIT BREAKDOWN</Text>
                                {members.filter(m => splitAmongIds.includes(m._id || m.user?._id)).map((member) => {
                                    const mId = member._id || member.user?._id;
                                    const mName = member.name || member.user?.name || 'User';
                                    const mAvatar = member.avatarUrl || member.avatar || member.user?.avatarUrl || member.user?.avatar;
                                    const splitCount = splitAmongIds.length === 0 ? members.length : splitAmongIds.length;
                                    const share = (parseFloat(amount) || 0) / splitCount;

                                    return (
                                        <View key={mId} style={styles.breakdownRow}>
                                            <View style={styles.breakdownLeft}>
                                                <View style={styles.memberAvatarContainer}>
                                                    {mAvatar ? (
                                                        <Image
                                                            source={{
                                                                uri: mAvatar.startsWith('http')
                                                                    ? mAvatar
                                                                    : `${API_BASE.replace('/api', '')}/${mAvatar}`
                                                            }}
                                                            style={styles.breakdownAvatar}
                                                            resizeMode="cover"
                                                        />
                                                    ) : (
                                                        <View style={[styles.breakdownAvatarFallback, { backgroundColor: COLORS.surfaceAlt }]}>
                                                            <Feather name="user" size={10} color={COLORS.textMuted} />
                                                        </View>
                                                    )}
                                                </View>
                                                <Text style={[styles.breakdownName, { color: COLORS.text }]}>{mName}</Text>
                                            </View>
                                            <Text style={[styles.breakdownAmount, { color: COLORS.primary }]}>
                                                ₱{share.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </Text>
                                        </View>
                                    );
                                })}
                            </View>
                        )}

                        {/* Payment Source Selection */}
                        <Text style={[styles.label, { color: COLORS.textMuted }]}>PAYMENT METHOD</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sourceScroll}>
                            {/* HAND */}
                            <TouchableOpacity
                                onPress={() => setSelectedSource({ id: null, type: 'hand' })}
                                style={[styles.sourceDetailedChip, {
                                    backgroundColor: selectedSource.type === 'hand' ? '#e91e6315' : COLORS.background,
                                    borderColor: selectedSource.type === 'hand' ? '#e91e63' : COLORS.border
                                }]}
                            >
                                <MaterialCommunityIcons name="hand-coin" size={18} color={selectedSource.type === 'hand' ? '#e91e63' : COLORS.textMuted} />
                                <View>
                                    <Text style={[styles.sourceTitle, { color: selectedSource.type === 'hand' ? '#e91e63' : COLORS.text }]}>HAND</Text>
                                    <Text style={[styles.sourceSub, { color: COLORS.textMuted }]}>{formatCurrency(userInfo?.HandBalance || userInfo?.handBalance || 0, userInfo?.currency)}</Text>
                                </View>
                            </TouchableOpacity>

                            {/* Savings */}
                            <TouchableOpacity
                                onPress={() => setSelectedSource({ id: null, type: 'savings' })}
                                style={[styles.sourceDetailedChip, {
                                    backgroundColor: selectedSource.type === 'savings' ? COLORS.primary + '15' : COLORS.background,
                                    borderColor: selectedSource.type === 'savings' ? COLORS.primary : COLORS.border
                                }]}
                            >
                                <MaterialCommunityIcons name="piggy-bank" size={18} color={selectedSource.type === 'savings' ? COLORS.primary : COLORS.textMuted} />
                                <View>
                                    <Text style={[styles.sourceTitle, { color: selectedSource.type === 'savings' ? COLORS.primary : COLORS.text }]}>Savings</Text>
                                    <Text style={[styles.sourceSub, { color: COLORS.textMuted }]}>
                                        {formatCurrency(savingsGoals?.find?.(g => g.name === 'Savings' || g.name === 'Savings Balance')?.currentAmount || 0, userInfo?.currency)}
                                    </Text>
                                </View>
                            </TouchableOpacity>

                            {/* Wallets */}
                            {wallets?.map?.(w => (
                                <TouchableOpacity
                                    key={w._id}
                                    onPress={() => setSelectedSource({ id: w._id, type: 'wallet' })}
                                    style={[styles.sourceDetailedChip, {
                                        backgroundColor: selectedSource.id === w._id ? (w.color || COLORS.primary) + '15' : COLORS.background,
                                        borderColor: selectedSource.id === w._id ? (w.color || COLORS.primary) : COLORS.border
                                    }]}
                                >
                                    <MaterialCommunityIcons
                                        name={w.type === 'Crypto' ? 'bitcoin' : (w.type === 'Credit' ? 'credit-card' : 'wallet')}
                                        size={18}
                                        color={selectedSource.id === w._id ? (w.color || COLORS.primary) : COLORS.textMuted}
                                    />
                                    <View>
                                        <Text style={[styles.sourceTitle, { color: selectedSource.id === w._id ? (w.color || COLORS.primary) : COLORS.text }]}>{w.name}</Text>
                                        <Text style={[styles.sourceSub, { color: COLORS.textMuted }]}>
                                            {w.type === 'Crypto' ? `${w.balance?.toFixed(8)} ${w.coinSymbol}` : formatCurrency(w.balance || 0, w.currency || 'PHP')}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        <TouchableOpacity
                            onPress={handleSave}
                            disabled={loading}
                            style={[styles.saveBtn, { backgroundColor: COLORS.primary }]}
                        >
                            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Add Expense</Text>}
                        </TouchableOpacity>
                    </ScrollView>
                </KeyboardAvoidingView>
            </Animated.View>

            <CalculatorSheet
                visible={showCalc}
                onClose={() => setShowCalc(false)}
                onConfirm={(val) => {
                    setAmount(val);
                    setShowCalc(false);
                }}
                initialValue={amount}
                currencySymbol={currency === 'PHP' ? '₱' : '$'}
            />

            <CustomAlertModal
                visible={alert.visible}
                title={alert.title}
                message={alert.message}
                type={alert.type}
                onClose={() => setAlert({ ...alert, visible: false })}
            />

        </Modal>
    );
}

const styles = StyleSheet.create({
    modalOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.55)',
    },
    content: {
        position: 'absolute', bottom: 0, left: 0, right: 0,
        borderTopLeftRadius: 30, borderTopRightRadius: 30,
        padding: 25, maxHeight: SCREEN_HEIGHT * 0.94
    },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    title: { fontSize: 20, fontWeight: '800' },
    amountBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginVertical: 20 },
    currency: { fontSize: 28, fontWeight: '800', marginRight: 8 },
    amountInput: { fontSize: 44, fontWeight: '900', textAlign: 'center', minWidth: 100 },
    inputGroup: { height: 56, borderRadius: 16, borderWidth: 1.5, paddingHorizontal: 16, justifyContent: 'center' },
    descInput: { fontSize: 16, fontWeight: '600' },
    label: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginTop: 25, marginBottom: 12 },
    catScroll: { gap: 10, paddingBottom: 4 },
    catBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, borderWidth: 1.5, gap: 8 },
    catText: { fontSize: 13, fontWeight: '700' },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
    clearText: { fontSize: 12, fontWeight: '700' },
    memberGrid: { flexDirection: 'row', gap: 10, marginTop: 10, paddingRight: 20 },
    memberChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 16,
        borderWidth: 1.5,
    },
    miniAvatar: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: 'rgba(0,0,0,0.05)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 8
    },
    avatarImg: { width: '100%', height: '100%', borderRadius: 12 },
    avatarInitial: { fontSize: 10, fontWeight: '700' },
    memberName: { fontSize: 12, fontWeight: '700' },
    saveBtn: { height: 60, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginTop: 35 },
    saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
    customCatSection: { marginTop: 8 },
    iconPickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    viewMore: { fontSize: 11, fontWeight: '700', marginTop: 12, marginBottom: 8 },
    iconPickerScroll: { flexDirection: 'row', marginBottom: 10 },
    iconPickerItem: {
        width: ICON_SIZE,
        height: ICON_SIZE,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: GRID_GAP,
    },
    iconGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 5,
        marginBottom: 10,
    },
    gridItem: {
        width: ICON_SIZE,
        height: ICON_SIZE,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    colorPickerScroll: { flexDirection: 'row', gap: 10, paddingVertical: 5 },
    colorCircle: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)', marginRight: 8, justifyContent: 'center', alignItems: 'center' },
    breakdownContainer: {
        marginTop: 20,
        paddingTop: 15,
        borderTopWidth: 1,
        borderTopColor: 'rgba(0,0,0,0.05)',
        gap: 12
    },
    breakdownRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    breakdownLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10
    },
    memberAvatarContainer: {
        width: 32,
        height: 32,
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.05)'
    },
    breakdownAvatar: {
        width: '100%',
        height: '100%'
    },
    breakdownAvatarFallback: {
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center'
    },
    breakdownName: {
        fontSize: 13,
        fontWeight: '600'
    },
    breakdownAmount: {
        fontSize: 14,
        fontWeight: '800'
    },
    sourceScroll: { flexDirection: 'row', gap: 12, paddingRight: 20, paddingBottom: 5 },
    sourceDetailedChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 18,
        borderWidth: 1.5,
        gap: 12,
        minWidth: 130
    },
    sourceTitle: { fontSize: 13, fontWeight: '800' },
    sourceSub: { fontSize: 10, fontWeight: '600', marginTop: 1 },
    conversionPreviewContainer: {
        alignItems: 'center',
        marginBottom: 20,
        gap: 8
    },
    conversionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6
    },
    conversionText: {
        fontSize: 14,
        fontWeight: '700'
    },
    marketRateTag: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 10,
    },
    marketRateText: {
        fontSize: 11,
        fontWeight: '800'
    }
});
