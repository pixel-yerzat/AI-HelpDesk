# Тестирование HelpDesk AI

## Быстрый тест (без внешних зависимостей)

```bash
# Структурные тесты - проверяют что все модули загружаются
npm test
```

Результат:
```
✓ Config loads without errors
✓ Categories config loads
✓ User model loads
✓ Ticket model loads
... (60 тестов)
✅ All tests passed!
```

## API тесты (требуется запущенный сервер)

### 1. Запустить тестовое окружение

```bash
# Запустить БД и Redis
docker compose -f docker-compose.test.yml up -d

# Подождать пока всё поднимется
sleep 10

# Создать .env для тестов
cat > .env << EOF
NODE_ENV=development
PORT=3000
DB_HOST=localhost
DB_PORT=5433
DB_NAME=helpdesk_test
DB_USER=helpdesk
DB_PASSWORD=helpdesk_secret
REDIS_HOST=localhost
REDIS_PORT=6380
QDRANT_HOST=localhost
QDRANT_PORT=6334
JWT_SECRET=test-secret-key-12345
EOF
```

### 2. Запустить миграции и seed

```bash
npm run db:migrate
npm run db:seed
```

### 3. Запустить сервер

```bash
npm start
```

### 4. В другом терминале запустить тесты

```bash
npm run test:api
```

Результат:
```
═══ Authentication ═══
✓ POST /api/v1/auth/login - valid credentials
✓ POST /api/v1/auth/login - invalid credentials
✓ GET /api/v1/auth/me - with token
...
═══ WhatsApp ═══
✓ GET /api/v1/whatsapp/status

📊 Results:
   Passed: 25
   Failed: 0
   ⏱  Time: 1.23s

✅ All API tests passed!
```

## Полное тестирование (Docker)

```bash
# Собрать и запустить всё
docker compose up -d --build

# Подождать
sleep 30

# Проверить что всё работает
docker compose ps

# Выполнить миграции
docker compose exec backend npm run db:migrate
docker compose exec backend npm run db:seed

# Проверить API
curl http://localhost:3000/api/v1 | jq

# Проверить Frontend
curl http://localhost/ | head
```

## Тестовые данные

После `npm run db:seed`:

| Роль | Email | Пароль |
|------|-------|--------|
| Admin | admin@helpdesk.local | admin123 |
| Operator | operator@helpdesk.local | operator123 |

## Ручное тестирование

### Авторизация
```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@helpdesk.local","password":"admin123"}' | jq -r '.token')

echo $TOKEN
```

### Создание тикета
```bash
curl -X POST http://localhost:3000/api/v1/messages/ingest \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "source": "portal",
    "source_id": "test-123",
    "user": {"id": "user-1", "name": "Test User"},
    "subject": "Не работает VPN",
    "body": "При подключении к VPN выдает ошибку 789. Что делать?"
  }'
```

### Список тикетов
```bash
curl http://localhost:3000/api/v1/tickets \
  -H "Authorization: Bearer $TOKEN" | jq
```

### WhatsApp статус
```bash
curl http://localhost:3000/api/v1/whatsapp/status \
  -H "Authorization: Bearer $TOKEN" | jq
```

## Frontend тестирование

```bash
cd frontend
npm run dev
# Открыть http://localhost:5173
```

1. Войти: admin@helpdesk.local / admin123
2. Проверить Dashboard - графики должны отображаться
3. Проверить Тикеты - список и фильтры
4. Проверить Каналы - статус WhatsApp

## Checklist

- [ ] Backend запускается без ошибок
- [ ] Миграции выполняются успешно
- [ ] Авторизация работает
- [ ] API тикетов возвращает данные
- [ ] Frontend собирается
- [ ] Login страница работает
- [ ] Dashboard отображает графики
- [ ] WhatsApp страница показывает статус

## Остановка тестового окружения

```bash
docker compose -f docker-compose.test.yml down -v
```
