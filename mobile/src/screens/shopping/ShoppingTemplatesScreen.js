import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, FlatList,
    ActivityIndicator, RefreshControl, Modal, TextInput, Animated as RNAnimated
} from 'react-native';
import Animated, { ZoomIn, ZoomOut } from 'react-native-reanimated';
import { Swipeable } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { getShoppingTemplates, createShoppingTemplate, deleteShoppingTemplate, useShoppingTemplate, updateShoppingTemplate } from '../../api/api';
import { spacing, radius } from '../../theme/colors';
import Skeleton from '../../components/Skeleton';
import CustomAlertModal from '../../components/CustomAlertModal';

const formatCurrency = (amount, currency = 'PHP') =>
    new Intl.NumberFormat('en-PH', { style: 'currency', currency }).format(amount || 0);

export default function ShoppingTemplatesScreen({ navigation }) {
    const COLORS = useTheme(state => state.COLORS);
    const { userInfo } = useAuth();
    const styles = getStyles(COLORS);

    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);
    const [newTemplateName, setNewTemplateName] = useState('');
    const [newTemplateEmoji, setNewTemplateEmoji] = useState('🛒');
    const [saving, setSaving] = useState(false);
    const [alertConfig, setAlertConfig] = useState({ visible: false, title: '', message: '', type: 'info', onConfirm: () => {} });

    // ── Edit Items State ──
    const [itemsModalVisible, setItemsModalVisible] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [newItemName, setNewItemName] = useState('');
    const [newItemPrice, setNewItemPrice] = useState('');
    const [updating, setUpdating] = useState(false);

    const loadTemplates = useCallback(async () => {
        try {
            setRefreshing(true);
            const res = await getShoppingTemplates();
            setTemplates(res.templates || []);
        } catch (e) {
            console.warn('[Templates] load error:', e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { loadTemplates(); }, [loadTemplates]);

    const handleCreateTemplate = async () => {
        if (!newTemplateName.trim()) return;
        setSaving(true);
        try {
            await createShoppingTemplate({
                name: newTemplateName.trim(),
                emoji: newTemplateEmoji,
                items: [] // Empty for now, user edits it
            });
            setModalVisible(false);
            setNewTemplateName('');
            loadTemplates();
        } catch (e) {
            setAlertConfig({
                visible: true,
                title: 'Error',
                message: e.response?.data?.error || 'Failed to create template',
                type: 'error',
                onConfirm: () => setAlertConfig(prev => ({ ...prev, visible: false }))
            });
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = (id, name) => {
        setAlertConfig({
            visible: true,
            title: 'Delete Template',
            message: `Are you sure you want to delete "${name}"?`,
            type: 'confirm',
            onConfirm: async () => {
                setAlertConfig(prev => ({ ...prev, visible: false }));
                try {
                    await deleteShoppingTemplate(id);
                    loadTemplates();
                } catch (e) {
                    setAlertConfig({
                        visible: true,
                        title: 'Error',
                        message: 'Failed to delete template',
                        type: 'error',
                        onConfirm: () => setAlertConfig(prev => ({ ...prev, visible: false }))
                    });
                }
            }
        });
    };

    const handleUse = async (template) => {
        if (!template.items || template.items.length === 0) {
            setAlertConfig({
                visible: true,
                title: 'Empty Template',
                message: 'This template has no items. Add some items first!',
                type: 'info',
                onConfirm: () => setAlertConfig(p => ({ ...p, visible: false }))
            });
            return;
        }
        try {
            await useShoppingTemplate(template._id);
            navigation.navigate('ShoppingSession', {
                templateItems: template.items,
                templateLabel: template.name,
                templateBudget: template.defaultBudget
            });
        } catch (e) {
            navigation.navigate('ShoppingSession', {
                templateItems: template.items,
                templateLabel: template.name,
                templateBudget: template.defaultBudget
            });
        }
    };

    const handleAddItem = async () => {
        if (!newItemName.trim() || !newItemPrice) return;
        setUpdating(true);
        try {
            const updatedItems = [...(selectedTemplate.items || []), {
                name: newItemName.trim(),
                price: parseFloat(newItemPrice) || 0,
                quantity: 1
            }];
            const res = await updateShoppingTemplate(selectedTemplate._id, { items: updatedItems });
            setSelectedTemplate(res);
            setNewItemName('');
            setNewItemPrice('');
            loadTemplates();
        } catch (e) {
            console.warn(e);
        } finally {
            setUpdating(false);
        }
    };

    const handleRemoveItem = async (index) => {
        try {
            const updatedItems = selectedTemplate.items.filter((_, i) => i !== index);
            const res = await updateShoppingTemplate(selectedTemplate._id, { items: updatedItems });
            setSelectedTemplate(res);
            loadTemplates();
        } catch (e) {
            console.warn(e);
        }
    };

    const renderRightActions = (progress, dragX, item) => {
        const scale = dragX.interpolate({
            inputRange: [-80, 0],
            outputRange: [1, 0],
            extrapolate: 'clamp',
        });

        return (
            <TouchableOpacity
                onPress={() => handleDelete(item._id, item.name)}
                style={[styles.hiddenDeleteBtn, { backgroundColor: '#ef4444' }]}
                activeOpacity={0.8}
            >
                <RNAnimated.View style={{ transform: [{ scale }] }}>
                    <Feather name="trash-2" size={24} color="#fff" />
                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800', marginTop: 4 }}>Delete</Text>
                </RNAnimated.View>
            </TouchableOpacity>
        );
    };

    const renderItem = ({ item }) => (
        <Animated.View key={item._id} entering={ZoomIn.springify().damping(50).mass(0.9)} exiting={ZoomOut.duration(100)}>
            <Swipeable 
                renderRightActions={(prog, drag) => renderRightActions(prog, drag, item)} 
                friction={1} 
                overshootRight={false}
                containerStyle={{ marginBottom: 12 }}
            >
            <TouchableOpacity
                style={[styles.templateCard, { backgroundColor: COLORS.surface }]}
                onPress={() => handleUse(item)}
                activeOpacity={0.8}
            >
                <View style={[styles.emojiBox, { backgroundColor: COLORS.primary + '15' }]}><Text style={styles.emojiText}>{item.emoji}</Text></View>
                <View style={{ flex: 1 }}>
                    <Text style={[styles.templateName, { color: COLORS.text }]}>{item.name}</Text>
                    <Text style={[styles.templateMeta, { color: COLORS.textMuted }]}>{item.items?.length || 0} items · Used {item.usageCount || 0} times</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 4 }}>
                    <TouchableOpacity onPress={() => { setSelectedTemplate(item); setItemsModalVisible(true); }} style={[styles.actionIconBtn, { backgroundColor: COLORS.border + '30' }]}>
                        <Feather name="edit-3" size={16} color={COLORS.primary} />
                    </TouchableOpacity>
                </View>
            </TouchableOpacity>
        </Swipeable>
        </Animated.View>
    );

    return (
        <SafeAreaView style={[styles.safe, { backgroundColor: COLORS.background }]}>
            <View style={styles.header}>
                <TouchableOpacity 
                    onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('ShoppingHome')} 
                    style={[styles.backBtn, { backgroundColor: COLORS.surface }]}
                >
                    <Feather name="arrow-left" size={20} color={COLORS.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: COLORS.text }]}>Shopping Templates</Text>
                <TouchableOpacity
                    style={[styles.addBtn, { backgroundColor: COLORS.primary }]}
                    onPress={() => setModalVisible(true)}
                >
                    <Feather name="plus" size={20} color="#fff" />
                </TouchableOpacity>
            </View>

            {loading ? (
                <View style={{ padding: spacing.lg }}>
                    {[1, 2, 3].map(i => (
                        <Skeleton key={i} width="100%" height={80} borderRadius={16} style={{ marginBottom: 12 }} />
                    ))}
                </View>
            ) : (
                <FlatList
                    data={templates}
                    renderItem={renderItem}
                    keyExtractor={item => item._id}
                    contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadTemplates} tintColor={COLORS.primary} />}
                    ListEmptyComponent={() => (
                        <View style={styles.emptyContainer}>
                            <MaterialCommunityIcons name="clipboard-text-outline" size={64} color={COLORS.textMuted} />
                            <Text style={[styles.emptyText, { color: COLORS.text }]}>No Templates Yet</Text>
                            <Text style={[styles.emptySub, { color: COLORS.textMuted }]}>
                                Save your recurring shopping lists to save time!
                            </Text>
                        </View>
                    )}
                />
            )}

            <Modal visible={modalVisible} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { backgroundColor: COLORS.surface }]}>
                        <Text style={[styles.modalTitle, { color: COLORS.text }]}>New Template</Text>
                        <TextInput
                            style={[styles.input, { color: COLORS.text, borderColor: COLORS.border }]}
                            placeholder="Template Name (e.g. Weekly Groceries)"
                            placeholderTextColor={COLORS.textMuted}
                            value={newTemplateName}
                            onChangeText={setNewTemplateName}
                            autoFocus
                        />
                        <View style={styles.modalActions}>
                            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border }]} onPress={() => setModalVisible(false)}>
                                <Text style={{ color: COLORS.text, fontWeight: '700' }}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.actionBtn, { backgroundColor: COLORS.primary }]}
                                onPress={handleCreateTemplate}
                                disabled={saving}
                            >
                                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontWeight: '800' }}>Create</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Edit Items Modal */}
            <Modal visible={itemsModalVisible} transparent animationType="slide" onRequestClose={() => setItemsModalVisible(false)}>
                <View style={styles.fullModalOverlay}>
                    <View style={[styles.fullModalContent, { backgroundColor: COLORS.surface }]}>
                        <View style={styles.modalHeader}>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.modalTitleLarge, { color: COLORS.text }]}>{selectedTemplate?.name}</Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                                    <Text style={[styles.modalSub, { color: COLORS.textMuted }]}>Budget: </Text>
                                    <TextInput
                                        style={{ color: COLORS.primary, fontWeight: '800', fontSize: 13, minWidth: 60 }}
                                        value={String(selectedTemplate?.defaultBudget || 0)}
                                        keyboardType="decimal-pad"
                                        onChangeText={async (val) => {
                                            const b = parseFloat(val) || 0;
                                            setSelectedTemplate(prev => ({ ...prev, defaultBudget: b }));
                                            // Auto-save budget change
                                            await updateShoppingTemplate(selectedTemplate._id, { defaultBudget: b });
                                            loadTemplates();
                                        }}
                                    />
                                </View>
                            </View>
                            <TouchableOpacity onPress={() => setItemsModalVisible(false)} style={[styles.closeModalBtn, { backgroundColor: COLORS.border }]}>
                                <Feather name="x" size={20} color={COLORS.text} />
                            </TouchableOpacity>
                        </View>

                        <View style={[styles.addItemRow, { borderColor: COLORS.border }]}>
                            <TextInput
                                style={[styles.itemInput, { color: COLORS.text, flex: 2 }]}
                                placeholder="Item name"
                                placeholderTextColor={COLORS.textMuted}
                                value={newItemName}
                                onChangeText={setNewItemName}
                            />
                            <TextInput
                                style={[styles.itemInput, { color: COLORS.text, flex: 1, borderLeftWidth: 1, borderLeftColor: COLORS.border, paddingLeft: 12 }]}
                                placeholder="₱ Price"
                                placeholderTextColor={COLORS.textMuted}
                                value={newItemPrice}
                                onChangeText={setNewItemPrice}
                                keyboardType="decimal-pad"
                            />
                            <TouchableOpacity
                                style={[styles.addButtonSmall, { backgroundColor: COLORS.primary }]}
                                onPress={handleAddItem}
                                disabled={updating}
                            >
                                {updating ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="plus" size={20} color="#fff" />}
                            </TouchableOpacity>
                        </View>

                        <FlatList
                            data={selectedTemplate?.items || []}
                            keyExtractor={(_, i) => String(i)}
                            renderItem={({ item, index }) => (
                                <View style={[styles.listItem, { borderBottomColor: COLORS.border }]}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.listItemName, { color: COLORS.text }]}>{item.name}</Text>
                                        <Text style={[styles.listItemPrice, { color: COLORS.textMuted }]}>{formatCurrency(item.price, userInfo?.currency)}</Text>
                                    </View>
                                    <TouchableOpacity onPress={() => handleRemoveItem(index)} style={styles.removeItemBtn}>
                                        <Feather name="minus-circle" size={18} color="#ef4444" />
                                    </TouchableOpacity>
                                </View>
                            )}
                            ListEmptyComponent={() => (
                                <View style={{ alignItems: 'center', marginTop: 40 }}>
                                    <Feather name="shopping-bag" size={48} color={COLORS.textMuted} opaciyt={0.3} />
                                    <Text style={{ color: COLORS.textMuted, marginTop: 12, fontWeight: '600' }}>No items added yet</Text>
                                </View>
                            )}
                            contentContainerStyle={{ paddingBottom: 40 }}
                        />
                    </View>
                </View>
            </Modal>

            <CustomAlertModal
                visible={alertConfig.visible}
                onClose={() => setAlertConfig(p => ({ ...p, visible: false }))}
                title={alertConfig.title}
                message={alertConfig.message}
                type={alertConfig.type}
                onConfirm={alertConfig.onConfirm}
            />
        </SafeAreaView>
    );
}

