require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');

async function seedTestData() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const User = require('../models/User');
    const Lead = require('../models/Lead');
    const Product = require('../models/Product');
    const Task = require('../models/Task');

    // Get the test organization's admin user
    const adminUser = await User.findOne({ email: 'admin@test.backero.in' });
    if (!adminUser) {
      console.log('❌ Test admin user not found. Please run seedCompleteData.js first.');
      await mongoose.disconnect();
      return;
    }

    const orgId = adminUser.organizationId;
    console.log(`✅ Found organization: ${orgId}`);

    // Get other users
    const salesMgr = await User.findOne({ organizationId: orgId, email: 'sales@test.backero.in' });
    const prodMgr = await User.findOne({ organizationId: orgId, email: 'production@test.backero.in' });
    const marketMgr = await User.findOne({ organizationId: orgId, email: 'marketplace@test.backero.in' });

    // Delete old test data
    await Lead.deleteMany({ organizationId: orgId, name: /\[TEST\]/ });
    await Task.deleteMany({ organizationId: orgId, title: /\[TEST\]/ });
    console.log('🗑️  Cleaned old test data');

    // Create CRM Leads
    const leads = [
      {
        name: '[TEST] ABC Enterprises - Bulk Order',
        company: 'ABC Enterprises',
        email: 'john@abc.com',
        phone: '9988112233',
        status: 'qualified',
        source: 'Website Form',
        estimatedValue: 150000,
        priority: 'high',
        productInterest: ['Skincare', 'Body Care'],
        organizationId: orgId,
        assignedTo: salesMgr?._id
      },
      {
        name: '[TEST] XYZ Industries - Product Inquiry',
        company: 'XYZ Industries',
        email: 'sarah@xyz.com',
        phone: '9988112234',
        status: 'negotiation',
        source: 'LinkedIn',
        estimatedValue: 200000,
        priority: 'high',
        productInterest: ['Hair Care'],
        organizationId: orgId,
        assignedTo: salesMgr?._id
      },
      {
        name: '[TEST] Tech Solutions Ltd - Demo Request',
        company: 'Tech Solutions Ltd',
        email: 'mike@techsol.com',
        phone: '9988112235',
        status: 'proposal',
        source: 'Email Campaign',
        estimatedValue: 100000,
        priority: 'medium',
        productInterest: ['Skincare'],
        organizationId: orgId,
        assignedTo: salesMgr?._id
      },
      {
        name: '[TEST] Green Valley Retail - Wholesale',
        company: 'Green Valley Retail',
        email: 'emma@greenvalley.com',
        phone: '9988112236',
        status: 'proposal',
        source: 'Referral',
        estimatedValue: 250000,
        priority: 'high',
        productInterest: ['All Products'],
        organizationId: orgId,
        assignedTo: salesMgr?._id
      },
    ];

    await Lead.insertMany(leads);
    console.log(`✅ Created ${leads.length} CRM leads`);

    // Create Tasks
    const tasks = [
      {
        title: '[TEST] Q4 Social Media Campaign',
        department: 'Marketing',
        assignedTo: adminUser._id,
        assignedBy: adminUser._id,
        priority: 'high',
        status: 'In Progress',
        progress: 45,
        organizationId: orgId,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      },
      {
        title: '[TEST] Follow Up With 20 Leads',
        department: 'Sales',
        assignedTo: salesMgr?._id,
        assignedBy: adminUser._id,
        priority: 'high',
        status: 'In Progress',
        progress: 60,
        organizationId: orgId,
        dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
      },
      {
        title: '[TEST] Complete Batch Packaging',
        department: 'Production',
        assignedTo: prodMgr?._id,
        assignedBy: adminUser._id,
        priority: 'critical',
        status: 'In Progress',
        progress: 75,
        organizationId: orgId,
        dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000)
      },
      {
        title: '[TEST] Update Amazon Listings',
        department: 'Marketplace',
        assignedTo: marketMgr?._id,
        assignedBy: adminUser._id,
        priority: 'high',
        status: 'In Progress',
        progress: 50,
        organizationId: orgId,
        dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
      },
    ];

    await Task.insertMany(tasks);
    console.log(`✅ Created ${tasks.length} tasks`);

    // Create Products (if not already created)
    const existingProducts = await Product.countDocuments({ organizationId: orgId, name: /\[TEST\]/ });
    if (existingProducts === 0) {
      const products = [
        { name: '[TEST] Organic Skincare Serum', sku: 'SKU-TEST-001', category: 'Skincare', price: 599, quantity: 150, reorderLevel: 50, unit: 'bottle', organizationId: orgId },
        { name: '[TEST] Anti-Aging Face Cream', sku: 'SKU-TEST-002', category: 'Skincare', price: 899, quantity: 100, reorderLevel: 30, unit: 'jar', organizationId: orgId },
        { name: '[TEST] Natural Shampoo 200ml', sku: 'SKU-TEST-003', category: 'Hair Care', price: 349, quantity: 200, reorderLevel: 75, unit: 'bottle', organizationId: orgId },
        { name: '[TEST] Body Lotion 500ml', sku: 'SKU-TEST-004', category: 'Body Care', price: 549, quantity: 120, reorderLevel: 40, unit: 'bottle', organizationId: orgId },
        { name: '[TEST] Sunscreen SPF 50+', sku: 'SKU-TEST-005', category: 'Skincare', price: 449, quantity: 80, reorderLevel: 25, unit: 'tube', organizationId: orgId },
      ];

      await Product.insertMany(products);
      console.log(`✅ Created ${products.length} test products`);
    } else {
      console.log(`ℹ️  Test products already exist (${existingProducts} found)`);
    }

    console.log('\n🎉 Test data seeding completed successfully!');
    console.log('\n📋 Test Accounts Available:');
    console.log('   Admin: admin@test.backero.in / Test@1234');
    console.log('   Sales Manager: sales@test.backero.in / Test@1234');
    console.log('   Production Manager: production@test.backero.in / Test@1234');
    console.log('   Marketplace Manager: marketplace@test.backero.in / Test@1234');
    console.log('\n✅ You can now see:');
    console.log('   - 4 CRM Leads with different stages');
    console.log('   - 4 Tasks across different departments');
    console.log('   - 5 Test Products in inventory');

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error seeding data:', error.message);
    process.exit(1);
  }
}

seedTestData();
