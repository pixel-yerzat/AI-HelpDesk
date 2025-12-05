const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const config = require('./config');
const logger = require('./utils/logger');
const errorHandler = require('./api/middlewares/errorHandler');

// Routes
const ticketRoutes = require('./api/routes/tickets');
const authRoutes = require('./api/routes/auth');
const statsRoutes = require('./api/routes/stats');
const knowledgeRoutes = require('./api/routes/knowledge');

const app = express();

// Security middlewares
app.use(helmet());
app.use(cors({
  origin: config.corsOrigins,
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 100, // 100 запросов с одного IP
  message: { error: 'Too many requests, please try again later' }
});
app.use('/api', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging
app.use(morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } }));

// Request timing
app.use((req, res, next) => {
  req.startTime = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - req.startTime;
    res.set('X-Response-Time', `${duration}ms`);
  });
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root
app.get('/', (req, res) => {
  res.json({
    service: 'AI Help Desk',
    version: '1.0.0',
    status: 'running',
    docs: '/api/docs'
  });
});

// API Routes
app.use('/api/v1/tickets', ticketRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/stats', statsRoutes);
app.use('/api/v1/knowledge', knowledgeRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use(errorHandler);

module.exports = app;
