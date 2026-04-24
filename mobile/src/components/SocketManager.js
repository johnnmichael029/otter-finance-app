import React, { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getSocket, connectSocket } from '../utils/socket';
import { useFinanceStore } from '../store/financeStore';

const SocketManager = () => {
    const { userInfo } = useAuth();
    const updateWalletSync = useFinanceStore(state => state.updateWalletSync);
    const addTransactionSync = useFinanceStore(state => state.addTransactionSync);
    const fetchSavings = useFinanceStore(state => state.fetchSavings);
    const fetchTransactionSummary = useFinanceStore(state => state.fetchTransactionSummary);

    useEffect(() => {
        if (!userInfo?._id) return;

        connectSocket(userInfo._id);
        const socket = getSocket();

        // ── WALLET UPDATES ──
        const handleWalletUpdate = (wallet) => {
            console.log('[SOCKET] Wallet updated:', wallet.name || 'Main Balance');
            updateWalletSync(wallet);
        };

        // ── TRANSACTION UPDATES ──
        const handleNewTransaction = (tx) => {
            console.log('[SOCKET] New transaction:', tx.description);
            addTransactionSync(tx);
            // Also refresh summary since it depends on totals
            fetchTransactionSummary('week', true);
        };

        // ── SAVINGS UPDATES ──
        const handleSavingsUpdate = () => {
            console.log('[SOCKET] Savings updated, refreshing...');
            fetchSavings(true);
        };

        socket.on('wallet_updated', handleWalletUpdate);
        socket.on('new_transaction', handleNewTransaction);
        socket.on('new_savings_goal', handleSavingsUpdate);
        socket.on('update_savings_goal', handleSavingsUpdate);
        socket.on('new_savings_transfer', handleSavingsUpdate);

        return () => {
            socket.off('wallet_updated', handleWalletUpdate);
            socket.off('new_transaction', handleNewTransaction);
            socket.off('new_savings_goal', handleSavingsUpdate);
            socket.off('update_savings_goal', handleSavingsUpdate);
            socket.off('new_savings_transfer', handleSavingsUpdate);
        };
    }, [userInfo?._id]);

    return null; // Side-effect only component
};

export default SocketManager;
