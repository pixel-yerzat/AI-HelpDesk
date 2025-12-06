import dotenv from 'dotenv';
dotenv.config();

import db from '../utils/database.js';
import KnowledgeBase from '../models/KnowledgeBase.js';
import nlpService from '../services/nlp/index.js';
import logger from '../utils/logger.js';

const BATCH_SIZE = 10;
const DELAY_BETWEEN_BATCHES_MS = 1000;

async function indexAllArticles() {
  logger.info('Starting KB indexing job');

  try {
    // Get articles that need indexing (no vector_id or updated since last index)
    const articles = await KnowledgeBase.getArticlesForEmbedding(null, 1000);
    
    if (articles.length === 0) {
      logger.info('No articles to index');
      return { indexed: 0, errors: 0 };
    }

    logger.info(`Found ${articles.length} articles to index`);

    let indexed = 0;
    let errors = 0;

    // Process in batches
    for (let i = 0; i < articles.length; i += BATCH_SIZE) {
      const batch = articles.slice(i, i + BATCH_SIZE);
      
      try {
        // Prepare articles for indexing
        const articlesToIndex = batch.map(a => ({
          id: a.id,
          title: a.title,
          body: a.body,
          language: a.language,
          category: a.category,
          tags: [],
        }));

        // Index batch
        const vectorIds = await nlpService.indexKBArticlesBatch(articlesToIndex);

        // Update vector_id in database
        for (let j = 0; j < batch.length; j++) {
          await KnowledgeBase.updateVectorId(batch[j].id, vectorIds[j]);
        }

        indexed += batch.length;
        logger.info(`Indexed batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(articles.length / BATCH_SIZE)}`, {
          articlesInBatch: batch.length,
          totalIndexed: indexed,
        });

        // Delay between batches to avoid rate limits
        if (i + BATCH_SIZE < articles.length) {
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS));
        }

      } catch (error) {
        logger.error('Failed to index batch', {
          batchStart: i,
          error: error.message,
        });
        errors += batch.length;
      }
    }

    logger.info('KB indexing completed', { indexed, errors });
    return { indexed, errors };

  } catch (error) {
    logger.error('KB indexing job failed', { error: error.message });
    throw error;
  }
}

async function indexSingleArticle(articleId) {
  logger.info('Indexing single article', { articleId });

  try {
    const article = await KnowledgeBase.getArticleById(articleId);
    
    if (!article) {
      logger.warn('Article not found', { articleId });
      return false;
    }

    const vectorId = await nlpService.indexKBArticle({
      id: article.id,
      title: article.title,
      body: article.body,
      language: article.language,
      category: article.category,
      tags: article.tags || [],
    });

    await KnowledgeBase.updateVectorId(articleId, vectorId);

    logger.info('Article indexed successfully', { articleId, vectorId });
    return true;

  } catch (error) {
    logger.error('Failed to index article', { articleId, error: error.message });
    return false;
  }
}

async function getIndexStats() {
  try {
    const dbStats = await KnowledgeBase.getKbStats();
    const vectorStats = await nlpService.vectorDB.getCollectionInfo();

    return {
      database: {
        totalArticles: dbStats.total_articles,
        indexedArticles: dbStats.indexed_articles,
        pendingIndexing: dbStats.total_articles - dbStats.indexed_articles,
      },
      vectorDB: vectorStats,
    };
  } catch (error) {
    logger.error('Failed to get index stats', { error: error.message });
    throw error;
  }
}

// CLI mode
async function main() {
  const command = process.argv[2];

  try {
    switch (command) {
      case 'index-all':
        await indexAllArticles();
        break;
      
      case 'index-one':
        const articleId = process.argv[3];
        if (!articleId) {
          console.error('Usage: node kbIndexer.js index-one <article-id>');
          process.exit(1);
        }
        await indexSingleArticle(articleId);
        break;
      
      case 'stats':
        const stats = await getIndexStats();
        console.log('Index Statistics:');
        console.log(JSON.stringify(stats, null, 2));
        break;
      
      default:
        console.log('Usage:');
        console.log('  node kbIndexer.js index-all    - Index all KB articles');
        console.log('  node kbIndexer.js index-one <id> - Index single article');
        console.log('  node kbIndexer.js stats        - Show index statistics');
        process.exit(1);
    }

    await db.close();
    process.exit(0);

  } catch (error) {
    console.error('Error:', error.message);
    await db.close();
    process.exit(1);
  }
}

// Run if called directly
main();

export { indexAllArticles, indexSingleArticle, getIndexStats };
