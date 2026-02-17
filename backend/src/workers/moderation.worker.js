const moderationQueue = require('../queues/moderationQueue');
const moderationService = require('../modules/moderation/moderation.service');
const logger = require('../config/logger');

// Process jobs from the queue
moderationQueue.process(async (job) => {
  const { vlogId } = job.data;

  if (!vlogId) {
    logger.error('Moderation job missing vlogId');
    return;
  }

  try {
    logger.info(`Processing moderation job for vlog: ${vlogId}`);
    await moderationService.moderateVlog(vlogId);
    logger.info(`Moderation job completed for vlog: ${vlogId}`);
  } catch (error) {
    logger.error(`Moderation job failed for vlog: ${vlogId}`, error);
    // Bull will automatically handle retries based on queue config
    throw error;
  }
});

module.exports = {
  start: () => {
    logger.info('Moderation worker started listening for jobs');
  },
};
