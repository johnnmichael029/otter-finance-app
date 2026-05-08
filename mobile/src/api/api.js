import axios from 'axios';
import { API_BASE } from '../context/AuthContext';

// Set global defaults
axios.defaults.timeout = 10000;
axios.defaults.headers.post['Content-Type'] = 'application/json';

// ─── Core / Utils ─────────────────────────────────────────────────────────────

export const scanReceipt = (formData) =>
    axios.post(`${API_BASE}/ocr/scan`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    }).then(r => r.data);

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

export const archiveTransaction = (id) =>
    axios.patch(`${API_BASE}/transactions/${id}/archive`).then(r => r.data);

export const emptyArchives = () =>
    axios.delete(`${API_BASE}/transactions/archive/empty`).then(r => r.data);

export const getAnalytics = (params = {}) =>
    axios.get(`${API_BASE}/transactions/analytics`, { params }).then(r => r.data);

export const exportTransactions = (params = {}) =>
    axios.get(`${API_BASE}/transactions/export`, {
        params,
        responseType: 'blob'
    });

// ─── Debts ────────────────────────────────────────────────────────────────────

export const getDebts = (params = {}) =>
    axios.get(`${API_BASE}/debts`, { params }).then(r => r.data);

export const createDebt = (data) =>
    axios.post(`${API_BASE}/debts`, data).then(r => r.data);

export const updateDebt = (id, data) =>
    axios.patch(`${API_BASE}/debts/${id}`, data).then(r => r.data);

export const deleteDebt = (id, params = {}) =>
    axios.delete(`${API_BASE}/debts/${id}`, { params }).then(r => r.data);

export const logDebtPayment = (id, data) =>
    axios.post(`${API_BASE}/debts/${id}/payments`, data).then(r => r.data);

export const getDebtPayments = (id) =>
    axios.get(`${API_BASE}/debts/${id}/payments`).then(r => r.data);

export const remindDebt = (id) =>
    axios.post(`${API_BASE}/debts/${id}/remind`).then(r => r.data);

export const respondDebtRequest = (id, status) =>
    axios.post(`${API_BASE}/debts/${id}/respond`, { status }).then(r => r.data);

export const splitDebt = (data) =>
    axios.post(`${API_BASE}/debts/split`, data).then(r => r.data);

export const emptyDebtArchives = () =>
    axios.delete(`${API_BASE}/debts/archive/empty`).then(r => r.data);

export const getProfile = () =>
    axios.get(`${API_BASE}/users/me`).then(r => r.data);

export const updateProfile = (data) =>
    axios.patch(`${API_BASE}/users/me`, data).then(r => r.data);

export const uploadAvatar = (formData) =>
    axios.post(`${API_BASE}/users/avatar`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    }).then(r => r.data);

export const savePushToken = (pushToken) =>
    axios.post(`${API_BASE}/users/push-token`, { pushToken }).then(r => r.data);

export const completeOnboarding = (data) =>
    axios.post(`${API_BASE}/users/complete-onboarding`, data).then(r => r.data);

export const checkTagAvailability = (tag) =>
    axios.get(`${API_BASE}/users/check-tag`, { params: { tag } }).then(r => r.data);

// ── Security & Data Management ──────────────────────────────────────────────

export const changePassword = (data) =>
    axios.post(`${API_BASE}/users/change-password`, data).then(r => r.data);

export const wipeData = (password) =>
    axios.post(`${API_BASE}/users/wipe-data`, { password }).then(r => r.data);

export const deleteAccount = (password) =>
    axios.delete(`${API_BASE}/users/me`, { data: { password } }).then(r => r.data);

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

export const verifyPassword = (password) =>
    axios.post(`${API_BASE}/auth/verify-password`, { password }).then(r => r.data);


// ─── Barcode Price History ────────────────────────────────────────────────────

export const getBarcodePrice = (barcode) =>
    axios.get(`${API_BASE}/barcodes/${encodeURIComponent(barcode)}`).then(r => r.data);

export const upsertBarcodePrice = (data) =>
    axios.post(`${API_BASE}/barcodes`, data).then(r => r.data);

export const deleteBarcodePrice = (barcode) =>
    axios.delete(`${API_BASE}/barcodes/${encodeURIComponent(barcode)}`).then(r => r.data);

// ─── Recurring Bills ──────────────────────────────────────────────────────────

export const getRecurringBills = (params = {}) =>
    axios.get(`${API_BASE}/recurring-bills`, { params }).then(r => r.data);

export const createRecurringBill = (data) =>
    axios.post(`${API_BASE}/recurring-bills`, data).then(r => r.data);

export const updateRecurringBill = (id, data) =>
    axios.patch(`${API_BASE}/recurring-bills/${id}`, data).then(r => r.data);

export const deleteRecurringBill = (id) =>
    axios.delete(`${API_BASE}/recurring-bills/${id}`).then(r => r.data);

export const markBillPaid = (id, data = {}) =>
    axios.post(`${API_BASE}/recurring-bills/${id}/paid`, data).then(r => r.data);

