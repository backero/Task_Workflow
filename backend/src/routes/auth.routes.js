const express = require('express');
const router = express.Router();

const { sendOtp, verifyOtpAndLogin, refreshTokens, getMe } = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate.middleware');
const { requestOtpSchema, verifyOtpSchema, refreshTokenSchema } = require('../validators/auth.validator');

router.post('/login', validate(requestOtpSchema), sendOtp);
router.post('/verify', validate(verifyOtpSchema), verifyOtpAndLogin);
router.post('/refresh', validate(refreshTokenSchema), refreshTokens);
router.get('/me', authenticate, getMe);

module.exports = router;
