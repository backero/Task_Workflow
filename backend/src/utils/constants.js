const ROLES = Object.freeze({
  SUPER_ADMIN: 'SUPER_ADMIN',
  ORG_ADMIN: 'ORG_ADMIN',
  ADMIN: 'ADMIN',
  HR: 'HR',
  MANAGER: 'MANAGER',
  EMPLOYEE: 'EMPLOYEE',
});

// Higher number = more authority
const ROLE_HIERARCHY = Object.freeze({
  SUPER_ADMIN: 6,
  ORG_ADMIN: 5,
  ADMIN: 4,
  HR: 3,
  MANAGER: 2,
  EMPLOYEE: 1,
});

const PLANS = Object.freeze({
  FREE: 'free',
  PRO: 'pro',
  ENTERPRISE: 'enterprise',
});

module.exports = { ROLES, ROLE_HIERARCHY, PLANS };
