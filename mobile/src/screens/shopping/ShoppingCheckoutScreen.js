import React, { useState } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { checkoutShopping } from '../../api/api';
import { spacing, radius } from '../../theme/colors';
import CustomAlertModal from '../../components/CustomAlertModal';

const formatCurrency = (amount, currency = 'PHP') =>
    new Intl.NumberFormat('en-PH', { style: 'currency', currency }).format(amount || 0);

const PAYMENT_METHODS = [
    { id: 'cash', label: 'Cash', icon: 'cash', color: '#22c55e' },
    { id: 'gcash', label: 'GCash', icon: 'cellphone', color: '#00A3E4' },
    { id: 'card', label: 'Card', icon: 'credit-card', color: '#3b82f6' },
    { id: 'other', label: 'Other', icon: 'dots-horizontal', color: '#8b5cf6' },
];

const SOURCES = [
    { id: 'main_balance', label: 'Main Balance', sub: 'Your wallet', icon: 'home', color: '#E91E8C', isMCI: false },
    { id: 'savings_balance', label: 'Savings Balance', sub: 'Your savings pot', icon: 'piggy-bank-outline', color: '#3b82f6', isMCI: true },
];

export default function ShoppingCheckoutScreen({ route, navigation }) {
    const { session, items, total, budgetNum, label } = route.params;
    const { COLORS } = useTheme();
    const { userInfo } = useAuth();
    const styles = getStyles(COLORS);

    const [paymentMethod, setPaymentMethod] = useState('gcash');
    const [source, setSource] = useState('main_balance');
    const [loading, setLoading] = useState(false);
    const [alertConfig, setAlertConfig] = useState({ visible: false, title: '', message: '', type: 'confirm', onConfirm: () => { } });

    const pct = budgetNum > 0 ? Math.min((total / budgetNum) * 100, 100) : 0;
    const budgetColor = pct >= 100 ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#22c55e';

    const handleConfirm = async () => {
        setLoading(true);
        try {
            await checkoutShopping(session._id, {
                paymentMethod,
                source,
                note: `${paymentMethod} payment`,
            });

            setAlertConfig({
                visible: true,
                title: '🎉 Shopping Done!',
                message: `${formatCurrency(total, userInfo?.currency)} has been deducted from your ${source === 'main_balance' ? 'Main Balance' : 'Savings Account'}.`,
                type: 'info',
                onConfirm: () => {
                    setAlertConfig(p => ({ ...p, visible: false }));
                    navigation.reset({ index: 0, routes: [{ name: 'ShoppingHome' }] });
                }
            });
        } catch (err) {
            const msg = err?.response?.data?.error || 'Checkout failed. Please try again.';
            setAlertConfig({
                visible: true,
                title: 'Checkout Failed',
                message: msg,
                type: 'info',
                onConfirm: () => setAlertConfig(p => ({ ...p, visible: false }))
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={[styles.safe, { backgroundColor: COLORS.background }]}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backBtn, { backgroundColor: COLORS.surface }]}>
                    <Feather name="arrow-left" size={20} color={COLORS.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: COLORS.text }]}>Checkout</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
                {/* Summary Card */}
                <View style={[styles.summaryCard, { backgroundColor: COLORS.surface }]}>
                    <Text style={[styles.sectionLabel, { color: COLORS.textMuted }]}>ORDER SUMMARY</Text>
                    <Text style={[styles.tripLabel, { color: COLORS.text }]}>{label}</Text>
                    <Text style={[styles.itemCount, { color: COLORS.textMuted }]}>{items.length} items</Text>

                    <View style={[styles.barBg, { backgroundColor: COLORS.border }]}>
                        <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: budgetColor }]} />
                    </View>
                    <View style={styles.budgetRow}>
                        <Text style={[styles.totalAmt, { color: budgetColor }]}>{formatCurrency(total, userInfo?.currency)}</Text>
                        <Text style={[styles.budgetAmt, { color: COLORS.textMuted }]}>of {formatCurrency(budgetNum, userInfo?.currency)} budget</Text>
                    </View>
                </View>

                {/* Cart Items */}
                <View style={[styles.cartCard, { backgroundColor: COLORS.surface }]}>
                    <Text style={[styles.sectionLabel, { color: COLORS.textMuted }]}>CART ITEMS</Text>
                    {items.map((item, idx) => (
                        <View key={idx} style={[styles.cartRow, { borderBottomColor: COLORS.border }]}>
                            <Text style={[styles.cartName, { color: COLORS.text }]}>{item.name}</Text>
                            <Text style={[styles.cartQty, { color: COLORS.textMuted }]}>× {item.quantity}</Text>
                            <Text style={[styles.cartSubtotal, { color: COLORS.text }]}>
                                {formatCurrency(item.price * item.quantity, userInfo?.currency)}
                            </Text>
                        </View>
                    ))}
                    <View style={[styles.totalRow]}>
                        <Text style={[styles.totalLabel, { color: COLORS.text }]}>Total</Text>
                        <Text style={[styles.totalValue, { color: COLORS.primary }]}>{formatCurrency(total, userInfo?.currency)}</Text>
                    </View>
                </View>

                {/* Payment Method */}
                <View style={styles.sectionPad}>
                    <Text style={[styles.sectionTitle, { color: COLORS.text }]}>Payment Method</Text>
                    <View style={styles.optionGrid}>
                        {PAYMENT_METHODS.map(pm => (
                            <TouchableOpacity
                                key={pm.id}
                                style={[styles.optionCard, {
                                    backgroundColor: COLORS.surface,
                                    borderColor: paymentMethod === pm.id ? pm.color : COLORS.border,
                                    borderWidth: paymentMethod === pm.id ? 2 : 1,
                                }]}
                                onPress={() => setPaymentMethod(pm.id)}
                                activeOpacity={0.8}
                            >
                                <View style={[styles.optionIcon, { backgroundColor: pm.color + '20' }]}>
                                    <MaterialCommunityIcons name={pm.icon} size={22} color={pm.color} />
                                </View>
                                <Text style={[styles.optionLabel, { color: COLORS.text }]}>{pm.label}</Text>
                                {paymentMethod === pm.id && (
                                    <View style={[styles.checkDot, { backgroundColor: pm.color }]}>
                                        <Feather name="check" size={10} color="#fff" />
                                    </View>
                                )}
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* Deduction Source */}
                <View style={styles.sectionPad}>
                    <Text style={[styles.sectionTitle, { color: COLORS.text }]}>Deduct From</Text>
                    <View style={styles.sourceList}>
                        {SOURCES.map(s => (
                            <TouchableOpacity
                                key={s.id}
                                style={[styles.sourceCard, {
                                    backgroundColor: COLORS.surface,
                                    borderColor: source === s.id ? s.color : COLORS.border,
                                    borderWidth: source === s.id ? 2 : 1,
                                }]}
                                onPress={() => setSource(s.id)}
                                activeOpacity={0.8}
                            >
                                <View style={[styles.sourceIcon, { backgroundColor: s.color + '20' }]}>
                                    {s.isMCI
                                        ? <MaterialCommunityIcons name={s.icon} size={22} color={s.color} />
                                        : <Feather name={s.icon} size={22} color={s.color} />
                                    }
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.sourceLabel, { color: COLORS.text }]}>{s.label}</Text>
                                    <Text style={[styles.sourceSub, { color: COLORS.textMuted }]}>{s.sub}</Text>
                                </View>
                                {source === s.id && (
                                    <View style={[styles.checkDot, { backgroundColor: s.color }]}>
                                        <Feather name="check" size={10} color="#fff" />
                                    </View>
                                )}
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
            </ScrollView>

            {/* Confirm CTA */}
            <View style={[styles.bottomBar, { backgroundColor: COLORS.surface }]}>
                <TouchableOpacity
                    style={[styles.confirmBtn, { backgroundColor: COLORS.primary, opacity: loading ? 0.7 : 1 }]}
                    onPress={handleConfirm}
                    disabled={loading}
                    activeOpacity={0.85}
                >
                    {loading ? <ActivityIndicator color="#fff" /> : (
                        <>
                            <Feather name="check-circle" size={20} color="#fff" />
                            <Text style={styles.confirmText}>Confirm Payment · {formatCurrency(total, userInfo?.currency)}</Text>
                        </>
                    )}
                </TouchableOpacity>
            </View>

            <CustomAlertModal
                visible={alertConfig.visible}
                onClose={() => setAlertConfig(p => ({ ...p, visible: false }))}
                title={alertConfig.title}
                message={alertConfig.message}
                type={alertConfig.type}
                onConfirm={alertConfig.onConfirm}
            />
        </SafeAreaView>
    );
}

const getStyles = (COLORS) => StyleSheet.create({
    safe: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg },
    backBtn: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    headerTitle: { fontSize: 20, fontWeight: '900' },
    summaryCard: { marginHorizontal: spacing.lg, marginBottom: spacing.md, borderRadius: radius.xl, padding: spacing.lg },
    sectionLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 1.2, marginBottom: 8, textTransform: 'uppercase' },
    tripLabel: { fontSize: 20, fontWeight: '900', marginBottom: 2 },
    itemCount: { fontSize: 13, fontWeight: '600', marginBottom: 16 },
    barBg: { height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 8 },
    barFill: { height: '100%', borderRadius: 4 },
    budgetRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
    totalAmt: { fontSize: 22, fontWeight: '900' },
    budgetAmt: { fontSize: 13, fontWeight: '600' },
    cartCard: { marginHorizontal: spacing.lg, marginBottom: spacing.md, borderRadius: radius.xl, padding: spacing.lg },
    cartRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1 },
    cartName: { flex: 1, fontSize: 14, fontWeight: '700' },
    cartQty: { fontSize: 13, fontWeight: '600', marginHorizontal: 8 },
    cartSubtotal: { fontSize: 14, fontWeight: '800', minWidth: 80, textAlign: 'right' },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 12, marginTop: 4 },
    totalLabel: { fontSize: 15, fontWeight: '900' },
    totalValue: { fontSize: 17, fontWeight: '900' },
    sectionPad: { paddingHorizontal: spacing.lg, marginBottom: spacing.md },
    sectionTitle: { fontSize: 16, fontWeight: '900', marginBottom: 12 },
    optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    optionCard: { width: '22%', alignItems: 'center', padding: 12, borderRadius: radius.xl, position: 'relative' },
    optionIcon: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
    optionLabel: { fontSize: 11, fontWeight: '800', textAlign: 'center' },
    checkDot: { position: 'absolute', top: 6, right: 6, width: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
    sourceList: { gap: 10 },
    sourceCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: radius.xl, position: 'relative' },
    sourceIcon: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
    sourceLabel: { fontSize: 15, fontWeight: '800' },
    sourceSub: { fontSize: 12, fontWeight: '600', marginTop: 2 },
    bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: spacing.lg, paddingBottom: 28, borderTopLeftRadius: 24, borderTopRightRadius: 24, elevation: 20, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 16 },
    confirmBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 18, borderRadius: radius.xl },
    confirmText: { color: '#fff', fontSize: 16, fontWeight: '900' },
});
