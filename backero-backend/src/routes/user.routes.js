const router = require('express').Router();
const User = require('../models/User');
const { authenticate } = require('../middleware/auth.middleware');
const { orgIsolation } = require('../middleware/orgIsolation.middleware');
const { authorizeAdminOrAbove } = require('../middleware/role.middleware');
const { asyncHandler, sendSuccess, sendError, paginate, paginateResponse, sanitizeUser } = require('../utils/helpers');
const upload = require('../middleware/upload.middleware');
const { buildTeamTemplate, importTeam } = require('../services/import.service');

router.use(authenticate, orgIsolation);

// GET /api/users/import/template  — download Excel template
router.get('/import/template', authorizeAdminOrAbove, asyncHandler(async (req, res) => {
  const wb = await buildTeamTemplate();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="backero_team_template.xlsx"');
  await wb.xlsx.write(res);
  res.end();
}));

// POST /api/users/import  — bulk import from Excel
router.post('/import', authorizeAdminOrAbove, upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) return sendError(res, 'No file uploaded.', 400);
  const results = await importTeam(req.file.buffer, req.user.organizationId);
  sendSuccess(res, results, `Import complete: ${results.imported} added, ${results.skipped} skipped`);
}));

router.get('/', asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, department, role, search, isActive } = req.query;
  const { skip } = paginate(page, limit);
  const filter = { organizationId: req.user.organizationId };
  if (department) filter.department = department;
  if (role) filter.role = role;
  if (isActive !== undefined) filter.isActive = isActive === 'true';
  if (search) filter.$or = [{ firstName: { $regex: search, $options: 'i' } }, { lastName: { $regex: search, $options: 'i' } }, { email: { $regex: search, $options: 'i' } }];

  const [users, total] = await Promise.all([
    User.find(filter).select('-password -refreshToken').sort({ firstName: 1 }).skip(skip).limit(parseInt(limit)),
    User.countDocuments(filter),
  ]);
  sendSuccess(res, paginateResponse(users, total, page, limit));
}));

router.post('/', authorizeAdminOrAbove, asyncHandler(async (req, res) => {
  const { firstName, lastName, phone, role, department, designation, reportsTo } = req.body;
  if (!phone) return sendError(res, 'Phone number is required.', 400);

  const existingPhone = await User.findOne({ organizationId: req.user.organizationId, phone: phone.trim() });
  if (existingPhone) return sendError(res, 'A user with this phone number already exists in your organization.', 409);

  // Email and password are not used for login (OTP-only), generate placeholders
  const email = `${phone.replace(/\D/g, '')}@backero.internal`;
  const password = require('crypto').randomBytes(16).toString('hex');

  const user = await User.create({
    organizationId: req.user.organizationId,
    firstName, lastName, email, phone: phone.trim(), password,
    role: role || 'member', department, designation, reportsTo,
    isVerified: true,
    createdBy: req.user._id,
  });
  sendSuccess(res, { user: sanitizeUser(user) }, 'User created', 201);
}));

router.patch('/:id/activate', authorizeAdminOrAbove, asyncHandler(async (req, res) => {
  const user = await User.findOneAndUpdate(
    { _id: req.params.id, organizationId: req.user.organizationId },
    { isActive: true, updatedBy: req.user._id },
    { new: true }
  );
  if (!user) return sendError(res, 'User not found.', 404);
  sendSuccess(res, {}, 'User activated');
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const user = await User.findOne({ _id: req.params.id, organizationId: req.user.organizationId }).select('-password -refreshToken');
  if (!user) return sendError(res, 'User not found.', 404);
  sendSuccess(res, { user });
}));

router.put('/:id', authorizeAdminOrAbove, asyncHandler(async (req, res) => {
  const { password, refreshToken, organizationId, ...updates } = req.body;
  const user = await User.findOneAndUpdate(
    { _id: req.params.id, organizationId: req.user.organizationId },
    { ...updates, updatedBy: req.user._id },
    { new: true, runValidators: true }
  ).select('-password -refreshToken');
  if (!user) return sendError(res, 'User not found.', 404);
  sendSuccess(res, { user }, 'User updated');
}));

router.patch('/:id/deactivate', authorizeAdminOrAbove, asyncHandler(async (req, res) => {
  const user = await User.findOneAndUpdate(
    { _id: req.params.id, organizationId: req.user.organizationId },
    { isActive: false, updatedBy: req.user._id },
    { new: true }
  );
  if (!user) return sendError(res, 'User not found.', 404);
  sendSuccess(res, {}, 'User deactivated');
}));

router.patch('/me/profile', asyncHandler(async (req, res) => {
  const { password, refreshToken, role, organizationId, ...updates } = req.body;
  const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true }).select('-password -refreshToken');
  sendSuccess(res, { user }, 'Profile updated');
}));

module.exports = router;
