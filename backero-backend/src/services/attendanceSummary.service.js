// The ONLY public, DTO-only integration point the Payroll module is
// allowed to use — ported from attendance/service.py#get_attendance_summary.
// Payroll deliberately never imports the Attendance model or any other
// attendance internals directly (mirrors the source's Phase 9 DoD: "payroll
// module has zero direct imports of attendance internals").
const Attendance = require('../models/Attendance');

const PRESENT_LIKE = ['PRESENT', 'LATE'];
const ABSENT_LIKE = ['ABSENT', 'MISSING_PUNCH', 'INCOMPLETE'];
const PAID_LEAVE_LIKE = ['ON_LEAVE', 'HOLIDAY', 'WEEK_OFF'];

/**
 * @returns {Promise<{employeeId, periodStart, periodEnd, presentDays, absentDays, halfDays, paidLeaveDays, totalDays}>}
 */
async function getAttendanceSummary(organizationId, employeeId, { periodStart, periodEnd }) {
  const rows = await Attendance.find({
    organizationId, employeeId, attendanceDate: { $gte: periodStart, $lte: periodEnd },
  });

  const presentDays = rows.filter((r) => PRESENT_LIKE.includes(r.status)).length;
  const absentDays = rows.filter((r) => ABSENT_LIKE.includes(r.status)).length;
  const halfDays = rows.filter((r) => r.status === 'HALF_DAY').length;
  const paidLeaveDays = rows.filter((r) => PAID_LEAVE_LIKE.includes(r.status)).length;

  return {
    employeeId, periodStart, periodEnd, presentDays, absentDays, halfDays, paidLeaveDays, totalDays: rows.length,
  };
}

module.exports = { getAttendanceSummary };
