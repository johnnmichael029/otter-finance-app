import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, FlatList,
    ActivityIndicator, RefreshControl, TextInput, KeyboardAvoidingView, Platform, ScrollView, Animated as RNAnimated
} from 'react-native';
import Animated, { ZoomIn, ZoomOut, Layout } from 'react-native-reanimated';
import { Swipeable } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons, Ionicons, AntDesign, FontAwesome5 } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { getCategories, createCategory, updateCategory, deleteCategory } from '../../api/api';
import { spacing, radius, shadow } from '../../theme/colors';
import BottomSheetModal from '../../components/BottomSheetModal';
import CustomAlertModal from '../../components/CustomAlertModal';
import Skeleton from '../../components/Skeleton';
import { IconRenderer, FALLBACK_ICONS } from '../../utils/formatters';

// Use global FALLBACK_ICONS instead of local ICONS array
const ICONS = FALLBACK_ICONS;


const COLORS_PALETTE = [
    '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e', '#10b981', '#14b8a6', '#06b6d4',
    '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e',
    '#64748b', '#78716c'
];

export default function ManageCategoriesScreen({ navigation }) {
    const COLORS = useTheme(state => state.COLORS);
    const styles = getStyles(COLORS);

    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState('expense'); // 'income' or 'expense'

    // Form State
    const [modalVisible, setModalVisible] = useState(false);
    const [saving, setSaving] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState({ name: '', icon: 'coffee', color: '#f59e0b' });
    const [showAllIcons, setShowAllIcons] = useState(false);

    // Alert State
    const [alertConfig, setAlertConfig] = useState({ visible: false, title: '', message: '', type: 'info', onConfirm: null });

    const loadData = useCallback(async () => {
        try {
            setRefreshing(true);
            const res = await getCategories();
            setCategories(res.categories || []);
        } catch (error) {
            console.error('[Categories] Load error:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const openCreateModal = () => {
        setEditingId(null);
        setForm({ name: '', icon: activeTab === 'income' ? 'briefcase' : 'coffee', color: COLORS_PALETTE[Math.floor(Math.random() * COLORS_PALETTE.length)] });
        setShowAllIcons(false);
        setModalVisible(true);
    };

    const openEditModal = (cat) => {
        setEditingId(cat._id);
        setForm({ name: cat.name, icon: cat.icon, color: cat.color });
        setShowAllIcons(ICONS.indexOf(cat.icon) >= 24);
        setModalVisible(true);
    };

    const handleSave = async () => {
        if (!form.name.trim()) return;
        setSaving(true);
        try {
            const data = { ...form, type: activeTab };
            if (editingId) {
                await updateCategory(editingId, data);
            } else {
                await createCategory(data);
            }
            setModalVisible(false);
            loadData();
        } catch (e) {
            setAlertConfig({ visible: true, title: 'Error', message: 'Could not save category.', type: 'error', onConfirm: () => setAlertConfig(p => ({ ...p, visible: false })) });
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = (id, name) => {
        setAlertConfig({
            visible: true,
            title: 'Delete Category',
            message: `Are you sure you want to delete the "${name}" category? Existing transactions will retain this label, but it will be removed from your pickers.`,
            type: 'confirm',
            confirmText: 'Delete',
            onConfirm: async () => {
                setAlertConfig(p => ({ ...p, visible: false }));
                try {
                    await deleteCategory(id);
                    setCategories(prev => prev.filter(c => c._id !== id));
                } catch (e) {
                    console.error('Delete fail', e);
                }
            }
        });
    };

    const visibleCategories = categories.filter(c => c.type === activeTab);

    const renderRightActions = (progress, dragX, item) => {
        const scale = dragX.interpolate({ inputRange: [-80, 0], outputRange: [1, 0], extrapolate: 'clamp' });
        return (
            <TouchableOpacity onPress={() => handleDelete(item._id, item.name)} style={[styles.hiddenDeleteBtn, { backgroundColor: '#ef4444' }]} activeOpacity={0.8}>
                <RNAnimated.View style={{ transform: [{ scale }] }}>
                    <Feather name="trash-2" size={24} color="#fff" />
                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800', marginTop: 4 }}>Delete</Text>
                </RNAnimated.View>
            </TouchableOpacity>
        );
    };

    const renderItem = ({ item }) => (
        <Animated.View layout={Layout.springify()} exiting={ZoomOut.duration(100)}>
            <Swipeable renderRightActions={(prog, drag) => renderRightActions(prog, drag, item)} friction={1} overshootRight={false} containerStyle={{ marginBottom: spacing.md }}>
                <TouchableOpacity style={[styles.card, { backgroundColor: COLORS.surface }]} activeOpacity={0.8} onPress={() => openEditModal(item)}>
                    <View style={[styles.iconBox, { backgroundColor: item.color + '20' }]}>
                        <IconRenderer name={item.icon || 'circle'} size={22} color={item.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.cardTitle, { color: COLORS.text }]}>{item.name}</Text>
                        <Text style={[styles.cardSub, { color: COLORS.textMuted }]}>{item.type.charAt(0).toUpperCase() + item.type.slice(1)} Category</Text>
                    </View>
                    <Feather name="chevron-right" size={20} color={COLORS.border} />
                </TouchableOpacity>
            </Swipeable>
        </Animated.View>
    );

    return (
        <SafeAreaView style={[styles.safe, { backgroundColor: COLORS.background }]} edges={['top']}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backBtn, { backgroundColor: COLORS.surface }]}>
                    <Feather name="arrow-left" size={20} color={COLORS.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: COLORS.text }]}>Categories</Text>
                <TouchableOpacity style={[styles.addBtn, { backgroundColor: COLORS.primary }]} onPress={openCreateModal}>
                    <Feather name="plus" size={20} color="#fff" />
                </TouchableOpacity>
            </View>

            {/* Segmented Control */}
            <View style={[styles.segmentContainer, { backgroundColor: COLORS.surface }]}>
                <TouchableOpacity style={[styles.segment, activeTab === 'expense' && { backgroundColor: COLORS.primary }]} onPress={() => setActiveTab('expense')}>
                    <Text style={[styles.segmentText, { color: activeTab === 'expense' ? '#fff' : COLORS.textMuted }]}>Expenses</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.segment, activeTab === 'income' && { backgroundColor: '#22c55e' }]} onPress={() => setActiveTab('income')}>
                    <Text style={[styles.segmentText, { color: activeTab === 'income' ? '#fff' : COLORS.textMuted }]}>Income</Text>
                </TouchableOpacity>
            </View>

            {loading ? (
                <View style={{ padding: spacing.lg }}>
                    {[1, 2, 3, 4].map(i => <Skeleton key={i} width="100%" height={70} borderRadius={16} style={{ marginBottom: 12 }} />)}
                </View>
            ) : (
                <FlatList
                    data={visibleCategories}
                    keyExtractor={item => item._id}
                    renderItem={renderItem}
                    contentContainerStyle={styles.list}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadData} tintColor={COLORS.primary} />}
                    ListEmptyComponent={() => (
                        <View style={styles.empty}>
                            <Text style={{ fontSize: 50, marginBottom: 10 }}>📂</Text>
                            <Text style={[styles.emptyTitle, { color: COLORS.text }]}>No {activeTab} categories</Text>
                            <Text style={[styles.emptySub, { color: COLORS.textMuted }]}>Create your first custom category to get started.</Text>
                        </View>
                    )}
                />
            )}

            {/* Editor Modal */}
            <BottomSheetModal visible={modalVisible} onClose={() => setModalVisible(false)}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                    <ScrollView showsVerticalScrollIndicator={false}>
                        {/* Live Preview Pill */}
                        <View style={{ alignItems: 'center', marginBottom: spacing.lg }}>
                            <View style={[styles.previewPill, { backgroundColor: form.color + '20', borderColor: form.color }]}>
                                <IconRenderer name={form.icon} size={24} color={form.color} />
                                <Text style={[styles.previewText, { color: form.color }]}>{form.name || 'Category Name'}</Text>
                            </View>
                        </View>

                        <Text style={[styles.label, { color: COLORS.textMuted }]}>CATEGORY NAME</Text>
                        <TextInput
                            style={[styles.input, { backgroundColor: COLORS.surface, color: COLORS.text, borderColor: COLORS.border }]}
                            placeholder="e.g. Subscriptions"
                            placeholderTextColor={COLORS.textMuted}
                            value={form.name}
                            onChangeText={v => setForm(f => ({ ...f, name: v }))}
                            maxLength={25}
                        />

                        <Text style={[styles.label, { color: COLORS.textMuted, marginTop: spacing.md }]}>COLORS</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 10 }}>
                            {COLORS_PALETTE.map(cx => (
                                <TouchableOpacity key={cx} onPress={() => setForm(f => ({ ...f, color: cx }))}
                                    style={[styles.colorCircle, { backgroundColor: cx }, form.color === cx && { borderWidth: 3, borderColor: COLORS.text }]}
                                />
                            ))}
                        </ScrollView>

                        <Text style={[styles.label, { color: COLORS.textMuted, marginTop: spacing.md }]}>ICONS</Text>
                        <View style={styles.iconGrid}>
                            {(showAllIcons ? ICONS : ICONS.slice(0, 24)).map(ix => (
                                <TouchableOpacity key={ix} onPress={() => setForm(f => ({ ...f, icon: ix }))}
                                    style={[styles.iconSelectBtn, {
                                        backgroundColor: form.icon === ix ? COLORS.primary + '10' : COLORS.surface,
                                        borderColor: form.icon === ix ? COLORS.primary : COLORS.border,
                                        borderWidth: 1.5
                                    }]}>
                                    <IconRenderer name={ix} size={18} color={form.icon === ix ? COLORS.primary : COLORS.textMuted} />
                                </TouchableOpacity>
                            ))}
                        </View>

                        {ICONS.length > 24 && (
                            <TouchableOpacity onPress={() => setShowAllIcons(!showAllIcons)} style={[styles.showMoreBtn, { borderColor: COLORS.border }]}>
                                <Text style={[styles.showMoreText, { color: COLORS.primary }]}>
                                    {showAllIcons ? 'Hide icons' : 'Show more icons'}
                                </Text>
                                <Feather name={showAllIcons ? "chevron-up" : "chevron-down"} size={16} color={COLORS.primary} style={{ marginLeft: 4 }} />
                            </TouchableOpacity>
                        )}

                        <TouchableOpacity onPress={handleSave} disabled={saving} style={[styles.saveBtn, { backgroundColor: COLORS.primary }]}>
                            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>{editingId ? 'Save Changes' : 'Create Category'}</Text>}
                        </TouchableOpacity>
                        <View style={{ height: Platform.OS === 'ios' ? 40 : 20 }} />
                    </ScrollView>
                </KeyboardAvoidingView>
            </BottomSheetModal>

            <CustomAlertModal visible={alertConfig.visible} title={alertConfig.title} message={alertConfig.message} type={alertConfig.type} confirmText={alertConfig.confirmText} onConfirm={alertConfig.onConfirm} onClose={() => setAlertConfig(p => ({ ...p, visible: false }))} />
        </SafeAreaView>
    );
}

