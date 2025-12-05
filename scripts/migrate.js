#!/usr/bin/env node

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME || 'helpdesk',
  user: process.env.DB_USER || 'helpdesk',
  password: process.env.DB_PASSWORD || '',
});

const migrations = [
  {
    name: '001_initial_schema',
    sql: `
      -- Users table
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255),
        name VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'user',
        external_id VARCHAR(255),
        source VARCHAR(50),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_external_id ON users(external_id, source);
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

      -- Tickets table
      CREATE TABLE IF NOT EXISTS tickets (
        id UUID PRIMARY KEY,
        source VARCHAR(50) NOT NULL,
        source_id VARCHAR(255) NOT NULL,
        user_id UUID REFERENCES users(id),
        subject VARCHAR(500),
        body TEXT NOT NULL,
        language VARCHAR(10) DEFAULT 'ru',
        status VARCHAR(50) NOT NULL DEFAULT 'new',
        priority VARCHAR(20),
        assigned_to UUID REFERENCES users(id),
        resolved_at TIMESTAMP WITH TIME ZONE,
        resolved_by VARCHAR(255),
        resolution_text TEXT,
        attachments JSONB DEFAULT '[]',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
      CREATE INDEX IF NOT EXISTS idx_tickets_source ON tickets(source);
      CREATE INDEX IF NOT EXISTS idx_tickets_source_id ON tickets(source, source_id);
      CREATE INDEX IF NOT EXISTS idx_tickets_user_id ON tickets(user_id);
      CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to ON tickets(assigned_to);
      CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at);

      -- Ticket NLP results
      CREATE TABLE IF NOT EXISTS ticket_nlp (
        ticket_id UUID PRIMARY KEY REFERENCES tickets(id) ON DELETE CASCADE,
        category VARCHAR(100),
        category_conf DECIMAL(5,4),
        priority VARCHAR(20),
        priority_conf DECIMAL(5,4),
        triage VARCHAR(50),
        triage_conf DECIMAL(5,4),
        summary TEXT,
        suggested_response TEXT,
        embeddings_ref VARCHAR(255)
      );

      CREATE INDEX IF NOT EXISTS idx_ticket_nlp_category ON ticket_nlp(category);

      -- Ticket messages (conversation history)
      CREATE TABLE IF NOT EXISTS ticket_messages (
        id UUID PRIMARY KEY,
        ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        sender VARCHAR(255) NOT NULL,
        sender_type VARCHAR(50) NOT NULL,
        content TEXT NOT NULL,
        attachments JSONB DEFAULT '[]',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_id ON ticket_messages(ticket_id);
      CREATE INDEX IF NOT EXISTS idx_ticket_messages_created_at ON ticket_messages(created_at);

      -- Knowledge Base articles
      CREATE TABLE IF NOT EXISTS kb_articles (
        id UUID PRIMARY KEY,
        title VARCHAR(500) NOT NULL,
        body TEXT NOT NULL,
        tags JSONB DEFAULT '[]',
        language VARCHAR(10) DEFAULT 'ru',
        category VARCHAR(100),
        owner_id UUID REFERENCES users(id),
        vector_id VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_kb_articles_language ON kb_articles(language);
      CREATE INDEX IF NOT EXISTS idx_kb_articles_category ON kb_articles(category);
      CREATE INDEX IF NOT EXISTS idx_kb_articles_vector_id ON kb_articles(vector_id);

      -- Full-text search index for KB
      CREATE INDEX IF NOT EXISTS idx_kb_articles_fts ON kb_articles 
        USING gin(to_tsvector('russian', title || ' ' || body));

      -- Audit log
      CREATE TABLE IF NOT EXISTS audit_log (
        id BIGSERIAL PRIMARY KEY,
        ticket_id UUID REFERENCES tickets(id) ON DELETE SET NULL,
        actor VARCHAR(255) NOT NULL,
        action VARCHAR(100) NOT NULL,
        payload JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_audit_log_ticket_id ON audit_log(ticket_id);
      CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);
      CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor);

      -- Migrations tracking
      CREATE TABLE IF NOT EXISTS migrations (
        name VARCHAR(255) PRIMARY KEY,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `,
  },
  {
    name: '002_add_feedback_table',
    sql: `
      -- Feedback for ML model improvement
      CREATE TABLE IF NOT EXISTS ticket_feedback (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        feedback_type VARCHAR(50) NOT NULL,
        rating INTEGER,
        correct_category VARCHAR(100),
        correct_response TEXT,
        comments TEXT,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_ticket_feedback_ticket_id ON ticket_feedback(ticket_id);
      CREATE INDEX IF NOT EXISTS idx_ticket_feedback_type ON ticket_feedback(feedback_type);
    `,
  },
  {
    name: '003_add_system_config',
    sql: `
      -- System configuration (runtime adjustable)
      CREATE TABLE IF NOT EXISTS system_config (
        key VARCHAR(255) PRIMARY KEY,
        value JSONB NOT NULL,
        description TEXT,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_by UUID REFERENCES users(id)
      );

      -- Insert default thresholds
      INSERT INTO system_config (key, value, description) VALUES
        ('thresholds', '{"autoResolve": 0.90, "draftMin": 0.65, "triage": 0.85}', 'ML confidence thresholds'),
        ('features', '{"autoResolveEnabled": true, "humanInLoopEnabled": true}', 'Feature flags')
      ON CONFLICT (key) DO NOTHING;
    `,
  },
];

async function runMigrations() {
  const client = await pool.connect();
  
  try {
    console.log('Starting migrations...\n');

    // Ensure migrations table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        name VARCHAR(255) PRIMARY KEY,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Get executed migrations
    const { rows: executed } = await client.query('SELECT name FROM migrations');
    const executedNames = new Set(executed.map(r => r.name));

    // Run pending migrations
    for (const migration of migrations) {
      if (executedNames.has(migration.name)) {
        console.log(`✓ ${migration.name} (already executed)`);
        continue;
      }

      console.log(`→ Running ${migration.name}...`);
      
      await client.query('BEGIN');
      
      try {
        await client.query(migration.sql);
        await client.query('INSERT INTO migrations (name) VALUES ($1)', [migration.name]);
        await client.query('COMMIT');
        console.log(`✓ ${migration.name} (success)`);
      } catch (error) {
        await client.query('ROLLBACK');
        console.error(`✗ ${migration.name} (failed):`, error.message);
        throw error;
      }
    }

    console.log('\nMigrations completed successfully!');
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
