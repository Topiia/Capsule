/**
 * systemContext.js — Middleware to snapshot system state per request
 * and inject response mode visibility.
 */

const systemState = require('../config/systemState');

function systemContextMiddleware(req, res, next) {
  // Snapshot system state for the duration of this request
  req.systemContext = Object.freeze({
    redis: systemState.redis,
    queue: systemState.queue,
    degraded: systemState.degraded,
  });

  // Safe response mode injection (NO BREAKAGE)
  const originalJson = res.json.bind(res);

  res.json = (data) => {
    // Only inject if it's an object and we haven't injected yet.
    // Do not touch error middleware responses (usually checking success: false or HTTP status).
    // The requirement is to inject mode into all standard API responses.
    if (
      data
      && typeof data === 'object'
      && !data.__modeInjected
      && res.statusCode < 400
    ) {
      // eslint-disable-next-line no-param-reassign
      data.mode = req.systemContext.degraded ? 'degraded' : 'normal';

      // Use Object.defineProperty so __modeInjected doesn't show up in the final JSON string output
      Object.defineProperty(data, '__modeInjected', {
        value: true,
        enumerable: false,
        writable: false,
      });
    }
    return originalJson(data);
  };

  next();
}

module.exports = systemContextMiddleware;
