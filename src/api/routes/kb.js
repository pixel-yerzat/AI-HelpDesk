import { Router } from 'express';
import { validationResult } from 'express-validator';
import KnowledgeBase from '../../models/KnowledgeBase.js';
import { authenticate, requirePermission, requireRole } from '../middleware/auth.js';
import { asyncHandler, ApiError, formatValidationErrors } from '../middleware/errorHandler.js';
import { kbArticleValidator, kbSearchValidator } from '../validators/index.js';
import logger from '../../utils/logger.js';

const router = Router();

// Search KB (RAG endpoint)
router.post('/search',
  authenticate,
  kbSearchValidator,
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw ApiError.badRequest('Validation failed', formatValidationErrors(errors));
    }

    const { query, language, limit = 5, use_vector = true } = req.body;

    let results;
    
    if (use_vector) {
      // TODO: Implement vector search via NLP service
      // For now, fallback to text search
      results = await KnowledgeBase.searchArticles(query, language, limit);
    } else {
      results = await KnowledgeBase.searchArticles(query, language, limit);
    }

    res.json({ 
      results,
      query,
      count: results.length,
    });
  })
);

// Get KB stats
router.get('/stats',
  authenticate,
  requireRole('admin', 'operator'),
  asyncHandler(async (req, res) => {
    const stats = await KnowledgeBase.getKbStats();
    res.json({ stats });
  })
);

// List articles
router.get('/',
  authenticate,
  requirePermission('kb:read'),
  asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, language, category, search, tags } = req.query;

    const parsedTags = tags ? tags.split(',').map(t => t.trim()) : undefined;

    const result = await KnowledgeBase.getArticles(
      { language, category, search, tags: parsedTags },
      { page: parseInt(page), limit: parseInt(limit) }
    );

    res.json(result);
  })
);

// Get single article
router.get('/:id',
  authenticate,
  requirePermission('kb:read'),
  asyncHandler(async (req, res) => {
    const article = await KnowledgeBase.getArticleById(req.params.id);
    
    if (!article) {
      throw ApiError.notFound('Article not found');
    }

    res.json({ article });
  })
);

// Create article
router.post('/',
  authenticate,
  requireRole('admin', 'operator'),
  asyncHandler(async (req, res) => {
    const { title_ru, title_kz, content_ru, content_kz, category, type, keywords } = req.body;

    if (!title_ru || !content_ru) {
      throw ApiError.badRequest('title_ru and content_ru are required');
    }

    const article = await KnowledgeBase.createArticle({
      title: title_ru, // For backward compatibility
      body: content_ru,
      title_ru,
      title_kz,
      content_ru,
      content_kz,
      language: 'ru',
      category,
      type: type || 'faq',
      keywords: keywords || [],
      ownerId: req.user.id,
    });

    logger.info('KB article created', { articleId: article.id, userId: req.user.id });

    res.status(201).json({ 
      success: true,
      article,
    });
  })
);

// Update article
router.put('/:id',
  authenticate,
  requireRole('admin', 'operator'),
  asyncHandler(async (req, res) => {
    const existing = await KnowledgeBase.getArticleById(req.params.id);
    if (!existing) {
      throw ApiError.notFound('Article not found');
    }

    const { title_ru, title_kz, content_ru, content_kz, category, type, keywords } = req.body;

    const article = await KnowledgeBase.updateArticle(req.params.id, {
      title: title_ru,
      body: content_ru,
      title_ru,
      title_kz,
      content_ru,
      content_kz,
      category,
      type,
      keywords,
      vector_id: null, // Reset vector on update - will be regenerated
    });

    logger.info('KB article updated', { articleId: article.id, userId: req.user.id });

    // TODO: Queue for embedding regeneration

    res.json({ 
      success: true,
      article,
    });
  })
);

// Delete article
router.delete('/:id',
  authenticate,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const existing = await KnowledgeBase.getArticleById(req.params.id);
    if (!existing) {
      throw ApiError.notFound('Article not found');
    }

    await KnowledgeBase.deleteArticle(req.params.id);

    logger.info('KB article deleted', { articleId: req.params.id, userId: req.user.id });

    // TODO: Remove from vector DB

    res.json({ 
      success: true,
      message: 'Article deleted',
    });
  })
);

export default router;
