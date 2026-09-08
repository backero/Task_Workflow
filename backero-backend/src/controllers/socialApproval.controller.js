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
  const [pending, approved, rejected] = await Promise.all([
    SocialApprovalRequest.countDocuments({ organizationId: orgId, status: 'pending' }),
    SocialApprovalRequest.countDocuments({ organizationId: orgId, status: 'approved' }),
    SocialApprovalRequest.countDocuments({ organizationId: orgId, status: 'rejected' }),
  ]);
  sendSuccess(res, { stats: { pending, approved, rejected } });
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
