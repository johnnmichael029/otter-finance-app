/**
 * OTTER — SwipeableRow
 * 
 * A reusable swipeable row component that bundles:
 * - react-native-reanimated ZoomIn/ZoomOut/LinearTransition animations
 * - react-native-gesture-handler Swipeable with consistent config
 * - Left and Right action buttons auto-built from a config object
 * 
 * Usage:
 * 
 * <SwipeableRow
 *     rightAction={{ color: '#E91E8C', icon: 'archive', label: 'Archive', onPress: () => handleArchive(id) }}
 *     leftAction={{ color: '#ef4444', icon: 'trash-2', label: 'Delete', onPress: () => handleDelete(id) }}
 *     containerStyle={{ marginBottom: 12 }}      // optional outer spacing
 * >
 *     {yourCardContent}
 * </SwipeableRow>
 * 
 * Action config shape:
 * {
 *     color: string,          // Background color of the button
 *     icon: string,           // Icon name
 *     iconFamily: string,     // 'Feather' (default) | 'MaterialCommunityIcons' | 'Ionicons'
 *     label: string,          // Text below the icon
 *     onPress: () => void,    // Tap handler (optional, overrides auto-swipe)
 * }
 */

import React from 'react';
import { View, Text, TouchableOpacity, Animated as RNAnimated, StyleSheet } from 'react-native';
import Reanimated, { ZoomIn, ZoomOut, LinearTransition } from 'react-native-reanimated';
import { Swipeable } from 'react-native-gesture-handler';
import { Feather, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';

// ─── Icon Picker ──────────────────────────────────────────────────────────────
const MCI_ICONS = [
    'archive', 'archive-arrow-up-outline', 'archive-arrow-down-outline',
    'dots-horizontal', 'check-circle', 'close-circle',
];
const ION_ICONS = ['checkmark-circle', 'close-circle', 'archive-outline'];

const ActionIcon = ({ name, family, size = 22, color }) => {
    const fam = family?.toLowerCase();
    if (fam === 'materialcommunityicons' || MCI_ICONS.includes(name)) {
        return <MaterialCommunityIcons name={name} size={size} color={color} />;
    }
    if (fam === 'ionicons' || ION_ICONS.includes(name)) {
        return <Ionicons name={name} size={size} color={color} />;
    }
    // Default: Feather
    return <Feather name={name} size={size} color={color} />;
};

// ─── Action Button ────────────────────────────────────────────────────────────
const SwipeActionButton = ({ dragX, action, side }) => {
    const inputRange = side === 'right'
        ? [-80, 0]   // right action appears on swipe-left (negative dragX)
        : [0, 80];   // left action appears on swipe-right (positive dragX)

    const outputRange = side === 'right'
        ? [1, 0]
        : [1, 0];

    const scale = dragX.interpolate({ inputRange, outputRange, extrapolate: 'clamp' });

    return (
        <TouchableOpacity
            onPress={action.onPress}
            activeOpacity={0.8}
            style={[
                styles.actionBtn,
                {
                    backgroundColor: action.color,
                    marginLeft: side === 'right' ? 8 : 0,
                    marginRight: side === 'left' ? 8 : 0,
                }
            ]}
        >
            <RNAnimated.View style={[styles.actionInner, { transform: [{ scale }] }]}>
                <ActionIcon
                    name={action.icon || 'circle'}
                    family={action.iconFamily}
                    size={22}
                    color="#fff"
                />
                {action.label ? (
                    <Text style={styles.actionLabel}>{action.label}</Text>
                ) : null}
            </RNAnimated.View>
        </TouchableOpacity>
    );
};

// ─── SwipeableRow ─────────────────────────────────────────────────────────────
export default function SwipeableRow({
    children,
    rightAction,    // Action config shown on swipe-LEFT (appears on right side)
    leftAction,     // Action config shown on swipe-RIGHT (appears on left side)
    containerStyle,
    disabled = false,
    entering = ZoomIn.springify().damping(50).mass(0.9),
    exiting = ZoomOut.duration(100),
    layout = LinearTransition,
}) {
    const renderRight = (_, dragX) => {
        if (!rightAction) return null;
        return <SwipeActionButton dragX={dragX} action={rightAction} side="right" />;
    };

    const renderLeft = (_, dragX) => {
        if (!leftAction) return null;
        return <SwipeActionButton dragX={dragX} action={leftAction} side="left" />;
    };

    const handleSwipeOpen = (direction) => {
        // 'right' means the right drawer opened (user swiped left)
        if (direction === 'right' && rightAction?.onPress) {
            rightAction.onPress();
        }
        // 'left' means the left drawer opened (user swiped right)
        if (direction === 'left' && leftAction?.onPress) {
            leftAction.onPress();
        }
    };

    if (disabled || (!rightAction && !leftAction)) {
        return (
            <Reanimated.View
                entering={entering}
                exiting={exiting}
                layout={layout}
                style={containerStyle}
            >
                {children}
            </Reanimated.View>
        );
    }

    return (
        <Reanimated.View
            entering={entering}
            exiting={exiting}
            layout={layout}
        >
            <Swipeable
                renderRightActions={rightAction ? renderRight : null}
                renderLeftActions={leftAction ? renderLeft : null}
                onSwipeableOpen={handleSwipeOpen}
                friction={2}
                overshootRight={false}
                overshootLeft={false}
                rightThreshold={40}
                leftThreshold={40}
                containerStyle={[{ marginBottom: 12 }, containerStyle]}
            >
                {children}
            </Swipeable>
        </Reanimated.View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    actionBtn: {
        width: 80,
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 20,
    },
    actionInner: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    actionLabel: {
        color: '#fff',
        fontSize: 10,
        fontWeight: '800',
        marginTop: 4,
    },
});
