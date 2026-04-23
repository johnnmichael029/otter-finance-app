import React, { useState, useRef } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, FlatList,
    Dimensions, Image, Animated, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { completeOnboarding, getCurrencyList } from '../../api/api';
import { spacing, radius } from '../../theme/colors';

const { width, height } = Dimensions.get('window');

const SLIDES = [
    {
        id: '1',
        title: 'Welcome to Otter!',
        description: 'Your friendly guide to smart financial management. Track every cent with a smile.',
        image: require('../../../assets/onboarding/welcome.png'),
        color: '#3b82f6'
    },
    {
        id: '2',
        title: 'See the Big Picture',
        description: 'Visualize your spending habits and watch your savings grow with beautiful analytics.',
        image: require('../../../assets/onboarding/analytics.png'),
        color: '#22c55e'
    },
    {
        id: '3',
        title: 'Smart Grocery Runs',
        description: 'Our shopping mode helps you stay on budget and discover the best prices as you shop.',
        image: require('../../../assets/onboarding/shopping.png'),
        color: '#f59e0b'
    },
    {
        id: '4',
        type: 'setup',
        title: 'Let\'s Get Started',
        description: 'Choose your primary currency. You can change this later in settings.',
        color: '#8b5cf6'
    }
];

export default function OnboardingScreen() {
    const { COLORS, isDarkMode } = useTheme();
    const { updateLocalUser } = useAuth();
    const [currentIndex, setCurrentIndex] = useState(0);
    const [loading, setLoading] = useState(false);
    const [currency, setCurrency] = useState({ code: 'PHP', symbol: '₱', flag: '🇵🇭' });
    const [currencies, setCurrencies] = useState([]);
    const scrollX = useRef(new Animated.Value(0)).current;
    const slidesRef = useRef(null);

    React.useEffect(() => {
        getCurrencyList().then(res => {
            if (res.currencies) setCurrencies(res.currencies);
        }).catch(() => {});
    }, []);

    const viewableItemsChanged = useRef(({ viewableItems }) => {
        setCurrentIndex(viewableItems[0].index);
    }).current;

    const viewConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

    const scrollTo = () => {
        if (currentIndex < SLIDES.length - 1) {
            slidesRef.current.scrollToIndex({ index: currentIndex + 1 });
        } else {
            handleComplete();
        }
    };

    const handleComplete = async () => {
        setLoading(true);
        try {
            const res = await completeOnboarding({ currency: currency.code });
            await updateLocalUser(res); // Correctly persists to AsyncStorage
        } catch (e) {
            console.error('[Onboarding] Error:', e);
        } finally {
            setLoading(false);
        }
    };

    const renderSlide = ({ item }) => {
        if (item.type === 'setup') {
            return (
                <View style={[styles.slide, { width }]}>
                    <View style={styles.setupContainer}>
                        <View style={[styles.setupIcon, { backgroundColor: item.color + '20' }]}>
                            <MaterialCommunityIcons name="cog-outline" size={60} color={item.color} />
                        </View>
                        <Text style={[styles.title, { color: COLORS.text }]}>{item.title}</Text>
                        <Text style={[styles.description, { color: COLORS.textMuted }]}>{item.description}</Text>
                        
                        <Text style={[styles.label, { color: COLORS.textMuted, marginTop: 40 }]}>SELECT LOCAL CURRENCY</Text>
                        <View style={styles.currencyGrid}>
                            {currencies.slice(0, 6).map(curr => {
                                const isSelected = currency.code === curr.code;
                                return (
                                    <TouchableOpacity 
                                        key={curr.code}
                                        style={[
                                            styles.currencyPill, 
                                            { backgroundColor: isSelected ? item.color : COLORS.surface, borderColor: isSelected ? item.color : COLORS.border }
                                        ]}
                                        onPress={() => setCurrency(curr)}
                                    >
                                        <Text style={styles.pillFlag}>{curr.flag}</Text>
                                        <Text style={[styles.pillCode, { color: isSelected ? '#fff' : COLORS.text }]}>{curr.code}</Text>
                                        {isSelected && <Feather name="check" size={14} color="#fff" />}
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </View>
                </View>
            );
        }

        return (
            <View style={[styles.slide, { width }]}>
                <Image source={item.image} style={styles.image} resizeMode="contain" />
                <View style={styles.content}>
                    <Text style={[styles.title, { color: COLORS.text }]}>{item.title}</Text>
                    <Text style={[styles.description, { color: COLORS.textMuted }]}>{item.description}</Text>
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: COLORS.background }]}>
            <View style={{ flex: 3 }}>
                <FlatList
                    data={SLIDES}
                    renderItem={renderSlide}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    bounces={false}
                    keyExtractor={(item) => item.id}
                    onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
                        useNativeDriver: false
                    })}
                    scrollEventThrottle={32}
                    onViewableItemsChanged={viewableItemsChanged}
                    viewabilityConfig={viewConfig}
                    ref={slidesRef}
                />
            </View>

            <View style={styles.footer}>
                {/* Paginator */}
                <View style={styles.paginator}>
                    {SLIDES.map((_, i) => {
                        const inputRange = [(i - 1) * width, i * width, (i + 1) * width];
                        const dotWidth = scrollX.interpolate({
                            inputRange,
                            outputRange: [10, 20, 10],
                            extrapolate: 'clamp'
                        });
                        const opacity = scrollX.interpolate({
                            inputRange,
                            outputRange: [0.3, 1, 0.3],
                            extrapolate: 'clamp'
                        });
                        return (
                            <Animated.View 
                                key={i.toString()} 
                                style={[styles.dot, { width: dotWidth, opacity, backgroundColor: SLIDES[currentIndex].color }]} 
                            />
                        );
                    })}
                </View>

                {/* Next Button */}
                <TouchableOpacity 
                    style={[styles.nextBtn, { backgroundColor: SLIDES[currentIndex].color }]} 
                    onPress={scrollTo}
                    activeOpacity={0.8}
                >
                    {loading ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <>
                            <Text style={styles.nextText}>{currentIndex === SLIDES.length - 1 ? 'Finish' : 'Next'}</Text>
                            <Feather name="arrow-right" size={20} color="#fff" />
                        </>
                    )}
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    slide: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
    image: { width: width * 0.8, height: width * 0.8, marginBottom: 40 },
    content: { alignItems: 'center' },
    title: { fontSize: 28, fontWeight: '900', textAlign: 'center', marginBottom: 12 },
    description: { fontSize: 16, textAlign: 'center', lineHeight: 24, paddingHorizontal: 20 },
    
    footer: { height: 180, justifyContent: 'space-between', paddingHorizontal: 40, width: '100%', paddingBottom: 40 },
    paginator: { flexDirection: 'row', height: 40, justifyContent: 'center', alignItems: 'center' },
    dot: { height: 10, borderRadius: 5, marginHorizontal: 4 },
    
    nextBtn: { 
        height: 60, borderRadius: 20, flexDirection: 'row', 
        justifyContent: 'center', alignItems: 'center', gap: 10,
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1, shadowRadius: 10, elevation: 5
    },
    nextText: { color: '#fff', fontSize: 18, fontWeight: '800' },

    setupContainer: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' },
    setupIcon: { width: 120, height: 120, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 32 },
    label: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 16 },
    currencyGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
    currencyPill: { 
        flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12, 
        borderRadius: 16, borderWidth: 1.5 
    },
    pillFlag: { fontSize: 20 },
    pillCode: { fontSize: 14, fontWeight: '800' }
});
