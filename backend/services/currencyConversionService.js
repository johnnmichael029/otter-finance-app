const Transaction = require('../models/transactionModel');
const SavingsGoal = require('../models/savingsGoalModel');
const Debt = require('../models/debtModel');
const Budget = require('../models/budgetModel');
const { convert } = require('../utils/exchangeRateService');
const { invalidatePrefixes } = require('../utils/cache');

/**
 * Converts all financial data for a user from an old base currency to a new one.
 * Uses cursor iteration for safety against missing or null fields.
 */
const convertUserFinances = async (userId, oldCurrency, newCurrency) => {
    if (oldCurrency === newCurrency) return;

    console.log(`[Currency] 🔄 Converting finances for user ${userId} from ${oldCurrency} to ${newCurrency}`);

    try {
        const { rate } = await convert(1, oldCurrency, newCurrency);
        
        // Helper to safely convert numbers
        const safeConvert = (val) => {
            if (val == null || isNaN(val)) return val;
            return Math.round(val * rate * 100) / 100;
        };

        // 1. Convert Transactions
        const txs = await Transaction.find({ user: userId });
        for (const tx of txs) {
            tx.amount = safeConvert(tx.amount);
            if (tx.runningBalance != null) tx.runningBalance = safeConvert(tx.runningBalance);
            await tx.save();
        }

        // 2. Convert Savings Goals
        const goals = await SavingsGoal.find({ user: userId });
        for (const goal of goals) {
            goal.targetAmount = safeConvert(goal.targetAmount);
            goal.currentAmount = safeConvert(goal.currentAmount);
            await goal.save();
        }

        // 3. Convert Debts
        const debts = await Debt.find({ user: userId });
        for (const debt of debts) {
            debt.amount = safeConvert(debt.amount);
            debt.amountPaid = safeConvert(debt.amountPaid);
            if (debt.monthlyPayment != null) debt.monthlyPayment = safeConvert(debt.monthlyPayment);
            await debt.save();
        }

        // 4. Convert Budgets
        const budgets = await Budget.find({ user: userId });
        for (const budget of budgets) {
            budget.allocatedAmount = safeConvert(budget.allocatedAmount);
            await budget.save();
        }

        // 5. Invalidate Caches
        // Clear transaction and analytics caches so the mobile app pulls fresh converted data
        invalidatePrefixes('transaction', 'analytics');

        console.log(`[Currency] ✅ Successfully converted all finances at rate ${rate}`);
        return { success: true, rate };
    } catch (err) {
        console.error('[Currency] ❌ Migration failed:', err.message);
        throw err;
    }
};

module.exports = { convertUserFinances };
