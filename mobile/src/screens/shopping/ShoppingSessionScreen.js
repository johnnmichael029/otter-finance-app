import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, TextInput,
    FlatList, Alert, ActivityIndicator, Animated, Keyboard, Modal, TouchableWithoutFeedback, KeyboardAvoidingView, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { Camera, CameraView } from 'expo-camera';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useSecurity } from '../../context/SecurityContext';
import {
    createShoppingSession, updateShoppingCart, lookupShoppingBarcode, cancelShopping, createShoppingTemplate
} from '../../api/api';
import { spacing, radius } from '../../theme/colors';
import CustomAlertModal from '../../components/CustomAlertModal';
import ProductResultModal from '../../components/ProductResultModal';
import { getSocket } from '../../utils/socket';
import { getCachedBarcode, saveBarcodePriceCache } from '../../utils/barcodePriceCache';
import { formatCurrency } from '../../utils/formatters';

const OPEN_FOOD_API = 'https://world.openfoodfacts.org/api/v0/product/';
const UPC_API = 'https://api.upcitemdb.com/prod/trial/lookup?upc=';

let scanDebounce = null;

export default function ShoppingSessionScreen({ route, navigation }) {
    const COLORS = useTheme(state => state.COLORS);
    const { userInfo } = useAuth();
    const { setShouldIgnoreLock } = useSecurity();
    const styles = getStyles(COLORS);

    // ── Session State ────────────────────────────────────────────
    const [session, setSession] = useState(null);
    const [label, setLabel] = useState('Grocery Run');
    const [budget, setBudget] = useState('');
    const [setupDone, setSetupDone] = useState(false);
    const [saving, setSaving] = useState(false);

    // ── Cart State ───────────────────────────────────────────────
    const [items, setItems] = useState([]);
    const [syncing, setSyncing] = useState(false);

    // ── Scanner State ────────────────────────────────────────────
    const [scannerVisible, setScannerVisible] = useState(false);
    const [hasPermission, setHasPermission] = useState(null);
    const [scanning, setScanning] = useState(false);

    // ── Manual Entry ─────────────────────────────────────────────
    const [addItemModal, setAddItemModal] = useState(false);
    const [editingBarcode, setEditingBarcode] = useState('');
    const [editingName, setEditingName] = useState('');
    const [editingPrice, setEditingPrice] = useState('');
    const [editingIndex, setEditingIndex] = useState(null);

    // ── Scan Overlay Modals ──────────────────────────────────────
    const [loading, setLoading] = useState(false);
    const [productModal, setProductModal] = useState({ visible: false, product: null, cached: null });

    // ── Alert ────────────────────────────────────────────────────
    const [alertConfig, setAlertConfig] = useState({ visible: false, title: '', message: '', type: 'confirm', onConfirm: () => { } });
    const [saveTemplateModal, setSaveTemplateModal] = useState(false);
    const [newTemplateName, setNewTemplateName] = useState('');
    const hasBudgetAlertedNear = useRef(false);
    const hasBudgetAlertedReached = useRef(false);

    const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const budgetNum = parseFloat(budget) || 0;
    const itemsPct = budgetNum > 0 ? (total / budgetNum) * 100 : 0;
    const pct = Math.min(itemsPct, 100);
    const budgetColor = itemsPct >= 100 ? '#ef4444' : itemsPct >= 80 ? '#f59e0b' : '#22c55e';

    // ── Budget Cap Monitor (Feature 16) ──────────────────────────
    useEffect(() => {
        if (budgetNum <= 0) return;

        if (itemsPct >= 100 && !hasBudgetAlertedReached.current) {
            hasBudgetAlertedReached.current = true;
            setAlertConfig({
                visible: true,
                title: 'Budget Reached! 🛑',
                message: `You have reached your limit of ${formatCurrency(budgetNum, userInfo?.currency)}. Be careful with further additions!`,
                type: 'info',
                onConfirm: () => setAlertConfig(p => ({ ...p, visible: false }))
            });
        } else if (itemsPct >= 80 && itemsPct < 100 && !hasBudgetAlertedNear.current) {
            hasBudgetAlertedNear.current = true;
            setAlertConfig({
                visible: true,
                title: 'Nearing Budget ⚠️',
                message: `You have used ${Math.round(itemsPct)}% of your ${formatCurrency(budgetNum, userInfo?.currency)} budget. Small items from here!`,
                type: 'info',
                onConfirm: () => setAlertConfig(p => ({ ...p, visible: false }))
            });
        }

        // Reset flags if user removes items
        if (itemsPct < 80) {
            hasBudgetAlertedNear.current = false;
            hasBudgetAlertedReached.current = false;
        } else if (itemsPct < 100) {
            hasBudgetAlertedReached.current = false;
        }
    }, [itemsPct, budgetNum]);

    // ── Resume existing session or load template if passed ───────
    useEffect(() => {
        const existing = route.params?.resumeSession;
        if (existing) {
            setSession(existing);
            setLabel(existing.label || 'Grocery Run');
            setBudget(String(existing.budget || ''));
            setItems(existing.items || []);
            setSetupDone(true);
            return;
        }

        const templateItems = route.params?.templateItems;
        if (templateItems && templateItems.length > 0) {
            // Ensure each item has required fields and reset quantities to 1
            const cleaned = templateItems.map(i => ({
                barcode: i.barcode || '',
                name: i.name,
                price: i.price || 0,
                quantity: i.quantity || 1,
            }));
            setItems(cleaned);
        }
        if (route.params?.templateLabel) setLabel(route.params.templateLabel);
        if (route.params?.templateBudget) setBudget(String(route.params.templateBudget));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [route.params?.resumeSession, route.params?.templateItems, route.params?.templateLabel, route.params?.templateBudget]);

    // ── Camera Permission ────────────────────────────────────────
    useEffect(() => {
        // Temporarily ignore auto-lock during permission dialog.
        // In production builds, the OS permission dialog briefly puts the app
        // into an 'inactive' state which would incorrectly trigger the AppLock.
        setShouldIgnoreLock(true);
        Camera.requestCameraPermissionsAsync()
            .then(({ status }) => setHasPermission(status === 'granted'))
            .finally(() => {
                // Small delay to ensure AppState has settled back to 'active'
                setTimeout(() => setShouldIgnoreLock(false), 1000);
            });
    }, []);

    // ── Scanner Animation ────────────────────────────────────────
    const scanLineAnim = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        if (!scannerVisible) {
            scanLineAnim.setValue(0);
            return;
        }
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(scanLineAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
                Animated.timing(scanLineAnim, { toValue: 0, duration: 2000, useNativeDriver: true }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, [scannerVisible]);

    const scanLineY = scanLineAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 220],
    });

    // ── Sync cart to backend ─────────────────────────────────────
    const syncCart = useCallback(async (newItems, sid) => {
        if (!sid) return;
        setSyncing(true);
        try {
            await updateShoppingCart(sid, newItems);
        } catch (e) {
            console.warn('[Shopping] sync error:', e);
        } finally {
            setSyncing(false);
        }
    }, []);

    // ── Handle Barcode Scan ──────────────────────────────────────
    // Exact same logic as BarcodeScannerScreen for consistent product discovery
    const handleScan = async ({ data }) => {
        if (scanning) return;
        setScanning(true);
        setLoading(true);

        try {
            // Check local price cache first (same as main scanner)
            const cached = await getCachedBarcode(data);

            // Also check personal shopping price memory
            let shoppingCached = null;
            try {
                const res = await lookupShoppingBarcode(data);
                if (res.found && res.item) {
                    shoppingCached = { price: res.item.price, name: res.item.name };
                }
            } catch (e) { }

            // Try Open Food Facts (same as main scanner)
            let product = null;
            const offRes = await fetch(`${OPEN_FOOD_API}${data}.json`);
            const offData = await offRes.json();

            if (offData.status === 1 && offData.product) {
                const p = offData.product;
                product = {
                    barcode: data,
                    name: p.product_name || p.abbreviated_product_name || 'Unknown Product',
                    brand: p.brands || '',
                    category: p.categories_tags?.[0]?.replace('en:', '') || 'Other',
                    image: p.image_front_url || null,
                    price: shoppingCached?.price ?? cached?.price ?? null,
                };
            }

            // Fallback: UPC Item DB (same as main scanner)
            if (!product) {
                const upcRes = await fetch(`${UPC_API}${data}`);
                const upcData = await upcRes.json();
                if (upcData.code === 'OK' && upcData.items?.length > 0) {
                    const item = upcData.items[0];
                    product = {
                        barcode: data,
                        name: item.title || 'Unknown Product',
                        brand: item.brand || '',
                        category: item.category || 'Other',
                        image: item.images?.[0] || null,
                        price: shoppingCached?.price ?? cached?.price ?? null,
                    };
                }
            }

            // Last resort: use cached data
            if (!product && (cached || shoppingCached)) {
                product = {
                    barcode: data,
                    name: shoppingCached?.name || cached?.name || null,
                    brand: cached?.brand || '',
                    price: shoppingCached?.price ?? cached?.price ?? null,
                };
            }

            setLoading(false);

            if (product) {
                setProductModal({ visible: true, product, cached: shoppingCached || cached });
            } else {
                // Unknown barcode — show modal with empty name so user can type it
                setProductModal({
                    visible: true,
                    product: { barcode: data, name: null, brand: '', price: null },
                    cached: null
                });
            }
        } catch (e) {
            setLoading(false);
            setProductModal({
                visible: true,
                product: { barcode: data, name: null, brand: '', price: null },
                cached: null
            });
        }
    };

    const handleConfirmProduct = async (priceStr, customName = '') => {
        const item = productModal.product;
        const finalPrice = parseFloat(priceStr) || 0;
        const finalName = (customName && customName.trim()) || item?.name;

        if (!finalName || !finalName.trim()) {
            setAlertConfig({
                visible: true,
                title: "Required",
                message: "Please enter a product name.",
                type: 'error',
                onConfirm: () => setAlertConfig(p => ({ ...p, visible: false }))
            });
            return;
        }

        // Save to local price cache (same as main scanner)
        await saveBarcodePriceCache(item.barcode, {
            name: finalName.trim(),
            brand: item.brand || '',
            price: finalPrice,
        });

        addItemToCart({
            barcode: item.barcode,
            name: finalName.trim(),
            price: finalPrice,
            quantity: 1,
        });
        setProductModal({ visible: false, product: null, cached: null });
        setTimeout(() => setScanning(false), 800);
    };

    // ── Add Item to Cart ─────────────────────────────────────────
    const addItemToCart = (item) => {
        setItems(prev => {
            // Merge if same barcode
            if (item.barcode) {
                const idx = prev.findIndex(i => i.barcode === item.barcode);
                if (idx !== -1) {
                    const updated = prev.map((i, ix) =>
                        ix === idx ? { ...i, quantity: i.quantity + 1 } : i
                    );
                    syncCart(updated, session?._id);
                    return updated;
                }
            }
            // No fake _id — let MongoDB generate a real ObjectId on save
            const newItems = [...prev, { barcode: item.barcode || '', name: item.name, price: item.price, quantity: item.quantity || 1 }];
            syncCart(newItems, session?._id);
            return newItems;
        });
    };

    // ── Confirm manual entry / edit ───────────────────────────────
    const confirmAddItem = () => {
        if (!editingName.trim() || !editingPrice) return;

        if (editingIndex !== null) {
            setItems(prev => {
                const updated = prev.map((item, i) =>
                    i === editingIndex
                        ? { ...item, name: editingName.trim(), price: parseFloat(editingPrice) || 0 }
                        : item
                );
                syncCart(updated, session?._id);
                return updated;
            });
        } else {
            addItemToCart({
                barcode: editingBarcode,
                name: editingName.trim(),
                price: parseFloat(editingPrice) || 0,
                quantity: 1,
            });
        }

        setAddItemModal(false);
        setEditingBarcode('');
        setEditingName('');
        setEditingPrice('');
        setEditingIndex(null);
        setTimeout(() => setScanning(false), 800);
    };

    // ── Edit Item ────────────────────────────────────────────────
    const editItem = (idx) => {
        const item = items[idx];
        setEditingBarcode(item.barcode || '');
        setEditingName(item.name);
        setEditingPrice(String(item.price));
        setEditingIndex(idx);
        setAddItemModal(true);
    };

    // ── Remove Item ──────────────────────────────────────────────
    const removeItem = (idx) => {
        const itemName = items[idx]?.name || 'this item';
        setAlertConfig({
            visible: true,
            title: 'Remove Item?',
            message: `Remove "${itemName}" from your cart?`,
            type: 'confirm',
            onConfirm: () => {
                setAlertConfig(p => ({ ...p, visible: false }));
                setItems(prev => {
                    const updated = prev.filter((_, i) => i !== idx);
                    syncCart(updated, session?._id);
                    return updated;
                });
            }
        });
    };

    // ── Qty Controls ─────────────────────────────────────────────
    const changeQty = (idx, delta) => {
        setItems(prev => {
            const updated = prev.map((item, i) => {
                if (i !== idx) return item;
                const newQty = Math.max(1, item.quantity + delta);
                return { ...item, quantity: newQty };
            });
            syncCart(updated, session?._id);
            return updated;
        });
    };

    // ── Start Session (Setup Step) ───────────────────────────────
    const startSession = async () => {
        if (!budgetNum || budgetNum <= 0) {
            setAlertConfig({ visible: true, title: 'Budget Required', message: 'Please set a shopping budget before starting.', type: 'info', onConfirm: () => setAlertConfig(p => ({ ...p, visible: false })) });
            return;
        }
        setSaving(true);
        try {
            const s = await createShoppingSession({ label, budget: budgetNum });
            setSession(s);
            // If there were pre-loaded template items, sync them to the new session immediately
            if (items.length > 0) {
                await updateShoppingCart(s._id, items).catch(() => { });
            }
            setSetupDone(true);
        } catch (e) {
            console.warn(e);
        } finally {
            setSaving(false);
        }
    };

    // ── Save as Template (Feature 14) ────────────────────────────
    const handleSaveTemplate = async () => {
        if (items.length === 0) {
            setAlertConfig({
                visible: true,
                title: 'Empty Cart',
                message: 'Add some items to your cart before saving as a template.',
                type: 'info',
                onConfirm: () => setAlertConfig(p => ({ ...p, visible: false }))
            });
            return;
        }
        setNewTemplateName(label);
        setSaveTemplateModal(true);
    };

    const confirmSaveTemplate = async () => {
        if (!newTemplateName.trim()) return;
        setSaveTemplateModal(false);
        try {
            setSyncing(true);
            await createShoppingTemplate({
                name: newTemplateName.trim(),
                emoji: '🛒',
                defaultBudget: budgetNum,
                items: items.map(i => ({
                    name: i.name,
                    price: i.price,
                    quantity: i.quantity,
                    barcode: i.barcode
                }))
            });
            setAlertConfig({
                visible: true,
                title: 'Success',
                message: 'Template saved successfully!',
                type: 'success',
                onConfirm: () => setAlertConfig(p => ({ ...p, visible: false }))
            });
        } catch (e) {
            setAlertConfig({
                visible: true,
                title: 'Error',
                message: e.response?.data?.error || 'Failed to save template',
                type: 'error',
                onConfirm: () => setAlertConfig(p => ({ ...p, visible: false }))
            });
        } finally {
            setSyncing(false);
        }
    };

    // ── Cancel Session ───────────────────────────────────────────
    const handleCancel = () => {
        setAlertConfig({
            visible: true,
            title: 'Cancel Shopping?',
            message: 'This session will be discarded. No charges will be made.',
            type: 'confirm',
            onConfirm: async () => {
                setAlertConfig(p => ({ ...p, visible: false }));
                if (session) await cancelShopping(session._id).catch(() => { });
                if (navigation.canGoBack()) {
                    navigation.goBack();
                } else {
                    navigation.navigate('ShoppingHome');
                }
            }
        });
    };

    // ─────────────────────────────────────────────────────────────
    //  SETUP SCREEN
    // ─────────────────────────────────────────────────────────────
    if (!setupDone) {
        return (
            <SafeAreaView style={[styles.safe, { backgroundColor: COLORS.background }]}>
                <View style={styles.setupContainer}>
                    <TouchableOpacity
                        onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('ShoppingHome')}
                        style={[styles.backBtn, { backgroundColor: COLORS.surface }]}
                    >
                        <Feather name="arrow-left" size={20} color={COLORS.text} />
                    </TouchableOpacity>

                    <View style={styles.setupHero}>
                        <Text style={styles.setupEmoji}>🛒</Text>
                        <Text style={[styles.setupTitle, { color: COLORS.text }]}>New Shopping Trip</Text>
                        <Text style={[styles.setupSub, { color: COLORS.textMuted }]}>Set your budget before you start scanning</Text>
                    </View>

                    <View style={[styles.inputCard, { backgroundColor: COLORS.surface }]}>
                        <Text style={[styles.inputLabel, { color: COLORS.textMuted }]}>Trip Label</Text>
                        <TextInput
                            style={[styles.textInput, { color: COLORS.text, borderColor: COLORS.border }]}
                            value={label}
                            onChangeText={setLabel}
                            placeholder="e.g. Grocery Run, SM, Puregold"
                            placeholderTextColor={COLORS.textMuted}
                        />
                        <Text style={[styles.inputLabel, { color: COLORS.textMuted, marginTop: 16 }]}>Budget (₱)</Text>
                        <TextInput
                            style={[styles.textInput, { color: COLORS.text, borderColor: COLORS.border }]}
                            value={budget}
                            onChangeText={setBudget}
                            keyboardType="decimal-pad"
                            placeholder="0.00"
                            placeholderTextColor={COLORS.textMuted}
                        />
                    </View>

                    <TouchableOpacity
                        style={[styles.startBtn, { backgroundColor: COLORS.primary, opacity: saving ? 0.7 : 1 }]}
                        onPress={startSession}
                        disabled={saving}
                        activeOpacity={0.85}
                    >
                        {saving ? <ActivityIndicator color="#fff" /> : (
                            <>
                                <Feather name="shopping-cart" size={20} color="#fff" />
                                <Text style={styles.startBtnText}>Start Shopping!</Text>
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

    // ─────────────────────────────────────────────────────────────
    //  ACTIVE SESSION SCREEN
    // ─────────────────────────────────────────────────────────────
    return (
        <SafeAreaView style={[styles.safe, { backgroundColor: COLORS.background }]}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={handleCancel} style={[styles.backBtn, { backgroundColor: COLORS.surface }]}>
                    <Feather name="x" size={20} color="#ef4444" />
                </TouchableOpacity>
                <View style={{ flex: 1, marginHorizontal: 12 }}>
                    <Text style={[styles.headerTitle, { color: COLORS.text }]} numberOfLines={1}>{label}</Text>
                    {syncing && <Text style={[{ fontSize: 10, color: COLORS.textMuted }]}>Saving...</Text>}
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                        style={[styles.saveTemplateBtn, { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border }]}
                        onPress={handleSaveTemplate}
                    >
                        <Feather name="save" size={18} color={COLORS.text} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.scanBtn, { backgroundColor: COLORS.primary }]}
                        onPress={() => setScannerVisible(true)}
                        activeOpacity={0.85}
                    >
                        <MaterialCommunityIcons name="barcode-scan" size={20} color="#fff" />
                        <Text style={styles.scanBtnText}>Scan</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Budget Progress Bar */}
            <View style={[styles.budgetCard, { backgroundColor: COLORS.surface }]}>
                <View style={styles.budgetRow}>
                    <Text style={[styles.budgetLabel, { color: COLORS.textMuted }]}>Budget Used</Text>
                    <Text style={[styles.budgetPct, { color: budgetColor }]}>{Math.round(pct)}%</Text>
                </View>
                <View style={[styles.barBg, { backgroundColor: COLORS.border }]}>
                    <Animated.View style={[styles.barFill, { width: `${pct}%`, backgroundColor: budgetColor }]} />
                </View>
                <View style={styles.budgetAmounts}>
                    <Text style={[styles.totalAmount, { color: budgetColor }]}>{formatCurrency(total, userInfo?.currency)}</Text>
                    <Text style={[styles.budgetAmount, { color: COLORS.textMuted }]}>of {formatCurrency(budgetNum, userInfo?.currency)}</Text>
                </View>
            </View>

            {/* Cart List */}
            <FlatList
                data={items}
                keyExtractor={(item, idx) => `${item._id || item.barcode}-${idx}`}
                renderItem={({ item, index }) => (
                    <View style={[styles.cartItem, { backgroundColor: COLORS.surface }]}>
                        <View style={[styles.cartIconBox, { backgroundColor: COLORS.primary + '20' }]}>
                            <Feather name="package" size={16} color={COLORS.primary} />
                        </View>
                        <View style={{ flex: 1, flexShrink: 1, minWidth: 0 }}>
                            <Text style={[styles.cartItemName, { color: COLORS.text }]} numberOfLines={2}>{item.name}</Text>
                            <Text style={[styles.cartItemPrice, { color: COLORS.textMuted }]}>
                                {formatCurrency(item.price, userInfo?.currency)} × {item.quantity}
                            </Text>
                        </View>
                        <View style={styles.qtyRow}>
                            <TouchableOpacity onPress={() => changeQty(index, -1)} style={[styles.qtyBtn, { backgroundColor: COLORS.border }]}>
                                <Feather name="minus" size={14} color={COLORS.text} />
                            </TouchableOpacity>
                            <Text style={[styles.qtyText, { color: COLORS.text }]}>{item.quantity}</Text>
                            <TouchableOpacity onPress={() => changeQty(index, 1)} style={[styles.qtyBtn, { backgroundColor: COLORS.primary }]}>
                                <Feather name="plus" size={14} color="#fff" />
                            </TouchableOpacity>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 8 }}>
                            <TouchableOpacity onPress={() => editItem(index)} style={{ padding: 8 }}>
                                <Feather name="edit-2" size={17} color={COLORS.textMuted} />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => removeItem(index)} style={{ padding: 8 }}>
                                <Feather name="trash-2" size={17} color="#ef4444" />
                            </TouchableOpacity>
                        </View>
                        <Text style={[styles.cartSubtotal, { color: COLORS.text }]}>
                            {formatCurrency(item.price * item.quantity, userInfo?.currency)}
                        </Text>
                    </View>
                )}
                contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 160 }}
                ListEmptyComponent={() => (
                    <View style={styles.emptyCart}>
                        <Text style={styles.emptyEmoji}>📦</Text>
                        <Text style={[styles.emptyText, { color: COLORS.textMuted }]}>Your cart is empty</Text>
                        <Text style={[styles.emptySub, { color: COLORS.textMuted }]}>Scan a barcode or add items manually</Text>
                    </View>
                )}
            />

            {/* Bottom Actions */}
            <View style={[styles.bottomBar, { backgroundColor: COLORS.surface }]}>
                <TouchableOpacity
                    style={[styles.addManualBtn, { borderColor: COLORS.primary }]}
                    onPress={() => { setEditingIndex(null); setEditingBarcode(''); setEditingName(''); setEditingPrice(''); setAddItemModal(true); }}
                >
                    <Feather name="plus" size={16} color={COLORS.primary} />
                    <Text style={[styles.addManualText, { color: COLORS.primary }]}>Add Manual</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.checkoutBtn, { backgroundColor: items.length === 0 ? COLORS.border : COLORS.primary }]}
                    disabled={items.length === 0}
                    onPress={() => navigation.navigate('ShoppingCheckout', { session, items, total, budgetNum, label })}
                    activeOpacity={0.85}
                >
                    <Feather name="check-circle" size={16} color="#fff" />
                    <Text style={styles.checkoutText}>Checkout · {formatCurrency(total, userInfo?.currency)}</Text>
                </TouchableOpacity>
            </View>

            {/* Barcode Scanner Modal */}
            <Modal visible={scannerVisible} animationType="slide" onRequestClose={() => setScannerVisible(false)}>
                <View style={{ flex: 1, backgroundColor: '#000' }}>
                    {hasPermission ? (
                        <CameraView
                            style={StyleSheet.absoluteFill}
                            facing="back"
                            onBarcodeScanned={scanning ? undefined : handleScan}
                            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr'] }}
                        />
                    ) : (
                        <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                            <Text style={{ color: '#fff', fontSize: 16 }}>Camera permission denied</Text>
                        </SafeAreaView>
                    )}

                    {/* Scanner Overlay UI */}
                    <View style={styles.scanOverlay}>
                        <SafeAreaView style={styles.topBarWrapper}>
                            <View style={styles.topBar}>
                                <TouchableOpacity onPress={() => setScannerVisible(false)} style={styles.topBtn}>
                                    <Feather name="x" size={22} color="#fff" />
                                </TouchableOpacity>
                                <Text style={styles.topTitle}>Scan Item Barcode</Text>
                                <View style={{ width: 40 }} />
                            </View>
                        </SafeAreaView>

                        <View style={styles.frameContainer}>
                            <View style={styles.frame}>
                                {/* Corners */}
                                <View style={[styles.corner, styles.topLeft]} />
                                <View style={[styles.corner, styles.topRight]} />
                                <View style={[styles.corner, styles.bottomLeft]} />
                                <View style={[styles.corner, styles.bottomRight]} />

                                {/* Animated scan line */}
                                {!scanning && !loading && (
                                    <Animated.View style={[styles.scanLine, { transform: [{ translateY: scanLineY }] }]} />
                                )}

                                {/* Loading spinner */}
                                {loading && (
                                    <View style={styles.loadingOverlay}>
                                        <ActivityIndicator size="large" color="#fff" />
                                        <Text style={styles.loadingText}>Looking up product...</Text>
                                    </View>
                                )}
                            </View>
                            <Text style={styles.scanHint}>
                                {loading ? 'Fetching product details...' : 'Point your camera at a barcode'}
                            </Text>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Manual Add Item Modal */}
            <Modal visible={addItemModal} transparent animationType="fade" onRequestClose={() => setAddItemModal(false)}>
                <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                    <View style={styles.modalOverlay}>
                        <View style={[styles.modalSheet, { backgroundColor: COLORS.surface }]}>
                            <Text style={[styles.modalTitle, { color: COLORS.text }]}>Add Item</Text>
                            {editingBarcode ? (
                                <Text style={[styles.barcodeLabel, { color: COLORS.textMuted }]}>Barcode: {editingBarcode}</Text>
                            ) : null}
                            <TextInput
                                style={[styles.modalInput, { color: COLORS.text, borderColor: COLORS.border, backgroundColor: COLORS.background }]}
                                placeholder="Item Name"
                                placeholderTextColor={COLORS.textMuted}
                                value={editingName}
                                onChangeText={setEditingName}
                            />
                            <TextInput
                                style={[styles.modalInput, { color: COLORS.text, borderColor: COLORS.border, backgroundColor: COLORS.background }]}
                                placeholder="Price (₱)"
                                placeholderTextColor={COLORS.textMuted}
                                value={editingPrice}
                                onChangeText={setEditingPrice}
                                keyboardType="decimal-pad"
                            />
                            <View style={styles.modalActions}>
                                <TouchableOpacity style={[styles.modalBtn, { backgroundColor: COLORS.border }]} onPress={() => { setAddItemModal(false); setEditingIndex(null); setTimeout(() => setScanning(false), 800); }}>
                                    <Text style={{ color: COLORS.text, fontWeight: '700' }}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.modalBtn, { backgroundColor: COLORS.primary }]} onPress={confirmAddItem}>
                                    <Text style={{ color: '#fff', fontWeight: '800' }}>{editingIndex !== null ? 'Save Changes' : 'Add to Cart'}</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </TouchableWithoutFeedback>
            </Modal>

            {/* Product Result Modal */}
            <ProductResultModal
                visible={productModal.visible}
                product={productModal.product}
                cached={productModal.cached}
                COLORS={COLORS}
                onClose={() => { setProductModal({ visible: false, product: null, cached: null }); setTimeout(() => setScanning(false), 800); }}
                onConfirm={handleConfirmProduct}
                confirmText="Add to Cart"
                confirmIcon="shopping-cart"
            />

            {/* Save Template Modal */}
            <Modal visible={saveTemplateModal} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalSheet, { backgroundColor: COLORS.surface }]}>
                        <Text style={[styles.modalTitle, { color: COLORS.text }]}>Save as Template</Text>
                        <Text style={[styles.barcodeLabel, { color: COLORS.textMuted, marginBottom: 16 }]}>
                            Give this list a name so you can reuse it later.
                        </Text>
                        <TextInput
                            style={[styles.modalInput, { color: COLORS.text, borderColor: COLORS.border, backgroundColor: COLORS.background }]}
                            placeholder="Template Name"
                            placeholderTextColor={COLORS.textMuted}
                            value={newTemplateName}
                            onChangeText={setNewTemplateName}
                            autoFocus
                        />
                        <View style={styles.modalActions}>
                            <TouchableOpacity style={[styles.modalBtn, { backgroundColor: COLORS.border }]} onPress={() => setSaveTemplateModal(false)}>
                                <Text style={{ color: COLORS.text, fontWeight: '700' }}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.modalBtn, { backgroundColor: COLORS.primary }]} onPress={confirmSaveTemplate}>
                                <Text style={{ color: '#fff', fontWeight: '800' }}>Save Template</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

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
    // Setup
    setupContainer: { flex: 1, padding: spacing.lg },
    backBtn: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: spacing.xl },
    setupHero: { alignItems: 'center', marginBottom: spacing.xl },
    setupEmoji: { fontSize: 64, marginBottom: 12 },
    setupTitle: { fontSize: 28, fontWeight: '900', marginBottom: 4 },
    setupSub: { fontSize: 14, fontWeight: '500', textAlign: 'center' },
    inputCard: { borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.xl },
    inputLabel: { fontSize: 12, fontWeight: '800', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 },
    textInput: { borderWidth: 1, borderRadius: radius.lg, padding: 14, fontSize: 16, fontWeight: '600' },
    startBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 18, borderRadius: radius.xl },
    startBtnText: { color: '#fff', fontSize: 16, fontWeight: '900' },
    // Header
    header: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, paddingBottom: 8 },
    headerTitle: { fontSize: 18, fontWeight: '900' },
    scanBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20 },
    scanBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
    saveTemplateBtn: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    // Budget bar
    budgetCard: { marginHorizontal: spacing.lg, marginBottom: spacing.md, borderRadius: radius.xl, padding: 16 },
    budgetRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    budgetLabel: { fontSize: 12, fontWeight: '700' },
    budgetPct: { fontSize: 13, fontWeight: '900' },
    barBg: { height: 10, borderRadius: 5, overflow: 'hidden', marginBottom: 8 },
    barFill: { height: '100%', borderRadius: 5 },
    budgetAmounts: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
    totalAmount: { fontSize: 20, fontWeight: '900' },
    budgetAmount: { fontSize: 13, fontWeight: '600' },
    // Cart
    cartItem: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.lg, marginBottom: 8 },
    cartIconBox: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
    cartItemName: { fontSize: 14, fontWeight: '700' },
    cartItemPrice: { fontSize: 12, fontWeight: '500', marginTop: 2 },
    qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    qtyBtn: { width: 26, height: 26, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
    qtyText: { fontSize: 14, fontWeight: '800', minWidth: 20, textAlign: 'center' },
    cartSubtotal: { fontSize: 13, fontWeight: '900', marginLeft: 4, textAlign: 'right' },
    emptyCart: { alignItems: 'center', paddingTop: 60 },
    emptyEmoji: { fontSize: 48, marginBottom: 12 },
    emptyText: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
    emptySub: { fontSize: 13, fontWeight: '500', textAlign: 'center' },
    // Bottom Bar
    bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', gap: 12, padding: spacing.lg, paddingBottom: 28, borderTopLeftRadius: 24, borderTopRightRadius: 24, elevation: 20, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 16, shadowOffset: { width: 0, height: -4 } },
    addManualBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 14, borderRadius: radius.xl, borderWidth: 2 },
    addManualText: { fontWeight: '800', fontSize: 14 },
    checkoutBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: radius.xl },
    checkoutText: { color: '#fff', fontWeight: '900', fontSize: 14 },
    // Scanner
    scanOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
    topBarWrapper: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
    topBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
    topTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
    frameContainer: { alignItems: 'center', marginTop: -80 },
    frame: { width: 240, height: 240, position: 'relative', marginBottom: spacing.lg, overflow: 'hidden' },
    corner: { position: 'absolute', width: 24, height: 24, borderColor: '#E91E8C', borderWidth: 3 },
    topLeft: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 6 },
    topRight: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 6 },
    bottomLeft: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 6 },
    bottomRight: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 6 },
    scanLine: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: '#E91E8C', opacity: 0.85, shadowColor: '#E91E8C', shadowOpacity: 0.8, shadowRadius: 6 },
    scanHint: { color: 'rgba(255,255,255,0.75)', fontSize: 14, fontWeight: '500', textAlign: 'center' },
    // Manual Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
    modalSheet: { width: '100%', borderRadius: radius.xl, padding: spacing.xl },
    modalTitle: { fontSize: 18, fontWeight: '900', marginBottom: 8 },
    barcodeLabel: { fontSize: 12, marginBottom: 12 },
    modalInput: { borderWidth: 1, borderRadius: radius.lg, padding: 14, fontSize: 15, fontWeight: '600', marginBottom: 12 },
    modalActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
    modalBtn: { flex: 1, padding: 14, borderRadius: radius.lg, alignItems: 'center' },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center', alignItems: 'center',
    },
    loadingText: { color: '#fff', marginTop: 12, fontWeight: '600' },
});
