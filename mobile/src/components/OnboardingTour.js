import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, Modal, TouchableOpacity,
    Animated, Dimensions, Platform, Image
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');
const otterIcon = require('../../assets/icon/welcomeOtter.png');

const TOUR_STEPS = [
    {
        id: 'welcome',
        title: 'Welcome to Otter!',
        text: "I'm your financial companion. I'll help you keep your eyes wide open on your wealth.",
        spotlight: { x: 20, y: 70, w: 0, h: 0, r: 0 }, // Header Area
    },
    {
        id: 'balance',
        title: 'Total Net Worth',
        text: "Here is your total wealth. It combines all your cash, banks, and savings in one view.",
        spotlight: { x: 20, y: 110, w: width - 40, h: 270, r: 24 }, // Expanded to cover full pink card
    },
    {
        id: 'fab',
        title: 'Track Everything',
        text: "This is your main tool! Tap here to add an expense, log income, or add savings",
        spotlight: { x: (width / 2) - 35, y: height - 100, w: 70, h: 70, r: 35 }, // Center FAB
    },
    {
        id: 'analytics',
        title: 'Smart Insights',
        text: "Switch views here to see your spending patterns for the week or month.",
        spotlight: { x: 20, y: 400, w: width - 40, h: 180, r: 20 }, // Shifted down and taller
    },
    {
        id: 'quick_actions',
        title: 'Quick Access',
        text: "Need to pay bills, scan a barcode, or check debts? Use these shortcuts to save time!",
        spotlight: { x: 20, y: 590, w: width - 40, h: 120, r: 24 }, // Centered on icons
    },
    {
        id: 'activity',
        title: 'Recent Activity',
        text: "Your latest transactions will show up here so you can track exactly where every peso goes.",
        spotlight: { x: 20, y: 720, w: width - 40, h: 50, r: 20 }, // Shifted further down
    },
    {
        id: 'tabs',
        title: 'Navigation',
        text: "Use these tabs to jump between your Wallets, Budgets, and full Transaction history.",
        spotlight: { x: 20, y: height - 85, w: width - 40, h: 65, r: 32 }, // Bottom Tab Bar
    },
];

