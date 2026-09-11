const engine = require('../services/socialEngine.service');
const { sendError, sendSuccess } = require('../utils/helpers');
const logger = require('../utils/logger');

/* Every handler follows the same shape: call the Python engine, map its
   error status through, never let one flaky upstream call crash the
   request. */
const proxy = (fn) => async (req, res) => {
  if (!engine.isConfigured()) {
    return sendError(res, 'Social automation engine not configured — set SOCIAL_ENGINE_ADMIN_KEY', 503);
  }
  try {
    const data = await fn(req);
    return sendSuccess(res, data);
  } catch (e) {
    logger.error(`socialEngine.controller error: ${e.message}`);
    return sendError(res, e.message, e.status || 502);
  }
};

const decidedBy = (req) => `${req.user?.firstName || ''} ${req.user?.lastName || ''}`.trim() || req.user?.email || 'unknown';

const getOverview = proxy(() => engine.getOverview());

const generatePost = proxy((req) => {
  const { pillar } = req.body;
  if (!pillar) throw Object.assign(new Error('pillar is required'), { status: 400 });
  return engine.generatePost(pillar);
});

const listLeads = proxy(() => engine.listLeads());

const updateLeadStage = proxy((req) => {
  const { stage } = req.body;
  if (!stage) throw Object.assign(new Error('stage is required'), { status: 400 });
  return engine.updateLeadStage(req.params.leadId, stage);
});

const listComments = proxy((req) => engine.listComments(req.query.replyState));

const approveComment = proxy((req) => engine.approveComment(req.params.commentId, decidedBy(req)));

const skipComment = proxy((req) => engine.skipComment(req.params.commentId, decidedBy(req)));

const triggerManychat = proxy((req) => engine.triggerManychat(req.params.commentId));

const getAnalyticsSummary = proxy(() => engine.getAnalyticsSummary());

const getAccounts = proxy(() => engine.getAccounts());

const getAccountsActivity = proxy(() => engine.getAccountsActivity());

const scanAdSuggestions = proxy(() => engine.scanAdSuggestions());

const listAdSuggestions = proxy((req) => engine.listAdSuggestions(req.query.status));

const createAdDraftCampaign = proxy((req) => engine.createAdDraftCampaign(req.params.suggestionId));

const markAdSuggestionReviewed = proxy((req) => engine.markAdSuggestionReviewed(req.params.suggestionId));

const dismissAdSuggestion = proxy((req) => engine.dismissAdSuggestion(req.params.suggestionId));

const getUpcomingFestivals = proxy(() => engine.getUpcomingFestivals());

const generateDueFestivals = proxy(() => engine.generateDueFestivals());

const getCompetitorsPulse = proxy(() => engine.getCompetitorsPulse());

const getCompetitorHistory = proxy((req) => engine.getCompetitorHistory(req.params.competitor));

const logCompetitorCheckin = proxy((req) => {
  const { competitor, followerCount, postCount, lastPostAt, isRunningAds, adNotes, notes } = req.body;
  if (!competitor) throw Object.assign(new Error('competitor is required'), { status: 400 });
  return engine.logCompetitorCheckin({
    competitor,
    follower_count: followerCount ?? null,
    post_count: postCount ?? null,
    last_post_at: lastPostAt || null,
    is_running_ads: !!isRunningAds,
    ad_notes: adNotes || '',
    notes: notes || '',
  });
});

const getCostBreakdown = proxy(() => engine.getCostBreakdown());

const getSettingsFlags = proxy(() => engine.getSettingsFlags());

const getBestTimeStrategy = proxy(() => engine.getBestTimeStrategy());

const createManualPost = proxy((req) => {
  if (!req.file) throw Object.assign(new Error('media file is required'), { status: 400 });
  const { pillar, topic, caption, hashtagsRaw, platforms, publishNow, scheduledAt, sendForReview } = req.body;
  if (!caption) throw Object.assign(new Error('caption is required'), { status: 400 });
  if (!platforms) throw Object.assign(new Error('platforms is required'), { status: 400 });
  return engine.createManualPost(req.file, {
    pillar: pillar || 'manual',
    topic: topic || '',
    caption,
    hashtags_raw: hashtagsRaw || '',
    platforms,
    publish_now: publishNow !== 'false',
    scheduled_at: scheduledAt || '',
    send_for_review: sendForReview !== 'false',
  });
});

const ingestRawVideo = proxy((req) => {
  if (!req.file) throw Object.assign(new Error('video file is required'), { status: 400 });
  return engine.ingestRawVideo(req.file, { pillar: req.body.pillar, autoEdit: req.body.autoEdit !== 'false' });
});

module.exports = {
  getOverview, generatePost,
  listLeads, updateLeadStage,
  listComments, approveComment, skipComment, triggerManychat,
  getAnalyticsSummary, getAccounts, getAccountsActivity,
  scanAdSuggestions, listAdSuggestions, createAdDraftCampaign, markAdSuggestionReviewed, dismissAdSuggestion,
  getUpcomingFestivals, generateDueFestivals,
  getCompetitorsPulse, getCompetitorHistory, logCompetitorCheckin,
  getCostBreakdown, getSettingsFlags, getBestTimeStrategy,
  createManualPost, ingestRawVideo,
};
