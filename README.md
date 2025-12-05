# 🤖 AI Help Desk (Node.js)

**Полная автоматизация первой линии IT-поддержки**

## 📁 Структура проекта

```
ai-helpdesk-node/
├── src/
│   ├── api/
│   │   ├── routes/          # Express роуты
│   │   │   ├── tickets.js   # CRUD тикетов
│   │   │   ├── auth.js      # Аутентификация
│   │   │   ├── stats.js     # Статистика
│   │   │   └── knowledge.js # База знаний
│   │   ├── controllers/     # Контроллеры
│   │   └── middlewares/     # Middleware
│   │       └── errorHandler.js
│   ├── services/            # Бизнес-логика
│   │   ├── ticketService.js
│   │   ├── aiService.js
│   │   └── ...
│   ├── models/              # Модели данных
│   ├── integrations/        # Интеграции
│   │   ├── telegram/
│   │   ├── email/
│   │   └── ...
│   ├── utils/               # Утилиты
│   │   └── logger.js
│   ├── config/              # Конфигурация
│   │   ├── index.js
│   │   ├── database.js
│   │   └── redis.js
│   ├── app.js               # Express app
│   └── index.js             # Entry point
├── tests/                   # Тесты
├── scripts/                 # Скрипты
│   └── init.sql             # Инициализация БД
├── public/                  # Статика
├── docker-compose.yml
├── Dockerfile
├── package.json
└── .env.example
```

## 🚀 Быстрый старт

```bash
# 1. Клонирование
git clone <repo>
cd ai-helpdesk-node

# 2. Настройка
cp .env.example .env
# Отредактируйте .env

# 3. Запуск с Docker
docker-compose up -d

# 4. Проверка
curl http://localhost:3000/health
```

## 🔧 Разработка

```bash
# Установка зависимостей
npm install

# Запуск в dev режиме
npm run dev

# Запуск только инфраструктуры
docker-compose up -d db redis qdrant
```

## 📡 API Endpoints

| Method | Endpoint | Описание |
|--------|----------|----------|
| POST | /api/v1/tickets | Создать тикет |
| GET | /api/v1/tickets | Список тикетов |
| GET | /api/v1/tickets/:id | Получить тикет |
| POST | /api/v1/tickets/:id/resolve | Закрыть тикет |
| GET | /api/v1/stats/dashboard | Статистика |

## 🗂️ Что реализовать

- [ ] `src/services/ticketService.js` - CRUD тикетов
- [ ] `src/services/aiService.js` - AI классификация
- [ ] `src/api/controllers/ticketController.js` - Контроллер
- [ ] `src/integrations/telegram/bot.js` - Telegram бот
- [ ] `src/integrations/email/parser.js` - Email парсер

---

**ITFEST Hackathon 2025**
