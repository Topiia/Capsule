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

const systemState = {
  // Set to true once Redis connects successfully at startup
  redis: false,

  // Set to true once Bull queues are initialised successfully
  queue: false,

  // Computed flag: true if any non-critical subsystem is down
  get degraded() {
    return !this.redis || !this.queue;
  },

  /**
   * Update state after startup and log a single-line summary.
   * @param {{ redis: boolean, queue: boolean }} flags
   */
  set(flags) {
    if (typeof flags.redis === 'boolean') this.redis = flags.redis;
    if (typeof flags.queue === 'boolean') this.queue = flags.queue;
  },
};

module.exports = systemState;
