require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');

const createUser = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const email = 'haabhai83@gmail.com';
    const password = 'password123';
    const username = 'haabhai83';

    let user = await User.findOne({ email });

    if (user) {
      console.log('User already exists. Updating role to admin...');
      user.role = 'admin';
      user.isVerified = true;
      await user.save();
      console.log('User updated to admin.');
    } else {
      console.log('Creating new admin user...');
      user = await User.create({
        username,
        email,
        password,
        role: 'admin',
        isVerified: true,
        isActive: true,
      });
      console.log('User created successfully.');
    }

    console.log('\nCREDENTIALS:');
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

createUser();
