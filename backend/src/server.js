const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const path = require('path');
const mongoose = require('mongoose');

// OBSERVABILITY: Structured logging
const logger = require('./config/logger');
const { correlationMiddleware } = require('./middleware/correlation');

// PRODUCTION SAFETY: Early crash handlers (before any async code)
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err.message);
  console.error(err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('[FATAL] Unhandled Promise Rejection:', err.message);
  console.error(err.stack);
  process.exit(1);
});

// Load environment variables
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

// PRODUCTION SAFETY: Validate CRITICAL environment variables EARLY
// Fail fast if truly critical vars are missing
const criticalEnv = ['MONGODB_URI', 'JWT_SECRET', 'JWT_REFRESH_SECRET'];
const missingCritical = criticalEnv.filter((key) => !process.env[key]);

if (missingCritical.length > 0) {
  console.error('='.repeat(60));
  console.error('[FATAL] Missing CRITICAL environment variables:');
  missingCritical.forEach((key) => console.error(`  - ${key}`));
  console.error('='.repeat(60));
  console.error('Server cannot start without these variables.');
  console.error('Set them in Render dashboard: Settings > Environment');
  console.error('='.repeat(60));
  process.exit(1);
}

// Warn about optional services (graceful degradation)
const optionalServices = {
  CLOUDINARY_CLOUD_NAME: 'File uploads',
  CLOUDINARY_API_KEY: 'File uploads',
  CLOUDINARY_API_SECRET: 'File uploads',
  RESEND_API_KEY: 'Email notifications',
  REDIS_HOST: 'Caching & job queues',
};

const missingOptional = Object.keys(optionalServices)
  .filter((key) => !process.env[key])
  .map((key) => `${key} (${optionalServices[key]})`);

if (missingOptional.length > 0) {
  console.warn('[WARN] Optional services will be disabled:');
  missingOptional.forEach((msg) => console.warn(`  - ${msg}`));
  console.warn('[WARN] App will run with reduced functionality.');
}

// Import middleware
const errorHandler = require('./middleware/errorHandler');
const connectDB = require('./config/database');

// Import routes
const authRoutes = require('./routes/auth');
const vlogRoutes = require('./routes/vlogs');
const uploadRoutes = require('./routes/upload');
const userRoutes = require('./routes/users');

// Initialize express app
const app = express();

// Connect to database
connectDB();

// Trust proxy for rate limiting behind reverse proxy
app.set('trust proxy', 1);

// OBSERVABILITY: Correlation ID middleware (must be early in stack)
app.use(correlationMiddleware);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Will be handled by frontend
  crossOriginEmbedderPolicy: false,
}));

// CORS configuration
const corsOptions = {
  origin(origin, callback) {
    const allowedOrigins = process.env.CORS_ORIGINS
      ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
      : ['http://localhost:3000'];

    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // Check if origin is in explicit allowlist
    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    }

    // PRODUCTION: Support Vercel preview deployments safely
    // Only allow preview URLs for the vlogspherefrontend project
    // Pattern: https://vlogspherefrontend-*.vercel.app
    try {
      const { hostname, protocol } = new URL(origin);
      const isValidVercelPreview = protocol === 'https:'
        && hostname.endsWith('.vercel.app')
        && (hostname === 'vlogspherefrontend.vercel.app'
          || hostname.startsWith('vlogspherefrontend-'));

      if (isValidVercelPreview) {
        return callback(null, true);
      }
    } catch (err) {
      // Invalid URL, fall through to rejection
    }

    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));

// Rate limiting (disabled in test mode)
if (process.env.NODE_ENV !== 'test') {
  const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000, // 15 minutes
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

// SECURITY: Separate rate limiters for different auth endpoint types
// 1. Login/Register limiter - Strict (prevent brute force)
const loginLimiter = process.env.NODE_ENV !== 'test' ? rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 login attempts per window
  message: {
    success: false,
    errorType: 'ratelimit',
    error: 'Too many login attempts. Please try again in 15 minutes.',
  },
  skipSuccessfulRequests: true, // Don't count successful logins
  standardHeaders: true, // Return rate limit info in RateLimit-* headers
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      errorType: 'ratelimit',
      error: 'Too many login attempts. Please try again in 15 minutes.',
      retryAfterSeconds: Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000),
    });
  },
}) : (req, res, next) => next();

// 2. Session check limiter - Lenient (allow normal app usage)
const sessionLimiter = process.env.NODE_ENV !== 'test' ? rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 session checks per window (allows active browsing)
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
      retryAfterSeconds: Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000),
    });
  },
}) : (req, res, next) => next();

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Compression middleware
app.use(compression());

// Logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Static file serving
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'vlogsphere-backend',
    env: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// DB Health Check (Safe)
app.get('/health/db', (req, res) => {
  const states = {
    0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting',
  };
  const state = mongoose.connection.readyState;

  if (state === 1) {
    res.status(200).json({ status: 'ok', database: 'connected' });
  } else {
    res.status(503).json({ status: 'error', database: states[state] || 'unknown' });
  }
});

// API routes with appropriate rate limiting
// Pass limiters to auth routes
authRoutes.setLimiters(loginLimiter, sessionLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/vlogs', vlogRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/users', userRoutes);

// Default route
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Welcome to VLOGSPHERE API',
    version: '1.0.0',
    documentation: '/api/docs',
  });
});

// API documentation route
app.get('/api/docs', (req, res) => {
  res.json({
    success: true,
    message: 'VLOGSPHERE API Documentation',
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

const PORT = process.env.PORT || 5000;

// Start server and export for potential shutdown handling
const server = app.listen(PORT, () => {
  logger.info('Server started', {
    port: PORT,
    environment: process.env.NODE_ENV,
    nodeVersion: process.version,
  });
});

module.exports = app;
module.exports.server = server; // Export server for graceful shutdown if needed
