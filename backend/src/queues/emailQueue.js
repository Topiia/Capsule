const Queue = require('bull');
const logger = require('../config/logger');
const emailConfig = require('../config/email');
const { sendEmailSync } = require('../utils/sendEmailSync');

/**
 * PERFORMANCE: Email Job Queue (Producer Only)
 *
 * This file contains the queue producer factory for the API server.
 * The worker process (src/workers/emailWorker.js) handles job consumption.
 *
 * - Prevents email sending from blocking HTTP requests
 * - Automatic retry with exponential backoff (handled by worker)
 * - Job persistence (survives server restarts)
 * - FALLBACK: Sends synchronously if Redis unavailable
 */

let emailQueue = null;
let queueReady = false;

/**
 * Initialize the email queue producer.
 * Must be called explicitly during server startup.
 * Prevents auto-connection during module import (useful for test isolation).
 */
exports.createEmailQueue = () => {
  if (process.env.NODE_ENV === 'test') { return null; }
  if (emailQueue) return emailQueue;

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

  return emailQueue;
};

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
  const Q_START = Date.now();
  const qlog = (label, extra = '') => {
    console.log(`[FP] ${label} +${Date.now() - Q_START}ms${extra ? `  ${extra}` : ''}  (${new Date().toISOString()})`);
  };

  // ─── GRACEFUL DEGRADATION: Use sync fallback if queue is not ready ────────
  if (!queueReady || !emailQueue) {
    logger.warn('Redis unavailable - sending email synchronously (FALLBACK)', {
      to: emailData.to,
      subject: emailData.subject,
    });

    // ─── [FP] Signal 3 — Email Mode/Provider (sync-fallback FIRE-AND-FORGET) ─
    console.log(`[FP] EMAIL_MODE  sync-fallback-fire-and-forget  +${Date.now() - Q_START}ms  (${new Date().toISOString()})`);
    console.log(`[FP] EMAIL_PROVIDER  resend  +${Date.now() - Q_START}ms  (${new Date().toISOString()})`);
    qlog('EMAIL_SEND_START', '(sync-fallback — FIRE AND FORGET — not blocking response)');
    // CRITICAL FIX: Do NOT await. Fire-and-forget so HTTP response returns immediately.
    // Email sends in background; failure is logged but does not block the user.
    const emailT0 = Date.now();
    sendEmailSync(emailData)
      .then((result) => {
        const emailDuration = Date.now() - emailT0;
        qlog('EMAIL_SEND_DONE', `(sync-fallback background result.id=${result && result.id})`);
        console.log(`[FP] EMAIL_DURATION  ${emailDuration}ms  (background sync send completed)  (${new Date().toISOString()})`);
      })
      .catch((err) => {
        console.error(`[FP] EMAIL_SEND_ERROR  (sync-fallback background failed: ${err.message})  (${new Date().toISOString()})`);
        logger.error('Background sync email send failed', { to: emailData.to, error: err.message });
      });
    console.log(`[FP] EMAIL_DURATION  0ms  (fire-and-forget — response not blocked)  (${new Date().toISOString()})`);
    return { emailId: null, fallback: true, fireAndForget: true };
  }

  // ─── Queue email normally (preferred async path) ─────────────────────────
  try {
    // ─── [FP] Signal 3 — Email Mode/Provider (async queue) ───────────────
    console.log(`[FP] EMAIL_MODE  async-queue  +${Date.now() - Q_START}ms  (${new Date().toISOString()})`);
    console.log(`[FP] EMAIL_PROVIDER  resend-via-worker  +${Date.now() - Q_START}ms  (${new Date().toISOString()})`);

    // ─── [FP] Signal 4 — QUEUE_ADD_ATTEMPT ───────────────────────────────
    qlog('QUEUE_ADD_ATTEMPT', `(priority=${priority}  critical=${!!emailData.critical})`);
    qlog('EMAIL_SEND_START', '(async queue path — calling emailQueue.add)');
    const addT0 = Date.now();
    const job = await emailQueue.add(emailData, {
      priority,
      attempts: emailData.critical ? 5 : 3, // More retries for critical emails
    });
    const addDuration = Date.now() - addT0;

    // ─── [FP] Signal 4 — QUEUE_ADD_SUCCESS ───────────────────────────────
    qlog('QUEUE_ADD_SUCCESS', `(jobId=${job && job.id}  addDuration=${addDuration}ms)`);
    qlog('EMAIL_SEND_DONE', `(async queue path — jobId=${job && job.id})`);
    // NOTE: EMAIL_DURATION for async path = cost of queue.add only (worker sends it later)
    console.log(`[FP] EMAIL_DURATION  ${addDuration}ms  (queue.add cost only — worker delivers async)  (${new Date().toISOString()})`);

    logger.info('Email queued (async)', {
      jobId: job.id,
      to: emailData.to,
      subject: emailData.subject,
      priority,
    });
    return { jobId: job.id, queued: true };
  } catch (error) {
    // ─── [FP] Signal 4 — QUEUE_ADD_ERROR ─────────────────────────────────
    qlog('QUEUE_ADD_ERROR', `(queue.add threw: ${error.message})`);
    qlog('EMAIL_SEND_DONE', `(queue.add threw: ${error.message} — falling back to sync)`);
    logger.error('Failed to queue email - attempting synchronous fallback', {
      to: emailData.to,
      subject: emailData.subject,
      error: error.message,
    });

    // ─── [FP] Signal 3 — Email Mode/Provider (catch-fallback FIRE-AND-FORGET) ─
    console.log(`[FP] EMAIL_MODE  catch-fallback-fire-and-forget  +${Date.now() - Q_START}ms  (${new Date().toISOString()})`);
    console.log(`[FP] EMAIL_PROVIDER  resend  +${Date.now() - Q_START}ms  (${new Date().toISOString()})`);
    qlog('EMAIL_SEND_START', '(catch-fallback — FIRE AND FORGET — not blocking response)');
    // CRITICAL FIX: Do NOT await. Fire-and-forget so HTTP response returns immediately.
    const fallT0 = Date.now();
    sendEmailSync(emailData)
      .then((result) => {
        const fallDuration = Date.now() - fallT0;
        qlog('EMAIL_SEND_DONE', `(catch-fallback background result.id=${result && result.id})`);
        console.log(`[FP] EMAIL_DURATION  ${fallDuration}ms  (background catch-fallback completed)  (${new Date().toISOString()})`);
      })
      .catch((err) => {
        console.error(`[FP] EMAIL_SEND_ERROR  (catch-fallback background failed: ${err.message})  (${new Date().toISOString()})`);
        logger.error('Background catch-fallback email send failed', { to: emailData.to, error: err.message });
      });
    console.log(`[FP] EMAIL_DURATION  0ms  (fire-and-forget — response not blocked)  (${new Date().toISOString()})`);
    return { emailId: null, fallback: true, fireAndForget: true };
  }
};

