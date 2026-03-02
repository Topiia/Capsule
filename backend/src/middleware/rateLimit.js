const rateLimit = require('express-rate-limit');
const logger = require('../config/logger');

/**
 * SECURITY: Rate Limiters
 *
 * Protect against abuse and brute-force attacks
 */

/**
 * View Count Rate Limiter
 *
 * Protects PUT /api/vlogs/:id/view from spam
 * Limit: 20 requests per minute per (IP + userId)
 *
 * Prevents:
 * - Bot view inflation
 * - Automated clicking scripts
 * - Rapid refresh attacks
 */
const viewCountLimiter = process.env.NODE_ENV !== 'test'
  ? rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 20, // 20 requests per window per key
    standardHeaders: true, // Return rate limit info in RateLimit-* headers
    legacyHeaders: false, // Disable X-RateLimit-* headers
    skipSuccessfulRequests: false, // Count all requests, not just failed ones
    skipFailedRequests: false,
    keyGenerator: (req) => {
      // Generate key based on IP + userId (if authenticated)
      const userId = req.user?.id || 'anonymous';
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      return `view:${ip}:${userId}`;
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
        resetTime: new Date(req.rateLimit.resetTime),
      });

      res.status(429).json({
        success: false,
        error: {
          message:
                'Too many view requests. Please wait before viewing again.',
          code: 'RATE_LIMIT_EXCEEDED',
          statusCode: 429,
          retryAfterSeconds: Math.ceil(
            (req.rateLimit.resetTime - Date.now()) / 1000,
          ),
        },
      });
    },
  })
  : (req, res, next) => next(); // Bypass in test mode

module.exports = {
  viewCountLimiter,
};
