const { randomUUID } = require('crypto');
const logger = require('../config/logger');

/**
 * OBSERVABILITY: Request Correlation Middleware
 *
 * Assigns a unique ID to each request for distributed tracing.
 * Correlation IDs allow tracking requests across:
 * - Multiple log entries
 * - Async operations
 * - Service boundaries
 * - Error reports
 */

/**
 * Correlation ID middleware
 * Generates or extracts correlation ID from headers and attaches to request
 */
exports.correlationMiddleware = (req, res, next) => {
  // Extract or generate correlation ID
  const correlationId = req.headers['x-correlation-id']
    || req.headers['x-request-id']
    || randomUUID();

  // Attach to request object
  req.correlationId = correlationId;

  // Set response header for client tracking
  res.setHeader('X-Correlation-ID', correlationId);

  // Create child logger with correlation ID
  req.logger = logger.withCorrelation(correlationId);

  // Log incoming request
  req.logger.info('Incoming request', {
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });

  // Track request start time for performance monitoring
  req.startTime = Date.now();

  // Log response on finish
  res.on('finish', () => {
    const duration = Date.now() - req.startTime;
    const logLevel = res.statusCode >= 400 ? 'warn' : 'info';

    req.logger.log(logLevel, 'Request completed', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userId: req.user?.id,
    });
  });

  next();
};

/**
 * Extract client IP address from request
 * Handles proxied requests (X-Forwarded-For)
 */
exports.getClientIP = (req) => (
  req.headers['x-forwarded-for']?.split(',')[0]?.trim()
  || req.headers['x-real-ip']
  || req.connection?.remoteAddress
  || req.socket?.remoteAddress
  || 'unknown'
);

module.exports = exports;
