import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';

// Date formatting
export const formatDate = (date) => {
  if (!date) return '-';
  const parsed = typeof date === 'string' ? parseISO(date) : date;
  return format(parsed, 'd MMM yyyy', { locale: ru });
};

export const formatDateTime = (date) => {
  if (!date) return '-';
  const parsed = typeof date === 'string' ? parseISO(date) : date;
  return format(parsed, 'd MMM yyyy, HH:mm', { locale: ru });
};

export const formatRelativeTime = (date) => {
  if (!date) return '-';
  const parsed = typeof date === 'string' ? parseISO(date) : date;
  return formatDistanceToNow(parsed, { addSuffix: true, locale: ru });
};

// Status labels and colors
export const STATUS_CONFIG = {
  new: { label: 'Новый', color: 'blue', bgClass: 'bg-blue-100 text-blue-800' },
  draft_pending: { label: 'Черновик', color: 'yellow', bgClass: 'bg-yellow-100 text-yellow-800' },
  in_progress: { label: 'В работе', color: 'purple', bgClass: 'bg-purple-100 text-purple-800' },
  waiting_user: { label: 'Ожидание ответа', color: 'orange', bgClass: 'bg-orange-100 text-orange-800' },
  resolved: { label: 'Решён', color: 'green', bgClass: 'bg-green-100 text-green-800' },
  closed: { label: 'Закрыт', color: 'gray', bgClass: 'bg-gray-100 text-gray-800' },
  escalated: { label: 'Эскалация', color: 'red', bgClass: 'bg-red-100 text-red-800' },
};

export const PRIORITY_CONFIG = {
  critical: { label: 'Критический', color: 'red', bgClass: 'bg-red-100 text-red-800' },
  high: { label: 'Высокий', color: 'orange', bgClass: 'bg-orange-100 text-orange-800' },
  medium: { label: 'Средний', color: 'yellow', bgClass: 'bg-yellow-100 text-yellow-800' },
  low: { label: 'Низкий', color: 'green', bgClass: 'bg-green-100 text-green-800' },
};

export const SOURCE_CONFIG = {
  telegram: { label: 'Telegram', icon: 'MessageCircle', color: '#0088cc' },
  whatsapp: { label: 'WhatsApp', icon: 'Phone', color: '#25D366' },
  email: { label: 'Email', icon: 'Mail', color: '#EA4335' },
  portal: { label: 'Портал', icon: 'Globe', color: '#6366f1' },
};

export const CATEGORY_CONFIG = {
  access_vpn: { label: 'Доступ / VPN', icon: 'Key' },
  hardware: { label: 'Оборудование', icon: 'Monitor' },
  software: { label: 'ПО', icon: 'Box' },
  email: { label: 'Почта', icon: 'Mail' },
  network: { label: 'Сеть', icon: 'Wifi' },
  account: { label: 'Учётная запись', icon: 'User' },
  request_new: { label: 'Заявка на новое', icon: 'Plus' },
  incident: { label: 'Инцидент', icon: 'AlertTriangle' },
  other: { label: 'Другое', icon: 'HelpCircle' },
};

// Get status badge class
export const getStatusBadgeClass = (status) => {
  return STATUS_CONFIG[status]?.bgClass || 'bg-gray-100 text-gray-800';
};

// Get priority badge class
export const getPriorityBadgeClass = (priority) => {
  return PRIORITY_CONFIG[priority]?.bgClass || 'bg-gray-100 text-gray-800';
};

// Truncate text
export const truncate = (text, length = 50) => {
  if (!text) return '';
  return text.length > length ? text.substring(0, length) + '...' : text;
};

// Format confidence percentage
export const formatConfidence = (value) => {
  if (value === null || value === undefined) return '-';
  return `${(value * 100).toFixed(0)}%`;
};

// Class names helper
export const cn = (...classes) => {
  return classes.filter(Boolean).join(' ');
};
