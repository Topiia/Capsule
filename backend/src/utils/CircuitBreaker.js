const logger = require('../config/logger');

class CircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.failureThreshold = options.failureThreshold || 3; // Failures before opening
    this.resetTimeout = options.resetTimeout || 10000; // Time in ms to wait before trying again
    this.fallback = options.fallback || (() => Promise.resolve(null));

    this.failures = 0;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF-OPEN
    this.nextAttempt = Date.now();
  }

  async execute(action) {
    if (this.state === 'OPEN') {
      if (Date.now() > this.nextAttempt) {
        this.state = 'HALF-OPEN';
      } else {
        logger.warn(`CircuitBreaker '${this.name}' is OPEN. Using fallback.`);
        return this.fallback();
      }
    }

    try {
      const result = await action();
      this.success();
      return result;
    } catch (error) {
      return this.failure(error);
    }
  }

  success() {
    this.failures = 0;
    this.state = 'CLOSED';
    if (this.state === 'HALF-OPEN') {
      logger.info(`CircuitBreaker '${this.name}' closed.`);
    }
  }

  async failure(error) {
    this.failures += 1;
    logger.error(`CircuitBreaker '${this.name}' failure (${this.failures}/${this.failureThreshold}): ${error.message}`);

    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.resetTimeout;
      logger.warn(`CircuitBreaker '${this.name}' opened.`);
    }

    return this.fallback(error);
  }
}

module.exports = CircuitBreaker;
