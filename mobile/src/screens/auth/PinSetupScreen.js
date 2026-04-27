import React, { useEffect, useRef, useState } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    Animated, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSecurity } from '../../context/SecurityContext';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { triggerHaptic } from '../../utils/haptics';
import { spacing, radius } from '../../theme/colors';

const PIN_LENGTH = 6;

export default function PinSetupScreen({ navigation, route }) {
    const { setupPin } = useSecurity();
    const hapticsEnabled = useAuth(state => state.hapticsEnabled);
    const COLORS = useTheme(state => state.COLORS);

    const isDarkMode = useTheme(state => state.isDarkMode);

    // 'enter' → 'confirm' → 'done'
    const [step, setStep] = useState('enter');
    const [firstPin, setFirstPin] = useState('');
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');

    const shakeAnim = useRef(new Animated.Value(0)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const dotAnims = useRef([...Array(PIN_LENGTH)].map(() => new Animated.Value(1))).current;

    useEffect(() => {
        Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }).start();
    }, []);

    const shake = () => {
        triggerHaptic(hapticsEnabled, 'notificationError');
        Animated.sequence([
            Animated.timing(shakeAnim, { toValue: 14, duration: 55, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -14, duration: 55, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 8, duration: 55, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -8, duration: 55, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 0, duration: 55, useNativeDriver: true }),
        ]).start();
    };

    const animateDot = (index) => {
        Animated.sequence([
            Animated.timing(dotAnims[index], { toValue: 1.4, duration: 70, useNativeDriver: true }),
            Animated.timing(dotAnims[index], { toValue: 1, duration: 70, useNativeDriver: true }),
        ]).start();
    };

    const handleKey = async (key) => {
        if (key === 'del') {
            setPin(p => p.slice(0, -1));
            setError('');
            return;
        }

        const newPin = pin + key;
        setPin(newPin);
        animateDot(newPin.length - 1);

        if (newPin.length === PIN_LENGTH) {
            await handleComplete(newPin);
        }
    };

    const handleComplete = async (enteredPin) => {
        if (step === 'enter') {
            // Store first entry and go to confirm step
            setFirstPin(enteredPin);
            setTimeout(() => {
                setPin('');
                setError('');
                setStep('confirm');
            }, 180);
        } else if (step === 'confirm') {
            if (enteredPin !== firstPin) {
                shake();
                setPin('');
                setError("PINs don't match. Please try again.");
            } else {
                try {
                    await setupPin(enteredPin);
                } catch (e) {
                    console.warn('[PinSetup] Error saving PIN:', e.message);
                }
                setStep('done');
            }
        }
    };

    const KEYS = [
        ['1', '2', '3'],
        ['4', '5', '6'],
        ['7', '8', '9'],
        ['', '0', 'del'],
    ];

    const renderDots = () => (
        <Animated.View style={[styles.dotsRow, { transform: [{ translateX: shakeAnim }] }]}>
            {[...Array(PIN_LENGTH)].map((_, i) => {
                const filled = i < pin.length;
                return (
                    <Animated.View
                        key={i}
                        style={[
                            styles.dot,
                            { borderColor: COLORS.border },
                            filled && { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
                            { transform: [{ scale: dotAnims[i] }] },
                        ]}
                    />
                );
            })}
        </Animated.View>
    );

    const renderKeypad = () => (
        <View style={styles.keypad}>
            {KEYS.map((row, ri) => (
                <View key={ri} style={styles.keyRow}>
                    {row.map((key, ki) => {
                        if (key === '') return <View key={ki} style={styles.keyPlaceholder} />;
                        if (key === 'del') return (
                            <TouchableOpacity key={ki} style={[styles.key, { backgroundColor: COLORS.surface }]} onPress={() => handleKey('del')} activeOpacity={0.6}>
                                <Feather name="delete" size={22} color={COLORS.text} />
                            </TouchableOpacity>
                        );
                        return (
                            <TouchableOpacity
                                key={ki}
                                style={[styles.key, { backgroundColor: COLORS.surface }]}
                                onPress={() => handleKey(key)}
                                activeOpacity={0.6}
                            >
                                <Text style={[styles.keyText, { color: COLORS.text }]}>{key}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            ))}
        </View>
    );

    if (step === 'done') {
        return (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: COLORS.background }]}>
                <SafeAreaView style={styles.safe}>
                    <Animated.View style={[styles.doneWrap, { opacity: fadeAnim }]}>
                        <View style={[styles.doneIcon, { backgroundColor: COLORS.success + '20', shadowColor: COLORS.success }]}>
                            <Feather name="check" size={48} color={COLORS.success} />
                        </View>
                        <Text style={[styles.doneTitle, { color: COLORS.text }]}>PIN Set Successfully!</Text>
                        <Text style={[styles.doneSub, { color: COLORS.textMuted }]}>Your app is now protected with a 6-digit PIN.</Text>
                        <TouchableOpacity
                            style={styles.doneBtn}
                            onPress={() => navigation.goBack()}
                            activeOpacity={0.85}
                        >
                            <LinearGradient colors={[COLORS.primary, COLORS.primary + 'CC']} style={styles.doneBtnGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                                <Text style={styles.doneBtnText}>Done</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    </Animated.View>
                </SafeAreaView>
            </View>
        );
    }

    return (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: COLORS.background }]}>
            <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} backgroundColor={COLORS.background} />

            <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
                <SafeAreaView style={styles.safe}>
                    {/* Header */}
                    <View style={styles.header}>
                        <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backBtn, { backgroundColor: COLORS.surface }]}>
                            <Feather name="arrow-left" size={22} color={COLORS.text} />
                        </TouchableOpacity>
                    </View>

                    {/* Icon */}
                    <View style={[styles.iconWrap, { backgroundColor: COLORS.primary + '20', shadowColor: COLORS.primary }]}>
                        <MaterialCommunityIcons name="lock-plus" size={40} color={COLORS.primary} />
                    </View>

                    {/* Title */}
                    <Text style={[styles.title, { color: COLORS.text }]}>
                        {step === 'enter' ? 'Set Your PIN' : 'Confirm Your PIN'}
                    </Text>
                    <Text style={[styles.sub, { color: COLORS.textMuted }]}>
                        {step === 'enter'
                            ? 'Choose a 6-digit PIN to protect your OTTER account'
                            : 'Re-enter your PIN to confirm'}
                    </Text>

                    {/* Dots */}
                    {renderDots()}

                    {/* Error */}
                    {error ? (
                        <View style={[styles.errorBox, { backgroundColor: COLORS.expense + '20', borderColor: COLORS.expense + '40' }]}>
                            <Feather name="alert-circle" size={13} color={COLORS.expense} />
                            <Text style={[styles.errorText, { color: COLORS.expense }]}>{error}</Text>
                        </View>
                    ) : <View style={{ height: 36 }} />}

                    {/* Keypad */}
                    {renderKeypad()}
                </SafeAreaView>
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    safe: { flex: 1, alignItems: 'center', paddingHorizontal: spacing.xl },
    header: { width: '100%', flexDirection: 'row', alignItems: 'center', paddingTop: spacing.md, marginBottom: 24 },
    backBtn: { padding: 10, borderRadius: 12 },
    iconWrap: {
        width: 80, height: 80, borderRadius: 40,
        justifyContent: 'center', alignItems: 'center',
        marginBottom: spacing.lg,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5, shadowRadius: 18, elevation: 8,
    },
    title: { fontSize: 24, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
    sub: { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 16 },
    dotsRow: { flexDirection: 'row', gap: 16, marginVertical: 16 },
    dot: {
        width: 14, height: 14, borderRadius: 7,
        borderWidth: 2,
        backgroundColor: 'transparent',
    },
    errorBox: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        borderRadius: radius.md,
        paddingHorizontal: spacing.md, paddingVertical: 8,
        borderWidth: 1,
    },
    errorText: { fontSize: 12, fontWeight: '500', flexShrink: 1 },
    keypad: { marginTop: 12, width: '100%', maxWidth: 300 },
    keyRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
    key: {
        width: 80, height: 80, borderRadius: 40,
        justifyContent: 'center', alignItems: 'center',
    },
    keyPlaceholder: { width: 80, height: 80 },
    keyText: { fontSize: 26, fontWeight: '700' },
    // Done screen
    doneWrap: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        alignSelf: 'stretch',
        paddingBottom: 40
    },
    doneIcon: {
        width: 100, height: 100, borderRadius: 50,
        justifyContent: 'center', alignItems: 'center', marginBottom: 28,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5, shadowRadius: 20, elevation: 8,
    },
    doneTitle: { fontSize: 26, fontWeight: '800', marginBottom: 10, textAlign: 'center' },
    doneSub: { fontSize: 14, textAlign: 'center', marginBottom: 48, lineHeight: 22, paddingHorizontal: 20 },
    doneBtn: {
        width: '100%',
        alignSelf: 'stretch',
        borderRadius: radius.xl,
        overflow: 'hidden',
        marginTop: 20,
    },
    doneBtnGrad: {
        paddingVertical: 16,
        borderRadius: radius.xl,
        alignItems: 'center',
        justifyContent: 'center',
    },
    doneBtnText: { color: '#fff', fontSize: 17, fontWeight: '800', letterSpacing: 0.5 },
});
