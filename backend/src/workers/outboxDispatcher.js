const EmailJob = require('../models/EmailJob');
const { createEmailQueue } = require('../queues/emailQueue');
const logger = require('../config/logger');

let dispatcherInterval;

const startOutboxDispatcher = () => {
  if (dispatcherInterval) return;
  
  // Wait to require and create queue until function is called
  // to avoid circular dependencies and test environment issues
  const emailQueue = createEmailQueue();
  if (!emailQueue) return;

  dispatcherInterval = setInterval(async () => {
    try {
      // 1. Find jobs older than 5 seconds (give primary enqueue a chance to succeed)
      // This allows the initial API request to attempt direct Bull enqueue first
      const pendingJobs = await EmailJob.find({
        status: 'PENDING',
        createdAt: { $lte: new Date(Date.now() - 5000) }
      }).limit(50);

      for (const job of pendingJobs) {
        // Atomic claim ensures multiple dispatchers don't process the same job
        const claimed = await EmailJob.findOneAndUpdate(
          { _id: job._id, status: 'PENDING' },
          { $set: { status: 'QUEUED', queuedAt: new Date() } },
          { new: true }
        );

        if (claimed) {
          try {
            await emailQueue.add(
              { emailJobId: claimed._id },
              { priority: 5, attempts: claimed.maxAttempts } // Bull attempts fallback safety
            );
            logger.info('[DISPATCHER] Outbox job enqueued', { 
              emailJobId: claimed._id, 
              traceId: claimed.traceId,
              type: claimed.type,
              status: 'QUEUED'
            });
          } catch (bullErr) {
            logger.error('[DISPATCHER] Bull Add Failed', { 
              emailJobId: claimed._id, 
              error: bullErr.message 
            });
            // Revert status to PENDING so it can be picked up by the next sweep
            await EmailJob.updateOne(
              { _id: claimed._id },
              { $set: { status: 'PENDING' }, $unset: { queuedAt: 1 } }
            );
          }
        }
      }

      // 2. Safety sweep: Recover jobs stuck in QUEUED for more than 5 minutes
      // (This guards against Bull dropping jobs or dispatcher crashing mid-enqueue)
      const stuckJobs = await EmailJob.updateMany(
        { status: 'QUEUED', queuedAt: { $lte: new Date(Date.now() - 300000) } },
        { $set: { status: 'PENDING' }, $unset: { queuedAt: 1 } }
      );
      if (stuckJobs.modifiedCount > 0) {
        logger.warn(`[DISPATCHER] Recovered ${stuckJobs.modifiedCount} stuck QUEUED jobs back to PENDING`);
      }

    } catch (err) {
      logger.error('[DISPATCHER] Error during polling', { error: err.message });
    }
  }, 10000); // Poll every 10 seconds
  
  logger.info('Email Outbox Dispatcher started');
};

const stopOutboxDispatcher = () => {
  if (dispatcherInterval) {
    clearInterval(dispatcherInterval);
    dispatcherInterval = null;
    logger.info('Email Outbox Dispatcher stopped');
  }
};

module.exports = { startOutboxDispatcher, stopOutboxDispatcher };
