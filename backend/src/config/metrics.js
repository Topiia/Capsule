/**
 * metrics.js — Lightweight in-process counter registry
 *
 * Tracks key operational counters to make degraded-mode behavior
 * measurable without requiring an external time-series DB.
 *
 * Counters are reset on process restart (intentional — this is a
 * per-instance operational view, not a long-term store).
 *
 * Access via /api/health/metrics (admin-only endpoint) or logs.
 *
 * Import:
 *   const metrics = require('./config/metrics');
 *   metrics.increment('emailFallback');
 *   metrics.snapshot(); // → { emailAsync: 0, emailFallback: 2, ... }
 */

const counters = {
  // emails routed through Bull queue
  emailAsync: 0,
  // emails sent via synchronous fallback
  emailFallback: 0,
  // jobs rejected by idempotency key (duplicate)
  idempotencyBlocked: 0,
  // idempotency check skipped (Redis down)
  idempotencySkipped: 0,
  // Redis operation errors caught in safe wrappers
  redisFailures: 0,
  // times Resend circuit breaker tripped
  circuitBreakerOpenEvents: 0,
  // Load shedding metrics
  rejectedRequests: 0,
  activeRequests: 0,
  activePriorityRequests: 0,
  activeSyncEmails: 0,
};

const metrics = {
  /**
   * Increment a counter by 1 (or by `amount`).
   * @param {keyof counters} key
   * @param {number} [amount=1]
   */
  increment(key, amount = 1) {
    if (Object.prototype.hasOwnProperty.call(counters, key)) {
      counters[key] += amount;
    }
  },

  /**
   * Return a shallow copy of all current counters.
   * @returns {object}
   */
  snapshot() {
    return { ...counters };
  },

  /**
   * Reset all counters to zero (useful for tests or rolling windows).
   */
  reset() {
    Object.keys(counters).forEach((k) => { counters[k] = 0; });
  },
};

module.exports = metrics;
