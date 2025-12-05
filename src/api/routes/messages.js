import { Router } from 'express';
import { validationResult } from 'express-validator';
import Ticket from '../../models/Ticket.js';
import User from '../../models/User.js';
import { asyncHandler, ApiError, formatValidationErrors } from '../middleware/errorHandler.js';
import { ingestMessageValidator } from '../validators/index.js';
import { streams } from '../../utils/redis.js';
import logger from '../../utils/logger.js';

const router = Router();

// Main message ingest endpoint
router.post('/',
  ingestMessageValidator,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw ApiError.badRequest('Validation failed', formatValidationErrors(errors));
    }

    const { source, source_id, user: userData, subject, body, attachments = [] } = req.body;

    logger.info('Message ingested', { source, source_id });

    // Find or create user
    let user = null;
    if (userData?.id) {
      user = await User.findOrCreateByExternalId(userData.id, source, {
        name: userData.name,
        email: userData.email,
      });
    }

    // Check for existing open ticket from same source
    const existingTicket = await Ticket.getTicketBySourceId(source, source_id);

    let ticket;
    if (existingTicket) {
      // Add message to existing ticket
      await Ticket.addTicketMessage(existingTicket.id, {
        sender: user?.id || source_id,
        senderType: 'user',
        content: body,
        attachments,
      });

      // Update ticket status if it was waiting for user
      if (existingTicket.status === 'waiting_user') {
        await Ticket.updateTicket(existingTicket.id, { status: 'in_progress' });
      }

      ticket = await Ticket.getTicketById(existingTicket.id);

      logger.info('Message added to existing ticket', { ticketId: ticket.id });
    } else {
      // Create new ticket
      ticket = await Ticket.createTicket({
        source,
        sourceId: source_id,
        userId: user?.id,
        subject: subject || body.substring(0, 100),
        body,
        attachments,
      });

      // Add initial message
      await Ticket.addTicketMessage(ticket.id, {
        sender: user?.id || source_id,
        senderType: 'user',
        content: body,
        attachments,
      });

      logger.info('New ticket created', { ticketId: ticket.id });
    }

    // Push to processing queue
    await streams.addToStream('ticket_processing', {
      ticketId: ticket.id,
      isNew: !existingTicket,
      source,
      timestamp: new Date().toISOString(),
    });

    res.status(201).json({
      success: true,
      ticket_id: ticket.id,
      is_new: !existingTicket,
      message: existingTicket ? 'Message added to existing ticket' : 'New ticket created',
    });
  })
);

// Telegram webhook
router.post('/webhooks/telegram',
  asyncHandler(async (req, res) => {
    const update = req.body;

    // Acknowledge immediately
    res.status(200).json({ ok: true });

    try {
      // Handle message
      if (update.message) {
        const msg = update.message;
        const chatId = msg.chat.id.toString();
        const userId = msg.from.id.toString();
        const userName = [msg.from.first_name, msg.from.last_name].filter(Boolean).join(' ');

        // Extract text
        const text = msg.text || msg.caption || '';
        if (!text) return;

        // Build attachments list
        const attachments = [];
        if (msg.photo) {
          attachments.push({
            type: 'photo',
            file_id: msg.photo[msg.photo.length - 1].file_id,
          });
        }
        if (msg.document) {
          attachments.push({
            type: 'document',
            file_id: msg.document.file_id,
            filename: msg.document.file_name,
          });
        }

        // Ingest message
        await ingestMessage({
          source: 'telegram',
          source_id: chatId,
          user: { id: userId, name: userName },
          subject: text.substring(0, 100),
          body: text,
          attachments,
        });
      }

      // Handle callback queries (for mini-app buttons)
      if (update.callback_query) {
        logger.info('Telegram callback query received', { data: update.callback_query.data });
        // TODO: Handle callback queries
      }
    } catch (error) {
      logger.error('Error processing Telegram webhook', { error: error.message });
    }
  })
);

// WhatsApp webhook (360dialog / Twilio style)
router.post('/webhooks/whatsapp',
  asyncHandler(async (req, res) => {
    const { messages, contacts } = req.body;

    // Acknowledge immediately
    res.status(200).json({ status: 'received' });

    try {
      if (!messages || messages.length === 0) return;

      for (const msg of messages) {
        const phoneNumber = msg.from;
        const contact = contacts?.find(c => c.wa_id === phoneNumber);
        const userName = contact?.profile?.name || phoneNumber;

        let text = '';
        const attachments = [];

        // Extract content based on message type
        switch (msg.type) {
          case 'text':
            text = msg.text?.body || '';
            break;
          case 'image':
            attachments.push({ type: 'image', id: msg.image.id, caption: msg.image.caption });
            text = msg.image.caption || '[Image]';
            break;
          case 'document':
            attachments.push({ type: 'document', id: msg.document.id, filename: msg.document.filename });
            text = msg.document.caption || '[Document]';
            break;
          default:
            text = `[${msg.type}]`;
        }

        await ingestMessage({
          source: 'whatsapp',
          source_id: phoneNumber,
          user: { id: phoneNumber, name: userName },
          subject: text.substring(0, 100),
          body: text,
          attachments,
        });
      }
    } catch (error) {
      logger.error('Error processing WhatsApp webhook', { error: error.message });
    }
  })
);

// Email webhook (for email forwarding services or custom polling)
router.post('/webhooks/email',
  asyncHandler(async (req, res) => {
    const { from, to, subject, text, html, attachments = [] } = req.body;

    res.status(200).json({ status: 'received' });

    try {
      const emailAddress = typeof from === 'string' ? from : from?.address || from?.email;
      const senderName = typeof from === 'object' ? from.name : emailAddress;

      await ingestMessage({
        source: 'email',
        source_id: emailAddress,
        user: { id: emailAddress, name: senderName, email: emailAddress },
        subject: subject || 'No subject',
        body: text || html || '',
        attachments: attachments.map(a => ({
          filename: a.filename,
          contentType: a.contentType,
          size: a.size,
        })),
      });
    } catch (error) {
      logger.error('Error processing email webhook', { error: error.message });
    }
  })
);

// Helper function for internal ingestion
async function ingestMessage(data) {
  const { source, source_id, user: userData, subject, body, attachments } = data;

  // Find or create user
  let user = null;
  if (userData?.id) {
    user = await User.findOrCreateByExternalId(userData.id, source, {
      name: userData.name,
      email: userData.email,
    });
  }

  // Check for existing open ticket
  const existingTicket = await Ticket.getTicketBySourceId(source, source_id);

  let ticket;
  if (existingTicket) {
    await Ticket.addTicketMessage(existingTicket.id, {
      sender: user?.id || source_id,
      senderType: 'user',
      content: body,
      attachments,
    });

    if (existingTicket.status === 'waiting_user') {
      await Ticket.updateTicket(existingTicket.id, { status: 'in_progress' });
    }

    ticket = existingTicket;
  } else {
    ticket = await Ticket.createTicket({
      source,
      sourceId: source_id,
      userId: user?.id,
      subject: subject || body.substring(0, 100),
      body,
      attachments,
    });

    await Ticket.addTicketMessage(ticket.id, {
      sender: user?.id || source_id,
      senderType: 'user',
      content: body,
      attachments,
    });
  }

  // Queue for processing
  await streams.addToStream('ticket_processing', {
    ticketId: ticket.id,
    isNew: !existingTicket,
    source,
    timestamp: new Date().toISOString(),
  });

  return ticket;
}

export default router;
