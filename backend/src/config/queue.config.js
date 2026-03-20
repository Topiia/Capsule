const Joi = require('joi');
const Queue = require('bull');
const { createRedisClient, createRedisSubscriber, createIsolatedRedisClient } = require('./redis');
const logger = require('./logger');

// Validate Queue Config
const envSchema = Joi.object({
  REDIS_HOST: Joi.string().default('127.0.0.1'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').optional(),
}).unknown();

const { error, value: env } = envSchema.validate(process.env);

if (error) {
  throw new Error(`Queue Config Error: ${error.message}`);
}

const redisConfig = {
  redis: {
    port: env.REDIS_PORT,
    host: env.REDIS_HOST,
    password: env.REDIS_PASSWORD || undefined,
  },
};

/**
 * Centralized Factory for Bull Queues.
 * Applies Phase 2 optimizations: safe locking, stall config, and connection multiplexing.
 */
const createQueue = (name, customOptions = {}) => {
  if (process.env.NODE_ENV === 'test') { return null; }

  const sharedClient = createRedisClient();
  const sharedSubscriber = createRedisSubscriber();

  const options = {
    createClient: (type) => {
      switch (type) {
        case 'client':
          return sharedClient;
        case 'subscriber':
          return sharedSubscriber;
        case 'bclient':
          // MUST be isolated for blocking commands
          return createIsolatedRedisClient();
        default:
          return createIsolatedRedisClient();
      }
    },
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
      removeOnFail: false,
      ...(customOptions.defaultJobOptions || {}),
    },
    settings: {
      // Phase 7: 120s — one check per lock lifetime. Saves ~650K cmds/month.
      stalledInterval: 120000,
      // Phase 7: 60s — half-frequency watchdog. Saves ~1.1M cmds/month.
      guardInterval: 60000,
      lockDuration: 120000, // 120s (conservative default)
      lockRenewTime: 60000, // lockDuration / 2
      maxStalledCount: 1,
      ...(customOptions.settings || {}),
    },
    ...customOptions,
  };

  const queue = new Queue(name, options);

  // Safety Guards: Catch and log stalled job spikes or errors
  queue.on('stalled', (job) => {
    logger.warn(`[QUEUE:${name}] Job stalled (failed to renew lock)`, { jobId: job.id });
  });

  return queue;
};

module.exports = {
  redisConfig,
  createQueue,
};
