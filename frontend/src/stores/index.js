import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { auth } from '../api';

// Auth Store
export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,

      login: async (email, password) => {
        set({ isLoading: true });
        try {
          const { data } = await auth.login(email, password);
          localStorage.setItem('token', data.token);
          set({ 
            user: data.user, 
            token: data.token, 
            isAuthenticated: true,
            isLoading: false,
          });
          return { success: true };
        } catch (error) {
          set({ isLoading: false });
          return { 
            success: false, 
            error: error.response?.data?.message || 'Ошибка авторизации' 
          };
        }
      },

      logout: () => {
        localStorage.removeItem('token');
        set({ user: null, token: null, isAuthenticated: false });
      },

      checkAuth: async () => {
        const token = localStorage.getItem('token');
        if (!token) {
          set({ isAuthenticated: false, user: null, token: null });
          return false;
        }

        try {
          const { data } = await auth.me();
          set({ user: data.user, token, isAuthenticated: true });
          return true;
        } catch (error) {
          localStorage.removeItem('token');
          set({ user: null, token: null, isAuthenticated: false });
          return false;
        }
      },

      hasPermission: (requiredRoles) => {
        const { user } = get();
        if (!user) return false;
        if (Array.isArray(requiredRoles)) {
          return requiredRoles.includes(user.role);
        }
        return user.role === requiredRoles;
      },

      isAdmin: () => {
        const { user } = get();
        return user?.role === 'admin';
      },

      isOperator: () => {
        const { user } = get();
        return user?.role === 'admin' || user?.role === 'operator';
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ token: state.token }),
    }
  )
);

// UI Store
export const useUIStore = create((set) => ({
  sidebarOpen: false,
  activeTab: 'dashboard',

  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setActiveTab: (tab) => set({ activeTab: tab }),
}));

// Tickets Store
export const useTicketsStore = create((set, get) => ({
  tickets: [],
  drafts: [],
  currentTicket: null,
  filters: {
    status: '',
    priority: '',
    source: '',
    search: '',
  },
  pagination: {
    page: 1,
    limit: 20,
    total: 0,
  },
  isLoading: false,

  setFilters: (newFilters) => set((state) => ({
    filters: { ...state.filters, ...newFilters },
    pagination: { ...state.pagination, page: 1 },
  })),

  setPage: (page) => set((state) => ({
    pagination: { ...state.pagination, page },
  })),

  setTickets: (tickets, total) => set({
    tickets,
    pagination: { ...get().pagination, total },
    isLoading: false,
  }),

  setDrafts: (drafts) => set({ drafts }),

  setCurrentTicket: (ticket) => set({ currentTicket: ticket }),

  updateTicketInList: (ticketId, updates) => set((state) => ({
    tickets: state.tickets.map(t => 
      t.id === ticketId ? { ...t, ...updates } : t
    ),
  })),

  removeFromDrafts: (ticketId) => set((state) => ({
    drafts: state.drafts.filter(t => t.id !== ticketId),
  })),

  setLoading: (isLoading) => set({ isLoading }),
}));

// Stats Store
export const useStatsStore = create((set) => ({
  stats: null,
  dailyStats: [],
  categoryStats: [],
  isLoading: false,

  setStats: (stats) => set({ stats }),
  setDailyStats: (dailyStats) => set({ dailyStats }),
  setCategoryStats: (categoryStats) => set({ categoryStats }),
  setLoading: (isLoading) => set({ isLoading }),
}));
