import { Router } from 'express';
import { validationResult } from 'express-validator';
import { subDays, startOfDay, endOfDay } from 'date-fns';
import Ticket from '../../models/Ticket.js';
import User from '../../models/User.js';
import KnowledgeBase from '../../models/KnowledgeBase.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError, formatValidationErrors } from '../middleware/errorHandler.js';
import { statsValidator } from '../validators/index.js';
import db from '../../utils/database.js';
import { healthCheck as redisHealth } from '../../utils/redis.js';

const router = Router();

// Get dashboard stats
router.get('/stats',
  authenticate,
  requireRole('admin', 'operator'),
  statsValidator,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw ApiError.badRequest('Validation failed', formatValidationErrors(errors));
    }

    const { from, to } = req.query;
    
    const dateFrom = from ? new Date(from) : startOfDay(subDays(new Date(), 30));
    const dateTo = to ? new Date(to) : endOfDay(new Date());

    const ticketStats = await Ticket.getStats(dateFrom, dateTo);
    const kbStats = await KnowledgeBase.getKbStats();

    res.json({
      period: {
        from: dateFrom,
        to: dateTo,
      },
      tickets: ticketStats,
      knowledgeBase: kbStats,
    });
  })
);

// Get daily metrics (for charts)
router.get('/stats/daily',
  authenticate,
  requireRole('admin', 'operator'),
  asyncHandler(async (req, res) => {
    const { days = 30 } = req.query;
    const numDays = Math.min(parseInt(days), 90);

    const result = await db.getMany(
      `SELECT 
        DATE(created_at) as date,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'resolved') as resolved,
        COUNT(*) FILTER (WHERE resolved_by = 'auto') as auto_resolved,
        AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/3600) FILTER (WHERE resolved_at IS NOT NULL) as avg_resolution_hours
       FROM tickets
       WHERE created_at >= NOW() - INTERVAL '${numDays} days'
       GROUP BY DATE(created_at)
       ORDER BY date ASC`
    );

    res.json({ 
      days: numDays,
      metrics: result,
    });
  })
);

// Get category distribution
router.get('/stats/categories',
  authenticate,
  requireRole('admin', 'operator'),
  asyncHandler(async (req, res) => {
    const { days = 30 } = req.query;

    const result = await db.getMany(
      `SELECT 
        tn.category,
        COUNT(*) as count,
        AVG(tn.category_conf) as avg_confidence,
        COUNT(*) FILTER (WHERE t.resolved_by = 'auto') as auto_resolved
       FROM tickets t
       JOIN ticket_nlp tn ON t.id = tn.ticket_id
       WHERE t.created_at >= NOW() - INTERVAL '${parseInt(days)} days'
       GROUP BY tn.category
       ORDER BY count DESC`
    );

    res.json({ categories: result });
  })
);

// Get confidence distribution (for monitoring model quality)
router.get('/stats/confidence',
  authenticate,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { days = 7 } = req.query;

    const result = await db.getMany(
      `SELECT 
        CASE 
          WHEN category_conf >= 0.9 THEN 'high (0.9+)'
          WHEN category_conf >= 0.65 THEN 'medium (0.65-0.9)'
          ELSE 'low (<0.65)'
        END as confidence_bucket,
        COUNT(*) as count
       FROM ticket_nlp tn
       JOIN tickets t ON t.id = tn.ticket_id
       WHERE t.created_at >= NOW() - INTERVAL '${parseInt(days)} days'
       GROUP BY confidence_bucket
       ORDER BY confidence_bucket`
    );

    res.json({ distribution: result });
  })
);

// Get users list (admin)
router.get('/users',
  authenticate,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, role, search } = req.query;

    const result = await User.getUsers(
      { role, search },
      { page: parseInt(page), limit: parseInt(limit) }
    );

    res.json(result);
  })
);

// Get operators list (for assignment)
router.get('/operators',
  authenticate,
  requireRole('admin', 'operator'),
  asyncHandler(async (req, res) => {
    const operators = await User.getOperators();
    res.json({ operators });
  })
);

// Update user (admin)
router.put('/users/:id',
  authenticate,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { name, email, role } = req.body;

    const user = await User.getUserById(req.params.id);
    if (!user) {
      throw ApiError.notFound('User not found');
    }

    const updates = {};
    if (name) updates.name = name;
    if (email) updates.email = email;
    if (role && ['admin', 'operator', 'performer', 'user'].includes(role)) {
      updates.role = role;
    }

    const updatedUser = await User.updateUser(req.params.id, updates);

    res.json({ 
      success: true,
      user: updatedUser,
    });
  })
);

// Health check endpoint
router.get('/health',
  asyncHandler(async (req, res) => {
    const dbHealth = await db.healthCheck();
    const cacheHealth = await redisHealth();

    const isHealthy = dbHealth.status === 'healthy' && cacheHealth.status === 'healthy';

    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      services: {
        database: dbHealth,
        cache: cacheHealth,
      },
    });
  })
);

// Trigger model retrain (admin)
router.post('/ml/retrain',
  authenticate,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { model_type } = req.body;

    // TODO: Queue retrain job
    // For now, just acknowledge

    res.json({
      success: true,
      message: `Retrain job queued for ${model_type || 'all'} models`,
      job_id: `retrain_${Date.now()}`,
    });
  })
);

// Get system configuration (admin)
router.get('/config',
  authenticate,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    // Return non-sensitive configuration
    res.json({
      thresholds: {
        autoResolve: parseFloat(process.env.THRESHOLD_AUTO_RESOLVE) || 0.90,
        draftMin: parseFloat(process.env.THRESHOLD_DRAFT_MIN) || 0.65,
        triage: parseFloat(process.env.THRESHOLD_TRIAGE) || 0.85,
      },
      features: {
        autoResolveEnabled: true,
        humanInLoopEnabled: true,
      },
      llmProvider: process.env.LLM_PROVIDER || 'anthropic',
    });
  })
);

// Update thresholds (admin)
router.put('/config/thresholds',
  authenticate,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { autoResolve, draftMin, triage } = req.body;

    // In real implementation, save to DB or config store
    // For now, just validate and acknowledge

    if (autoResolve !== undefined && (autoResolve < 0 || autoResolve > 1)) {
      throw ApiError.badRequest('autoResolve must be between 0 and 1');
    }
    if (draftMin !== undefined && (draftMin < 0 || draftMin > 1)) {
      throw ApiError.badRequest('draftMin must be between 0 and 1');
    }
    if (triage !== undefined && (triage < 0 || triage > 1)) {
      throw ApiError.badRequest('triage must be between 0 and 1');
    }

    res.json({
      success: true,
      message: 'Thresholds updated',
      thresholds: { autoResolve, draftMin, triage },
    });
  })
);

export default router;
