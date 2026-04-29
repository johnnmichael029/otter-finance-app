import React, { useState, useRef, useEffect } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    TextInput, ActivityIndicator, Animated, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { 
    savingsTransfer, getTransactionSummary, getSavingsGoals, getWallets 
} from '../../api/api';
import CustomAlertModal from '../../components/CustomAlertModal';
import { spacing, radius } from '../../theme/colors';
import BottomSheetModal from '../../components/BottomSheetModal';
import WalletSelector, { calcNativeDeduct, hasEnoughBalance, getBalanceLabel } from '../../components/WalletSelector';
import { useFinanceStore } from '../../store/financeStore';
import { formatCurrency, IconRenderer } from '../../utils/formatters';



export default function SavingsTransferScreen({ route, navigation }) {
    const { goal: initialGoal, direction: initialDirection, isIncome, sourceGoal: initialSource, isDirect, fromSavings } = route.params;
    const COLORS = useTheme(state => state.COLORS);
    const { userInfo } = useAuth();
    const styles = getStyles(COLORS);

    const [goal, setGoal] = useState(initialGoal);
    const [direction, setDirection] = useState(isIncome ? 'income' : (initialDirection || 'to_savings'));
    const [sourceGoal, setSourceGoal] = useState(initialSource);
    const [selectedWallet, setSelectedWallet] = useState(null); // Full wallet object
    const [targetGoal, setTargetGoal] = useState(null);
    const [savingsPot, setSavingsPot] = useState(null);
    const [amount, setAmount] = useState('');
    const [note, setNote] = useState('');
    const [fee, setFee] = useState('');
    const [feeType, setFeeType] = useState('fixed'); // 'fixed' | 'percent'
    const [saving, setSaving] = useState(false);
    const [selectorModalVisible, setSelectorModalVisible] = useState(false);
    const [selectorMode, setSelectorMode] = useState('source'); // 'source' or 'target'
    const [alert, setAlert] = useState({ visible: false, type: 'info', title: '', message: '' });
    const [loadError, setLoadError] = useState(false);

    const cryptoPrices = useFinanceStore(state => state.cryptoPrices);
    const wallets = useFinanceStore(state => state.wallets);
    const storeGoals = useFinanceStore(state => state.savingsGoals);
    const storeMaster = useFinanceStore(state => state.savingsMasterPot);
    const mainBalance = (userInfo?.handBalance || 0);

    useEffect(() => {
        // Initialize based on route params and store data
        const master = storeMaster;
        if (master) {
            setLoadError(false);
            setSavingsPot(master);
            if (!goal) setGoal(initialGoal || master);
            
            // SMART DEFAULTS: 
            if (initialDirection === 'to_savings') {
                if (fromSavings && initialGoal && initialGoal._id !== master._id) {
                    setDirection('transfer_goal');
                    setSourceGoal(master);
                    setTargetGoal(initialGoal);
                } else if (fromSavings && (!initialGoal || initialGoal._id === master._id)) {
                    setDirection('to_savings');
                    setSourceGoal(null);
                    setTargetGoal(master);
                } else {
                    setDirection('to_savings');
                    setSourceGoal(null); 
                    setTargetGoal(initialGoal || master);
                }
            } else if (initialDirection === 'from_savings') {
                if (fromSavings && initialGoal && initialGoal._id !== master._id) {
                    setDirection('transfer_goal');
                    setSourceGoal(initialGoal);
                    setTargetGoal(master);
                } else {
                    setDirection('from_savings');
                    setSourceGoal(initialGoal || master);
                    setTargetGoal(null);
                    setSelectedWallet(null);
                }
            } else if (initialDirection === 'transfer_goal') {
                setDirection('transfer_goal');
                setSourceGoal(initialSource || master);
                setTargetGoal(initialGoal);
            } else if (!initialDirection && !initialSource) {
                setDirection('transfer_goal');
                setSourceGoal(master);
                setTargetGoal(initialGoal);
            }
        }

        // Ensure we have the latest global balance and wallets
        useFinanceStore.getState().fetchTransactionSummary('all', true);
        useFinanceStore.getState().fetchWallets(true);
    }, [initialDirection, initialSource, fromSavings, storeMaster]);

    // Timeout guard: if storeMaster is still null after 6s, show error + retry
    useEffect(() => {
        if (storeMaster) return; // Already loaded, no timer needed
        useFinanceStore.getState().fetchSavings(true); // Proactively fetch
        const timer = setTimeout(() => {
            if (!useFinanceStore.getState().savingsMasterPot) {
                setLoadError(true);
            }
        }, 6000);
        return () => clearTimeout(timer);
    }, []);

    // SYNC LOCAL STATES WITH STORE UPDATES
    useEffect(() => {
        if (selectedWallet) {
            const updated = wallets.find(w => w._id === selectedWallet._id);
            if (updated) setSelectedWallet(updated);
        }
    }, [wallets]);

    useEffect(() => {
        if (goal) {
            const updated = goal.name === 'Savings Balance' ? storeMaster : storeGoals.find(g => g._id === goal._id);
            if (updated && updated.currentAmount !== goal.currentAmount) {
                setGoal(updated);
            }
        }
        if (sourceGoal) {
            const updated = sourceGoal.name === 'Savings Balance' ? storeMaster : storeGoals.find(g => g._id === sourceGoal._id);
            if (updated && updated.currentAmount !== sourceGoal.currentAmount) {
                setSourceGoal(updated);
            }
        }
        if (targetGoal) {
            const updated = targetGoal.name === 'Savings Balance' ? storeMaster : storeGoals.find(g => g._id === targetGoal._id);
            if (updated && updated.currentAmount !== targetGoal.currentAmount) {
                setTargetGoal(updated);
            }
        }
        if (savingsPot) {
            const updated = savingsPot.name === 'Savings Balance' ? storeMaster : storeGoals.find(g => g._id === savingsPot._id);
            if (updated && updated.currentAmount !== savingsPot.currentAmount) {
                setSavingsPot(updated);
            }
        }
    }, [storeGoals, storeMaster]);



    if ((isDirect || direction === 'income') && !goal) {
        // Error state — store data never arrived
        if (loadError) {
            return (
                <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
                    <MaterialCommunityIcons name="wifi-off" size={52} color={COLORS.textMuted} style={{ marginBottom: 16 }} />
                    <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.text, marginBottom: 8, textAlign: 'center' }}>Couldn't Load Savings</Text>
                    <Text style={{ fontSize: 14, color: COLORS.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: 24 }}>
                        We couldn't connect to your savings data. Please check your connection and try again.
                    </Text>
                    <TouchableOpacity
                        onPress={() => {
                            setLoadError(false);
                            useFinanceStore.getState().fetchSavings(true);
                        }}
                        style={{ backgroundColor: COLORS.primary, paddingHorizontal: 28, paddingVertical: 14, borderRadius: radius.xl }}
                    >
                        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Retry</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 16, padding: 8 }}>
                        <Text style={{ color: COLORS.textMuted, fontSize: 13 }}>Go Back</Text>
                    </TouchableOpacity>
                </SafeAreaView>
            );
        }
        // Still loading
        return (
            <View style={{ flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator color={COLORS.primary} size="large" />
                <Text style={{ color: COLORS.textMuted, marginTop: 12, fontSize: 13 }}>Loading your savings...</Text>
            </View>
        );
    }

    const isToSavings = direction === 'to_savings' || direction === 'income' || direction === 'transfer_goal';
    const isGoalTransfer = direction === 'transfer_goal';
    const isWithdrawal = direction === 'from_savings';

    // Labels logic
    const fromLabel = direction === 'income' ? 'Savings Balance' : (isGoalTransfer ? (sourceGoal?.name || 'From Goal') : (direction === 'to_savings' ? (selectedWallet ? selectedWallet.name : 'HAND') : goal.name));
    const toLabel = isGoalTransfer ? (targetGoal?.name || 'To Goal') : (isWithdrawal ? (selectedWallet ? selectedWallet.name : 'HAND') : goal.name);

    // Balance labels shown inside the direction card
    const fromBalanceLabel = direction === 'income'
        ? formatCurrency(storeMaster?.currentAmount || 0, userInfo?.currency)
        : direction === 'to_savings'
            ? (selectedWallet ? getBalanceLabel(selectedWallet) : formatCurrency(mainBalance, userInfo?.currency))
            : isGoalTransfer
                ? formatCurrency(sourceGoal?.currentAmount || 0, userInfo?.currency)
                : formatCurrency(goal?.currentAmount || 0, userInfo?.currency);

    const toBalanceLabel = isGoalTransfer
        ? formatCurrency(targetGoal?.currentAmount || 0, userInfo?.currency)
        : isWithdrawal
            ? (selectedWallet ? getBalanceLabel(selectedWallet) : formatCurrency(mainBalance, userInfo?.currency))
            : formatCurrency(goal?.currentAmount || 0, userInfo?.currency);

    const accentColor = isGoalTransfer ? '#3b82f6' : (direction === 'income' ? '#8b5cf6' : (direction === 'to_savings' ? '#22c55e' : '#f59e0b'));

    const getCalculatedMax = () => {
        let maxAmt = 0;
        if (direction === 'to_savings') {
            maxAmt = selectedWallet ? (selectedWallet.type === 'Crypto' ? (selectedWallet.balance * (cryptoPrices[selectedWallet.coinId] || 0)) : selectedWallet.balance) : mainBalance;
        } else if (isGoalTransfer) {
            maxAmt = sourceGoal?.currentAmount || 0;
        } else if (isWithdrawal) {
            maxAmt = goal.currentAmount;
        }

        let targetLimited = false;
        let remaining = 0;

        if (isToSavings && !isWithdrawal && direction !== 'income') {
            const activeTargetGoal = isGoalTransfer ? targetGoal : goal;
            if (activeTargetGoal?.targetAmount > 0) {
                remaining = Math.max(0, activeTargetGoal.targetAmount - activeTargetGoal.currentAmount);
                if (remaining < maxAmt) {
                    maxAmt = remaining;
                    targetLimited = true;
                }
            }
        }
        return { maxAmt, targetLimited, remaining };
    };

    const maxInfo = getCalculatedMax();

    // Computed fee amount (flat or % of transfer)
    const computedFeeAmt = (() => {
        const raw = parseFloat(fee);
        if (!fee || isNaN(raw) || raw <= 0) return 0;
        const amt = parseFloat(amount) || 0;
        return feeType === 'percent' ? (raw / 100) * amt : raw;
    })();

    const showAlert = (type, title, message) => setAlert({ visible: true, type, title, message });
    const closeAlert = () => setAlert(a => ({ ...a, visible: false }));

    const handleTransfer = async () => {
        const amt = parseFloat(amount);
        const feeAmt = computedFeeAmt;
        if (!amount || isNaN(amt) || amt <= 0) {
            return showAlert('warning', 'Invalid Amount', 'Please enter a valid amount greater than 0.');
        }

        // Self-Transfer Check
        if (direction === 'transfer_goal') {
            const srcId = String(sourceGoal?._id || '');
            const destId = String(targetGoal?._id || goal?._id || '');
            if (srcId && destId && srcId === destId) {
                return showAlert('warning', 'Invalid Transfer', 'Source and destination goals cannot be the same.');
            }
        }

        // Balance Checks
        if (isWithdrawal && amt > goal.currentAmount) {
            return showAlert('warning', 'Insufficient Balance', `You only have ${formatCurrency(goal.currentAmount, userInfo?.currency)} in this goal.`);
        }
        if (isGoalTransfer && amt > (sourceGoal?.currentAmount || 0)) {
            return showAlert('warning', 'Insufficient Balance', `Source goal only has ${formatCurrency(sourceGoal.currentAmount, userInfo?.currency)}.`);
        }
        
        // WALLET PROTECTION
        if (direction === 'to_savings') {
            if (selectedWallet) {
                if (!hasEnoughBalance(selectedWallet, amt, cryptoPrices)) {
                    return showAlert('warning', 'Insufficient Balance', `Your ${selectedWallet.name} wallet doesn't have enough balance.`);
                }
            } else if (amt + feeAmt > mainBalance) {
                return showAlert('warning', 'Insufficient Balance',
                    `You only have ${formatCurrency(mainBalance, userInfo?.currency)} in your HAND.${
                        feeAmt > 0 ? ` (₱${amt.toFixed(2)} transfer + ₱${feeAmt.toFixed(2)} fee)` : ''
                    }`);
            }
        }

        // Target Amount Limit Safeguard
        const activeTargetGoal = isGoalTransfer ? targetGoal : goal;
        if (isToSavings && activeTargetGoal && activeTargetGoal.targetAmount > 0) {
            const remaining = activeTargetGoal.targetAmount - activeTargetGoal.currentAmount;
            if (amt > remaining && remaining >= 0) {
                return showAlert('warning', 'Target Exceeded', `This goal only needs ${formatCurrency(remaining, userInfo?.currency)} more to reach its target. You entered ${formatCurrency(amt, userInfo?.currency)}.`);
            }
        }

        setSaving(true);
        try {
            // Calculate native deduct amount if using a wallet
            let walletDeductAmount = null;
            if (selectedWallet) {
                const deduct = calcNativeDeduct(selectedWallet, amt, cryptoPrices);
                walletDeductAmount = deduct?.nativeAmount ?? null;
            }

            // NEW: Default Note Logic
            let finalNote = note;
            if (!note) {
                if (direction === 'from_savings') {
                    finalNote = `Withdrawal to ${selectedWallet ? selectedWallet.name : (targetGoal ? targetGoal.name : 'Main Balance')}`;
                }
                if (direction === 'to_savings') {
                    finalNote = `Deposit from ${selectedWallet ? selectedWallet.name : 'Main Balance'}`;
                }
                if (direction === 'transfer_goal') {
                    finalNote = `Move funds to ${targetGoal?.name || goal?.name || 'Savings'}`;
                }
            }

            await savingsTransfer({
                goalId: isGoalTransfer ? targetGoal._id : goal._id,
                amount: amt,
                direction,
                note: finalNote,
                sourceGoalId: isGoalTransfer ? sourceGoal._id : (isWithdrawal ? goal._id : sourceGoal?._id),
                sourceWalletId: selectedWallet?._id || null,
                walletDeductAmount,
                fee: feeAmt > 0 ? feeAmt : undefined,
                feeSourceWalletId: feeAmt > 0 ? (selectedWallet?._id || null) : undefined,
                feeNote: feeAmt > 0 ? (feeType === 'percent' ? `Rate: ${fee}%` : `Fixed: ₱${parseFloat(fee).toFixed(2)}`) : undefined,
            });

            // No need to manually re-fetch balance, the global store will handle it via sockets

            showAlert('success', 'Success!', `${formatCurrency(amt, userInfo?.currency)} moved successfully.`);
        } catch (err) {
            showAlert('error', 'Failed', err?.response?.data?.error || 'Something went wrong.');
        } finally {
            setSaving(false);
        }
    };

    const handleMaxPress = () => {
        if (maxInfo.maxAmt > 0) {
            setAmount(maxInfo.maxAmt.toFixed(2));
        }
    };

    const handleSelectOption = (type) => {
        if (selectorMode === 'source') {
            if (type === 'main') {
                setDirection('to_savings');
                setSourceGoal(null);
                setSelectedWallet(null);
            } else if (type === 'savings') {
                setDirection('transfer_goal');
                setSourceGoal(savingsPot);
                setTargetGoal(goal);
                setSelectedWallet(null);
            } else {
                // Wallet selected
                setDirection('to_savings');
                setSelectedWallet(type);
                setSourceGoal(null);
            }
        } else {
            // Target Selection for withdrawal
            if (type === 'main') {
                setDirection('from_savings');
                setTargetGoal(null);
                setSelectedWallet(null);
            } else if (type === 'savings') {
                setDirection('transfer_goal');
                setSourceGoal(goal);
                setTargetGoal(savingsPot);
                setSelectedWallet(null);
            } else {
                // Wallet selected
                setDirection('from_savings');
                setSelectedWallet(type);
                setTargetGoal(null);
            }
        }
        setSelectorModalVisible(false);
    };

    const isFromGoalContext = !!initialGoal;
    // Locked if we are adding money TO this specific goal (from wallet or savings pot)
    const isAddingToThisGoal = isFromGoalContext && (direction === 'to_savings' || (direction === 'transfer_goal' && targetGoal?._id === initialGoal?._id));
    const canSelectTarget = !isAddingToThisGoal;

    // Locked if we are taking money FROM this specific goal
    const isTakingFromThisGoal = isFromGoalContext && (direction === 'from_savings' || (direction === 'transfer_goal' && sourceGoal?._id === initialGoal?._id));
    const canSelectSource = direction !== 'income' && !isTakingFromThisGoal && !initialSource;

    return (
        <SafeAreaView style={styles.safe}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

                    {/* Header */}
                    <View style={styles.header}>
                        <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backBtn, { backgroundColor: COLORS.surface }]}>
                            <Feather name="arrow-left" size={20} color={COLORS.text} />
                        </TouchableOpacity>
                        <Text style={[styles.headerTitle, { color: COLORS.text }]}>Transfer</Text>
                        <TouchableOpacity
                            style={[styles.backBtn, { backgroundColor: COLORS.surface }]}
                            onPress={() => navigation.navigate('SavingsTransferHistory')}
                        >
                            <Feather name="clock" size={18} color={COLORS.primary} />
                        </TouchableOpacity>
                    </View>

                    {/* Transfer Direction Card */}
                    <View style={[styles.dirCard, { backgroundColor: COLORS.surface }]}>
                        {/* FROM */}
                        <TouchableOpacity
                            style={styles.dirRow}
                            disabled={!canSelectSource}
                            onPress={() => { 
                                if (!canSelectSource) return;
                                setSelectorMode('source'); 
                                setSelectorModalVisible(true); 
                            }}
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                <View style={{ flex: 1 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                        <Text style={[styles.dirLabel, { color: COLORS.textMuted }]}>From</Text>
                                        {canSelectSource ? <Feather name="chevron-down" size={12} color={COLORS.textMuted} /> : null}
                                    </View>
                                    <View style={styles.dirWalletRow}>
                                        <View style={[styles.dirIcon, { 
                                            backgroundColor: (selectedWallet && direction === 'to_savings') 
                                                ? (selectedWallet.color + '20') 
                                                : (accentColor + '20') 
                                        }]}>
                                            {direction === 'income' ? (
                                                <MaterialCommunityIcons name="piggy-bank-outline" size={16} color={accentColor} />
                                            ) : (direction === 'to_savings' && !selectedWallet) || (isGoalTransfer && sourceGoal?._id === (savingsPot?._id)) ? (
                                                <Feather name={direction === 'to_savings' ? "home" : "plus-circle"} size={16} color={accentColor} />
                                            ) : (selectedWallet && direction === 'to_savings') ? (
                                                <>
                                                    {selectedWallet.type === 'Crypto' ? (
                                                        <MaterialCommunityIcons name="bitcoin" size={16} color={selectedWallet.color} />
                                                    ) : selectedWallet.type === 'Stocks' ? (
                                                        <Feather name="trending-up" size={16} color={selectedWallet.color} />
                                                    ) : (
                                                        <Feather name="credit-card" size={16} color={selectedWallet.color} />
                                                    )}
                                                </>
                                            ) : (
                                                <IconRenderer name={isGoalTransfer ? sourceGoal?.icon : goal?.icon || 'target'} family={isGoalTransfer ? sourceGoal?.family : goal?.family} size={16} color={accentColor} />
                                            )}
                                        </View>
                                        <View>
                                            <Text style={[styles.dirWallet, { color: COLORS.text }]}>{fromLabel}</Text>
                                            <Text style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2, fontWeight: '600' }}>{fromBalanceLabel}</Text>
                                        </View>
                                    </View>
                                </View>
                            </View>
                        </TouchableOpacity>

                        {/* TO */}
                        <TouchableOpacity
                            style={[styles.dirRow, { borderTopWidth: 1, borderTopColor: COLORS.border }]}
                            disabled={!canSelectTarget}
                            onPress={() => { 
                                if (!canSelectTarget) return;
                                setSelectorMode('target'); 
                                setSelectorModalVisible(true); 
                            }}
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                <Text style={[styles.dirLabel, { color: COLORS.textMuted }]}>To</Text>
                                {canSelectTarget ? <Feather name="chevron-down" size={12} color={COLORS.textMuted} /> : null}
                            </View>
                            <View style={styles.dirWalletRow}>
                                <View style={[styles.dirIcon, { 
                                    backgroundColor: (selectedWallet && isWithdrawal) 
                                        ? (selectedWallet.color + '20') 
                                        : (accentColor + '20') 
                                }]}>
                                    {isWithdrawal ? (
                                        selectedWallet ? (
                                            <>
                                                {selectedWallet.type === 'Crypto' ? (
                                                    <MaterialCommunityIcons name="bitcoin" size={16} color={selectedWallet.color} />
                                                ) : selectedWallet.type === 'Stocks' ? (
                                                    <Feather name="trending-up" size={16} color={selectedWallet.color} />
                                                ) : (
                                                    <Feather name="credit-card" size={16} color={selectedWallet.color} />
                                                )}
                                            </>
                                        ) : (
                                            <Feather name="home" size={16} color={accentColor} />
                                        )
                                    ) : (
                                        <IconRenderer name={isGoalTransfer ? targetGoal?.icon : goal?.icon || 'target'} family={isGoalTransfer ? targetGoal?.family : goal?.family} size={16} color={accentColor} />
                                    )}
                                </View>
                                <View>
                                    <Text style={[styles.dirWallet, { color: COLORS.text }]}>{toLabel}</Text>
                                    <Text style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2, fontWeight: '600' }}>{toBalanceLabel}</Text>
                                </View>
                            </View>
                        </TouchableOpacity>
                    </View>

                    {/* Savings balance hint */}
                    <View style={[styles.balanceHint, { backgroundColor: COLORS.surface }]}>
                        <Feather name="info" size={14} color={COLORS.textMuted} />
                        <Text style={[styles.balanceHintText, { color: COLORS.textMuted }]}>
                            {direction === 'to_savings'
                                ? (selectedWallet ? `Available in ${selectedWallet.name}: ` : 'Available in HAND: ')
                                : isGoalTransfer
                                    ? `Available in ${sourceGoal?.name || 'Goal'}: `
                                    : `Available in ${goal?.name || 'Goal'}: `}
                            <Text style={{ fontWeight: '800', color: COLORS.text }}>
                                {direction === 'to_savings'
                                    ? (selectedWallet ? getBalanceLabel(selectedWallet) : formatCurrency(mainBalance, userInfo?.currency))
                                    : isGoalTransfer
                                        ? formatCurrency(sourceGoal?.currentAmount || 0, userInfo?.currency)
                                        : formatCurrency(goal?.currentAmount || 0, userInfo?.currency)}
                            </Text>
                        </Text>
                    </View>

                    <View style={styles.amountCard}>
                        <View style={styles.amountHeader}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Text style={[styles.amountLabel, { color: COLORS.textMuted }]}>HOW MUCH?</Text>
                                {maxInfo.targetLimited && (
                                    <View style={{ backgroundColor: COLORS.primary + '15', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                        <Text style={{ fontSize: 10, color: COLORS.primary, fontWeight: '700' }}>
                                            Only {formatCurrency(maxInfo.remaining, userInfo?.currency)} to hit target!
                                        </Text>
                                    </View>
                                )}
                            </View>
                            <TouchableOpacity
                                style={[styles.maxBtn, { backgroundColor: accentColor + '15' }]}
                                onPress={handleMaxPress}
                                activeOpacity={0.7}
                            >
                                <Text style={[styles.maxBtnText, { color: accentColor }]}>MAX</Text>
                            </TouchableOpacity>
                        </View>
                        <View style={styles.amountRow}>
                            <Text style={[styles.currency, { color: COLORS.text }]}>₱</Text>
                            <TextInput
                                style={[styles.input, { color: COLORS.text }]}
                                value={amount}
                                onChangeText={setAmount}
                                placeholder="0.00"
                                placeholderTextColor={COLORS.textMuted}
                                keyboardType="numeric"
                                autoFocus={false}
                            />
                        </View>

                        {/* NATIVE COST PREVIEW */}
                        {selectedWallet && amount && !isNaN(parseFloat(amount)) && (
                            <View style={[styles.nativeCostRow, { borderTopColor: COLORS.border }]}>
                                {(() => {
                                    const deduct = calcNativeDeduct(selectedWallet, parseFloat(amount), cryptoPrices);
                                    if (deduct?.hasPrice && selectedWallet.type === 'Crypto') {
                                        return (
                                            <>
                                                <Text style={[styles.nativeCostLabel, { color: COLORS.textMuted }]}>Native Cost</Text>
                                                <Text style={[styles.nativeCostValue, { color: selectedWallet.color || COLORS.primary }]}>
                                                    {parseFloat(deduct.nativeAmount.toFixed(8))} {deduct.symbol}
                                                </Text>
                                            </>
                                        );
                                    }
                                    return null;
                                })()}
                            </View>
                        )}

                        <View style={[styles.noteRow, { backgroundColor: COLORS.background }]}>
                            <Feather name="edit-3" size={16} color={COLORS.textMuted} />
                            <TextInput
                                style={[styles.noteInput, { color: COLORS.text }]}
                                value={note}
                                onChangeText={setNote}
                                placeholder="What's this for?"
                                placeholderTextColor={COLORS.textMuted}
                                multiline
                            />
                        </View>

                        <View style={[styles.feeRow, { backgroundColor: COLORS.background }]}>
                            <Feather name="percent" size={14} color={COLORS.textMuted} style={{ marginTop: 14 }} />
                            <View style={{ flex: 1 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                    <Text style={{ fontSize: 10, fontWeight: '800', color: COLORS.textMuted, letterSpacing: 0.5 }}>TRANSFER FEE (OPTIONAL)</Text>
                                    {/* Fixed / % toggle */}
                                    <View style={{ flexDirection: 'row', borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border }}>
                                        <TouchableOpacity
                                            onPress={() => setFeeType('fixed')}
                                            style={{ paddingHorizontal: 10, paddingVertical: 4, backgroundColor: feeType === 'fixed' ? accentColor : 'transparent' }}
                                        >
                                            <Text style={{ fontSize: 11, fontWeight: '800', color: feeType === 'fixed' ? '#fff' : COLORS.textMuted }}>₱ Fixed</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            onPress={() => setFeeType('percent')}
                                            style={{ paddingHorizontal: 10, paddingVertical: 4, backgroundColor: feeType === 'percent' ? accentColor : 'transparent' }}
                                        >
                                            <Text style={{ fontSize: 11, fontWeight: '800', color: feeType === 'percent' ? '#fff' : COLORS.textMuted }}>% Rate</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                                <TextInput
                                    style={[styles.noteInput, { color: COLORS.text }]}
                                    value={fee}
                                    onChangeText={setFee}
                                    placeholder={feeType === 'fixed' ? 'e.g. 25.00 — bank/ATM fee' : 'e.g. 1.5 — percent of transfer'}
                                    placeholderTextColor={COLORS.textMuted}
                                    keyboardType="numeric"
                                />
                                {/* Fee preview for percent mode */}
                                {feeType === 'percent' && computedFeeAmt > 0 && (
                                    <Text style={{ fontSize: 11, color: accentColor, fontWeight: '700', marginTop: 4 }}>
                                        = {formatCurrency(computedFeeAmt, userInfo?.currency)} deducted from {selectedWallet ? selectedWallet.name : 'HAND'}
                                    </Text>
                                )}
                                {feeType === 'fixed' && computedFeeAmt > 0 && (
                                    <Text style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: '600', marginTop: 4 }}>
                                        Deducted from {selectedWallet ? selectedWallet.name : 'HAND'}
                                    </Text>
                                )}
                            </View>
                        </View>
                    </View>

                    <TouchableOpacity
                        style={[styles.payBtn, { backgroundColor: accentColor }]}
                        activeOpacity={0.8}
                        onPress={handleTransfer}
                        disabled={saving}
                    >
                        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.payBtnText}>Confirm Transfer</Text>}
                    </TouchableOpacity>
                </ScrollView>
            </KeyboardAvoidingView>

            <BottomSheetModal
                visible={selectorModalVisible}
                onClose={() => setSelectorModalVisible(false)}
                title={selectorMode === 'source' ? "Select Source" : "Select Destination"}
            >
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
                    <View style={styles.modalGrid}>
                        <TouchableOpacity
                            style={[styles.modalItem, { backgroundColor: COLORS.surface }]}
                            onPress={() => handleSelectOption('main')}
                        >
                            <View style={[styles.modalItemIcon, { backgroundColor: COLORS.primary + '20' }]}>
                                <MaterialCommunityIcons name="hand-coin-outline" size={20} color={COLORS.primary} />
                            </View>
                            <Text style={[styles.modalItemLabel, { color: COLORS.text }]}>HAND</Text>
                            <Text style={[styles.modalItemValue, { color: COLORS.textMuted }]}>{selectorMode === 'source' ? formatCurrency(mainBalance) : 'Send to HAND'}</Text>
                        </TouchableOpacity>

                        {savingsPot && (selectorMode === 'source' ? targetGoal?._id !== savingsPot._id : sourceGoal?._id !== savingsPot._id) && (
                            <TouchableOpacity
                                style={[styles.modalItem, { backgroundColor: COLORS.surface }]}
                                onPress={() => handleSelectOption('savings')}
                            >
                                <View style={[styles.modalItemIcon, { backgroundColor: '#3b82f620' }]}>
                                    <MaterialCommunityIcons name="piggy-bank-outline" size={20} color="#3b82f6" />
                                </View>
                                <Text style={[styles.modalItemLabel, { color: COLORS.text }]}>Savings Balance</Text>
                                <Text style={[styles.modalItemValue, { color: COLORS.textMuted }]}>{selectorMode === 'source' ? formatCurrency(savingsPot.currentAmount, userInfo?.currency) : 'Move to Pot'}</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    {(selectorMode === 'source' ? (direction !== 'from_savings') : (direction === 'from_savings' || direction === 'transfer_goal')) && (
                        <View style={{ marginTop: spacing.lg }}>
                            <Text style={[styles.sectionTitle, { color: COLORS.textMuted, marginLeft: 4, marginBottom: spacing.md }]}>OR {selectorMode === 'source' ? 'USE' : 'SEND TO'} WALLET</Text>
                            <WalletSelector
                                selectedWalletId={selectedWallet?._id}
                                onSelect={(w) => handleSelectOption(w)}
                                COLORS={COLORS}
                                isExpense={selectorMode === 'source'}
                            />
                        </View>
                    )}
                </ScrollView>
            </BottomSheetModal>

            <CustomAlertModal
                visible={alert.visible}
                onClose={closeAlert}
                title={alert.title}
                message={alert.message}
                type={alert.type}
                onConfirm={alert.type === 'success' ? () => { closeAlert(); navigation.goBack(); } : closeAlert}
            />
        </SafeAreaView>
    );
}

