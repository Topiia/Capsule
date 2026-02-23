const Queue = require('bull');
const cloudinary = require('../config/cloudinary');
const logger = require('../config/logger');

/**
 * PERFORMANCE: Account Deletion Queue
 *
 * Async Cloudinary asset cleanup using Bull queue:
 * - Prevents long-running Cloudinary API calls from blocking HTTP requests
 * - Automatic retry with exponential backoff
 * - Job persistence (survives server restarts)
 * - Batch deletion for efficiency
 */

// Create account deletion queue (graceful fallback if Redis unavailable)
let accountDeletionQueue = null;
let isQueueAvailable = false;

try {
  accountDeletionQueue = new Queue('accountDeletion', {
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
      timeout: 60000, // 60 second timeout per job
    },
  });

  isQueueAvailable = true;
  logger.info('Bull account deletion queue initialized successfully');
  if (process.env.NODE_ENV !== 'test') {
    console.log('[INFO] Bull account deletion queue ready');
  }
} catch (error) {
  isQueueAvailable = false;
  accountDeletionQueue = null;
  logger.warn(
    'Bull account deletion queue unavailable - assets may not be cleaned up',
    {
      error: error.message,
    },
  );
  if (process.env.NODE_ENV !== 'test') {
    console.warn('[WARN] Bull account deletion queue unavailable');
  }
}

// Process asset cleanup jobs (only if queue is available)
if (isQueueAvailable && accountDeletionQueue) {
  accountDeletionQueue.process(async (job) => {
    const { userId, publicIds } = job.data;

    logger.info('Processing Cloudinary asset cleanup job', {
      jobId: job.id,
      userId,
      assetCount: publicIds.length,
      attempt: job.attemptsMade + 1,
    });

    if (!publicIds || publicIds.length === 0) {
      logger.warn('No assets to delete', { jobId: job.id, userId });
      return { success: true, deleted: 0 };
    }

    try {
      // Batch delete assets from Cloudinary
      // Note: Cloudinary allows up to 100 assets per request
      const batchSize = 100;
      let totalDeleted = 0;
      const errors = [];

      // Process batches sequentially to avoid rate limiting
      // eslint-disable-next-line no-plusplus
      for (let i = 0; i < publicIds.length; i += batchSize) {
        const batch = publicIds.slice(i, i + batchSize);

        try {
          // eslint-disable-next-line no-await-in-loop
          const result = await cloudinary.api.delete_resources(batch, {
            resource_type: 'image',
          });

          // Count successful deletions
          const deleted = Object.values(result.deleted || {}).filter(
            (status) => status === 'deleted',
          ).length;

          totalDeleted += deleted;

          logger.debug('Cloudinary batch deletion completed', {
            jobId: job.id,
            userId,
            batchSize: batch.length,
            deleted,
          });
        } catch (batchError) {
          // Log batch error but continue with next batch
          logger.error('Cloudinary batch deletion failed', {
            jobId: job.id,
            userId,
            batchSize: batch.length,
            error: batchError.message,
          });
          errors.push({
            batch: i / batchSize + 1,
            error: batchError.message,
          });
        }
      }

      logger.info('Cloudinary asset cleanup completed', {
        jobId: job.id,
        userId,
        totalAssets: publicIds.length,
        deleted: totalDeleted,
        errors: errors.length,
      });

      return {
        success: true,
        deleted: totalDeleted,
        total: publicIds.length,
        errors,
      };
    } catch (error) {
      logger.error('Cloudinary asset cleanup failed', {
        jobId: job.id,
        userId,
        assetCount: publicIds.length,
        error: error.message,
        attempt: job.attemptsMade + 1,
      });

      throw error; // Re-throw to trigger retry
    }
  });
}

// Queue event handlers (only attach if queue is available)
if (isQueueAvailable && accountDeletionQueue) {
  accountDeletionQueue.on('completed', (job, result) => {
    logger.info('Asset cleanup job completed', {
      jobId: job.id,
      userId: job.data.userId,
      result,
    });
  });

  accountDeletionQueue.on('failed', (job, err) => {
    logger.error('Asset cleanup job failed (all retries exhausted)', {
      jobId: job.id,
      userId: job.data.userId,
      assetCount: job.data.publicIds.length,
      error: err.message,
      attempts: job.attemptsMade,
    });
  });

  accountDeletionQueue.on('stalled', (job) => {
    logger.warn('Asset cleanup job stalled', {
      jobId: job.id,
      userId: job.data.userId,
    });
  });
}

/**
 * Queue Cloudinary asset cleanup for deleted user
 *
 * @param {string} userId - User ID
 * @param {string[]} publicIds - Array of Cloudinary public IDs
 * @param {number} priority - Job priority (1-10, higher = more important)
 * @returns {Promise<object>} - Job object or direct result
 */
exports.queueAssetCleanup = async (userId, publicIds, priority = 5) => {
  // Fallback to direct deletion if queue unavailable
  if (!isQueueAvailable || !accountDeletionQueue) {
    logger.warn('Queue unavailable - attempting direct Cloudinary cleanup', {
      userId,
      assetCount: publicIds.length,
    });

    try {
      // Direct cleanup without queue
      const batchSize = 100;
      let totalDeleted = 0;

      // Process batches sequentially
      // eslint-disable-next-line no-plusplus
      for (let i = 0; i < publicIds.length; i += batchSize) {
        const batch = publicIds.slice(i, i + batchSize);
        // eslint-disable-next-line no-await-in-loop
        const result = await cloudinary.api.delete_resources(batch, {
          resource_type: 'image',
        });

        const deleted = Object.values(result.deleted || {}).filter(
          (status) => status === 'deleted',
        ).length;
        totalDeleted += deleted;
      }

      logger.info('Direct Cloudinary cleanup completed (no queue)', {
        userId,
        deleted: totalDeleted,
        total: publicIds.length,
      });

      return { success: true, direct: true, deleted: totalDeleted };
    } catch (error) {
      logger.error('Direct Cloudinary cleanup failed', {
        userId,
        assetCount: publicIds.length,
        error: error.message,
      });
      throw error;
    }
  }

  // Queue cleanup normally
  try {
    const job = await accountDeletionQueue.add(
      { userId, publicIds },
      { priority },
    );

    logger.info('Asset cleanup queued', {
      jobId: job.id,
      userId,
      assetCount: publicIds.length,
      priority,
    });

    return job;
  } catch (error) {
    logger.error('Failed to queue asset cleanup', {
      userId,
      assetCount: publicIds.length,
      error: error.message,
    });
    throw error;
  }
};

/**
 * Get queue statistics
 */
exports.getQueueStats = async () => {
  if (!isQueueAvailable || !accountDeletionQueue) {
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
    accountDeletionQueue.getWaitingCount(),
    accountDeletionQueue.getActiveCount(),
    accountDeletionQueue.getCompletedCount(),
    accountDeletionQueue.getFailedCount(),
    accountDeletionQueue.getDelayedCount(),
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
  if (!isQueueAvailable || !accountDeletionQueue) {
    logger.debug('Account deletion queue cleanup skipped - queue unavailable');
    return;
  }

  await accountDeletionQueue.clean(24 * 60 * 60 * 1000, 'completed'); // 1 day
  await accountDeletionQueue.clean(7 * 24 * 60 * 60 * 1000, 'failed'); // 7 days
  logger.info('Account deletion queue cleaned');
};

// Graceful shutdown
process.on('SIGTERM', async () => {
  if (isQueueAvailable && accountDeletionQueue) {
    await accountDeletionQueue.close();
    logger.info('Account deletion queue closed on SIGTERM');
  }
});

module.exports = exports;
