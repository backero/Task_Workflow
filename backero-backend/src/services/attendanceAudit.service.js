// Shared audit-log helper for the Attendance domain — wraps the existing
// ActivityLog model (module: 'attendance') rather than introducing a new
// collection. Mirrors the source's record_audit_event(actor_user_id,
// action, entity_type, entity_id, previous_value, new_value, reason) signature.
const ActivityLog = require('../models/ActivityLog');

async function recordAuditEvent(
  { organizationId, actorUserId, action, entityType, entityId = null, previousValue = null, newValue = null, reason = null },
) {
  await ActivityLog.create({
    organizationId,
    performedBy: actorUserId,
    action,
    module: 'attendance',
    reference: entityType ? { model: entityType, id: entityId } : undefined,
    description: reason,
    previousData: previousValue,
    newData: newValue,
  });
}

module.exports = { recordAuditEvent };
