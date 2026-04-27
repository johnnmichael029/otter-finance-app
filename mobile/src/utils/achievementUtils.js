/**
 * OTTER — Achievement Utilities
 * Logic for checking and awarding badges based on store data.
 */

import { BADGES } from '../constants/badges';

export const checkAchievements = (state, addAchievement) => {
    const newlyEarned = [];

    // 1. Otter Beginner (First transaction)
    if (state.transactions && state.transactions.length > 0) {
        if (addAchievement('otter_beginner')) {
            newlyEarned.push(BADGES.find(b => b.id === 'otter_beginner'));
        }
    }

    // 2. Saver Pro (₱1,000 in savings)
    const totalSavings = (state.savingsMasterPot?.currentAmount || 0) +
        state.savingsGoals.reduce((sum, g) => sum + (g.currentAmount || 0), 0);
    if (totalSavings >= 1000) {
        if (addAchievement('saver_pro')) {
            newlyEarned.push(BADGES.find(b => b.id === 'saver_pro'));
        }
    }

    // 3. Master Planner (3+ recurring bills)
    if (state.recurringBills && state.recurringBills.length >= 3) {
        if (addAchievement('master_planner')) {
            newlyEarned.push(BADGES.find(b => b.id === 'master_planner'));
        }
    }

    // 4. Debt Crusher (Any settled debt)
    const hasPaidDebt = state.debts && state.debts.some(d => 
        d.status === 'settled' || 
        (d.amount > 0 && (d.amountPaid || 0) >= (d.amount || 0))
    );
    if (hasPaidDebt) {
        if (addAchievement('debt_crusher')) {
            newlyEarned.push(BADGES.find(b => b.id === 'debt_crusher'));
        }
    }

    // 5. Goal Getter (Completed savings goal)
    const hasCompletedGoal = state.savingsGoals && state.savingsGoals.some(g => g.isCompleted);
    if (hasCompletedGoal) {
        if (addAchievement('goal_getter')) {
            newlyEarned.push(BADGES.find(b => b.id === 'goal_getter'));
        }
    }

    // 6. Streaks: Consistent Otter (7 days) & 30-Day Streak
    const streak = calculateStreak(state.transactions || []);
    
    if (streak >= 7) {
        if (addAchievement('consistent_otter')) {
            newlyEarned.push(BADGES.find(b => b.id === 'consistent_otter'));
        }
    }
    
    if (streak >= 30) {
        if (addAchievement('thirty_day_streak')) {
            newlyEarned.push(BADGES.find(b => b.id === 'thirty_day_streak'));
        }
    }

    // 7. Social Saver (Joined or created a shared savings goal)
    const hasSharedGoal = state.savingsGoals && state.savingsGoals.some(g => 
        g.isShared || (g.participants && g.participants.length > 0)
    );
    if (hasSharedGoal) {
        if (addAchievement('social_saver')) {
            newlyEarned.push(BADGES.find(b => b.id === 'social_saver'));
        }
    }

    // 8. Frugal Five (Stayed under budget in 5 categories this month)
    const budgets = state.budgets || [];
    const summary = state.summary || {};
    const expenseDist = summary.expenseDist || [];

    let categoriesUnderBudget = 0;
    budgets.forEach(b => {
        if (b.category === 'Overall') return;
        const dist = expenseDist.find(d => d.name === b.category);
        const spent = dist ? dist.amount : 0;
        if (spent <= b.allocatedAmount) {
            categoriesUnderBudget++;
        }
    });

    if (categoriesUnderBudget >= 5) {
        if (addAchievement('frugal_five')) {
            newlyEarned.push(BADGES.find(b => b.id === 'frugal_five'));
        }
    }

    return newlyEarned;
};

/**
 * Calculates current transaction streak in days.
 */
const calculateStreak = (transactions) => {
    if (!transactions || transactions.length === 0) return 0;

    // 1. Get unique dates with transactions (ignoring time)
    const dates = [...new Set(transactions.map(tx => {
        const d = new Date(tx.date || tx.createdAt);
        return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    }))].sort((a, b) => b - a); // Sort descending (latest first)

    if (dates.length === 0) return 0;

    // 2. Check if the latest transaction is today or yesterday
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterday = today - (86400000);

    if (dates[0] < yesterday) return 0;

    // 3. Count consecutive days
    let streak = 1;
    for (let i = 0; i < dates.length - 1; i++) {
        if (dates[i] - dates[i + 1] === 86400000) {
            streak++;
        } else {
            break;
        }
    }

    return streak;
};
