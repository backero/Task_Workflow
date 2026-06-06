const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const C = {
  primary:   '#1a2744',
  accent:    '#2563eb',
  success:   '#16a34a',
  danger:    '#dc2626',
  warning:   '#d97706',
  purple:    '#7c3aed',
  teal:      '#0891b2',
  gray:      '#6b7280',
  lightGray: '#f3f4f6',
  white:     '#ffffff',
  border:    '#d1d5db',
};

const fmt  = (n) => (n || 0).toLocaleString('en-IN');
const fmtD = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—';

// Draws a coloured stat box, returns next y
const statBox = (doc, label, value, x, y, w, color) => {
  doc.rect(x, y, w, 50).fill(C.lightGray);
  doc.rect(x, y, w, 3).fill(color);
  doc.fillColor(C.gray).fontSize(7).font('Helvetica')
     .text(label.toUpperCase(), x + 6, y + 9, { width: w - 12, lineBreak: false });
  doc.fillColor(C.primary).fontSize(14).font('Helvetica-Bold')
     .text(String(value), x + 6, y + 22, { width: w - 12, lineBreak: false });
  return y + 56;
};

// Draws a blue section header bar, returns next y
const sectionHeader = (doc, title, y) => {
  doc.rect(40, y, 515, 22).fill(C.accent);
  doc.fillColor(C.white).fontSize(9).font('Helvetica-Bold')
     .text(title, 46, y + 7, { width: 500, lineBreak: false });
  return y + 28;
};

// Adds a new page and redraws running header
const newPage = (doc, orgName, date) => {
  doc.addPage();
  doc.rect(0, 0, doc.page.width, 28).fill(C.primary);
  doc.fillColor(C.white).fontSize(8).font('Helvetica')
     .text(`${orgName}  ·  Daily Report  ·  ${date}`, 40, 10, { align: 'center', width: doc.page.width - 80, lineBreak: false });
  return 44;
};

