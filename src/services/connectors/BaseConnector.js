import { EventEmitter } from 'events';
import logger from '../../utils/logger.js';

/**
 * Base class for all channel connectors
 * Provides common interface for receiving and sending messages
 */
export class BaseConnector extends EventEmitter {
  constructor(name) {
    super();
    this.name = name;
    this.isRunning = false;
    this.logger = logger.child({ connector: name });
  }

  /**
   * Start the connector
   */
  async start() {
    if (this.isRunning) {
      this.logger.warn('Connector already running');
      return;
    }
    this.isRunning = true;
    this.logger.info('Connector started');
  }

  /**
   * Stop the connector
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }
    this.isRunning = false;
    this.logger.info('Connector stopped');
  }

  /**
   * Send message to user
   * @param {string} recipientId - Recipient identifier (chat_id, email, phone)
   * @param {string} message - Message text
   * @param {object} options - Additional options (attachments, buttons, etc.)
   */
  async sendMessage(recipientId, message, options = {}) {
    throw new Error('sendMessage not implemented');
  }

  /**
   * Emit incoming message event
   * @param {object} messageData - Normalized message data
   */
  emitMessage(messageData) {
    const normalized = {
      source: this.name,
      source_id: messageData.sourceId,
      user: messageData.user,
      subject: messageData.subject || '',
      body: messageData.body,
      attachments: messageData.attachments || [],
      raw: messageData.raw,
      timestamp: messageData.timestamp || new Date().toISOString(),
    };

    this.logger.debug('Message received', { 
      sourceId: normalized.source_id,
      bodyPreview: normalized.body.substring(0, 50),
    });

    this.emit('message', normalized);
  }

  /**
   * Health check
   */
  async healthCheck() {
    return {
      name: this.name,
      status: this.isRunning ? 'running' : 'stopped',
    };
  }
}

export default BaseConnector;
