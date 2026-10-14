const ExcelJS = require('exceljs');
const Task    = require('../models/Task');
const User    = require('../models/User');
const { asyncHandler, sendSuccess, sendError } = require('../utils/helpers');
const { TASK_STATUS, ROLE_HIERARCHY, SOCKET_EVENTS } = require('../utils/constants');
const { createNotification } = require('../services/notification.service');

const VALID_DEPTS      = ['Marketing', 'Marketplace', 'Sales', 'Production', 'R&D', 'Operations', 'Accounts & Finance', 'HR', 'Management'];
const VALID_PRIORITIES = ['low', 'medium', 'high', 'urgent', 'critical'];
const MAX_ROWS         = 200;

// ── Header key normalizer ─────────────────────────────────────────────────────
function normalizeHeaderKey(raw) {
  if (!raw) return '';
  const s = String(raw).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (s.startsWith('title'))                         return 'title';
  if (s.startsWith('desc'))                          return 'description';
  if (s.startsWith('dept') || s.startsWith('depart')) return 'department';
  if (s.startsWith('assigned') || s.includes('email')) return 'assignedtoemail';
  if (s.startsWith('prior'))                         return 'priority';
  if (s.startsWith('due') || s === 'date')           return 'duedate';
  if (s.startsWith('tasktype') || s === 'type')      return 'tasktype';
  if (s.startsWith('plat'))                          return 'platform';
  if (s.startsWith('tag'))                           return 'tags';
  if (s.startsWith('isdept') || s.startsWith('hub')) return 'isdepthub';
  return s;
}

// ── CSV parser (handles quoted fields) ───────────────────────────────────────
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const splitLine = (line) => {
    const vals = []; let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    vals.push(cur.trim());
    return vals;
  };

  const headers = splitLine(lines[0]).map(normalizeHeaderKey);
  const rows    = [];

  for (let i = 1; i < lines.length; i++) {
    const vals = splitLine(lines[i]);
    const data = {};
    let hasData = false;
    headers.forEach((h, idx) => {
      const v = (vals[idx] || '').replace(/^"|"$/g, '').trim();
      data[h] = v;
      if (v) hasData = true;
    });
    if (hasData) rows.push({ rowNum: i + 1, data });
  }
  return rows;
}

// ── XLSX parser ───────────────────────────────────────────────────────────────
async function parseXLSX(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.getWorksheet(1) || wb.worksheets[0];
  if (!ws) return [];

  const rawHeaders = ws.getRow(1).values.slice(1);
  const headers    = rawHeaders.map(normalizeHeaderKey);
  const rows       = [];

  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const values = row.values.slice(1);
    const data   = {};
    let hasData  = false;

    headers.forEach((h, idx) => {
      let val = values[idx];
      if (val === null || val === undefined) { data[h] = ''; return; }
      if (typeof val === 'object' && val?.text)           val = val.text;
      if (typeof val === 'object' && val?.result !== undefined) val = val.result;
      if (val instanceof Date)                            val = val.toISOString().split('T')[0];
      data[h] = String(val).trim();
      if (data[h]) hasData = true;
    });

    if (hasData) rows.push({ rowNum, data });
  });

  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/tasks/import/template
