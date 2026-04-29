import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as api from '../api/api';

let refreshAllTimeout = null;
let summaryTimeout = null;
let savingsTimeout = null;
let debtsTimeout = null;
let lastRefreshTime = 0;

export const useFinanceStore = create(
    persist(
        (set, get) => ({
            // ─── Data Caches ───
            debts: [],
            recurringBills: [],
            transactions: [],
            transactionSummary: { totalIncome: 0, totalExpenses: 0, balance: 0, incomeDist: [], expenseDist: [] },
            netBalance: 0,
            savingsGoals: [],
            challenges: [],
            savingsMasterPot: null,
            wallets: [],
            cryptoPrices: {},
            budgets: [],
            unreadNotifCount: 0,
            pendingRequestsCount: 0,
            activeTrips: [],

            // ─── UI State ───
            currentSummaryRange: 'week',
            setCurrentSummaryRange: (range) => set({ currentSummaryRange: range }),
            hideGlobalBalance: false,
            setHideGlobalBalance: (val) => set({ hideGlobalBalance: val }),
            currencyModalVisible: false,
            setCurrencyModalVisible: (val) => set({ currencyModalVisible: val }),
            achievements: [],
            addAchievement: (badgeId) => {
                const current = get().achievements;
                if (!current.includes(badgeId)) {
                    set({ achievements: [...current, badgeId] });
                    return true; // Newly earned
                }
                return false;
            },

            // ─── Loading States ───
            isLoadingDebts: false,
            isLoadingBills: false,
            isLoadingTransactions: false,
            isLoadingSummary: false,
            isLoadingSavings: false,
            isLoadingChallenges: false,
            isLoadingWallets: false,
            isLoadingBudgets: false,

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
                    if (range === 'all') {
                        set({ netBalance: data?.netBalance || 0 });
                    }
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

            fetchChallenges: async (force = false) => {
                if (!force && get().challenges.length > 0) return;
                set({ isLoadingChallenges: true });
                try {
                    const res = await api.getChallenges();
                    set({ challenges: res.challenges || [] });
                } catch (e) {
                    console.warn('[FinanceStore] fetchChallenges error:', e.message);
                } finally {
                    set({ isLoadingChallenges: false });
                }
            },

            fetchBudgets: async (force = false) => {
                if (!force && get().budgets.length > 0) return;
                set({ isLoadingBudgets: true });
                try {
                    const res = await api.getBudgets();
                    set({ budgets: res.budgets || [] });
                } catch (e) {
                    console.warn('[FinanceStore] fetchBudgets error:', e.message);
                } finally {
                    set({ isLoadingBudgets: false });
                }
            },

            // ─── Global Refresher ───
            // Temporarily disabled to prevent 429 Too Many Requests errors
            // refreshAll: async () => {
            //     await get().fetchWallets(true);
            //     await get().fetchSavings(true);
            //     await get().fetchDebts(true);
            //     await get().fetchRecurringBills(true);
            //     await get().fetchTransactions(true);
            // },
            refreshAll: async (force = true) => {
                const now = Date.now();
                if (force && now - lastRefreshTime < 1000) return;
                if (force) lastRefreshTime = now;

                const { fetchDebts, fetchRecurringBills, fetchTransactions, fetchTransactionSummary, fetchSavings, fetchChallenges, fetchWallets, fetchBudgets } = get();
                try {
                    // Start core financial fetches
                    const financialPromises = [
                        fetchWallets(force),
                        fetchDebts(force),
                        fetchRecurringBills(force),
                        fetchTransactions(force),
                        fetchSavings(force),
                        fetchChallenges(force),
                        fetchBudgets(force)
                    ];

                    // Start UI meta fetches
                    const metaPromises = [
                        api.getNotifications().then(res => set({ unreadNotifCount: res?.unreadCount || 0 })).catch(() => {}),
                        api.getFriendRequests().then(res => set({ pendingRequestsCount: Array.isArray(res) ? res.length : 0 })).catch(() => {}),
                        api.getGroupWallets().then(res => set({ activeTrips: Array.isArray(res) ? res.filter(t => !t.isArchived) : [] })).catch(() => {})
                    ];

                    await Promise.all([...financialPromises, ...metaPromises]);

                    // Summary is secondary
                    if (refreshAllTimeout) clearTimeout(refreshAllTimeout);
                    refreshAllTimeout = setTimeout(() => {
                        get().fetchTransactionSummary(get().currentSummaryRange, force);
                        get().fetchTransactionSummary('all', force);
                    }, 500);
                } catch (e) {
                    console.warn('[FinanceStore] refreshAll Error:', e);
                }
            },

            // ─── Debounced Global Refreshers ───
            debouncedRefreshAll: (force = true) => {
                if (refreshAllTimeout) clearTimeout(refreshAllTimeout);
                refreshAllTimeout = setTimeout(() => {
                    get().refreshAll(force);
                }, 400);
            },

            debouncedRefreshSummary: (force = true) => {
                if (summaryTimeout) clearTimeout(summaryTimeout);
                summaryTimeout = setTimeout(() => {
                    get().fetchTransactionSummary(get().currentSummaryRange, force);
                    get().fetchWallets(force);
                }, 400);
            },

            debouncedRefreshSavings: (force = true) => {
                if (savingsTimeout) clearTimeout(savingsTimeout);
                savingsTimeout = setTimeout(() => {
                    get().fetchSavings(force);
                }, 400);
            },

            debouncedRefreshDebts: (force = true) => {
                if (debtsTimeout) clearTimeout(debtsTimeout);
                debtsTimeout = setTimeout(() => {
                    get().fetchDebts(force);
                }, 400);
            },


            // ─── Synchronous Mutations ───
            addTransactionSync: (tx) => {
                set((state) => ({ transactions: [tx, ...state.transactions] }));
            },
            addDebtSync: (debt) => {
                set((state) => {
                    const exists = state.debts.some(d => d._id === debt._id);
                    if (exists) return { debts: state.debts.map(d => d._id === debt._id ? debt : d) };
                    return { debts: [debt, ...state.debts] };
                });
            },
            updateDebtSync: (updatedDebt) => {
                set((state) => ({
                    debts: state.debts.map(d => d._id === updatedDebt._id ? { ...d, ...updatedDebt } : d)
                }));
            },
            deleteDebtSync: (debtId) => {
                set((state) => ({
                    debts: state.debts.filter(d => d._id !== debtId)
                }));
            },
            addBillSync: (bill) => {
                set((state) => ({ recurringBills: [...state.recurringBills, bill] }));
            },
            updateWalletSync: (updatedWallet) => {
                if (updatedWallet._id === 'main') {
                    // Update legacy summary balance
                    set(state => ({
                        transactionSummary: { ...state.transactionSummary, balance: updatedWallet.balance }
                    }));
                    
                    // NEW: Update persistent profile balance so all profile-bound UI refreshes
                    try {
                        const { useAuthStore } = require('./authStore');
                        useAuthStore.getState().updateLocalUser({ handBalance: updatedWallet.balance });
                    } catch (err) {
                        console.warn('[FinanceStore] Failed to sync handBalance to authStore:', err.message);
                    }
                    return;
                }
                set(state => ({
                    wallets: state.wallets.map(w => w._id === updatedWallet._id ? { ...w, ...updatedWallet } : w)
                }));
            },
            deleteTransactionSync: (transactionId) => {
                set((state) => ({
                    transactions: state.transactions.filter(tx => tx._id !== transactionId)
                }));
            },
            appendTransactionsSync: (newTxs) => {
                set((state) => {
                    const existingIds = new Set(state.transactions.map(t => t._id));
                    const uniqueNew = newTxs.filter(t => !existingIds.has(t._id));
                    return { transactions: [...state.transactions, ...uniqueNew] };
                });
            },
            setNotifCount: (count) => set({ unreadNotifCount: count }),
            updateNotifCount: (delta) => set(state => ({ unreadNotifCount: Math.max(0, state.unreadNotifCount + delta) })),
            setRequestsCount: (count) => set({ pendingRequestsCount: count }),
            updateRequestsCount: (delta) => set(state => ({ pendingRequestsCount: Math.max(0, state.pendingRequestsCount + delta) })),
            setActiveTrips: (trips) => set({ activeTrips: trips }),
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
                achievements: state.achievements,
                budgets: state.budgets,
                unreadNotifCount: state.unreadNotifCount,
                pendingRequestsCount: state.pendingRequestsCount,
                activeTrips: state.activeTrips
            })
        }
    )
);
