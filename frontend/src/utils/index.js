import { format, formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';
import { MessageSquare, Mail, Send } from 'lucide-react';

// Date formatting
export const formatDate = (date) => {
  if (!date) return '-';
  return format(new Date(date), 'd MMM yyyy', { locale: ru });
};

export const formatDateTime = (date) => {
  if (!date) return '-';
  return format(new Date(date), 'd MMM yyyy, HH:mm', { locale: ru });
};

export const formatRelativeTime = (date) => {
  if (!date) return '-';
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: ru });
};

// Status configuration
export const STATUS_CONFIG = {
  new: { 
    label: 'Новый', 
    color: 'blue',
    bgClass: 'bg-blue-100 text-blue-800',
  },
  in_progress: { 
    label: 'В работе', 
    color: 'yellow',
    bgClass: 'bg-yellow-100 text-yellow-800',
  },
  draft_pending: { 
    label: 'Черновик', 
    color: 'orange',
    bgClass: 'bg-orange-100 text-orange-800',
  },
  waiting_user: { 
    label: 'Ожидание', 
    color: 'purple',
    bgClass: 'bg-purple-100 text-purple-800',
  },
  resolved: { 
    label: 'Решён', 
    color: 'green',
    bgClass: 'bg-green-100 text-green-800',
  },
  closed: { 
    label: 'Закрыт', 
    color: 'gray',
    bgClass: 'bg-gray-100 text-gray-800',
  },
  escalated: { 
    label: 'Эскалирован', 
    color: 'red',
    bgClass: 'bg-red-100 text-red-800',
  },
};

// Priority configuration
export const PRIORITY_CONFIG = {
  critical: { 
    label: 'Критический', 
    color: 'red',
    bgClass: 'bg-red-100 text-red-800',
  },
  high: { 
    label: 'Высокий', 
    color: 'orange',
    bgClass: 'bg-orange-100 text-orange-800',
  },
  medium: { 
    label: 'Средний', 
    color: 'yellow',
    bgClass: 'bg-yellow-100 text-yellow-800',
  },
  low: { 
    label: 'Низкий', 
    color: 'green',
    bgClass: 'bg-green-100 text-green-800',
  },
};

// Source configuration
export const SOURCE_CONFIG = {
  telegram: { 
    label: 'Telegram', 
    color: 'blue',
    bgClass: 'bg-blue-100 text-blue-800',
    icon: Send,
  },
  whatsapp: { 
    label: 'WhatsApp', 
    color: 'green',
    bgClass: 'bg-green-100 text-green-800',
    icon: MessageSquare,
  },
  email: { 
    label: 'Email', 
    color: 'gray',
    bgClass: 'bg-gray-100 text-gray-800',
    icon: Mail,
  },
  portal: { 
    label: 'Портал', 
    color: 'purple',
    bgClass: 'bg-purple-100 text-purple-800',
    icon: MessageSquare,
  },
};

// Category configuration
export const CATEGORY_CONFIG = {
  access_vpn: { label: 'Доступ/VPN', color: 'blue' },
  hardware: { label: 'Оборудование', color: 'gray' },
  software: { label: 'ПО', color: 'purple' },
  email: { label: 'Почта', color: 'yellow' },
  network: { label: 'Сеть', color: 'red' },
  account: { label: 'Учётные записи', color: 'green' },
  request_new: { label: 'Новый запрос', color: 'blue' },
  incident: { label: 'Инцидент', color: 'red' },
  other: { label: 'Другое', color: 'gray' },
};

// Helpers
export const getStatusBadgeClass = (status) => {
  return STATUS_CONFIG[status]?.bgClass || 'bg-gray-100 text-gray-800';
};

export const getPriorityBadgeClass = (priority) => {
  return PRIORITY_CONFIG[priority]?.bgClass || 'bg-gray-100 text-gray-800';
};

export const truncate = (text, length = 100) => {
  if (!text) return '';
  return text.length > length ? text.substring(0, length) + '...' : text;
};

export const formatConfidence = (value) => {
  if (value === undefined || value === null) return '-';
  return `${Math.round(value * 100)}%`;
};

// Classnames helper
export const cn = (...classes) => {
  return classes.filter(Boolean).join(' ');
};
