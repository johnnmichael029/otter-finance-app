import React, { useEffect, useRef, useState } from 'react';
import {
    View, Text, StyleSheet, Modal, TouchableOpacity,
    Animated, Dimensions, TouchableWithoutFeedback,
} from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { radius, spacing } from '../theme/colors';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const QuickAddSheet = ({ visible, onClose, navigation }) => {
    const { COLORS } = useTheme();
    const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;
    // Keep modal mounted during close animation
    const [modalVisible, setModalVisible] = useState(false);

    useEffect(() => {
        if (visible) {
            // Mount modal first, then animate in
            setModalVisible(true);
            slideAnim.setValue(SCREEN_HEIGHT);
            fadeAnim.setValue(0);
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 1, duration: 280, useNativeDriver: true,
                }),
                Animated.spring(slideAnim, {
                    toValue: 0, tension: 65, friction: 11, useNativeDriver: true,
                }),
            ]).start();
        } else {
            // Animate out first, then unmount modal
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 0, duration: 220, useNativeDriver: true,
                }),
                Animated.timing(slideAnim, {
                    toValue: SCREEN_HEIGHT, duration: 260, useNativeDriver: true,
                }),
            ]).start(() => {
                setModalVisible(false);
            });
        }
    }, [visible]);

    const handleAction = (screen, type) => {
        onClose();
        setTimeout(() => navigation.navigate(screen, { type }), 300);
    };

    const actions = [
        {
            icon: 'trending-up',
            iconLib: Feather,
            label: 'Add Income',
            sub: 'Record a salary, freelance, or any earning',
            color: '#22c55e',
            bg: '#22c55e15',
            onPress: () => handleAction('AddTransaction', 'income'),
        },
        {
            icon: 'trending-down',
            iconLib: Feather,
            label: 'Add Expense',
            sub: 'Log food, bills, shopping & more',
            color: '#ef4444',
            bg: '#ef444415',
            onPress: () => handleAction('AddTransaction', 'expense'),
        },
        {
            icon: 'barcode',
            iconLib: Ionicons,
            label: 'Scan Item',
            sub: 'Scan barcode to auto-fill expense details',
            color: COLORS.primary,
            bg: COLORS.primary + '18',
            onPress: () => { onClose(); setTimeout(() => navigation.navigate('BarcodeScanner'), 300); },
        },
        {
            icon: 'archive',
            iconLib: Feather,
            label: 'Save Money',
            sub: 'Move money directly to your Savings Balance',
            color: '#E91E8C',
            bg: '#E91E8C15',
            onPress: () => { onClose(); setTimeout(() => navigation.navigate('SavingsTransfer', { direction: 'to_savings', isDirect: true }), 300); },
        },
    ];

    return (
        <Modal
            transparent
            visible={modalVisible}
            animationType="none"
            onRequestClose={onClose}
            statusBarTranslucent
        >
            {/* Dimmed backdrop */}
            <TouchableWithoutFeedback onPress={onClose}>
                <Animated.View style={[styles.overlay, { opacity: fadeAnim }]} />
            </TouchableWithoutFeedback>

            {/* Sliding sheet */}
            <Animated.View
                style={[
                    styles.sheet,
                    { backgroundColor: COLORS.surface, transform: [{ translateY: slideAnim }] }
                ]}
            >
                {/* Pull handle */}
                <View style={[styles.handle, { backgroundColor: COLORS.border }]} />

                <Text style={[styles.sheetTitle, { color: COLORS.text }]}>Quick Add</Text>
                <Text style={[styles.sheetSub, { color: COLORS.textMuted }]}>What would you like to record?</Text>

                <View style={styles.actions}>
                    {actions.map((action) => {
                        const IconComponent = action.iconLib;
                        return (
                            <TouchableOpacity
                                key={action.label}
                                style={[styles.actionRow, { backgroundColor: action.bg, borderColor: action.color + '30' }]}
                                onPress={action.onPress}
                                activeOpacity={0.75}
                            >
                                <View style={[styles.iconBox, { backgroundColor: action.color + '20' }]}>
                                    <IconComponent name={action.icon} size={24} color={action.color} />
                                </View>
                                <View style={styles.actionText}>
                                    <Text style={[styles.actionLabel, { color: COLORS.text }]}>{action.label}</Text>
                                    <Text style={[styles.actionSub, { color: COLORS.textMuted }]}>{action.sub}</Text>
                                </View>
                                <Feather name="chevron-right" size={18} color={COLORS.textMuted} />
                            </TouchableOpacity>
                        );
                    })}
                </View>

                <TouchableOpacity onPress={onClose} style={[styles.cancelBtn, { borderColor: COLORS.border }]}>
                    <Text style={[styles.cancelText, { color: COLORS.textMuted }]}>Cancel</Text>
                </TouchableOpacity>
            </Animated.View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.55)',
    },
    sheet: {
        position: 'absolute', bottom: 0, left: 0, right: 0,
        borderTopLeftRadius: 28, borderTopRightRadius: 28,
        padding: spacing.lg, paddingBottom: 44,
    },
    handle: {
        width: 40, height: 4, borderRadius: 2,
        alignSelf: 'center', marginBottom: spacing.lg,
    },
    sheetTitle: { fontSize: 22, fontWeight: '800', marginBottom: 4 },
    sheetSub: { fontSize: 13, marginBottom: spacing.lg },
    actions: { gap: 12, marginBottom: spacing.lg },
    actionRow: {
        flexDirection: 'row', alignItems: 'center',
        borderRadius: radius.xl, padding: spacing.md,
        borderWidth: 1,
    },
    iconBox: {
        width: 48, height: 48, borderRadius: 14,
        justifyContent: 'center', alignItems: 'center', marginRight: spacing.md,
    },
    actionText: { flex: 1 },
    actionLabel: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
    actionSub: { fontSize: 12 },
    cancelBtn: {
        borderWidth: 1.5, borderRadius: radius.xl,
        paddingVertical: 14, alignItems: 'center',
    },
    cancelText: { fontSize: 15, fontWeight: '700' },
});

export default QuickAddSheet;
