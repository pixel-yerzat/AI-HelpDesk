import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  ArrowLeft, 
  Send, 
  User, 
  Bot, 
  Headphones,
  Clock,
  Tag,
  Globe,
  MessageSquare,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ChevronDown,
  Loader2,
  FileText,
  UserPlus,
} from 'lucide-react';
import { tickets as ticketsApi, admin } from '../api';
import { formatDateTime, formatRelativeTime, cn, STATUS_CONFIG, PRIORITY_CONFIG, SOURCE_CONFIG, CATEGORY_CONFIG } from '../utils';
import toast from 'react-hot-toast';

function MessageBubble({ message, isLast }) {
  const isUser = message.sender_type === 'user';
  const isBot = message.sender_type === 'bot';
  const isOperator = message.sender_type === 'operator';

  const Icon = isUser ? User : isBot ? Bot : Headphones;
  const bgColor = isUser ? 'bg-gray-100' : isBot ? 'bg-blue-50' : 'bg-green-50';
  const borderColor = isUser ? 'border-gray-200' : isBot ? 'border-blue-200' : 'border-green-200';

  return (
    <div className={cn("flex gap-3", isUser ? "" : "flex-row-reverse")}>
      <div className={cn(
        "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
        isUser ? 'bg-gray-200' : isBot ? 'bg-blue-200' : 'bg-green-200'
      )}>
        <Icon className={cn(
          "w-4 h-4",
          isUser ? 'text-gray-600' : isBot ? 'text-blue-600' : 'text-green-600'
        )} />
      </div>
      <div className={cn(
        "flex-1 max-w-[80%] p-3 rounded-lg border",
        bgColor, borderColor,
        isUser ? "" : "ml-auto"
      )}>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-gray-600">
            {isUser ? 'Пользователь' : isBot ? 'AI Bot' : 'Оператор'}
          </span>
          <span className="text-xs text-gray-400">
            {formatRelativeTime(message.created_at)}
          </span>
        </div>
        <p className="text-sm text-gray-800 whitespace-pre-wrap">{message.content}</p>
      </div>
    </div>
  );
}

function DraftBanner({ ticket, onApprove, onReject, isLoading }) {
  if (ticket.status !== 'draft_pending' || !ticket.suggested_response) return null;

  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center">
          <Bot className="w-5 h-5 text-yellow-600 mr-2" />
          <span className="font-medium text-yellow-800">AI-предложенный ответ</span>
          {ticket.category_conf && (
            <span className="ml-2 text-xs bg-yellow-200 text-yellow-800 px-2 py-0.5 rounded">
              Уверенность: {Math.round(ticket.category_conf * 100)}%
            </span>
          )}
        </div>
      </div>
      <div className="bg-white rounded p-3 mb-3 border border-yellow-100">
        <p className="text-sm text-gray-700 whitespace-pre-wrap">{ticket.suggested_response}</p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onApprove}
          disabled={isLoading}
          className="btn btn-success flex-1"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1" />}
          Одобрить и отправить
        </button>
        <button
          onClick={onReject}
          disabled={isLoading}
          className="btn btn-danger flex-1"
        >
          <XCircle className="w-4 h-4 mr-1" />
          Отклонить
        </button>
      </div>
    </div>
  );
}

