import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as api from '../api/api';

export const useFinanceStore = create(
    persist(
        (set, get) => ({
            // ─── Data Caches ───
            debts: [],
            recurringBills: [],
            transactions: [],
            transactionSummary: { totalIncome: 0, totalExpenses: 0, balance: 0, incomeDist: [], expenseDist: [] },
            savingsGoals: [],
            savingsMasterPot: null,
            wallets: [],
            cryptoPrices: {},

            // ─── UI State ───
            hideGlobalBalance: false,
            setHideGlobalBalance: (val) => set({ hideGlobalBalance: val }),
            currencyModalVisible: false,
            setCurrencyModalVisible: (val) => set({ currencyModalVisible: val }),

            // ─── Loading States ───
            isLoadingDebts: false,
            isLoadingBills: false,
            isLoadingTransactions: false,
            isLoadingSummary: false,
            isLoadingSavings: false,
            isLoadingWallets: false,

            // ─── Fetch Methods ───
            fetchWallets: async (force = false) => {
                if (!force && get().wallets.length > 0) return;
                set({ isLoadingWallets: true });
                try {
                    const res = await api.getWallets();
                    const wallets = res.wallets || [];
                    set({ wallets });
                    get().fetchCryptoPrices(wallets);
                } catch (e) {
                    console.warn('[FinanceStore] fetchWallets error:', e.message);
                } finally {
                    set({ isLoadingWallets: false });
                }
            },

            fetchCryptoPrices: async (wallets) => {
                const coinIds = wallets
                    .filter(w => w.type === 'Crypto' && w.coinId)
                    .map(w => w.coinId);

                if (!coinIds.length) return;

                try {
                    const uniIds = [...new Set(coinIds)].join(',');
                    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${uniIds}&vs_currencies=php`);
                    const data = await res.json();
                    const pricesConfig = {};
                    for (let id in data) pricesConfig[id] = data[id].php;

                    set(state => ({ cryptoPrices: { ...state.cryptoPrices, ...pricesConfig } }));
                } catch (e) {
                    console.warn('[FinanceStore] fetchCryptoPrices error:', e.message);
                }
            },

            fetchDebts: async (force = false) => {
                if (!force && get().debts.length > 0) return;
                set({ isLoadingDebts: true });
                try {
                    const res = await api.getDebts({ limit: 100, page: 1 });
                    set({ debts: res.data || [] });
                } catch (e) {
                    console.warn('[FinanceStore] fetchDebts error:', e.message);
                } finally {
                    set({ isLoadingDebts: false });
                }
            },

            fetchRecurringBills: async (force = false) => {
                if (!force && get().recurringBills.length > 0) return;
                set({ isLoadingBills: true });
                try {
                    const res = await api.getRecurringBills({ limit: 100, page: 1 });
                    set({ recurringBills: res.data || [] });
                } catch (e) {
                    console.warn('[FinanceStore] fetchBills error:', e.message);
                } finally {
                    set({ isLoadingBills: false });
                }
            },

            fetchTransactions: async (force = false) => {
                if (!force && get().transactions.length > 0) return;
                set({ isLoadingTransactions: true });
                try {
                    const res = await api.getTransactions({ limit: 20, page: 1 });
                    const data = Array.isArray(res) ? res : (res.transactions || res.data || []);
                    set({ transactions: data });
                } catch (e) {
                    console.warn('[FinanceStore] fetchTx error:', e.message);
                } finally {
                    set({ isLoadingTransactions: false });
                }
            },

            fetchTransactionSummary: async (range = 'week', force = false) => {
                set({ isLoadingSummary: true });
                try {
                    const data = await api.getTransactionSummary({ range });
                    set({ transactionSummary: data || {} });
                } catch (e) {
                    console.warn('[FinanceStore] fetchSummary error:', e.message);
                } finally {
                    set({ isLoadingSummary: false });
                }
            },

            fetchSavings: async (force = false) => {
                if (!force && get().savingsGoals.length > 0) return;
                set({ isLoadingSavings: true });
                try {
                    const res = await api.getSavingsGoals({ limit: 100, page: 1 });
                    const allGoals = res.goals || [];
                    const master = allGoals.find(g => g.name === 'Savings Balance') || null;
                    const active = allGoals.filter(g => g.name !== 'Savings Balance' && !(g.isCompleted && g.currentAmount === 0));
                    set({ savingsMasterPot: master, savingsGoals: active });
                } catch (e) {
                    console.warn('[FinanceStore] fetchSavings error:', e.message);
                } finally {
                    set({ isLoadingSavings: false });
                }
            },

            // ─── Global Refresher ───
            refreshAll: async () => {
                const { fetchDebts, fetchRecurringBills, fetchTransactions, fetchTransactionSummary, fetchSavings, fetchWallets } = get();
                await Promise.all([
                    fetchDebts(true),
                    fetchRecurringBills(true),
                    fetchTransactions(true),
                    fetchTransactionSummary('week', true),
                    fetchSavings(true),
                    fetchWallets(true)
                ].filter(Boolean));
            },

            // ─── Synchronous Mutations ───
            addTransactionSync: (tx) => {
                set((state) => ({ transactions: [tx, ...state.transactions] }));
            },
            addDebtSync: (debt) => {
                set((state) => ({ debts: [...state.debts, debt] }));
            },
            addBillSync: (bill) => {
                set((state) => ({ recurringBills: [...state.recurringBills, bill] }));
            },
            updateWalletSync: (updatedWallet) => {
                if (updatedWallet._id === 'main') {
                    set(state => ({
                        transactionSummary: { ...state.transactionSummary, balance: updatedWallet.balance }
                    }));
                    return;
                }
                set(state => ({
                    wallets: state.wallets.map(w => w._id === updatedWallet._id ? { ...w, ...updatedWallet } : w)
                }));
            },
        }),
        {
            name: 'otter-finance-storage',
            storage: createJSONStorage(() => AsyncStorage),
            partialize: (state) => ({
                debts: state.debts,
                recurringBills: state.recurringBills,
                transactions: state.transactions,
                transactionSummary: state.transactionSummary,
                savingsGoals: state.savingsGoals,
                savingsMasterPot: state.savingsMasterPot,
                wallets: state.wallets,
            })
        }
    )
);
