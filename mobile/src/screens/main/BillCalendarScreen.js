import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { getRecurringBills, getDebts } from '../../api/api';
import { formatCurrency } from '../../utils/formatters';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';

// Utility to get days in month
const getDaysInMonth = (year, month) => {
    return new Date(year, month + 1, 0).getDate();
};

const getFirstDayOfMonth = (year, month) => {
    return new Date(year, month, 1).getDay();
};

// Generate projection for recurring bills
const projectRecurringBills = (bill, monthsForward = 6) => {
    const projections = [];
    let current = new Date(bill.nextDueDate);
    const endLimit = new Date();
    endLimit.setMonth(endLimit.getMonth() + monthsForward);

    // Safety counter to prevent infinite loops
    let count = 0;
    while (current <= endLimit && count < 50) {
        projections.push(new Date(current));

        if (bill.frequency === 'daily') current.setDate(current.getDate() + 1);
        else if (bill.frequency === 'weekly') current.setDate(current.getDate() + 7);
        else if (bill.frequency === 'monthly') current.setMonth(current.getMonth() + 1);
        else if (bill.frequency === 'quarterly') current.setMonth(current.getMonth() + 3);
        else if (bill.frequency === 'yearly') current.setFullYear(current.getFullYear() + 1);
        else break;

        count++;
    }
    return projections;
};

const isSameDay = (d1, d2) => {
    if (!d1 || !d2) return false;
    const date1 = new Date(d1);
    const date2 = new Date(d2);
    return date1.getFullYear() === date2.getFullYear() &&
        date1.getMonth() === date2.getMonth() &&
        date1.getDate() === date2.getDate();
};

