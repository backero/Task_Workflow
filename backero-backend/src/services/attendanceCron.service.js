// Daily attendance derivation — makes automatic WEEK_OFF/HOLIDAY status
// actually visible. Attendance rows are otherwise only created reactively
// when a punch/correction happens (see attendanceProcessor.service.js#process);
// with zero punches on a week-off/holiday day nothing would ever exist to
// *show* WEEK_OFF/HOLIDAY without this. Runs forward only — does not
// backfill already-elapsed historical days.
const cron = require('node-cron');
const Employee = require('../models/Employee');
const processor = require('./attendanceProcessor.service');
const logger = require('../utils/logger');

const startAttendanceCron = (io) => {
  // 00:30 UTC daily — just after the UTC calendar day rolls over (all
  // attendance date math in this backend is UTC-only by design).
  cron.schedule('30 0 * * *', () => {
    runDailyAttendanceDerivation(io).catch((err) => logger.error(`[AttendanceCron] ${err.message}`));
  });
  logger.info('[AttendanceCron] Daily attendance derivation scheduled (00:30 UTC)');
};

const runDailyAttendanceDerivation = async (io) => {
  const now = new Date();
  const yesterdayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));

  const employees = await Employee.find({ deletedAt: null }).select('_id organizationId');
  let processed = 0;
  for (const employee of employees) {
    try {
      await processor.process(employee.organizationId, employee._id, yesterdayUTC, { io });
      processed += 1;
    } catch (err) {
      logger.error(`[AttendanceCron] failed for employee ${employee._id}: ${err.message}`);
    }
  }
  logger.info(`[AttendanceCron] Derived attendance for ${processed}/${employees.length} employee(s) for ${yesterdayUTC.toISOString().slice(0, 10)}`);
};

module.exports = { startAttendanceCron, runDailyAttendanceDerivation };
