import { getProvider } from './llmProvider.js';
import vectorDB from './vectorDB.js';
import PROMPTS, { getResponsePrompt } from './prompts.js';
import { TICKET_CATEGORIES, ESCALATION_KEYWORDS } from '../../config/categories.js';
import config from '../../config/index.js';
import logger from '../../utils/logger.js';
import { cache } from '../../utils/redis.js';

class NLPService {
  constructor() {
    this.llm = null;
    this.vectorDB = vectorDB;
  }

  // Lazy initialization of LLM provider
  getLLM() {
    if (!this.llm) {
      this.llm = getProvider();
    }
    return this.llm;
  }

  // Parse JSON from LLM response (handles markdown code blocks)
  parseJSON(text) {
    try {
      // Remove markdown code blocks if present
      let cleaned = text.trim();
      if (cleaned.startsWith('```json')) {
        cleaned = cleaned.slice(7);
      } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.slice(3);
      }
      if (cleaned.endsWith('```')) {
        cleaned = cleaned.slice(0, -3);
      }
      return JSON.parse(cleaned.trim());
    } catch (error) {
      logger.error('Failed to parse LLM JSON response', { text: text.substring(0, 200), error: error.message });
      throw new Error('Invalid JSON response from LLM');
    }
  }

  // Detect language
  async detectLanguage(text) {
    // Quick heuristic first
    const kazakhChars = /[әғқңөұүһі]/i;
    if (kazakhChars.test(text)) {
      return { language: 'kz', confidence: 0.95, method: 'heuristic' };
    }

    const cyrillicRatio = (text.match(/[а-яё]/gi) || []).length / text.length;
    if (cyrillicRatio > 0.3) {
      return { language: 'ru', confidence: 0.9, method: 'heuristic' };
    }

    // Use LLM for uncertain cases
    try {
      const llm = this.getLLM();
      const response = await llm.complete(
        [{ role: 'user', content: PROMPTS.languageDetection.user(text) }],
        { 
          systemPrompt: PROMPTS.languageDetection.system,
          maxTokens: 100,
          temperature: 0.1,
        }
      );
      
      const result = this.parseJSON(response.text);
      return { ...result, method: 'llm' };
    } catch (error) {
      logger.warn('Language detection via LLM failed, using default', { error: error.message });
      return { language: 'ru', confidence: 0.5, method: 'default' };
    }
  }

  // Classify ticket
  async classifyTicket(subject, body) {
    const cacheKey = `classify:${Buffer.from(subject + body).toString('base64').substring(0, 50)}`;
    
    // Check cache
    const cached = await cache.get(cacheKey);
    if (cached) {
      logger.debug('Classification cache hit');
      return cached;
    }

    try {
      const llm = this.getLLM();
      const response = await llm.complete(
        [{ role: 'user', content: PROMPTS.classifier.user(subject, body) }],
        {
          systemPrompt: PROMPTS.classifier.system,
          maxTokens: 500,
          temperature: 0.2,
        }
      );

      const result = this.parseJSON(response.text);
      
      // Validate categories
      const validCategories = TICKET_CATEGORIES.map(c => c.code);
      result.predictions = result.predictions.filter(p => validCategories.includes(p.category));
      
      if (result.predictions.length === 0) {
        result.predictions = [{ category: 'other', confidence: 0.5, rationale: 'No matching category found' }];
      }

      // Cache for 1 hour
      await cache.set(cacheKey, result, 3600);

      logger.debug('Ticket classified', { 
        topCategory: result.predictions[0].category,
        confidence: result.predictions[0].confidence,
      });

      return result;
    } catch (error) {
      logger.error('Classification failed', { error: error.message });
      // Fallback to keyword-based classification
      return this.classifyByKeywords(subject, body);
    }
  }

  // Fallback keyword-based classification
  classifyByKeywords(subject, body) {
    const text = `${subject} ${body}`.toLowerCase();
    const predictions = [];

    for (const cat of TICKET_CATEGORIES) {
      const matches = cat.keywords.filter(kw => text.includes(kw.toLowerCase()));
      if (matches.length > 0) {
        predictions.push({
          category: cat.code,
          confidence: Math.min(0.4 + (matches.length * 0.15), 0.75),
          rationale: `Matched keywords: ${matches.join(', ')}`,
        });
      }
    }

    // Sort by confidence and take top 3
    predictions.sort((a, b) => b.confidence - a.confidence);
    const top3 = predictions.slice(0, 3);

    if (top3.length === 0) {
      top3.push({ category: 'other', confidence: 0.5, rationale: 'No keyword matches' });
    }

    return {
      predictions: top3,
      detected_language: 'ru',
      method: 'keywords',
    };
  }

  // Predict priority
  async predictPriority(subject, body, category) {
    // Check for escalation keywords first
    const text = `${subject} ${body}`.toLowerCase();
    for (const keyword of ESCALATION_KEYWORDS) {
      if (text.includes(keyword.toLowerCase())) {
        return {
          priority: 'critical',
          confidence: 0.95,
          escalation_required: true,
          escalation_reason: `Escalation keyword detected: ${keyword}`,
          impact_assessment: 'Immediate attention required',
        };
      }
    }

    try {
      const llm = this.getLLM();
      const response = await llm.complete(
        [{ role: 'user', content: PROMPTS.priority.user(subject, body, category) }],
        {
          systemPrompt: PROMPTS.priority.system,
          maxTokens: 300,
          temperature: 0.2,
        }
      );

      return this.parseJSON(response.text);
    } catch (error) {
      logger.error('Priority prediction failed', { error: error.message });
      return {
        priority: 'medium',
        confidence: 0.5,
        escalation_required: false,
        escalation_reason: null,
        impact_assessment: 'Unable to assess automatically',
      };
    }
  }

  // Search KB and prepare context
  async searchKnowledgeBase(query, options = {}) {
    const { language = null, category = null, limit = 5 } = options;

    try {
      const results = await this.vectorDB.searchKB(query, {
        language,
        category,
        limit,
        scoreThreshold: 0.4,
      });

      logger.debug('KB search completed', { 
        query: query.substring(0, 50),
        resultsCount: results.length,
      });

      return results;
    } catch (error) {
      logger.error('KB search failed', { error: error.message });
      return [];
    }
  }

  // Triage ticket
  async triageTicket(subject, body, category, kbResults) {
    // If no KB results, can't auto-resolve
    if (!kbResults || kbResults.length === 0) {
      return {
        auto_resolvable: false,
        confidence: 0.8,
        recommended_action: 'route_to_operator',
        relevant_kb_ids: [],
        missing_information: [],
        reasoning: 'No relevant KB articles found',
      };
    }

    // Check if category is auto-resolvable
    const categoryConfig = TICKET_CATEGORIES.find(c => c.code === category);
    if (categoryConfig && !categoryConfig.autoResolvable) {
      return {
        auto_resolvable: false,
        confidence: 0.9,
        recommended_action: 'route_to_operator',
        relevant_kb_ids: kbResults.map(kb => kb.id),
        missing_information: [],
        reasoning: `Category '${category}' requires manual handling`,
      };
    }

    try {
      const kbExcerpts = kbResults.map(kb => ({
        id: kb.id,
        title: kb.title,
        excerpt: kb.excerpt,
      }));

      const llm = this.getLLM();
      const response = await llm.complete(
        [{ role: 'user', content: PROMPTS.triage.user(subject, body, category, kbExcerpts) }],
        {
          systemPrompt: PROMPTS.triage.system,
          maxTokens: 400,
          temperature: 0.2,
        }
      );

      return this.parseJSON(response.text);
    } catch (error) {
      logger.error('Triage failed', { error: error.message });
      return {
        auto_resolvable: false,
        confidence: 0.5,
        recommended_action: 'route_to_operator',
        relevant_kb_ids: kbResults.map(kb => kb.id),
        missing_information: [],
        reasoning: 'Triage analysis failed',
      };
    }
  }

  // Generate response using RAG
  async generateResponse(subject, body, kbArticles, language = 'ru') {
    if (!kbArticles || kbArticles.length === 0) {
      return null;
    }

    try {
      const prompt = getResponsePrompt(language);
      const llm = this.getLLM();

      const response = await llm.complete(
        [{ role: 'user', content: prompt.user(subject, body, kbArticles) }],
        {
          systemPrompt: prompt.system,
          maxTokens: 800,
          temperature: 0.4,
        }
      );

      const result = this.parseJSON(response.text);

      logger.debug('Response generated', {
        language,
        kbRefsCount: result.kb_refs?.length || 0,
        needsClarification: result.needs_clarification,
      });

      return result;
    } catch (error) {
      logger.error('Response generation failed', { error: error.message });
      return null;
    }
  }

  // Summarize conversation
  async summarizeConversation(messages, language = 'ru') {
    if (!messages || messages.length === 0) {
      return null;
    }

    try {
      const llm = this.getLLM();
      const response = await llm.complete(
        [{ role: 'user', content: PROMPTS.summarizer.user(messages, language) }],
        {
          systemPrompt: PROMPTS.summarizer.system,
          maxTokens: 500,
          temperature: 0.3,
        }
      );

      return this.parseJSON(response.text);
    } catch (error) {
      logger.error('Summarization failed', { error: error.message });
      return null;
    }
  }

  // Translate text
  async translate(text, targetLanguage) {
    try {
      const llm = this.getLLM();
      const response = await llm.complete(
        [{ role: 'user', content: PROMPTS.translate.user(text, targetLanguage) }],
        {
          systemPrompt: PROMPTS.translate.system,
          maxTokens: 1000,
          temperature: 0.2,
        }
      );

      return this.parseJSON(response.text);
    } catch (error) {
      logger.error('Translation failed', { error: error.message });
      return null;
    }
  }

  // Full ticket processing pipeline
  async processTicket(ticket, kbArticlesData = null) {
    const startTime = Date.now();
    const results = {
      ticketId: ticket.id,
      language: null,
      classification: null,
      priority: null,
      triage: null,
      response: null,
      processingTimeMs: 0,
    };

    try {
      // 1. Detect language
      const langResult = await this.detectLanguage(ticket.body);
      results.language = langResult.language;

      // 2. Classify ticket
      const classification = await this.classifyTicket(ticket.subject, ticket.body);
      results.classification = classification;

      const topCategory = classification.predictions[0];

      // 3. Predict priority
      const priority = await this.predictPriority(ticket.subject, ticket.body, topCategory.category);
      results.priority = priority;

      // 4. Search KB if not provided
      let kbResults = kbArticlesData;
      if (!kbResults) {
        kbResults = await this.searchKnowledgeBase(
          `${ticket.subject} ${ticket.body}`,
          { language: results.language, category: topCategory.category }
        );
      }

      // 5. Triage
      const triage = await this.triageTicket(
        ticket.subject,
        ticket.body,
        topCategory.category,
        kbResults
      );
      results.triage = triage;

      // 6. Generate response if auto-resolvable
      if (triage.auto_resolvable && kbResults.length > 0) {
        // Get full KB articles for response generation
        const fullArticles = kbResults.map(kb => ({
          id: kb.id,
          title: kb.title,
          body: kb.excerpt, // In production, fetch full body from DB
        }));

        const response = await this.generateResponse(
          ticket.subject,
          ticket.body,
          fullArticles,
          results.language
        );
        results.response = response;
      }

      results.processingTimeMs = Date.now() - startTime;

      logger.info('Ticket processed by NLP', {
        ticketId: ticket.id,
        category: topCategory.category,
        confidence: topCategory.confidence,
        autoResolvable: triage.auto_resolvable,
        processingTimeMs: results.processingTimeMs,
      });

      return results;
    } catch (error) {
      results.processingTimeMs = Date.now() - startTime;
      results.error = error.message;
      logger.error('NLP processing failed', { ticketId: ticket.id, error: error.message });
      throw error;
    }
  }

  // Index KB article
  async indexKBArticle(article) {
    return await this.vectorDB.upsertKBArticle(article);
  }

  // Index KB articles batch
  async indexKBArticlesBatch(articles) {
    return await this.vectorDB.upsertKBArticlesBatch(articles);
  }

  // Health check
  async healthCheck() {
    const vectorDBHealth = await this.vectorDB.healthCheck();
    
    // Test LLM connection
    let llmHealth = { status: 'unknown', message: 'Not tested' };
    try {
      const llm = this.getLLM();
      await llm.complete(
        [{ role: 'user', content: 'Say "OK" if you can hear me.' }],
        { maxTokens: 10 }
      );
      llmHealth = { status: 'healthy', message: 'LLM connection OK' };
    } catch (error) {
      llmHealth = { status: 'unhealthy', message: error.message };
    }

    return {
      vectorDB: vectorDBHealth,
      llm: llmHealth,
      overall: vectorDBHealth.status === 'healthy' && llmHealth.status === 'healthy' 
        ? 'healthy' 
        : 'degraded',
    };
  }
}

// Singleton instance
const nlpService = new NLPService();

export default nlpService;
export { NLPService };
