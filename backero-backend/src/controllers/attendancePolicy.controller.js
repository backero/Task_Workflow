const AttendancePolicy = require('../models/AttendancePolicy');
const AttendanceStatusRule = require('../models/AttendanceStatusRule');
const LeaveType = require('../models/LeaveType');
const { asyncHandler, sendSuccess, sendError } = require('../utils/helpers');
const { recordAuditEvent } = require('../services/attendanceAudit.service');

const editable = [
  'payrollStartDay', 'payrollEndDay', 'casualLeavePerCycle', 'sickLeavePerCycle',
  'sandwichLeaveEnabled', 'correctionRequestsPerCycle', 'lateGraceMinutes',
  'halfDayAfterLateMinutes', 'defaultAdvanceInstallment',
];

exports.get = asyncHandler(async (req, res) => {
  const policy = await AttendancePolicy.findOneAndUpdate(
    { organizationId: req.user.organizationId },
    { $setOnInsert: { organizationId: req.user.organizationId } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  await LeaveType.bulkWrite([
    { updateOne: { filter: { organizationId: req.user.organizationId, code: 'CL' }, update: { $setOnInsert: { name: 'Casual Leave', code: 'CL', isPaid: true, isActive: true, createdBy: req.user._id } }, upsert: true } },
    { updateOne: { filter: { organizationId: req.user.organizationId, code: 'SL' }, update: { $setOnInsert: { name: 'Sick Leave', code: 'SL', isPaid: true, isActive: true, createdBy: req.user._id } }, upsert: true } },
  ]);
  sendSuccess(res, { policy });
});

exports.update = asyncHandler(async (req, res) => {
  const next = {};
  for (const key of editable) if (Object.hasOwn(req.body, key)) next[key] = req.body[key];
  if (next.payrollStartDay != null && (!Number.isInteger(next.payrollStartDay) || next.payrollStartDay < 1 || next.payrollStartDay > 28)) return sendError(res, 'Payroll start day must be between 1 and 28.', 422);
  if (next.payrollEndDay != null && (!Number.isInteger(next.payrollEndDay) || next.payrollEndDay < 1 || next.payrollEndDay > 31)) return sendError(res, 'Payroll end day must be between 1 and 31.', 422);
  const previous = await AttendancePolicy.findOne({ organizationId: req.user.organizationId }).lean();
  const policy = await AttendancePolicy.findOneAndUpdate(
    { organizationId: req.user.organizationId },
    { $set: { ...next, updatedBy: req.user._id }, $setOnInsert: { organizationId: req.user.organizationId } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  const effectiveFrom = new Date();
  const rules = [];
  if (next.lateGraceMinutes != null) rules.push({ ruleKey: 'LATE_THRESHOLD_MINUTES', value: next.lateGraceMinutes });
  if (next.halfDayAfterLateMinutes != null) rules.push({ ruleKey: 'HALF_DAY_AFTER_LATE_MINUTES', value: next.halfDayAfterLateMinutes });
  if (rules.length) {
    await AttendanceStatusRule.insertMany(rules.map((rule) => ({
      organizationId: req.user.organizationId, changedBy: req.user._id, effectiveFrom, ...rule,
    })));
  }
  await recordAuditEvent({ organizationId: req.user.organizationId, actorUserId: req.user._id, action: 'attendance_policy.update', entityType: 'AttendancePolicy', entityId: policy._id, previousValue: previous || {}, newValue: next });
  sendSuccess(res, { policy }, 'Attendance policy updated. Changes apply to future requests and newly generated payroll.');
});
