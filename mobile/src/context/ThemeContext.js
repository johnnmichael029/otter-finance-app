import React, { useEffect } from 'react';
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightTheme, darkTheme } from '../theme/colors';

export const useTheme = create((set, get) => ({
    // Wallet Mode (Savings vs Main)
    isSavingsMode: false,
    setIsSavingsMode: (value) => set({ isSavingsMode: value }),

    // Theme Mode
    isDarkMode: false,
    COLORS: lightTheme,
    
    initTheme: async () => {
        const savedTheme = await AsyncStorage.getItem('appTheme');
        const isDark = savedTheme === 'dark';
        set({ isDarkMode: isDark, COLORS: isDark ? darkTheme : lightTheme });
    },
    
    toggleTheme: async () => {
        const newTheme = !get().isDarkMode;
        set({ isDarkMode: newTheme, COLORS: newTheme ? darkTheme : lightTheme });
        await AsyncStorage.setItem('appTheme', newTheme ? 'dark' : 'light');
    }
}));

export const ThemeProvider = ({ children }) => {
    const initTheme = useTheme(state => state.initTheme);

    useEffect(() => {
        initTheme();
    }, [initTheme]);

    return <>{children}</>;
};
