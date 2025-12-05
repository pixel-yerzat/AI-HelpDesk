module.exports = {
  // Server
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],

  // Database
  database: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/helpdesk'
  },

  // Redis
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379'
  },

  // AI/LLM
  ai: {
    useLocal: process.env.USE_LOCAL_LLM === 'true',
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini'
    },
    ollama: {
      url: process.env.OLLAMA_URL || 'http://localhost:11434',
      model: process.env.OLLAMA_MODEL || 'llama3.1:8b'
    }
  },

  // Vector Store
  qdrant: {
    url: process.env.QDRANT_URL || 'http://localhost:6333',
    collection: process.env.QDRANT_COLLECTION || 'knowledge_base'
  },

  // Telegram
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN
  },

  // Email
  email: {
    smtp: {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT, 10) || 587,
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    },
    imap: {
      host: process.env.IMAP_HOST || 'imap.gmail.com',
      user: process.env.IMAP_USER,
      pass: process.env.IMAP_PASS
    }
  },

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'change-me-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  },

  // SLA (в минутах)
  sla: {
    critical: parseInt(process.env.SLA_CRITICAL, 10) || 30,
    high: parseInt(process.env.SLA_HIGH, 10) || 120,
    medium: parseInt(process.env.SLA_MEDIUM, 10) || 480,
    low: parseInt(process.env.SLA_LOW, 10) || 1440
  }
};
