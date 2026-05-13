const express = require('express');
const router = express.Router();
const { getProfile, updateProfile, getUserById } = require('../controllers/user.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate.middleware');
const { updateUserSchema } = require('../validators/user.validator');

router.use(authenticate);

router.get('/me', getProfile);
router.patch('/me', validate(updateUserSchema), updateProfile);
router.get('/:id', getUserById);

module.exports = router;
