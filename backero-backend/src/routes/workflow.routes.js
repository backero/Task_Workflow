const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const { orgIsolation } = require('../middleware/orgIsolation.middleware');
const { authorizeManagerOrAbove } = require('../middleware/role.middleware');
const ctrl = require('../controllers/workflow.controller');

router.use(authenticate, orgIsolation);

// ── Templates (must be before /:taskId routes to avoid collision) ─────────────
router.get('/templates',           ctrl.getTemplates);
router.post('/templates',          authorizeManagerOrAbove, ctrl.saveTemplate);
router.delete('/templates/:id',    authorizeManagerOrAbove, ctrl.deleteTemplate);

// ── Node positions (bulk update) ──────────────────────────────────────────────
router.put('/nodes/positions',     ctrl.updateNodePositions);

// ── Dependency management ─────────────────────────────────────────────────────
router.post('/dependency',         ctrl.addDependency);
router.delete('/dependency/:depId', authorizeManagerOrAbove, ctrl.removeDependency);

// ── Per-task routes ───────────────────────────────────────────────────────────
router.get('/:taskId/graph',            ctrl.getWorkflowGraph);
router.get('/:taskId/tree',             ctrl.getTaskTree);
router.get('/:taskId/dependencies',     ctrl.getTaskDependencies);
router.get('/:taskId/completion-check', ctrl.checkCompletion);

router.post('/:taskId/subtask',         authorizeManagerOrAbove, ctrl.addSubtask);
router.post('/:taskId/start',           ctrl.startTask);
router.post('/:taskId/update',          ctrl.addUpdate);
router.post('/:taskId/apply-template',  authorizeManagerOrAbove, ctrl.applyTemplate);

router.put('/:taskId/progress',         ctrl.updateProgress);

router.post('/:taskId/request-completion', ctrl.requestCompletion);
router.post('/:taskId/complete',        authorizeManagerOrAbove, ctrl.completeTask);
router.post('/:taskId/reject',          authorizeManagerOrAbove, ctrl.rejectTask);
router.post('/:taskId/reopen',          authorizeManagerOrAbove, ctrl.reopenTask);
router.post('/:taskId/achieve',         authorizeManagerOrAbove, ctrl.achieveTask);

module.exports = router;
