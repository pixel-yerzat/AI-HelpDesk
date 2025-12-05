import Imap from 'imap';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import { BaseConnector } from './BaseConnector.js';
import config from '../../config/index.js';
import { cache } from '../../utils/redis.js';

/**
 * Email Connector with IMAP polling and SMTP sending
 */
export class EmailConnector extends BaseConnector {
  constructor() {
    super('email');
    this.imap = null;
    this.smtpTransport = null;
    this.pollInterval = null;
    this.pollIntervalMs = 30000; // 30 seconds
    this.lastSeenUid = null;
  }

  /**
   * Start the email connector
   */
  async start(options = {}) {
    const { pollIntervalMs = 30000 } = options;
    this.pollIntervalMs = pollIntervalMs;

    // Validate config
    if (!config.email.imap.host || !config.email.imap.user) {
      this.logger.error('Email IMAP not configured');
      throw new Error('Email IMAP configuration required');
    }

    // Initialize SMTP transport for sending
    this.initSmtpTransport();

    // Get last seen UID from cache
    this.lastSeenUid = await cache.get('email:lastSeenUid') || 0;

    // Start IMAP polling
    await this.startPolling();

    await super.start();
  }

  /**
   * Stop the connector
   */
  async stop() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    if (this.imap) {
      this.imap.end();
      this.imap = null;
    }

    if (this.smtpTransport) {
      this.smtpTransport.close();
      this.smtpTransport = null;
    }