const getStyles = (COLORS) => StyleSheet.create({
    safe: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg },
    backBtn: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    headerTitle: { fontSize: 20, fontWeight: '800' },
    addBtn: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    segmentContainer: { flexDirection: 'row', marginHorizontal: spacing.lg, borderRadius: 16, padding: 4, marginBottom: spacing.md },
    segment: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
    segmentText: { fontWeight: '700', fontSize: 14 },
    list: { paddingHorizontal: spacing.lg, paddingBottom: 100 },
    card: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, borderRadius: radius.xl, gap: 14 },
    iconBox: { width: 46, height: 46, borderRadius: 23, justifyContent: 'center', alignItems: 'center' },
    cardTitle: { fontSize: 16, fontWeight: '800' },
    cardSub: { fontSize: 12, marginTop: 2, fontWeight: '600' },
    hiddenDeleteBtn: { width: 80, height: '100%', borderRadius: radius.xl, justifyContent: 'center', alignItems: 'center', marginLeft: 12 },
    empty: { alignItems: 'center', paddingTop: 60 },
    emptyTitle: { fontSize: 18, fontWeight: '800', marginBottom: 8 },
    emptySub: { fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },
    previewPill: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 30, borderWidth: 1 },
    previewText: { fontSize: 18, fontWeight: '900' },
    label: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5, marginBottom: 8 },
    input: { borderWidth: 1, borderRadius: radius.lg, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, fontWeight: '700' },
    colorCircle: { width: 40, height: 40, borderRadius: 20 },
    iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.sm },
    iconSelectBtn: { width: '18%', height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5 },
    showMoreBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1, marginBottom: spacing.lg, borderStyle: 'dashed' },
    showMoreText: { fontSize: 14, fontWeight: '700' },
    saveBtn: { paddingVertical: 16, borderRadius: radius.xl, alignItems: 'center' },
    saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' }
});
