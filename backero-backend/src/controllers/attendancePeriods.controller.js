// Attendance period endpoints — ported from periods_router.py.
const { asyncHandler, sendSuccess } = require('../utils/helpers');
const periodsService = require('../services/attendancePeriods.service');

exports.listConfigs = asyncHandler(async (req, res) => {
  const configs = await periodsService.listConfigs(req.user.organizationId);
  sendSuccess(res, { configs });
});

exports.createConfig = asyncHandler(async (req, res) => {
  const { period_start_day: periodStartDay, period_end_day: periodEndDay, effective_from: effectiveFrom } = req.body;
  const config = await periodsService.configurePeriod(req.user.organizationId, req.user._id, {
    periodStartDay: Number(periodStartDay),
    periodEndDay: Number(periodEndDay),
    effectiveFrom: new Date(effectiveFrom),
  });
  sendSuccess(res, { config }, 'Period config created', 201);
});

exports.getCurrent = asyncHandler(async (req, res) => {
  const today = new Date();
  const targetDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const period = await periodsService.getOrCreatePeriodForDate(req.user.organizationId, targetDate);
  sendSuccess(res, { period });
});

exports.finalize = asyncHandler(async (req, res) => {
  const period = await periodsService.finalizePeriod(req.user.organizationId, req.user._id, req.params.periodId);
  sendSuccess(res, { period }, 'Period finalized');
});
