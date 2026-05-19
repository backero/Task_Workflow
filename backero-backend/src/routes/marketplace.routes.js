const router = require('express').Router();
const Task = require('../models/Task');
const MarketplaceDaily = require('../models/MarketplaceDaily');
const MarketplacePlan = require('../models/MarketplacePlan');
const { authenticate } = require('../middleware/auth.middleware');
const { orgIsolation } = require('../middleware/orgIsolation.middleware');
const { asyncHandler, sendSuccess, paginate, paginateResponse } = require('../utils/helpers');
const { MARKETPLACE_PLATFORMS } = require('../utils/constants');
const multer = require('multer');
const ExcelJS = require('exceljs');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.use(authenticate, orgIsolation);

// ── Tasks ─────────────────────────────────────────────────────────────────────

router.get('/tasks', asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, platform, status } = req.query;
  const { skip } = paginate(page, limit);
  const filter = { organizationId: req.user.organizationId, department: 'Marketplace' };
  if (platform) filter.platform = platform;
  if (status) filter.status = status;

  const [tasks, total] = await Promise.all([
    Task.find(filter)
      .populate('assignedTo', 'firstName lastName avatar')
      .populate('subTasks', 'status title')
      .sort({ dueDate: 1 })
      .skip(skip)
      .limit(parseInt(limit)),
    Task.countDocuments(filter),
  ]);
  sendSuccess(res, paginateResponse(tasks, total, page, limit));
}));

// ── Platform analytics ────────────────────────────────────────────────────────

router.get('/analytics', asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const platformStats = await Task.aggregate([
    { $match: { organizationId: orgId, department: 'Marketplace' } },
    {
      $group: {
        _id: '$platform',
        total:     { $sum: 1 },
        completed: { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } },
        overdue:   { $sum: { $cond: ['$isOverdue', 1, 0] } },
      },
    },
    {
      $addFields: {
        completionRate: {
          $cond: [
            { $gt: ['$total', 0] },
            { $multiply: [{ $divide: ['$completed', '$total'] }, 100] },
            0,
          ],
        },
      },
    },
  ]);

  const healthScore = platformStats.reduce((acc, p) => {
    acc[p._id] = Math.round(p.completionRate - (p.overdue * 5));
    return acc;
  }, {});

  sendSuccess(res, { analytics: { platformStats, healthScore, platforms: MARKETPLACE_PLATFORMS } });
}));

// ── Daily Numbers ─────────────────────────────────────────────────────────────

// POST /marketplace/daily — upsert today's (or given date's) numbers
router.post('/daily', asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const { totalSales, ctr, cvr, adSpend, adRevenue, returns, worstSkuCvr, notes, date } = req.body;

  const entryDate = date ? new Date(date) : new Date();
  entryDate.setUTCHours(0, 0, 0, 0);

  const entry = await MarketplaceDaily.findOneAndUpdate(
    { organizationId: orgId, date: entryDate },
    {
      totalSales: Number(totalSales) || 0,
      ctr:        Number(ctr)        || 0,
      cvr:        Number(cvr)        || 0,
      adSpend:    Number(adSpend)    || 0,
      adRevenue:  Number(adRevenue)  || 0,
      returns:    Number(returns)    || 0,
      worstSkuCvr: Number(worstSkuCvr) || 0,
      notes:      notes || '',
      createdBy:  req.user._id,
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  sendSuccess(res, { entry });
}));

// GET /marketplace/daily/week — Mon-Sun entries for current week
router.get('/daily/week', asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;

  // Use a wide ±8-day window to avoid timezone edge cases, then return all
  const now = new Date();
  const rangeStart = new Date(now);
  rangeStart.setUTCDate(now.getUTCDate() - 7);
  rangeStart.setUTCHours(0, 0, 0, 0);

  const rangeEnd = new Date(now);
  rangeEnd.setUTCDate(now.getUTCDate() + 1);
  rangeEnd.setUTCHours(23, 59, 59, 999);

  const entries = await MarketplaceDaily.find({
    organizationId: orgId,
    date: { $gte: rangeStart, $lte: rangeEnd },
  }).sort({ date: 1 }).limit(14); // at most 2 weeks

  sendSuccess(res, { entries });
}));

// GET /marketplace/daily/today — today's entry (pre-fill form)
router.get('/daily/today', asyncHandler(async (req, res) => {
  const orgId = req.user.organizationId;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const entry = await MarketplaceDaily.findOne({ organizationId: orgId, date: today });
  sendSuccess(res, { entry: entry || null });
}));

// ── Platform Plans (Excel import/export) ──────────────────────────────────────

// GET /marketplace/plans/:platform — fetch imported plan (or null)
router.get('/plans/:platform', asyncHandler(async (req, res) => {
  const plan = await MarketplacePlan.findOne({
    organizationId: req.user.organizationId,
    platform: req.params.platform,
  }).lean();
  sendSuccess(res, { plan: plan || null });
}));

