// Leave management business logic — apply/approve/reject/cancel, and the
// balance bookkeeping that goes with it. Deliberately no accrual math:
// LeaveBalance.totalDays is set directly by HR (see setBalance), same as
// Employee.basicMonthlySalary.
const Employee = require('../models/Employee');
const LeaveType = require('../models/LeaveType');
const LeaveBalance = require('../models/LeaveBalance');
const LeaveRequest = require('../models/LeaveRequest');
const Holiday = require('../models/Holiday');
const { dayBoundsUTC, getEffectiveWeekOffDays } = require('./attendanceProcessor.service');
const { recordAuditEvent } = require('./attendanceAudit.service');

function fail(status, code, message) {
  const err = new Error(message);
  err.statusCode = status;
  err.code = code;
  return err;
}

function toUTCDate(value) {
  const d = new Date(value);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Every UTC-midnight date from startDate to endDate inclusive. */
function eachDate(startDate, endDate) {
  const dates = [];
  for (let d = new Date(startDate); d.getTime() <= endDate.getTime(); d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(new Date(d));
  }
  return dates;
}

/** Working-day count in [startDate, endDate] — excludes the org's current
 * week-off days and holiday-calendar dates, so a leave spanning a weekend
 * doesn't over-deduct balance or double-count with WEEK_OFF/HOLIDAY. */
async function countWorkingDays(organizationId, startDate, endDate) {
  const holidays = await Holiday.find({ organizationId });
  const isHoliday = (date) => holidays.some((h) => {
    if (h.isRecurringAnnually) return h.date.getUTCMonth() === date.getUTCMonth() && h.date.getUTCDate() === date.getUTCDate();
    return h.date.getTime() === date.getTime();
  });

  let count = 0;
  for (const date of eachDate(startDate, endDate)) {
    const weekOffDays = await getEffectiveWeekOffDays(organizationId, date);
    if (weekOffDays.includes(date.getUTCDay())) continue;
    if (isHoliday(date)) continue;
    count += 1;
  }
  return count;
}

async function resolveEmployeeForUser(organizationId, userId) {
  const employee = await Employee.findOne({ organizationId, userId, deletedAt: null });
  if (!employee) throw fail(404, 'no_employee', 'No employee profile is linked to your account yet.');
  return employee;
}

// --- Leave types ---
async function listTypes(organizationId) {
  return LeaveType.find({ organizationId, isActive: true }).sort({ name: 1 });
}

async function createType(organizationId, actorUserId, { name, code, isPaid }) {
  const type = await LeaveType.create({ organizationId, name, code, isPaid: isPaid !== false, createdBy: actorUserId });
  await recordAuditEvent({ organizationId, actorUserId, action: 'leave_type.create', entityType: 'LeaveType', entityId: type._id, newValue: { name, code, isPaid } });
  return type;
}

// --- Balances ---
async function listBalances(organizationId, employeeId, year) {
  return LeaveBalance.find({ organizationId, employeeId, year }).populate('leaveTypeId', 'name code isPaid');
}

async function setBalance(organizationId, actorUserId, { employeeId, leaveTypeId, year, totalDays }) {
  const balance = await LeaveBalance.findOneAndUpdate(
    { organizationId, employeeId, leaveTypeId, year },
    { $set: { totalDays, updatedBy: actorUserId }, $setOnInsert: { usedDays: 0 } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  await recordAuditEvent({ organizationId, actorUserId, action: 'leave_balance.set', entityType: 'LeaveBalance', entityId: balance._id, newValue: { employeeId, leaveTypeId, year, totalDays } });
  return balance;
}

// --- Requests ---
async function listMyRequests(organizationId, employeeId) {
  return LeaveRequest.find({ organizationId, employeeId }).populate('leaveTypeId', 'name code').sort({ startDate: -1 });
}

async function listRequests(organizationId, { status, employeeId } = {}) {
  const q = { organizationId };
  if (status) q.status = status;
  if (employeeId) q.employeeId = employeeId;
  return LeaveRequest.find(q).populate('leaveTypeId', 'name code').populate('employeeId', 'fullName employeeCode').sort({ createdAt: -1 });
}

async function applyForLeave(organizationId, userId, { leaveTypeId, startDate, endDate, reason }) {
  const employee = await resolveEmployeeForUser(organizationId, userId);
  const start = toUTCDate(startDate);
  const end = toUTCDate(endDate);
  if (end.getTime() < start.getTime()) throw fail(422, 'invalid_range', 'endDate must be on or after startDate.');
  if (!reason || reason.trim().length < 3) throw fail(422, 'invalid_reason', 'A reason is required.');

  const leaveType = await LeaveType.findOne({ _id: leaveTypeId, organizationId, isActive: true });
  if (!leaveType) throw fail(422, 'invalid_leave_type', 'Unknown leave type.');

  const workingDays = await countWorkingDays(organizationId, start, end);
  if (workingDays === 0) throw fail(422, 'no_working_days', 'The selected range has no working days to apply leave against.');

  const year = start.getUTCFullYear();
  const balance = await LeaveBalance.findOne({ organizationId, employeeId: employee._id, leaveTypeId, year });
  const available = (balance?.totalDays || 0) - (balance?.usedDays || 0);
  if (workingDays > available) {
    throw fail(422, 'insufficient_balance', `Only ${available} day(s) available for ${leaveType.name} in ${year}.`);
  }

  const overlapping = await LeaveRequest.findOne({
    organizationId, employeeId: employee._id, status: { $in: ['PENDING', 'APPROVED'] },
    startDate: { $lte: end }, endDate: { $gte: start },
  });
  if (overlapping) throw fail(409, 'overlapping_request', 'You already have a pending or approved leave request overlapping these dates.');

  return LeaveRequest.create({
    organizationId, employeeId: employee._id, leaveTypeId, startDate: start, endDate: end, workingDays, reason: reason.trim(),
  });
}

async function cancelRequest(organizationId, userId, requestId) {
  const employee = await resolveEmployeeForUser(organizationId, userId);
  const request = await LeaveRequest.findOne({ _id: requestId, organizationId, employeeId: employee._id });
  if (!request) throw fail(404, 'not_found', 'Leave request not found.');
  if (!['PENDING', 'APPROVED'].includes(request.status)) throw fail(409, 'not_cancellable', 'Only pending or approved requests can be cancelled.');

  if (request.status === 'APPROVED') {
    await LeaveBalance.updateOne(
      { organizationId, employeeId: request.employeeId, leaveTypeId: request.leaveTypeId, year: request.startDate.getUTCFullYear() },
      { $inc: { usedDays: -request.workingDays } },
    );
  }
  request.status = 'CANCELLED';
  await request.save();
  return request;
}

async function decideRequest(organizationId, actorUserId, requestId, decision, note) {
  const request = await LeaveRequest.findOne({ _id: requestId, organizationId });
  if (!request) throw fail(404, 'not_found', 'Leave request not found.');
  if (request.status !== 'PENDING') throw fail(409, 'already_decided', 'This request has already been decided.');

  if (decision === 'APPROVED') {
    const year = request.startDate.getUTCFullYear();
    const balance = await LeaveBalance.findOne({ organizationId, employeeId: request.employeeId, leaveTypeId: request.leaveTypeId, year });
    const available = (balance?.totalDays || 0) - (balance?.usedDays || 0);
    if (request.workingDays > available) throw fail(422, 'insufficient_balance', 'Employee no longer has enough balance for this request.');
    await LeaveBalance.updateOne(
      { organizationId, employeeId: request.employeeId, leaveTypeId: request.leaveTypeId, year },
      { $inc: { usedDays: request.workingDays } },
    );
  }

  request.status = decision;
  request.decidedBy = actorUserId;
  request.decidedAt = new Date();
  request.decisionNote = note || null;
  await request.save();

  await recordAuditEvent({
    organizationId, actorUserId, action: `leave_request.${decision.toLowerCase()}`,
    entityType: 'LeaveRequest', entityId: request._id, newValue: { decision, note },
  });
  return request;
}

module.exports = {
  countWorkingDays, resolveEmployeeForUser,
  listTypes, createType,
  listBalances, setBalance,
  listMyRequests, listRequests, applyForLeave, cancelRequest, decideRequest,
};
