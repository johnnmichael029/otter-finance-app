import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

const CustomAlertModal = ({
    visible,
    onClose,
    onConfirm,
    title,
    message,
    type = 'info',
    confirmText = 'Okay',
    cancelText = 'Cancel',
    extraBtnText,
    onExtra,
    children,
    hideButtons = false,
    extraActions, // Array of { label, icon, onPress, danger }
}) => {
    const { COLORS } = useTheme();
    const styles = getStyles(COLORS);

    const getIcon = () => {
        switch (type) {
            case 'success': return { name: 'checkmark-circle', color: '#22c55e' };
            case 'error': return { name: 'close-circle', color: '#ef4444' };
            case 'warning': return { name: 'alert-circle', color: '#f59e0b' };
            case 'confirm': return { name: 'help-circle', color: COLORS.primary };
            default: return { name: 'information-circle', color: '#3b82f6' };
        }
    };

    const icon = getIcon();
    const isConfirm = type === 'confirm';

    return (
        <Modal
            transparent={true}
            visible={visible}
            animationType="fade"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <TouchableOpacity
                    style={StyleSheet.absoluteFill}
                    activeOpacity={1}
                    onPress={onClose}
                />
                <View style={styles.alertBox}>
                    <View style={[styles.iconWrapper, { backgroundColor: icon.color + '20' }]}>
                        <Ionicons name={icon.name} size={40} color={icon.color} />
                    </View>

                    <Text style={styles.title}>{title}</Text>
                    <Text style={[styles.message, children && { marginBottom: 12 }]}>{message}</Text>
                    {children}

                    {/* Extra action buttons (used for wallet long-press menu) */}
                    {extraActions && extraActions.length > 0 && (
                        <View style={styles.extraActionsContainer}>
                            {extraActions.map((action, i) => (
                                <TouchableOpacity
                                    key={i}
                                    style={[styles.extraActionBtn, { borderColor: action.danger ? '#ef4444' : COLORS.border }, i > 0 && { marginTop: 10 }]}
                                    onPress={action.onPress}
                                >
                                    {action.icon && <Feather name={action.icon} size={18} color={action.danger ? '#ef4444' : COLORS.text} style={{ marginRight: 10 }} />}
                                    <Text style={[styles.extraActionText, action.danger && { color: '#ef4444' }]}>{action.label}</Text>
                                </TouchableOpacity>
                            ))}
                            <TouchableOpacity style={[styles.extraActionBtn, { borderColor: COLORS.border, marginTop: 10 }]} onPress={onClose}>
                                <Feather name="x" size={18} color={COLORS.textMuted} style={{ marginRight: 10 }} />
                                <Text style={[styles.extraActionText, { color: COLORS.textMuted }]}>Cancel</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {!hideButtons && !extraActions && (
                        <View style={[styles.actions, extraBtnText && { flexDirection: 'column' }]}>
                            {isConfirm && (
                                <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                                    <Text style={styles.cancelBtnText}>{cancelText}</Text>
                                </TouchableOpacity>
                            )}
                            {extraBtnText && (
                                <TouchableOpacity 
                                    style={[styles.confirmBtn, { backgroundColor: COLORS.border, width: '100%' }]} 
                                    onPress={() => {
                                        if (onExtra) onExtra();
                                        onClose();
                                    }}
                                >
                                    <Text style={[styles.confirmBtnText, { color: COLORS.text }]}>{extraBtnText}</Text>
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity
                                style={[
                                    styles.confirmBtn,
                                    { backgroundColor: isConfirm ? COLORS.primary : icon.color, flex: (isConfirm && !extraBtnText) ? 1 : 0, width: (isConfirm && !extraBtnText) ? 'auto' : '100%' }
                                ]}
                                onPress={() => {
                                    if (onConfirm) onConfirm();
                                    onClose();
                                }}
                            >
                                <Text style={styles.confirmBtnText}>{confirmText}</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            </View>
        </Modal>
    );
};

const getStyles = (COLORS) => StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    alertBox: {
        width: '100%',
        maxWidth: 340,
        backgroundColor: COLORS.surface,
        borderRadius: 28,
        padding: 24,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: COLORS.border,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.2,
        shadowRadius: 24,
        elevation: 20,
    },
    iconWrapper: {
        width: 70,
        height: 70,
        borderRadius: 35,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    title: {
        fontSize: 20,
        fontWeight: '800',
        color: COLORS.text || '#fff',
        marginBottom: 8,
        textAlign: 'center',
    },
    message: {
        fontSize: 14,
        color: COLORS.textMuted || '#94a3b8',
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 20,
    },
    actions: {
        flexDirection: 'row',
        gap: 12,
        width: '100%',
    },
    cancelBtn: {
        flex: 1,
        height: 48,
        borderRadius: 12,
        backgroundColor: COLORS.background,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    confirmBtn: {
        height: 48,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        minWidth: 100,
    },
    cancelBtnText: {
        color: COLORS.text,
        fontWeight: '700',
        fontSize: 15,
    },
    confirmBtnText: {
        color: '#fff',
        fontWeight: '700',
        fontSize: 15,
    },
    extraActionsContainer: {
        width: '100%',
        marginTop: 4,
    },
    extraActionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 13,
        paddingHorizontal: 16,
        borderRadius: 12,
        borderWidth: 1,
    },
    extraActionText: {
        fontSize: 15,
        fontWeight: '700',
        color: '#1f2937',
    },
});

export default CustomAlertModal;
