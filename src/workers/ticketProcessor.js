import dotenv from 'dotenv';
dotenv.config();

import { streams, connect as connectRedis } from '../utils/redis.js';
import db from '../utils/database.js';
import Ticket from '../models/Ticket.js';
import KnowledgeBase from '../models/KnowledgeBase.js';
import nlpService from '../services/nlp/index.js';
import logger, { logAudit } from '../utils/logger.js';
import config from '../config/index.js';

const CONSUMER_GROUP = 'processors';
const CONSUMER_NAME = `processor-${process.pid}`;
const STREAM_KEY = 'ticket_processing';

async function processTicket(ticketId, isNew) {
  logger.info('Processing ticket', { ticketId, isNew });

  try {
    const ticket = await Ticket.getTicketById(ticketId);
    if (!ticket) {
      logger.warn('Ticket not found', { ticketId });
      return;
    }

    // Skip if already processed and not new
    if (ticket.category && !isNew) {
      logger.debug('Ticket already processed, skipping', { ticketId });
      return;
    }

    // Run full NLP pipeline
    const nlpResults = await nlpService.processTicket(ticket);

    const topPrediction = nlpResults.classification.predictions[0];
    const isEscalation = nlpResults.priority.escalation_required;

    // Determine new status based on thresholds and results
    let newStatus = 'new';
    let resolvedBy = null;

    if (isEscalation) {
      // Immediate escalation
      newStatus = 'escalated';
      logger.info('Ticket escalated', { 
        ticketId, 
        reason: nlpResults.priority.escalation_reason 
      });
    } else if (
      nlpResults.triage.auto_resolvable &&
      topPrediction.confidence >= config.thresholds.autoResolve &&
      nlpResults.triage.confidence >= config.thresholds.triage &&
      nlpResults.response
    ) {
      // High confidence - create draft for approval (human-in-loop)
      newStatus = 'draft_pending';
      logger.info('High confidence response generated, pending approval', {
        ticketId,
        confidence: topPrediction.confidence,
      });
    } else if (
      topPrediction.confidence >= config.thresholds.draftMin &&
      nlpResults.response
    ) {
      // Medium confidence - also create draft but with lower priority
      newStatus = 'draft_pending';
      logger.info('Medium confidence response generated, pending approval', {
        ticketId,
        confidence: topPrediction.confidence,
      });
    } else {
      // Low confidence or no response - route to operator
      newStatus = 'in_progress';
      logger.info('Ticket routed to operator', {
        ticketId,
        reason: 'Low confidence or no auto-response available',
      });
    }

    // Save NLP results to database
    await Ticket.saveTicketNlp(ticketId, {
      category: topPrediction.category,
      categoryConf: topPrediction.confidence,
      priority: nlpResults.priority.priority,
      priorityConf: nlpResults.priority.confidence,
      triage: nlpResults.triage.auto_resolvable ? 'auto_resolvable' : 'manual',
      triageConf: nlpResults.triage.confidence,
      summary: nlpResults.response?.summary || `${topPrediction.category}: ${ticket.subject}`,
      suggestedResponse: nlpResults.response?.answer || null,
      embeddingsRef: null, // Can be set if we index tickets
    });

    // Update ticket
    await Ticket.updateTicket(ticketId, {
      status: newStatus,
      priority: nlpResults.priority.priority,
    });

    // Log audit
    logAudit(ticketId, 'system', 'nlp_processed', {
      category: topPrediction.category,
      categoryConf: topPrediction.confidence,
      priority: nlpResults.priority.priority,
      triage: nlpResults.triage.auto_resolvable ? 'auto_resolvable' : 'manual',
      newStatus,
      processingTimeMs: nlpResults.processingTimeMs,
      kbRefsUsed: nlpResults.response?.kb_refs || [],
    });

    logger.info('Ticket processed successfully', {
      ticketId,
      category: topPrediction.category,
      confidence: topPrediction.confidence,
      status: newStatus,
      processingTimeMs: nlpResults.processingTimeMs,
    });

  } catch (error) {
    logger.error('Error processing ticket', { 
      ticketId, 
      error: error.message, 
      stack: error.stack 
    });
    
    // Mark ticket as needing manual review on error
    try {
      await Ticket.updateTicket(ticketId, { status: 'in_progress' });
      logAudit(ticketId, 'system', 'nlp_error', { error: error.message });
    } catch (updateError) {
      logger.error('Failed to update ticket after error', { ticketId });
    }
    
    throw error;
  }
}

async function processOutboundMessage(data) {
  const { ticketId, source, sourceId, message } = data;
  
  logger.info('Processing outbound message', { ticketId, source });
  
  // TODO: Implement actual message sending via connectors
  // For now, just log
  logger.info('Outbound message queued', {
    ticketId,
    source,
    sourceId,
    messagePreview: message.substring(0, 100),
  });

  // Add to ticket messages
  await Ticket.addTicketMessage(ticketId, {
    sender: 'system',
    senderType: 'bot',
    content: message,
  });
}

async function startWorker() {
  logger.info('Starting ticket processor worker', { consumerName: CONSUMER_NAME });

  try {
    // Connect to Redis
    await connectRedis();
    
    // Create consumer groups
    await streams.createConsumerGroup(STREAM_KEY, CONSUMER_GROUP);
    await streams.createConsumerGroup('outbound_messages', 'senders');
    
    // Check NLP service health
    const nlpHealth = await nlpService.healthCheck();
    logger.info('NLP service health', nlpHealth);

    if (nlpHealth.overall !== 'healthy') {
      logger.warn('NLP service is not fully healthy, some features may be limited');
    }

    logger.info('Worker ready, waiting for messages...');

    // Main processing loop
    while (true) {
      try {
        // Process ticket queue
        const ticketMessages = await streams.readFromGroup(
          STREAM_KEY,
          CONSUMER_GROUP,
          CONSUMER_NAME,
          5,
          2000
        );

        for (const { id, data } of ticketMessages) {
          try {
            await processTicket(data.ticketId, data.isNew);
            await streams.ack(STREAM_KEY, CONSUMER_GROUP, id);
          } catch (error) {
            logger.error('Failed to process ticket message', { messageId: id, error: error.message });
          }
        }

        // Process outbound message queue
        const outboundMessages = await streams.readFromGroup(
          'outbound_messages',
          'senders',
          CONSUMER_NAME,
          5,
          1000
        );

        for (const { id, data } of outboundMessages) {
          try {
            await processOutboundMessage(data);
            await streams.ack('outbound_messages', 'senders', id);
          } catch (error) {
            logger.error('Failed to process outbound message', { messageId: id, error: error.message });
          }
        }

      } catch (error) {
        if (error.message.includes('NOGROUP')) {
          await streams.createConsumerGroup(STREAM_KEY, CONSUMER_GROUP);
          await streams.createConsumerGroup('outbound_messages', 'senders');
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
    await db.close();
  } catch (error) {
    logger.error('Error during shutdown', { error: error.message });
  }
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

startWorker();
