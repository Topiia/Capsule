const redis = require('../config/redis');
const logger = require('../config/logger');

/**
 * PERFORMANCE: API Response Caching Middleware
 *
 * Caches GET request responses in Redis to reduce database load.
 * Cache keys are generated from request URL and query parameters.
 * Supports cache invalidation and TTL configuration.
 */

/**
 * Generate cache key from request
 * @param {object} req - Express request object
 * @returns {string} - Cache key
 */
const generateCacheKey = (req) => {
  const base = `cache:${req.baseUrl}${req.path}`;
  const query = JSON.stringify(req.query);
  const userId = req.user?.id || 'anonymous';

  // Include user ID for personalized content
  return `${base}:${userId}:${Buffer.from(query).toString('base64')}`;
};

/**
 * Cache middleware factory
 *
 * @param {number} ttl - Time to live in seconds (default: 300 = 5 minutes)
 * @param {function} keyGenerator - Custom key generator function
 * @returns {function} - Express middleware
 */
exports.cacheMiddleware = (
  ttl = 300,
  keyGenerator = generateCacheKey,
) => async (req, res, next) => {
  // Only cache GET requests
  if (req.method !== 'GET') {
    return next();
  }

  // Skip if caching is disabled
  if (process.env.ENABLE_CACHING === 'false') {
    return next();
  }

  // Skip if Redis is unavailable
  if (!redis.isAvailable()) {
    logger.debug('Cache bypassed - Redis unavailable', {
      correlationId: req.correlationId,
    });
    return next();
  }

  const cacheKey = keyGenerator(req);

  try {
    // Try to get cached response
    const cachedResponse = await redis.getJSON(cacheKey);

    if (cachedResponse) {
      // Cache hit
      logger.debug('Cache HIT', {
        key: cacheKey,
        correlationId: req.correlationId,
      });

      res.setHeader('X-Cache', 'HIT');
      return res.status(200).json(cachedResponse);
    }

    // Cache miss - continue to route handler
    logger.debug('Cache MISS', {
      key: cacheKey,
      correlationId: req.correlationId,
    });

    res.setHeader('X-Cache', 'MISS');

    // Override res.json to cache response
    const originalJson = res.json.bind(res);
    res.json = function jsonOverride(data) {
      // Only cache successful responses
      if (res.statusCode === 200 && data) {
        redis.setJSON(cacheKey, data, ttl).catch((err) => {
          logger.error('Failed to cache response', {
            key: cacheKey,
            error: err.message,
          });
        });
      }
      return originalJson(data);
    };

    next();
  } catch (error) {
    // On Redis error, bypass cache and continue
    logger.error('Cache middleware error', {
      error: error.message,
      key: cacheKey,
    });
    next();
  }
};

/**
 * Invalidate cache by pattern
 * Use after create/update/delete operations
 *
 * @param {string} pattern - Cache key pattern (e.g., 'cache:/api/vlogs:*')
 */
exports.invalidateCache = async (pattern) => {
  // Skip if Redis unavailable
  if (!redis.isAvailable()) {
    logger.debug('Cache invalidation skipped - Redis unavailable', { pattern });
    return 0;
  }

  try {
    const deleted = await redis.delPattern(pattern);
    logger.info('Cache invalidated', {
      pattern,
      keysDeleted: deleted,
    });
    return deleted;
  } catch (error) {
    logger.error('Cache invalidation error', {
      pattern,
      error: error.message,
    });
    return 0;
  }
};

/**
 * Invalidate vlog-related caches
 * Called after vlog create/update/delete
 */
exports.invalidateVlogCache = async () => {
  await exports.invalidateCache('cache:/api/vlogs:*');
  await exports.invalidateCache('cache:/api/vlogs/*');
};

/**
 * Invalidate user-related caches
 * Called after user profile update
 */
exports.invalidateUserCache = async (userId) => {
  await exports.invalidateCache(`cache:/api/users:${userId}:*`);
  await exports.invalidateCache(`cache:/api/users/*:${userId}:*`);
};

/**
 * Clear all caches
 * Use cautiously - this clears ALL cached data
 */
exports.clearAllCache = async () => {
  try {
    const deleted = await redis.delPattern('cache:*');
    logger.warn('All caches cleared', { keysDeleted: deleted });
    return deleted;
  } catch (error) {
    logger.error('Clear all cache error', { error: error.message });
    return 0;
  }
};

module.exports = exports;