export default function BillCalendarScreen({ navigation }) {
    const COLORS = useTheme(state => state.COLORS);
    const [selectedDate, setSelectedDate] = useState(new Date(new Date().setHours(0, 0, 0, 0)));
    const [viewDate, setViewDate] = useState(new Date()); // The month we are currently viewing
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);

    const loadData = async () => {
        setLoading(true);
        try {
            const [billsRes, debtsRes] = await Promise.all([
                getRecurringBills({ limit: 100 }),
                getDebts({ limit: 100 })
            ]);

            const rawBills = billsRes.data || [];
            const rawDebts = debtsRes.data || [];
            const combined = [];

            // Project Bills across the calendar
            rawBills.forEach(b => {
                if (b.nextDueDate) {
                    const occurrences = projectRecurringBills(b);
                    occurrences.forEach((occDate, idx) => {
                        combined.push({
                            id: `bill_${b._id}_${idx}`,
                            type: 'bill',
                            date: occDate,
                            title: b.name,
                            subtitle: b.frequency,
                            amount: b.amount,
                            icon: b.categoryIcon || 'file-text',
                            color: b.categoryColor || '#ef4444',
                            original: b
                        });
                    });
                }
            });

            // Map Debts (usually one-off due dates)
            rawDebts.forEach(d => {
                if (d.dueDate && (d.status === 'pending' || d.status === 'partial')) {
                    combined.push({
                        id: `debt_${d._id}`,
                        type: 'debt',
                        date: new Date(d.dueDate),
                        title: d.direction === 'owed_by_me' ? `You owe ${d.personName}` : `${d.personName} owes you`,
                        subtitle: 'Debt',
                        amount: d.totalOwed,
                        icon: 'user',
                        color: d.direction === 'owed_by_me' ? '#ef4444' : '#22c55e',
                        original: d
                    });
                }
            });

            setItems(combined);
        } catch (error) {
            console.error('[Calendar] Error loading:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const itemsOnSelectedDate = items.filter(item => isSameDay(item.date, selectedDate));

    // Calendar Grid Logic
    const renderCalendarGrid = () => {
        const year = viewDate.getFullYear();
        const month = viewDate.getMonth();
        const daysInMonth = getDaysInMonth(year, month);
        const firstDay = getFirstDayOfMonth(year, month);

        const days = [];
        // Padding for first week
        for (let i = 0; i < firstDay; i++) {
            days.push(null);
        }
        // Actual days
        for (let i = 1; i <= daysInMonth; i++) {
            days.push(new Date(year, month, i));
        }

        return (
            <View style={styles.grid}>
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                    <View key={i} style={styles.gridHeaderCell}>
                        <Text style={[styles.gridHeaderDay, { color: COLORS.textMuted }]}>{d}</Text>
                    </View>
                ))}
                {days.map((day, i) => {
                    if (!day) return <View key={`empty-${i}`} style={styles.gridCell} />;

                    const isSelected = isSameDay(day, selectedDate);
                    const isToday = isSameDay(day, new Date());
                    const hasItems = items.some(item => isSameDay(item.date, day));
                    const dayItems = items.filter(item => isSameDay(item.date, day));

                    return (
                        <TouchableOpacity
                            key={i}
                            style={[
                                styles.gridCell,
                                isSelected && { backgroundColor: COLORS.primary + '15', borderRadius: 12 }
                            ]}
                            onPress={() => setSelectedDate(day)}
                        >
                            <View style={[
                                styles.dayCircle,
                                isSelected && { backgroundColor: COLORS.primary },
                                isToday && !isSelected && { borderColor: COLORS.primary, borderWidth: 1 }
                            ]}>
                                <Text style={[
                                    styles.dayText,
                                    { color: isSelected ? '#fff' : (isToday ? COLORS.primary : COLORS.text) }
                                ]}>
                                    {day.getDate()}
                                </Text>
                            </View>
                            <View style={styles.dotContainer}>
                                {dayItems.slice(0, 3).map((it, idx) => (
                                    <View key={idx} style={[styles.miniDot, { backgroundColor: it.color }]} />
                                ))}
                                {dayItems.length > 3 && <View style={[styles.miniDot, { backgroundColor: COLORS.textMuted }]} />}
                            </View>
                        </TouchableOpacity>
                    );
                })}
            </View>
        );
    };

    const renderEvent = ({ item, index }) => {
        return (
            <Animated.View
                entering={FadeInDown.delay(index * 100).springify()}
                layout={LinearTransition.springify()}
            >
                <TouchableOpacity
                    style={[styles.eventCard, { backgroundColor: COLORS.surface }]}
                    onPress={() => {
                        if (item.type === 'bill') {
                            navigation.navigate('RecurringBills');
                        } else {
                            navigation.navigate('DebtScreen');
                        }
                    }}
                >
                    <View style={[styles.iconContainer, { backgroundColor: item.color + '20' }]}>
                        <Feather name={item.icon} size={20} color={item.color} />
                    </View>
                    <View style={styles.eventInfo}>
                        <Text style={[styles.eventTitle, { color: COLORS.text }]}>{item.title}</Text>
                        <Text style={[styles.eventSub, { color: COLORS.textMuted }]}>{item.subtitle}</Text>
                    </View>
                    <Text style={[styles.eventAmount, { color: COLORS.text }]}>
                        {formatCurrency(item.amount)}
                    </Text>
                </TouchableOpacity>
            </Animated.View>
        );
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: COLORS.background }]} edges={['top']}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Feather name="arrow-left" size={24} color={COLORS.text} />
                </TouchableOpacity>
                <View style={styles.monthSelector}>
                    <TouchableOpacity onPress={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))}>
                        <Feather name="chevron-left" size={24} color={COLORS.text} />
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, { color: COLORS.text }]}>
                        {viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </Text>
                    <TouchableOpacity onPress={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))}>
                        <Feather name="chevron-right" size={24} color={COLORS.text} />
                    </TouchableOpacity>
                </View>
                <View style={{ width: 40 }} />
            </View>

            {/* Monthly Grid */}
            <View style={styles.calendarContainer}>
                {renderCalendarGrid()}
            </View>

            {/* Selected Date Header */}
            <View style={styles.listHeader}>
                <View>
                    <Text style={[styles.listTitle, { color: COLORS.text }]}>
                        {isSameDay(selectedDate, new Date()) ? 'Today' : selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                    </Text>
                    <Text style={[styles.listSub, { color: COLORS.textMuted }]}>
                        {itemsOnSelectedDate.length} item{itemsOnSelectedDate.length !== 1 ? 's' : ''} due
                    </Text>
                </View>
                {itemsOnSelectedDate.length > 0 && (
                    <View style={styles.totalBadge}>
                        <Text style={styles.totalLabel}>Total: </Text>
                        <Text style={styles.totalAmount}>{formatCurrency(itemsOnSelectedDate.reduce((sum, i) => sum + i.amount, 0))}</Text>
                    </View>
                )}
            </View>

            {/* Events List */}
            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={COLORS.primary} />
                </View>
            ) : itemsOnSelectedDate.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <Feather name="calendar" size={48} color={COLORS.textMuted} style={{ opacity: 0.3, marginBottom: 16 }} />
                    <Text style={[styles.emptyText, { color: COLORS.text }]}>No activities on this date</Text>
                    <Text style={[styles.emptySub, { color: COLORS.textMuted }]}>Projected recurring bills will appear here.</Text>
                </View>
            ) : (
                <FlatList
                    data={itemsOnSelectedDate}
                    keyExtractor={item => item.id}
                    renderItem={renderEvent}
                    contentContainerStyle={styles.listContainer}
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 12,
    },
    backBtn: { padding: 4 },
    monthSelector: {
        flexDirection: 'row', alignItems: 'center', gap: 12
    },
    headerTitle: { fontSize: 18, fontWeight: '800', width: 140, textAlign: 'center' },
    calendarContainer: {
        paddingHorizontal: 16,
        marginBottom: 8,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    gridHeaderCell: {
        width: '14.28%',
        alignItems: 'center',
        paddingVertical: 10,
    },
    gridHeaderDay: {
        fontSize: 12,
        fontWeight: '700',
    },
    gridCell: {
        width: '14.28%',
        height: 60,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 4,
    },
    dayCircle: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dayText: {
        fontSize: 14,
        fontWeight: '700',
    },
    dotContainer: {
        flexDirection: 'row',
        gap: 2,
        marginTop: 4,
        height: 4,
        justifyContent: 'center',
    },
    miniDot: {
        width: 4,
        height: 4,
        borderRadius: 2,
    },
    listHeader: {
        paddingHorizontal: 20,
        paddingVertical: 16,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: 'rgba(0,0,0,0.05)'
    },
    listTitle: {
        fontSize: 18,
        fontWeight: '800'
    },
    listSub: {
        fontSize: 13,
        fontWeight: '600'
    },
    totalBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.05)',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 12
    },
    totalLabel: {
        fontSize: 12,
        fontWeight: '600',
        opacity: 0.6
    },
    totalAmount: {
        fontSize: 14,
        fontWeight: '800'
    },
    listContainer: {
        paddingHorizontal: 20,
        paddingBottom: 40,
        gap: 12
    },
    eventCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2
    },
    iconContainer: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16
    },
    eventInfo: {
        flex: 1
    },
    eventTitle: {
        fontSize: 15,
        fontWeight: '700',
        marginBottom: 2
    },
    eventSub: {
        fontSize: 12,
        fontWeight: '500',
        textTransform: 'capitalize'
    },
    eventAmount: {
        fontSize: 15,
        fontWeight: '800'
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center'
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingBottom: 100
    },
    emptyText: {
        fontSize: 16,
        fontWeight: '700',
        marginBottom: 4
    },
    emptySub: {
        fontSize: 13,
        textAlign: 'center'
    }
});
