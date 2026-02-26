const logger = require('./logger');

/**
 * Centralized email configuration
 * All email-related config should be accessed through this module
 */

// ─── Redis configuration for Bull queues (fail-fast, production-hardened) ────
//
// CRITICAL: These settings prevent the 7-minute retry stall seen in production.
//
// Root cause of the stall:
//   ioredis default maxRetriesPerRequest = 20.
//   With default exponential backoff this can block for 400,000+ ms
//   before Bull decides the connection is unavailable.
//
// Fix: maxRetriesPerRequest: 1 → fail within ~200ms, let Bull handle retries
//      connectTimeout: 10000   → abort connection attempt after 10s
//      retryStrategy           → fast backoff, capped at 2s, stops after 10 tries
//
// TLS note: Render Redis (and Upstash) require TLS. If REDIS_URL is set,
// ioredis reads TLS from the URL scheme (rediss://). For host/port mode
// TLS must be explicit — set REDIS_TLS=true in Render env vars.

const buildBullRedisConfig = () => {
  // ── Production: use REDIS_URL (Render / Upstash / Fly.io) ─────────────────
  if (process.env.REDIS_URL) {
    return {
      // Bull accepts a redis connection string directly
      url: process.env.REDIS_URL,
      // Fail-fast override — prevents multi-minute stall
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      connectTimeout: 10000,
      retryStrategy: (times) => {
        if (times > 10) {
          logger.warn('[Bull-Redis] Retry limit reached — giving up', { times });
          return null; // Stop retrying
        }
        const delay = Math.min(times * 200, 2000);
        logger.info('[Bull-Redis] Retrying connection', { times, delayMs: delay });
        return delay;
      },
      // TLS for Render / Upstash (rediss:// handles this via URL,
      // but explicit tls:{} is required when host:port is used with TLS)
      ...(process.env.REDIS_TLS === 'true' && { tls: {} }),
    };
  }

  // ── Development: host/port mode (local Redis) ────────────────────────────
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    // Fail-fast: do not stall for minutes on connection issues
    maxRetriesPerRequest: 1,
    enableReadyCheck: false,
    connectTimeout: 10000,
    retryStrategy: (times) => {
      if (times > 10) return null;
      return Math.min(times * 200, 2000);
    },
  };
};

const redis = buildBullRedisConfig();

// Resend API configuration (REQUIRED for email)
const resend = {
  apiKey: process.env.RESEND_API_KEY,
  fromEmail: process.env.FROM_EMAIL || 'team@topiiaa.site',
  fromName: process.env.FROM_NAME || 'Capsule',
};

// Validate critical email configs
const validateEmailConfig = () => {
  if (!resend.apiKey) {
    logger.warn('RESEND_API_KEY not configured - email functionality disabled');
    return false;
  }
  return true;
};

// Check if Redis is configured (doesn't validate connectivity)
const isRedisConfigured = () => !!(
  process.env.REDIS_URL
  || (redis.host && redis.port)
);

module.exports = {
  redis,
  resend,
  validateEmailConfig,
  isRedisConfigured,
};
