import React, { useState, useRef, useEffect } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, FlatList,
    Dimensions, Image, Animated, ActivityIndicator,
    TextInput, ScrollView, KeyboardAvoidingView, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons, FontAwesome, FontAwesome5 } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { completeOnboarding, getCurrencyList, checkTagAvailability } from '../../api/api';
import { triggerHaptic } from '../../utils/haptics';

const { width, height } = Dimensions.get('window');

const OCCUPATIONS = [
    { id: 'student', label: 'Student', icon: 'school-outline', color: '#3b82f6' },
    { id: 'teacher', label: 'Teacher', icon: 'chalkboard-teacher', provider: 'font-awesome-5', color: '#ef4444' },
    { id: 'freelancer', label: 'Freelancer', icon: 'laptop', color: '#8b5cf6' },
    { id: 'employee', label: 'Employee', icon: 'briefcase-outline', color: '#22c55e' },
    { id: 'business', label: 'Business Owner', icon: 'rocket-launch-outline', color: '#f59e0b' },
    { id: 'retired', label: 'Retired', icon: 'beach', color: '#06b6d4' },
    { id: 'other', label: 'Other', icon: 'dots-horizontal-circle-outline', color: '#6366f1' },
];

const SLIDES = [
    {
        id: '1',
        title: 'Welcome to Otter!',
        description: 'Your friendly guide to smart financial management. Track every cent with a smile.',
        image: require('../../../assets/onboarding/welcome.png'),
        color: '#E91E8C'
    },
    {
        id: '2',
        title: 'See the Big Picture',
        description: 'Visualize your spending habits and watch your savings grow with beautiful analytics.',
        image: require('../../../assets/onboarding/analytics.png'),
        color: '#E91E8C'
    },
    {
        id: '3',
        title: 'Smart Grocery Runs',
        description: 'Our shopping mode helps you stay on budget and discover the best prices as you shop.',
        image: require('../../../assets/onboarding/shopping.png'),
        color: '#E91E8C'
    },
    {
        id: '4',
        type: 'setup',
        title: 'One Last Step!',
        description: 'Help me understand your financial needs better.',
        color: '#E91E8C'
    }
];

