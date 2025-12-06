import { useEffect, useState } from 'react';
import { 
  Settings, 
  Sliders, 
  Bot, 
  Database,
  Bell,
  Shield,
  Save,
  Loader2,
  RefreshCw,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { admin } from '../api';
import { cn } from '../utils';
import toast from 'react-hot-toast';

function SettingsSection({ title, description, icon: Icon, children }) {
  return (
    <div className="card">
      <div className="px-6 py-4 border-b border-gray-100">
        <div className="flex items-center">
          <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center mr-4">
            <Icon className="w-5 h-5 text-primary-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{title}</h3>
            <p className="text-sm text-gray-500">{description}</p>
          </div>
        </div>
      </div>
      <div className="p-6">
        {children}
      </div>
    </div>
  );
}

function ThresholdSlider({ label, value, onChange, description, min = 0, max = 1, step = 0.05 }) {
  const percentage = Math.round(value * 100);
  
  return (
    <div className="mb-6 last:mb-0">
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        <span className="text-sm font-bold text-primary-600">{percentage}%</span>
      </div>
      <input
        type="range"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        min={min}
        max={max}
        step={step}
        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary-600"
      />
      <p className="text-xs text-gray-500 mt-1">{description}</p>
    </div>
  );
}

export default function SettingsPage() {
  const [config, setConfig] = useState(null);
  const [health, setHealth] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  const [thresholds, setThresholds] = useState({
    autoResolve: 0.90,
    draftMin: 0.65,
    triage: 0.85,
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const [configRes, healthRes] = await Promise.allSettled([
        admin.getConfig(),
        admin.healthCheck(),
      ]);

      if (configRes.status === 'fulfilled') {
        setConfig(configRes.value.data);
        setThresholds(configRes.value.data.thresholds || thresholds);
      }

      if (healthRes.status === 'fulfilled') {
        setHealth(healthRes.value.data);
      }
    } catch (error) {
      console.error('Failed to load settings', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveThresholds = async () => {
    setIsSaving(true);
    try {
      await admin.updateThresholds(thresholds);
      toast.success('Настройки сохранены');
    } catch (error) {
      toast.error('Не удалось сохранить');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Настройки</h1>
          <p className="text-gray-500 mt-1">Конфигурация системы HelpDesk AI</p>
        </div>
        <button onClick={loadSettings} className="btn btn-secondary">
          <RefreshCw className="w-4 h-4 mr-2" />
          Обновить
        </button>
      </div>

      {/* System Status */}
      <SettingsSection 
        title="Состояние системы" 
        description="Статус всех компонентов"
        icon={Database}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className={cn(
            "p-4 rounded-lg border",
            health?.services?.database?.status === 'healthy' 
              ? 'bg-green-50 border-green-200' 
              : 'bg-red-50 border-red-200'
          )}>
            <div className="flex items-center">
              {health?.services?.database?.status === 'healthy' ? (
                <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
              )}
              <span className="font-medium">База данных</span>
            </div>
            <p className="text-sm text-gray-600 mt-1">
              {health?.services?.database?.status === 'healthy' ? 'Работает' : 'Ошибка'}
            </p>
          </div>

          <div className={cn(
            "p-4 rounded-lg border",
            health?.services?.cache?.status === 'healthy' 
              ? 'bg-green-50 border-green-200' 
              : 'bg-yellow-50 border-yellow-200'
          )}>
            <div className="flex items-center">
              {health?.services?.cache?.status === 'healthy' ? (
                <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
              ) : (
                <AlertCircle className="w-5 h-5 text-yellow-600 mr-2" />
              )}
              <span className="font-medium">Redis Cache</span>
            </div>
            <p className="text-sm text-gray-600 mt-1">
              {health?.services?.cache?.status === 'healthy' ? 'Работает' : 'Недоступен'}
            </p>
          </div>

          <div className="p-4 rounded-lg border bg-blue-50 border-blue-200">
            <div className="flex items-center">
              <Bot className="w-5 h-5 text-blue-600 mr-2" />
              <span className="font-medium">LLM Provider</span>
            </div>
            <p className="text-sm text-gray-600 mt-1">
              {config?.llmProvider || 'Не настроен'}
            </p>
          </div>
        </div>
      </SettingsSection>

      {/* AI Thresholds */}
      <SettingsSection 
        title="Пороги AI" 
        description="Настройка уверенности для автоматизации"
        icon={Sliders}
      >
        <ThresholdSlider
          label="Порог авто-решения"
          value={thresholds.autoResolve}
          onChange={(v) => setThresholds({ ...thresholds, autoResolve: v })}
          description="При уверенности выше этого порога, ответ отправляется автоматически"
        />
        
        <ThresholdSlider
          label="Минимум для черновика"
          value={thresholds.draftMin}
          onChange={(v) => setThresholds({ ...thresholds, draftMin: v })}
          description="Минимальная уверенность для создания черновика ответа"
        />
        
        <ThresholdSlider
          label="Порог триажа"
          value={thresholds.triage}
          onChange={(v) => setThresholds({ ...thresholds, triage: v })}
          description="Порог для автоматической маршрутизации тикетов"
        />

        <div className="flex justify-end pt-4 border-t border-gray-100">
          <button 
            onClick={handleSaveThresholds}
            disabled={isSaving}
            className="btn btn-primary"
          >
            {isSaving ? (
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Сохранить
          </button>
        </div>
      </SettingsSection>

      {/* Features */}
      <SettingsSection 
        title="Функции" 
        description="Включение/выключение функций системы"
        icon={Settings}
      >
        <div className="space-y-4">
          <label className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium text-gray-900">Авто-решение</p>
              <p className="text-sm text-gray-500">
                Автоматически отправлять ответы при высокой уверенности
              </p>
            </div>
            <input 
              type="checkbox" 
              checked={config?.features?.autoResolveEnabled ?? true}
              className="w-5 h-5 text-primary-600 rounded"
              readOnly
            />
          </label>

          <label className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium text-gray-900">Human-in-the-loop</p>
              <p className="text-sm text-gray-500">
                Требовать одобрение оператора для средней уверенности
              </p>
            </div>
            <input 
              type="checkbox" 
              checked={config?.features?.humanInLoopEnabled ?? true}
              className="w-5 h-5 text-primary-600 rounded"
              readOnly
            />
          </label>
        </div>
      </SettingsSection>

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start">
          <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" />
          <div>
            <h4 className="font-medium text-blue-800">Дополнительные настройки</h4>
            <p className="text-sm text-blue-700 mt-1">
              Настройки LLM провайдера (API ключи) и конфигурация коннекторов 
              задаются через переменные окружения. Смотрите .env.example для 
              полного списка параметров.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
