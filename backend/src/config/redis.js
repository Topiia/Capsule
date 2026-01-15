const Redis = require('ioredis');
const logger = require('./logger');

/**
 * PERFORMANCE: Redis Configuration
 *
 * Redis client for:
 * - API response caching
 * - Session storage
 * - Job queue backend
 * - Rate limiting state
 */

// Redis connection configuration
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB) || 0,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true,
};

// Create Redis client
const redis = new Redis(redisConfig);

// Connection event handlers
redis.on('connect', () => {
  logger.info('Redis connecting', {
    host: redisConfig.host,
    port: redisConfig.port,
  });
});

redis.on('ready', () => {
  logger.info('Redis connection established', {
    host: redisConfig.host,
    port: redisConfig.port,
    db: redisConfig.db,
  });
});

redis.on('error', (err) => {
  logger.error('Redis connection error', {
    error: {
      message: err.message,
      code: err.code,
    },
  });
});

redis.on('close', () => {
  logger.warn('Redis connection closed');
});

redis.on('reconnecting', () => {
  logger.info('Redis reconnecting...');
});

// Connect to Redis
redis.connect().catch((err) => {
  logger.error('Failed to connect to Redis', {
    error: {
      message: err.message,
      stack: err.stack,
    },
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await redis.quit();
  logger.info('Redis connection closed on SIGTERM');
});

/**
 * Helper: Get cached data
 * @param {string} key - Cache key
 * @returns {Promise<any>} - Parsed JSON data or null
 */
redis.getJSON = async function (key) {
  try {
    const data = await this.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    logger.error('Redis getJSON error', { key, error: error.message });
    return null;
  }
};

/**
 * Helper: Set cached data with TTL
 * @param {string} key - Cache key
 * @param {any} value - Data to cache (will be stringified)
 * @param {number} ttl - Time to live in seconds
 * @returns {Promise<string>} - OK or null
 */
redis.setJSON = async function (key, value, ttl = 300) {
  try {
    const serialized = JSON.stringify(value);
    if (ttl) {
      return await this.setex(key, ttl, serialized);
    }
    return await this.set(key, serialized);
  } catch (error) {
    logger.error('Redis setJSON error', { key, error: error.message });
    return null;
  }
};

/**
 * Helper: Delete cached data by pattern
 * @param {string} pattern - Key pattern (e.g., 'cache:vlogs:*')
 * @returns {Promise<number>} - Number of keys deleted
 */
redis.delPattern = async function (pattern) {
  try {
    const keys = await this.keys(pattern);
    if (keys.length === 0) return 0;
    return await this.del(...keys);
  } catch (error) {
    logger.error('Redis delPattern error', { pattern, error: error.message });
    return 0;
  }
};

module.exports = redis;
