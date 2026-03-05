/**
 * server.js — Production bootstrap entry point
 *
 * Responsibilities (ONLY runs in production, NOT imported by tests):
 *   1. Validate critical environment variables (fail fast)
 *   2. Attach process-level crash handlers
 *   3. Start the HTTP server
 *   4. Launch background workers
 *
 * Tests import app.js directly — this file is never loaded by Jest.
 */

// OBSERVABILITY: Sentry must be initialised BEFORE the app is loaded so it
// can instrument all subsequent requires (Express, Mongoose, etc.)
require('./instrumentation/sentry');

const dotenv = require('dotenv');

// Load .env in non-production environments (strictly exclude tests)
if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
  dotenv.config();
}

// PRODUCTION SAFETY: Validate CRITICAL environment variables EARLY
// Fail fast if any required production secrets are missing.
// This block ONLY runs here in server.js, never in app.js.
require('./config/env').validateEnv();

// Warn about optional services (graceful degradation)
// REDIS_URL is the Render/Upstash production env var (not REDIS_HOST which is local-only)
const optionalServices = {
  REDIS_URL: 'Caching & job queues (Upstash/Managed Redis)',
  CORS_ORIGINS: 'CORS origin whitelist (required for browser clients)',
};

const missingOptional = Object.keys(optionalServices)
  .filter((key) => !process.env[key])
  .map((key) => `${key} (${optionalServices[key]})`);

if (missingOptional.length > 0) {
  console.warn('[WARN] Optional services not configured:');
  missingOptional.forEach((msg) => console.warn(`  - ${msg}`));
  console.warn('[WARN] App may run with reduced functionality.');
}

// PRODUCTION SAFETY: Global crash handlers (attach before any async code)
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err.message);
  console.error(err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('[FATAL] Unhandled Promise Rejection:', err.message);
  console.error(err.stack);
  process.exit(1);
});

// Import the configured Express app (no side-effects beyond Express setup)
const app = require('./app');
const logger = require('./config/logger');
const connectDB = require('./config/database');
const { connectRedis } = require('./config/redis');

const { startQueueMetrics } = require('./monitoring/queueMetrics');

const PORT = process.env.PORT || 5000;

// Connect to database and Redis before starting the server
connectDB().catch((_err) => {
  console.error('[FATAL] Database connection failed during startup.');
  process.exit(1);
});
connectRedis();

// Start HTTP server
const server = app.listen(PORT, () => {
  logger.info('Server started', {
    port: PORT,
    environment: process.env.NODE_ENV,
    nodeVersion: process.version,
  });

  // Start Background Workers & Queues
  try {
    // eslint-disable-next-line global-require
    const { createEmailQueue } = require('./queues/emailQueue');
    const emailQueue = createEmailQueue();

    // eslint-disable-next-line global-require
    const { startAccountDeletionWorker, createAccountDeletionQueue } = require('./queues/accountDeletionQueue');
    const accountDeletionQueue = createAccountDeletionQueue();
    startAccountDeletionWorker();

    // OBSERVABILITY: Register Prometheus queue gauges (uses collect() hook, no polling)
    startQueueMetrics(emailQueue, accountDeletionQueue);

    // eslint-disable-next-line global-require
    const moderationWorker = require('./workers/moderation.worker');
    moderationWorker.start();
  } catch (err) {
    logger.error('Failed to start workers or queues', err);
  }
});

// Graceful shutdown prevents port lock during nodemon restart
const shutdown = () => {
  console.log('[SERVER] Graceful shutdown');
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
