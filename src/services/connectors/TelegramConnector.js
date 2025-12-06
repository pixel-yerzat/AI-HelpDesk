import TelegramBot from 'node-telegram-bot-api';
import { BaseConnector } from './BaseConnector.js';
import config from '../../config/index.js';
import { cache } from '../../utils/redis.js';

/**
 * Telegram Bot Connector
 * Supports both polling and webhook modes
 */
export class TelegramConnector extends BaseConnector {
  constructor() {
    super('telegram');
    this.bot = null;
    this.mode = null; // 'polling' or 'webhook'
  }

  /**
   * Start the Telegram bot
   * @param {object} options - { mode: 'polling' | 'webhook' }
   */
  async start(options = { mode: 'polling' }) {
    if (!config.telegram.botToken) {
      this.logger.error('Telegram bot token not configured');
      throw new Error('TELEGRAM_BOT_TOKEN is required');
    }

    this.mode = options.mode;

    const botOptions = {
      polling: this.mode === 'polling',
    };

    this.bot = new TelegramBot(config.telegram.botToken, botOptions);

    // Set up webhook if in webhook mode
    if (this.mode === 'webhook' && config.telegram.webhookUrl) {
      await this.bot.setWebHook(config.telegram.webhookUrl);
      this.logger.info('Webhook set', { url: config.telegram.webhookUrl });
    }

    // Register message handlers
    this.setupHandlers();

    await super.start();
    
    // Get bot info
    const me = await this.bot.getMe();
    this.logger.info('Telegram bot connected', { 
      username: me.username,
      mode: this.mode,
    });

    return me;
  }

  /**
   * Stop the bot
   */
  async stop() {
    if (this.bot) {
      if (this.mode === 'polling') {
        await this.bot.stopPolling();
      }
      if (this.mode === 'webhook') {
        await this.bot.deleteWebHook();
      }
      this.bot = null;
    }
    await super.stop();
  }

  /**
   * Set up message handlers
   */
  setupHandlers() {
    // Handle text messages
    this.bot.on('message', async (msg) => {
      try {
        await this.handleMessage(msg);
      } catch (error) {
        this.logger.error('Error handling message', { 
          chatId: msg.chat.id,
          error: error.message,
        });
      }
    });

    // Handle callback queries (button clicks)
    this.bot.on('callback_query', async (query) => {
      try {
        await this.handleCallbackQuery(query);
      } catch (error) {
        this.logger.error('Error handling callback query', {
          error: error.message,
        });
      }
    });

    // Handle errors
    this.bot.on('polling_error', (error) => {
      this.logger.error('Polling error', { error: error.message });
    });

    this.bot.on('error', (error) => {
      this.logger.error('Bot error', { error: error.message });
    });
  }

  /**
   * Handle incoming message
   */
  async handleMessage(msg) {
    const chatId = msg.chat.id.toString();
    const userId = msg.from.id.toString();
    const userName = [msg.from.first_name, msg.from.last_name]
      .filter(Boolean)
      .join(' ') || msg.from.username || 'Unknown';

    // Extract text content
    let text = msg.text || msg.caption || '';
    
    // Handle /start command
    if (text === '/start') {
      await this.sendWelcomeMessage(chatId, userName);
      return;
    }

    // Handle /help command
    if (text === '/help') {
      await this.sendHelpMessage(chatId);
      return;
    }

    // Handle /status command
    if (text.startsWith('/status')) {
      await this.handleStatusCommand(chatId, userId, text);
      return;
    }

    // Skip other commands
    if (text.startsWith('/')) {
      await this.bot.sendMessage(chatId, 
        'Неизвестная команда. Используйте /help для списка команд.',
        { parse_mode: 'HTML' }
      );
      return;
    }

    // Skip empty messages
    if (!text && !msg.photo && !msg.document) {
      return;
    }

    // Process attachments
    const attachments = await this.processAttachments(msg);

    // Emit message for processing
    this.emitMessage({
      sourceId: chatId,
      user: {
        id: userId,
        name: userName,
        username: msg.from.username,
        language_code: msg.from.language_code,
      },
      subject: text.substring(0, 100),
      body: text || '[Attachment]',
      attachments,
      raw: msg,
      timestamp: new Date(msg.date * 1000).toISOString(),
    });

    // Send acknowledgment
    await this.sendTypingAction(chatId);
  }

