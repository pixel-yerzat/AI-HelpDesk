import { getTelegramConnector } from './TelegramConnector.js';
import { getEmailConnector } from './EmailConnector.js';
import { streams } from '../../utils/redis.js';
import Ticket from '../../models/Ticket.js';
import User from '../../models/User.js';
import logger from '../../utils/logger.js';

/**
 * Connector Manager
 * Manages all channel connectors and routes messages
 */
class ConnectorManager {
  constructor() {
    this.connectors = new Map();
    this.isRunning = false;
    this.logger = logger.child({ service: 'ConnectorManager' });
  }

  /**
   * Register a connector
   */
  registerConnector(name, connector) {
    this.connectors.set(name, connector);
    
    // Set up message handler
    connector.on('message', async (messageData) => {
      await this.handleIncomingMessage(messageData);
    });

    // Set up feedback handler
    connector.on('feedback', async (feedbackData) => {
      await this.handleFeedback(feedbackData);
    });

    // Set up confirmation handler
    connector.on('confirmation', async (confirmationData) => {
      await this.handleConfirmation(confirmationData);
    });

    // Set up status request handler
    connector.on('status_request', async (requestData) => {
      await this.handleStatusRequest(requestData);
    });

    this.logger.info('Connector registered', { name });
  }

  /**
   * Start all connectors
   */
  async startAll(options = {}) {
    const { 
      telegram = true, 
      email = true,
      telegramMode = 'polling',
      emailPollInterval = 30000,
    } = options;

    this.logger.info('Starting connectors...', { telegram, email });

    // Start Telegram
    if (telegram) {
      try {
        const telegramConnector = getTelegramConnector();
        this.registerConnector('telegram', telegramConnector);
        await telegramConnector.start({ mode: telegramMode });
      } catch (error) {
        this.logger.error('Failed to start Telegram connector', { error: error.message });
      }
    }

    // Start Email
    if (email) {
      try {
        const emailConnector = getEmailConnector();
        this.registerConnector('email', emailConnector);
        await emailConnector.start({ pollIntervalMs: emailPollInterval });
      } catch (error) {
        this.logger.error('Failed to start Email connector', { error: error.message });
      }
    }

    this.isRunning = true;
    this.logger.info('Connector manager started', { 
      activeConnectors: Array.from(this.connectors.keys()),
    });
  }

  /**
   * Stop all connectors
   */
  async stopAll() {
    this.logger.info('Stopping all connectors...');

    for (const [name, connector] of this.connectors) {
      try {
        await connector.stop();
        this.logger.info('Connector stopped', { name });
      } catch (error) {
        this.logger.error('Error stopping connector', { name, error: error.message });
      }
    }

    this.connectors.clear();
    this.isRunning = false;
    this.logger.info('All connectors stopped');
  }

  /**
   * Get connector by name
   */
  getConnector(name) {
    return this.connectors.get(name);
  }

