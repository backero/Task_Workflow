// Payslip PDF — one payroll record's full slip, including a day-by-day
// punch log. Styled to match reportPdf.service.js's conventions (same
// color system, same statBox/sectionHeader helpers) so generated documents
// look consistent across the app.
const PDFDocument = require('pdfkit');
const axios = require('axios');

const C = {
  primary: '#1a2744', accent: '#2563eb', success: '#16a34a', danger: '#dc2626',
  gray: '#6b7280', lightGray: '#f3f4f6', white: '#ffffff', border: '#d1d5db',
};

const CONTENT_W = 515; // A4 width (595.28pt) minus 40pt margins either side
const BOTTOM_LIMIT = 760;

// Explicit timeZone, not the Node process's own — this app has no
// per-org timezone concept (see attendanceProcessor.service.js's UTC-only
// comment) and is India-only, but the server itself may run in UTC (e.g.
// Render) rather than IST, so letting toLocale*String fall back to the
// process default would silently show raw UTC hours in production.
const TZ = 'Asia/Kolkata';
const INR = (n) => `Rs. ${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: TZ }) : '—';
const fmtDateShort = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: TZ }) : '—';
const fmtTime = (d) => d ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: TZ }) : '—';
const fmtHours = (h) => {
  if (!h || h <= 0) return '—';
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return mins ? `${hrs}h ${mins}m` : `${hrs}h`;
};

const sectionHeader = (doc, title, y) => {
  doc.rect(40, y, CONTENT_W, 20).fill(C.accent);
  doc.fillColor(C.white).fontSize(9).font('Helvetica-Bold').text(title, 46, y + 6, { width: 500, lineBreak: false });
  return y + 26;
};

const statBox = (doc, label, value, x, y, w, color) => {
  doc.rect(x, y, w, 44).fill(C.lightGray);
  doc.rect(x, y, w, 3).fill(color);
  doc.fillColor(C.gray).fontSize(6.5).font('Helvetica').text(label.toUpperCase(), x + 6, y + 9, { width: w - 12, lineBreak: false });
  doc.fillColor(C.primary).fontSize(12).font('Helvetica-Bold').text(String(value), x + 6, y + 21, { width: w - 12, lineBreak: false });
  return y + 50;
};

const lineItem = (doc, label, value, x, y, w, opts = {}) => {
  doc.fillColor(opts.bold ? C.primary : C.gray).fontSize(9).font(opts.bold ? 'Helvetica-Bold' : 'Helvetica')
    .text(label, x, y, { width: w - 90, lineBreak: false });
  doc.fillColor(opts.color || C.primary).fontSize(9).font(opts.bold ? 'Helvetica-Bold' : 'Helvetica')
    .text(value, x + w - 90, y, { width: 90, align: 'right', lineBreak: false });
  return y + 16;
};

// pdfkit embeds whatever bytes it's given with no downsampling — a
// full-resolution photo (e.g. a 3024x3024 upload) made the PDF multiple MB
// even though it only renders at ~50pt on the page. Cloudinary URLs support
// resizing via a URL segment, so request a small version instead of fetching
// and embedding the original; non-Cloudinary URLs (e.g. a logo on another
// host) are fetched as-is since there's no transform to apply.
function cloudinaryThumbUrl(url, size) {
  if (!url || !url.includes('res.cloudinary.com')) return url;
  const marker = '/upload/';
  const idx = url.indexOf(marker);
  if (idx === -1) return url;
  return `${url.slice(0, idx + marker.length)}w_${size},h_${size},c_fill,q_auto,f_auto/${url.slice(idx + marker.length)}`;
}

async function fetchImageBuffer(url, thumbSize = null) {
  if (!url) return null;
  try {
    const fetchUrl = thumbSize ? cloudinaryThumbUrl(url, thumbSize) : url;
    const { data } = await axios.get(fetchUrl, { responseType: 'arraybuffer', timeout: 5000 });
    return Buffer.from(data);
  } catch {
    return null;
  }
}

/** Sum of gaps between consecutive sessions in one day = unpunched time
 * between a check-out and the next check-in, i.e. a break. */
function dailyBreakHours(sessions) {
  if (!sessions || sessions.length < 2) return 0;
  let totalMs = 0;
  for (let i = 0; i < sessions.length - 1; i += 1) {
    totalMs += new Date(sessions[i + 1].checkIn).getTime() - new Date(sessions[i].checkOut).getTime();
  }
  return totalMs / (1000 * 60 * 60);
}

// Minimal running header for continuation pages (the full letterhead only
// appears on page 1) — mirrors reportPdf.service.js's newPage() pattern.
function newPage(doc, orgName) {
  doc.addPage();
  doc.rect(0, 0, doc.page.width, 24).fill(C.primary);
  doc.fillColor(C.white).fontSize(8).font('Helvetica')
    .text(`${orgName} — Salary Slip (continued)`, 40, 7, { width: CONTENT_W, lineBreak: false });
  return 40;
}

/** `organization`, `employee`, `period`, `record` are plain objects;
 * `attendanceLog` is the array of Attendance docs for this employee across
 * the period (empty for an IMPORTED historical record — there's no
 * punch-level data behind an Excel-entered salary). All loaded/validated by
 * the caller — see payroll.controller.js#downloadSlip. */
async function generatePayslipPDF({ organization, employee, department, designation, period, record, attendanceLog = [] }) {
  const [signatureBuffer, logoBuffer, photoBuffer] = await Promise.all([
    fetchImageBuffer(organization.signatureUrl, 300),
    fetchImageBuffer(organization.logo, 150),
    fetchImageBuffer(employee.photo, 150),
  ]);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    // ── HEADER — company letterhead ─────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 78).fill(C.primary);
    let nameX = 40;
    if (logoBuffer) {
      try { doc.image(logoBuffer, 40, 14, { width: 50, height: 50, fit: [50, 50] }); nameX = 100; } catch { /* best-effort */ }
    }
    doc.fillColor(C.white).fontSize(17).font('Helvetica-Bold').text(organization.name || 'Organization', nameX, 16, { lineBreak: false });
    const addr = organization.address || {};
    const addrLine = [addr.street, addr.city, addr.state, addr.pincode].filter(Boolean).join(', ');
    if (addrLine) doc.fillColor('#93c5fd').fontSize(8).font('Helvetica').text(addrLine, nameX, 38, { width: 330, lineBreak: false });
    if (organization.gstNumber) doc.fillColor('#93c5fd').fontSize(8).text(`GSTIN: ${organization.gstNumber}`, nameX, 52, { lineBreak: false });
    doc.fillColor(C.white).fontSize(13).font('Helvetica-Bold')
      .text('SALARY SLIP', doc.page.width - 220, 20, { width: 180, align: 'right', lineBreak: false });
    doc.fillColor('#93c5fd').fontSize(9).font('Helvetica')
      .text(`${fmtDate(period.periodStart)} — ${fmtDate(period.periodEnd)}`, doc.page.width - 220, 38, { width: 180, align: 'right', lineBreak: false });

    let y = 96;

    // ── EMPLOYEE DETAILS ─────────────────────────────────────────────────────
    y = sectionHeader(doc, 'EMPLOYEE DETAILS', y);
    const photoSize = 54;
    let textStartX = 40;
    if (photoBuffer) {
      try { doc.image(photoBuffer, 40, y + 4, { width: photoSize, height: photoSize, fit: [photoSize, photoSize] }); textStartX = 40 + photoSize + 14; } catch { /* best-effort */ }
    }
    // Split whatever width remains after the photo into two equal columns —
    // a fixed offset here previously ran the second column off the page
    // edge once textStartX shifted right to make room for the photo.
    const colGap = 16;
    const colW = Math.floor((40 + CONTENT_W - textStartX - colGap) / 2);
    const col1X = textStartX, col2X = textStartX + colW + colGap;
    let ly = y + 6;
    ly = lineItem(doc, 'Employee Name', employee.fullName || '—', col1X, ly, colW);
    ly = lineItem(doc, 'Employee Code', employee.employeeCode || '—', col1X, ly, colW);
    ly = lineItem(doc, 'Department', department?.name || '—', col1X, ly, colW);
    ly = lineItem(doc, 'Designation', designation?.title || '—', col1X, ly, colW);
    let ly2 = y + 6;
    ly2 = lineItem(doc, 'Employment Type', (employee.employmentType || 'FULL_TIME').replace('_', '-'), col2X, ly2, colW);
    ly2 = lineItem(doc, 'Bank Name', employee.bankName || '—', col2X, ly2, colW);
    ly2 = lineItem(doc, 'Account No.', employee.bankAccountNumber || '—', col2X, ly2, colW);
    ly2 = lineItem(doc, 'IFSC Code', employee.bankIfsc || '—', col2X, ly2, colW);
    y = Math.max(ly, ly2, y + photoSize + 10) + 8;

    // ── ATTENDANCE SUMMARY ───────────────────────────────────────────────────
    y = sectionHeader(doc, 'ATTENDANCE SUMMARY', y);
    const snap = record.attendanceSummarySnapshot || {};
    const boxes = [
      { label: 'Paid Days', value: snap.paidDays ?? '—' },
      { label: 'Full Day', value: snap.fullDays ?? '—' },
      { label: 'Half Day', value: snap.halfDays ?? '—' },
      { label: 'Off Days', value: snap.offDays ?? '—' },
      { label: 'Paid Leave', value: snap.paidLeaveDays ?? '—' },
      { label: 'Unpaid Days', value: snap.unpaidDays ?? '—' },
    ];
    const bw = Math.floor((CONTENT_W - 20) / 6);
    boxes.forEach((b, i) => statBox(doc, b.label, b.value, 40 + i * (bw + 4), y, bw, C.accent));
    y += 58;

    // ── EARNINGS / DEDUCTIONS ────────────────────────────────────────────────
    y = sectionHeader(doc, 'EARNINGS & DEDUCTIONS', y);
    const halfW = 240;
    let ey = y + 10;
    doc.fillColor(C.primary).fontSize(9).font('Helvetica-Bold').text('Earnings', 40, ey, { lineBreak: false });
    ey += 16;
    ey = lineItem(doc, 'Basic Salary', INR(record.basicEarnings), 40, ey, halfW);
    ey = lineItem(doc, 'Dearness Allowance (DA)', INR(record.dearnessAllowance), 40, ey, halfW);
    ey = lineItem(doc, 'House Rent Allowance (HRA)', INR(record.houseRentAllowance), 40, ey, halfW);
    ey = lineItem(doc, 'Gross Earnings', INR(record.grossEarnings ?? record.basicEarnings), 40, ey, halfW, { bold: true });

    let dy = y + 10;
    doc.fillColor(C.primary).fontSize(9).font('Helvetica-Bold').text('Deductions', 300, dy, { lineBreak: false });
    dy += 16;
    dy = lineItem(doc, 'PF', INR(record.pf), 300, dy, halfW);
    dy = lineItem(doc, 'ESIC', INR(record.esic), 300, dy, halfW);
    dy = lineItem(doc, 'Loan / Advance', INR(record.loanAdvance), 300, dy, halfW);
    dy = lineItem(doc, 'Total Deductions', INR(record.deductions), 300, dy, halfW, { bold: true, color: C.danger });

    y = Math.max(ey, dy) + 10;

    // ── NET PAY ───────────────────────────────────────────────────────────────
    doc.rect(40, y, CONTENT_W, 36).fill(C.success);
    doc.fillColor(C.white).fontSize(11).font('Helvetica-Bold').text('NET PAY', 52, y + 11, { lineBreak: false });
    doc.fillColor(C.white).fontSize(14).font('Helvetica-Bold')
      .text(INR(record.netSalary), 40, y + 9, { width: 503, align: 'right', lineBreak: false });
    y += 50;

    // ── DAILY ATTENDANCE LOG — punch in/out + break per day ─────────────────
    if (y > BOTTOM_LIMIT - 60) y = newPage(doc, organization.name || 'Organization');
    y = sectionHeader(doc, 'DAILY ATTENDANCE LOG', y);

    if (!attendanceLog.length) {
      doc.rect(40, y, CONTENT_W, 22).fill(C.lightGray);
      doc.fillColor(C.gray).fontSize(8).font('Helvetica')
        .text('No punch-level attendance data for this period — this record was imported from an external payroll sheet.', 46, y + 7, { lineBreak: false });
      y += 28;
    } else {
      const cols = [
        { label: 'Date', x: 40, w: 70 },
        { label: 'Punch In', x: 110, w: 90 },
        { label: 'Punch Out', x: 200, w: 90 },
        { label: 'Break', x: 290, w: 70 },
        { label: 'Worked', x: 360, w: 70 },
        { label: 'Status', x: 430, w: 125 },
      ];
      doc.rect(40, y, CONTENT_W, 16).fill(C.primary);
      cols.forEach((c) => {
        doc.fillColor(C.white).fontSize(7).font('Helvetica-Bold').text(c.label, c.x + 3, y + 4, { width: c.w - 4, lineBreak: false });
      });
      y += 16;

      attendanceLog.forEach((a, i) => {
        if (y > BOTTOM_LIMIT) y = newPage(doc, organization.name || 'Organization');
        const breakHrs = dailyBreakHours(a.sessions);
        const bg = i % 2 === 0 ? C.white : C.lightGray;
        doc.rect(40, y, CONTENT_W, 15).fill(bg).stroke(C.border);
        const cells = [
          { col: cols[0], val: fmtDateShort(a.attendanceDate) },
          { col: cols[1], val: fmtTime(a.checkIn) },
          { col: cols[2], val: fmtTime(a.checkOut) },
          { col: cols[3], val: fmtHours(breakHrs) },
          { col: cols[4], val: fmtHours(a.workedHours) },
          { col: cols[5], val: a.status },
        ];
        cells.forEach((cell) => {
          doc.fillColor(C.primary).fontSize(7).font('Helvetica').text(cell.val, cell.col.x + 3, y + 4, { width: cell.col.w - 4, lineBreak: false });
        });
        y += 15;
      });
      y += 6;
    }

    // ── FOOTER — generated date + HR signature ──────────────────────────────
    if (y > doc.page.height - 100) y = newPage(doc, organization.name || 'Organization');
    const footerY = Math.max(y + 20, doc.page.height - 100);
    doc.fillColor(C.gray).fontSize(7.5).font('Helvetica')
      .text(`This is a system-generated payslip. Generated on ${fmtDate(new Date())}.`, 40, footerY, { lineBreak: false });

    const sigX = doc.page.width - 190;
    if (signatureBuffer) {
      try { doc.image(signatureBuffer, sigX, footerY - 40, { width: 140, height: 40, fit: [140, 40] }); } catch { /* best-effort */ }
    }
    doc.moveTo(sigX, footerY + 6).lineTo(sigX + 150, footerY + 6).stroke(C.border);
    doc.fillColor(C.gray).fontSize(8).font('Helvetica').text('Authorized Signatory (HR)', sigX, footerY + 10, { width: 150, lineBreak: false });

    doc.end();
  });
}

module.exports = { generatePayslipPDF };
