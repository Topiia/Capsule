/**
 * systemState.js — Global system health flags
 *
 * Single source of truth for which subsystems are operational.
 * Set by server.js during startup; read by any module that needs
 * to make a degraded-mode decision.
 *
 * Import:
 *   const systemState = require('./config/systemState');
 */

const stateTimers = {
  redis: 0,
  queue: 0,
};

const systemState = {
  // Set to true once Redis connects successfully at startup
  redis: false,

  // Set to true once Bull queues are initialised successfully
  queue: false,

  // Computed flag: true if any non-critical subsystem is down
  get degraded() {
    return !this.redis || !this.queue;
  },

  updateState(key, value) {
    const now = Date.now();
    const isRecovering = value === true;

    // Asymmetric cooldown: Fast fail (5s window), Slow gradual recovery (30s window)
    const cooldownMs = isRecovering ? 30000 : 5000;

    if (now - (stateTimers[key] || 0) < cooldownMs) {
      return;
    }

    if (this[key] !== value) {
      console.log(`[STATE] ${key.toUpperCase()}: ${this[key] ? 'UP' : 'DOWN'} → ${value ? 'UP' : 'DOWN'}`);
      this[key] = value;
      stateTimers[key] = now;
    }
  },

  /**
   * Update state after startup and log a single-line summary.
   * @param {{ redis: boolean, queue: boolean }} flags
   */
  set(flags) {
    if (typeof flags.redis === 'boolean') {
      // Allow initial set without waiting 5s if changing from false -> true
      if (!this.redis && flags.redis && stateTimers.redis === 0) {
        console.log('[STATE] REDIS: DOWN → UP');
        this.redis = true;
        stateTimers.redis = Date.now();
      } else {
        this.updateState('redis', flags.redis);
      }
    }

    if (typeof flags.queue === 'boolean') {
      if (!this.queue && flags.queue && stateTimers.queue === 0) {
        console.log('[STATE] QUEUE: DOWN → UP');
        this.queue = true;
        stateTimers.queue = Date.now();
      } else {
        this.updateState('queue', flags.queue);
      }
    }
  },
};

module.exports = systemState;
