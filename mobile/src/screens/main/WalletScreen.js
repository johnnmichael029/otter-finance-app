import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, Dimensions,
    ActivityIndicator, Image, ScrollView, Animated
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../context/ThemeContext';
import { useFinanceStore } from '../../store/financeStore';
import { useAuthStore } from '../../store/authStore';
import { getSocket } from '../../utils/socket';
import * as api from '../../api/api';
import AddWalletModal from './AddWalletModal';
import EditWalletModal from './EditWalletModal';
import CustomAlertModal from '../../components/CustomAlertModal';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 40 - 15) / 2;
const CARD_HEIGHT = CARD_WIDTH * 0.65;

// ─── Type-aware default gradients ────────────────────────────────────────────
const TYPE_GRADIENTS = {
    'Debit': ['#059669', '#047857'],
    'Credit': ['#DC2626', '#991B1B'],
    'Stocks': ['#4F46E5', '#3730A3'],
    'Crypto': ['#F7931A', '#B45309'],
    'E-Wallet': ['#2563EB', '#1D4ED8'],
    'Cash': ['#059669', '#047857'],
};

// ─── Account type chip icons (matching AddWalletModal) ────────────────────────
const getTypeIcon = (type, size = 20) => {
    const color = 'rgba(255,255,255,0.85)';
    switch (type) {
        case 'Debit': return <MaterialCommunityIcons name="wallet-outline" size={size} color={color} />;
        case 'Credit': return <MaterialCommunityIcons name="credit-card-outline" size={size} color={color} />;
        case 'Stocks': return <MaterialCommunityIcons name="chart-line" size={size} color={color} />;
        case 'Crypto': return <MaterialCommunityIcons name="bitcoin" size={size} color={color} />;
        case 'E-Wallet': return <MaterialCommunityIcons name="cellphone" size={size} color={color} />;
        default: return <Feather name="pocket" size={size} color={color} />;
    }
};

// ─── Branding Engine ──────────────────────────────────────────────────────────
const getCardBranding = (wallet) => {
    switch (wallet.templateId) {
        case 'gcash': return { logoText: 'GCash', gradient: ['#007CF8', '#0056b3'], textColor: '#fff' };
        case 'bdo': return { logoText: 'BDO', gradient: ['#2B6CB0', '#1A365D'], textColor: '#fff' };
        case 'bpi': return { logoText: 'BPI', gradient: ['#E53E3E', '#9B2C2C'], textColor: '#fff' };
        case 'unionbank': return { logoText: 'UB', gradient: ['#ED8936', '#C05621'], textColor: '#fff' };
        case 'btc': return { logoText: 'BTC', gradient: ['#F7931A', '#B56505'], textColor: '#fff' };
        default: {
            const grad = TYPE_GRADIENTS[wallet.type] || ['#374151', '#1F2937'];
            return { gradient: grad, textColor: '#fff' };
        }
    }
};

