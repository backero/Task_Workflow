const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { sendError } = require('../utils/helpers');

const authenticate = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }

    if (!token) return sendError(res, 'Access denied. No token provided.', 401);

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password -refreshToken -otp -otpExpiry');

    if (!user) return sendError(res, 'User not found.', 401);
    if (!user.isActive) return sendError(res, 'Account is deactivated. Contact your administrator.', 403);

    req.user = user;
    req.userId = user._id;
    req.organizationId = user.organizationId;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') return sendError(res, 'Token expired. Please refresh.', 401);
    if (error.name === 'JsonWebTokenError') return sendError(res, 'Invalid token.', 401);
    next(error);
  }
};

const optionalAuth = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id).select('-password -refreshToken');
    }
    next();
  } catch {
    next();
  }
};

module.exports = { authenticate, optionalAuth };
