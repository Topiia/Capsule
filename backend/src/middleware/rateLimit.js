const rateLimit = require('express-rate-limit');
const rateLimitRedis = require('rate-limit-redis');

const RedisStore = rateLimitRedis.default || rateLimitRedis;
const { createRedisClient } = require('../config/redis');
const logger = require('../config/logger');
const { shouldBypassRedis } = require('./localLimiterCache');
const {
  rateLimitTriggeredTotal,
  redisLimiterCallsTotal,
} = require('../monitoring/metrics');

// Smart Limiter Key Generation
const generateLimiterKey = (req) => {
  if (req.user && req.user.id) {
    return `user:${req.user.id}:${req.ip}`;
  }
  return `ip:${req.ip}`;
};

// Store factory — called lazily on first use, NOT at module load time.
// This prevents the crash where RedisStore tries to connect before Redis is ready.
const storeCache = {};

const getStore = (prefix) => {
  // Always use MemoryStore in test environment
  if (process.env.NODE_ENV === 'test') {
    return undefined; // undefined tells express-rate-limit to use the built-in MemoryStore
  }

  // Re-use stores by prefix to avoid creating one per request
  if (storeCache[prefix]) {
    return storeCache[prefix];
  }

  try {
    const client = createRedisClient();
    const store = new RedisStore({
      sendCommand: async (...args) => client.call(...args),
      prefix,
    });
    storeCache[prefix] = store;
    return store;
  } catch (err) {
    logger.warn('RedisStore creation failed, falling back to MemoryStore', { prefix, error: err.message });
    return undefined; // Fail open — use MemoryStore
  }
};

const createLimiter = (options) => {
  // Strip non-express-rate-limit options before passing to rateLimit()
  const { keyPrefix, ...rlOptions } = options;

  const limiter = rateLimit({
    ...rlOptions,
    store: getStore(keyPrefix || 'rl:'),
    keyGenerator: (req) => generateLimiterKey(req),
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next, optionsArg) => {
      logger.warn('Rate limit exceeded', {
        event: 'rateLimitTriggered',
        ip: req.ip,
        url: req.originalUrl,
        key: generateLimiterKey(req),
      });

      rateLimitTriggeredTotal.inc({ url: req.originalUrl, ip: req.ip });

      res.status(optionsArg.statusCode).send(optionsArg.message);
    },
  });

  // Redis load reduction wrapper
  return (req, res, next) => {
    const key = generateLimiterKey(req);

    if (shouldBypassRedis(req, key)) {
      return next(); // Local memory pass or edge-aware bypass
    }

    // Must consult Redis
    logger.debug('Consulting Redis for rate limit', { event: 'redisLimiterCalls', key });
    redisLimiterCallsTotal.inc({ key });
    return limiter(req, res, next);
  };
};

const authLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyPrefix: 'rl:auth:',
  message: {
    success: false,
    errorType: 'ratelimit',
    error: 'Too many attempts. Please try again in 15 minutes.',
  },
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      errorType: 'ratelimit',
      error: 'Too many attempts. Please try again in 15 minutes.',
      retryAfterSeconds: Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000),
    });
  },
});

const identityLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 1000,
  keyPrefix: 'rl:identity:',
  message: {
    success: false,
    errorType: 'ratelimit',
    error: 'Too many requests. Please wait a moment.',
  },
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      errorType: 'ratelimit',
      error: 'Too many requests. Please wait a moment.',
      retryAfterSeconds: Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000),
    });
  },
});

const mutationLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 60,
  keyPrefix: 'rl:mutation:',
  message: {
    success: false,
    errorType: 'ratelimit',
    error: 'Too many actions performed. Please slow down.',
  },
});

const generalReadLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 200,
  keyPrefix: 'rl:read:',
  message: {
    success: false,
    errorType: 'ratelimit',
    error: 'Too many requests. Please slow down.',
  },
});

const viewCountLimiter = createLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 requests per window per key
  keyPrefix: 'rl:view:',
  keyGenerator: (req) => {
    // Generate key based on IP + userId (if authenticated)
    const userId = req.user?.id || 'anonymous';
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    return `${ip}:${userId}`;
  },
  handler: (req, res) => {
    const userId = req.user?.id || 'anonymous';
    const ip = req.ip || req.socket.remoteAddress;

    logger.warn('View count rate limit exceeded', {
      correlationId: req.correlationId,
      userId,
      ip,
      vlogId: req.params.id,
      path: req.path,
    });

    res.status(429).json({
      success: false,
      error: {
        message: 'Too many view requests. Please wait before viewing again.',
        code: 'RATE_LIMIT_EXCEEDED',
        statusCode: 429,
        retryAfterSeconds: Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000),
      },
    });
  },
});

const deleteAccountLimiter = createLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // 3 attempts per 15 minutes
  keyPrefix: 'rl:deleteAcc:',
  message: {
    success: false,
    error: {
      message: 'Too many deletion attempts. Please try again later.',
      code: 'RATE_LIMIT_EXCEEDED',
    },
  },
});

module.exports = {
  authLimiter,
  identityLimiter,
  mutationLimiter,
  generalReadLimiter,
  viewCountLimiter,
  deleteAccountLimiter,
};
