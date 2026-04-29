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
        const {
            debouncedRefreshSummary,
            debouncedRefreshSavings,
            debouncedRefreshDebts,
            debouncedRefreshAll,
            updateNotifCount,
            setNotifCount,
            updateRequestsCount
        } = useFinanceStore.getState();

        // ── WALLET UPDATES ──
        const handleWalletUpdate = (wallet) => {
            console.log('[SOCKET] Wallet updated:', wallet.name || 'Main Balance');
            updateWalletSync(wallet);
        };

        // ── TRANSACTION UPDATES ──
        const handleNewTransaction = (tx) => {
            console.log('[SOCKET] New transaction:', tx.description);
            addTransactionSync(tx);
            debouncedRefreshSummary();
        };

        const handleTransactionUpdate = (tx) => {
            console.log('[SOCKET] Transaction updated:', tx._id);
            // We can rely on the debounced refresh to pull the updated data
            debouncedRefreshSummary();
        };

        const handleTransactionDelete = (data) => {
            console.log('[SOCKET] Transaction deleted:', data._id);
            useFinanceStore.getState().deleteTransactionSync(data._id);
            debouncedRefreshSummary();
        };

        // ── SAVINGS UPDATES ──
        const handleSavingsUpdate = () => {
            console.log('[SOCKET] Savings updated, refreshing...');
            debouncedRefreshSavings();
            debouncedRefreshSummary();
        };

        // ── DEBT UPDATES ──
        const handleNewDebt = (debt) => {
            console.log('[SOCKET] New debt:', debt.personName);
            useFinanceStore.getState().addDebtSync(debt);
            debouncedRefreshDebts();
        };

        const handleDebtUpdate = (debt) => {
            console.log('[SOCKET] Debt updated:', debt._id);
            useFinanceStore.getState().updateDebtSync(debt);
            debouncedRefreshDebts();
        };

        const handleDebtDelete = (data) => {
            console.log('[SOCKET] Debt deleted:', data._id || data);
            useFinanceStore.getState().deleteDebtSync(data._id || data);
            debouncedRefreshDebts();
        };

        const handleNewDebtRequest = (debt) => {
            console.log('[SOCKET] New debt request received');
            updateRequestsCount(1);
            debouncedRefreshDebts();
        };

        const handleChallengeUpdate = () => {
            console.log('[SOCKET] Challenges updated, refreshing...');
            const { refreshAll } = useFinanceStore.getState();
            refreshAll(true);
        };

        const handleGroupWalletUpdate = (data) => {
            console.log('[SOCKET] Group Wallet updated:', data?.groupId);
            debouncedRefreshAll();
        };

        const handleCurrencyUpdate = () => {
            console.log('[SOCKET] Currency updated, refreshing everything...');
            debouncedRefreshAll();
        };

        const handleFinancesWiped = () => {
            console.log('[SOCKET] Finances wiped, resetting store...');
            debouncedRefreshAll();
        };

        // ── SOCIAL & SYSTEM UPDATES ──
        socket.on('currency_updated', handleCurrencyUpdate);
        socket.on('finances_wiped', handleFinancesWiped);
        socket.on('update_group_wallet', handleGroupWalletUpdate);

        socket.on('new_notification', () => updateNotifCount(1));
        socket.on('notification_read', () => updateNotifCount(-1));
        socket.on('all_notifications_read', () => setNotifCount(0));

        socket.on('new_friend_request', () => updateRequestsCount(1));
        socket.on('friend_request_accepted', () => updateRequestsCount(-1));
        socket.on('friend_request_rejected', () => updateRequestsCount(-1));
        socket.on('friend_request_cancelled', () => updateRequestsCount(-1));

        socket.on('wallet_updated', handleWalletUpdate);
        socket.on('new_transaction', handleNewTransaction);
        socket.on('update_transaction', handleTransactionUpdate);
        socket.on('delete_transaction', handleTransactionDelete);
        socket.on('new_savings_goal', handleSavingsUpdate);
        socket.on('update_savings_goal', handleSavingsUpdate);
        socket.on('delete_savings_goal', handleSavingsUpdate);
        socket.on('new_savings_transfer', handleSavingsUpdate);
        socket.on('delete_savings_transfer', handleSavingsUpdate);
        socket.on('new_debt', handleNewDebt);
        socket.on('update_debt', handleDebtUpdate);
        socket.on('delete_debt', handleDebtDelete);
        socket.on('new_debt_request', handleNewDebtRequest);
        socket.on('new_challenge', handleChallengeUpdate);
        socket.on('update_challenge', handleChallengeUpdate);
        socket.on('delete_challenge', handleChallengeUpdate);
        socket.on('new_challenge_request', handleChallengeUpdate);
        socket.on('update_group_wallet', handleGroupWalletUpdate);

        return () => {
            socket.off('wallet_updated', handleWalletUpdate);
            socket.off('new_transaction', handleNewTransaction);
            socket.off('update_transaction', handleTransactionUpdate);
            socket.off('delete_transaction', handleTransactionDelete);
            socket.off('new_savings_goal', handleSavingsUpdate);
            socket.off('update_savings_goal', handleSavingsUpdate);
            socket.off('delete_savings_goal', handleSavingsUpdate);
            socket.off('new_savings_transfer', handleSavingsUpdate);
            socket.off('new_debt', handleNewDebt);
            socket.off('update_debt', handleDebtUpdate);
            socket.off('delete_debt', handleDebtDelete);
            socket.off('new_debt_request', handleNewDebtRequest);
            socket.off('new_challenge', handleChallengeUpdate);
            socket.off('update_challenge', handleChallengeUpdate);
            socket.off('delete_challenge', handleChallengeUpdate);
            socket.off('new_challenge_request', handleChallengeUpdate);
            socket.off('update_group_wallet', handleGroupWalletUpdate);
            socket.off('currency_updated', handleCurrencyUpdate);
            socket.off('finances_wiped', handleFinancesWiped);

            socket.off('new_notification');
            socket.off('notification_read');
            socket.off('all_notifications_read');

            socket.off('new_friend_request');
            socket.off('friend_request_accepted');
            socket.off('friend_request_rejected');
            socket.off('friend_request_cancelled');
        };
    }, [userInfo?._id]);

    return null; // Side-effect only component
};

export default SocketManager;