/**
 * Queue verification email
 */
exports.queueVerificationEmail = async (email, verificationUrl) => exports.queueEmail(
  {
    to: email,
    subject: 'Verify Your Email - Capsule',
    html: `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify Your Email</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
        <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f4f4f4;">
          <tr>
            <td style="padding: 40px 0;">
              <table role="presentation" style="width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <!-- Header -->
                <tr>
                  <td style="padding: 40px 40px 20px; text-align: center; background-color: #4F46E5; border-radius: 8px 8px 0 0;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold;">Capsule</h1>
                  </td>
                </tr>
                <!-- Content -->
                <tr>
                  <td style="padding: 40px;">
                    <h2 style="margin: 0 0 20px; color: #1f2937; font-size: 24px; font-weight: bold;">Welcome to Capsule!</h2>
                    <p style="margin: 0 0 20px; color: #4b5563; font-size: 16px; line-height: 1.6;">
                      Thank you for signing up. To get started, please verify your email address by clicking the button below.
                    </p>
                    <!-- CTA Button -->
                    <table role="presentation" style="margin: 30px 0;">
                      <tr>
                        <td style="border-radius: 6px; background-color: #4F46E5;">
                          <a href="${verificationUrl}" style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: bold; border-radius: 6px;">Verify Email Address</a>
                        </td>
                      </tr>
                    </table>
                    <p style="margin: 20px 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                      This verification link will expire in 24 hours. If you didn't create an account with Capsule, you can safely ignore this email.
                    </p>
                    <p style="margin: 20px 0 0; color: #9ca3af; font-size: 12px; line-height: 1.6;">
                      If the button doesn't work, copy and paste this link into your browser:<br>
                      <a href="${verificationUrl}" style="color: #4F46E5; word-break: break-all;">${verificationUrl}</a>
                    </p>
                  </td>
                </tr>
                <!-- Footer -->
                <tr>
                  <td style="padding: 30px 40px; background-color: #f9fafb; border-radius: 0 0 8px 8px; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0 0 10px; color: #6b7280; font-size: 14px; text-align: center;">
                      <strong>Capsule</strong> - Your vlog platform
                    </p>
                    <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center; line-height: 1.6;">
                      You're receiving this email because you signed up for Capsule.<br>
                      If you'd like to stop receiving these emails, you can <a href="#" style="color: #4F46E5; text-decoration: none;">unsubscribe</a>.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
    text: `Welcome to Capsule!\n\nThank you for signing up. Please verify your email address by visiting this link:\n\n${verificationUrl}\n\nThis link will expire in 24 hours.\n\nIf you didn't create an account with Capsule, you can safely ignore this email.\n\n---\nCapsule - Your vlog platform`,
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
    subject: 'Reset Your Password - Capsule',
    html: `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Your Password</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
        <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f4f4f4;">
          <tr>
            <td style="padding: 40px 0;">
              <table role="presentation" style="width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <!-- Header -->
                <tr>
                  <td style="padding: 40px 40px 20px; text-align: center; background-color: #4F46E5; border-radius: 8px 8px 0 0;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold;">Capsule</h1>
                  </td>
                </tr>
                <!-- Content -->
                <tr>
                  <td style="padding: 40px;">
                    <h2 style="margin: 0 0 20px; color: #1f2937; font-size: 24px; font-weight: bold;">Password Reset Request</h2>
                    <p style="margin: 0 0 20px; color: #4b5563; font-size: 16px; line-height: 1.6;">
                      We received a request to reset your password. Click the button below to create a new password.
                    </p>
                    <!-- CTA Button -->
                    <table role="presentation" style="margin: 30px 0;">
                      <tr>
                        <td style="border-radius: 6px; background-color: #4F46E5;">
                          <a href="${resetUrl}" style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: bold; border-radius: 6px;">Reset Password</a>
                        </td>
                      </tr>
                    </table>
                    <!-- Security Warning -->
                    <table role="presentation" style="margin: 20px 0; background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 4px;">
                      <tr>
                        <td>
                          <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.6;">
                            <strong>⚠️ Security Notice:</strong> This link will expire in 10 minutes. If you didn't request a password reset, please ignore this email and your password will remain unchanged.
                          </p>
                        </td>
                      </tr>
                    </table>
                    <p style="margin: 20px 0 0; color: #9ca3af; font-size: 12px; line-height: 1.6;">
                      If the button doesn't work, copy and paste this link into your browser:<br>
                      <a href="${resetUrl}" style="color: #4F46E5; word-break: break-all;">${resetUrl}</a>
                    </p>
                  </td>
                </tr>
                <!-- Footer -->
                <tr>
                  <td style="padding: 30px 40px; background-color: #f9fafb; border-radius: 0 0 8px 8px; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0 0 10px; color: #6b7280; font-size: 14px; text-align: center;">
                      <strong>Capsule</strong> - Your vlog platform
                    </p>
                    <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center; line-height: 1.6;">
                      This is an automated security email from Capsule.<br>
                      For security reasons, we cannot unsubscribe you from these notifications.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
    text: `Password Reset Request\n\nWe received a request to reset your password for your Capsule account.\n\nReset your password by visiting this link:\n\n${resetUrl}\n\n⚠️ SECURITY NOTICE:\n- This link will expire in 10 minutes\n- If you didn't request this reset, please ignore this email\n- Your password will remain unchanged if you don't click the link\n\n---\nCapsule - Your vlog platform\nThis is an automated security email.`,
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
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to Capsule</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
        <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f4f4f4;">
          <tr>
            <td style="padding: 40px 0;">
              <table role="presentation" style="width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <!-- Header -->
                <tr>
                  <td style="padding: 40px 40px 20px; text-align: center; background-color: #4F46E5; border-radius: 8px 8px 0 0;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold;">Capsule</h1>
                  </td>
                </tr>
                <!-- Content -->
                <tr>
                  <td style="padding: 40px;">
                    <h2 style="margin: 0 0 20px; color: #1f2937; font-size: 24px; font-weight: bold;">Welcome, ${username}! 🎉</h2>
                    <p style="margin: 0 0 20px; color: #4b5563; font-size: 16px; line-height: 1.6;">
                      Thank you for joining Capsule! We're excited to have you as part of our creative community. You're all set to start creating and sharing your vlogs with the world.
                    </p>
                    <h3 style="margin: 30px 0 15px; color: #1f2937; font-size: 18px; font-weight: bold;">Get Started:</h3>
                    <table role="presentation" style="width: 100%; margin: 0 0 20px;">
                      <tr>
                        <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
                          <p style="margin: 0; color: #4b5563; font-size: 15px;">
                            <strong style="color: #4F46E5;">✓</strong> Complete your profile to let others know who you are
                          </p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
                          <p style="margin: 0; color: #4b5563; font-size: 15px;">
                            <strong style="color: #4F46E5;">✓</strong> Create your first vlog and share your story
                          </p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 12px 0;">
                          <p style="margin: 0; color: #4b5563; font-size: 15px;">
                            <strong style="color: #4F46E5;">✓</strong> Follow other creators and discover amazing content
                          </p>
                        </td>
                      </tr>
                    </table>
                    <!-- CTA Button -->
                    <table role="presentation" style="margin: 30px 0;">
                      <tr>
                        <td style="border-radius: 6px; background-color: #4F46E5;">
                          <a href="${process.env.FRONTEND_URL || 'https://vlogspherefrontend.vercel.app'}" style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: bold; border-radius: 6px;">Start Creating</a>
                        </td>
                      </tr>
                    </table>
                    <p style="margin: 20px 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                      If you have any questions or need help getting started, feel free to reach out to our support team.
                    </p>
                  </td>
                </tr>
                <!-- Footer -->
                <tr>
                  <td style="padding: 30px 40px; background-color: #f9fafb; border-radius: 0 0 8px 8px; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0 0 10px; color: #6b7280; font-size: 14px; text-align: center;">
                      <strong>Capsule</strong> - Your vlog platform
                    </p>
                    <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center; line-height: 1.6;">
                      You're receiving this email because you signed up for Capsule.<br>
                      If you'd like to stop receiving these emails, you can <a href="#" style="color: #4F46E5; text-decoration: none;">unsubscribe</a>.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
    text: `Welcome to Capsule, ${username}! 🎉\n\nThank you for joining Capsule! We're excited to have you as part of our creative community.\n\nGet Started:\n✓ Complete your profile to let others know who you are\n✓ Create your first vlog and share your story\n✓ Follow other creators and discover amazing content\n\nVisit Capsule: ${process.env.FRONTEND_URL || 'https://vlogspherefrontend.vercel.app'}\n\nIf you have any questions or need help getting started, feel free to reach out to our support team.\n\n---\nCapsule - Your vlog platform`,
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

// Graceful shutdown (only closes if it was actually created)
process.on('SIGTERM', async () => {
  if (emailQueue) {
    await emailQueue.close();
    logger.info('Email queue closed on SIGTERM');
  }
});

module.exports = exports;
