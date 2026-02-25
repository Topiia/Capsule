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

const dotenv = require('dotenv');

// Load .env in non-production environments (strictly exclude tests)
if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
  dotenv.config();
}

// PRODUCTION SAFETY: Validate CRITICAL environment variables EARLY
// Fail fast if any required production secrets are missing.
// This block ONLY runs here in server.js, never in app.js.
const criticalEnv = [
  'MONGODB_URI',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'RESEND_API_KEY',
  'FRONTEND_URL',
  'FROM_EMAIL',
  'NODE_ENV',
];

const missingCritical = criticalEnv.filter((key) => !process.env[key]);

if (missingCritical.length > 0) {
  console.error('='.repeat(60));
  console.error('[FATAL] Missing CRITICAL environment variables:');
  missingCritical.forEach((key) => console.error(`  - ${key}`));
  console.error('='.repeat(60));
  console.error('Server cannot start without these variables.');
  console.error('Set them in Render dashboard: Settings > Environment');
  console.error('='.repeat(60));
  process.exit(1);
}

// Warn about optional services (graceful degradation)
const optionalServices = {
  REDIS_HOST: 'Caching & job queues',
};

const missingOptional = Object.keys(optionalServices)
  .filter((key) => !process.env[key])
  .map((key) => `${key} (${optionalServices[key]})`);

if (missingOptional.length > 0) {
  console.warn('[WARN] Optional services will be disabled:');
  missingOptional.forEach((msg) => console.warn(`  - ${msg}`));
  console.warn('[WARN] App will run with reduced functionality.');
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

const PORT = process.env.PORT || 5000;

// Connect to database and Redis before starting the server
connectDB().catch((_err) => {
  console.error('[FATAL] Database connection failed during startup.');
  process.exit(1);
});
connectRedis();

// ─── [FP] Signal 5 — Cold Start Detection ─────────────────────────────────
console.log(`[FP] SERVER_START  ${new Date().toISOString()}  pid=${process.pid}`);

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
    // ─── [FP] Signal 5 — Queue Init Timing ──────────────────────────────
    console.log(`[FP] QUEUE_INIT_START  ${new Date().toISOString()}`);
    createEmailQueue();
    // NOTE: createEmailQueue() sets queueReady async via emailQueue.isReady().then()
    // QUEUE_INIT_DONE marks the sync setup completion; queueReady becomes true later.
    console.log(`[FP] QUEUE_INIT_DONE  ${new Date().toISOString()}  (queueReady will be set asynchronously)`);

    // eslint-disable-next-line global-require
    const { startAccountDeletionWorker } = require('./queues/accountDeletionQueue');
    startAccountDeletionWorker();

    // eslint-disable-next-line global-require
    const moderationWorker = require('./workers/moderation.worker');
    moderationWorker.start();
  } catch (err) {
    logger.error('Failed to start workers or queues', err);
  }
});

// Export for graceful shutdown tooling
module.exports = app;
module.exports.server = server;
