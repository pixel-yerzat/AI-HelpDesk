import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;
import qrcode from 'qrcode';
import { EventEmitter } from 'events';
import { BaseConnector } from './BaseConnector.js';
import config from '../../config/index.js';
import { cache } from '../../utils/redis.js';
import logger from '../../utils/logger.js';

/**
 * WhatsApp Connector using whatsapp-web.js
 * Connects via QR code like WhatsApp Web
 */
export class WhatsAppConnector extends BaseConnector {
  constructor() {
    super('whatsapp');
    this.client = null;
    this.qrCode = null;
    this.qrCodeDataUrl = null;
    this.connectionState = 'disconnected'; // disconnected, qr_pending, connecting, connected
    this.clientInfo = null;
    this.sessionId = 'helpdesk-whatsapp';
    this.stateEmitter = new EventEmitter();
  }

  /**
   * Initialize WhatsApp client
   */
  async initialize() {
    if (this.client) {
      this.logger.warn('WhatsApp client already initialized');
      return;
    }

    this.logger.info('Initializing WhatsApp client...');
    this.connectionState = 'disconnected';
    this.emitStateChange();

    this.client = new Client({
      authStrategy: new LocalAuth({
        clientId: this.sessionId,
        dataPath: './data/whatsapp-sessions',
      }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
        ],
      },
      webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/AstroLabs/whatsapp-web-version/main/webVersionCache.json',
      },
    });

    this.setupEventHandlers();
  }

  /**
   * Set up WhatsApp event handlers
   */
  setupEventHandlers() {
    // QR Code event
    this.client.on('qr', async (qr) => {
      this.logger.info('QR Code received, waiting for scan...');
      this.qrCode = qr;
      this.connectionState = 'qr_pending';

      try {
        // Generate QR code as data URL for web display
        this.qrCodeDataUrl = await qrcode.toDataURL(qr, {
          width: 256,
          margin: 2,
        });
      } catch (error) {
        this.logger.error('Failed to generate QR code image', { error: error.message });
      }

      this.emitStateChange();

      // Also emit for real-time updates
      this.stateEmitter.emit('qr', {
        qr: this.qrCode,
        qrDataUrl: this.qrCodeDataUrl,
      });
    });

    // Authentication success
    this.client.on('authenticated', () => {
      this.logger.info('WhatsApp authenticated successfully');
      this.connectionState = 'connecting';
      this.qrCode = null;
      this.qrCodeDataUrl = null;
      this.emitStateChange();
    });

    // Authentication failure
    this.client.on('auth_failure', (msg) => {
      this.logger.error('WhatsApp authentication failed', { message: msg });
      this.connectionState = 'disconnected';
      this.emitStateChange();
      this.stateEmitter.emit('auth_failure', { message: msg });
    });

    // Ready (fully connected)
    this.client.on('ready', async () => {
      this.logger.info('WhatsApp client is ready');
      this.connectionState = 'connected';
      this.isRunning = true;

      try {
        this.clientInfo = this.client.info;
        this.logger.info('Connected as', {
          number: this.clientInfo?.wid?.user,
          platform: this.clientInfo?.platform,
        });
      } catch (error) {
        this.logger.warn('Could not get client info', { error: error.message });
      }

      this.emitStateChange();
      this.stateEmitter.emit('ready', { clientInfo: this.clientInfo });

      // Save connection state
      await cache.set('whatsapp:connected', true, 86400);
      await cache.set('whatsapp:clientInfo', this.clientInfo, 86400);
    });

    // Disconnected
    this.client.on('disconnected', async (reason) => {
      this.logger.warn('WhatsApp disconnected', { reason });
      this.connectionState = 'disconnected';
      this.isRunning = false;
      this.clientInfo = null;
      this.emitStateChange();
      this.stateEmitter.emit('disconnected', { reason });

      await cache.del('whatsapp:connected');
      await cache.del('whatsapp:clientInfo');
    });

    // Incoming message
    this.client.on('message', async (msg) => {
      try {
        await this.handleIncomingMessage(msg);
      } catch (error) {
        this.logger.error('Error handling WhatsApp message', { error: error.message });
      }
    });

    // Message acknowledgment (sent, delivered, read)
    this.client.on('message_ack', (msg, ack) => {
      const ackStatus = {
        '-1': 'error',
        '0': 'pending',
        '1': 'sent',
        '2': 'delivered',
        '3': 'read',
      };
      this.logger.debug('Message ack', { 
        messageId: msg.id._serialized, 
        status: ackStatus[ack] || ack,
      });
    });

    // Loading progress
    this.client.on('loading_screen', (percent, message) => {
      this.logger.debug('Loading', { percent, message });
    });

    // State change
    this.client.on('change_state', (state) => {
      this.logger.debug('Client state changed', { state });
    });
  }

  /**
   * Start the WhatsApp connector
   */
  async start() {
    await this.initialize();

    this.logger.info('Starting WhatsApp client...');
    
    try {
      await this.client.initialize();
      await super.start();
    } catch (error) {
      this.logger.error('Failed to start WhatsApp client', { error: error.message });
      this.connectionState = 'disconnected';
      throw error;
    }
  }

  /**
   * Stop the WhatsApp connector
   */
  async stop() {
    if (this.client) {
      try {
        await this.client.destroy();
        this.logger.info('WhatsApp client destroyed');
      } catch (error) {
        this.logger.error('Error destroying WhatsApp client', { error: error.message });
      }
      this.client = null;
    }

    this.connectionState = 'disconnected';
    this.qrCode = null;
    this.qrCodeDataUrl = null;
    this.clientInfo = null;

    await super.stop();
  }

  /**
   * Logout and clear session
   */
  async logout() {
    if (this.client && this.connectionState === 'connected') {
      try {
        await this.client.logout();
        this.logger.info('WhatsApp logged out successfully');
      } catch (error) {
        this.logger.error('Error during logout', { error: error.message });
      }
    }

    await this.stop();
    await cache.del('whatsapp:connected');
    await cache.del('whatsapp:clientInfo');
  }

  /**
   * Emit state change event
   */
  emitStateChange() {
    const state = this.getState();
    this.stateEmitter.emit('state_change', state);
  }

  /**
   * Get current connection state
   */
  getState() {
    return {
      connectionState: this.connectionState,
      isConnected: this.connectionState === 'connected',
      qrCode: this.qrCode,
      qrCodeDataUrl: this.qrCodeDataUrl,
      clientInfo: this.clientInfo ? {
        phoneNumber: this.clientInfo.wid?.user,
        platform: this.clientInfo.platform,
        pushname: this.clientInfo.pushname,
      } : null,
    };
  }

  /**
   * Subscribe to state changes
   */
  onStateChange(callback) {
    this.stateEmitter.on('state_change', callback);
    return () => this.stateEmitter.off('state_change', callback);
  }

  /**
   * Subscribe to QR code events
   */
  onQR(callback) {
    this.stateEmitter.on('qr', callback);
    return () => this.stateEmitter.off('qr', callback);
  }

  /**
   * Handle incoming WhatsApp message
   */
  async handleIncomingMessage(msg) {
    // Skip status updates and broadcasts
    if (msg.isStatus || msg.broadcast) {
      return;
    }

    // Skip group messages (optional - can be enabled)
    if (msg.from.includes('@g.us')) {
      this.logger.debug('Skipping group message');
      return;
    }

    // Skip messages from self
    if (msg.fromMe) {
      return;
    }

    const chatId = msg.from;
    const contact = await msg.getContact();
    const chat = await msg.getChat();

    // Extract sender info
    const senderNumber = chatId.replace('@c.us', '');
    const senderName = contact.pushname || contact.name || senderNumber;

    // Extract message content
    let body = msg.body || '';
    const attachments = [];

    // Handle media messages
    if (msg.hasMedia) {
      try {
        const media = await msg.downloadMedia();
        if (media) {
          attachments.push({
            type: this.getMediaType(msg.type),
            mimetype: media.mimetype,
            filename: media.filename || `${msg.type}_${Date.now()}`,
            data: media.data, // Base64
            size: media.data ? Buffer.from(media.data, 'base64').length : 0,
          });

          if (!body && msg.type === 'image') {
            body = '[Изображение]';
          } else if (!body && msg.type === 'document') {
            body = `[Документ: ${media.filename || 'файл'}]`;
          } else if (!body && msg.type === 'audio') {
            body = '[Голосовое сообщение]';
          } else if (!body && msg.type === 'video') {
            body = '[Видео]';
          }
        }
      } catch (error) {
        this.logger.error('Error downloading media', { error: error.message });
        body = body || '[Вложение не удалось загрузить]';
      }
    }

    // Handle location
    if (msg.type === 'location' && msg.location) {
      body = `[Локация: ${msg.location.latitude}, ${msg.location.longitude}]`;
    }

    // Handle contact card
    if (msg.type === 'vcard') {
      body = '[Контакт]';
    }

    // Skip empty messages
    if (!body && attachments.length === 0) {
      return;
    }

    // Emit message for processing
    this.emitMessage({
      sourceId: chatId,
      user: {
        id: senderNumber,
        name: senderName,
        phone: senderNumber,
      },
      subject: body.substring(0, 100),
      body,
      attachments,
      raw: {
        messageId: msg.id._serialized,
        timestamp: msg.timestamp,
        type: msg.type,
        isForwarded: msg.isForwarded,
      },
      timestamp: new Date(msg.timestamp * 1000).toISOString(),
    });

    this.logger.debug('WhatsApp message received', {
      from: senderNumber,
      type: msg.type,
      bodyPreview: body.substring(0, 50),
    });
  }

  /**
   * Get media type from message type
   */
  getMediaType(msgType) {
    const typeMap = {
      image: 'image',
      video: 'video',
      audio: 'audio',
      ptt: 'voice', // Push-to-talk (voice message)
      document: 'document',
      sticker: 'sticker',
    };
    return typeMap[msgType] || 'file';
  }

  /**
   * Send message to WhatsApp user
   */
  async sendMessage(recipientId, message, options = {}) {
    if (this.connectionState !== 'connected') {
      throw new Error('WhatsApp is not connected');
    }

    // Ensure correct format for chat ID
    const chatId = recipientId.includes('@c.us') 
      ? recipientId 
      : `${recipientId}@c.us`;

    try {
      const sent = await this.client.sendMessage(chatId, message);
      
      this.logger.debug('WhatsApp message sent', {
        to: chatId,
        messageId: sent.id._serialized,
      });

      return {
        success: true,
        messageId: sent.id._serialized,
      };
    } catch (error) {
      this.logger.error('Failed to send WhatsApp message', {
        to: chatId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Send message with media
   */
  async sendMediaMessage(recipientId, mediaPath, caption = '', options = {}) {
    if (this.connectionState !== 'connected') {
      throw new Error('WhatsApp is not connected');
    }

    const chatId = recipientId.includes('@c.us') 
      ? recipientId 
      : `${recipientId}@c.us`;

    try {
      const media = MessageMedia.fromFilePath(mediaPath);
      const sent = await this.client.sendMessage(chatId, media, { caption });

      this.logger.debug('WhatsApp media sent', {
        to: chatId,
        messageId: sent.id._serialized,
      });

      return {
        success: true,
        messageId: sent.id._serialized,
      };
    } catch (error) {
      this.logger.error('Failed to send WhatsApp media', {
        to: chatId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Send ticket created notification
   */
  async sendTicketCreated(chatId, ticketId, summary) {
    const message = `✅ *Заявка создана*

📋 Номер: \`${ticketId.substring(0, 8)}\`
📝 ${summary}

Мы обрабатываем ваш запрос. Пожалуйста, подождите...`;

    await this.sendMessage(chatId, message);
  }

  /**
   * Send auto-response
   */
  async sendAutoResponse(chatId, ticketId, response, kbRefs = []) {
    let message = `💡 *Возможное решение:*\n\n${response}`;

    if (kbRefs.length > 0) {
      message += `\n\n📚 _Источник: База знаний_`;
    }

    message += `\n\n*Это помогло решить вашу проблему?*
Ответьте "Да" или "Нет"`;

    await this.sendMessage(chatId, message);
  }

  /**
   * Send operator response
   */
  async sendOperatorResponse(chatId, response, operatorName = 'Оператор') {
    const message = `👨‍💻 *${operatorName}:*\n\n${response}`;
    await this.sendMessage(chatId, message);
  }

  /**
   * Send ticket resolved notification
   */
  async sendTicketResolved(chatId, ticketId, resolution) {
    const message = `✅ *Заявка решена*

${resolution}

Оцените качество поддержки от 1 до 5, отправив число.

Спасибо за обращение! 🙏`;

    await this.sendMessage(chatId, message);
  }

  /**
   * Check if number is registered on WhatsApp
   */
  async isRegistered(phoneNumber) {
    if (this.connectionState !== 'connected') {
      throw new Error('WhatsApp is not connected');
    }

    const chatId = phoneNumber.includes('@c.us') 
      ? phoneNumber 
      : `${phoneNumber}@c.us`;

    try {
      const isRegistered = await this.client.isRegisteredUser(chatId);
      return isRegistered;
    } catch (error) {
      this.logger.error('Error checking WhatsApp registration', { error: error.message });
      return false;
    }
  }

  /**
   * Get chat by ID
   */
  async getChat(chatId) {
    if (this.connectionState !== 'connected') {
      return null;
    }

    try {
      const formattedId = chatId.includes('@c.us') ? chatId : `${chatId}@c.us`;
      return await this.client.getChatById(formattedId);
    } catch (error) {
      return null;
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    const base = await super.healthCheck();

    return {
      ...base,
      connectionState: this.connectionState,
      isConnected: this.connectionState === 'connected',
      hasQR: !!this.qrCode,
      clientInfo: this.clientInfo ? {
        phoneNumber: this.clientInfo.wid?.user,
        platform: this.clientInfo.platform,
      } : null,
    };
  }
}

// Singleton instance
let whatsappConnector = null;

export const getWhatsAppConnector = () => {
  if (!whatsappConnector) {
    whatsappConnector = new WhatsAppConnector();
  }
  return whatsappConnector;
};

export default WhatsAppConnector;
