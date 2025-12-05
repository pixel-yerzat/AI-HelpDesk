# HelpDesk AI Backend

AI-powered Help Desk System с поддержкой нескольких каналов (Telegram, WhatsApp, Email, Web Portal), автоматической классификацией и RAG для генерации ответов.

## Технологии

- **Runtime**: Node.js 20+
- **Framework**: Express.js
- **Database**: PostgreSQL 16
- **Cache/Message Bus**: Redis 7
- **Vector DB**: Qdrant
- **Object Storage**: MinIO (S3-compatible)
- **LLM**: Anthropic Claude / OpenAI GPT-4

## Быстрый старт

### 1. Требования

- Docker и Docker Compose
- Node.js 20+ (для локальной разработки)

### 2. Запуск через Docker Compose

```bash
# Клонировать репозиторий
git clone <repo-url>
cd helpdesk-ai

# Создать .env из примера
cp .env.example .env

# Добавить API ключи в .env
# ANTHROPIC_API_KEY=your_key
# TELEGRAM_BOT_TOKEN=your_token

# Запустить все сервисы
docker compose up -d

# Проверить статус
docker compose ps

# Выполнить миграции
docker compose exec backend npm run db:migrate

# Заполнить тестовыми данными
docker compose exec backend npm run db:seed
```

### 3. Локальная разработка (без Docker)

```bash
# Установить зависимости
npm install

# Запустить только инфраструктуру
docker compose up -d postgres redis qdrant minio

# Создать .env и настроить подключения

# Выполнить миграции
npm run db:migrate

# Запустить сервер
npm run dev

# В отдельном терминале - запустить worker
npm run worker:processor
```

## API Endpoints

### Авторизация

```bash
# Регистрация
POST /api/v1/auth/register
{
  "email": "user@example.com",
  "password": "password123",
  "name": "User Name"
}

# Вход
POST /api/v1/auth/login
{
  "email": "user@example.com",
  "password": "password123"
}
```

### Тикеты

```bash
# Создать тикет (ingest)
POST /api/v1/messages
{
  "source": "telegram",
  "source_id": "tg:123456",
  "user": { "id": "123", "name": "Иван" },
  "subject": "Не работает VPN",
  "body": "При подключении ошибка 789"
}

# Получить список тикетов
GET /api/v1/tickets?status=new&page=1&limit=20

# Получить тикет
GET /api/v1/tickets/:id

# Выполнить действие
POST /api/v1/tickets/:id/action
{
  "action": "approve",  // approve, reject, escalate, assign, close, add_note
  "comment": "Опциональный комментарий"
}
```

### База знаний

```bash
# Поиск по KB
POST /api/v1/kb/search
{
  "query": "как сбросить пароль vpn",
  "language": "ru",
  "limit": 5
}

# CRUD статей
GET /api/v1/kb
POST /api/v1/kb
GET /api/v1/kb/:id
PUT /api/v1/kb/:id
DELETE /api/v1/kb/:id
```

### Админка

```bash
# Статистика
GET /api/v1/admin/stats?from=2024-01-01&to=2024-12-31

# Метрики по дням
GET /api/v1/admin/stats/daily?days=30

# Health check
GET /api/v1/admin/health
```

## Webhooks

### Telegram
```
POST /api/v1/messages/webhooks/telegram
```

### WhatsApp (360dialog / Twilio)
```
POST /api/v1/messages/webhooks/whatsapp
```

### Email
```
POST /api/v1/messages/webhooks/email
```

## Структура проекта

```
helpdesk-ai/
├── src/
│   ├── api/
│   │   ├── routes/         # API endpoints
│   │   ├── middleware/     # Auth, error handling
│   │   └── validators/     # Request validation
│   ├── config/             # Configuration
│   ├── models/             # Database models
│   ├── services/           # Business logic
│   │   ├── connectors/     # Channel connectors
│   │   ├── nlp/            # NLP/ML services
│   │   └── automation/     # Runbooks
│   ├── utils/              # Helpers
│   ├── workers/            # Background workers
│   └── index.js            # Entry point
├── scripts/                # DB migrations, seeds
├── tests/                  # Tests
├── docker-compose.yml
├── Dockerfile
└── package.json
```

## Пороги принятия решений

Настраиваются в `.env` или через API:

| Параметр | Значение | Описание |
|----------|----------|----------|
| THRESHOLD_AUTO_RESOLVE | 0.90 | Авто-ответ + отправка (с human approval) |
| THRESHOLD_DRAFT_MIN | 0.65 | Создание черновика для проверки |
| THRESHOLD_TRIAGE | 0.85 | Уверенность в авто-решаемости |

## Тестовые данные

После `npm run db:seed`:

- **Admin**: admin@helpdesk.local / admin123
- **Operator**: operator@helpdesk.local / operator123

## Мониторинг

- Prometheus metrics: `GET /metrics` (порт 9090)
- Health check: `GET /health`
- Logs: `./logs/` или stdout в Docker

## TODO

- [ ] Полная интеграция с Anthropic/OpenAI API
- [ ] Vector embeddings для KB
- [ ] Telegram mini-app для исполнителей
- [ ] ITSM интеграция
- [ ] Viber/Teams коннекторы
- [ ] React frontend (Admin Dashboard, Operator Console)

## Лицензия

Private / Internal Use
