const logger = require('./logger');

/**
 * Centralized email configuration
 * All email-related config should be accessed through this module
 */

// Redis configuration (OPTIONAL - degrades gracefully)
const redis = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT, 10) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
};

// Resend API configuration (REQUIRED for email)
const resend = {
  apiKey: process.env.RESEND_API_KEY,
  fromEmail: process.env.FROM_EMAIL || 'onboarding@resend.dev',
  fromName: process.env.FROM_NAME || 'Capsule',
};

// Validate critical email configs
const validateEmailConfig = () => {
  if (!resend.apiKey) {
    logger.warn('RESEND_API_KEY not configured - email functionality disabled');
    return false;
  }
  return true;
};

// Check if Redis is configured (doesn't validate connectivity)
const isRedisConfigured = () => !!(redis.host && redis.port);

module.exports = {
  redis,
  resend,
  validateEmailConfig,
  isRedisConfigured,
};
