const { getSentryExpoConfig } = require('@sentry/react-native/metro');

// This wraps the default Expo Metro config with Sentry config
const config = getSentryExpoConfig(__dirname);

module.exports = config;
