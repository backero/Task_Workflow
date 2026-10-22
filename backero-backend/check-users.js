require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const User = require('./src/models/User');
    const users = await User.find().select('email firstName lastName organizationId phone');

    console.log('Total users:', users.length);
    console.log('\nFirst 5 users:');
    users.slice(0, 5).forEach(u => {
      console.log(`  ${u.email} - ${u.firstName} ${u.lastName} (Org: ${u.organizationId})`);
    });

    // Check for backeroindia@gmail.com
    const backeroUser = await User.findOne({ email: 'backeroindia@gmail.com' });
    console.log('\nbackeroindia@gmail.com user:');
    if (backeroUser) {
      console.log(`  Found - Org: ${backeroUser.organizationId}`);
    } else {
      console.log('  NOT FOUND');
    }

    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
