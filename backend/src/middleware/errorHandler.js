const ErrorResponse = require('../utils/errorResponse');
const logger = require('../config/logger');

const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

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
      },
    });
  } else {
    logger.error('Request error', {
      ...logContext,
      error: {
        message: err.message,
        name: err.name,
      },
    });
  }

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = 'Resource not found';
    error = new ErrorResponse(message, 404);
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const message = `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`;
    error = new ErrorResponse(message, 400);
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map((val) => val.message).join(', ');
    error = new ErrorResponse(message, 400);
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    const message = 'Invalid token';
    error = new ErrorResponse(message, 401);
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'Token expired';
    error = new ErrorResponse(message, 401);
  }

  // Multer errors
  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      const message = 'File too large';
      error = new ErrorResponse(message, 400);
    } else if (err.code === 'LIMIT_FILE_COUNT') {
      const message = 'Too many files';
      error = new ErrorResponse(message, 400);
    } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      const message = 'Unexpected file field';
      error = new ErrorResponse(message, 400);
    }
  }

  // Cloudinary errors
  if (err.http_code) {
    const message = 'Image upload failed';
    error = new ErrorResponse(message, 400);
  }

  res.status(error.statusCode || 500).json({
    success: false,
    error: {
      message: error.message || 'Server Error',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    },
  });
};

module.exports = errorHandler;
