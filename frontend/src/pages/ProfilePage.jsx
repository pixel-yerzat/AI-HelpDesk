import { useState } from 'react';
import { 
  User, 
  Mail, 
  Key, 
  Save,
  Loader2,
  Shield,
  Calendar,
} from 'lucide-react';
import { useAuthStore } from '../stores';
import { auth } from '../api';
import { formatDate, cn } from '../utils';
import toast from 'react-hot-toast';

const ROLE_LABELS = {
  admin: 'Администратор',
  operator: 'Оператор',
  performer: 'Исполнитель',
  user: 'Пользователь',
};

export default function ProfilePage() {
  const { user, checkAuth } = useAuthStore();
  
  const [profileData, setProfileData] = useState({
    name: user?.name || '',
    email: user?.email || '',
  });
  
  const [passwordData, setPasswordData] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setIsSavingProfile(true);

    try {
      await auth.updateProfile(profileData);
      await checkAuth(); // Refresh user data
      toast.success('Профиль обновлён');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Ошибка сохранения');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error('Пароли не совпадают');
      return;
    }

    if (passwordData.newPassword.length < 8) {
      toast.error('Пароль должен быть минимум 8 символов');
      return;
    }

    setIsSavingPassword(true);

    try {
      await auth.changePassword(passwordData.oldPassword, passwordData.newPassword);
      setPasswordData({ oldPassword: '', newPassword: '', confirmPassword: '' });
      toast.success('Пароль изменён');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Ошибка смены пароля');
    } finally {
      setIsSavingPassword(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Профиль</h1>
        <p className="text-gray-500 mt-1">Управление вашим аккаунтом</p>
      </div>

      {/* Profile Card */}
      <div className="card p-6">
        <div className="flex items-center mb-6">
          <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center">
            <span className="text-2xl font-bold text-primary-700">
              {user?.name?.charAt(0)?.toUpperCase() || 'U'}
            </span>
          </div>
          <div className="ml-4">
            <h2 className="text-xl font-semibold text-gray-900">{user?.name}</h2>
            <div className="flex items-center gap-3 mt-1">
              <span className={cn(
                "badge",
                user?.role === 'admin' ? 'bg-red-100 text-red-800' :
                user?.role === 'operator' ? 'bg-blue-100 text-blue-800' :
                'bg-gray-100 text-gray-800'
              )}>
                <Shield className="w-3 h-3 mr-1" />
                {ROLE_LABELS[user?.role] || user?.role}
              </span>
              {user?.created_at && (
                <span className="text-sm text-gray-500">
                  <Calendar className="w-3 h-3 inline mr-1" />
                  С {formatDate(user.created_at)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Profile Form */}
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <User className="w-4 h-4 inline mr-1" />
              Имя
            </label>
            <input
              type="text"
              value={profileData.name}
              onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
              className="input"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Mail className="w-4 h-4 inline mr-1" />
              Email
            </label>
            <input
              type="email"
              value={profileData.email}
              onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
              className="input"
              required
            />
          </div>

          <div className="flex justify-end pt-4">
            <button 
              type="submit" 
              disabled={isSavingProfile}
              className="btn btn-primary"
            >
              {isSavingProfile ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Сохранить
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Password Change */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          <Key className="w-5 h-5 inline mr-2" />
          Смена пароля
        </h3>

        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Текущий пароль
            </label>
            <input
              type="password"
              value={passwordData.oldPassword}
              onChange={(e) => setPasswordData({ ...passwordData, oldPassword: e.target.value })}
              className="input"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Новый пароль
            </label>
            <input
              type="password"
              value={passwordData.newPassword}
              onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
              className="input"
              placeholder="Минимум 8 символов"
              required
              minLength={8}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Подтверждение пароля
            </label>
            <input
              type="password"
              value={passwordData.confirmPassword}
              onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
              className="input"
              required
            />
          </div>

          <div className="flex justify-end pt-4">
            <button 
              type="submit" 
              disabled={isSavingPassword}
              className="btn btn-primary"
            >
              {isSavingPassword ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                'Изменить пароль'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
