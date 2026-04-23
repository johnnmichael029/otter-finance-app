import React, { useEffect, useRef, useState } from 'react';
import {
    View, StyleSheet, Modal, Animated, Dimensions, TouchableWithoutFeedback, PanResponder, TouchableOpacity
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { spacing, radius } from '../theme/colors';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const BottomSheetModal = ({ visible, onClose, children }) => {
    const { COLORS } = useTheme();
    const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const [renderModal, setRenderModal] = useState(false);

    useEffect(() => {
        if (visible) {
            setRenderModal(true);
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
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 0, duration: 220, useNativeDriver: true,
                }),
                Animated.timing(slideAnim, {
                    toValue: SCREEN_HEIGHT, duration: 260, useNativeDriver: true,
                }),
            ]).start(() => setRenderModal(false));
        }
    }, [visible, fadeAnim, slideAnim]);

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => false,
            onMoveShouldSetPanResponder: (_, gestureState) => {
                // Intercept only vertical swipe-down motions
                return gestureState.dy > 10 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx) * 2;
            },
            onPanResponderMove: (_, gestureState) => {
                if (gestureState.dy > 0) {
                    slideAnim.setValue(gestureState.dy);
                }
            },
            onPanResponderRelease: (_, gestureState) => {
                if (gestureState.dy > 120 || gestureState.vy > 1.2) {
                    onClose();
                } else {
                    // Snap back
                    Animated.spring(slideAnim, {
                        toValue: 0, tension: 65, friction: 11, useNativeDriver: true
                    }).start();
                }
            }
        })
    ).current;

    return (
        <Modal
            transparent
            visible={renderModal}
            animationType="none"
            onRequestClose={onClose}
            statusBarTranslucent
        >
            <TouchableWithoutFeedback onPress={onClose}>
                <Animated.View style={[styles.overlay, { opacity: fadeAnim }]} />
            </TouchableWithoutFeedback>

            <Animated.View 
                {...panResponder.panHandlers}
                style={[styles.sheet, { backgroundColor: COLORS.surface, transform: [{ translateY: slideAnim }] }]}
            >
                <View style={styles.handleRow}>
                    <View style={styles.spacer} />
                    <View style={styles.sheetHandle} />
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                        <Feather name="x" size={24} color={COLORS.textMuted} />
                    </TouchableOpacity>
                </View>
                {children}
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
        padding: spacing.lg, paddingBottom: 48,
        maxHeight: '85%',
    },
    handleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: spacing.md,
    },
    sheetHandle: {
        width: 40, height: 4, borderRadius: 2, backgroundColor: '#ccc', alignSelf: 'center',
    },
    spacer: { width: 40, height: 40 },
    closeBtn: {
        width: 40, height: 40, borderRadius: 20,
        justifyContent: 'center', alignItems: 'center',
        backgroundColor: 'transparent'
    }
});

export default BottomSheetModal;