  /**
   * Process message attachments
   */
  async processAttachments(msg) {
    const attachments = [];

    // Photo
    if (msg.photo && msg.photo.length > 0) {
      const photo = msg.photo[msg.photo.length - 1]; // Get highest resolution
      const fileLink = await this.bot.getFileLink(photo.file_id);
      attachments.push({
        type: 'photo',
        file_id: photo.file_id,
        file_size: photo.file_size,
        width: photo.width,
        height: photo.height,
        url: fileLink,
      });
    }

    // Document
    if (msg.document) {
      const fileLink = await this.bot.getFileLink(msg.document.file_id);
      attachments.push({
        type: 'document',
        file_id: msg.document.file_id,
        file_name: msg.document.file_name,
        mime_type: msg.document.mime_type,
        file_size: msg.document.file_size,
        url: fileLink,
      });
    }

    // Voice message
    if (msg.voice) {
      const fileLink = await this.bot.getFileLink(msg.voice.file_id);
      attachments.push({
        type: 'voice',
        file_id: msg.voice.file_id,
        duration: msg.voice.duration,
        mime_type: msg.voice.mime_type,
        url: fileLink,
      });
    }

    // Video
    if (msg.video) {
      const fileLink = await this.bot.getFileLink(msg.video.file_id);
      attachments.push({
        type: 'video',
        file_id: msg.video.file_id,
        file_name: msg.video.file_name,
        duration: msg.video.duration,
        url: fileLink,
      });
    }

    return attachments;
  }

  /**
   * Handle callback query (button click)
   */
  async handleCallbackQuery(query) {
    const chatId = query.message.chat.id.toString();
    const data = query.data;

    this.logger.debug('Callback query received', { chatId, data });

    // Parse callback data
    const [action, ...params] = data.split(':');

    switch (action) {
      case 'rate':
        await this.handleRating(query, params);
        break;
      case 'confirm':
        await this.handleConfirmation(query, params);
        break;
      default:
        this.logger.warn('Unknown callback action', { action });
    }

    // Answer callback query to remove loading state
    await this.bot.answerCallbackQuery(query.id);
  }

  /**
   * Handle rating callback
   */
  async handleRating(query, params) {
    const [ticketId, rating] = params;
    const chatId = query.message.chat.id;

    // Emit rating event
    this.emit('feedback', {
      ticketId,
      rating: parseInt(rating),
      userId: query.from.id.toString(),
      source: 'telegram',
    });

    await this.bot.editMessageText(
      `Спасибо за оценку! Вы поставили ${rating} ⭐`,
      {
        chat_id: chatId,
        message_id: query.message.message_id,
      }
    );
  }

  /**
   * Handle confirmation callback
   */
  async handleConfirmation(query, params) {
    const [ticketId, action] = params;
    const chatId = query.message.chat.id;

    this.emit('confirmation', {
      ticketId,
      action, // 'yes' or 'no'
      userId: query.from.id.toString(),
      source: 'telegram',
    });

    const message = action === 'yes' 
      ? '✅ Отлично! Рады, что смогли помочь.'
      : '📝 Понял. Ваш запрос передан оператору.';

    await this.bot.editMessageText(message, {
      chat_id: chatId,
      message_id: query.message.message_id,
    });
  }

  /**
   * Send message to user
   */
  async sendMessage(chatId, message, options = {}) {
    // Lazy initialize bot for sending if not started
    if (!this.bot && config.telegram.botToken) {
      this.bot = new TelegramBot(config.telegram.botToken, { polling: false });
      this.logger.info('Telegram bot initialized for sending only');
    }

    if (!this.bot) {
      this.logger.error('Telegram bot not initialized');
      throw new Error('Telegram bot not configured');
    }

    const {
      parseMode = 'HTML',
      replyMarkup = null,
      replyToMessageId = null,
    } = options;

    const sendOptions = {
      parse_mode: parseMode,
      disable_web_page_preview: true,
    };

    if (replyMarkup) {
      sendOptions.reply_markup = replyMarkup;
    }

    if (replyToMessageId) {
      sendOptions.reply_to_message_id = replyToMessageId;
    }

    try {
      const sent = await this.bot.sendMessage(chatId, message, sendOptions);
      this.logger.debug('Message sent', { chatId, messageId: sent.message_id });
      return sent;
    } catch (error) {
      this.logger.error('Failed to send message', { 
        chatId, 
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Send typing indicator
   */
  async sendTypingAction(chatId) {
    try {
      await this.bot.sendChatAction(chatId, 'typing');
    } catch (error) {
      // Ignore errors for typing action
    }
  }

  /**
   * Send welcome message
   */
  async sendWelcomeMessage(chatId, userName) {
    const message = `Здравствуйте, ${userName}! 👋

Я бот технической поддержки. Опишите вашу проблему, и я постараюсь помочь.

<b>Что я умею:</b>
• Отвечать на вопросы по IT
• Помогать с настройкой VPN, почты, принтеров
• Создавать заявки в службу поддержки

<b>Команды:</b>
/help — Справка
/status — Статус ваших заявок

Просто напишите ваш вопрос! 💬`;

    await this.sendMessage(chatId, message);
  }

  /**
   * Send help message
   */
  async sendHelpMessage(chatId) {
    const message = `<b>Справка по боту</b>

📝 <b>Как создать заявку:</b>
Просто напишите ваш вопрос или опишите проблему. Я автоматически создам заявку и постараюсь помочь.

📎 <b>Вложения:</b>
Вы можете прикрепить фото или документы к сообщению — это поможет быстрее разобраться в проблеме.

📋 <b>Команды:</b>
/start — Начать работу
/help — Эта справка
/status — Проверить статус заявок

⏰ <b>Время работы:</b>
Бот работает круглосуточно. Операторы доступны в рабочее время (9:00-18:00).

💡 <b>Совет:</b>
Чем подробнее вы опишете проблему, тем быстрее мы сможем помочь!`;

    await this.sendMessage(chatId, message);
  }

  /**
   * Handle /status command
   */
  async handleStatusCommand(chatId, userId, text) {
    // Emit status request
    this.emit('status_request', {
      chatId,
      userId,
      source: 'telegram',
    });

    // Default message - will be replaced by actual status
    await this.sendMessage(chatId, '🔍 Проверяю статус ваших заявок...');
  }

  /**
   * Send ticket created notification
   */
  async sendTicketCreated(chatId, ticketId, summary) {
    const message = `✅ <b>Заявка создана</b>

📋 Номер: <code>${ticketId.substring(0, 8)}</code>
📝 ${summary}

Я обрабатываю ваш запрос. Пожалуйста, подождите...`;

    await this.sendMessage(chatId, message);
  }

  /**
   * Send auto-response with confirmation buttons
   */
  async sendAutoResponse(chatId, ticketId, response, kbRefs = []) {
    let message = `💡 <b>Возможное решение:</b>\n\n${response}`;

    if (kbRefs.length > 0) {
      message += `\n\n📚 <i>Источник: База знаний</i>`;
    }

    message += `\n\n<b>Это помогло решить вашу проблему?</b>`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '✅ Да, спасибо!', callback_data: `confirm:${ticketId}:yes` },
          { text: '❌ Нет, нужна помощь', callback_data: `confirm:${ticketId}:no` },
        ],
      ],
    };

    await this.sendMessage(chatId, message, { replyMarkup: keyboard });
  }

