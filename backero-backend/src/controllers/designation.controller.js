// Designation controller — ported from the Attendance Tracker's designation
// endpoints (bundled into app/modules/departments/router.py in the source).
const Designation = require('../models/Designation');
const Department = require('../models/Department');
const { asyncHandler, sendSuccess, sendError } = require('../utils/helpers');

exports.list = asyncHandler(async (req, res) => {
  const q = { organizationId: req.user.organizationId };
  if (req.query.department_id) q.departmentId = req.query.department_id;
  const designations = await Designation.find(q).sort({ title: 1 });
  sendSuccess(res, { designations });
});

exports.create = asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const { title, department_id: departmentId } = req.body;
  if (!title || !departmentId) return sendError(res, 'title and department_id are required.', 422);

  const department = await Department.findOne({ _id: departmentId, organizationId: orgId });
  if (!department) return sendError(res, 'Department not found.', 422);

  const existing = await Designation.findOne({ organizationId: orgId, departmentId, title });
  if (existing) return sendError(res, `Designation '${title}' already exists in this department.`, 409);

  const designation = await Designation.create({ organizationId: orgId, title, departmentId });
  sendSuccess(res, { designation }, 'Designation created', 201);
});