// ─── Budgets ──────────────────────────────────────────────────────────────────

export const getBudgets = (date, period) =>
    axios.get(`${API_BASE}/budgets`, { params: { date, period } }).then(r => r.data);

export const upsertBudget = (data) =>
    axios.post(`${API_BASE}/budgets`, data).then(r => r.data);

export const updateBudget = (id, data) =>
    axios.patch(`${API_BASE}/budgets/${id}`, data).then(r => r.data);

export const deleteBudget = (id) =>
    axios.delete(`${API_BASE}/budgets/${id}`).then(r => r.data);

export const respondToBudgetInvite = (id, status) =>
    axios.post(`${API_BASE}/budgets/respond/${id}`, { status }).then(r => r.data);

// ─── Savings ──────────────────────────────────────────────────────────────────

export const getSavingsGoals = (params = {}) =>
    axios.get(`${API_BASE}/savings/goals`, { params }).then(r => r.data);

export const createSavingsGoal = (data) =>
    axios.post(`${API_BASE}/savings/goals`, data).then(r => r.data);

export const respondToGoalInvite = (id, status) =>
    axios.post(`${API_BASE}/savings/goals/respond/${id}`, { status }).then(r => r.data);

export const updateSavingsGoal = (id, data) =>
    axios.patch(`${API_BASE}/savings/goals/${id}`, data).then(r => r.data);

export const deleteSavingsGoal = (id) =>
    axios.delete(`${API_BASE}/savings/goals/${id}`).then(r => r.data);

export const savingsTransfer = (data) =>
    axios.post(`${API_BASE}/savings/transfer`, data).then(r => r.data);

export const getSavingsTransfers = (params = {}) =>
    axios.get(`${API_BASE}/savings/transfers`, { params }).then(r => r.data);

export const archiveSavingsTransfer = (id) =>
    axios.patch(`${API_BASE}/savings/transfers/${id}/archive`).then(r => r.data);

export const emptySavingsArchives = () =>
    axios.delete(`${API_BASE}/savings/transfers/archive/empty`).then(r => r.data);

export const deleteSavingsTransfer = (id) =>
    axios.delete(`${API_BASE}/savings/transfers/${id}`).then(r => r.data);

export const completeSavingsGoal = (id, data) =>

    axios.post(`${API_BASE}/savings/goals/complete/${id}`, data).then(r => r.data);

export const bulkSavingsAction = (data) =>
    axios.post(`${API_BASE}/savings/bulk-action`, data).then(r => r.data);

export const emptySavingsGoalArchives = () =>
    axios.delete(`${API_BASE}/savings/goals/archive/empty`).then(r => r.data);

// ─── Wallets ──────────────────────────────────────────────────────────────────

export const getWallets = () =>
    axios.get(`${API_BASE}/wallets`).then(r => r.data);

export const createWallet = (data) =>
    axios.post(`${API_BASE}/wallets`, data).then(r => r.data);

export const updateWallet = (id, data) =>
    axios.put(`${API_BASE}/wallets/${id}`, data).then(r => r.data);

export const deleteWallet = (id) =>
    axios.delete(`${API_BASE}/wallets/${id}`).then(r => r.data);

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

export const toggleArchiveShoppingSession = (id) =>
    axios.patch(`${API_BASE}/shopping/sessions/${id}/archive`).then(r => r.data);


// ─── Shopping Templates & Price History (Features 14 & 15) ─────────────────────

export const getShoppingTemplates = () =>
    axios.get(`${API_BASE}/shopping/templates`).then(r => r.data);

export const createShoppingTemplate = (data) =>
    axios.post(`${API_BASE}/shopping/templates`, data).then(r => r.data);

export const updateShoppingTemplate = (id, data) =>
    axios.patch(`${API_BASE}/shopping/templates/${id}`, data).then(r => r.data);

export const deleteShoppingTemplate = (id) =>
    axios.delete(`${API_BASE}/shopping/templates/${id}`).then(r => r.data);

export const useShoppingTemplate = (id) =>
    axios.post(`${API_BASE}/shopping/templates/${id}/use`).then(r => r.data);

export const getPriceHistory = (barcode) =>
    axios.get(`${API_BASE}/shopping/price-history/${encodeURIComponent(barcode)}`).then(r => r.data);

// ── Currency ──────────────────────────────────────────────────────────────────

export const getCurrencyList = () =>
    axios.get(`${API_BASE}/currency/list`).then(r => r.data);

export const getExchangeRates = (base = 'PHP') =>
    axios.get(`${API_BASE}/currency/rates`, { params: { base } }).then(r => r.data);

export const convertCurrency = (from, to, amount) =>
    axios.get(`${API_BASE}/currency/convert`, { params: { from, to, amount } }).then(r => r.data);

// ── Notifications ─────────────────────────────────────────────────────────────

export const getNotifications = () =>
    axios.get(`${API_BASE}/notifications`).then(r => r.data);

