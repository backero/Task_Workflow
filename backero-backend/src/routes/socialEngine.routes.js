const router = require('express').Router();
const { authenticate } = require('../middleware/auth.middleware');
const { orgIsolation } = require('../middleware/orgIsolation.middleware');
const { authorizeMarketingApprover, authorizeAdminOrAbove } = require('../middleware/role.middleware');
const socialMediaUpload = require('../middleware/socialMediaUpload.middleware');
const {
  getOverview, generatePost,
  listLeads, updateLeadStage,
  listComments, approveComment, skipComment, triggerManychat,
  getAnalyticsSummary, getAccounts, getAccountsActivity,
  scanAdSuggestions, listAdSuggestions, createAdDraftCampaign, markAdSuggestionReviewed, dismissAdSuggestion,
  getUpcomingFestivals, generateDueFestivals,
  getCompetitorsPulse, getCompetitorHistory, logCompetitorCheckin,
  getCostBreakdown, getSettingsFlags, getBestTimeStrategy,
  createManualPost, ingestRawVideo,
} = require('../controllers/socialEngine.controller');

router.use(authenticate, orgIsolation);

router.get('/overview',                     getOverview);
router.post('/posts/generate',              authorizeMarketingApprover, generatePost);

router.get('/leads',                        listLeads);
router.patch('/leads/:leadId',              authorizeMarketingApprover, updateLeadStage);

router.get('/comments',                          listComments);
router.post('/comments/:commentId/approve',      authorizeMarketingApprover, approveComment);
router.post('/comments/:commentId/skip',         authorizeMarketingApprover, skipComment);
router.post('/comments/:commentId/trigger-manychat', authorizeMarketingApprover, triggerManychat);

router.get('/analytics/summary',            getAnalyticsSummary);

router.get('/accounts',                     getAccounts);
router.get('/accounts/activity',            getAccountsActivity);

// Ads suggestions are informational for anyone with page access — creating a
// real (PAUSED, never auto-launched) draft campaign in Meta Ads Manager
// needs admin, mirroring the same gate the Streamlit dashboard used.
router.post('/ads/scan',                              authorizeMarketingApprover, scanAdSuggestions);
router.get('/ads/suggestions',                        listAdSuggestions);
router.post('/ads/suggestions/:suggestionId/create-draft-campaign', authorizeAdminOrAbove, createAdDraftCampaign);
router.post('/ads/suggestions/:suggestionId/mark-reviewed',         authorizeMarketingApprover, markAdSuggestionReviewed);
router.post('/ads/suggestions/:suggestionId/dismiss',               authorizeMarketingApprover, dismissAdSuggestion);

router.get('/festivals/upcoming',           getUpcomingFestivals);
router.post('/festivals/generate-due',      authorizeMarketingApprover, generateDueFestivals);

router.get('/competitors/pulse',                    getCompetitorsPulse);
router.get('/competitors/:competitor/history',      getCompetitorHistory);
router.post('/competitors/checkin',                 authorizeMarketingApprover, logCompetitorCheckin);

router.get('/cost/breakdown',               getCostBreakdown);
router.get('/settings/flags',               getSettingsFlags);
router.get('/strategy/best-time',           getBestTimeStrategy);

router.post('/posts/manual',                authorizeMarketingApprover, socialMediaUpload.single('media'), createManualPost);
router.post('/video/ingest',                authorizeMarketingApprover, socialMediaUpload.single('video'), ingestRawVideo);

module.exports = router;