export default function OnboardingTour({ onComplete }) {
    const [currentStep, setCurrentStep] = useState(0);
    const [visible, setVisible] = useState(false);
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const spotPos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
    const spotSize = useRef(new Animated.ValueXY({ x: 100, y: 100 })).current;

    useEffect(() => {
        checkFirstTime();
    }, []);

    const checkFirstTime = async () => {
        try {
            const hasSeen = await AsyncStorage.getItem('@has_seen_tour');
            if (!hasSeen) {
                setVisible(true);
                startTour();
            }
        } catch (e) {
            console.error('Onboarding check error:', e);
        }
    };

    const startTour = () => {
        const step = TOUR_STEPS[0];
        updateSpotlight(step.spotlight);
        Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: false,
        }).start();
    };

    const updateSpotlight = (target) => {
        Animated.parallel([
            Animated.spring(spotPos, {
                toValue: { x: target.x, y: target.y },
                useNativeDriver: false,
                tension: 40,
                friction: 7
            }),
            Animated.spring(spotSize, {
                toValue: { x: target.w, y: target.h },
                useNativeDriver: false,
                tension: 40,
                friction: 7
            })
        ]).start();
    };

    const nextStep = () => {
        if (currentStep < TOUR_STEPS.length - 1) {
            const next = currentStep + 1;
            setCurrentStep(next);
            updateSpotlight(TOUR_STEPS[next].spotlight);
        } else {
            finishTour();
        }
    };

    const prevStep = () => {
        if (currentStep > 0) {
            const prev = currentStep - 1;
            setCurrentStep(prev);
            updateSpotlight(TOUR_STEPS[prev].spotlight);
        }
    };

    const finishTour = async () => {
        Animated.timing(fadeAnim, {
            toValue: 0,
            duration: 300,
            useNativeDriver: false,
        }).start(async () => {
            setVisible(false);
            await AsyncStorage.setItem('@has_seen_tour', 'true');
            if (onComplete) onComplete();
        });
    };

    if (!visible) return null;

    const step = TOUR_STEPS[currentStep];
    const isBottomStep = step.spotlight.y > height / 2;

    return (
        <Modal transparent visible={visible} animationType="none">
            <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
                {/* 
                   Dynamic Spotlight Implementation
                   We create the "hole" using 4 absolute views (top, bottom, left, right)
                   around the spotPos and spotSize.
                */}
                <Animated.View style={[styles.barrier, { top: 0, height: spotPos.y, left: 0, width: width }]} />
                <Animated.View style={[styles.barrier, { top: spotPos.y, height: spotSize.y, left: 0, width: spotPos.x }]} />
                <Animated.View style={[styles.barrier, { top: spotPos.y, height: spotSize.y, left: Animated.add(spotPos.x, spotSize.x), width: width }]} />
                <Animated.View style={[styles.barrier, { top: Animated.add(spotPos.y, spotSize.y), height: height, left: 0, width: width }]} />

                {/* The highlighted area border */}
                <Animated.View
                    style={[
                        styles.spotlightBorder,
                        {
                            top: spotPos.y,
                            left: spotPos.x,
                            width: spotSize.x,
                            height: spotSize.y,
                            borderRadius: TOUR_STEPS[currentStep].spotlight.r
                        }
                    ]}
                />

                {/* Content Card */}
                <Animated.View style={[
                    styles.contentCard,
                    isBottomStep ? { bottom: height - spotPos.y + 20 } : {
                        top: Animated.add(spotPos.y, spotSize.y).interpolate({
                            inputRange: [0, height],
                            outputRange: [20, height]
                        })
                    }
                ]}>
                    <View style={styles.headerRow}>
                        <Image source={otterIcon} style={styles.miniOtter} />
                        <View style={{ flex: 1 }}>
                            <Text style={styles.title}>{step.title}</Text>
                            <Text style={styles.text}>{step.text}</Text>
                        </View>
                    </View>

                    <View style={styles.footer}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            {currentStep > 0 ? (
                                <TouchableOpacity onPress={prevStep} style={styles.backBtn}>
                                    <Feather name="arrow-left" size={16} color="#999" />
                                    <Text style={styles.backText}>Back</Text>
                                </TouchableOpacity>
                            ) : (
                                <TouchableOpacity onPress={finishTour} style={styles.skipBtn}>
                                    <Text style={styles.skipText}>Skip Guide</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        <View style={styles.dots}>
                            {TOUR_STEPS.map((_, i) => (
                                <View key={i} style={[styles.dot, i === currentStep && styles.activeDot]} />
                            ))}
                        </View>

                        <TouchableOpacity onPress={nextStep} style={styles.nextBtn}>
                            <Text style={styles.nextText}>{currentStep === TOUR_STEPS.length - 1 ? 'Got it!' : 'Next'}</Text>
                            <Feather name="arrow-right" size={16} color="#fff" />
                        </TouchableOpacity>
                    </View>
                </Animated.View>
            </Animated.View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    barrier: {
        position: 'absolute',
        backgroundColor: 'rgba(0,0,0,0.7)',
    },
    spotlightBorder: {
        position: 'absolute',
        borderWidth: 2,
        borderColor: '#E91E8C',
        shadowColor: '#E91E8C',
        shadowOpacity: 0.5,
        shadowRadius: 10,
        backgroundColor: 'transparent',
    },
    contentCard: {
        position: 'absolute',
        left: 20,
        right: 20,
        backgroundColor: '#fff',
        borderRadius: 24,
        padding: 24,
        elevation: 10,
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 15,
        shadowOffset: { width: 0, height: 10 },
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 15,
    },
    miniOtter: {
        width: 60,
        height: 60,
        borderRadius: 30,
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#1a1a1a',
        marginBottom: 4,
    },
    text: {
        fontSize: 14,
        color: '#666',
        lineHeight: 20,
    },
    footer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 24,
    },
    skipBtn: {
        paddingVertical: 8,
    },
    skipText: {
        color: '#999',
        fontSize: 14,
        fontWeight: '600',
    },
    backBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        gap: 4,
    },
    backText: {
        color: '#999',
        fontSize: 14,
        fontWeight: '600',
    },
    nextBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#E91E8C',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 16,
        gap: 8,
    },
    nextText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: 'bold',
    },
    dots: {
        flexDirection: 'row',
        gap: 6,
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#eee',
    },
    activeDot: {
        width: 12,
        backgroundColor: '#E91E8C',
    },
});
