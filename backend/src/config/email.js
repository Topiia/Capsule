const logger = require('./logger');

/**
 * Centralized email configuration
 * All email-related config should be accessed through this module
 */

// ─── Redis configuration for Bull queues (fail-fast, production-hardened) ────
//
// CRITICAL BUG FIX: ioredis does NOT accept { url: '...' } as an options key.
// Passing { url: 'rediss://...' } to new Redis({ url: '...' }) causes ioredis
// to silently fall back to localhost:6379 — that connection immediately closes
// in Render, producing "Connection is closed" errors.
//
// Correct approach: parse REDIS_URL into host/port/password/tls components,
// then merge fail-fast settings into the same options object.
// Bull then passes this valid options object to new ioredis.Redis({ host, port, ... }).

const parseRedisUrl = (rawUrl) => {
  try {
    const u = new URL(rawUrl);
    const opts = {
      host: u.hostname,
      port: parseInt(u.port, 10) || 6379,
      // URL-decode the password (special chars like @ are percent-encoded)
      password: u.password ? decodeURIComponent(u.password) : undefined,
      // Parse optional DB index from URL path: redis://host/1
      ...(u.pathname && u.pathname.length > 1 && {
        db: parseInt(u.pathname.slice(1), 10),
      }),
    };
    // rediss:// → Render / Upstash / Fly.io require TLS
    if (u.protocol === 'rediss:') {
      opts.tls = {};
    }
    return opts;
  } catch (parseErr) {
    logger.warn('[email.js] Failed to parse REDIS_URL — falling back to localhost', {
      error: parseErr.message,
    });
    return { host: 'localhost', port: 6379 };
  }
};

const buildBullRedisConfig = () => {
  // Base connection: parse URL (production) or use host/port (local/dev)
  const base = process.env.REDIS_URL
    ? parseRedisUrl(process.env.REDIS_URL)
    : {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT, 10) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      // Explicit TLS opt-in for host/port mode (when REDIS_URL is not set)
      ...(process.env.REDIS_TLS === 'true' && { tls: {} }),
    };

  return {
    ...base,
    // ── Fail-fast settings — prevent the ~7-minute ioredis retry stall ───────
    // Default maxRetriesPerRequest: 20 caused +419622ms production delay.
    // With 1 retry, Bull falls back to sync send within ~200ms instead.
    maxRetriesPerRequest: 1,
    enableReadyCheck: false,
    connectTimeout: 10000,
    retryStrategy: (times) => {
      if (times > 10) {
        logger.warn('[Bull-Redis] Retry limit reached — giving up', { times });
        return null; // Stop retrying, surface the error
      }
      return Math.min(times * 200, 2000); // Max 2s between retries
    },
  };
};

const redis = buildBullRedisConfig();

if (!process.env.FROM_EMAIL) {
  throw new Error('FROM_EMAIL must be configured');
}

// Resend API configuration (REQUIRED for email)
const resend = {
  apiKey: process.env.RESEND_API_KEY,
  fromEmail: process.env.FROM_EMAIL,
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
const isRedisConfigured = () => !!(process.env.REDIS_URL || (redis.host && redis.port));

module.exports = {
  redis,
  resend,
  validateEmailConfig,
  isRedisConfigured,
};
