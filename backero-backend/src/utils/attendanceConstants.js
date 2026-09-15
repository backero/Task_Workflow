// Attendance Tracker domain constants — ported from the Attendance Tracker
// FastAPI backend's app/core/permissions.py permission-string registry.
// Task_Workflow's own role hierarchy (ROLES/ROLE_HIERARCHY in constants.js)
// stays the primary gate; these permission strings layer on top of it via
// requireAttendancePermission() in middleware/role.middleware.js, stored on
// the existing User.permissions array (no new Role/Permission tables).

const ATTENDANCE_PERMISSIONS = {
  EMPLOYEE_READ: 'employee:read',
  EMPLOYEE_MANAGE: 'employee:manage',
  EMPLOYEE_EXPORT: 'employee:export',
  DEPARTMENT_READ: 'department:read',
  DEPARTMENT_MANAGE: 'department:manage',

  ATTENDANCE_READ: 'attendance:read',
  ATTENDANCE_CORRECT: 'attendance:correct',
  ATTENDANCE_REVIEW_EXCEPTIONS: 'attendance:review_exceptions',
  ATTENDANCE_REPROCESS: 'attendance:reprocess',
  ATTENDANCE_EXPORT: 'attendance:export',
  PERIOD_READ: 'period:read',
  PERIOD_CONFIGURE: 'period:configure',
  PERIOD_FINALIZE: 'period:finalize',

  DEVICE_READ: 'device:read',
  DEVICE_MANAGE: 'device:manage',

  FIELD_SESSION_START: 'field_session:start',
  LOCATION_VIEW_LIVE: 'location:view_live',
  LOCATION_VIEW_HISTORY: 'location:view_history',

  PAYROLL_READ: 'payroll:read',
  PAYROLL_FINALIZE: 'payroll:finalize',
  PAYROLL_MANAGE_CONFIG: 'payroll:manage_config',

  AUDIT_READ: 'audit:read',
};

// Default grants for the source's HR tier — applied here to any
// Task_Workflow user whose `department` is 'HR' at manager+ level (mirrors
// the existing authorizeMarketingApprover precedent) as well as available
// as an explicit opt-in via User.permissions for anyone else who needs a
// subset (e.g. a non-HR-department admin assistant given attendance:export
// only). SUPER_ADMIN-tier (admin+ in Task_Workflow's hierarchy) always
// passes every attendance permission check regardless of this list — see
// requireAttendancePermission.
const HR_TIER_PERMISSIONS = [
  ATTENDANCE_PERMISSIONS.EMPLOYEE_READ,
  ATTENDANCE_PERMISSIONS.DEPARTMENT_READ,
  ATTENDANCE_PERMISSIONS.ATTENDANCE_READ,
  ATTENDANCE_PERMISSIONS.ATTENDANCE_CORRECT,
  ATTENDANCE_PERMISSIONS.ATTENDANCE_REVIEW_EXCEPTIONS,
  ATTENDANCE_PERMISSIONS.ATTENDANCE_EXPORT,
  ATTENDANCE_PERMISSIONS.PERIOD_READ,
  ATTENDANCE_PERMISSIONS.DEVICE_READ,
  ATTENDANCE_PERMISSIONS.LOCATION_VIEW_LIVE,
  ATTENDANCE_PERMISSIONS.LOCATION_VIEW_HISTORY,
  ATTENDANCE_PERMISSIONS.PAYROLL_READ,
  // AUDIT_READ intentionally excluded — matches the source's spec note that
  // audit-log access is SUPER_ADMIN-only, not granted to HR.
];

const EMPLOYEE_CATEGORY = { OFFICE: 'OFFICE', FIELD: 'FIELD' };

// ON_LEAVE/HOLIDAY/WEEK_OFF are never produced by the status-derivation
// algorithm itself (see attendanceProcessor.service.js#deriveStatus) — they
// exist so a future leave module (or a manual override) can write them
// directly; the algorithm only ever derives PRESENT/ABSENT/LATE/HALF_DAY/
// MISSING_PUNCH/INCOMPLETE.
const ATTENDANCE_STATUSES = [
  'PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'ON_LEAVE', 'HOLIDAY', 'WEEK_OFF', 'MISSING_PUNCH', 'INCOMPLETE',
];

const ATTENDANCE_EVENT_TYPES = ['CHECK_IN', 'CHECK_OUT', 'UNKNOWN'];
const ATTENDANCE_EVENT_SOURCES = ['DEVICE', 'MOCK', 'MANUAL_CORRECTION', 'SELF_SERVICE'];

// REJECTED is defined for schema completeness (mirrors the source) — no
// endpoint transitions a correction to REJECTED today, only PENDING_APPROVAL -> APPROVED.
const CORRECTION_STATUSES = ['PENDING_APPROVAL', 'APPROVED', 'REJECTED'];

// CLOSED is defined for schema completeness — no code path sets it; periods
// only ever go OPEN -> FINALIZED (one-way, no reopen endpoint).
const ATTENDANCE_PERIOD_STATUSES = ['OPEN', 'CLOSED', 'FINALIZED'];

const DEFAULT_ATTENDANCE_RULES = {
  SHIFT_START_TIME: '09:00',
  LATE_THRESHOLD_MINUTES: 10,
  HALF_DAY_MIN_HOURS: 4,
};

// Location tracking defaults — ported from the Attendance Tracker's
// app/core/config.py Settings. No per-org override mechanism yet (the
// source doesn't have one either — these are process-wide settings there
// too), hardcoded here rather than left as magic numbers in the service.
const LOCATION_DEFAULTS = {
  INTERVAL_SECONDS: 60,
  RETENTION_DAYS: 90,
  LOW_ACCURACY_THRESHOLD_METERS: 50.0,
  ANOMALY_SPEED_KMH: 300.0,
  SESSION_TIMEOUT_HOURS: 16,
};

module.exports = {
  ATTENDANCE_PERMISSIONS,
  HR_TIER_PERMISSIONS,
  EMPLOYEE_CATEGORY,
  ATTENDANCE_STATUSES,
  ATTENDANCE_EVENT_TYPES,
  ATTENDANCE_EVENT_SOURCES,
  CORRECTION_STATUSES,
  ATTENDANCE_PERIOD_STATUSES,
  DEFAULT_ATTENDANCE_RULES,
  LOCATION_DEFAULTS,
};
