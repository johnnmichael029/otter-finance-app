import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, Modal, TouchableOpacity,
    TextInput, KeyboardAvoidingView, Platform, ScrollView,
    ActivityIndicator, Animated, Dimensions, TouchableWithoutFeedback
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useFinanceStore } from '../../store/financeStore';
import * as api from '../../api/api';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function EditWalletModal({ visible, wallet, onClose }) {
    const { COLORS } = useTheme();
    const { fetchWallets } = useFinanceStore();

    const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const [modalVisible, setModalVisible] = useState(false);
    const [loading, setLoading] = useState(false);

    const [name, setName] = useState('');
    const [balance, setBalance] = useState('');

    useEffect(() => {
        if (wallet) {
            setName(wallet.name || '');
            setBalance(String(wallet.balance ?? ''));
        }
    }, [wallet]);

    useEffect(() => {
        if (visible) {
            setModalVisible(true);
            slideAnim.setValue(SCREEN_HEIGHT);
            fadeAnim.setValue(0);
            Animated.parallel([
                Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
                Animated.spring(slideAnim, { toValue: 0, tension: 65, friction: 11, useNativeDriver: true }),
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
                Animated.timing(slideAnim, { toValue: SCREEN_HEIGHT, duration: 220, useNativeDriver: true }),
            ]).start(() => setModalVisible(false));
        }
    }, [visible]);

    const handleSave = async () => {
        if (!name.trim()) return;
        setLoading(true);
        try {
            await api.updateWallet(wallet._id, {
                name: name.trim(),
                balance: parseFloat(balance) || 0,
                type: wallet.type,
                color: wallet.color,
            });
            // Socket will auto-refresh the store state
            onClose();
        } catch (e) {
            console.warn('Update wallet failed', e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal visible={modalVisible} animationType="none" transparent statusBarTranslucent>
            <TouchableWithoutFeedback onPress={onClose}>
                <Animated.View style={[styles.overlay, { opacity: fadeAnim }]} />
            </TouchableWithoutFeedback>

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
                <Animated.View style={[styles.sheet, { backgroundColor: COLORS.background, transform: [{ translateY: slideAnim }] }]}>
                    <View style={styles.handle} />

                    <View style={styles.header}>
                        <Text style={[styles.title, { color: COLORS.text }]}>Edit Wallet</Text>
                        <TouchableOpacity onPress={onClose}>
                            <Feather name="x" size={22} color={COLORS.text} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false}>
                        <View style={styles.inputGroup}>
                            <Text style={[styles.label, { color: COLORS.textMuted }]}>WALLET NAME</Text>
                            <TextInput
                                style={[styles.input, { backgroundColor: COLORS.inputBackground, color: COLORS.text, borderColor: COLORS.inputBorder }]}
                                value={name}
                                onChangeText={setName}
                                placeholder="Wallet name"
                                placeholderTextColor={COLORS.textMuted}
                            />
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={[styles.label, { color: COLORS.textMuted }]}>CURRENT BALANCE</Text>
                            <TextInput
                                style={[styles.input, styles.balanceInput, { backgroundColor: COLORS.inputBackground, color: COLORS.text, borderColor: COLORS.inputBorder }]}
                                value={balance}
                                onChangeText={setBalance}
                                placeholder="0.00"
                                placeholderTextColor={COLORS.textMuted}
                                keyboardType="numeric"
                            />
                        </View>

                        <TouchableOpacity
                            style={[styles.saveBtn, { backgroundColor: COLORS.primary }]}
                            onPress={handleSave}
                            disabled={loading}
                        >
                            {loading
                                ? <ActivityIndicator color="#fff" />
                                : <Text style={styles.saveBtnText}>Save Changes</Text>
                            }
                        </TouchableOpacity>
                    </ScrollView>
                </Animated.View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
    container: { flex: 1, justifyContent: 'flex-end' },
    sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 44, maxHeight: '70%' },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#ccc', alignSelf: 'center', marginBottom: 16 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
    title: { fontSize: 20, fontWeight: '800' },
    inputGroup: { marginBottom: 20 },
    label: { fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 8 },
    input: { borderWidth: 1, borderRadius: 16, padding: 16, fontSize: 16 },
    balanceInput: { fontSize: 24, fontWeight: '700' },
    saveBtn: { padding: 18, borderRadius: 20, alignItems: 'center', marginTop: 4 },
    saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' }
});
