const Task          = require('../models/Task');
const User          = require('../models/User');
const Product       = require('../models/Product');
const StockMovement = require('../models/StockMovement');
const Transaction   = require('../models/Transaction');
const Invoice       = require('../models/Invoice');
const { success }   = require('../utils/response');
const logger        = require('../utils/logger');
const PDFDocument   = require('pdfkit');
const ExcelJS       = require('exceljs');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const parseDateRange = (from, to) => {
  const range = {};
  if (from) range.$gte = new Date(from);
  if (to) {
    const d = new Date(to);
    d.setHours(23, 59, 59, 999);
    range.$lte = d;
  }
  return Object.keys(range).length > 0 ? range : null;
};

// ─── Data Builders ───────────────────────────────────────────────────────────

const buildTaskReportData = async (orgId, query) => {
  const { from, to, status, priority, assigneeId } = query;
  const filter = { organizationId: orgId };
  const dateRange = parseDateRange(from, to);
  if (dateRange)  filter.createdAt  = dateRange;
  if (status)     filter.status     = status;
  if (priority)   filter.priority   = priority;
  if (assigneeId) filter.assigneeId = assigneeId;

  const [tasks, statsByStatus, statsByPriority, overdue] = await Promise.all([
    Task.find(filter)
      .populate('assigneeId', 'name phone')
      .populate('projectId', 'title')
      .sort({ createdAt: -1 })
      .limit(500)
      .lean(),
    Task.aggregate([
      { $match: filter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Task.aggregate([
      { $match: filter },
      { $group: { _id: '$priority', count: { $sum: 1 } } },
    ]),
    Task.countDocuments({
      ...filter,
      status: { $ne: 'DONE' },
      dueDate: { $lt: new Date() },
    }),
  ]);

  const byStatus   = statsByStatus.reduce((a, s)  => { a[s._id] = s.count; return a; }, {});
  const byPriority = statsByPriority.reduce((a, s) => { a[s._id] = s.count; return a; }, {});
  const total      = tasks.length;
  const completed  = byStatus.DONE || 0;

  return {
    summary: {
      total,
      completed,
      overdue,
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
      byStatus: {
        TODO: byStatus.TODO || 0,
        IN_PROGRESS: byStatus.IN_PROGRESS || 0,
        IN_REVIEW: byStatus.IN_REVIEW || 0,
        DONE: byStatus.DONE || 0,
      },
      byPriority: {
        LOW: byPriority.LOW || 0,
        MEDIUM: byPriority.MEDIUM || 0,
        HIGH: byPriority.HIGH || 0,
        URGENT: byPriority.URGENT || 0,
      },
    },
    tasks,
  };
};

const buildEmployeeReportData = async (orgId, query) => {
  const { from, to, department, role } = query;
  const empFilter = { organizationId: orgId };
  if (department) empFilter.department = new RegExp(department, 'i');
  if (role)       empFilter.role       = role;

  const employees = await User.find(empFilter)
    .select('_id name phone email role department isActive joiningDate')
    .lean();

  const empIds    = employees.map(e => e._id);
  const taskFilter = { organizationId: orgId, assigneeId: { $in: empIds } };
  const dateRange  = parseDateRange(from, to);
  if (dateRange) taskFilter.createdAt = dateRange;

  const taskStats = await Task.aggregate([
    { $match: taskFilter },
    {
      $group: {
        _id: '$assigneeId',
        total:     { $sum: 1 },
        completed: { $sum: { $cond: [{ $eq: ['$status', 'DONE'] }, 1, 0] } },
        overdue: {
          $sum: {
            $cond: [
              { $and: [{ $ne: ['$status', 'DONE'] }, { $lt: ['$dueDate', new Date()] }, { $ne: ['$dueDate', null] }] },
              1, 0,
            ],
          },
        },
      },
    },
  ]);

  const statsMap = taskStats.reduce((a, s) => { a[String(s._id)] = s; return a; }, {});

  const data = employees.map(e => {
    const s = statsMap[String(e._id)] || { total: 0, completed: 0, overdue: 0 };
    return {
      ...e,
      taskStats: {
        total:          s.total,
        completed:      s.completed,
        overdue:        s.overdue,
        completionRate: s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0,
      },
    };
  }).sort((a, b) => b.taskStats.completionRate - a.taskStats.completionRate);

  const active  = employees.filter(e => e.isActive).length;
  const avgRate = data.length > 0
    ? Math.round(data.reduce((a, e) => a + e.taskStats.completionRate, 0) / data.length)
    : 0;

  return {
    summary: { total: employees.length, active, avgCompletionRate: avgRate },
    data,
  };
};

const buildInventoryReportData = async (orgId, query) => {
  const { from, to, category, movementType } = query;
  const prodFilter = { organizationId: orgId, isActive: true };
  if (category) prodFilter.category = new RegExp(category, 'i');

  const movQuery  = { organizationId: orgId };
  const dateRange = parseDateRange(from, to);
  if (dateRange)     movQuery.createdAt = dateRange;
  if (movementType)  movQuery.type      = movementType;

  const [products, movements, movStats] = await Promise.all([
    Product.find(prodFilter).lean(),
    StockMovement.find(movQuery)
      .populate('productId',  'name sku')
      .populate('performedBy', 'name phone')
      .sort({ createdAt: -1 })
      .limit(500)
      .lean(),
    StockMovement.aggregate([
      { $match: movQuery },
      { $group: { _id: '$type', totalQty: { $sum: '$quantity' }, count: { $sum: 1 } } },
    ]),
  ]);

  const lowStock   = products.filter(p => p.quantity <= p.minStockThreshold);
  const totalValue = products.reduce((a, p) => a + (p.quantity * (p.unitPrice || 0)), 0);
  const byType     = movStats.reduce((a, s) => { a[s._id] = { qty: s.totalQty, count: s.count }; return a; }, {});

  return {
    summary: {
      totalProducts:  products.length,
      lowStockCount:  lowStock.length,
      totalValue,
      movementsByType: byType,
    },
    products,
    movements,
  };
};

const buildFinanceReportData = async (orgId, query) => {
  const { from, to, type, category } = query;
  const txFilter  = { organizationId: orgId };
  const dateRange = parseDateRange(from, to);
  if (dateRange) txFilter.date = dateRange;
  if (type)      txFilter.type = type;
  if (category)  txFilter.category = new RegExp(category, 'i');

  const [transactions, txStats, invoiceStats, monthlyTrend] = await Promise.all([
    Transaction.find(txFilter).sort({ date: -1 }).limit(500).lean(),
    Transaction.aggregate([
      { $match: txFilter },
      { $group: { _id: '$type', total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    Invoice.aggregate([
      { $match: { organizationId: orgId } },
      { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$totalAmount' } } },
    ]),
    Transaction.aggregate([
      { $match: { organizationId: orgId, ...(dateRange ? { date: dateRange } : {}) } },
      {
        $group: {
          _id: { year: { $year: '$date' }, month: { $month: '$date' }, type: '$type' },
          total: { $sum: '$amount' },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]),
  ]);

  const byType     = txStats.reduce((a, s)      => { a[s._id] = { total: s.total, count: s.count }; return a; }, {});
  const byInvStatus = invoiceStats.reduce((a, s) => { a[s._id] = { count: s.count, total: s.total }; return a; }, {});
  const revenue  = byType.INCOME?.total  || 0;
  const expenses = byType.EXPENSE?.total || 0;

  const trendMap = {};
  monthlyTrend.forEach(d => {
    const key = `${d._id.year}-${String(d._id.month).padStart(2, '0')}`;
    if (!trendMap[key]) trendMap[key] = { month: key, income: 0, expense: 0 };
    if (d._id.type === 'INCOME') trendMap[key].income  = d.total;
    else                         trendMap[key].expense = d.total;
  });
  const trend = Object.values(trendMap).sort((a, b) => a.month.localeCompare(b.month));

  return {
    summary: { revenue, expenses, netProfit: revenue - expenses, invoices: byInvStatus },
    trend,
    transactions,
  };
};

// ─── API Endpoints ────────────────────────────────────────────────────────────

const getTaskReport      = async (req, res) => { return success(res, await buildTaskReportData(req.user.organizationId, req.query)); };
const getEmployeeReport  = async (req, res) => { return success(res, await buildEmployeeReportData(req.user.organizationId, req.query)); };
const getInventoryReport = async (req, res) => { return success(res, await buildInventoryReportData(req.user.organizationId, req.query)); };
const getFinanceReport   = async (req, res) => { return success(res, await buildFinanceReportData(req.user.organizationId, req.query)); };

// ─── PDF Export ───────────────────────────────────────────────────────────────

const exportReportPDF = async (req, res) => {
  const { type } = req.params;
  const orgId    = req.user.organizationId;
  const builders = { tasks: buildTaskReportData, employees: buildEmployeeReportData, inventory: buildInventoryReportData, finance: buildFinanceReportData };
  if (!builders[type]) return res.status(400).json({ success: false, message: 'Invalid report type' });

  try {
    const data = await builders[type](orgId, req.query);
    const doc  = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${type}-report.pdf"`);
    doc.pipe(res);

    const BRAND = '#4f46e5';
    const W     = 495;

    // Header band
    doc.rect(50, 50, W, 50).fill(BRAND);
    doc.fillColor('#ffffff').fontSize(18).font('Helvetica-Bold').text('Backero', 65, 62);
    doc.fontSize(10).font('Helvetica').text(`${type.charAt(0).toUpperCase() + type.slice(1)} Report`, 65, 82);
    doc.text(new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }), 430, 82, { width: 110, align: 'right' });

    doc.fillColor('#111827');
    let y = 120;

    const drawSummaryCards = (items) => {
      const cols = Math.min(items.length, 4);
      const cardW = Math.floor(W / cols) - 4;
      items.forEach((item, i) => {
        const x = 50 + i * (cardW + 4);
        doc.rect(x, y, cardW, 28).fill('#f3f4f6').stroke('#e5e7eb');
        doc.fillColor('#6b7280').font('Helvetica').fontSize(8).text(item[0], x + 6, y + 5, { width: cardW - 8 });
        doc.fillColor('#111827').font('Helvetica-Bold').fontSize(12).text(String(item[1]), x + 6, y + 14, { width: cardW - 8 });
      });
      return y + 44;
    };

    const drawTableHeader = (cols) => {
      doc.rect(50, y, W, 18).fill('#e0e7ff');
      doc.fillColor('#3730a3').font('Helvetica-Bold').fontSize(8);
      cols.forEach(col => doc.text(col.label, col.x, y + 5, { width: col.w }));
      return y + 18;
    };

    const drawRow = (cols, rowData, idx) => {
      if (idx % 2 === 0) doc.rect(50, y, W, 16).fill('#f9fafb').stroke('#f3f4f6');
      doc.font('Helvetica').fontSize(8);
      cols.forEach((col, ci) => {
        const val = rowData[ci];
        doc.fillColor(col.color ? col.color(val) : '#111827');
        doc.text(String(val ?? ''), col.x, y + 4, { width: col.w });
      });
      return y + 16;
    };

    if (type === 'tasks') {
      const { summary, tasks } = data;
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#111827').text('Summary', 50, y); y += 14;
      y = drawSummaryCards([
        ['Total Tasks', summary.total],
        ['Completed', summary.completed],
        ['Overdue', summary.overdue],
        ['Completion Rate', `${summary.completionRate}%`],
      ]);
      const cols = [
        { label: 'Title',    x: 55,  w: 150 },
        { label: 'Status',   x: 210, w: 70  },
        { label: 'Priority', x: 285, w: 60  },
        { label: 'Assignee', x: 350, w: 100 },
        { label: 'Due Date', x: 455, w: 80  },
      ];
      y = drawTableHeader(cols);
      (tasks || []).slice(0, 80).forEach((t, i) => {
        if (y > 775) { doc.addPage(); y = 50; }
        y = drawRow(cols, [
          (t.title || '').slice(0, 32),
          t.status || '',
          t.priority || '',
          (t.assigneeId?.name || t.assigneeId?.phone || '-').slice(0, 18),
          t.dueDate ? new Date(t.dueDate).toLocaleDateString('en-IN') : '-',
        ], i);
      });

    } else if (type === 'employees') {
      const { summary, data: empData } = data;
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#111827').text('Summary', 50, y); y += 14;
      y = drawSummaryCards([
        ['Total Employees', summary.total],
        ['Active', summary.active],
        ['Avg Completion Rate', `${summary.avgCompletionRate}%`],
      ]);
      const cols = [
        { label: 'Name',       x: 55,  w: 120 },
        { label: 'Department', x: 180, w: 100 },
        { label: 'Role',       x: 285, w: 70  },
        { label: 'Tasks',      x: 360, w: 40  },
        { label: 'Done',       x: 405, w: 40  },
        { label: 'Overdue',    x: 450, w: 45  },
        { label: 'Rate',       x: 500, w: 40  },
      ];
      y = drawTableHeader(cols);
      (empData || []).forEach((e, i) => {
        if (y > 775) { doc.addPage(); y = 50; }
        y = drawRow(cols, [
          (e.name || e.phone || '').slice(0, 20),
          (e.department || '-').slice(0, 18),
          e.role || '',
          e.taskStats.total,
          e.taskStats.completed,
          e.taskStats.overdue,
          `${e.taskStats.completionRate}%`,
        ], i);
      });

    } else if (type === 'inventory') {
      const { summary, products } = data;
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#111827').text('Summary', 50, y); y += 14;
      y = drawSummaryCards([
        ['Total Products', summary.totalProducts],
        ['Low Stock Items', summary.lowStockCount],
        ['Total Stock Value', `₹${Math.round(summary.totalValue).toLocaleString('en-IN')}`],
      ]);
      const cols = [
        { label: 'Product',       x: 55,  w: 130 },
        { label: 'SKU',           x: 190, w: 80  },
        { label: 'Category',      x: 275, w: 75  },
        { label: 'Stock',         x: 355, w: 45  },
        { label: 'Min Threshold', x: 405, w: 55  },
        { label: 'Unit Price',    x: 465, w: 75  },
      ];
      y = drawTableHeader(cols);
      (products || []).slice(0, 80).forEach((p, i) => {
        if (y > 775) { doc.addPage(); y = 50; }
        const isLow = p.quantity <= p.minStockThreshold;
        y = drawRow(cols, [
          (p.name || '').slice(0, 25),
          p.sku || '',
          (p.category || '-').slice(0, 14),
          p.quantity,
          p.minStockThreshold,
          `₹${(p.unitPrice || 0).toLocaleString('en-IN')}`,
        ].map((v, ci) => ci === 3 && isLow ? v : v), i);
        if (isLow) {
          doc.fillColor('#dc2626').fontSize(7).text('LOW', 545, y - 12, { width: 28 });
        }
      });

    } else if (type === 'finance') {
      const { summary, transactions } = data;
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#111827').text('Summary', 50, y); y += 14;
      y = drawSummaryCards([
        ['Revenue',   `₹${Math.round(summary.revenue).toLocaleString('en-IN')}`],
        ['Expenses',  `₹${Math.round(summary.expenses).toLocaleString('en-IN')}`],
        ['Net Profit', `₹${Math.round(summary.netProfit).toLocaleString('en-IN')}`],
        ['Net',        summary.netProfit >= 0 ? 'Profit' : 'Loss'],
      ]);
      const cols = [
        { label: 'Date',        x: 55,  w: 65  },
        { label: 'Description', x: 125, w: 155 },
        { label: 'Category',    x: 285, w: 80  },
        { label: 'Type',        x: 370, w: 55, color: (v) => v === 'INCOME' ? '#16a34a' : '#dc2626' },
        { label: 'Amount (₹)',  x: 430, w: 110 },
      ];
      y = drawTableHeader(cols);
      (transactions || []).slice(0, 80).forEach((t, i) => {
        if (y > 775) { doc.addPage(); y = 50; }
        y = drawRow(cols, [
          new Date(t.date).toLocaleDateString('en-IN'),
          (t.description || '').slice(0, 32),
          (t.category || '-').slice(0, 15),
          t.type,
          `₹${(t.amount || 0).toLocaleString('en-IN')}`,
        ], i);
      });
    }

    // Footer
    doc.fontSize(7).fillColor('#9ca3af').font('Helvetica')
      .text(`Generated by Backero · ${new Date().toLocaleString('en-IN')}`, 50, 820, { align: 'center', width: W });

    doc.end();
  } catch (err) {
    logger.error(`exportReportPDF [${type}]: ${err.message}`);
    throw err;
  }
};

// ─── Excel Export ─────────────────────────────────────────────────────────────

const exportReportExcel = async (req, res) => {
  const { type } = req.params;
  const orgId    = req.user.organizationId;
  const builders = { tasks: buildTaskReportData, employees: buildEmployeeReportData, inventory: buildInventoryReportData, finance: buildFinanceReportData };
  if (!builders[type]) return res.status(400).json({ success: false, message: 'Invalid report type' });

  try {
    const data     = await builders[type](orgId, req.query);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Backero';
    workbook.created = new Date();

    const BRAND_HEX  = '4F46E5';
    const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_HEX } };
    const altFill    = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F9FAFB' } };

    const styleHeaderRow = (row) => {
      row.height = 22;
      row.eachCell(cell => {
        cell.fill      = headerFill;
        cell.font      = { bold: true, color: { argb: 'FFFFFF' }, size: 10 };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border    = { bottom: { style: 'thin', color: { argb: '6366F1' } } };
      });
    };

    const altRow = (row, i) => {
      if (i % 2 === 0) row.eachCell(cell => { cell.fill = altFill; });
    };

    if (type === 'tasks') {
      const sheet = workbook.addWorksheet('Tasks Report');
      sheet.columns = [
        { header: 'Title',     key: 'title',     width: 40 },
        { header: 'Status',    key: 'status',     width: 15 },
        { header: 'Priority',  key: 'priority',   width: 12 },
        { header: 'Project',   key: 'project',    width: 28 },
        { header: 'Assignee',  key: 'assignee',   width: 22 },
        { header: 'Due Date',  key: 'dueDate',    width: 15 },
        { header: 'Created At',key: 'createdAt',  width: 15 },
      ];
      styleHeaderRow(sheet.getRow(1));
      (data.tasks || []).forEach((t, i) => {
        const row = sheet.addRow({
          title:     t.title || '',
          status:    t.status || '',
          priority:  t.priority || '',
          project:   t.projectId?.title || '',
          assignee:  t.assigneeId?.name || t.assigneeId?.phone || '',
          dueDate:   t.dueDate    ? new Date(t.dueDate).toLocaleDateString('en-IN')    : '',
          createdAt: t.createdAt  ? new Date(t.createdAt).toLocaleDateString('en-IN')  : '',
        });
        altRow(row, i);
      });

    } else if (type === 'employees') {
      const sheet = workbook.addWorksheet('Employee Report');
      sheet.columns = [
        { header: 'Name',          key: 'name',         width: 25 },
        { header: 'Phone',         key: 'phone',         width: 18 },
        { header: 'Email',         key: 'email',         width: 30 },
        { header: 'Department',    key: 'department',    width: 20 },
        { header: 'Role',          key: 'role',          width: 15 },
        { header: 'Status',        key: 'status',        width: 12 },
        { header: 'Total Tasks',   key: 'totalTasks',    width: 13 },
        { header: 'Completed',     key: 'completed',     width: 13 },
        { header: 'Overdue',       key: 'overdue',       width: 12 },
        { header: 'Completion %',  key: 'rate',          width: 14 },
        { header: 'Joining Date',  key: 'joiningDate',   width: 15 },
      ];
      styleHeaderRow(sheet.getRow(1));
      (data.data || []).forEach((e, i) => {
        const row = sheet.addRow({
          name:        e.name || '',
          phone:       e.phone || '',
          email:       e.email || '',
          department:  e.department || '',
          role:        e.role || '',
          status:      e.isActive ? 'Active' : 'Inactive',
          totalTasks:  e.taskStats.total,
          completed:   e.taskStats.completed,
          overdue:     e.taskStats.overdue,
          rate:        `${e.taskStats.completionRate}%`,
          joiningDate: e.joiningDate ? new Date(e.joiningDate).toLocaleDateString('en-IN') : '',
        });
        altRow(row, i);
        if (!e.isActive) row.getCell('status').font = { color: { argb: '9CA3AF' } };
      });

    } else if (type === 'inventory') {
      const prodSheet = workbook.addWorksheet('Products');
      prodSheet.columns = [
        { header: 'Name',          key: 'name',      width: 32 },
        { header: 'SKU',           key: 'sku',        width: 18 },
        { header: 'Category',      key: 'category',   width: 18 },
        { header: 'Quantity',      key: 'qty',        width: 12 },
        { header: 'Min Threshold', key: 'threshold',  width: 16 },
        { header: 'Unit Price',    key: 'unitPrice',  width: 14 },
        { header: 'Stock Value',   key: 'value',      width: 14 },
        { header: 'Status',        key: 'status',     width: 14 },
      ];
      styleHeaderRow(prodSheet.getRow(1));
      (data.products || []).forEach((p, i) => {
        const isLow = p.quantity <= p.minStockThreshold;
        const row = prodSheet.addRow({
          name:      p.name || '',
          sku:       p.sku || '',
          category:  p.category || '',
          qty:       p.quantity || 0,
          threshold: p.minStockThreshold || 0,
          unitPrice: p.unitPrice || 0,
          value:     (p.quantity || 0) * (p.unitPrice || 0),
          status:    isLow ? 'Low Stock' : 'OK',
        });
        altRow(row, i);
        if (isLow) row.getCell('status').font = { bold: true, color: { argb: 'DC2626' } };
      });

      const movSheet = workbook.addWorksheet('Stock Movements');
      movSheet.columns = [
        { header: 'Date',         key: 'date',    width: 18 },
        { header: 'Product',      key: 'product', width: 30 },
        { header: 'SKU',          key: 'sku',     width: 16 },
        { header: 'Type',         key: 'type',    width: 14 },
        { header: 'Quantity',     key: 'qty',     width: 12 },
        { header: 'Before',       key: 'before',  width: 10 },
        { header: 'After',        key: 'after',   width: 10 },
        { header: 'Performed By', key: 'by',      width: 22 },
        { header: 'Note',         key: 'note',    width: 35 },
      ];
      styleHeaderRow(movSheet.getRow(1));
      (data.movements || []).forEach((m, i) => {
        const row = movSheet.addRow({
          date:    new Date(m.createdAt).toLocaleDateString('en-IN'),
          product: m.productId?.name || '',
          sku:     m.productId?.sku  || '',
          type:    m.type   || '',
          qty:     m.quantity || 0,
          before:  m.quantityBefore || 0,
          after:   m.quantityAfter  || 0,
          by:      m.performedBy?.name || m.performedBy?.phone || '',
          note:    m.note || '',
        });
        altRow(row, i);
        const typeCell = row.getCell('type');
        typeCell.font = { color: { argb: m.type === 'IN' ? '16A34A' : m.type === 'OUT' ? 'DC2626' : 'D97706' }, bold: true };
      });

    } else if (type === 'finance') {
      const txSheet = workbook.addWorksheet('Transactions');
      txSheet.columns = [
        { header: 'Date',           key: 'date',        width: 15 },
        { header: 'Description',    key: 'description', width: 38 },
        { header: 'Category',       key: 'category',    width: 20 },
        { header: 'Type',           key: 'type',        width: 12 },
        { header: 'Amount (₹)',     key: 'amount',      width: 16 },
        { header: 'Payment Method', key: 'method',      width: 18 },
        { header: 'Reference',      key: 'reference',   width: 20 },
      ];
      styleHeaderRow(txSheet.getRow(1));
      (data.transactions || []).forEach((t, i) => {
        const row = txSheet.addRow({
          date:        new Date(t.date).toLocaleDateString('en-IN'),
          description: t.description || '',
          category:    t.category    || '',
          type:        t.type        || '',
          amount:      t.amount      || 0,
          method:      t.paymentMethod || '',
          reference:   t.reference    || '',
        });
        altRow(row, i);
        row.getCell('type').font = { color: { argb: t.type === 'INCOME' ? '16A34A' : 'DC2626' }, bold: true };
      });

      const sumSheet = workbook.addWorksheet('Monthly Summary');
      sumSheet.columns = [{ header: 'Month', key: 'month', width: 14 }, { header: 'Income (₹)', key: 'income', width: 16 }, { header: 'Expense (₹)', key: 'expense', width: 16 }, { header: 'Net (₹)', key: 'net', width: 16 }];
      styleHeaderRow(sumSheet.getRow(1));
      (data.trend || []).forEach((t, i) => {
        const row = sumSheet.addRow({ month: t.month, income: t.income, expense: t.expense, net: t.income - t.expense });
        altRow(row, i);
        const netCell = row.getCell('net');
        netCell.font = { color: { argb: (t.income - t.expense) >= 0 ? '16A34A' : 'DC2626' }, bold: true };
      });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${type}-report.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    logger.error(`exportReportExcel [${type}]: ${err.message}`);
    throw err;
  }
};

module.exports = { getTaskReport, getEmployeeReport, getInventoryReport, getFinanceReport, exportReportPDF, exportReportExcel };
