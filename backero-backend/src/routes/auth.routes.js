const router = require('express').Router();
const passport = require('passport');
require('../config/passport');
const ctrl = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.post('/register', ctrl.register);
router.post('/login', ctrl.login);
router.post('/send-login-otp', ctrl.sendLoginOTP);
router.post('/verify-login-otp', ctrl.verifyLoginOTP);
router.post('/refresh', ctrl.refresh);
router.post('/logout', authenticate, ctrl.logout);
router.post('/send-otp', authenticate, ctrl.sendOTP);
router.post('/verify-otp', authenticate, ctrl.verifyOTP);
router.get('/me', authenticate, ctrl.getMe);
router.patch('/change-password', authenticate, ctrl.changePassword);

// Google OAuth
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }));
router.get('/google/callback', ctrl.googleCallback);

module.exports = router;
