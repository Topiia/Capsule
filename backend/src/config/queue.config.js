const Joi = require('joi');
const Queue = require('bull');
const IORedis = require('ioredis');
const logger = require('./logger');

// Validate Queue Config
const envSchema = Joi.object({
  REDIS_HOST: Joi.string().default('127.0.0.1'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').optional(),
}).unknown();

const { error, value: env } = envSchema.validate(process.env);

if (error) {
  // Log but do not throw — all fields have defaults, this should never fail.
  // A throw here crashes the process at require() time before any error handler is attached.
  console.error('[QUEUE CONFIG] Joi validation warning:', error.message);
}

const redisConfig = {
  redis: {
    port: (env || {}).REDIS_PORT || 6379,
    host: (env || {}).REDIS_HOST || '127.0.0.1',
    password: (env || {}).REDIS_PASSWORD || undefined,
  },
};

// Multiplexed cached clients for Phase 2/3 shared optimization
let sharedClient = null;
let sharedSubscriber = null;

const createClient = (type) => {
  const connectionOpts = process.env.REDIS_URL || {
    host: (env || {}).REDIS_HOST || '127.0.0.1',
    port: (env || {}).REDIS_PORT || 6379,
    password: (env || {}).REDIS_PASSWORD || undefined,
  };

  // Helper to safely merge standard options
  const mergeOpts = (extraOpts) => {
    if (typeof connectionOpts === 'string') {
      return [connectionOpts, extraOpts]; // new IORedis(url, options)
    }
    return [{ ...connectionOpts, ...extraOpts }]; // new IORedis(options)
  };

  switch (type) {
    case 'client':
      if (!sharedClient) {
        // The main client should retain retries for resilience.
        // DO NOT use maxRetriesPerRequest: null here.
        sharedClient = new IORedis(...mergeOpts({}));
      }
      return sharedClient;

    case 'subscriber':
      if (!sharedSubscriber) {
        sharedSubscriber = new IORedis(...mergeOpts({
          maxRetriesPerRequest: null,
          enableReadyCheck: false, // REQUIRED for Bull pub/sub
        }));
      }
      return sharedSubscriber;

    case 'bclient':
      // MUST be isolated; one per queue for blocking commands
      return new IORedis(...mergeOpts({
        maxRetriesPerRequest: null, // REQUIRED for Bull blocking
        enableReadyCheck: false, // REQUIRED for Bull blocking
      }));

    default:
      throw new Error(`Unknown Redis client type: ${type}`);
  }
};

/**
 * Centralized Factory for Bull Queues.
 * Applies Phase 2 optimizations: safe locking, stall config, and connection multiplexing.
 */
const createQueue = (name, customOptions = {}) => {
  if (process.env.NODE_ENV === 'test') { return null; }

  const options = {
    createClient,
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
