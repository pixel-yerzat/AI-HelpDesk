const logger = require('../../utils/logger');
const config = require('../../config');

function errorHandler(err, req, res, next) {
  logger.error(`Error: ${err.message}`, { 
    stack: err.stack,
    path: req.path,
    method: req.method 
  });

  // Joi validation errors
  if (err.isJoi) {
    return res.status(400).json({
      error: 'Validation error',
      details: err.details.map(d => d.message)
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: 'Invalid token' });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Token expired' });
  }

  // Database errors
  if (err.code === '23505') {
    return res.status(409).json({ error: 'Resource already exists' });
  }

  // Default error
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    error: err.message || 'Internal server error',
    ...(config.env === 'development' && { stack: err.stack })
  });
}

module.exports = errorHandler;
