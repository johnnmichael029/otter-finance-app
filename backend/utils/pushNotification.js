const axios = require('axios');

/**
 * Sends a push notification to an Expo push token.
 * Uses the Expo Push API directly (no SDK needed on server).
 * @param {string} pushToken - Expo push token (ExponentPushToken[...])
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {object} data - Optional extra data passed to the app
 */
const sendPushNotification = async (pushToken, title, body, data = {}) => {
    if (!pushToken || !pushToken.startsWith('ExponentPushToken')) return;

    try {
        await axios.post('https://exp.host/--/api/v2/push/send', {
            to: pushToken,
            sound: 'default',
            title,
            body,
            data,
            priority: 'high',
            channelId: 'default',
        }, {
            headers: {
                'Accept': 'application/json',
                'Accept-Encoding': 'gzip, deflate',
                'Content-Type': 'application/json',
            }
        });
    } catch (err) {
        // Non-critical: log but don't crash the request
        console.warn('[PushNotification] Failed to send:', err.message);
    }
};

module.exports = { sendPushNotification };
