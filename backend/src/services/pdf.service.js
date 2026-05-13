const PDFDocument = require('pdfkit');

const BRAND = '#4f46e5';
const GRAY  = '#6b7280';
const LIGHT = '#f9fafb';
const BLACK = '#111827';

const fmtCurrency = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate     = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const drawHR = (doc, y, color = '#e5e7eb') => {
  doc.save().strokeColor(color).lineWidth(0.5).moveTo(50, y).lineTo(545, y).stroke().restore();
};

const tableRow = (doc, y, cols, widths, isHeader = false) => {
  const x0 = 50;
  let x = x0;
  doc.save();
  if (isHeader) {
    doc.rect(x0, y - 4, 495, 20).fillColor(BRAND).fill();
  }
  cols.forEach((text, i) => {
    const align = i > 0 ? 'right' : 'left';
    doc
      .font(isHeader ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(9)
      .fillColor(isHeader ? '#ffffff' : BLACK)
      .text(String(text), x, y, { width: widths[i] - 6, align });
    x += widths[i];
  });
  doc.restore();
};

const orgAddressLines = (org) => {
  const lines = [];
  if (org?.address?.line1) lines.push(org.address.line1);
  const cityState = [org?.address?.city, org?.address?.state].filter(Boolean).join(', ');
  if (cityState) lines.push(cityState);
  if (org?.address?.pincode) lines[lines.length - 1] = (lines[lines.length - 1] || '') + ' — ' + org.address.pincode;
  return lines;
};

/**
 * Streams a branded PDF invoice to the Express response object.
 */
const generateInvoicePDF = (invoice, org, res) => {
  const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Invoice-${invoice.invoiceNumber}.pdf"`);
  doc.pipe(res);

  /* ── Header band ─────────────────────────────────────── */
  doc.rect(0, 0, 595, 95).fillColor(BRAND).fill();

  // Company name
  doc.font('Helvetica-Bold').fontSize(20).fillColor('#ffffff')
     .text(org?.name || 'Company', 50, 22, { width: 300 });

  // Address lines
  const addrLines = orgAddressLines(org);
  let addrY = 46;
  addrLines.forEach(line => {
    doc.font('Helvetica').fontSize(8).fillColor('rgba(255,255,255,0.8)')
       .text(line, 50, addrY, { width: 300 });
    addrY += 11;
  });

  // Phone / email
  const contactParts = [org?.phone, org?.email].filter(Boolean);
  if (contactParts.length > 0) {
    doc.font('Helvetica').fontSize(8).fillColor('rgba(255,255,255,0.7)')
       .text(contactParts.join('  ·  '), 50, addrY, { width: 300 });
    addrY += 11;
  }

  // "INVOICE" watermark label
  doc.font('Helvetica-Bold').fontSize(26).fillColor('rgba(255,255,255,0.25)')
     .text('INVOICE', 360, 22, { width: 185, align: 'right' });

  // Invoice number
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#ffffff')
     .text(invoice.invoiceNumber, 360, 54, { width: 185, align: 'right' });

  // GSTIN on right
  if (org?.gstin) {
    doc.font('Helvetica').fontSize(8).fillColor('rgba(255,255,255,0.8)')
       .text(`GSTIN: ${org.gstin}`, 360, 68, { width: 185, align: 'right' });
  }

  /* ── Meta row ─────────────────────────────────────────── */
  const metaY = 110;
  const STATUS_COLOR = { PAID: '#10b981', SENT: '#3b82f6', DRAFT: '#6b7280', CANCELLED: '#ef4444' };
  const statusColor  = STATUS_COLOR[invoice.status] || GRAY;

  doc.font('Helvetica').fontSize(9).fillColor(GRAY);
  doc.text('Issue Date: ', 50, metaY, { continued: true })
     .font('Helvetica-Bold').fillColor(BLACK).text(fmtDate(invoice.issueDate));

  doc.font('Helvetica').fillColor(GRAY)
     .text('Due Date:   ', 50, metaY + 14, { continued: true })
     .font('Helvetica-Bold').fillColor(BLACK).text(fmtDate(invoice.dueDate));

  // Status badge
  doc.roundedRect(430, metaY, 115, 22, 4).fillColor(statusColor).fill();
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#ffffff')
     .text(invoice.status, 430, metaY + 6, { width: 115, align: 'center' });

  drawHR(doc, 145);

  /* ── Bill To + Pay To ─────────────────────────────────── */
  const c = invoice.customer;
  doc.font('Helvetica-Bold').fontSize(8).fillColor(GRAY)
     .text('BILL TO', 50, 157);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(BLACK)
     .text(c.name, 50, 169);
  doc.font('Helvetica').fontSize(8.5).fillColor(GRAY);
  if (c.email)   doc.text(c.email,   50, doc.y + 2);
  if (c.phone)   doc.text(c.phone,   50, doc.y + 2);
  if (c.address) doc.text(c.address, 50, doc.y + 2, { width: 220 });
  if (c.gstin)   doc.text(`GSTIN: ${c.gstin}`, 50, doc.y + 2);

  // Pay To (bank details on right)
  const bd = org?.bankDetails;
  if (bd && (bd.bankName || bd.accountNumber || bd.upiId)) {
    doc.font('Helvetica-Bold').fontSize(8).fillColor(GRAY)
       .text('PAY TO', 320, 157);
    doc.font('Helvetica').fontSize(8.5).fillColor(BLACK);
    let bY = 169;
    if (bd.bankName)      { doc.text(`Bank: ${bd.bankName}`, 320, bY); bY += 12; }
    if (bd.accountNumber) { doc.text(`A/C: ${bd.accountNumber}`, 320, bY); bY += 12; }
    if (bd.ifsc)          { doc.text(`IFSC: ${bd.ifsc}`, 320, bY); bY += 12; }
    if (bd.upiId)         { doc.font('Helvetica-Bold').text(`UPI: ${bd.upiId}`, 320, bY); }
  }

  drawHR(doc, 248);

  /* ── Items table ──────────────────────────────────────── */
  const colW = [235, 45, 75, 50, 90]; // Description, Qty, Unit Price, Tax%, Amount
  tableRow(doc, 260, ['Description', 'Qty', 'Unit Price', 'Tax %', 'Amount'], colW, true);

  let rowY = 284;
  invoice.items.forEach((item, idx) => {
    if (idx % 2 === 1) {
      doc.rect(50, rowY - 3, 495, 18).fillColor(LIGHT).fill();
    }
    tableRow(doc, rowY, [
      item.description,
      `${item.quantity}${item.unit ? ' ' + item.unit : ''}`,
      fmtCurrency(item.unitPrice),
      `${item.taxRate || 0}%`,
      fmtCurrency(item.amount),
    ], colW);
    rowY += 18;
    if (rowY > 660) { doc.addPage(); rowY = 60; }
  });

  drawHR(doc, rowY + 4);

  /* ── Totals ───────────────────────────────────────────── */
  const totY = rowY + 16;
  const totX = 355;

  const totRow = (label, value, bold = false) => {
    const y = doc.y + 4;
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
       .fillColor(bold ? BLACK : GRAY)
       .text(label, totX, y, { width: 85, align: 'right' });
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 9)
       .fillColor(bold ? BRAND : BLACK)
       .text(value, totX + 90, y, { width: 100, align: 'right' });
  };

  doc.y = totY;
  totRow('Subtotal', fmtCurrency(invoice.subtotal));
  totRow('Tax',      fmtCurrency(invoice.taxAmount));
  drawHR(doc, doc.y + 8, BRAND);
  doc.y += 10;
  totRow('Total',    fmtCurrency(invoice.totalAmount), true);

  /* ── Notes ────────────────────────────────────────────── */
  if (invoice.notes) {
    drawHR(doc, doc.y + 20);
    doc.y += 28;
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(GRAY).text('NOTES');
    doc.font('Helvetica').fontSize(8.5).fillColor(BLACK).text(invoice.notes, { width: 280 });
  }

  /* ── Signature ────────────────────────────────────────── */
  const sigY = 730;
  drawHR(doc, sigY);
  doc.font('Helvetica').fontSize(8).fillColor(GRAY)
     .text('Authorised Signature', 380, sigY + 6, { width: 165, align: 'center' });
  if (invoice.signature) {
    doc.font('Helvetica-Bold').fontSize(11).fillColor(BLACK)
       .text(invoice.signature, 380, sigY + 18, { width: 165, align: 'center' });
  } else {
    doc.moveTo(380, sigY + 34).lineTo(545, sigY + 34).strokeColor('#d1d5db').lineWidth(0.5).stroke();
  }

  /* ── Footer ───────────────────────────────────────────── */
  doc.font('Helvetica').fontSize(7.5).fillColor(GRAY)
     .text(`This is a computer-generated invoice · Generated by Backero · ${new Date().toLocaleDateString('en-IN')}`, 50, 795, { width: 495, align: 'center' });

  doc.end();
};

module.exports = { generateInvoicePDF };
