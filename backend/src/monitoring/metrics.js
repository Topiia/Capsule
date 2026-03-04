const promClient = require('prom-client');

// Initialize default metrics (e.g., memory, CPU)
const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

// Define custom counters
const requestsTotal = new promClient.Counter({
  name: 'requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

const rateLimitTriggeredTotal = new promClient.Counter({
  name: 'rate_limit_triggered_total',
  help: 'Total number of rate limit triggered events',
  labelNames: ['url', 'ip'],
  registers: [register],
});

const slowdownTriggeredTotal = new promClient.Counter({
  name: 'slowdown_triggered_total',
  help: 'Total number of progressive slowdown triggered events',
  labelNames: ['url', 'ip'],
  registers: [register],
});

const redisLimiterCallsTotal = new promClient.Counter({
  name: 'redis_limiter_calls_total',
  help: 'Total number of explicit Redis rate limiter calls',
  labelNames: ['key'],
  registers: [register],
});

// Express middleware to record request metrics
const metricsMiddleware = (req, res, next) => {
  res.on('finish', () => {
    // Only count API routes to avoid recording static assets or 404 spam.
    // Utilize req.route.path if available to squash dynamic variables.
    const routePattern = req.route ? req.route.path : req.baseUrl + req.path;

    if (routePattern === '/metrics') {
      return;
    }

    requestsTotal.inc({
      method: req.method,
      route: routePattern,
      status_code: res.statusCode,
    });
  });
  next();
};

const getMetrics = async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.status(200).send(await register.metrics());
  } catch (error) {
    res.status(500).send(error.toString());
  }
};

module.exports = {
  requestsTotal,
  rateLimitTriggeredTotal,
  slowdownTriggeredTotal,
  redisLimiterCallsTotal,
  metricsMiddleware,
  getMetrics,
};
