import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    ActivityIndicator, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { spacing, radius } from '../../theme/colors';
import CustomAlertModal from '../../components/CustomAlertModal';
import ProductResultModal from '../../components/ProductResultModal';
import { getCachedBarcode, saveBarcodePriceCache, formatRelativeTime } from '../../utils/barcodePriceCache';

const OPEN_FOOD_API = 'https://world.openfoodfacts.org/api/v0/product/';
const UPC_API = 'https://api.upcitemdb.com/prod/trial/lookup?upc=';

export default function BarcodeScannerScreen({ navigation }) {
    const { COLORS } = useTheme();
    const [permission, requestPermission] = useCameraPermissions();
    const [scanned, setScanned] = useState(false);
    const [loading, setLoading] = useState(false);
    const [productModal, setProductModal] = useState({ visible: false, product: null, cached: null });
    const [errorModal, setErrorModal] = useState({ visible: false, message: '' });
    const scanLineAnim = useRef(new Animated.Value(0)).current;

    // Animated scan line
    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(scanLineAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
                Animated.timing(scanLineAnim, { toValue: 0, duration: 2000, useNativeDriver: true }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, []);

    const scanLineY = scanLineAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 220],
    });

    const handleBarcodeScanned = async ({ type, data }) => {
        if (scanned || loading) return;
        setScanned(true);
        setLoading(true);

        try {
            // Check local cache first
            const cached = await getCachedBarcode(data);

            // Try Open Food Facts
            let product = null;
            const offRes = await fetch(`${OPEN_FOOD_API}${data}.json`);
            const offData = await offRes.json();

            if (offData.status === 1 && offData.product) {
                const p = offData.product;
                product = {
                    barcode: data,
                    name: p.product_name || p.abbreviated_product_name || 'Unknown Product',
                    brand: p.brands || 'Unknown Brand',
                    category: p.categories_tags?.[0]?.replace('en:', '') || 'Other',
                    image: p.image_front_url || null,
                    price: cached?.price ?? null, // prefer our cached price over API USD price
                };
            }

            // Fallback: UPC Item DB
            if (!product) {
                const upcRes = await fetch(`${UPC_API}${data}`);
                const upcData = await upcRes.json();
                if (upcData.code === 'OK' && upcData.items?.length > 0) {
                    const item = upcData.items[0];
                    product = {
                        barcode: data,
                        name: item.title || 'Unknown Product',
                        brand: item.brand || 'Unknown Brand',
                        category: item.category || 'Other',
                        image: item.images?.[0] || null,
                        price: cached?.price ?? item.lowest_recorded_price ?? null,
                    };
                }
            }

            // Last resort: use cached data if no API result
            if (!product && cached) {
                product = {
                    barcode: data,
                    name: cached.name,
                    brand: cached.brand,
                    price: cached.price,
                };
            }

            if (product) {
                setProductModal({ visible: true, product, cached });
            } else {
                setErrorModal({ visible: true, message: `No product found for barcode: ${data}\n\nYou can still manually enter the details.` });
            }
        } catch (err) {
            setErrorModal({ visible: true, message: 'Network error while looking up product. Please check your connection and try again.' });
        } finally {
            setLoading(false);
        }
    };

    const handleConfirm = async (product, price) => {
        // Save to local price cache before navigating
        await saveBarcodePriceCache(product.barcode, {
            name: product.name,
            brand: product.brand,
            price: parseFloat(price) || 0,
        });
        setProductModal({ visible: false, product: null, cached: null });
        navigation.navigate('AddTransaction', {
            type: 'expense',
            prefillData: { name: product.name, price: parseFloat(price) || null },
        });
    };

    if (!permission) return <View style={{ flex: 1, backgroundColor: '#000' }} />;

    if (!permission.granted) {
        return (
            <SafeAreaView style={[styles.permissionView, { backgroundColor: COLORS.background }]}>
                <Ionicons name="camera-off-outline" size={64} color={COLORS.textMuted} style={{ marginBottom: spacing.lg }} />
                <Text style={[styles.permTitle, { color: COLORS.text }]}>Camera Access Needed</Text>
                <Text style={[styles.permSub, { color: COLORS.textMuted }]}>
                    OTTER needs camera access to scan product barcodes for quick expense logging.
                </Text>
                <TouchableOpacity style={[styles.permBtn, { backgroundColor: COLORS.primary }]} onPress={requestPermission}>
                    <Text style={styles.permBtnText}>Allow Camera</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: spacing.md }}>
                    <Text style={[styles.cancelText, { color: COLORS.textMuted }]}>Go Back</Text>
                </TouchableOpacity>
            </SafeAreaView>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: '#000' }}>
            <CameraView
                style={StyleSheet.absoluteFill}
                barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'qr'] }}
                onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
            />

            {/* Overlay */}
            <View style={styles.overlay}>
                {/* Top bar — absolute so it never displaces the scan frame */}
                <SafeAreaView style={styles.topBarWrapper}>
                    <View style={styles.topBar}>
                        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.topBtn}>
                            <Feather name="x" size={22} color="#fff" />
                        </TouchableOpacity>
                        <Text style={styles.topTitle}>Scan Item Barcode</Text>
                        <View style={{ width: 40 }} />
                    </View>
                </SafeAreaView>

                {/* Scan frame */}
                <View style={styles.frameContainer}>
                    <View style={styles.frame}>
                        {/* Corners */}
                        <View style={[styles.corner, styles.topLeft]} />
                        <View style={[styles.corner, styles.topRight]} />
                        <View style={[styles.corner, styles.bottomLeft]} />
                        <View style={[styles.corner, styles.bottomRight]} />

                        {/* Animated scan line */}
                        {!scanned && (
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

                    <Text style={styles.hint}>
                        {loading ? 'Fetching product details...' : 'Point your camera at a barcode'}
                    </Text>
                </View>

                {/* Bottom */}
                {scanned && !loading && (
                    <View style={styles.bottomBar}>
                        <TouchableOpacity
                            style={styles.scanAgainBtn}
                            onPress={() => setScanned(false)}
                        >
                            <Feather name="refresh-cw" size={18} color="#fff" style={{ marginRight: 8 }} />
                            <Text style={styles.scanAgainText}>Scan Again</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>

            {/* Product Found Modal */}
            <ProductResultModal
                visible={productModal.visible}
                product={productModal.product}
                cached={productModal.cached}
                COLORS={COLORS}
                onClose={() => { setProductModal({ visible: false, product: null, cached: null }); setScanned(false); }}
                onConfirm={(price) => handleConfirm(productModal.product, price)}
            />

            <CustomAlertModal
                visible={errorModal.visible}
                onClose={() => { setErrorModal({ visible: false, message: '' }); setScanned(false); }}
                onConfirm={() => navigation.navigate('AddTransaction', { type: 'expense' })}
                title="Product Not Found"
                message={errorModal.message}
                type="warning"
                confirmText="Enter Manually"
            />
        </View>
    );
}



const FRAME_SIZE = 240;
const CORNER_SIZE = 24;
const BORDER_WIDTH = 3;

const styles = StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    topBarWrapper: {
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    },
    topBar: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    },
    topBtn: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center',
    },
    topTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
    frameContainer: { alignItems: 'center', marginTop: -80 },
    frame: {
        width: FRAME_SIZE, height: FRAME_SIZE,
        position: 'relative', marginBottom: spacing.lg,
        overflow: 'hidden',
    },
    corner: {
        position: 'absolute', width: CORNER_SIZE, height: CORNER_SIZE,
        borderColor: '#E91E8C', borderWidth: BORDER_WIDTH,
    },
    topLeft: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 6 },
    topRight: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 6 },
    bottomLeft: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 6 },
    bottomRight: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 6 },
    scanLine: {
        position: 'absolute', left: 0, right: 0, height: 2,
        backgroundColor: '#E91E8C', opacity: 0.85,
        shadowColor: '#E91E8C', shadowOpacity: 0.8, shadowRadius: 6,
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center', alignItems: 'center',
    },
    loadingText: { color: '#fff', marginTop: 12, fontWeight: '600' },
    hint: { color: 'rgba(255,255,255,0.75)', fontSize: 14, fontWeight: '500', textAlign: 'center' },
    bottomBar: { alignItems: 'center', paddingBottom: 50 },
    scanAgainBtn: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: '#E91E8C',
        paddingHorizontal: 24, paddingVertical: 14, borderRadius: 30,
    },
    scanAgainText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    permissionView: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
    permTitle: { fontSize: 22, fontWeight: '800', marginBottom: 12, textAlign: 'center' },
    permSub: { textAlign: 'center', lineHeight: 22, marginBottom: 28 },
    permBtn: { paddingHorizontal: 32, paddingVertical: 14, borderRadius: 30 },
    permBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    cancelText: { fontWeight: '600' },
});
