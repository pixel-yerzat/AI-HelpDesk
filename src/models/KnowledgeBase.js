import { v4 as uuidv4 } from 'uuid';
import db from '../utils/database.js';

// Create KB article
export const createArticle = async (articleData) => {
  const {
    title,
    body,
    title_ru,
    title_kz,
    content_ru,
    content_kz,
    tags = [],
    keywords = [],
    language = 'ru',
    category,
    type = 'faq',
    ownerId,
    vectorId = null,
  } = articleData;

  const id = uuidv4();

  const result = await db.query(
    `INSERT INTO kb_articles (id, title, body, title_ru, title_kz, content_ru, content_kz, tags, keywords, language, category, type, owner_id, vector_id, is_published, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, true, NOW(), NOW())
     RETURNING *`,
    [id, title || title_ru, body || content_ru, title_ru, title_kz, content_ru, content_kz, JSON.stringify(tags), keywords, language, category, type, ownerId, vectorId]
  );

  return result.rows[0];
};

// Get article by ID
export const getArticleById = async (id) => {
  return await db.getOne(
    `SELECT * FROM kb_articles WHERE id = $1`,
    [id]
  );
};

// Update article
export const updateArticle = async (id, updates) => {
  const allowedFields = ['title', 'body', 'title_ru', 'title_kz', 'content_ru', 'content_kz', 'tags', 'keywords', 'language', 'category', 'type', 'vector_id', 'is_published'];
  const setClause = [];
  const values = [];
  let paramIndex = 1;

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key) && value !== undefined) {
      const dbValue = key === 'tags' ? JSON.stringify(value) : value;
      setClause.push(`${key} = $${paramIndex}`);
      values.push(dbValue);
      paramIndex++;
    }
  }

  if (setClause.length === 0) return null;

  setClause.push(`updated_at = NOW()`);
  values.push(id);

  const result = await db.query(
    `UPDATE kb_articles SET ${setClause.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );

  return result.rows[0];
};

// Delete article
export const deleteArticle = async (id) => {
  const result = await db.query(
    `DELETE FROM kb_articles WHERE id = $1 RETURNING id`,
    [id]
  );
  return result.rowCount > 0;
};

// Get articles with filters
export const getArticles = async (filters = {}, pagination = { page: 1, limit: 20 }) => {
  const { language, category, search, tags } = filters;
  const { page, limit } = pagination;
  const offset = (page - 1) * limit;

  let whereClause = [];
  let values = [];
  let paramIndex = 1;

  if (language) {
    whereClause.push(`language = $${paramIndex}`);
    values.push(language);
    paramIndex++;
  }

  if (category) {
    whereClause.push(`category = $${paramIndex}`);
    values.push(category);
    paramIndex++;
  }

  if (search) {
    whereClause.push(`(title ILIKE $${paramIndex} OR body ILIKE $${paramIndex})`);
    values.push(`%${search}%`);
    paramIndex++;
  }

  if (tags && tags.length > 0) {
    whereClause.push(`tags ?| $${paramIndex}`);
    values.push(tags);
    paramIndex++;
  }

  const whereString = whereClause.length > 0 ? `WHERE ${whereClause.join(' AND ')}` : '';

  const countResult = await db.query(
    `SELECT COUNT(*) FROM kb_articles ${whereString}`,
    values
  );
  const total = parseInt(countResult.rows[0].count, 10);

  values.push(limit, offset);
  const result = await db.query(
    `SELECT * FROM kb_articles ${whereString}
     ORDER BY updated_at DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    values
  );

  return {
    articles: result.rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

// Search articles by text (basic full-text search)
export const searchArticles = async (query, language = null, limit = 10) => {
  let whereClause = `to_tsvector('russian', title || ' ' || body) @@ plainto_tsquery('russian', $1)`;
  const values = [query];
  let paramIndex = 2;

  if (language) {
    whereClause += ` AND language = $${paramIndex}`;
    values.push(language);
    paramIndex++;
  }

  values.push(limit);

  const result = await db.query(
    `SELECT id, title, body, tags, language, category,
            ts_rank(to_tsvector('russian', title || ' ' || body), plainto_tsquery('russian', $1)) as rank
     FROM kb_articles
     WHERE ${whereClause}
     ORDER BY rank DESC
     LIMIT $${paramIndex}`,
    values
  );

  return result.rows;
};

// Get articles by vector IDs (for RAG results)
export const getArticlesByVectorIds = async (vectorIds) => {
  if (!vectorIds || vectorIds.length === 0) return [];

  const result = await db.query(
    `SELECT * FROM kb_articles WHERE vector_id = ANY($1)`,
    [vectorIds]
  );

  return result.rows;
};

// Get articles by IDs
export const getArticlesByIds = async (ids) => {
  if (!ids || ids.length === 0) return [];

  const result = await db.query(
    `SELECT * FROM kb_articles WHERE id = ANY($1)`,
    [ids]
  );

  return result.rows;
};

// Get all articles for embedding (batch processing)
export const getArticlesForEmbedding = async (lastUpdated = null, batchSize = 100) => {
  let whereClause = 'vector_id IS NULL';
  const values = [batchSize];

  if (lastUpdated) {
    whereClause += ' OR updated_at > $2';
    values.push(lastUpdated);
  }

  const result = await db.query(
    `SELECT id, title, body, language FROM kb_articles 
     WHERE ${whereClause}
     ORDER BY updated_at ASC
     LIMIT $1`,
    values
  );

  return result.rows;
};

// Update vector reference
export const updateVectorId = async (articleId, vectorId) => {
  await db.query(
    `UPDATE kb_articles SET vector_id = $1, updated_at = NOW() WHERE id = $2`,
    [vectorId, articleId]
  );
};

// Get stats
export const getKbStats = async () => {
  const stats = await db.getOne(
    `SELECT 
      COUNT(*) as total_articles,
      COUNT(*) FILTER (WHERE vector_id IS NOT NULL) as indexed_articles,
      COUNT(DISTINCT category) as categories_count,
      COUNT(DISTINCT language) as languages_count
     FROM kb_articles`
  );

  const byLanguage = await db.getMany(
    `SELECT language, COUNT(*) as count FROM kb_articles GROUP BY language`
  );

  const byCategory = await db.getMany(
    `SELECT category, COUNT(*) as count FROM kb_articles GROUP BY category ORDER BY count DESC`
  );

  return {
    ...stats,
    byLanguage,
    byCategory,
  };
};

export default {
  createArticle,
  getArticleById,
  updateArticle,
  deleteArticle,
  getArticles,
  searchArticles,
  getArticlesByVectorIds,
  getArticlesByIds,
  getArticlesForEmbedding,
  updateVectorId,
  getKbStats,
};
