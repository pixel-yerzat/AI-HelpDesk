require('dotenv').config();

const app = require('./app');
const config = require('./config');
const logger = require('./utils/logger');
const db = require('./config/database');

const PORT = config.port;

async function start() {
  try {
    // Проверка подключения к БД
    await db.raw('SELECT 1');
    logger.info('✅ Database connected');

    // Запуск сервера
    app.listen(PORT, () => {
      logger.info(`🚀 AI Help Desk API running on port ${PORT}`);
      logger.info(`📚 Docs: http://localhost:${PORT}/api/docs`);
    });
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down...');
  await db.destroy();
  process.exit(0);
});

start();
