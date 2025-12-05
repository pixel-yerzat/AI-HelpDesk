import dotenv from 'dotenv';
dotenv.config();

import { streams, connect as connectRedis } from '../utils/redis.js';
import db from '../utils/database.js';
import Ticket from '../models/Ticket.js';
import KnowledgeBase from '../models/KnowledgeBase.js';
import logger, { logAudit } from '../utils/logger.js';
import config from '../config/index.js';
import { TICKET_CATEGORIES, ESCALATION_KEYWORDS } from '../config/categories.js';

const CONSUMER_GROUP = 'processors';
const CONSUMER_NAME = `processor-${process.pid}`;
const STREAM_KEY = 'ticket_processing';

// Placeholder for LLM service - will be implemented in NLP module
class NLPService {
  async classifyTicket(text, language) {
    // TODO: Implement with real LLM
    // For now, return mock classification based on keywords
    const lowerText = text.toLowerCase();
    
    for (const cat of TICKET_CATEGORIES) {
      const matches = cat.keywords.filter(kw => lowerText.includes(kw.toLowerCase()));
      if (matches.length > 0) {
        return {
          category: cat.code,
          confidence: Math.min(0.6 + (matches.length * 0.1), 0.95),
        };
      }
    }
    
    return { category: 'other', confidence: 0.5 };
  }

  async predictPriority(text, category) {
    // TODO: Implement with real LLM
    const lowerText = text.toLowerCase();
    
    // Check for escalation keywords
    for (const keyword of ESCALATION_KEYWORDS) {
      if (lowerText.includes(keyword.toLowerCase())) {
        return { priority: 'high', confidence: 0.9 };
      }
    }
    
    return { priority: 'medium', confidence: 0.7 };
  }

  async triageTicket(text, category, kbResults) {
    // TODO: Implement with real LLM
    const categoryConfig = TICKET_CATEGORIES.find(c => c.code === category);
    
    if (categoryConfig?.autoResolvable && kbResults.length > 0) {
      return {
        triage: 'auto_resolvable',
        confidence: 0.75,
        recommendedAction: 'generate_response',
      };
    }
    
    return {
      triage: 'manual',
      confidence: 0.6,
      recommendedAction: 'route_to_operator',
    };
  }

  async generateResponse(ticketText, kbArticles, language) {
    // TODO: Implement with real LLM RAG
    if (kbArticles.length === 0) {
      return null;
    }

    // Mock response
    const article = kbArticles[0];
    return {
      response: `На основе нашей базы знаний:\n\n${article.body.substring(0, 500)}...\n\nЕсли это не помогло, пожалуйста, уточните ваш вопрос.`,
      summary: `Вопрос о ${article.category}`,
      kbRefs: [article.id],
    };
  }

  async detectLanguage(text) {
    // TODO: Use franc or LLM for detection
    // Simple heuristic for now
    const kazakh = /[әғқңөұүһі]/i;
    if (kazakh.test(text)) return 'kz';
    return 'ru';
  }
}

const nlp = new NLPService();

