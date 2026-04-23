import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightTheme, darkTheme } from '../theme/colors';

export const useUIStore = create((set, get) => ({
    // Wallet Mode
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
