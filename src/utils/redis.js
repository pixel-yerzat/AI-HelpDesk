import Redis from 'ioredis';
import config from '../config/index.js';
import logger from './logger.js';

// Create Redis client
const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

// Event handlers
redis.on('connect', () => {
  logger.info('Connected to Redis');
});

redis.on('error', (err) => {
  logger.error('Redis connection error', { error: err.message });
});

redis.on('reconnecting', () => {
  logger.warn('Reconnecting to Redis...');
});

// Connect to Redis
export const connect = async () => {
  await redis.connect();
};

// Cache helpers
export const cache = {
  // Get cached value
  async get(key) {
    const value = await redis.get(key);
    return value ? JSON.parse(value) : null;
  },

  // Set cached value with optional TTL (in seconds)
  async set(key, value, ttlSeconds = 3600) {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  },

  // Delete cached value
  async del(key) {
    await redis.del(key);
  },

  // Check if key exists
  async exists(key) {
    return await redis.exists(key);
  },

  // Set with pattern deletion
  async invalidatePattern(pattern) {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  },
};

// Stream helpers for message bus
export const streams = {
  // Add message to stream
  async addToStream(streamKey, data) {
    const id = await redis.xadd(streamKey, '*', 'data', JSON.stringify(data));
    logger.debug('Added to stream', { streamKey, id });
    return id;
  },

  // Read from stream (consumer group)
  async createConsumerGroup(streamKey, groupName) {
    try {
      await redis.xgroup('CREATE', streamKey, groupName, '0', 'MKSTREAM');
      logger.info('Consumer group created', { streamKey, groupName });
    } catch (error) {
      // Group already exists - ignore
      if (!error.message.includes('BUSYGROUP')) {
        throw error;
      }
    }
  },

  // Read messages from consumer group
  async readFromGroup(streamKey, groupName, consumerName, count = 10, blockMs = 5000) {
    const result = await redis.xreadgroup(
      'GROUP', groupName, consumerName,
      'COUNT', count,
      'BLOCK', blockMs,
      'STREAMS', streamKey, '>'
    );
    
    if (!result) return [];
    
    return result[0][1].map(([id, fields]) => ({
      id,
      data: JSON.parse(fields[1]),
    }));
  },

  // Acknowledge message
  async ack(streamKey, groupName, messageId) {
    await redis.xack(streamKey, groupName, messageId);
  },
};

// Pub/Sub helpers
export const pubsub = {
  // Publish event
  async publish(channel, data) {
    await redis.publish(channel, JSON.stringify(data));
  },

  // Subscribe to channel (returns new Redis instance for subscription)
  createSubscriber() {
    return new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
    });
  },
};

// Health check
export const healthCheck = async () => {
  try {
    await redis.ping();
    return { status: 'healthy', message: 'Redis connection OK' };
  } catch (error) {
    return { status: 'unhealthy', message: error.message };
  }
};

// Close connection
export const close = async () => {
  await redis.quit();
  logger.info('Redis connection closed');
};

export { redis };
export default redis;
