const Bull = require('bull');
const { redisConfig } = require('../config/queue.config');

const moderationQueue = new Bull('moderation-queue', {
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

module.exports = moderationQueue;
