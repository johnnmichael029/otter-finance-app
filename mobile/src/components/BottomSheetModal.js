import React, { useEffect, useRef, useState } from 'react';
import {
    View, StyleSheet, Modal, Animated, Dimensions, TouchableWithoutFeedback
} from 'react-native';
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

            <Animated.View style={[styles.sheet, { backgroundColor: COLORS.surface, transform: [{ translateY: slideAnim }] }]}>
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
    },
});

export default BottomSheetModal;