// ─────────────────────────────────────────────────────────────────────────────
exports.downloadTemplate = asyncHandler(async (req, res) => {
  const wb = new ExcelJS.Workbook();
  wb.creator  = 'Backero';
  wb.created  = new Date();

  // ── Main sheet ──────────────────────────────────────────────────────────────
  const ws = wb.addWorksheet('Tasks', { views: [{ state: 'frozen', ySplit: 1 }] });

  ws.columns = [
    { header: 'title *',                  key: 'title',       width: 36 },
    { header: 'description',              key: 'desc',        width: 46 },
    { header: 'department *',             key: 'dept',        width: 24 },
    { header: 'assignedToEmail',          key: 'email',       width: 34 },
    { header: 'priority',                 key: 'priority',    width: 14 },
    { header: 'dueDate (YYYY-MM-DD)',     key: 'dueDate',     width: 24 },
    { header: 'taskType',                 key: 'taskType',    width: 24 },
    { header: 'platform',                 key: 'platform',    width: 18 },
    { header: 'tags (comma-separated)',   key: 'tags',        width: 28 },
    { header: 'isDeptHub (true/false)',   key: 'isDeptHub',   width: 24 },
  ];

  // Header style
  const hRow = ws.getRow(1);
  hRow.height = 24;
  hRow.eachCell(cell => {
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
    cell.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border    = { bottom: { style: 'medium', color: { argb: 'FF818CF8' } } };
  });

  // Sample row — individual task (blue tint)
  ws.addRow({
    title: 'Design product packaging label',
    desc: 'Create Q3 label design for Product A — 2 variants',
    dept: 'Marketing',
    email: 'john@yourcompany.com',
    priority: 'high',
    dueDate: '2026-06-30',
    taskType: 'Ad Creative',
    platform: '',
    tags: 'design,packaging,q3',
    isDeptHub: 'false',
  });
  ws.getRow(2).eachCell(cell => {
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F9FF' } };
    cell.font      = { italic: true, color: { argb: 'FF374151' }, size: 10 };
    cell.alignment = { vertical: 'middle' };
  });

  // Sample row — dept hub (amber tint)
  ws.addRow({
    title: 'Q3 Product Launch',
    desc: 'Cross-department project for Q3 launch',
    dept: 'Management',
    email: '',
    priority: 'critical',
    dueDate: '2026-09-30',
    taskType: '',
    platform: '',
    tags: 'launch,q3',
    isDeptHub: 'true',
  });
  ws.getRow(3).eachCell(cell => {
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF9C3' } };
    cell.font      = { italic: true, color: { argb: 'FF92400E' }, size: 10 };
    cell.alignment = { vertical: 'middle' };
  });

  // Dropdowns for rows 2-501
  for (let row = 2; row <= 501; row++) {
    ws.getCell(`C${row}`).dataValidation = {
      type: 'list', allowBlank: true,
      formulae: ['"Marketing,Marketplace,Sales,Production,R&D,Operations,Accounts & Finance,HR,Management"'],
    };
    ws.getCell(`E${row}`).dataValidation = {
      type: 'list', allowBlank: true,
      formulae: ['"low,medium,high,urgent,critical"'],
    };
    ws.getCell(`J${row}`).dataValidation = {
      type: 'list', allowBlank: true,
      formulae: ['"true,false"'],
    };
  }

  // ── Instructions sheet ──────────────────────────────────────────────────────
  const wsI = wb.addWorksheet('Instructions');
  wsI.getColumn(1).width = 32;
  wsI.getColumn(2).width = 68;

  const rows = [
    ['Field',                             'Description'],
    ['title *',                           'REQUIRED — Task name (max 200 characters)'],
    ['description',                       'Optional task details (max 5000 characters)'],
    ['department *',                      'REQUIRED — Marketing / Marketplace / Sales / Production / R&D / Operations / Accounts & Finance / HR / Management'],
    ['assignedToEmail',                   'Email of the person to assign to (must be in your org)'],
    ['priority',                          'low / medium / high / urgent / critical  (default: medium)'],
    ['dueDate',                           'Date in YYYY-MM-DD format  e.g. 2026-06-30'],
    ['taskType',                          'Optional label — e.g. Ad Creative, Instagram Reel'],
    ['platform',                          'Optional — e.g. Amazon, Flipkart, Instagram'],
    ['tags',                              'Comma-separated — e.g. design,packaging,q3'],
    ['isDeptHub',                         'true = cross-dept hub root task     false = individual task'],
    ['',                                  ''],
    ['── Approval Rules ──',              ''],
    ['Manager → other dept\'s manager',   '→ Sent to Admin for approval before assignment'],
    ['isDeptHub=true by a Manager',       '→ Sent to Admin for approval before going live'],
    ['Regular / admin tasks',             '→ Created immediately'],
    ['',                                  ''],
    ['Max rows per import',               '200 rows'],
    ['Supported formats',                 '.xlsx  and  .csv'],
  ];

  rows.forEach((row, i) => {
    const r = wsI.addRow(row);
    if (i === 0) {
      r.height = 22;
      r.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      });
    } else if (row[0]?.includes('──')) {
      r.getCell(1).font = { bold: true, color: { argb: 'FF7C3AED' } };
    }
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="backero-task-import-template.xlsx"');
  await wb.xlsx.write(res);
  res.end();
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/tasks/import
// ─────────────────────────────────────────────────────────────────────────────
exports.importTasks = asyncHandler(async (req, res) => {
  const io = req.app.get('io');

  if (!req.file) return sendError(res, 'No file uploaded.', 400);

  const userLevel = ROLE_HIERARCHY[req.user.role] || 1;
  if (userLevel < ROLE_HIERARCHY['manager']) {
    return sendError(res, 'Only managers and above can import tasks.', 403);
  }

  // Parse
  let rows = [];
  try {
    rows = req.file.originalname.toLowerCase().endsWith('.csv')
      ? parseCSV(req.file.buffer.toString('utf8'))
      : await parseXLSX(req.file.buffer);
  } catch (e) {
    return sendError(res, `Could not parse file: ${e.message}`, 400);
  }

  if (rows.length === 0) return sendError(res, 'No data rows found in the file.', 400);
  if (rows.length > MAX_ROWS) return sendError(res, `Max ${MAX_ROWS} rows allowed per import.`, 400);

  // Pre-load org users for email→user lookup
  const orgUsers  = await User.find({ organizationId: req.user.organizationId })
    .select('_id email firstName lastName role department').lean();
  const emailMap  = new Map(orgUsers.map(u => [u.email.toLowerCase(), u]));

  // Pre-load admin-level users for notifications
  const admins = await User.find({
    organizationId: req.user.organizationId,
    role: { $in: ['admin', 'super_admin', 'founder', 'chairman'] },
  }).select('_id').lean();

  const results         = [];
  let importedCount     = 0;
  let pendingCount      = 0;
  let failedCount       = 0;

  for (const { rowNum, data } of rows) {
    const title         = data.title?.trim();
    const description   = data.description?.trim() || undefined;
    const department    = data.department?.trim();
    const assigneeEmail = (data.assignedtoemail || data.email || '').trim().toLowerCase();
    const rawPriority   = (data.priority || 'medium').trim().toLowerCase();
    const rawDueDate    = (data.duedate || data.due || '').trim();
    const taskType      = data.tasktype?.trim() || undefined;
    const platform      = data.platform?.trim() || undefined;
    const rawTags       = (data.tags || '').trim();
    const isDeptHub     = (data.isdepthub || '').trim().toLowerCase() === 'true';

    // ── Validate ────────────────────────────────────────────────────────────
    if (!title) {
      results.push({ row: rowNum, title: '(empty)', status: 'failed', reason: 'Title is required' });
      failedCount++; continue;
    }
    if (!department) {
      results.push({ row: rowNum, title, status: 'failed', reason: 'Department is required' });
      failedCount++; continue;
    }
    if (!VALID_DEPTS.includes(department)) {
      results.push({ row: rowNum, title, status: 'failed', reason: `Invalid department "${department}"` });
      failedCount++; continue;
    }
    if (!VALID_PRIORITIES.includes(rawPriority)) {
      results.push({ row: rowNum, title, status: 'failed', reason: `Invalid priority "${rawPriority}"` });
      failedCount++; continue;
    }

    let parsedDueDate;
    if (rawDueDate) {
      parsedDueDate = new Date(rawDueDate);
      if (isNaN(parsedDueDate.getTime())) {
        results.push({ row: rowNum, title, status: 'failed', reason: `Invalid date "${rawDueDate}" — use YYYY-MM-DD` });
        failedCount++; continue;
      }
    }

    let assignee = null;
    if (assigneeEmail) {
      assignee = emailMap.get(assigneeEmail);
      if (!assignee) {
        results.push({ row: rowNum, title, status: 'failed', reason: `No user found with email: ${assigneeEmail}` });
        failedCount++; continue;
      }
    }

    const tags = rawTags ? rawTags.split(',').map(t => t.trim()).filter(Boolean) : [];

    // ── Business rules (mirrors createTask) ─────────────────────────────────
    let pendingHubApproval        = false;
    let hubApprovalData;
    let pendingManagerAssignment;
    let actualAssignedTo          = assignee?._id;
    let taskStatus                = actualAssignedTo ? TASK_STATUS.ASSIGNED : TASK_STATUS.PENDING;

    // Manager creating a dept hub → needs admin approval
    if (userLevel === ROLE_HIERARCHY['manager'] && isDeptHub) {
      pendingHubApproval = true;
      hubApprovalData    = { status: 'pending', requestedBy: req.user._id };
      taskStatus         = TASK_STATUS.PENDING;
    }

    if (assignee) {
      const crossManager =
        userLevel === ROLE_HIERARCHY['manager'] &&
        ROLE_HIERARCHY[assignee.role] >= ROLE_HIERARCHY['manager'] &&
        assignee.department !== req.user.department;

      if (crossManager) {
        pendingManagerAssignment = { status: 'pending', requestedBy: req.user._id, pendingAssignee: assignee._id, requestedAt: new Date() };
        actualAssignedTo = undefined;
        taskStatus       = TASK_STATUS.PENDING;
      } else if (userLevel === ROLE_HIERARCHY['manager'] && req.user.department && assignee.department !== req.user.department && !isDeptHub) {
        results.push({ row: rowNum, title, status: 'failed', reason: `Cross-dept to non-manager not allowed (your dept: ${req.user.department}, assignee dept: ${assignee.department})` });
        failedCount++; continue;
      }
    }

    // ── Create ───────────────────────────────────────────────────────────────
    try {
      const task = await Task.create({
        organizationId: req.user.organizationId,
        title, description, department,
        assignedTo: actualAssignedTo,
        assignedBy: req.user._id,
        reportingManager: req.user._id,
        priority: rawPriority, dueDate: parsedDueDate,
        taskType, platform, tags,
        status: taskStatus,
        createdBy: req.user._id,
        updatedBy: req.user._id,
        pendingHubApproval,
        hubApproval: hubApprovalData,
        pendingManagerAssignment,
        activity: [{ action: 'Created via bulk import', performedBy: req.user._id, details: { title } }],
      });

      io?.to(`org:${req.user.organizationId}`).emit(SOCKET_EVENTS.TASK_CREATED, { task });

      if (pendingHubApproval) {
        for (const admin of admins) {
          await createNotification({
            organizationId: req.user.organizationId, recipient: admin._id,
            title: 'Dept Hub Approval Needed (Import)',
            message: `${req.user.firstName} ${req.user.lastName} imported Dept Hub "${title}". Review on Workflow Board.`,
            type: 'task', priority: 'high', actionUrl: '/workflow',
            reference: { model: 'Task', id: task._id }, channels: { inApp: true, whatsapp: false },
          }, io);
        }
        results.push({ row: rowNum, title, status: 'pending_hub_approval', taskId: task._id });
        pendingCount++;

      } else if (pendingManagerAssignment) {
        for (const admin of admins) {
          await createNotification({
            organizationId: req.user.organizationId, recipient: admin._id,
            title: 'Manager Assignment Approval Needed (Import)',
            message: `${req.user.firstName} ${req.user.lastName} imported task "${title}" → ${assignee.firstName} ${assignee.lastName} (${assignee.department}). Review on Workflow Board.`,
            type: 'task', priority: 'high', actionUrl: '/workflow',
            reference: { model: 'Task', id: task._id }, channels: { inApp: true, whatsapp: false },
          }, io);
        }
        results.push({ row: rowNum, title, status: 'pending_assignment', taskId: task._id, pendingAssignee: `${assignee.firstName} ${assignee.lastName}` });
        pendingCount++;

      } else {
        if (actualAssignedTo) {
          await createNotification({
            organizationId: req.user.organizationId, recipient: actualAssignedTo,
            title: 'New Task Assigned',
            message: `"${title}" assigned by ${req.user.firstName} ${req.user.lastName}${parsedDueDate ? `. Due: ${parsedDueDate.toLocaleDateString('en-IN')}` : ''}.`,
            type: 'task', priority: rawPriority === 'critical' || rawPriority === 'urgent' ? 'high' : 'medium',
            actionUrl: `/tasks/${task._id}`,
            reference: { model: 'Task', id: task._id }, channels: { inApp: true, whatsapp: false },
          }, io);
        }
        results.push({ row: rowNum, title, status: 'created', taskId: task._id });
        importedCount++;
      }
    } catch (e) {
      results.push({ row: rowNum, title: title || '(error)', status: 'failed', reason: e.message });
      failedCount++;
    }
  }

  sendSuccess(res, {
    summary: { total: rows.length, imported: importedCount, pendingApproval: pendingCount, failed: failedCount },
    results,
  }, `Import complete — ${importedCount} created, ${pendingCount} pending approval, ${failedCount} failed`);
});
