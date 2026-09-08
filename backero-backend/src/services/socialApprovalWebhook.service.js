const axios = require('axios');
const crypto = require('crypto');
const Organization = require('../models/Organization');
const logger = require('../utils/logger');

const MAX_ATTEMPTS = 3;

// Notifies the external system (e.g. the social media automation app) of an
// approve/reject decision. Signs the body with the org's webhook secret so
// the receiver can verify the callback genuinely came from Backero.
async function sendApprovalCallback(request) {
  if (!request.callbackUrl) {
    logger.warn(`[SocialApproval] No callbackUrl for request ${request._id} — skipping callback`);
    request.callbackStatus = 'failed';
    await request.save();
    return;
  }

  const org = await Organization.findById(request.organizationId).select('+socialAutomation.webhookSecret');
  const secret = org?.socialAutomation?.webhookSecret;
  if (!secret) {
    logger.warn(`[SocialApproval] No webhook secret configured for org ${request.organizationId} — skipping callback`);
    request.callbackStatus = 'failed';
    await request.save();
    return;
  }

  const body = JSON.stringify({
    externalId: request.externalId,
    status: request.status,
    reviewNotes: request.reviewNotes || undefined,
    reviewedAt: request.reviewedAt,
  });
  const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await axios.post(request.callbackUrl, body, {
        headers: { 'Content-Type': 'application/json', 'X-Backero-Signature': signature },
        timeout: 10000,
      });
      request.callbackStatus = 'delivered';
      request.callbackAttempts = attempt;
      await request.save();
      return;
    } catch (err) {
      logger.warn(`[SocialApproval] Callback attempt ${attempt}/${MAX_ATTEMPTS} failed for ${request._id}: ${err.message}`);
      if (attempt === MAX_ATTEMPTS) {
        request.callbackStatus = 'failed';
        request.callbackAttempts = attempt;
        await request.save();
      }
    }
  }
}

module.exports = { sendApprovalCallback };
