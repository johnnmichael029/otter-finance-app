const mongoose = require('mongoose');
const Transaction = require('../backend/models/transactionModel');
const User = require('../backend/models/userModel');

async function debugHandBalance(userId) {
    await mongoose.connect('mongodb://localhost:27017/otter_finance'); // Adjust DB name if needed

    const user = await User.findById(userId);
    console.log('Current user.handBalance:', user.handBalance);

    const txs = await Transaction.find({ user: userId, wallet: null, isArchived: { $ne: true } }).sort({ date: 1 });
    
    let sum = 0;
    console.log('\n--- Active Hand Transactions ---');
    txs.forEach(t => {
        if (t.type === 'income') sum += t.amount;
        else sum -= t.amount;
        console.log(`[${t.date.toISOString().split('T')[0]}] ${t.type.padEnd(7)}: ${t.amount.toString().padStart(8)} | Desc: ${t.description}`);
    });

    const deductions = await Transaction.find({ user: userId, paymentSource: 'HAND', wallet: { $ne: null }, isArchived: { $ne: true } });
    console.log('\n--- Active Hand Deductions (to Wallets) ---');
    deductions.forEach(t => {
        sum -= t.amount;
        console.log(`[${t.date.toISOString().split('T')[0]}] DEDUCT : ${t.amount.toString().padStart(8)} | Desc: ${t.description}`);
    });

    console.log('\nCalculated Sum:', sum);
    console.log('Discrepancy:', sum - user.handBalance);

    await mongoose.disconnect();
}

// Replace with actual user ID from the logs if possible, or I'll just look at the logs
const userId = '69e302238ef63d9a788909ae'; // From the logs
debugHandBalance(userId);
