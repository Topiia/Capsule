const Queue = require('bull');
const sendEmail = require('../utils/sendEmail');
const logger = require('../config/logger');

/**
 * PERFORMANCE: Email Job Queue
 *
 * Async email processing using Bull queue:
 * - Prevents email sending from blocking HTTP requests
 * - Automatic retry with exponential backoff
 * - Job persistence (survives server restarts)
 * - Monitoring through Bull Board (optional)
 */

// Create email queue (graceful fallback if Redis unavailable)
let emailQueue = null;
let isQueueAvailable = false;

try {
  emailQueue = new Queue('email', {
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT, 10) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
    },
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

  isQueueAvailable = true;
  logger.info('Bull email queue initialized successfully');
  console.log('[INFO] Bull email queue ready');
} catch (error) {
  isQueueAvailable = false;
  emailQueue = null;
  logger.warn('Bull queue unavailable - emails will be sent synchronously', {
    error: error.message,
  });
  console.warn('[WARN] Bull email queue unavailable - emails will be sent synchronously');
}

// Process email jobs (only if queue is available)
if (isQueueAvailable && emailQueue) {
  emailQueue.process(async (job) => {
    const {
      to, subject, text, html, from,
    } = job.data;

    logger.info('Processing email job', {
      jobId: job.id,
      to,
      subject,
      attempt: job.attemptsMade + 1,
    });

    try {
      await sendEmail({
        to,
        subject,
        text,
        html,
        from,
      });

      logger.info('Email sent successfully', {
        jobId: job.id,
        to,
        subject,
      });

      return { success: true, to, subject };
    } catch (error) {
      logger.error('Email send failed', {
        jobId: job.id,
        to,
        subject,
        error: error.message,
        attempt: job.attemptsMade + 1,
      });

      throw error; // Re-throw to trigger retry
    }
  });
}

// Queue event handlers (only attach if queue is available)
if (isQueueAvailable && emailQueue) {
  emailQueue.on('completed', (job, result) => {
    logger.debug('Email job completed', {
      jobId: job.id,
      result,
    });
  });

  emailQueue.on('failed', (job, err) => {
    logger.error('Email job failed (all retries exhausted)', {
      jobId: job.id,
      to: job.data.to,
      subject: job.data.subject,
      error: err.message,
      attempts: job.attemptsMade,
    });
  });

  emailQueue.on('stalled', (job) => {
    logger.warn('Email job stalled', {
      jobId: job.id,
      to: job.data.to,
    });
  });
}

/**
 * Queue an email for async processing
 *
 * @param {object} emailData - Email data
 * @param {string} emailData.to - Recipient email
 * @param {string} emailData.subject - Email subject
 * @param {string} emailData.text - Plain text content
 * @param {string} emailData.html - HTML content
 * @param {string} emailData.from - Sender (optional)
 * @param {number} priority - Job priority (1-10, higher = more important)
 * @returns {Promise<object>} - Job object
 */
exports.queueEmail = async (emailData, priority = 5) => {
  // Fallback to direct send if queue unavailable
  if (!isQueueAvailable || !emailQueue) {
    logger.info('Sending email directly (queue unavailable)', {
      to: emailData.to,
      subject: emailData.subject,
    });

    try {
      await sendEmail({
        to: emailData.to,
        subject: emailData.subject,
        text: emailData.text,
        html: emailData.html,
        from: emailData.from,
      });
      logger.info('Email sent directly (no queue)', {
        to: emailData.to,
        subject: emailData.subject,
      });
      return { success: true, direct: true };
    } catch (error) {
      logger.error('Direct email send failed', {
        to: emailData.to,
        subject: emailData.subject,
        error: error.message,
      });
      throw error;
    }
  }

  // Queue email normally
  try {
    const job = await emailQueue.add(emailData, {
      priority,
      attempts: emailData.critical ? 5 : 3, // More retries for critical emails
    });

    logger.info('Email queued', {
      jobId: job.id,
      to: emailData.to,
      subject: emailData.subject,
      priority,
    });

    return job;
  } catch (error) {
    logger.error('Failed to queue email', {
      to: emailData.to,
      subject: emailData.subject,
      error: error.message,
    });
    throw error;
  }
};

/**
 * Queue verification email
 */
exports.queueVerificationEmail = async (email, verificationUrl) => exports.queueEmail({
  to: email,
  subject: 'Email Verification - VlogSphere',
  html: `
      <h2>Welcome to VlogSphere!</h2>
      <p>Please verify your email address by clicking the link below:</p>
      <a href="${verificationUrl}">${verificationUrl}</a>
      <p>This link will expire in 24 hours.</p>
    `,
  text: `Welcome to VlogSphere! Please verify your email: ${verificationUrl}`,
  critical: true,
}, 10);

/**
 * Queue password reset email
 */
exports.queuePasswordResetEmail = async (email, resetUrl) => exports.queueEmail({
  to: email,
  subject: 'Password Reset - VlogSphere',
  html: `
      <h2>Password Reset Request</h2>
      <p>You requested a password reset. Click the link below to reset your password:</p>
      <a href="${resetUrl}">${resetUrl}</a>
      <p>This link will expire in 10 minutes.</p>
      <p>If you didn't request this, please ignore this email.</p>
    `,
  text: `Password reset link: ${resetUrl} (expires in 10 minutes)`,
  critical: true,
}, 10);

/**
 * Queue welcome email
 */
exports.queueWelcomeEmail = async (email, username) => exports.queueEmail({
  to: email,
  subject: 'Welcome to VlogSphere!',
  html: `
      <h2>Welcome ${username}!</h2>
      <p>Thank you for joining VlogSphere. Start creating and sharing your vlogs today!</p>
      <p>Get started by:</p>
      <ul>
        <li>Completing your profile</li>
        <li>Creating your first vlog</li>
        <li>Following other creators</li>
      </ul>
    `,
  text: `Welcome ${username}! Thank you for joining VlogSphere.`,
}, 5);

/**
 * Get queue statistics
 */
exports.getQueueStats = async () => {
  if (!isQueueAvailable || !emailQueue) {
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
  if (!isQueueAvailable || !emailQueue) {
    logger.debug('Queue cleanup skipped - queue unavailable');
    return;
  }

  await emailQueue.clean(24 * 60 * 60 * 1000, 'completed'); // Remove completed jobs older than 1 day
  await emailQueue.clean(7 * 24 * 60 * 60 * 1000, 'failed'); // Remove failed jobs older than 7 days
  logger.info('Email queue cleaned');
};

// Graceful shutdown
process.on('SIGTERM', async () => {
  if (isQueueAvailable && emailQueue) {
    await emailQueue.close();
    logger.info('Email queue closed on SIGTERM');
  }
});

module.exports = exports;
