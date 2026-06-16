const passport = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const User = require('../models/User');
const logger = require('../utils/logger');

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_ID.trim()) {
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID.trim(),
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL,
}, async (_accessToken, _refreshToken, profile, done) => {
  try {
    const email = profile.emails?.[0]?.value?.toLowerCase();
    if (!email) return done(null, false, { message: 'no_email' });

    // Check googleEmail first (set by admin), then fall back to main email
    const user = await User.findOne({ $or: [{ googleEmail: email }, { email }] });
    if (!user) return done(null, false, { message: 'no_account' });
    if (!user.isActive) return done(null, false, { message: 'deactivated' });

    // Link Google ID on first OAuth login
    if (!user.googleId) {
      await User.findByIdAndUpdate(user._id, { googleId: profile.id, isVerified: true });
    }

    return done(null, user);
  } catch (err) {
    logger.error(`[GoogleOAuth] strategy error: ${err.message}`);
    return done(err);
  }
}));
} else {
  logger.warn('[GoogleOAuth] GOOGLE_CLIENT_ID not set — Google login disabled');
}

module.exports = passport;
