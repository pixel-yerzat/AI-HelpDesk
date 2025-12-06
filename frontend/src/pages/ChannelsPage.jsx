import { useEffect, useState } from 'react';
import { 
  MessageSquare, 
  Phone, 
  Mail, 
  Globe,
  Check,
  X,
  RefreshCw,
  Loader2,
  QrCode,
  ExternalLink,
  Settings,
  Send,
  AlertCircle,
} from 'lucide-react';
import { connectors, whatsapp } from '../api';
import { cn } from '../utils';
import toast from 'react-hot-toast';

const CHANNEL_CONFIG = {
  telegram: {
    name: 'Telegram',
    icon: MessageSquare,
    color: '#0088cc',
    bgColor: 'bg-blue-50',
    description: 'Telegram Bot для приёма сообщений',
  },
  whatsapp: {
    name: 'WhatsApp',
    icon: Phone,
    color: '#25D366',
    bgColor: 'bg-green-50',
    description: 'WhatsApp через QR-код подключение',
  },
  email: {
    name: 'Email',
    icon: Mail,
    color: '#EA4335',
    bgColor: 'bg-red-50',
    description: 'IMAP/SMTP для email обработки',
  },
  portal: {
    name: 'Web Portal',
    icon: Globe,
    color: '#6366f1',
    bgColor: 'bg-indigo-50',
    description: 'Веб-форма для обращений',
  },
};

function StatusBadge({ status }) {
  const config = {
    connected: { label: 'Подключен', class: 'bg-green-100 text-green-800' },
    running: { label: 'Работает', class: 'bg-green-100 text-green-800' },
    healthy: { label: 'Работает', class: 'bg-green-100 text-green-800' },
    disconnected: { label: 'Отключен', class: 'bg-gray-100 text-gray-800' },
    qr_pending: { label: 'Ожидание QR', class: 'bg-yellow-100 text-yellow-800' },
    connecting: { label: 'Подключение...', class: 'bg-blue-100 text-blue-800' },
    error: { label: 'Ошибка', class: 'bg-red-100 text-red-800' },
  };

  const { label, class: className } = config[status] || config.disconnected;

  return (
    <span className={cn('badge', className)}>
      {label}
    </span>
  );
}

