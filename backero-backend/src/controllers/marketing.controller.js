const engine = require('../services/marketingEngine.service');
const { success, error: serverError } = require('../utils/response');
const logger = require('../utils/logger');

/* Every handler follows the same shape: call the Python engine, map its
   error status through, never let one flaky upstream call crash the
   request. */
const proxy = (fn) => async (req, res) => {
  if (!engine.isConfigured()) {
    return serverError(res, 'Marketing engine not configured — set MARKETING_ENGINE_ADMIN_KEY', 503);
  }
  try {
    const data = await fn(req);
    return success(res, data);
  } catch (e) {
    logger.error(`marketing.controller error: ${e.message}`);
    return serverError(res, e.message, e.status || 502);
  }
};

const decidedBy = (req) => req.user?.name || req.user?.email || 'unknown';

const getOverview = proxy(() => engine.getOverview());

const listPosts = proxy((req) => engine.listPosts(req.query.state));

const getPost = proxy((req) => engine.getPost(req.params.postId));

const generatePost = proxy((req) => {
  const { pillar } = req.body;
  if (!pillar) throw Object.assign(new Error('pillar is required'), { status: 400 });
  return engine.generatePost(pillar);
});

const approvePost = proxy((req) => engine.approvePost(req.params.postId, decidedBy(req)));

const rejectPost = proxy((req) => engine.rejectPost(req.params.postId, decidedBy(req)));

const useVariant = proxy((req) => {
  const { variantId } = req.body;
  if (!variantId) throw Object.assign(new Error('variantId is required'), { status: 400 });
  return engine.useVariant(req.params.postId, variantId);
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

module.exports = {
  getOverview, listPosts, getPost, generatePost,
  approvePost, rejectPost, useVariant,
  listLeads, updateLeadStage,
  listComments, approveComment, skipComment, triggerManychat,
  getAnalyticsSummary, getAccounts, getAccountsActivity,
};
