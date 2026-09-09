const SocialApprovalRequest = require('../models/SocialApprovalRequest');
const { asyncHandler, sendSuccess, sendError, paginate, paginateResponse } = require('../utils/helpers');
const { SOCIAL_APPROVAL_STATUS } = require('../utils/constants');
const { sendApprovalCallback } = require('../services/socialApprovalWebhook.service');

// POST /api/integrations/social-approvals — called by the external automation
// system, authenticated via authenticateApiKey (req.organizationId, no req.user).
exports.receiveApprovalRequest = asyncHandler(async (req, res) => {
  const { externalId, platform, campaignName, caption, mediaUrls, scheduledFor, callbackUrl, metadata } = req.body;
  if (!externalId) return sendError(res, 'externalId is required.', 400);

  const existing = await SocialApprovalRequest.findOne({ organizationId: req.organizationId, externalId });
  if (existing) {
    return sendSuccess(res, { request: { id: existing._id, status: existing.status } }, 'Already received', 200);
  }

  const request = await SocialApprovalRequest.create({
    organizationId: req.organizationId,
    externalId,
    platform: platform || 'other',
    campaignName,
    caption,
    mediaUrls: mediaUrls || [],
    scheduledFor,
    callbackUrl: callbackUrl || req.organization?.socialAutomation?.defaultCallbackUrl,
    metadata,
  });

  sendSuccess(res, { request: { id: request._id, status: request.status } }, 'Approval request received', 201);
});

// PATCH /api/integrations/social-approvals/:externalId/status — called by the
// automation system once it actually attempts the publish, authenticated via
// authenticateApiKey. Separate from approve/reject: those record the human
// decision, this records what happened on the platform afterward.
exports.reportPublishStatus = asyncHandler(async (req, res) => {
  const { status, publishedUrls, publishError } = req.body;
  if (![SOCIAL_APPROVAL_STATUS.PUBLISHED, SOCIAL_APPROVAL_STATUS.PUBLISH_FAILED].includes(status)) {
    return sendError(res, `status must be "${SOCIAL_APPROVAL_STATUS.PUBLISHED}" or "${SOCIAL_APPROVAL_STATUS.PUBLISH_FAILED}".`, 400);
  }

  const request = await SocialApprovalRequest.findOne({
    organizationId: req.organizationId,
    externalId: req.params.externalId,
  });
  if (!request) return sendError(res, 'Request not found.', 404);

  request.status = status;
  request.publishedUrls = publishedUrls || [];
  request.publishError = publishError;
  request.publishedAt = new Date();
  await request.save();

  sendSuccess(res, { request }, 'Publish status recorded');
});

// GET /api/social-approvals — Marketing manager/admin only
exports.listSocialApprovals = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const { skip } = paginate(page, limit);

  const filter = { organizationId: req.user.organizationId };
  filter.status = status || SOCIAL_APPROVAL_STATUS.PENDING;

  const [requests, total] = await Promise.all([
    SocialApprovalRequest.find(filter)
      .populate('reviewedBy', 'firstName lastName avatar')
      .sort({ requestedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    SocialApprovalRequest.countDocuments(filter),
  ]);

  sendSuccess(res, paginateResponse(requests, total, page, limit));
});

// GET /api/social-approvals/stats
exports.getSocialApprovalStats = asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const [pending, approved, rejected, published, publishFailed] = await Promise.all([
    SocialApprovalRequest.countDocuments({ organizationId: orgId, status: 'pending' }),
    SocialApprovalRequest.countDocuments({ organizationId: orgId, status: 'approved' }),
    SocialApprovalRequest.countDocuments({ organizationId: orgId, status: 'rejected' }),
    SocialApprovalRequest.countDocuments({ organizationId: orgId, status: 'published' }),
    SocialApprovalRequest.countDocuments({ organizationId: orgId, status: 'publish_failed' }),
  ]);
  sendSuccess(res, { stats: { pending, approved, rejected, published, publishFailed } });
});

// POST /api/social-approvals/:id/approve
exports.approveSocialApproval = asyncHandler(async (req, res) => {
  const { reviewNotes } = req.body;

  const request = await SocialApprovalRequest.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!request) return sendError(res, 'Request not found.', 404);
  if (request.status !== SOCIAL_APPROVAL_STATUS.PENDING) return sendError(res, 'This request has already been reviewed.', 400);

  request.status = SOCIAL_APPROVAL_STATUS.APPROVED;
  request.reviewedBy = req.user._id;
  request.reviewNotes = reviewNotes;
  request.reviewedAt = new Date();
  await request.save();

  sendApprovalCallback(request).catch((err) => require('../utils/logger').error(`[SocialApproval] callback error: ${err.message}`));

  sendSuccess(res, { request }, 'Approved');
});

// POST /api/social-approvals/:id/reject
exports.rejectSocialApproval = asyncHandler(async (req, res) => {
  const { reviewNotes } = req.body;
  if (!reviewNotes?.trim()) return sendError(res, 'Rejection reason is required.', 400);

  const request = await SocialApprovalRequest.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
  if (!request) return sendError(res, 'Request not found.', 404);
  if (request.status !== SOCIAL_APPROVAL_STATUS.PENDING) return sendError(res, 'This request has already been reviewed.', 400);

  request.status = SOCIAL_APPROVAL_STATUS.REJECTED;
  request.reviewedBy = req.user._id;
  request.reviewNotes = reviewNotes;
  request.reviewedAt = new Date();
  await request.save();

  sendApprovalCallback(request).catch((err) => require('../utils/logger').error(`[SocialApproval] callback error: ${err.message}`));

  sendSuccess(res, { request }, 'Rejected');
});
