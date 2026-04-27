import React, { useState } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { deleteShoppingSession } from '../../api/api';
import { spacing, radius } from '../../theme/colors';
import CustomAlertModal from '../../components/CustomAlertModal';
import { formatCurrency, formatDateTime } from '../../utils/formatters';

const PM_ICONS = { cash: 'cash', gcash: 'cellphone', card: 'credit-card', other: 'dots-horizontal' };
const PM_COLORS = { cash: '#22c55e', gcash: '#00A3E4', card: '#3b82f6', other: '#8b5cf6' };
const STATUS_COLORS = { completed: '#22c55e', cancelled: '#ef4444', active: '#f59e0b' };

export default function ShoppingHistoryDetailScreen({ route, navigation }) {
    const { session } = route.params;
    const COLORS = useTheme(state => state.COLORS);
    const { userInfo } = useAuth();
    const styles = getStyles(COLORS);

    const [deleting, setDeleting] = useState(false);
    const [alertConfig, setAlertConfig] = useState({
        visible: false, title: '', message: '', type: 'confirm', onConfirm: () => { }
    });

    const handleDelete = () => {
        setAlertConfig({
            visible: true,
            title: 'Delete Record?',
            message: 'This cancelled session will be permanently removed from your history.',
            type: 'confirm',
            onConfirm: async () => {
                setAlertConfig(p => ({ ...p, visible: false }));
                setDeleting(true);
                try {
                    await deleteShoppingSession(session._id);
                    navigation.goBack();
                } catch (e) {
                    console.warn('[Shopping] delete error:', e);
                } finally {
                    setDeleting(false);
                }
            }
        });
    };

    const pct = session.budget > 0 ? Math.min((session.total / session.budget) * 100, 100) : 0;
    const budgetColor = pct >= 100 ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#22c55e';
    const statusColor = STATUS_COLORS[session.status] || COLORS.textMuted;
    const pmColor = PM_COLORS[session.paymentMethod] || COLORS.textMuted;
    const pmIcon = PM_ICONS[session.paymentMethod] || 'dots-horizontal';

    return (
        <SafeAreaView style={[styles.safe, { backgroundColor: COLORS.background }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backBtn, { backgroundColor: COLORS.surface }]}>
                    <Feather name="arrow-left" size={20} color={COLORS.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: COLORS.text }]}>Trip Details</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {session.status === 'cancelled' && (
                        <TouchableOpacity
                            onPress={handleDelete}
                            disabled={deleting}
                            style={[styles.deleteBtn, { backgroundColor: '#ef444420' }]}
                        >
                            {deleting
                                ? <ActivityIndicator size="small" color="#ef4444" />
                                : <Feather name="trash-2" size={16} color="#ef4444" />}
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
                {/* Hero Summary */}
                <View style={[styles.heroCard, { backgroundColor: COLORS.surface }]}>
                    <View style={[styles.heroIconBox, { backgroundColor: statusColor + '20' }]}>
                        <Feather name="shopping-cart" size={28} color={statusColor} />
                    </View>
                    <Text style={[styles.heroLabel, { color: COLORS.text }]}>{session.label}</Text>
                    <Text style={[styles.heroDate, { color: COLORS.textMuted }]}>{formatDateTime(session.createdAt)}</Text>

                    <View style={[styles.barBg, { backgroundColor: COLORS.border }]}>
                        <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: budgetColor }]} />
                    </View>
                    <View style={styles.amtRow}>
                        <View>
                            <Text style={[styles.amtLabel, { color: COLORS.textMuted }]}>Spent</Text>
                            <Text style={[styles.amtValue, { color: budgetColor }]}>{formatCurrency(session.total, userInfo?.currency)}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                            <Text style={[styles.amtLabel, { color: COLORS.textMuted }]}>Budget</Text>
                            <Text style={[styles.amtValue, { color: COLORS.text }]}>{formatCurrency(session.budget, userInfo?.currency)}</Text>
                        </View>
                    </View>
                </View>

                {/* Meta Info */}
                <View style={[styles.metaCard, { backgroundColor: COLORS.surface }]}>
                    <View style={styles.metaRow}>
                        <Text style={[styles.metaLabel, { color: COLORS.textMuted }]}>Payment Method</Text>
                        <View style={styles.metaValue}>
                            <MaterialCommunityIcons name={pmIcon} size={16} color={pmColor} />
                            <Text style={[styles.metaText, { color: COLORS.text }]}>{session.paymentMethod}</Text>
                        </View>
                    </View>
                    <View style={[styles.metaRow, { borderBottomWidth: 0 }]}>
                        <Text style={[styles.metaLabel, { color: COLORS.textMuted }]}>Deducted From</Text>
                        <View style={styles.metaValue}>
                            {session.source === 'savings_balance'
                                ? <MaterialCommunityIcons name="piggy-bank-outline" size={16} color="#3b82f6" />
                                : <Feather name="home" size={16} color="#E91E8C" />}
                            <Text style={[styles.metaText, { color: COLORS.text }]}>
                                {session.source === 'savings_balance' ? 'Savings Balance' : 'Main Balance'}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Cart Items */}
                <View style={[styles.cartCard, { backgroundColor: COLORS.surface }]}>
                    <Text style={[styles.cartTitle, { color: COLORS.text }]}>
                        Items ({session.items?.length || 0})
                    </Text>
                    {(session.items || []).map((item, idx) => (
                        <View key={idx} style={[styles.cartRow, { borderBottomColor: COLORS.border, borderBottomWidth: idx < session.items.length - 1 ? 1 : 0 }]}>
                            <View style={[styles.cartDot, { backgroundColor: COLORS.primary }]} />
                            <Text style={[styles.cartName, { color: COLORS.text }]}>{item.name}</Text>
                            <Text style={[styles.cartQty, { color: COLORS.textMuted }]}>× {item.quantity}</Text>
                            <Text style={[styles.cartSub, { color: COLORS.text }]}>
                                {formatCurrency(item.price * item.quantity, userInfo?.currency)}
                            </Text>
                        </View>
                    ))}
                    <View style={[styles.totalRow, { borderTopColor: COLORS.border }]}>
                        <Text style={[styles.totalLabel, { color: COLORS.text }]}>Total</Text>
                        <Text style={[styles.totalValue, { color: COLORS.primary }]}>
                            {formatCurrency(session.total, userInfo?.currency)}
                        </Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
                        <Text style={[styles.statusText, { color: statusColor }]}>{session.status}</Text>
                    </View>
                </View>


                {session.note ? (
                    <View style={[styles.noteCard, { backgroundColor: COLORS.surface }]}>
                        <Feather name="info" size={14} color={COLORS.textMuted} />
                        <Text style={[styles.noteText, { color: COLORS.textMuted }]}>{session.note}</Text>
                    </View>
                ) : null}
            </ScrollView>

            {/* Continue Shopping CTA — only for active sessions */}
            {session.status === 'active' && (
                <View style={[styles.bottomBar, { backgroundColor: COLORS.surface }]}>
                    <TouchableOpacity
                        style={[styles.continueBtn, { backgroundColor: '#22c55e' }]}
                        onPress={() => navigation.navigate('ShoppingSession', { resumeSession: session })}
                        activeOpacity={0.85}
                    >
                        <Feather name="shopping-cart" size={20} color="#fff" />
                        <Text style={styles.continueBtnText}>Continue Shopping</Text>
                    </TouchableOpacity>
                </View>
            )}

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
    deleteBtn: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    statusBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, marginTop: spacing.md, alignSelf: 'center', },
    statusText: { fontSize: 11, fontWeight: '800', textTransform: 'capitalize' },
    heroCard: { marginHorizontal: spacing.lg, marginBottom: spacing.md, borderRadius: radius.xl, padding: spacing.xl, alignItems: 'center' },
    heroIconBox: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
    heroLabel: { fontSize: 22, fontWeight: '900', marginBottom: 4 },
    heroDate: { fontSize: 13, fontWeight: '500', marginBottom: 16, textAlign: 'center' },
    barBg: { width: '100%', height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 12 },
    barFill: { height: '100%', borderRadius: 4 },
    amtRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
    amtLabel: { fontSize: 12, fontWeight: '600', marginBottom: 2 },
    amtValue: { fontSize: 18, fontWeight: '900' },
    metaCard: { marginHorizontal: spacing.lg, marginBottom: spacing.md, borderRadius: radius.xl, padding: spacing.lg },
    metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS?.border || '#eee' },
    metaLabel: { fontSize: 13, fontWeight: '700' },
    metaValue: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    metaText: { fontSize: 14, fontWeight: '800', textTransform: 'capitalize' },
    cartCard: { marginHorizontal: spacing.lg, marginBottom: spacing.md, borderRadius: radius.xl, padding: spacing.lg },
    cartTitle: { fontSize: 16, fontWeight: '900', marginBottom: 12 },
    cartRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 8 },
    cartDot: { width: 6, height: 6, borderRadius: 3 },
    cartName: { flex: 1, fontSize: 14, fontWeight: '700' },
    cartQty: { fontSize: 13, fontWeight: '600' },
    cartSub: { fontSize: 14, fontWeight: '800', minWidth: 80, textAlign: 'right' },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 12, marginTop: 4, borderTopWidth: 1 },
    totalLabel: { fontSize: 15, fontWeight: '900' },
    totalValue: { fontSize: 17, fontWeight: '900' },
    noteCard: { marginHorizontal: spacing.lg, borderRadius: radius.xl, padding: spacing.lg, flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
    noteText: { flex: 1, fontSize: 13, fontWeight: '500' },
    bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: spacing.lg, paddingBottom: 28, borderTopLeftRadius: 24, borderTopRightRadius: 24, elevation: 20, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 16 },
    continueBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 18, borderRadius: radius.xl },
    continueBtnText: { color: '#fff', fontSize: 16, fontWeight: '900' },
});
