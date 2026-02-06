const Queue = require('bull');
const logger = require('../config/logger');
const emailConfig = require('../config/email');
const { sendEmailSync } = require('../utils/sendEmailSync');

/**
 * PERFORMANCE: Email Job Queue (Producer Only)
 *
 * This file initializes the queue producer for the API server.
 * The worker process (src/workers/emailWorker.js) handles job consumption.
 *
 * - Prevents email sending from blocking HTTP requests
 * - Automatic retry with exponential backoff (handled by worker)
 * - Job persistence (survives server restarts)
 * - FALLBACK: Sends synchronously if Redis unavailable
 */

let emailQueue = null;
let queueReady = false;

// Initialize queue
try {
  emailQueue = new Queue('email', {
    redis: emailConfig.redis,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000, // Start with 2s, then 4s, then 8s
      },
      removeOnComplete: true, // Clean up completed jobs
      removeOnFail: false, // Keep failed jobs for debugging
    },
  });

  // Verify connectivity on init (async)
  emailQueue.isReady().then(() => {
    queueReady = true;
    logger.info('Email queue ready (async mode enabled)', {
      redis: `${emailConfig.redis.host}:${emailConfig.redis.port}`,
    });
  }).catch((err) => {
    queueReady = false;
    logger.warn('Email queue unavailable - using synchronous fallback', {
      error: err.message,
      impact: 'Emails will be sent synchronously (blocking)',
    });
  });
} catch (error) {
  queueReady = false;
  logger.warn('Bull queue initialization failed - using synchronous fallback', {
    error: error.message,
    impact: 'Emails will be sent synchronously (blocking)',
  });
}

// NOTE: Worker process registration removed
// Email jobs are processed by separate worker: src/workers/emailWorker.js
/**
 * Queue an email for async processing
 * FALLBACK: If Redis unavailable, sends email synchronously
 *
 * @param {object} emailData - Email data
 * @param {string} emailData.to - Recipient email
 * @param {string} emailData.subject - Email subject
 * @param {string} emailData.text - Plain text content
 * @param {string} emailData.html - HTML content
 * @param {string} emailData.from - Sender (optional)
 * @param {number} priority - Job priority (1-10, higher = more important)
 * @returns {Promise<object>} - Job object or fallback result
 */
exports.queueEmail = async (emailData, priority = 5) => {
  // GRACEFUL DEGRADATION: Use sync fallback if Redis unavailable
  if (!queueReady || !emailQueue) {
    logger.warn('Redis unavailable - sending email synchronously (FALLBACK)', {
      to: emailData.to,
      subject: emailData.subject,
    });

    // Send synchronously as fallback
    const result = await sendEmailSync(emailData);
    return { emailId: result.id, fallback: true };
  }

  // Queue email normally (preferred path)
  try {
    const job = await emailQueue.add(emailData, {
      priority,
      attempts: emailData.critical ? 5 : 3, // More retries for critical emails
    });

    logger.info('Email queued (async)', {
      jobId: job.id,
      to: emailData.to,
      subject: emailData.subject,
      priority,
    });
    return { jobId: job.id, queued: true };
  } catch (error) {
    logger.error('Failed to queue email - attempting synchronous fallback', {
      to: emailData.to,
      subject: emailData.subject,
      error: error.message,
    });

    // Fallback to synchronous send if queue fails
    const result = await sendEmailSync(emailData);
    return { emailId: result.id, fallback: true };
  }
};

/**
 * Queue verification email
 */
exports.queueVerificationEmail = async (email, verificationUrl) => exports.queueEmail(
  {
    to: email,
    subject: 'Email Verification - Capsule',
    html: `
      <h2>Welcome to Capsule!</h2>
      <p>Please verify your email address by clicking the link below:</p>
      <a href="${verificationUrl}">${verificationUrl}</a>
      <p>This link will expire in 24 hours.</p>
    `,
    text: `Welcome to Capsule! Please verify your email: ${verificationUrl}`,
    critical: true,
  },
  10,
);

/**
 * Queue password reset email
 */
exports.queuePasswordResetEmail = async (email, resetUrl) => exports.queueEmail(
  {
    to: email,
    subject: 'Password Reset - Capsule',
    html: `
      <h2>Password Reset Request</h2>
      <p>You requested a password reset. Click the link below to reset your password:</p>
      <a href="${resetUrl}">${resetUrl}</a>
      <p>This link will expire in 10 minutes.</p>
      <p>If you didn't request this, please ignore this email.</p>
    `,
    text: `Password reset link: ${resetUrl} (expires in 10 minutes)`,
    critical: true,
  },
  10,
);

/**
 * Queue welcome email
 */
exports.queueWelcomeEmail = async (email, username) => exports.queueEmail(
  {
    to: email,
    subject: 'Welcome to Capsule!',
    html: `
      <h2>Welcome ${username}!</h2>
      <p>Thank you for joining Capsule. Start creating and sharing your vlogs today!</p>
      <p>Get started by:</p>
      <ul>
        <li>Completing your profile</li>
        <li>Creating your first vlog</li>
        <li>Following other creators</li>
      </ul>
    `,
    text: `Welcome ${username}! Thank you for joining Capsule.`,
  },
  5,
);

/**
 * Check if queue is available
 */
exports.isQueueAvailable = () => queueReady;

/**
 * Get queue statistics
 */
exports.getQueueStats = async () => {
  if (!queueReady || !emailQueue) {
    return {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
      total: 0,
      available: false,
    };
  }

  const [waiting, active, completed, failed, delayed] = await Promise.all([
    emailQueue.getWaitingCount(),
    emailQueue.getActiveCount(),
    emailQueue.getCompletedCount(),
    emailQueue.getFailedCount(),
    emailQueue.getDelayedCount(),
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    total: waiting + active + completed + failed + delayed,
    available: true,
  };
};

/**
 * Clean old jobs (run periodically)
 */
exports.cleanOldJobs = async () => {
  if (!queueReady || !emailQueue) {
    logger.debug('Queue cleanup skipped - queue unavailable');
    return;
  }

  await emailQueue.clean(24 * 60 * 60 * 1000, 'completed'); // Remove completed jobs older than 1 day
  await emailQueue.clean(7 * 24 * 60 * 60 * 1000, 'failed'); // Remove failed jobs older than 7 days
  logger.info('Email queue cleaned');
};

// Graceful shutdown
process.on('SIGTERM', async () => {
  if (queueReady && emailQueue) {
    await emailQueue.close();
    logger.info('Email queue closed on SIGTERM');
  }
});

module.exports = exports;
