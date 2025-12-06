import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import db from '../../utils/database.js';
import { cache } from '../../utils/redis.js';

const router = Router();

// Get unread notifications
router.get('/unread',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;
    
    // Try to get from cache first
    const cacheKey = `notifications:${userId}`;
    let notifications = [];
    
    try {
      const cached = await cache.get(cacheKey);
      if (cached) {
        notifications = JSON.parse(cached);
      }
    } catch (e) {
      // Cache miss, continue
    }

    // If no cached notifications, get recent activity
    if (notifications.length === 0) {
      try {
        // Get recent tickets activity for this user
        const recentTickets = await db.getMany(
          `SELECT id, subject, status, updated_at 
           FROM tickets 
           WHERE (assigned_to = $1 OR user_id = $1)
           AND updated_at > NOW() - INTERVAL '24 hours'
           ORDER BY updated_at DESC
           LIMIT 5`,
          [userId]
        );

        notifications = recentTickets.map(t => ({
          id: t.id,
          title: `Тикет обновлён`,
          message: t.subject || 'Новое обновление',
          type: 'ticket_update',
          ticketId: t.id,
          createdAt: t.updated_at,
        }));
      } catch (e) {
        // DB error, return empty
      }
    }

    res.json({
      notifications,
      count: notifications.length,
    });
  })
);

// Mark notification as read
router.put('/:id/read',
  authenticate,
  asyncHandler(async (req, res) => {
    // In a real implementation, update notification status in DB
    res.json({ success: true });
  })
);

// Mark all as read
router.put('/read-all',
  authenticate,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const cacheKey = `notifications:${userId}`;
    
    try {
      await cache.del(cacheKey);
    } catch (e) {
      // Ignore cache errors
    }

    res.json({ success: true });
  })
);

export default router;
