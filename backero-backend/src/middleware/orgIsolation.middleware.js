const { sendError } = require('../utils/helpers');

// Ensures all queries are scoped to the user's organization
const orgIsolation = (req, res, next) => {
  if (!req.user || !req.user.organizationId) {
    return sendError(res, 'Organization context required.', 403);
  }
  // Attach orgId to query params for easy access
  req.orgId = req.user.organizationId.toString();
  next();
};

// Verify a resource belongs to the user's organization
const verifyOrgOwnership = (Model) => async (req, res, next) => {
  try {
    const doc = await Model.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId,
    });
    if (!doc) return sendError(res, 'Resource not found or access denied.', 404);
    req.resource = doc;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { orgIsolation, verifyOrgOwnership };
