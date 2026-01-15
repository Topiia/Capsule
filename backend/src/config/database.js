const mongoose = require('mongoose');
const logger = require('./logger');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    logger.info('MongoDB connected', {
      host: conn.connection.host,
      database: conn.connection.name,
    });
  } catch (error) {
    logger.error('MongoDB connection failed', {
      error: {
        message: error.message,
        stack: error.stack,
      },
    });
    process.exit(1);
  }
};

module.exports = connectDB;
