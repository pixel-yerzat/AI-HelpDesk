import { QdrantClient } from '@qdrant/js-client-rest';
import config from '../../config/index.js';
import logger from '../../utils/logger.js';
import { getEmbeddingProvider } from './llmProvider.js';

const COLLECTION_NAME = config.qdrant.collection;
const VECTOR_SIZE = 1536; // OpenAI text-embedding-3-small dimension

class VectorDBService {
  constructor() {
    this.client = new QdrantClient({
      host: config.qdrant.host,
      port: config.qdrant.port,
    });
    this.embeddingProvider = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      // Check if collection exists
      const collections = await this.client.getCollections();
      const exists = collections.collections.some(c => c.name === COLLECTION_NAME);

      if (!exists) {
        // Create collection
        await this.client.createCollection(COLLECTION_NAME, {
          vectors: {
            size: VECTOR_SIZE,
            distance: 'Cosine',
          },
          optimizers_config: {
            indexing_threshold: 10000,
          },
        });

        // Create payload indexes for filtering
        await this.client.createPayloadIndex(COLLECTION_NAME, {
          field_name: 'language',
          field_schema: 'keyword',
        });

        await this.client.createPayloadIndex(COLLECTION_NAME, {
          field_name: 'category',
          field_schema: 'keyword',
        });

        await this.client.createPayloadIndex(COLLECTION_NAME, {
          field_name: 'type',
          field_schema: 'keyword',
        });

        logger.info('Qdrant collection created', { collection: COLLECTION_NAME });
      }

      this.embeddingProvider = getEmbeddingProvider();
      this.initialized = true;
      logger.info('VectorDB service initialized');
    } catch (error) {
      logger.error('Failed to initialize VectorDB', { error: error.message });
      throw error;
    }
  }

  // Generate embedding for text
  async embed(text) {
    if (!this.embeddingProvider) {
      this.embeddingProvider = getEmbeddingProvider();
    }
    return await this.embeddingProvider.embed(text);
  }

  // Generate embeddings for multiple texts
  async embedBatch(texts) {
    if (!this.embeddingProvider) {
      this.embeddingProvider = getEmbeddingProvider();
    }
    return await this.embeddingProvider.embedBatch(texts);
  }

  // Upsert KB article
  async upsertKBArticle(article) {
    await this.initialize();

    const textForEmbedding = `${article.title}\n\n${article.body}`;
    const { embedding } = await this.embed(textForEmbedding);

    const point = {
      id: article.id,
      vector: embedding,
      payload: {
        type: 'kb_article',
        article_id: article.id,
        title: article.title,
        body_preview: article.body.substring(0, 500),
        language: article.language,
        category: article.category,
        tags: article.tags || [],
        updated_at: new Date().toISOString(),
      },
    };

    await this.client.upsert(COLLECTION_NAME, {
      wait: true,
      points: [point],
    });

    logger.debug('KB article indexed', { articleId: article.id });
    return article.id;
  }

  // Upsert multiple KB articles
  async upsertKBArticlesBatch(articles) {
    await this.initialize();

    if (articles.length === 0) return [];

    // Generate embeddings in batch
    const texts = articles.map(a => `${a.title}\n\n${a.body}`);
    const { embeddings } = await this.embedBatch(texts);

    const points = articles.map((article, i) => ({
      id: article.id,
      vector: embeddings[i],
      payload: {
        type: 'kb_article',
        article_id: article.id,
        title: article.title,
        body_preview: article.body.substring(0, 500),
        language: article.language,
        category: article.category,
        tags: article.tags || [],
        updated_at: new Date().toISOString(),
      },
    }));

    await this.client.upsert(COLLECTION_NAME, {
      wait: true,
      points,
    });

    logger.info('KB articles batch indexed', { count: articles.length });
    return articles.map(a => a.id);
  }

  // Search KB articles by query
  async searchKB(query, options = {}) {
    await this.initialize();

    const {
      limit = 5,
      language = null,
      category = null,
      scoreThreshold = 0.5,
    } = options;

    // Generate query embedding
    const { embedding } = await this.embed(query);

    // Build filter
    const filter = {
      must: [
        { key: 'type', match: { value: 'kb_article' } },
      ],
    };

    if (language) {
      filter.must.push({ key: 'language', match: { value: language } });
    }

    if (category) {
      filter.must.push({ key: 'category', match: { value: category } });
    }

    // Search
    const results = await this.client.search(COLLECTION_NAME, {
      vector: embedding,
      filter,
      limit,
      score_threshold: scoreThreshold,
      with_payload: true,
    });

    return results.map(r => ({
      id: r.payload.article_id,
      title: r.payload.title,
      excerpt: r.payload.body_preview,
      language: r.payload.language,
      category: r.payload.category,
      score: r.score,
    }));
  }

  // Index ticket for similarity search (optional, for finding similar tickets)
  async indexTicket(ticket, embedding = null) {
    await this.initialize();

    if (!embedding) {
      const textForEmbedding = `${ticket.subject}\n\n${ticket.body}`;
      const result = await this.embed(textForEmbedding);
      embedding = result.embedding;
    }

    const point = {
      id: `ticket_${ticket.id}`,
      vector: embedding,
      payload: {
        type: 'ticket',
        ticket_id: ticket.id,
        subject: ticket.subject,
        body_preview: ticket.body.substring(0, 300),
        language: ticket.language,
        category: ticket.category,
        status: ticket.status,
        created_at: ticket.created_at,
      },
    };

    await this.client.upsert(COLLECTION_NAME, {
      wait: true,
      points: [point],
    });

    return `ticket_${ticket.id}`;
  }

  // Find similar tickets
  async findSimilarTickets(query, options = {}) {
    await this.initialize();

    const {
      limit = 5,
      excludeTicketId = null,
      status = null,
    } = options;

    const { embedding } = await this.embed(query);

    const filter = {
      must: [
        { key: 'type', match: { value: 'ticket' } },
      ],
    };

    if (excludeTicketId) {
      filter.must_not = [
        { key: 'ticket_id', match: { value: excludeTicketId } },
      ];
    }

    if (status) {
      filter.must.push({ key: 'status', match: { value: status } });
    }

    const results = await this.client.search(COLLECTION_NAME, {
      vector: embedding,
      filter,
      limit,
      score_threshold: 0.7,
      with_payload: true,
    });

    return results.map(r => ({
      ticketId: r.payload.ticket_id,
      subject: r.payload.subject,
      bodyPreview: r.payload.body_preview,
      status: r.payload.status,
      score: r.score,
    }));
  }

  // Delete by ID
  async delete(id) {
    await this.initialize();
    await this.client.delete(COLLECTION_NAME, {
      wait: true,
      points: [id],
    });
  }

  // Delete KB article
  async deleteKBArticle(articleId) {
    await this.delete(articleId);
    logger.debug('KB article removed from index', { articleId });
  }

  // Get collection info
  async getCollectionInfo() {
    await this.initialize();
    const info = await this.client.getCollection(COLLECTION_NAME);
    return {
      name: COLLECTION_NAME,
      vectorsCount: info.vectors_count,
      pointsCount: info.points_count,
      status: info.status,
    };
  }

  // Health check
  async healthCheck() {
    try {
      await this.client.getCollections();
      return { status: 'healthy', message: 'Qdrant connection OK' };
    } catch (error) {
      return { status: 'unhealthy', message: error.message };
    }
  }
}

// Singleton instance
const vectorDB = new VectorDBService();

export default vectorDB;
export { VectorDBService };
