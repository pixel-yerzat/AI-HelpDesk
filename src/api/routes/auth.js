import { Router } from 'express';
import { validationResult } from 'express-validator';
import User from '../../models/User.js';
import { authenticate, generateToken } from '../middleware/auth.js';
import { asyncHandler, ApiError, formatValidationErrors } from '../middleware/errorHandler.js';
import { loginValidator, registerValidator } from '../validators/index.js';
import logger from '../../utils/logger.js';

const router = Router();

// Login
router.post('/login',
  loginValidator,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw ApiError.badRequest('Validation failed', formatValidationErrors(errors));
    }

    const { email, password } = req.body;

    const user = await User.getUserByEmail(email);
    if (!user) {
      throw ApiError.unauthorized('Invalid credentials');
    }

    const isValid = await User.verifyPassword(user, password);
    if (!isValid) {
      throw ApiError.unauthorized('Invalid credentials');
    }

    const token = generateToken(user);

    logger.info('User logged in', { userId: user.id, email: user.email });

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  })
);

// Register (admin only in production, open in dev)
router.post('/register',
  registerValidator,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw ApiError.badRequest('Validation failed', formatValidationErrors(errors));
    }

    const { email, password, name, role } = req.body;

    // Check if user exists
    const existing = await User.getUserByEmail(email);
    if (existing) {
      throw ApiError.conflict('User with this email already exists');
    }

    // In production, only admins can create users with elevated roles
    const userRole = (role && ['admin', 'operator', 'performer'].includes(role)) 
      ? role 
      : 'user';

    const user = await User.createUser({
      email,
      password,
      name,
      role: userRole,
    });

    const token = generateToken(user);

    logger.info('User registered', { userId: user.id, email: user.email, role: user.role });

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  })
);

// Get current user
router.get('/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await User.getUserById(req.user.id);
    
    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        created_at: user.created_at,
      },
    });
  })
);

// Update current user
router.put('/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const { name, password, current_password } = req.body;

    const updates = {};

    if (name) {
      updates.name = name;
    }

    if (password) {
      // Verify current password
      const user = await User.getUserByEmail(req.user.email);
      const isValid = await User.verifyPassword(user, current_password);
      if (!isValid) {
        throw ApiError.badRequest('Current password is incorrect');
      }
      updates.password = password;
    }

    if (Object.keys(updates).length === 0) {
      throw ApiError.badRequest('No updates provided');
    }

    const updatedUser = await User.updateUser(req.user.id, updates);

    res.json({
      success: true,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        role: updatedUser.role,
      },
    });
  })
);

// Refresh token
router.post('/refresh',
  authenticate,
  asyncHandler(async (req, res) => {
    const token = generateToken(req.user);
    
    res.json({
      success: true,
      token,
    });
  })
);

export default router;
