const ErrorResponse = require('../utils/errorResponse');
const logger = require('../config/logger');
const { rejectRequest } = require('../utils/rejectRequest');

const errorHandler = (err, req, res, _next) => {
  let error = { ...err };
  error.message = err.message;
  error.statusCode = err.statusCode || 500;
  error.code = err.code || 'INTERNAL_SERVER_ERROR';

  // OBSERVABILITY: Log all errors with correlation ID and context
  const logContext = {
    correlationId: req.correlationId,
    userId: req.user?.id,
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  };

  if (process.env.NODE_ENV === 'development') {
    logger.error('Request error', {
      ...logContext,
      error: {
        message: err.message,
        stack: err.stack,
        name: err.name,
        code: error.code,
      },
    });
  } else {
    logger.error('Request error', {
      ...logContext,
      error: {
        message: err.message,
        name: err.name,
        code: error.code,
      },
    });
  }

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = 'Resource not found';
    error = new ErrorResponse(message, 404, 'RESOURCE_NOT_FOUND');
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const message = `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`;
    error = new ErrorResponse(message, 400, 'DUPLICATE_KEY');
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors)
      .map((val) => val.message)
      .join(', ');
    error = new ErrorResponse(message, 400, 'VALIDATION_ERROR');
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    const message = 'Invalid token';
    error = new ErrorResponse(message, 401, 'AUTH_INVALID_TOKEN');
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'Token expired';
    error = new ErrorResponse(message, 401, 'AUTH_TOKEN_EXPIRED');
  }

  // Multer errors
  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      const message = 'File too large';
      error = new ErrorResponse(message, 400, 'UPLOAD_FILE_TOO_LARGE');
    } else if (err.code === 'LIMIT_FILE_COUNT') {
      const message = 'Too many files';
      error = new ErrorResponse(message, 400, 'UPLOAD_TOO_MANY_FILES');
    } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      const message = 'Unexpected file field';
      error = new ErrorResponse(message, 400, 'UPLOAD_UNEXPECTED_FIELD');
    }
  }

  // Cloudinary errors
  if (err.http_code) {
    const message = 'Image upload failed';
    error = new ErrorResponse(message, 400, 'CLOUDINARY_UPLOAD_FAILED');
  }

  // STANDARDIZED: Fallback or Circuit Breaker 503 Service Unavailable
  if (err.message && err.message.includes('temporarily unavailable')) {
    return rejectRequest(res);
  }

  // STANDARDIZED: Always return consistent error format
  const response = {
    success: false,
    error: {
      message: error.message || 'Server Error',
      code: error.code || 'INTERNAL_SERVER_ERROR',
      statusCode: error.statusCode || 500,
    },
  };

  // Only include stack in development
  if (process.env.NODE_ENV === 'development' && err.stack) {
    response.error.stack = err.stack;
  }

  res.status(error.statusCode || 500).json(response);
};

module.exports = errorHandler;
