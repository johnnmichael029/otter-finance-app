import React, { createContext, useState, useEffect, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

export const AuthContext = createContext();

// ─── API Base URL ─────────────────────────────────────────────────────────────
// __DEV__ = true in Expo dev (local), false in production builds
// Replace the IP with YOUR machine's local IP when testing on a physical device
export const API_BASE = __DEV__
    ? 'http://192.168.100.254:4000/api'
    : 'otter-backend-api-f7ccaagqf9gac0a8.japaneast-01.azurewebsites.net/api';

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [isSplashLoading, setIsSplashLoading] = useState(true);
    const [userToken, setUserToken] = useState(null);
    const [userInfo, setUserInfo] = useState(null);

    useEffect(() => {
        restoreSession();
    }, []);

    // ── Register ──────────────────────────────────────────────────────────────
    const register = async (name, email, password) => {
        setIsLoading(true);
        try {
            const res = await axios.post(`${API_BASE}/auth/register`, {
                name, email, password, source: 'mobile'
            });
            // We now return true and let the screen redirect to Login instead of auto-logging in.
            return { success: true };
        } catch (err) {
            return { success: false, message: err.response?.data?.error || err.message };
        } finally {
            setIsLoading(false);
        }
    };

    // ── Login ─────────────────────────────────────────────────────────────────
    const login = async (email, password) => {
        setIsLoading(true);
        try {
            const res = await axios.post(`${API_BASE}/auth/login`, {
                email, password, source: 'mobile'
            });
            await _persistSession(res.data);
            return { success: true };
        } catch (err) {
            return { success: false, message: err.response?.data?.error || err.message };
        } finally {
            setIsLoading(false);
        }
    };

    // ── Logout ────────────────────────────────────────────────────────────────
    const logout = async () => {
        setIsLoading(true);
        setUserToken(null);
        setUserInfo(null);
        await AsyncStorage.multiRemove(['userInfo', 'userToken']);
        delete axios.defaults.headers.common['Authorization'];
        setIsLoading(false);
    };

    // ── Restore session from storage on app launch ────────────────────────────
    const restoreSession = async () => {
        try {
            setIsSplashLoading(true);
            const [storedInfo, storedToken] = await AsyncStorage.multiGet(['userInfo', 'userToken']);
            const info = storedInfo[1];
            const token = storedToken[1];

            if (info && token) {
                setUserInfo(JSON.parse(info));
                setUserToken(token);
                axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            }
        } catch (err) {
            console.warn('[Auth] Session restore error:', err.message);
        } finally {
            setIsSplashLoading(false);
        }
    };

    // ── Update local user info (after profile edit) ───────────────────────────
    const updateLocalUser = async (updated) => {
        const merged = { ...userInfo, ...updated };
        setUserInfo(merged);
        await AsyncStorage.setItem('userInfo', JSON.stringify(merged));
    };

    // ── Private helper: persist auth data ────────────────────────────────────
    const _persistSession = async ({ token, user }) => {
        setUserInfo(user);
        setUserToken(token);
        await AsyncStorage.setItem('userInfo', JSON.stringify(user));
        await AsyncStorage.setItem('userToken', token);
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    };

    return (
        <AuthContext.Provider value={{
            login, register, logout, updateLocalUser,
            isLoading, isSplashLoading,
            userToken, userInfo,
            API_BASE,
        }}>
            {children}
        </AuthContext.Provider>
    );
};
