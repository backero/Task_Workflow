// Employee — ported from the Attendance Tracker's `Employee` model
// (spec §13). `category` (OFFICE|FIELD) drives the location-tracking
// policy: OFFICE employees are never location-tracked, FIELD employees
// only during an active session (see models/LocationSession.js).
// Soft-delete only (never hard-deleted, spec §13 — matches this port's
// existing soft-delete conventions elsewhere, e.g. DocumentTrash).
//
// `userId` links 1:1 to Task_Workflow's own `User` — this is the auth
// unification decision from the pivot: no second login, an Employee HR
// profile just attaches onto an existing workflow User account. A User
// with no linked Employee is unaffected (pure workflow user); an Employee
// with no linked User is a payroll-only/manual-check-in record with no
// portal access of its own.
const mongoose = require('mongoose');
const { EMPLOYEE_CATEGORY } = require('../utils/attendanceConstants');

const employeeSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  // No `default: null` — the organizationId+userId index below is sparse specifically so
  // multiple unlinked employees can coexist, but a sparse index only skips documents where
  // the field is truly absent, not ones where it's present-but-null. A schema default of
  // null would make Mongoose write an explicit null on every unlinked employee, defeating
  // the sparse index and letting only one such employee ever exist per org (confirmed live:
  // creating a second one threw E11000 on organizationId_1_userId_1).
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  employeeCode: { type: String, required: true, trim: true },
  fullName: { type: String, required: true, trim: true },
  phone: { type: String },
  departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
  designationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Designation', required: true },
  category: { type: String, enum: Object.values(EMPLOYEE_CATEGORY), required: true },
  dateOfJoining: { type: Date, required: true },
  // Payroll foundation — nullable; an employee with no salary configured is
  // simply skipped (not hard-failed) when a payroll period is generated.
  // Mutated only via PUT /attendance/payroll/config/:employeeId
  // (payroll:manage_config), never the general employee update route.
  basicMonthlySalary: { type: Number, default: null },
  // FIXED = always paid the full basicMonthlySalary regardless of attendance (freelancers/
  // retainers — e.g. this org's Anu Mithra and Kowsick ram M, confirmed by the owner).
  // ATTENDANCE_BASED (default) is the existing behavior: payroll.service.js#computeEarnings
  // deducts for absent/half days. Independent of `category` (FIELD/OFFICE), which only
  // drives location tracking and has no bearing on how pay is computed.
  payType: { type: String, enum: ['ATTENDANCE_BASED', 'FIXED'], default: 'ATTENDANCE_BASED' },
  pan: { type: String, default: null },
  location: { type: String, default: null },

  // Part-time employees commonly work different hours than the org default
  // (e.g. a 10:00-14:00 shift vs the standard 09:00-18:00) — these three are
  // nullable overrides consumed by attendanceProcessor.service.js#derive;
  // null means "use the org-wide AttendanceStatusRule default" for that key.
  employmentType: { type: String, enum: ['FULL_TIME', 'PART_TIME'], default: 'FULL_TIME' },
  shiftStartTime: { type: String, default: null },
  shiftEndTime: { type: String, default: null },
  halfDayMinHours: { type: Number, default: null },

  // Bank details for payslip generation (payslipPdf.service.js) — per-employee,
  // not per-period, since an account doesn't change every pay cycle. Settable
  // directly or filled in automatically the first time a payroll Excel import
  // (payrollImport.service.js) includes this employee's bank columns.
  bankName: { type: String, default: null },
  bankIfsc: { type: String, default: null },
  bankAccountNumber: { type: String, default: null },
  bankBranch: { type: String, default: null },
  bankAccountType: { type: String, default: null },

  photo: { type: String, default: null },
  photoPublicId: { type: String, select: false, default: null },
  deletedAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

employeeSchema.index({ organizationId: 1, employeeCode: 1 }, { unique: true });
// `sparse` on a COMPOUND index only excludes a document if every indexed field is missing —
// since organizationId is always present, sparse never actually applied here, so two unlinked
// employees in the same org collided on E11000 (confirmed live). A partial index is the
// correct tool: it only enforces uniqueness among documents where userId actually exists.
employeeSchema.index({ organizationId: 1, userId: 1 }, { unique: true, partialFilterExpression: { userId: { $exists: true } } });
employeeSchema.index({ organizationId: 1, departmentId: 1 });

module.exports = mongoose.model('Employee', employeeSchema);
