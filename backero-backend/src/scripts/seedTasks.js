require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  const Task = require('../models/Task');
  const User = require('../models/User');

  // Wipe existing test tasks
  await Task.deleteMany({ title: /^\[TEST\]/ });

  const users = await User.find({});
  const org = users[0].organizationId;

  // Helper maps
  const byDept = (dept) => users.filter((u) => u.department === dept);
  const byPhone = (phone) => users.find((u) => u.phone === phone);

  const admin     = byPhone('9488952933');  // Backero Pvt.Ltd
  const emilJoshua  = byPhone('8903412061'); // Marketing manager
  const anuMithra   = byPhone('9486167180'); // Accountant manager
  const kamesh      = byPhone('8903790400'); // Sales manager
  const vignesh     = byPhone('9486919702'); // Production manager
  const suriyaPriya = byPhone('9486500671'); // Marketplace manager

  const now    = new Date();
  const past   = (d) => new Date(now - d * 24 * 60 * 60 * 1000);
  const future = (d) => new Date(now.getTime() + d * 24 * 60 * 60 * 1000);

  const tasks = [];

  // ── MARKETING ────────────────────────────────────────────────────────────────
  tasks.push(
    { title: '[TEST] Plan Q2 Social Media Calendar', department: 'Marketing', assignedTo: emilJoshua?._id, assignedBy: admin?._id, priority: 'high', status: 'In Progress', progress: 45, dueDate: future(5), description: 'Create a 30-day content calendar for Instagram, Facebook and LinkedIn covering product launches and festive posts.' },
    { title: '[TEST] Run Facebook Ads Campaign — May Offer', department: 'Marketing', assignedTo: emilJoshua?._id, assignedBy: admin?._id, priority: 'critical', status: 'Assigned', progress: 0, dueDate: future(2), description: 'Set up and launch Facebook Ads for the May sale with ₹15,000 budget. Target age 25-45, interests: shopping, lifestyle.' },
    { title: '[TEST] Design New Product Brochure', department: 'Marketing', assignedTo: emilJoshua?._id, assignedBy: admin?._id, priority: 'medium', status: 'Approval Pending', progress: 100, dueDate: past(1), description: 'Design a 4-page A5 brochure for the new product line. Ready for print.' },
    { title: '[TEST] Competitor Analysis Report', department: 'Marketing', assignedTo: emilJoshua?._id, assignedBy: admin?._id, priority: 'low', status: 'Completed', progress: 100, dueDate: past(3), description: 'Research and document top 5 competitor pricing, campaigns, and positioning.' }
  );

  // ── SALES ────────────────────────────────────────────────────────────────────
  const salesMembers = byDept('Sales').filter((u) => u.role === 'member');
  const mohan = byPhone('9486707702');

  tasks.push(
    { title: '[TEST] Follow Up With 10 Warm Leads Today', department: 'Sales', assignedTo: mohan?._id, assignedBy: kamesh?._id, priority: 'high', status: 'In Progress', progress: 30, dueDate: future(0), description: 'Call all leads tagged "Interested" from this week\'s pipeline. Log outcome for each call.' },
    { title: '[TEST] Prepare Quotation for ABC Enterprises', department: 'Sales', assignedTo: mohan?._id, assignedBy: kamesh?._id, priority: 'critical', status: 'Assigned', progress: 0, dueDate: future(1), description: 'Client requested a quotation for 500 units. Include bulk discount and GST breakup.' },
    { title: '[TEST] Update CRM With This Week\'s Meetings', department: 'Sales', assignedTo: mohan?._id, assignedBy: kamesh?._id, priority: 'medium', status: 'Approval Pending', progress: 100, dueDate: past(1), description: 'All client meeting notes from Mon-Fri to be entered in the CRM with next follow-up date.' },
    { title: '[TEST] Monthly Sales Target Review', department: 'Sales', assignedTo: kamesh?._id, assignedBy: admin?._id, priority: 'high', status: 'In Progress', progress: 60, dueDate: future(3), description: 'Prepare a team performance vs target report for April. Highlight gaps and action items.' },
    { title: '[TEST] Onboard 3 New Dealer Partners', department: 'Sales', assignedTo: kamesh?._id, assignedBy: admin?._id, priority: 'medium', status: 'Assigned', progress: 0, dueDate: future(7), description: 'Sign agreements and set credit limits for dealers in Chennai, Coimbatore, and Madurai.' }
  );

  // ── PRODUCTION ───────────────────────────────────────────────────────────────
  const naveenthra = byPhone('8903955702');
  const diniya     = byPhone('9486935702');
  const akshaya    = byPhone('9486766702');
  const alagu      = byPhone('9486363704');

  tasks.push(
    { title: '[TEST] Complete Batch B-2024-047 Packaging', department: 'Production', assignedTo: naveenthra?._id, assignedBy: vignesh?._id, priority: 'critical', status: 'In Progress', progress: 70, dueDate: future(1), description: 'Pack 200 units of Product A in export-quality boxes. Attach batch stickers before handoff.' },
    { title: '[TEST] Quality Check — Batch B-2024-046', department: 'Production', assignedTo: naveenthra?._id, assignedBy: vignesh?._id, priority: 'high', status: 'Assigned', progress: 0, dueDate: future(0), description: 'Perform dimensional, weight, and visual quality checks on last batch. Fill QC report form.' },
    { title: '[TEST] Raw Material Stock Count', department: 'Production', assignedTo: diniya?._id, assignedBy: vignesh?._id, priority: 'medium', status: 'In Progress', progress: 50, dueDate: future(2), description: 'Physical count of all raw materials in warehouse section A and B. Update inventory system.' },
    { title: '[TEST] Machine Maintenance — Line 2', department: 'Production', assignedTo: diniya?._id, assignedBy: vignesh?._id, priority: 'high', status: 'Assigned', progress: 0, dueDate: future(3), description: 'Scheduled preventive maintenance for Line 2 machines. Lubrication, belt check, calibration.' },
    { title: '[TEST] Prepare Production Plan for Next Week', department: 'Production', assignedTo: akshaya?._id, assignedBy: vignesh?._id, priority: 'medium', status: 'Approval Pending', progress: 100, dueDate: past(1), description: 'Draft the weekly production schedule covering 3 SKUs with manpower allocation.' },
    { title: '[TEST] Wastage Report — April Month', department: 'Production', assignedTo: akshaya?._id, assignedBy: vignesh?._id, priority: 'low', status: 'Completed', progress: 100, dueDate: past(5), description: 'Calculate material wastage % vs planned for April. Report to manager.' },
    { title: '[TEST] Label Printing for New SKU Launch', department: 'Production', assignedTo: alagu?._id, assignedBy: vignesh?._id, priority: 'high', status: 'In Progress', progress: 40, dueDate: future(2), description: 'Coordinate with design team to get labels printed for 500 units of the new SKU.' },
    { title: '[TEST] Shift Handover Checklist — Morning', department: 'Production', assignedTo: alagu?._id, assignedBy: vignesh?._id, priority: 'low', status: 'Completed', progress: 100, dueDate: past(2), description: 'Fill and submit shift handover form before end of morning shift.' },
    { title: '[TEST] Review BOM for Product C Formula Update', department: 'Production', assignedTo: vignesh?._id, assignedBy: admin?._id, priority: 'high', status: 'In Progress', progress: 25, dueDate: future(4), description: 'Review the updated formula from R&D and revise the Bill of Materials accordingly.' }
  );

  // ── MARKETPLACE ──────────────────────────────────────────────────────────────
  const krisnaveni = byPhone('8903994702');
  const kaliraj    = byPhone('9486819702');

  tasks.push(
    { title: '[TEST] Update Amazon Listings — Price Revision', department: 'Marketplace', assignedTo: krisnaveni?._id, assignedBy: suriyaPriya?._id, priority: 'high', status: 'In Progress', progress: 55, dueDate: future(1), description: 'Update selling prices on all 12 Amazon listings following the April price revision. Check competitor pricing first.' },
    { title: '[TEST] Respond to Negative Reviews — Flipkart', department: 'Marketplace', assignedTo: krisnaveni?._id, assignedBy: suriyaPriya?._id, priority: 'critical', status: 'Assigned', progress: 0, dueDate: future(0), description: 'Reply to 3 one-star reviews on Flipkart professionally. Escalate returns issue to logistics.' },
    { title: '[TEST] Upload New Product Images — Meesho', department: 'Marketplace', assignedTo: kaliraj?._id, assignedBy: suriyaPriya?._id, priority: 'medium', status: 'In Progress', progress: 80, dueDate: future(2), description: 'Upload 5 product photos (white background, 1000x1000px) for the 3 new SKUs on Meesho.' },
    { title: '[TEST] Prepare Marketplace Sales Report — April', department: 'Marketplace', assignedTo: kaliraj?._id, assignedBy: suriyaPriya?._id, priority: 'medium', status: 'Approval Pending', progress: 100, dueDate: past(1), description: 'Compile platform-wise sales, returns, and commission data for April. Submit to accounts.' },
    { title: '[TEST] Apply for Amazon Prime Badge — 3 SKUs', department: 'Marketplace', assignedTo: suriyaPriya?._id, assignedBy: admin?._id, priority: 'high', status: 'Assigned', progress: 0, dueDate: future(6), description: 'Submit FBA enrollment form for top 3 selling SKUs to qualify for Prime badge.' },
    { title: '[TEST] Flipkart Big Billion Days Prep', department: 'Marketplace', assignedTo: suriyaPriya?._id, assignedBy: admin?._id, priority: 'critical', status: 'In Progress', progress: 35, dueDate: future(10), description: 'Create deal proposals, confirm stock levels, and submit to Flipkart deal portal before deadline.' }
  );

  // ── ACCOUNTS ─────────────────────────────────────────────────────────────────
  tasks.push(
    { title: '[TEST] GST Filing — April Returns', department: 'Accounts & Finance', assignedTo: anuMithra?._id, assignedBy: admin?._id, priority: 'critical', status: 'In Progress', progress: 65, dueDate: future(2), description: 'Prepare and file GSTR-1 and GSTR-3B for April. Reconcile purchase invoices before filing.' },
    { title: '[TEST] Process April Salaries', department: 'Accounts & Finance', assignedTo: anuMithra?._id, assignedBy: admin?._id, priority: 'critical', status: 'Assigned', progress: 0, dueDate: future(1), description: 'Process payroll for all 15 employees. Verify attendance, deductions, and PF contributions.' },
    { title: '[TEST] Vendor Payment Follow-Up', department: 'Accounts & Finance', assignedTo: anuMithra?._id, assignedBy: admin?._id, priority: 'high', status: 'Approval Pending', progress: 100, dueDate: past(2), description: 'Follow up with 4 vendors whose invoices are pending approval. Get sign-off from admin.' },
    { title: '[TEST] Prepare P&L Statement — Q1', department: 'Accounts & Finance', assignedTo: anuMithra?._id, assignedBy: admin?._id, priority: 'medium', status: 'Completed', progress: 100, dueDate: past(7), description: 'Compile Q1 Profit & Loss statement for founder review.' }
  );

  // ── OPERATIONS (admin level) ─────────────────────────────────────────────────
  const jeeva    = byPhone('9488939107');
  const parimala = byPhone('9487654107');

  tasks.push(
    { title: '[TEST] Review All Department Weekly Reports', department: 'Operations', assignedTo: admin?._id, assignedBy: admin?._id, priority: 'high', status: 'In Progress', progress: 50, dueDate: future(1), description: 'Collect and review weekly reports from all 6 department heads. Identify blockers.' },
    { title: '[TEST] Set Up Office Expense Budget — May', department: 'Operations', assignedTo: jeeva?._id, assignedBy: admin?._id, priority: 'medium', status: 'Assigned', progress: 0, dueDate: future(3), description: 'Prepare May office expense budget covering utilities, stationery, and vendor contracts.' },
    { title: '[TEST] Vendor Negotiation — Packaging Supplier', department: 'Operations', assignedTo: parimala?._id, assignedBy: admin?._id, priority: 'high', status: 'In Progress', progress: 20, dueDate: future(5), description: 'Renegotiate packaging material rates. Target 10% reduction. Get 3 competitive quotes.' },
    { title: '[TEST] Update HR Policy Document', department: 'Operations', assignedTo: parimala?._id, assignedBy: admin?._id, priority: 'low', status: 'Completed', progress: 100, dueDate: past(4), description: 'Update leave policy, WFH rules, and holiday list for 2024 in the HR handbook.' }
  );

  // Insert all valid tasks (filter out any where assignedTo is undefined)
  const validTasks = tasks
    .filter((t) => t.assignedTo && t.assignedBy)
    .map((t) => ({
      ...t,
      organizationId: org,
      isOverdue: t.dueDate < now && !['Completed'].includes(t.status),
    }));

  await Task.insertMany(validTasks);
  console.log(`✓ Created ${validTasks.length} test tasks`);

  const skipped = tasks.length - validTasks.length;
  if (skipped > 0) console.log(`⚠ Skipped ${skipped} tasks (user not found)`);

  await mongoose.disconnect();
}

seed().catch((err) => { console.error(err); process.exit(1); });
