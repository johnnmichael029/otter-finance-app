import React, { useState, useRef, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Animated,
    PanResponder,
    TouchableOpacity,
    TouchableWithoutFeedback,
    Dimensions,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { triggerHaptic } from '../utils/haptics';
import SavingsQuickAddSheet from './SavingsQuickAddSheet';
import QuickAddSheet from './QuickAddSheet';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const AnimatedFAB = ({ navigation, isSavingsMode }) => {
    const [open, setOpen] = useState(false);
    const [activeTab, setActiveTab] = useState(null);
    const [sticky, setSticky] = useState(false); // If true, menu stays open after tap
    const [savingsSheetVisible, setSavingsSheetVisible] = useState(false);
    const [mainSheetVisible, setMainSheetVisible] = useState(false);

    const animation = useRef(new Animated.Value(0)).current;
    const hoverIncome = useRef(new Animated.Value(1)).current;
    const hoverExpense = useRef(new Animated.Value(1)).current;
    const hoverGoal = useRef(new Animated.Value(1)).current;

    const COLORS = useTheme(state => state.COLORS);
    const { hapticsEnabled, savingsFabStyle } = useAuth();
    
    // Apply modal preference universally across all tabs
    const isModalMode = savingsFabStyle === 'modal';

    const isMoving = useRef(false);
    const menuOpen = useRef(false);

    const toggleMenu = (shouldOpen) => {
        menuOpen.current = shouldOpen;
        setOpen(shouldOpen);
        if (!shouldOpen) setSticky(false);

        Animated.spring(animation, {
            toValue: shouldOpen ? 1 : 0,
            stiffness: 500,
            damping: 30,
            useNativeDriver: true,
        }).start();

        if (shouldOpen) {
            triggerHaptic(hapticsEnabled, 'impactMedium');
        }
    };

    const runHoverAnimation = (target, val) => {
        Animated.spring(target, {
            toValue: val,
            stiffness: 400,
            damping: 20,
            useNativeDriver: true,
        }).start();
    };

    const handleAction = (type) => {
        triggerHaptic(hapticsEnabled, 'notificationSuccess');
        if (!isSavingsMode) {
            if (type === 'income') navigation.navigate('AddTransaction', { type: 'income' });
            if (type === 'expense') navigation.navigate('AddTransaction', { type: 'expense' });
            if (type === 'goal') navigation.navigate('SavingsTransfer', { direction: 'to_savings', isDirect: true });
        } else {
            // isSavingsMode acts as the savings FAB actions
            if (type === 'income') navigation.navigate('SavingsGoalSelector', { action: 'deposit' }); // Add Money to Goal
            if (type === 'expense') navigation.navigate('AddSavingsGoal'); // Add New Goal
            if (type === 'goal') navigation.navigate('SavingsGoalSelector', { action: 'move_from' }); // Move Money
        }

        setActiveTab(null);
        toggleMenu(false);
    };

    const panResponder = useMemo(() => PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: (evt, g) => Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2,
        onMoveShouldSetPanResponderCapture: (evt, g) => Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2,

        onPanResponderTerminationRequest: () => false,

        onPanResponderGrant: () => {
            isMoving.current = false;
            
            if (isModalMode) return; // Handle entirely via click in release

            // If already sticky and menu is open, this might be a second tap to close
            if (sticky) {
                // We'll handle the toggle in release if it wasn't a drag
                return;
            }
            toggleMenu(true);
        },

        onPanResponderMove: (evt, gestureState) => {
            const { dx, dy } = gestureState;
            if (Math.abs(dx) > 10 || Math.abs(dy) > 10) isMoving.current = true;
            if (isModalMode) return;

            let current = null;
            const threshold = 40;
            const distIncome = Math.sqrt(Math.pow(dx - (-50), 2) + Math.pow(dy - (-60), 2));
            const distExpense = Math.sqrt(Math.pow(dx - (0), 2) + Math.pow(dy - (-85), 2));
            const distGoal = Math.sqrt(Math.pow(dx - (50), 2) + Math.pow(dy - (-60), 2));

            if (distIncome < threshold) current = 'income';
            else if (distExpense < threshold) current = 'expense';
            else if (distGoal < threshold) current = 'goal';

            if (current !== activeTab) {
                if (current) triggerHaptic(hapticsEnabled, 'selection');
                setActiveTab(current);
                runHoverAnimation(hoverIncome, current === 'income' ? 1.3 : (current ? 0.7 : 1));
                runHoverAnimation(hoverExpense, current === 'expense' ? 1.3 : (current ? 0.7 : 1));
                runHoverAnimation(hoverGoal, current === 'goal' ? 1.3 : (current ? 0.7 : 1));
            }
        },

        onPanResponderRelease: (evt, gestureState) => {
            if (activeTab) {
                handleAction(activeTab);
            } else if (!isMoving.current) {
                // It was a simple TAP
                if (isModalMode) {
                    triggerHaptic(hapticsEnabled, 'impactMedium');
                    if (isSavingsMode) {
                        setSavingsSheetVisible(true);
                    } else {
                        setMainSheetVisible(true);
                    }
                    return;
                }

                if (sticky) {
                    toggleMenu(false);
                } else {
                    setSticky(true);
                    toggleMenu(true);
                }
            } else {
                // It was a DRAG but released in no-man's land
                if (!isModalMode) {
                    toggleMenu(false);
                    setActiveTab(null);
                    runHoverAnimation(hoverIncome, 1);
                    runHoverAnimation(hoverExpense, 1);
                    runHoverAnimation(hoverGoal, 1);
                }
            }
        },
        onPanResponderTerminate: () => {
            if (!isModalMode) {
                setActiveTab(null);
                toggleMenu(false);
            }
        }
    }), [activeTab, isSavingsMode, isModalMode, hapticsEnabled, sticky]);

    const incomeStyle = {
        transform: [
            { scale: Animated.multiply(animation, hoverIncome) },
            { translateY: animation.interpolate({ inputRange: [0, 1], outputRange: [0, -60] }) },
            { translateX: animation.interpolate({ inputRange: [0, 1], outputRange: [0, -50] }) },
        ],
    };

    const expenseStyle = {
        transform: [
            { scale: Animated.multiply(animation, hoverExpense) },
            { translateY: animation.interpolate({ inputRange: [0, 1], outputRange: [0, -85] }) },
        ],
    };

    const goalStyle = {
        transform: [
            { scale: Animated.multiply(animation, hoverGoal) },
            { translateY: animation.interpolate({ inputRange: [0, 1], outputRange: [0, -60] }) },
            { translateX: animation.interpolate({ inputRange: [0, 1], outputRange: [0, 50] }) },
        ],
    };

    const opacity = animation.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [0, 0, 1],
    });

    return (
        <View style={styles.container}>
            {/* Overlay to close menu when tapping outside (Sticky mode) */}
            {open && (
                <View style={styles.overlayContainer}>
                    <TouchableWithoutFeedback onPress={() => toggleMenu(false)}>
                        <View style={styles.fullScreenOverlay} />
                    </TouchableWithoutFeedback>
                </View>
            )}

            {/* Sub-menu buttons (Transparent TouchableOpacity for sticky mode clicks) */}
            {!isModalMode && (
                <>
                    <Animated.View style={[styles.subButton, incomeStyle, { opacity, backgroundColor: '#22c55e', zIndex: activeTab === 'income' ? 10 : 1 }]}>
                        <TouchableOpacity onPress={() => handleAction('income')} activeOpacity={0.8} style={styles.subContent} disabled={!sticky}>
                            {isSavingsMode ? <Feather name="plus-circle" size={18} color="#fff" /> : <Feather name="arrow-up" size={18} color="#fff" />}
                        </TouchableOpacity>
                    </Animated.View>

                    <Animated.View style={[styles.subButton, expenseStyle, { opacity, backgroundColor: isSavingsMode ? '#E91E8C' : COLORS.primary, zIndex: activeTab === 'expense' ? 10 : 1 }]}>
                        <TouchableOpacity onPress={() => handleAction('expense')} activeOpacity={0.8} style={styles.subContent} disabled={!sticky}>
                            {isSavingsMode ? <Feather name="target" size={18} color="#fff" /> : <Feather name="arrow-down" size={18} color="#fff" />}
                        </TouchableOpacity>
                    </Animated.View>

                    <Animated.View style={[styles.subButton, goalStyle, { opacity, backgroundColor: isSavingsMode ? '#3b82f6' : '#f59e0b', zIndex: activeTab === 'goal' ? 10 : 1 }]}>
                        <TouchableOpacity onPress={() => handleAction('goal')} activeOpacity={0.8} style={styles.subContent} disabled={!sticky}>
                            <MaterialCommunityIcons name="piggy-bank-outline" size={20} color="#fff" />
                        </TouchableOpacity>
                    </Animated.View>
                </>
            )}

            {/* Main FAB with PanResponder */}
            <View {...panResponder.panHandlers}>
                <View
                    style={[
                        styles.mainButton,
                        {
                            backgroundColor: activeTab || sticky ? COLORS.primary + '80' : COLORS.primary,
                            shadowColor: COLORS.primary,
                        }
                    ]}
                >
                    {isModalMode ? (
                        <View>
                            <Feather name="plus" size={28} color="#fff" />
                        </View>
                    ) : (
                        <Animated.View style={{ transform: [{ rotate: animation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] }) }] }}>
                            <Feather name="plus" size={28} color="#fff" />
                        </Animated.View>
                    )}
                </View>
            </View>

            <SavingsQuickAddSheet 
                visible={savingsSheetVisible}
                onClose={() => setSavingsSheetVisible(false)}
                navigation={navigation}
            />

            <QuickAddSheet 
                visible={mainSheetVisible}
                onClose={() => setMainSheetVisible(false)}
                navigation={navigation}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: { alignItems: 'center', justifyContent: 'center' },
    mainButton: {
        width: 58, height: 58, borderRadius: 29, justifyContent: 'center', alignItems: 'center',
        elevation: 12, shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
    },
    subButton: {
        position: 'absolute', width: 44, height: 44, borderRadius: 22,
        elevation: 10, shadowOpacity: 0.3, shadowRadius: 5, shadowOffset: { width: 0, height: 4 },
    },
    subContent: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
    activeLabel: {
        position: 'absolute', bottom: -25, width: 80, textAlign: 'center',
        fontSize: 10, fontWeight: '900', textTransform: 'uppercase',
        letterSpacing: 0.5, backgroundColor: 'rgba(255,255,255,0.9)',
        paddingVertical: 2, borderRadius: 8,
    },
    overlayContainer: {
        position: 'absolute',
        bottom: -SCREEN_HEIGHT,
        left: -SCREEN_WIDTH,
        width: SCREEN_WIDTH * 2,
        height: SCREEN_HEIGHT * 2,
        zIndex: -1,
    },
    fullScreenOverlay: {
        flex: 1,
        backgroundColor: 'transparent',
    },
});

export default AnimatedFAB;
