import React from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet,
    SafeAreaView, StatusBar, Animated, ScrollView, Image,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

const otterIcon = require('../../assets/icon/welcomeOtter.png');

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            showDetails: false,
        };
        this.fadeAnim = new Animated.Value(0);
        this.slideAnim = new Animated.Value(40);
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('ErrorBoundary caught an error:', error, errorInfo);
        Animated.parallel([
            Animated.timing(this.fadeAnim, {
                toValue: 1,
                duration: 400,
                useNativeDriver: true,
            }),
            Animated.spring(this.slideAnim, {
                toValue: 0,
                tension: 60,
                friction: 10,
                useNativeDriver: true,
            }),
        ]).start();
    }

    resetError = () => {
        this.fadeAnim.setValue(0);
        this.slideAnim.setValue(40);
        this.setState({ hasError: false, error: null, showDetails: false });
    };

    toggleDetails = () => {
        this.setState(prev => ({ showDetails: !prev.showDetails }));
    };

    render() {
        if (this.state.hasError) {
            const { error, showDetails } = this.state;
            const errorMessage = error?.message || 'An unknown error occurred.';

            return (
                <SafeAreaView style={styles.safe}>
                    <StatusBar barStyle="light-content" backgroundColor="#0d0d14" />

                    {/* Background blobs */}
                    <View style={styles.blobTop} />
                    <View style={styles.blobBottom} />

                    <Animated.View
                        style={[
                            styles.content,
                            {
                                opacity: this.fadeAnim,
                                transform: [{ translateY: this.slideAnim }],
                            },
                        ]}
                    >
                        {/* Mascot */}
                        <View style={styles.mascotWrap}>
                            <Image
                                source={otterIcon}
                                style={styles.mascot}
                                resizeMode="contain"
                            />
                        </View>

                        {/* Card */}
                        <View style={styles.card}>
                            <View style={styles.iconBadge}>
                                <Feather name="alert-triangle" size={28} color="#E91E8C" />
                            </View>

                            <Text style={styles.title}>Something went wrong</Text>
                            <Text style={styles.subtitle}>
                                Otter ran into an unexpected hiccup. Don't worry — your data is safe.
                            </Text>

                            {/* Error detail toggle */}
                            <TouchableOpacity
                                style={styles.detailToggle}
                                onPress={this.toggleDetails}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.detailToggleText}>
                                    {showDetails ? 'Hide' : 'Show'} error details
                                </Text>
                                <Feather
                                    name={showDetails ? 'chevron-up' : 'chevron-down'}
                                    size={14}
                                    color="#E91E8C"
                                />
                            </TouchableOpacity>

                            {showDetails && (
                                <ScrollView
                                    style={styles.errorBox}
                                    nestedScrollEnabled
                                    showsVerticalScrollIndicator={false}
                                >
                                    <Text style={styles.errorText} selectable>
                                        {errorMessage}
                                    </Text>
                                </ScrollView>
                            )}

                            {/* Actions */}
                            <TouchableOpacity
                                style={styles.primaryBtn}
                                onPress={this.resetError}
                                activeOpacity={0.85}
                            >
                                <Feather name="refresh-cw" size={16} color="#fff" style={{ marginRight: 8 }} />
                                <Text style={styles.primaryBtnText}>Try Again</Text>
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.footer}>
                            Otter Finance · Error Recovery
                        </Text>
                    </Animated.View>
                </SafeAreaView>
            );
        }

        return this.props.children;
    }
}

const PINK = '#E91E8C';
const DARK_BG = '#0d0d14';
const CARD_BG = '#161622';
const BORDER = '#2a2a3a';

const styles = StyleSheet.create({
    safe: {
        flex: 1,
        backgroundColor: DARK_BG,
    },

    // Decorative blobs
    blobTop: {
        position: 'absolute',
        width: 300,
        height: 300,
        borderRadius: 150,
        backgroundColor: PINK,
        opacity: 0.08,
        top: -80,
        right: -80,
    },
    blobBottom: {
        position: 'absolute',
        width: 250,
        height: 250,
        borderRadius: 125,
        backgroundColor: '#7b0f4e',
        opacity: 0.12,
        bottom: -60,
        left: -60,
    },

    content: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 24,
    },

    // Mascot
    mascotWrap: {
        marginBottom: 8,
    },
    mascot: {
        width: 110,
        height: 110,
    },

    // Card
    card: {
        width: '100%',
        backgroundColor: CARD_BG,
        borderRadius: 24,
        padding: 24,
        borderWidth: 1,
        borderColor: BORDER,
        alignItems: 'center',
        // Shadow
        shadowColor: PINK,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 20,
        elevation: 10,
    },

    iconBadge: {
        width: 60,
        height: 60,
        borderRadius: 18,
        backgroundColor: PINK + '18',
        borderWidth: 1,
        borderColor: PINK + '40',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },

    title: {
        fontSize: 20,
        fontWeight: '800',
        color: '#FFFFFF',
        marginBottom: 8,
        textAlign: 'center',
        letterSpacing: -0.3,
    },
    subtitle: {
        fontSize: 14,
        color: '#8888aa',
        textAlign: 'center',
        lineHeight: 21,
        marginBottom: 20,
    },

    // Detail toggle
    detailToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginBottom: 12,
    },
    detailToggleText: {
        fontSize: 12,
        color: PINK,
        fontWeight: '600',
    },

    // Error box
    errorBox: {
        width: '100%',
        maxHeight: 90,
        backgroundColor: '#0a0a12',
        borderRadius: 10,
        padding: 12,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: BORDER,
    },
    errorText: {
        fontSize: 11,
        color: '#ff6b6b',
        fontFamily: 'monospace',
        lineHeight: 16,
    },

    // Button
    primaryBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: PINK,
        paddingVertical: 14,
        paddingHorizontal: 32,
        borderRadius: 14,
        width: '100%',
        shadowColor: PINK,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 10,
        elevation: 6,
    },
    primaryBtnText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '700',
        letterSpacing: 0.3,
    },

    footer: {
        marginTop: 24,
        fontSize: 11,
        color: '#3a3a55',
        letterSpacing: 0.5,
        fontWeight: '600',
    },
});

export default ErrorBoundary;
