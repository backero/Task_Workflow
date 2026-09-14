// Zustand store for the new backero-backend-py auth realm — deliberately
// separate from store/useAuthStore.js (the existing Node-backend auth),
// since Phase 1 keeps two separate logins. Same role-hierarchy shape as
// useAuthStore's hierarchyMap, ported from the backend's
// WORKFLOW_ROLE_HIERARCHY (app/models/workflow_user.py).
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const hierarchyMap = {
  super_admin: 7,
  chairman: 6,
  founder: 5,
  admin: 4,
  manager: 3,
  team_lead: 2,
  member: 1,
};

export const useWorkflowAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      organization: null,
      accessToken: null,
      refreshToken: null,

      setAuth: (user, organization, accessToken, refreshToken) =>
        set({ user, organization, accessToken, refreshToken }),
      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),
      setUser: (user) => set({ user }),
      logout: () => set({ user: null, organization: null, accessToken: null, refreshToken: null }),

      isAuthenticated: () => !!get().accessToken && !!get().user,
      hasRole: (...roles) => roles.includes(get().user?.role),
      roleLevel: () => hierarchyMap[get().user?.role] || 0,
      isManagerOrAbove: () => get().roleLevel() >= hierarchyMap.manager,
      isAdminOrAbove: () => get().roleLevel() >= hierarchyMap.admin,
    }),
    { name: 'backero-workflow-auth' }
  )
);

export const WORKFLOW_ROLE_HIERARCHY = hierarchyMap;
