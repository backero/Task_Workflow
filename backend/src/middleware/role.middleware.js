const { ROLE_HIERARCHY } = require('../utils/constants');
const { forbidden } = require('../utils/response');

/**
 * Require one of the listed roles (exact match)
 * Usage: requireRole('ADMIN', 'ORG_ADMIN', 'SUPER_ADMIN')
 */
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) return forbidden(res, 'Not authenticated');
    if (!allowedRoles.includes(req.user.role)) {
      return forbidden(res, `Access requires role: ${allowedRoles.join(' | ')}`);
    }
    next();
  };
};

/**
 * Require minimum hierarchy level
 * Usage: requireMinRole('MANAGER') – allows MANAGER, ADMIN, ORG_ADMIN, SUPER_ADMIN
 */
const requireMinRole = (minRole) => {
  return (req, res, next) => {
    if (!req.user) return forbidden(res, 'Not authenticated');
    const userLevel = ROLE_HIERARCHY[req.user.role] || 0;
    const minLevel = ROLE_HIERARCHY[minRole] || 0;
    if (userLevel < minLevel) {
      return forbidden(res, `Insufficient permissions. Requires at least: ${minRole}`);
    }
    next();
  };
};

module.exports = { requireRole, requireMinRole };
