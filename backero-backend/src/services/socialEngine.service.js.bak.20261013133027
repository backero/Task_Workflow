/**
 * Thin proxy to the social-media-automation Python/FastAPI engine — content
 * generation, publishing, engagement AI, leads, analytics, account health.
 * That engine is single-tenant today (one Backero brand voice / one set of
 * platform credentials), so this module doesn't pass organizationId through
 * yet — every org using Backero currently shares the one engine instance.
 * Multi-tenant support on the Python side is a follow-up.
 *
 * Separate from src/services/socialApprovalWebhook.service.js, which
 * handles the push-based /api/social-approvals review flow.
 */
const axios    = require('axios');
const FormData = require('form-data');
const logger   = require('../utils/logger');

const { SOCIAL_ENGINE_URL, SOCIAL_ENGINE_ADMIN_KEY } = process.env;

const isConfigured = () => !!SOCIAL_ENGINE_ADMIN_KEY;

const client = axios.create({
  baseURL: SOCIAL_ENGINE_URL,
  timeout: 120000, // content generation (image/video) can be slow
  headers: { 'X-Admin-Key': SOCIAL_ENGINE_ADMIN_KEY, 'Content-Type': 'application/json' },
});

const unwrap = async (promise, label) => {
  try {
    const { data } = await promise;
    return data;
  } catch (e) {
    const status = e.response?.status;
    const detail = e.response?.data?.detail || e.message;
    logger.error(`socialEngine.${label}.failed status=${status} error=${detail}`);
    const err = new Error(detail);
    err.status = status && status >= 400 && status < 500 ? status : 502;
    throw err;
  }
};

module.exports = {
  isConfigured,

  getOverview: () => unwrap(client.get('/admin/overview'), 'getOverview'),

  generatePost: (pillar) => unwrap(client.post('/admin/posts/generate', { pillar }), 'generatePost'),

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

  scanAdSuggestions: () => unwrap(client.post('/admin/ads/scan'), 'scanAdSuggestions'),

  listAdSuggestions: (status) => unwrap(client.get('/admin/ads/suggestions', { params: { status: status || 'new' } }), 'listAdSuggestions'),

  createAdDraftCampaign: (suggestionId) =>
    unwrap(client.post(`/admin/ads/suggestions/${suggestionId}/create-draft-campaign`), 'createAdDraftCampaign'),

  markAdSuggestionReviewed: (suggestionId) =>
    unwrap(client.post(`/admin/ads/suggestions/${suggestionId}/mark-reviewed`), 'markAdSuggestionReviewed'),

  dismissAdSuggestion: (suggestionId) =>
    unwrap(client.post(`/admin/ads/suggestions/${suggestionId}/dismiss`), 'dismissAdSuggestion'),

  getUpcomingFestivals: () => unwrap(client.get('/admin/festivals/upcoming'), 'getUpcomingFestivals'),

  generateDueFestivals: () => unwrap(client.post('/admin/festivals/generate-due'), 'generateDueFestivals'),

  getCompetitorsPulse: () => unwrap(client.get('/admin/competitors/pulse'), 'getCompetitorsPulse'),

  getCompetitorHistory: (competitor) =>
    unwrap(client.get(`/admin/competitors/${encodeURIComponent(competitor)}/history`), 'getCompetitorHistory'),

  logCompetitorCheckin: (body) => unwrap(client.post('/admin/competitors/checkin', body), 'logCompetitorCheckin'),

  getCostBreakdown: () => unwrap(client.get('/admin/cost/breakdown'), 'getCostBreakdown'),

  getSettingsFlags: () => unwrap(client.get('/admin/settings/flags'), 'getSettingsFlags'),

  getBestTimeStrategy: () => unwrap(client.get('/admin/strategy/best-time'), 'getBestTimeStrategy'),

  // file, from multer's memoryStorage (req.file): { buffer, originalname, mimetype }
  createManualPost: (file, fields) => {
    const form = new FormData();
    form.append('media', file.buffer, { filename: file.originalname, contentType: file.mimetype });
    for (const [k, v] of Object.entries(fields)) form.append(k, String(v));
    return unwrap(
      client.post('/admin/posts/manual', form, { headers: { ...form.getHeaders(), 'X-Admin-Key': SOCIAL_ENGINE_ADMIN_KEY } }),
      'createManualPost',
    );
  },

  ingestRawVideo: (file, { pillar, autoEdit }) => {
    const form = new FormData();
    form.append('video', file.buffer, { filename: file.originalname, contentType: file.mimetype });
    form.append('pillar', pillar || 'uploaded');
    form.append('auto_edit', String(autoEdit !== false));
    return unwrap(
      client.post('/admin/video/ingest', form, {
        headers: { ...form.getHeaders(), 'X-Admin-Key': SOCIAL_ENGINE_ADMIN_KEY },
        timeout: 600000, // transcription + auto-edit can take several minutes
      }),
      'ingestRawVideo',
    );
  },
};
