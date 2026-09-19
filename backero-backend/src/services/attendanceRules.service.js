// Work-hours rules, holiday calendar, and weekly-off config — the write
// path for the previously-read-only AttendanceStatusRule engine, plus the
// new Holiday/WorkScheduleConfig models. Mirrors attendancePeriods.service.js's
// versioned-config + audit-log pattern.
const AttendanceStatusRule = require('../models/AttendanceStatusRule');
const Holiday = require('../models/Holiday');
const WorkScheduleConfig = require('../models/WorkScheduleConfig');
const { CONFIGURABLE_RULE_KEYS } = require('../utils/attendanceConstants');
const { recordAuditEvent } = require('./attendanceAudit.service');

function fail(status, code, message) {
  const err = new Error(message);
  err.statusCode = status;
  err.code = code;
  return err;
}

async function listRules(organizationId) {
  return AttendanceStatusRule.find({ organizationId }).sort({ effectiveFrom: 1 });
}

async function createRule(organizationId, actorUserId, { ruleKey, value, effectiveFrom }) {
  if (!CONFIGURABLE_RULE_KEYS.includes(ruleKey)) {
    throw fail(422, 'invalid_rule_key', `rule_key must be one of: ${CONFIGURABLE_RULE_KEYS.join(', ')}.`);
  }
  const rule = await AttendanceStatusRule.create({ organizationId, ruleKey, value, effectiveFrom, changedBy: actorUserId });
  await recordAuditEvent({
    organizationId, actorUserId, action: 'attendance_rule.create',
    entityType: 'AttendanceStatusRule', entityId: rule._id, newValue: { ruleKey, value, effectiveFrom },
  });
  return rule;
}

async function listHolidays(organizationId) {
  return Holiday.find({ organizationId }).sort({ date: 1 });
}

async function createHoliday(organizationId, actorUserId, { name, date, isRecurringAnnually }) {
  const holiday = await Holiday.create({
    organizationId, name, date, isRecurringAnnually: !!isRecurringAnnually, createdBy: actorUserId,
  });
  await recordAuditEvent({
    organizationId, actorUserId, action: 'holiday.create',
    entityType: 'Holiday', entityId: holiday._id, newValue: { name, date, isRecurringAnnually },
  });
  return holiday;
}

async function deleteHoliday(organizationId, actorUserId, holidayId) {
  const holiday = await Holiday.findOneAndDelete({ _id: holidayId, organizationId });
  if (!holiday) throw fail(404, 'not_found', 'Holiday not found.');
  await recordAuditEvent({
    organizationId, actorUserId, action: 'holiday.delete',
    entityType: 'Holiday', entityId: holiday._id, previousValue: { name: holiday.name, date: holiday.date },
  });
  return holiday;
}

async function listWorkSchedules(organizationId) {
  return WorkScheduleConfig.find({ organizationId }).sort({ effectiveFrom: 1 });
}

async function createWorkSchedule(organizationId, actorUserId, { weekOffDays, effectiveFrom }) {
  if (!Array.isArray(weekOffDays) || !weekOffDays.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) {
    throw fail(422, 'invalid_week_off_days', 'week_off_days must be an array of integers 0-6 (0=Sunday).');
  }
  const config = await WorkScheduleConfig.create({ organizationId, weekOffDays, effectiveFrom, changedBy: actorUserId });
  await recordAuditEvent({
    organizationId, actorUserId, action: 'work_schedule.create',
    entityType: 'WorkScheduleConfig', entityId: config._id, newValue: { weekOffDays, effectiveFrom },
  });
  return config;
}

module.exports = {
  listRules, createRule, listHolidays, createHoliday, deleteHoliday, listWorkSchedules, createWorkSchedule,
};
