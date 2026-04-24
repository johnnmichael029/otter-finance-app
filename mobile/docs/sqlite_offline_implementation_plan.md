# 🦦 Otter Finance — SQLite Offline Mode Implementation Plan
> **Field names are copied 1:1 from your MongoDB models** so data flows between the server and phone with zero translation needed.
> Every table has a `sync_status` column: `'synced'` | `'pending'` | `'failed'`

---

## 🗄️ Part 1: SQLite Table Schema (Mirrored from `/backend/models`)

---

### 1. `transactions` ← from `transactionModel.js`

| Column | SQLite Type | MongoDB Field | Notes |
| :--- | :--- | :--- | :--- |
| `_id` | TEXT PK | `_id` | `temp-{timestamp}` if offline |
| `type` | TEXT | `type` | `'expense'` or `'income'` |
| `amount` | REAL | `amount` | Final PHP amount |
| `description` | TEXT | `description` | User's note/description |
| `category` | TEXT | `category` | Category label |
| `categoryIcon` | TEXT | `categoryIcon` | Icon name |
| `categoryColor` | TEXT | `categoryColor` | Hex color |
| `date` | TEXT | `date` | ISO date string |
| `note` | TEXT | `note` | Extra note |
| `currency` | TEXT | `currency` | `'PHP'`, `'USD'`, etc. |
| `originalAmount` | REAL | `originalAmount` | If foreign currency |
| `exchangeRate` | REAL | `exchangeRate` | Rate used at the time |
| `runningBalance` | REAL | `runningBalance` | Balance snapshot |
| `relatedId` | TEXT | `relatedId` | FK to debt or savings goal |
| `relatedType` | TEXT | `relatedType` | `'Debt'` or `'SavingsGoal'` |
| `attachment` | TEXT | `attachment` | Receipt URL |
| `wallet` | TEXT | `wallet` | FK to `wallets._id` |
| `walletAmount` | REAL | `walletAmount` | Native unit deducted |
| `walletCurrency` | TEXT | `walletCurrency` | e.g. `'BTC'`, `'USD'` |
| `isArchived` | INTEGER | `isArchived` | `0` = false, `1` = true |
| `sync_status` | TEXT | *(local only)* | `'synced'`, `'pending'`, `'failed'` |
| `createdAt` | TEXT | `createdAt` | ISO timestamp |
| `updatedAt` | TEXT | `updatedAt` | ISO timestamp |

---

### 2. `wallets` ← from `walletModel.js`

| Column | SQLite Type | MongoDB Field | Notes |
| :--- | :--- | :--- | :--- |
| `_id` | TEXT PK | `_id` | MongoDB ID |
| `name` | TEXT | `name` | e.g. `'BPI'`, `'GCash'` |
| `type` | TEXT | `type` | `'Debit'`, `'Crypto'`, `'E-Wallet'`, etc. |
| `templateId` | TEXT | `templateId` | Wallet template slug |
| `balance` | REAL | `balance` | Current balance |
| `color` | TEXT | `color` | Hex color |
| `isArchived` | INTEGER | `isArchived` | `0` or `1` |
| `hideBalance` | INTEGER | `hideBalance` | `0` or `1` |
| `coinId` | TEXT | `coinId` | CoinGecko ID |
| `coinSymbol` | TEXT | `coinSymbol` | e.g. `'BTC'` |
| `coinName` | TEXT | `coinName` | e.g. `'Bitcoin'` |
| `coinImageUrl` | TEXT | `coinImageUrl` | Coin logo URL |
| `stockTicker` | TEXT | `stockTicker` | e.g. `'JFC.PS'` |
| `stockSymbol` | TEXT | `stockSymbol` | e.g. `'JFC'` |
| `stockName` | TEXT | `stockName` | e.g. `'Jollibee Foods Corp'` |
| `stockExchange` | TEXT | `stockExchange` | e.g. `'PSE'` |
| `sync_status` | TEXT | *(local only)* | `'synced'`, `'pending'` |
| `createdAt` | TEXT | `createdAt` | ISO timestamp |
| `updatedAt` | TEXT | `updatedAt` | ISO timestamp |

---

### 3. `budgets` ← from `budgetModel.js`

