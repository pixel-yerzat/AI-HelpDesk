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
        title_ru: 'Как сбросить пароль VPN',
        title_kz: 'VPN құпиясөзін қалпына келтіру',
        content_ru: `Если вы забыли пароль для VPN, выполните следующие шаги:

1. Перейдите на портал самообслуживания: https://selfservice.company.com
2. Выберите раздел "VPN доступ"
3. Нажмите "Сбросить пароль"
4. Введите ваш корпоративный email
5. Проверьте почту и следуйте инструкциям в письме

Новый пароль будет действителен сразу после сброса.

**Важно:** Пароль должен содержать минимум 8 символов, включая цифры и специальные символы.

**Частые ошибки:**
- Ошибка 789: Проблема с сертификатом. Перезагрузите компьютер.
- Ошибка 691: Неверный логин или пароль.
- Ошибка 800: Сервер недоступен. Проверьте интернет-соединение.`,
        content_kz: `VPN құпиясөзін ұмытып қалсаңыз, келесі қадамдарды орындаңыз:

1. Өзіне-өзі қызмет көрсету порталына өтіңіз: https://selfservice.company.com
2. "VPN қол жетімділігі" бөлімін таңдаңыз
3. "Құпиясөзді қалпына келтіру" түймесін басыңыз
4. Корпоративтік email-іңізді енгізіңіз
5. Поштаңызды тексеріңіз және хаттағы нұсқауларды орындаңыз`,
        category: 'access_vpn',
        type: 'guide',
        keywords: ['vpn', 'пароль', 'сброс', 'доступ', 'ошибка 789', 'ошибка 691'],
      },
      {
        title_ru: 'Настройка корпоративной почты на телефоне',
        title_kz: 'Телефонда корпоративтік поштаны орнату',
        content_ru: `## Для iPhone/iPad:
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
        content_kz: `iPhone/iPad үшін: Параметрлер → Пошта → Есептік жазбалар`,
        category: 'email',
        type: 'guide',
        keywords: ['почта', 'email', 'настройка', 'телефон', 'мобильный', 'exchange'],
      },
      {
        title_ru: 'Установка принтера',
        title_kz: 'Принтерді орнату',
        content_ru: `## Автоматическая установка:
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
- Этаж 3: PRN-3-IT, PRN-3-HR

**Проблемы с печатью:**
- Принтер не печатает: Проверьте очередь печати, перезапустите службу печати
- Замятие бумаги: Откройте крышку, аккуратно извлеките бумагу`,
        content_kz: `Принтерді автоматты түрде орнату үшін \\\\print.company.com ашыңыз`,
        category: 'hardware',
        type: 'guide',
        keywords: ['принтер', 'установка', 'печать', 'сетевой принтер'],
      },
      {
        title_ru: 'Wi-Fi в офисе',
        title_kz: 'Кеңседегі Wi-Fi',
        content_ru: `## Сети:
- **CORP-WIFI** — для корпоративных устройств (авто-подключение)
- **GUEST-WIFI** — для гостей и личных устройств

## Пароль для гостевой сети:
Пароль: Welcome2024! (обновляется ежемесячно)

## Проблемы с подключением:

**Не подключается к CORP-WIFI:**
1. Убедитесь, что устройство в домене
2. Перезагрузите устройство
3. Проверьте сертификаты

**Медленный интернет:**
1. Проверьте, к какой сети подключены
2. Попробуйте переподключиться
3. Отойдите ближе к точке доступа`,
        content_kz: `CORP-WIFI — корпоративтік құрылғылар үшін, GUEST-WIFI — қонақтар үшін`,
        category: 'network',
        type: 'faq',
        keywords: ['wifi', 'сеть', 'интернет', 'подключение', 'пароль wifi'],
      },
      {
        title_ru: 'Заказ канцтоваров',
        title_kz: 'Кеңсе тауарларына тапсырыс беру',
        content_ru: `## Как заказать канцтовары:

1. Откройте внутренний портал: https://portal.company.com
2. Перейдите в раздел "Заявки" → "Канцтовары"
3. Выберите нужные товары из каталога
4. Укажите количество и кабинет доставки
5. Нажмите "Отправить заявку"

**Сроки:** Заявки обрабатываются в течение 2-3 рабочих дней.

**Лимиты:** На одного сотрудника - не более 500 тенге в месяц.

**Срочный заказ:** Обратитесь к офис-менеджеру (каб. 105)`,
        content_kz: `Кеңсе тауарларына тапсырыс беру үшін portal.company.com сайтына кіріңіз`,
        category: 'general',
        type: 'guide',
        keywords: ['канцтовары', 'заказ', 'ручки', 'бумага'],
      },
      {
        title_ru: 'Политика удалённой работы',
        title_kz: 'Қашықтан жұмыс істеу саясаты',
        content_ru: `## Правила удалённой работы:

1. **Согласование:** Удалённая работа согласуется с руководителем
2. **График:** Быть на связи с 9:00 до 18:00
3. **Отчётность:** Ежедневный отчёт в конце дня
4. **Инструменты:** Использовать корпоративный VPN и Teams

## Техническое обеспечение:
- VPN: обязателен для доступа к внутренним системам
- Teams: для коммуникации и совещаний
- Outlook: корпоративная почта

## При проблемах с подключением:
1. Проверьте интернет-соединение
2. Перезагрузите VPN-клиент
3. Обратитесь в техподдержку`,
        content_kz: `Қашықтан жұмыс істеу басшымен келісіледі`,
        category: 'policy',
        type: 'policy',
        keywords: ['удалённая работа', 'home office', 'remote', 'vpn'],
      },
      {
        title_ru: 'Сброс пароля Windows',
        title_kz: 'Windows құпиясөзін қалпына келтіру',
        content_ru: `## Самостоятельный сброс:

1. На экране входа нажмите "Забыли пароль?"
2. Введите ваш корпоративный email
3. Получите код на телефон или email
4. Введите код и создайте новый пароль

## Если не работает:
1. Обратитесь к администратору (вн. 1111)
2. Или создайте заявку в техподдержку

**Требования к паролю:**
- Минимум 8 символов
- Заглавные и строчные буквы
- Цифры и спецсимволы
- Не использовать предыдущие 5 паролей`,
        content_kz: `Құпиясөзді қалпына келтіру үшін "Құпиясөзді ұмыттыңыз ба?" батырмасын басыңыз`,
        category: 'account',
        type: 'guide',
        keywords: ['пароль', 'windows', 'сброс', 'вход', 'логин'],
      },
      {
        title_ru: 'Как заказать пропуск для гостя',
        title_kz: 'Қонақ үшін өткізу рұқсатына тапсырыс беру',
        content_ru: `## Заказ пропуска:

1. Откройте portal.company.com → "Пропуска"
2. Нажмите "Заявка на гостевой пропуск"
3. Заполните данные гостя:
   - ФИО
   - Компания
   - Цель визита
   - Дата и время
4. Укажите себя как принимающего
5. Отправьте заявку

**Сроки:** Заявка обрабатывается 1 рабочий день.

**Важно:** Встретьте гостя на ресепшн и сопровождайте в офисе.`,
        content_kz: `Қонақ пропускасына тапсырыс беру үшін portal.company.com сайтына кіріңіз`,
        category: 'general',
        type: 'guide',
        keywords: ['пропуск', 'гость', 'визит', 'доступ'],
      },
      {
        title_ru: 'Установка Microsoft Office',
        title_kz: 'Microsoft Office орнату',
        content_ru: `## Установка Office 365:

1. Откройте https://portal.office.com
2. Войдите корпоративным аккаунтом
3. Нажмите "Установить Office"
4. Скачайте и запустите установщик
5. Следуйте инструкциям

**Активация:**
Office активируется автоматически при входе в корпоративный аккаунт.

**Проблемы с активацией:**
1. Выйдите из всех аккаунтов Office
2. Войдите снова корпоративным аккаунтом
3. Если не помогло - обратитесь в техподдержку`,
        content_kz: `Office орнату үшін portal.office.com сайтына кіріңіз`,
        category: 'software',
        type: 'guide',
        keywords: ['office', 'word', 'excel', 'установка', 'активация'],
      },
      {
        title_ru: 'Подключение к Teams-совещанию',
        title_kz: 'Teams жиналысына қосылу',
        content_ru: `## Присоединиться к совещанию:

**Из приложения Teams:**
1. Откройте Teams
2. Перейдите в Календарь
3. Нажмите на совещание → "Присоединиться"

**По ссылке:**
1. Нажмите на ссылку из приглашения
2. Выберите "Присоединиться в браузере" или "Открыть в Teams"

## Советы:
- Проверьте микрофон и камеру заранее
- Используйте наушники для лучшего звука
- Отключайте микрофон когда не говорите

## Проблемы со звуком:
1. Проверьте настройки звука в Teams
2. Проверьте выбрано ли правильное устройство
3. Перезапустите Teams`,
        content_kz: `Teams жиналысына қосылу үшін календарьдағы жиналысты басыңыз`,
        category: 'software',
        type: 'faq',
        keywords: ['teams', 'совещание', 'видеозвонок', 'конференция'],
      },
    ];

    for (const article of kbArticles) {
      const id = uuidv4();
      await client.query(`
        INSERT INTO kb_articles (id, title_ru, title_kz, content_ru, content_kz, category, type, keywords, is_published, owner_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9)
        ON CONFLICT DO NOTHING
      `, [id, article.title_ru, article.title_kz || '', article.content_ru, article.content_kz || '', article.category, article.type, article.keywords, adminId]);
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
