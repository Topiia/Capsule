/**
 * server.js — Production bootstrap entry point
 *
 * Startup order (sequential, intentional):
 *   1. Load .env → validate ENV (fail-fast for critical vars)
 *   2. Connect DB  (retry 5x, fail-fast after exhaustion)
 *   3. Connect Redis (non-blocking, app degrades gracefully)
 *   4. Init queues  (non-blocking, wrapped in try/catch)
 *   5. Bind Express server
 *   6. Print system status banner
 *
 * Tests import app.js directly — this file is NEVER loaded by Jest.
 */

// OBSERVABILITY: Sentry must be initialised BEFORE the app is loaded so it
// can instrument all subsequent requires (Express, Mongoose, etc.)
require('./instrumentation/sentry');

const dotenv = require('dotenv');

// Load .env in non-production environments (strictly exclude tests)
if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
  dotenv.config();
}

// ── Global crash handlers — attach BEFORE any async code ──────────────────────
// uncaughtException: synchronous throws that escape all handlers (true crashes)
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err.message);
  console.error(err.stack);
  process.exit(1);
});

// unhandledRejection: unhandled async errors.
// Redis reconnect errors are expected on Render free tier and must NOT exit.
process.on('unhandledRejection', (err) => {
  const msg = (err && err.message) ? err.message : String(err);
  const isRedisNoise = msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND')
    || msg.includes('ETIMEDOUT') || msg.toLowerCase().includes('redis');

  if (isRedisNoise) {
    console.warn('[WARN] Redis connection noise (non-fatal):', msg);
  } else {
    console.error('[FATAL] Unhandled Promise Rejection:', msg);
    console.error(err && err.stack);
    process.exit(1);
  }
});

// ── Module imports (after crash handlers) ─────────────────────────────────────
const app = require('./app');
const logger = require('./config/logger');
const envConfig = require('./config/env');
const connectDB = require('./config/database');
const { connectRedis } = require('./config/redis');
const { startQueueMetrics } = require('./monitoring/queueMetrics');
const systemState = require('./config/systemState');

const PORT = process.env.PORT || 5000;

// ── Async startup IIFE — enforces correct initialization order ─────────────────
(async () => {
  // Track status of each subsystem for the startup banner
  const status = {
    env: 'OK',
    db: 'FAILED',
    redis: 'DEGRADED',
    queues: 'DISABLED',
  };

  // ── STEP 1: ENV validation ─────────────────────────────────────────────────
  // CRITICAL vars → process.exit(1) inside validateEnv if missing
  // OPTIONAL vars → warn only
  envConfig.validateEnv(); // exits if MONGODB_URI / JWT_SECRET / JWT_REFRESH_SECRET missing

  // ── STEP 2: Database (CRITICAL — fail-fast after 5 retries) ───────────────
  try {
    await connectDB(5);
    status.db = 'CONNECTED';
  } catch (err) {
    console.error('[DB] Could not connect after 5 retries — shutting down.');
    console.error('[DB] Check MONGODB_URI and network access in your hosting dashboard.');
    process.exit(1);
  }

  // ── STEP 3: Redis (OPTIONAL — app runs degraded without it) ───────────────
  try {
    await connectRedis();
    status.redis = 'CONNECTED';
  } catch (err) {
    // connectRedis() already has internal try/catch, this is a safety net
    console.warn('[Redis] Startup error (non-fatal):', err.message);
    status.redis = 'DEGRADED';
  }

  // ── STEP 4: Queues (OPTIONAL — wrapped, non-fatal) ────────────────────────
  let emailQueue = null;
  let accountDeletionQueue = null;

  try {
    // eslint-disable-next-line global-require
    const { createEmailQueue } = require('./queues/emailQueue');
    emailQueue = createEmailQueue();

    // eslint-disable-next-line global-require
    const { startAccountDeletionWorker, createAccountDeletionQueue } = require('./queues/accountDeletionQueue');
    accountDeletionQueue = createAccountDeletionQueue();
    startAccountDeletionWorker();

    // eslint-disable-next-line global-require
    const moderationWorker = require('./workers/moderation.worker');
    moderationWorker.start();

    status.queues = 'ENABLED';
  } catch (err) {
    logger.error('[QUEUE] Failed to start workers or queues (non-fatal)', { error: err.message });
    status.queues = 'DISABLED';
  }

  // ── Update global system state (read by emailQueue.js fallback logic) ──────
  systemState.set({
    redis: status.redis === 'CONNECTED',
    queue: status.queues === 'ENABLED',
  });

  // ── STEP 5: Bind Express server ────────────────────────────────────────────
  const server = app.listen(PORT, () => {
    logger.info('Server started', {
      port: PORT,
      environment: process.env.NODE_ENV,
      nodeVersion: process.version,
    });

    // OBSERVABILITY: Prometheus queue gauges (only if queues are up)
    if (emailQueue && accountDeletionQueue) {
      try {
        startQueueMetrics(emailQueue, accountDeletionQueue);
      } catch (err) {
        logger.warn('[METRICS] Failed to start queue metrics', { error: err.message });
      }
    }

    // ── STEP 6: System status banner ───────────────────────────────────────
    const statusIcon = (s) => ({
      OK: '✅',
      CONNECTED: '✅',
      ENABLED: '✅',
      FAILED: '❌',
      DEGRADED: '⚠️ ',
      DISABLED: '⚠️ ',
    }[s] || '❓');

    console.log('');
    console.log('╔══════════════════════════════════════╗');
    console.log('║         SYSTEM STARTUP STATUS        ║');
    console.log('╠══════════════════════════════════════╣');
    console.log(`║  ENV    ${statusIcon(status.env)}  ${status.env.padEnd(25)}║`);
    console.log(`║  DB     ${statusIcon(status.db)}  ${status.db.padEnd(25)}║`);
    console.log(`║  REDIS  ${statusIcon(status.redis)}  ${status.redis.padEnd(25)}║`);
    console.log(`║  QUEUES ${statusIcon(status.queues)}  ${status.queues.padEnd(25)}║`);
    const mode = systemState.degraded ? 'DEGRADED' : 'NORMAL';
    console.log(`║  MODE   ${statusIcon(mode === 'NORMAL' ? 'OK' : 'DEGRADED')}  ${mode.padEnd(25)}║`);
    console.log('╚══════════════════════════════════════╝');
    console.log('');
  });

  // ── Graceful shutdown ──────────────────────────────────────────────────────
  const shutdown = () => {
    console.log('[SERVER] Graceful shutdown initiated');
    server.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[DEV ERROR] Port ${PORT} already in use`);
      process.exit(1);
    } else {
      throw err;
    }
  });

  // Export for graceful shutdown tooling
  module.exports = app;
  module.exports.server = server;
})();
