const mongoose = require('mongoose');

async function check() {
  try {
    await mongoose.connect('mongodb://localhost:27017/vlogsphere-test-check', {
      serverSelectionTimeoutMS: 2000,
    });
    console.log('CONNECTED');
    await mongoose.disconnect();
    process.exit(0);
  } catch (e) {
    console.log('FAILED');
    process.exit(1);
  }
}
check();