  /**
   * Send operator response
   */
  async sendOperatorResponse(chatId, response, operatorName = 'Оператор') {
    const message = `👨‍💻 <b>${operatorName}:</b>\n\n${response}`;
    await this.sendMessage(chatId, message);
  }

  /**
   * Send ticket resolved notification with rating
   */
  async sendTicketResolved(chatId, ticketId, resolution) {
    let message = `✅ <b>Заявка решена</b>\n\n${resolution}`;
    message += `\n\n<b>Оцените качество поддержки:</b>`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '⭐', callback_data: `rate:${ticketId}:1` },
          { text: '⭐⭐', callback_data: `rate:${ticketId}:2` },
          { text: '⭐⭐⭐', callback_data: `rate:${ticketId}:3` },
          { text: '⭐⭐⭐⭐', callback_data: `rate:${ticketId}:4` },
          { text: '⭐⭐⭐⭐⭐', callback_data: `rate:${ticketId}:5` },
        ],
      ],
    };

    await this.sendMessage(chatId, message, { replyMarkup: keyboard });
  }

  /**
   * Send ticket status
   */
  async sendTicketStatus(chatId, tickets) {
    if (!tickets || tickets.length === 0) {
      await this.sendMessage(chatId, '📋 У вас нет активных заявок.');
      return;
    }

    let message = `📋 <b>Ваши заявки:</b>\n\n`;

    const statusEmoji = {
      new: '🆕',
      draft_pending: '📝',
      in_progress: '🔄',
      waiting_user: '⏳',
      resolved: '✅',
      closed: '✔️',
      escalated: '🔴',
    };

    for (const ticket of tickets.slice(0, 5)) {
      const emoji = statusEmoji[ticket.status] || '📌';
      message += `${emoji} <code>${ticket.id.substring(0, 8)}</code>\n`;
      message += `   ${ticket.subject?.substring(0, 40) || 'Без темы'}...\n`;
      message += `   Статус: ${ticket.status}\n\n`;
    }

    if (tickets.length > 5) {
      message += `<i>...и ещё ${tickets.length - 5} заявок</i>`;
    }

    await this.sendMessage(chatId, message);
  }

  /**
   * Process webhook update (for webhook mode)
   */
  async processWebhookUpdate(update) {
    if (!this.bot) {
      throw new Error('Bot not initialized');
    }
    this.bot.processUpdate(update);
  }

  /**
   * Health check
   */
  async healthCheck() {
    const base = await super.healthCheck();
    
    if (this.bot && this.isRunning) {
      try {
        const me = await this.bot.getMe();
        return {
          ...base,
          status: 'healthy',
          bot: {
            username: me.username,
            id: me.id,
          },
          mode: this.mode,
        };
      } catch (error) {
        return {
          ...base,
          status: 'unhealthy',
          error: error.message,
        };
      }
    }

    return base;
  }
}

// Singleton instance
let telegramConnector = null;

export const getTelegramConnector = () => {
  if (!telegramConnector) {
    telegramConnector = new TelegramConnector();
  }
  return telegramConnector;
};

export default TelegramConnector;
