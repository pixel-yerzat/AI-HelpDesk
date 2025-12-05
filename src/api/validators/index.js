import { body, param, query } from 'express-validator';
import { MESSAGE_SOURCES, TICKET_STATUSES } from '../../config/categories.js';

// Message ingest validation
export const ingestMessageValidator = [
  body('source')
    .isIn(Object.keys(MESSAGE_SOURCES))
    .withMessage(`Source must be one of: ${Object.keys(MESSAGE_SOURCES).join(', ')}`),
  body('source_id')
    .notEmpty()
    .withMessage('source_id is required')
    .isString()
    .trim(),
  body('user')
    .optional()
    .isObject()
    .withMessage('user must be an object'),
  body('user.id')
    .optional()
    .isString()
    .trim(),
  body('user.name')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 255 }),
  body('subject')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Subject must be max 500 characters'),
  body('body')
    .notEmpty()
    .withMessage('Body is required')
    .isString()
    .trim()
    .isLength({ max: 10000 })
    .withMessage('Body must be max 10000 characters'),
  body('attachments')
    .optional()
    .isArray()
    .withMessage('Attachments must be an array'),
  body('attachments.*.filename')
    .optional()
    .isString(),
  body('attachments.*.url')
    .optional()
    .isURL(),
  body('attachments.*.mime_type')
    .optional()
    .isString(),
];

// Ticket ID param validation
export const ticketIdValidator = [
  param('id')
    .isUUID()
    .withMessage('Invalid ticket ID format'),
];

// Ticket action validation
export const ticketActionValidator = [
  param('id')
    .isUUID()
    .withMessage('Invalid ticket ID format'),
  body('action')
    .isIn(['approve', 'reject', 'escalate', 'assign', 'close', 'reopen', 'add_note'])
    .withMessage('Invalid action'),
  body('comment')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 2000 }),
  body('response_text')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 5000 }),
  body('assigned_to')
    .optional()
    .isUUID()
    .withMessage('Invalid user ID for assignment'),
];

// Ticket list query validation
export const ticketListValidator = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .toInt()
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .toInt()
    .withMessage('Limit must be between 1 and 100'),
  query('status')
    .optional()
    .isIn(Object.keys(TICKET_STATUSES))
    .withMessage('Invalid status'),
  query('source')
    .optional()
    .isIn(Object.keys(MESSAGE_SOURCES))
    .withMessage('Invalid source'),
  query('category')
    .optional()
    .isString()
    .trim(),
  query('priority')
    .optional()
    .isIn(['critical', 'high', 'medium', 'low'])
    .withMessage('Invalid priority'),
  query('assigned_to')
    .optional()
    .isUUID()
    .withMessage('Invalid user ID'),
  query('search')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 200 }),
];

// KB article validation
export const kbArticleValidator = [
  body('title')
    .notEmpty()
    .withMessage('Title is required')
    .isString()
    .trim()
    .isLength({ max: 500 }),
  body('body')
    .notEmpty()
    .withMessage('Body is required')
    .isString()
    .trim(),
  body('language')
    .optional()
    .isIn(['ru', 'kz', 'en'])
    .withMessage('Language must be ru, kz, or en'),
  body('category')
    .optional()
    .isString()
    .trim(),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),
  body('tags.*')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 50 }),
];

// KB search validation
export const kbSearchValidator = [
  body('query')
    .notEmpty()
    .withMessage('Search query is required')
    .isString()
    .trim()
    .isLength({ min: 2, max: 500 })
    .withMessage('Query must be between 2 and 500 characters'),
  body('language')
    .optional()
    .isIn(['ru', 'kz', 'en']),
  body('limit')
    .optional()
    .isInt({ min: 1, max: 20 })
    .toInt(),
  body('use_vector')
    .optional()
    .isBoolean()
    .toBoolean(),
];

// Auth validation
export const loginValidator = [
  body('email')
    .isEmail()
    .withMessage('Valid email is required')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
];

export const registerValidator = [
  body('email')
    .isEmail()
    .withMessage('Valid email is required')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters'),
  body('name')
    .notEmpty()
    .withMessage('Name is required')
    .isString()
    .trim()
    .isLength({ min: 2, max: 100 }),
];

// Stats validation
export const statsValidator = [
  query('from')
    .optional()
    .isISO8601()
    .withMessage('From must be a valid date'),
  query('to')
    .optional()
    .isISO8601()
    .withMessage('To must be a valid date'),
];

export default {
  ingestMessageValidator,
  ticketIdValidator,
  ticketActionValidator,
  ticketListValidator,
  kbArticleValidator,
  kbSearchValidator,
  loginValidator,
  registerValidator,
  statsValidator,
};
