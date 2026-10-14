// Holiday calendar endpoints.
const { asyncHandler, sendSuccess } = require('../utils/helpers');
const rulesService = require('../services/attendanceRules.service');

exports.list = asyncHandler(async (req, res) => {
  const holidays = await rulesService.listHolidays(req.user.organizationId);
  sendSuccess(res, { holidays });
});

exports.create = asyncHandler(async (req, res) => {
  const { name, date, is_recurring_annually: isRecurringAnnually } = req.body;
  const holiday = await rulesService.createHoliday(req.user.organizationId, req.user._id, {
    name, date: new Date(date), isRecurringAnnually,
  });
  sendSuccess(res, { holiday }, 'Holiday created', 201);
});

exports.remove = asyncHandler(async (req, res) => {
  await rulesService.deleteHoliday(req.user.organizationId, req.user._id, req.params.id);
  sendSuccess(res, {}, 'Holiday deleted');
});
