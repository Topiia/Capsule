const mongoose = require('mongoose');
const logger = require('./logger');
const Vlog = require('../models/Vlog');

/**
 * Connect to MongoDB with exponential-backoff retry.
 *
 * Retries up to `maxRetries` times before giving up.
 * Throws after exhaustion so the caller (server.js) can handle it.
 *
 * @param {number} maxRetries
 * @returns {Promise<void>}
 */
const connectDB = async (maxRetries = 5) => {
  const attempt = async (remaining) => {
    try {
      const conn = await mongoose.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 5000, // fail fast per attempt
      });

      logger.info('MongoDB connected', {
        host: conn.connection.host,
        database: conn.connection.name,
        attempt: maxRetries - remaining + 1,
      });

      // Non-blocking: ensure text index exists for $text search.
      Vlog.syncIndexes()
        .then(() => logger.info('Vlog indexes synced'))
        .catch((err) => logger.error('Vlog index sync failed (non-fatal)', { error: err.message }));
    } catch (error) {
      if (remaining <= 0) {
        logger.error('MongoDB permanently failed — exhausted all retries', {
          error: { message: error.message },
          attempts: maxRetries + 1,
        });
        throw error;
      }

      const delayMs = Math.min(1000 * (maxRetries - remaining + 1), 5000);
      logger.warn(`MongoDB failed — retrying in ${delayMs / 1000}s`, {
        remaining,
        error: error.message,
      });

      // eslint-disable-next-line no-promise-executor-return
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      await attempt(remaining - 1);
    }
  };

  await attempt(maxRetries);
};

module.exports = connectDB;
