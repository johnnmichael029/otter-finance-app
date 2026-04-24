# 🦦 Otter SQLite Migration Roadmap

| Step | Feature Migration | Details |
| :--- | :--- | :--- |
| **1** | **Foundation & Tables** | Install `expo-sqlite` and create the schema for all 14 folders (Transactions, Wallets, Budgets, etc). |
| **2** | **Core Ledger (TX & Wallets)** | Migrate Transactions and Wallets first. Includes auto-calculating balances directly in SQL. |
| **3** | **Budgeting & Categories** | Move Monthly Budgets and Custom Categories. No more disappearing budgets! |
| **4** | **Savings & Transfers** | Deep integration for Savings Goals, Master Pot, and the Transfer History logs. |
| **5** | **Debt Management** | Migrate Debts and DebtPayments. Track "Who owes what" with local SQL queries. |
| **6** | **Recurring Bills** | Set up the Subscription engine. The phone will know your bills even if you are in a tunnel. |
| **7** | **Shopping & Barcodes** | Migrate the Shopping Templates, active Sessions, and the Barcode Price library. |
| **8** | **Bulletproof Sync Engine** | Replace the temporary "Queue" with a dedicated SQL Sync Table. 100% crash-proof. |

---

## 🚀 Long-Term SQL Vision (Advanced)

*   **Background Syncing** — The app stays updated even when it’s closed in your pocket.
*   **Delta Updates** — Only download "New" data from the server (saves battery and 5G data).
*   **Instant Reporting** — Generate Income/Expense charts in milliseconds using SQL `GROUP BY` logic.
*   **Local Backup** — Export your whole SQLite database as a single file to Google Drive.

---

**TIP:** Starting with Step 1 (Foundation) will allow us to test the "Save" logic for all future features without breaking the current app.
