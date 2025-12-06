import { useEffect, useState } from 'react';
import { 
  BookOpen, 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  Eye,
  Loader2,
  RefreshCw,
  FileText,
  Database,
  X,
} from 'lucide-react';
import { kb, nlp } from '../api';
import { formatDate, cn } from '../utils';
import toast from 'react-hot-toast';

function ArticleModal({ article, onClose, onSave }) {
  const [formData, setFormData] = useState({
    title_ru: article?.title_ru || '',
    title_kz: article?.title_kz || '',
    content_ru: article?.content_ru || '',
    content_kz: article?.content_kz || '',
    category: article?.category || '',
    type: article?.type || 'faq',
    keywords: article?.keywords?.join(', ') || '',
  });
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    
    const data = {
      ...formData,
      keywords: formData.keywords.split(',').map(k => k.trim()).filter(Boolean),
    };

    try {
      await onSave(data);
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Ошибка сохранения');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold">
            {article ? 'Редактировать статью' : 'Новая статья'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto max-h-[calc(90vh-130px)]">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Заголовок (RU) *
              </label>
              <input
                type="text"
                value={formData.title_ru}
                onChange={(e) => setFormData({ ...formData, title_ru: e.target.value })}
                className="input"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Заголовок (KZ)
              </label>
              <input
                type="text"
                value={formData.title_kz}
                onChange={(e) => setFormData({ ...formData, title_kz: e.target.value })}
                className="input"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Категория *
              </label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="input"
                required
              >
                <option value="">Выберите...</option>
                <option value="access_vpn">Доступ / VPN</option>
                <option value="hardware">Оборудование</option>
                <option value="software">ПО</option>
                <option value="email">Почта</option>
                <option value="network">Сеть</option>
                <option value="account">Учётная запись</option>
                <option value="other">Другое</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Тип *
              </label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                className="input"
                required
              >
                <option value="faq">FAQ</option>
                <option value="guide">Инструкция</option>
                <option value="troubleshooting">Решение проблем</option>
                <option value="policy">Политика</option>
              </select>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Содержимое (RU) *
            </label>
            <textarea
              value={formData.content_ru}
              onChange={(e) => setFormData({ ...formData, content_ru: e.target.value })}
              rows={6}
              className="input"
              required
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Содержимое (KZ)
            </label>
            <textarea
              value={formData.content_kz}
              onChange={(e) => setFormData({ ...formData, content_kz: e.target.value })}
              rows={6}
              className="input"
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Ключевые слова (через запятую)
            </label>
            <input
              type="text"
              value={formData.keywords}
              onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
              placeholder="vpn, подключение, ошибка"
              className="input"
            />
          </div>

          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Отмена
            </button>
            <button type="submit" disabled={isSaving} className="btn btn-primary">
              {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Сохранить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ArticleRow({ article, onEdit, onDelete, onView }) {
  return (
    <div className="flex items-center px-6 py-4 hover:bg-gray-50 border-b border-gray-100 last:border-0">
      <div className="flex-1 min-w-0">
        <h4 className="font-medium text-gray-900 truncate">{article.title_ru}</h4>
        <p className="text-sm text-gray-500 mt-1">
          {article.category} • {article.type} • {formatDate(article.created_at)}
        </p>
      </div>
      <div className="flex items-center gap-2 ml-4">
        <button
          onClick={() => onView(article)}
          className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg"
          title="Просмотр"
        >
          <Eye className="w-4 h-4" />
        </button>
        <button
          onClick={() => onEdit(article)}
          className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg"
          title="Редактировать"
        >
          <Edit className="w-4 h-4" />
        </button>
        <button
          onClick={() => onDelete(article)}
          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
          title="Удалить"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default function KnowledgeBasePage() {
  const [articles, setArticles] = useState([]);
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isIndexing, setIsIndexing] = useState(false);
  const [search, setSearch] = useState('');
  const [modalArticle, setModalArticle] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [viewArticle, setViewArticle] = useState(null);

  useEffect(() => {
    loadArticles();
    loadStats();
  }, []);

  const loadArticles = async () => {
    setIsLoading(true);
    try {
      const { data } = await kb.list({ limit: 100 });
      setArticles(data.articles || []);
    } catch (error) {
      toast.error('Не удалось загрузить статьи');
    } finally {
      setIsLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const { data } = await kb.getStats();
      setStats(data);
    } catch (error) {
      // Ignore
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!search.trim()) {
      loadArticles();
      return;
    }

    setIsLoading(true);
    try {
      const { data } = await kb.search(search);
      setArticles(data.results || []);
    } catch (error) {
      toast.error('Ошибка поиска');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = () => {
    setModalArticle(null);
    setShowModal(true);
  };

  const handleEdit = (article) => {
    setModalArticle(article);
    setShowModal(true);
  };

  const handleSave = async (data) => {
    if (modalArticle) {
      await kb.update(modalArticle.id, data);
      toast.success('Статья обновлена');
    } else {
      await kb.create(data);
      toast.success('Статья создана');
    }
    loadArticles();
    loadStats();
  };

  const handleDelete = async (article) => {
    if (!window.confirm(`Удалить статью "${article.title_ru}"?`)) return;
    
    try {
      await kb.delete(article.id);
      toast.success('Статья удалена');
      loadArticles();
      loadStats();
    } catch (error) {
      toast.error('Не удалось удалить статью');
    }
  };

  const handleReindex = async () => {
    setIsIndexing(true);
    try {
      await nlp.indexKBAll();
      toast.success('Индексация запущена');
      setTimeout(loadStats, 2000);
    } catch (error) {
      toast.error('Ошибка индексации');
    } finally {
      setIsIndexing(false);
    }
  };

  const filteredArticles = articles;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">База знаний</h1>
          <p className="text-gray-500 mt-1">
            Статьи и инструкции для AI-ответов
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleReindex}
            disabled={isIndexing}
            className="btn btn-secondary"
          >
            <Database className={cn("w-4 h-4 mr-2", isIndexing && "animate-spin")} />
            Переиндексировать
          </button>
          <button onClick={handleCreate} className="btn btn-primary">
            <Plus className="w-4 h-4 mr-2" />
            Новая статья
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="card p-4">
            <p className="text-sm text-gray-500">Всего статей</p>
            <p className="text-2xl font-bold text-gray-900">{stats.total || 0}</p>
          </div>
          <div className="card p-4">
            <p className="text-sm text-gray-500">FAQ</p>
            <p className="text-2xl font-bold text-gray-900">{stats.byType?.faq || 0}</p>
          </div>
          <div className="card p-4">
            <p className="text-sm text-gray-500">Инструкции</p>
            <p className="text-2xl font-bold text-gray-900">{stats.byType?.guide || 0}</p>
          </div>
          <div className="card p-4">
            <p className="text-sm text-gray-500">Проиндексировано</p>
            <p className="text-2xl font-bold text-gray-900">{stats.indexed || 0}</p>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="card p-4">
        <form onSubmit={handleSearch} className="flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по базе знаний (семантический)..."
              className="input pl-10"
            />
          </div>
          <button type="submit" className="btn btn-primary">
            Найти
          </button>
          {search && (
            <button 
              type="button" 
              onClick={() => { setSearch(''); loadArticles(); }}
              className="btn btn-secondary"
            >
              Сбросить
            </button>
          )}
        </form>
      </div>

      {/* Articles list */}
      <div className="card">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
          </div>
        ) : filteredArticles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <BookOpen className="w-12 h-12 mb-4 text-gray-300" />
            <p>Статьи не найдены</p>
            <button onClick={handleCreate} className="btn btn-primary mt-4">
              Создать первую статью
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredArticles.map(article => (
              <ArticleRow
                key={article.id}
                article={article}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onView={setViewArticle}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <ArticleModal
          article={modalArticle}
          onClose={() => setShowModal(false)}
          onSave={handleSave}
        />
      )}

      {/* View Modal */}
      {viewArticle && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold">{viewArticle.title_ru}</h2>
              <button onClick={() => setViewArticle(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
              <div className="flex gap-2 mb-4">
                <span className="badge bg-gray-100 text-gray-700">{viewArticle.category}</span>
                <span className="badge bg-gray-100 text-gray-700">{viewArticle.type}</span>
              </div>
              <div className="prose prose-sm max-w-none">
                <p className="whitespace-pre-wrap">{viewArticle.content_ru}</p>
              </div>
              {viewArticle.keywords?.length > 0 && (
                <div className="mt-6 pt-4 border-t border-gray-100">
                  <p className="text-sm text-gray-500 mb-2">Ключевые слова:</p>
                  <div className="flex flex-wrap gap-1">
                    {viewArticle.keywords.map((kw, i) => (
                      <span key={i} className="text-xs bg-primary-50 text-primary-700 px-2 py-1 rounded">
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
