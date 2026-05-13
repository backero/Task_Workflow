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

module.exports = { authorize, authorizeMinRole, authorizeManagerOrAbove, authorizeAdminOrAbove, authorizeFounderOrAbove };