const generateDailyReportPDF = async (reportData) => {
  const {
    orgName = 'Organisation', date = '',
    tasksCompleted = 0, tasksOverdue = 0, tasksPendingApproval = 0, tasksInProgress = 0, totalTasks = 0,
    newLeadsToday = 0, leadsWonToday = 0, activeLeads = 0,
    incomeToday = 0, expenseToday = 0,
    lowStockCount = 0, activeProductionOrders = 0,
    topPerformerName = null, topPerformerCount = 0,
    departmentStats = [],
    marketplaceToday = null,
    platformListings = [],
    platformPlanSummary = [],
  } = reportData;

  const reportsDir = path.join(process.cwd(), 'reports', 'daily');
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

  const dateSlug = new Date().toISOString().split('T')[0];
  const fileName = `daily-report-${dateSlug}.pdf`;
  const filePath  = path.join(reportsDir, fileName);

  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ margin: 40, size: 'A4', autoFirstPage: true });
    const chunks = [];

    doc.on('data',  (c) => chunks.push(c));
    doc.on('error', reject);
    doc.on('end', () => {
      const buffer = Buffer.concat(chunks);
      try { fs.writeFileSync(filePath, buffer); } catch { /* best-effort */ }
      resolve({ filePath, buffer, fileName });
    });

    // ── PAGE 1 HEADER ────────────────────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 70).fill(C.primary);
    doc.fillColor(C.white).fontSize(18).font('Helvetica-Bold')
       .text('BACKERO ENTERPRISE', 40, 14, { lineBreak: false });
    doc.fillColor('#93c5fd').fontSize(9).font('Helvetica')
       .text('Daily Operations Report', 40, 36, { lineBreak: false });
    doc.fillColor(C.white).fontSize(9)
       .text(`${orgName}`, doc.page.width - 220, 20, { width: 180, align: 'right', lineBreak: false });
    doc.fillColor('#93c5fd').fontSize(8)
       .text(date, doc.page.width - 220, 34, { width: 180, align: 'right', lineBreak: false });

    let y = 84;

    // ── TASK SUMMARY ─────────────────────────────────────────────────────────
    y = sectionHeader(doc, 'TASK SUMMARY', y);
    const bw5 = Math.floor((515 - 16) / 5);
    [
      { label: 'Total Active',      value: totalTasks,           color: C.accent   },
      { label: 'Completed Today',   value: tasksCompleted,       color: C.success  },
      { label: 'In Progress',       value: tasksInProgress,      color: C.warning  },
      { label: 'Overdue',           value: tasksOverdue,         color: C.danger   },
      { label: 'Pending Approval',  value: tasksPendingApproval, color: C.purple   },
    ].forEach((b, i) => {
      statBox(doc, b.label, b.value, 40 + i * (bw5 + 4), y, bw5, b.color);
    });
    y += 62;

    // ── DEPARTMENT BREAKDOWN ─────────────────────────────────────────────────
    y += 4;
    y = sectionHeader(doc, 'DEPARTMENT-WISE TASK BREAKDOWN', y);

    const dCols = [
      { label: 'Department',   x: 40,  w: 120 },
      { label: 'Total',        x: 160, w: 42  },
      { label: 'Done',         x: 202, w: 42  },
      { label: 'In Prog.',     x: 244, w: 52  },
      { label: 'Overdue',      x: 296, w: 50  },
      { label: 'Pending',      x: 346, w: 48  },
      { label: 'Subtasks',     x: 394, w: 52  },
      { label: 'Nearest Due',  x: 446, w: 69  },
    ];
    const rowH = 18;

    // Header row
    doc.rect(40, y, 515, rowH).fill(C.primary);
    dCols.forEach((c) => {
      doc.fillColor(C.white).fontSize(7).font('Helvetica-Bold')
         .text(c.label, c.x + 3, y + 5, { width: c.w - 4, lineBreak: false });
    });
    y += rowH;

    if (departmentStats.length === 0) {
      doc.rect(40, y, 515, rowH).fill(C.lightGray);
      doc.fillColor(C.gray).fontSize(8).font('Helvetica')
         .text('No department data available.', 46, y + 5, { lineBreak: false });
      y += rowH + 4;
    } else {
      departmentStats.forEach((dept, i) => {
        if (y > 760) { y = newPage(doc, orgName, date); }
        const bg = i % 2 === 0 ? C.white : C.lightGray;
        doc.rect(40, y, 515, rowH).fill(bg).stroke(C.border);
        const cells = [
          { col: dCols[0], val: dept.department || '—',              color: C.primary, bold: true },
          { col: dCols[1], val: String(dept.total || 0),             color: C.primary },
          { col: dCols[2], val: String(dept.completed || 0),         color: (dept.completed || 0) > 0 ? C.success : C.gray },
          { col: dCols[3], val: String(dept.inProgress || 0),        color: (dept.inProgress || 0) > 0 ? C.warning : C.gray },
          { col: dCols[4], val: String(dept.overdue || 0),           color: (dept.overdue || 0) > 0 ? C.danger  : C.gray },
          { col: dCols[5], val: String(dept.pending || 0),           color: C.gray },
          { col: dCols[6], val: String(dept.subtaskCount || 0),      color: C.teal },
          { col: dCols[7], val: fmtD(dept.nearestDue),               color: C.gray },
        ];
        cells.forEach((cell) => {
          doc.fillColor(cell.color)
             .fontSize(8).font(cell.bold ? 'Helvetica-Bold' : 'Helvetica')
             .text(cell.val, cell.col.x + 3, y + 5, { width: cell.col.w - 4, lineBreak: false });
        });
        y += rowH;
      });
    }

    // ── MARKETPLACE ───────────────────────────────────────────────────────────
    y += 10;
    if (y > 680) { y = newPage(doc, orgName, date); }
    y = sectionHeader(doc, 'MARKETPLACE', y);

    if (marketplaceToday) {
      const bw6 = Math.floor((515 - 20) / 6);
      [
        { label: 'Total Sales (₹)',  value: fmt(marketplaceToday.totalSales),                color: C.success },
        { label: 'Ad Spend (₹)',     value: fmt(marketplaceToday.adSpend),                   color: C.danger  },
        { label: 'Ad Revenue (₹)',   value: fmt(marketplaceToday.adRevenue),                 color: C.accent  },
        { label: 'Returns',          value: fmt(marketplaceToday.returns),                   color: C.warning },
        { label: 'CTR (%)',          value: (marketplaceToday.ctr  || 0).toFixed(2),         color: C.purple  },
        { label: 'CVR (%)',          value: (marketplaceToday.cvr  || 0).toFixed(2),         color: C.teal    },
      ].forEach((b, i) => {
        statBox(doc, b.label, b.value, 40 + i * (bw6 + 4), y, bw6, b.color);
      });
      y += 62;
    } else {
      doc.rect(40, y, 515, 22).fill(C.lightGray);
      doc.fillColor(C.gray).fontSize(8).font('Helvetica')
         .text('No marketplace data recorded for today.', 46, y + 7, { lineBreak: false });
      y += 28;
    }

    // Platform listings
    if (platformListings.length > 0) {
      doc.fillColor(C.primary).fontSize(8).font('Helvetica-Bold')
         .text('Active Product Listings per Platform:', 40, y, { lineBreak: false });
      y += 14;
      const pCount = Math.min(platformListings.length, 6);
      const pw = Math.floor((515 - (pCount - 1) * 4) / pCount);
      platformListings.slice(0, 6).forEach((p, i) => {
        statBox(doc, p._id || '—', p.count, 40 + i * (pw + 4), y, pw, C.accent);
      });
      y += 62;
    }

    // ── MARKETPLACE PLATFORM PLANS ────────────────────────────────────────────
    if (platformPlanSummary.length > 0) {
      y += 8;
      if (y > 680) { y = newPage(doc, orgName, date); }
      y = sectionHeader(doc, 'MARKETPLACE PLATFORM PLANS — TODAY\'S FOCUS', y);

      const planCols = [
        { label: 'Platform',   x: 40,  w: 72  },
        { label: 'Week',       x: 112, w: 32  },
        { label: 'Week Name',  x: 144, w: 70  },
        { label: 'Focus',      x: 214, w: 120 },
        { label: 'Must (Non-Neg)', x: 334, w: 110 },
        { label: "Today's Tasks", x: 444, w: 64  },
      ];

      // Table header row
      doc.rect(40, y, 515, 18).fill(C.primary);
      planCols.forEach((c) => {
        doc.fillColor(C.white).fontSize(7).font('Helvetica-Bold')
           .text(c.label, c.x + 3, y + 5, { width: c.w - 4, lineBreak: false });
      });
      y += 18;

      platformPlanSummary.forEach((p, i) => {
        if (y > 760) { y = newPage(doc, orgName, date); }
        const rowHeight = 20;
        const bg = i % 2 === 0 ? C.white : C.lightGray;
        doc.rect(40, y, 515, rowHeight).fill(bg).stroke(C.border);

        const taskSummary = p.totalTodayTasks === 0
          ? 'No tasks'
          : `${p.checkedCount}/${p.totalTodayTasks} done`;

        [
          { col: planCols[0], val: p.platform,    color: C.accent,   bold: true  },
          { col: planCols[1], val: `W${p.currentWeek || '—'}/${p.totalWeeks}`, color: C.purple },
          { col: planCols[2], val: p.weekName || '—',  color: C.primary },
          { col: planCols[3], val: p.focus || '—',     color: C.gray    },
          { col: planCols[4], val: p.mustNonNeg || '—',color: C.warning },
          { col: planCols[5], val: taskSummary,         color: p.checkedCount === p.totalTodayTasks && p.totalTodayTasks > 0 ? C.success : C.danger },
        ].forEach((cell) => {
          doc.fillColor(cell.color).fontSize(7).font(cell.bold ? 'Helvetica-Bold' : 'Helvetica')
             .text(cell.val, cell.col.x + 3, y + 6, { width: cell.col.w - 6, lineBreak: false, ellipsis: true });
        });
        y += rowHeight;

        // Show today's tasks as sub-rows if any
        if (p.todayTasks.length > 0) {
          p.todayTasks.forEach((task) => {
            if (y > 760) { y = newPage(doc, orgName, date); }
            doc.rect(40, y, 515, 14).fill('#f8faff').stroke(C.border);
            doc.fillColor(C.gray).fontSize(6).font('Helvetica')
               .text('↳', 52, y + 4, { width: 10, lineBreak: false });
            doc.fillColor(C.primary).fontSize(6.5).font('Helvetica')
               .text(task.text || '', 64, y + 4, { width: 430, lineBreak: false, ellipsis: true });
            y += 14;
          });
        }
      });
      y += 4;
    }

    // ── FINANCE ───────────────────────────────────────────────────────────────
    y += 6;
    if (y > 700) { y = newPage(doc, orgName, date); }
    y = sectionHeader(doc, 'FINANCE (TODAY)', y);
    const netToday = (incomeToday || 0) - (expenseToday || 0);
    const bw3 = Math.floor((515 - 8) / 3);
    [
      { label: 'Income (₹)',                                    value: fmt(incomeToday),         color: C.success },
      { label: 'Expense (₹)',                                   value: fmt(expenseToday),        color: C.danger  },
      { label: `Net ${netToday >= 0 ? 'Profit' : 'Loss'} (₹)`, value: fmt(Math.abs(netToday)),  color: netToday >= 0 ? C.success : C.danger },
    ].forEach((b, i) => statBox(doc, b.label, b.value, 40 + i * (bw3 + 4), y, bw3, b.color));
    y += 62;

    // ── CRM + INVENTORY ───────────────────────────────────────────────────────
    y += 6;
    if (y > 700) { y = newPage(doc, orgName, date); }
    y = sectionHeader(doc, 'CRM / LEADS  &  INVENTORY', y);
    const bw5b = Math.floor((515 - 16) / 5);
    [
      { label: 'New Leads Today',   value: newLeadsToday,         color: C.accent  },
      { label: 'Leads Won Today',   value: leadsWonToday,         color: C.success },
      { label: 'Active Leads',      value: activeLeads,           color: C.warning },
      { label: 'Low Stock Items',   value: lowStockCount,         color: C.danger  },
      { label: 'Active Production', value: activeProductionOrders,color: C.purple  },
    ].forEach((b, i) => statBox(doc, b.label, b.value, 40 + i * (bw5b + 4), y, bw5b, b.color));
    y += 62;

    // ── TOP PERFORMER ─────────────────────────────────────────────────────────
    if (topPerformerName) {
      y += 6;
      if (y > 760) { y = newPage(doc, orgName, date); }
      doc.rect(40, y, 515, 38).fill('#fef9c3');
      doc.rect(40, y, 4, 38).fill('#ca8a04');
      doc.fillColor('#92400e').fontSize(9).font('Helvetica-Bold')
         .text('TOP PERFORMER TODAY', 52, y + 8, { lineBreak: false });
      doc.fillColor(C.primary).fontSize(9).font('Helvetica')
         .text(`${topPerformerName}  —  ${topPerformerCount} task${topPerformerCount !== 1 ? 's' : ''} completed`, 52, y + 22, { lineBreak: false });
      y += 46;
    }

    // ── FOOTER ────────────────────────────────────────────────────────────────
    const footerY = doc.page.height - 26;
    doc.rect(0, footerY, doc.page.width, 26).fill(C.primary);
    doc.fillColor(C.white).fontSize(7).font('Helvetica')
       .text(
         `Backero Enterprise Platform  ·  Automated Daily Report  ·  Generated ${new Date().toLocaleString('en-IN')}`,
         40, footerY + 9, { align: 'center', width: doc.page.width - 80, lineBreak: false }
       );

    doc.end();
  });
};

module.exports = { generateDailyReportPDF };
