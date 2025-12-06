# Деплой HelpDesk AI в Production

## Требования

- Ubuntu 20.04+ / Debian 11+ (или любой Linux с Docker)
- Docker 24.0+
- Docker Compose v2+
- 4 GB RAM минимум (8 GB рекомендуется)
- 20 GB дискового пространства
- Открытые порты: 80, 443

## Быстрый старт

### 1. Клонирование и настройка

```bash
# Клонировать репозиторий
git clone <repository-url> helpdesk-ai
cd helpdesk-ai

# Создать файл с переменными окружения
cp .env.prod.example .env.prod
nano .env.prod
```

### 2. Заполнить .env.prod

**Обязательные переменные:**

```bash
# Сгенерировать безопасные пароли
openssl rand -base64 32  # Для DB_PASSWORD
openssl rand -base64 32  # Для REDIS_PASSWORD
openssl rand -base64 64  # Для JWT_SECRET
openssl rand -base64 32  # Для MINIO_SECRET_KEY

# Пример заполнения
DB_PASSWORD=ваш_сгенерированный_пароль
REDIS_PASSWORD=ваш_сгенерированный_пароль
JWT_SECRET=ваш_сгенерированный_секрет
MINIO_SECRET_KEY=ваш_сгенерированный_пароль

# API ключ для AI (Anthropic или OpenAI)
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-api03-xxxxx
```

### 3. Запуск

```bash
# Первоначальная установка
./deploy.sh setup

# Или пошагово:
docker compose -f docker-compose.prod.yml --env-file .env.prod build
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

### 4. Проверка

```bash
# Статус сервисов
./deploy.sh status

# Логи
./deploy.sh logs

# Проверить API
curl https://localhost/api/v1 -k
```

## Структура деплоя

```
┌─────────────────────────────────────────────────────────────┐
│                         Nginx (443)                         │
│                    SSL + Rate Limiting                      │
└──────────────────────────┬──────────────────────────────────┘
                           │
           ┌───────────────┼───────────────┐
           │               │               │
           ▼               ▼               ▼
    ┌──────────┐    ┌──────────┐    ┌──────────┐
    │ Frontend │    │ Backend  │    │  Static  │
    │  (React) │    │  (API)   │    │  Files   │
    └──────────┘    └────┬─────┘    └──────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         ▼               ▼               ▼
   ┌──────────┐    ┌──────────┐    ┌──────────┐
   │ Postgres │    │  Redis   │    │  Qdrant  │
   │   (DB)   │    │ (Cache)  │    │ (Vector) │
   └──────────┘    └──────────┘    └──────────┘
         │
         │ Redis Streams
         │
   ┌─────┴─────────────────────────────────────┐
   │               Workers                      │
   │  ┌─────────┐ ┌─────────┐ ┌─────────────┐  │
   │  │Processor│ │Telegram │ │  WhatsApp   │  │
   │  └─────────┘ └─────────┘ └─────────────┘  │
   │  ┌─────────┐ ┌─────────┐                  │
   │  │Outbound │ │KB Indexer│                 │
   │  └─────────┘ └─────────┘                  │
   └───────────────────────────────────────────┘
```

## Команды управления

```bash
# Статус
./deploy.sh status

# Логи (все)
./deploy.sh logs

# Логи конкретного сервиса
./deploy.sh logs backend
./deploy.sh logs worker-processor

# Перезапуск
./deploy.sh restart
./deploy.sh restart backend

# Остановка
./deploy.sh stop

# Обновление
./deploy.sh update

# Бэкап базы данных
./deploy.sh backup

# Восстановление
./deploy.sh restore ./backups/postgres/helpdesk_20241205_120000.sql.gz

# Масштабирование воркеров
./deploy.sh scale worker-processor 3
```

## SSL сертификаты

### Вариант 1: Let's Encrypt (рекомендуется)

```bash
# Добавить в .env.prod
DOMAIN=helpdesk.example.com
LETSENCRYPT_EMAIL=admin@example.com

