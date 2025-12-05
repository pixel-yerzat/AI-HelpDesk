// Ticket categories for classification
export const TICKET_CATEGORIES = [
  {
    code: 'access_vpn',
    name: { ru: 'Доступ / VPN', kz: 'Қол жеткізу / VPN', en: 'Access / VPN' },
    keywords: ['vpn', 'доступ', 'пароль', 'логин', 'войти', 'кіру', 'құпиясөз'],
    autoResolvable: true,
  },
  {
    code: 'hardware',
    name: { ru: 'Оборудование', kz: 'Жабдық', en: 'Hardware' },
    keywords: ['компьютер', 'принтер', 'монитор', 'клавиатура', 'мышь', 'computer', 'printer'],
    autoResolvable: false,
  },
  {
    code: 'software',
    name: { ru: 'Программное обеспечение', kz: 'Бағдарламалық қамтамасыз ету', en: 'Software' },
    keywords: ['программа', 'установить', 'обновить', 'ошибка', 'бағдарлама', 'орнату'],
    autoResolvable: true,
  },
  {
    code: 'email',
    name: { ru: 'Почта', kz: 'Пошта', en: 'Email' },
    keywords: ['почта', 'email', 'outlook', 'письмо', 'хат'],
    autoResolvable: true,
  },
  {
    code: 'network',
    name: { ru: 'Сеть / Интернет', kz: 'Желі / Интернет', en: 'Network / Internet' },
    keywords: ['интернет', 'сеть', 'wifi', 'медленно', 'желі', 'баяу'],
    autoResolvable: false,
  },
  {
    code: 'account',
    name: { ru: 'Учётная запись', kz: 'Есептік жазба', en: 'Account' },
    keywords: ['аккаунт', 'учётная запись', 'профиль', 'есептік жазба'],
    autoResolvable: true,
  },
  {
    code: 'request_new',
    name: { ru: 'Заявка на новое', kz: 'Жаңа сұрау', en: 'New Request' },
    keywords: ['заказать', 'новый', 'нужен', 'жаңа', 'қажет'],
    autoResolvable: false,
  },
  {
    code: 'incident',
    name: { ru: 'Инцидент / Сбой', kz: 'Оқиға / Ақау', en: 'Incident / Outage' },
    keywords: ['сбой', 'не работает', 'упал', 'авария', 'жұмыс істемейді', 'ақау'],
    autoResolvable: false,
    escalate: true,
  },
  {
    code: 'other',
    name: { ru: 'Другое', kz: 'Басқа', en: 'Other' },
    keywords: [],
    autoResolvable: false,
  },
];

// Ticket priorities
export const TICKET_PRIORITIES = {
  critical: { value: 1, name: { ru: 'Критический', kz: 'Маңызды', en: 'Critical' }, slaHours: 1 },
  high: { value: 2, name: { ru: 'Высокий', kz: 'Жоғары', en: 'High' }, slaHours: 4 },
  medium: { value: 3, name: { ru: 'Средний', kz: 'Орташа', en: 'Medium' }, slaHours: 24 },
  low: { value: 4, name: { ru: 'Низкий', kz: 'Төмен', en: 'Low' }, slaHours: 72 },
};

// Ticket statuses
export const TICKET_STATUSES = {
  new: { name: { ru: 'Новый', kz: 'Жаңа', en: 'New' } },
  draft_pending: { name: { ru: 'Ожидает проверки', kz: 'Тексеруді күтуде', en: 'Draft Pending' } },
  in_progress: { name: { ru: 'В работе', kz: 'Жұмыста', en: 'In Progress' } },
  waiting_user: { name: { ru: 'Ожидает пользователя', kz: 'Пайдаланушыны күтуде', en: 'Waiting for User' } },
  resolved: { name: { ru: 'Решён', kz: 'Шешілді', en: 'Resolved' } },
  closed: { name: { ru: 'Закрыт', kz: 'Жабық', en: 'Closed' } },
  escalated: { name: { ru: 'Эскалирован', kz: 'Эскалация', en: 'Escalated' } },
};

// Message sources
export const MESSAGE_SOURCES = {
  telegram: { name: 'Telegram', icon: 'telegram' },
  whatsapp: { name: 'WhatsApp', icon: 'whatsapp' },
  email: { name: 'Email', icon: 'mail' },
  portal: { name: 'Web Portal', icon: 'globe' },
  viber: { name: 'Viber', icon: 'viber' },
  teams: { name: 'MS Teams', icon: 'teams' },
};

// Escalation keywords (immediate escalation)
export const ESCALATION_KEYWORDS = [
  'outage', 'production', 'security', 'breach', 'urgent', 
  'авария', 'срочно', 'безопасность', 'взлом', 'production',
  'шұғыл', 'қауіпсіздік', 'өндіріс',
];

export default {
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  MESSAGE_SOURCES,
  ESCALATION_KEYWORDS,
};
