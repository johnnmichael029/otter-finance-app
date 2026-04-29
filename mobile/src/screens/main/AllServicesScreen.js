import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { spacing, radius } from '../../theme/colors';

const SERVICES = [
    {
        category: 'Analytics & Insights',
        items: [
            { id: 'net_worth', icon: 'bar-chart-2', label: 'Net Worth', color: '#8b5cf6', screen: 'NetWorth', badge: 'NEW' },
            { id: 'analytics', icon: 'analytics', family: 'ionicons', label: 'Analytics', color: '#10b981', screen: 'Analytics' },
            { id: 'export', icon: 'download', label: 'Export Data', color: '#3b82f6', screen: 'ExportData' },
        ]
    },
    {
        category: 'Savings & Wealth',
        items: [
            { id: 'savings', icon: 'piggy-bank-outline', label: 'Savings', color: '#E91E8C', action: 'savings' },
            { id: 'savings_archive', icon: 'archive', label: 'Archive', color: '#6366f1', screen: 'SavingsArchive' },
            { id: 'budget', icon: 'pie-chart', label: 'Budget', color: '#f97316', screen: 'Budget' },
        ]
    },
    {
        category: 'Core Finance',
        items: [
            { id: 'debts', icon: 'credit-card', label: 'Debts', color: '#f59e0b', screen: 'DebtScreen' },
            { id: 'debt_planner', icon: 'trending-down', label: 'Debt Planner', color: '#ef4444', screen: 'DebtPlanner' },
            { id: 'bills', icon: 'repeat', label: 'Bills', color: '#22c55e', screen: 'RecurringBills' },
            { id: 'convert', icon: 'dollar-sign', label: 'Converter', color: '#8b5cf6', screen: 'CurrencyConverter' },
        ]
    },
    {
        category: 'Social & Connect',
        items: [
            { id: 'friends', icon: 'users', label: 'Friends', color: '#3b82f6', screen: 'FriendsScreen' },
            { id: 'trip_wallet', icon: 'airplane', family: 'ionicons', label: 'Trip Wallet', color: '#6366f1', screen: 'GroupWalletScreen' },
        ]
    },
    {
        category: 'Retail & Lifestyle',
        items: [
            { id: 'shopping', icon: 'shopping-cart', label: 'Shopping', color: '#E91E8C', screen: 'ShoppingHome' },
            { id: 'scanner', icon: 'maximize', label: 'Scanner', color: '#06b6d4', screen: 'BarcodeScanner' },
        ]
    },
];

export default function AllServicesScreen({ navigation }) {
    const COLORS = useTheme(state => state.COLORS);
    const setIsSavingsMode = useTheme(state => state.setIsSavingsMode);

    const handlePress = (item) => {
        if (item.action === 'savings') {
            setIsSavingsMode(true);
            navigation.popToTop(); // Jump to root cleanly without chained delays
            return;
        }

        if (item.screen) {
            if (item.screen === 'Budget') {
                setIsSavingsMode(false);
                navigation.navigate('HomeRoot', { screen: item.screen });
            } else {
                navigation.navigate(item.screen);
            }
        }
    };

    return (
        <SafeAreaView style={[styles.safe, { backgroundColor: COLORS.background }]}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => { if (navigation.canGoBack()) navigation.goBack(); }} style={[styles.backBtn, { backgroundColor: COLORS.surface }]}>
                    <Feather name="arrow-left" size={20} color={COLORS.text} />
                </TouchableOpacity>
                <View style={styles.headerTitleContainer}>
                    <Text style={[styles.headerTitle, { color: COLORS.text }]}>All Services</Text>
                </View>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                {SERVICES.map((section) => (
                    <View key={section.category} style={styles.section}>
                        <Text style={[styles.sectionTitle, { color: COLORS.textMuted }]}>{section.category.toUpperCase()}</Text>
                        <View style={[styles.grid, { backgroundColor: COLORS.surface }]}>
                            {section.items.map((item) => (
                                <TouchableOpacity
                                    key={item.id}
                                    style={styles.gridItem}
                                    onPress={() => handlePress(item)}
                                    activeOpacity={0.7}
                                >
                                    <View style={[styles.iconWrapper, { backgroundColor: item.color + '15' }]}>
                                        {item.family === 'ionicons' ? (
                                            <Ionicons name={item.icon} size={24} color={item.color} />
                                        ) : item.icon.includes('piggy') ? (
                                            <MaterialCommunityIcons name={item.icon} size={24} color={item.color} />
                                        ) : (
                                            <Feather name={item.icon} size={24} color={item.color} />
                                        )}
                                    </View>
                                    <Text style={[styles.itemLabel, { color: COLORS.text }]} numberOfLines={1}>{item.label}</Text>
                                    {item.badge && (
                                        <View style={[styles.badge, { backgroundColor: item.color }]}>
                                            <Text style={styles.badgeText}>{item.badge}</Text>
                                        </View>
                                    )}
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                ))}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1 },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md,
    },
    backBtn: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    headerTitleContainer: { flex: 1, alignItems: 'center' },
    headerTitle: { fontSize: 18, fontWeight: '800' },
    content: { padding: spacing.lg, paddingBottom: 40 },
    section: { marginBottom: spacing.xl },
    sectionTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: spacing.sm, marginLeft: spacing.xs },
    grid: {
        flexDirection: 'row', flexWrap: 'wrap',
        borderRadius: radius.xl, padding: spacing.sm,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2
    },
    gridItem: {
        width: '25%', alignItems: 'center', justifyContent: 'flex-start',
        paddingVertical: spacing.md, paddingHorizontal: 4,
    },
    iconWrapper: {
        width: 52, height: 52, borderRadius: 26,
        justifyContent: 'center', alignItems: 'center',
        marginBottom: spacing.sm
    },
    itemLabel: { fontSize: 11, fontWeight: '600', textAlign: 'center' },
    badge: {
        position: 'absolute', top: 4, right: 0,
        paddingHorizontal: 5, paddingVertical: 2,
        borderRadius: radius.full
    },
    badgeText: { fontSize: 8, fontWeight: '800', color: '#fff', textTransform: 'uppercase' }
});
