const User = require('../models/User');
const Task = require('../models/Task');
const { success, created, notFound, badRequest, forbidden } = require('../utils/response');
const { log } = require('../services/activityLog.service');
const { emitToOrg } = require('../sockets/index');
const { ROLE_HIERARCHY, ROLES } = require('../utils/constants');
const logger = require('../utils/logger');

const SAFE_SELECT = 'name phone email role department designation avatar joiningDate isActive lastLoginAt createdAt createdBy';

const listEmployees = async (req, res) => {
  const orgId = req.user.organizationId;
  const { search, department, role, status, page = 1, limit = 15 } = req.query;
  try {
    const filter = { organizationId: orgId };

    if (search) {
      const rx = { $regex: search, $options: 'i' };
      filter.$or = [{ name: rx }, { phone: rx }, { email: rx }, { designation: rx }];
    }
    if (department) filter.department = { $regex: `^${department}$`, $options: 'i' };
    if (role)       filter.role       = role;
    if (status === 'active')   filter.isActive = true;
    if (status === 'inactive') filter.isActive = false;

    const skip = (Number(page) - 1) * Number(limit);

    const [employees, total] = await Promise.all([
      User.find(filter)
        .select(SAFE_SELECT)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      User.countDocuments(filter),
    ]);

    return success(res, {
      employees,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
    });
  } catch (err) {
    logger.error(`listEmployees: ${err.message}`);
    throw err;
  }
};

