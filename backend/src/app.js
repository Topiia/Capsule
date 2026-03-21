/**
 * app.js — Pure Express application configuration
 *
 * This module ONLY configures and exports the Express app.
 * It NEVER calls process.exit(), app.listen(), or validates
 * production environment variables.
 *
 * Imported by:
 *   - server.js (production bootstrap)
 *   - Jest test files (no side-effects)
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const path = require('path');
const mongoose = require('mongoose');
const statusMonitor = process.env.NODE_ENV !== 'test' ? require('express-status-monitor') : null;

// OBSERVABILITY: Structured logging
const { correlationMiddleware } = require('./middleware/correlation');
const systemContextMiddleware = require('./middleware/systemContext');

// Import middleware
const errorHandler = require('./middleware/errorHandler');
const { createRedisClient } = require('./config/redis');
const mongoSanitize = require('./middleware/mongoSanitize');
const csrfProtection = require('./middleware/csrfProtection');
const isTrustedOrigin = require('./utils/trustedOrigin');
const backpressureMiddleware = require('./middleware/backpressure');

// OBSERVABILITY: Sentry — loaded from instrumentation/sentry.js which was already
// initialised in server.js before this module was required
const Sentry = require('./instrumentation/sentry');

const redis = new Proxy({}, {
  get: (target, prop) => {
    const client = createRedisClient();
    return typeof client[prop] === 'function' ? client[prop].bind(client) : client[prop];
  },
});

// Import routes
const authRoutes = require('./routes/auth');
const vlogRoutes = require('./routes/vlogs');
const uploadRoutes = require('./routes/upload');
const userRoutes = require('./routes/users');
const adminModerationRoutes = require('./routes/admin.moderation.routes');
const adminUsersRoutes = require('./routes/admin.users.routes');

// OBSERVABILITY: Metrics
const { metricsMiddleware, getMetrics } = require('./monitoring/metrics');
const { protect, authorize } = require('./middleware/auth');

// Initialize express app
const app = express();

// MED-8: Protect metrics endpoint — only admins can view internal metrics
app.get('/metrics', protect, authorize('admin'), getMetrics);

// Record all other API requests
app.use(metricsMiddleware);

// NOTE: DB connection is handled in server.js AFTER env validation.
// app.js must remain side-effect-free for clean test imports.

// SECURITY: Proxy Configuration
// In production we run behind Render/Vercel reverse proxies.
// trust proxy must be enabled so req.ip reflects real client IP.
// Disabled in development to prevent IP spoofing via X-Forwarded-For.
app.set('trust proxy', 1);

// (Sentry v10 auto-instruments incoming requests; manual requestHandler is removed)
// OBSERVABILITY: Correlation ID middleware (must be early in stack)
app.use(correlationMiddleware);

// CONSISTENT STATE: Inject frozen system environment and degraded mode tracking
app.use(systemContextMiddleware);

// LOAD SHEDDING: Hybrid rate & concurrency limiter during degraded mode
app.use(backpressureMiddleware);

// Security middleware
app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Needed for React/Vite
      styleSrc: ["'self'", "'unsafe-inline'", 'fonts.googleapis.com'],
      fontSrc: ["'self'", 'fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', '*.cloudinary.com'],
      connectSrc: [
        "'self'",
        process.env.FRONTEND_URL || 'https://vlogspherefrontend.vercel.app',
        'https://*.vercel-analytics.com',
        'wss://*.onrender.com',
      ],
      reportUri: '/api/csp-report',
    },
    reportOnly: false, // Enforcing policy based on 7-day telemetry validation
  }),
);
app.use(
  helmet({
    contentSecurityPolicy: false, // Handled above in enforced mode
    crossOriginEmbedderPolicy: false,
  }),
);

// (Auth cookie debug logging removed — do not log cookies in production)

// CORS configuration
const corsOptions = {
  origin(origin, callback) {
    try {
      if (isTrustedOrigin(origin, { requireDefinedOrigin: false })) {
        return callback(null, true);
      }
      return callback(new Error('CORS blocked'));
    } catch (err) {
      return callback(err); // Handles throws like the missing ALLOWED_ORIGINS error
    }
  },

  credentials: true,
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));

// OBSERVABILITY: Real-time monitoring dashboard (accessible at /status)
if (process.env.NODE_ENV !== 'test' && statusMonitor) {
  app.use(
    statusMonitor({
      title: 'Capsule Status',
      path: '/status',
      spans: [
        { interval: 1, retention: 60 },
        { interval: 5, retention: 60 },
        { interval: 15, retention: 60 },
      ],
      chartVisibility: {
        cpu: true,
        mem: true,
        load: true,
        responseTime: true,
        rps: true,
        statusCodes: true,
      },
      healthChecks: [
        {
          protocol: 'http',
          host: '0.0.0.0',
          path: '/health',
          port: process.env.PORT || 5000,
        },
      ],
    }),
  );
}

// CRIT-4: Limit request body to 50kb to prevent DoS via large payloads
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: true, limit: '50kb' }));
app.use(cookieParser());

// SECURITY: Delete MongoDB NoSQL Operators ($ and .)
// Removes MongoDB operators from request input.
// Prevents NoSQL injection attacks using $ operators.
// Must run after body parsing and before routes.
app.use(mongoSanitize());

// CSRF Protection Middleware
// Blocks cross-site authenticated requests.
// Uses Origin/Referer validation.
// Required because cookies use SameSite=None.
app.use(csrfProtection);

// Compression middleware
app.use(compression());

// Logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// Static file serving
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check endpoint
app.get('/health', async (req, res) => {
  const env = process.env.NODE_ENV || 'unknown';
  const isProduction = env === 'production';
  let redisStatus = 'disabled';

  try {
    if (redis && redis.isAvailable && redis.isAvailable()) {
      await redis.ping();
      redisStatus = 'connected';
    } else if (redis && !redis.isAvailable) {
      // Fallback if isAvailable is somehow not there but redis object is
      await redis.ping();
      redisStatus = 'connected';
    } else if (redis && redis.isAvailable && !redis.isAvailable()) {
      redisStatus = 'down';
    }
  } catch (err) {
    redisStatus = 'down';
    // Do not fail the health check or crash the server
  }

  res.status(200).json({
    status: 'ok',
    service: 'capsule-backend',
    env,
    isProduction,
    redis: redisStatus,
    timestamp: new Date().toISOString(),
    warning: !isProduction ? 'Not running in production mode!' : undefined,
  });
});

// DB Health Check (Safe)
app.get('/health/db', (req, res) => {
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };
  const state = mongoose.connection.readyState;

  if (state === 1) {
    res.status(200).json({ status: 'ok', database: 'connected' });
  } else {
    res
      .status(503)
      .json({ status: 'error', database: states[state] || 'unknown' });
  }
});

// API routes
const cspRoutes = require('./routes/csp');
const cspDashboardRoutes = require('./routes/csp-dashboard');

app.use('/api', cspRoutes);
app.use('/api', cspDashboardRoutes);

app.use('/api/auth', authRoutes);
app.use('/api/vlogs', vlogRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin/moderation', adminModerationRoutes);
app.use('/api/admin', adminUsersRoutes);

// Default route
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Welcome to Capsule API',
    version: '1.0.0',
    documentation: '/api/docs',
  });
});

// API documentation route
app.get('/api/docs', (req, res) => {
  res.json({
    success: true,
    message: 'Capsule API Documentation',
    endpoints: {
      authentication: {
        'POST /api/auth/register': 'Register a new user',
        'POST /api/auth/login': 'Login user',
        'GET /api/auth/me': 'Get current user',
        'PUT /api/auth/updatedetails': 'Update user details',
        'PUT /api/auth/updatepassword': 'Update password',
        'POST /api/auth/forgotpassword': 'Forgot password',
        'PUT /api/auth/resetpassword/:token': 'Reset password',
        'GET /api/auth/verify/:token': 'Verify email',
        'POST /api/auth/refresh': 'Refresh access token',
        'POST /api/auth/logout': 'Logout user',
      },
      vlogs: {
        'GET /api/vlogs': 'Get all vlogs (paginated, filtered)',
        'GET /api/vlogs/trending': 'Get trending vlogs',
        'GET /api/vlogs/user/:userId': 'Get user vlogs',
        'GET /api/vlogs/:id': 'Get single vlog',
        'POST /api/vlogs': 'Create new vlog',
        'PUT /api/vlogs/:id': 'Update vlog',
        'DELETE /api/vlogs/:id': 'Delete vlog',
        'PUT /api/vlogs/:id/like': 'Toggle like on vlog',
        'PUT /api/vlogs/:id/dislike': 'Toggle dislike on vlog',
        'POST /api/vlogs/:id/comments': 'Add comment to vlog',
        'DELETE /api/vlogs/:id/comments/:commentId': 'Delete comment from vlog',
      },
      upload: {
        'POST /api/upload/single': 'Upload single image',
        'POST /api/upload/multiple': 'Upload multiple images',
        'DELETE /api/upload/:publicId': 'Delete image',
      },
    },
    features: {
      authentication: 'JWT-based authentication with refresh tokens',
      authorization: 'Role-based access control',
      fileUpload: 'Image upload with Cloudinary integration',
      aiFeatures: 'Auto-tagging and content analysis',
      security: 'Rate limiting, CORS, Helmet security headers',
      validation: 'Input validation and sanitization',
      pagination: 'Paginated responses with metadata',
      filtering: 'Advanced filtering and search capabilities',
    },
  });
});

// OBSERVABILITY: Sentry error handler — must be before 404 and global error handler
// Captures all Express route errors and sends them to Sentry
if (process.env.NODE_ENV !== 'test' && process.env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app);
}

// Handle 404 errors
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: `Route ${req.originalUrl} not found`,
  });
});

// Error handler middleware (must be last)
app.use(errorHandler);

// Export the configured app (no server.listen here)
module.exports = app;
