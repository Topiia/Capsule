require('dotenv').config();
const Queue = require('bull');
const { Resend } = require('resend');
const logger = require('../config/logger');
const emailConfig = require('../config/email');

/**
 * Send email via Resend with 10 s timeout
 *
 * Gap 3: Enhanced EMAIL_API_DONE — logs providerLatency, emailId, and accepted flag.
 * `accepted` = true when Resend returns a non-empty `id` (provider accepted the job).
 */
const sendEmail = async (options) => {
  const resend = new Resend(emailConfig.resend.apiKey);
  const FROM_EMAIL = emailConfig.resend.fromEmail;
  const FROM_NAME = emailConfig.resend.fromName;

  // ─── [WORKER] Phase 3 — Email Provider Timing ─────────────────────────────
  const EMAIL_API_START = Date.now();
  console.log(`[WORKER] EMAIL_API_START  (${new Date(EMAIL_API_START).toISOString()})`);

  const emailPromise = resend.emails.send({
    from: `${FROM_NAME} <${FROM_EMAIL}>`,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
  });

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Resend API timeout')), 10000);
  });

  const result = await Promise.race([emailPromise, timeoutPromise]);

  // ─── [WORKER] Gap 3 — Enhanced EMAIL_API_DONE: providerLatency + emailId + accepted ─
  const EMAIL_API_DONE = Date.now();
  const providerLatency = EMAIL_API_DONE - EMAIL_API_START;
  // `accepted` = true only when Resend returns a non-empty email ID,
  // meaning the provider has accepted the message into its send queue
  const accepted = !!(result && result.id);
  console.log(
    `[WORKER] EMAIL_API_DONE  (${new Date(EMAIL_API_DONE).toISOString()})`
    + `  providerLatency=${providerLatency}ms`
    + `  emailId=${result && result.id}`
    + `  accepted=${accepted}`,
  );

  logger.info('Email sent via Resend', {
    emailId: result && result.id,
    to: options.to,
    from: FROM_EMAIL,
    providerLatencyMs: providerLatency,
    accepted,
  });

  return result;
};

/**
 * Initialize the worker: registers queue consumer, event handlers,
 * graceful shutdown signals, and startup log.
 *
 * Called automatically when run directly (node emailWorker.js).
 * NOT called on import — safe for Jest.
 */
