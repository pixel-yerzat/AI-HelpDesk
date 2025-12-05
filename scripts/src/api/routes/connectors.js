import { Router } from 'express';
import connectorManager from '../../services/connectors/index.js';
import { getTelegramConnector } from '../../services/connectors/TelegramConnector.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import logger from '../../utils/logger.js';

const router = Router();

// Get all connectors status
router.get('/status',
  authenticate,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const health = await connectorManager.healthCheck();
    res.json(health);
  })
);

// Get specific connector status
router.get('/status/:name',
  authenticate,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const connector = connectorManager.getConnector(req.params.name);
    
    if (!connector) {
      throw ApiError.notFound(`Connector '${req.params.name}' not found`);
    }

    const health = await connector.healthCheck();
    res.json(health);
  })
);

// Telegram webhook endpoint (for webhook mode)
router.post('/telegram/webhook',
  asyncHandler(async (req, res) => {
    const telegramConnector = getTelegramConnector();
    
    if (!telegramConnector.isRunning) {
      // Process webhook even if connector started in webhook mode elsewhere
      try {
        await telegramConnector.processWebhookUpdate(req.body);
      } catch (error) {
        logger.error('Error processing Telegram webhook', { error: error.message });
      }
    }
    
    // Always return 200 OK to Telegram
    res.status(200).json({ ok: true });
  })
);

// Send test message (admin only)
router.post('/test-send',
  authenticate,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { connector: connectorName, recipient, message } = req.body;

    if (!connectorName || !recipient || !message) {
      throw ApiError.badRequest('connector, recipient, and message are required');
    }

    const connector = connectorManager.getConnector(connectorName);
    
    if (!connector) {
      throw ApiError.notFound(`Connector '${connectorName}' not found or not running`);
    }

    try {
      await connector.sendMessage(recipient, message);
      
      res.json({
        success: true,
        message: 'Test message sent',
        connector: connectorName,
        recipient,
      });
    } catch (error) {
      throw ApiError.badRequest(`Failed to send: ${error.message}`);
    }
  })
);

// Get connector configuration (non-sensitive)
router.get('/config',
  authenticate,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    res.json({
      telegram: {
        configured: !!process.env.TELEGRAM_BOT_TOKEN,
        webhookUrl: process.env.TELEGRAM_WEBHOOK_URL || null,
      },
      email: {
        imapConfigured: !!process.env.IMAP_HOST,
        smtpConfigured: !!process.env.SMTP_HOST,
        imapHost: process.env.IMAP_HOST || null,
        smtpHost: process.env.SMTP_HOST || null,
      },
      whatsapp: {
        configured: !!process.env.WHATSAPP_API_KEY,
        provider: process.env.WHATSAPP_PROVIDER || null,
      },
    });
  })
);

export default router;
