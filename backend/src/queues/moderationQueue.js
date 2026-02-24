const Bull = require('bull');
const { redisConfig } = require('../config/queue.config');

let moderationQueue = null;

function createModerationQueue() {
  if (process.env.NODE_ENV === 'test') {
    return null; // Never connect in test environment
  }

  if (moderationQueue) return moderationQueue;

  moderationQueue = new Bull('moderation-queue', {
    ...redisConfig,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000, // 1s, 2s, 4s
      },
      removeOnComplete: 100, // Keep last 100 completed jobs
      removeOnFail: 500, // Keep last 500 failed jobs for debugging
    },
  });

  return moderationQueue;
}

module.exports = {
  createModerationQueue,
};
