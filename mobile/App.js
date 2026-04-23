import React from 'react';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import Toast from 'react-native-toast-message';
import { Feather, Ionicons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import QuickAddSheet from './src/components/QuickAddSheet';
import SavingsQuickAddSheet from './src/components/SavingsQuickAddSheet';
import AnimatedFAB from './src/components/AnimatedFAB';
import * as Sentry from '@sentry/react-native';
import ErrorBoundary from './src/components/ErrorBoundary';

// Initialize Sentry
Sentry.init({
    dsn: 'https://1bf9c89d4d85c2cbbe9f46a366662602@o4511268540776448.ingest.us.sentry.io/4511268551393280',
    tracesSampleRate: 1.0,
});

// Contexts
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { SecurityProvider, useSecurity } from './src/context/SecurityContext';
import { useUIStore } from './src/store/uiStore';

// Auth Screens
import LoginScreen from './src/screens/auth/LoginScreen';
import RegisterScreen from './src/screens/auth/RegisterScreen';
import TwoFAScreen from './src/screens/auth/TwoFAScreen';
import AppLockScreen from './src/screens/auth/AppLockScreen';
import PinSetupScreen from './src/screens/auth/PinSetupScreen';
import OnboardingScreen from './src/screens/auth/OnboardingScreen';

// Settings
import SettingsScreen from './src/screens/main/SettingsScreen';
import SessionManagementScreen from './src/screens/main/SessionManagementScreen';

// Main Screens
import HomeScreen from './src/screens/main/HomeScreen';
import TransactionsScreen from './src/screens/main/TransactionsScreen';
import RecurringBillsScreen from './src/screens/main/RecurringBillsScreen';
import WalletScreen from './src/screens/main/WalletScreen';
import BudgetScreen from './src/screens/main/BudgetScreen';
import AddTransactionScreen from './src/screens/main/AddTransactionScreen';
import BarcodeScannerScreen from './src/screens/main/BarcodeScannerScreen';
import DebtScreen from './src/screens/main/DebtScreen';
import CurrencyConverterScreen from './src/screens/main/CurrencyConverterScreen';
import AllServicesScreen from './src/screens/main/AllServicesScreen';
import DebtPlannerScreen from './src/screens/main/DebtPlannerScreen';
import AnalyticsScreen from './src/screens/main/AnalyticsScreen';
import NotificationsScreen from './src/screens/main/NotificationsScreen';

// Savings Screens
import SavingsHomeScreen from './src/screens/savings/SavingsHomeScreen';
import SavingsGoalDetailScreen from './src/screens/savings/SavingsGoalDetailScreen';
import SavingsTransferScreen from './src/screens/savings/SavingsTransferScreen';
import SavingsTransferHistoryScreen from './src/screens/savings/SavingsTransferHistoryScreen';
import AddSavingsGoalScreen from './src/screens/savings/AddSavingsGoalScreen';
import SavingsGoalSelectorScreen from './src/screens/savings/SavingsGoalSelectorScreen';
import SavingsArchiveScreen from './src/screens/savings/SavingsArchiveScreen';

// Shopping Screens
import ShoppingHomeScreen from './src/screens/shopping/ShoppingHomeScreen';
import ShoppingSessionScreen from './src/screens/shopping/ShoppingSessionScreen';
import ShoppingCheckoutScreen from './src/screens/shopping/ShoppingCheckoutScreen';
import ShoppingHistoryDetailScreen from './src/screens/shopping/ShoppingHistoryDetailScreen';
import ShoppingTemplatesScreen from './src/screens/shopping/ShoppingTemplatesScreen';
import ManageCategoriesScreen from './src/screens/main/ManageCategoriesScreen';

import { StatusBar } from 'expo-status-bar';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const linking = {
    prefixes: ['otter://'],
    config: {
        screens: {
            AddTransaction: 'add',
        },
    },
};

// Wallet mode is now in src/context/WalletModeContext.js

const AuthStack = () => (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Register" component={RegisterScreen} />
        <Stack.Screen name="TwoFA" component={TwoFAScreen} />
    </Stack.Navigator>
);

// ── Shared Custom Tab Bar ──────────────────────────────────────
const CustomTabBar = ({ state, descriptors, navigation: tabNav, onPressAdd }) => {
    const { COLORS } = useTheme();
    const setIsSavingsMode = useUIStore(state => state.setIsSavingsMode);
    const leftTabs = state.routes.slice(0, 2);
    const rightTabs = state.routes.slice(2);

    const renderTab = (route, index) => {
        const { options } = descriptors[route.key];
        const isFocused = state.index === index;
        const color = isFocused ? COLORS.primary : COLORS.textMuted;
        const label = options.title ?? route.name;

        return (
            <TouchableOpacity
                key={route.key}
                onPress={() => {
                    if (route.name === 'ExitSavings') {
                        setIsSavingsMode(false);
                    } else if (!isFocused) {
                        tabNav.navigate(route.name);
                    }
                }}
                activeOpacity={0.75}
                style={styles.tabItem}
            >
                {options.tabBarIcon?.({ color, size: 22 })}
                <Text style={[styles.tabLabel, { color }]}>{label}</Text>
            </TouchableOpacity>
        );
    };

    return (
        <View style={[styles.tabBarWrapper, { backgroundColor: COLORS.surface }]}>
            <View style={styles.tabSide}>{leftTabs.map((r, i) => renderTab(r, i))}</View>
            <View style={styles.tabCenter}>
                <AnimatedFAB navigation={tabNav} isSavingsMode={state.routes.some(r => r.name.includes('Savings'))} />
            </View>
            <View style={styles.tabSide}>{rightTabs.map((r, i) => renderTab(r, i + 2))}</View>
        </View>
    );
};

const styles = StyleSheet.create({
    tabBarWrapper: {
        flexDirection: 'row', alignItems: 'center',
        position: 'absolute', bottom: 12, left: 16, right: 16,
        height: 72, paddingBottom: 8, paddingHorizontal: 8,
        borderRadius: 36, elevation: 20,
        shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: -2 },
    },
    tabSide: { flex: 1, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
    tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 8, gap: 3 },
    tabLabel: { fontSize: 10, fontWeight: '700' },
    tabCenter: { width: 72, alignItems: 'center', justifyContent: 'flex-start', marginBottom: 20 },
    centerFab: {
        width: 58, height: 58, borderRadius: 29, justifyContent: 'center', alignItems: 'center',
        elevation: 12, shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
    },
});

