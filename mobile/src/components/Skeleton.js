import React, { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { radius } from '../theme/colors';

const Skeleton = ({ width, height, borderRadius = radius.md, style }) => {
    const COLORS = useTheme(state => state.COLORS);
    const fadeAnim = useRef(new Animated.Value(0.3)).current;

    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
                Animated.timing(fadeAnim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
            ])
        ).start();
    }, [fadeAnim]);

    return (
        <Animated.View
            style={[
                { width, height, borderRadius, backgroundColor: COLORS.border, opacity: fadeAnim },
                style
            ]}
        />
    );
};

export default Skeleton;
