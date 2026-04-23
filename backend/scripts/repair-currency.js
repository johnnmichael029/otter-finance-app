const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const User = require('../models/userModel');

async function repairCurrency(email) {
    try {
        console.log(`[Repair] 🛠️ Connecting to database...`);
        await mongoose.connect(process.env.MONGODB_URI);
        console.log(`[Repair] ✅ Connected.`);

        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            console.error(`[Repair] ❌ User not found with email: ${email}`);
            process.exit(1);
        }

        console.log(`[Repair] 👤 Found User: ${user.name}`);
        console.log(`[Repair] 🔄 Current Currency: ${user.currency}`);
        
        // This is the "Magic Fix": We just change the label, we DON'T touch the numbers.
        user.currency = 'PHP';
        user.isOnboarded = false; // Optional: Let' them do onboarding again if they want
        
        await user.save();

        console.log(`[Repair] ✨ SUCCESS! Currency for ${email} has been reset to PHP.`);
        console.log(`[Repair] 💡 All balances that were "$100" are now "₱100" again.`);
        
        process.exit(0);
    } catch (err) {
        console.error('[Repair] ❌ Error:', err.message);
        process.exit(1);
    }
}

// Get email from command line
const emailArg = process.argv[2];
if (!emailArg) {
    console.error('Please provide the user email: node scripts/repair-currency.js user@example.com');
    process.exit(1);
}

repairCurrency(emailArg);
