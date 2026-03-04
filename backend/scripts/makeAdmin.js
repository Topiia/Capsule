const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../src/models/User');

// Load env vars
dotenv.config();

const makeAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB Connected...');

    const email = process.argv[2];
    if (!email) {
      console.log('Please provide an email address as an argument.');
      console.log('Usage: node scripts/makeAdmin.js <email>');
      process.exit(1);
    }

    const user = await User.findOne({ email });

    if (!user) {
      console.log(`User not found with email: ${email}`);
      process.exit(1);
    }

    user.role = 'admin';
    await user.save();

    console.log(`SUCCESS: User ${user.username} (${user.email}) is now an ADMIN.`);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

makeAdmin();