const getStyles = (COLORS) => StyleSheet.create({
    safe: { flex: 1, backgroundColor: COLORS.background },
    content: { padding: spacing.lg },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xl },
    backBtn: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    headerTitle: { fontSize: 18, fontWeight: '800' },
    dirCard: { borderRadius: radius.xl, padding: spacing.md, marginBottom: spacing.md },
    dirRow: { paddingVertical: spacing.md },
    dirLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', marginBottom: 4 },
    dirWalletRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    dirIcon: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
    dirWallet: { fontSize: 16, fontWeight: '800' },
    balanceHint: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: spacing.md, borderRadius: radius.lg, marginBottom: spacing.lg },
    balanceHintText: { fontSize: 12, fontWeight: '600' },
    amountCard: { backgroundColor: COLORS.surface, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.xl },
    amountLabel: { fontSize: 11, fontWeight: '900', letterSpacing: 1 },
    amountHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
    maxBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    maxBtnText: { fontSize: 10, fontWeight: '900' },
    amountRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
    currency: { fontSize: 32, fontWeight: '800', marginRight: 8 },
    input: { flex: 1, fontSize: 48, fontWeight: '900', padding: 0 },
    nativeCostRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, marginTop: 4, borderTopWidth: 1, marginBottom: 16 },
    nativeCostLabel: { fontSize: 12, fontWeight: '700' },
    nativeCostValue: { fontSize: 14, fontWeight: '800' },
    noteRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.lg },
    feeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 12, borderRadius: radius.lg, marginTop: 8 },
    noteInput: { flex: 1, fontSize: 14, fontWeight: '500', minHeight: 40 },
    payBtn: { height: 60, borderRadius: radius.xl, justifyContent: 'center', alignItems: 'center', elevation: 4, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 5 } },
    payBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
    modalGrid: { flexDirection: 'row', gap: 12 },
    modalItem: { flex: 1, padding: 16, borderRadius: radius.xl, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' },
    modalItemIcon: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
    modalItemLabel: { fontSize: 14, fontWeight: '800', textAlign: 'center', marginBottom: 4 },
    modalItemValue: { fontSize: 11, fontWeight: '600', textAlign: 'center' },
    sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
});
