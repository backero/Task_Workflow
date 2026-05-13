const express = require('express');
const router = express.Router();

const { createTask, getTasks, getTask, updateTask, updateTaskStatus, deleteTask, addComment, getMyTasks } = require('../controllers/task.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate.middleware');
const { createTaskSchema, updateTaskSchema, updateStatusSchema, addCommentSchema } = require('../validators/task.validator');

router.use(authenticate);

router.get('/my', getMyTasks);
router.post('/', validate(createTaskSchema), createTask);
router.get('/', getTasks);
router.get('/:id', getTask);
router.patch('/:id', validate(updateTaskSchema), updateTask);
router.patch('/:id/status', validate(updateStatusSchema), updateTaskStatus);
router.delete('/:id', deleteTask);
router.post('/:id/comments', validate(addCommentSchema), addComment);

module.exports = router;
