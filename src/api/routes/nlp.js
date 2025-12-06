import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import nlpService from '../../services/nlp/index.js';
import KnowledgeBase from '../../models/KnowledgeBase.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError, formatValidationErrors } from '../middleware/errorHandler.js';
import logger from '../../utils/logger.js';

const router = Router();

// Test classification
router.post('/classify',
  authenticate,
  requireRole('admin', 'operator'),
  [
    body('subject').optional().isString().trim(),
    body('body').notEmpty().isString().trim(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw ApiError.badRequest('Validation failed', formatValidationErrors(errors));
    }

    const { subject = '', body: text } = req.body;
    
    const result = await nlpService.classifyTicket(subject, text);
    
    res.json({
      success: true,
      classification: result,
    });
  })
);

// Test priority prediction
router.post('/priority',
  authenticate,
  requireRole('admin', 'operator'),
  [
    body('subject').optional().isString().trim(),
    body('body').notEmpty().isString().trim(),
    body('category').optional().isString().trim(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw ApiError.badRequest('Validation failed', formatValidationErrors(errors));
    }

    const { subject = '', body: text, category = 'other' } = req.body;
    
    const result = await nlpService.predictPriority(subject, text, category);
    
    res.json({
      success: true,
      priority: result,
    });
  })
);

// Test RAG response generation
router.post('/generate-response',
  authenticate,
  requireRole('admin', 'operator'),
  [
    body('subject').optional().isString().trim(),
    body('body').notEmpty().isString().trim(),
    body('language').optional().isIn(['ru', 'kz', 'en']),
    body('kb_ids').optional().isArray(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw ApiError.badRequest('Validation failed', formatValidationErrors(errors));
    }

    const { subject = '', body: text, language = 'ru', kb_ids } = req.body;
    
    // Get KB articles
    let kbArticles = [];
    if (kb_ids && kb_ids.length > 0) {
      kbArticles = await KnowledgeBase.getArticlesByIds(kb_ids);
    } else {
      // Search KB automatically
      const searchResults = await nlpService.searchKnowledgeBase(
        `${subject} ${text}`,
        { language, limit: 3 }
      );
      
      if (searchResults.length > 0) {
        kbArticles = await KnowledgeBase.getArticlesByIds(
          searchResults.map(r => r.id)
        );
      }
    }

    if (kbArticles.length === 0) {
      return res.json({
        success: false,
        message: 'No relevant KB articles found',
        response: null,
      });
    }

    const result = await nlpService.generateResponse(subject, text, kbArticles, language);
    
    res.json({
      success: true,
      response: result,
      kb_articles_used: kbArticles.map(a => ({ id: a.id, title: a.title })),
    });
  })
);

// Full pipeline test
router.post('/process',
  authenticate,
  requireRole('admin'),
  [
    body('subject').optional().isString().trim(),
    body('body').notEmpty().isString().trim(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw ApiError.badRequest('Validation failed', formatValidationErrors(errors));
    }

    const { subject = '', body: text } = req.body;
    
    // Create mock ticket object
    const mockTicket = {
      id: 'test-' + Date.now(),
      subject,
      body: text,
    };

    const result = await nlpService.processTicket(mockTicket);
    
    res.json({
      success: true,
      result,
    });
  })
);

// Search KB via vector search
router.post('/search-kb',
  authenticate,
  [
    body('query').notEmpty().isString().trim(),
    body('language').optional().isIn(['ru', 'kz', 'en']),
    body('category').optional().isString().trim(),
    body('limit').optional().isInt({ min: 1, max: 20 }).toInt(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw ApiError.badRequest('Validation failed', formatValidationErrors(errors));
    }

    const { query, language, category, limit = 5 } = req.body;
    
    const results = await nlpService.searchKnowledgeBase(query, {
      language,
      category,
      limit,
    });
    
    res.json({
      success: true,
      query,
      results,
      count: results.length,
    });
  })
);

// Translate text
router.post('/translate',
  authenticate,
  [
    body('text').notEmpty().isString().trim(),
    body('target_language').isIn(['ru', 'kz', 'en']),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw ApiError.badRequest('Validation failed', formatValidationErrors(errors));
    }

    const { text, target_language } = req.body;
    
    const result = await nlpService.translate(text, target_language);
    
    if (!result) {
      throw ApiError.internal('Translation failed');
    }
    
    res.json({
      success: true,
      translation: result,
    });
  })
);

// Detect language
router.post('/detect-language',
  authenticate,
  [
    body('text').notEmpty().isString().trim(),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw ApiError.badRequest('Validation failed', formatValidationErrors(errors));
    }

    const { text } = req.body;
    
    const result = await nlpService.detectLanguage(text);
    
    res.json({
      success: true,
      detection: result,
    });
  })
);

// Index KB article
router.post('/index-kb/:id',
  authenticate,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const article = await KnowledgeBase.getArticleById(req.params.id);
    
    if (!article) {
      throw ApiError.notFound('Article not found');
    }

    const vectorId = await nlpService.indexKBArticle({
      id: article.id,
      title: article.title,
      body: article.body,
      language: article.language,
      category: article.category,
      tags: article.tags || [],
    });

    await KnowledgeBase.updateVectorId(article.id, vectorId);

    logger.info('KB article indexed via API', { articleId: article.id });
    
    res.json({
      success: true,
      message: 'Article indexed successfully',
      article_id: article.id,
      vector_id: vectorId,
    });
  })
);

// Index all KB articles
router.post('/index-kb-all',
  authenticate,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    // Get unindexed articles
    const articles = await KnowledgeBase.getArticlesForEmbedding(null, 100);
    
    if (articles.length === 0) {
      return res.json({
        success: true,
        message: 'All articles already indexed',
        indexed: 0,
      });
    }

    // Index in batch
    const articlesToIndex = articles.map(a => ({
      id: a.id,
      title: a.title,
      body: a.body,
      language: a.language,
      category: a.category,
      tags: [],
    }));

    const vectorIds = await nlpService.indexKBArticlesBatch(articlesToIndex);

    // Update vector_ids
    for (let i = 0; i < articles.length; i++) {
      await KnowledgeBase.updateVectorId(articles[i].id, vectorIds[i]);
    }

    logger.info('KB articles batch indexed via API', { count: articles.length });
    
    res.json({
      success: true,
      message: `Indexed ${articles.length} articles`,
      indexed: articles.length,
    });
  })
);

// NLP service health
router.get('/health',
  authenticate,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const health = await nlpService.healthCheck();
    
    res.status(health.overall === 'healthy' ? 200 : 503).json({
      success: health.overall === 'healthy',
      health,
    });
  })
);

export default router;
