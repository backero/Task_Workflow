import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      organization: null,

      setAuth: (user, token, organization) => set({ user, token, organization }),
      setUser: (user) => set({ user }),
      setOrganization: (organization) => set({ organization }),
      setToken: (token) => set({ token }),

      logout: () => {
        set({ user: null, token: null, organization: null });
        localStorage.removeItem('backero-auth');
      },

      isAuthenticated: () => !!get().token && !!get().user,

      hasRole: (...roles) => {
        const user = get().user;
        return user ? roles.includes(user.role) : false;
      },

      isManagerOrAbove: () => {
        const hierarchyMap = { super_admin: 7, chairman: 6, founder: 5, admin: 4, manager: 3, team_lead: 2, member: 1 };
        const user = get().user;
        return user ? (hierarchyMap[user.role] || 0) >= 3 : false;
      },

      isFounderOrAbove: () => {
        const hierarchyMap = { super_admin: 7, chairman: 6, founder: 5, admin: 4, manager: 3, team_lead: 2, member: 1 };
        const user = get().user;
        return user ? (hierarchyMap[user.role] || 0) >= 5 : false;
      },
    }),
    {
      name: 'backero-auth',
      partialize: (state) => ({ user: state.user, token: state.token, organization: state.organization }),
    }
  )
);
