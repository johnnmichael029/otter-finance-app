import * as Haptics from 'expo-haptics';

/**
 * OTTER — Haptic Feedback Utility
 * Only triggers if haptics are enabled in the user's global settings.
 */
export const triggerHaptic = (hapticsEnabled, type = 'impactLight') => {
    if (!hapticsEnabled) return;

    switch (type) {
        case 'impactLight':
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            break;
        case 'impactMedium':
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            break;
        case 'impactHeavy':
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            break;
        case 'notificationSuccess':
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            break;
        case 'notificationWarning':
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            break;
        case 'notificationError':
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            break;
        case 'selection':
            Haptics.selectionAsync();
            break;
        default:
            Haptics.selectionAsync();
    }
};
