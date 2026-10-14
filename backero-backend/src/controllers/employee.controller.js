// Employee controller — ported from the Attendance Tracker's
// app/modules/employees/service.py + router.py. Department reference
// validation reuses Task_Workflow's own Department model; Designation
// must belong to the given Department (same source rule).
const Employee = require('../models/Employee');
const Designation = require('../models/Designation');
const Department = require('../models/Department');
const User = require('../models/User');
const { asyncHandler, sendSuccess, sendError, paginate, paginateResponse } = require('../utils/helpers');
const { ATTENDANCE_PERMISSIONS } = require('../utils/attendanceConstants');
const { ROLE_HIERARCHY } = require('../utils/constants');

function fail(status, message) {
  const err = new Error(message);
  err.statusCode = status;
  return err;
}

async function toResponse(employee) {
  let email = null;
  if (employee.userId) {
    const user = await User.findById(employee.userId).select('email').lean();
    email = user ? user.email : null;
  }
  const obj = employee.toObject ? employee.toObject() : employee;
  return { ...obj, email };
}

async function validateReferences(organizationId, departmentId, designationId) {
  const department = await Department.findOne({ _id: departmentId, organizationId });
  if (!department) throw fail(422, 'Department not found.');
  const designation = await Designation.findOne({ _id: designationId, organizationId });
  if (!designation || String(designation.departmentId) !== String(departmentId)) {
    throw fail(422, 'Designation not found, or does not belong to the given department.');
  }
}

const SORT_FIELDS = {
  full_name: 'fullName',
  employee_code: 'employeeCode',
  date_of_joining: 'dateOfJoining',
  created_at: 'createdAt',
};

function resolveSort(sort) {
  if (!sort) return { fullName: 1 };
  const descending = sort.startsWith('-');
  const key = sort.replace(/^-/, '');
  const field = SORT_FIELDS[key] || 'fullName';
  return { [field]: descending ? -1 : 1 };
}

exports.getMyProfile = asyncHandler(async (req, res) => {
  const employee = await Employee.findOne({ userId: req.user._id, deletedAt: null });
  if (!employee) return sendError(res, 'No employee profile is linked to your account yet.', 404);
  sendSuccess(res, { employee: await toResponse(employee) });
});

exports.updateMyProfile = asyncHandler(async (req, res) => {
  const employee = await Employee.findOne({ userId: req.user._id, deletedAt: null });
  if (!employee) return sendError(res, 'No employee profile is linked to your account yet.', 404);
  if (req.body.phone !== undefined) employee.phone = req.body.phone;
  employee.updatedBy = req.user._id;
  await employee.save();
  sendSuccess(res, { employee: await toResponse(employee) });
});

exports.list = asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const { department_id: departmentId, category, search, sort } = req.query;
  const { page = 1, limit = 20 } = req.query;
  const q = { organizationId: orgId, deletedAt: null };
  if (departmentId) q.departmentId = departmentId;
  if (category) q.category = category;
  if (search) {
    q.$or = [{ fullName: new RegExp(search, 'i') }, { employeeCode: new RegExp(search, 'i') }];
  }

  const total = await Employee.countDocuments(q);
  const { skip, limit: lim } = paginate(page, limit);
  const rows = await Employee.find(q).sort(resolveSort(sort)).skip(skip).limit(lim);
  const items = await Promise.all(rows.map(toResponse));
  sendSuccess(res, paginateResponse(items, total, page, limit));
});

exports.getById = asyncHandler(async (req, res) => {
  const employee = await Employee.findOne({ _id: req.params.id, organizationId: req.user.organizationId, deletedAt: null });
  if (!employee) return sendError(res, 'Employee not found.', 404);

  const isOwnRecord = employee.userId && String(employee.userId) === String(req.user._id);
  if (!isOwnRecord) {
    const permissions = req.user.permissions || [];
    const level = ROLE_HIERARCHY[req.user.role] || 0;
    const allowed = level >= ROLE_HIERARCHY['admin'] || permissions.includes(ATTENDANCE_PERMISSIONS.EMPLOYEE_READ);
    // 404, not 403 — don't confirm the record exists to a caller with
    // neither ownership nor permission (matches the source's spec §17).
    if (!allowed) return sendError(res, 'Employee not found.', 404);
  }

  sendSuccess(res, { employee: await toResponse(employee) });
});

exports.create = asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const { employee_code: employeeCode, full_name: fullName, phone, department_id: departmentId,
    designation_id: designationId, category, date_of_joining: dateOfJoining, user_id: userId } = req.body;

  if (!employeeCode || !fullName || !departmentId || !designationId || !category || !dateOfJoining) {
    return sendError(res, 'employee_code, full_name, department_id, designation_id, category, and date_of_joining are required.', 422);
  }
  await validateReferences(orgId, departmentId, designationId);

  const existingCode = await Employee.findOne({ organizationId: orgId, employeeCode });
  if (existingCode) return sendError(res, `Employee code '${employeeCode}' is already in use.`, 409);

  if (userId) {
    const user = await User.findOne({ _id: userId, organizationId: orgId });
    if (!user) return sendError(res, 'The given user_id does not exist.', 422);
    const alreadyLinked = await Employee.findOne({ organizationId: orgId, userId, deletedAt: null });
    if (alreadyLinked) return sendError(res, 'This user is already linked to another employee.', 409);
  }

  const employee = await Employee.create({
    organizationId: orgId,
    employeeCode,
    fullName,
    phone,
    departmentId,
    designationId,
    category,
    dateOfJoining,
    userId: userId || null,
    createdBy: req.user._id,
  });
  sendSuccess(res, { employee: await toResponse(employee) }, 'Employee created', 201);
});

exports.update = asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const employee = await Employee.findOne({ _id: req.params.id, organizationId: orgId, deletedAt: null });
  if (!employee) return sendError(res, 'Employee not found.', 404);

  const body = req.body;
  const nextDepartmentId = body.department_id !== undefined ? body.department_id : employee.departmentId;
  const nextDesignationId = body.designation_id !== undefined ? body.designation_id : employee.designationId;
  if (body.department_id !== undefined || body.designation_id !== undefined) {
    await validateReferences(orgId, nextDepartmentId, nextDesignationId);
  }

  if (body.user_id !== undefined && body.user_id !== null) {
    const user = await User.findOne({ _id: body.user_id, organizationId: orgId });
    if (!user) return sendError(res, 'The given user_id does not exist.', 422);
    const alreadyLinked = await Employee.findOne({
      organizationId: orgId, userId: body.user_id, deletedAt: null, _id: { $ne: employee._id },
    });
    if (alreadyLinked) return sendError(res, 'This user is already linked to another employee.', 409);
  }

  if (body.full_name !== undefined) employee.fullName = body.full_name;
  if (body.phone !== undefined) employee.phone = body.phone;
  if (body.department_id !== undefined) employee.departmentId = body.department_id;
  if (body.designation_id !== undefined) employee.designationId = body.designation_id;
  if (body.category !== undefined) employee.category = body.category;
  if (body.user_id !== undefined) employee.userId = body.user_id;
  employee.updatedBy = req.user._id;

  await employee.save();
  sendSuccess(res, { employee: await toResponse(employee) }, 'Employee updated');
});