// ── Main Mode Tabs ─────────────────────────────────────────────
const MainTabs = ({ navigation }) => {
    const { COLORS } = useTheme();
    return (
        <View style={{ flex: 1, backgroundColor: COLORS.background }}>
            <Tab.Navigator
                screenOptions={{ headerShown: false }}
                tabBar={(props) => <CustomTabBar {...props} />}
            >
                <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Home', tabBarIcon: ({ color }) => <Feather name="home" size={22} color={color} /> }} />
                <Tab.Screen name="Wallets" component={WalletScreen} options={{ title: 'Wallets', tabBarIcon: ({ color }) => <Ionicons name="wallet-outline" size={22} color={color} /> }} />
                <Tab.Screen name="Transactions" component={TransactionsScreen} options={{ title: 'Transactions', tabBarIcon: ({ color }) => <Feather name="list" size={22} color={color} /> }} />
                <Tab.Screen name="Budget" component={BudgetScreen} options={{ title: 'Budget', tabBarIcon: ({ color }) => <Feather name="pie-chart" size={22} color={color} /> }} />
            </Tab.Navigator>
        </View>
    );
};

// ── Savings Mode Tabs ──────────────────────────────────────────
const SavingsTabs = ({ navigation: rootNav }) => {
    const { COLORS } = useTheme();
    const setIsSavingsMode = useUIStore(state => state.setIsSavingsMode);
    return (
        <View style={{ flex: 1, backgroundColor: COLORS.background }}>
            <Tab.Navigator
                screenOptions={{ headerShown: false }}
                tabBar={(props) => <CustomTabBar {...props} />}
            >
                <Tab.Screen name="SavingsHome" component={SavingsHomeScreen} options={{ title: 'Overview', tabBarIcon: ({ color }) => <Feather name="home" size={22} color={color} /> }} />
                <Tab.Screen name="SavingsGoals" component={SavingsHomeScreen} options={{ title: 'Goals', tabBarIcon: ({ color }) => <Feather name="target" size={22} color={color} /> }} />
                <Tab.Screen name="SavingsHistory" component={SavingsTransferHistoryScreen} options={{ title: 'History', tabBarIcon: ({ color }) => <Feather name="clock" size={22} color={color} /> }} />
                <Tab.Screen
                    name="ExitSavings"
                    // Dummy component, will never render because CustomTabBar intercepts it
                    component={View}
                    options={{ title: 'Main', tabBarIcon: ({ color }) => <Feather name="log-out" size={22} color={color} /> }}
                />
            </Tab.Navigator>
        </View>
    );
};

