import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView,
    TextInput, ActivityIndicator, KeyboardAvoidingView, Platform, Modal,
    TouchableWithoutFeedback, Dimensions, Pressable
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { createSavingsGoal, getSavingsGoals } from '../../api/api';
import CustomAlertModal from '../../components/CustomAlertModal';
import { spacing, radius } from '../../theme/colors';

const isIonicon = (name) => name?.includes('-outline') || name?.includes('-sharp');

const IconRenderer = ({ name, family, size, color }) => {
    const hasFamily = family && family !== 'feather';
    const useIonicons = (hasFamily && (family === 'ionicons' || family === 'Ionicons')) || (!hasFamily && isIonicon(name));
    if (useIonicons) {
        return <Ionicons name={name} size={size} color={color} />;
    }
    return <Feather name={name} size={size} color={color} />;
};

const GOAL_ICONS = [
    // Goals & Finance
    { icon: 'target', label: 'Goal' },
    { icon: 'trending-up', label: 'Invest' },
    { icon: 'dollar-sign', label: 'Money' },
    { icon: 'credit-card', label: 'Card' },
    { icon: 'pie-chart', label: 'Budget' },
    { icon: 'bar-chart-2', label: 'Growth' },
    // Home & Property
    { icon: 'home', label: 'House' },
    { icon: 'key', label: 'Property' },
    { icon: 'tool', label: 'Repairs' },
    // Devices
    { icon: 'smartphone', label: 'Phone' },
    { icon: 'monitor', label: 'Gadget' },
    { icon: 'tablet', label: 'Tablet' },
    { icon: 'headphones', label: 'Audio' },
    { icon: 'camera', label: 'Camera' },
    { icon: 'tv', label: 'TV' },
    // Work & Education
    { icon: 'briefcase', label: 'Business' },
    { icon: 'book', label: 'Education' },
    { icon: 'award', label: 'Course' },
    { icon: 'pen-tool', label: 'Skills' },
    { icon: 'code', label: 'Tech' },
    // Health & Lifestyle
    { icon: 'heart', label: 'Health' },
    { icon: 'activity', label: 'Fitness' },
    { icon: 'coffee', label: 'Coffee' },
    { icon: 'shopping-bag', label: 'Shopping' },
    { icon: 'scissors', label: 'Beauty' },
    // Travel & Fun
    { icon: 'globe', label: 'Travel' },
    { icon: 'airplane-outline', family: 'ionicons', label: 'Travel' },
    { icon: 'map-pin', label: 'Vacation' },
    { icon: 'compass', label: 'Adventure' },
    { icon: 'music', label: 'Events' },
    { icon: 'film', label: 'Movies' },
    // Other
    { icon: 'gift', label: 'Gift' },
    { icon: 'navigation', label: 'Vehicle' },
    { icon: 'truck', label: 'Delivery' },
    { icon: 'umbrella', label: 'Emergency' },
    { icon: 'sun', label: 'Summer' },
    { icon: 'star', label: 'Dream' },
    { icon: 'zap', label: 'Quick' },
    { icon: 'box', label: 'Storage' },
];

const PRESET_COLORS = [
    '#E91E8C', '#3b82f6', '#22c55e', '#f59e0b',
    '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899',
    '#f97316', '#14b8a6', '#a855f7', '#84cc16',
];

const EXTENDED_COLORS = [
    '#E91E8C', '#B0146A', '#f43f5e', '#ef4444', '#f97316', '#f59e0b', '#fbbf24', '#eab308',
    '#84cc16', '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#2563eb',
    '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f472b6', '#64748b', '#475569'
];

const isValidHex = (hex) => /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(hex);

