import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  Ticket, 
  CheckCircle, 
  Clock, 
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Loader2,
  MessageSquare,
  Bot,
  Users,
  FileText,
  Activity,
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from 'recharts';
import { admin, tickets as ticketsApi, connectors } from '../api';
import { formatDate, formatRelativeTime, cn, STATUS_CONFIG, SOURCE_CONFIG } from '../utils';
import toast from 'react-hot-toast';

const COLORS = ['#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

function StatCard({ title, value, subtitle, icon: Icon, color, trend }) {
  return (
    <div className="card p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
          {subtitle && (
            <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
          )}
          {trend !== undefined && (
            <div className={cn(
              "flex items-center mt-2 text-sm",
              trend >= 0 ? 'text-green-600' : 'text-red-600'
            )}>
              {trend >= 0 ? <TrendingUp className="w-4 h-4 mr-1" /> : <TrendingDown className="w-4 h-4 mr-1" />}
              {Math.abs(trend)}% за неделю
            </div>
          )}
        </div>
        <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", color)}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
    </div>
  );
}

function RecentTickets({ tickets }) {
  if (!tickets || tickets.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        Нет недавних тикетов
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100">
      {tickets.map((ticket) => (
        <Link 
          key={ticket.id}
          to={`/tickets/${ticket.id}`}
          className="flex items-center py-3 px-4 hover:bg-gray-50 transition-colors"
        >
          <div className={cn(
            "w-2 h-2 rounded-full mr-3",
            ticket.status === 'new' ? 'bg-blue-500' :
            ticket.status === 'in_progress' ? 'bg-yellow-500' :
            ticket.status === 'resolved' ? 'bg-green-500' :
            'bg-gray-400'
          )} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {ticket.subject || 'Без темы'}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {SOURCE_CONFIG[ticket.source]?.label || ticket.source} • {formatRelativeTime(ticket.created_at)}
            </p>
          </div>
          <span className={cn(
            "badge ml-2",
            STATUS_CONFIG[ticket.status]?.bgClass || 'bg-gray-100 text-gray-800'
          )}>
            {STATUS_CONFIG[ticket.status]?.label || ticket.status}
          </span>
        </Link>
      ))}
    </div>
  );
}

function SystemStatus({ statuses }) {
  const items = [
    { name: 'API', key: 'api' },
    { name: 'База данных', key: 'database' },
    { name: 'Redis', key: 'cache' },
    { name: 'Telegram', key: 'telegram' },
    { name: 'WhatsApp', key: 'whatsapp' },
    { name: 'Email', key: 'email' },
  ];

  return (
    <div className="space-y-3">
      {items.map(item => {
        const status = statuses[item.key];
        const isHealthy = status === 'healthy' || status === 'connected' || status === 'running';
        const isConfigured = status !== 'not_configured' && status !== undefined;
        
        return (
          <div key={item.key} className="flex items-center justify-between">
            <span className="text-gray-700">{item.name}</span>
            <div className="flex items-center">
              <div className={cn(
                "w-2 h-2 rounded-full mr-2",
                !isConfigured ? 'bg-gray-300' :
                isHealthy ? 'bg-green-500' : 'bg-red-500'
              )} />
              <span className="text-sm text-gray-500">
                {!isConfigured ? 'Не настроен' :
                 isHealthy ? 'Работает' : 'Ошибка'}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [dailyStats, setDailyStats] = useState([]);
  const [categoryStats, setCategoryStats] = useState([]);
  const [recentTickets, setRecentTickets] = useState([]);
  const [systemStatus, setSystemStatus] = useState({});
  const [draftsCount, setDraftsCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setIsLoading(true);
    try {
      // Load stats
      const [statsRes, dailyRes, categoryRes, ticketsRes, draftsRes, healthRes, connectorsRes] = await Promise.allSettled([
        admin.getStats({ period: 'week' }),
        admin.getDailyStats(14),
        admin.getCategoryStats(30),
        ticketsApi.list({ limit: 5, sort: 'created_at', order: 'desc' }),
        ticketsApi.getDrafts(),
        admin.healthCheck(),
        connectors.status(),
      ]);

      if (statsRes.status === 'fulfilled') {
        setStats(statsRes.value.data);
      }

      if (dailyRes.status === 'fulfilled') {
        setDailyStats(dailyRes.value.data.metrics || []);
      }

      if (categoryRes.status === 'fulfilled') {
        setCategoryStats(categoryRes.value.data.categories || []);
      }

      if (ticketsRes.status === 'fulfilled') {
        setRecentTickets(ticketsRes.value.data.tickets || []);
      }

      if (draftsRes.status === 'fulfilled') {
        setDraftsCount(draftsRes.value.data.tickets?.length || 0);
      }

      // Build system status
      const status = { api: 'healthy' };
      
      if (healthRes.status === 'fulfilled') {
        const services = healthRes.value.data.services || {};
        status.database = services.database?.status;
        status.cache = services.cache?.status;
      }

      if (connectorsRes.status === 'fulfilled') {
        const conn = connectorsRes.value.data.connectors || {};
        status.telegram = conn.telegram?.status || 'not_configured';
        status.whatsapp = conn.whatsapp?.connectionState || conn.whatsapp?.status || 'not_configured';
        status.email = conn.email?.status || 'not_configured';
      }

      setSystemStatus(status);

    } catch (error) {
      console.error('Failed to load dashboard data', error);
      toast.error('Ошибка загрузки данных');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  const totalTickets = parseInt(stats?.tickets?.total_tickets) || 0;
  const resolvedTickets = parseInt(stats?.tickets?.resolved_tickets) || 0;
  const autoResolved = parseInt(stats?.tickets?.auto_resolved) || 0;
  const avgResolutionHours = parseFloat(stats?.tickets?.avg_resolution_hours) || 0;
  const autoResolveRate = totalTickets > 0 ? ((autoResolved / totalTickets) * 100).toFixed(1) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Дашборд</h1>
          <p className="text-gray-500 mt-1">Обзор системы за последние 30 дней</p>
        </div>
        <button 
          onClick={loadDashboardData}
          className="btn btn-secondary"
        >
          <Activity className="w-4 h-4 mr-2" />
          Обновить
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Всего тикетов"
          value={totalTickets}
          icon={Ticket}
          color="bg-primary-500"
        />
        <StatCard
          title="Решено"
          value={resolvedTickets}
          subtitle={`${autoResolved} автоматически`}
          icon={CheckCircle}
          color="bg-green-500"
        />
        <StatCard
          title="Авто-решено"
          value={`${autoResolveRate}%`}
          icon={Bot}
          color="bg-purple-500"
        />
        <StatCard
          title="Среднее время"
          value={avgResolutionHours > 0 ? `${avgResolutionHours.toFixed(1)}ч` : '-'}
          subtitle="до решения"
          icon={Clock}
          color="bg-yellow-500"
        />
      </div>

      {/* Drafts Alert */}
      {draftsCount > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center">
            <FileText className="w-5 h-5 text-yellow-600 mr-3" />
            <div>
              <p className="font-medium text-yellow-800">
                {draftsCount} черновиков ожидают проверки
              </p>
              <p className="text-sm text-yellow-600">
                AI сгенерировал ответы, требуется ваше одобрение
              </p>
            </div>
          </div>
          <Link to="/drafts" className="btn btn-primary">
            Проверить
          </Link>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Trend Chart */}
        <div className="lg:col-span-2 card p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Тикеты за 2 недели</h3>
          {dailyStats.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyStats}>
                  <defs>
                    <linearGradient id="colorTickets" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorResolved" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 12 }}
                    tickFormatter={(date) => new Date(date).toLocaleDateString('ru', { day: 'numeric', month: 'short' })}
                  />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip 
                    labelFormatter={(date) => formatDate(date)}
                    formatter={(value, name) => [value, name === 'total' ? 'Всего' : 'Решено']}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="total" 
                    stroke="#0ea5e9" 
                    fill="url(#colorTickets)" 
                    strokeWidth={2}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="resolved" 
                    stroke="#22c55e" 
                    fill="url(#colorResolved)" 
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-500">
              Нет данных за период
            </div>
          )}
        </div>

        {/* Category Distribution */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">По категориям</h3>
          {categoryStats.length > 0 ? (
            <>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryStats.slice(0, 6)}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={2}
                      dataKey="count"
                      nameKey="category"
                    >
                      {categoryStats.slice(0, 6).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value, name) => [value, name]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 space-y-2">
                {categoryStats.slice(0, 5).map((item, index) => (
                  <div key={item.category} className="flex items-center justify-between text-sm">
                    <div className="flex items-center">
                      <div 
                        className="w-3 h-3 rounded-full mr-2"
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      />
                      <span className="text-gray-600 truncate">{item.category || 'Другое'}</span>
                    </div>
                    <span className="font-medium">{item.count}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-500">
              Нет данных
            </div>
          )}
        </div>
      </div>

      {/* Recent Tickets & System Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Tickets */}
        <div className="card">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Недавние тикеты</h3>
            <Link to="/tickets" className="text-sm text-primary-600 hover:text-primary-700">
              Все тикеты →
            </Link>
          </div>
          <RecentTickets tickets={recentTickets} />
        </div>

        {/* System Status */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Статус системы</h3>
          <SystemStatus statuses={systemStatus} />
          <div className="mt-6 pt-4 border-t border-gray-100 grid grid-cols-2 gap-3">
            <Link to="/channels" className="btn btn-secondary text-sm justify-center">
              <MessageSquare className="w-4 h-4 mr-2" />
              Каналы
            </Link>
            <Link to="/settings" className="btn btn-secondary text-sm justify-center">
              <Activity className="w-4 h-4 mr-2" />
              Настройки
            </Link>
          </div>
        </div>
      </div>

      {/* Source Distribution */}
      {stats?.tickets?.bySource && stats.tickets.bySource.length > 0 && (
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">По источникам</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.tickets.bySource}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis 
                  dataKey="source" 
                  tick={{ fontSize: 12 }}
                  tickFormatter={(source) => SOURCE_CONFIG[source]?.label || source}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip 
                  formatter={(value) => [value, 'Тикетов']}
                  labelFormatter={(source) => SOURCE_CONFIG[source]?.label || source}
                />
                <Bar dataKey="count" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