  /**
   * Handle incoming message from any channel
   */
  async handleIncomingMessage(messageData) {
    const { source, source_id, user, subject, body, attachments, raw, timestamp } = messageData;

    this.logger.info('Incoming message', { source, source_id, bodyPreview: body.substring(0, 50) });

    try {
      // Find or create user
      let dbUser = null;
      if (user?.id) {
        dbUser = await User.findOrCreateByExternalId(user.id, source, {
          name: user.name,
          email: user.email,
        });
      }

      // Check for existing open ticket
      const existingTicket = await Ticket.getTicketBySourceId(source, source_id);

      let ticket;
      let isNew = false;

      if (existingTicket) {
        // Add message to existing ticket
        await Ticket.addTicketMessage(existingTicket.id, {
          sender: dbUser?.id || source_id,
          senderType: 'user',
          content: body,
          attachments,
        });

        // Update status if waiting for user
        if (existingTicket.status === 'waiting_user') {
          await Ticket.updateTicket(existingTicket.id, { status: 'in_progress' });
        }

        ticket = await Ticket.getTicketById(existingTicket.id);
        this.logger.info('Message added to existing ticket', { ticketId: ticket.id });

      } else {
        // Create new ticket
        ticket = await Ticket.createTicket({
          source,
          sourceId: source_id,
          userId: dbUser?.id,
          subject: subject || body.substring(0, 100),
          body,
          attachments,
        });

        // Add initial message
        await Ticket.addTicketMessage(ticket.id, {
          sender: dbUser?.id || source_id,
          senderType: 'user',
          content: body,
          attachments,
        });

        isNew = true;
        this.logger.info('New ticket created', { ticketId: ticket.id });

        // Send acknowledgment
        await this.sendAcknowledgment(source, source_id, ticket);
      }

      // Queue for NLP processing
      await streams.addToStream('ticket_processing', {
        ticketId: ticket.id,
        isNew,
        source,
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      this.logger.error('Error handling incoming message', { 
        source, 
        source_id, 
        error: error.message,
      });
    }
  }

  /**
   * Send acknowledgment for new ticket
   */
  async sendAcknowledgment(source, sourceId, ticket) {
    const connector = this.getConnector(source);
    if (!connector) return;

    try {
      if (source === 'telegram') {
        await connector.sendTicketCreated(
          sourceId,
          ticket.id,
          ticket.summary || ticket.subject
        );
      } else if (source === 'email') {
        await connector.sendTicketCreated(
          sourceId,
          ticket.id,
          ticket.subject,
          ticket.raw?.messageId
        );
      }
    } catch (error) {
      this.logger.error('Error sending acknowledgment', { 
        source, 
        sourceId, 
        error: error.message,
      });
    }
  }

  /**
   * Send response to user
   */
  async sendResponse(ticketId, response, options = {}) {
    const ticket = await Ticket.getTicketById(ticketId);
    if (!ticket) {
      this.logger.warn('Ticket not found for response', { ticketId });
      return;
    }

    const connector = this.getConnector(ticket.source);
    if (!connector) {
      this.logger.warn('No connector for source', { source: ticket.source });
      return;
    }

    const { isAutoResponse = false, operatorName = null, kbRefs = [] } = options;

    try {
      if (ticket.source === 'telegram') {
        if (isAutoResponse) {
          await connector.sendAutoResponse(
            ticket.source_id,
            ticket.id,
            response,
            kbRefs
          );
        } else {
          await connector.sendOperatorResponse(
            ticket.source_id,
            response,
            operatorName
          );
        }
      } else if (ticket.source === 'email') {
        const messageId = ticket.raw?.messageId;
        if (isAutoResponse) {
          await connector.sendAutoResponse(
            ticket.source_id,
            ticket.id,
            ticket.subject,
            response,
            messageId
          );
        } else {
          await connector.sendOperatorResponse(
            ticket.source_id,
            ticket.id,
            ticket.subject,
            response,
            operatorName || 'Оператор',
            messageId
          );
        }
      }

      // Add message to ticket
      await Ticket.addTicketMessage(ticketId, {
        sender: isAutoResponse ? 'system' : 'operator',
        senderType: isAutoResponse ? 'bot' : 'operator',
        content: response,
      });

      this.logger.info('Response sent', { ticketId, source: ticket.source, isAutoResponse });

    } catch (error) {
      this.logger.error('Error sending response', { 
        ticketId, 
        source: ticket.source,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Send ticket resolved notification
   */
  async sendResolutionNotification(ticketId, resolution) {
    const ticket = await Ticket.getTicketById(ticketId);
    if (!ticket) return;

    const connector = this.getConnector(ticket.source);
    if (!connector) return;

    try {
      if (ticket.source === 'telegram') {
        await connector.sendTicketResolved(ticket.source_id, ticket.id, resolution);
      } else if (ticket.source === 'email') {
        await connector.sendTicketResolved(
          ticket.source_id,
          ticket.id,
          ticket.subject,
          resolution,
          ticket.raw?.messageId
        );
      }

      this.logger.info('Resolution notification sent', { ticketId, source: ticket.source });

    } catch (error) {
      this.logger.error('Error sending resolution notification', { 
        ticketId, 
        error: error.message,
      });
    }
  }

  /**
   * Handle feedback from user
   */
  async handleFeedback(feedbackData) {
    const { ticketId, rating, userId, source } = feedbackData;

    this.logger.info('Feedback received', { ticketId, rating, source });

    try {
      // Save feedback to database
      await Ticket.addTicketMessage(ticketId, {
        sender: userId,
        senderType: 'user',
        content: `Оценка: ${rating} ⭐`,
      });

      // Could also save to separate feedback table for analytics
      // await Feedback.create({ ticketId, rating, userId, source });

    } catch (error) {
      this.logger.error('Error handling feedback', { ticketId, error: error.message });
    }
  }

  /**
   * Handle confirmation (was solution helpful?)
   */
  async handleConfirmation(confirmationData) {
    const { ticketId, action, userId, source } = confirmationData;

    this.logger.info('Confirmation received', { ticketId, action, source });

    try {
      if (action === 'yes') {
        // Mark ticket as resolved
        await Ticket.updateTicket(ticketId, {
          status: 'resolved',
          resolved_by: 'auto_confirmed',
          resolution_text: 'Пользователь подтвердил решение',
        });
      } else {
        // Route to operator
        await Ticket.updateTicket(ticketId, { status: 'in_progress' });
        
        await Ticket.addTicketMessage(ticketId, {
          sender: 'system',
          senderType: 'system',
          content: 'Пользователь указал, что автоматический ответ не помог. Требуется помощь оператора.',
        });
      }

    } catch (error) {
      this.logger.error('Error handling confirmation', { ticketId, error: error.message });
    }
  }

  /**
   * Handle status request from user
   */
  async handleStatusRequest(requestData) {
    const { chatId, userId, source } = requestData;

    this.logger.debug('Status request', { userId, source });

    try {
      // Get user's tickets
      const user = await User.getUserByExternalId(userId, source);
      if (!user) {
        const connector = this.getConnector(source);
        if (connector && source === 'telegram') {
          await connector.sendMessage(chatId, '📋 У вас пока нет заявок.');
        }
        return;
      }

      // Get open tickets
      const result = await Ticket.getTickets(
        { userId: user.id, status: ['new', 'in_progress', 'draft_pending', 'waiting_user'] },
        { limit: 10 }
      );

      const connector = this.getConnector(source);
      if (connector && source === 'telegram') {
        await connector.sendTicketStatus(chatId, result.tickets);
      }

    } catch (error) {
      this.logger.error('Error handling status request', { userId, error: error.message });
    }
  }

  /**
   * Health check for all connectors
   */
  async healthCheck() {
    const results = {
      overall: 'healthy',
      connectors: {},
    };

    for (const [name, connector] of this.connectors) {
      try {
        results.connectors[name] = await connector.healthCheck();
        if (results.connectors[name].status !== 'healthy' && 
            results.connectors[name].status !== 'running') {
          results.overall = 'degraded';
        }
      } catch (error) {
        results.connectors[name] = { status: 'error', error: error.message };
        results.overall = 'degraded';
      }
    }

    return results;
  }
}

// Singleton instance
const connectorManager = new ConnectorManager();

export default connectorManager;
export { ConnectorManager };
