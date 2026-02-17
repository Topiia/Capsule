const Joi = require('joi');

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

module.exports = {
  redisConfig,
};
