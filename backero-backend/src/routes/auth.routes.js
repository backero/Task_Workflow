const router = require('express').Router();
const passport = require('passport');
const rateLimit = require('express-rate-limit');
require('../config/passport');
const ctrl = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts. Please try again after 15 minutes.' },
});

const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many reset requests. Please try again after 15 minutes.' },
});

router.post('/register', authLimiter, ctrl.register);
router.post('/login', authLimiter, ctrl.login);
router.post('/send-login-otp', authLimiter, ctrl.sendLoginOTP);
router.post('/verify-login-otp', authLimiter, ctrl.verifyLoginOTP);
router.post('/forgot-password', forgotLimiter, ctrl.forgotPassword);
router.post('/reset-password', authLimiter, ctrl.resetPassword);
router.post('/refresh', ctrl.refresh);
router.post('/logout', authenticate, ctrl.logout);
router.post('/send-otp', authenticate, ctrl.sendOTP);
router.post('/verify-otp', authenticate, ctrl.verifyOTP);
router.get('/me', authenticate, ctrl.getMe);
router.patch('/change-password', authenticate, ctrl.changePassword);

// Google OAuth — only available when GOOGLE_CLIENT_ID is configured
const googleDisabled = (req, res) => res.status(503).json({ success: false, message: 'Google login is not configured on this server' });
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_ID.trim()) {
  router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }));
  router.get('/google/callback', ctrl.googleCallback);
} else {
  router.get('/google', googleDisabled);
  router.get('/google/callback', googleDisabled);
}

module.exports = router;
