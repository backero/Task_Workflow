const express = require('express');
const router = express.Router();

const { createProject, getProjects, getProject, updateProject, deleteProject } = require('../controllers/project.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate.middleware');
const { createProjectSchema, updateProjectSchema } = require('../validators/project.validator');

router.use(authenticate);

router.post('/', validate(createProjectSchema), createProject);
router.get('/', getProjects);
router.get('/:id', getProject);
router.patch('/:id', validate(updateProjectSchema), updateProject);
router.delete('/:id', deleteProject);

module.exports = router;