| Column | SQLite Type | MongoDB Field | Notes |
| :--- | :--- | :--- | :--- |
| `_id` | TEXT PK | `_id` | `temp-{timestamp}` if offline |
| `month` | TEXT | `month` | Format `'YYYY-MM'` e.g. `'2026-04'` |
| `category` | TEXT | `category` | `'Overall'` or a category name |
| `categoryIcon` | TEXT | `categoryIcon` | Icon name |
| `categoryColor` | TEXT | `categoryColor` | Hex color |
| `allocatedAmount` | REAL | `allocatedAmount` | Budget limit |
| `sync_status` | TEXT | *(local only)* | `'synced'`, `'pending'`, `'failed'` |
| `createdAt` | TEXT | `createdAt` | ISO timestamp |
| `updatedAt` | TEXT | `updatedAt` | ISO timestamp |

> **💡 Note:** `spent` is NOT stored — it is always calculated live via:
> `SELECT SUM(amount) FROM transactions WHERE category = ? AND strftime('%Y-%m', date) = ?`

---

### 4. `categories` ← from `categoryModel.js`

| Column | SQLite Type | MongoDB Field | Notes |
| :--- | :--- | :--- | :--- |
| `_id` | TEXT PK | `_id` | MongoDB ID |
| `name` | TEXT | `name` | Category label |
| `type` | TEXT | `type` | `'income'` or `'expense'` |
| `icon` | TEXT | `icon` | Icon name |
| `color` | TEXT | `color` | Hex color |
| `sync_status` | TEXT | *(local only)* | `'synced'`, `'pending'` |
| `createdAt` | TEXT | `createdAt` | ISO timestamp |

---

### 5. `debts` ← from `debtModel.js`

| Column | SQLite Type | MongoDB Field | Notes |
| :--- | :--- | :--- | :--- |
| `_id` | TEXT PK | `_id` | MongoDB ID |
| `direction` | TEXT | `direction` | `'owed_by_me'` or `'owed_to_me'` |
| `personName` | TEXT | `personName` | Name of the other party |
| `amount` | REAL | `amount` | Original debt amount |
| `amountPaid` | REAL | `amountPaid` | How much has been paid |
| `description` | TEXT | `description` | Notes on the debt |
| `isInstallment` | INTEGER | `isInstallment` | `0` or `1` |
| `monthlyPayment` | REAL | `monthlyPayment` | Fixed monthly payment |
| `gracePeriodMonths` | INTEGER | `gracePeriodMonths` | 0% interest period |
| `penaltyRate` | REAL | `penaltyRate` | Monthly penalty % |
| `dateBorrowed` | TEXT | `dateBorrowed` | ISO date |
| `dueDate` | TEXT | `dueDate` | ISO date or NULL |
| `status` | TEXT | `status` | `'pending'`, `'partial'`, `'settled'` |
| `reminderSent` | INTEGER | `reminderSent` | `0` or `1` |
| `sync_status` | TEXT | *(local only)* | `'synced'`, `'pending'` |
| `createdAt` | TEXT | `createdAt` | ISO timestamp |
| `updatedAt` | TEXT | `updatedAt` | ISO timestamp |

---

### 6. `debtpayments` ← from `debtPaymentModel.js`

| Column | SQLite Type | MongoDB Field | Notes |
| :--- | :--- | :--- | :--- |
| `_id` | TEXT PK | `_id` | `temp-{timestamp}` if offline |
| `debt` | TEXT | `debt` | FK to `debts._id` |
| `amount` | REAL | `amount` | Payment amount |
| `note` | TEXT | `note` | Payment note |
| `paidAt` | TEXT | `paidAt` | ISO date |
| `wallet` | TEXT | `wallet` | FK to `wallets._id` |
| `walletAmount` | REAL | `walletAmount` | Native unit deducted |
| `walletCurrency` | TEXT | `walletCurrency` | e.g. `'BTC'` |
| `sync_status` | TEXT | *(local only)* | `'synced'`, `'pending'`, `'failed'` |
| `createdAt` | TEXT | `createdAt` | ISO timestamp |

---

### 7. `savingsgoals` ← from `savingsGoalModel.js`

