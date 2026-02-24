require('dotenv').config();
const Queue = require('bull');
const { Resend } = require('resend');
const logger = require('../config/logger');
const emailConfig = require('../config/email');

/**
 * Send email via Resend with 10 s timeout
 */
const sendEmail = async (options) => {
  const resend = new Resend(emailConfig.resend.apiKey);
  const FROM_EMAIL = emailConfig.resend.fromEmail;
  const FROM_NAME = emailConfig.resend.fromName;

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

  logger.info('Email sent via Resend', {
    emailId: result.id,
    to: options.to,
    from: FROM_EMAIL,
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
  const emailQueue = new Queue('email', {
    redis: emailConfig.redis,
  });

  // Process email jobs
  emailQueue.process(async (job) => {
    const {
      to, subject, text, html,
    } = job.data;

    logger.info('Processing email job', {
      jobId: job.id,
      to,
      subject,
      attempt: job.attemptsMade + 1,
    });

    try {
      await sendEmail({
        to, subject, text, html,
      });
      return { success: true };
    } catch (error) {
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
    logger.info('Shutting down email worker...');
    await emailQueue.close();
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  logger.info('Email worker started', {
    redis: `${emailConfig.redis.host}:${emailConfig.redis.port}`,
    sender: emailConfig.resend.fromEmail,
  });

  return emailQueue;
};

// Auto-run only when executed directly: node emailWorker.js
if (require.main === module) {
  startWorker();
}

module.exports = { startWorker, sendEmail };
