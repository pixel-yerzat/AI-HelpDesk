#!/usr/bin/env node

import pg from 'pg';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
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

async function seed() {
  const client = await pool.connect();

  try {
    console.log('Starting seed...\n');

    // Create admin user
    const adminId = uuidv4();
    const adminPasswordHash = await bcrypt.hash('admin123', 10);

    await client.query(`
      INSERT INTO users (id, email, password_hash, name, role)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (email) DO UPDATE SET password_hash = $3
    `, [adminId, 'admin@helpdesk.local', adminPasswordHash, 'Administrator', 'admin']);
    console.log('✓ Admin user created (admin@helpdesk.local / admin123)');

    // Create operator user
    const operatorId = uuidv4();
    const operatorPasswordHash = await bcrypt.hash('operator123', 10);

    await client.query(`
      INSERT INTO users (id, email, password_hash, name, role)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (email) DO NOTHING
    `, [operatorId, 'operator@helpdesk.local', operatorPasswordHash, 'Оператор', 'operator']);
    console.log('✓ Operator user created (operator@helpdesk.local / operator123)');

    // Create sample KB articles
    const kbArticles = [
      {
        title: 'Как сбросить пароль VPN',
        body: `# Сброс пароля VPN

Если вы забыли пароль для VPN, выполните следующие шаги:

1. Перейдите на портал самообслуживания: https://selfservice.company.com
2. Выберите раздел "VPN доступ"
3. Нажмите "Сбросить пароль"
4. Введите ваш корпоративный email
5. Проверьте почту и следуйте инструкциям в письме

Новый пароль будет действителен сразу после сброса.

**Важно:** Пароль должен содержать минимум 8 символов, включая цифры и специальные символы.`,
        language: 'ru',
        category: 'access_vpn',
        tags: ['vpn', 'пароль', 'сброс', 'доступ'],
      },
      {
        title: 'VPN құпиясөзін қалпына келтіру',
        body: `# VPN құпиясөзін қалпына келтіру

VPN құпиясөзін ұмытып қалсаңыз, келесі қадамдарды орындаңыз:

1. Өзіне-өзі қызмет көрсету порталына өтіңіз: https://selfservice.company.com
2. "VPN қол жетімділігі" бөлімін таңдаңыз
3. "Құпиясөзді қалпына келтіру" түймесін басыңыз
4. Корпоративтік email-іңізді енгізіңіз
5. Поштаңызды тексеріңіз және хаттағы нұсқауларды орындаңыз

Жаңа құпиясөз қалпына келтірілгеннен кейін бірден жарамды болады.`,
        language: 'kz',
        category: 'access_vpn',
        tags: ['vpn', 'құпиясөз', 'қалпына келтіру'],
      },
      {
        title: 'Настройка корпоративной почты на телефоне',
        body: `# Настройка почты на мобильном устройстве

## Для iPhone/iPad:
1. Откройте Настройки → Почта → Учетные записи
2. Нажмите "Добавить учетную запись" → Exchange
3. Введите ваш email и пароль
4. Сервер: mail.company.com

## Для Android:
1. Откройте приложение Gmail или Почта
2. Добавьте учетную запись → Exchange
3. Введите email: ваш_логин@company.com
4. Пароль: ваш корпоративный пароль
5. Сервер: mail.company.com

**Если возникли проблемы**, проверьте:
- Активен ли ваш аккаунт
- Правильно ли введен пароль
- Есть ли подключение к интернету`,
        language: 'ru',
        category: 'email',
        tags: ['почта', 'email', 'настройка', 'телефон', 'мобильный'],
      },
      {
        title: 'Установка принтера',
        body: `# Подключение сетевого принтера

## Автоматическая установка:
1. Откройте \\\\print.company.com в проводнике
2. Найдите нужный принтер (по этажу/кабинету)
3. Дважды щелкните для установки

## Ручная установка:
1. Панель управления → Устройства и принтеры
2. Добавить принтер → Сетевой принтер
3. Введите адрес: \\\\print.company.com\\ИМЯ_ПРИНТЕРА

**Список принтеров по этажам:**
- Этаж 1: PRN-1-RECEPTION, PRN-1-MEETING
- Этаж 2: PRN-2-OPEN, PRN-2-FINANCE
- Этаж 3: PRN-3-IT, PRN-3-HR`,
        language: 'ru',
        category: 'hardware',
        tags: ['принтер', 'установка', 'печать'],
      },
      {
        title: 'Часто задаваемые вопросы по Wi-Fi',
        body: `# Wi-Fi в офисе

## Сети:
- **CORP-WIFI** — для корпоративных устройств (авто-подключение)
- **GUEST-WIFI** — для гостей и личных устройств

## Проблемы с подключением:

**Не подключается к CORP-WIFI:**
1. Убедитесь, что устройство в домене
2. Перезагрузите устройство
3. Проверьте сертификаты (Пуск → certmgr.msc)

**Медленный интернет:**
1. Проверьте, к какой сети подключены
2. Попробуйте переподключиться
3. Отойдите ближе к точке доступа

При постоянных проблемах — создайте заявку с указанием:
- Локация (этаж, кабинет)
- Название сети
- Скриншот ошибки`,
        language: 'ru',
        category: 'network',
        tags: ['wifi', 'сеть', 'интернет', 'подключение'],
      },
    ];

    for (const article of kbArticles) {
      const id = uuidv4();
      await client.query(`
        INSERT INTO kb_articles (id, title, body, language, category, tags, owner_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT DO NOTHING
      `, [id, article.title, article.body, article.language, article.category, JSON.stringify(article.tags), adminId]);
    }
    console.log(`✓ ${kbArticles.length} KB articles created`);

    // Create sample ticket for testing
    const testUserId = uuidv4();
    await client.query(`
      INSERT INTO users (id, email, name, role, external_id, source)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT DO NOTHING
    `, [testUserId, 'test_user@external.local', 'Тестовый Пользователь', 'user', 'tg:123456', 'telegram']);

    const ticketId = uuidv4();
    await client.query(`
      INSERT INTO tickets (id, source, source_id, user_id, subject, body, language, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT DO NOTHING
    `, [
      ticketId,
      'telegram',
      'tg:123456',
      testUserId,
      'Не работает VPN',
      'Добрый день! При подключении к VPN выдает ошибку 789. Вчера всё работало нормально. Что делать?',
      'ru',
      'new',
    ]);

    // Add NLP results
    await client.query(`
      INSERT INTO ticket_nlp (ticket_id, category, category_conf, priority, priority_conf, triage, triage_conf, summary, suggested_response)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT DO NOTHING
    `, [
      ticketId,
      'access_vpn',
      0.92,
      'medium',
      0.85,
      'auto_resolvable',
      0.88,
      'Пользователь сообщает об ошибке 789 при подключении к VPN',
      'Здравствуйте! Ошибка 789 обычно связана с настройками сертификата. Попробуйте следующее:\n\n1. Перезагрузите компьютер\n2. Если не помогло, сбросьте пароль VPN на портале самообслуживания: https://selfservice.company.com\n\nЕсли проблема сохраняется, сообщите нам.',
    ]);

    // Add message
    const msgId = uuidv4();
    await client.query(`
      INSERT INTO ticket_messages (id, ticket_id, sender, sender_type, content)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT DO NOTHING
    `, [
      msgId,
      ticketId,
      testUserId,
      'user',
      'Добрый день! При подключении к VPN выдает ошибку 789. Вчера всё работало нормально. Что делать?',
    ]);

    console.log('✓ Sample ticket created');

    console.log('\n✅ Seed completed successfully!');
    console.log('\nTest credentials:');
    console.log('  Admin: admin@helpdesk.local / admin123');
    console.log('  Operator: operator@helpdesk.local / operator123');

  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
