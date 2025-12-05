const Redis = require('ioredis');
const config = require('./index');
const logger = require('../utils/logger');

const redis = new Redis(config.redis.url, {
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100
});

redis.on('connect', () => {
  logger.info('✅ Redis connected');
});

redis.on('error', (err) => {
  logger.error('❌ Redis error:', err);
});

module.exports = redis;
