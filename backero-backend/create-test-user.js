require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const User = require('./src/models/User');
    const Organization = require('./src/models/Organization');

    // Get the backeroindia organization
    const org = await Organization.findOne({ email: 'backeroindia@gmail.com' });
    if (!org) {
      console.log('Organization not found!');
      await mongoose.disconnect();
      return;
    }

    console.log('Found organization:', org.name, '(ID:', org._id, ')');

    // Create or update test user
    const testPassword = 'Test@1234';
    const hashedPassword = await bcrypt.hash(testPassword, 12);

    let user = await User.findOne({ email: 'test@backero.local', organizationId: org._id });

    if (!user) {
      user = await User.create({
        organizationId: org._id,
        firstName: 'Test',
        lastName: 'User',
        email: 'test@backero.local',
        phone: '9999999999',
        password: hashedPassword,
        role: 'admin',
        isVerified: true,
        isActive: true,
      });
      console.log('Created test user:', user.email);
    } else {
      user.password = hashedPassword;
      await user.save();
      console.log('Updated test user:', user.email);
    }

    console.log('\n✅ Login with:');
    console.log('  Email: test@backero.local');
    console.log('  Password: Test@1234');

    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
