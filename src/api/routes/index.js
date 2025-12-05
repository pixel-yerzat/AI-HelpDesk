import { Router } from 'express';
import ticketsRouter from './tickets.js';
import messagesRouter from './messages.js';
import kbRouter from './kb.js';
import authRouter from './auth.js';
import adminRouter from './admin.js';
import nlpRouter from './nlp.js';

const router = Router();

// API routes
router.use('/auth', authRouter);
router.use('/tickets', ticketsRouter);
router.use('/messages', messagesRouter);
router.use('/kb', kbRouter);
router.use('/admin', adminRouter);
router.use('/nlp', nlpRouter);

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
    },
  });
});

export default router;
