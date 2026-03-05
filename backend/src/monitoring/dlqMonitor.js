/**
 * dlqMonitor.js — Dead Letter Queue monitoring + failure spike detection
 *
 * Responsibilities:
 *   1. onJobFailed()             — Push a sanitised job snapshot to a Redis DLQ list
 *   2. createFailureSpikeDetector() — Rolling window spike detector (10 failures / 60s)
 *
 * Does NOT remove the original Bull failed job.
 * No-ops gracefully when Redis client is unavailable.
 */

const logger = require('../config/logger');

// Keep counter import lazy — resolved after metrics module is set up
let dlqCounter = null;

/**
 * Inject the Prometheus DLQ counter from queueMetrics.js.
 * Called once during server bootstrap after metrics are initialised.
 *
 * @param {import('prom-client').Counter} counter
 */
const setDlqCounter = (counter) => {
  dlqCounter = counter;
};

/**
 * Push a sanitised job snapshot to the Redis DLQ list and increment
 * the Prometheus counter.
 *
 * @param {string}        queueName   - 'email' | 'accountDeletion'
 * @param {object}        job         - Bull job object
 * @param {Error}         err         - Failure error
 * @param {import('ioredis').Redis|null} redisClient - Bull's internal redis client
 */
const onJobFailed = async (queueName, job, err, redisClient = null) => {
  const dlqKey = `${queueName}:dlq`;

  // Build a sanitised, size-limited payload
  const entry = JSON.stringify({
    jobId: job.id,
    queue: queueName,
    failedReason: err.message,
    timestamp: new Date().toISOString(),
    // Slice to 2 000 chars to prevent large payloads filling Redis
    payloadPreview: JSON.stringify(job.data).slice(0, 2000),
  });

  // Push to Redis DLQ list if client is available
  if (redisClient && typeof redisClient.rpush === 'function') {
    try {
      await redisClient.rpush(dlqKey, entry);
      // Cap DLQ list at 1 000 entries — trim oldest when limit exceeded
      await redisClient.ltrim(dlqKey, -1000, -1);
    } catch (redisErr) {
      logger.warn('DLQ push failed — Redis write error', {
        queue: queueName,
        jobId: job.id,
        error: redisErr.message,
      });
    }
  }

  logger.error('Job moved to DLQ', {
    queue: queueName,
    jobId: job.id,
    failedReason: err.message,
    attempts: job.attemptsMade,
  });

  // Increment Prometheus DLQ counter
  if (dlqCounter) {
    try {
      dlqCounter.inc({ queue: queueName });
    } catch (_) {
      // Metrics failure must never crash the application
    }
  }
};

/**
 * Create a sliding-window failure spike detector for a single queue.
 *
 * Returns a function that should be called once per job failure.
 * When >= threshold failures occur within windowMs, triggers an alert.
 *
 * @param {string} queueName
 * @param {number} threshold  - Default: 10
 * @param {number} windowMs   - Default: 60 000 ms (1 min)
 * @returns {() => void}
 */
const createFailureSpikeDetector = (queueName, threshold = 10, windowMs = 60000) => {
  const timestamps = []; // Sliding window of failure timestamps

  return () => {
    const now = Date.now();

    // Evict timestamps older than the window
    while (timestamps.length > 0 && timestamps[0] < now - windowMs) {
      timestamps.shift();
    }

    timestamps.push(now);

    if (timestamps.length >= threshold) {
      logger.error('Queue failure spike detected', {
        queue: queueName,
        failuresInWindow: timestamps.length,
        windowSeconds: windowMs / 1000,
      });

      // Lazy-require Sentry to avoid circular deps at module load time
      try {
        // eslint-disable-next-line global-require
        const Sentry = require('../instrumentation/sentry');
        Sentry.captureMessage(`Queue failure spike detected — ${queueName}`, {
          level: 'error',
          extra: {
            queue: queueName,
            failuresInWindow: timestamps.length,
            threshold,
            windowSeconds: windowMs / 1000,
          },
        });
      } catch (_) {
        // Sentry unavailable — alert already logged via Winston
      }

      // Drain window so we don't re-alert every single subsequent failure.
      // Next alert fires only after `threshold` more failures accumulate.
      timestamps.length = 0;
    }
  };
};

module.exports = { onJobFailed, createFailureSpikeDetector, setDlqCounter };
