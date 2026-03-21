/**
 * circuitBreaker.js — Lightweight circuit breaker for external API calls
 *
 * Prevents repeated calls to a failing external API (e.g. Resend) from
 * accumulating latency and exhausting queue jobs.
 *
 * States:
 *   CLOSED   — normal operation, calls pass through
 *   OPEN     — failure threshold exceeded, calls fast-fail with an error
 *   HALF_OPEN — one probe call allowed after cooldown to test recovery
 *
 * Usage:
 *   const cb = createCircuitBreaker('resend', { threshold: 5, cooldownMs: 30000 });
 *   const result = await cb.call(() => resend.emails.send(payload));
 */

const logger = require('./logger');

/**
 * @param {string} name        — identifier for logging
 * @param {object} [opts]
 * @param {number} [opts.threshold=5]       — consecutive failures before opening
 * @param {number} [opts.cooldownMs=30000]  — ms before moving to HALF_OPEN
 */
function createCircuitBreaker(name, opts = {}) {
  const threshold = opts.threshold ?? 5;
  const cooldownMs = opts.cooldownMs ?? 30000;

  let failures = 0;
  let state = 'CLOSED'; // CLOSED | OPEN | HALF_OPEN
  let openedAt = null;

  return {
    get state() { return state; },
    get failures() { return failures; },

    /**
     * Execute `fn` through the circuit breaker.
     * @param {() => Promise<any>} fn
     * @returns {Promise<any>}
     * @throws {Error} if circuit is OPEN or fn throws
     */
    async call(fn) {
      // ── OPEN: check if cooldown has elapsed ─────────────────────────────────
      if (state === 'OPEN') {
        if (Date.now() - openedAt < cooldownMs) {
          logger.warn(`[CIRCUIT:${name}] OPEN — fast-failing (cooldown: ${Math.round((cooldownMs - (Date.now() - openedAt)) / 1000)}s left)`);
          const err = new Error(`[CIRCUIT:${name}] Circuit open — external API unavailable`);
          err.circuitOpen = true;
          throw err;
        }
        state = 'HALF_OPEN';
        logger.info(`[CIRCUIT:${name}] Moving to HALF_OPEN — probing recovery`);
      }

      // ── CLOSED / HALF_OPEN: attempt the call ──────────────────────────────
      try {
        const result = await fn();

        // Success: reset
        if (failures > 0 || state !== 'CLOSED') {
          logger.info(`[CIRCUIT:${name}] Recovered — resetting failure count (was ${failures})`);
        }
        failures = 0;
        state = 'CLOSED';
        return result;
      } catch (err) {
        // Skip if the error itself came from the circuit (avoid double-counting)
        if (err.circuitOpen) throw err;

        failures += 1;
        logger.warn(`[CIRCUIT:${name}] Failure ${failures}/${threshold}: ${err.message}`);

        if (failures >= threshold) {
          state = 'OPEN';
          openedAt = Date.now();
          logger.error(
            `[CIRCUIT:${name}] Threshold reached — circuit OPEN for ${cooldownMs / 1000}s`,
            { failures, threshold, cooldownMs },
          );
          // Increment metrics counter (lazy require avoids circular dep)
          try {
            // eslint-disable-next-line global-require
            require('./metrics').increment('circuitBreakerOpen');
          } catch (_) { /* metrics optional */ }
        }
        throw err;
      }
    },

    /** Manually reset the circuit (useful in tests). */
    reset() {
      failures = 0;
      state = 'CLOSED';
      openedAt = null;
    },
  };
}

module.exports = { createCircuitBreaker };
