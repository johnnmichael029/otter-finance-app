import React from 'react';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import Toast from 'react-native-toast-message';
import { Feather } from '@expo/vector-icons';
import QuickAddSheet from './src/components/QuickAddSheet';
import SavingsQuickAddSheet from './src/components/SavingsQuickAddSheet';

// Contexts
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { SecurityProvider, useSecurity } from './src/context/SecurityContext';

// Auth Screens
import LoginScreen from './src/screens/auth/LoginScreen';
import RegisterScreen from './src/screens/auth/RegisterScreen';
import TwoFAScreen from './src/screens/auth/TwoFAScreen';
import AppLockScreen from './src/screens/auth/AppLockScreen';
import PinSetupScreen from './src/screens/auth/PinSetupScreen';

// Settings
import SettingsScreen from './src/screens/main/SettingsScreen';
import SessionManagementScreen from './src/screens/main/SessionManagementScreen';

// Main Screens
import HomeScreen from './src/screens/main/HomeScreen';
import TransactionsScreen from './src/screens/main/TransactionsScreen';
import RecurringBillsScreen from './src/screens/main/RecurringBillsScreen';
import BudgetScreen from './src/screens/main/BudgetScreen';
import AddTransactionScreen from './src/screens/main/AddTransactionScreen';
import BarcodeScannerScreen from './src/screens/main/BarcodeScannerScreen';
import DebtScreen from './src/screens/main/DebtScreen';

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

import { StatusBar } from 'expo-status-bar';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// ── Wallet Mode Context ────────────────────────────────────────
const WalletModeContext = React.createContext({ isSavingsMode: false, setIsSavingsMode: () => {} });
export const useWalletMode = () => React.useContext(WalletModeContext);

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
    const { setIsSavingsMode } = useWalletMode();
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
                <TouchableOpacity onPress={onPressAdd} activeOpacity={0.85}
                    style={[styles.centerFab, { backgroundColor: COLORS.primary, shadowColor: COLORS.primary }]}>
                    <Feather name="plus" size={28} color="#fff" />
                </TouchableOpacity>
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
    const [sheetVisible, setSheetVisible] = React.useState(false);
    return (
        <View style={{ flex: 1, backgroundColor: COLORS.background }}>
            <Tab.Navigator
                screenOptions={{ headerShown: false }}
                tabBar={(props) => <CustomTabBar {...props} onPressAdd={() => setSheetVisible(true)} />}
            >
                <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Home', tabBarIcon: ({ color }) => <Feather name="home" size={22} color={color} /> }} />
                <Tab.Screen name="Transactions" component={TransactionsScreen} options={{ title: 'Transactions', tabBarIcon: ({ color }) => <Feather name="list" size={22} color={color} /> }} />
                <Tab.Screen name="Bills" component={RecurringBillsScreen} options={{ title: 'Bills', tabBarIcon: ({ color }) => <Feather name="repeat" size={22} color={color} /> }} />
                <Tab.Screen name="Budget" component={BudgetScreen} options={{ title: 'Budget', tabBarIcon: ({ color }) => <Feather name="pie-chart" size={22} color={color} /> }} />
            </Tab.Navigator>
            <QuickAddSheet visible={sheetVisible} onClose={() => setSheetVisible(false)} navigation={navigation} />
        </View>
    );
};

// ── Savings Mode Tabs ──────────────────────────────────────────
const SavingsTabs = ({ navigation: rootNav }) => {
    const { COLORS } = useTheme();
    const { setIsSavingsMode } = useWalletMode();
    const [sheetVisible, setSheetVisible] = React.useState(false);

    return (
        <View style={{ flex: 1, backgroundColor: COLORS.background }}>
            <Tab.Navigator
                screenOptions={{ headerShown: false }}
                tabBar={(props) => <CustomTabBar {...props} onPressAdd={() => setSheetVisible(true)} />}
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
            <SavingsQuickAddSheet visible={sheetVisible} onClose={() => setSheetVisible(false)} navigation={rootNav} />
        </View>
    );
};

const GlobalStatusBar = () => {
    const { isDarkMode } = useTheme();
    return <StatusBar style={isDarkMode ? 'light' : 'dark'} />;
};

const AppNavigator = () => {
    const { userToken, isSplashLoading } = useAuth();
    const { COLORS, isDarkMode } = useTheme();
    const { isSavingsMode } = useWalletMode();

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
        <NavigationContainer theme={navTheme}>
            <View style={{ flex: 1, backgroundColor: COLORS.background }}>
                {userToken ? (
                    <Stack.Navigator
                        key={isSavingsMode ? 'savings-stack' : 'main-stack'}
                        screenOptions={{
                            headerShown: false,
                            contentStyle: { backgroundColor: COLORS.background },
                            animation: 'slide_from_right',
                            animationDuration: 280,
                        }}
                    >
                        {isSavingsMode ? (
                            <Stack.Screen name="SavingsTabs" component={SavingsTabs} />
                        ) : (
                            <Stack.Screen name="MainTabs" component={MainTabs} />
                        )}
                        
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
                        <Stack.Screen name="Settings" component={SettingsScreen} />
                        <Stack.Screen name="PinSetup" component={PinSetupScreen} />
                        <Stack.Screen name="Sessions" component={SessionManagementScreen} />
                    </Stack.Navigator>
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

export default function App() {
    const [isSavingsMode, setIsSavingsMode] = React.useState(false);
    return (
        <ThemeProvider>
            <AuthProvider>
                <SecurityProvider>
                    <WalletModeContext.Provider value={{ isSavingsMode, setIsSavingsMode }}>
                        <GlobalStatusBar />
                        <AppNavigator />
                        <AppLockOverlay />
                        <Toast />
                    </WalletModeContext.Provider>
                </SecurityProvider>
            </AuthProvider>
        </ThemeProvider>
    );
}
