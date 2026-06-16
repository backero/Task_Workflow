const router = require('express').Router();
const Department = require('../models/Department');
const Task = require('../models/Task');
const { authenticate } = require('../middleware/auth.middleware');
const { orgIsolation } = require('../middleware/orgIsolation.middleware');
const { authorizeAdminOrAbove } = require('../middleware/role.middleware');
const { asyncHandler, sendSuccess, sendError } = require('../utils/helpers');

const DEPT_COLORS = {
  'Marketing': '#9333ea', 'Marketplace': '#f97316', 'Sales': '#16a34a',
  'Production': '#2563eb', 'R&D': '#0891b2', 'Operations': '#4f46e5',
  'Accounts & Finance': '#059669', 'HR': '#d97706', 'Management': '#475569',
};

router.use(authenticate, orgIsolation);

// POST /api/departments/seed — auto-create departments from existing task department strings
router.post('/seed', authorizeAdminOrAbove, asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const names = await Task.distinct('department', { organizationId: orgId, department: { $exists: true, $ne: '' } });
  let created = 0, skipped = 0;
  for (const name of names) {
    if (!name) continue;
    const exists = await Department.findOne({ organizationId: orgId, name });
    if (exists) { skipped++; continue; }
    const code = name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().substring(0, 6);
    await Department.create({
      organizationId: orgId,
      name,
      code: code || 'DEPT',
      color: DEPT_COLORS[name] || '#3b82f6',
      createdBy: req.user._id,
    });
    created++;
  }
  sendSuccess(res, { created, skipped, total: names.length }, `${created} departments created, ${skipped} already existed`);
}));

router.get('/', asyncHandler(async (req, res) => {
  const depts = await Department.find({ organizationId: req.user.organizationId }).populate('head', 'firstName lastName avatar');
  sendSuccess(res, { departments: depts });
}));

router.post('/', authorizeAdminOrAbove, asyncHandler(async (req, res) => {
  const dept = await Department.create({ ...req.body, organizationId: req.user.organizationId, createdBy: req.user._id });
  sendSuccess(res, { department: dept }, 'Department created', 201);
}));

router.put('/:id', authorizeAdminOrAbove, asyncHandler(async (req, res) => {
  const dept = await Department.findOneAndUpdate(
    { _id: req.params.id, organizationId: req.user.organizationId },
    { ...req.body, updatedBy: req.user._id },
    { new: true }
  );
  if (!dept) return sendError(res, 'Department not found.', 404);
  sendSuccess(res, { department: dept }, 'Department updated');
}));

router.delete('/:id', authorizeAdminOrAbove, asyncHandler(async (req, res) => {
  const dept = await Department.findOneAndDelete({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!dept) return sendError(res, 'Department not found.', 404);
  sendSuccess(res, {}, 'Department deleted');
}));

module.exports = router;
