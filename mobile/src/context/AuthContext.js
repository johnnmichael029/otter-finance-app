import React, { createContext, useState, useEffect, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import axios from 'axios';

export const AuthContext = createContext();

// ─── API Base URL ─────────────────────────────────────────────────────────────
// __DEV__ = true in Expo dev (local), false in production builds
// Replace the IP with YOUR machine's local IP when testing on a physical device
export const API_BASE = __DEV__
    ? 'http://192.168.100.254:4000/api'
    : 'https://otter-backend-api-f7ccaagqf9gac0a8.japaneast-01.azurewebsites.net/api';

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [isSplashLoading, setIsSplashLoading] = useState(true);
    const [userToken, setUserToken] = useState(null);
    const [userInfo, setUserInfo] = useState(null);

    useEffect(() => {
        restoreSession();

        // ── Axios Interceptor for Token Refresh ──
        const interceptor = axios.interceptors.response.use(
            (response) => response,
            async (error) => {
                const originalRequest = error.config;
                // If 401 Unauthorized and we haven't retried yet, and isn't a login/refresh request
                if (error.response?.status === 401 && !originalRequest._retry && !originalRequest.url.includes('/auth/')) {
                    originalRequest._retry = true;
                    try {
                        const refreshToken = await SecureStore.getItemAsync('refreshToken');
                        if (refreshToken) {
                            const res = await axios.post(`${API_BASE}/auth/refresh`, { refreshToken });
                            const newAccess = res.data.accessToken;
                            
                            setUserToken(newAccess);
                            await AsyncStorage.setItem('userToken', newAccess);
                            axios.defaults.headers.common['Authorization'] = `Bearer ${newAccess}`;
                            originalRequest.headers['Authorization'] = `Bearer ${newAccess}`;
                            
                            return axios(originalRequest); // Retry the failed request
                        }
                    } catch (refreshErr) {
                        // Refresh token is expired/invalid too -> Force logout
                        console.warn('[Auth] Refresh failed, logging out.');
                        logout();
                    }
                }
                return Promise.reject(error);
            }
        );

        return () => axios.interceptors.response.eject(interceptor);
    }, []);

    // ── Register ──────────────────────────────────────────────────────────────
    const register = async (name, email, password) => {
        setIsLoading(true);
        try {
            const res = await axios.post(`${API_BASE}/auth/register`, {
                name, email, password, source: 'mobile'
            }, {
                headers: {
                    'X-Platform': Platform.OS,
                    'X-Device-Info': `${Platform.OS === 'ios' ? 'Apple Device' : 'Android Device'}`
                }
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
            }, {
                headers: {
                    'X-Platform': Platform.OS,
                    'X-Device-Info': `${Platform.OS === 'ios' ? 'Apple Device' : 'Android Device'}`
                }
            });

            // ── Handle 2FA Requirement ──────────────────────────────────────────
            if (res.data.requires2FA) {
                return { 
                    success: true, 
                    requires2FA: true, 
                    tempToken: res.data.tempToken,
                    maskedEmail: res.data.maskedEmail
                };
            }

            await _persistSession(res.data);
            return { success: true };
        } catch (err) {
            const errData = err.response?.data;
            
            // ── Handle 2FA Requirement ──────────────────────────────────────────
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
            setIsLoading(false);
        }
    };

    // ── Finalize 2FA Login ────────────────────────────────────────────────────
    const _finalize2FALogin = async (sessionData) => {
        await _persistSession(sessionData);
    };

    // ── Logout ────────────────────────────────────────────────────────────────
    const logout = async () => {
        setIsLoading(true);
        try {
            const refreshToken = await SecureStore.getItemAsync('refreshToken');
            if (refreshToken) {
                await axios.post(`${API_BASE}/auth/logout`, { refreshToken }).catch(() => {});
            }
        } catch (err) {}

        setUserToken(null);
        setUserInfo(null);
        await AsyncStorage.multiRemove(['userInfo', 'userToken']);
        await SecureStore.deleteItemAsync('refreshToken').catch(() => {});
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
    const _persistSession = async ({ accessToken, refreshToken, user }) => {
        setUserInfo(user);
        setUserToken(accessToken);
        await AsyncStorage.setItem('userInfo', JSON.stringify(user));
        await AsyncStorage.setItem('userToken', accessToken);
        if (refreshToken) {
            await SecureStore.setItemAsync('refreshToken', refreshToken).catch(() => {});
        }
        axios.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
    };

    return (
        <AuthContext.Provider value={{
            login, register, logout, updateLocalUser,
            isLoading, isSplashLoading,
            userToken, userInfo,
            _finalize2FALogin,
            API_BASE,
        }}>
            {children}
        </AuthContext.Provider>
    );
};