function AssignDropdown({ ticketId, currentAssignee, operators, onAssign }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleAssign = async (operatorId) => {
    setIsLoading(true);
    try {
      await ticketsApi.assign(ticketId, operatorId);
      toast.success('Тикет назначен');
      onAssign();
    } catch (error) {
      toast.error('Не удалось назначить');
    } finally {
      setIsLoading(false);
      setIsOpen(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="btn btn-secondary w-full justify-between"
        disabled={isLoading}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <>
            <span className="flex items-center">
              <UserPlus className="w-4 h-4 mr-2" />
              {currentAssignee ? 'Переназначить' : 'Назначить'}
            </span>
            <ChevronDown className="w-4 h-4" />
          </>
        )}
      </button>
      
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
          {operators.length === 0 ? (
            <div className="p-3 text-sm text-gray-500">Нет доступных операторов</div>
          ) : (
            operators.map(op => (
              <button
                key={op.id}
                onClick={() => handleAssign(op.id)}
                className={cn(
                  "w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center",
                  currentAssignee === op.id && 'bg-primary-50'
                )}
              >
                <div className="w-6 h-6 bg-primary-100 rounded-full flex items-center justify-center mr-2">
                  <span className="text-xs font-medium text-primary-700">
                    {op.name?.charAt(0) || 'O'}
                  </span>
                </div>
                <span>{op.name}</span>
                {currentAssignee === op.id && (
                  <CheckCircle className="w-4 h-4 text-primary-600 ml-auto" />
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function TicketDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [operators, setOperators] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    loadTicket();
    loadOperators();
  }, [id]);

  const loadTicket = async () => {
    setIsLoading(true);
    try {
      const { data } = await ticketsApi.get(id);
      setTicket(data.ticket);
      setMessages(data.ticket?.messages || []);
    } catch (error) {
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
      console.error('Failed to load operators', error);
    }
  };

  const handleAction = async (action, data = {}) => {
    setIsActionLoading(true);
    try {
      await ticketsApi.action(id, action, data);
      toast.success(
        action === 'approve' ? 'Ответ одобрен и отправлен' :
        action === 'reject' ? 'Ответ отклонён' :
        action === 'escalate' ? 'Тикет эскалирован' :
        action === 'close' ? 'Тикет закрыт' :
        action === 'reopen' ? 'Тикет переоткрыт' :
        'Действие выполнено'
      );
      loadTicket();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Ошибка');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim()) return;

    setIsSending(true);
    try {
      await ticketsApi.addMessage(id, replyText.trim());
      setReplyText('');
      toast.success('Сообщение отправлено');
      loadTicket();
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
        <Link to="/tickets" className="btn btn-primary mt-4">К списку тикетов</Link>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[ticket.status] || {};
  const priorityConfig = PRIORITY_CONFIG[ticket.priority] || {};
  const sourceConfig = SOURCE_CONFIG[ticket.source] || {};
  const categoryConfig = CATEGORY_CONFIG[ticket.category] || {};

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <button onClick={() => navigate('/tickets')} className="mr-4 p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">
                Тикет #{ticket.id.substring(0, 8)}
              </h1>
              <span className={cn("badge", statusConfig.bgClass)}>
                {statusConfig.label || ticket.status}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Создан {formatDateTime(ticket.created_at)}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {ticket.status !== 'closed' && ticket.status !== 'resolved' && (
            <>
              <button
                onClick={() => handleAction('escalate')}
                disabled={isActionLoading}
                className="btn btn-secondary"
              >
                <AlertTriangle className="w-4 h-4 mr-1" />
                Эскалировать
              </button>
              <button
                onClick={() => handleAction('close')}
                disabled={isActionLoading}
                className="btn btn-secondary"
              >
                Закрыть
              </button>
            </>
          )}
          {(ticket.status === 'closed' || ticket.status === 'resolved') && (
            <button
              onClick={() => handleAction('reopen')}
              disabled={isActionLoading}
              className="btn btn-primary"
            >
              Переоткрыть
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Draft Banner */}
          <DraftBanner 
            ticket={ticket}
            onApprove={() => handleAction('approve')}
            onReject={() => handleAction('reject')}
            isLoading={isActionLoading}
          />

          {/* Original Message */}
          <div className="card p-6">
            <h3 className="font-semibold text-gray-900 mb-3">{ticket.subject || 'Без темы'}</h3>
            <p className="text-gray-700 whitespace-pre-wrap">{ticket.body}</p>
          </div>

          {/* Messages */}
          {messages.length > 0 && (
            <div className="card p-6">
              <h3 className="font-semibold text-gray-900 mb-4">
                <MessageSquare className="w-5 h-5 inline mr-2" />
                Переписка ({messages.length})
              </h3>
              <div className="space-y-4">
                {messages.map((msg, i) => (
                  <MessageBubble key={i} message={msg} isLast={i === messages.length - 1} />
                ))}
              </div>
            </div>
          )}

          {/* Reply Form */}
          {ticket.status !== 'closed' && ticket.status !== 'resolved' && (
            <div className="card p-6">
              <h3 className="font-semibold text-gray-900 mb-3">Ответить</h3>
              <form onSubmit={handleSendReply}>
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Введите сообщение..."
                  className="input min-h-[100px] mb-3"
                  required
                />
                <div className="flex justify-end">
                  <button 
                    type="submit" 
                    disabled={isSending || !replyText.trim()}
                    className="btn btn-primary"
                  >
                    {isSending ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Send className="w-4 h-4 mr-2" />
                    )}
                    Отправить
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Info */}
          <div className="card p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Информация</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-500">Источник</span>
                <span className="font-medium flex items-center">
                  {sourceConfig.icon && <sourceConfig.icon className="w-4 h-4 mr-1" />}
                  {sourceConfig.label || ticket.source}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Приоритет</span>
                <span className={cn("badge", priorityConfig.bgClass)}>
                  {priorityConfig.label || ticket.priority || 'Не определён'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Категория</span>
                <span className="font-medium text-sm">
                  {categoryConfig.label || ticket.category || '-'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Язык</span>
                <span className="font-medium">
                  {ticket.language === 'ru' ? '🇷🇺 Русский' : 
                   ticket.language === 'kz' ? '🇰🇿 Казахский' : 
                   ticket.language || '-'}
                </span>
              </div>
            </div>
          </div>

          {/* NLP Info */}
          {(ticket.category_conf || ticket.summary) && (
            <div className="card p-6">
              <h3 className="font-semibold text-gray-900 mb-4">
                <Bot className="w-5 h-5 inline mr-2" />
                AI Анализ
              </h3>
              <div className="space-y-3 text-sm">
                {ticket.category_conf && (
                  <div>
                    <span className="text-gray-500">Уверенность категории</span>
                    <div className="mt-1 bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-primary-500 h-2 rounded-full"
                        style={{ width: `${ticket.category_conf * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500">{Math.round(ticket.category_conf * 100)}%</span>
                  </div>
                )}
                {ticket.summary && (
                  <div>
                    <span className="text-gray-500">Краткое содержание</span>
                    <p className="mt-1 text-gray-700">{ticket.summary}</p>
                  </div>
                )}
                {ticket.triage && (
                  <div>
                    <span className="text-gray-500">Триаж</span>
                    <p className="mt-1 font-medium">{ticket.triage}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Assignment */}
          <div className="card p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Назначение</h3>
            {ticket.assigned_to ? (
              <div className="flex items-center mb-3">
                <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center mr-2">
                  <User className="w-4 h-4 text-primary-600" />
                </div>
                <span className="text-sm">
                  {operators.find(o => o.id === ticket.assigned_to)?.name || 'Назначен'}
                </span>
              </div>
            ) : (
              <p className="text-sm text-gray-500 mb-3">Не назначен</p>
            )}
            <AssignDropdown 
              ticketId={ticket.id}
              currentAssignee={ticket.assigned_to}
              operators={operators}
              onAssign={loadTicket}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
