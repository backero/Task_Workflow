// Attendance period lifecycle — ported from periods_service.py.
const AttendancePeriod = require('../models/AttendancePeriod');
const AttendancePeriodConfig = require('../models/AttendancePeriodConfig');
const { generatePeriods } = require('./attendancePeriodLogic.service');
const { recordAuditEvent } = require('./attendanceAudit.service');

function fail(status, code, message) {
  const err = new Error(message);
  err.statusCode = status;
  err.code = code;
  return err;
}

/** Resolve (creating if necessary) the AttendancePeriod covering targetDate.
 * Uses an atomic upsert keyed on periodStart — the Mongo equivalent of the
 * source's "insert, on unique-constraint conflict re-select" race handling,
 * done in one round trip instead. */
async function getOrCreatePeriodForDate(organizationId, targetDate) {
  const configs = await AttendancePeriodConfig.find({ organizationId }).sort({ effectiveFrom: 1 });
  if (!configs.length) {
    throw fail(422, 'no_period_config', 'No AttendancePeriodConfig exists yet — configure one before generating periods.');
  }

  const [boundary] = generatePeriods(configs, targetDate, targetDate);

  const period = await AttendancePeriod.findOneAndUpdate(
    { organizationId, periodStart: boundary.periodStart },
    {
      $setOnInsert: {
        organizationId,
        periodStart: boundary.periodStart,
        periodEnd: boundary.periodEnd,
        status: 'OPEN',
        configId: boundary.config._id,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return period;
}

async function listConfigs(organizationId) {
  return AttendancePeriodConfig.find({ organizationId }).sort({ effectiveFrom: 1 });
}

async function configurePeriod(organizationId, actorUserId, { periodStartDay, periodEndDay, effectiveFrom }) {
  if (!(periodStartDay >= 1 && periodStartDay <= 28)) throw fail(422, 'invalid_period_day', 'period_start_day must be between 1 and 28.');
  if (!(periodEndDay >= 1 && periodEndDay <= 28)) throw fail(422, 'invalid_period_day', 'period_end_day must be between 1 and 28.');

  const config = await AttendancePeriodConfig.create({
    organizationId, periodStartDay, periodEndDay, effectiveFrom, changedBy: actorUserId,
  });

  await recordAuditEvent({
    organizationId,
    actorUserId,
    action: 'period_config.create',
    entityType: 'AttendancePeriodConfig',
    entityId: config._id,
    newValue: { periodStartDay, periodEndDay, effectiveFrom },
  });
  return config;
}

async function finalizePeriod(organizationId, actorUserId, periodId) {
  const period = await AttendancePeriod.findOne({ _id: periodId, organizationId });
  if (!period) throw fail(404, 'not_found', 'Attendance period not found.');
  if (period.status === 'FINALIZED') throw fail(409, 'period_already_finalized', 'This attendance period is already finalized.');

  const previousStatus = period.status;
  period.status = 'FINALIZED';
  period.finalizedAt = new Date();
  period.finalizedBy = actorUserId;
  await period.save();

  await recordAuditEvent({
    organizationId,
    actorUserId,
    action: 'period.finalize',
    entityType: 'AttendancePeriod',
    entityId: period._id,
    previousValue: { status: previousStatus },
    newValue: { status: 'FINALIZED' },
  });
  return period;
}

module.exports = { getOrCreatePeriodForDate, listConfigs, configurePeriod, finalizePeriod };
