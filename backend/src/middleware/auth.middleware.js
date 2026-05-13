const { verifyAccessToken } = require('../services/jwt.service');
const User = require('../models/User');
const { unauthorized } = require('../utils/response');
const logger = require('../utils/logger');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return unauthorized(res, 'No token provided');
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyAccessToken(token);

    const user = await User.findById(decoded.userId).select('-__v').lean();
    if (!user) return unauthorized(res, 'User not found');
    if (!user.isActive) return unauthorized(res, 'Account is deactivated');

    req.user = user;
    req.organizationId = user.organizationId ? user.organizationId.toString() : null;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return unauthorized(res, 'Token expired');
    if (err.name === 'JsonWebTokenError') return unauthorized(res, 'Invalid token');
    logger.error(`Auth middleware error: ${err.message}`);
    return unauthorized(res, 'Authentication failed');
  }
};

module.exports = { authenticate };
