// Seeds (or resets) a local test-login admin user into backero_dev, scoped to
// whichever real Organization now lives there after the prod->dev data copy
// (the migration overwrote the `users`/`organizations` collections with real
// production rows, so the old attadmin@example.com test login no longer
// exists). Uses the real Mongoose model so the password pre-save hook
// (bcrypt hash) runs exactly like a normal signup would.
require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  if (!process.env.MONGODB_URI?.includes('backero_dev')) {
    throw new Error('MONGODB_URI must point at backero_dev before running this.');
  }
  await mongoose.connect(process.env.MONGODB_URI);

  const Organization = require('../src/models/Organization');
  const User = require('../src/models/User');

  const org = await Organization.findOne();
  if (!org) throw new Error('No organization found in backero_dev.');
  console.log('Using organization:', org.name || org._id);

  const email = 'devadmin@example.com';
  const password = 'DevTest123!';

  let user = await User.findOne({ email });
  if (user) {
    user.password = password; // triggers re-hash via pre-save hook
    user.role = 'admin';
    user.organizationId = org._id;
    user.isActive = true;
    await user.save();
    console.log('Updated existing dev admin user.');
  } else {
    user = await User.create({
      organizationId: org._id,
      firstName: 'Dev',
      lastName: 'Admin',
      email,
      password,
      role: 'admin',
      isActive: true,
    });
    console.log('Created dev admin user.');
  }

  console.log(`\nLogin with: ${email} / ${password}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
