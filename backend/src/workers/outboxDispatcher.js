const EmailJob = require('../models/EmailJob');
const { createEmailQueue } = require('../queues/emailQueue');
const { sendEmail } = require('../utils/sendEmail');
const logger = require('../config/logger');

let dispatcherInterval;
let emailQueue; // Shared reference so tests can also inspect it

/**
 * Core dispatch cycle — exported for direct invocation in tests.
 * In production this is invoked every 10 seconds by setInterval.
 *
 * STRATEGY:
 *  1. Claim orphaned PENDING jobs (not picked up by the direct enqueue path)
 *  2. Try Bull first (if Redis is available)
 *  3. If Bull is unavailable or not initialized → send email DIRECTLY via Resend
 *     This makes email delivery work even without a separate Worker process.
 */
const runDispatchCycle = async () => {
  try {
    // 1. Find PENDING jobs older than 5 seconds
    //    (5s gives the direct API→Bull path a window to succeed first)
    const pendingJobs = await EmailJob.find({
      status: 'PENDING',
      createdAt: { $lte: new Date(Date.now() - 5000) },
    }).limit(50);

    if (pendingJobs.length > 0) {
      logger.info(`[DISPATCHER] Found ${pendingJobs.length} orphaned PENDING job(s) — processing`, {
        count: pendingJobs.length,
      });
    }

    /* eslint-disable no-restricted-syntax, no-await-in-loop */
    for (const job of pendingJobs) {
      // Atomic claim — prevents duplicate processing under concurrency
      const claimed = await EmailJob.findOneAndUpdate(
        { _id: job._id, status: 'PENDING' },
        { $set: { status: 'PROCESSING', processedAt: new Date(), attempts: (job.attempts || 0) + 1 } },
        { new: true },
      );

      if (!claimed) {
        // Another dispatcher already claimed it — skip
      } else {
        logger.info('[DISPATCHER] JOB_CLAIMED', {
          emailJobId: claimed._id,
          type: claimed.type,
          to: claimed.email,
          traceId: claimed.traceId,
        });

        // 2. Try Bull queue first (fast path — worker picks it up)
        let pushedToBull = false;
        if (emailQueue) {
          try {
            await emailQueue.add(
              { emailJobId: claimed._id },
              { priority: 5, attempts: claimed.maxAttempts },
            );
            await EmailJob.updateOne(
              { _id: claimed._id },
              { $set: { status: 'QUEUED', queuedAt: new Date() } },
            );
            pushedToBull = true;
            logger.info('[DISPATCHER] JOB_QUEUED_TO_BULL', {
              emailJobId: claimed._id,
              traceId: claimed.traceId,
            });
          } catch (bullErr) {
            logger.warn('[DISPATCHER] Bull unavailable — falling back to direct send', {
              emailJobId: claimed._id,
              error: bullErr.message,
            });
          }
        }

        // 3. FALLBACK: Direct send via Resend
        //    Runs when: Bull is unavailable, Redis is down, or no worker is deployed.
        //    This guarantees delivery even in single-process / free-tier deployments.
        if (!pushedToBull) {
          try {
            const { subject, html, text } = claimed.payload;
            logger.info('[DISPATCHER] DIRECT_SEND_START', {
              emailJobId: claimed._id,
              to: claimed.email,
              type: claimed.type,
            });

            const result = await sendEmail({
              to: claimed.email,
              subject,
              html,
              text,
              emailJobId: claimed._id,
            });

            const messageId = result?.data?.id || result?.id;
            await EmailJob.updateOne(
              { _id: claimed._id },
              { $set: { status: 'SENT', providerMessageId: messageId } },
            );

            logger.info('[DISPATCHER] DIRECT_SEND_SUCCESS', {
              emailJobId: claimed._id,
              to: claimed.email,
              type: claimed.type,
              messageId,
            });
          } catch (sendErr) {
            // Revert to PENDING so the next sweep retries
            const maxAttempts = claimed.maxAttempts || 5;
            const nextStatus = claimed.attempts >= maxAttempts ? 'DEAD' : 'PENDING';

            await EmailJob.updateOne(
              { _id: claimed._id },
              {
                $set: { status: nextStatus, lastError: sendErr.message },
                $unset: { processedAt: 1 },
              },
            );

            logger.error('[DISPATCHER] DIRECT_SEND_FAILED', {
              emailJobId: claimed._id,
              to: claimed.email,
              error: sendErr.message,
              nextStatus,
            });
          }
        }
      }
    } // end for...of
    /* eslint-enable no-restricted-syntax, no-await-in-loop */

    // 4. Safety sweep: recover jobs STUCK in QUEUED > 5 minutes back to PENDING
    //    (Guard against Bull dropping jobs or worker crashing mid-process)
    const stuckJobs = await EmailJob.updateMany(
      { status: 'QUEUED', queuedAt: { $lte: new Date(Date.now() - 300000) } },
      { $set: { status: 'PENDING' }, $unset: { queuedAt: 1 } },
    );
    if (stuckJobs.modifiedCount > 0) {
      logger.warn(`[DISPATCHER] Recovered ${stuckJobs.modifiedCount} stuck QUEUED job(s) back to PENDING`);
    }

    // 5. Safety sweep: recover jobs STUCK in PROCESSING > 10 minutes back to PENDING
    //    (Guard against dispatcher or worker crashing mid-execution)
    const stuckProcessing = await EmailJob.updateMany(
      { status: 'PROCESSING', processedAt: { $lte: new Date(Date.now() - 600000) } },
      { $set: { status: 'PENDING' }, $unset: { processedAt: 1 } },
    );
    if (stuckProcessing.modifiedCount > 0) {
      logger.warn(`[DISPATCHER] Recovered ${stuckProcessing.modifiedCount} stuck PROCESSING job(s) back to PENDING`);
    }
  } catch (err) {
    logger.error('[DISPATCHER] Error during polling', { error: err.message });
  }
};

const startOutboxDispatcher = () => {
  if (dispatcherInterval) return;

  // emailQueue is optional — dispatcher works without it via direct send fallback
  try {
    emailQueue = createEmailQueue();
  } catch (e) {
    logger.warn('[DISPATCHER] Could not initialize Bull queue — direct send fallback active', {
      error: e.message,
    });
  }

  dispatcherInterval = setInterval(runDispatchCycle, 10000);
  logger.info('[DISPATCHER] Outbox Dispatcher started (interval: 10s, fallback: direct-send)');
};

const stopOutboxDispatcher = () => {
  if (dispatcherInterval) {
    clearInterval(dispatcherInterval);
    dispatcherInterval = null;
    logger.info('Email Outbox Dispatcher stopped');
  }
};

module.exports = { startOutboxDispatcher, stopOutboxDispatcher, runDispatchCycle };