export default function AddSavingsGoalScreen({ navigation }) {
    const { COLORS } = useTheme();
    const styles = getStyles(COLORS);

    const [name, setName] = useState('');
    const [targetAmount, setTargetAmount] = useState('');
    const [deadline, setDeadline] = useState(null);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [note, setNote] = useState('');
    const [selectedIcon, setSelectedIcon] = useState({ name: 'target', family: 'feather' });
    const [selectedColor, setSelectedColor] = useState('#E91E8C');
    const [saving, setSaving] = useState(false);
    const [alert, setAlert] = useState({ visible: false, type: 'info', title: '', message: '' });
    const [suggestions, setSuggestions] = useState([]);

    useEffect(() => {
        const fetchSuggestions = async () => {
            try {
                const res = await getSavingsGoals();
                const completed = (res.goals || [])
                    .filter(g => g.isCompleted)
                    .map(g => g.name);
                // Unique common names + completed ones
                const defaults = ['Emergency Fund', 'New Phone', 'Vacation', 'Car', 'Christmas Fund'];
                const unique = [...new Set([...defaults, ...completed])];
                setSuggestions(unique.slice(0, 10));
            } catch (e) {}
        };
        fetchSuggestions();
    }, []);

    // Icon section state
    const [showAllIcons, setShowAllIcons] = useState(false);

    // Custom color picker state
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [customColorInput, setCustomColorInput] = useState('');

    const showAlert = (type, title, message) => setAlert({ visible: true, type, title, message });
    const closeAlert = () => setAlert(a => ({ ...a, visible: false }));

    const handleApplyCustomColor = (color) => {
        setSelectedColor(color);
        setShowColorPicker(false);
    };

    const handleManualColorSubmit = () => {
        const hex = customColorInput.startsWith('#') ? customColorInput : `#${customColorInput}`;
        if (isValidHex(hex)) {
            handleApplyCustomColor(hex);
            setCustomColorInput('');
        } else {
            showAlert('warning', 'Invalid Color', 'Please enter a valid hex color code.');
        }
    };

    const handleSave = async () => {
        if (!name.trim()) return showAlert('warning', 'Missing Name', 'Please give your goal a name.');
        const target = parseFloat(targetAmount);
        if (!targetAmount || isNaN(target) || target <= 0) return showAlert('warning', 'Invalid Amount', 'Please enter a valid target amount.');

        let deadlineDate = deadline ? deadline.toISOString() : null;

        setSaving(true);
        try {
            await createSavingsGoal({
                name: name.trim(),
                targetAmount: target,
                icon: selectedIcon.name,
                family: selectedIcon.family || 'feather',
                color: selectedColor,
                deadline: deadlineDate,
                note: note.trim(),
            });
            showAlert('success', 'Goal Created! 🎯', `"${name}" has been added.`);
        } catch (err) {
            showAlert('error', 'Failed', err?.response?.data?.error || 'Could not create goal.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <SafeAreaView style={styles.safe}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

                    {/* Header */}
                    <View style={styles.header}>
                        <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backBtn, { backgroundColor: COLORS.surface }]}>
                            <Feather name="arrow-left" size={20} color={COLORS.text} />
                        </TouchableOpacity>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.headerTitle, { color: COLORS.text }]}>New Savings Goal</Text>
                            <Text style={[styles.headerSub, { color: COLORS.textMuted }]}>Set a target and start saving</Text>
                        </View>
                    </View>

                    {/* Preview Area */}
                    <View style={styles.previewContainer}>
                        <View style={[styles.previewCircle, { backgroundColor: selectedColor + '15', borderColor: selectedColor + '30' }]}>
                            <IconRenderer
                                name={selectedIcon.name}
                                family={selectedIcon.family}
                                size={40}
                                color={selectedColor}
                            />
                        </View>
                        <Text style={[styles.previewName, { color: COLORS.text }]}>{name || 'My New Goal'}</Text>
                    </View>

                    {/* Name */}
                    <Text style={[styles.label, { color: COLORS.textMuted }]}>GOAL NAME</Text>
                    <View style={[styles.inputContainer, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
                        <TextInput
                            style={[styles.input, { color: COLORS.text }]}
                            value={name}
                            onChangeText={setName}
                            placeholder="e.g. Travel Fund"
                            placeholderTextColor={COLORS.textMuted}
                        />
                    </View>

                    {/* Suggestions Chips */}
                    <View style={{ marginBottom: spacing.md }}>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.suggestionList}
                        >
                            {suggestions.map(s => (
                                <TouchableOpacity
                                    key={s}
                                    onPress={() => setName(s)}
                                    style={[
                                        styles.suggestionChip,
                                        {
                                            backgroundColor: name === s ? COLORS.primary + '20' : COLORS.surface,
                                            borderColor: name === s ? COLORS.primary : COLORS.border
                                        }
                                    ]}
                                >
                                    <Text style={[
                                        styles.suggestionText,
                                        { color: name === s ? COLORS.primary : COLORS.textMuted }
                                    ]}>
                                        {s}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>

                    {/* Amount */}
                    <Text style={[styles.label, { color: COLORS.textMuted }]}>TARGET AMOUNT (₱)</Text>
                    <View style={[styles.inputContainer, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
                        <Text style={[styles.currencyPrefix, { color: selectedColor }]}>₱</Text>
                        <TextInput
                            style={[styles.input, { color: COLORS.text }]}
                            value={targetAmount}
                            onChangeText={setTargetAmount}
                            placeholder="0.00"
                            placeholderTextColor={COLORS.textMuted}
                            keyboardType="decimal-pad"
                        />
                    </View>

                    {/* Deadline */}
                    <Text style={[styles.label, { color: COLORS.textMuted }]}>DEADLINE (OPTIONAL)</Text>
                    <TouchableOpacity
                        onPress={() => setShowDatePicker(true)}
                        style={[styles.inputContainer, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
                    >
                        <Feather name="calendar" size={16} color={COLORS.textMuted} style={{ marginRight: 8 }} />
                        <Text style={{ color: deadline ? COLORS.text : COLORS.textMuted, fontSize: 16, fontWeight: '600', flex: 1 }}>
                            {deadline ? deadline.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'No deadline set'}
                        </Text>
                        {deadline && (
                            <TouchableOpacity onPress={() => setDeadline(null)} style={{ padding: 4 }}>
                                <Feather name="x" size={16} color={COLORS.textMuted} />
                            </TouchableOpacity>
                        )}
                    </TouchableOpacity>

                    {showDatePicker && (
                        <DateTimePicker
                            value={deadline || new Date()}
                            mode="date"
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            minimumDate={new Date()}
                            onChange={(event, selectedDate) => {
                                setShowDatePicker(Platform.OS === 'ios');
                                if (selectedDate) setDeadline(selectedDate);
                            }}
                        />
                    )}

                    {/* Icon Picker */}
                    <View style={styles.sectionHeader}>
                        <Text style={[styles.label, { color: COLORS.textMuted, marginTop: 0 }]}>ICON</Text>
                        <TouchableOpacity onPress={() => setShowAllIcons(!showAllIcons)}>
                            <Text style={[styles.seeAllText, { color: COLORS.primary }]}>{showAllIcons ? 'See Less' : 'See All'}</Text>
                        </TouchableOpacity>
                    </View>

                    {showAllIcons ? (
                        <View style={styles.iconGrid}>
                            {GOAL_ICONS.map((item) => (
                                <TouchableOpacity
                                    key={item.icon}
                                    onPress={() => setSelectedIcon({ name: item.icon, family: item.family || 'feather' })}
                                    style={[styles.iconCard, {
                                        backgroundColor: selectedIcon.name === item.icon ? selectedColor + '20' : COLORS.surface,
                                        borderColor: selectedIcon.name === item.icon ? selectedColor : COLORS.border,
                                        width: (windowWidth - spacing.lg * 2 - 24) / 4, // Exactly 4 items per row
                                    }]}
                                >
                                    <View style={styles.iconCircle}>
                                        <IconRenderer
                                            name={item.icon}
                                            family={item.family || 'feather'}
                                            size={22}
                                            color={selectedIcon.name === item.icon ? selectedColor : COLORS.textMuted}
                                        />
                                    </View>
                                    <Text style={[styles.iconLabel, { color: selectedIcon.name === item.icon ? selectedColor : COLORS.textMuted }]} numberOfLines={1}>
                                        {item.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    ) : (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalIcons}>
                            {GOAL_ICONS.slice(0, 10).map((item) => (
                                <TouchableOpacity
                                    key={item.icon}
                                    onPress={() => setSelectedIcon({ name: item.icon, family: item.family || 'feather' })}
                                    style={[styles.iconCard, {
                                        backgroundColor: selectedIcon.name === item.icon ? selectedColor + '20' : COLORS.surface,
                                        borderColor: selectedIcon.name === item.icon ? selectedColor : COLORS.border,
                                    }]}
                                >
                                    <View style={styles.iconCircle}>
                                        <IconRenderer
                                            name={item.icon}
                                            family={item.family || 'feather'}
                                            size={22}
                                            color={selectedIcon.name === item.icon ? selectedColor : COLORS.textMuted}
                                        />
                                    </View>
                                    <Text style={[styles.iconLabel, { color: selectedIcon.name === item.icon ? selectedColor : COLORS.textMuted }]} numberOfLines={1}>
                                        {item.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    )}

                    {/* Color Picker */}
                    <Text style={[styles.label, { color: COLORS.textMuted }]}>COLOR</Text>
                    <View style={styles.colorRow}>
                        {PRESET_COLORS.map(color => (
                            <TouchableOpacity
                                key={color}
                                onPress={() => setSelectedColor(color)}
                                style={[styles.colorCircle, { backgroundColor: color }]}
                            >
                                {selectedColor === color && <Feather name="check" size={16} color="#fff" />}
                            </TouchableOpacity>
                        ))}
                        <TouchableOpacity
                            onPress={() => setShowColorPicker(true)}
                            style={[styles.colorCircle, { backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: COLORS.border, borderStyle: 'dashed' }]}
                        >
                            <Feather name="plus" size={18} color={COLORS.textMuted} />
                        </TouchableOpacity>
                    </View>

                    {/* Submit */}
                    <TouchableOpacity
                        onPress={handleSave}
                        disabled={saving}
                        style={[styles.submitBtn, { backgroundColor: selectedColor }]}
                        activeOpacity={0.8}
                    >
                        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Create Savings Goal</Text>}
                    </TouchableOpacity>

                </ScrollView>
            </KeyboardAvoidingView>

            {/* Custom Color Picker Modal */}
            <Modal visible={showColorPicker} transparent animationType="slide">
                <TouchableWithoutFeedback onPress={() => setShowColorPicker(false)}>
                    <View style={styles.modalOverlay}>
                        <TouchableWithoutFeedback>
                            <View style={[styles.pickerContent, { backgroundColor: COLORS.surface }]}>
                                <View style={styles.pickerHeader}>
                                    <Text style={[styles.pickerTitle, { color: COLORS.text }]}>Choose Color</Text>
                                    <TouchableOpacity onPress={() => setShowColorPicker(false)}>
                                        <Feather name="x" size={24} color={COLORS.textMuted} />
                                    </TouchableOpacity>
                                </View>

                                <Text style={[styles.pickerSub, { color: COLORS.textMuted }]}>Select a preset color or enter a hex code</Text>

                                <View style={styles.extendedColorGrid}>
                                    {EXTENDED_COLORS.map(color => (
                                        <TouchableOpacity
                                            key={color}
                                            onPress={() => handleApplyCustomColor(color)}
                                            style={[styles.gridColorCircle, { backgroundColor: color }]}
                                        >
                                            {selectedColor === color && <Feather name="check" size={14} color="#fff" />}
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                <View style={[styles.hexInputCard, { backgroundColor: COLORS.background, borderColor: COLORS.border }]}>
                                    <Text style={[styles.hexPound, { color: COLORS.textMuted }]}>#</Text>
                                    <TextInput
                                        style={[styles.hexInput, { color: COLORS.text }]}
                                        value={customColorInput}
                                        onChangeText={setCustomColorInput}
                                        placeholder="FFFFFF"
                                        placeholderTextColor={COLORS.textMuted}
                                        maxLength={6}
                                        autoCapitalize="characters"
                                    />
                                    <TouchableOpacity
                                        onPress={handleManualColorSubmit}
                                        style={[styles.applyBtn, { backgroundColor: selectedColor }]}
                                    >
                                        <Text style={styles.applyBtnText}>Apply</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </TouchableWithoutFeedback>
                    </View>
                </TouchableWithoutFeedback>
            </Modal>

            <CustomAlertModal
                visible={alert.visible}
                onClose={closeAlert}
                onConfirm={() => { closeAlert(); if (alert.type === 'success') navigation.goBack(); }}
                title={alert.title}
                message={alert.message}
                type={alert.type}
            />
        </SafeAreaView>
    );
}

const windowWidth = Dimensions.get('window').width;

const getStyles = (COLORS) => StyleSheet.create({
    safe: { flex: 1, backgroundColor: COLORS.background },
    content: { padding: spacing.lg, paddingBottom: 60 },
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xl },
    backBtn: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: spacing.md },
    headerTitle: { fontSize: 22, fontWeight: '800' },
    headerSub: { fontSize: 13, marginTop: 2 },
    previewContainer: { alignItems: 'center', marginBottom: spacing.xl },
    previewCircle: { width: 90, height: 90, borderRadius: 45, borderWidth: 2, justifyContent: 'center', alignItems: 'center', marginBottom: spacing.md },
    previewName: { fontSize: 20, fontWeight: '800' },
    label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 8, marginTop: spacing.lg },
    inputContainer: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.lg, borderWidth: 1.5, paddingHorizontal: spacing.md, height: 56 },
    input: { flex: 1, fontSize: 16, fontWeight: '600' },
    currencyPrefix: { fontSize: 20, fontWeight: '800', marginRight: 8 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.lg, marginBottom: 8 },
    seeAllText: { fontSize: 13, fontWeight: '700' },
    horizontalIcons: { gap: 12, paddingRight: spacing.lg, paddingBottom: 4 },
    iconCard: {
        width: 78, height: 78, borderRadius: 18, borderWidth: 1.5,
        justifyContent: 'center', alignItems: 'center'
    },
    iconCircle: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
    iconLabel: { fontSize: 10, fontWeight: '700', textAlign: 'center', paddingHorizontal: 2 },
    iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-start' },
    colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    colorCircle: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
    submitBtn: { height: 60, borderRadius: radius.xl, justifyContent: 'center', alignItems: 'center', marginTop: spacing.xxl },
    submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    pickerContent: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.xl, paddingBottom: spacing.xxl },
    pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
    pickerTitle: { fontSize: 20, fontWeight: '800' },
    pickerSub: { fontSize: 14, marginBottom: spacing.lg },
    extendedColorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: spacing.xl },
    gridColorCircle: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
    hexInputCard: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.lg, borderWidth: 1.5, padding: 8 },
    hexPound: { fontSize: 18, fontWeight: '800', marginLeft: 8 },
    hexInputText: { flex: 1, fontSize: 16, fontWeight: '700', marginLeft: 4 },
    applyBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: radius.md },
    applyBtnText: { color: '#fff', fontWeight: '800' },
    // Suggestions
    suggestionList: { gap: 8, marginTop: 4, paddingRight: spacing.lg },
    suggestionChip: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1.5,
        justifyContent: 'center',
        alignItems: 'center',
    },
    suggestionText: { fontSize: 12, fontWeight: '800' },
});
