import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  FileText, 
  Check, 
  X, 
  Bot,
  Clock,
  Loader2,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { tickets as ticketsApi } from '../api';
import { useTicketsStore } from '../stores';
import { 
  formatRelativeTime, 
  SOURCE_CONFIG,
  truncate,
  cn,
} from '../utils';
import toast from 'react-hot-toast';

function DraftCard({ draft, onApprove, onReject }) {
  const [isProcessing, setIsProcessing] = useState(false);
  const sourceConfig = SOURCE_CONFIG[draft.source] || {};

  const handleApprove = async () => {
    setIsProcessing(true);
    await onApprove(draft.id);
    setIsProcessing(false);
  };

  const handleReject = async () => {
    setIsProcessing(true);
    await onReject(draft.id);
    setIsProcessing(false);
  };

  return (
    <div className="card p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2">
          <span 
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: sourceConfig.color || '#6b7280' }}
          />
          <span className="text-sm text-gray-500">{sourceConfig.label || draft.source}</span>
          <span className="text-sm text-gray-400">•</span>
          <span className="text-sm text-gray-500">{formatRelativeTime(draft.created_at)}</span>
        </div>
        <div className="flex items-center gap-1 text-sm">
          <span className="text-gray-500">Уверенность:</span>
          <span className={cn(
            "font-medium",
            draft.confidence >= 0.9 ? "text-green-600" : 
            draft.confidence >= 0.7 ? "text-yellow-600" : "text-red-600"
          )}>
            {Math.round((draft.confidence || 0) * 100)}%
          </span>
        </div>
      </div>

      {/* Original message */}
      <div className="mb-4">
        <h4 className="font-medium text-gray-900 mb-1">
          {draft.subject || 'Без темы'}
        </h4>
        <p className="text-sm text-gray-600">
          {truncate(draft.body, 150)}
        </p>
      </div>

      {/* Suggested response */}
      {draft.nlp?.suggested_response && (
        <div className="bg-purple-50 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Bot className="w-4 h-4 text-purple-600" />
            <span className="text-sm font-medium text-purple-700">Предложенный ответ</span>
          </div>
          <p className="text-sm text-purple-900 whitespace-pre-wrap">
            {draft.nlp.suggested_response}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-100">
        <Link 
          to={`/tickets/${draft.id}`}
          className="text-sm text-primary-600 hover:text-primary-700"
        >
          Открыть тикет →
        </Link>
        <div className="flex gap-2">
          <button
            onClick={handleReject}
            disabled={isProcessing}
            className="btn btn-secondary text-sm px-3 py-1.5"
          >
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
            <span className="ml-1">Отклонить</span>
          </button>
          <button
            onClick={handleApprove}
            disabled={isProcessing}
            className="btn btn-success text-sm px-3 py-1.5"
          >
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            <span className="ml-1">Одобрить</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DraftsPage() {
  const { drafts, isLoading, setDrafts, setLoading, removeFromDrafts } = useTicketsStore();
  const [stats, setStats] = useState({ approved: 0, rejected: 0 });

  useEffect(() => {
    loadDrafts();
  }, []);

  const loadDrafts = async () => {
    setLoading(true);
    try {
      const { data } = await ticketsApi.getDrafts();
      setDrafts(data.tickets || []);
    } catch (error) {
      console.error('Failed to load drafts', error);
      toast.error('Не удалось загрузить черновики');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id) => {
    try {
      await ticketsApi.action(id, 'approve');
      removeFromDrafts(id);
      setStats(s => ({ ...s, approved: s.approved + 1 }));
      toast.success('Ответ одобрен и отправлен');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Ошибка');
    }
  };

  const handleReject = async (id) => {
    try {
      await ticketsApi.action(id, 'reject');
      removeFromDrafts(id);
      setStats(s => ({ ...s, rejected: s.rejected + 1 }));
      toast.success('Черновик отклонён');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Ошибка');
    }
  };

  const handleApproveAll = async () => {
    if (!window.confirm(`Одобрить все ${drafts.length} черновиков?`)) return;
    
    for (const draft of drafts) {
      await handleApprove(draft.id);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Черновики</h1>
          <p className="text-gray-500 mt-1">
            AI-сгенерированные ответы на проверку
          </p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={loadDrafts}
            disabled={isLoading}
            className="btn btn-secondary"
          >
            <RefreshCw className={cn("w-4 h-4 mr-2", isLoading && "animate-spin")} />
            Обновить
          </button>
          {drafts.length > 0 && (
            <button 
              onClick={handleApproveAll}
              className="btn btn-success"
            >
              <Check className="w-4 h-4 mr-2" />
              Одобрить все ({drafts.length})
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      {(stats.approved > 0 || stats.rejected > 0) && (
        <div className="flex gap-4">
          <div className="bg-green-50 text-green-700 px-4 py-2 rounded-lg text-sm">
            ✓ Одобрено: {stats.approved}
          </div>
          <div className="bg-red-50 text-red-700 px-4 py-2 rounded-lg text-sm">
            ✗ Отклонено: {stats.rejected}
          </div>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
        </div>
      ) : drafts.length === 0 ? (
        <div className="card p-12 text-center">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Нет черновиков для проверки
          </h3>
          <p className="text-gray-500 max-w-md mx-auto">
            Когда AI сгенерирует ответы с достаточной уверенностью, они появятся здесь для вашего одобрения.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Info banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start">
            <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" />
            <div>
              <h4 className="font-medium text-blue-800">Human-in-the-loop</h4>
              <p className="text-sm text-blue-700 mt-1">
                Проверьте предложенные AI ответы перед отправкой пользователям. 
                Одобренные ответы будут автоматически отправлены через соответствующий канал.
              </p>
            </div>
          </div>

          {/* Drafts list */}
          {drafts.map(draft => (
            <DraftCard
              key={draft.id}
              draft={draft}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          ))}
        </div>
      )}
    </div>
  );
}
