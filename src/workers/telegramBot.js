#!/usr/bin/env node

/**
 * Standalone Telegram Bot Service
 * Can be run separately from main API for better scaling
 */

import dotenv from 'dotenv';
dotenv.config();

import { getTelegramConnector } from '../services/connectors/TelegramConnector.js';
import { streams, connect as connectRedis } from '../utils/redis.js';
import db from '../utils/database.js';
import Ticket from '../models/Ticket.js';
import User from '../models/User.js';
import logger from '../utils/logger.js';

const telegramBot = getTelegramConnector();

async function handleIncomingMessage(messageData) {
  const { source, source_id, user, subject, body, attachments, raw, timestamp } = messageData;

  logger.info('Telegram message received', { 
    chatId: source_id, 
    bodyPreview: body.substring(0, 50),
  });

  try {
    // Find or create user
    let dbUser = null;
    if (user?.id) {
      dbUser = await User.findOrCreateByExternalId(user.id, 'telegram', {
        name: user.name,
      });
    }

    // Check for existing open ticket
    const existingTicket = await Ticket.getTicketBySourceId('telegram', source_id);

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
        source: 'telegram',
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
      logger.info('New ticket created', { ticketId: ticket.id });

      // Send acknowledgment
      await telegramBot.sendTicketCreated(
        source_id,
        ticket.id,
        ticket.subject
      );
    }

    // Queue for NLP processing
    await streams.addToStream('ticket_processing', {
      ticketId: ticket.id,
      isNew,
      source: 'telegram',
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    logger.error('Error handling message', { error: error.message });
    
    // Try to notify user about error
    try {
      await telegramBot.sendMessage(
        source_id,
        '❌ Произошла ошибка при обработке вашего сообщения. Пожалуйста, попробуйте позже.'
      );
    } catch (sendError) {
      // Ignore
    }
  }
}

async function handleFeedback(feedbackData) {
  const { ticketId, rating, userId } = feedbackData;
  logger.info('Feedback received', { ticketId, rating });

  try {
    await Ticket.addTicketMessage(ticketId, {
      sender: userId,
      senderType: 'user',
      content: `Оценка: ${rating} ⭐`,
    });
  } catch (error) {
    logger.error('Error saving feedback', { error: error.message });
  }
}

async function handleConfirmation(confirmationData) {
  const { ticketId, action, userId } = confirmationData;
  logger.info('Confirmation received', { ticketId, action });

  try {
    if (action === 'yes') {
      await Ticket.updateTicket(ticketId, {
        status: 'resolved',
        resolved_by: 'auto_confirmed',
        resolution_text: 'Пользователь подтвердил решение',
      });
    } else {
      await Ticket.updateTicket(ticketId, { status: 'in_progress' });
      await Ticket.addTicketMessage(ticketId, {
        sender: 'system',
        senderType: 'system',
        content: 'Автоответ не помог. Требуется оператор.',
      });
    }
  } catch (error) {
    logger.error('Error handling confirmation', { error: error.message });
  }
}

async function handleStatusRequest(requestData) {
  const { chatId, userId } = requestData;
  logger.debug('Status request', { userId });

  try {
    const user = await User.getUserByExternalId(userId, 'telegram');
    
    if (!user) {
      await telegramBot.sendMessage(chatId, '📋 У вас пока нет заявок.');
      return;
    }

    const result = await Ticket.getTickets(
      { status: 'new' }, // Simplified - should filter by user
      { limit: 5 }
    );

    await telegramBot.sendTicketStatus(chatId, result.tickets);

  } catch (error) {
    logger.error('Error handling status request', { error: error.message });
  }
}

async function processOutboundQueue() {
  // Process outbound messages from Redis stream
  const STREAM_KEY = 'outbound_messages';
  const CONSUMER_GROUP = 'telegram_senders';
  const CONSUMER_NAME = `telegram-${process.pid}`;

  try {
    await streams.createConsumerGroup(STREAM_KEY, CONSUMER_GROUP);
  } catch (error) {
    // Group might already exist
  }

  while (true) {
    try {
      const messages = await streams.readFromGroup(
        STREAM_KEY,
        CONSUMER_GROUP,
        CONSUMER_NAME,
        5,
        2000
      );

      for (const { id, data } of messages) {
        if (data.source !== 'telegram') {
          await streams.ack(STREAM_KEY, CONSUMER_GROUP, id);
          continue;
        }

        try {
          const { ticketId, sourceId, message, options = {} } = data;

          if (options.isAutoResponse) {
            await telegramBot.sendAutoResponse(sourceId, ticketId, message, options.kbRefs);
          } else {
            await telegramBot.sendOperatorResponse(sourceId, message, options.operatorName);
          }

          // Record in ticket
          await Ticket.addTicketMessage(ticketId, {
            sender: options.isAutoResponse ? 'system' : 'operator',
            senderType: options.isAutoResponse ? 'bot' : 'operator',
            content: message,
          });

          await streams.ack(STREAM_KEY, CONSUMER_GROUP, id);
          logger.info('Outbound message sent', { ticketId });

        } catch (error) {
          logger.error('Error sending outbound message', { messageId: id, error: error.message });
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
  logger.info('Starting Telegram Bot Service');

  try {
    // Connect to Redis
    await connectRedis();
    logger.info('Redis connected');

    // Set up event handlers
    telegramBot.on('message', handleIncomingMessage);
    telegramBot.on('feedback', handleFeedback);
    telegramBot.on('confirmation', handleConfirmation);
    telegramBot.on('status_request', handleStatusRequest);

    // Start bot
    await telegramBot.start({ mode: 'polling' });
    
    const health = await telegramBot.healthCheck();
    logger.info('Telegram bot started', health);

    // Start outbound message processor
    processOutboundQueue().catch(error => {
      logger.error('Outbound queue processor failed', { error: error.message });
    });

    logger.info('Telegram Bot Service running');

  } catch (error) {
    logger.error('Failed to start Telegram Bot Service', { error: error.message });
    process.exit(1);
  }
}

// Graceful shutdown
const shutdown = async (signal) => {
  logger.info(`Received ${signal}, shutting down...`);
  try {
    await telegramBot.stop();
    await db.close();
  } catch (error) {
    logger.error('Error during shutdown', { error: error.message });
  }
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();
