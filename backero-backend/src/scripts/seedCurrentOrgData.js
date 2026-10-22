require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');

async function seedCurrentOrgData() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const User = require('../models/User');
    const Lead = require('../models/Lead');
    const Product = require('../models/Product');
    const Task = require('../models/Task');

    // Get the current user's organization
    const currentUser = await User.findOne({ email: 'backeroindia@gmail.com' });
    if (!currentUser) {
      console.log('❌ Current user not found');
      await mongoose.disconnect();
      return;
    }

    const orgId = currentUser.organizationId;
    console.log(`✅ Seeding data for organization: ${orgId}`);

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
        assignedTo: currentUser._id
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
        assignedTo: currentUser._id
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
        assignedTo: currentUser._id
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
        assignedTo: currentUser._id
      },
    ];

    await Lead.insertMany(leads);
    console.log(`✅ Created ${leads.length} CRM leads`);

    // Create Tasks
    const tasks = [
      {
        title: '[TEST] Q4 Social Media Campaign',
        department: 'Marketing',
        assignedTo: currentUser._id,
        assignedBy: currentUser._id,
        priority: 'high',
        status: 'In Progress',
        progress: 45,
        organizationId: orgId,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        description: 'Plan and execute Q4 marketing campaign across social media platforms'
      },
      {
        title: '[TEST] Follow Up With 20 Leads',
        department: 'Sales',
        assignedTo: currentUser._id,
        assignedBy: currentUser._id,
        priority: 'high',
        status: 'In Progress',
        progress: 60,
        organizationId: orgId,
        dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        description: 'Contact and follow up with 20 qualified leads'
      },
      {
        title: '[TEST] Complete Batch Packaging',
        department: 'Production',
        assignedTo: currentUser._id,
        assignedBy: currentUser._id,
        priority: 'critical',
        status: 'In Progress',
        progress: 75,
        organizationId: orgId,
        dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
        description: 'Package 500 units of finished goods for shipment'
      },
      {
        title: '[TEST] Update Amazon Listings',
        department: 'Marketplace',
        assignedTo: currentUser._id,
        assignedBy: currentUser._id,
        priority: 'high',
        status: 'In Progress',
        progress: 50,
        organizationId: orgId,
        dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        description: 'Update product listings on Amazon with new prices and images'
      },
    ];

    await Task.insertMany(tasks);
    console.log(`✅ Created ${tasks.length} tasks`);

    // Create/Update Products
    const existingProducts = await Product.countDocuments({ organizationId: orgId, name: /\[TEST\]/ });
    if (existingProducts === 0) {
      const products = [
        { name: '[TEST] Organic Skincare Serum', sku: 'SKU-ORG-001', category: 'Skincare', price: 599, quantity: 150, reorderLevel: 50, unit: 'bottle', organizationId: orgId },
        { name: '[TEST] Anti-Aging Face Cream', sku: 'SKU-AAC-002', category: 'Skincare', price: 899, quantity: 100, reorderLevel: 30, unit: 'jar', organizationId: orgId },
        { name: '[TEST] Natural Shampoo 200ml', sku: 'SKU-NSH-003', category: 'Hair Care', price: 349, quantity: 200, reorderLevel: 75, unit: 'bottle', organizationId: orgId },
        { name: '[TEST] Body Lotion 500ml', sku: 'SKU-BDL-004', category: 'Body Care', price: 549, quantity: 120, reorderLevel: 40, unit: 'bottle', organizationId: orgId },
        { name: '[TEST] Sunscreen SPF 50+', sku: 'SKU-SUN-005', category: 'Skincare', price: 449, quantity: 80, reorderLevel: 25, unit: 'tube', organizationId: orgId },
      ];

      await Product.insertMany(products);
      console.log(`✅ Created ${products.length} test products`);
    } else {
      console.log(`ℹ️  Test products already exist (${existingProducts} found)`);
    }

    console.log('\n🎉 Test data successfully seeded for your organization!');
    console.log('\n📊 Data Created:');
    console.log('   ✓ 4 CRM Leads (different sales stages)');
    console.log('   ✓ 4 Tasks (across Marketing, Sales, Production, Marketplace)');
    console.log('   ✓ 5 Test Products (Skincare, Hair Care, Body Care)');
    console.log('\n✅ You can now see this data in your dashboard!');

    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB\n');
  } catch (error) {
    console.error('❌ Error seeding data:', error.message);
    process.exit(1);
  }
}

seedCurrentOrgData();
