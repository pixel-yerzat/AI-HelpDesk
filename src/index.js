import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config/index.js';
import routes from './api/routes/index.js';
import { errorHandler, notFoundHandler } from './api/middleware/errorHandler.js';
import logger from './utils/logger.js';
import db from './utils/database.js';
import { connect as connectRedis, streams } from './utils/redis.js';
import connectorManager from './services/connectors/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Trust proxy (for running behind nginx/load balancer)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable for development
}));

// CORS
app.use(cors({
  origin: config.env === 'development' 
    ? '*' 
    : ['https://your-frontend.com'],
  credentials: true,
}));

// Compression
app.use(compression());

// Request logging
app.use(morgan(config.env === 'development' ? 'dev' : 'combined', {
  stream: {
    write: (message) => logger.info(message.trim()),
  },
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files (admin pages)
app.use('/admin', express.static(path.join(__dirname, 'public')));

// API routes
app.use(config.apiPrefix, routes);

// Health check (public)
app.get('/health', async (req, res) => {
  const dbHealth = await db.healthCheck();
  res.status(dbHealth.status === 'healthy' ? 200 : 503).json({
    status: dbHealth.status,
    timestamp: new Date().toISOString(),
  });
});

// 404 handler
app.use(notFoundHandler);

// Error handler
app.use(errorHandler);

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  logger.info(`Received ${signal}, starting graceful shutdown...`);
  
  try {
    await db.close();
    logger.info('Database connections closed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error: error.message });
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
const startServer = async () => {
  try {
    // Test database connection
    const dbStatus = await db.healthCheck();
    if (dbStatus.status !== 'healthy') {
      throw new Error(`Database connection failed: ${dbStatus.message}`);
    }
    logger.info('Database connection established');

    // Connect to Redis
    try {
      await connectRedis();
      // Create consumer groups for streams
      await streams.createConsumerGroup('ticket_processing', 'processors');
      await streams.createConsumerGroup('outbound_messages', 'senders');
      logger.info('Redis connection established');
    } catch (error) {
      logger.warn('Redis connection failed, some features may be unavailable', { error: error.message });
    }

    // Initialize connectors for status checks (not for receiving messages)
    // Messages are received by separate worker processes
    try {
      await connectorManager.initializeForSending();
      logger.info('Connectors initialized for API');
    } catch (error) {
      logger.warn('Failed to initialize connectors', { error: error.message });
    }

    // Start HTTP server
    app.listen(config.port, () => {
      logger.info(`Server started on port ${config.port}`, {
        env: config.env,
        apiPrefix: config.apiPrefix,
      });
    });
  } catch (error) {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  }
};

startServer();

export default app;