// ─── Bank Card ────────────────────────────────────────────────────────────────
const BankCard = ({ wallet, onPress, onToggleHide }) => {
    const brand = getCardBranding(wallet);
    const isCredit = wallet.type === 'Credit';
    const isCrypto = wallet.type === 'Crypto' && wallet.coinSymbol;
    const currencySymbol = isCrypto ? wallet.coinSymbol : '₱';
    // Credit balances represent debt owed — always display as a positive number
    const displayBalance = isCredit ? Math.abs(wallet.balance) : wallet.balance;
    const numBalance = isCrypto
        ? displayBalance.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 8 })
        : displayBalance.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    const formattedBalance = wallet.hideBalance ? '••••••' : numBalance;

    const renderTopRight = () => {
        if (wallet.coinImageUrl) return <Image source={{ uri: wallet.coinImageUrl }} style={styles.coinImage} />;
        if (wallet.type === 'Stocks' && wallet.stockSymbol) {
            return <Text style={[styles.bankLogoText, { color: brand.textColor }]}>{wallet.stockSymbol}</Text>;
        }
        if (brand.logoText) return <Text style={[styles.bankLogoText, { color: brand.textColor }]}>{brand.logoText}</Text>;
        return null;
    };

    return (
        <TouchableOpacity style={styles.cardWrapper} onPress={() => onPress(wallet)} activeOpacity={0.82}>
            <LinearGradient colors={brand.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cardContainer}>
                <View style={styles.cardTop}>
                    {getTypeIcon(wallet.type, 20)}
                    <View style={styles.logoContainer}>{renderTopRight()}</View>
                </View>

                <View style={styles.cardMiddle}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <Text style={styles.balanceLabel}>BALANCE</Text>
                        <TouchableOpacity onPress={(e) => { e.stopPropagation(); onToggleHide(wallet); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <Feather name={wallet.hideBalance ? 'eye-off' : 'eye'} size={12} color="rgba(255,255,255,0.7)" />
                        </TouchableOpacity>
                    </View>
                    <Text style={[styles.balanceAmount, { color: brand.textColor }]} numberOfLines={1} adjustsFontSizeToFit>
                        {wallet.hideBalance ? '' : currencySymbol + ' '}
                        {formattedBalance}
                    </Text>
                </View>

                <Text style={[styles.walletName, { color: brand.textColor }]} numberOfLines={1}>{wallet.name}</Text>
            </LinearGradient>
        </TouchableOpacity>
    );
};

// ─── Balance Helper ───────────────────────────────────────────────────────────
const getConvertedBalance = (wallet, prices) => {
    if (wallet.type === 'Crypto' && wallet.coinId) {
        const rate = prices[wallet.coinId] || 0;
        return wallet.balance * rate;
    }
    return wallet.balance;
};

// ─── Net Worth Header ─────────────────────────────────────────────────────────
const NetWorthHeader = ({ wallets, prices, hideVal, onToggleHide, COLORS, navigation }) => {
    const { userInfo } = useAuthStore();
    const assets = (userInfo?.handBalance || 0) + wallets.filter(w => w.type !== 'Credit').reduce((s, w) => s + getConvertedBalance(w, prices), 0);
    const liabilities = wallets.filter(w => w.type === 'Credit').reduce((s, w) => s + Math.abs(getConvertedBalance(w, prices)), 0);
    const netWorth = assets - liabilities;

    return (
        <LinearGradient colors={['#E91E8C', '#9C27B0']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.netWorthCard}>
            <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => navigation.navigate('NetWorth')}
            >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={styles.nwLabel}>TOTAL NET WORTH</Text>
                    <TouchableOpacity onPress={onToggleHide} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}>
                        <Feather name={hideVal ? 'eye-off' : 'eye'} size={18} color="rgba(255,255,255,0.8)" />
                    </TouchableOpacity>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={styles.nwAmount}>
                        {hideVal ? '••••••••' : `₱ ${netWorth.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
                    </Text>
                    <Feather name="chevron-right" size={20} color="rgba(255,255,255,0.5)" style={{ marginLeft: 8, marginBottom: 12 }} />
                </View>
            </TouchableOpacity>
            <View style={styles.nwRow}>
                <View style={styles.nwPill}>
                    <Feather name="trending-up" size={12} color="rgba(255,255,255,0.8)" />
                    <Text style={styles.nwPillLabel}>ASSETS</Text>
                    <Text style={styles.nwPillValue}>{hideVal ? '••••' : `₱ ${assets.toLocaleString('en-US', { maximumFractionDigits: 0 })}`}</Text>
                </View>
                <View style={[styles.nwPill, { backgroundColor: 'rgba(0,0,0,0.2)' }]}>
                    <Feather name="trending-down" size={12} color="rgba(255,255,255,0.8)" />
                    <Text style={styles.nwPillLabel}>LIABILITIES</Text>
                    <Text style={styles.nwPillValue}>{hideVal ? '••••' : `₱ ${liabilities.toLocaleString('en-US', { maximumFractionDigits: 0 })}`}</Text>
                </View>
            </View>
        </LinearGradient>
    );
};

// ─── Insights Panel ───────────────────────────────────────────────────────────
const InsightsPanel = ({ wallets, prices, hideVal, COLORS }) => {
    const [expanded, setExpanded] = useState(false);
    const anim = useState(new Animated.Value(0))[0];

    const toggle = () => {
        const toValue = expanded ? 0 : 1;
        Animated.spring(anim, { toValue, useNativeDriver: false, tension: 60, friction: 10 }).start();
        setExpanded(!expanded);
    };

    const assets = wallets.filter(w => w.type !== 'Credit');
    const credits = wallets.filter(w => w.type === 'Credit');

    // Sort by converted balance
    const topWallet = assets.length ? [...assets].sort((a, b) => getConvertedBalance(b, prices) - getConvertedBalance(a, prices))[0] : null;
    const avgBalance = assets.length ? (assets.reduce((s, w) => s + getConvertedBalance(w, prices), 0) / assets.length) : 0;
    const totalDebt = credits.reduce((s, w) => s + getConvertedBalance(w, prices), 0);

    const insights = [
        {
            icon: 'award', color: '#22c55e',
            label: 'Top Wallet',
            value: topWallet ? `${topWallet.name}` : 'None',
            sub: topWallet ? (hideVal ? '••••' : `₱ ${getConvertedBalance(topWallet, prices).toLocaleString('en-US', { maximumFractionDigits: 0 })}`) : '—'
        },
        {
            icon: 'layers', color: '#3b82f6',
            label: 'Total Accounts',
            value: `${wallets.length} wallets`,
            sub: `${assets.length} assets · ${credits.length} credit`
        },
        {
            icon: 'bar-chart-2', color: '#8b5cf6',
            label: 'Average Balance',
            value: hideVal ? '••••' : `₱ ${avgBalance.toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
            sub: 'across asset accounts'
        },
        {
            icon: 'alert-circle', color: '#ef4444',
            label: 'Credit Exposure',
            value: hideVal ? '••••' : `₱ ${totalDebt.toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
            sub: totalDebt === 0 ? 'No outstanding credit' : `${credits.length} credit card(s)`
        },
    ];

    const maxHeight = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 280] });

    return (
        <View style={[styles.insightsContainer, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
            <TouchableOpacity style={styles.insightsHeader} onPress={toggle} activeOpacity={0.8}>
                <View style={styles.insightsTitleRow}>
                    <Feather name="zap" size={16} color={COLORS.primary} />
                    <Text style={[styles.insightsTitle, { color: COLORS.text }]}>Wallet Insights</Text>
                </View>
                <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.textMuted} />
            </TouchableOpacity>

            <Animated.View style={{ overflow: 'hidden', maxHeight }}>
                <View style={styles.insightsGrid}>
                    {insights.map((item, i) => (
                        <View key={i} style={[styles.insightCard, { backgroundColor: COLORS.background, borderColor: COLORS.border }]}>
                            <View style={[styles.insightIconCircle, { backgroundColor: item.color + '18' }]}>
                                <Feather name={item.icon} size={18} color={item.color} />
                            </View>
                            <Text style={[styles.insightLabel, { color: COLORS.textMuted }]}>{item.label}</Text>
                            <Text style={[styles.insightValue, { color: COLORS.text }]} numberOfLines={1}>{item.value}</Text>
                            <Text style={[styles.insightSub, { color: COLORS.textMuted }]} numberOfLines={1}>{item.sub}</Text>
                        </View>
                    ))}
                </View>
            </Animated.View>
        </View>
    );
};

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function WalletScreen({ navigation }) {
    const COLORS = useTheme(state => state.COLORS);
    const wallets = useFinanceStore(state => state.wallets);
    const fetchWallets = useFinanceStore(state => state.fetchWallets);
    const isLoadingWallets = useFinanceStore(state => state.isLoadingWallets);
    const cryptoPrices = useFinanceStore(state => state.cryptoPrices);
    const hideGlobalBalance = useFinanceStore(state => state.hideGlobalBalance);
    const setHideGlobalBalance = useFinanceStore(state => state.setHideGlobalBalance);
    const { userInfo } = useAuthStore();

    const [isAddModalVisible, setAddModalVisible] = useState(false);
    const [editingWallet, setEditingWallet] = useState(null);
    const [alert, setAlert] = useState({ visible: false, type: 'info', title: '', message: '', onConfirm: null, extraActions: null });

    useEffect(() => {
        fetchWallets();
        if (!userInfo?._id) return;
        const socket = getSocket();
        const onCreated = (w) => useFinanceStore.setState(s => ({ wallets: [...s.wallets, w] }));
        const onUpdated = (w) => useFinanceStore.setState(s => ({ wallets: s.wallets.map(x => x._id === w._id ? w : x) }));
        const onDeleted = ({ _id }) => useFinanceStore.setState(s => ({ wallets: s.wallets.filter(x => x._id !== _id) }));
        socket.on('wallet_created', onCreated);
        socket.on('wallet_updated', onUpdated);
        socket.on('wallet_deleted', onDeleted);
        return () => {
            socket.off('wallet_created', onCreated);
            socket.off('wallet_updated', onUpdated);
            socket.off('wallet_deleted', onDeleted);
        };
    }, [userInfo?._id]);

    useEffect(() => {
        // Refetch prices passively when wallets alter
        useFinanceStore.getState().fetchCryptoPrices(wallets);
    }, [wallets.filter(w => w.type === 'Crypto').length]);

    const handleCardPress = useCallback((wallet) => {
        const coinBal = getConvertedBalance(wallet, useFinanceStore.getState().cryptoPrices);
        const balString = wallet.type === 'Crypto' && wallet.coinSymbol
            ? `${wallet.coinSymbol} ${wallet.balance}\n(~₱${coinBal.toLocaleString('en-US', { maximumFractionDigits: 2 })})`
            : `₱ ${wallet.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

        setAlert({
            visible: true, type: 'warning',
            title: wallet.name,
            message: `Balance: ${balString} \nAccount: ${wallet.type}`,
            onConfirm: null,
            extraActions: [
                {
                    label: 'Add Balance', icon: 'plus-circle',
                    onPress: () => {
                        setAlert(a => ({ ...a, visible: false }));
                        navigation.navigate('AddTransaction', {
                            type: 'income',
                            preselectedWallet: wallet
                        });
                    }
                },
                {
                    label: 'Edit Wallet', icon: 'edit-2',
                    onPress: () => { setAlert(a => ({ ...a, visible: false })); setEditingWallet(wallet); }
                },
                {
                    label: 'Delete Wallet', icon: 'trash-2', danger: true,
                    onPress: () => { setAlert(a => ({ ...a, visible: false })); confirmDelete(wallet); }
                }
            ]
        });
    }, []);

    const confirmDelete = useCallback((wallet) => {
        setAlert({
            visible: true, type: 'error',
            title: 'Delete Wallet',
            message: `Permanently delete "${wallet.name}"? This cannot be undone.`,
            extraActions: null,
            onConfirm: async () => {
                try { await api.deleteWallet(wallet._id); } catch (e) { console.warn(e.message); }
                setAlert(a => ({ ...a, visible: false }));
            }
        });
    }, []);

    const handleToggleHide = useCallback(async (wallet) => {
        // Optimistic UI update could go here, but since websocket handles updates, it will sync soon
        try {
            await api.updateWallet(wallet._id, { hideBalance: !wallet.hideBalance });
        } catch (e) { console.warn(e.message); }
    }, []);

    const groupedData = React.useMemo(() => {
        if (!wallets.length) return [];
        const groups = {};
        wallets.forEach(w => {
            if (!groups[w.type]) groups[w.type] = [];
            groups[w.type].push(w);
        });
        const flattened = [];
        // Inject header items
        flattened.push({ isNetWorth: true });
        if (wallets.length > 1) flattened.push({ isInsights: true });
        Object.keys(groups).sort().forEach(type => {
            flattened.push({ isHeader: true, title: type });
            const items = groups[type];
            for (let i = 0; i < items.length; i += 2) {
                flattened.push({ isRow: true, id: items[i]._id + '-row', data: [items[i], items[i + 1]].filter(Boolean) });
            }
        });
        return flattened;
    }, [wallets]);

    const renderItem = ({ item }) => {
        if (item.isNetWorth) return <NetWorthHeader wallets={wallets} prices={cryptoPrices} hideVal={hideGlobalBalance} onToggleHide={() => setHideGlobalBalance(!hideGlobalBalance)} COLORS={COLORS} navigation={navigation} />;
        if (item.isInsights) return <InsightsPanel wallets={wallets} prices={cryptoPrices} hideVal={hideGlobalBalance} COLORS={COLORS} />;
        if (item.isHeader) return (
            <Text style={[styles.groupHeader, { color: COLORS.textMuted }]}>
                {item.title.toUpperCase()} ACCOUNTS
            </Text>
        );
        return (
            <View style={styles.rowContainer}>
                {item.data.map(w => <BankCard key={w._id} wallet={w} onPress={handleCardPress} onToggleHide={handleToggleHide} />)}
            </View>
        );
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: COLORS.background }]} edges={['top', 'left', 'right']}>
            <View style={styles.header}>
                <Text style={[styles.title, { color: COLORS.text }]}>My Accounts</Text>
                <TouchableOpacity onPress={() => setAddModalVisible(true)} style={[styles.addBtn, { backgroundColor: COLORS.primary + '15' }]}>
                    <Feather name="plus" size={20} color={COLORS.primary} />
                </TouchableOpacity>
            </View>

            {isLoadingWallets && !wallets.length ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={COLORS.primary} />
                </View>
            ) : wallets.length === 0 ? (
                <View style={styles.emptyState}>
                    <View style={styles.emptyIconCircle}>
                        <Feather name="credit-card" size={40} color={COLORS.primary} />
                    </View>
                    <Text style={[styles.emptyTitle, { color: COLORS.text }]}>No Wallets Yet</Text>
                    <Text style={[styles.emptySub, { color: COLORS.textMuted }]}>Link your accounts to start tracking your total net worth seamlessly.</Text>
                    <TouchableOpacity onPress={() => setAddModalVisible(true)} style={[styles.emptyBtn, { backgroundColor: COLORS.primary }]}>
                        <Text style={styles.emptyBtnText}>Add Wallet</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <FlashList
                    data={groupedData}
                    renderItem={renderItem}
                    estimatedItemSize={CARD_HEIGHT + 40}
                    contentContainerStyle={{ paddingBottom: 100 }}
                    showsVerticalScrollIndicator={false}
                    keyExtractor={(item, i) => item.id || item.title || String(i)}
                />
            )}

            <AddWalletModal visible={isAddModalVisible} onClose={() => setAddModalVisible(false)} />
            {editingWallet && (
                <EditWalletModal visible={!!editingWallet} wallet={editingWallet} onClose={() => setEditingWallet(null)} />
            )}
            <CustomAlertModal
                visible={alert.visible}
                type={alert.type}
                title={alert.title}
                message={alert.message}
                onClose={() => setAlert(a => ({ ...a, visible: false }))}
                onConfirm={alert.extraActions ? undefined : alert.onConfirm}
                confirmText="Yes, Delete"
                extraActions={alert.extraActions}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 6 },
    title: { fontSize: 28, fontWeight: '800' },
    addBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },

    // ── Net Worth ──
    netWorthCard: { marginHorizontal: 20, marginTop: 10, marginBottom: 4, borderRadius: 20, padding: 20 },
    nwLabel: { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.7)', letterSpacing: 1.5, marginBottom: 4 },
    nwAmount: { fontSize: 34, fontWeight: '900', color: '#fff', marginBottom: 16 },
    nwRow: { flexDirection: 'row', gap: 10 },
    nwPill: { flex: 1, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: 10, gap: 2 },
    nwPillLabel: { fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.7)', letterSpacing: 1 },
    nwPillValue: { fontSize: 14, fontWeight: '800', color: '#fff' },

    // ── Insights ──
    insightsContainer: { marginHorizontal: 20, marginTop: 14, marginBottom: 4, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
    insightsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 },
    insightsTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    insightsTitle: { fontSize: 15, fontWeight: '700' },
    insightsGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 10, gap: 10 },
    insightCard: { width: '47%', borderRadius: 14, borderWidth: 1, padding: 12, gap: 4 },
    insightIconCircle: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
    insightLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
    insightValue: { fontSize: 15, fontWeight: '800' },
    insightSub: { fontSize: 11 },

    // ── Cards ──
    groupHeader: { fontSize: 12, fontWeight: '800', letterSpacing: 1.5, paddingHorizontal: 20, marginTop: 20, marginBottom: 10 },
    rowContainer: { flexDirection: 'row', paddingHorizontal: 20, gap: 15, marginBottom: 15 },
    cardWrapper: { flex: 1, maxWidth: CARD_WIDTH, borderRadius: 16, overflow: 'hidden' },
    cardContainer: {
        width: CARD_WIDTH, height: CARD_HEIGHT, borderRadius: 16, padding: 14,
        justifyContent: 'space-between',
        shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.18, shadowRadius: 10, elevation: 6,
    },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    logoContainer: { alignItems: 'flex-end', justifyContent: 'center' },
    bankLogoText: { fontSize: 14, fontWeight: '900', fontStyle: 'italic', letterSpacing: -0.5 },
    coinImage: { width: 28, height: 28, borderRadius: 14 },

    cardMiddle: { marginTop: 4 },
    balanceLabel: { fontSize: 8, fontWeight: '700', letterSpacing: 1.5, marginBottom: 2, color: 'rgba(255,255,255,0.7)' },
    balanceAmount: { fontSize: 19, fontWeight: '800', fontVariant: ['tabular-nums'] },
    walletName: { fontSize: 13, fontWeight: '700' },

    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
    emptyIconCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(233,30,140,0.1)', justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
    emptyTitle: { fontSize: 24, fontWeight: '800', marginBottom: 10 },
    emptySub: { fontSize: 16, textAlign: 'center', lineHeight: 24, marginBottom: 30 },
    emptyBtn: { paddingHorizontal: 30, paddingVertical: 16, borderRadius: 30 },
    emptyBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' }
});
