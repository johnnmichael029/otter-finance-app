import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Dimensions, Animated } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

const CalculatorSheet = ({ visible, onClose, onConfirm, initialValue = '0', currencySymbol = '₱' }) => {
    const COLORS = useTheme(state => state.COLORS);
    const styles = getStyles(COLORS);

    const [showModal, setShowModal] = useState(visible);
    const [expression, setExpression] = useState('0');
    const slideAnim = React.useRef(new Animated.Value(Dimensions.get('window').height)).current;
    const fadeAnim = React.useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            setShowModal(true);
            setExpression(initialValue && initialValue !== '0' ? initialValue.toString() : '0');
            Animated.parallel([
                Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
                Animated.spring(slideAnim, { toValue: 0, tension: 65, friction: 10, useNativeDriver: true })
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
                Animated.timing(slideAnim, { toValue: Dimensions.get('window').height, duration: 250, useNativeDriver: true })
            ]).start(() => {
                setShowModal(false);
            });
        }
    }, [visible]);

    const handlePress = (val) => {
        setExpression(prev => {
            if (prev === '0' && val !== '.') {
                if (['+', '-', '×', '÷'].includes(val)) return prev + val;
                return val;
            }
            return prev + val;
        });
    };

    const handleDelete = () => {
        setExpression(prev => prev.length > 1 ? prev.slice(0, -1) : '0');
    };

    const handleClear = () => {
        setExpression('0');
    };

    const evaluateExpression = (expr) => {
        try {
            // Replace visual operators with JS operators
            let toEval = expr.replace(/×/g, '*').replace(/÷/g, '/');
            // Remove any trailing operators before evaluating
            toEval = toEval.replace(/[+\-*/.]$/, '');
            if (!toEval) return '0';

            // Basic eval logic using Function
            const result = new Function('return ' + toEval)();
            return Number.isFinite(result) ? result.toString() : '0';
        } catch (e) {
            return expr; // If it fails (e.g. invalid syntax), just return the raw string
        }
    };

    const handleEquals = () => {
        const result = evaluateExpression(expression);
        setExpression(result);
    };

    const handleDone = () => {
        const result = evaluateExpression(expression);
        // Format to 2 decimal places if it's a valid number
        const numResult = parseFloat(result);
        if (!isNaN(numResult) && numResult > 0) {
            // Return clean number string
            onConfirm(numResult.toString());
        } else {
            onConfirm('');
        }
        onClose();
    };

    // Calculate current live preview
    let livePreview = '';
    try {
        const evaled = evaluateExpression(expression);
        // Only show preview if the expression actually has operators and isn't just a plain number
        if (evaled !== expression && expression.match(/[+\-×÷]/)) {
            livePreview = evaled;
        }
    } catch { }

    const renderBtn = (label, type = 'default', onPress, flexCount = 1, icon = null) => {
        let bgColor = COLORS.surface;
        let textColor = COLORS.text;

        if (type === 'operator') {
            bgColor = COLORS.primary + '15';
            textColor = COLORS.primary;
        } else if (type === 'action') {
            bgColor = COLORS.border;
        } else if (type === 'done') {
            bgColor = COLORS.primary;
            textColor = '#fff';
        }

        return (
            <TouchableOpacity
                style={[styles.btn, { backgroundColor: bgColor, flex: flexCount }]}
                onPress={onPress}
                activeOpacity={0.7}
            >
                {icon ? icon : (
                    <Text style={[
                        styles.btnText,
                        { color: textColor },
                        type === 'operator' && { fontSize: 28, fontWeight: '500' },
                        type === 'done' && { fontSize: 18, fontWeight: '800', letterSpacing: 1 }
                    ]}>
                        {label}
                    </Text>
                )}
            </TouchableOpacity>
        );
    };

    return (
        <Modal visible={showModal} animationType="none" transparent={true} onRequestClose={onClose}>
            <View style={styles.overlay}>
                <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
                    <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
                </Animated.View>

                <Animated.View style={[styles.sheet, { backgroundColor: COLORS.background, borderColor: COLORS.border, transform: [{ translateY: slideAnim }] }]}>
                    {/* Handle */}
                    <View style={styles.handleContainer}>
                        <View style={[styles.handle, { backgroundColor: COLORS.border }]} />
                    </View>

                    {/* Display Area */}
                    <View style={styles.displayContainer}>
                        <Text style={[styles.livePreview, { color: COLORS.textMuted }]}>
                            {livePreview ? `${currencySymbol}${Number(livePreview).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}` : ' '}
                        </Text>
                        <Text style={[styles.expression, { color: COLORS.text }]} numberOfLines={1} adjustsFontSizeToFit>
                            {currencySymbol} {expression}
                        </Text>
                    </View>

                    {/* Keypad */}
                    <View style={styles.keypad}>
                        <View style={styles.row}>
                            {renderBtn('C', 'action', handleClear)}
                            {renderBtn('÷', 'operator', () => handlePress('÷'))}
                            {renderBtn('×', 'operator', () => handlePress('×'))}
                            {renderBtn('⌫', 'action', handleDelete, 1, <Feather name="delete" size={24} color={COLORS.text} />)}
                        </View>
                        <View style={styles.row}>
                            {renderBtn('7', 'default', () => handlePress('7'))}
                            {renderBtn('8', 'default', () => handlePress('8'))}
                            {renderBtn('9', 'default', () => handlePress('9'))}
                            {renderBtn('-', 'operator', () => handlePress('-'))}
                        </View>
                        <View style={styles.row}>
                            {renderBtn('4', 'default', () => handlePress('4'))}
                            {renderBtn('5', 'default', () => handlePress('5'))}
                            {renderBtn('6', 'default', () => handlePress('6'))}
                            {renderBtn('+', 'operator', () => handlePress('+'))}
                        </View>
                        <View style={styles.row}>
                            {renderBtn('1', 'default', () => handlePress('1'))}
                            {renderBtn('2', 'default', () => handlePress('2'))}
                            {renderBtn('3', 'default', () => handlePress('3'))}
                            {renderBtn('=', 'operator', handleEquals)}
                        </View>
                        <View style={styles.row}>
                            {renderBtn('.', 'default', () => handlePress('.'))}
                            {renderBtn('0', 'default', () => handlePress('0'))}
                            {renderBtn('DONE', 'done', handleDone, 2)}
                        </View>
                    </View>
                </Animated.View>
            </View>
        </Modal>
    );
};

const getStyles = (COLORS) => StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    sheet: {
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        borderTopWidth: 1,
        borderLeftWidth: 1,
        borderRightWidth: 1,
        paddingBottom: 30, // Safe area padding
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -10 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
        elevation: 20,
    },
    handleContainer: {
        width: '100%',
        alignItems: 'center',
        paddingVertical: 16,
    },
    handle: {
        width: 40,
        height: 5,
        borderRadius: 3,
    },
    displayContainer: {
        paddingHorizontal: 24,
        paddingBottom: 20,
        alignItems: 'flex-end',
    },
    livePreview: {
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 4,
        minHeight: 20, // Keep space even if empty
    },
    expression: {
        fontSize: 48,
        fontWeight: '800',
    },
    keypad: {
        paddingHorizontal: 16,
        gap: 12,
    },
    row: {
        flexDirection: 'row',
        gap: 12,
    },
    btn: {
        height: 60,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    btnText: {
        fontSize: 24,
        fontWeight: '600',
    },
});

export default CalculatorSheet;
