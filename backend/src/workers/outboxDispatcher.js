const EmailJob = require('../models/EmailJob');
const { createEmailQueue } = require('../queues/emailQueue');
const logger = require('../config/logger');

let dispatcherInterval;
let emailQueue; // Shared reference so tests can also inspect it

/**
 * Core dispatch cycle — exported for direct invocation in tests.
 * In production this is invoked every 10 seconds by setInterval.
 */
const runDispatchCycle = async () => {
  try {
    // 1. Find jobs older than 5 seconds (give primary enqueue a chance to succeed)
    const pendingJobs = await EmailJob.find({
      status: 'PENDING',
      createdAt: { $lte: new Date(Date.now() - 5000) },
    }).limit(50);

    /* eslint-disable no-restricted-syntax, no-await-in-loop */
    for (const job of pendingJobs) {
      // Atomic claim ensures multiple dispatchers don't process the same job
      const claimed = await EmailJob.findOneAndUpdate(
        { _id: job._id, status: 'PENDING' },
        { $set: { status: 'QUEUED', queuedAt: new Date() } },
        { new: true },
      );

      if (claimed) {
        try {
          await emailQueue.add(
            { emailJobId: claimed._id },
            { priority: 5, attempts: claimed.maxAttempts },
          );
          logger.info('[DISPATCHER] Outbox job enqueued', {
            emailJobId: claimed._id,
            traceId: claimed.traceId,
            type: claimed.type,
            status: 'QUEUED',
          });
        } catch (bullErr) {
          logger.error('[DISPATCHER] Bull Add Failed', {
            emailJobId: claimed._id,
            error: bullErr.message,
          });
          // Revert status to PENDING so it can be picked up by the next sweep
          await EmailJob.updateOne(
            { _id: claimed._id },
            { $set: { status: 'PENDING' }, $unset: { queuedAt: 1 } },
          );
        }
      }
    }
    /* eslint-enable no-restricted-syntax, no-await-in-loop */

    // 2. Safety sweep: Recover jobs stuck in QUEUED for more than 5 minutes
    const stuckJobs = await EmailJob.updateMany(
      { status: 'QUEUED', queuedAt: { $lte: new Date(Date.now() - 300000) } },
      { $set: { status: 'PENDING' }, $unset: { queuedAt: 1 } },
    );
    if (stuckJobs.modifiedCount > 0) {
      logger.warn(`[DISPATCHER] Recovered ${stuckJobs.modifiedCount} stuck QUEUED jobs back to PENDING`);
    }
  } catch (err) {
    logger.error('[DISPATCHER] Error during polling', { error: err.message });
  }
};

const startOutboxDispatcher = () => {
  if (dispatcherInterval) return;

  emailQueue = createEmailQueue();
  if (!emailQueue) return;

  dispatcherInterval = setInterval(runDispatchCycle, 10000);
  logger.info('Email Outbox Dispatcher started');
};

const stopOutboxDispatcher = () => {
  if (dispatcherInterval) {
    clearInterval(dispatcherInterval);
    dispatcherInterval = null;
    logger.info('Email Outbox Dispatcher stopped');
  }
};

module.exports = { startOutboxDispatcher, stopOutboxDispatcher, runDispatchCycle };
