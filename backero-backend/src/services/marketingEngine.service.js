/**
 * Thin proxy to the social-media-automation Python/FastAPI service —
 * content generation, publishing, engagement AI, leads. That service is
 * single-tenant today (one Backero brand voice / one set of platform
 * credentials), so this module doesn't pass organizationId through yet —
 * every org using Task_Workflow currently shares the one marketing
 * engine. Multi-tenant support on the Python side is a follow-up.
 */
const axios  = require('axios');
const logger = require('../utils/logger');
const { MARKETING_ENGINE_URL, MARKETING_ENGINE_ADMIN_KEY } = require('../config/env');

const isConfigured = () => !!MARKETING_ENGINE_ADMIN_KEY;

const client = axios.create({
  baseURL: MARKETING_ENGINE_URL,
  timeout: 120000, // content generation (image/video) can be slow
  headers: { 'X-Admin-Key': MARKETING_ENGINE_ADMIN_KEY, 'Content-Type': 'application/json' },
});

const unwrap = async (promise, label) => {
  try {
    const { data } = await promise;
    return data;
  } catch (e) {
    const status = e.response?.status;
    const detail = e.response?.data?.detail || e.message;
    logger.error(`marketingEngine.${label}.failed status=${status} error=${detail}`);
    const err = new Error(detail);
    err.status = status && status >= 400 && status < 500 ? status : 502;
    throw err;
  }
};

module.exports = {
  isConfigured,

  getOverview: () => unwrap(client.get('/admin/overview'), 'getOverview'),

  listPosts: (state) => unwrap(client.get('/admin/posts', { params: state ? { state } : {} }), 'listPosts'),

  getPost: (postId) => unwrap(client.get(`/admin/posts/${postId}`), 'getPost'),

  generatePost: (pillar) => unwrap(client.post('/admin/posts/generate', { pillar }), 'generatePost'),

  approvePost: (postId, decidedBy) =>
    unwrap(client.post(`/admin/posts/${postId}/approve`, { decided_by: decidedBy }), 'approvePost'),

  rejectPost: (postId, decidedBy) =>
    unwrap(client.post(`/admin/posts/${postId}/reject`, { decided_by: decidedBy }), 'rejectPost'),

  useVariant: (postId, variantId) =>
    unwrap(client.post(`/admin/posts/${postId}/use-variant`, { variant_id: variantId }), 'useVariant'),

  listLeads: () => unwrap(client.get('/admin/leads'), 'listLeads'),

  updateLeadStage: (leadId, stage) =>
    unwrap(client.patch(`/admin/leads/${leadId}`, { stage }), 'updateLeadStage'),

  listComments: (replyState) =>
    unwrap(client.get('/admin/comments', { params: replyState ? { reply_state: replyState } : {} }), 'listComments'),

  approveComment: (commentId, approvedBy) =>
    unwrap(client.post(`/admin/comments/${commentId}/approve`, { approved_by: approvedBy }), 'approveComment'),

  skipComment: (commentId, approvedBy) =>
    unwrap(client.post(`/admin/comments/${commentId}/skip`, { approved_by: approvedBy }), 'skipComment'),

  triggerManychat: (commentId) =>
    unwrap(client.post(`/admin/comments/${commentId}/trigger-manychat`), 'triggerManychat'),

  getAnalyticsSummary: () => unwrap(client.get('/admin/analytics/summary'), 'getAnalyticsSummary'),

  getAccounts: () => unwrap(client.get('/admin/accounts'), 'getAccounts'),

  getAccountsActivity: () => unwrap(client.get('/admin/accounts/activity'), 'getAccountsActivity'),
};
