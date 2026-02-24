const { createModerationQueue } = require('../queues/moderationQueue');
const moderationService = require('../modules/moderation/moderation.service');
const logger = require('../config/logger');

module.exports = {
  start: () => {
    const queue = createModerationQueue();
    if (!queue) return;

    logger.info('Moderation worker started listening for jobs');

    // Process jobs from the queue
    queue.process(async (job) => {
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
  },
};
