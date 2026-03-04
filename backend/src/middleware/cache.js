const { createRedisClient } = require('../config/redis');

const redis = new Proxy({}, {
  get: (target, prop) => {
    const client = createRedisClient();
    return typeof client[prop] === 'function' ? client[prop].bind(client) : client[prop];
  },
});
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
// eslint-disable-next-line max-len
exports.cacheMiddleware = (ttl = 300, keyGenerator = generateCacheKey) => async (req, res, next) => {
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

    // Helper: extract vlog IDs from response payload
    const extractVlogIds = (responseData) => {
      const ids = new Set();
      const dig = (obj) => {
        if (!obj) return;
        if (Array.isArray(obj)) {
          obj.forEach(dig);
        } else if (typeof obj === 'object') {
          if (obj._id && (obj.title || obj.author || obj.views !== undefined)) {
            ids.add(obj._id.toString());
          }
          if (obj.data) dig(obj.data);
          if (obj.pages) dig(obj.pages);
        }
      };
      dig(responseData);
      return Array.from(ids);
    };

    // Helper: extract unique author IDs embedded in vlog objects
    const extractAuthorIds = (responseData) => {
      const ids = new Set();
      const dig = (obj) => {
        if (!obj) return;
        if (Array.isArray(obj)) {
          obj.forEach(dig);
        } else if (typeof obj === 'object') {
          // Collect author._id from any embedded author object
          if (obj.author && typeof obj.author === 'object' && obj.author._id) {
            ids.add(obj.author._id.toString());
          }
          if (obj.data) dig(obj.data);
          if (obj.pages) dig(obj.pages);
        }
      };
      dig(responseData);
      return Array.from(ids);
    };

    // Override res.json to cache response
    const originalJson = res.json.bind(res);
    res.json = function jsonOverride(data) {
      // Only cache successful responses
      if (res.statusCode === 200 && data) {
        redis.setJSON(cacheKey, data, ttl)
          .then(() => {
            // FIRE AND FORGET: Build Reverse Index Tags (vlog + user dimensions)
            const vlogIds = extractVlogIds(data);
            const authorIds = extractAuthorIds(data);
            const tags = [
              ...vlogIds.map((id) => `tag:vlog:${id}`),
              ...authorIds.map((id) => `tag:user:${id}`),
            ];
            if (tags.length > 0) {
              // Single addTags call — both dimensions in one pipeline exec
              redis.addTags([cacheKey], tags, ttl);
            }
          })
          .catch((err) => {
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
 * Invalidate a specific vlog across all cached endpoints
 * Uses tag-based reverse index
 * @param {string} vlogId - MongoDB ObjectId of the vlog
 */
exports.invalidateVlog = async (vlogId) => {
  if (!redis.isAvailable() || !vlogId) return 0;

  try {
    const deleted = await redis.invalidateTags([`tag:vlog:${vlogId}`]);
    logger.info('Vlog cache invalidated', {
      vlogId,
      keysDeleted: deleted,
    });
    return deleted;
  } catch (error) {
    logger.error('Vlog cache invalidation error', {
      vlogId,
      error: error.message,
    });
    return 0;
  }
};

/**
 * Invalidate all cached responses that embed data from a specific User.
 * Covers: followerCount, isFollowedByCurrentUser, username, avatar, bio.
 * Called after: follow, unfollow, profile update, avatar change.
 * @param {string} userId - MongoDB ObjectId of the user
 */
exports.invalidateUser = async (userId) => {
  if (!redis.isAvailable() || !userId) return 0;

  try {
    const deleted = await redis.invalidateTags([`tag:user:${userId}`]);
    logger.info('User cache invalidated', {
      userId,
      keysDeleted: deleted,
    });
    return deleted;
  } catch (error) {
    logger.error('User cache invalidation error', {
      userId,
      error: error.message,
    });
    return 0;
  }
};

/**
 * Clear all caches
 * Use cautiously - this clears ALL cached data
 */
exports.clearAllCache = async () => {
  try {
    // Deprecated delPattern since it uses KEYS.
    // Use DB FLUSHDB for full wipe; this endpoint is typically inactive in prod.
    logger.warn('clearAllCache skipped - legacy wildcard deletion removed');
    return 0;
  } catch (error) {
    logger.error('Clear all cache error', { error: error.message });
    return 0;
  }
};

module.exports = exports;
