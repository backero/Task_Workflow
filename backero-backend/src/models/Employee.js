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
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
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
  deletedAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

employeeSchema.index({ organizationId: 1, employeeCode: 1 }, { unique: true });
employeeSchema.index({ organizationId: 1, userId: 1 }, { unique: true, sparse: true });
employeeSchema.index({ organizationId: 1, departmentId: 1 });

module.exports = mongoose.model('Employee', employeeSchema);