const getEmployee = async (req, res) => {
  const orgId = req.user.organizationId;
  try {
    const employee = await User.findOne({ _id: req.params.id, organizationId: orgId })
      .select(SAFE_SELECT)
      .lean();
    if (!employee) return notFound(res, 'Employee not found');

    const taskStats = await Task.aggregate([
      { $match: { organizationId: orgId, assigneeId: employee._id } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    const byStatus = taskStats.reduce((a, s) => { a[s._id] = s.count; return a; }, {});
    const total = Object.values(byStatus).reduce((a, b) => a + b, 0);

    const recentTasks = await Task.find({ organizationId: orgId, assigneeId: employee._id })
      .sort({ updatedAt: -1 })
      .limit(5)
      .select('title status priority dueDate projectId')
      .populate('projectId', 'title color')
      .lean();

    return success(res, {
      employee,
      taskStats: {
        total,
        todo:       byStatus.TODO        || 0,
        inProgress: byStatus.IN_PROGRESS || 0,
        inReview:   byStatus.IN_REVIEW   || 0,
        completed:  byStatus.DONE        || 0,
      },
      recentTasks,
    });
  } catch (err) {
    logger.error(`getEmployee: ${err.message}`);
    throw err;
  }
};

const createEmployee = async (req, res) => {
  const orgId = req.user.organizationId;
  const { phone, name, email, role, department, designation, joiningDate } = req.body;
  try {
    let user = await User.findOne({ phone });

    if (user) {
      if (user.organizationId && user.organizationId.toString() !== orgId.toString()) {
        return badRequest(res, 'This phone number belongs to a user in another organization');
      }
      if (user.organizationId && user.organizationId.toString() === orgId.toString()) {
        return badRequest(res, 'An employee with this phone number already exists in your organization');
      }
      // Unattached user → assign to this org
      user = await User.findByIdAndUpdate(
        user._id,
        {
          organizationId: orgId,
          role:        role        || ROLES.EMPLOYEE,
          name:        name        || user.name,
          email:       email       || user.email,
          department:  department  || null,
          designation: designation || null,
          joiningDate: joiningDate || new Date(),
          isActive:    true,
          createdBy:   req.user._id,
        },
        { new: true }
      ).select(SAFE_SELECT);
    } else {
      user = await User.create({
        phone, name: name || '', email: email || null,
        role:        role        || ROLES.EMPLOYEE,
        department:  department  || null,
        designation: designation || null,
        joiningDate: joiningDate || new Date(),
        organizationId: orgId,
        createdBy:   req.user._id,
        isActive:    true,
      });
    }

    await log({ userId: req.user._id, organizationId: orgId, action: 'EMPLOYEE_CREATED', entity: 'User', entityId: user._id });
    emitToOrg(orgId.toString(), 'employee:created', { employee: user });
    emitToOrg(orgId.toString(), 'dashboard:stats_updated', {});

    return created(res, { employee: user }, 'Employee added successfully');
  } catch (err) {
    logger.error(`createEmployee: ${err.message}`);
    if (err.code === 11000) return badRequest(res, 'Phone number already registered');
    throw err;
  }
};

const updateEmployee = async (req, res) => {
  const orgId = req.user.organizationId;
  const { id } = req.params;
  const { name, email, role, department, designation, joiningDate } = req.body;
  try {
    if (id === req.user._id.toString() && role && req.user.role !== ROLES.ORG_ADMIN) {
      return forbidden(res, 'You cannot change your own role');
    }
    if (role && (role === ROLES.ORG_ADMIN || role === ROLES.SUPER_ADMIN)) {
      return forbidden(res, 'Cannot assign this role through employee management');
    }
    if (role) {
      const callerLevel = ROLE_HIERARCHY[req.user.role] || 0;
      if (ROLE_HIERARCHY[role] >= callerLevel) {
        return forbidden(res, 'Cannot assign a role equal to or higher than your own');
      }
    }

    const updates = {};
    if (name        !== undefined) updates.name        = name;
    if (email       !== undefined) updates.email       = email;
    if (role        !== undefined) updates.role        = role;
    if (department  !== undefined) updates.department  = department;
    if (designation !== undefined) updates.designation = designation;
    if (joiningDate !== undefined) updates.joiningDate = joiningDate;

    const employee = await User.findOneAndUpdate(
      { _id: id, organizationId: orgId },
      { $set: updates },
      { new: true, runValidators: true }
    ).select(SAFE_SELECT);

    if (!employee) return notFound(res, 'Employee not found');

    await log({ userId: req.user._id, organizationId: orgId, action: 'EMPLOYEE_UPDATED', entity: 'User', entityId: employee._id });
    emitToOrg(orgId.toString(), 'employee:updated', { employee });

    return success(res, { employee }, 'Employee updated');
  } catch (err) {
    logger.error(`updateEmployee: ${err.message}`);
    throw err;
  }
};

const toggleEmployeeStatus = async (req, res) => {
  const orgId = req.user.organizationId;
  const { id } = req.params;
  try {
    if (id === req.user._id.toString()) {
      return forbidden(res, 'Cannot change your own status');
    }
    const employee = await User.findOne({ _id: id, organizationId: orgId });
    if (!employee) return notFound(res, 'Employee not found');

    employee.isActive = !employee.isActive;
    await employee.save();

    const action = employee.isActive ? 'EMPLOYEE_ACTIVATED' : 'EMPLOYEE_DEACTIVATED';
    await log({ userId: req.user._id, organizationId: orgId, action, entity: 'User', entityId: employee._id });
    emitToOrg(orgId.toString(), 'employee:status_changed', { employeeId: id, isActive: employee.isActive });
    emitToOrg(orgId.toString(), 'dashboard:stats_updated', {});

    return success(res, { employee }, `Employee ${employee.isActive ? 'activated' : 'deactivated'}`);
  } catch (err) {
    logger.error(`toggleEmployeeStatus: ${err.message}`);
    throw err;
  }
};

const deleteEmployee = async (req, res) => {
  const orgId = req.user.organizationId;
  const { id } = req.params;
  try {
    if (id === req.user._id.toString()) {
      return forbidden(res, 'Cannot remove yourself');
    }
    const employee = await User.findOneAndUpdate(
      { _id: id, organizationId: orgId },
      { isActive: false, organizationId: null },
      { new: true }
    );
    if (!employee) return notFound(res, 'Employee not found');

    await log({ userId: req.user._id, organizationId: orgId, action: 'EMPLOYEE_DELETED', entity: 'User', entityId: employee._id });
    emitToOrg(orgId.toString(), 'employee:deleted', { employeeId: id });
    emitToOrg(orgId.toString(), 'dashboard:stats_updated', {});

    return success(res, {}, 'Employee removed from organization');
  } catch (err) {
    logger.error(`deleteEmployee: ${err.message}`);
    throw err;
  }
};

const getDepartments = async (req, res) => {
  const orgId = req.user.organizationId;
  try {
    const departments = await User.distinct('department', {
      organizationId: orgId,
      department: { $ne: null, $exists: true },
    });
    return success(res, { departments: departments.filter(Boolean).sort() });
  } catch (err) {
    logger.error(`getDepartments: ${err.message}`);
    throw err;
  }
};

module.exports = {
  listEmployees, getEmployee, createEmployee,
  updateEmployee, toggleEmployeeStatus, deleteEmployee, getDepartments,
};
