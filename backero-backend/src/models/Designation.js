// Designation (job title) — ported from the Attendance Tracker's
// `Designation` model. Reuses Task_Workflow's existing `Department` model
// for the department link (see models/Employee.js) rather than porting the
// source's own 13-line Department stub — Task_Workflow's Department is
// already the richer, actively-used org-unit model.
const mongoose = require('mongoose');

const designationSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  title: { type: String, required: true, trim: true },
  departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
}, { timestamps: true });

designationSchema.index({ organizationId: 1, departmentId: 1, title: 1 }, { unique: true });

module.exports = mongoose.model('Designation', designationSchema);
