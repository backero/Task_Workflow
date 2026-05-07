/**
 * Seed script — creates a demo org, admin, members, projects, and tasks.
 * Run from backend/: node src/scripts/seed.js
 *
 * WARNING: This will wipe all existing data in the collections below.
 * Safe to run multiple times — it drops and re-seeds each time.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { MONGO_URI } = require('../config/env');

const User         = require('../models/User');
const Organization = require('../models/Organization');
const Project      = require('../models/Project');
const Task         = require('../models/Task');
const OtpLog       = require('../models/OtpLog');
const Notification = require('../models/Notification');
const ActivityLog  = require('../models/ActivityLog');
const { ROLES }    = require('../utils/constants');

const ADMIN_PHONE  = process.env.SEED_SUPER_ADMIN_PHONE || '+919999999999';
const ADMIN_NAME   = process.env.SEED_SUPER_ADMIN_NAME  || 'Platform Admin';

const seed = async () => {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  // Wipe collections
  await Promise.all([
    User.deleteMany({}),
    Organization.deleteMany({}),
    Project.deleteMany({}),
    Task.deleteMany({}),
    OtpLog.deleteMany({}),
    Notification.deleteMany({}),
    ActivityLog.deleteMany({}),
  ]);
  console.log('Collections cleared');

  // ── Organization ─────────────────────────────────────────────────────────────
  const org = await Organization.create({
    name: 'Backero Private Limited',
    slug: 'backero',
    plan: 'pro',
  });
  console.log(`Org created: ${org.name} (${org._id})`);

  // ── Users ─────────────────────────────────────────────────────────────────────
  const [admin, priya, rahul, aarav] = await User.insertMany([
    { name: ADMIN_NAME,    phone: ADMIN_PHONE,    role: ROLES.ORG_ADMIN, organizationId: org._id, designation: 'CEO',               department: 'Leadership' },
    { name: 'Priya Sharma',phone: '+919811000001', role: ROLES.MANAGER,   organizationId: org._id, designation: 'Project Manager',   department: 'Operations' },
    { name: 'Rahul Gupta', phone: '+919811000002', role: ROLES.EMPLOYEE,  organizationId: org._id, designation: 'Frontend Developer', department: 'Engineering' },
    { name: 'Aarav Singh', phone: '+919811000003', role: ROLES.EMPLOYEE,  organizationId: org._id, designation: 'Backend Developer',  department: 'Engineering' },
  ]);
  await Organization.findByIdAndUpdate(org._id, { createdBy: admin._id });
  console.log(`Users created: ${[admin, priya, rahul, aarav].map((u) => u.name).join(', ')}`);

  // ── Projects ──────────────────────────────────────────────────────────────────
  const [proj1, proj2] = await Project.insertMany([
    {
      title: 'Backero Web Platform',
      description: 'Build the main customer-facing workflow management platform.',
      organizationId: org._id,
      createdBy: admin._id,
      color: '#6366f1',
      status: 'ACTIVE',
      members: [admin._id, priya._id, rahul._id, aarav._id],
      taskCount: 0,
      completedTaskCount: 0,
    },
    {
      title: 'Mobile App MVP',
      description: 'iOS and Android app for on-the-go task management.',
      organizationId: org._id,
      createdBy: priya._id,
      color: '#0ea5e9',
      status: 'ACTIVE',
      members: [priya._id, rahul._id],
      taskCount: 0,
      completedTaskCount: 0,
    },
  ]);
  console.log(`Projects created: ${proj1.title}, ${proj2.title}`);

  // ── Tasks ─────────────────────────────────────────────────────────────────────
  const tasksData = [
    // Project 1 tasks
    { title: 'Set up monorepo structure',         description: 'Configure Nx or Turborepo for shared code.', projectId: proj1._id, assigneeId: aarav._id, status: 'DONE',        priority: 'HIGH',   dueDate: daysAgo(10) },
    { title: 'Design system & Tailwind config',   description: 'Create color tokens, typography scale.',     projectId: proj1._id, assigneeId: rahul._id, status: 'DONE',        priority: 'HIGH',   dueDate: daysAgo(7)  },
    { title: 'Auth — phone + OTP flow',            description: 'Implement JWT-based OTP login.',             projectId: proj1._id, assigneeId: aarav._id, status: 'DONE',        priority: 'URGENT', dueDate: daysAgo(5)  },
    { title: 'Kanban board component',             description: 'Drag-and-drop or click-to-advance columns.', projectId: proj1._id, assigneeId: rahul._id, status: 'IN_REVIEW',   priority: 'HIGH',   dueDate: daysFromNow(2)  },
    { title: 'Realtime Socket.io integration',    description: 'Push task changes to all connected clients.', projectId: proj1._id, assigneeId: aarav._id, status: 'IN_PROGRESS', priority: 'HIGH',   dueDate: daysFromNow(3)  },
    { title: 'Analytics dashboard',               description: 'Charts for task completion and member load.',  projectId: proj1._id, assigneeId: rahul._id, status: 'IN_PROGRESS', priority: 'MEDIUM', dueDate: daysFromNow(5)  },
    { title: 'Write API documentation',           description: 'Swagger / OpenAPI spec for all endpoints.',   projectId: proj1._id, assigneeId: priya._id,  status: 'TODO',        priority: 'LOW',    dueDate: daysFromNow(14) },
    { title: 'End-to-end test suite',             description: 'Playwright tests for login and kanban flows.', projectId: proj1._id, assigneeId: rahul._id, status: 'TODO',        priority: 'MEDIUM', dueDate: daysFromNow(10) },
    { title: 'Performance audit & optimisation',  description: 'Lighthouse score > 90 for all pages.',        projectId: proj1._id, assigneeId: rahul._id, status: 'TODO',        priority: 'LOW',    dueDate: daysFromNow(20) },
    // Project 2 tasks
    { title: 'React Native project scaffold',     description: 'Expo or bare RN with TypeScript.',            projectId: proj2._id, assigneeId: rahul._id, status: 'DONE',        priority: 'HIGH',   dueDate: daysAgo(8)  },
    { title: 'Login screen — mobile',             description: 'Match brand design, phone + OTP input.',      projectId: proj2._id, assigneeId: rahul._id, status: 'IN_PROGRESS', priority: 'HIGH',   dueDate: daysFromNow(4)  },
    { title: 'Push notification setup',           description: 'FCM + APNs credentials and handlers.',        projectId: proj2._id, assigneeId: aarav._id, status: 'TODO',        priority: 'MEDIUM', dueDate: daysFromNow(8)  },
    { title: 'Offline-first data sync',           description: 'Cache tasks locally with React Query.',        projectId: proj2._id, assigneeId: aarav._id, status: 'TODO',        priority: 'MEDIUM', dueDate: daysFromNow(12) },
    { title: 'App Store submission checklist',    description: 'Icons, screenshots, privacy policy.',          projectId: proj2._id, assigneeId: priya._id,  status: 'TODO',        priority: 'LOW',    dueDate: daysFromNow(30) },
  ];

  const tasks = await Task.insertMany(
    tasksData.map((t) => ({ ...t, organizationId: org._id, createdBy: admin._id, tags: [] }))
  );
  console.log(`Tasks created: ${tasks.length}`);

  // Update project task counts
  for (const proj of [proj1, proj2]) {
    const total = tasks.filter((t) => t.projectId.toString() === proj._id.toString()).length;
    const done  = tasks.filter((t) => t.projectId.toString() === proj._id.toString() && t.status === 'DONE').length;
    await Project.findByIdAndUpdate(proj._id, { taskCount: total, completedTaskCount: done });
  }

  console.log('\n══════════════════════════════════════════');
  console.log('  Seed complete! Login with these accounts:');
  console.log('══════════════════════════════════════════');
  console.log(`  Admin:  ${ADMIN_PHONE}  (${ADMIN_NAME})`);
  console.log(`  Priya:  +919811000001`);
  console.log(`  Rahul:  +919811000002`);
  console.log(`  Aarav:  +919811000003`);
  console.log('  OTP:    Use any number — check backend terminal for the generated OTP');
  console.log('══════════════════════════════════════════\n');

  await mongoose.disconnect();
  process.exit(0);
};

const daysAgo   = (n) => new Date(Date.now() - n * 86400000);
const daysFromNow = (n) => new Date(Date.now() + n * 86400000);

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
