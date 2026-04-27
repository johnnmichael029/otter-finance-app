/**
 * OTTER — Forecast Utilities
 * Logic for calculating daily burn rate and projecting future balance.
 */

export const calculateForecast = (state) => {
    const transactions = state.transactions || [];
    const balance = state.transactionSummary?.balance || 0;
    const bills = state.recurringBills || [];

    // 1. Calculate Average Daily Burn (Last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentExpenses = transactions.filter(tx => 
        tx.type === 'expense' && 
        new Date(tx.date || tx.createdAt) >= thirtyDaysAgo
    );

    const totalSpent = recentExpenses.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    const dailyBurn = totalSpent / 30;

    // 2. Project End of Month
    const now = new Date();
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const daysRemaining = lastDayOfMonth.getDate() - now.getDate();

    // 3. Identify Upcoming Bills for this month
    const upcomingBillsTotal = bills.reduce((sum, bill) => {
        const nextDue = new Date(bill.nextDueDate);
        if (nextDue > now && nextDue <= lastDayOfMonth) {
            return sum + (bill.amount || 0);
        }
        return sum;
    }, 0);

    const projectedSpend = (dailyBurn * daysRemaining) + upcomingBillsTotal;
    const endOfMonthBalance = balance - projectedSpend;

    // 4. Calculate Runway (Days until 0)
    const runwayDays = dailyBurn > 0 ? Math.floor(balance / dailyBurn) : 999;

    return {
        dailyBurn,
        projectedSpend,
        endOfMonthBalance,
        runwayDays,
        upcomingBillsTotal
    };
};
