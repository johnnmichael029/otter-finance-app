import React, { useEffect } from 'react';
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { useAuthStore, API_BASE } from '../store/authStore';

export const useAuth = useAuthStore;
export { API_BASE };

export const AuthProvider = ({ children }) => {
    // We get the methods we need for the interceptor
    const restoreSession = useAuthStore(state => state.restoreSession);
    const logout = useAuthStore(state => state.logout);
    const setUserToken = useAuthStore(state => state.setUserToken);

    useEffect(() => {
        // Run once on app mount
        restoreSession();

        let isRefreshing = false;
        let refreshSubscribers = [];

        const onRefreshed = (token) => {
            refreshSubscribers.map(cb => cb(token));
            refreshSubscribers = [];
        };

        const addRefreshSubscriber = (cb) => {
            refreshSubscribers.push(cb);
        };

        // ── Axios Interceptor for Token Refresh ──
        const interceptor = axios.interceptors.response.use(
            (response) => response,
            async (error) => {
                const originalRequest = error.config;
                if (error.response?.status === 401 && !originalRequest._retry && !originalRequest.url.includes('/auth/')) {
                    
                    if (isRefreshing) {
                        return new Promise((resolve) => {
                            addRefreshSubscriber((token) => {
                                originalRequest.headers['Authorization'] = `Bearer ${token}`;
                                resolve(axios(originalRequest));
                            });
                        });
                    }

                    originalRequest._retry = true;
                    isRefreshing = true;
                    
                    try {
                        const refreshToken = await SecureStore.getItemAsync('refreshToken');
                        if (refreshToken) {
                            const res = await axios.post(`${API_BASE}/auth/refresh`, { refreshToken });
                            const newAccess = res.data.accessToken;
                            
                            useAuthStore.setState({ userToken: newAccess });
                            const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
                            await AsyncStorage.setItem('userToken', newAccess);
                            
                            axios.defaults.headers.common['Authorization'] = `Bearer ${newAccess}`;
                            originalRequest.headers['Authorization'] = `Bearer ${newAccess}`;
                            
                            onRefreshed(newAccess);
                            return axios(originalRequest);
                        }
                    } catch (refreshErr) {
                        console.warn('[Auth] Refresh failed, logging out.');
                        refreshSubscribers = [];
                        logout();
                    } finally {
                        isRefreshing = false;
                    }
                }
                return Promise.reject(error);
            }
        );

        return () => axios.interceptors.response.eject(interceptor);
    }, [restoreSession, logout]);

    // Provider is technically just a wrapper for the interceptor lifecycle now
    return <>{children}</>;
};
