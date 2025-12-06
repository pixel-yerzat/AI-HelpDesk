import { useEffect, useState } from 'react';
import { 
  Users, 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  Shield,
  UserCheck,
  Loader2,
  X,
  Mail,
  Key,
} from 'lucide-react';
import { admin, auth } from '../api';
import { formatDate, cn } from '../utils';
import toast from 'react-hot-toast';

const ROLE_CONFIG = {
  admin: { label: 'Администратор', color: 'bg-red-100 text-red-800', icon: Shield },
  operator: { label: 'Оператор', color: 'bg-blue-100 text-blue-800', icon: UserCheck },
  performer: { label: 'Исполнитель', color: 'bg-green-100 text-green-800', icon: Users },
  user: { label: 'Пользователь', color: 'bg-gray-100 text-gray-800', icon: Users },
};

function UserModal({ user, onClose, onSave }) {
  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    role: user?.role || 'user',
    password: '',
  });
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      if (user) {
        // Update existing user
        const updateData = { name: formData.name, email: formData.email, role: formData.role };
        await admin.updateUser(user.id, updateData);
        toast.success('Пользователь обновлён');
      } else {
        // Create new user
        if (!formData.password || formData.password.length < 8) {
          toast.error('Пароль должен быть минимум 8 символов');
          setIsSaving(false);
          return;
        }
        await auth.register(formData);
        toast.success('Пользователь создан');
      }
      onSave();
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Ошибка сохранения');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold">
            {user ? 'Редактировать пользователя' : 'Новый пользователь'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Имя *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="input"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email *
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="input"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Роль *
            </label>
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              className="input"
              required
            >
              {Object.entries(ROLE_CONFIG).map(([value, config]) => (
                <option key={value} value={value}>{config.label}</option>
              ))}
            </select>
          </div>

          {!user && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Пароль *
              </label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="input"
                placeholder="Минимум 8 символов"
                required={!user}
                minLength={8}
              />
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
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

function UserRow({ user, onEdit, onDelete }) {
  const roleConfig = ROLE_CONFIG[user.role] || ROLE_CONFIG.user;
  const RoleIcon = roleConfig.icon;

  return (
    <div className="flex items-center px-6 py-4 hover:bg-gray-50 border-b border-gray-100 last:border-0">
      <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
        <span className="text-primary-700 font-medium">
          {user.name?.charAt(0)?.toUpperCase() || 'U'}
        </span>
      </div>
      
      <div className="ml-4 flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium text-gray-900">{user.name}</p>
          <span className={cn("badge", roleConfig.color)}>
            {roleConfig.label}
          </span>
        </div>
        <p className="text-sm text-gray-500">{user.email}</p>
      </div>

      <div className="hidden md:block text-sm text-gray-500 mr-6">
        {user.created_at ? formatDate(user.created_at) : '-'}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => onEdit(user)}
          className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg"
          title="Редактировать"
        >
          <Edit className="w-4 h-4" />
        </button>
        <button
          onClick={() => onDelete(user)}
          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
          title="Удалить"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, total: 0 });

  useEffect(() => {
    loadUsers();
  }, [search, roleFilter, pagination.page]);

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const params = {
        page: pagination.page,
        limit: 20,
      };
      if (search) params.search = search;
      if (roleFilter) params.role = roleFilter;

      const { data } = await admin.getUsers(params);
      setUsers(data.users || []);
      setPagination(prev => ({ ...prev, total: data.pagination?.total || 0 }));
    } catch (error) {
      console.error('Failed to load users', error);
      toast.error('Не удалось загрузить пользователей');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (user) => {
    setEditUser(user);
    setShowModal(true);
  };

  const handleCreate = () => {
    setEditUser(null);
    setShowModal(true);
  };

  const handleDelete = async (user) => {
    if (!window.confirm(`Удалить пользователя "${user.name}"?`)) return;

    try {
      await admin.deleteUser(user.id);
      toast.success('Пользователь удалён');
      loadUsers();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Не удалось удалить');
    }
  };

  const stats = {
    total: users.length,
    admins: users.filter(u => u.role === 'admin').length,
    operators: users.filter(u => u.role === 'operator').length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Пользователи</h1>
          <p className="text-gray-500 mt-1">
            Всего: {pagination.total} • Админов: {stats.admins} • Операторов: {stats.operators}
          </p>
        </div>
        <button onClick={handleCreate} className="btn btn-primary">
          <Plus className="w-4 h-4 mr-2" />
          Добавить
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по имени или email..."
              className="input pl-10"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="input w-40"
          >
            <option value="">Все роли</option>
            {Object.entries(ROLE_CONFIG).map(([value, config]) => (
              <option key={value} value={value}>{config.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Users List */}
      <div className="card">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <Users className="w-12 h-12 mb-4 text-gray-300" />
            <p>Пользователи не найдены</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {users.map(user => (
              <UserRow
                key={user.id}
                user={user}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <UserModal
          user={editUser}
          onClose={() => setShowModal(false)}
          onSave={loadUsers}
        />
      )}
    </div>
  );
}
