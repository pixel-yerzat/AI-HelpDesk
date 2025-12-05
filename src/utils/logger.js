import winston from 'winston';
import config from '../config/index.js';

const { combine, timestamp, printf, colorize, json } = winston.format;

// Custom format for development
const devFormat = printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level}]: ${message}`;
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }
  return msg;
});

// Create logger instance
const logger = winston.createLogger({
  level: config.logging.level,
  defaultMeta: { service: 'helpdesk-ai' },
  transports: [
    // Console transport
    new winston.transports.Console({
      format: config.env === 'development'
        ? combine(
            colorize(),
            timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            devFormat
          )
        : combine(
            timestamp(),
            json()
          ),
    }),
  ],
});

// Add file transports in production
if (config.env === 'production') {
  logger.add(new winston.transports.File({ 
    filename: 'logs/error.log', 
    level: 'error',
    format: combine(timestamp(), json()),
  }));
  logger.add(new winston.transports.File({ 
    filename: 'logs/combined.log',
    format: combine(timestamp(), json()),
  }));
}

// Create child logger with context
export const createLogger = (context) => {
  return logger.child({ context });
};

// Audit logger for compliance
export const auditLogger = winston.createLogger({
  level: 'info',
  format: combine(timestamp(), json()),
  defaultMeta: { type: 'audit' },
  transports: [
    new winston.transports.Console(),
    // In production, add transport to audit log storage (ELK, etc.)
  ],
});

// Log audit event
export const logAudit = (ticketId, actor, action, payload = {}) => {
  auditLogger.info('Audit event', {
    ticketId,
    actor,
    action,
    payload,
    timestamp: new Date().toISOString(),
  });
};

export default logger;
