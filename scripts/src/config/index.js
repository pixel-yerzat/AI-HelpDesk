import dotenv from 'dotenv';
dotenv.config();

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  apiPrefix: process.env.API_PREFIX || '/api/v1',

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    database: process.env.DB_NAME || 'helpdesk',
    user: process.env.DB_USER || 'helpdesk',
    password: process.env.DB_PASSWORD || '',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  llm: {
    provider: process.env.LLM_PROVIDER || 'anthropic',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
    model: {
      anthropic: 'claude-sonnet-4-20250514',
      openai: 'gpt-4-turbo-preview',
    },
    embeddingModel: {
      openai: 'text-embedding-3-small',
    },
  },

  qdrant: {
    host: process.env.QDRANT_HOST || 'localhost',
    port: parseInt(process.env.QDRANT_PORT, 10) || 6333,
    collection: process.env.QDRANT_COLLECTION || 'helpdesk_kb',
  },

  s3: {
    endpoint: process.env.S3_ENDPOINT || 'localhost',
    port: parseInt(process.env.S3_PORT, 10) || 9000,
    accessKey: process.env.S3_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.S3_SECRET_KEY || 'minioadmin',
    bucket: process.env.S3_BUCKET || 'helpdesk-attachments',
    useSSL: process.env.S3_USE_SSL === 'true',
  },

  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    webhookUrl: process.env.TELEGRAM_WEBHOOK_URL,
  },

  email: {
    imap: {
      host: process.env.IMAP_HOST,
      port: parseInt(process.env.IMAP_PORT, 10) || 993,
      user: process.env.IMAP_USER,
      password: process.env.IMAP_PASSWORD,
      tls: process.env.IMAP_TLS !== 'false',
    },
    smtp: {
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT, 10) || 587,
      user: process.env.SMTP_USER,
      password: process.env.SMTP_PASSWORD,
      from: process.env.SMTP_FROM,
    },
  },

  whatsapp: {
    provider: process.env.WHATSAPP_PROVIDER || '360dialog',
    apiKey: process.env.WHATSAPP_API_KEY,
    phoneNumber: process.env.WHATSAPP_PHONE_NUMBER,
  },

  thresholds: {
    autoResolve: parseFloat(process.env.THRESHOLD_AUTO_RESOLVE) || 0.90,
    draftMin: parseFloat(process.env.THRESHOLD_DRAFT_MIN) || 0.65,
    triage: parseFloat(process.env.THRESHOLD_TRIAGE) || 0.85,
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
  },

  metrics: {
    enabled: process.env.METRICS_ENABLED !== 'false',
    port: parseInt(process.env.METRICS_PORT, 10) || 9090,
  },
};

export default config;
