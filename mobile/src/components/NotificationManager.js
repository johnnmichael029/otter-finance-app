import React, { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import * as Notifications from 'expo-notifications';
import { 
    setupNotificationCategories, 
    registerForPushNotificationsAsync, 
    setupNotificationResponseListener 
} from '../utils/notifications';

export default function NotificationManager() {
    const { userToken } = useAuth();

    useEffect(() => {
        if (!userToken) return;

        let responseListener;
        let foregroundListener;

        const initNotifications = async () => {
            try {
                await setupNotificationCategories();
                await registerForPushNotificationsAsync();
            } catch (error) {
                console.warn('[NotificationManager] Init error:', error);
            }
        };

        initNotifications();

        responseListener = setupNotificationResponseListener();

        foregroundListener = Notifications.addNotificationReceivedListener(notification => {
            console.log('[NotificationManager] Foreground notification received');
        });

        return () => {
            responseListener?.remove?.();
            foregroundListener?.remove?.();
        };
    }, [userToken]);

    return null;
}