function ChannelCard({ channel, status, onRefresh }) {
  const config = CHANNEL_CONFIG[channel] || {};
  const Icon = config.icon || MessageSquare;
  const isConnected = ['connected', 'running', 'healthy'].includes(status?.status || status?.connectionState);

  return (
    <div className="card p-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center">
          <div 
            className={cn("w-12 h-12 rounded-xl flex items-center justify-center", config.bgColor)}
            style={{ color: config.color }}
          >
            <Icon className="w-6 h-6" />
          </div>
          <div className="ml-4">
            <h3 className="font-semibold text-gray-900">{config.name}</h3>
            <p className="text-sm text-gray-500">{config.description}</p>
          </div>
        </div>
        <StatusBadge status={status?.status || status?.connectionState || 'disconnected'} />
      </div>

      {/* Status details */}
      {status && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <dl className="grid grid-cols-2 gap-4 text-sm">
            {status.clientInfo?.phoneNumber && (
              <div>
                <dt className="text-gray-500">Номер</dt>
                <dd className="font-medium">+{status.clientInfo.phoneNumber}</dd>
              </div>
            )}
            {status.clientInfo?.pushname && (
              <div>
                <dt className="text-gray-500">Имя</dt>
                <dd className="font-medium">{status.clientInfo.pushname}</dd>
              </div>
            )}
            {status.isRunning !== undefined && (
              <div>
                <dt className="text-gray-500">Статус</dt>
                <dd className="font-medium">{status.isRunning ? 'Активен' : 'Неактивен'}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {/* Actions */}
      <div className="mt-4 flex gap-2">
        <button
          onClick={() => onRefresh(channel)}
          className="btn btn-secondary text-sm flex-1"
        >
          <RefreshCw className="w-4 h-4 mr-1" />
          Обновить
        </button>
        {channel === 'whatsapp' && (
          <a
            href="/admin/whatsapp.html"
            target="_blank"
            className="btn btn-primary text-sm flex-1 flex items-center justify-center"
          >
            <Settings className="w-4 h-4 mr-1" />
            Настройки
          </a>
        )}
      </div>
    </div>
  );
}

function WhatsAppPanel() {
  const [status, setStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadStatus = async () => {
    try {
      const { data } = await whatsapp.status();
      setStatus(data);
    } catch (error) {
      console.error('Failed to load WhatsApp status', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const { data } = await whatsapp.connect();
      setStatus(data);
      toast.success('Подключение начато. Отсканируйте QR-код.');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Ошибка подключения');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async (logout = false) => {
    try {
      await whatsapp.disconnect(logout);
      toast.success(logout ? 'Выход выполнен' : 'Отключено');
      loadStatus();
    } catch (error) {
      toast.error('Ошибка');
    }
  };

  const handleTestSend = async (e) => {
    e.preventDefault();
    if (!testPhone || !testMessage) return;

    setIsSending(true);
    try {
      await whatsapp.testSend(testPhone, testMessage);
      toast.success('Сообщение отправлено');
      setTestMessage('');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Ошибка отправки');
    } finally {
      setIsSending(false);
    }
  };

  if (isLoading) {
    return (
      <div className="card p-6 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
      </div>
    );
  }

  const isConnected = status?.connectionState === 'connected';
  const hasQR = status?.qrCodeDataUrl;

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="bg-green-600 p-6 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Phone className="w-8 h-8 mr-3" />
            <div>
              <h2 className="text-xl font-bold">WhatsApp</h2>
              <p className="text-green-100 text-sm">Подключение через QR-код</p>
            </div>
          </div>
          <StatusBadge status={status?.connectionState} />
        </div>
      </div>

      <div className="p-6">
        {/* Disconnected state */}
        {status?.connectionState === 'disconnected' && (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <QrCode className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">WhatsApp не подключен</h3>
            <p className="text-gray-500 mb-6">Нажмите кнопку ниже для начала подключения</p>
            <button
              onClick={handleConnect}
              disabled={isConnecting}
              className="btn btn-primary"
            >
              {isConnecting ? (
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
              ) : (
                <QrCode className="w-5 h-5 mr-2" />
              )}
              Подключить WhatsApp
            </button>
          </div>
        )}

        {/* QR Code state */}
        {status?.connectionState === 'qr_pending' && hasQR && (
          <div className="text-center py-4">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Отсканируйте QR-код</h3>
            <div className="inline-block p-4 bg-white rounded-lg shadow-lg border">
              <img src={status.qrCodeDataUrl} alt="QR Code" className="w-64 h-64" />
            </div>
            <p className="text-sm text-gray-500 mt-4">
              Откройте WhatsApp → Меню → Связанные устройства → Привязка устройства
            </p>
            <button
              onClick={() => handleDisconnect(false)}
              className="btn btn-secondary mt-4"
            >
              Отменить
            </button>
          </div>
        )}

        {/* Connecting state */}
        {status?.connectionState === 'connecting' && (
          <div className="text-center py-8">
            <Loader2 className="w-12 h-12 animate-spin text-green-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900">Подключение...</h3>
            <p className="text-gray-500">Пожалуйста, подождите</p>
          </div>
        )}

        {/* Connected state */}
        {isConnected && (
          <div className="space-y-6">
            {/* Account info */}
            <div className="bg-green-50 rounded-lg p-4">
              <div className="flex items-center">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                  <Check className="w-6 h-6 text-green-600" />
                </div>
                <div className="ml-4">
                  <h4 className="font-medium text-green-800">Подключено</h4>
                  <p className="text-sm text-green-600">
                    +{status.clientInfo?.phoneNumber} • {status.clientInfo?.pushname}
                  </p>
                </div>
              </div>
            </div>

            {/* Test message form */}
            <div>
              <h4 className="font-medium text-gray-900 mb-3">Отправить тестовое сообщение</h4>
              <form onSubmit={handleTestSend} className="space-y-3">
                <input
                  type="text"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  placeholder="Номер (77001234567)"
                  className="input"
                />
                <textarea
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  placeholder="Текст сообщения"
                  rows={2}
                  className="input"
                />
                <button
                  type="submit"
                  disabled={isSending || !testPhone || !testMessage}
                  className="btn btn-primary w-full"
                >
                  {isSending ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Отправить
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Disconnect buttons */}
            <div className="flex gap-3 pt-4 border-t border-gray-100">
              <button
                onClick={() => handleDisconnect(false)}
                className="btn btn-secondary flex-1"
              >
                Отключить
              </button>
              <button
                onClick={() => handleDisconnect(true)}
                className="btn btn-danger flex-1"
              >
                Выйти из аккаунта
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChannelsPage() {
  const [channelStatuses, setChannelStatuses] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadStatuses();
  }, []);

  const loadStatuses = async () => {
    setIsLoading(true);
    try {
      const { data } = await connectors.status();
      setChannelStatuses(data.connectors || {});
    } catch (error) {
      console.error('Failed to load connector statuses', error);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshChannel = async (channel) => {
    try {
      const { data } = await connectors.getStatus(channel);
      setChannelStatuses(prev => ({ ...prev, [channel]: data }));
      toast.success('Статус обновлён');
    } catch (error) {
      toast.error('Не удалось обновить статус');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Каналы связи</h1>
          <p className="text-gray-500 mt-1">Управление подключёнными каналами</p>
        </div>
        <button
          onClick={loadStatuses}
          disabled={isLoading}
          className="btn btn-secondary"
        >
          <RefreshCw className={cn("w-4 h-4 mr-2", isLoading && "animate-spin")} />
          Обновить все
        </button>
      </div>

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start">
        <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" />
        <div>
          <h4 className="font-medium text-blue-800">Мультиканальность</h4>
          <p className="text-sm text-blue-700 mt-1">
            Система принимает обращения из всех подключённых каналов и обрабатывает их единообразно.
            AI автоматически классифицирует, приоритизирует и генерирует ответы.
          </p>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* WhatsApp Panel (larger) */}
        <div className="lg:col-span-1">
          <WhatsAppPanel />
        </div>

        {/* Other channels */}
        <div className="space-y-6">
          <ChannelCard
            channel="telegram"
            status={channelStatuses.telegram}
            onRefresh={refreshChannel}
          />
          <ChannelCard
            channel="email"
            status={channelStatuses.email}
            onRefresh={refreshChannel}
          />
        </div>
      </div>

      {/* Additional info */}
      <div className="card p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Настройка каналов</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Telegram</h4>
            <p className="text-sm text-gray-500 mb-3">
              Создайте бота через @BotFather и укажите токен в переменных окружения.
            </p>
            <code className="text-xs bg-gray-100 px-2 py-1 rounded">TELEGRAM_BOT_TOKEN</code>
          </div>
          <div>
            <h4 className="font-medium text-gray-900 mb-2">WhatsApp</h4>
            <p className="text-sm text-gray-500 mb-3">
              Подключите через QR-код. Сессия сохраняется автоматически.
            </p>
            <code className="text-xs bg-gray-100 px-2 py-1 rounded">whatsapp-sessions/</code>
          </div>
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Email</h4>
            <p className="text-sm text-gray-500 mb-3">
              Укажите IMAP/SMTP настройки для приёма и отправки писем.
            </p>
            <code className="text-xs bg-gray-100 px-2 py-1 rounded">IMAP_HOST, SMTP_HOST</code>
          </div>
        </div>
      </div>
    </div>
  );
}
