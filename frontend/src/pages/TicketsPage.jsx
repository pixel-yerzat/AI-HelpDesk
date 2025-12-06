import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { 
  Search, 
  Filter, 
  RefreshCw, 
  ChevronLeft, 
  ChevronRight,
  MessageSquare,
  Clock,
  User,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { tickets as ticketsApi } from '../api';
import { useTicketsStore } from '../stores';
import { 
  formatRelativeTime, 
  getStatusBadgeClass, 
  getPriorityBadgeClass,
  STATUS_CONFIG,
  PRIORITY_CONFIG,
  SOURCE_CONFIG,
  truncate,
  cn,
} from '../utils';
import toast from 'react-hot-toast';

const statusOptions = [
  { value: '', label: 'Все статусы' },
  ...Object.entries(STATUS_CONFIG).map(([value, { label }]) => ({ value, label })),
];

const priorityOptions = [
  { value: '', label: 'Все приоритеты' },
  ...Object.entries(PRIORITY_CONFIG).map(([value, { label }]) => ({ value, label })),
];

const sourceOptions = [
  { value: '', label: 'Все каналы' },
  ...Object.entries(SOURCE_CONFIG).map(([value, { label }]) => ({ value, label })),
];

function TicketRow({ ticket }) {
  const sourceConfig = SOURCE_CONFIG[ticket.source] || {};
  
  return (
    <Link
      to={`/tickets/${ticket.id}`}
      className="flex items-center px-6 py-4 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0"
    >
      {/* Status indicator */}
      <div className={cn(
        "w-1 h-12 rounded-full mr-4",
        ticket.status === 'escalated' ? 'bg-red-500' :
        ticket.status === 'draft_pending' ? 'bg-yellow-500' :
        ticket.status === 'resolved' ? 'bg-green-500' :
        'bg-primary-500'
      )} />

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn("badge", getStatusBadgeClass(ticket.status))}>
            {STATUS_CONFIG[ticket.status]?.label || ticket.status}
          </span>
          {ticket.priority && (
            <span className={cn("badge", getPriorityBadgeClass(ticket.priority))}>
              {PRIORITY_CONFIG[ticket.priority]?.label || ticket.priority}
            </span>
          )}
          {ticket.category && (
            <span className="badge bg-gray-100 text-gray-700">
              {ticket.category}
            </span>
          )}
        </div>
        <p className="text-sm font-medium text-gray-900 mt-1 truncate">
          {ticket.subject || 'Без темы'}
        </p>
        <p className="text-xs text-gray-500 mt-1 truncate">
          {truncate(ticket.body, 100)}
        </p>
      </div>

      {/* Meta */}
      <div className="hidden md:flex items-center gap-6 text-sm text-gray-500">
        <div className="flex items-center" title="Источник">
          <MessageSquare className="w-4 h-4 mr-1" style={{ color: sourceConfig.color }} />
          {sourceConfig.label || ticket.source}
        </div>
        <div className="flex items-center" title="Создан">
          <Clock className="w-4 h-4 mr-1" />
          {formatRelativeTime(ticket.created_at)}
        </div>
        {ticket.confidence && (
          <div className="w-16 text-right" title="Уверенность AI">
            {Math.round(ticket.confidence * 100)}%
          </div>
        )}
      </div>

      <ExternalLink className="w-4 h-4 text-gray-400 ml-4" />
    </Link>
  );
}

export default function TicketsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { 
    tickets, 
    filters, 
    pagination, 
    isLoading,
    setFilters,
    setTickets,
    setPage,
    setLoading,
  } = useTicketsStore();
  
  const [searchValue, setSearchValue] = useState(filters.search || '');

  useEffect(() => {
    // Initialize filters from URL
    const urlFilters = {
      status: searchParams.get('status') || '',
      source: searchParams.get('source') || '',
      priority: searchParams.get('priority') || '',
      search: searchParams.get('search') || '',
    };
    setFilters(urlFilters);
  }, []);

  useEffect(() => {
    loadTickets();
  }, [filters, pagination.page]);

  const loadTickets = async () => {
    setLoading(true);
    try {
      const params = {
        ...filters,
        page: pagination.page,
        limit: pagination.limit,
      };
      
      // Remove empty values
      Object.keys(params).forEach(key => {
        if (!params[key]) delete params[key];
      });

      const { data } = await ticketsApi.list(params);
      setTickets(data.tickets, data.pagination.total);
    } catch (error) {
      console.error('Failed to load tickets', error);
      toast.error('Не удалось загрузить тикеты');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key, value) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    
    // Update URL
    const params = new URLSearchParams();
    Object.entries(newFilters).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    setSearchParams(params);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    handleFilterChange('search', searchValue);
  };

  const totalPages = Math.ceil(pagination.total / pagination.limit);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Тикеты</h1>
          <p className="text-gray-500 mt-1">
            Всего: {pagination.total} тикетов
          </p>
        </div>
        <button 
          onClick={loadTickets}
          disabled={isLoading}
          className="btn btn-secondary flex items-center"
        >
          <RefreshCw className={cn("w-4 h-4 mr-2", isLoading && "animate-spin")} />
          Обновить
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Search */}
          <form onSubmit={handleSearch} className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                placeholder="Поиск по теме или содержимому..."
                className="input pl-10"
              />
            </div>
          </form>

          {/* Filter selects */}
          <div className="flex gap-3">
            <select
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              className="input w-40"
            >
              {statusOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            <select
              value={filters.priority}
              onChange={(e) => handleFilterChange('priority', e.target.value)}
              className="input w-40"
            >
              {priorityOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            <select
              value={filters.source}
              onChange={(e) => handleFilterChange('source', e.target.value)}
              className="input w-40"
            >
              {sourceOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Tickets List */}
      <div className="card">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
          </div>
        ) : tickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <MessageSquare className="w-12 h-12 mb-4 text-gray-300" />
            <p>Тикеты не найдены</p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-gray-100">
              {tickets.map(ticket => (
                <TicketRow key={ticket.id} ticket={ticket} />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
                <p className="text-sm text-gray-500">
                  Страница {pagination.page} из {totalPages}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(pagination.page - 1)}
                    disabled={pagination.page === 1}
                    className="btn btn-secondary p-2"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setPage(pagination.page + 1)}
                    disabled={pagination.page === totalPages}
                    className="btn btn-secondary p-2"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
