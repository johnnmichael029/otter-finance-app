import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Sentry from '@sentry/react-native';

export default class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        // Update state so the next render will show the fallback UI.
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        // Log the error to an error reporting service like Sentry
        console.error("ErrorBoundary caught an error:", error, errorInfo);
        Sentry.captureException(error);
    }

    handleRestart = () => {
        // Optional: you could try to re-render or push a navigation reset
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            return (
                <SafeAreaView style={styles.container}>
                    <View style={styles.content}>
                        <MaterialCommunityIcons name="alert-circle-outline" size={80} color="#ef4444" style={styles.icon} />
                        <Text style={styles.title}>Oops, something went wrong.</Text>
                        <Text style={styles.subtitle}>Our app encountered an unexpected error. The development team has been automatically notified.</Text>

                        <ScrollView style={styles.errorBox}>
                            <Text style={styles.errorText}>
                                {this.state.error && this.state.error.toString()}
                            </Text>
                        </ScrollView>

                        <TouchableOpacity style={styles.button} onPress={this.handleRestart}>
                            <Feather name="refresh-ccw" size={18} color="#fff" style={{ marginRight: 8 }} />
                            <Text style={styles.buttonText}>Try Again</Text>
                        </TouchableOpacity>
                    </View>
                </SafeAreaView>
            );
        }

        return this.props.children;
    }
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#121212', // standard dark
    },
    content: {
        flex: 1,
        padding: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    icon: {
        marginBottom: 20,
    },
    title: {
        fontSize: 24,
        fontWeight: '900',
        color: '#ffffff',
        marginBottom: 12,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 15,
        color: '#a1a1aa',
        textAlign: 'center',
        marginBottom: 30,
        lineHeight: 22,
    },
    errorBox: {
        width: '100%',
        maxHeight: 150,
        backgroundColor: '#1e1e1e',
        borderRadius: 12,
        padding: 16,
        marginBottom: 30,
        borderWidth: 1,
        borderColor: '#3f3f46',
    },
    errorText: {
        fontFamily: 'monospace',
        color: '#ef4444',
        fontSize: 12,
        lineHeight: 18,
    },
    button: {
        flexDirection: 'row',
        backgroundColor: '#E91E8C',
        paddingVertical: 14,
        paddingHorizontal: 24,
        borderRadius: 12,
        alignItems: 'center',
    },
    buttonText: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: '800',
    }
});
