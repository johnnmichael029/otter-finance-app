import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import axios from 'axios';

// ─── API Base URL ─────────────────────────────────────────────────────────────
export const API_BASE = __DEV__
    ? 'http://192.168.100.254:4000/api'
    : 'https://otter-backend-api-f7ccaagqf9gac0a8.japaneast-01.azurewebsites.net/api';

export const useAuthStore = create((set, get) => ({
    isLoading: false,
    isSplashLoading: true,
    userToken: null,
    userInfo: null,
    hapticsEnabled: true,
    savingsFabStyle: 'fab',

    // ── Actions ──
    setIsLoading: (val) => set({ isLoading: val }),
    setUserInfo: (info) => set({ userInfo: info }),
    
    toggleHaptics: async () => {
        const newVal = !get().hapticsEnabled;
        set({ hapticsEnabled: newVal });
        await AsyncStorage.setItem('hapticsEnabled', newVal.toString());
    },

    toggleSavingsFabStyle: async () => {
        const newVal = get().savingsFabStyle === 'fab' ? 'modal' : 'fab';
        set({ savingsFabStyle: newVal });
        await AsyncStorage.setItem('savingsFabStyle', newVal);
    },

    updateLocalUser: async (updated) => {
        const merged = { ...get().userInfo, ...updated };
        set({ userInfo: merged });
        await AsyncStorage.setItem('userInfo', JSON.stringify(merged));
    },

    _persistSession: async ({ accessToken, refreshToken, user }) => {
        set({ userInfo: user, userToken: accessToken });
        await AsyncStorage.setItem('userInfo', JSON.stringify(user));
        await AsyncStorage.setItem('userToken', accessToken);
        if (refreshToken) {
            await SecureStore.setItemAsync('refreshToken', refreshToken).catch(() => {});
        }
        axios.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
    },

    _finalize2FALogin: async (sessionData) => {
        await get()._persistSession(sessionData);
    },

    restoreSession: async () => {
        try {
            set({ isSplashLoading: true });
            const [storedInfo, storedToken] = await AsyncStorage.multiGet(['userInfo', 'userToken']);
            const info = storedInfo[1];
            const token = storedToken[1];

            if (info && token) {
                set({ userInfo: JSON.parse(info), userToken: token });
                axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            }

            const storedHaptics = await AsyncStorage.getItem('hapticsEnabled');
            if (storedHaptics !== null) {
                set({ hapticsEnabled: storedHaptics === 'true' });
            }

            const storedFabStyle = await AsyncStorage.getItem('savingsFabStyle');
            if (storedFabStyle !== null) {
                set({ savingsFabStyle: storedFabStyle });
            }
        } catch (err) {
            console.warn('[Auth] Session restore error:', err.message);
        } finally {
            set({ isSplashLoading: false });
        }
    },

    register: async (name, email, password) => {
        set({ isLoading: true });
        try {
            await axios.post(`${API_BASE}/auth/register`, {
                name, email, password, source: 'mobile'
            }, {
                headers: {
                    'X-Platform': Platform.OS,
                    'X-Device-Info': `${Platform.OS === 'ios' ? 'Apple Device' : 'Android Device'}`
                }
            });
            return { success: true };
        } catch (err) {
            return { success: false, message: err.response?.data?.error || err.message };
        } finally {
            set({ isLoading: false });
        }
    },

    login: async (email, password) => {
        set({ isLoading: true });
        try {
            const res = await axios.post(`${API_BASE}/auth/login`, {
                email, password, source: 'mobile'
            }, {
                headers: {
                    'X-Platform': Platform.OS,
                    'X-Device-Info': `${Platform.OS === 'ios' ? 'Apple Device' : 'Android Device'}`
                }
            });

            if (res.data.requires2FA) {
                return { 
                    success: true, 
                    requires2FA: true, 
                    tempToken: res.data.tempToken,
                    maskedEmail: res.data.maskedEmail
                };
            }

            await get()._persistSession(res.data);
            return { success: true };
        } catch (err) {
            const errData = err.response?.data;
            if (err.response?.status === 200 || errData?.requires2FA) {
                return { 
                    success: true, 
                    requires2FA: true, 
                    tempToken: errData.tempToken,
                    maskedEmail: errData.maskedEmail
                };
            }
            return {
                success:     false,
                message:     errData?.error    || err.message,
                lockedUntil: errData?.lockedUntil  || null,
                remainingMs: errData?.remainingMs  || null,
            };
        } finally {
            set({ isLoading: false });
        }
    },

    socialLogin: async (provider, idToken) => {
        set({ isLoading: true });
        try {
            const endpoint = provider === 'google' ? '/auth/google' : '/auth/facebook';
            const res = await axios.post(`${API_BASE}${endpoint}`, {
                idToken, source: 'mobile'
            }, {
                headers: {
                    'X-Platform': Platform.OS,
                    'X-Device-Info': `${Platform.OS === 'ios' ? 'Apple Device' : 'Android Device'}`
                }
            });

            await get()._persistSession(res.data);
            
            // If the backend says isNewUser, or the user profile says they aren't onboarded yet
            return { 
                success: true, 
                isNewUser: res.data.isNewUser || !res.data.user?.isOnboarded 
            };
        } catch (err) {
            return { success: false, message: err.response?.data?.error || err.message };
        } finally {
            set({ isLoading: false });
        }
    },

    updateLocalUser: async (userData) => {
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        const current = get().userInfo || {};
        const updatedUser = { ...current, ...userData };
        set({ userInfo: updatedUser });
        await AsyncStorage.setItem('userInfo', JSON.stringify(updatedUser));
    },

    _finalize2FALogin: async (data) => {
        set({ isLoading: true });
        try {
            await get()._persistSession(data);
        } catch (err) {
            console.error('Finalize 2FA error', err);
        } finally {
            set({ isLoading: false });
        }
    },

    _persistSession: async (data) => {
        const { accessToken, refreshToken, user } = data;
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;

        await SecureStore.setItemAsync('refreshToken', refreshToken);
        await AsyncStorage.setItem('userToken', accessToken);
        await AsyncStorage.setItem('userInfo', JSON.stringify(user));

        axios.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;

        set({ userToken: accessToken, userInfo: user });
    },

    logout: async () => {
        set({ isLoading: true });
        try {
            const refreshToken = await SecureStore.getItemAsync('refreshToken');
            if (refreshToken) {
                await axios.post(`${API_BASE}/auth/logout`, { refreshToken }).catch(() => {});
            }
        } catch (err) {}

        set({ userToken: null, userInfo: null });
        await AsyncStorage.multiRemove(['userInfo', 'userToken']);
        await SecureStore.deleteItemAsync('refreshToken').catch(() => {});
        delete axios.defaults.headers.common['Authorization'];
        set({ isLoading: false });
    }
}));
