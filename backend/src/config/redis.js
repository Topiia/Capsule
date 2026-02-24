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
 *
 * ARCHITECTURE:
 * - No connection happens at import time (side-effect free)
 * - Call connectRedis() from server.js AFTER DB connects
 * - Tests import this module with zero IO
 */

// Singleton reference — created lazily on first call to createRedisClient()
let redisClient = null;

// Track Redis availability (event-driven, non-blocking)
let isRedisAvailable = false;

/**
 * Build the ioredis config object appropriate for the current environment.
 * @returns {{ config: object, args: any[] }}
 */
function buildRedisConfig() {
  if (process.env.REDIS_URL) {
    // Production mode (Upstash / Managed Redis)
    const config = {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
      retryStrategy: (times) => {
        if (times > 10) {
          logger.warn(
            'Redis retry limit reached (10 attempts), stopping reconnection attempts',
          );
          return null;
        }
        return Math.min(times * 100, 2000);
      },
    };
    return { config, args: [process.env.REDIS_URL, config] };
  }

  // Development mode (Local Redis)
  const config = {
    host: '127.0.0.1',
    port: 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB, 10) || 0,
    lazyConnect: true,
    retryStrategy: (times) => {
      if (times > 10) {
        logger.warn(
          'Redis retry limit reached (10 attempts), stopping reconnection attempts',
        );
        return null;
      }
      return Math.min(times * 50, 2000);
    },
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
  };
  return { config, args: [config] };
}

/**
 * Get (or lazily create) the singleton Redis client.
 * No connection is attempted here — connection is explicit via connectRedis().
 *
 * @returns {Redis} ioredis client instance
 */
function createRedisClient() {
  if (redisClient) return redisClient;

  const { config, args } = buildRedisConfig();

  redisClient = new Redis(...args);

  // ─── Connection event handlers ─────────────────────────────────────────
  redisClient.on('connect', () => {
    logger.info('[Redis] Connecting…', {
      host: config.host,
      port: config.port,
    });
  });

  redisClient.on('ready', () => {
    isRedisAvailable = true;
    logger.info('[Redis] Connection established', {
      host: config.host,
      port: config.port,
      db: config.db,
    });
  });

  redisClient.on('error', (err) => {
    isRedisAvailable = false;
    logger.error('[Redis] Connection error', {
      error: { message: err.message, code: err.code },
    });
  });

  redisClient.on('close', () => {
    isRedisAvailable = false;
    logger.warn('[Redis] Connection closed');
  });

  redisClient.on('reconnecting', () => {
    logger.info('[Redis] Reconnecting…');
  });

  // ─── Graceful shutdown ────────────────────────────────────────────────
  process.on('SIGTERM', async () => {
    if (isRedisAvailable) {
      await redisClient.quit();
      logger.info('[Redis] Connection closed on SIGTERM');
    }
  });

  // ─── Safe-wrapper methods ─────────────────────────────────────────────

  /**
   * Check if Redis is available
   * @returns {boolean}
   */
  redisClient.isAvailable = () => isRedisAvailable;

  /**
   * Safe get — returns null if Redis unavailable
   * @param {string} key
   * @returns {Promise<string|null>}
   */
  redisClient.safeGet = async function safeGet(key) {
    if (!isRedisAvailable) return null;
    try {
      return await this.get(key);
    } catch (error) {
      logger.error('[Redis] safeGet error', { key, error: error.message });
      return null;
    }
  };

  /**
   * Safe set — returns false if Redis unavailable
   * @param {string} key
   * @param {string} value
   * @param {string} [mode]
   * @param {number} [ttl]
   * @returns {Promise<boolean>}
   */
  redisClient.safeSet = async function safeSet(key, value, mode, ttl) {
    if (!isRedisAvailable) return false;
    try {
      if (mode && ttl) {
        await this.set(key, value, mode, ttl);
      } else {
        await this.set(key, value);
      }
      return true;
    } catch (error) {
      logger.error('[Redis] safeSet error', { key, error: error.message });
      return false;
    }
  };

  /**
   * Safe delete — returns 0 if Redis unavailable
   * @param {...string} keys
   * @returns {Promise<number>}
   */
  redisClient.safeDel = async function safeDel(...keys) {
    if (!isRedisAvailable) return 0;
    try {
      return await this.del(...keys);
    } catch (error) {
      logger.error('[Redis] safeDel error', { keys, error: error.message });
      return 0;
    }
  };

  /**
   * Safe delete by pattern — returns 0 if Redis unavailable
   * @param {string} pattern
   * @returns {Promise<number>}
   */
  redisClient.safeScanDelPattern = async function safeScanDelPattern(pattern) {
    if (!isRedisAvailable) return 0;
    try {
      const keys = await this.keys(pattern);
      if (keys.length === 0) return 0;
      return await this.del(...keys);
    } catch (error) {
      logger.error('[Redis] safeScanDelPattern error', {
        pattern,
        error: error.message,
      });
      return 0;
    }
  };

  /**
   * Get cached JSON data
   * @param {string} key
   * @returns {Promise<any>}
   */
  redisClient.getJSON = async function getJSON(key) {
    if (!isRedisAvailable) return null;
    try {
      const data = await this.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error('[Redis] getJSON error', { key, error: error.message });
      return null;
    }
  };

  /**
   * Set cached JSON data with TTL
   * @param {string} key
   * @param {any} value
   * @param {number} [ttl=300]
   * @returns {Promise<string|null>}
   */
  redisClient.setJSON = async function setJSON(key, value, ttl = 300) {
    if (!isRedisAvailable) return null;
    try {
      const serialized = JSON.stringify(value);
      if (ttl) {
        return await this.setex(key, ttl, serialized);
      }
      return await this.set(key, serialized);
    } catch (error) {
      logger.error('[Redis] setJSON error', { key, error: error.message });
      return null;
    }
  };

  /**
   * Delete cached data by pattern
   * @param {string} pattern
   * @returns {Promise<number>}
   */
  redisClient.delPattern = async function delPattern(pattern) {
    if (!isRedisAvailable) return 0;
    try {
      const keys = await this.keys(pattern);
      if (keys.length === 0) return 0;
      return await this.del(...keys);
    } catch (error) {
      logger.error('[Redis] delPattern error', { pattern, error: error.message });
      return 0;
    }
  };

  return redisClient;
}

/**
 * Explicitly connect Redis — called ONLY from server.js after DB connects.
 *
 * Rules:
 *  - Never connects in test environment (NODE_ENV === 'test')
 *  - No-ops if client is already open
 *  - Swallows connection errors (Redis is optional — app degrades gracefully)
 *
 * @returns {Promise<void>}
 */
async function connectRedis() {
  if (process.env.NODE_ENV === 'test') {
    return; // Never connect in test environment
  }

  const client = createRedisClient();

  if (client.status === 'ready' || client.status === 'connecting') {
    return; // Already connected or in progress
  }

  try {
    await client.connect();
  } catch (err) {
    logger.warn('[Redis] Initial connection failed — running without cache', {
      error: { message: err.message, code: err.code },
    });
  }
}

module.exports = {
  createRedisClient,
  connectRedis,
};