async function processTicket(ticketId, isNew) {
  logger.info('Processing ticket', { ticketId, isNew });

  try {
    const ticket = await Ticket.getTicketById(ticketId);
    if (!ticket) {
      logger.warn('Ticket not found', { ticketId });
      return;
    }

    // Skip if already processed
    if (ticket.category && !isNew) {
      logger.debug('Ticket already processed, skipping', { ticketId });
      return;
    }

    // 1. Detect language
    const language = await nlp.detectLanguage(ticket.body);
    logger.debug('Language detected', { ticketId, language });

    // 2. Classify ticket
    const classification = await nlp.classifyTicket(ticket.body, language);
    logger.debug('Ticket classified', { ticketId, ...classification });

    // 3. Predict priority
    const priorityResult = await nlp.predictPriority(ticket.body, classification.category);
    logger.debug('Priority predicted', { ticketId, ...priorityResult });

    // 4. Check for escalation keywords
    const needsEscalation = ESCALATION_KEYWORDS.some(kw => 
      ticket.body.toLowerCase().includes(kw.toLowerCase())
    );

    if (needsEscalation) {
      logger.info('Escalation triggered', { ticketId });
      await Ticket.updateTicket(ticketId, { status: 'escalated', priority: 'critical' });
      await Ticket.saveTicketNlp(ticketId, {
        category: classification.category,
        categoryConf: classification.confidence,
        priority: 'critical',
        priorityConf: 0.99,
        triage: 'escalate',
        triageConf: 0.99,
        summary: `ESCALATION: ${ticket.subject}`,
      });
      logAudit(ticketId, 'system', 'auto_escalated', { reason: 'escalation_keyword' });
      return;
    }

    // 5. Search KB for relevant articles
    const kbResults = await KnowledgeBase.searchArticles(
      ticket.body.substring(0, 200),
      language,
      5
    );
    logger.debug('KB search completed', { ticketId, resultsCount: kbResults.length });

    // 6. Triage
    const triageResult = await nlp.triageTicket(ticket.body, classification.category, kbResults);
    logger.debug('Triage completed', { ticketId, ...triageResult });

    // 7. Generate response if auto-resolvable
    let suggestedResponse = null;
    let summary = `${classification.category}: ${ticket.subject}`;

    if (triageResult.triage === 'auto_resolvable') {
      const response = await nlp.generateResponse(ticket.body, kbResults, language);
      if (response) {
        suggestedResponse = response.response;
        summary = response.summary;
      }
    }

    // 8. Save NLP results
    await Ticket.saveTicketNlp(ticketId, {
      category: classification.category,
      categoryConf: classification.confidence,
      priority: priorityResult.priority,
      priorityConf: priorityResult.confidence,
      triage: triageResult.triage,
      triageConf: triageResult.confidence,
      summary,
      suggestedResponse,
    });

    // 9. Determine status based on thresholds
    let newStatus = 'new';
    
    if (triageResult.triage === 'auto_resolvable' && 
        classification.confidence >= config.thresholds.autoResolve &&
        triageResult.confidence >= config.thresholds.triage &&
        suggestedResponse) {
      // High confidence - could auto-resolve, but use human-in-loop for safety
      newStatus = 'draft_pending';
      logger.info('Ticket marked for approval', { ticketId, confidence: classification.confidence });
    } else if (classification.confidence >= config.thresholds.draftMin && suggestedResponse) {
      // Medium confidence - draft for review
      newStatus = 'draft_pending';
    }

    await Ticket.updateTicket(ticketId, { 
      status: newStatus,
      language,
    });

    logAudit(ticketId, 'system', 'processed', {
      category: classification.category,
      categoryConf: classification.confidence,
      priority: priorityResult.priority,
      triage: triageResult.triage,
      newStatus,
    });

    logger.info('Ticket processed successfully', { 
      ticketId, 
      category: classification.category,
      status: newStatus,
    });

  } catch (error) {
    logger.error('Error processing ticket', { ticketId, error: error.message, stack: error.stack });
    throw error;
  }
}

async function startWorker() {
  logger.info('Starting ticket processor worker', { consumerName: CONSUMER_NAME });

  try {
    // Connect to Redis
    await connectRedis();
    
    // Create consumer group
    await streams.createConsumerGroup(STREAM_KEY, CONSUMER_GROUP);
    
    logger.info('Worker ready, waiting for messages...');

    // Main processing loop
    while (true) {
      try {
        const messages = await streams.readFromGroup(
          STREAM_KEY,
          CONSUMER_GROUP,
          CONSUMER_NAME,
          10,
          5000 // Block for 5 seconds
        );

        for (const { id, data } of messages) {
          try {
            await processTicket(data.ticketId, data.isNew);
            await streams.ack(STREAM_KEY, CONSUMER_GROUP, id);
          } catch (error) {
            logger.error('Failed to process message', { messageId: id, error: error.message });
            // Message will be redelivered after timeout
          }
        }
      } catch (error) {
        if (error.message.includes('NOGROUP')) {
          // Group doesn't exist, recreate
          await streams.createConsumerGroup(STREAM_KEY, CONSUMER_GROUP);
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
process.on('SIGTERM', async () => {
  logger.info('Worker shutting down...');
  await db.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('Worker shutting down...');
  await db.close();
  process.exit(0);
});

startWorker();
