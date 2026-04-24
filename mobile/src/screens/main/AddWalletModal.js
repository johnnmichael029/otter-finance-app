import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, Modal, TouchableOpacity,
    TextInput, KeyboardAvoidingView, Platform, ScrollView,
    ActivityIndicator, Animated, Dimensions, TouchableWithoutFeedback, Image, FlatList
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useFinanceStore } from '../../store/financeStore';
import * as api from '../../api/api';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const QUICK_TEMPLATES = [
    { id: 'gcash', label: 'GCash', icon: 'G', type: 'E-Wallet', color: '#007CF8' },
    { id: 'bpi', label: 'BPI', icon: 'BPI', type: 'Debit', color: '#B30000' },
    { id: 'bdo', label: 'BDO', icon: 'BDO', type: 'Debit', color: '#0033A0' },
    { id: 'unionbank', label: 'UnionBank', icon: 'UB', type: 'Debit', color: '#ED7A12' },
    { id: 'btc', label: 'Bitcoin', icon: '₿', type: 'Crypto', color: '#F7931A' },
];

const ACCOUNT_TYPES = [
    { id: 'Debit', label: 'Debit', desc: 'Cash on hand', icon: 'wallet-outline', defaultColor: '#059669' },
    { id: 'Credit', label: 'Credit', desc: 'Money you owe', icon: 'credit-card-outline', defaultColor: '#DC2626' },
    { id: 'Stocks', label: 'Stocks', desc: 'Tracked holdings', icon: 'chart-line', defaultColor: '#4F46E5' },
    { id: 'Crypto', label: 'Crypto', desc: 'Digital assets', icon: 'bitcoin', defaultColor: '#F7931A' },
    { id: 'E-Wallet', label: 'E-Wallet', desc: 'Digital cash', icon: 'cellphone', defaultColor: '#2563EB' },
];

