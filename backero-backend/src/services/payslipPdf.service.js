// Payslip PDF — redesigned to match a reference payslip layout the owner provided
// (compact single-page slip: logo + company letterhead, "Payslip for the month of
// <Month>, <Year>" title, a two-column employee details grid, an Earnings/Deductions
// table, and a Net Pay bar — no attendance-summary boxes or a daily punch log, which
// that reference doesn't have either).
const PDFDocument = require('pdfkit');
const axios = require('axios');

const C = {
  primary: '#1a2744', accent: '#2563eb', success: '#16a34a', danger: '#dc2626',
  gray: '#6b7280', lightGray: '#f3f4f6', white: '#ffffff', border: '#d1d5db',
};

const CONTENT_W = 515; // A4 width (595.28pt) minus 40pt margins either side

// Explicit timeZone, not the Node process's own — this app has no per-org timezone
// concept (see attendanceProcessor.service.js's UTC-only comment) and is India-only,
// but the server itself may run in UTC (e.g. Render) rather than IST.
const TZ = 'Asia/Kolkata';
const INR = (n) => `Rs. ${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: TZ }) : '—');
const fmtMonthYear = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: TZ }) : '—');

const lineItem = (doc, label, value, x, y, w, opts = {}) => {
  doc.fillColor(opts.bold ? C.primary : C.gray).fontSize(9).font(opts.bold ? 'Helvetica-Bold' : 'Helvetica')
    .text(label, x, y, { width: w - 100, lineBreak: false });
  doc.fillColor(opts.color || C.primary).fontSize(9).font(opts.bold ? 'Helvetica-Bold' : 'Helvetica')
    .text(value, x + w - 100, y, { width: 100, align: 'right', lineBreak: false });
  return y + 16;
};

// pdfkit embeds whatever bytes it's given with no downsampling — a full-resolution
// photo (e.g. a 3024x3024 upload) made the PDF multiple MB even though it only renders
// at ~50pt on the page. Cloudinary URLs support resizing via a URL segment, so request
// a small version instead of fetching and embedding the original; non-Cloudinary URLs
// (e.g. a logo on another host) are fetched as-is since there's no transform to apply.
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

/** Loss-of-Pay days — the same unpaid-day-equivalent payroll.service.js#computeEarnings
 * actually deducts for (absent counts as 1, half-day as 0.5); paid leave/holiday/week-off
 * are never LOP. Falls back to the older import-sourced snapshot shape (unpaidDays) when
 * absentDays/halfDays aren't present, so slips for Excel-imported records still show a
 * sensible LOP instead of blank. */
function lopDays(snap) {
  if (snap.absentDays != null || snap.halfDays != null) {
    return (snap.absentDays || 0) + (snap.halfDays || 0) * 0.5;
  }
  return snap.unpaidDays ?? 0;
}

/** `organization`, `employee`, `period`, `record` are plain objects. All loaded/validated
 * by the caller — see payroll.controller.js#downloadSlip. */
async function generatePayslipPDF({ organization, employee, department, designation, period, record }) {
  const [logoBuffer, photoBuffer] = await Promise.all([
    fetchImageBuffer(organization.logo, 150),
    fetchImageBuffer(employee.photo, 150),
  ]);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    // ── HEADER — plain letterhead, no color banner ─────────────────────────
    let nameX = 40;
    if (logoBuffer) {
      try { doc.image(logoBuffer, 40, 20, { width: 50, height: 50, fit: [50, 50] }); nameX = 100; } catch { /* best-effort */ }
    }
    doc.fillColor(C.primary).fontSize(16).font('Helvetica-Bold').text(organization.name || 'Organization', nameX, 24, { lineBreak: false });
    const addr = organization.address || {};
    const addrLine = [addr.street, addr.city, addr.state, addr.pincode].filter(Boolean).join(', ');
    if (addrLine) doc.fillColor(C.gray).fontSize(8).font('Helvetica').text(addrLine, nameX, 44, { width: 350, lineBreak: false });
    if (organization.gstNumber) doc.fillColor(C.gray).fontSize(8).text(`GSTIN: ${organization.gstNumber}`, nameX, 56, { lineBreak: false });

    let y = 86;
    doc.moveTo(40, y).lineTo(40 + CONTENT_W, y).stroke(C.border);
    y += 14;

    // ── TITLE ────────────────────────────────────────────────────────────────
    doc.fillColor(C.primary).fontSize(13).font('Helvetica-Bold')
      .text(`Payslip for the month of ${fmtMonthYear(period.periodStart)}`, 40, y, { width: CONTENT_W, align: 'center', lineBreak: false });
    y += 26;

    // ── EMPLOYEE DETAILS ─────────────────────────────────────────────────────
    const photoSize = 50;
    if (photoBuffer) {
      try { doc.image(photoBuffer, 40 + CONTENT_W - photoSize, y, { width: photoSize, height: photoSize, fit: [photoSize, photoSize] }); } catch { /* best-effort */ }
    }
    const colW = 220;
    const col1X = 40;
    const col2X = 40 + 260;
    // Narrower than col1 so its right-aligned value text doesn't run under the photo
    // (photo sits flush with the page's right edge, at 40 + CONTENT_W - photoSize).
    const col2W = 40 + CONTENT_W - photoSize - 10 - col2X;
    const snap = record.attendanceSummarySnapshot || {};
    let ly = y;
    ly = lineItem(doc, 'Name', employee.fullName || '—', col1X, ly, colW);
    ly = lineItem(doc, 'Designation', designation?.title || '—', col1X, ly, colW);
    ly = lineItem(doc, 'Department', department?.name || '—', col1X, ly, colW);
    ly = lineItem(doc, 'Location', employee.location || '—', col1X, ly, colW);
    ly = lineItem(doc, 'LOP', String(lopDays(snap)), col1X, ly, colW);
    let ly2 = y;
    ly2 = lineItem(doc, 'Employee ID', employee.employeeCode || '—', col2X, ly2, col2W);
    ly2 = lineItem(doc, 'Bank Name', employee.bankName || '—', col2X, ly2, col2W);
    ly2 = lineItem(doc, 'Bank Account Number', employee.bankAccountNumber || '—', col2X, ly2, col2W);
    ly2 = lineItem(doc, 'PAN', employee.pan || '—', col2X, ly2, col2W);
    y = Math.max(ly, ly2, y + photoSize + 6) + 10;

    doc.moveTo(40, y).lineTo(40 + CONTENT_W, y).stroke(C.border);
    y += 14;

    // ── EARNINGS / DEDUCTIONS ────────────────────────────────────────────────
    const halfW = 240;
    let ey = y;
    doc.fillColor(C.primary).fontSize(10).font('Helvetica-Bold').text('Earnings', 40, ey, { lineBreak: false });
    doc.fillColor(C.primary).fontSize(9).font('Helvetica-Bold').text('Amount', 40 + halfW - 100, ey, { width: 100, align: 'right', lineBreak: false });
    ey += 18;
    ey = lineItem(doc, 'Basic', INR(record.basicEarnings), 40, ey, halfW);
    ey = lineItem(doc, 'HRA', INR(record.houseRentAllowance), 40, ey, halfW);
    ey = lineItem(doc, 'Telephone Reimbursements', INR(record.telephoneReimbursement), 40, ey, halfW);
    ey = lineItem(doc, 'Bonus', INR(record.bonus), 40, ey, halfW);
    ey = lineItem(doc, 'LTA', INR(record.lta), 40, ey, halfW);
    ey = lineItem(doc, 'Special Allowance', INR(record.specialAllowance), 40, ey, halfW);
    if (record.dearnessAllowance) ey = lineItem(doc, 'Dearness Allowance', INR(record.dearnessAllowance), 40, ey, halfW);
    ey += 6;
    doc.moveTo(40, ey).lineTo(40 + halfW, ey).stroke(C.border);
    ey += 6;
    const totalEarnings = (record.basicEarnings || 0) + (record.houseRentAllowance || 0) + (record.telephoneReimbursement || 0)
      + (record.bonus || 0) + (record.lta || 0) + (record.specialAllowance || 0) + (record.dearnessAllowance || 0);
    ey = lineItem(doc, 'Total Earnings', INR(totalEarnings), 40, ey, halfW, { bold: true });

    const dx = 40 + 275;
    let dy = y;
    doc.fillColor(C.primary).fontSize(10).font('Helvetica-Bold').text('Deductions', dx, dy, { lineBreak: false });
    doc.fillColor(C.primary).fontSize(9).font('Helvetica-Bold').text('Amount', dx + halfW - 100, dy, { width: 100, align: 'right', lineBreak: false });
    dy += 18;
    dy = lineItem(doc, 'Income Tax', INR(record.incomeTax), dx, dy, halfW);
    dy = lineItem(doc, 'Provident Fund', INR(record.pf), dx, dy, halfW);
    dy = lineItem(doc, 'Professional Tax', INR(record.professionalTax), dx, dy, halfW);
    if (record.esic) dy = lineItem(doc, 'ESIC', INR(record.esic), dx, dy, halfW);
    if (record.loanAdvance) dy = lineItem(doc, 'Loan / Advance', INR(record.loanAdvance), dx, dy, halfW);
    if (record.deductions) dy = lineItem(doc, 'Attendance (LOP)', INR(record.deductions), dx, dy, halfW);
    dy += 6;
    doc.moveTo(dx, dy).lineTo(dx + halfW, dy).stroke(C.border);
    dy += 6;
    const totalDeductions = (record.incomeTax || 0) + (record.pf || 0) + (record.professionalTax || 0)
      + (record.esic || 0) + (record.loanAdvance || 0) + (record.deductions || 0);
    dy = lineItem(doc, 'Total Deductions', INR(totalDeductions), dx, dy, halfW, { bold: true, color: C.danger });

    y = Math.max(ey, dy) + 16;

    // ── NET PAY ───────────────────────────────────────────────────────────────
    doc.rect(40, y, CONTENT_W, 32).fill(C.success);
    doc.fillColor(C.white).fontSize(11).font('Helvetica-Bold')
      .text(`Net Pay for the month: ${INR(record.netSalary)}`, 40, y + 10, { width: CONTENT_W, align: 'center', lineBreak: false });
    y += 32;

    // ── FOOTER ───────────────────────────────────────────────────────────────
    const footerY = Math.max(y + 24, doc.page.height - 70);
    doc.fillColor(C.gray).fontSize(8).font('Helvetica')
      .text('This is a system generated payslip and does not require signature.', 40, footerY, { width: CONTENT_W, align: 'center', lineBreak: false });
    doc.fillColor(C.gray).fontSize(7.5).font('Helvetica')
      .text(`Generated by ${organization.name || 'Backero'} on ${fmtDate(new Date())}`, 40, footerY + 14, { width: CONTENT_W, align: 'center', lineBreak: false });

    doc.end();
  });
}

module.exports = { generatePayslipPDF };
