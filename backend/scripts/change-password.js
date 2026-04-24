const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const User = require('../models/userModel');

async function changePassword(email, newPassword) {
    try {
        console.log(`[Admin] 🛠️ Connecting to database...`);
        await mongoose.connect(process.env.MONGODB_URI);
        console.log(`[Admin] ✅ Connected.`);

        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            console.error(`[Admin] ❌ User not found: ${email}`);
            process.exit(1);
        }

        console.log(`[Admin] 👤 Found User: ${user.name}`);
        
        // Setting the password directly triggers the .pre('save') hook in our model 
        // which will automatically hash it for us!
        user.password = newPassword;
        
        await user.save();

        console.log(`[Admin] ✨ SUCCESS! Password for ${email} has been updated.`);
        process.exit(0);
    } catch (err) {
        console.error('[Admin] ❌ Error:', err.message);
        process.exit(1);
    }
}

// Get arguments from command line
const emailArg = process.argv[2];
const passArg = process.argv[3];

if (!emailArg || !passArg) {
    console.error('Usage: node scripts/change-password.js <email> <new_password>');
    process.exit(1);
}

changePassword(emailArg, passArg);