// GET /marketplace/plans/:platform/template — download blank Excel template
router.get('/plans/:platform/template', asyncHandler(async (req, res) => {
  const platform = req.params.platform;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Plan');

  ws.columns = [
    { header: 'Week',              key: 'week',       width: 8  },
    { header: 'Week Name',         key: 'name',       width: 20 },
    { header: 'Focus',             key: 'focus',      width: 35 },
    { header: 'Must (Non-Neg)',    key: 'mustNonNeg', width: 40 },
    { header: 'Day',               key: 'day',        width: 8  },
    { header: 'Task',              key: 'task',       width: 55 },
    { header: 'Note',              key: 'note',       width: 30 },
  ];

  // Style header row
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFA500' } };

  // Add a sample row so user understands the format
  ws.addRow({ week: 1, name: 'FOUNDATION', focus: 'Launch setup and baseline audit', mustNonNeg: 'All hero SKUs live and in stock', day: 'Mon', task: 'Audit all hero SKUs: CVR, margin, buy box', note: 'Use Seller Central reports' });
  ws.addRow({ week: 1, name: 'FOUNDATION', focus: 'Launch setup and baseline audit', mustNonNeg: 'All hero SKUs live and in stock', day: 'Mon', task: 'Set weekly ad budget path based on last week P&L', note: '' });
  ws.addRow({ week: 1, name: 'FOUNDATION', focus: 'Launch setup and baseline audit', mustNonNeg: 'All hero SKUs live and in stock', day: 'Tue', task: 'Check F-Assured / FBA eligibility for all SKUs', note: '' });

  const infoWs = wb.addWorksheet('Instructions');
  infoWs.getCell('A1').value = 'HOW TO USE THIS TEMPLATE';
  infoWs.getCell('A1').font = { bold: true, size: 14 };
  infoWs.getCell('A3').value = '1. Fill the "Plan" sheet with your week-wise tasks.';
  infoWs.getCell('A4').value = '2. Week: number 1–12';
  infoWs.getCell('A5').value = '3. Week Name: short label (e.g. FOUNDATION, LAUNCH, SCALE)';
  infoWs.getCell('A6').value = '4. Focus: one-line focus for the week';
  infoWs.getCell('A7').value = '5. Must (Non-Neg): the one non-negotiable rule for the week';
  infoWs.getCell('A8').value = '6. Day: Mon / Tue / Wed / Thu / Fri / Sat';
  infoWs.getCell('A9').value = '7. Task: the task description';
  infoWs.getCell('A10').value = '8. Note: optional hint text';
  infoWs.getCell('A12').value = 'Save file and upload using the Import Plan button in the app.';
  infoWs.columns = [{ width: 65 }];

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${platform}-plan-template.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}));

// POST /marketplace/plans/:platform/import — parse Excel → save to DB
router.post('/plans/:platform/import', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

  const platform = req.params.platform;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(req.file.buffer);

  const ws = wb.getWorksheet('Plan');
  if (!ws) return res.status(400).json({ success: false, message: 'Sheet named "Plan" not found in Excel' });

  const VALID_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const weeksMap = {};

  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return; // skip header
    const [week, name, focus, mustNonNeg, day, task, note] = row.values.slice(1);
    if (!week || !name || !day || !task) return;

    const wNum = parseInt(week);
    const dayStr = String(day).trim();
    if (!VALID_DAYS.includes(dayStr)) return;

    if (!weeksMap[wNum]) {
      weeksMap[wNum] = {
        week: wNum,
        name: String(name).trim().toUpperCase(),
        focus: focus ? String(focus).trim() : '',
        mustNonNeg: mustNonNeg ? String(mustNonNeg).trim() : '',
        specific: { Mon: [], Tue: [], Wed: [], Thu: [], Fri: [], Sat: [] },
      };
    }

    const taskList = weeksMap[wNum].specific[dayStr];
    taskList.push({
      id: `imp_${wNum}_${dayStr}_${taskList.length + 1}`,
      text: String(task).trim(),
      note: note ? String(note).trim() : '',
    });
  });

  const weeks = Object.values(weeksMap).sort((a, b) => a.week - b.week);
  if (weeks.length === 0) return res.status(400).json({ success: false, message: 'No valid rows found. Check that Day is Mon/Tue/Wed/Thu/Fri/Sat and Task is filled.' });

  await MarketplacePlan.findOneAndUpdate(
    { organizationId: req.user.organizationId, platform },
    { weeks, importedBy: req.user._id },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  sendSuccess(res, { message: `${platform} plan imported — ${weeks.length} weeks loaded`, weeks: weeks.length });
}));

module.exports = router;
