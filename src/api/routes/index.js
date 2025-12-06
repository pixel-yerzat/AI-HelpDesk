import { Router } from 'express';
import ticketsRouter from './tickets.js';
import messagesRouter from './messages.js';
import kbRouter from './kb.js';
import authRouter from './auth.js';
import adminRouter from './admin.js';
import nlpRouter from './nlp.js';
import connectorsRouter from './connectors.js';
import whatsappRouter from './whatsapp.js';
import notificationsRouter from './notifications.js';

const router = Router();

// API routes
router.use('/auth', authRouter);
router.use('/tickets', ticketsRouter);
router.use('/messages', messagesRouter);
router.use('/kb', kbRouter);
router.use('/admin', adminRouter);
router.use('/nlp', nlpRouter);
router.use('/connectors', connectorsRouter);
router.use('/whatsapp', whatsappRouter);
router.use('/notifications', notificationsRouter);

// Root endpoint
router.get('/', (req, res) => {
  res.json({
    name: 'HelpDesk AI API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/v1/auth',
      tickets: '/api/v1/tickets',
      messages: '/api/v1/messages',
      kb: '/api/v1/kb',
      admin: '/api/v1/admin',
      nlp: '/api/v1/nlp',
      connectors: '/api/v1/connectors',
      whatsapp: '/api/v1/whatsapp',
    },
  });
});

export default router;
