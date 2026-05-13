const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const Organization = require('../models/Organization');
const ActivityLog = require('../models/ActivityLog');
const { asyncHandler, sendSuccess, sendError, sanitizeUser, generateOTP } = require('../utils/helpers');
const { ROLES } = require('../utils/constants');
const logger = require('../utils/logger');
const slugify = require('slugify');

const generateTokens = (userId, orgId, role) => {
  const accessToken = jwt.sign(
    { id: userId, organizationId: orgId, role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
  );
  const refreshToken = jwt.sign(
    { id: userId, organizationId: orgId },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
  return { accessToken, refreshToken };
};

const setRefreshCookie = (res, token) => {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

// POST /api/auth/register (Register org + first admin)
exports.register = asyncHandler(async (req, res) => {
  const { organizationName, firstName, lastName, email, phone, password } = req.body;

  const existingOrg = await Organization.findOne({ 'email': email.toLowerCase() });
  if (existingOrg) return sendError(res, 'Organization with this email already exists.', 409);

  const slug = slugify(organizationName, { lower: true, strict: true }) + '-' + Date.now();

  const org = await Organization.create({
    name: organizationName,
    slug,
    email: email.toLowerCase(),
    phone,
    departments: ['Marketing', 'Marketplace', 'Sales', 'Production', 'R&D', 'Operations', 'Accounts & Finance'],
  });

  const user = await User.create({
    organizationId: org._id,
    firstName,
    lastName,
    email: email.toLowerCase(),
    phone,
    password,
    role: ROLES.ADMIN,
    isVerified: true,
  });

  org.createdBy = user._id;
  await org.save();

  const { accessToken, refreshToken } = generateTokens(user._id, org._id, user.role);
  user.refreshToken = refreshToken;
  user.lastLogin = new Date();
  await user.save({ validateBeforeSave: false });

  setRefreshCookie(res, refreshToken);

  await ActivityLog.create({
    organizationId: org._id,
    performedBy: user._id,
    action: 'Organization registered',
    module: 'auth',
    description: `New organization "${organizationName}" registered`,
  });

  sendSuccess(res, { accessToken, user: sanitizeUser(user), organization: org }, 'Registration successful', 201);
});

// POST /api/auth/login
exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email: email.toLowerCase() })
    .select('+password +refreshToken')
    .populate('organizationId', 'name logo isActive plan');

  if (!user) return sendError(res, 'Invalid credentials.', 401);
  if (!user.organizationId?.isActive) return sendError(res, 'Organization account is suspended.', 403);
  if (!user.isActive) return sendError(res, 'Your account has been deactivated.', 403);

  const isMatch = await user.matchPassword(password);
  if (!isMatch) return sendError(res, 'Invalid credentials.', 401);

  const { accessToken, refreshToken } = generateTokens(user._id, user.organizationId._id, user.role);
  user.refreshToken = refreshToken;
  user.lastLogin = new Date();
  user.lastActive = new Date();
  await user.save({ validateBeforeSave: false });

  setRefreshCookie(res, refreshToken);

  await ActivityLog.create({
    organizationId: user.organizationId._id,
    performedBy: user._id,
    action: 'User login',
    module: 'auth',
    ipAddress: req.ip,
  });

  sendSuccess(res, {
    accessToken,
    user: sanitizeUser(user),
    organization: user.organizationId,
  }, 'Login successful');
});

// POST /api/auth/refresh
exports.refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.refreshToken || req.body.refreshToken;
  if (!token) return sendError(res, 'Refresh token required.', 401);

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  } catch {
    return sendError(res, 'Invalid or expired refresh token.', 401);
  }

  const user = await User.findById(decoded.id).select('+refreshToken');
  if (!user || user.refreshToken !== token) return sendError(res, 'Invalid refresh token.', 401);

  const { accessToken, refreshToken: newRefresh } = generateTokens(user._id, user.organizationId, user.role);
  user.refreshToken = newRefresh;
  await user.save({ validateBeforeSave: false });

  setRefreshCookie(res, newRefresh);
  sendSuccess(res, { accessToken }, 'Token refreshed');
});

// POST /api/auth/logout
exports.logout = asyncHandler(async (req, res) => {
  if (req.user) {
    await User.findByIdAndUpdate(req.user._id, { $unset: { refreshToken: 1 } });
  }
  res.clearCookie('refreshToken');
  sendSuccess(res, {}, 'Logged out successfully');
});

