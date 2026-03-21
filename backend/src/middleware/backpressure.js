const { rejectRequest } = require('../utils/rejectRequest');
const metrics = require('../config/metrics');

const WINDOW_MS = 1000;
const MAX_REQ_PER_WINDOW = 100;
const MAX_CONCURRENCY = 50;

let requestTimestamps = [];
let activeRequests = 0;

const HIGH_PRIORITY_ROUTES = [
  '/api/auth/login',
  '/api/auth/refresh',
];

function backpressureMiddleware(req, res, next) {
  const now = Date.now();
  requestTimestamps = requestTimestamps.filter((t) => now - t < WINDOW_MS);
  requestTimestamps.push(now);

  const isHighPriority = HIGH_PRIORITY_ROUTES.includes(req.path);

  if (req.systemContext && req.systemContext.degraded) {
    if (activeRequests > MAX_CONCURRENCY || requestTimestamps.length > MAX_REQ_PER_WINDOW) {
      if (isHighPriority) {
        // High priority routes allowed but tracked separately
        metrics.increment('activePriorityRequests');
      } else {
        metrics.increment('rejectedRequests');
        return rejectRequest(res);
      }
    }
  }

  activeRequests += 1;
  metrics.increment('activeRequests');

  res.on('finish', () => {
    activeRequests -= 1;
    // Track dynamically without getting negative if it was bypassed previously
    metrics.increment('activeRequests', -1);
  });

  // also handle socket close as completion
  res.on('close', () => {
    if (!res.writableEnded) { // if not finished
      activeRequests -= 1;
      metrics.increment('activeRequests', -1);
    }
  });

  return next();
}

module.exports = backpressureMiddleware;
