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
 *   const { emailCircuit, safeCall } = require('./circuitBreaker');
 *   const result = await safeCall(emailCircuit, () => resend.emails.send(payload), fallbackFn);
 */

const logger = require('./logger');

/**
 * Executes a function through the circuit, failing over cleanly if it's OPEN.
 * @param {object} circuit
 * @param {() => Promise<any>} fn
 * @param {() => Promise<any> | any} fallback
 */
async function safeCall(circuit, fn, fallback) {
  try {
    return await circuit.fire(fn);
  } catch (err) {
    if (circuit.isOpen()) {
      return fallback();
    }
    throw err;
  }
}

/**
 * Standard Circuit Breaker Factory
 * @param {string} name        — identifier for logging
 * @param {object} config
 * @param {number} config.timeout            — ms before call times out
 * @param {number} config.failureThreshold   — consecutive failures before opening
 * @param {number} config.cooldown           — ms before moving to HALF_OPEN
 */
function createCircuit(name, config) {
  const timeoutMs = config.timeout || 10000;
  const threshold = config.failureThreshold || 5;
  const cooldownMs = config.cooldown || 30000;
  const recoveryThreshold = config.recoveryThreshold || 3;

  let failures = 0;
  let state = 'CLOSED'; // CLOSED | OPEN | HALF_OPEN
  let openedAt = null;
  let consecutiveSuccesses = 0;

  return {
    get state() { return state; },
    get failures() { return failures; },
    isOpen() { return state === 'OPEN' && (Date.now() - openedAt < cooldownMs); },

    /**
     * Execute `fn` through the circuit breaker with a timeout race.
     * @param {() => Promise<any>} fn
     * @returns {Promise<any>}
     */
    async fire(fn) {
      if (this.isOpen()) {
        logger.warn(`[CIRCUIT:${name}] OPEN — fast-failing (cooldown: ${Math.round((cooldownMs - (Date.now() - openedAt)) / 1000)}s left)`);
        const err = new Error(`[CIRCUIT:${name}] Circuit open — external API unavailable`);
        err.circuitOpen = true;
        throw err;
      }

      if (state === 'OPEN') {
        // Cooldown has elapsed, probe recovery
        state = 'HALF_OPEN';
        consecutiveSuccesses = 0;
        logger.info(`[CIRCUIT:${name}] Moving to HALF_OPEN — probing recovery`);
      }

      try {
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('API timeout')), timeoutMs);
        });

        const result = await Promise.race([fn(), timeoutPromise]);

        // Success logic with recovery gate
        if (state === 'HALF_OPEN') {
          consecutiveSuccesses += 1;
          if (consecutiveSuccesses >= recoveryThreshold) {
            logger.info(`[CIRCUIT:${name}] Recovered after ${consecutiveSuccesses} successes`);
            failures = 0;
            state = 'CLOSED';
            consecutiveSuccesses = 0;
            try {
              // Only report true after FULL recovery gate success
              // eslint-disable-next-line global-require
              require('./systemState').updateState(name, true);
            } catch (_) { /* */ }
          } else {
            logger.info(`[CIRCUIT:${name}] HALF_OPEN probe success ${consecutiveSuccesses}/${recoveryThreshold}`);
          }
        } else {
          // Success while already CLOSED
          if (failures > 0) {
            logger.info(`[CIRCUIT:${name}] Recovered — resetting partial failure count (was ${failures})`);
          }
          failures = 0;
          state = 'CLOSED';
        }
        return result;
      } catch (err) {
        // Skip if the error itself came from the circuit (avoid double-counting)
        if (err.circuitOpen) throw err;

        if (state === 'HALF_OPEN') {
          state = 'OPEN';
          openedAt = Date.now();
          consecutiveSuccesses = 0;
          logger.warn(`[CIRCUIT:${name}] Probe failed — returning to OPEN for ${cooldownMs / 1000}s`);
        } else {
          failures += 1;
          logger.warn(`[CIRCUIT:${name}] Failure ${failures}/${threshold}: ${err.message}`);

          if (failures >= threshold) {
            state = 'OPEN';
            openedAt = Date.now();
            logger.error(
              `[CIRCUIT:${name}] Threshold reached — circuit OPEN for ${cooldownMs / 1000}s`,
              { failures, threshold, cooldownMs },
            );

            // Sync OPEN state one-way immediately into systemState
            try {
              // eslint-disable-next-line global-require
              require('./metrics').increment('circuitBreakerOpenEvents');
              // eslint-disable-next-line global-require
              require('./systemState').updateState(name, false);
            } catch (_) { /* metrics optional */ }
          }
        }
        throw err;
      }
    },

    /** Manually reset the circuit (useful in tests). */
    reset() {
      failures = 0;
      state = 'CLOSED';
      openedAt = null;
      consecutiveSuccesses = 0;
    },
  };
}

// ── Global Pre-configured Circuits ───────────────────────────────────────────
const emailCircuit = createCircuit('resend', {
  timeout: 10000,
  failureThreshold: 5,
  cooldown: 30000, // 30s
});

const moderationCircuit = createCircuit('groq-ai', {
  timeout: 15000,
  failureThreshold: 3,
  cooldown: 60000, // 60s
});

const cloudinaryCircuit = createCircuit('cloudinary', {
  timeout: 10000,
  failureThreshold: 5,
  cooldown: 30000, // 30s
});

module.exports = {
  createCircuit,
  safeCall,
  emailCircuit,
  moderationCircuit,
  cloudinaryCircuit,
};
