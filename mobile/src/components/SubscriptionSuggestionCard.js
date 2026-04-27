import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { formatCurrency, getIconColor, IconRenderer, getIconName } from '../utils/formatters';
import { spacing, radius, shadow } from '../theme/colors';

const SubscriptionSuggestionCard = ({ merchant, amount, category, onDismiss, onAdd }) => {
    const COLORS = useTheme(state => state.COLORS);
    const { userInfo } = useAuth();
    const styles = getStyles(COLORS);

    // Create a mock transaction object for formatting functions
    const mockTx = { category, type: 'expense' };

    return (
        <View style={[styles.container, { backgroundColor: COLORS.surface }]}>
            <TouchableOpacity style={styles.closeBtn} onPress={onDismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Feather name="x" size={16} color={COLORS.textMuted} />
            </TouchableOpacity>

            <View style={styles.header}>
                <View style={[styles.iconWrap, { backgroundColor: getIconColor(mockTx, COLORS) + '20' }]}>
                    <IconRenderer name={getIconName(mockTx)} size={20} color={getIconColor(mockTx, COLORS)} />
                </View>
                <View style={{ flex: 1, marginLeft: spacing.sm }}>
                    <Text style={[styles.title, { color: COLORS.text }]}>Recurring Charge Detected</Text>
                    <Text style={[styles.subtitle, { color: COLORS.textMuted }]}>
                        You paid <Text style={{ fontWeight: '700', color: COLORS.text }}>{formatCurrency(amount, userInfo?.currency)}</Text> to {merchant} multiple times recently.
                    </Text>
                </View>
            </View>

            <View style={styles.actions}>
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: COLORS.primary }]} onPress={onAdd}>
                    <Feather name="plus-circle" size={14} color="#fff" />
                    <Text style={[styles.actionText, { color: '#fff' }]}>Add as Recurring Bill</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};

const getStyles = (COLORS) => StyleSheet.create({
    container: {
        marginHorizontal: spacing.lg,
        marginTop: spacing.md,
        padding: spacing.md,
        borderRadius: radius.lg,
        ...shadow.soft,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    closeBtn: {
        position: 'absolute',
        top: spacing.sm,
        right: spacing.sm,
        zIndex: 10,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingRight: spacing.lg, // Make room for close btn
    },
    iconWrap: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    title: {
        fontSize: 14,
        fontWeight: '800',
        marginBottom: 2,
    },
    subtitle: {
        fontSize: 12,
        lineHeight: 18,
    },
    actions: {
        marginTop: spacing.md,
        flexDirection: 'row',
        justifyContent: 'flex-end',
    },
    actionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing.md,
        paddingVertical: 8,
        borderRadius: radius.full,
        gap: 6,
    },
    actionText: {
        fontSize: 12,
        fontWeight: '700',
    },
});

export default SubscriptionSuggestionCard;
