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
  // Getters so tests can override process.env after import
  get JWT_SECRET() {
    return process.env.JWT_SECRET || 'testsecret';
  },
  get JWT_REFRESH_SECRET() {
    return process.env.JWT_REFRESH_SECRET || 'refreshsecret';
  },
  get JWT_EXPIRE() {
    return process.env.JWT_EXPIRE || '7d';
  },
  get JWT_REFRESH_EXPIRE() {
    return process.env.JWT_REFRESH_EXPIRE || '30d';
  },
  get NODE_ENV() {
    return process.env.NODE_ENV || 'test';
  },
  // Feature flags — both disabled in test environment (evaluated at call time)
  get EMAIL_ENABLED() {
    return (process.env.NODE_ENV || 'test') !== 'test';
  },
  get REDIS_ENABLED() {
    return (process.env.NODE_ENV || 'test') !== 'test';
  },
};
