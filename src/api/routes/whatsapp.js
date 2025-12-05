import { Router } from 'express';
import { getWhatsAppConnector } from '../../services/connectors/WhatsAppConnector.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import logger from '../../utils/logger.js';

const router = Router();

// Get WhatsApp connection status
router.get('/status',
  authenticate,
  requireRole('admin', 'operator'),
  asyncHandler(async (req, res) => {
    const whatsapp = getWhatsAppConnector();
    const state = whatsapp.getState();
    const health = await whatsapp.healthCheck();

    res.json({
      ...state,
      health,
    });
  })
);

// Get QR code for connection
router.get('/qr',
  authenticate,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const whatsapp = getWhatsAppConnector();
    const state = whatsapp.getState();

    if (state.connectionState === 'connected') {
      return res.json({
        success: false,
        message: 'WhatsApp already connected',
        clientInfo: state.clientInfo,
      });
    }

    if (!state.qrCodeDataUrl) {
      return res.json({
        success: false,
        message: 'QR code not available yet. Start connection first.',
        connectionState: state.connectionState,
      });
    }

    res.json({
      success: true,
      qrCode: state.qrCode,
      qrCodeDataUrl: state.qrCodeDataUrl,
      connectionState: state.connectionState,
    });
  })
);

// Start WhatsApp connection (generates QR code)
router.post('/connect',
  authenticate,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const whatsapp = getWhatsAppConnector();
    const state = whatsapp.getState();

    if (state.connectionState === 'connected') {
      return res.json({
        success: true,
        message: 'WhatsApp already connected',
        clientInfo: state.clientInfo,
      });
    }

    if (state.connectionState === 'qr_pending' || state.connectionState === 'connecting') {
      return res.json({
        success: true,
        message: 'Connection in progress',
        connectionState: state.connectionState,
        qrCodeDataUrl: state.qrCodeDataUrl,
      });
    }

    logger.info('Starting WhatsApp connection via API');

    // Start connection in background
    whatsapp.start().catch(error => {
      logger.error('WhatsApp connection failed', { error: error.message });
    });

    // Wait a bit for QR code generation
    await new Promise(resolve => setTimeout(resolve, 2000));

    const newState = whatsapp.getState();

    res.json({
      success: true,
      message: 'Connection started. Scan QR code to connect.',
      connectionState: newState.connectionState,
      qrCodeDataUrl: newState.qrCodeDataUrl,
    });
  })
);

// Disconnect WhatsApp
router.post('/disconnect',
  authenticate,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const whatsapp = getWhatsAppConnector();
    const { logout = false } = req.body;

    if (logout) {
      await whatsapp.logout();
      logger.info('WhatsApp logged out via API');
    } else {
      await whatsapp.stop();
      logger.info('WhatsApp disconnected via API');
    }

    res.json({
      success: true,
      message: logout ? 'WhatsApp logged out' : 'WhatsApp disconnected',
    });
  })
);

// Server-Sent Events for real-time status updates
router.get('/events',
  authenticate,
  requireRole('admin', 'operator'),
  (req, res) => {
    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // For nginx
    res.flushHeaders();

    const whatsapp = getWhatsAppConnector();

    // Send initial state
    const initialState = whatsapp.getState();
    res.write(`event: state\ndata: ${JSON.stringify(initialState)}\n\n`);

    // Subscribe to state changes
    const onStateChange = (state) => {
      res.write(`event: state\ndata: ${JSON.stringify(state)}\n\n`);
    };

    const onQR = (data) => {
      res.write(`event: qr\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const onReady = (data) => {
      res.write(`event: ready\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const onDisconnected = (data) => {
      res.write(`event: disconnected\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const onAuthFailure = (data) => {
      res.write(`event: auth_failure\ndata: ${JSON.stringify(data)}\n\n`);
    };

    whatsapp.stateEmitter.on('state_change', onStateChange);
    whatsapp.stateEmitter.on('qr', onQR);
    whatsapp.stateEmitter.on('ready', onReady);
    whatsapp.stateEmitter.on('disconnected', onDisconnected);
    whatsapp.stateEmitter.on('auth_failure', onAuthFailure);

    // Heartbeat to keep connection alive
    const heartbeat = setInterval(() => {
      res.write(`:heartbeat\n\n`);
    }, 30000);

    // Cleanup on close
    req.on('close', () => {
      clearInterval(heartbeat);
      whatsapp.stateEmitter.off('state_change', onStateChange);
      whatsapp.stateEmitter.off('qr', onQR);
      whatsapp.stateEmitter.off('ready', onReady);
      whatsapp.stateEmitter.off('disconnected', onDisconnected);
      whatsapp.stateEmitter.off('auth_failure', onAuthFailure);
    });
  }
);

// Send test message
router.post('/test-send',
  authenticate,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { phoneNumber, message } = req.body;

    if (!phoneNumber || !message) {
      throw ApiError.badRequest('phoneNumber and message are required');
    }

    const whatsapp = getWhatsAppConnector();
    
    if (whatsapp.connectionState !== 'connected') {
      throw ApiError.badRequest('WhatsApp is not connected');
    }

    // Check if number is on WhatsApp
    const isRegistered = await whatsapp.isRegistered(phoneNumber);
    if (!isRegistered) {
      throw ApiError.badRequest('This phone number is not registered on WhatsApp');
    }

    const result = await whatsapp.sendMessage(phoneNumber, message);

    res.json({
      success: true,
      message: 'Test message sent',
      ...result,
    });
  })
);

// Check if phone number is on WhatsApp
router.post('/check-number',
  authenticate,
  requireRole('admin', 'operator'),
  asyncHandler(async (req, res) => {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      throw ApiError.badRequest('phoneNumber is required');
    }

    const whatsapp = getWhatsAppConnector();
    
    if (whatsapp.connectionState !== 'connected') {
      throw ApiError.badRequest('WhatsApp is not connected');
    }

    const isRegistered = await whatsapp.isRegistered(phoneNumber);

    res.json({
      phoneNumber,
      isRegistered,
    });
  })
);

export default router;
