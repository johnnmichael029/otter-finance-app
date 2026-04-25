import React, { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
    registerForPushNotificationsAsync, 
    setupNotificationCategories, 
    setupNotificationResponseListener 
} from '../utils/notifications';

/**
 * Global component to handle Push Notification setup and listeners
 */
export default function NotificationManager() {
    const { userToken } = useAuth();

    useEffect(() => {
        // Setup categories once on mount
        setupNotificationCategories();
    }, []);

    useEffect(() => {
        if (!userToken) return;

        // Register token whenever user is logged in
        registerForPushNotificationsAsync();

        // Listen for responses (clicks/replies)
        const listener = setupNotificationResponseListener();

        return () => {
            if (listener) listener.remove();
        };
    }, [userToken]);

    return null;
}
