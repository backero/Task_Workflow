import { useAuthStore } from './useAuthStore';

const HIERARCHY = { super_admin: 7, chairman: 6, founder: 5, admin: 4, manager: 3, team_lead: 2, member: 1 };

// Which modules each department can access
const DEPT_MODULES = {
  'Marketing':          ['tasks', 'crm', 'dept.marketing'],
  'Marketplace':        ['tasks', 'inventory', 'dept.marketplace'],
  'Sales':              ['tasks', 'crm', 'dept.sales'],
  'Production':         ['tasks', 'production', 'inventory'],
  'R&D':                ['tasks', 'production', 'dept.rnd'],
  'Operations':         ['tasks', 'inventory', 'production'],
  'Accounts & Finance': ['tasks', 'finance'],
};

// Modules a manager can access (dept modules + management)
const MANAGER_EXTRA = ['management', 'tasks.team', 'tasks.approvals', 'tasks.analytics', 'tasks.calendar'];

export const usePermissions = () => {
  const { user } = useAuthStore();
  const role = user?.role || 'member';
  const dept = user?.department || '';
  const level = HIERARCHY[role] || 1;

  const isAdmin   = level >= 4;   // admin, founder, chairman, super_admin
  const isManager = level >= 3;   // + manager
  const isLead    = level >= 2;   // + team_lead

  // What modules this user may access
  const allowedModules = new Set(['tasks.my', 'tasks.kanban', 'settings']);

  if (isAdmin) {
    // admin sees everything
    Object.values(DEPT_MODULES).flat().forEach((m) => allowedModules.add(m));
    MANAGER_EXTRA.forEach((m) => allowedModules.add(m));
    allowedModules.add('management');
    allowedModules.add('tasks.team');
    allowedModules.add('tasks.approvals');
    allowedModules.add('tasks.analytics');
    allowedModules.add('tasks.calendar');
  } else if (isManager) {
    // manager gets their dept modules + all management extras
    const deptMods = DEPT_MODULES[dept] || ['tasks'];
    deptMods.forEach((m) => allowedModules.add(m));
    MANAGER_EXTRA.forEach((m) => allowedModules.add(m));
    // managers can see all dept pages for visibility
    Object.keys(DEPT_MODULES)
      .filter((d) => DEPT_MODULES[d].some((m) => m.startsWith('dept.')))
      .forEach((d) => DEPT_MODULES[d].filter((m) => m.startsWith('dept.')).forEach((m) => allowedModules.add(m)));
  } else {
    // member / team_lead: only their dept modules
    const deptMods = DEPT_MODULES[dept] || ['tasks'];
    deptMods.forEach((m) => allowedModules.add(m));
    if (isLead) {
      allowedModules.add('tasks.team');
      allowedModules.add('tasks.calendar');
    }
  }

  const can = (module) => isAdmin || allowedModules.has(module);

  return {
    can,
    isAdmin,
    isManager,
    isLead,
    role,
    dept,
    level,
    // convenience shorthands
    canCRM:        can('crm'),
    canInventory:  can('inventory'),
    canProduction: can('production'),
    canFinance:    can('finance'),
    canManagement: can('management'),
    canTeamTasks:  can('tasks.team'),
    canApprovals:  can('tasks.approvals'),
    canAnalytics:  can('tasks.analytics'),
    canCalendar:   can('tasks.calendar'),
  };
};
