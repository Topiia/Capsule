const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

/**
 * OBSERVABILITY: Structured Logging Configuration
 *
 * Production-grade logging with Winston:
 * - Structured JSON format for log aggregation services
 * - Daily log rotation with size limits
 * - Separate error log stream
 * - Environment-aware log levels
 * - Correlation ID support for request tracing
 */

// Define custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp', 'label'] }),
  winston.format.json(),
);

// Console format for development (human-readable)
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({
    timestamp, level, message, correlationId, ...meta
  }) => {
    const corrId = correlationId ? `[${correlationId.slice(0, 8)}]` : '';
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
    return `${timestamp} ${level} ${corrId} ${message} ${metaStr}`;
  }),
);

// Transport for errors (separate file)
const errorTransport = new DailyRotateFile({
  filename: path.join('logs', 'error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  level: 'error',
  maxSize: '20m',
  maxFiles: '14d',
  format: logFormat,
  handleExceptions: true,
  handleRejections: true,
});

// Transport for all logs
const combinedTransport = new DailyRotateFile({
  filename: path.join('logs', 'combined-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '14d',
  format: logFormat,
});

// Transport for audit/security events (never deleted)
const auditTransport = new DailyRotateFile({
  filename: path.join('logs', 'audit-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '50m',
  maxFiles: '365d', // Keep audit logs for 1 year
  format: logFormat,
  level: 'info',
});

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  format: logFormat,
  defaultMeta: {
    service: 'vlogsphere-api',
    environment: process.env.NODE_ENV || 'development',
  },
  transports: [
    errorTransport,
    combinedTransport,
  ],
  exitOnError: false,
});

// Add console transport in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat,
    handleExceptions: true,
    handleRejections: true,
  }));
}

// Helper method to log with correlation ID
logger.withCorrelation = (correlationId) => logger.child({ correlationId });

// Helper method to log security events (goes to audit log)
logger.security = (message, meta = {}) => {
  auditTransport.log('info', message, { ...meta, eventType: 'security' });
};

// Helper method to log audit events
logger.audit = (message, meta = {}) => {
  auditTransport.log('info', message, { ...meta, eventType: 'audit' });
};

// Error serializer for better error logging
logger.logError = (error, context = {}) => {
  logger.error(error.message, {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: error.code,
    },
    ...context,
  });
};

// Create logs directory if it doesn't exist
const fs = require('fs');

const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Log unhandled errors
logger.on('error', (err) => {
  console.error('Logger error:', err);
});

module.exports = logger;