const GlobalStatusBar = () => {
    const { isDarkMode } = useTheme();
    return <StatusBar style={isDarkMode ? 'light' : 'dark'} />;
};

const AppNavigator = () => {
    const { userToken, userInfo, isSplashLoading } = useAuth();
    const { COLORS, isDarkMode } = useTheme();
    const isSavingsMode = useUIStore(state => state.isSavingsMode);

    const navTheme = isDarkMode
        ? { ...DarkTheme, colors: { ...DarkTheme.colors, background: COLORS.background, card: COLORS.surface } }
        : { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: COLORS.background, card: COLORS.surface } };

    if (isSplashLoading) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background }}>
                <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
        );
    }

    return (
        <NavigationContainer theme={navTheme} linking={linking}>
            <View style={{ flex: 1, backgroundColor: COLORS.background }}>
                {userToken ? (
                    !userInfo?.isOnboarded ? (
                        <OnboardingScreen />
                    ) : (
                        <Stack.Navigator
                            screenOptions={{
                                headerShown: false,
                                contentStyle: { backgroundColor: COLORS.background },
                                animation: 'slide_from_right',
                                animationDuration: 280,
                            }}
                        >
                            <Stack.Screen
                                name="HomeRoot"
                                component={isSavingsMode ? SavingsTabs : MainTabs}
                                options={{ 
                                    animation: isSavingsMode ? 'slide_from_right' : 'slide_from_left' 
                                }}
                            />

                            {/* Shared Screens available in both modes */}
                            <Stack.Screen name="AddTransaction" component={AddTransactionScreen} />
                            <Stack.Screen name="BarcodeScanner" component={BarcodeScannerScreen} />
                            <Stack.Screen name="DebtScreen" component={DebtScreen} />
                            <Stack.Screen name="SavingsGoalDetail" component={SavingsGoalDetailScreen} />
                            <Stack.Screen name="SavingsTransfer" component={SavingsTransferScreen} />
                            <Stack.Screen name="SavingsTransferHistory" component={SavingsTransferHistoryScreen} />
                            <Stack.Screen name="AddSavingsGoal" component={AddSavingsGoalScreen} />
                            <Stack.Screen name="SavingsGoalSelector" component={SavingsGoalSelectorScreen} />
                            <Stack.Screen name="SavingsArchive" component={SavingsArchiveScreen} />
                            <Stack.Screen name="ShoppingHome" component={ShoppingHomeScreen} />
                            <Stack.Screen name="ShoppingSession" component={ShoppingSessionScreen} />
                            <Stack.Screen name="ShoppingCheckout" component={ShoppingCheckoutScreen} />
                            <Stack.Screen name="ShoppingHistoryDetail" component={ShoppingHistoryDetailScreen} />
                            <Stack.Screen name="ShoppingTemplates" component={ShoppingTemplatesScreen} />
                            <Stack.Screen name="Settings" component={SettingsScreen} />
                            <Stack.Screen name="ManageCategories" component={ManageCategoriesScreen} />
                            <Stack.Screen name="PinSetup" component={PinSetupScreen} />
                            <Stack.Screen name="Sessions" component={SessionManagementScreen} />
                            <Stack.Screen name="CurrencyConverter" component={CurrencyConverterScreen} />
                            <Stack.Screen name="AllServices" component={AllServicesScreen} />
                            <Stack.Screen name="DebtPlanner" component={DebtPlannerScreen} />
                            <Stack.Screen name="Analytics" component={AnalyticsScreen} />
                            <Stack.Screen name="Notifications" component={NotificationsScreen} />
                        </Stack.Navigator>
                    )
                ) : <AuthStack />}
            </View>
        </NavigationContainer>
    );
};

// ── App Lock Overlay ──────────────────────────────────────────────────────────
const AppLockOverlay = () => {
    const { isLocked, biometricEnabled, pinEnabled } = useSecurity();
    const { userToken } = useAuth();
    if (!userToken || (!biometricEnabled && !pinEnabled) || !isLocked) return null;
    return <AppLockScreen />;
};

function App() {
    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <ThemeProvider>
                <AuthProvider>
                    <SecurityProvider>
                        <ErrorBoundary>
                            <GlobalStatusBar />
                            <AppNavigator />
                            <AppLockOverlay />
                            <Toast />
                        </ErrorBoundary>
                    </SecurityProvider>
                </AuthProvider>
            </ThemeProvider>
        </GestureHandlerRootView>
    );
}

export default Sentry.wrap(App);
