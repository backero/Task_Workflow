require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

async function seedCompleteData() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const Organization = require('../models/Organization');
    const User = require('../models/User');
    const Task = require('../models/Task');
    const Lead = require('../models/Lead');
    const Product = require('../models/Product');
    const Invoice = require('../models/Invoice');
    const Document = require('../models/Document');

    // Step 1: Create/Get Organization
    let org = await Organization.findOne({ slug: 'backero-test-org' });
    if (!org) {
      org = await Organization.create({
        name: 'Backero Test Organization',
        slug: 'backero-test-org',
        email: 'test@backero.in',
        phone: '9988776655',
        departments: ['Marketing', 'Marketplace', 'Sales', 'Production', 'R&D', 'Operations', 'Accounts & Finance'],
        isActive: true,
        settings: {
          workingHours: { start: '09:00', end: '18:00' },
          currency: 'INR',
          timezone: 'Asia/Kolkata',
          dateFormat: 'DD/MM/YYYY',
          workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
          enableWhatsApp: false,
          enableEmailNotifications: true,
          maxTasksPerEmployee: 20,
          documentWalletSeeded: false,
        },
      });
      console.log('✅ Organization created:', org.name);
    }

    // Step 2: Create Users with Different Roles
    const users = [];
    const usersList = [
      { firstName: 'Admin', lastName: 'User', email: 'admin@test.backero.in', phone: '9988776656', role: 'admin', department: 'Operations' },
      { firstName: 'Marketing', lastName: 'Manager', email: 'marketing@test.backero.in', phone: '9988776657', role: 'manager', department: 'Marketing' },
      { firstName: 'Sales', lastName: 'Manager', email: 'sales@test.backero.in', phone: '9988776658', role: 'manager', department: 'Sales' },
      { firstName: 'Production', lastName: 'Manager', email: 'production@test.backero.in', phone: '9988776659', role: 'manager', department: 'Production' },
      { firstName: 'Marketplace', lastName: 'Manager', email: 'marketplace@test.backero.in', phone: '9988776660', role: 'manager', department: 'Marketplace' },
      { firstName: 'Finance', lastName: 'Manager', email: 'finance@test.backero.in', phone: '9988776661', role: 'manager', department: 'Accounts & Finance' },
      { firstName: 'Arjun', lastName: 'Kumar', email: 'arjun@test.backero.in', phone: '9988776662', role: 'member', department: 'Sales' },
      { firstName: 'Priya', lastName: 'Singh', email: 'priya@test.backero.in', phone: '9988776663', role: 'member', department: 'Marketplace' },
      { firstName: 'Rajesh', lastName: 'Patel', email: 'rajesh@test.backero.in', phone: '9988776664', role: 'member', department: 'Production' },
      { firstName: 'Sneha', lastName: 'Sharma', email: 'sneha@test.backero.in', phone: '9988776665', role: 'member', department: 'Marketing' },
    ];

    for (const userData of usersList) {
      const existing = await User.findOne({ email: userData.email });
      if (!existing) {
        const password = await bcrypt.hash('Test@1234', 12);
        const user = await User.create({
          organizationId: org._id,
          ...userData,
          email: userData.email.toLowerCase(),
          password,
          isVerified: true,
          isActive: true,
        });
        users.push(user);
        console.log(`✅ User created: ${user.firstName} ${user.lastName} (${user.role})`);
      } else {
        const user = await User.findOne({ email: userData.email });
        users.push(user);
      }
    }

    org.createdBy = users[0]._id;
    await org.save();

    // Step 3: Create Tasks
    const taskCount = await Task.countDocuments({ organizationId: org._id, title: /\[TEST\]/ });
    if (taskCount === 0) {
      const tasks = [
        // Marketing Tasks
        { title: '[TEST] Q4 Social Media Campaign Planning', department: 'Marketing', assignedTo: users[1]._id, assignedBy: users[0]._id, priority: 'high', status: 'In Progress', progress: 45, dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
        { title: '[TEST] Design Product Brochure', department: 'Marketing', assignedTo: users[9]._id, assignedBy: users[1]._id, priority: 'medium', status: 'Assigned', progress: 0, dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000) },

        // Sales Tasks
        { title: '[TEST] Follow Up With 20 Leads', department: 'Sales', assignedTo: users[6]._id, assignedBy: users[2]._id, priority: 'high', status: 'In Progress', progress: 60, dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) },
        { title: '[TEST] Prepare Q4 Sales Report', department: 'Sales', assignedTo: users[2]._id, assignedBy: users[0]._id, priority: 'medium', status: 'Approval Pending', progress: 100, dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) },

        // Production Tasks
        { title: '[TEST] Complete Batch Packaging', department: 'Production', assignedTo: users[8]._id, assignedBy: users[3]._id, priority: 'critical', status: 'In Progress', progress: 75, dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000) },
        { title: '[TEST] Quality Control Inspection', department: 'Production', assignedTo: users[8]._id, assignedBy: users[3]._id, priority: 'high', status: 'Assigned', progress: 0, dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000) },

        // Marketplace Tasks
        { title: '[TEST] Update Amazon Listings', department: 'Marketplace', assignedTo: users[7]._id, assignedBy: users[4]._id, priority: 'high', status: 'In Progress', progress: 50, dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) },
        { title: '[TEST] Handle Negative Reviews', department: 'Marketplace', assignedTo: users[7]._id, assignedBy: users[4]._id, priority: 'critical', status: 'Assigned', progress: 0, dueDate: new Date(Date.now() + 0 * 24 * 60 * 60 * 1000) },
      ];

      await Task.insertMany(tasks.map(t => ({ ...t, organizationId: org._id })));
      console.log(`✅ Created ${tasks.length} test tasks`);
    }

    // Step 4: Create CRM Leads
    const leadCount = await Lead.countDocuments({ organizationId: org._id, name: /\[TEST\]/ });
    if (leadCount === 0) {
      const leads = [
        { name: '[TEST] ABC Enterprises - Bulk Order', company: 'ABC Enterprises', email: 'john@abc.com', phone: '9988112233', status: 'qualified', source: 'Website Form', estimatedValue: 150000, assignedTo: users[6]._id },
        { name: '[TEST] XYZ Industries - Product Inquiry', company: 'XYZ Industries', email: 'sarah@xyz.com', phone: '9988112234', status: 'negotiation', source: 'LinkedIn', estimatedValue: 200000, assignedTo: users[6]._id },
        { name: '[TEST] Tech Solutions Ltd - Demo Request', company: 'Tech Solutions Ltd', email: 'mike@techsol.com', phone: '9988112235', status: 'proposal', source: 'Email Campaign', estimatedValue: 100000, assignedTo: users[6]._id },
        { name: '[TEST] Green Valley Retail - Wholesale', company: 'Green Valley Retail', email: 'emma@greenvalley.com', phone: '9988112236', status: 'proposal', source: 'Referral', estimatedValue: 250000, assignedTo: users[6]._id },
      ];

      await Lead.insertMany(leads.map(l => ({ ...l, organizationId: org._id })));
      console.log(`✅ Created ${leads.length} CRM leads`);
    }

    // Step 5: Create Products
    const productCount = await Product.countDocuments({ organizationId: org._id, name: /\[TEST\]/ });
    if (productCount === 0) {
      const products = [
        { name: '[TEST] Organic Skincare Serum', sku: 'SKU-001', category: 'Skincare', price: 599, quantity: 150, reorderLevel: 50, unit: 'bottle', organizationId: org._id },
        { name: '[TEST] Anti-Aging Face Cream', sku: 'SKU-002', category: 'Skincare', price: 899, quantity: 100, reorderLevel: 30, unit: 'jar', organizationId: org._id },
        { name: '[TEST] Natural Shampoo 200ml', sku: 'SKU-003', category: 'Hair Care', price: 349, quantity: 200, reorderLevel: 75, unit: 'bottle', organizationId: org._id },
        { name: '[TEST] Body Lotion 500ml', sku: 'SKU-004', category: 'Body Care', price: 549, quantity: 120, reorderLevel: 40, unit: 'bottle', organizationId: org._id },
        { name: '[TEST] Sunscreen SPF 50+', sku: 'SKU-005', category: 'Skincare', price: 449, quantity: 80, reorderLevel: 25, unit: 'tube', organizationId: org._id },
      ];

      await Product.insertMany(products);
      console.log(`✅ Created ${products.length} products`);
    }

    // Step 6: Create Invoices
    const invoiceCount = await Invoice.countDocuments({ organizationId: org._id, invoiceNumber: /TEST/ });
    if (invoiceCount === 0) {
      const invoices = [
        {
          invoiceNumber: 'INV-TEST-001',
          organizationId: org._id,
          client: { name: 'ABC Enterprises', email: 'john@abc.com', phone: '9988112233' },
          subtotal: 150000,
          totalGst: 27000,
          totalAmount: 177000,
          status: 'paid',
          issueDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
          dueDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
          lineItems: [{ description: 'Skincare Products - Bulk Order', quantity: 100, unitPrice: 1500, total: 150000 }],
          createdBy: users[5]._id
        },
        {
          invoiceNumber: 'INV-TEST-002',
          organizationId: org._id,
          client: { name: 'XYZ Industries', email: 'sarah@xyz.com', phone: '9988112234' },
          subtotal: 85000,
          totalGst: 15300,
          totalAmount: 100300,
          status: 'sent',
          issueDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
          dueDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
          lineItems: [{ description: 'Hair Care Products', quantity: 50, unitPrice: 1700, total: 85000 }],
          createdBy: users[5]._id
        },
        {
          invoiceNumber: 'INV-TEST-003',
          organizationId: org._id,
          client: { name: 'Tech Solutions Ltd', email: 'mike@techsol.com', phone: '9988112235' },
          subtotal: 120000,
          totalGst: 21600,
          totalAmount: 141600,
          status: 'sent',
          issueDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
          dueDate: new Date(Date.now() + 13 * 24 * 60 * 60 * 1000),
          lineItems: [{ description: 'Premium Skincare Set', quantity: 80, unitPrice: 1500, total: 120000 }],
          createdBy: users[5]._id
        },
      ];

      await Invoice.insertMany(invoices);
      console.log(`✅ Created ${invoices.length} invoices`);
    }

    // Step 7: Create Sample/Product Development Records
    const Sample = require('../models/Sample');
    const sampleCount = await Sample.countDocuments({ organizationId: org._id, title: /\[TEST\]/ });
    if (sampleCount === 0) {
      const samples = [
        {
          title: '[TEST] Premium Serum - Client ABC',
          organizationId: org._id,
          clientName: 'ABC Enterprises',
          stage: 'approved',
          createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          quantity: 100,
          formulaDetails: 'Hyaluronic Acid 2%, Vitamin C 5%'
        },
        {
          title: '[TEST] Natural Moisturizer - Client XYZ',
          organizationId: org._id,
          clientName: 'XYZ Industries',
          stage: 'in_sampling',
          createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
          quantity: 50,
          formulaDetails: 'Aloe Vera Extract, Jojoba Oil'
        },
      ];

      try {
        await Sample.insertMany(samples);
        console.log(`✅ Created ${samples.length} samples`);
      } catch (err) {
        console.log('ℹ️  Samples creation skipped (model may not exist)');
      }
    }

    console.log('\n🎉 Database seeding completed successfully!');
    console.log('\n📋 Test Login Credentials:');
    console.log('   Admin: admin@test.backero.in / Test@1234');
    console.log('   Sales Mgr: sales@test.backero.in / Test@1234');
    console.log('   Production Mgr: production@test.backero.in / Test@1234');
    console.log('   Marketplace Mgr: marketplace@test.backero.in / Test@1234');

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error seeding database:', error.message);
    process.exit(1);
  }
}

seedCompleteData();
