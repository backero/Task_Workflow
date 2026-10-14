const express = require('express');
const router  = express.Router();
const { authenticate }   = require('../middleware/auth.middleware');
const { requireMinRole } = require('../middleware/role.middleware');
const {
  getOverview, listPosts, getPost, generatePost,
  approvePost, rejectPost, useVariant,
  listLeads, updateLeadStage,
  listComments, approveComment, skipComment, triggerManychat,
  getAnalyticsSummary, getAccounts, getAccountsActivity,
} = require('../controllers/marketing.controller');

router.use(authenticate);

router.get('/overview',                     getOverview);
router.get('/posts',                        listPosts);
router.get('/posts/:postId',                getPost);
router.post('/posts/generate',              requireMinRole('MANAGER'),  generatePost);
router.post('/posts/:postId/approve',       requireMinRole('MANAGER'),  approvePost);
router.post('/posts/:postId/reject',        requireMinRole('MANAGER'),  rejectPost);
router.post('/posts/:postId/use-variant',   requireMinRole('EMPLOYEE'), useVariant);

router.get('/leads',                        listLeads);
router.patch('/leads/:leadId',              requireMinRole('EMPLOYEE'), updateLeadStage);

router.get('/comments',                          listComments);
router.post('/comments/:commentId/approve',      requireMinRole('EMPLOYEE'), approveComment);
router.post('/comments/:commentId/skip',         requireMinRole('EMPLOYEE'), skipComment);
router.post('/comments/:commentId/trigger-manychat', requireMinRole('EMPLOYEE'), triggerManychat);

router.get('/analytics/summary',            getAnalyticsSummary);

router.get('/accounts',                     getAccounts);
router.get('/accounts/activity',            getAccountsActivity);

module.exports = router;
