import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { spacing, radius } from '../theme/colors';
import BottomSheetModal from './BottomSheetModal';

const SavingsBulkActionSheet = ({ visible, onClose, onAction }) => {
    const COLORS = useTheme(state => state.COLORS);
    const styles = getStyles(COLORS);

    const BulkOption = ({ icon, color, title, subtitle, onPress, isMCI = false }) => (
        <TouchableOpacity 
            style={[styles.option, { backgroundColor: COLORS.background, borderColor: COLORS.border }]} 
            onPress={onPress}
        >
            <View style={[styles.iconBox, { backgroundColor: color + '20' }]}>
                {isMCI ? (
                    <MaterialCommunityIcons name={icon} size={22} color={color} />
                ) : (
                    <Feather name={icon} size={22} color={color} />
                )}
            </View>
            <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: COLORS.text }]}>{title}</Text>
                <Text style={[styles.sub, { color: COLORS.textMuted }]}>{subtitle}</Text>
            </View>
            <Feather name="chevron-right" size={18} color={COLORS.textMuted} />
        </TouchableOpacity>
    );

    return (
        <BottomSheetModal 
            visible={visible} 
            onClose={onClose}
            title="Bulk Savings Actions"
        >
            <View style={styles.header}>
                <View style={styles.handle} />
                <View style={styles.wandBox}>
                    <Feather name="zap" size={24} color="#fff" />
                </View>
                <Text style={[styles.mainTitle, { color: COLORS.text }]}>Savings Magic 🪄</Text>
                <Text style={[styles.tagline, { color: COLORS.textMuted }]}>Manage multiple goals at once</Text>
            </View>

            <View style={styles.list}>
                <BulkOption 
                    icon="layers" 
                    color="#f59e0b" 
                    title="Sweep to Balance" 
                    subtitle="Consolidate all goal funds into Master Pot" 
                    onPress={() => onAction('sweep')} 
                />
                <BulkOption 
                    icon="trending-up" 
                    color="#22c55e" 
                    title="Auto-Fill Goals" 
                    subtitle="Distribute Master Pot balance to all targets" 
                    onPress={() => onAction('distribute')} 
                />
            </View>

            <TouchableOpacity 
                style={[styles.cancel, { backgroundColor: COLORS.background }]} 
                onPress={onClose}
            >
                <Text style={[styles.cancelText, { color: COLORS.text }]}>Close Menu</Text>
            </TouchableOpacity>
        </BottomSheetModal>
    );
};

const getStyles = (COLORS) => StyleSheet.create({
    header: { alignItems: 'center', marginBottom: spacing.xl },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.1)', marginBottom: spacing.lg },
    wandBox: { width: 50, height: 50, borderRadius: 25, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', marginBottom: spacing.md },
    mainTitle: { fontSize: 22, fontWeight: '900', marginBottom: 4 },
    tagline: { fontSize: 13, fontWeight: '600' },
    list: { gap: 12, marginBottom: spacing.xl },
    option: {
        flexDirection: 'row', alignItems: 'center', padding: spacing.lg,
        borderRadius: radius.xl, borderWidth: 1, gap: 16
    },
    iconBox: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
    title: { fontSize: 16, fontWeight: '800', marginBottom: 2 },
    sub: { fontSize: 12, fontWeight: '600' },
    cancel: { width: '100%', paddingVertical: 16, borderRadius: radius.xl, alignItems: 'center' },
    cancelText: { fontWeight: '800', fontSize: 15 },
});

export default SavingsBulkActionSheet;
