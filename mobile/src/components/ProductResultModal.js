import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, TextInput,
    KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard, Animated, Modal
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { formatRelativeTime } from '../utils/barcodePriceCache';

export default function ProductResultModal({
    visible,
    product,
    cached,
    COLORS,
    onClose,
    onConfirm,
    confirmText = "Log as Expense",
    confirmIcon = "check"
}) {
    const [price, setPrice] = useState('');
    const [editingName, setEditingName] = useState('');
    const slideAnim = useRef(new Animated.Value(400)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (product?.price) setPrice(String(product.price));
        else setPrice('');
        
        if (product?.name) setEditingName(product.name);
        else setEditingName('');
    }, [product]);

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
                Animated.spring(slideAnim, { toValue: 0, tension: 70, friction: 11, useNativeDriver: true }),
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
                Animated.timing(slideAnim, { toValue: 400, duration: 230, useNativeDriver: true }),
            ]).start();
        }
    }, [visible]);

    if (!visible && slideAnim._value === 400) return null; // Unmount when completely hidden
    if (!product) return null;

    const hasSuggestedPrice = !!product.price;

    return (
        <Modal transparent visible={visible} animationType="none" onRequestClose={onClose} statusBarTranslucent>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <Animated.View style={[pStyles.overlay, { opacity: fadeAnim }]} />
            </TouchableWithoutFeedback>

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={pStyles.kav}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
            >
                <Animated.View
                    style={[
                        pStyles.sheet,
                        { backgroundColor: COLORS.surface, transform: [{ translateY: slideAnim }] }
                    ]}
                >
                    {/* Handle */}
                    <View style={[pStyles.handle, { backgroundColor: COLORS.border }]} />

                    {/* ──── NEW ITEM LOGIC ──── */}
                    {product.name == null ? (
                        <>
                            <View style={pStyles.headerRow}>
                                <View style={{ flex: 1 }}>
                                    <Text style={[pStyles.sheetTitle, { color: COLORS.text }]}>Add Item</Text>
                                    <Text style={{ fontSize: 13, color: COLORS.textMuted, marginTop: 4 }}>
                                        Barcode: {product.barcode}
                                    </Text>
                                </View>
                            </View>

                            <View style={[pStyles.genericInputRow, { backgroundColor: COLORS.background, borderColor: COLORS.border, marginBottom: 12 }]}>
                                <TextInput
                                    style={[pStyles.genericInput, { color: COLORS.text }]}
                                    value={editingName}
                                    onChangeText={setEditingName}
                                    placeholder="Item Name"
                                    placeholderTextColor={COLORS.textMuted}
                                    autoFocus={true}
                                />
                            </View>
                            
                            <View style={[pStyles.genericInputRow, { backgroundColor: COLORS.background, borderColor: COLORS.border, marginBottom: 24 }]}>
                                <TextInput
                                    style={[pStyles.genericInput, { color: COLORS.text }]}
                                    value={price}
                                    onChangeText={setPrice}
                                    placeholder="Price (₱)"
                                    placeholderTextColor={COLORS.textMuted}
                                    keyboardType="decimal-pad"
                                    returnKeyType="done"
                                    onSubmitEditing={() => Keyboard.dismiss()}
                                />
                            </View>
                        </>
                    ) : (
                        /* ──── PRODUCT FOUND LOGIC ──── */
                        <>
                            {/* Header */}
                            <View style={pStyles.headerRow}>
                                <View style={[pStyles.successBadge, { backgroundColor: '#22c55e20' }]}>
                                    <Feather name="check-circle" size={20} color="#22c55e" />
                                </View>
                                <View style={{ flex: 1, marginLeft: 12 }}>
                                    <Text style={[pStyles.sheetTitle, { color: COLORS.text }]}>Product Found!</Text>
                                    <Text style={[pStyles.sheetSub, { color: COLORS.textMuted }]}>Review details before proceeding</Text>
                                </View>
                                <TouchableOpacity onPress={onClose} style={[pStyles.closeBtn, { backgroundColor: COLORS.border }]}>
                                    <Feather name="x" size={16} color={COLORS.text} />
                                </TouchableOpacity>
                            </View>

                            {/* Product Info */}
                            <View style={[pStyles.productCard, { backgroundColor: COLORS.background, borderColor: COLORS.border }]}>
                                <View style={pStyles.productRow}>
                                    <View style={[pStyles.productIcon, { backgroundColor: COLORS.primary + '20' }]}>
                                        <Feather name="package" size={22} color={COLORS.primary} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[pStyles.productName, { color: COLORS.text }]} numberOfLines={2}>
                                            {product.name}
                                        </Text>
                                        <Text style={[pStyles.productBrand, { color: COLORS.textMuted }]}>
                                            {product.brand ? `${product.brand} · ` : ''}Barcode: {product.barcode}
                                        </Text>
                                    </View>
                                </View>
                            </View>

                            {/* Price History Badge */}
                            {cached && cached.price ? (
                                <View style={[pStyles.historyBadge, { backgroundColor: '#22c55e15', borderColor: '#22c55e30' }]}>
                                    <Feather name="clock" size={13} color="#22c55e" />
                                    <View style={{ flex: 1 }}>
                                        <Text style={[pStyles.historyText, { color: '#22c55e' }]}>
                                            Last recorded: <Text style={{ fontWeight: '800' }}>₱{parseFloat(cached.price).toFixed(2)}</Text>
                                        </Text>
                                        {cached.count && (
                                            <Text style={[pStyles.historyCount, { color: '#22c55e99' }]}>
                                                Scanned {cached.count} time{cached.count > 1 ? 's' : ''} before
                                            </Text>
                                        )}
                                    </View>
                                    <Feather name="check-circle" size={14} color="#22c55e" />
                                </View>
                            ) : null}

                            {/* Price Input */}
                            <View style={pStyles.priceSection}>
                                <View style={pStyles.priceLabelRow}>
                                    <Text style={[pStyles.priceLabel, { color: COLORS.textMuted }]}>AMOUNT (₱)</Text>
                                    {hasSuggestedPrice && (
                                        <View style={[pStyles.suggestedBadge, { backgroundColor: '#f59e0b20' }]}>
                                            <Feather name="info" size={11} color="#f59e0b" />
                                            <Text style={[pStyles.suggestedText, { color: '#f59e0b' }]}>
                                                Suggested price — adjust if needed
                                            </Text>
                                        </View>
                                    )}
                                </View>
                                <View style={[pStyles.inputRow, { backgroundColor: COLORS.background, borderColor: COLORS.border }]}>
                                    <Text style={[pStyles.currencySymbol, { color: COLORS.primary }]}>₱</Text>
                                    <TextInput
                                        style={[pStyles.priceInput, { color: COLORS.text }]}
                                        value={price}
                                        onChangeText={setPrice}
                                        keyboardType="decimal-pad"
                                        returnKeyType="done"
                                        onSubmitEditing={() => Keyboard.dismiss()}
                                        placeholder="Enter price"
                                        placeholderTextColor={COLORS.textMuted}
                                        autoFocus={!hasSuggestedPrice}
                                        blurOnSubmit={true}
                                    />
                                    {price !== '' && (
                                        <TouchableOpacity onPress={() => setPrice('')}>
                                            <Feather name="x-circle" size={18} color={COLORS.textMuted} />
                                        </TouchableOpacity>
                                    )}
                                </View>
                                {!hasSuggestedPrice && !cached?.price && (
                                    <Text style={[pStyles.noPrice, { color: COLORS.textMuted }]}>
                                        💡 No price found in memory — enter the actual price manually.
                                    </Text>
                                )}
                            </View>
                        </>
                    )}

                    {/* Actions */}
                    <View style={pStyles.actions}>
                        <TouchableOpacity
                            style={[pStyles.scanAgainBtn, { borderColor: COLORS.border }]}
                            onPress={onClose}
                            activeOpacity={0.75}
                        >
                            {product.name ? (
                                <Feather name="x" size={16} color={COLORS.text} style={{ marginRight: 6 }} />
                            ) : null}
                            <Text style={[pStyles.scanAgainText, { color: COLORS.text }]}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[pStyles.confirmBtn, { backgroundColor: COLORS.primary }]}
                            onPress={() => onConfirm(price, editingName)}
                            activeOpacity={0.85}
                        >
                            {product.name ? (
                                <Feather name={confirmIcon} size={16} color="#fff" style={{ marginRight: 6 }} />
                            ) : null}
                            <Text style={pStyles.confirmText}>{confirmText}</Text>
                        </TouchableOpacity>
                    </View>
                </Animated.View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const pStyles = StyleSheet.create({
    overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
    kav: { flex: 1, justifyContent: 'flex-end' },
    sheet: {
        borderTopLeftRadius: 28, borderTopRightRadius: 28,
        padding: 24, paddingBottom: 40,
    },
    handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
    headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    successBadge: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    sheetTitle: { fontSize: 18, fontWeight: '800' },
    sheetSub: { fontSize: 12, marginTop: 2 },
    closeBtn: { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    productCard: { borderRadius: 16, borderWidth: 1.5, padding: 14, marginBottom: 20 },
    productRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    productIcon: { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
    productName: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
    productBrand: { fontSize: 11 },
    priceSection: { marginBottom: 20 },
    priceLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    priceLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
    suggestedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
    suggestedText: { fontSize: 10, fontWeight: '600' },
    inputRow: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 12,
    },
    currencySymbol: { fontSize: 22, fontWeight: '800' },
    priceInput: { flex: 1, fontSize: 24, fontWeight: '800' },
    noPrice: { fontSize: 12, marginTop: 8, textAlign: 'center' },
    historyBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 16,
    },
    historyText: { fontSize: 13, fontWeight: '600' },
    historyCount: { fontSize: 11, marginTop: 2 },
    actions: { flexDirection: 'row', gap: 12 },
    scanAgainBtn: {
        flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
        paddingVertical: 14, borderRadius: 16, borderWidth: 1.5,
    },
    scanAgainText: { fontSize: 14, fontWeight: '700' },
    confirmBtn: {
        flex: 1.5, flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
        paddingVertical: 14, borderRadius: 16,
    },
    confirmText: { color: '#fff', fontSize: 14, fontWeight: '800' },
    genericInputRow: {
        borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 16, paddingVertical: 14,
    },
    genericInput: { fontSize: 16, fontWeight: '600' }
});
