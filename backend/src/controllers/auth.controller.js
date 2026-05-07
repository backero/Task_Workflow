const User = require('../models/User');
const { requestOtp, verifyOtp } = require('../services/otp.service');
const { signAccessToken, signRefreshToken, buildTokenPayload, verifyRefreshToken } = require('../services/jwt.service');
const { log } = require('../services/activityLog.service');
const { success, created, badRequest, unauthorized, error: serverError } = require('../utils/response');
const logger = require('../utils/logger');

const sendOtp = async (req, res) => {
  const { phone } = req.body;
  try {
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];
    const { expiresAt, otp } = await requestOtp(phone, ipAddress, userAgent);

    const isDevConsole = process.env.NODE_ENV !== 'production' && process.env.SMS_PROVIDER !== 'msg91' && process.env.SMS_PROVIDER !== 'twilio';
    return success(res, { expiresAt, ...(isDevConsole && { devOtp: otp }) }, 'OTP sent successfully');
  } catch (err) {
    logger.error(`sendOtp error: ${err.message}`);
    return serverError(res, err.message);
  }
};

const verifyOtpAndLogin = async (req, res) => {
  const { phone, otp } = req.body;
  try {
    const result = await verifyOtp(phone, otp);
    if (!result.valid) return badRequest(res, result.reason);

    let user = await User.findOne({ phone });
    const isNew = !user;

    if (!user) {
      user = await User.create({ phone, name: '' });
    }

    if (!user.isActive) return unauthorized(res, 'Account is deactivated');

    user.lastLoginAt = new Date();
    await user.save();

    const payload = buildTokenPayload(user);
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    await log({
      userId: user._id,
      organizationId: user.organizationId,
      action: isNew ? 'USER_REGISTERED' : 'USER_LOGIN',
      entity: 'User',
      entityId: user._id,
      ipAddress: req.ip,
    });

    return success(res, {
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        role: user.role,
        organizationId: user.organizationId,
        isActive: user.isActive,
      },
      isNew,
    }, isNew ? 'Registration successful' : 'Login successful');
  } catch (err) {
    logger.error(`verifyOtp error: ${err.message}`);
    return serverError(res, err.message);
  }
};

const refreshTokens = async (req, res) => {
  const { refreshToken } = req.body;
  try {
    const decoded = verifyRefreshToken(refreshToken);
    const user = await User.findById(decoded.userId);
    if (!user || !user.isActive) return unauthorized(res, 'User not found or inactive');

    const payload = buildTokenPayload(user);
    const newAccessToken = signAccessToken(payload);
    const newRefreshToken = signRefreshToken(payload);

    return success(res, { accessToken: newAccessToken, refreshToken: newRefreshToken }, 'Tokens refreshed');
  } catch (err) {
    return unauthorized(res, 'Invalid or expired refresh token');
  }
};

const getMe = async (req, res) => {
  return success(res, { user: req.user }, 'Profile fetched');
};

module.exports = { sendOtp, verifyOtpAndLogin, refreshTokens, getMe };
