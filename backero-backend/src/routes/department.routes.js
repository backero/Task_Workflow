const router = require('express').Router();
const Department = require('../models/Department');
const { authenticate } = require('../middleware/auth.middleware');
const { orgIsolation } = require('../middleware/orgIsolation.middleware');
const { authorizeAdminOrAbove } = require('../middleware/role.middleware');
const { asyncHandler, sendSuccess, sendError } = require('../utils/helpers');

router.use(authenticate, orgIsolation);

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

module.exports = router;
