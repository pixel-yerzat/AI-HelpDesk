import jwt from 'jsonwebtoken';
import config from '../../config/index.js';
import User from '../../models/User.js';
import logger from '../../utils/logger.js';

// Verify JWT token
export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'No token provided' 
      });
    }

    const token = authHeader.split(' ')[1];
    
    const decoded = jwt.verify(token, config.jwt.secret);
    
    const user = await User.getUserById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'User not found' 
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'Token expired' 
      });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'Invalid token' 
      });
    }
    logger.error('Authentication error', { error: error.message });
    return res.status(500).json({ 
      error: 'Internal Server Error', 
      message: 'Authentication failed' 
    });
  }
};

// Optional authentication (doesn't fail if no token)
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, config.jwt.secret);
    const user = await User.getUserById(decoded.userId);
    
    if (user) {
      req.user = user;
    }
    
    next();
  } catch (error) {
    // Silent fail for optional auth
    next();
  }
};

// Check specific permission
export const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'Authentication required' 
      });
    }

    if (!User.hasPermission(req.user, permission)) {
      return res.status(403).json({ 
        error: 'Forbidden', 
        message: `Permission '${permission}' required` 
      });
    }

    next();
  };
};

// Check role
export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'Authentication required' 
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Forbidden', 
        message: `One of roles [${roles.join(', ')}] required` 
      });
    }

    next();
  };
};

// Generate JWT token
export const generateToken = (user) => {
  return jwt.sign(
    { 
      userId: user.id, 
      email: user.email, 
      role: user.role 
    },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
};

// Webhook authentication (for Telegram, WhatsApp, etc.)
export const webhookAuth = (secretHeader) => {
  return (req, res, next) => {
    const providedSecret = req.headers[secretHeader] || req.query.secret;
    const expectedSecret = config[req.params.source]?.webhookSecret;

    if (expectedSecret && providedSecret !== expectedSecret) {
      logger.warn('Invalid webhook secret', { source: req.params.source });
      return res.status(401).json({ error: 'Invalid webhook secret' });
    }

    next();
  };
};

export default {
  authenticate,
  optionalAuth,
  requirePermission,
  requireRole,
  generateToken,
  webhookAuth,
};