export default function OnboardingScreen() {
    const COLORS = useTheme(state => state.COLORS);
    const isDarkMode = useTheme(state => state.isDarkMode);
    const { userInfo, updateLocalUser, hapticsEnabled } = useAuth();
    const [currentIndex, setCurrentIndex] = useState(0);
    const [loading, setLoading] = useState(false);

    // Setup States
    const [name, setName] = useState(userInfo?.name || '');
    const [otterTag, setOtterTag] = useState('');
    const [currency, setCurrency] = useState({ code: 'PHP', symbol: '₱', flag: '🇵🇭' });
    const [currencies, setCurrencies] = useState([]);
    const [occupation, setOccupation] = useState('');
    const [otherOccupation, setOtherOccupation] = useState('');
    const [showOtherInput, setShowOtherInput] = useState(false);
    const [tagError, setTagError] = useState('');
    const [isTagChecking, setIsTagChecking] = useState(false);
    const [isTagAvailable, setIsTagAvailable] = useState(null); // null, true, false

    const scrollX = useRef(new Animated.Value(0)).current;
    const slidesRef = useRef(null);

    useEffect(() => {
        getCurrencyList().then(res => {
            if (res.currencies) setCurrencies(res.currencies);
        }).catch(() => { });
        if (userInfo?.name) setName(userInfo.name);
    }, [userInfo]);

    // Real-time tag availability check
    useEffect(() => {
        if (!otterTag) {
            setIsTagAvailable(null);
            setTagError('');
            return;
        }

        if (otterTag.length < 3) {
            setIsTagAvailable(null);
            setTagError('Too short');
            return;
        }

        // Basic format validation
        if (!/^[a-zA-Z0-9_]+$/.test(otterTag)) {
            setTagError('Only letters, numbers, and underscores allowed.');
            setIsTagAvailable(false);
            return;
        }

        setTagError('');
        const timeoutId = setTimeout(async () => {
            setIsTagChecking(true);
            try {
                const { available } = await checkTagAvailability(otterTag);
                setIsTagAvailable(available);
                if (!available) setTagError('This tag is already taken.');
            } catch (err) {
                console.error('Tag check error', err);
            } finally {
                setIsTagChecking(false);
            }
        }, 600);

        return () => clearTimeout(timeoutId);
    }, [otterTag]);

    const handleOccupationSelect = (occ) => {
        triggerHaptic(hapticsEnabled, 'impactLight');
        if (occ.id === 'other') {
            setShowOtherInput(true);
            setOccupation('other');
        } else {
            setShowOtherInput(false);
            setOccupation(occ.label);
        }
    };

    const handleComplete = async () => {
        if (!name.trim()) {
            setTagError('Please enter your name.');
            return;
        }
        if (!otterTag || otterTag.length < 3) {
            setTagError('Otter Tag must be at least 3 characters.');
            return;
        }
        if (isTagAvailable === false) return;
        if (isTagChecking) return;

        setLoading(true);
        try {
            const finalOccupation = occupation === 'other' ? otherOccupation : occupation;
            const res = await completeOnboarding({
                name: name.trim(),
                currency: currency.code,
                occupation: finalOccupation,
                otterTag: otterTag.trim()
            });
            await updateLocalUser(res);
        } catch (e) {
            console.error('[Onboarding] Error:', e);
        } finally {
            setLoading(false);
        }
    };

    const renderSlide = ({ item }) => {
        if (item.type === 'setup') {
            return (
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={{ width }}
                >
                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
                        <View style={styles.setupHeader}>
                            <Image
                                source={require('../../../assets/onboarding/welcome.png')}
                                style={styles.mascotSmall}
                            />
                            <View style={styles.bubble}>
                                <Text style={styles.bubbleText}>Help me get to know you!</Text>
                            </View>
                        </View>

                        <View style={styles.formSection}>
                            <Text style={[styles.sectionLabel, { color: COLORS.textMuted }]}>WHAT'S YOUR FULL NAME?</Text>
                            <TextInput
                                style={[styles.input, { backgroundColor: COLORS.surface, color: COLORS.text, borderColor: COLORS.border }]}
                                value={name}
                                onChangeText={setName}
                                placeholder="Enter your name"
                                placeholderTextColor={COLORS.textMuted}
                            />

                            <Text style={[styles.sectionLabel, { color: COLORS.textMuted, marginTop: 24 }]}>YOUR UNIQUE @OTTERTAG</Text>
                            <View style={styles.tagInputWrapper}>
                                <Text style={[styles.tagPrefix, { color: COLORS.primary }]}>@</Text>
                                <TextInput
                                    style={[
                                        styles.tagInput,
                                        {
                                            backgroundColor: COLORS.surface,
                                            color: COLORS.text,
                                            borderColor: tagError ? '#ef4444' : (isTagAvailable ? '#22c55e' : COLORS.border)
                                        }
                                    ]}
                                    value={otterTag}

                                    onChangeText={(t) => setOtterTag(t.replace(/\s/g, '').toLowerCase())}
                                    placeholder="yamashii_dev"
                                    placeholderTextColor={COLORS.textMuted}
                                    autoCapitalize="none"
                                />
                                {isTagChecking && (
                                    <ActivityIndicator size="small" color={COLORS.primary} style={styles.tagLoader} />
                                )}
                                {isTagAvailable === true && !isTagChecking && (
                                    <Feather name="check-circle" size={18} color="#22c55e" style={styles.tagLoader} />
                                )}
                            </View>
                            {tagError ? <Text style={styles.errorText}>{tagError}</Text> : (
                                <Text style={styles.tagHint}>This is how friends will find you.</Text>
                            )}

                            <Text style={[styles.sectionLabel, { color: COLORS.textMuted, marginTop: 24 }]}>CHOOSE YOUR CURRENCY</Text>
                            <View style={styles.currencyRow}>
                                {currencies.slice(0, 4).map(curr => {
                                    const isSelected = currency.code === curr.code;
                                    return (
                                        <TouchableOpacity
                                            key={curr.code}
                                            style={[
                                                styles.currencyPill,
                                                { backgroundColor: isSelected ? COLORS.primary : COLORS.surface, borderColor: isSelected ? COLORS.primary : COLORS.border }
                                            ]}
                                            onPress={() => setCurrency(curr)}
                                        >
                                            <Text style={styles.pillFlag}>{curr.flag}</Text>
                                            <Text style={[styles.pillCode, { color: isSelected ? '#fff' : COLORS.text }]}>{curr.code}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>

                            <Text style={[styles.sectionLabel, { color: COLORS.textMuted, marginTop: 24 }]}>I AM A...</Text>
                            <View style={styles.occGrid}>
                                {OCCUPATIONS.map((occ) => {
                                    const isSelected = (occ.id === 'other' && occupation === 'other') || occupation === occ.label;
                                    return (
                                        <TouchableOpacity
                                            key={occ.id}
                                            style={[
                                                styles.occCard,
                                                { backgroundColor: COLORS.surface, borderColor: isSelected ? COLORS.primary : COLORS.border }
                                            ]}
                                            onPress={() => handleOccupationSelect(occ)}
                                        >
                                            {occ.provider === 'font-awesome-5' ? (
                                                <FontAwesome5 name={occ.icon} size={18} color={isSelected ? COLORS.primary : COLORS.textMuted} />
                                            ) : (
                                                <MaterialCommunityIcons name={occ.icon} size={24} color={isSelected ? COLORS.primary : COLORS.textMuted} />
                                            )}
                                            <Text style={[styles.occLabel, { color: isSelected ? COLORS.text : COLORS.textMuted }]}>{occ.label}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>

                            {showOtherInput && (
                                <Animated.View style={styles.otherInputWrapper}>
                                    <TextInput
                                        style={[styles.input, { backgroundColor: COLORS.surface, color: COLORS.text, borderColor: COLORS.primary, marginTop: 12 }]}
                                        value={otherOccupation}
                                        onChangeText={setOtherOccupation}
                                        placeholder="Tell me your specific profession..."
                                        placeholderTextColor={COLORS.textMuted}
                                        autoFocus
                                    />
                                </Animated.View>
                            )}
                        </View>
                    </ScrollView>
                </KeyboardAvoidingView>
            );
        }

        return (
            <View style={[styles.slide, { width }]}>
                <Image
                    source={require('../../../assets/onboarding/welcome.png')}
                    style={styles.image}
                    resizeMode="contain"
                />
                <View style={styles.content}>
                    <Text style={[styles.title, { color: COLORS.text }]}>{item.title}</Text>
                    <Text style={[styles.description, { color: COLORS.textMuted }]}>{item.description}</Text>
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: COLORS.background }]}>
            <FlatList
                data={SLIDES}
                renderItem={renderSlide}
                horizontal
                pagingEnabled
                scrollEnabled={!loading}
                showsHorizontalScrollIndicator={false}
                bounces={false}
                keyExtractor={(item) => item.id}
                onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
                    useNativeDriver: false
                })}
                scrollEventThrottle={32}
                onViewableItemsChanged={({ viewableItems }) => {
                    if (viewableItems[0]) setCurrentIndex(viewableItems[0].index);
                }}
                viewabilityConfig={{ viewAreaCoveragePercentThreshold: 50 }}
                ref={slidesRef}
            />

            <View style={styles.footer}>
                <TouchableOpacity
                    style={[
                        styles.nextBtn,
                        {
                            backgroundColor: COLORS.primary,
                            opacity: (currentIndex === 3 && (!name.trim() || !otterTag || isTagAvailable === false || isTagChecking)) ? 0.6 : 1
                        }
                    ]}
                    onPress={() => {
                        if (currentIndex < 3) {
                            slidesRef.current.scrollToIndex({ index: currentIndex + 1 });
                        } else {
                            handleComplete();
                        }
                    }}
                    disabled={loading || (currentIndex === 3 && !name.trim())}
                >
                    {loading ? <ActivityIndicator color="#fff" /> : (
                        <>
                            <Text style={styles.nextText}>{currentIndex < 3 ? 'Next' : 'Finish Setup'}</Text>
                            <Feather name="arrow-right" size={20} color="#fff" />
                        </>
                    )}
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    slide: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
    scrollContent: { padding: 24, paddingBottom: 100 },
    image: { width: width * 0.8, height: width * 0.8, marginBottom: 40 },
    content: { alignItems: 'center' },
    title: { fontSize: 32, fontWeight: '900', textAlign: 'center', marginBottom: 16 },
    description: { fontSize: 18, textAlign: 'center', lineHeight: 26, paddingHorizontal: 20 },

    setupHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 32, gap: 12 },
    mascotSmall: { width: 80, height: 80, borderRadius: 40 },
    bubble: { backgroundColor: '#E91E8C', padding: 12, borderRadius: 20, borderBottomLeftRadius: 0, flex: 1 },
    bubbleText: { color: '#fff', fontWeight: '800', fontSize: 14 },

    formSection: { width: '100%' },
    sectionLabel: { fontSize: 11, fontWeight: '900', letterSpacing: 1.2, marginBottom: 12 },
    input: { height: 60, borderRadius: 16, paddingHorizontal: 16, fontSize: 16, fontWeight: '700', borderWidth: 1.5 },

    tagInputWrapper: { flexDirection: 'row', alignItems: 'center' },
    tagPrefix: { fontSize: 20, fontWeight: '900', marginRight: 8 },
    tagInput: { flex: 1, height: 60, borderRadius: 16, paddingHorizontal: 16, fontSize: 16, fontWeight: '700', borderWidth: 1.5 },
    tagLoader: { position: 'absolute', right: 16 },
    errorText: { color: '#ef4444', fontSize: 12, fontWeight: '700', marginTop: 6, marginLeft: 32 },

    currencyRow: { flexDirection: 'row', gap: 8 },
    currencyPill: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 6, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5
    },
    pillFlag: { fontSize: 18 },
    pillCode: { fontSize: 13, fontWeight: '800' },

    occGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    occCard: {
        width: (width - 68) / 2, padding: 16, borderRadius: 16, borderWidth: 1.5,
        alignItems: 'center', justifyContent: 'center', gap: 8
    },
    occLabel: { fontSize: 13, fontWeight: '800' },

    footer: { position: 'absolute', bottom: 40, left: 24, right: 24 },
    nextBtn: {
        height: 64, borderRadius: 24, flexDirection: 'row',
        justifyContent: 'center', alignItems: 'center', gap: 12,
        shadowColor: '#E91E8C', shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.3, shadowRadius: 12, elevation: 8
    },
    nextText: { color: '#fff', fontSize: 18, fontWeight: '900' },
});