const startWorker = () => {
  // ─── [WORKER] Boot timestamp — used to compute WORKER_UPTIME at job pickup ─
  const WORKER_BOOT_TIME = Date.now();
  console.log(
    `[WORKER] WORKER_STARTED  (${new Date(WORKER_BOOT_TIME).toISOString()})`
    + `  pid=${process.pid}`,
  );

  // ─── [WORKER] Heartbeat — proves worker is alive every 60s ────────────────
  // On Render free tier: if HEARTBEAT stops → worker was put to sleep.
  // That proves the delivery delay = worker downtime, NOT code or Resend.
  const heartbeatInterval = setInterval(() => {
    const uptimeSec = Math.round((Date.now() - WORKER_BOOT_TIME) / 1000);
    console.log(
      `[WORKER] HEARTBEAT  uptime=${uptimeSec}s  pid=${process.pid}`
      + `  (${new Date().toISOString()})`,
    );
  }, 60000);

  const emailQueue = new Queue('email', {
    redis: emailConfig.redis,
  });

  // ─── [WORKER] Redis connection event listeners ────────────────────────────
  // Bull creates two ioredis clients internally: client + eclient (subscriber).
  // Attach listeners to both to catch any Redis drop/reconnect in the worker.
  // If RECONNECTING appears here → Redis was the delay source, not worker sleep.
  const QUEUE_START = Date.now();
  const redisTs = () => `  (${new Date().toISOString()})  +${Date.now() - QUEUE_START}ms`;
  const attachWorkerRedisListeners = (client, label) => {
    // Guard: mock clients in tests don't implement EventEmitter — skip safely
    if (!client || typeof client.on !== 'function') {
      console.log(`[WORKER-REDIS] ${label} listeners skipped (no EventEmitter)`);
      return;
    }
    client.on('connect', () => console.log(`[WORKER-REDIS] ${label} CONNECT${redisTs()}`));
    client.on('ready', () => console.log(`[WORKER-REDIS] ${label} READY${redisTs()}`));
    client.on('reconnecting', () => console.log(`[WORKER-REDIS] ${label} RECONNECTING${redisTs()}`));
    client.on('error', (err) => console.log(`[WORKER-REDIS] ${label} ERROR  ${err.message}${redisTs()}`));
    client.on('end', () => console.log(`[WORKER-REDIS] ${label} END${redisTs()}`));
  };
  if (emailQueue.client) attachWorkerRedisListeners(emailQueue.client, 'client');
  if (emailQueue.eclient) attachWorkerRedisListeners(emailQueue.eclient, 'subscriber');

  // ─── [WORKER] Gap 2 — REDIS_STATUS_START: Redis state immediately after Queue init ─
  // Bull exposes its internal ioredis client via emailQueue.client.
  // Reading `.status` is a synchronous property — no IO.
  const getRedisStatus = () => {
    try {
      return (emailQueue.client && emailQueue.client.status) || 'unknown';
    } catch (_) {
      return 'unknown';
    }
  };

  // Phase 6 + Gap 2: Queue ready + REDIS_STATUS_START
  emailQueue.isReady().then(async () => {
    console.log(`[WORKER] QUEUE_READY  (${new Date().toISOString()})`);

    // Gap 2 — Redis state at worker startup
    const redisStatusAtStart = getRedisStatus();
    console.log(
      `[WORKER] REDIS_STATUS_START  status=${redisStatusAtStart}`
      + `  (${new Date().toISOString()})`,
    );

    // Phase 6 — Full queue stats snapshot on startup
    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        emailQueue.getWaitingCount(),
        emailQueue.getActiveCount(),
        emailQueue.getCompletedCount(),
        emailQueue.getFailedCount(),
        emailQueue.getDelayedCount(),
      ]);
      console.log(
        `[WORKER] QUEUE_STATS  waiting=${waiting}  active=${active}`
        + `  completed=${completed}  failed=${failed}  delayed=${delayed}`
        + `  (${new Date().toISOString()})`,
      );
    } catch (statsErr) {
      console.log(`[WORKER] QUEUE_STATS_ERROR  ${statsErr.message}`);
    }
  }).catch((err) => {
    console.log(`[WORKER] QUEUE_READY_ERROR  ${err.message}  (${new Date().toISOString()})`);
  });

  // Process email jobs
  emailQueue.process(async (job) => {
    const {
      to, subject, text, html,
    } = job.data;

    // ─── [WORKER] Phase 2 — Worker Pickup Timing ────────────────────────────
    const JOB_RECEIVED = Date.now();
    console.log(`[WORKER] JOB_RECEIVED  jobId=${job.id}  (${new Date(JOB_RECEIVED).toISOString()})`);

    // ─── [WORKER] Gap 1 — WORKER_UPTIME: distinguish cold-start vs queue delay ─
    // Low uptime (< 10s)  → cold start caused the delay in JOB_RECEIVED
    // High uptime (> 300s) → worker was already running; delay is queue-side
    const workerUptimeMs = JOB_RECEIVED - WORKER_BOOT_TIME;
    const workerUptimeSec = Math.round(workerUptimeMs / 1000);
    console.log(
      `[WORKER] WORKER_UPTIME  ${workerUptimeSec}s`
      + `  (coldStart=${workerUptimeSec < 10})`
      + `  (${new Date(JOB_RECEIVED).toISOString()})`,
    );

    // ─── [WORKER] Gap 2 — REDIS_STATUS_JOB: Redis state at job pickup ────────
    // Distinguishes worker-sleep delay from Redis-reconnect delay.
    // If status=reconnecting here while uptime is high → Redis was the bottleneck.
    const redisStatusAtJob = getRedisStatus();
    console.log(
      `[WORKER] REDIS_STATUS_JOB  status=${redisStatusAtJob}`
      + `  (${new Date(JOB_RECEIVED).toISOString()})`,
    );

    // ─── [WORKER] Gap 4 — QUEUE_DEPTH: backlog depth at pickup ───────────────
    // If waiting > 0 when this job is picked up, the worker is behind on the queue.
    try {
      const [_waiting, _active, _delayed] = await Promise.all([
        emailQueue.getWaitingCount(),
        emailQueue.getActiveCount(),
        emailQueue.getDelayedCount(),
      ]);
      console.log(
        `[WORKER] QUEUE_DEPTH  waiting=${_waiting}  active=${_active}  delayed=${_delayed}`
        + `  (${new Date().toISOString()})`,
      );
    } catch (_depthErr) {
      console.log(`[WORKER] QUEUE_DEPTH_ERROR  ${_depthErr.message}`);
    }

    logger.info('Processing email job', {
      jobId: job.id,
      to,
      subject,
      attempt: job.attemptsMade + 1,
      workerUptimeSec,
      redisStatus: redisStatusAtJob,
    });

    try {
      // ─── [WORKER] Phase 2 — Email send starts ─────────────────────────────
      const EMAIL_SEND_START = Date.now();
      console.log(`[WORKER] EMAIL_SEND_START  jobId=${job.id}  (${new Date(EMAIL_SEND_START).toISOString()})`);

      await sendEmail({
        to, subject, text, html,
      });

      // ─── [WORKER] Phase 2 — Job completed ─────────────────────────────────
      const JOB_DONE = Date.now();
      const jobDuration = JOB_DONE - JOB_RECEIVED;
      console.log(`[WORKER] JOB_COMPLETED  jobId=${job.id}  duration=${jobDuration}ms  (${new Date(JOB_DONE).toISOString()})`);

      return { success: true };
    } catch (error) {
      const JOB_FAIL = Date.now();
      console.log(`[WORKER] JOB_FAILED  jobId=${job.id}  error=${error.message}  (${new Date(JOB_FAIL).toISOString()})`);
      logger.error('Email send failed', {
        jobId: job.id,
        to,
        error: error.message,
        attempt: job.attemptsMade + 1,
      });
      throw error; // Trigger Bull retry
    }
  });

  // Event handlers
  emailQueue.on('completed', (job) => {
    logger.debug('Email delivered', { jobId: job.id });
  });

  emailQueue.on('failed', (job, err) => {
    logger.error('Email failed permanently', {
      jobId: job.id,
      to: job.data.to,
      error: err.message,
      attempts: job.attemptsMade,
    });
  });

  // Graceful shutdown
  const shutdown = async () => {
    clearInterval(heartbeatInterval); // stop heartbeat before closing
    logger.info('Shutting down email worker...');
    await emailQueue.close();
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  logger.info('Email worker started', {
    redis: `${emailConfig.redis.host}:${emailConfig.redis.port}`,
    sender: emailConfig.resend.fromEmail,
    pid: process.pid,
  });

  return emailQueue;
};

// Auto-run only when executed directly: node emailWorker.js
if (require.main === module) {
  startWorker();
}

module.exports = { startWorker, sendEmail };