export default function AddWalletModal({ visible, onClose }) {
    const { COLORS } = useTheme();
    const { fetchWallets } = useFinanceStore();

    const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const [modalVisible, setModalVisible] = useState(false);

    // step 1 = type/template, 2 = crypto search, 3 = configure
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);

    const [type, setType] = useState('Debit');
    const [templateId, setTemplateId] = useState('custom');
    const [name, setName] = useState('');
    const [color, setColor] = useState('#374151');
    const [balance, setBalance] = useState('');
    const [currency, setCurrency] = useState({ code: 'PHP', symbol: '₱', flag: '🇵🇭' });
    const [exchangeRate, setExchangeRate] = useState(1);

    // crypto state
    const [cryptoQuery, setCryptoQuery] = useState('');
    const [cryptoResults, setCryptoResults] = useState([]);
    const [cryptoLoading, setCryptoLoading] = useState(false);
    const [selectedCoin, setSelectedCoin] = useState(null);

    // stock state
    const [stockQuery, setStockQuery] = useState('');
    const [stockResults, setStockResults] = useState([]);
    const [stockLoading, setStockLoading] = useState(false);
    const [selectedStock, setSelectedStock] = useState(null);
    const [step2Mode, setStep2Mode] = useState('crypto'); // 'crypto' | 'stock'

    useEffect(() => {
        if (visible) {
            setModalVisible(true);
            slideAnim.setValue(SCREEN_HEIGHT);
            fadeAnim.setValue(0);
            Animated.parallel([
                Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
                Animated.spring(slideAnim, { toValue: 0, tension: 65, friction: 11, useNativeDriver: true }),
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
                Animated.timing(slideAnim, { toValue: SCREEN_HEIGHT, duration: 220, useNativeDriver: true }),
            ]).start(() => setModalVisible(false));
        }
    }, [visible]);

    const resetForm = () => {
        setStep(1); setType('Debit'); setTemplateId('custom');
        setName(''); setColor('#374151'); setBalance('');
        setCryptoQuery(''); setCryptoResults([]); setSelectedCoin(null);
        setStockQuery(''); setStockResults([]); setSelectedStock(null);
        setStep2Mode('crypto');
    };

    const handleSelectTemplate = (tpl) => {
        setTemplateId(tpl.id); setName(tpl.label); setType(tpl.type); setColor(tpl.color);
        if (tpl.type === 'Crypto') { setStep2Mode('crypto'); setStep(2); }
        else if (tpl.type === 'Stocks') { setStep2Mode('stock'); setStep(2); }
        else setStep(3);
    };

    const handleSelectTypeOnly = (t) => {
        setType(t.id); setTemplateId('custom'); setColor(t.defaultColor);
        if (t.id === 'Crypto') { setStep2Mode('crypto'); setStep(2); }
        else if (t.id === 'Stocks') { setStep2Mode('stock'); setStep(2); }
        else setStep(3);
    };

    // ── CoinGecko search ──────────────────────────────────────────────────────
    const searchTimeout = useRef(null);
    useEffect(() => {
        if (!cryptoQuery.trim() || step !== 2 || step2Mode !== 'crypto') return;
        clearTimeout(searchTimeout.current);
        setCryptoLoading(true);
        searchTimeout.current = setTimeout(async () => {
            try {
                const res = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(cryptoQuery)}`);
                const json = await res.json();
                setCryptoResults((json.coins || []).slice(0, 20));
            } catch (e) { console.warn('Crypto search failed', e.message); }
            finally { setCryptoLoading(false); }
        }, 400);
        return () => clearTimeout(searchTimeout.current);
    }, [cryptoQuery, step, step2Mode]);

    const handleCoinSelect = (coin) => {
        setSelectedCoin(coin); setName(coin.name); setCryptoQuery(coin.name); setStep(3);
    };

    // ── Yahoo Finance PSE stock search ────────────────────────────────────────
    const stockTimeout = useRef(null);
    useEffect(() => {
        if (!stockQuery.trim() || step !== 2 || step2Mode !== 'stock') return;
        clearTimeout(stockTimeout.current);
        setStockLoading(true);
        stockTimeout.current = setTimeout(async () => {
            try {
                const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(stockQuery)}&quotesCount=20&newsCount=0&region=PH&lang=en-PH`;
                const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                const json = await res.json();
                const quotes = (json.quotes || []).filter(q =>
                    (q.symbol?.endsWith('.PS') || 
                     ['Philippines', 'PHS', 'PSE', 'Manila'].includes(q.exchDisp) ||
                     q.exchange === 'PHP') &&
                    (q.typeDisp === 'Equity' || q.quoteType === 'EQUITY')
                ).slice(0, 20);
                setStockResults(quotes);
            } catch (e) { console.warn('Stock search failed', e.message); }
            finally { setStockLoading(false); }
        }, 500);
        return () => clearTimeout(stockTimeout.current);
    }, [stockQuery, step, step2Mode]);

    const handleStockSelect = (stock) => {
        setSelectedStock(stock);
        const ticker = stock.symbol?.replace('.PS', '') || stock.symbol;
        setName(stock.shortname || stock.longname || ticker);
        setStockQuery(stock.shortname || stock.symbol);
        setStep(3);
    };

    // ── Conversion logic ──────────────────────────────────────────────────────
    useEffect(() => {
        if (currency.code === 'PHP' || step !== 3) {
            setExchangeRate(1);
            return;
        }
        const fetchRate = async () => {
            try {
                const res = await api.convertCurrency(currency.code, 'PHP', 1);
                setExchangeRate(res.rate);
            } catch (e) { console.warn('Rate fetch failed', e.message); }
        };
        fetchRate();
    }, [currency, step]);

    const handleSave = async () => {
        if (!name.trim()) return;
        setLoading(true);
        try {
            await api.createWallet({
                name, type, templateId, color,
                balance: parseFloat(balance) || 0,
                currency: currency.code,
                ...(selectedCoin && {
                    coinId: selectedCoin.id,
                    coinSymbol: selectedCoin.symbol?.toUpperCase(),
                    coinName: selectedCoin.name,
                    coinImageUrl: selectedCoin.thumb,
                }),
                ...(selectedStock && {
                    stockTicker: selectedStock.symbol,
                    stockSymbol: selectedStock.symbol?.replace('.PS', ''),
                    stockName: selectedStock.shortname || selectedStock.longname,
                    stockExchange: 'PSE',
                }),
            });
            onClose();
            resetForm();
        } catch (e) {
            console.warn('Failed to create wallet', e);
        } finally {
            setLoading(false);
        }
    };

    // ── STEP 1: Type + Templates ──────────────────────────────────────────────
    const renderStep1 = () => (
        <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={[styles.sectionTitle, { color: COLORS.textMuted }]}>ACCOUNT TYPE</Text>
            <View style={styles.grid}>
                {ACCOUNT_TYPES.map(cat => (
                    <TouchableOpacity
                        key={cat.id}
                        style={[styles.typeCard, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
                        onPress={() => handleSelectTypeOnly(cat)}
                    >
                        <View style={[styles.iconCircle, { backgroundColor: COLORS.background }]}>
                            <MaterialCommunityIcons name={cat.icon} size={24} color={COLORS.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.typeLabel, { color: COLORS.text }]}>{cat.label}</Text>
                            <Text style={[styles.typeDesc, { color: COLORS.textMuted }]}>{cat.desc}</Text>
                        </View>
                    </TouchableOpacity>
                ))}
            </View>

            <Text style={[styles.sectionTitle, { color: COLORS.textMuted, marginTop: 20 }]}>QUICK TEMPLATES</Text>
            <View style={styles.grid}>
                {QUICK_TEMPLATES.map(tpl => (
                    <TouchableOpacity
                        key={tpl.id}
                        style={[styles.typeCard, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
                        onPress={() => handleSelectTemplate(tpl)}
                    >
                        <View style={[styles.tplIconCircle, { backgroundColor: tpl.color }]}>
                            <Text style={styles.tplIconText}>{tpl.icon}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.typeLabel, { color: COLORS.text }]}>{tpl.label}</Text>
                            <Text style={[styles.typeDesc, { color: COLORS.textMuted }]}>{tpl.id.toUpperCase()}</Text>
                        </View>
                    </TouchableOpacity>
                ))}
            </View>
            <View style={{ height: 40 }} />
        </ScrollView>
    );

    // ── STEP 2: Stock Search ──────────────────────────────────────────────────
    const renderStep2Stocks = () => (
        <View style={{ flex: 1 }}>
            <Text style={[styles.sectionTitle, { color: COLORS.textMuted }]}>SEARCH PSE LISTED STOCKS</Text>
            <View style={[styles.searchBox, { backgroundColor: COLORS.inputBackground, borderColor: COLORS.inputBorder }]}>
                <Feather name="trending-up" size={18} color={COLORS.textMuted} style={{ marginRight: 10 }} />
                <TextInput
                    style={[styles.searchInput, { color: COLORS.text }]}
                    value={stockQuery}
                    onChangeText={setStockQuery}
                    placeholder="Search JFC, SM, BDO, PLDT…"
                    placeholderTextColor={COLORS.textMuted}
                    autoFocus
                    autoCapitalize="characters"
                />
                {stockLoading && <ActivityIndicator size="small" color={COLORS.primary} />}
            </View>

            {stockResults.length > 0 && (
                <FlatList
                    data={stockResults}
                    keyExtractor={s => s.symbol}
                    style={{ marginTop: 10 }}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            style={[styles.coinRow, { borderColor: COLORS.border }]}
                            onPress={() => handleStockSelect(item)}
                        >
                            <View style={[styles.stockBadge, { backgroundColor: COLORS.primary + '18' }]}>
                                <Text style={[styles.stockBadgeText, { color: COLORS.primary }]}>
                                    {item.symbol?.replace('.PS', '')}
                                </Text>
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.coinName, { color: COLORS.text }]} numberOfLines={1}>
                                    {item.shortname || item.longname}
                                </Text>
                                <Text style={[styles.coinSymbol, { color: COLORS.textMuted }]}>
                                    {item.symbol} · Philippine Stock Exchange
                                </Text>
                            </View>
                        </TouchableOpacity>
                    )}
                />
            )}
            {!stockLoading && stockQuery.length > 1 && stockResults.length === 0 && (
                <Text style={[styles.noResults, { color: COLORS.textMuted }]}>No PSE stocks found for "{stockQuery}"</Text>
            )}
            {stockQuery.length === 0 && (
                <Text style={[styles.noResults, { color: COLORS.textMuted }]}>Type a company name or ticker (e.g. JFC, SM, PLDT)</Text>
            )}
        </View>
    );

    // ── STEP 2: Crypto Search ─────────────────────────────────────────────────
    const renderStep2 = () => (
        <View style={{ flex: 1 }}>
            <Text style={[styles.sectionTitle, { color: COLORS.textMuted }]}>SEARCH CRYPTOCURRENCY</Text>
            <View style={[styles.searchBox, { backgroundColor: COLORS.inputBackground, borderColor: COLORS.inputBorder }]}>
                <Feather name="search" size={18} color={COLORS.textMuted} style={{ marginRight: 10 }} />
                <TextInput
                    style={[styles.searchInput, { color: COLORS.text }]}
                    value={cryptoQuery}
                    onChangeText={setCryptoQuery}
                    placeholder="Search Bitcoin, Ethereum…"
                    placeholderTextColor={COLORS.textMuted}
                    autoFocus
                />
                {cryptoLoading && <ActivityIndicator size="small" color={COLORS.primary} />}
            </View>

            {cryptoResults.length > 0 && (
                <FlatList
                    data={cryptoResults}
                    keyExtractor={c => c.id}
                    style={{ marginTop: 10 }}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            style={[styles.coinRow, { borderColor: COLORS.border }]}
                            onPress={() => handleCoinSelect(item)}
                        >
                            {item.thumb ? (
                                <Image source={{ uri: item.thumb }} style={styles.coinThumb} />
                            ) : (
                                <View style={[styles.coinThumb, { backgroundColor: COLORS.border, justifyContent: 'center', alignItems: 'center' }]}>
                                    <MaterialCommunityIcons name="bitcoin" size={18} color={COLORS.textMuted} />
                                </View>
                            )}
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.coinName, { color: COLORS.text }]}>{item.name}</Text>
                                <Text style={[styles.coinSymbol, { color: COLORS.textMuted }]}>{item.symbol?.toUpperCase()}</Text>
                            </View>
                            <View style={[styles.coinRankBadge, { backgroundColor: COLORS.border }]}>
                                <Text style={[styles.coinRankText, { color: COLORS.textMuted }]}>#{item.market_cap_rank || '—'}</Text>
                            </View>
                        </TouchableOpacity>
                    )}
                />
            )}
            {!cryptoLoading && cryptoQuery.length > 0 && cryptoResults.length === 0 && (
                <Text style={[styles.noResults, { color: COLORS.textMuted }]}>No results found for "{cryptoQuery}"</Text>
            )}
        </View>
    );

    // ── STEP 3: Configure ─────────────────────────────────────────────────────
    const renderStep3 = () => (
        <ScrollView showsVerticalScrollIndicator={false}>
            {selectedCoin && (
                <View style={[styles.coinPreview, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
                    {selectedCoin.thumb && <Image source={{ uri: selectedCoin.thumb }} style={styles.coinPreviewImg} />}
                    <View>
                        <Text style={[styles.typeLabel, { color: COLORS.text }]}>{selectedCoin.name}</Text>
                        <Text style={[styles.typeDesc, { color: COLORS.textMuted }]}>{selectedCoin.symbol?.toUpperCase()} · Rank #{selectedCoin.market_cap_rank || '—'}</Text>
                    </View>
                </View>
            )}
            {selectedStock && (
                <View style={[styles.coinPreview, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
                    <View style={[styles.stockBadge, { backgroundColor: COLORS.primary + '18' }]}>
                        <Text style={[styles.stockBadgeText, { color: COLORS.primary, fontSize: 16 }]}>{selectedStock.symbol?.replace('.PS', '')}</Text>
                    </View>
                    <View>
                        <Text style={[styles.typeLabel, { color: COLORS.text }]}>{selectedStock.shortname || selectedStock.longname}</Text>
                        <Text style={[styles.typeDesc, { color: COLORS.textMuted }]}>{selectedStock.symbol} · Philippine Stock Exchange</Text>
                    </View>
                </View>
            )}

            <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: COLORS.textMuted }]}>WALLET NAME</Text>
                <TextInput
                    style={[styles.input, { backgroundColor: COLORS.inputBackground, color: COLORS.text, borderColor: COLORS.inputBorder }]}
                    value={name}
                    onChangeText={setName}
                    placeholder="E.g., My BDO Savings"
                    placeholderTextColor={COLORS.textMuted}
                />
            </View>

            <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: COLORS.textMuted }]}>
                    {selectedCoin ? `BALANCE (${selectedCoin.symbol?.toUpperCase()})` : `CURRENT BALANCE (${currency.symbol})`}
                </Text>
                <View style={styles.balanceContainer}>
                    {!selectedCoin && !selectedStock && (
                        <TouchableOpacity 
                            style={[styles.currencyBtn, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
                            onPress={() => useFinanceStore.getState().setCurrencyModalVisible(true)}
                        >
                            <Text style={styles.currencyFlag}>{currency.flag}</Text>
                            <Text style={[styles.currencyCode, { color: COLORS.text }]}>{currency.code}</Text>
                            <Feather name="chevron-down" size={14} color={COLORS.textMuted} />
                        </TouchableOpacity>
                    )}
                    <TextInput
                        style={[styles.input, styles.balanceInput, { flex: 1, backgroundColor: COLORS.inputBackground, color: COLORS.text, borderColor: COLORS.inputBorder }]}
                        value={balance}
                        onChangeText={setBalance}
                        placeholder="0.00"
                        placeholderTextColor={COLORS.textMuted}
                        keyboardType="numeric"
                    />
                </View>
                
                {/* Exchange Rate Hint */}
                {currency.code !== 'PHP' && !selectedCoin && !selectedStock && (
                    <View style={styles.conversionInfo}>
                        <Text style={[styles.conversionText, { color: COLORS.textMuted }]}>
                            ≈ ₱{(parseFloat(balance || 0) * exchangeRate).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </Text>
                        <View style={[styles.rateTag, { backgroundColor: COLORS.primary + '15' }]}>
                            <Text style={[styles.rateText, { color: COLORS.primary }]}>1 {currency.code} is = to ₱{exchangeRate.toFixed(2)}</Text>
                        </View>
                    </View>
                )}
            </View>

            <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: COLORS.primary }]}
                onPress={handleSave}
                disabled={loading}
            >
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Connect Wallet</Text>}
            </TouchableOpacity>
            <View style={{ height: 40 }} />
        </ScrollView>
    );

    const getStepTitle = () => {
        if (step === 1) return 'Add Wallet';
        if (step === 2 && step2Mode === 'stock') return 'Select PSE Stock';
        if (step === 2) return 'Select Cryptocurrency';
        return 'Configure Wallet';
    };

    const handleBack = () => {
        if (step === 3 && (type === 'Crypto' || type === 'Stocks')) setStep(2);
        else setStep(1);
    };

    return (
        <Modal visible={modalVisible} animationType="none" transparent statusBarTranslucent>
            <TouchableWithoutFeedback onPress={onClose}>
                <Animated.View style={[styles.overlay, { opacity: fadeAnim }]} />
            </TouchableWithoutFeedback>

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBg}>
                <Animated.View style={[styles.modalContent, { backgroundColor: COLORS.background, transform: [{ translateY: slideAnim }] }]}>
                    <View style={[styles.handle, { backgroundColor: COLORS.border }]} />
                    <View style={styles.modalHeader}>
                        {step > 1 ? (
                            <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
                                <Feather name="arrow-left" size={22} color={COLORS.text} />
                            </TouchableOpacity>
                        ) : <View style={{ width: 22 }} />}
                        <Text style={[styles.modalTitle, { color: COLORS.text }]}>{getStepTitle()}</Text>
                        <TouchableOpacity onPress={onClose}>
                            <Feather name="x" size={22} color={COLORS.text} />
                        </TouchableOpacity>
                    </View>

                    {step === 1 && renderStep1()}
                    {step === 2 && step2Mode === 'stock' && renderStep2Stocks()}
                    {step === 2 && step2Mode === 'crypto' && renderStep2()}
                    {step === 3 && renderStep3()}
                </Animated.View>
            </KeyboardAvoidingView>

            {/* Currency Selector Modal */}
            <Modal
                visible={useFinanceStore(state => state.currencyModalVisible)}
                transparent
                animationType="slide"
            >
                <View style={styles.currencyModalOverlay}>
                    <View style={[styles.currencyModalContent, { backgroundColor: COLORS.surface }]}>
                        <View style={styles.currencyModalHeader}>
                            <Text style={[styles.currencyModalTitle, { color: COLORS.text }]}>Select Currency</Text>
                            <TouchableOpacity onPress={() => useFinanceStore.getState().setCurrencyModalVisible(false)}>
                                <Feather name="x" size={24} color={COLORS.textMuted} />
                            </TouchableOpacity>
                        </View>
                        <FlatList
                            data={[
                                { code: 'PHP', symbol: '₱', flag: '🇵🇭' },
                                { code: 'USD', symbol: '$', flag: '🇺🇸' },
                                { code: 'EUR', symbol: '€', flag: '🇪🇺' },
                                { code: 'GBP', symbol: '£', flag: '🇬🇧' },
                                { code: 'JPY', symbol: '¥', flag: '🇯🇵' },
                                { code: 'KRW', symbol: '₩', flag: '🇰🇷' },
                                { code: 'CAD', symbol: '$', flag: '🇨🇦' },
                                { code: 'AUD', symbol: '$', flag: '🇦🇺' },
                            ]}
                            keyExtractor={i => i.code}
                            renderItem={({ item }) => (
                                <TouchableOpacity 
                                    style={styles.currencyRow} 
                                    onPress={() => {
                                        setCurrency(item);
                                        useFinanceStore.getState().setCurrencyModalVisible(false);
                                    }}
                                >
                                    <Text style={styles.currencyFlagLarge}>{item.flag}</Text>
                                    <View>
                                        <Text style={[styles.currencyNameLarge, { color: COLORS.text }]}>{item.code}</Text>
                                        <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>{item.symbol}</Text>
                                    </View>
                                </TouchableOpacity>
                            )}
                        />
                    </View>
                </View>
            </Modal>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
    modalBg: { flex: 1, justifyContent: 'flex-end' },
    modalContent: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, maxHeight: '92%', minHeight: '60%' },
    handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    modalTitle: { fontSize: 18, fontWeight: '800' },
    backBtn: { padding: 4 },

    sectionTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 1.5, marginBottom: 14 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },

    typeCard: { width: '48%', flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 16, borderWidth: 1, gap: 10 },
    iconCircle: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    typeLabel: { fontSize: 15, fontWeight: '700' },
    typeDesc: { fontSize: 12, marginTop: 1 },
    tplIconCircle: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    tplIconText: { color: '#fff', fontWeight: '900', fontStyle: 'italic', fontSize: 14 },

    // Crypto search
    searchBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, height: 50 },
    searchInput: { flex: 1, fontSize: 16 },
    coinRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: 1, gap: 12 },
    coinThumb: { width: 36, height: 36, borderRadius: 18 },
    coinName: { fontSize: 15, fontWeight: '700' },
    coinSymbol: { fontSize: 12, marginTop: 1 },
    coinRankBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
    coinRankText: { fontSize: 11, fontWeight: '700' },
    noResults: { textAlign: 'center', marginTop: 30, fontSize: 14 },

    // Coin preview chip
    coinPreview: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, borderWidth: 1, marginBottom: 20 },
    coinPreviewImg: { width: 40, height: 40, borderRadius: 20 },

    // Step 3
    inputGroup: { marginBottom: 18 },
    label: { fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 8 },
    input: { borderWidth: 1, borderRadius: 16, padding: 16, fontSize: 16 },
    balanceInput: { fontSize: 24, fontWeight: '700' },
    saveBtn: { padding: 18, borderRadius: 20, alignItems: 'center', marginTop: 4 },
    saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
    // Stock badge
    stockBadge: { width: 48, height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    stockBadgeText: { fontWeight: '900', fontSize: 12, letterSpacing: -0.5 },

    // Conversion UI (Matching AddTransactionScreen)
    balanceContainer: { flexDirection: 'row', gap: 10, alignItems: 'center' },
    currencyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 60, borderRadius: 16, borderWidth: 1 },
    currencyFlag: { fontSize: 20 },
    currencyCode: { fontWeight: '800', fontSize: 14 },
    conversionInfo: { marginTop: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    conversionText: { fontSize: 16, fontWeight: '700' },
    rateTag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    rateText: { fontSize: 11, fontWeight: '800' },

    // Currency Modal
    currencyModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    currencyModalContent: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '70%' },
    currencyModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    currencyModalTitle: { fontSize: 18, fontWeight: '800' },
    currencyRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: 'rgba(0,0,0,0.05)' },
    currencyFlagLarge: { fontSize: 32 },
    currencyNameLarge: { fontSize: 16, fontWeight: '700' },
});
