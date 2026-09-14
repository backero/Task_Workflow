// Audit log read endpoint — ported from the Attendance Tracker's
// app/modules/audit/router.py. SUPER_ADMIN only (admin+ role, since
// audit:read is deliberately excluded from HR's default grant — see
// utils/attendanceConstants.js#HR_TIER_PERMISSIONS).
const ActivityLog = require('../models/ActivityLog');
const { asyncHandler, sendSuccess, paginate, paginateResponse } = require('../utils/helpers');

exports.list = asyncHandler(async (req, res) => {
  const { entity_type: entityType, entity_id: entityId, actor_id: actorId, created_from: createdFrom, created_to: createdTo } = req.query;
  const { page = 1, limit = 20 } = req.query;

  const q = { organizationId: req.user.organizationId, module: 'attendance' };
  if (entityType) q['reference.model'] = entityType;
  if (entityId) q['reference.id'] = entityId;
  if (actorId) q.performedBy = actorId;
  if (createdFrom || createdTo) {
    q.createdAt = {};
    if (createdFrom) q.createdAt.$gte = new Date(createdFrom);
    if (createdTo) q.createdAt.$lte = new Date(createdTo);
  }

  const total = await ActivityLog.countDocuments(q);
  const { skip, limit: lim } = paginate(page, limit);
  const rows = await ActivityLog.find(q).sort({ createdAt: -1 }).skip(skip).limit(lim);
  sendSuccess(res, paginateResponse(rows, total, page, limit));
});
