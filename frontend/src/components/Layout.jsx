import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Ticket, 
  FileText, 
  BookOpen, 
  Settings, 
  Users, 
  MessageSquare,
  LogOut,
  Menu,
  X,
  Bell,
  ChevronDown,
  User,
} from 'lucide-react';
import { useAuthStore, useUIStore } from '../stores';
import { tickets as ticketsApi, notifications as notificationsApi } from '../api';
import { cn } from '../utils';

const navigation = [
  { name: 'Дашборд', href: '/', icon: LayoutDashboard },
  { name: 'Тикеты', href: '/tickets', icon: Ticket },
  { name: 'Черновики', href: '/drafts', icon: FileText, badge: 'drafts' },
  { name: 'База знаний', href: '/knowledge-base', icon: BookOpen },
  { name: 'Пользователи', href: '/users', icon: Users, adminOnly: true },
  { name: 'Каналы', href: '/channels', icon: MessageSquare },
  { name: 'Настройки', href: '/settings', icon: Settings, adminOnly: true },
];

function Sidebar() {
  const location = useLocation();
  const { sidebarOpen, toggleSidebar } = useUIStore();
  const { user, isAdmin } = useAuthStore();
  const [draftsCount, setDraftsCount] = useState(0);
  
  const filteredNav = navigation.filter(item => !item.adminOnly || isAdmin());

  useEffect(() => {
    loadDraftsCount();
    const interval = setInterval(loadDraftsCount, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadDraftsCount = async () => {
    try {
      const { data } = await ticketsApi.getDrafts();
      setDraftsCount(data.tickets?.length || 0);
    } catch (e) {
      // Ignore
    }
  };

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={toggleSidebar}
        />
      )}
      
      {/* Sidebar */}
      <aside className={cn(
        "fixed lg:static inset-y-0 left-0 z-30 w-64 bg-white border-r border-gray-200 transform transition-transform lg:transform-none",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="h-full flex flex-col">
          {/* Logo */}
          <div className="h-16 flex items-center justify-between px-4 border-b border-gray-200">
            <Link to="/" className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
                <Ticket className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold text-lg text-gray-900">HelpDesk AI</span>
            </Link>
            <button onClick={toggleSidebar} className="lg:hidden p-1 text-gray-500 hover:text-gray-700">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {filteredNav.map((item) => {
              const isActive = location.pathname === item.href || 
                (item.href !== '/' && location.pathname.startsWith(item.href));
              
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => window.innerWidth < 1024 && toggleSidebar()}
                  className={cn(
                    "flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    isActive 
                      ? "bg-primary-50 text-primary-700" 
                      : "text-gray-700 hover:bg-gray-100"
                  )}
                >
                  <item.icon className={cn(
                    "w-5 h-5 mr-3",
                    isActive ? "text-primary-600" : "text-gray-400"
                  )} />
                  {item.name}
                  {item.badge === 'drafts' && draftsCount > 0 && (
                    <span className="ml-auto bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full text-xs font-medium">
                      {draftsCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* User info */}
          <div className="p-4 border-t border-gray-200">
            <div className="flex items-center">
              <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                <span className="text-primary-700 font-medium">
                  {user?.name?.charAt(0) || 'U'}
                </span>
              </div>
              <div className="ml-3 flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{user?.name}</p>
                <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

function NotificationsDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const dropdownRef = useRef(null);

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadNotifications = async () => {
    try {
      const { data } = await notificationsApi.getUnread();
      setNotifications(data.notifications || []);
      setUnreadCount(data.count || 0);
    } catch (e) {
      // API might not exist yet
    }
  };

  const markAllRead = async () => {
    try {
      await notificationsApi.markAllRead();
      setNotifications([]);
      setUnreadCount(0);
    } catch (e) {
      // Ignore
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 relative"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
        )}
      </button>
      
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Уведомления</h3>
            {unreadCount > 0 && (
              <button 
                onClick={markAllRead}
                className="text-xs text-primary-600 hover:text-primary-700"
              >
                Прочитать все
              </button>
            )}
          </div>
          <div className="max-h-64 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">
                Нет новых уведомлений
              </div>
            ) : (
              notifications.map((n, i) => (
                <div key={i} className="px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-0">
                  <p className="text-sm text-gray-900">{n.title}</p>
                  <p className="text-xs text-gray-500 mt-1">{n.message}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function UserDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 p-2 rounded-lg hover:bg-gray-100"
      >
        <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
          <span className="text-primary-700 font-medium text-sm">
            {user?.name?.charAt(0) || 'U'}
          </span>
        </div>
        <span className="hidden md:block text-sm font-medium text-gray-700">
          {user?.name}
        </span>
        <ChevronDown className="w-4 h-4 text-gray-500" />
      </button>
      
      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
          <div className="px-4 py-2 border-b border-gray-100">
            <p className="text-sm font-medium text-gray-900">{user?.name}</p>
            <p className="text-xs text-gray-500">{user?.email}</p>
          </div>
          <Link 
            to="/profile" 
            onClick={() => setIsOpen(false)}
            className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
          >
            <User className="w-4 h-4 mr-2" />
            Профиль
          </Link>
          <button 
            onClick={handleLogout}
            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Выйти
          </button>
        </div>
      )}
    </div>
  );
}

function Header() {
  const { toggleSidebar } = useUIStore();

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 lg:px-6">
      <button 
        onClick={toggleSidebar}
        className="lg:hidden p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100"
      >
        <Menu className="w-5 h-5" />
      </button>

      <div className="flex-1" />

      <div className="flex items-center space-x-2">
        <NotificationsDropdown />
        <UserDropdown />
      </div>
    </header>
  );
}

export default function Layout({ children }) {
  return (
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
