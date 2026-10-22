require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const User = require('./src/models/User');

    const newPassword = 'EROLDISHWGVQVSVXBXMDKSKSIWYDGBXSH';
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    const user = await User.findOneAndUpdate(
      { email: 'backeroindia@gmail.com' },
      { password: hashedPassword },
      { new: true }
    );

    if (user) {
      console.log('✅ Password updated for:', user.email);
      console.log('\nYou can now login with:');
      console.log('  Email: backeroindia@gmail.com');
      console.log('  Password: EROLDISHWGVQVSVXBXMDKSKSIWYDGBXSH');
    } else {
      console.log('User not found');
    }

    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