# Получить сертификат
./deploy.sh ssl
```

### Вариант 2: Свой сертификат

```bash
# Положить сертификаты в ./nginx/ssl/
cp /path/to/fullchain.pem ./nginx/ssl/
cp /path/to/privkey.pem ./nginx/ssl/
```

### Вариант 3: Self-signed (для тестирования)

```bash
# Генерируется автоматически при ./deploy.sh setup
```

## Мониторинг

```bash
# Включить Prometheus + Grafana
./deploy.sh monitoring

# Grafana доступен на порту 3001
# Login: admin / <GRAFANA_PASSWORD из .env.prod>
```

### Метрики

- Количество тикетов (по статусу, источнику)
- Время обработки
- Точность AI классификации
- Использование ресурсов

## Бэкапы

### Автоматические бэкапы

Добавить в crontab:

```bash
# Бэкап каждый день в 3:00
0 3 * * * cd /path/to/helpdesk-ai && ./deploy.sh backup

# Хранить последние 7 бэкапов
```

### Ручной бэкап

```bash
./deploy.sh backup
# Файл: ./backups/postgres/helpdesk_YYYYMMDD_HHMMSS.sql.gz
```

### Восстановление

```bash
./deploy.sh restore ./backups/postgres/helpdesk_20241205_120000.sql.gz
```

## Безопасность

### Checklist

- [ ] Изменить пароль admin@helpdesk.local сразу после установки
- [ ] Использовать сильные пароли (генерировать через openssl)
- [ ] Настроить SSL (Let's Encrypt или свой)
- [ ] Ограничить доступ к портам (только 80, 443)
- [ ] Настроить firewall (ufw/iptables)
- [ ] Регулярные бэкапы
- [ ] Обновления безопасности ОС

### Firewall

```bash
# UFW
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable

# Доступ к Grafana только из внутренней сети (опционально)
ufw allow from 10.0.0.0/8 to any port 3001
```

### Rate Limiting

Настроен в nginx:
- API: 10 запросов/сек
- Login: 5 попыток/мин
- Максимум 20 одновременных соединений

## Масштабирование

### Горизонтальное

```bash
# Увеличить количество воркеров
./deploy.sh scale worker-processor 3
./deploy.sh scale worker-outbound 2
```

### Вертикальное

Редактировать docker-compose.prod.yml:

```yaml
services:
  backend:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
```

## Troubleshooting

### Проверка логов

```bash
# Все логи
./deploy.sh logs

# Конкретный сервис
docker compose -f docker-compose.prod.yml logs backend --tail 100

# Логи в реальном времени
docker compose -f docker-compose.prod.yml logs -f worker-processor
```

### Общие проблемы

**База данных не запускается:**
```bash
docker compose -f docker-compose.prod.yml logs postgres
# Проверить права на volume
ls -la /var/lib/docker/volumes/
```

**Backend не стартует:**
```bash
# Проверить переменные окружения
docker compose -f docker-compose.prod.yml config
# Запустить интерактивно
docker compose -f docker-compose.prod.yml run --rm backend sh
```

**SSL ошибки:**
```bash
# Проверить сертификаты
openssl x509 -in ./nginx/ssl/fullchain.pem -text -noout
# Проверить nginx конфиг
docker compose -f docker-compose.prod.yml exec frontend nginx -t
```

**WhatsApp не подключается:**
```bash
# Проверить логи
./deploy.sh logs worker-whatsapp
# Очистить сессию
docker volume rm helpdesk-ai_whatsapp_sessions
```

## Обновление

```bash
# Стандартное обновление
./deploy.sh update

# Или вручную:
git pull
docker compose -f docker-compose.prod.yml --env-file .env.prod build
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm backend npm run db:migrate
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

## Контакты

При проблемах создайте issue в репозитории или свяжитесь с командой разработки.
