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
  port: parseInt(process.env.REDIS_PORT, 10) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB, 10) || 0,
  retryStrategy: (times) => {
    // Cap retries at 10 attempts, then stop (return null = stop retrying)
    if (times > 10) {
      logger.warn('Redis retry limit reached (10 attempts), stopping reconnection attempts');
      return null; // Stop retrying
    }
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

// Track Redis availability (event-driven, non-blocking)
let isRedisAvailable = false;

// Update availability on 'ready' event
redis.on('ready', () => {
  isRedisAvailable = true;
});

// Mark unavailable on errors or close
redis.on('error', () => {
  isRedisAvailable = false;
});

redis.on('close', () => {
  isRedisAvailable = false;
});

// Attempt initial connection (lazy, non-blocking)
redis.connect().catch((err) => {
  logger.warn('Redis initial connection failed - running without cache', {
    error: {
      message: err.message,
      code: err.code,
    },
  });
  console.warn('[WARN] Redis unavailable - caching disabled');
});

/**
 * Check if Redis is available
 * @returns {boolean} - True if Redis is ready
 */
redis.isAvailable = () => isRedisAvailable;

// Graceful shutdown
process.on('SIGTERM', async () => {
  if (isRedisAvailable) {
    await redis.quit();
    logger.info('Redis connection closed on SIGTERM');
  }
});

/**
 * SAFE WRAPPERS: Return null/false if Redis unavailable (no throws)
 */

/**
 * Safe get - Returns null if Redis unavailable
 * @param {string} key - Cache key
 * @returns {Promise<string|null>} - Value or null
 */
redis.safeGet = async function safeGet(key) {
  if (!isRedisAvailable) return null;
  try {
    return await this.get(key);
  } catch (error) {
    logger.error('Redis safeGet error', { key, error: error.message });
    return null;
  }
};

/**
 * Safe set - Returns false if Redis unavailable
 * @param {string} key - Cache key
 * @param {string} value - Value to set
 * @param {string} mode - Optional mode (e.g., 'EX')
 * @param {number} ttl - Optional TTL in seconds
 * @returns {Promise<boolean>} - True if successful, false otherwise
 */
redis.safeSet = async function safeSet(key, value, mode, ttl) {
  if (!isRedisAvailable) return false;
  try {
    if (mode && ttl) {
      await this.set(key, value, mode, ttl);
    } else {
      await this.set(key, value);
    }
    return true;
  } catch (error) {
    logger.error('Redis safeSet error', { key, error: error.message });
    return false;
  }
};

/**
 * Safe delete - Returns 0 if Redis unavailable
 * @param {string[]} keys - Keys to delete
 * @returns {Promise<number>} - Number of keys deleted
 */
redis.safeDel = async function safeDel(...keys) {
  if (!isRedisAvailable) return 0;
  try {
    return await this.del(...keys);
  } catch (error) {
    logger.error('Redis safeDel error', { keys, error: error.message });
    return 0;
  }
};

/**
 * Safe delete by pattern - Returns 0 if Redis unavailable
 * @param {string} pattern - Key pattern (e.g., 'cache:*')
 * @returns {Promise<number>} - Number of keys deleted
 */
redis.safeScanDelPattern = async function safeScanDelPattern(pattern) {
  if (!isRedisAvailable) return 0;
  try {
    const keys = await this.keys(pattern);
    if (keys.length === 0) return 0;
    return await this.del(...keys);
  } catch (error) {
    logger.error('Redis safeScanDelPattern error', { pattern, error: error.message });
    return 0;
  }
};

/**
 * Helper: Get cached data
 * @param {string} key - Cache key
 * @returns {Promise<any>} - Parsed JSON data or null
 */
redis.getJSON = async function getJSON(key) {
  if (!isRedisAvailable) return null;
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
redis.setJSON = async function setJSON(key, value, ttl = 300) {
  if (!isRedisAvailable) return null;
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
redis.delPattern = async function delPattern(pattern) {
  if (!isRedisAvailable) return 0;
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