    await super.stop();
  }

  /**
   * Initialize SMTP transport
   */
  initSmtpTransport() {
    if (!config.email.smtp.host) {
      this.logger.warn('SMTP not configured, sending disabled');
      return;
    }

    this.smtpTransport = nodemailer.createTransport({
      host: config.email.smtp.host,
      port: config.email.smtp.port,
      secure: config.email.smtp.port === 465,
      auth: {
        user: config.email.smtp.user,
        pass: config.email.smtp.password,
      },
    });

    this.logger.info('SMTP transport initialized');
  }

  /**
   * Start IMAP polling
   */
  async startPolling() {
    // Initial fetch
    await this.fetchNewEmails();

    // Set up interval
    this.pollInterval = setInterval(async () => {
      try {
        await this.fetchNewEmails();
      } catch (error) {
        this.logger.error('Error polling emails', { error: error.message });
      }
    }, this.pollIntervalMs);

    this.logger.info('Email polling started', { 
      intervalMs: this.pollIntervalMs,
    });
  }

  /**
   * Create IMAP connection
   */
  createImapConnection() {
    return new Promise((resolve, reject) => {
      const imap = new Imap({
        user: config.email.imap.user,
        password: config.email.imap.password,
        host: config.email.imap.host,
        port: config.email.imap.port,
        tls: config.email.imap.tls,
        tlsOptions: { rejectUnauthorized: false },
      });

      imap.once('ready', () => {
        resolve(imap);
      });

      imap.once('error', (err) => {
        reject(err);
      });

      imap.connect();
    });
  }

  /**
   * Fetch new emails from IMAP
   */
  async fetchNewEmails() {
    let imap = null;

    try {
      imap = await this.createImapConnection();

      await new Promise((resolve, reject) => {
        imap.openBox('INBOX', false, (err, box) => {
          if (err) reject(err);
          else resolve(box);
        });
      });

      // Search for unseen messages
      const uids = await new Promise((resolve, reject) => {
        const searchCriteria = this.lastSeenUid > 0 
          ? [['UID', `${this.lastSeenUid + 1}:*`], 'UNSEEN']
          : ['UNSEEN'];

        imap.search(searchCriteria, (err, results) => {
          if (err) reject(err);
          else resolve(results || []);
        });
      });

      if (uids.length === 0) {
        this.logger.debug('No new emails');
        imap.end();
        return;
      }

      this.logger.info(`Found ${uids.length} new emails`);

      // Fetch messages
      const fetch = imap.fetch(uids, {
        bodies: '',
        markSeen: true,
        struct: true,
      });

      const messages = [];

      fetch.on('message', (msg, seqno) => {
        let uid = null;
        let buffer = '';

        msg.on('body', (stream) => {
          stream.on('data', (chunk) => {
            buffer += chunk.toString('utf8');
          });
        });

        msg.once('attributes', (attrs) => {
          uid = attrs.uid;
        });

        msg.once('end', () => {
          messages.push({ uid, raw: buffer });
        });
      });

      await new Promise((resolve, reject) => {
        fetch.once('error', reject);
        fetch.once('end', resolve);
      });

      // Process messages
      for (const { uid, raw } of messages) {
        try {
          await this.processEmail(raw, uid);
          
          // Update last seen UID
          if (uid > this.lastSeenUid) {
            this.lastSeenUid = uid;
            await cache.set('email:lastSeenUid', uid, 86400 * 30); // 30 days
          }
        } catch (error) {
          this.logger.error('Error processing email', { uid, error: error.message });
        }
      }

      imap.end();

    } catch (error) {
      this.logger.error('IMAP fetch error', { error: error.message });
      if (imap) {
        imap.end();
      }
      throw error;
    }
  }

  /**
   * Process a single email
   */
  async processEmail(rawEmail, uid) {
    const parsed = await simpleParser(rawEmail);

    // Extract sender info
    const from = parsed.from?.value?.[0] || {};
    const senderEmail = from.address || 'unknown@unknown.com';
    const senderName = from.name || senderEmail.split('@')[0];

    // Skip auto-replies and system messages
    if (this.isAutoReply(parsed)) {
      this.logger.debug('Skipping auto-reply email', { from: senderEmail });
      return;
    }

    // Skip if from our own address (avoid loops)
    if (senderEmail.toLowerCase() === config.email.imap.user?.toLowerCase()) {
      this.logger.debug('Skipping own email', { from: senderEmail });
      return;
    }

    // Extract subject and body
    const subject = parsed.subject || 'Без темы';
    const body = this.extractBody(parsed);

    // Process attachments
    const attachments = this.processAttachments(parsed.attachments || []);

    // Extract thread ID for conversation tracking
    const threadId = this.extractThreadId(parsed);

    // Emit message
    this.emitMessage({
      sourceId: threadId || senderEmail,
      user: {
        id: senderEmail,
        name: senderName,
        email: senderEmail,
      },
      subject: this.cleanSubject(subject),
      body,
      attachments,
      raw: {
        uid,
        messageId: parsed.messageId,
        inReplyTo: parsed.inReplyTo,
        references: parsed.references,
        headers: this.extractHeaders(parsed),
      },
      timestamp: parsed.date?.toISOString() || new Date().toISOString(),
    });

    this.logger.debug('Email processed', { 
      from: senderEmail,
      subject: subject.substring(0, 50),
      uid,
    });
  }

  /**
   * Check if email is auto-reply
   */
  isAutoReply(parsed) {
    const headers = parsed.headers;
    
    // Check common auto-reply headers
    if (headers.get('auto-submitted') && headers.get('auto-submitted') !== 'no') {
      return true;
    }
    
    if (headers.get('x-auto-response-suppress')) {
      return true;
    }

    if (headers.get('precedence') === 'auto_reply') {
      return true;
    }

    // Check subject for common auto-reply patterns
    const subject = (parsed.subject || '').toLowerCase();
    const autoReplyPatterns = [
      'automatic reply',
      'auto-reply',
      'autoreply',
      'out of office',
      'отсутствую',
      'автоматический ответ',
      'автоответ',
    ];

    return autoReplyPatterns.some(pattern => subject.includes(pattern));
  }

  /**
   * Extract body from parsed email
   */
  extractBody(parsed) {
    // Prefer plain text
    if (parsed.text) {
      return this.cleanEmailBody(parsed.text);
    }

    // Fall back to HTML (stripped)
    if (parsed.html) {
      return this.stripHtml(parsed.html);
    }

    return '';
  }

  /**
   * Clean email body
   */
  cleanEmailBody(text) {
    // Remove quoted text (previous messages in thread)
    const lines = text.split('\n');
    const cleanedLines = [];
    let inQuote = false;

    for (const line of lines) {
      // Detect quote markers
      if (line.startsWith('>') || 
          line.startsWith('On ') && line.includes(' wrote:') ||
          line.match(/^-{3,}/) ||
          line.match(/^_{3,}/) ||
          line.includes('Original Message') ||
          line.includes('Исходное сообщение') ||
          line.match(/^\d{1,2}[./]\d{1,2}[./]\d{2,4}.*wrote:/)) {
        inQuote = true;
        continue;
      }

      if (!inQuote) {
        cleanedLines.push(line);
      }
    }

    return cleanedLines.join('\n').trim();
  }

  /**
   * Strip HTML tags
   */
  stripHtml(html) {
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Clean subject line
   */
  cleanSubject(subject) {
    return subject
      .replace(/^(Re:|Fwd:|FW:|RE:|ОТВ:|Отв:)\s*/gi, '')
      .trim();
  }

  /**
   * Extract thread ID for conversation tracking
   */
  extractThreadId(parsed) {
    // Use References or In-Reply-To header to track conversation
    if (parsed.references && parsed.references.length > 0) {
      return parsed.references[0];
    }
    if (parsed.inReplyTo) {
      return parsed.inReplyTo;
    }
    return null;
  }

  /**
   * Extract relevant headers
   */
  extractHeaders(parsed) {
    return {
      messageId: parsed.messageId,
      inReplyTo: parsed.inReplyTo,
      references: parsed.references,
      date: parsed.date,
    };
  }

  /**
   * Process attachments
   */
  processAttachments(attachments) {
    return attachments.map(att => ({
      type: 'attachment',
      filename: att.filename,
      contentType: att.contentType,
      size: att.size,
      content: att.content, // Buffer - need to upload to S3
    }));
  }

  /**
   * Send email message
   */
  async sendMessage(recipientEmail, message, options = {}) {
    if (!this.smtpTransport) {
      throw new Error('SMTP transport not initialized');
    }

    const {
      subject = 'Ответ от службы поддержки',
      ticketId = null,
      inReplyTo = null,
      references = null,
      isHtml = false,
    } = options;

    // Add ticket reference to subject if available
    let finalSubject = subject;
    if (ticketId) {
      finalSubject = `[Ticket #${ticketId.substring(0, 8)}] ${subject}`;
    }

    const mailOptions = {
      from: config.email.smtp.from,
      to: recipientEmail,
      subject: finalSubject,
      [isHtml ? 'html' : 'text']: message,
    };

    // Add threading headers
    if (inReplyTo) {
      mailOptions.inReplyTo = inReplyTo;
    }
    if (references) {
      mailOptions.references = Array.isArray(references) 
        ? references.join(' ') 
        : references;
    }

    try {
      const info = await this.smtpTransport.sendMail(mailOptions);
      
      this.logger.debug('Email sent', {
        to: recipientEmail,
        subject: finalSubject,
        messageId: info.messageId,
      });

      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (error) {
      this.logger.error('Failed to send email', {
        to: recipientEmail,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Send ticket created notification
   */
  async sendTicketCreated(recipientEmail, ticketId, subject, originalMessageId) {
    const message = `Здравствуйте!

Ваше обращение получено и зарегистрировано.

📋 Номер заявки: ${ticketId.substring(0, 8)}
📝 Тема: ${subject}

Мы обработаем ваш запрос в ближайшее время.

---
Это автоматическое уведомление. Пожалуйста, отвечайте на это письмо для продолжения диалога.

С уважением,
Служба технической поддержки`;

    await this.sendMessage(recipientEmail, message, {
      subject: `Re: ${subject}`,
      ticketId,
      inReplyTo: originalMessageId,
      references: originalMessageId,
    });
  }

  /**
   * Send auto-response
   */
  async sendAutoResponse(recipientEmail, ticketId, subject, response, originalMessageId) {
    const message = `Здравствуйте!

${response}

---
Если это решило вашу проблему, вы можете просто ответить "Решено" на это письмо.
Если вам нужна дополнительная помощь, опишите, что именно не работает.

📋 Номер заявки: ${ticketId.substring(0, 8)}

С уважением,
Служба технической поддержки`;

    await this.sendMessage(recipientEmail, message, {
      subject: `Re: ${subject}`,
      ticketId,
      inReplyTo: originalMessageId,
      references: originalMessageId,
    });
  }

  /**
   * Send operator response
   */
  async sendOperatorResponse(recipientEmail, ticketId, subject, response, operatorName, originalMessageId) {
    const message = `Здравствуйте!

${response}

---
Ответ от: ${operatorName}
📋 Номер заявки: ${ticketId.substring(0, 8)}

Отвечайте на это письмо для продолжения диалога.

С уважением,
Служба технической поддержки`;

    await this.sendMessage(recipientEmail, message, {
      subject: `Re: ${subject}`,
      ticketId,
      inReplyTo: originalMessageId,
      references: originalMessageId,
    });
  }

  /**
   * Send ticket resolved notification
   */
  async sendTicketResolved(recipientEmail, ticketId, subject, resolution, originalMessageId) {
    const message = `Здравствуйте!

Ваша заявка решена.

📋 Номер заявки: ${ticketId.substring(0, 8)}

Решение:
${resolution}

---
Если у вас остались вопросы, просто ответьте на это письмо.

Оцените качество поддержки, ответив одним числом от 1 до 5.

С уважением,
Служба технической поддержки`;

    await this.sendMessage(recipientEmail, message, {
      subject: `[Решено] Re: ${subject}`,
      ticketId,
      inReplyTo: originalMessageId,
      references: originalMessageId,
    });
  }

  /**
   * Health check
   */
  async healthCheck() {
    const base = await super.healthCheck();
    
    // Test IMAP connection
    let imapStatus = 'unknown';
    try {
      const imap = await this.createImapConnection();
      imap.end();
      imapStatus = 'healthy';
    } catch (error) {
      imapStatus = `unhealthy: ${error.message}`;
    }

    // Test SMTP connection
    let smtpStatus = 'unknown';
    if (this.smtpTransport) {
      try {
        await this.smtpTransport.verify();
        smtpStatus = 'healthy';
      } catch (error) {
        smtpStatus = `unhealthy: ${error.message}`;
      }
    } else {
      smtpStatus = 'not configured';
    }

    return {
      ...base,
      imap: imapStatus,
      smtp: smtpStatus,
      lastSeenUid: this.lastSeenUid,
      pollIntervalMs: this.pollIntervalMs,
    };
  }
}

// Singleton instance
let emailConnector = null;

export const getEmailConnector = () => {
  if (!emailConnector) {
    emailConnector = new EmailConnector();
  }
  return emailConnector;
};

export default EmailConnector;
