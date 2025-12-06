#!/usr/bin/env node

/**
 * Standalone WhatsApp Bot Service
 * Handles WhatsApp connection, message receiving, and sending
 * WhatsApp connects via QR code through the admin portal
 */

import dotenv from 'dotenv';
dotenv.config();

import { getWhatsAppConnector } from '../services/connectors/WhatsAppConnector.js';
import { streams, connect as connectRedis } from '../utils/redis.js';
import db from '../utils/database.js';
import Ticket from '../models/Ticket.js';
import User from '../models/User.js';
import logger from '../utils/logger.js';

const whatsappBot = getWhatsAppConnector();

async function handleIncomingMessage(messageData) {
  const { source, source_id, user, subject, body, attachments, raw, timestamp } = messageData;

  logger.info('WhatsApp message received', { 
    chatId: source_id, 
    bodyPreview: body.substring(0, 50),
  });

  try {
    // Find or create user
    let dbUser = null;
    if (user?.id) {
      dbUser = await User.findOrCreateByExternalId(user.id, 'whatsapp', {
        name: user.name,
        phone: user.phone,
      });
    }

    // Check for existing open ticket
    const existingTicket = await Ticket.getTicketBySourceId('whatsapp', source_id);

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

      if (existingTicket.status === 'waiting_user') {
        await Ticket.updateTicket(existingTicket.id, { status: 'in_progress' });
      }

      ticket = await Ticket.getTicketById(existingTicket.id);
      logger.info('Message added to existing ticket', { ticketId: ticket.id });

    } else {
      // Create new ticket
      ticket = await Ticket.createTicket({
        source: 'whatsapp',
        sourceId: source_id,
        userId: dbUser?.id,
        subject: subject || body.substring(0, 100),
        body,
        attachments,
      });

      await Ticket.addTicketMessage(ticket.id, {
        sender: dbUser?.id || source_id,
        senderType: 'user',
        content: body,
        attachments,
      });

      isNew = true;
      logger.info('New ticket created from WhatsApp', { ticketId: ticket.id });

      // Send acknowledgment
      try {
        await whatsappBot.sendTicketCreated(
          source_id,
          ticket.id,
          ticket.subject
        );
      } catch (error) {
        logger.error('Failed to send acknowledgment', { error: error.message });
      }
    }

    // Queue for NLP processing
    await streams.addToStream('ticket_processing', {
      ticketId: ticket.id,
      isNew,
      source: 'whatsapp',
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    logger.error('Error handling WhatsApp message', { error: error.message });
    
    // Try to notify user about error
    try {
      await whatsappBot.sendMessage(
        source_id,
        '❌ Произошла ошибка при обработке сообщения. Пожалуйста, попробуйте позже.'
      );
    } catch (sendError) {
      // Ignore
    }
  }
}

async function handleFeedback(feedbackData) {
  const { chatId, rating, userId } = feedbackData;
  logger.info('WhatsApp feedback received', { chatId, rating });

  try {
    // Find ticket by chatId
    const ticket = await Ticket.getTicketBySourceId('whatsapp', chatId);
    
    if (ticket) {
      await Ticket.addTicketMessage(ticket.id, {
        sender: userId,
        senderType: 'user',
        content: `Оценка: ${rating} ⭐`,
      });

      await whatsappBot.sendMessage(chatId, 
        `Спасибо за оценку ${rating} ⭐! Ваше мнение важно для нас.`
      );
    }
  } catch (error) {
    logger.error('Error saving WhatsApp feedback', { error: error.message });
  }
}

async function handleConfirmation(confirmationData) {
  const { chatId, action, userId } = confirmationData;
  logger.info('WhatsApp confirmation received', { chatId, action });

  try {
    // Find ticket by chatId
    const ticket = await Ticket.getTicketBySourceId('whatsapp', chatId);
    
    if (!ticket) {
      await whatsappBot.sendMessage(chatId, 
        '❓ Не нашли активную заявку. Если у вас есть вопрос, просто напишите его.'
      );
      return;
    }

    if (action === 'yes') {
      await Ticket.updateTicket(ticket.id, {
        status: 'resolved',
        resolved_by: 'auto_confirmed',
        resolution_text: 'Пользователь подтвердил решение',
      });

      await whatsappBot.sendMessage(chatId, 
        '✅ Отлично! Рады, что смогли помочь. Если возникнут вопросы — пишите!'
      );
    } else {
      await Ticket.updateTicket(ticket.id, { status: 'in_progress' });
      
      await Ticket.addTicketMessage(ticket.id, {
        sender: 'system',
        senderType: 'system',
        content: 'Автоответ не помог. Требуется оператор.',
      });

      await whatsappBot.sendMessage(chatId, 
        '📝 Понял, передаю ваш запрос оператору. Ожидайте ответа.'
      );
    }
  } catch (error) {
    logger.error('Error handling WhatsApp confirmation', { error: error.message });
  }
}

async function processOutboundQueue() {
  const STREAM_KEY = 'outbound_messages';
  const CONSUMER_GROUP = 'whatsapp_senders';
  const CONSUMER_NAME = `whatsapp-${process.pid}`;

  try {
    await streams.createConsumerGroup(STREAM_KEY, CONSUMER_GROUP);
  } catch (error) {
    // Group might already exist
  }

  while (true) {
    // Only process if connected
    if (whatsappBot.connectionState !== 'connected') {
      await new Promise(resolve => setTimeout(resolve, 5000));
      continue;
    }

    try {
      const messages = await streams.readFromGroup(
        STREAM_KEY,
        CONSUMER_GROUP,
        CONSUMER_NAME,
        5,
        2000
      );

      for (const { id, data } of messages) {
        // Only process WhatsApp messages
        if (data.source !== 'whatsapp') {
          await streams.ack(STREAM_KEY, CONSUMER_GROUP, id);
          continue;
        }

        try {
          const { ticketId, sourceId, message, options = {} } = data;

          if (options.isAutoResponse) {
            await whatsappBot.sendAutoResponse(sourceId, ticketId, message, options.kbRefs);
          } else {
            await whatsappBot.sendOperatorResponse(sourceId, message, options.operatorName);
          }

          // Record in ticket
          await Ticket.addTicketMessage(ticketId, {
            sender: options.isAutoResponse ? 'system' : 'operator',
            senderType: options.isAutoResponse ? 'bot' : 'operator',
            content: message,
          });

          await streams.ack(STREAM_KEY, CONSUMER_GROUP, id);
          logger.info('WhatsApp outbound message sent', { ticketId });

        } catch (error) {
          logger.error('Error sending WhatsApp outbound message', { messageId: id, error: error.message });
        }
      }

    } catch (error) {
      if (!error.message.includes('NOGROUP')) {
        logger.error('Error reading outbound queue', { error: error.message });
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

async function start() {
  logger.info('Starting WhatsApp Bot Service');

  try {
    // Connect to Redis
    await connectRedis();
    logger.info('Redis connected');

    // Set up event handlers
    whatsappBot.on('message', handleIncomingMessage);
    whatsappBot.on('feedback', handleFeedback);
    whatsappBot.on('confirmation', handleConfirmation);

    // Log state changes
    whatsappBot.onStateChange((state) => {
      logger.info('WhatsApp state changed', { state: state.connectionState });
    });

    // Check if we should auto-start (session exists)
    const autoStart = process.env.WHATSAPP_AUTO_START === 'true';
    
    if (autoStart) {
      logger.info('Auto-starting WhatsApp connection...');
      try {
        await whatsappBot.start();
      } catch (error) {
        logger.error('WhatsApp auto-start failed', { error: error.message });
        logger.info('WhatsApp can be connected via admin portal at /admin/whatsapp.html');
      }
    } else {
      logger.info('WhatsApp waiting for connection via admin portal');
      logger.info('Connect at: /admin/whatsapp.html');
      
      // Initialize without starting (allows API to start it)
      await whatsappBot.initialize();
    }

    // Start outbound message processor
    processOutboundQueue().catch(error => {
      logger.error('Outbound queue processor failed', { error: error.message });
    });

    logger.info('WhatsApp Bot Service running');
    logger.info('Status endpoint: GET /api/v1/whatsapp/status');

  } catch (error) {
    logger.error('Failed to start WhatsApp Bot Service', { error: error.message });
    process.exit(1);
  }
}

// Graceful shutdown
const shutdown = async (signal) => {
  logger.info(`Received ${signal}, shutting down...`);
  try {
    await whatsappBot.stop();
    await db.close();
  } catch (error) {
    logger.error('Error during shutdown', { error: error.message });
  }
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();
