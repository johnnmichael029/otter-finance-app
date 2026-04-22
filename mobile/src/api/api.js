import axios from 'axios';
import { API_BASE } from '../context/AuthContext';

// ─── Transactions ─────────────────────────────────────────────────────────────

export const getTransactions = (params = {}) =>
    axios.get(`${API_BASE}/transactions`, { params }).then(r => r.data);

export const getTransactionSummary = (params = {}) =>
    axios.get(`${API_BASE}/transactions/summary`, { params }).then(r => r.data);

export const createTransaction = (data) =>
    axios.post(`${API_BASE}/transactions`, data).then(r => r.data);

export const updateTransaction = (id, data) =>
    axios.patch(`${API_BASE}/transactions/${id}`, data).then(r => r.data);

export const deleteTransaction = (id) =>
    axios.delete(`${API_BASE}/transactions/${id}`).then(r => r.data);

// ─── Debts ────────────────────────────────────────────────────────────────────

export const getDebts = (params = {}) =>
    axios.get(`${API_BASE}/debts`, { params }).then(r => r.data);

export const createDebt = (data) =>
    axios.post(`${API_BASE}/debts`, data).then(r => r.data);

export const updateDebt = (id, data) =>
    axios.patch(`${API_BASE}/debts/${id}`, data).then(r => r.data);

export const deleteDebt = (id) =>
    axios.delete(`${API_BASE}/debts/${id}`).then(r => r.data);

export const sendDebtReminder = (id) =>
    axios.post(`${API_BASE}/debts/${id}/remind`).then(r => r.data);

export const logDebtPayment = (id, data) =>
    axios.post(`${API_BASE}/debts/${id}/payments`, data).then(r => r.data);

export const getDebtPayments = (id) =>
    axios.get(`${API_BASE}/debts/${id}/payments`).then(r => r.data);

export const getProfile = () =>
    axios.get(`${API_BASE}/users/me`).then(r => r.data);

export const updateProfile = (data) =>
    axios.patch(`${API_BASE}/users/me`, data).then(r => r.data);

export const savePushToken = (pushToken) =>
    axios.post(`${API_BASE}/users/push-token`, { pushToken }).then(r => r.data);

// ─── Sessions (Auth) ─────────────────────────────────────────────────────────

export const getSessions = () =>
    axios.get(`${API_BASE}/auth/sessions`).then(r => r.data);

export const revokeSession = (sessionId) =>
    axios.delete(`${API_BASE}/auth/sessions/${sessionId}`).then(r => r.data);

export const revokeAllSessions = () =>
    axios.post(`${API_BASE}/auth/logout-all`).then(r => r.data);

// ── 2FA ──────────────────────────────────────────────────────────────────────

export const toggle2FA = () =>
    axios.post(`${API_BASE}/auth/2fa/toggle`).then(r => r.data);

export const get2FAStatus = () =>
    axios.get(`${API_BASE}/auth/2fa/status`).then(r => r.data);

// ─── Barcode Price History ────────────────────────────────────────────────────

export const getBarcodePrice = (barcode) =>
    axios.get(`${API_BASE}/barcodes/${encodeURIComponent(barcode)}`).then(r => r.data);

export const upsertBarcodePrice = (data) =>
    axios.post(`${API_BASE}/barcodes`, data).then(r => r.data);

export const deleteBarcodePrice = (barcode) =>
    axios.delete(`${API_BASE}/barcodes/${encodeURIComponent(barcode)}`).then(r => r.data);

// ─── Recurring Bills ──────────────────────────────────────────────────────────

export const getRecurringBills = () =>
    axios.get(`${API_BASE}/recurring-bills`).then(r => r.data);

export const createRecurringBill = (data) =>
    axios.post(`${API_BASE}/recurring-bills`, data).then(r => r.data);

export const updateRecurringBill = (id, data) =>
    axios.patch(`${API_BASE}/recurring-bills/${id}`, data).then(r => r.data);

export const deleteRecurringBill = (id) =>
    axios.delete(`${API_BASE}/recurring-bills/${id}`).then(r => r.data);

export const markBillPaid = (id) =>
    axios.post(`${API_BASE}/recurring-bills/${id}/paid`).then(r => r.data);

// ─── Budgets ──────────────────────────────────────────────────────────────────

export const getBudgets = (month) =>
    axios.get(`${API_BASE}/budgets`, { params: { month } }).then(r => r.data);

export const upsertBudget = (data) =>
    axios.post(`${API_BASE}/budgets`, data).then(r => r.data);

export const deleteBudget = (id) =>
    axios.delete(`${API_BASE}/budgets/${id}`).then(r => r.data);

// ─── Savings ──────────────────────────────────────────────────────────────────

export const getSavingsGoals = () =>
    axios.get(`${API_BASE}/savings/goals`).then(r => r.data);

export const createSavingsGoal = (data) =>
    axios.post(`${API_BASE}/savings/goals`, data).then(r => r.data);

export const updateSavingsGoal = (id, data) =>
    axios.patch(`${API_BASE}/savings/goals/${id}`, data).then(r => r.data);

export const deleteSavingsGoal = (id) =>
    axios.delete(`${API_BASE}/savings/goals/${id}`).then(r => r.data);

export const savingsTransfer = (data) =>
    axios.post(`${API_BASE}/savings/transfer`, data).then(r => r.data);

export const getSavingsTransfers = (params = {}) =>
    axios.get(`${API_BASE}/savings/transfers`, { params }).then(r => r.data);

export const completeSavingsGoal = (id, data) =>
    axios.post(`${API_BASE}/savings/goals/complete/${id}`, data).then(r => r.data);

export const bulkSavingsAction = (data) =>
    axios.post(`${API_BASE}/savings/bulk-action`, data).then(r => r.data);

// ─── Shopping ─────────────────────────────────────────────────────────────────

export const createShoppingSession = (data) =>
    axios.post(`${API_BASE}/shopping/sessions`, data).then(r => r.data);

export const getShoppingSessions = (params = {}) =>
    axios.get(`${API_BASE}/shopping/sessions`, { params }).then(r => r.data);

export const getShoppingSession = (id) =>
    axios.get(`${API_BASE}/shopping/sessions/${id}`).then(r => r.data);

export const updateShoppingCart = (id, items) =>
    axios.patch(`${API_BASE}/shopping/sessions/${id}/items`, { items }).then(r => r.data);

export const checkoutShopping = (id, data) =>
    axios.post(`${API_BASE}/shopping/sessions/${id}/checkout`, data).then(r => r.data);

export const cancelShopping = (id) =>
    axios.patch(`${API_BASE}/shopping/sessions/${id}/cancel`).then(r => r.data);

export const deleteShoppingSession = (id) =>
    axios.delete(`${API_BASE}/shopping/sessions/${id}`).then(r => r.data);

export const lookupShoppingBarcode = (barcode) =>
    axios.get(`${API_BASE}/shopping/barcode/${encodeURIComponent(barcode)}`).then(r => r.data);

// ── Currency ──────────────────────────────────────────────────────────────────

export const getCurrencyList = () =>
    axios.get(`${API_BASE}/currency/list`).then(r => r.data);

export const getExchangeRates = (base = 'PHP') =>
    axios.get(`${API_BASE}/currency/rates`, { params: { base } }).then(r => r.data);

export const convertCurrency = (from, to, amount) =>
    axios.get(`${API_BASE}/currency/convert`, { params: { from, to, amount } }).then(r => r.data);

