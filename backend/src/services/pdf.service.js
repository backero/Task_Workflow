const PDFDocument = require('pdfkit');

const BRAND = '#4f46e5'; // indigo-600
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
      .fontSize(isHeader ? 9 : 9)
      .fillColor(isHeader ? '#ffffff' : BLACK)
      .text(String(text), x, y, { width: widths[i] - 6, align });
    x += widths[i];
  });
  doc.restore();
};

/**
 * Streams a PDF invoice to the Express response object.
 */
const generateInvoicePDF = (invoice, org, res) => {
  const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Invoice-${invoice.invoiceNumber}.pdf"`);
  doc.pipe(res);

  /* ── Header band ────────────────────────────────── */
  doc.rect(0, 0, 595, 90).fillColor(BRAND).fill();

  // Company name
  doc.font('Helvetica-Bold').fontSize(22).fillColor('#ffffff')
     .text(org?.name || 'Company', 50, 28, { width: 300 });

  if (org?.address) {
    doc.font('Helvetica').fontSize(9).fillColor('rgba(255,255,255,0.8)')
       .text(org.address, 50, 55, { width: 300 });
  }

  // "INVOICE" label
  doc.font('Helvetica-Bold').fontSize(28).fillColor('rgba(255,255,255,0.3)')
     .text('INVOICE', 380, 28, { width: 165, align: 'right' });

  // Invoice number
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#ffffff')
     .text(invoice.invoiceNumber, 380, 63, { width: 165, align: 'right' });

  /* ── Meta row ───────────────────────────────────── */
  const metaY = 108;
  const STATUS_COLOR = { PAID: '#10b981', SENT: '#3b82f6', DRAFT: '#6b7280', CANCELLED: '#ef4444' };
  const statusColor  = STATUS_COLOR[invoice.status] || GRAY;

  doc.font('Helvetica').fontSize(9).fillColor(GRAY);
  doc.text(`Issue Date: `, 50, metaY, { continued: true })
     .font('Helvetica-Bold').fillColor(BLACK).text(fmtDate(invoice.issueDate));

  doc.font('Helvetica').fillColor(GRAY)
     .text(`Due Date:   `, 50, metaY + 14, { continued: true })
     .font('Helvetica-Bold').fillColor(BLACK).text(fmtDate(invoice.dueDate));

  // Status badge
  doc.roundedRect(430, metaY, 115, 22, 4).fillColor(statusColor).fill();
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#ffffff')
     .text(invoice.status, 430, metaY + 6, { width: 115, align: 'center' });

  drawHR(doc, 140);

  /* ── Bill To ────────────────────────────────────── */
  const c = invoice.customer;
  doc.font('Helvetica-Bold').fontSize(9).fillColor(GRAY)
     .text('BILL TO', 50, 152);
  doc.font('Helvetica-Bold').fontSize(12).fillColor(BLACK)
     .text(c.name, 50, 165);
  doc.font('Helvetica').fontSize(9).fillColor(GRAY);
  if (c.email)   doc.text(c.email,   50, doc.y + 2);
  if (c.phone)   doc.text(c.phone,   50, doc.y + 2);
  if (c.address) doc.text(c.address, 50, doc.y + 2, { width: 220 });
  if (c.gstin)   doc.text(`GSTIN: ${c.gstin}`, 50, doc.y + 2);

  drawHR(doc, 240);

  /* ── Items table ────────────────────────────────── */
  const colW = [230, 50, 75, 55, 85]; // Description, Qty, Unit Price, Tax%, Amount
  const headers = ['Description', 'Qty', 'Unit Price', 'Tax %', 'Amount'];
  tableRow(doc, 252, headers, colW, true);

  let rowY = 276;
  invoice.items.forEach((item, idx) => {
    if (idx % 2 === 1) {
      doc.rect(50, rowY - 3, 495, 18).fillColor(LIGHT).fill();
    }
    tableRow(doc, rowY, [
      item.description,
      item.quantity,
      fmtCurrency(item.unitPrice),
      `${item.taxRate || 0}%`,
      fmtCurrency(item.amount),
    ], colW);
    rowY += 18;
    if (rowY > 680) {
      doc.addPage();
      rowY = 60;
    }
  });

  drawHR(doc, rowY + 4);

  /* ── Totals ─────────────────────────────────────── */
  const totY = rowY + 16;
  const totX = 360;

  const totRow = (label, value, bold = false) => {
    const y = doc.y + 4;
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
       .fillColor(bold ? BLACK : GRAY)
       .text(label, totX, y, { width: 80, align: 'right' });
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 9)
       .fillColor(bold ? BRAND : BLACK)
       .text(value, totX + 85, y, { width: 110, align: 'right' });
  };

  doc.y = totY;
  totRow('Subtotal',  fmtCurrency(invoice.subtotal));
  totRow('Tax',       fmtCurrency(invoice.taxAmount));
  drawHR(doc, doc.y + 8, BRAND);
  doc.y += 10;
  totRow('Total',     fmtCurrency(invoice.totalAmount), true);

  /* ── Notes ──────────────────────────────────────── */
  if (invoice.notes) {
    drawHR(doc, doc.y + 20);
    doc.y += 28;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(GRAY).text('NOTES');
    doc.font('Helvetica').fontSize(9).fillColor(BLACK).text(invoice.notes, { width: 300 });
  }

  /* ── Signature ──────────────────────────────────── */
  const sigY = 720;
  drawHR(doc, sigY);
  doc.font('Helvetica').fontSize(8).fillColor(GRAY)
     .text('Authorised Signature', 380, sigY + 6, { width: 165, align: 'center' });
  if (invoice.signature) {
    doc.font('Helvetica-Bold').fontSize(11).fillColor(BLACK)
       .text(invoice.signature, 380, sigY + 18, { width: 165, align: 'center' });
  } else {
    doc.moveTo(380, sigY + 34).lineTo(545, sigY + 34).strokeColor('#d1d5db').lineWidth(0.5).stroke();
  }

  /* ── Footer ─────────────────────────────────────── */
  doc.font('Helvetica').fontSize(8).fillColor(GRAY)
     .text(`Generated by Backero · ${new Date().toLocaleDateString('en-IN')}`, 50, 790, { width: 495, align: 'center' });

  doc.end();
};

module.exports = { generateInvoicePDF };
