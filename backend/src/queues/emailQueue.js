const { createQueue } = require('../config/queue.config');
const logger = require('../config/logger');
const emailConfig = require('../config/email');

const { onJobFailed, createFailureSpikeDetector } = require('../monitoring/dlqMonitor');

const metrics = require('../config/metrics');

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
  if (emailQueue) return emailQueue;

  try {
    emailQueue = createQueue('email', {
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

    // ─── [QUEUE] Redis connection event listeners ─────────────────────────────
    // Bull exposes its ioredis client via .client after queue creation.
    // These events prove whether Redis instability is the delay source.
    // If you see RECONNECTING in logs → Redis dropped → delay is here.
    const attachQueueRedisListeners = (client, label) => {
      // Guard: mock clients in tests don't implement EventEmitter — skip safely
      if (!client || typeof client.on !== 'function') {
        console.log(`[QUEUE-REDIS] ${label} listeners skipped (no EventEmitter)`);
        return;
      }
      const T0 = Date.now();
      const ts = () => `  (${new Date().toISOString()})  +${Date.now() - T0}ms`;
      client.on('connect', () => console.log(`[QUEUE-REDIS] ${label} CONNECT${ts()}`));
      client.on('ready', () => console.log(`[QUEUE-REDIS] ${label} READY${ts()}`));
      client.on('reconnecting', () => console.log(`[QUEUE-REDIS] ${label} RECONNECTING${ts()}`));
      client.on('error', (err) => console.log(`[QUEUE-REDIS] ${label} ERROR  ${err.message}${ts()}`));
      client.on('end', () => console.log(`[QUEUE-REDIS] ${label} END${ts()}`));
    };

    // Bull creates two internal Redis clients: client (commands) + subscriber (pub/sub)
    if (emailQueue.client) attachQueueRedisListeners(emailQueue.client, 'client');
    if (emailQueue.eclient) attachQueueRedisListeners(emailQueue.eclient, 'subscriber');

    // Verify connectivity on init (async)
    emailQueue.isReady().then(() => {
      queueReady = true;
      logger.info('Email queue ready (async mode enabled)', {
        redis: emailConfig.redis.url || `${emailConfig.redis.host}:${emailConfig.redis.port}`,
      });
    }).catch((err) => {
      queueReady = false;
      logger.warn('Email queue unavailable - using synchronous fallback', {
        error: err.message,
        impact: 'Emails will be sent synchronously (blocking)',
      });
    });

    // OBSERVABILITY: DLQ + spike detection on permanent job failure
    const emailSpikeDetector = createFailureSpikeDetector('email');
    emailQueue.on('failed', (job, err) => {
      // Only push to DLQ when all retries are exhausted
      if (job.attemptsMade >= (job.opts?.attempts || 3)) {
        onJobFailed('email', job, err, emailQueue.client);
      }
      emailSpikeDetector();
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

const EmailJob = require('../models/EmailJob');

/**
 * Queue an email for async processing using Database Outbox Pattern
 * GUARANTEES at-least-once delivery by writing to MongoDB first.
 *
 * @param {object} emailData - Email data
 * @param {number} priority - Job priority
 * @param {object} context - Request context holding traceId and userId
 */
exports.queueEmail = async (emailData, priority = 5, context = {}) => {
  const { traceId = null, userId = null } = context;

  // 1. Persist the intent to DB immediately (PENDING state)
  const jobDoc = await EmailJob.create({
    userId,
    email: emailData.to,
    type: emailData.type || 'general',
    status: 'PENDING',
    traceId,
    maxAttempts: emailData.critical ? 5 : 3,
    payload: {
      subject: emailData.subject,
      html: emailData.html,
      text: emailData.text,
    },
  });

  metrics.increment('emailDbCreated');

  logger.info('[EMAIL] Outbox DB Record Created', {
    emailJobId: jobDoc._id,
    traceId,
    type: jobDoc.type,
    status: 'PENDING',
  });

  // 2. Attempt direct push to Bull queue to minimize latency
  try {
    const queueJob = await emailQueue.add(
      { emailJobId: jobDoc._id },
      {
        priority,
        attempts: jobDoc.maxAttempts,
      },
    );

    // If successful, update to QUEUED
    await EmailJob.updateOne(
      { _id: jobDoc._id, status: 'PENDING' },
      { $set: { status: 'QUEUED', queuedAt: new Date() } },
    );

    metrics.increment('emailAsyncQueued');
    logger.info('[EMAIL] Queued to Bull', {
      emailJobId: jobDoc._id,
      bullJobId: queueJob.id,
      traceId,
      status: 'QUEUED',
    });

    return { emailJobId: jobDoc._id, queued: true };
  } catch (error) {
    // 3. Fallback: Leave it PENDING. The Outbox Dispatcher will pick it up automatically!
    logger.warn('[EMAIL] Redis queue add failed — Will be swept by dispatcher', {
      emailJobId: jobDoc._id,
      traceId,
      error: error.message,
    });
    metrics.increment('emailRedisEnqueueFailed');

    // Do NOT throw error; the API must return 200 since the DB preserved the request!
    return { emailJobId: jobDoc._id, queued: false };
  }
};

/**
 * Queue verification email
 */
exports.queueVerificationEmail = async (email, verificationUrl, context = {}) => exports.queueEmail(
  {
    to: email,
    type: 'verification',
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
  context,
);

/**
 * Queue password reset email
 */
exports.queuePasswordResetEmail = async (email, resetUrl, context = {}) => exports.queueEmail(
  {
    to: email,
    type: 'forgot_password',
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
  context,
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
                          <a href="${process.env.FRONTEND_URL}" style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: bold; border-radius: 6px;">Start Creating</a>
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
    text: `Welcome to Capsule, ${username}! 🎉\n\nThank you for joining Capsule! We're excited to have you as part of our creative community.\n\nGet Started:\n✓ Complete your profile to let others know who you are\n✓ Create your first vlog and share your story\n✓ Follow other creators and discover amazing content\n\nVisit Capsule: ${process.env.FRONTEND_URL}\n\nIf you have any questions or need help getting started, feel free to reach out to our support team.\n\n---\nCapsule - Your vlog platform`,
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
