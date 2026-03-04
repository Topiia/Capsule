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
  get JWT_SECRET() { return process.env.JWT_SECRET || (this.NODE_ENV !== 'production' ? 'testsecret' : undefined); },
  get JWT_REFRESH_SECRET() { return process.env.JWT_REFRESH_SECRET || (this.NODE_ENV !== 'production' ? 'refreshsecret' : undefined); },
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
      ];
      required.forEach((req) => {
        if (!process.env[req]) {
          console.error(`FATAL CONFIG ERROR: ${req} missing`);
          process.exit(1);
        }
      });
    }
  },
};
