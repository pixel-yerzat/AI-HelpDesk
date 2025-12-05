import pg from 'pg';
import config from '../config/index.js';
import logger from './logger.js';

const { Pool } = pg;

// Create connection pool
const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  user: config.db.user,
  password: config.db.password,
  max: config.db.max,
  idleTimeoutMillis: config.db.idleTimeoutMillis,
  connectionTimeoutMillis: config.db.connectionTimeoutMillis,
});

// Pool event handlers
pool.on('connect', () => {
  logger.debug('New client connected to PostgreSQL');
});

pool.on('error', (err) => {
  logger.error('Unexpected error on idle PostgreSQL client', { error: err.message });
});

// Query helper with logging
export const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug('Executed query', { 
      text: text.substring(0, 100), 
      duration, 
      rows: result.rowCount 
    });
    return result;
  } catch (error) {
    logger.error('Query error', { 
      text: text.substring(0, 100), 
      error: error.message 
    });
    throw error;
  }
};

// Transaction helper
export const withTransaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Get single row
export const getOne = async (text, params) => {
  const result = await query(text, params);
  return result.rows[0] || null;
};

// Get multiple rows
export const getMany = async (text, params) => {
  const result = await query(text, params);
  return result.rows;
};

// Health check
export const healthCheck = async () => {
  try {
    await query('SELECT 1');
    return { status: 'healthy', message: 'PostgreSQL connection OK' };
  } catch (error) {
    return { status: 'unhealthy', message: error.message };
  }
};

// Close pool
export const close = async () => {
  await pool.end();
  logger.info('PostgreSQL pool closed');
};

export default {
  pool,
  query,
  getOne,
  getMany,
  withTransaction,
  healthCheck,
  close,
};
