import logger from '../../utils/logger.js';
import config from '../../config/index.js';

// Custom API Error class
export class ApiError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message, details = null) {
    return new ApiError(400, message, details);
  }

  static unauthorized(message = 'Unauthorized') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'Forbidden') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Not found') {
    return new ApiError(404, message);
  }

  static conflict(message, details = null) {
    return new ApiError(409, message, details);
  }

  static tooManyRequests(message = 'Too many requests') {
    return new ApiError(429, message);
  }

  static internal(message = 'Internal server error') {
    return new ApiError(500, message);
  }
}

// Error handler middleware
export const errorHandler = (err, req, res, next) => {
  // Log error
  if (err.isOperational) {
    logger.warn('Operational error', {
      statusCode: err.statusCode,
      message: err.message,
      path: req.path,
      method: req.method,
    });
  } else {
    logger.error('Unexpected error', {
      error: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
    });
  }

  // Determine status code
  const statusCode = err.statusCode || 500;
  
  // Build response
  const response = {
    error: true,
    message: err.message || 'Internal server error',
  };

  // Add details in development
  if (config.env === 'development') {
    response.stack = err.stack;
    if (err.details) {
      response.details = err.details;
    }
  }

  // Add validation errors if present
  if (err.details && err.statusCode === 400) {
    response.details = err.details;
  }

  res.status(statusCode).json(response);
};

// 404 handler
export const notFoundHandler = (req, res, next) => {
  const error = ApiError.notFound(`Route ${req.method} ${req.path} not found`);
  next(error);
};

// Async handler wrapper
export const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Validation error formatter (for express-validator)
export const formatValidationErrors = (errors) => {
  return errors.array().map(err => ({
    field: err.path,
    message: err.msg,
    value: err.value,
  }));
};

export default {
  ApiError,
  errorHandler,
  notFoundHandler,
  asyncHandler,
  formatValidationErrors,
};
