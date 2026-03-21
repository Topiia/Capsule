/**
 * env.js — Centralized environment variable config with safe fallbacks
 *
 * IMPORTANT: All exports are FUNCTIONS or GETTERS so they read process.env
 * at call time, not at import time. This ensures that test files which set
 * process.env.JWT_SECRET in beforeAll() are honoured correctly.
 *
 * Tests can run with ZERO .env file using these safe placeholder values.
 */

module.exports = {
  get NODE_ENV() { return process.env.NODE_ENV || 'test'; },
  get JWT_SECRET() {
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET must be defined in environment variables');
    }
    return process.env.JWT_SECRET;
  },
  get JWT_REFRESH_SECRET() {
    if (!process.env.JWT_REFRESH_SECRET) {
      throw new Error('JWT_REFRESH_SECRET must be defined in environment variables');
    }
    return process.env.JWT_REFRESH_SECRET;
  },
  get JWT_EXPIRE() { return process.env.JWT_EXPIRE || '7d'; },
  get JWT_REFRESH_EXPIRE() { return process.env.JWT_REFRESH_EXPIRE || '30d'; },
  get EMAIL_ENABLED() { return this.NODE_ENV !== 'test'; },
  get REDIS_ENABLED() { return this.NODE_ENV !== 'test'; },
  validateEnv() {
    if (process.env.NODE_ENV === 'production') {
      const required = [
        'JWT_SECRET',
        'JWT_REFRESH_SECRET',
        'MONGODB_URI',
        'CLOUDINARY_API_SECRET',
        'CORS_ORIGINS',
        'FRONTEND_URL',
        'REDIS_URL',
        'RESEND_API_KEY',
      ];
      const missing = required.filter((req) => !process.env[req]);
      if (missing.length > 0) {
        // Log clearly but do NOT exit — let the server start so health checks work
        // and operators can read logs on Render/Railway dashboards.
        missing.forEach((req) => console.error(`[ENV] MISSING required variable: ${req}`));
        console.error('[ENV] Server may not function correctly. Set the above variables in your hosting dashboard.');
      }
    }
  },
};
