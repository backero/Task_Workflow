// Payslip PDF — one page per payroll record. Styled to match
// reportPdf.service.js's conventions (same color system, same statBox/
// sectionHeader helpers) so generated documents look consistent.
const PDFDocument = require('pdfkit');
const axios = require('axios');

const C = {
  primary: '#1a2744', accent: '#2563eb', success: '#16a34a', danger: '#dc2626',
  gray: '#6b7280', lightGray: '#f3f4f6', white: '#ffffff', border: '#d1d5db',
};

const INR = (n) => `Rs. ${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const sectionHeader = (doc, title, y) => {
  doc.rect(40, y, 515, 20).fill(C.accent);
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

async function fetchImageBuffer(url) {
  try {
    const { data } = await axios.get(url, { responseType: 'arraybuffer', timeout: 5000 });
    return Buffer.from(data);
  } catch {
    return null;
  }
}

/** `organization`, `employee`, `period`, `record` are plain objects (already
 * loaded/validated by the caller — see payroll.controller.js#downloadSlip). */
async function generatePayslipPDF({ organization, employee, department, designation, period, record }) {
  const signatureBuffer = organization.signatureUrl ? await fetchImageBuffer(organization.signatureUrl) : null;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    // ── HEADER — company letterhead ─────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 78).fill(C.primary);
    doc.fillColor(C.white).fontSize(17).font('Helvetica-Bold').text(organization.name || 'Organization', 40, 16, { lineBreak: false });
    const addr = organization.address || {};
    const addrLine = [addr.street, addr.city, addr.state, addr.pincode].filter(Boolean).join(', ');
    if (addrLine) doc.fillColor('#93c5fd').fontSize(8).font('Helvetica').text(addrLine, 40, 38, { width: 350, lineBreak: false });
    if (organization.gstNumber) doc.fillColor('#93c5fd').fontSize(8).text(`GSTIN: ${organization.gstNumber}`, 40, 52, { lineBreak: false });
    doc.fillColor(C.white).fontSize(13).font('Helvetica-Bold')
      .text('SALARY SLIP', doc.page.width - 220, 20, { width: 180, align: 'right', lineBreak: false });
    doc.fillColor('#93c5fd').fontSize(9).font('Helvetica')
      .text(`${fmtDate(period.periodStart)} — ${fmtDate(period.periodEnd)}`, doc.page.width - 220, 38, { width: 180, align: 'right', lineBreak: false });

    let y = 96;

    // ── EMPLOYEE DETAILS ─────────────────────────────────────────────────────
    y = sectionHeader(doc, 'EMPLOYEE DETAILS', y);
    const col1X = 40, col2X = 300, colW = 240;
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
    y = Math.max(ly, ly2) + 8;

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
    const bw = Math.floor((515 - 20) / 6);
    boxes.forEach((b, i) => statBox(doc, b.label, b.value, 40 + i * (bw + 4), y, bw, C.accent));
    y += 58;

    // ── EARNINGS / DEDUCTIONS ────────────────────────────────────────────────
    y = sectionHeader(doc, 'EARNINGS & DEDUCTIONS', y);
    const halfW = 240;
    let ey = y + 10;
    doc.fillColor(C.primary).fontSize(9).font('Helvetica-Bold').text('Earnings', col1X, ey, { lineBreak: false });
    ey += 16;
    ey = lineItem(doc, 'Basic Salary', INR(record.basicEarnings), col1X, ey, halfW);
    ey = lineItem(doc, 'Dearness Allowance (DA)', INR(record.dearnessAllowance), col1X, ey, halfW);
    ey = lineItem(doc, 'House Rent Allowance (HRA)', INR(record.houseRentAllowance), col1X, ey, halfW);
    ey = lineItem(doc, 'Gross Earnings', INR(record.grossEarnings ?? record.basicEarnings), col1X, ey, halfW, { bold: true });

    let dy = y + 10;
    doc.fillColor(C.primary).fontSize(9).font('Helvetica-Bold').text('Deductions', col2X, dy, { lineBreak: false });
    dy += 16;
    dy = lineItem(doc, 'PF', INR(record.pf), col2X, dy, halfW);
    dy = lineItem(doc, 'ESIC', INR(record.esic), col2X, dy, halfW);
    dy = lineItem(doc, 'Loan / Advance', INR(record.loanAdvance), col2X, dy, halfW);
    dy = lineItem(doc, 'Total Deductions', INR(record.deductions), col2X, dy, halfW, { bold: true, color: C.danger });

    y = Math.max(ey, dy) + 10;

    // ── NET PAY ───────────────────────────────────────────────────────────────
    doc.rect(40, y, 515, 36).fill(C.success);
    doc.fillColor(C.white).fontSize(11).font('Helvetica-Bold').text('NET PAY', 52, y + 11, { lineBreak: false });
    doc.fillColor(C.white).fontSize(14).font('Helvetica-Bold')
      .text(INR(record.netSalary), 40, y + 9, { width: 503, align: 'right', lineBreak: false });
    y += 50;

    // ── FOOTER — generated date + HR signature ──────────────────────────────
    const footerY = Math.max(y + 20, doc.page.height - 120);
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
