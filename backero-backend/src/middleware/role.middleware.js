const { ROLE_HIERARCHY } = require('../utils/constants');
const { sendError } = require('../utils/helpers');

const authorize = (...roles) => (req, res, next) => {
  if (!req.user) return sendError(res, 'Authentication required.', 401);
  if (!roles.includes(req.user.role)) {
    return sendError(res, `Access denied. Required role: ${roles.join(' or ')}.`, 403);
  }
  next();
};

const authorizeMinRole = (minRole) => (req, res, next) => {
  if (!req.user) return sendError(res, 'Authentication required.', 401);
  const userLevel = ROLE_HIERARCHY[req.user.role] || 0;
  const requiredLevel = ROLE_HIERARCHY[minRole] || 0;
  if (userLevel < requiredLevel) {
    return sendError(res, `Access denied. Minimum role required: ${minRole}.`, 403);
  }
  next();
};

const authorizeManagerOrAbove = authorizeMinRole('manager');
const authorizeAdminOrAbove = authorizeMinRole('admin');
const authorizeFounderOrAbove = authorizeMinRole('founder');

// manager+ OR explicit inventory:write permission
const authorizeInventoryWrite = (req, res, next) => {
  if (!req.user) return sendError(res, 'Authentication required.', 401);
  const level = ROLE_HIERARCHY[req.user.role] || 0;
  if (level >= ROLE_HIERARCHY['manager'] || (req.user.permissions || []).includes('inventory:write')) {
    return next();
  }
  return sendError(res, 'Access denied. Inventory write permission required.', 403);
};

// admin+ OR explicit catalog:delete permission (e.g. a department manager granted product-delete rights)
const authorizeCatalogDelete = (req, res, next) => {
  if (!req.user) return sendError(res, 'Authentication required.', 401);
  const level = ROLE_HIERARCHY[req.user.role] || 0;
  if (level >= ROLE_HIERARCHY['admin'] || (req.user.permissions || []).includes('catalog:delete')) {
    return next();
  }
  return sendError(res, 'Access denied. Catalog delete permission required.', 403);
};

// Marketing dept manager+ OR admin+ — gates the social-media approval queue,
// which is scoped to Marketing only (unlike the general Approval Queue).
const authorizeMarketingApprover = (req, res, next) => {
  if (!req.user) return sendError(res, 'Authentication required.', 401);
  const level = ROLE_HIERARCHY[req.user.role] || 0;
  if (level >= ROLE_HIERARCHY['admin']) return next();
  if (level >= ROLE_HIERARCHY['manager'] && req.user.department === 'Marketing') return next();
  return sendError(res, 'Access denied. Marketing department manager or admin required.', 403);
};

// Attendance Tracker permission-string gate: admin+ always passes (mirrors
// the source's SUPER_ADMIN implicit-all-permissions rule); otherwise the
// caller needs the exact permission string on their own User.permissions
// array. Ported alongside utils/attendanceConstants.js's ATTENDANCE_PERMISSIONS.
const requireAttendancePermission = (permissionCode) => (req, res, next) => {
  if (!req.user) return sendError(res, 'Authentication required.', 401);
  const level = ROLE_HIERARCHY[req.user.role] || 0;
  if (level >= ROLE_HIERARCHY['admin'] || (req.user.permissions || []).includes(permissionCode)) {
    return next();
  }
  return sendError(res, `Access denied. Permission required: ${permissionCode}.`, 403);
};

module.exports = {
  authorize,
  authorizeMinRole,
  authorizeManagerOrAbove,
  authorizeAdminOrAbove,
  authorizeFounderOrAbove,
  authorizeInventoryWrite,
  authorizeCatalogDelete,
  authorizeMarketingApprover,
  requireAttendancePermission,
};
