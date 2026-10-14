// Weekly-off schedule config endpoints.
const { asyncHandler, sendSuccess } = require('../utils/helpers');
const rulesService = require('../services/attendanceRules.service');

exports.list = asyncHandler(async (req, res) => {
  const schedules = await rulesService.listWorkSchedules(req.user.organizationId);
  sendSuccess(res, { schedules });
});

exports.create = asyncHandler(async (req, res) => {
  const { week_off_days: weekOffDays, effective_from: effectiveFrom } = req.body;
  const schedule = await rulesService.createWorkSchedule(req.user.organizationId, req.user._id, {
    weekOffDays, effectiveFrom: new Date(effectiveFrom),
  });
  sendSuccess(res, { schedule }, 'Work schedule created', 201);
});
