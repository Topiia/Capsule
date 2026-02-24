require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');

const listUsers = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const user = await User.findOne({ email: 'haabhai83@gmail.com' });
    if (user) {
      console.log('User Found:');
      console.log(`ID: ${user._id}`);
      console.log(`Username: ${user.username}`);
      console.log(`Email: ${user.email}`);
      console.log(`Role: ${user.role}`); // CRITICAL CHECK
      console.log(`Is Verified: ${user.isVerified}`);
    } else {
      console.log('User haabhai83@gmail.com NOT FOUND');
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

listUsers();
