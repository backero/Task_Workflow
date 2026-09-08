const router = require('express').Router();
const ctrl = require('../controllers/socialApproval.controller');
const { authenticateApiKey } = require('../middleware/apiKeyAuth.middleware');

// Inbound intake for external systems — authenticated by API key, not JWT.
router.post('/social-approvals', authenticateApiKey, ctrl.receiveApprovalRequest);

module.exports = router;
