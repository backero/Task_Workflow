const express = require('express');
const router  = express.Router();
const path    = require('path');
const { authenticate } = require('../middleware/auth.middleware');
const { uploadImage }  = require('../middleware/upload.middleware');
const { uploadAvatar } = require('../controllers/upload.controller');

router.use(authenticate);
router.post('/avatar', uploadImage.single('avatar'), uploadAvatar);

module.exports = router;
