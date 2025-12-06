import axios from 'axios';

const API_BASE = '/api/v1';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth
export const auth = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  register: (data) => api.post('/auth/register', data),
  me: () => api.get('/auth/me'),
  updateProfile: (data) => api.put('/auth/me', data),
  changePassword: (oldPassword, newPassword) => 
    api.put('/auth/password', { oldPassword, newPassword }),
};

// Tickets
export const tickets = {
  list: (params) => api.get('/tickets', { params }),
  get: (id) => api.get(`/tickets/${id}`),
  getDrafts: () => api.get('/tickets/drafts'),
  action: (id, action, data = {}) => api.post(`/tickets/${id}/action`, { action, ...data }),
  getMessages: (id) => api.get(`/tickets/${id}/messages`),
  addMessage: (id, content) => api.post(`/tickets/${id}/messages`, { content }),
  assign: (id, assignedTo) => api.post(`/tickets/${id}/action`, { action: 'assign', assigned_to: assignedTo }),
};

// Knowledge Base
export const kb = {
  list: (params) => api.get('/kb', { params }),
  get: (id) => api.get(`/kb/${id}`),
  create: (data) => api.post('/kb', data),
  update: (id, data) => api.put(`/kb/${id}`, data),
  delete: (id) => api.delete(`/kb/${id}`),
  search: (query, options = {}) => api.post('/kb/search', { query, ...options }),
  getStats: () => api.get('/kb/stats'),
};

// Admin
export const admin = {
  getStats: (params) => api.get('/admin/stats', { params }),
  getDailyStats: (days = 30) => api.get('/admin/stats/daily', { params: { days } }),
  getCategoryStats: (days = 30) => api.get('/admin/stats/categories', { params: { days } }),
  getConfidenceStats: () => api.get('/admin/stats/confidence'),
  
  // Users
  getUsers: (params) => api.get('/admin/users', { params }),
  getOperators: () => api.get('/admin/operators'),
  updateUser: (id, data) => api.put(`/admin/users/${id}`, data),
  createUser: (data) => api.post('/auth/register', data),
  deleteUser: (id) => api.delete(`/admin/users/${id}`),
  
  // Health & Config
  healthCheck: () => api.get('/admin/health'),
  getConfig: () => api.get('/admin/config'),
  updateThresholds: (data) => api.put('/admin/config/thresholds', data),
};

// NLP
export const nlp = {
  classify: (subject, body) => api.post('/nlp/classify', { subject, body }),
  generateResponse: (data) => api.post('/nlp/generate-response', data),
  searchKB: (query, options) => api.post('/nlp/search-kb', { query, ...options }),
  translate: (text, targetLanguage) => api.post('/nlp/translate', { text, target_language: targetLanguage }),
  indexKBAll: () => api.post('/nlp/index-kb-all'),
  health: () => api.get('/nlp/health'),
};

// Connectors
export const connectors = {
  status: () => api.get('/connectors/status'),
  getStatus: (name) => api.get(`/connectors/status/${name}`).catch(() => ({ data: { status: 'not_configured' } })),
  getConfig: () => api.get('/connectors/config'),
  testSend: (connector, recipient, message) => 
    api.post('/connectors/test-send', { connector, recipient, message }),
};

// WhatsApp
export const whatsapp = {
  status: () => api.get('/whatsapp/status'),
  getQR: () => api.get('/whatsapp/qr'),
  connect: () => api.post('/whatsapp/connect'),
  disconnect: (logout = false) => api.post('/whatsapp/disconnect', { logout }),
  testSend: (phoneNumber, message) => api.post('/whatsapp/test-send', { phoneNumber, message }),
  checkNumber: (phoneNumber) => api.post('/whatsapp/check-number', { phoneNumber }),
};

// Notifications
export const notifications = {
  getUnread: () => api.get('/notifications/unread').catch(() => ({ data: { notifications: [], count: 0 } })),
  markRead: (id) => api.put(`/notifications/${id}/read`),
  markAllRead: () => api.put('/notifications/read-all'),
};

export default api;
