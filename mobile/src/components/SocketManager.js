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
    const fetchTransactions = useFinanceStore(state => state.fetchTransactions);
    const fetchDebts = useFinanceStore(state => state.fetchDebts);

    useEffect(() => {
        if (!userInfo?._id) return;

        connectSocket(userInfo._id);
        const socket = getSocket();
        const { debouncedRefreshSummary, debouncedRefreshSavings, debouncedRefreshDebts } = useFinanceStore.getState();

        // ── WALLET UPDATES ──
        const handleWalletUpdate = (wallet) => {
            console.log('[SOCKET] Wallet updated:', wallet.name || 'Main Balance');
            updateWalletSync(wallet);
        };

        // ── TRANSACTION UPDATES ──
        const handleNewTransaction = (tx) => {
            console.log('[SOCKET] New transaction:', tx.description);
            addTransactionSync(tx);
            debouncedRefreshSummary('week');
        };

        const handleTransactionDelete = (data) => {
            console.log('[SOCKET] Transaction deleted:', data._id);
            useFinanceStore.getState().deleteTransactionSync(data._id);
            debouncedRefreshSummary('week');
        };

        // ── SAVINGS UPDATES ──
        const handleSavingsUpdate = () => {
            console.log('[SOCKET] Savings updated, refreshing...');
            debouncedRefreshSavings();
            debouncedRefreshSummary('week');
        };

        // ── DEBT UPDATES ──
        const handleDebtUpdate = () => {
            console.log('[SOCKET] Debt updated, refreshing...');
            debouncedRefreshDebts();
        };

        socket.on('wallet_updated', handleWalletUpdate);
        socket.on('new_transaction', handleNewTransaction);
        socket.on('delete_transaction', handleTransactionDelete);
        socket.on('new_savings_goal', handleSavingsUpdate);
        socket.on('update_savings_goal', handleSavingsUpdate);
        socket.on('new_savings_transfer', handleSavingsUpdate);
        socket.on('new_debt', handleDebtUpdate);
        socket.on('update_debt', handleDebtUpdate);
        socket.on('delete_debt', handleDebtUpdate);
        socket.on('new_debt_request', handleDebtUpdate); // P2P - refresh when a friend sends a request

        return () => {
            socket.off('wallet_updated', handleWalletUpdate);
            socket.off('new_transaction', handleNewTransaction);
            socket.off('delete_transaction', handleTransactionDelete);
            socket.off('new_savings_goal', handleSavingsUpdate);
            socket.off('update_savings_goal', handleSavingsUpdate);
            socket.off('new_savings_transfer', handleSavingsUpdate);
            socket.off('new_debt', handleDebtUpdate);
            socket.off('update_debt', handleDebtUpdate);
            socket.off('delete_debt', handleDebtUpdate);
            socket.off('new_debt_request', handleDebtUpdate);
        };
    }, [userInfo?._id]);

    return null; // Side-effect only component
};

export default SocketManager;