export const markNotificationRead = (id) =>
    axios.patch(`${API_BASE}/notifications/${id}/read`).then(r => r.data);

export const markAllNotificationsRead = () =>
    axios.patch(`${API_BASE}/notifications/mark-all-read`).then(r => r.data);

export const deleteNotification = (id) =>
    axios.delete(`${API_BASE}/notifications/${id}`).then(r => r.data);

export const deleteAllNotifications = () =>
    axios.delete(`${API_BASE}/notifications/bulk-delete`).then(r => r.data);

// ── Categories ────────────────────────────────────────────────────────────────

export const getCategories = () =>
    axios.get(`${API_BASE}/categories`).then(r => r.data);

export const createCategory = (data) =>
    axios.post(`${API_BASE}/categories`, data).then(r => r.data);

export const updateCategory = (id, data) =>
    axios.put(`${API_BASE}/categories/${id}`, data).then(r => r.data);

export const deleteCategory = (id) =>
    axios.delete(`${API_BASE}/categories/${id}`).then(r => r.data);

// ── Friends & Connections ─────────────────────────────────────────────────────

export const searchFriends = (q) =>
    axios.get(`${API_BASE}/friends/search`, { params: { q } }).then(r => r.data);

export const sendFriendRequest = (receiverId) =>
    axios.post(`${API_BASE}/friends/request`, { receiverId }).then(r => r.data);

export const getFriendRequests = () =>
    axios.get(`${API_BASE}/friends/requests`).then(r => r.data);

export const respondFriendRequest = (requestId, status) =>
    axios.post(`${API_BASE}/friends/respond`, { requestId, status }).then(r => r.data);

export const getFriends = () =>
    axios.get(`${API_BASE}/friends`).then(r => r.data);

// ── Chat ──────────────────────────────────────────────────────────────────────

export const getConversation = (friendId, page = 1) =>
    axios.get(`${API_BASE}/chat/${friendId}`, { params: { page } }).then(r => r.data);

export const sendMessage = (friendId, content) =>
    axios.post(`${API_BASE}/chat/${friendId}/send`, { content }).then(r => r.data);

export const markAsRead = (friendId) =>
    axios.patch(`${API_BASE}/chat/${friendId}/read`).then(r => r.data);

// ── Net Worth ───────────────────────────────────────────────────────────────

export const getNetWorth = () =>
    axios.get(`${API_BASE}/net-worth`).then(r => r.data);

export const getNetWorthHistory = () =>
    axios.get(`${API_BASE}/net-worth/history`).then(r => r.data);

export const createNetWorthSnapshot = () =>
    axios.post(`${API_BASE}/net-worth/snapshot`).then(r => r.data);

// ── Savings Challenges ────────────────────────────────────────────────────────

export const getChallenges = () =>
    axios.get(`${API_BASE}/challenges`).then(r => r.data);

export const createChallenge = (data) =>
    axios.post(`${API_BASE}/challenges`, data).then(r => r.data);

export const updateChallenge = (id, data) =>
    axios.patch(`${API_BASE}/challenges/${id}`, data).then(r => r.data);

export const updateChallengeProgress = (id, data) =>
    axios.post(`${API_BASE}/challenges/${id}/progress`, data).then(r => r.data);

export const respondToChallengeInvite = (id, status) =>
    axios.post(`${API_BASE}/challenges/${id}/respond`, { status }).then(r => r.data);

export const deleteChallenge = (id) =>
    axios.delete(`${API_BASE}/challenges/${id}`).then(r => r.data);

export const emptyChallengeArchives = () =>
    axios.delete(`${API_BASE}/challenges/archives`).then(r => r.data);

// ─── Group Trip Wallets ───────────────────────────────────────────────────────

export const getGroupWallets = () =>
    axios.get(`${API_BASE}/group-wallets`).then(r => r.data);

export const createGroupWallet = (data) =>
    axios.post(`${API_BASE}/group-wallets`, data).then(r => r.data);

export const getGroupWalletDetail = (id) =>
    axios.get(`${API_BASE}/group-wallets/${id}`).then(r => r.data);

export const respondToTripInvite = (id, status) =>
    axios.post(`${API_BASE}/group-wallets/${id}/respond`, { status }).then(r => r.data);

export const addTripExpense = (id, data) =>
    axios.post(`${API_BASE}/group-wallets/${id}/expense`, data).then(r => r.data);

export const getTripSettlementPreview = (id) =>
    axios.get(`${API_BASE}/group-wallets/${id}/settle-preview`).then(r => r.data);

export const settleTrip = (id, data = {}) =>
    axios.post(`${API_BASE}/group-wallets/${id}/settle`, data).then(r => r.data);

export const updateTrip = (id, data) =>
    axios.patch(`${API_BASE}/group-wallets/${id}`, data).then(r => r.data);

export const leaveTrip = (id) =>
    axios.delete(`${API_BASE}/group-wallets/${id}/leave`).then(r => r.data);

export const deleteTrip = (id) =>
    axios.delete(`${API_BASE}/group-wallets/${id}`).then(r => r.data);

