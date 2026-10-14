require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const Organization = require('../models/Organization');
  const User = require('../models/User');

  let org = await Organization.findOne({ slug: 'backero-main' });
  if (!org) {
    org = await Organization.create({
      name: 'Backero',
      slug: 'backero-main',
      email: 'admin@backero.in',
      phone: '9488952933',
      departments: ['Marketing', 'Marketplace', 'Sales', 'Production', 'R&D', 'Operations', 'Accounts & Finance'],
      isActive: true,
    });
    console.log('Organization created:', org.name);
  } else {
    console.log('Organization already exists');
  }

  const existing = await User.findOne({ phone: '9488952933' });
  if (existing) {
    console.log('Admin user already exists');
    await mongoose.disconnect();
    return;
  }

  const password = await bcrypt.hash('Admin@1234', 12);
  const user = await User.create({
    organizationId: org._id,
    firstName: 'Admin',
    lastName: 'Backero',
    email: 'admin@backero.in',
    phone: '9488952933',
    password,
    role: 'admin',
    isVerified: true,
    isActive: true,
  });

  org.createdBy = user._id;
  await org.save();

  console.log('Admin user created — phone: 9488952933');
  await mongoose.disconnect();
}

seed().catch((err) => { console.error(err); process.exit(1); });
