import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useFinanceStore } from '../store/financeStore';

/**
 * Returns a human-readable balance string for any wallet type:
 *  - Crypto  → "1.00042 BTC"
 *  - Stocks  → "50 shares (JFC)"
 *  - Fiat    → "₱12,500.00"
 */
export function getBalanceLabel(wallet) {
    const bal = wallet.balance ?? 0;
    if (wallet.type === 'Crypto') {
        const sym = wallet.coinSymbol?.toUpperCase() || 'COIN';
        const formatted = parseFloat(bal.toFixed(8)).toString();
        return `${formatted} ${sym}`;
    }
    if (wallet.type === 'Stocks') {
        const sym = wallet.stockSymbol || wallet.stockTicker || 'SHR';
        return `${bal.toLocaleString()} shr (${sym})`;
    }
    // Fiat / E-Wallet / Debit / Credit / Cash
    return `₱${bal.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Calculate how much native amount will be deducted from a wallet given a PHP amount.
 * Returns { nativeAmount, symbol, hasPrice }
 */
export function calcNativeDeduct(wallet, amountPHP, cryptoPrices) {
    if (!amountPHP || amountPHP <= 0) return null;
    
    if (wallet.type === 'Crypto' && wallet.coinId) {
        const phpPerCoin = cryptoPrices?.[wallet.coinId];
        if (!phpPerCoin) return { nativeAmount: null, symbol: wallet.coinSymbol?.toUpperCase() || 'COIN', hasPrice: false };
        const nativeAmount = amountPHP / phpPerCoin;
        return { nativeAmount, symbol: wallet.coinSymbol?.toUpperCase() || 'COIN', hasPrice: true };
    }
    if (wallet.type === 'Stocks') {
        // Stocks aren't natively converted — treat balance as PHP value
        return { nativeAmount: amountPHP, symbol: '₱', hasPrice: true };
    }
    // Fiat
    return { nativeAmount: amountPHP, symbol: '₱', hasPrice: true };
}

/**
 * Returns true if the wallet has enough balance for the expense.
 */
export function hasEnoughBalance(wallet, amountPHP, cryptoPrices) {
    // CREDIT WALLETS: Expenses add to the balance (amount owed), so they don't have a 'balance cap' in this logic. 
    // Always allow unless we implement a credit limit later.
    if (wallet.type === 'Credit') return true;

    const deduct = calcNativeDeduct(wallet, amountPHP, cryptoPrices);
    if (!deduct || !deduct.hasPrice) return true; // can't validate without price, allow through
    
    const bal = wallet.balance ?? 0;
    if (wallet.type === 'Crypto') {
        return bal >= deduct.nativeAmount;
    }
    // Fiat / Stocks — compare PHP directly
    return bal >= amountPHP;
}

/** ─────────────────────────────────────────────────────────────────────── */

const WalletSelector = ({
    selectedWalletId,
    onSelect,
    COLORS,
    amountPHP = 0,   // Pass the transaction amount (in PHP) for conversion hints & validation
    isExpense = false, // Set true for expense/debt/shopping to show insufficient warning
}) => {
    const wallets = useFinanceStore(state => state.wallets);
    const cryptoPrices = useFinanceStore(state => state.cryptoPrices);

    if (!wallets || wallets.length === 0) return null;

    return (
        <View style={styles.container}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
                {wallets.map((wallet) => {
                    const isSelected = selectedWalletId === wallet._id;
                    const color = wallet.color || COLORS.primary;

                    // Smart conversion hint when an amount is entered
                    let conversionHint = null;
                    let insufficient = false;

                    if (amountPHP > 0) {
                        const deduct = calcNativeDeduct(wallet, amountPHP, cryptoPrices);
                        if (deduct?.hasPrice && wallet.type === 'Crypto') {
                            conversionHint = `≈ ${parseFloat(deduct.nativeAmount.toFixed(8))} ${deduct.symbol}`;
                        }
                        if (isExpense) {
                            insufficient = !hasEnoughBalance(wallet, amountPHP, cryptoPrices);
                        }
                    }

                    const cardBg = insufficient
                        ? COLORS.surface
                        : isSelected ? color : COLORS.surface;
                    const cardBorder = insufficient
                        ? '#ef4444'
                        : isSelected ? color : COLORS.border;

                    return (
                        <TouchableOpacity
                            key={wallet._id}
                            onPress={() => onSelect(wallet)}
                            style={[
                                styles.card,
                                {
                                    backgroundColor: cardBg,
                                    borderColor: cardBorder,
                                    borderWidth: isSelected || insufficient ? 2 : 1.5,
                                    opacity: insufficient ? 0.65 : 1,
                                }
                            ]}
                            activeOpacity={0.8}
                        >
                            {/* Wallet icon */}
                            <View style={[styles.iconCircle, { backgroundColor: isSelected ? 'rgba(255,255,255,0.2)' : color + '18' }]}>
                                {wallet.type === 'Crypto' ? (
                                    <MaterialCommunityIcons name="bitcoin" size={16} color={isSelected ? '#fff' : color} />
                                ) : wallet.type === 'Stocks' ? (
                                    <Feather name="trending-up" size={16} color={isSelected ? '#fff' : color} />
                                ) : (
                                    <Feather name="credit-card" size={16} color={isSelected ? '#fff' : color} />
                                )}
                            </View>

                            {/* Text block */}
                            <View style={{ flex: 1 }}>
                                <Text
                                    style={[styles.name, { color: isSelected ? '#fff' : COLORS.text }]}
                                    numberOfLines={1}
                                >
                                    {wallet.name}
                                </Text>
                                <Text style={[styles.balance, { color: isSelected ? 'rgba(255,255,255,0.85)' : COLORS.textMuted }]}>
                                    {getBalanceLabel(wallet)}
                                </Text>
                                {/* Conversion hint — only shown when selected */}
                                {isSelected && conversionHint && (
                                    <Text style={styles.hint}>
                                        {conversionHint} deducted
                                    </Text>
                                )}
                                {/* Insufficient balance warning */}
                                {insufficient && !isSelected && (
                                    <Text style={styles.insufficient}>Insufficient</Text>
                                )}
                                {insufficient && isSelected && (
                                    <Text style={styles.insufficientSelected}>⚠️ Insufficient balance</Text>
                                )}
                            </View>

                            {/* Check mark */}
                            {isSelected && (
                                <View style={[styles.check, { shadowColor: color }]}>
                                    <Feather name="check" size={10} color={color} />
                                </View>
                            )}
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { marginVertical: 4 },
    scroll: { gap: 10, paddingRight: 20 },
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        padding: 10,
        paddingRight: 16,
        borderRadius: 16,
        minWidth: 155,
    },
    iconCircle: {
        width: 32,
        height: 32,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    name: {
        fontSize: 13,
        fontWeight: '800',
    },
    balance: {
        fontSize: 11,
        fontWeight: '600',
        marginTop: 1,
    },
    hint: {
        fontSize: 10,
        fontWeight: '700',
        marginTop: 2,
        color: 'rgba(255,255,255,0.75)',
        fontStyle: 'italic',
    },
    insufficient: {
        fontSize: 10,
        fontWeight: '800',
        marginTop: 2,
        color: '#ef4444',
    },
    insufficientSelected: {
        fontSize: 10,
        fontWeight: '800',
        marginTop: 2,
        color: '#fca5a5',
    },
    check: {
        position: 'absolute',
        top: -6,
        right: -6,
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: '#fff',
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 3,
        shadowOpacity: 0.15,
        shadowRadius: 4,
    }
});

export default WalletSelector;
