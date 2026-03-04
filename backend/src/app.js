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
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const path = require('path');
const mongoose = require('mongoose');
const statusMonitor = process.env.NODE_ENV !== 'test' ? require('express-status-monitor') : null;

// OBSERVABILITY: Structured logging
const { correlationMiddleware } = require('./middleware/correlation');

// Import middleware
const errorHandler = require('./middleware/errorHandler');
const connectDB = require('./config/database');
const { createRedisClient } = require('./config/redis');
const mongoSanitize = require('./middleware/mongoSanitize');
const csrfProtection = require('./middleware/csrfProtection');
const isTrustedOrigin = require('./utils/trustedOrigin');

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

// Initialize express app
const app = express();

// Connect to database (skip in test — integration.setup.js handles DB lifecycle)
if (process.env.NODE_ENV !== 'test') {
  connectDB();
}

// SECURITY: Proxy Configuration
// In production we run behind Render/Vercel reverse proxies.
// trust proxy must be enabled so req.ip reflects real client IP.
// Disabled in development to prevent IP spoofing via X-Forwarded-For.
const { NODE_ENV } = require('./config/env');

if (NODE_ENV === 'production') {
  app.set('trust proxy', true);
} else {
  app.set('trust proxy', false);
}

// OBSERVABILITY: Correlation ID middleware (must be early in stack)
app.use(correlationMiddleware);

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: false, // Will be handled by frontend
    crossOriginEmbedderPolicy: false,
  }),
);

// DEBUG: Log cookies for auth debugging (disabled in test environment)
app.use((req, res, next) => {
  if (req.path.startsWith('/api/auth') && process.env.NODE_ENV !== 'test') {
    console.log(`[DEBUG] ${req.method} ${req.path}`);
    console.log('[DEBUG] Cookies:', req.cookies);
  }
  next();
});

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
          host: 'localhost',
          path: '/health',
          port: process.env.PORT || 5000,
        },
      ],
    }),
  );
}

// Rate limiting (disabled in test mode)
if (process.env.NODE_ENV !== 'test') {
  const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
    message: {
      success: false,
      error: 'Too many requests from this IP, please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use('/api/', limiter);
}

// SECURITY: Separate rate limiters for auth endpoints
// 1. Login/Register limiter - Strict (prevent brute force)
const loginLimiter = process.env.NODE_ENV !== 'test'
  ? rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: {
      success: false,
      errorType: 'ratelimit',
      error: 'Too many login attempts. Please try again in 15 minutes.',
    },
    skipSuccessfulRequests: true,
    standardHeaders: true,
    handler: (req, res) => {
      res.status(429).json({
        success: false,
        errorType: 'ratelimit',
        error: 'Too many login attempts. Please try again in 15 minutes.',
        retryAfterSeconds: Math.ceil(
          (req.rateLimit.resetTime - Date.now()) / 1000,
        ),
      });
    },
  })
  : (req, res, next) => next();

// 2. Session check limiter - Lenient (allow normal app usage)
const sessionLimiter = process.env.NODE_ENV !== 'test'
  ? rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: {
      success: false,
      errorType: 'ratelimit',
      error: 'Too many requests. Please wait a moment.',
    },
    standardHeaders: true,
    handler: (req, res) => {
      res.status(429).json({
        success: false,
        errorType: 'ratelimit',
        error: 'Too many requests. Please wait a moment.',
        retryAfterSeconds: Math.ceil(
          (req.rateLimit.resetTime - Date.now()) / 1000,
        ),
      });
    },
  })
  : (req, res, next) => next();

// Body parser middleware
app.use(express.json({ limit: '500kb' }));
app.use(express.urlencoded({ extended: true, limit: '500kb' }));
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

// API routes with appropriate rate limiting
authRoutes.setLimiters(loginLimiter, sessionLimiter);
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
