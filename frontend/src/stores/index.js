import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { auth as authApi } from '../api';

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
          const { data } = await authApi.login(email, password);
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
            error: error.response?.data?.message || 'Login failed' 
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
          set({ isAuthenticated: false });
          return false;
        }
        
        try {
          const { data } = await authApi.me();
          set({ user: data.user, token, isAuthenticated: true });
          return true;
        } catch (error) {
          localStorage.removeItem('token');
          set({ user: null, token: null, isAuthenticated: false });
          return false;
        }
      },

      hasPermission: (permission) => {
        const { user } = get();
        if (!user) return false;
        return user.permissions?.includes(permission) || user.role === 'admin';
      },

      isAdmin: () => {
        const { user } = get();
        return user?.role === 'admin';
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
  sidebarOpen: true,
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
    source: '',
    priority: '',
    search: '',
  },
  pagination: {
    page: 1,
    limit: 20,
    total: 0,
  },
  isLoading: false,

  setFilters: (filters) => set((state) => ({ 
    filters: { ...state.filters, ...filters },
    pagination: { ...state.pagination, page: 1 },
  })),

  setPage: (page) => set((state) => ({ 
    pagination: { ...state.pagination, page } 
  })),

  setTickets: (tickets, total) => set((state) => ({ 
    tickets,
    pagination: { ...state.pagination, total },
  })),

  setDrafts: (drafts) => set({ drafts }),

  setCurrentTicket: (ticket) => set({ currentTicket: ticket }),

  setLoading: (isLoading) => set({ isLoading }),

  updateTicketInList: (id, updates) => set((state) => ({
    tickets: state.tickets.map(t => t.id === id ? { ...t, ...updates } : t),
    drafts: state.drafts.map(t => t.id === id ? { ...t, ...updates } : t),
  })),

  removeFromDrafts: (id) => set((state) => ({
    drafts: state.drafts.filter(t => t.id !== id),
  })),
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
