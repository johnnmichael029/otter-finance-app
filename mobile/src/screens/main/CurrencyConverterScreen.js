import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, TextInput,
    ScrollView, ActivityIndicator, FlatList, Modal,
    Animated, TouchableWithoutFeedback, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { getCurrencyList, getExchangeRates } from '../../api/api';
import { spacing, radius } from '../../theme/colors';

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n, decimals = 2) =>
    Number(n).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

export default function CurrencyConverterScreen({ navigation }) {
    const COLORS = useTheme(state => state.COLORS);
    const { userInfo } = useAuth();
    const styles = getStyles(COLORS);

    const [currencies, setCurrencies] = useState([]);
    const [rates, setRates] = useState({});          // rates relative to USD
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState(null);

    // Converter state
    const [fromCur, setFromCur] = useState({ code: 'USD', symbol: '$', flag: '🇺🇸', name: 'US Dollar' });
    const [toCur, setToCur] = useState({ code: 'PHP', symbol: '₱', flag: '🇵🇭', name: 'Philippine Peso' });
    const [amount, setAmount] = useState('1');
    const [converted, setConverted] = useState(null);
    const [liveRate, setLiveRate] = useState(null);

    // Currency picker modal
    const [pickerTarget, setPickerTarget] = useState(null); // 'from' | 'to'
    const [pickerSearch, setPickerSearch] = useState('');
    const [pickerVisible, setPickerVisible] = useState(false);

    // Popular rates card
    const [popularRates, setPopularRates] = useState([]);

    // Swap animation
    const swapAnim = useRef(new Animated.Value(0)).current;

    // ── Load currencies + rates ────────────────────────────────────────────────
    useEffect(() => {
        (async () => {
            try {
                const [curRes, rateRes] = await Promise.all([
                    getCurrencyList(),
                    getExchangeRates('USD'),
                ]);
                if (curRes?.currencies) setCurrencies(curRes.currencies);
                if (rateRes?.rates) {
                    setRates(rateRes.rates);
                    setLastUpdated(rateRes.time_last_update_utc || null);
                    buildPopularRates(rateRes.rates, userInfo?.currency || 'PHP');
                }
            } catch (e) {
                console.warn('[Converter] Load error:', e.message);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    // ── Recalculate on amount / currency change ────────────────────────────────
    useEffect(() => {
        const num = parseFloat(amount);
        if (!num || isNaN(num) || !rates[fromCur.code] || !rates[toCur.code]) {
            setConverted(null);
            setLiveRate(null);
            return;
        }
        // Pivot via USD
        const inUSD = num / rates[fromCur.code];
        const result = inUSD * rates[toCur.code];
        const rate = rates[toCur.code] / rates[fromCur.code];
        setConverted(result);
        setLiveRate(rate);
    }, [amount, fromCur, toCur, rates]);

    // ── Popular rates relative to user base currency ───────────────────────────
    const buildPopularRates = (r, base) => {
        const POPULAR = ['USD', 'EUR', 'GBP', 'JPY', 'SGD', 'KRW', 'AUD', 'HKD', 'CNY'];
        const baseRate = r[base] || 1;
        const list = POPULAR
            .filter(c => c !== base)
            .map(c => ({
                code: c,
                rate: r[c] ? (r[c] / baseRate) : null,
            }))
            .filter(c => c.rate !== null);
        setPopularRates(list);
    };

    // ── Swap currencies ────────────────────────────────────────────────────────
    const handleSwap = () => {
        Animated.sequence([
            Animated.timing(swapAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
            Animated.timing(swapAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
        ]).start();
        const prev = fromCur;
        setFromCur(toCur);
        setToCur(prev);
    };

    // ── Open picker ────────────────────────────────────────────────────────────
    const openPicker = (target) => {
        setPickerTarget(target);
        setPickerSearch('');
        setPickerVisible(true);
    };

    const selectCurrency = (cur) => {
        if (pickerTarget === 'from') setFromCur(cur);
        else setToCur(cur);
        setPickerVisible(false);
    };

    // ── Filtered currencies for picker ────────────────────────────────────────
    const filteredCurrencies = currencies.filter(c =>
        c.code.toLowerCase().includes(pickerSearch.toLowerCase()) ||
        c.name.toLowerCase().includes(pickerSearch.toLowerCase())
    );

    const swapRotate = swapAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

    const CurrencySelector = ({ label, cur, onPress }) => (
        <TouchableOpacity style={[styles.curSelector, { backgroundColor: COLORS.surface }]} onPress={onPress} activeOpacity={0.75}>
            <Text style={styles.curSelectorLabel}>{label}</Text>
            <View style={styles.curSelectorRow}>
                <Text style={styles.curFlag}>{cur.flag}</Text>
                <View>
                    <Text style={[styles.curCode, { color: COLORS.text }]}>{cur.code}</Text>
                    <Text style={[styles.curName, { color: COLORS.textMuted }]} numberOfLines={1}>{cur.name}</Text>
                </View>
                <Feather name="chevron-down" size={16} color={COLORS.textMuted} style={{ marginLeft: 'auto' }} />
            </View>
        </TouchableOpacity>
    );

    return (
        <SafeAreaView style={[styles.safe, { backgroundColor: COLORS.background }]}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => { if (navigation.canGoBack()) navigation.goBack(); }} style={[styles.backBtn, { backgroundColor: COLORS.surface }]}>
                    <Feather name="arrow-left" size={20} color={COLORS.text} />
                </TouchableOpacity>
                <View>
                    <Text style={[styles.headerTitle, { color: COLORS.text }]}>Currency Converter</Text>
                    <Text style={[styles.headerSub, { color: COLORS.textMuted }]}>Live exchange rates</Text>
                </View>
                <View style={{ width: 40 }} />
            </View>

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={COLORS.primary} />
                    <Text style={[styles.loadingText, { color: COLORS.textMuted }]}>Fetching live rates…</Text>
                </View>
            ) : (
                <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                    {/* Main Converter Card */}
                    <LinearGradient colors={['#E91E8C', '#B0146A', '#7b0f4e']} style={styles.converterCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>

                        {/* Amount Input */}
                        <View style={styles.amountSection}>
                            <Text style={styles.amountLabel}>AMOUNT</Text>
                            <TextInput
                                style={styles.amountInput}
                                value={amount}
                                onChangeText={v => setAmount(v.replace(/[^0-9.]/g, ''))}
                                keyboardType="decimal-pad"
                                placeholder="0"
                                placeholderTextColor="rgba(255,255,255,0.4)"
                                returnKeyType="done"
                                onSubmitEditing={Keyboard.dismiss}
                            />
                        </View>

                        {/* Result */}
                        <View style={styles.resultSection}>
                            <Text style={styles.resultLabel}>CONVERTED TO</Text>
                            <Text style={styles.resultAmount}>
                                {converted !== null
                                    ? `${toCur.symbol || toCur.code} ${fmt(converted, converted > 100 ? 2 : 4)}`
                                    : '—'}
                            </Text>
                            {liveRate !== null && (
                                <Text style={styles.rateHint}>
                                    1 {fromCur.code} = {toCur.code} {fmt(liveRate, 4)}
                                </Text>
                            )}
                        </View>

                        {/* Last Updated */}
                        {lastUpdated && (
                            <Text style={styles.updatedText}>
                                Rates last updated: {new Date(lastUpdated).toLocaleDateString()}
                            </Text>
                        )}
                    </LinearGradient>

                    {/* From / Swap / To Row */}
                    <View style={styles.selectorRow}>
                        <CurrencySelector label="FROM" cur={fromCur} onPress={() => openPicker('from')} />

                        <TouchableOpacity style={[styles.swapBtn, { backgroundColor: COLORS.primary }]} onPress={handleSwap}>
                            <Animated.View style={{ transform: [{ rotate: swapRotate }] }}>
                                <Feather name="repeat" size={18} color="#fff" />
                            </Animated.View>
                        </TouchableOpacity>

                        <CurrencySelector label="TO" cur={toCur} onPress={() => openPicker('to')} />
                    </View>

                    {/* Quick numpad shortcuts */}
                    <View style={[styles.quickRow, { backgroundColor: COLORS.surface }]}>
                        {['10', '50', '100', '500', '1000', '5000'].map(v => (
                            <TouchableOpacity key={v} style={[styles.quickChip, { borderColor: COLORS.border }]} onPress={() => setAmount(v)}>
                                <Text style={[styles.quickChipText, { color: COLORS.text }]}>{v}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* Popular Rates Card */}
                    {popularRates.length > 0 && (
                        <View style={[styles.ratesCard, { backgroundColor: COLORS.surface }]}>
                            <Text style={[styles.ratesTitle, { color: COLORS.text }]}>
                                Popular Rates vs <Text style={{ color: COLORS.primary }}>{userInfo?.currency || 'PHP'}</Text>
                            </Text>
                            {popularRates.map((r, i) => {
                                const cur = currencies.find(c => c.code === r.code);
                                return (
                                    <TouchableOpacity
                                        key={r.code}
                                        style={[styles.rateRow, i < popularRates.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border }]}
                                        onPress={() => {
                                            const found = currencies.find(c => c.code === r.code);
                                            if (found) {
                                                const baseCur = currencies.find(c => c.code === (userInfo?.currency || 'PHP'));
                                                if (baseCur) setFromCur(baseCur);
                                                setToCur(found);
                                                setAmount('1');
                                            }
                                        }}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={styles.rateFlag}>{cur?.flag || '🏳️'}</Text>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.rateCode, { color: COLORS.text }]}>{r.code}</Text>
                                            <Text style={[styles.rateName, { color: COLORS.textMuted }]} numberOfLines={1}>{cur?.name || r.code}</Text>
                                        </View>
                                        <Text style={[styles.rateValue, { color: COLORS.primary }]}>
                                            {fmt(r.rate, r.rate < 1 ? 4 : 2)}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    )}

                    <View style={{ height: 40 }} />
                </ScrollView>
            )}

            {/* Currency Picker Modal */}
            <Modal visible={pickerVisible} transparent animationType="slide" onRequestClose={() => setPickerVisible(false)}>
                <TouchableWithoutFeedback onPress={() => setPickerVisible(false)}>
                    <View style={styles.pickerOverlay} />
                </TouchableWithoutFeedback>
                <View style={[styles.pickerSheet, { backgroundColor: COLORS.surface }]}>
                    <View style={styles.pickerHandle} />
                    <Text style={[styles.pickerTitle, { color: COLORS.text }]}>
                        Select {pickerTarget === 'from' ? 'From' : 'To'} Currency
                    </Text>
                    <View style={[styles.pickerSearch, { backgroundColor: COLORS.background, borderColor: COLORS.border }]}>
                        <Feather name="search" size={16} color={COLORS.textMuted} />
                        <TextInput
                            style={[styles.pickerSearchInput, { color: COLORS.text }]}
                            value={pickerSearch}
                            onChangeText={setPickerSearch}
                            placeholder="Search currency or code…"
                            placeholderTextColor={COLORS.textMuted}
                            autoFocus
                        />
                    </View>
                    <FlatList
                        data={filteredCurrencies}
                        keyExtractor={item => item.code}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        renderItem={({ item }) => (
                            <TouchableOpacity
                                style={[styles.pickerItem, { borderBottomColor: COLORS.border }]}
                                onPress={() => selectCurrency(item)}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.pickerFlag}>{item.flag}</Text>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.pickerCode, { color: COLORS.text }]}>{item.code}</Text>
                                    <Text style={[styles.pickerName, { color: COLORS.textMuted }]}>{item.name}</Text>
                                </View>
                                {(pickerTarget === 'from' ? fromCur : toCur).code === item.code && (
                                    <Feather name="check" size={18} color={COLORS.primary} />
                                )}
                            </TouchableOpacity>
                        )}
                    />
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const getStyles = (COLORS) => StyleSheet.create({
    safe: { flex: 1 },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md,
    },
    backBtn: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    headerTitle: { fontSize: 20, fontWeight: '800' },
    headerSub: { fontSize: 12, marginTop: 2 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
    loadingText: { fontSize: 14 },
    content: { paddingHorizontal: spacing.lg, paddingBottom: 20 },

    // Converter Card
    converterCard: {
        borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.md,
        shadowColor: '#E91E8C', shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3, shadowRadius: 16, elevation: 8,
    },
    amountSection: { marginBottom: spacing.lg },
    amountLabel: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.6)', letterSpacing: 1.5, marginBottom: 6 },
    amountInput: {
        fontSize: 48, fontWeight: '900', color: '#fff',
        borderBottomWidth: 1.5, borderBottomColor: 'rgba(255,255,255,0.3)',
        paddingBottom: 8, minWidth: 60,
    },
    resultSection: { marginBottom: spacing.sm },
    resultLabel: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.6)', letterSpacing: 1.5, marginBottom: 6 },
    resultAmount: { fontSize: 32, fontWeight: '900', color: '#fff' },
    rateHint: { fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 4 },
    updatedText: { fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: spacing.sm },

    // Selector Row
    selectorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
    curSelector: { flex: 1, borderRadius: radius.lg, padding: spacing.md },
    curSelectorLabel: { fontSize: 10, fontWeight: '700', color: '#E91E8C', letterSpacing: 1.2, marginBottom: 8 },
    curSelectorRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    curFlag: { fontSize: 28 },
    curCode: { fontSize: 16, fontWeight: '800' },
    curName: { fontSize: 11, marginTop: 1 },
    swapBtn: {
        width: 44, height: 44, borderRadius: 22,
        justifyContent: 'center', alignItems: 'center',
        shadowColor: '#E91E8C', shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4, shadowRadius: 8, elevation: 5,
    },

    // Quick chips
    quickRow: {
        flexDirection: 'row', flexWrap: 'wrap', gap: 8,
        borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md,
    },
    quickChip: {
        paddingHorizontal: 14, paddingVertical: 7,
        borderRadius: 20, borderWidth: 1.5,
    },
    quickChipText: { fontSize: 13, fontWeight: '700' },

    // Popular Rates Card
    ratesCard: { borderRadius: radius.xl, overflow: 'hidden', marginBottom: spacing.md },
    ratesTitle: { fontSize: 13, fontWeight: '800', padding: spacing.md, paddingBottom: spacing.sm },
    rateRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: 12, gap: 12 },
    rateFlag: { fontSize: 24 },
    rateCode: { fontSize: 14, fontWeight: '700' },
    rateName: { fontSize: 11, marginTop: 1 },
    rateValue: { fontSize: 15, fontWeight: '800' },

    // Picker Modal
    pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
    pickerSheet: {
        maxHeight: '75%', borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
        paddingBottom: 32,
    },
    pickerHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#ccc', alignSelf: 'center', marginTop: 12, marginBottom: 8 },
    pickerTitle: { fontSize: 17, fontWeight: '800', paddingHorizontal: spacing.lg, marginBottom: spacing.md },
    pickerSearch: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        marginHorizontal: spacing.lg, marginBottom: spacing.sm,
        paddingHorizontal: spacing.md, paddingVertical: 10,
        borderRadius: radius.lg, borderWidth: 1.5,
    },
    pickerSearchInput: { flex: 1, fontSize: 15 },
    pickerItem: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: spacing.lg, paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    pickerFlag: { fontSize: 24 },
    pickerCode: { fontSize: 14, fontWeight: '700' },
    pickerName: { fontSize: 12, marginTop: 2 },
});
