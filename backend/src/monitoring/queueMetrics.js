/**
 * queueMetrics.js — Prometheus queue health gauges
 *
 * Uses the collect() hook so metrics refresh only when Prometheus scrapes /metrics.
 * No polling interval needed — reduces Redis load.
 *
 * Exports:
 *   startQueueMetrics(emailQueue, accountDeletionQueue) — call once after queues init
 *   dlqJobsTotal — Counter exported so dlqMonitor.js can increment it
 */

const promClient = require('prom-client');

// Use prom-client's default registry — this is the same registry used by metrics.js
// which calls promClient.collectDefaultMetrics({ register }) with the default instance.
const { register } = promClient;

// ─── DLQ Counter ────────────────────────────────────────────────────────────

const dlqJobsTotal = new promClient.Counter({
  name: 'capsule_queue_dlq_jobs_total',
  help: 'Total number of jobs that permanently failed and were moved to the DLQ',
  labelNames: ['queue'],
  registers: [register],
});

// ─── Email Queue Gauges ──────────────────────────────────────────────────────

const emailWaiting = new promClient.Gauge({
  name: 'capsule_email_queue_jobs_waiting',
  help: 'Number of jobs waiting in the email queue',
  registers: [register],
  async collect() {
    if (emailWaiting._queue) {
      try {
        const counts = await emailWaiting._queue.getJobCounts();
        this.set(counts.waiting || 0);
      } catch (_) { this.set(0); }
    }
  },
});

const emailActive = new promClient.Gauge({
  name: 'capsule_email_queue_jobs_active',
  help: 'Number of actively processing jobs in the email queue',
  registers: [register],
  async collect() {
    if (emailActive._queue) {
      try {
        const counts = await emailActive._queue.getJobCounts();
        this.set(counts.active || 0);
      } catch (_) { this.set(0); }
    }
  },
});

const emailCompleted = new promClient.Gauge({
  name: 'capsule_email_queue_jobs_completed',
  help: 'Number of completed jobs in the email queue',
  registers: [register],
  async collect() {
    if (emailCompleted._queue) {
      try {
        const counts = await emailCompleted._queue.getJobCounts();
        this.set(counts.completed || 0);
      } catch (_) { this.set(0); }
    }
  },
});

const emailFailed = new promClient.Gauge({
  name: 'capsule_email_queue_jobs_failed',
  help: 'Number of permanently failed jobs in the email queue',
  registers: [register],
  async collect() {
    if (emailFailed._queue) {
      try {
        const counts = await emailFailed._queue.getJobCounts();
        this.set(counts.failed || 0);
      } catch (_) { this.set(0); }
    }
  },
});

// ─── Account Deletion Queue Gauges ──────────────────────────────────────────

const deletionWaiting = new promClient.Gauge({
  name: 'capsule_account_deletion_queue_jobs_waiting',
  help: 'Number of jobs waiting in the account deletion queue',
  registers: [register],
  async collect() {
    if (deletionWaiting._queue) {
      try {
        const counts = await deletionWaiting._queue.getJobCounts();
        this.set(counts.waiting || 0);
      } catch (_) { this.set(0); }
    }
  },
});

const deletionActive = new promClient.Gauge({
  name: 'capsule_account_deletion_queue_jobs_active',
  help: 'Number of actively processing jobs in the account deletion queue',
  registers: [register],
  async collect() {
    if (deletionActive._queue) {
      try {
        const counts = await deletionActive._queue.getJobCounts();
        this.set(counts.active || 0);
      } catch (_) { this.set(0); }
    }
  },
});

const deletionFailed = new promClient.Gauge({
  name: 'capsule_account_deletion_queue_jobs_failed',
  help: 'Number of permanently failed jobs in the account deletion queue',
  registers: [register],
  async collect() {
    if (deletionFailed._queue) {
      try {
        const counts = await deletionFailed._queue.getJobCounts();
        this.set(counts.failed || 0);
      } catch (_) { this.set(0); }
    }
  },
});

// ─── Initialisation ──────────────────────────────────────────────────────────

/**
 * Attach the queue references so collect() functions can call getJobCounts().
 * Also wires up the DLQ counter to dlqMonitor.js.
 *
 * Call this once from server.js after queues are created.
 *
 * @param {import('bull').Queue|null} emailQueue
 * @param {import('bull').Queue|null} accountDeletionQueue
 */
const startQueueMetrics = (emailQueue, accountDeletionQueue) => {
  // Attach queue references to gauge instances via a private property
  if (emailQueue) {
    emailWaiting._queue = emailQueue;
    emailActive._queue = emailQueue;
    emailCompleted._queue = emailQueue;
    emailFailed._queue = emailQueue;
  }

  if (accountDeletionQueue) {
    deletionWaiting._queue = accountDeletionQueue;
    deletionActive._queue = accountDeletionQueue;
    deletionFailed._queue = accountDeletionQueue;
  }

  // Inject the DLQ counter into dlqMonitor so it can increment it
  try {
    // eslint-disable-next-line global-require
    const { setDlqCounter } = require('./dlqMonitor');
    setDlqCounter(dlqJobsTotal);
  } catch (_) {
    // dlqMonitor unavailable — metrics still work
  }

  // eslint-disable-next-line global-require
  const logger = require('../config/logger');
  logger.info('Queue Prometheus metrics registered', {
    queues: [emailQueue ? 'email' : null, accountDeletionQueue ? 'accountDeletion' : null].filter(Boolean),
  });
};

module.exports = {
  startQueueMetrics,
  dlqJobsTotal,
};
