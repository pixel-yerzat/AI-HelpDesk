-- AI Help Desk Database Schema

-- Enum types
CREATE TYPE ticket_channel AS ENUM ('email', 'telegram', 'web', 'teams', 'phone');
CREATE TYPE ticket_priority AS ENUM ('critical', 'high', 'medium', 'low');
CREATE TYPE ticket_status AS ENUM ('new', 'classified', 'auto_resolved', 'escalated', 'in_progress', 'pending_user', 'resolved', 'closed');
CREATE TYPE ticket_category AS ENUM ('password_reset', 'access_request', 'software_install', 'hardware_issue', 'network_issue', 'email_issue', 'vpn_issue', 'printer_issue', 'general_question', 'other');
CREATE TYPE department AS ENUM ('infrastructure', 'security', 'applications', 'network', 'helpdesk');
CREATE TYPE language AS ENUM ('kz', 'ru', 'en');
CREATE TYPE user_role AS ENUM ('user', 'operator', 'admin');

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    phone VARCHAR(50),
    role user_role DEFAULT 'user',
    department department,
    password_hash VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tickets table
CREATE TABLE tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    number VARCHAR(20) UNIQUE NOT NULL,
    subject VARCHAR(500),
    text TEXT NOT NULL,
    channel ticket_channel NOT NULL,
    language language DEFAULT 'ru',
    
    -- Classification
    category ticket_category,
    priority ticket_priority,
    department department,
    status ticket_status DEFAULT 'new',
    intent VARCHAR(200),
    classification_confidence DECIMAL(3,2),
    
    -- User info
    user_id UUID REFERENCES users(id),
    user_email VARCHAR(255),
    user_name VARCHAR(255),
    user_phone VARCHAR(50),
    
    -- Assignment
    assigned_to UUID REFERENCES users(id),
    assigned_at TIMESTAMP,
    
    -- Resolution
    resolved_by UUID REFERENCES users(id),
    resolution TEXT,
    resolved_at TIMESTAMP,
    is_auto_resolved BOOLEAN DEFAULT false,
    auto_resolve_action VARCHAR(100),
    
    -- SLA
    sla_deadline TIMESTAMP,
    sla_breached BOOLEAN DEFAULT false,
    first_response_at TIMESTAMP,
    
    -- Metadata
    attachments JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    similar_ticket_ids JSONB DEFAULT '[]',
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ticket messages
CREATE TABLE ticket_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    is_from_user BOOLEAN DEFAULT true,
    is_ai_generated BOOLEAN DEFAULT false,
    sender_id UUID REFERENCES users(id),
    sender_name VARCHAR(255),
    sender_email VARCHAR(255),
    attachments JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Knowledge base articles
CREATE TABLE knowledge_articles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    category ticket_category,
    language language DEFAULT 'ru',
    keywords JSONB DEFAULT '[]',
    embedding_id VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    view_count INTEGER DEFAULT 0,
    helpful_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Auto actions for typical incidents
CREATE TABLE auto_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    category ticket_category NOT NULL,
    trigger_keywords JSONB DEFAULT '[]',
    trigger_intent VARCHAR(200),
    action_type VARCHAR(50),
    action_config JSONB DEFAULT '{}',
    response_template TEXT,
    response_template_kz TEXT,
    is_active BOOLEAN DEFAULT true,
    success_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Classification feedback for model improvement
CREATE TABLE classification_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID REFERENCES tickets(id),
    predicted_category ticket_category,
    actual_category ticket_category,
    predicted_priority ticket_priority,
    actual_priority ticket_priority,
    is_correct BOOLEAN,
    corrected_by UUID REFERENCES users(id),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_priority ON tickets(priority);
CREATE INDEX idx_tickets_category ON tickets(category);
CREATE INDEX idx_tickets_user_email ON tickets(user_email);
CREATE INDEX idx_tickets_created_at ON tickets(created_at DESC);
CREATE INDEX idx_tickets_number ON tickets(number);
CREATE INDEX idx_ticket_messages_ticket_id ON ticket_messages(ticket_id);
CREATE INDEX idx_users_email ON users(email);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tickets_updated_at
    BEFORE UPDATE ON tickets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER knowledge_articles_updated_at
    BEFORE UPDATE ON knowledge_articles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- Seed default admin user
INSERT INTO users (email, name, role, password_hash) 
VALUES ('admin@helpdesk.local', 'Admin', 'admin', '$2a$10$rQnM1.pZ5I5l5l5l5l5l5uXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');

-- Seed auto actions
INSERT INTO auto_actions (name, category, action_type, response_template, response_template_kz) VALUES
('Password Reset', 'password_reset', 'send_reset_link', 
 'Здравствуйте! Для сброса пароля перейдите по ссылке: {reset_link}. Ссылка действительна 24 часа.',
 'Сәлеметсіз бе! Құпия сөзді қалпына келтіру үшін мына сілтемеге өтіңіз: {reset_link}. Сілтеме 24 сағат жарамды.'),
('VPN Instructions', 'vpn_issue', 'send_kb_article',
 'Для настройки VPN выполните следующие шаги:\n1. Скачайте клиент с портала\n2. Установите сертификат\n3. Подключитесь к серверу',
 'VPN орнату үшін келесі қадамдарды орындаңыз:\n1. Порталдан клиентті жүктеп алыңыз\n2. Сертификатты орнатыңыз\n3. Серверге қосылыңыз');
