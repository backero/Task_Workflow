const crypto = require('crypto');
const mongoose = require('mongoose');
const Organization = require('../models/Organization');
const { sendError } = require('../utils/helpers');

// SHA-256 rather than bcrypt: this is a high-entropy machine-to-machine
// key (not a user password), and bcrypt silently truncates input past 72
// bytes — our "<orgId>.<64 hex char secret>" key is longer than that.
const hashApiKey = (key) => crypto.createHash('sha256').update(key).digest('hex');

// Authenticates inbound requests from external integrations (e.g. the social
// media automation app) using a per-organization API key instead of a JWT.
// Key format is "<organizationId>.<random secret>" so the org can be looked
// up before the hash comparison.
const authenticateApiKey = async (req, res, next) => {
  try {
    const key = req.headers['x-backero-api-key'];
    if (!key || !key.includes('.')) return sendError(res, 'Access denied. No API key provided.', 401);

    const [orgId] = key.split('.');
    if (!mongoose.isValidObjectId(orgId)) return sendError(res, 'Invalid API key.', 401);

    const org = await Organization.findById(orgId).select('+socialAutomation.apiKeyHash');
    if (!org || !org.isActive || !org.socialAutomation?.apiKeyHash) {
      return sendError(res, 'Invalid API key.', 401);
    }

    const presented = Buffer.from(hashApiKey(key));
    const stored = Buffer.from(org.socialAutomation.apiKeyHash);
    if (presented.length !== stored.length || !crypto.timingSafeEqual(presented, stored)) {
      return sendError(res, 'Invalid API key.', 401);
    }

    req.organizationId = org._id;
    req.organization = org;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { authenticateApiKey, hashApiKey };