| Column | SQLite Type | MongoDB Field | Notes |
| :--- | :--- | :--- | :--- |
| `_id` | TEXT PK | `_id` | MongoDB ID |
| `name` | TEXT | `name` | Goal name |
| `icon` | TEXT | `icon` | Icon name |
| `family` | TEXT | `family` | Icon family e.g. `'feather'` |
| `color` | TEXT | `color` | Hex color |
| `targetAmount` | REAL | `targetAmount` | Target to reach |
| `currentAmount` | REAL | `currentAmount` | Amount saved so far |
| `deadline` | TEXT | `deadline` | ISO date or NULL |
| `isCompleted` | INTEGER | `isCompleted` | `0` or `1` |
| `note` | TEXT | `note` | Goal notes |
| `sync_status` | TEXT | *(local only)* | `'synced'`, `'pending'` |
| `createdAt` | TEXT | `createdAt` | ISO timestamp |
| `updatedAt` | TEXT | `updatedAt` | ISO timestamp |

---

### 8. `savingstransfers` ← from `savingsTransferModel.js`

| Column | SQLite Type | MongoDB Field | Notes |
| :--- | :--- | :--- | :--- |
| `_id` | TEXT PK | `_id` | `temp-{timestamp}` if offline |
| `direction` | TEXT | `direction` | `'to_savings'`, `'from_savings'`, `'spent_from_savings'`, `'transfer_goal'`, `'income'` |
| `amount` | REAL | `amount` | Transfer amount |
| `goal` | TEXT | `goal` | FK to `savingsgoals._id` |
| `goalName` | TEXT | `goalName` | Goal name snapshot |
| `wallet` | TEXT | `wallet` | FK to `wallets._id` |
| `walletAmount` | REAL | `walletAmount` | Native unit |
| `walletCurrency` | TEXT | `walletCurrency` | e.g. `'BTC'` |
| `note` | TEXT | `note` | Transfer note |
| `runningBalance` | REAL | `runningBalance` | Balance snapshot |
| `sync_status` | TEXT | *(local only)* | `'synced'`, `'pending'`, `'failed'` |
| `createdAt` | TEXT | `createdAt` | ISO timestamp |

---

### 9. `recurringbills` ← from `recurringBillModel.js`

| Column | SQLite Type | MongoDB Field | Notes |
| :--- | :--- | :--- | :--- |
| `_id` | TEXT PK | `_id` | MongoDB ID |
| `name` | TEXT | `name` | e.g. `'Netflix'`, `'Meralco'` |
| `amount` | REAL | `amount` | Bill amount |
| `category` | TEXT | `category` | Category label |
| `categoryIcon` | TEXT | `categoryIcon` | Icon name |
| `categoryColor` | TEXT | `categoryColor` | Hex color |
| `frequency` | TEXT | `frequency` | `'daily'`, `'weekly'`, `'monthly'`, `'quarterly'`, `'yearly'` |
| `nextDueDate` | TEXT | `nextDueDate` | ISO date |
| `notified` | INTEGER | `notified` | `0` or `1` |
| `isActive` | INTEGER | `isActive` | `0` or `1` |
| `sync_status` | TEXT | *(local only)* | `'synced'`, `'pending'` |
| `createdAt` | TEXT | `createdAt` | ISO timestamp |
| `updatedAt` | TEXT | `updatedAt` | ISO timestamp |

---

### 10. `notifications` ← from `Notification.js`

| Column | SQLite Type | MongoDB Field | Notes |
| :--- | :--- | :--- | :--- |
| `_id` | TEXT PK | `_id` | MongoDB ID |
| `type` | TEXT | `type` | `'budget_alert'`, `'savings_goal'`, `'debt_reminder'`, `'system'`, `'transaction'` |
| `title` | TEXT | `title` | Notification title |
| `message` | TEXT | `message` | Notification body |
| `data` | TEXT | `data` | JSON stringified extra context |
| `isRead` | INTEGER | `isRead` | `0` or `1` |
| `sync_status` | TEXT | *(local only)* | `'synced'` only — read-only offline |
| `createdAt` | TEXT | `createdAt` | ISO timestamp |

---

### 11. `barcodeprices` ← from `barcodePriceModel.js`

| Column | SQLite Type | MongoDB Field | Notes |
| :--- | :--- | :--- | :--- |
| `_id` | TEXT PK | `_id` | MongoDB ID |
| `barcode` | TEXT | `barcode` | Product barcode |
| `name` | TEXT | `name` | Product name |
| `brand` | TEXT | `brand` | Brand name |
| `price` | REAL | `price` | Latest price |
| `count` | INTEGER | `count` | Times confirmed |
| `priceHistory` | TEXT | `priceHistory` | JSON stringified array |
| `sync_status` | TEXT | *(local only)* | `'synced'`, `'pending'` |
| `createdAt` | TEXT | `createdAt` | ISO timestamp |
| `updatedAt` | TEXT | `updatedAt` | ISO timestamp |