const getStyles = (COLORS) => StyleSheet.create({
    safe: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg },
    backBtn: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    headerTitle: { fontSize: 20, fontWeight: '800' },
    addBtn: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    templateCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: radius.xl, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
    emojiBox: { width: 48, height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    emojiText: { fontSize: 24 },
    templateName: { fontSize: 16, fontWeight: '800' },
    templateMeta: { fontSize: 12, fontWeight: '600', marginTop: 2 },
    hiddenDeleteBtn: { width: 80, height: '100%', borderRadius: radius.xl, justifyContent: 'center', alignItems: 'center', marginLeft: 12, elevation: 1 },
    emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingTop: 100 },
    emptyText: { fontSize: 18, fontWeight: '800', marginTop: 16 },
    emptySub: { fontSize: 13, fontWeight: '500', textAlign: 'center', paddingHorizontal: 40, marginTop: 8 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
    modalContent: { borderRadius: radius.xl, padding: 24 },
    modalTitle: { fontSize: 18, fontWeight: '900', marginBottom: 20 },
    input: { borderWidth: 1, borderRadius: radius.lg, padding: 14, fontSize: 16, fontWeight: '600', marginBottom: 20 },
    modalActions: { flexDirection: 'row', gap: 12 },
    actionBtn: { flex: 1, padding: 14, borderRadius: radius.lg, alignItems: 'center' },
    actionIconBtn: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    // Full Modal
    fullModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    fullModalContent: { height: '85%', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
    modalTitleLarge: { fontSize: 24, fontWeight: '900' },
    modalSub: { fontSize: 13, fontWeight: '600' },
    closeModalBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
    addItemRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, marginBottom: 20, height: 56 },
    itemInput: { fontSize: 15, fontWeight: '700' },
    addButtonSmall: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginLeft: 8 },
    listItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1 },
    listItemName: { fontSize: 15, fontWeight: '700' },
    listItemPrice: { fontSize: 12, fontWeight: '600', marginTop: 2 },
    removeItemBtn: { padding: 8 },
});
