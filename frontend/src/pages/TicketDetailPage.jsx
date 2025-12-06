import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  ArrowLeft, 
  Send, 
  Check, 
  X, 
  AlertTriangle,
  User,
  Bot,
  Clock,
  MessageSquare,
  FileText,
  Loader2,
  ChevronDown,
  UserPlus,
  RefreshCw,
} from 'lucide-react';
import { tickets as ticketsApi, admin } from '../api';
import { useAuthStore } from '../stores';
import { 
  formatDateTime, 
  formatRelativeTime,
  getStatusBadgeClass, 
  getPriorityBadgeClass,
  STATUS_CONFIG,
  PRIORITY_CONFIG,
  SOURCE_CONFIG,
  CATEGORY_CONFIG,
  cn,
} from '../utils';
import toast from 'react-hot-toast';

export default function TicketDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  
  const [ticket, setTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [operators, setOperators] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [showActions, setShowActions] = useState(false);

  useEffect(() => {
    loadTicket();
    loadOperators();
  }, [id]);

  const loadTicket = async () => {
    setIsLoading(true);
    try {
      const [ticketRes, messagesRes] = await Promise.all([
        ticketsApi.get(id),
        ticketsApi.getMessages(id),
      ]);
      setTicket(ticketRes.data.ticket);
      setMessages(messagesRes.data.messages || []);
    } catch (error) {
      console.error('Failed to load ticket', error);
      toast.error('Не удалось загрузить тикет');
      navigate('/tickets');
    } finally {
      setIsLoading(false);
    }
  };

  const loadOperators = async () => {
    try {
      const { data } = await admin.getOperators();
      setOperators(data.operators || []);
    } catch (error) {
      // Ignore - might not have permission
    }
  };

  const handleAction = async (action, data = {}) => {
    try {
      await ticketsApi.action(id, action, data);
      toast.success('Действие выполнено');
      loadTicket();
      setShowActions(false);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Ошибка');
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    setIsSending(true);
    try {
      await ticketsApi.addMessage(id, newMessage);
      setNewMessage('');
      loadTicket();
      toast.success('Сообщение отправлено');
    } catch (error) {
      toast.error('Не удалось отправить сообщение');
    } finally {
      setIsSending(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Тикет не найден</p>
        <Link to="/tickets" className="btn btn-primary mt-4">
          Назад к списку
        </Link>
      </div>
    );
  }

  const sourceConfig = SOURCE_CONFIG[ticket.source] || {};
  const categoryConfig = CATEGORY_CONFIG[ticket.category] || {};
  const isDraft = ticket.status === 'draft_pending';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <button 
            onClick={() => navigate(-1)}
            className="mr-4 p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">
                Тикет #{id.substring(0, 8)}
              </h1>
              <span className={cn("badge", getStatusBadgeClass(ticket.status))}>
                {STATUS_CONFIG[ticket.status]?.label || ticket.status}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Создан {formatRelativeTime(ticket.created_at)}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="relative">
          <button 
            onClick={() => setShowActions(!showActions)}
            className="btn btn-secondary flex items-center"
          >
            Действия
            <ChevronDown className="w-4 h-4 ml-2" />
          </button>
          
          {showActions && (
            <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
              {isDraft && (
                <>
                  <button
                    onClick={() => handleAction('approve')}
                    className="w-full text-left px-4 py-2 text-sm text-green-700 hover:bg-green-50 flex items-center"
                  >
                    <Check className="w-4 h-4 mr-2" />
                    Одобрить и отправить
                  </button>
                  <button
                    onClick={() => handleAction('reject')}
                    className="w-full text-left px-4 py-2 text-sm text-red-700 hover:bg-red-50 flex items-center"
                  >
                    <X className="w-4 h-4 mr-2" />
                    Отклонить черновик
                  </button>
                </>
              )}
              
              {ticket.status !== 'resolved' && ticket.status !== 'closed' && (
                <>
                  <button
                    onClick={() => handleAction('escalate')}
                    className="w-full text-left px-4 py-2 text-sm text-orange-700 hover:bg-orange-50 flex items-center"
                  >
                    <AlertTriangle className="w-4 h-4 mr-2" />
                    Эскалировать
                  </button>
                  <button
                    onClick={() => handleAction('close')}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center"
                  >
                    <Check className="w-4 h-4 mr-2" />
                    Закрыть
                  </button>
                </>
              )}

              {(ticket.status === 'resolved' || ticket.status === 'closed') && (
                <button
                  onClick={() => handleAction('reopen')}
                  className="w-full text-left px-4 py-2 text-sm text-primary-700 hover:bg-primary-50 flex items-center"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Переоткрыть
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Draft Banner */}
          {isDraft && ticket.nlp?.suggested_response && (
            <div className="card bg-yellow-50 border-yellow-200 p-4">
              <div className="flex items-start">
                <Bot className="w-5 h-5 text-yellow-600 mt-0.5 mr-3 flex-shrink-0" />
                <div className="flex-1">
                  <h4 className="font-medium text-yellow-800">Предложенный ответ AI</h4>
                  <p className="text-sm text-yellow-700 mt-2 whitespace-pre-wrap">
                    {ticket.nlp.suggested_response}
                  </p>
                  <div className="flex items-center gap-3 mt-4">
                    <button
                      onClick={() => handleAction('approve')}
                      className="btn btn-success text-sm"
                    >
                      <Check className="w-4 h-4 mr-1" />
                      Одобрить
                    </button>
                    <button
                      onClick={() => handleAction('reject')}
                      className="btn btn-secondary text-sm"
                    >
                      <X className="w-4 h-4 mr-1" />
                      Отклонить
                    </button>
                    <span className="text-xs text-yellow-600">
                      Уверенность: {Math.round((ticket.nlp.category_conf || 0) * 100)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Original Message */}
          <div className="card p-6">
            <h3 className="font-semibold text-gray-900 mb-4">
              {ticket.subject || 'Без темы'}
            </h3>
            <p className="text-gray-700 whitespace-pre-wrap">{ticket.body}</p>
          </div>

          {/* Messages */}
          <div className="card">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">
                История переписки ({messages.length})
              </h3>
            </div>
            
            <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
              {messages.length === 0 ? (
                <div className="p-6 text-center text-gray-500">
                  Нет сообщений
                </div>
              ) : (
                messages.map((msg, idx) => (
                  <div key={idx} className="p-4 hover:bg-gray-50">
                    <div className="flex items-start">
                      <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                        msg.sender_type === 'user' ? 'bg-primary-100' :
                        msg.sender_type === 'bot' ? 'bg-purple-100' :
                        'bg-green-100'
                      )}>
                        {msg.sender_type === 'user' ? (
                          <User className="w-4 h-4 text-primary-600" />
                        ) : msg.sender_type === 'bot' ? (
                          <Bot className="w-4 h-4 text-purple-600" />
                        ) : (
                          <User className="w-4 h-4 text-green-600" />
                        )}
                      </div>
                      <div className="ml-3 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-900">
                            {msg.sender_type === 'user' ? 'Пользователь' :
                             msg.sender_type === 'bot' ? 'AI Bot' : 'Оператор'}
                          </span>
                          <span className="text-xs text-gray-500">
                            {formatRelativeTime(msg.created_at)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">
                          {msg.content}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Reply form */}
            {ticket.status !== 'closed' && (
              <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-100">
                <div className="flex gap-3">
                  <textarea
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Написать ответ..."
                    rows={2}
                    className="input flex-1 resize-none"
                  />
                  <button
                    type="submit"
                    disabled={isSending || !newMessage.trim()}
                    className="btn btn-primary self-end"
                  >
                    {isSending ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Send className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Info Card */}
          <div className="card p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Информация</h3>
            <dl className="space-y-4">
              <div>
                <dt className="text-xs text-gray-500 uppercase">Источник</dt>
                <dd className="flex items-center mt-1">
                  <MessageSquare 
                    className="w-4 h-4 mr-2" 
                    style={{ color: sourceConfig.color }}
                  />
                  <span className="text-sm font-medium">{sourceConfig.label || ticket.source}</span>
                </dd>
              </div>

              <div>
                <dt className="text-xs text-gray-500 uppercase">Приоритет</dt>
                <dd className="mt-1">
                  <span className={cn("badge", getPriorityBadgeClass(ticket.priority))}>
                    {PRIORITY_CONFIG[ticket.priority]?.label || ticket.priority || '-'}
                  </span>
                </dd>
              </div>

              <div>
                <dt className="text-xs text-gray-500 uppercase">Категория</dt>
                <dd className="text-sm font-medium mt-1">
                  {categoryConfig.label || ticket.category || '-'}
                </dd>
              </div>

              <div>
                <dt className="text-xs text-gray-500 uppercase">Язык</dt>
                <dd className="text-sm font-medium mt-1">
                  {ticket.language === 'ru' ? 'Русский' : 
                   ticket.language === 'kz' ? 'Казахский' : 
                   ticket.language || '-'}
                </dd>
              </div>

              <div>
                <dt className="text-xs text-gray-500 uppercase">Создан</dt>
                <dd className="text-sm mt-1">{formatDateTime(ticket.created_at)}</dd>
              </div>

              {ticket.resolved_at && (
                <div>
                  <dt className="text-xs text-gray-500 uppercase">Решён</dt>
                  <dd className="text-sm mt-1">{formatDateTime(ticket.resolved_at)}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* NLP Info */}
          {ticket.nlp && (
            <div className="card p-6">
              <h3 className="font-semibold text-gray-900 mb-4">AI Анализ</h3>
              <dl className="space-y-3">
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-500">Категория</dt>
                  <dd className="text-sm font-medium">
                    {ticket.nlp.category} ({Math.round((ticket.nlp.category_conf || 0) * 100)}%)
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-500">Приоритет</dt>
                  <dd className="text-sm font-medium">
                    {ticket.nlp.priority} ({Math.round((ticket.nlp.priority_conf || 0) * 100)}%)
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-500">Триаж</dt>
                  <dd className="text-sm font-medium">
                    {ticket.nlp.triage === 'auto_resolvable' ? 'Авто' : 'Ручной'}
                  </dd>
                </div>
                {ticket.nlp.summary && (
                  <div>
                    <dt className="text-sm text-gray-500 mb-1">Резюме</dt>
                    <dd className="text-sm bg-gray-50 p-2 rounded">
                      {ticket.nlp.summary}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          {/* Assign */}
          {operators.length > 0 && ticket.status !== 'closed' && (
            <div className="card p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Назначить</h3>
              <select
                value={ticket.assigned_to || ''}
                onChange={(e) => handleAction('assign', { assignedTo: e.target.value || null })}
                className="input"
              >
                <option value="">Не назначен</option>
                {operators.map(op => (
                  <option key={op.id} value={op.id}>{op.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
