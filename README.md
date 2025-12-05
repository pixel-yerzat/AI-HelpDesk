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

### NLP / AI

```bash
# Classify text
POST /api/v1/nlp/classify
{
  "subject": "Не работает VPN",
  "body": "При подключении ошибка 789"
}

# Generate RAG response
POST /api/v1/nlp/generate-response
{
  "subject": "Не работает VPN",
  "body": "При подключении ошибка 789",
  "language": "ru"
}

# Vector search KB
POST /api/v1/nlp/search-kb
{
  "query": "как сбросить пароль vpn",
  "language": "ru",
  "limit": 5
}

# Full NLP pipeline (test)
POST /api/v1/nlp/process
{
  "subject": "Проблема с почтой",
  "body": "Не приходят письма"
}

# Translate text
POST /api/v1/nlp/translate
{
  "text": "Здравствуйте, как я могу вам помочь?",
  "target_language": "kz"
}

# Index KB articles
POST /api/v1/nlp/index-kb-all

# NLP health check
GET /api/v1/nlp/health
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

## Коннекторы (Каналы)

### WhatsApp (через QR-код)

WhatsApp подключается через QR-код, как WhatsApp Web. Сессия сохраняется локально.

**Подключение через веб-интерфейс:**
1. Откройте `http://localhost:3000/admin/whatsapp.html`
2. Авторизуйтесь с JWT токеном
3. Нажмите "Подключить WhatsApp"
4. Отсканируйте QR-код в WhatsApp на телефоне

**API управления:**
```bash
# Получить статус
GET /api/v1/whatsapp/status

# Получить QR-код
GET /api/v1/whatsapp/qr

# Начать подключение (генерирует QR)
POST /api/v1/whatsapp/connect

# Отключить
POST /api/v1/whatsapp/disconnect
{ "logout": false }  # logout: true для выхода из аккаунта

# Отправить тестовое сообщение
POST /api/v1/whatsapp/test-send
{ "phoneNumber": "77001234567", "message": "Test" }

# Проверить номер в WhatsApp
POST /api/v1/whatsapp/check-number
{ "phoneNumber": "77001234567" }

# SSE для real-time обновлений
GET /api/v1/whatsapp/events
```

**Важно:**
- Требуется Chrome/Chromium для puppeteer
- Сессия сохраняется в `./data/whatsapp-sessions/`
- При logout нужно заново сканировать QR
- В Docker нужны дополнительные флаги для puppeteer

### Telegram Bot

Поддерживает два режима работы:

**Polling (для разработки):**
```bash
npm run worker:telegram
```

**Webhook (для production):**
1. Установите `TELEGRAM_WEBHOOK_URL` в `.env`
2. Telegram будет отправлять обновления на `/api/v1/connectors/telegram/webhook`

Функции:
- Приём текстовых сообщений, фото, документов
- Отправка ответов с форматированием (HTML)
- Inline-кнопки для подтверждения решения и оценки
- Команды: `/start`, `/help`, `/status`

### Email (IMAP/SMTP)

**Настройка в `.env`:**
```
IMAP_HOST=imap.example.com
IMAP_PORT=993
IMAP_USER=support@example.com
IMAP_PASSWORD=password
IMAP_TLS=true

SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=support@example.com
SMTP_PASSWORD=password
SMTP_FROM=Support <support@example.com>
```

Функции:
- Polling IMAP каждые 30 секунд
- Автоматическое определение тредов (In-Reply-To, References)
- Фильтрация автоответов
- Очистка quoted text
- Обработка вложений

### Запуск воркеров

```bash
# Все воркеры через Docker Compose
docker compose up -d

# Отдельно для разработки:
npm run worker:processor   # NLP обработка тикетов
npm run worker:telegram    # Telegram бот
npm run worker:outbound    # Отправка сообщений
```

### API управления коннекторами

```bash
# Статус всех коннекторов
GET /api/v1/connectors/status

# Статус конкретного коннектора
GET /api/v1/connectors/status/telegram

# Конфигурация (без секретов)
GET /api/v1/connectors/config

# Тестовая отправка
POST /api/v1/connectors/test-send
{
  "connector": "telegram",
  "recipient": "123456789",
  "message": "Test message"
}
```

## NLP Pipeline

Система использует LLM (Claude/OpenAI) для:

1. **Классификация тикетов** — определение категории и уверенности
2. **Приоритизация** — оценка срочности, детекция ключевых слов эскалации
3. **Triage** — решение об авто-ответе или маршрутизации оператору
4. **RAG Response Generation** — генерация ответа на основе базы знаний
5. **Перевод** — RU ↔ KZ перевод
6. **Детекция языка** — автоматическое определение языка

### Пороги принятия решений

| Параметр | Значение | Действие |
|----------|----------|----------|
| confidence ≥ 0.90 | Auto-resolve | Черновик с высоким приоритетом |
| 0.65 ≤ confidence < 0.90 | Draft | Черновик для проверки |
| confidence < 0.65 | Manual | Маршрутизация оператору |
| Escalation keywords | Immediate | Эскалация |

### Vector DB (Qdrant)

KB статьи индексируются в Qdrant для семантического поиска:

```bash
# Индексировать все статьи
npm run kb:index

# Проверить статистику
npm run kb:stats
```

## TODO

- [x] Полная интеграция с Anthropic/OpenAI API
- [x] Vector embeddings для KB (Qdrant)
- [x] RAG pipeline
- [ ] Telegram mini-app для исполнителей
- [ ] ITSM интеграция
- [ ] Viber/Teams коннекторы
- [ ] React frontend (Admin Dashboard, Operator Console)
- [ ] Fine-tuning классификатора на исторических данных

## Лицензия

Private / Internal Use
