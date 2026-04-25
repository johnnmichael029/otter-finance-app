import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { savePushToken, sendMessage } from '../api/api';

/**
 * Configure how notifications are handled when the app is open
 */
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
    }),
});

/**
 * Setup notification categories for interactive actions (Direct Reply)
 */
export async function setupNotificationCategories() {
    await Notifications.setNotificationCategoryAsync('message-reply', [
        {
            identifier: 'reply',
            buttonTitle: 'Reply',
            textInput: {
                submitButtonTitle: 'Send',
                placeholder: 'Type your reply here...',
            },
            options: {
                opensAppToForeground: false, // Keep app in background
            },
        },
    ]);
}

/**
 * Register for push notifications and save token to backend
 */
export async function registerForPushNotificationsAsync() {
    let token;

    if (Device.isDevice) {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }
        if (finalStatus !== 'granted') {
            console.warn('Failed to get push token for push notification!');
            return;
        }
        
        token = (await Notifications.getExpoPushTokenAsync({
            projectId: '8cd0c75c-bb96-45dd-a056-e4ca09fed34f' // From app.json
        })).data;

        // Save to backend
        try {
            await savePushToken(token);
            console.log('[NOTIF] Push token registered:', token);
        } catch (err) {
            console.error('[NOTIF] Failed to save push token:', err.message);
        }
    }

    if (Platform.OS === 'android') {
        Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#FF231F7C',
        });
    }

    return token;
}

/**
 * Handle notification responses (e.g. clicking "Reply")
 */
export function setupNotificationResponseListener() {
    return Notifications.addNotificationResponseReceivedListener(async response => {
        const { actionIdentifier, userText, notification } = response;
        const { senderId } = notification.request.content.data;

        if (actionIdentifier === 'reply' && userText && senderId) {
            console.log('[NOTIF] Direct reply received:', userText);
            try {
                // Send message directly via API
                await sendMessage(senderId, userText);
                
                // Show a confirmation notification or just let it be
                await Notifications.scheduleNotificationAsync({
                    content: {
                        title: 'Reply Sent',
                        body: `Your message to ${notification.request.content.title} was delivered.`,
                    },
                    trigger: null,
                });
            } catch (err) {
                console.error('[NOTIF] Failed to send direct reply:', err.message);
            }
        }
    });
}
