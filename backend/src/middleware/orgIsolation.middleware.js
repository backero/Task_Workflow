const { forbidden } = require('../utils/response');
const { ROLES } = require('../utils/constants');

/**
 * Injects organizationId filter into req.orgFilter for DB queries.
 * SUPER_ADMIN can pass ?orgId= param to scope to a specific org.
 * All other roles are automatically scoped to their own org.
 */
const orgScope = (req, res, next) => {
  if (!req.user) return forbidden(res, 'Not authenticated');

  if (req.user.role === ROLES.SUPER_ADMIN) {
    // SUPER_ADMIN can optionally filter by org
    const orgId = req.query.orgId || req.body.organizationId || null;
    req.orgFilter = orgId ? { organizationId: orgId } : {};
  } else {
    if (!req.user.organizationId) {
      return forbidden(res, 'User is not associated with an organization');
    }
    req.orgFilter = { organizationId: req.user.organizationId };
  }

  next();
};

/**
 * Hard-enforces that the requesting user belongs to the same org as
 * the target resource. Use after orgScope when you need strict isolation.
 */
const enforceOrgOwnership = (orgIdExtractor) => {
  return (req, res, next) => {
    if (req.user.role === ROLES.SUPER_ADMIN) return next();
    const resourceOrgId = orgIdExtractor(req);
    if (!resourceOrgId) return next();
    if (resourceOrgId.toString() !== req.user.organizationId.toString()) {
      return forbidden(res, 'Cross-organization access denied');
    }
    next();
  };
};

module.exports = { orgScope, enforceOrgOwnership };
