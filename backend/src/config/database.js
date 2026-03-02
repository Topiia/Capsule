const mongoose = require('mongoose');
const logger = require('./logger');
const Vlog = require('../models/Vlog');

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

    // Non-blocking: ensure text index exists for $text search to work.
    // Uses .then/.catch so a slow index build never delays server startup.
    Vlog.syncIndexes()
      .then(() => logger.info('Vlog indexes synced'))
      .catch((err) => logger.error('Vlog index sync failed (non-fatal)', { error: err.message }));
  } catch (error) {
    logger.error('MongoDB connection failed', {
      error: {
        message: error.message,
        stack: error.stack,
      },
    });
    throw error;
  }
};

module.exports = connectDB;