---

### 12. `shoppingtemplates` ← from `shoppingTemplateModel.js`

| Column | SQLite Type | MongoDB Field | Notes |
| :--- | :--- | :--- | :--- |
| `_id` | TEXT PK | `_id` | MongoDB ID |
| `name` | TEXT | `name` | e.g. `'Weekly Groceries'` |
| `emoji` | TEXT | `emoji` | e.g. `'🛒'` |
| `items` | TEXT | `items` | JSON stringified array of `{name, price, quantity, barcode}` |
| `defaultBudget` | REAL | `defaultBudget` | Default budget for session |
| `usageCount` | INTEGER | `usageCount` | Times this template was used |
| `sync_status` | TEXT | *(local only)* | `'synced'`, `'pending'` |
| `createdAt` | TEXT | `createdAt` | ISO timestamp |
| `updatedAt` | TEXT | `updatedAt` | ISO timestamp |

---

### 13. `shoppingsessions` ← from `shoppingSessionModel.js`

| Column | SQLite Type | MongoDB Field | Notes |
| :--- | :--- | :--- | :--- |
| `_id` | TEXT PK | `_id` | `temp-{timestamp}` if offline |
| `label` | TEXT | `label` | e.g. `'Shopping Trip'` |
| `budget` | REAL | `budget` | Session budget |
| `items` | TEXT | `items` | JSON stringified array of `{barcode, name, price, quantity}` |
| `total` | REAL | `total` | Running total |
| `paymentMethod` | TEXT | `paymentMethod` | `'cash'`, `'wallet'`, etc. |
| `source` | TEXT | `source` | `'main_balance'` or wallet ID |
| `status` | TEXT | `status` | `'active'`, `'completed'`, `'cancelled'` |
| `note` | TEXT | `note` | Session note |
| `sync_status` | TEXT | *(local only)* | `'synced'`, `'pending'`, `'failed'` |
| `createdAt` | TEXT | `createdAt` | ISO timestamp |
| `updatedAt` | TEXT | `updatedAt` | ISO timestamp |

---

### 14. `sync_queue` ← *(New — Engine Only)*

> This table is the **heart of the offline system**. It does not exist in MongoDB — it lives only on the phone.

| Column | SQLite Type | Notes |
| :--- | :--- | :--- |
| `id` | INTEGER PK AUTOINCREMENT | Queue ID |
| `action_type` | TEXT | `'CREATE_TX'`, `'DELETE_TX'`, `'UPSERT_BUDGET'`, `'DELETE_BUDGET'`, `'CREATE_DEBT_PAYMENT'`, `'CREATE_SAVINGS_TRANSFER'`, `'UPDATE_SAVINGS_GOAL'`, etc. |
| `table_name` | TEXT | Which SQLite table this affects |
| `record_id` | TEXT | The `_id` of the affected record |
| `payload` | TEXT | Full JSON to send to MongoDB API |
| `status` | TEXT | `'pending'`, `'processing'`, `'failed'` |
| `retry_count` | INTEGER | Default `0`, max `3` |
| `created_at` | TEXT | ISO timestamp |
| `last_attempted_at` | TEXT | ISO timestamp |

---

## 🛤️ Part 2: Step-by-Step Implementation Plan

