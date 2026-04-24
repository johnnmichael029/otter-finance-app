const Transaction = require('../models/transactionModel');
const Budget = require('../models/budgetModel');
const Wallet = require('../models/walletModel');
const Notification = require('../models/Notification');
const { invalidatePrefixes } = require('../utils/cache');
const { encrypt, decryptNote } = require('../utils/encryption');
const mongoose = require('mongoose');

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/transactions
//  Query: ?type=expense|income&category=Food&startDate=&endDate=&page=1&limit=20
//  Returns paginated transactions for the authenticated user
// ─────────────────────────────────────────────────────────────────────────────
const getTransactions = async (req, res) => {
    try {
        const { type, category, startDate, endDate, page = 1, limit = 20, isArchived } = req.query;

        const filter = { user: req.userId };
        
        // Handle Archive filtering (default to only non-archived in main feed)
        if (isArchived !== undefined) {
            if (isArchived === 'true') {
                filter.isArchived = true;
            } else {
                filter.isArchived = { $ne: true };
            }
        } else {
            filter.isArchived = { $ne: true };
        }

        if (type) filter.type = type;
        if (category) filter.category = category;
        if (startDate || endDate) {
            filter.date = {};
            if (startDate) filter.date.$gte = new Date(startDate);
            if (endDate) filter.date.$lte = new Date(endDate);
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [transactions, total] = await Promise.all([
            Transaction.find(filter)
                .sort({ date: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .populate('wallet', 'name type color')
                .populate('sourceWallet', 'name type color')
                .lean(),
            Transaction.countDocuments(filter),
        ]);

        res.json({
            transactions: transactions.map(decryptNote),
            total,
            page: parseInt(page),
            pages: Math.ceil(total / parseInt(limit)),
        });
    } catch (err) {
        console.error('[TRANSACTION] getTransactions error:', err.message);
        res.status(500).json({ error: 'Failed to fetch transactions.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/transactions/summary
//  Returns: { totalIncome, totalExpenses, balance } for current month (default)
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/transactions/summary
// Query: ?range=day|week|month
const getSummary = async (req, res) => {
    try {
        const { range = 'month' } = req.query;
        const now = new Date();
        let start, end, groupFormat, buckets;

        if (range === 'day') {
            start = new Date(now.setHours(0, 0, 0, 0));
            end = new Date(now.setHours(23, 59, 59, 999));
            groupFormat = { $hour: { date: '$date', timezone: '+08:00' } };
            buckets = [8, 12, 16, 20, 24]; // 8A, 12P, 4P, 8P, 12A
        } else if (range === 'week') {
            const first = now.getDate() - now.getDay();
            start = new Date(now.setDate(first));
            start.setHours(0, 0, 0, 0);
            end = new Date(now.setDate(first + 6));
            end.setHours(23, 59, 59, 999);
            groupFormat = { $dayOfWeek: { date: '$date', timezone: '+08:00' } }; // 1(Sun)-7(Sat)
            buckets = [1, 2, 3, 4, 5, 6, 7];
        } else if (range === 'all') {
            start = new Date(0); // Epoch start
            end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
            groupFormat = { $month: { date: '$date', timezone: '+08:00' } };
            buckets = [1];
        } else {
            start = new Date(now.getFullYear(), now.getMonth(), 1);
            end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
            groupFormat = { $ceil: { $divide: [{ $dayOfMonth: { date: '$date', timezone: '+08:00' } }, 7] } }; // Week 1-4/5
            buckets = [1, 2, 3, 4];
        }

        const stats = await Transaction.aggregate([
            {
                $match: {
                    user: new mongoose.Types.ObjectId(req.userId),
                    date: { $gte: start, $lte: end },
                    wallet: null,
                    isArchived: { $ne: true }
                }
            },
            {
                $group: {
                    _id: { bucket: groupFormat, type: '$type' },
                    total: { $sum: '$amount' }
                }
            }
        ]);

        // Process Totals
        const summary = { totalIncome: 0, totalExpenses: 0, balance: 0 };
        const incomeDist = buckets.map(() => 0);
        const expenseDist = buckets.map(() => 0);

        stats.forEach(s => {
            if (s._id.type === 'income') summary.totalIncome += s.total;
            if (s._id.type === 'expense') summary.totalExpenses += s.total;

            // Map to buckets
            let bIndex = -1;
            const bValue = s._id.bucket;

            if (range === 'day') {
                // Find nearest bucket: 8, 12, 16, 20, 24
                if (bValue < 10) bIndex = 0;
                else if (bValue < 14) bIndex = 1;
                else if (bValue < 18) bIndex = 2;
                else if (bValue < 22) bIndex = 3;
                else bIndex = 4;
            } else if (range === 'week') {
                bIndex = bValue - 1; // 1-7 to 0-6
            } else {
                bIndex = Math.min(bValue - 1, 3); // cap at 4 weeks
            }

            if (bIndex >= 0 && bIndex < buckets.length) {
                if (s._id.type === 'income') incomeDist[bIndex] += s.total;
                else expenseDist[bIndex] += s.total;
            }
        });

        summary.balance = summary.totalIncome - summary.totalExpenses;

        // Calculate Lifetime Net Balance of "HAND" money (transactions with no wallet)
        const lifetimeAgg = await Transaction.aggregate([
            { $match: { user: new mongoose.Types.ObjectId(req.userId), wallet: null, isArchived: { $ne: true } } },
            { $group: { _id: '$type', total: { $sum: '$amount' } } }
        ]);
        let netBalance = 0;
        lifetimeAgg.forEach(r => {
            if (r._id === 'income') netBalance += r.total;
            if (r._id === 'expense') netBalance -= r.total;
        });

        // Convert to Percentages for chart (relative to max in that range)
        const maxVal = Math.max(...incomeDist, ...expenseDist, 100); 
        const normalize = (dist) => dist.map(v => Math.round((v / maxVal) * 100));

        res.json({
            ...summary,
            netBalance, // Total wallet balance
            incomeDist: normalize(incomeDist),
            expenseDist: normalize(expenseDist)
        });
    } catch (err) {
        console.error('[TRANSACTION] getSummary error:', err.message);
        res.status(500).json({ error: 'Failed to fetch summary.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/transactions
//  Body: { type, amount, category, description, date, note }
// ─────────────────────────────────────────────────────────────────────────────
const createTransaction = async (req, res) => {
    try {
        const io = req.app.get('io');
        const { 
            type, amount, category, categoryIcon, categoryColor, 
            description, date, note,
            currency, originalAmount, exchangeRate, attachment,
            walletId, walletDeductAmount,
            sourceWalletId, sourceWalletDeductAmount
        } = req.body;

        if (!type || !amount || !category) {
            return res.status(400).json({ error: 'type, amount, and category are required.' });
        }

        // Calculate current total balance of "HAND" money (wallet: null)
        const balanceAgg = await Transaction.aggregate([
            { $match: { user: req.userId ? new mongoose.Types.ObjectId(req.userId) : null, wallet: null } },
            { $group: { _id: '$type', total: { $sum: '$amount' } } },
        ]);
        let currentBalance = 0;
        balanceAgg.forEach(r => {
            const val = parseFloat(r.total) || 0;
            if (r._id === 'income') currentBalance += val;
            if (r._id === 'expense') currentBalance -= val;
        });

        const safeAmount = parseFloat(amount) || 0;
        // Running balance only matters for HAND transactions if this is a HAND transaction
        const runningBalance = !walletId 
            ? (type === 'income' ? currentBalance + safeAmount : currentBalance - safeAmount)
            : currentBalance; // Keep current hand balance if paying from wallet

        const transaction = await Transaction.create({
            user: req.userId,
            type,
            amount,
            category,
            categoryIcon,
            categoryColor,
            description,
            date: date || new Date(),
            note: encrypt(note),    // 🔒 Encrypt at rest
            currency: currency || 'PHP',
            originalAmount,
            exchangeRate,
            attachment,
            runningBalance,
            wallet: walletId || null,
            sourceWallet: sourceWalletId || null,
            sourceWalletAmount: null,
            sourceWalletCurrency: null
        });

        // ── Feature: SOURCE WALLET Deduction (for Income/Transfer logic) ──
        if (sourceWalletId) {
            const sWallet = await Wallet.findOne({ _id: sourceWalletId, userId: req.userId });
            if (sWallet) {
                // If it's crypto/stocks or foreign fiat, use the native amount provided
                const isForeign = sWallet.currency && sWallet.currency !== 'PHP';
                const srcNativeAmount = (sWallet.type === 'Crypto' || sWallet.type === 'Stocks' || isForeign)
                    ? (sourceWalletDeductAmount != null ? Math.abs(parseFloat(sourceWalletDeductAmount)) : (walletDeductAmount != null ? Math.abs(parseFloat(walletDeductAmount)) : safeAmount))
                    : safeAmount;

                // We ALWAYS deduct from source wallet
                sWallet.balance -= srcNativeAmount;
                if (sWallet.type !== 'Credit' && sWallet.balance < 0) sWallet.balance = 0;
                await sWallet.save();

                // Save native info to transaction
                transaction.sourceWalletAmount = srcNativeAmount;
                transaction.sourceWalletCurrency = sWallet.coinSymbol || sWallet.stockSymbol || sWallet.currency || 'PHP';
                await transaction.save();

                if (io) io.to(`user:${req.userId}`).emit('wallet_updated', sWallet.toObject());
            }
        }

        // ── Feature: Wallet Balance Sync (Destination) ──────────────────────────
        if (walletId) {
            const wallet = await Wallet.findOne({ _id: walletId, userId: req.userId });
            if (wallet) {
                const fiatTypes = ['Debit', 'Credit', 'Cash', 'E-Wallet'];
                const isFiat = fiatTypes.includes(wallet.type);
                const isCrypto = wallet.type === 'Crypto';
                const isStocks = wallet.type === 'Stocks';

                const isCredit = wallet.type === 'Credit';

                // Determine how much to add/deduct in native units
                const isForeign = wallet.currency && wallet.currency !== 'PHP';
                const nativeAmount = (isCrypto || isStocks || isForeign)
                    ? (walletDeductAmount != null ? Math.abs(parseFloat(walletDeductAmount)) : safeAmount)
                    : safeAmount;

                if (isFiat || isCrypto || isStocks) {
                    if (isCredit) {
                        // FOR CREDIT WALLETS: Expense increases the owed balance, Income decreases it
                        if (type === 'expense') {
                            wallet.balance += nativeAmount;
                        } else {
                            wallet.balance -= nativeAmount;
                        }
                    } else {
                        // NORMAL WALLETS: Income increases balance, Expense decreases it
                        if (type === 'income') {
                            wallet.balance += nativeAmount;
                        } else {
                            wallet.balance -= nativeAmount;
                        }
                    }

                    // Guard against negative balance for non-credit wallets (optional, credit can be negative)
                    if (!isCredit && wallet.balance < 0) wallet.balance = 0;
                    
                    await wallet.save();
                    
                    // Attach native info to the transaction for history view
                    transaction.walletAmount = nativeAmount;
                    transaction.walletCurrency = isCrypto ? wallet.coinSymbol : (isStocks ? (wallet.stockSymbol || wallet.stockTicker) : 'PHP');
                    await transaction.save();

                    if (io) {
                        io.to(`user:${req.userId}`).emit('wallet_updated', wallet.toObject());
                    }
                }
            }
        }

        invalidatePrefixes('transaction');

        // ── Feature #7: Budget Alerter ──────────────────────────────
        if (type === 'expense') {
            checkBudgetAlerts(req.userId, category, req.app.get('io'));
        }

        const fullTransaction = await Transaction.findById(transaction._id)
            .populate('wallet', 'name type color')
            .populate('sourceWallet', 'name type color')
            .lean();
        const decrypted = decryptNote(fullTransaction);

        // Emit real-time event so connected mobile clients update instantly
        if (io) {
            io.to(`user:${req.userId}`).emit('new_transaction', decrypted);
        }

        res.status(201).json(decrypted);
    } catch (err) {
        console.error('[TRANSACTION] createTransaction error:', err.message);
        res.status(500).json({ error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  PATCH /api/transactions/:id
//  Body: partial transaction fields
// ─────────────────────────────────────────────────────────────────────────────
const updateTransaction = async (req, res) => {
    try {
        // Encrypt note if it's being updated
        if (req.body.note !== undefined) {
            req.body.note = encrypt(req.body.note);
        }

        const transaction = await Transaction.findOneAndUpdate(
            { _id: req.params.id, user: req.userId },
            { $set: req.body },
            { returnDocument: 'after', runValidators: true }
        );

        if (!transaction) {
            return res.status(404).json({ error: 'Transaction not found.' });
        }

        invalidatePrefixes('transaction');

        const decrypted = decryptNote(transaction.toObject());

        const io = req.app.get('io');
        if (io) {
            io.to(`user:${req.userId}`).emit('update_transaction', decrypted);
        }

        res.json(decrypted);
    } catch (err) {
        console.error('[TRANSACTION] updateTransaction error:', err.message);
        res.status(500).json({ error: 'Failed to update transaction.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  DELETE /api/transactions/:id
// ─────────────────────────────────────────────────────────────────────────────
const deleteTransaction = async (req, res) => {
    try {
        const transaction = await Transaction.findOneAndDelete({
            _id: req.params.id,
            user: req.userId,
        });

        if (!transaction) {
            return res.status(404).json({ error: 'Transaction not found.' });
        }

        // ── Feature: Wallet Balance Reversal Sync ──────────────────
        if (transaction.wallet) {
            const wallet = await Wallet.findOne({ _id: transaction.wallet, userId: req.userId });
            if (wallet) {
                const isCredit = wallet.type === 'Credit';
                const amount = transaction.amount;
                
                // REVERSE the logic
                if (isCredit) {
                    // If we delete a Credit expense, the owed balance DECREASES
                    if (transaction.type === 'expense') {
                        wallet.balance -= amount;
                    } else {
                        wallet.balance += amount;
                    }
                } else {
                    // Normal wallet: deleting an expense adds money back
                    if (transaction.type === 'expense') {
                        wallet.balance += amount;
                    } else {
                        wallet.balance -= amount;
                    }
                }

                if (!isCredit && wallet.balance < 0) wallet.balance = 0;
                await wallet.save();

                const io = req.app.get('io');
                if (io) {
                    io.to(`user:${req.userId}`).emit('wallet_updated', wallet.toObject());
                }
            }
        }

        invalidatePrefixes('transaction');

        const io = req.app.get('io');
        if (io) {
            io.to(`user:${req.userId}`).emit('delete_transaction', { _id: transaction._id });
        }

        res.json({ message: 'Transaction deleted successfully.' });
    } catch (err) {
        console.error('[TRANSACTION] deleteTransaction error:', err.message);
        res.status(500).json({ error: 'Failed to delete transaction.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/transactions/analytics
//  Generates AI Insight, Pie Chart Data, and 6-month Trends
// ─────────────────────────────────────────────────────────────────────────────
const getAnalytics = async (req, res) => {
    try {
        const now = new Date();
        const firstDayThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const firstDay6MonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

        // 1. Category Breakdown (Current Month)
        const currentMonthAgg = await Transaction.aggregate([
            {
                $match: {
                    user: new mongoose.Types.ObjectId(req.userId),
                    type: 'expense',
                    date: { $gte: firstDayThisMonth },
                    isArchived: { $ne: true }
                }
            },
            {
                $group: {
                    _id: '$category',
                    total: { $sum: '$amount' },
                    color: { $first: '$categoryColor' }
                }
            },
            { $sort: { total: -1 } }
        ]);

        const pieChartData = currentMonthAgg.map(item => ({
            name: item._id,
            population: item.total,
            color: item.color || '#E91E8C',
            legendFontColor: '#7F7F7F',
            legendFontSize: 12
        }));

        // 2. Trend Graph (Last 6 Months)
        const trendsAgg = await Transaction.aggregate([
            {
                $match: {
                    user: new mongoose.Types.ObjectId(req.userId),
                    date: { $gte: firstDay6MonthsAgo },
                    isArchived: { $ne: true }
                }
            },
            {
                $group: {
                    _id: {
                        month: { $month: '$date' },
                        year: { $year: '$date' },
                        type: '$type'
                    },
                    total: { $sum: '$amount' }
                }
            }
        ]);

        // Format Trends Data
        const monthsLabel = [];
        const expenseData = [];
        const incomeData = [];
        
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            monthsLabel.push(d.toLocaleString('en-US', { month: 'short' }));
            const m = d.getMonth() + 1;
            const y = d.getFullYear();
            
            const exp = trendsAgg.find(t => t._id.month === m && t._id.year === y && t._id.type === 'expense');
            const inc = trendsAgg.find(t => t._id.month === m && t._id.year === y && t._id.type === 'income');
            
            expenseData.push(exp ? exp.total : 0);
            incomeData.push(inc ? inc.total : 0);
        }

        const trendData = {
            labels: monthsLabel,
            datasets: [
                { data: expenseData, color: (opacity = 1) => `rgba(233, 30, 140, ${opacity})` }, // primary pink
                { data: incomeData, color: (opacity = 1) => `rgba(37, 99, 235, ${opacity})` }  // blue
            ]
        };

        // 3. AI Smart Insights (Last vs This month)
        const lastMonthAgg = await Transaction.aggregate([
            {
                $match: {
                    user: new mongoose.Types.ObjectId(req.userId),
                    type: 'expense',
                    date: { $gte: firstDayLastMonth, $lt: firstDayThisMonth },
                    isArchived: { $ne: true }
                }
            },
            {
                $group: {
                    _id: '$category',
                    total: { $sum: '$amount' }
                }
            }
        ]);

        // 4. Advanced AI Smart Insights 🤖
        const insights = [];

        // Insight A: Category Change
        if (currentMonthAgg.length > 0 && lastMonthAgg.length > 0) {
            const topCategory = currentMonthAgg[0];
            const lastMonthSameCat = lastMonthAgg.find(c => c._id === topCategory._id);
            if (lastMonthSameCat && lastMonthSameCat.total > 0) {
                const diff = topCategory.total - lastMonthSameCat.total;
                const pct = Math.round(Math.abs(diff) / lastMonthSameCat.total * 100);
                if (diff > 0 && pct > 10) {
                    insights.push(`Your spending on ${topCategory._id} has increased by ${pct}% this month. Keep an eye on it! ⚠️`);
                } else if (diff < 0 && pct > 5) {
                    insights.push(`Awesome! You've reduced your ${topCategory._id} spending by ${pct}% compared to last month. 🌟`);
                }
            }
        }

        // Insight B: Velocity Check
        const dayOfMonth = now.getDate();
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const totalExpensesThisMonth = currentMonthAgg.reduce((sum, item) => sum + item.total, 0);
        const totalExpensesLastMonth = lastMonthAgg.reduce((sum, item) => sum + item.total, 0);

        if (totalExpensesLastMonth > 0) {
            const velocityPct = Math.round((totalExpensesThisMonth / totalExpensesLastMonth) * 100);
            const timePct = Math.round((dayOfMonth / daysInMonth) * 100);

            if (velocityPct > timePct + 15) {
                insights.push(`Careful! You've already spent ${velocityPct}% of last month's total budget, but we're only ${timePct}% through the month. 💨`);
            } else if (velocityPct < timePct - 15 && totalExpensesThisMonth > 0) {
                insights.push(`Great pacing! Your spending is significantly lower than this time last month. 🐢`);
            }
        }

        // Insight C: Savings Rate
        const totalIncomeThisMonth = incomeData[5];
        if (totalIncomeThisMonth > 0) {
            const savingsRate = Math.round(((totalIncomeThisMonth - totalExpensesThisMonth) / totalIncomeThisMonth) * 100);
            if (savingsRate > 20) {
                insights.push(`Your savings rate is ${savingsRate}% this month. You're building wealth fast! 💰`);
            } else if (savingsRate < 0) {
                insights.push(`Heads up: You've spent more than you earned this month. Let's look for some cuts! 📉`);
            }
        }

        // Final primary insight for legacy compatibility if needed
        const primaryInsight = insights[0] || "Keep tracking your expenses to get personalized insights!";

        res.json({
            pieChartData,
            trendData,
            insight: primaryInsight,
            insights: insights.length > 0 ? insights : ["No major patterns detected yet. Keep logging!"],
            stats: {
                totalExpenses: totalExpensesThisMonth,
                totalIncome: totalIncomeThisMonth,
                avgDaily: Math.round(totalExpensesThisMonth / dayOfMonth)
            }
        });

    } catch (err) {
        console.error('[TRANSACTION] getAnalytics error:', err.message);
        res.status(500).json({ error: 'Failed to fetch analytics.' });
    }
};

/**
 * Helper: Budget Alert System
 * Runs in background after a transaction is created
 */
const checkBudgetAlerts = async (userId, categoryName, io) => {
    try {
        const now = new Date();
        const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        // 1. Find the budget for this category
        const budget = await Budget.findOne({ user: userId, month: monthStr, category: categoryName });
        if (!budget) return; // No budget set for this category

        // 2. Calculate total spent this month for this category
        const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        const spendingAgg = await Transaction.aggregate([
            {
                $match: {
                    user: new mongoose.Types.ObjectId(userId),
                    category: categoryName,
                    type: 'expense',
                    date: { $gte: startDate, $lte: endDate }
                }
            },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);

        const totalSpent = spendingAgg.length > 0 ? spendingAgg[0].total : 0;
        const limit = budget.allocatedAmount;
        const percentage = (totalSpent / limit) * 100;

        let alertType = null;
        let alertTitle = '';
        let alertMessage = '';

        if (percentage >= 100) {
            alertType = '100_percent';
            alertTitle = '🚨 Budget Exceeded!';
            alertMessage = `You've spent ${Math.round(percentage)}% of your "${categoryName}" budget for ${monthStr}.`;
        } else if (percentage >= 80) {
            alertType = '80_percent';
            alertTitle = '⚠️ Budget Warning';
            alertMessage = `You've reached ${Math.round(percentage)}% of your "${categoryName}" budget. Watch your spending!`;
        } else if (budget.reminderAmount > 0 && totalSpent >= budget.reminderAmount) {
            alertType = 'reminder';
            alertTitle = '🔔 Budget Reminder';
            alertMessage = `You hit the reminder for your "${categoryName}" spend! Current: ₱${totalSpent.toLocaleString()} (Limit: ₱${limit.toLocaleString()})`;
        }

        if (alertType) {
            // Check if we already sent this specific alert type for this category today
            // (Wait: maybe just check if any exists for this category/month/type combo to avoid spam)
            const exists = await Notification.findOne({
                user: userId,
                type: 'budget_alert',
                'data.category': categoryName,
                'data.threshold': alertType,
                createdAt: { $gte: startDate } // Since it's a monthly budget, maybe once per month per threshold?
            });

            if (!exists) {
                const notif = await Notification.create({
                    user: userId,
                    type: 'budget_alert',
                    title: alertTitle,
                    message: alertMessage,
                    data: { category: categoryName, threshold: alertType, percentage }
                });

                if (io) {
                    io.to(`user:${userId}`).emit('new_notification', notif);
                }
            }
        }
    } catch (e) {
        console.error('[BUDGET_ALERT] Error:', e.message);
    }
};

// ─────────────────────────────────────────────────────────────────────────────
//  PATCH /api/transactions/:id/archive
//  Toggle isArchived status
// ─────────────────────────────────────────────────────────────────────────────
const archiveTransaction = async (req, res) => {
    try {
        const transaction = await Transaction.findOne({ _id: req.params.id, user: req.userId });

        if (!transaction) {
            return res.status(404).json({ error: 'Transaction not found.' });
        }

        transaction.isArchived = !transaction.isArchived;
        await transaction.save();

        invalidatePrefixes('transaction');

        const io = req.app.get('io');
        if (io) {
            io.to(`user:${req.userId}`).emit('transaction_archived', { 
                _id: transaction._id, 
                isArchived: transaction.isArchived 
            });
        }

        res.json({ message: transaction.isArchived ? 'Archived' : 'Restored', isArchived: transaction.isArchived });
    } catch (err) {
        console.error('[TRANSACTION] archiveTransaction error:', err.message);
        res.status(500).json({ error: 'Failed to archive transaction.' });
    }
};

module.exports = { 
    getTransactions, 
    getSummary, 
    createTransaction, 
    updateTransaction, 
    deleteTransaction, 
    getAnalytics,
    archiveTransaction 
};
