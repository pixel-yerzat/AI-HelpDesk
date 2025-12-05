import dotenv from 'dotenv';
dotenv.config();

import { streams, connect as connectRedis } from '../utils/redis.js';
import db from '../utils/database.js';
import Ticket from '../models/Ticket.js';
import connectorManager from '../services/connectors/index.js';
import logger from '../utils/logger.js';

const CONSUMER_GROUP = 'senders';
const CONSUMER_NAME = `sender-${process.pid}`;
const STREAM_KEY = 'outbound_messages';

async function processOutboundMessage(data) {
  const { ticketId, source, sourceId, message, options = {} } = data;

  logger.info('Processing outbound message', { ticketId, source });

  try {
    // Send via connector
    await connectorManager.sendResponse(ticketId, message, options);

    logger.info('Outbound message sent', {
      ticketId,
      source,
      messagePreview: message.substring(0, 50),
    });

  } catch (error) {
    logger.error('Failed to send outbound message', {
      ticketId,
      source,
      error: error.message,
    });
    throw error;
  }
}

async function processResolutionNotification(data) {
  const { ticketId, resolution } = data;

  logger.info('Processing resolution notification', { ticketId });

  try {
    await connectorManager.sendResolutionNotification(ticketId, resolution);
    logger.info('Resolution notification sent', { ticketId });
  } catch (error) {
    logger.error('Failed to send resolution notification', {
      ticketId,
      error: error.message,
    });
  }
}

async function startWorker() {
  logger.info('Starting outbound message worker', { consumerName: CONSUMER_NAME });

  try {
    // Connect to Redis
    await connectRedis();

    // Start connectors (for sending only, not receiving)
    // In production, you might want separate processes for receiving
    await connectorManager.startAll({
      telegram: true,
      email: true,
      telegramMode: 'polling', // or 'webhook' in production
    });

    // Create consumer groups
    await streams.createConsumerGroup(STREAM_KEY, CONSUMER_GROUP);
    await streams.createConsumerGroup('resolution_notifications', 'notifiers');

    logger.info('Worker ready, waiting for messages...');

    // Main processing loop
    while (true) {
      try {
        // Process outbound messages
        const outboundMessages = await streams.readFromGroup(
          STREAM_KEY,
          CONSUMER_GROUP,
          CONSUMER_NAME,
          10,
          2000
        );

        for (const { id, data } of outboundMessages) {
          try {
            await processOutboundMessage(data);
            await streams.ack(STREAM_KEY, CONSUMER_GROUP, id);
          } catch (error) {
            logger.error('Failed to process outbound message', { 
              messageId: id, 
              error: error.message,
            });
            // Don't ack - will be retried
          }
        }

        // Process resolution notifications
        const resolutionMessages = await streams.readFromGroup(
          'resolution_notifications',
          'notifiers',
          CONSUMER_NAME,
          10,
          1000
        );

        for (const { id, data } of resolutionMessages) {
          try {
            await processResolutionNotification(data);
            await streams.ack('resolution_notifications', 'notifiers', id);
          } catch (error) {
            logger.error('Failed to process resolution notification', {
              messageId: id,
              error: error.message,
            });
          }
        }

      } catch (error) {
        if (error.message.includes('NOGROUP')) {
          await streams.createConsumerGroup(STREAM_KEY, CONSUMER_GROUP);
          await streams.createConsumerGroup('resolution_notifications', 'notifiers');
        } else {
          logger.error('Error reading from stream', { error: error.message });
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }

  } catch (error) {
    logger.error('Worker failed to start', { error: error.message });
    process.exit(1);
  }
}

// Graceful shutdown
const shutdown = async (signal) => {
  logger.info(`Worker received ${signal}, shutting down...`);
  try {
    await connectorManager.stopAll();
    await db.close();
  } catch (error) {
    logger.error('Error during shutdown', { error: error.message });
  }
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

startWorker();
