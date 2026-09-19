// Work-hours rule config endpoints — the write path for AttendanceStatusRule
// (shift start/end, late threshold, half-day minimum hours).
const { asyncHandler, sendSuccess } = require('../utils/helpers');
const rulesService = require('../services/attendanceRules.service');

exports.list = asyncHandler(async (req, res) => {
  const rules = await rulesService.listRules(req.user.organizationId);
  sendSuccess(res, { rules });
});

exports.create = asyncHandler(async (req, res) => {
  const { rule_key: ruleKey, value, effective_from: effectiveFrom } = req.body;
  const rule = await rulesService.createRule(req.user.organizationId, req.user._id, {
    ruleKey, value, effectiveFrom: new Date(effectiveFrom),
  });
  sendSuccess(res, { rule }, 'Rule created', 201);
});