// POST /api/auth/send-login-otp  (public — no auth required)
exports.sendLoginOTP = asyncHandler(async (req, res) => {
  const { phone } = req.body;
  if (!phone) return sendError(res, 'Phone number is required.', 400);

  const digits = phone.replace(/\D/g, '').slice(-10);
  const user = await User.findOne({ phone: new RegExp(digits + '$') }).select('+otp +otpExpiry');
  if (!user) return sendError(res, 'No account found with this mobile number.', 404);
  if (!user.isActive) return sendError(res, 'Your account has been deactivated.', 403);

  // Prevent spam: block if a fresh OTP was issued within last 60s
  if (user.otpExpiry && user.otpExpiry > new Date(Date.now() + 9 * 60 * 1000)) {
    return sendError(res, 'OTP already sent. Please wait 60 seconds before retrying.', 429);
  }

  const otp = generateOTP(6);
  const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex');

  await User.findByIdAndUpdate(user._id, {
    otp: hashedOtp,
    otpExpiry: new Date(Date.now() + 10 * 60 * 1000),
  });

  logger.info(`[OTP] ${phone} → ${otp}`);

  // In dev mode return OTP directly so it can be tested without SMS/WhatsApp
  const devPayload = process.env.NODE_ENV !== 'production' ? { _devOtp: otp } : {};
  sendSuccess(res, devPayload, 'OTP sent to your mobile number');
});

// POST /api/auth/verify-login-otp  (public — no auth required)
exports.verifyLoginOTP = asyncHandler(async (req, res) => {
  const { phone, otp } = req.body;
  if (!phone || !otp) return sendError(res, 'Phone and OTP are required.', 400);

  const digits = phone.replace(/\D/g, '').slice(-10);
  const hashedOtp = crypto.createHash('sha256').update(String(otp)).digest('hex');

  const user = await User.findOne({
    phone: new RegExp(digits + '$'),
    otp: hashedOtp,
    otpExpiry: { $gt: Date.now() },
  }).select('+otp +otpExpiry +refreshToken').populate('organizationId', 'name logo isActive plan');

  if (!user) return sendError(res, 'Invalid or expired OTP.', 400);
  if (!user.organizationId?.isActive) return sendError(res, 'Organization account is suspended.', 403);

  const { accessToken, refreshToken } = generateTokens(user._id, user.organizationId._id, user.role);
  user.otp = undefined;
  user.otpExpiry = undefined;
  user.refreshToken = refreshToken;
  user.lastLogin = new Date();
  user.lastActive = new Date();
  await user.save({ validateBeforeSave: false });

  setRefreshCookie(res, refreshToken);

  await ActivityLog.create({
    organizationId: user.organizationId._id,
    performedBy: user._id,
    action: 'User login via OTP',
    module: 'auth',
    ipAddress: req.ip,
  });

  sendSuccess(res, {
    accessToken,
    user: sanitizeUser(user),
    organization: user.organizationId,
  }, 'Login successful');
});

// POST /api/auth/send-otp
exports.sendOTP = asyncHandler(async (req, res) => {
  const { phone } = req.body;
  const user = await User.findOne({ organizationId: req.user.organizationId, phone });
  if (!user) return sendError(res, 'User not found.', 404);

  const otp = generateOTP(6);
  const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex');

  await User.findByIdAndUpdate(user._id, {
    otp: hashedOtp,
    otpExpiry: new Date(Date.now() + 10 * 60 * 1000),
  });

  // In production: send via WhatsApp
  logger.info(`OTP for ${phone}: ${otp}`);

  sendSuccess(res, { message: 'OTP sent via WhatsApp' }, 'OTP sent successfully');
});

// POST /api/auth/verify-otp
exports.verifyOTP = asyncHandler(async (req, res) => {
  const { phone, otp } = req.body;
  const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex');

  const user = await User.findOne({
    organizationId: req.user.organizationId,
    phone,
    otp: hashedOtp,
    otpExpiry: { $gt: Date.now() },
  }).select('+otp +otpExpiry');

  if (!user) return sendError(res, 'Invalid or expired OTP.', 400);

  await User.findByIdAndUpdate(user._id, {
    $unset: { otp: 1, otpExpiry: 1 },
    whatsappVerified: true,
    isVerified: true,
  });

  sendSuccess(res, {}, 'OTP verified successfully');
});

// GET /api/auth/me
exports.getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).populate('organizationId', 'name logo settings');
  sendSuccess(res, { user: sanitizeUser(user), organization: user.organizationId });
});

// PATCH /api/auth/change-password
exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user._id).select('+password');
  const isMatch = await user.matchPassword(currentPassword);
  if (!isMatch) return sendError(res, 'Current password is incorrect.', 400);

  user.password = newPassword;
  await user.save();

  sendSuccess(res, {}, 'Password changed successfully');
});
