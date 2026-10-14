import { useAuthStore } from './useAuthStore';

const HIERARCHY = { super_admin: 7, chairman: 6, founder: 5, admin: 4, manager: 3, team_lead: 2, member: 1 };

// Raw permission-string codes for the Attendance Tracker module (mirrors backend's
// src/utils/attendanceConstants.js ATTENDANCE_PERMISSIONS). Unlike the department/role → module
// gating below, these live directly on user.permissions[] and are checked verbatim, same as the
// backend's requireAttendancePermission middleware.
const ATTENDANCE_PERMISSION_CODES = new Set([
  'employee:read', 'employee:manage', 'employee:export',
  'department:read', 'department:manage',
  'attendance:read', 'attendance:correct', 'attendance:review_exceptions', 'attendance:reprocess', 'attendance:export',
  'period:read', 'period:configure', 'period:finalize',
  'device:read', 'device:manage',
  'field_session:start', 'location:view_live', 'location:view_history',
  'payroll:read', 'payroll:finalize', 'payroll:manage_config',
  'audit:read',
  'rules:configure',
  'leave:read', 'leave:manage', 'leave:approve',
]);

// Which modules each department can access
const DEPT_MODULES = {
  'Marketing':          ['tasks', 'crm', 'inventory', 'dept.marketing'],
  'Marketplace':        ['tasks', 'inventory', 'dept.marketplace'],
  'Sales':              ['tasks', 'crm', 'inventory', 'dept.sales'],
  'Production':         ['tasks', 'production', 'inventory', 'crm'],
  'R&D':                ['tasks', 'production', 'inventory', 'dept.rnd'],
  'Operations':         ['tasks', 'inventory', 'production', 'dept.operations'],
  'HR':                 ['tasks', 'management', 'inventory', 'dept.hr'],
  'Accounts & Finance': ['tasks', 'finance', 'inventory'],
};

// Modules a manager can access (dept modules + management)
const MANAGER_EXTRA = ['management', 'tasks.team', 'tasks.approvals', 'tasks.analytics', 'tasks.calendar', 'finance', 'inventory', 'production'];

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
    // managers get full access across all departments and pages, like admin
    Object.values(DEPT_MODULES).flat().forEach((m) => allowedModules.add(m));
    MANAGER_EXTRA.forEach((m) => allowedModules.add(m));
    allowedModules.add('management');
    allowedModules.add('tasks.team');
    allowedModules.add('tasks.approvals');
    allowedModules.add('tasks.analytics');
    allowedModules.add('tasks.calendar');
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

  // Raw permission-string check for the Attendance Tracker module — direct mirror of the
  // backend's requireAttendancePermission(code): admin+ always passes, else the exact code
  // must be present in user.permissions[].
  const hasPermission = (code) => isAdmin || (user?.permissions || []).includes(code);
  const canAttendance = isAdmin || (user?.permissions || []).some((p) => ATTENDANCE_PERMISSION_CODES.has(p));

  return {
    can,
    hasPermission,
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
    canDocuments:  can('finance'),
    canAttendance,
  };
};