| Step | Feature | What We Build | Files Affected |
| :---: | :--- | :--- | :--- |
| **1** | **Foundation** | Install `expo-sqlite`. Create `db.js` singleton. Run `migrations.js` (all 14 CREATE TABLE statements). | `src/db/db.js`, `src/db/migrations.js` |
| **2** | **Data Seed on Login** | After login, fetch all data from the API once and INSERT into SQLite. Phone is now a mirror of MongoDB. | `src/db/seed.js`, `AuthContext.js` |
| **3** | **Transactions Offline** | `AddTransactionScreen` writes to SQLite + `sync_queue`. `HomeScreen` & `TransactionsScreen` read from SQLite only. | `AddTransactionScreen.js`, `HomeScreen.js`, `TransactionsScreen.js`, `src/db/queries/transactions.js` |
| **4** | **Wallets Offline** | Wallet balances update in SQLite instantly on every TX insert. `WalletsScreen` reads from SQLite. | `WalletsScreen.js`, `src/db/queries/wallets.js` |
| **5** | **Budgets Offline** | `BudgetScreen` reads from SQLite. `spent` is calculated via SQL JOIN — no manual tracking needed. | `BudgetScreen.js`, `src/db/queries/budgets.js` |
| **6** | **Savings Offline** | `SavingsHomeScreen` reads goals from SQLite. All transfers write to `savingstransfers` + `sync_queue`. | `SavingsHomeScreen.js`, `src/db/queries/savings.js` |
| **7** | **Debts Offline** | `DebtScreen` reads from SQLite. Payments write to `debtpayments` + `sync_queue`. | `DebtScreen.js`, `src/db/queries/debts.js` |
| **8** | **Recurring Bills Offline** | `BillsScreen` reads bills from SQLite. No write needed offline. | `RecurringBillsScreen.js`, `src/db/queries/bills.js` |
| **9** | **Shopping Offline** | Active sessions persist in SQLite. Barcode scanner uses local `barcodeprices` cache. | `ShoppingScreen.js`, `src/db/queries/shopping.js` |
| **10** | **Sync Engine v2** | Replace Zustand `pendingActions` with `sync_queue` table. Auto-pushes to MongoDB on network restore. | `src/db/syncEngine.js`, `financeStore.js` |

---

## 🔄 Part 3: The Sync Flow

```
📱 User adds an Expense (offline)
         │
         ▼
💾 SQLite WRITE (< 5ms, instant)
   ┌──────────────────────────────┐
   │ transactions INSERT           │
   │   sync_status = 'pending'    │
   ├──────────────────────────────┤
   │ sync_queue INSERT             │
   │   action_type = 'CREATE_TX'  │
   │   payload = { full JSON }    │
   └──────────────────────────────┘
         │
         ▼
✅ UI updates immediately (reads from SQLite)
         │
         ▼ (NetInfo detects wifi/data restored)
📡 Sync Engine wakes up
   → Reads sync_queue WHERE status = 'pending'
   → POSTs payload to MongoDB REST API
         │
      ┌──┴──────────┐
   ✅ 200 OK      ❌ Failed
      │               │
      ▼               ▼
  UPDATE SQLite    retry_count++
  sync_status      MAX 3 retries
  = 'synced'       then → 'failed'
  Remove from      (shown in UI as
  sync_queue       "Unsynced" badge)
```

---

## 📁 Part 4: New File Structure

```
mobile/src/
├── db/
│   ├── db.js                  ← Opens the SQLite connection (singleton)
│   ├── migrations.js          ← All 14 CREATE TABLE statements
│   ├── seed.js                ← Pulls from API and populates SQLite on login
│   ├── syncEngine.js          ← Reads sync_queue and pushes to MongoDB
│   └── queries/
│       ├── transactions.js    ← SQL helpers for transactions
│       ├── wallets.js         ← SQL helpers for wallets
│       ├── budgets.js         ← SQL helpers for budgets
│       ├── savings.js         ← SQL helpers for goals & transfers
│       ├── debts.js           ← SQL helpers for debts & payments
│       ├── bills.js           ← SQL helpers for recurring bills
│       └── shopping.js        ← SQL helpers for sessions & templates
```

---

## ⚠️ Critical Rules

1. **SQLite is the single source of truth.** Screens NEVER call the API directly for reading.
2. **API is ONLY called by `syncEngine.js`**, never by individual screens.
3. **`sync_status = 'pending'`** = local only, waiting to be pushed to MongoDB.
4. **`sync_status = 'synced'`** = MongoDB and SQLite agree. All good.
5. **`sync_status = 'failed'`** = Retried 3 times and still failed. Show badge in UI.
6. **First Launch Migration** = Move existing Zustand `pendingActions` into `sync_queue` before clearing AsyncStorage.
7. **Array fields** (`items`, `priceHistory`, `data`) are stored as **JSON strings** in SQLite and parsed in JS.

---

> **TIP — Recommended Starting Point:** Step 1 (Foundation) is zero-risk. It creates the database engine without touching any existing screen code. We can test the database is working before migrating a single screen.
