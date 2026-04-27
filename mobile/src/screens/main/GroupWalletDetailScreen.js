import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView,
    Modal, TouchableWithoutFeedback, TextInput, Animated, Dimensions,
    RefreshControl, ActivityIndicator, Image, FlatList, LayoutAnimation,
    Platform, UIManager
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { getGroupWalletDetail, getTripSettlementPreview, settleTrip, updateTrip, leaveTrip } from '../../api/api';
import CustomAlertModal from '../../components/CustomAlertModal';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
import Skeleton from '../../components/Skeleton';
import { formatCurrency, formatDateRelative, getIconName, getIconColor, IconRenderer } from '../../utils/formatters';
import { API_BASE } from '../../store/authStore';
import GroupWalletExpenseModal from './GroupWalletExpenseModal';

const { width } = Dimensions.get('window');

const TabItem = ({ label, active, onPress, COLORS }) => (
    <TouchableOpacity 
        onPress={onPress}
        style={[styles.tab, active && { borderBottomColor: COLORS.primary, borderBottomWidth: 3 }]}
    >
        <Text style={[styles.tabText, { color: active ? COLORS.primary : COLORS.textMuted, fontWeight: active ? '800' : '600' }]}>
            {label}
        </Text>
    </TouchableOpacity>
);

export default function GroupWalletDetailScreen({ route, navigation }) {
    const { id } = route.params;
    const COLORS = useTheme(state => state.COLORS);
    const { userInfo } = useAuth();
    
    const [group, setGroup] = useState(null);
    const [settlement, setSettlement] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState('Expenses'); // 'Expenses', 'Members', 'Settle'
    const [expenseModalVisible, setExpenseModalVisible] = useState(false);
    const [menuVisible, setMenuVisible] = useState(false);
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [editForm, setEditForm] = useState({ name: '', emoji: '' });
    const [alert, setAlert] = useState({ visible: false, title: '', message: '', type: 'info' });

    // Animation values
    const menuAnim = React.useRef(new Animated.Value(0)).current;
    const editFadeAnim = React.useRef(new Animated.Value(0)).current;
    const [editSlideAnim, setEditSlideAnim] = useState(new Animated.Value(SCREEN_HEIGHT));
    const [editModalMounted, setEditModalMounted] = useState(false);
    const [expandedExpenseIds, setExpandedExpenseIds] = useState([]);

    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
        UIManager.setLayoutAnimationEnabledExperimental(true);
    }

    const toggleExpense = (id) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExpandedExpenseIds(prev => 
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    useEffect(() => {
        if (menuVisible) {
            Animated.timing(menuAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
        } else {
            menuAnim.setValue(0);
        }
    }, [menuVisible]);

    useEffect(() => {
        if (editModalVisible) {
            setEditModalMounted(true);
            Animated.parallel([
                Animated.timing(editFadeAnim, { toValue: 1, duration: 280, useNativeDriver: true }),
                Animated.spring(editSlideAnim, { toValue: 0, tension: 65, friction: 11, useNativeDriver: true })
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(editFadeAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
                Animated.timing(editSlideAnim, { toValue: SCREEN_HEIGHT, duration: 260, useNativeDriver: true })
            ]).start(() => {
                setEditModalMounted(false);
            });
        }
    }, [editModalVisible]);

    const load = useCallback(async () => {
        try {
            const [data, settleData] = await Promise.all([
                getGroupWalletDetail(id),
                getTripSettlementPreview(id)
            ]);
            setGroup(data);
            setSettlement(settleData);
            setEditForm({ name: data.name, emoji: data.emoji });
        } catch (err) {
            console.error('[TripDetail] Load error:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [id]);

    useEffect(() => {
        load();
    }, [load]);

    const handleSettle = async () => {
        setMenuVisible(false);
        setAlert({
            visible: true,
            title: 'Finalize & Settle?',
            message: 'This will lock the trip, move it to your Archives, and convert any final balances into formal IOUs in your Debts section. This action cannot be undone. Continue?',
            type: 'warning',
            onConfirm: async () => {
                setAlert(a => ({ ...a, visible: false }));
                setLoading(true);
                try {
                    await settleTrip(id);
                    navigation.goBack();
                } catch (err) {
                    setAlert({ visible: true, title: 'Error', message: err?.response?.data?.error || 'Failed to settle trip.', type: 'error' });
                    setLoading(false);
                }
            }
        });
    };

    const handleArchiveOnly = async () => {
        setMenuVisible(false);
        setAlert({
            visible: true,
            title: 'Archive Trip?',
            message: 'Move this trip to your archives? You can restore it later if you haven\'t settled up.',
            type: 'info',
            onConfirm: async () => {
                setAlert(a => ({ ...a, visible: false }));
                setLoading(true);
                try {
                    await updateTrip(id, { isArchived: true });
                    navigation.goBack();
                } catch (err) {
                    setAlert({ visible: true, title: 'Error', message: 'Failed to archive trip.', type: 'error' });
                    setLoading(false);
                }
            }
        });
    };

    const handleLeave = async () => {
        setMenuVisible(false);
        setAlert({
            visible: true,
            title: 'Leave Trip?',
            message: 'Are you sure you want to leave this group? You will lose access to the history.',
            type: 'danger',
            onConfirm: async () => {
                setAlert(a => ({ ...a, visible: false }));
                setLoading(true);
                try {
                    await leaveTrip(id);
                    navigation.goBack();
                } catch (err) {
                    setAlert({ visible: true, title: 'Action Failed', message: err?.response?.data?.error || 'Could not leave trip.', type: 'error' });
                    setLoading(false);
                }
            }
        });
    };

    const handleUpdate = async () => {
        if (!editForm.name.trim()) return;
        setEditModalVisible(false);
        setLoading(true);
        try {
            await updateTrip(id, editForm);
            load();
        } catch (err) {
            setAlert({ visible: true, title: 'Update Failed', message: 'Failed to update trip details.', type: 'error' });
            setLoading(false);
        }
    };

    if (loading && !group) {
        return (
            <SafeAreaView style={[styles.safe, { backgroundColor: COLORS.background }]}>
                <Skeleton width="100%" height={250} />
                <View style={{ padding: 20 }}>
                    <Skeleton width="60%" height={24} style={{ marginBottom: 12 }} />
                    <Skeleton width="100%" height={100} borderRadius={16} style={{ marginBottom: 16 }} />
                    <Skeleton width="100%" height={100} borderRadius={16} />
                </View>
            </SafeAreaView>
        );
    }

    const totalSpent = group?.expenses.reduce((sum, exp) => sum + exp.amount, 0) || 0;
    const myBalance = settlement?.balances[userInfo?._id] || 0;
    const isOwner = group?.owner?._id === userInfo?._id;

    return (
        <View style={[styles.container, { backgroundColor: COLORS.background }]}>
            {/* Header / Cover */}
            <View style={[styles.cover, { backgroundColor: group.color }]}>
                <SafeAreaView>
                    <View style={styles.navHeader}>
                        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.circleBtn}>
                            <Feather name="arrow-left" size={20} color="#fff" />
                        </TouchableOpacity>
                        <Text style={styles.coverTitle} numberOfLines={1}>{group.name}</Text>
                        <TouchableOpacity 
                            onPress={() => setMenuVisible(true)}
                            style={styles.circleBtn}
                        >
                            <Feather name="more-horizontal" size={20} color="#fff" />
                        </TouchableOpacity>
                    </View>
                    <View style={styles.coverBody}>
                        <View style={styles.emojiCircle}>
                            <Text style={styles.emojiText}>{group.emoji}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.totalLabel}>TOTAL SPENT</Text>
                            <Text style={styles.totalAmount}>{formatCurrency(totalSpent, group.currency)}</Text>
                        </View>
                        <View style={[styles.myStatusCard, { backgroundColor: myBalance >= 0 ? '#22c55e' : '#ef4444' }]}>
                            <Text style={styles.statusLabel}>{myBalance >= 0 ? 'TO RECEIVE' : 'YOU OWE'}</Text>
                            <Text style={styles.statusAmount}>₱{Math.abs(Math.round(myBalance))}</Text>
                        </View>
                    </View>
                </SafeAreaView>
            </View>

            {/* Tabs */}
            <View style={[styles.tabsRow, { backgroundColor: COLORS.surface, borderBottomColor: COLORS.border }]}>
                <TabItem label="Expenses" active={activeTab === 'Expenses'} onPress={() => setActiveTab('Expenses')} COLORS={COLORS} />
                <TabItem label="Members" active={activeTab === 'Members'} onPress={() => setActiveTab('Members')} COLORS={COLORS} />
                <TabItem label="Settle Up" active={activeTab === 'Settle'} onPress={() => setActiveTab('Settle')} COLORS={COLORS} />
            </View>

            <ScrollView 
                style={{ flex: 1 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.primary} />}
            >
                {activeTab === 'Expenses' && (
                    <View style={styles.listContent}>
                        {group.expenses.length === 0 ? (
                            <View style={styles.emptyView}>
                                <MaterialCommunityIcons name="receipt" size={48} color={COLORS.textMuted} />
                                <Text style={[styles.emptyText, { color: COLORS.textMuted }]}>No expenses yet. Add one to start tracking!</Text>
                            </View>
                        ) : (
                            group.expenses.sort((a,b) => new Date(b.date) - new Date(a.date)).map((exp, idx) => (
                                <TouchableOpacity 
                                    key={idx} 
                                    activeOpacity={0.7}
                                    onPress={() => toggleExpense(exp._id)}
                                    style={[styles.expenseItem, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}
                                >
                                    <View style={styles.expenseMainRow}>
                                        <View style={[styles.categoryIcon, { backgroundColor: getIconColor(exp, COLORS) + '20' }]}>
                                            <IconRenderer name={getIconName(exp)} size={16} color={getIconColor(exp, COLORS)} />
                                        </View>
                                        <View style={{ flex: 1, marginLeft: 12 }}>
                                            <Text style={[styles.expDesc, { color: COLORS.text }]}>{exp.description}</Text>
                                            <Text style={[styles.expMeta, { color: COLORS.textMuted }]}>
                                                Paid by {exp.paidBy.name === userInfo.name ? 'You' : exp.paidBy.name} • {formatDateRelative(exp.date)}
                                            </Text>
                                        </View>
                                        <View style={{ alignItems: 'flex-end' }}>
                                            <Text style={[styles.expAmount, { color: COLORS.text }]}>{formatCurrency(exp.amount, group.currency)}</Text>
                                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                                <Text style={[styles.expSplit, { color: COLORS.textMuted }]}>
                                                    {exp.splitAmong.length > 0 ? `${exp.splitAmong.length} people` : 'Everyone'}
                                                </Text>
                                                <Feather 
                                                    name={expandedExpenseIds.includes(exp._id) ? "chevron-up" : "chevron-down"} 
                                                    size={12} 
                                                    color={COLORS.textMuted} 
                                                    style={{ marginLeft: 4, marginTop: 2 }} 
                                                />
                                            </View>
                                        </View>
                                    </View>

                                    {/* List Split Breakdown */}
                                    {expandedExpenseIds.includes(exp._id) && (
                                        <View style={styles.listBreakdown}>
                                            {(exp.splitAmong.length > 0 ? exp.splitAmong : [group.owner, ...group.participants.filter(p => p.status === 'accepted')].map(p => p.user || p)).map((member, midx) => {
                                                const mName = member.name || 'User';
                                                const mAvatar = member.avatarUrl || member.avatar;
                                                const splitCount = exp.splitAmong.length > 0 ? exp.splitAmong.length : ([group.owner, ...group.participants.filter(p => p.status === 'accepted')].length);
                                                const share = exp.amount / splitCount;

                                                return (
                                                    <View key={midx} style={styles.listBreakdownRow}>
                                                        <View style={styles.listBreakdownLeft}>
                                                            <View style={styles.listBreakdownAvatar}>
                                                                {mAvatar ? (
                                                                    <Image 
                                                                        source={{ 
                                                                            uri: mAvatar.startsWith('http') 
                                                                                ? mAvatar 
                                                                                : `${API_BASE.replace('/api', '')}/${mAvatar}`
                                                                        }} 
                                                                        style={styles.avatarImg}
                                                                    />
                                                                ) : (
                                                                    <Feather name="user" size={8} color={COLORS.textMuted} />
                                                                )}
                                                            </View>
                                                            <Text style={[styles.listBreakdownName, { color: COLORS.textMuted }]}>{mName}</Text>
                                                        </View>
                                                        <Text style={[styles.listBreakdownAmt, { color: COLORS.text }]}>
                                                            ₱{share.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                                        </Text>
                                                    </View>
                                                );
                                            })}
                                        </View>
                                    )}
                                </TouchableOpacity>
                            ))
                        )}
                    </View>
                )}

                {activeTab === 'Members' && (
                    <View style={styles.listContent}>
                        {[group.owner, ...group.participants].map((p, idx) => {
                            const user = p.user || p;
                            const status = p.status || 'owner';
                            return (
                                <View key={idx} style={[styles.memberItem, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
                                    <View style={styles.memberAvatar}>
                                        {(user.avatarUrl || user.avatar) ? (
                                            <Image 
                                                source={{ 
                                                    uri: (user.avatarUrl || user.avatar).startsWith('http')
                                                        ? (user.avatarUrl || user.avatar)
                                                        : `${API_BASE.replace('/api', '')}/${user.avatarUrl || user.avatar}`
                                                }} 
                                                style={styles.avatarImg} 
                                                resizeMode="cover"
                                            />
                                        ) : (
                                            <Text style={[styles.avatarInitial, { color: COLORS.textMuted }]}>{user.name[0]}</Text>
                                        )}
                                    </View>
                                    <View style={{ flex: 1, marginLeft: 12 }}>
                                        <Text style={[styles.memberName, { color: COLORS.text }]}>{user.name}</Text>
                                        <Text style={[styles.memberTag, { color: COLORS.textMuted }]}>
                                            @{user.otterTag?.replace(/^@/, '') || 'otter'}
                                        </Text>
                                    </View>
                                    <View style={[styles.statusBadge, { backgroundColor: status === 'accepted' || status === 'owner' ? '#22c55e20' : '#f59e0b20' }]}>
                                        <Text style={[styles.statusBadgeText, { color: status === 'accepted' || status === 'owner' ? '#22c55e' : '#f59e0b' }]}>
                                            {status.toUpperCase()}
                                        </Text>
                                    </View>
                                </View>
                            );
                        })}
                    </View>
                )}

                {activeTab === 'Settle' && (
                    <View style={styles.listContent}>
                        <View style={[styles.infoBox, { backgroundColor: COLORS.primary + '10' }]}>
                            <Feather name="info" size={16} color={COLORS.primary} />
                            <Text style={[styles.infoText, { color: COLORS.primary }]}>
                                Otter calculates the minimum number of transfers to balance everyone out.
                            </Text>
                        </View>

                        {settlement?.suggestedTransfers.length === 0 ? (
                            <View style={styles.emptyView}>
                                <Feather name="check-circle" size={48} color="#22c55e" />
                                <Text style={[styles.emptyText, { color: COLORS.textMuted, marginTop: 12 }]}>Everyone is square! No transfers needed.</Text>
                            </View>
                        ) : (
                            settlement?.suggestedTransfers.map((t, idx) => {
                                const fromUser = [group.owner, ...group.participants].find(p => (p.user?._id || p._id) === t.from);
                                const toUser = [group.owner, ...group.participants].find(p => (p.user?._id || p._id) === t.to);
                                
                                const fromName = (fromUser?.user?.name || fromUser?.name);
                                const toName = (toUser?.user?.name || toUser?.name);

                                return (
                                    <View key={idx} style={[styles.transferCard, { backgroundColor: COLORS.surface, borderColor: COLORS.border }]}>
                                        <View style={styles.transferFlow}>
                                            <View style={styles.userColumn}>
                                                <Text style={[styles.userName, { color: COLORS.text }]}>{t.from === userInfo._id ? 'YOU' : fromName}</Text>
                                                <Text style={[styles.userAction, { color: COLORS.textMuted }]}>Pays</Text>
                                            </View>
                                            <View style={styles.arrowContainer}>
                                                <Text style={[styles.transferAmount, { color: COLORS.primary }]}>₱{t.amount.toLocaleString()}</Text>
                                                <Feather name="arrow-right" size={20} color={COLORS.primary} />
                                            </View>
                                            <View style={styles.userColumn}>
                                                <Text style={[styles.userName, { color: COLORS.text }]}>{t.to === userInfo._id ? 'YOU' : toName}</Text>
                                                <Text style={[styles.userAction, { color: COLORS.textMuted }]}>Receives</Text>
                                            </View>
                                        </View>
                                    </View>
                                );
                            })
                        )}

                        {group.owner._id === userInfo._id && !group.isArchived && (
                            <TouchableOpacity 
                                onPress={handleSettle}
                                style={[styles.settleBtn, { backgroundColor: COLORS.primary }]}
                            >
                                <Text style={styles.settleBtnText}>Confirm Settlement & Archive</Text>
                            </TouchableOpacity>
                        )}
                        {group.isArchived && (
                            <View style={[styles.archivedBadge, { backgroundColor: COLORS.border }]}>
                                <Text style={[styles.archivedText, { color: COLORS.textMuted }]}>THIS TRIP IS ARCHIVED</Text>
                            </View>
                        )}
                    </View>
                )}
            </ScrollView>

            {!group.isArchived && (
                <TouchableOpacity 
                    onPress={() => setExpenseModalVisible(true)}
                    style={[styles.fab, { backgroundColor: COLORS.primary }]}
                >
                    <Feather name="plus" size={24} color="#fff" />
                </TouchableOpacity>
            )}

            <GroupWalletExpenseModal
                visible={expenseModalVisible}
                onClose={() => setExpenseModalVisible(false)}
                onSuccess={() => { setExpenseModalVisible(false); load(); }}
                groupId={id}
                members={[group.owner, ...group.participants.filter(p => p.status === 'accepted')].map(p => p.user || p)}
                currency={group.currency}
                customCategories={group.customCategories}
            />

            <CustomAlertModal
                visible={alert.visible}
                title={alert.title}
                message={alert.message}
                type={alert.type}
                onClose={() => setAlert({ ...alert, visible: false })}
                onConfirm={alert.onConfirm}
            />

            {/* Edit Modal */}
            <Modal
                visible={editModalMounted}
                transparent
                animationType="none"
                onRequestClose={() => setEditModalVisible(false)}
                statusBarTranslucent
            >
                <TouchableWithoutFeedback onPress={() => setEditModalVisible(false)}>
                    <Animated.View style={[styles.modalOverlay, { opacity: editFadeAnim }]}>
                        <TouchableWithoutFeedback>
                            <Animated.View 
                                style={[
                                    styles.modalContent, 
                                    { 
                                        backgroundColor: COLORS.surface,
                                        transform: [{ translateY: editSlideAnim }]
                                    }
                                ]}
                            >
                                <View style={styles.modalHeader}>
                                    <Text style={[styles.modalTitle, { color: COLORS.text }]}>Edit Trip</Text>
                                    <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                                        <Feather name="x" size={20} color={COLORS.textMuted} />
                                    </TouchableOpacity>
                                </View>

                                <View style={styles.inputSection}>
                                    <Text style={[styles.inputLabel, { color: COLORS.textMuted }]}>TRIP NAME</Text>
                                    <TextInput
                                        style={[styles.modalInput, { color: COLORS.text, borderColor: COLORS.border }]}
                                        value={editForm.name}
                                        onChangeText={(name) => setEditForm(prev => ({ ...prev, name }))}
                                        placeholder="Enter trip name..."
                                        placeholderTextColor={COLORS.textMuted}
                                    />
                                </View>

                                <View style={styles.inputSection}>
                                    <Text style={[styles.inputLabel, { color: COLORS.textMuted }]}>EMOJI</Text>
                                    <TextInput
                                        style={[styles.modalInput, { color: COLORS.text, borderColor: COLORS.border, fontSize: 24, textAlign: 'center' }]}
                                        value={editForm.emoji}
                                        onChangeText={(emoji) => setEditForm(prev => ({ ...prev, emoji }))}
                                        maxLength={2}
                                    />
                                </View>

                                <TouchableOpacity 
                                    style={[styles.saveBtn, { backgroundColor: COLORS.primary }]}
                                    onPress={handleUpdate}
                                >
                                    <Text style={styles.saveBtnText}>Save Changes</Text>
                                </TouchableOpacity>
                            </Animated.View>
                        </TouchableWithoutFeedback>
                    </Animated.View>
                </TouchableWithoutFeedback>
            </Modal>

            {/* More Options Menu */}
            <Modal
                visible={menuVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setMenuVisible(false)}
            >
                <TouchableWithoutFeedback onPress={() => setMenuVisible(false)}>
                    <Animated.View style={[styles.menuOverlay, { opacity: menuAnim }]}>
                        <View style={[styles.menuContent, { backgroundColor: COLORS.surface }]}>
                            <Text style={[styles.menuTitle, { color: COLORS.textMuted }]}>TRIP OPTIONS</Text>
                            
                            {isOwner && (
                                <TouchableOpacity 
                                    style={styles.menuItem} 
                                    onPress={() => {
                                        setMenuVisible(false);
                                        setEditModalVisible(true);
                                    }}
                                >
                                    <Feather name="edit-2" size={18} color={COLORS.text} />
                                    <Text style={[styles.menuItemText, { color: COLORS.text }]}>Edit Trip Details</Text>
                                </TouchableOpacity>
                            )}

                            {isOwner && (
                                <TouchableOpacity style={styles.menuItem} onPress={handleArchiveOnly}>
                                    <Feather name="package" size={18} color={COLORS.text} />
                                    <Text style={[styles.menuItemText, { color: COLORS.text }]}>Archive (No Settlement)</Text>
                                </TouchableOpacity>
                            )}

                            {isOwner && (
                                <TouchableOpacity style={styles.menuItem} onPress={handleSettle}>
                                    <Feather name="check-square" size={18} color={COLORS.primary} />
                                    <Text style={[styles.menuItemText, { color: COLORS.primary }]}>Finalize & Settle Up</Text>
                                </TouchableOpacity>
                            )}

                            {isOwner && <View style={[styles.menuDivider, { backgroundColor: COLORS.border }]} />}

                            {!isOwner && (
                                <TouchableOpacity 
                                    style={styles.menuItem} 
                                    onPress={handleLeave}
                                >
                                    <Feather name="log-out" size={18} color="#ef4444" />
                                    <Text style={[styles.menuItemText, { color: '#ef4444' }]}>Leave Trip</Text>
                                </TouchableOpacity>
                            )}

                            {isOwner && (
                                <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
                                    <Text style={{ fontSize: 10, color: COLORS.textMuted, fontStyle: 'italic' }}>
                                        You are the owner of this trip.
                                    </Text>
                                </View>
                            )}
                        </View>
                    </Animated.View>
                </TouchableWithoutFeedback>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    safe: { flex: 1 },
    cover: { paddingBottom: 30, borderBottomLeftRadius: 30, borderBottomRightRadius: 30 },
    navHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 10 },
    circleBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
    coverTitle: { flex: 1, marginHorizontal: 12, color: '#fff', fontSize: 18, fontWeight: '800', textAlign: 'center' },
    coverBody: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 25, marginTop: 25 },
    emojiCircle: { width: 64, height: 64, borderRadius: 24, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
    emojiText: { fontSize: 32 },
    totalLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
    totalAmount: { color: '#fff', fontSize: 26, fontWeight: '900', marginTop: 2 },
    myStatusCard: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, alignItems: 'center' },
    statusLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 8, fontWeight: '800' },
    statusAmount: { color: '#fff', fontSize: 14, fontWeight: '900' },
    tabsRow: { flexDirection: 'row', paddingHorizontal: 10, borderBottomWidth: 1 },
    tab: { flex: 1, height: 50, justifyContent: 'center', alignItems: 'center' },
    tabText: { fontSize: 14 },
    listContent: { padding: 20 },
    emptyView: { alignItems: 'center', justifyContent: 'center', marginTop: 60 },
    emptyText: { fontSize: 14, textAlign: 'center', marginTop: 16, maxWidth: '80%' },
    expenseItem: { padding: 14, borderRadius: 18, marginBottom: 12, borderWidth: 1 },
    expenseMainRow: { flexDirection: 'row', alignItems: 'center' },
    categoryIcon: { width: 40, height: 40, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
    expDesc: { fontSize: 15, fontWeight: '700' },
    expMeta: { fontSize: 11, marginTop: 2 },
    expAmount: { fontSize: 15, fontWeight: '800' },
    expSplit: { fontSize: 10, marginTop: 2 },
    listBreakdown: {
        marginTop: 10,
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: 'rgba(0,0,0,0.03)',
        gap: 8
    },
    listBreakdownRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingLeft: 52 // Align with description
    },
    listBreakdownLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8
    },
    listBreakdownAvatar: {
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: 'rgba(0,0,0,0.05)',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden'
    },
    listBreakdownName: {
        fontSize: 11,
        fontWeight: '600'
    },
    listBreakdownAmt: {
        fontSize: 11,
        fontWeight: '700'
    },
    memberItem: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 18, marginBottom: 10, borderWidth: 1 },
    memberAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.05)', justifyContent: 'center', alignItems: 'center' },
    avatarImg: { width: '100%', height: '100%', borderRadius: 20 },
    avatarInitial: { fontSize: 16, fontWeight: '700' },
    memberName: { fontSize: 15, fontWeight: '700' },
    memberTag: { fontSize: 11, marginTop: 1 },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    statusBadgeText: { fontSize: 9, fontWeight: '800' },
    infoBox: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, marginBottom: 20, gap: 10 },
    infoText: { fontSize: 12, fontWeight: '600', flex: 1 },
    transferCard: { padding: 16, borderRadius: 20, marginBottom: 12, borderWidth: 1 },
    transferFlow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    userColumn: { flex: 1, alignItems: 'center' },
    userName: { fontSize: 14, fontWeight: '800' },
    userAction: { fontSize: 10, fontWeight: '600', marginTop: 2 },
    arrowContainer: { alignItems: 'center', flex: 1 },
    transferAmount: { fontSize: 16, fontWeight: '900', marginBottom: 4 },
    settleBtn: { height: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginTop: 20 },
    settleBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
    archivedBadge: { height: 50, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginTop: 20 },
    archivedText: { fontSize: 12, fontWeight: '800', letterSpacing: 1 },
    fab: { position: 'absolute', bottom: 30, right: 20, width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8 },
    
    // Menu Styles
    menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-start', alignItems: 'flex-end', paddingHorizontal: 20, paddingTop: 60 },
    menuContent: { width: 220, borderRadius: 20, paddingVertical: 12, elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 15 },
    menuTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 1, paddingHorizontal: 16, paddingVertical: 8 },
    menuItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
    menuItemText: { fontSize: 14, fontWeight: '600' },
    menuDivider: { height: 1, marginVertical: 8, marginHorizontal: 16 },

    // Modal Styles
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: { borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 25, paddingBottom: 40 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25 },
    modalTitle: { fontSize: 20, fontWeight: '800' },
    inputSection: { marginBottom: 20 },
    inputLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 8 },
    modalInput: { height: 56, borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, fontSize: 16, fontWeight: '600' },
    saveBtn: { height: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginTop: 10 },
    saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' }
});
