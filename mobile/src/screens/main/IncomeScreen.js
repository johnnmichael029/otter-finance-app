import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { spacing } from '../../theme/colors';

export default function IncomeScreen() {
    const { COLORS } = useTheme();
    return (
        <SafeAreaView style={[styles.safe, { backgroundColor: COLORS.background }]}>
            <View style={styles.container}>
                <Text style={styles.emoji}>💰</Text>
                <Text style={[styles.title, { color: COLORS.text }]}>Income</Text>
                <Text style={[styles.sub, { color: COLORS.textMuted }]}>Coming soon — record your income sources.</Text>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1 },
    container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
    emoji: { fontSize: 56, marginBottom: spacing.md },
    title: { fontSize: 28, fontWeight: '700', marginBottom: 8 },
    sub: { fontSize: 14, textAlign: 'center' },
});
