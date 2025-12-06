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
} from 'recharts';
import { admin } from '../api';
import { formatDate, cn } from '../utils';
import { useStatsStore } from '../stores';
import toast from 'react-hot-toast';

const COLORS = ['#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

function StatCard({ title, value, change, changeType, icon: Icon, color }) {
  return (
    <div className="card p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
          {change !== undefined && (
            <div className={cn(
              "flex items-center mt-2 text-sm",
              changeType === 'up' ? 'text-green-600' : 'text-red-600'
            )}>
              {changeType === 'up' ? <TrendingUp className="w-4 h-4 mr-1" /> : <TrendingDown className="w-4 h-4 mr-1" />}
              {change}% за неделю
            </div>
          )}
        </div>
        <div className={cn(
          "w-12 h-12 rounded-xl flex items-center justify-center",
          color
        )}>
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
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {ticket.subject || 'Без темы'}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {ticket.source} • {formatDate(ticket.created_at)}
            </p>
          </div>
          <ArrowRight className="w-4 h-4 text-gray-400" />
        </Link>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const { stats, dailyStats, categoryStats, isLoading, setStats, setDailyStats, setCategoryStats, setLoading } = useStatsStore();
  const [recentTickets, setRecentTickets] = useState([]);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const [statsRes, dailyRes, categoryRes] = await Promise.all([
        admin.getStats({ period: 'week' }),
        admin.getDailyStats(14),
        admin.getCategoryStats(),
      ]);

      setStats(statsRes.data);
      setDailyStats(dailyRes.data.stats || []);
      setCategoryStats(categoryRes.data.stats || []);
      setRecentTickets(statsRes.data.recentTickets || []);
    } catch (error) {
      console.error('Failed to load dashboard data', error);
      toast.error('Не удалось загрузить данные');
    } finally {
      setLoading(false);
    }
  };

  if (isLoading && !stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  const autoResolveRate = stats?.tickets?.autoResolved 
    ? ((stats.tickets.autoResolved / stats.tickets.total) * 100).toFixed(1)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Дашборд</h1>
        <p className="text-gray-500 mt-1">Обзор системы за последнюю неделю</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Всего тикетов"
          value={stats?.tickets?.total || 0}
          change={12}
          changeType="up"
          icon={Ticket}
          color="bg-primary-500"
        />
        <StatCard
          title="Решено"
          value={stats?.tickets?.resolved || 0}
          change={8}
          changeType="up"
          icon={CheckCircle}
          color="bg-green-500"
        />
        <StatCard
          title="В работе"
          value={stats?.tickets?.inProgress || 0}
          icon={Clock}
          color="bg-yellow-500"
        />
        <StatCard
          title="Авто-решено"
          value={`${autoResolveRate}%`}
          icon={Bot}
          color="bg-purple-500"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Trend Chart */}
        <div className="lg:col-span-2 card p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Тикеты за 2 недели</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyStats}>
                <defs>
                  <linearGradient id="colorTickets" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/>
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
                  formatter={(value) => [value, 'Тикетов']}
                />
                <Area 
                  type="monotone" 
                  dataKey="total" 
                  stroke="#0ea5e9" 
                  fill="url(#colorTickets)" 
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Category Distribution */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">По категориям</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryStats}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="count"
                  nameKey="category"
                >
                  {categoryStats.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value, name) => [value, name]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 space-y-2">
            {categoryStats.slice(0, 4).map((item, index) => (
              <div key={item.category} className="flex items-center justify-between text-sm">
                <div className="flex items-center">
                  <div 
                    className="w-3 h-3 rounded-full mr-2"
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <span className="text-gray-600">{item.category}</span>
                </div>
                <span className="font-medium">{item.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Tickets & Quick Actions */}
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
          <div className="space-y-4">
            <StatusItem name="API" status="healthy" />
            <StatusItem name="База данных" status="healthy" />
            <StatusItem name="Redis" status="healthy" />
            <StatusItem name="Telegram Bot" status="healthy" />
            <StatusItem name="WhatsApp" status="disconnected" />
            <StatusItem name="NLP Service" status="healthy" />
          </div>
          <Link 
            to="/channels"
            className="mt-6 btn btn-secondary w-full flex items-center justify-center"
          >
            <MessageSquare className="w-4 h-4 mr-2" />
            Управление каналами
          </Link>
        </div>
      </div>
    </div>
  );
}

function StatusItem({ name, status }) {
  const statusConfig = {
    healthy: { color: 'bg-green-500', label: 'Работает' },
    degraded: { color: 'bg-yellow-500', label: 'Проблемы' },
    unhealthy: { color: 'bg-red-500', label: 'Не работает' },
    disconnected: { color: 'bg-gray-400', label: 'Отключен' },
  };

  const config = statusConfig[status] || statusConfig.unhealthy;

  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-700">{name}</span>
      <div className="flex items-center">
        <div className={cn("w-2 h-2 rounded-full mr-2", config.color)} />
        <span className="text-sm text-gray-500">{config.label}</span>
      </div>
    </div>
  );
}
