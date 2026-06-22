/**
 * One-time fix: assign all unassigned dept hub / lead-converted project root tasks
 * to the org's admin (Organization.createdBy).
 * Run: node fix-unassigned-hub-tasks.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const Organization = require('./src/models/Organization');
const Task = require('./src/models/Task');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const orgs = await Organization.find({}).select('_id createdBy name');

  let totalFixed = 0;

  for (const org of orgs) {
    if (!org.createdBy) {
      console.log(`⚠️  Org "${org.name}" has no createdBy — skipping`);
      continue;
    }

    // Find all unassigned dept hub root tasks (no parentTask, isDeptHub true OR linked to a lead)
    const unassigned = await Task.find({
      organizationId: org._id,
      assignedTo: { $in: [null, undefined] },
      parentTask: { $exists: false },
      $or: [
        { isDeptHub: true },
        // Also catch project root tasks (Management dept, no parent) with no assignee
        { department: 'Management', isDeptHub: { $ne: false } },
      ],
    }).select('_id title');

    if (!unassigned.length) continue;

    const ids = unassigned.map(t => t._id);
    await Task.updateMany(
      { _id: { $in: ids } },
      {
        $set: {
          assignedTo: org.createdBy,
          status: 'Assigned',
          updatedBy: org.createdBy,
        },
        $push: {
          activity: {
            action: 'Auto-assigned to org admin (backfill)',
            performedBy: org.createdBy,
            details: { reason: 'fix-unassigned-hub-tasks script' },
          },
        },
      }
    );

    console.log(`✅ Org "${org.name}": fixed ${unassigned.length} task(s)`);
    unassigned.forEach(t => console.log(`   - ${t.title} (${t._id})`));
    totalFixed += unassigned.length;
  }

  console.log(`\nDone. Total fixed: ${totalFixed}`);
  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
