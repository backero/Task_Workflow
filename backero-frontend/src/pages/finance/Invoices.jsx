
import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  PlusIcon, XMarkIcon, PencilIcon,
  TrashIcon, EyeIcon, DocumentTextIcon,
  BanknotesIcon, ArrowDownTrayIcon, CubeIcon, MagnifyingGlassIcon,
  ArrowLeftIcon, UserIcon, ChatBubbleLeftEllipsisIcon,
  ExclamationTriangleIcon, CheckBadgeIcon, ClockIcon,
} from '@heroicons/react/24/outline';
import QRCode from 'react-qr-code';
import api from '../../api/axios';
import backeroLogo from '../../assets/Backero.png';
import { useAuthStore } from '../../store/useAuthStore';
import { clsx } from 'clsx';
import { format, differenceInDays } from 'date-fns';
import toast from 'react-hot-toast';

// ── Constants ─────────────────────────────────────────────────────────────────
const GST_RATES = [0, 5, 12, 18, 28];
const UNITS = ['pcs', 'kg', 'ltr', 'mt', 'box', 'set', 'hr', 'day', 'month'];
const STATUS_STYLES = {
  draft: 'bg-gray-100 text-gray-600 dark:bg-[#132035] dark:text-gray-300',
  sent: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  paid: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  partially_paid: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  overdue: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  cancelled: 'bg-gray-100 text-gray-500 dark:bg-[#132035] dark:text-gray-400',
};

const INR = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const BACKERO = {
  name: 'Backero Private Limited',
  address: '42, Interflex Complex, Near 5K Car Care, Trichy Road, Sulur, Coimbatore - 641402',
  gst: '33AAJCB0859L1ZH',
  stateCode: '33',
  state: 'Tamil Nadu',
  website: 'www.backero.in',
};

const TYPE_LABEL = {
  invoice: 'TAX INVOICE', quotation: 'QUOTATION',
  proforma: 'PROFORMA INVOICE', credit_note: 'CREDIT NOTE', debit_note: 'DEBIT NOTE',
};

const STATUS_CARD = {
  draft:          { border: 'border-gray-200 dark:border-[#1b2e4a]',        accent: 'bg-gray-50 dark:bg-[#0f1a2e]',          badge: 'bg-gray-100 text-gray-600 dark:bg-gray-700/50 dark:text-gray-300' },
  sent:           { border: 'border-blue-200 dark:border-blue-800/60',       accent: 'bg-blue-50 dark:bg-blue-900/20',          badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  paid:           { border: 'border-green-200 dark:border-green-800/60',     accent: 'bg-green-50 dark:bg-green-900/20',        badge: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  partially_paid: { border: 'border-amber-200 dark:border-amber-800/60',     accent: 'bg-amber-50 dark:bg-amber-900/20',        badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  overdue:        { border: 'border-red-300 dark:border-red-800/60',         accent: 'bg-red-50 dark:bg-red-900/20',            badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  cancelled:      { border: 'border-gray-200 dark:border-[#1b2e4a]',        accent: 'bg-gray-50 dark:bg-[#0f1a2e]',          badge: 'bg-gray-100 text-gray-400' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function amountInWords(amount) {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  function convert(n) {
    if (n === 0) return '';
    if (n < 20) return ones[n] + ' ';
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '') + ' ';
    if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred ' + convert(n % 100);
    if (n < 100000) return convert(Math.floor(n / 1000)) + 'Thousand ' + convert(n % 1000);
    if (n < 10000000) return convert(Math.floor(n / 100000)) + 'Lakh ' + convert(n % 100000);
    return convert(Math.floor(n / 10000000)) + 'Crore ' + convert(n % 10000000);
  }
  if (!amount || amount < 0) return 'Zero Rupees Only';
  const rounded = Math.round(amount * 100);
  const rupees = Math.floor(rounded / 100);
  const paise = rounded % 100;
  let words = (convert(rupees).trim() || 'Zero') + ' Rupees';
  if (paise > 0) words += ' and ' + convert(paise).trim() + ' Paise';
  return words.trim() + ' Only';
}

function isIntraState(clientGstin, clientState) {
  if (clientGstin && clientGstin.length >= 2) return clientGstin.startsWith(BACKERO.stateCode);
  if (clientState) return /tamil\s*nadu/i.test(clientState);
  return false;
}

// ── PDF / Print (B2B GST Compliant) ──────────────────────────────────────────
function printInvoice(inv, org, user) {
  const fmtDate = (d) => d ? format(new Date(d), 'dd MMM yyyy') : '—';
  const intra = isIntraState(inv.client?.gstin, inv.client?.state);
  const bd = org?.bankDetails || {};
  const docTitle = TYPE_LABEL[inv.type] || 'TAX INVOICE';
  const placeOfSupply = inv.client?.state || '—';
  const sigName = inv.signatoryName || user?.name || '';
  const totalCgst = intra ? (inv.totalGst || 0) / 2 : 0;
  const totalSgst = intra ? (inv.totalGst || 0) / 2 : 0;
  const totalIgst = !intra ? (inv.totalGst || 0) : 0;
  const grandTotal = inv.totalAmount || 0;
  const payAmt = inv.balanceAmount > 0 ? inv.balanceAmount : grandTotal;
  const upiUri = bd.upiId ? `upi://pay?pa=${bd.upiId}&pn=${encodeURIComponent(bd.accountName || BACKERO.name)}&am=${payAmt.toFixed(2)}&tn=${inv.invoiceNumber}&cu=INR` : null;
  const qrUrl = upiUri ? `https://chart.googleapis.com/chart?chs=100x100&cht=qr&chl=${encodeURIComponent(upiUri)}` : null;

  const rows = (inv.lineItems || []).map((it, i) => {
    const taxable = (Number(it.quantity) * Number(it.unitPrice)) - Number(it.discount || 0);
    const halfRate = (Number(it.gstRate) || 0) / 2;
    const halfAmt = taxable * halfRate / 100;
    const igstAmt = taxable * (Number(it.gstRate) || 0) / 100;
    const bg = i % 2 === 0 ? '#ffffff' : '#f8fafc';
    const td = `padding:7px 5px;border-bottom:1px solid #e2e8f0`;
    if (intra) {
      return `<tr style="background:${bg}">
        <td style="${td};text-align:center">${i + 1}</td>
        <td style="${td}">${it.description}</td>
        <td style="${td};text-align:center;font-family:monospace;font-size:9px">${it.hsnCode || '—'}</td>
        <td style="${td};text-align:center">${it.quantity} ${it.unit || ''}</td>
        <td style="${td};text-align:right">${INR(it.unitPrice)}</td>
        <td style="${td};text-align:right;color:${it.discount ? '#dc2626' : '#94a3b8'}">${it.discount ? INR(it.discount) : '—'}</td>
        <td style="${td};text-align:right;font-weight:600">${INR(taxable)}</td>
        <td style="${td};text-align:center">${halfRate}%</td>
        <td style="${td};text-align:right">${INR(halfAmt)}</td>
        <td style="${td};text-align:center">${halfRate}%</td>
        <td style="${td};text-align:right">${INR(halfAmt)}</td>
        <td style="${td};text-align:right;font-weight:700">${INR(it.total)}</td>
      </tr>`;
    }
    return `<tr style="background:${bg}">
      <td style="${td};text-align:center">${i + 1}</td>
      <td style="${td}">${it.description}</td>
      <td style="${td};text-align:center;font-family:monospace;font-size:9px">${it.hsnCode || '—'}</td>
      <td style="${td};text-align:center">${it.quantity} ${it.unit || ''}</td>
      <td style="${td};text-align:right">${INR(it.unitPrice)}</td>
      <td style="${td};text-align:right;color:${it.discount ? '#dc2626' : '#94a3b8'}">${it.discount ? INR(it.discount) : '—'}</td>
      <td style="${td};text-align:right;font-weight:600">${INR(taxable)}</td>
      <td style="${td};text-align:center">${Number(it.gstRate) || 0}%</td>
      <td style="${td};text-align:right">${INR(igstAmt)}</td>
      <td style="${td};text-align:right;font-weight:700">${INR(it.total)}</td>
    </tr>`;
  }).join('');

  const thead = intra
    ? `<th style="width:24px">#</th><th style="text-align:left">Description</th><th>HSN/SAC</th><th>Qty</th><th style="text-align:right">Rate</th><th style="text-align:right">Disc</th><th style="text-align:right">Taxable</th><th>CGST%</th><th style="text-align:right">CGST</th><th>SGST%</th><th style="text-align:right">SGST</th><th style="text-align:right">Total</th>`
    : `<th style="width:24px">#</th><th style="text-align:left">Description</th><th>HSN/SAC</th><th>Qty</th><th style="text-align:right">Rate</th><th style="text-align:right">Disc</th><th style="text-align:right">Taxable</th><th>IGST%</th><th style="text-align:right">IGST</th><th style="text-align:right">Total</th>`;

  const tfoot = intra
    ? `<tr style="background:#f1f5f9;font-weight:700">
        <td colspan="6" style="padding:8px 5px;text-align:right;color:#64748b;font-size:10px">TOTALS</td>
        <td style="padding:8px 5px;text-align:right">${INR(inv.subtotal)}</td>
        <td></td><td style="padding:8px 5px;text-align:right">${INR(totalCgst)}</td>
        <td></td><td style="padding:8px 5px;text-align:right">${INR(totalSgst)}</td>
        <td style="padding:8px 5px;text-align:right">${INR(grandTotal)}</td>
      </tr>`
    : `<tr style="background:#f1f5f9;font-weight:700">
        <td colspan="6" style="padding:8px 5px;text-align:right;color:#64748b;font-size:10px">TOTALS</td>
        <td style="padding:8px 5px;text-align:right">${INR(inv.subtotal)}</td>
        <td></td><td style="padding:8px 5px;text-align:right">${INR(totalIgst)}</td>
        <td style="padding:8px 5px;text-align:right">${INR(grandTotal)}</td>
      </tr>`;

  const win = window.open('', '_blank', 'width=960,height=720');
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${inv.invoiceNumber}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;font-size:10.5px;color:#1a1a1a;background:#fff}
  .page{width:210mm;min-height:297mm;padding:11mm 13mm;margin:0 auto}
  .hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1e293b;padding-bottom:12px;margin-bottom:12px}
  .logo{height:48px;max-width:140px;object-fit:contain;display:block;margin-bottom:4px}
  .co-name{font-size:12px;font-weight:800;color:#1e293b;margin-bottom:2px}
  .co-det{font-size:9px;color:#475569;line-height:1.6}
  .inv-block{text-align:right}
  .inv-type{font-size:24px;font-weight:900;color:#1e40af;letter-spacing:.5px}
  .inv-num{font-size:10.5px;font-family:monospace;color:#64748b;margin-top:2px}
  .inv-stat{display:inline-block;padding:2px 10px;border-radius:20px;font-size:8.5px;font-weight:700;letter-spacing:1px;margin-top:5px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe}
  .meta{display:flex;gap:0;background:#f8fafc;border:1px solid #e2e8f0;border-radius:7px;margin-bottom:11px;overflow:hidden}
  .mi{flex:1;padding:7px 10px;border-right:1px solid #e2e8f0}
  .mi:last-child{border-right:none}
  .mi-l{font-size:7.5px;color:#94a3b8;text-transform:uppercase;letter-spacing:1.5px;display:block;margin-bottom:2px;font-weight:700}
  .mi-v{font-size:10.5px;font-weight:700;color:#1e293b}
  .parties{display:flex;gap:14px;margin-bottom:12px}
  .party{flex:1;border:1px solid #e2e8f0;border-radius:7px;padding:9px 12px}
  .p-lbl{font-size:7.5px;color:#94a3b8;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;margin-bottom:4px}
  .p-name{font-size:13px;font-weight:800;color:#1e293b;margin-bottom:2px}
  .p-det{font-size:9px;color:#475569;line-height:1.6}
  .gstin{display:inline-block;background:#eff6ff;color:#1d4ed8;padding:1px 6px;border-radius:3px;font-family:monospace;font-size:8.5px;margin-top:2px}
  table{width:100%;border-collapse:collapse;font-size:9.5px;margin-bottom:12px}
  thead tr{background:#1e293b;color:#fff}
  th{padding:8px 5px;font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;text-align:center}
  .totals-row{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:12px}
  .words-box{flex:1;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:7px 12px}
  .words-lbl{font-size:7.5px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:2px}
  .words-val{font-size:10.5px;font-weight:700;color:#78350f;font-style:italic}
  .tot-tbl{min-width:240px;border:1px solid #e2e8f0;border-radius:7px;overflow:hidden}
  .tr{display:flex;justify-content:space-between;padding:5px 12px;border-bottom:1px solid #f1f5f9;font-size:10.5px}
  .tr:last-child{border-bottom:none}
  .tl{color:#64748b}.tv{font-weight:600;color:#1e293b}
  .tgrand{background:#1e293b;color:#fff;font-size:13px;font-weight:800;padding:9px 12px;display:flex;justify-content:space-between}
  .tbal{background:#fef2f2;color:#991b1b;font-size:10.5px;font-weight:700;padding:6px 12px;display:flex;justify-content:space-between}
  .tpaid{background:#f0fdf4;color:#166534;font-size:10.5px;font-weight:700;padding:6px 12px;display:flex;justify-content:space-between}
  .notes-b{background:#fffbeb;border-left:3px solid #f59e0b;padding:7px 11px;border-radius:0 5px 5px 0;margin-bottom:8px;font-size:9.5px}
  .terms-b{background:#eff6ff;border-left:3px solid #2563eb;padding:7px 11px;border-radius:0 5px 5px 0;font-size:9.5px}
  .b-lbl{font-weight:800;font-size:8px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px}
  .footer{display:flex;justify-content:space-between;align-items:flex-end;padding-top:12px;border-top:1px solid #e2e8f0;margin-top:12px}
  .bank h4{font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#1e293b;margin-bottom:7px}
  .brow{font-size:9.5px;color:#475569;margin-bottom:2px}
  .brow b{color:#1e293b}
  .sig{text-align:center;min-width:170px}
  .sig-line{border-top:1.5px solid #1e293b;padding-top:5px;margin-top:3px;font-size:8.5px;font-weight:700;letter-spacing:.5px;color:#475569}
  .stamp{text-align:center;font-size:8px;color:#94a3b8;margin-top:16px;padding-top:10px;border-top:1px dashed #e2e8f0}
  @media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}.page{padding:7mm 9mm}}
</style></head><body><div class="page">

<div class="hdr">
  <div>
    <img src="${backeroLogo}" class="logo" alt="Backero"/>
    <div class="co-name">${BACKERO.name}</div>
    <div class="co-det">
      ${BACKERO.address}<br/>
      ${user?.phone ? `📞 ${user.phone} &nbsp;` : ''}${user?.email ? `✉ ${user.email}` : ''}<br/>
      🌐 ${BACKERO.website} &nbsp;&nbsp; <b>GSTIN:</b> ${BACKERO.gst}
    </div>
  </div>
  <div class="inv-block">
    <div class="inv-type">${docTitle}</div>
    <div class="inv-num">${inv.invoiceNumber}</div>
    <div class="inv-stat">${(inv.status || '').toUpperCase().replace('_', ' ')}</div>
  </div>
</div>

<div class="meta">
  <div class="mi"><span class="mi-l">Invoice Date</span><span class="mi-v">${fmtDate(inv.issueDate)}</span></div>
  <div class="mi"><span class="mi-l">Due Date</span><span class="mi-v">${fmtDate(inv.dueDate)}</span></div>
  <div class="mi"><span class="mi-l">Place of Supply</span><span class="mi-v">${placeOfSupply}</span></div>
  <div class="mi"><span class="mi-l">Payment Terms</span><span class="mi-v">${inv.paymentTerms || 'Net 30'}</span></div>
  <div class="mi"><span class="mi-l">GST Type</span><span class="mi-v" style="color:${intra ? '#1d4ed8' : '#7c3aed'}">${intra ? 'Intra-State (TN)' : 'Inter-State'}</span></div>
</div>

<div class="parties">
  <div class="party">
    <div class="p-lbl">Bill To</div>
    <div class="p-name">${inv.client?.name || ''}</div>
    <div class="p-det">
      ${inv.client?.address ? `${inv.client.address}<br/>` : ''}
      ${inv.client?.state ? `${inv.client.state}<br/>` : ''}
      ${inv.client?.phone ? `📞 ${inv.client.phone}<br/>` : ''}
      ${inv.client?.email ? `✉ ${inv.client.email}` : ''}
      ${inv.client?.gstin ? `<br/><span class="gstin">GSTIN: ${inv.client.gstin}</span>` : ''}
    </div>
  </div>
  <div class="party" style="background:#f0fdf4;border-color:#bbf7d0">
    <div class="p-lbl">Seller / Dispatch From</div>
    <div class="p-name">${BACKERO.name}</div>
    <div class="p-det">
      ${BACKERO.address}<br/>
      <span class="gstin">GSTIN: ${BACKERO.gst}</span>
    </div>
  </div>
</div>

<table>
  <thead><tr>${thead}</tr></thead>
  <tbody>${rows}</tbody>
  <tfoot>${tfoot}</tfoot>
</table>

<div class="totals-row">
  <div style="flex:1">
    <div class="words-box" style="margin-bottom:8px">
      <span class="words-lbl">Amount in Words (INR)</span>
      <span class="words-val">${amountInWords(grandTotal)}</span>
    </div>
    ${inv.notes ? `<div class="notes-b"><div class="b-lbl" style="color:#92400e">Notes</div>${inv.notes}</div>` : ''}
    ${inv.terms ? `<div class="terms-b" style="margin-top:${inv.notes ? '8px' : '0'}"><div class="b-lbl" style="color:#1d4ed8">Terms & Conditions</div>${inv.terms}</div>` : ''}
  </div>
  <div class="tot-tbl">
    <div class="tr"><span class="tl">Subtotal</span><span class="tv">${INR(inv.subtotal)}</span></div>
    ${inv.totalDiscount > 0 ? `<div class="tr"><span class="tl">Discount</span><span class="tv" style="color:#dc2626">-${INR(inv.totalDiscount)}</span></div>` : ''}
    ${intra
      ? `<div class="tr"><span class="tl">CGST</span><span class="tv">${INR(totalCgst)}</span></div><div class="tr"><span class="tl">SGST</span><span class="tv">${INR(totalSgst)}</span></div>`
      : `<div class="tr"><span class="tl">IGST</span><span class="tv">${INR(totalIgst)}</span></div>`}
    <div class="tgrand"><span>Grand Total</span><span>${INR(grandTotal)}</span></div>
    ${inv.paidAmount > 0 ? `<div class="tpaid"><span>Amount Paid</span><span>${INR(inv.paidAmount)}</span></div>` : ''}
    ${inv.balanceAmount > 0 ? `<div class="tbal"><span>Balance Due</span><span>${INR(inv.balanceAmount)}</span></div>` : ''}
  </div>
</div>

<div class="footer">
  <div class="bank">
    ${(bd.bankName || bd.accountNumber) ? `
    <h4>Bank Details</h4>
    ${bd.accountName ? `<div class="brow">A/c Name: <b>${bd.accountName}</b></div>` : ''}
    ${bd.bankName ? `<div class="brow">Bank: <b>${bd.bankName}${bd.branch ? ` — ${bd.branch}` : ''}</b></div>` : ''}
    ${bd.accountNumber ? `<div class="brow">A/c No: <b>${bd.accountNumber}</b></div>` : ''}
    ${bd.ifscCode ? `<div class="brow">IFSC: <b>${bd.ifscCode}</b></div>` : ''}
    ${bd.upiId ? `<div class="brow">UPI: <b>${bd.upiId}</b></div>` : ''}
    ` : '<p style="font-size:8.5px;color:#94a3b8;font-style:italic">No bank details configured.</p>'}
  </div>
  ${qrUrl ? `<div style="text-align:center"><img src="${qrUrl}" width="88" height="88" style="border:1px solid #e2e8f0;border-radius:5px;padding:3px;background:#fff"/><p style="font-size:7.5px;color:#64748b;margin-top:2px;font-weight:600">Scan to Pay via UPI</p></div>` : ''}
  <div class="sig">
    ${org?.signatureUrl
      ? `<img src="${org.signatureUrl}" alt="Sig" style="max-height:55px;max-width:150px;object-fit:contain;display:block;margin:0 auto 3px"/>`
      : `<div style="height:50px;display:flex;align-items:flex-end;justify-content:center;padding-bottom:2px"><span style="font-family:'Brush Script MT',cursive;font-size:28px;color:#1e293b;line-height:1">${sigName}</span></div>`}
    <div class="sig-line">Authorised Signatory<br/><span style="font-size:7.5px;font-weight:400">${BACKERO.name}</span></div>
  </div>
</div>

<div class="stamp">This is a computer-generated ${docTitle}. No physical signature required. &nbsp;|&nbsp; Generated by Backero ERP on ${new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}</div>
</div>
<script>window.onload=function(){window.print();window.onafterprint=function(){window.close()}}</script>
</body></html>`);
  win.document.close();
}


// ── Line Items Totals (reactive) ──────────────────────────────────────────────
function useTotals(control) {
  const items = useWatch({ control, name: 'lineItems' }) || [];
  return useMemo(() => {
    let subtotal = 0, totalGst = 0, totalDiscount = 0;
    items.forEach((it) => {
      const base = (Number(it?.quantity) || 0) * (Number(it?.unitPrice) || 0);
      const disc = Number(it?.discount) || 0;
      const net = base - disc;
      const gst = (net * (Number(it?.gstRate) || 0)) / 100;
      subtotal += net;
      totalGst += gst;
      totalDiscount += disc;
    });
    return { subtotal, totalGst, totalDiscount, total: subtotal + totalGst };
  }, [JSON.stringify(items)]);
}

// ── Live Signature Preview ────────────────────────────────────────────────────
function SignaturePreview({ control }) {
  const name = useWatch({ control, name: 'signatoryName' }) || '';
  return (
    <span style={{ fontFamily: "'Brush Script MT', 'Dancing Script', cursive", fontSize: '30px', color: '#1e293b', lineHeight: 1.1 }}>
      {name || <span style={{ fontSize: '13px', fontFamily: 'inherit', color: '#94a3b8', fontStyle: 'italic' }}>signature appears here…</span>}
    </span>
  );
}

// ── CRM Lead Picker ───────────────────────────────────────────────────────────
function LeadPicker({ onSelect }) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ['lead-pick', search],
    queryFn: () => api.get('/crm/leads', { params: { search, limit: 6 } }).then(r => r.data),
    enabled: open,
    staleTime: 20_000,
  });
  const leads = data?.data || [];
  return (
    <div className="relative mb-4">
      <label className="label">Auto-fill from CRM Lead</label>
      <div className="relative">
        <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
        <input
          value={search}
          onFocus={() => setOpen(true)}
          onChange={e => { setSearch(e.target.value); setOpen(true); }}
          className="input pl-9 text-sm"
          placeholder="Search leads by name / company…"
        />
      </div>
      {open && (
        <div className="absolute top-full left-0 right-0 z-50 bg-white dark:bg-[#0f1a2e] border border-gray-200 dark:border-[#1b2e4a] rounded-xl shadow-2xl mt-1 overflow-hidden">
          {leads.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">No leads found</p>
          ) : leads.map(l => (
            <button
              key={l._id}
              type="button"
              onClick={() => { onSelect(l); setOpen(false); setSearch(''); }}
              className="w-full text-left px-3 py-2.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 border-b border-gray-50 dark:border-[#1b2e4a]/50 last:border-0 flex items-center justify-between"
            >
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{l.name}</p>
                {l.company && <p className="text-xs text-gray-400">{l.company}</p>}
              </div>
              <div className="text-right">
                {l.phone && <p className="text-xs text-gray-500">{l.phone}</p>}
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">{l.status}</span>
              </div>
            </button>
          ))}
          <div className="px-3 py-1.5 bg-gray-50 dark:bg-[#0a1220] border-t border-gray-100 dark:border-[#1b2e4a]">
            <button type="button" onClick={() => setOpen(false)} className="text-xs text-gray-400 hover:text-gray-600">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Invoice Form (Create / Edit) ──────────────────────────────────────────────
function InvoiceForm({ existingInv, prefillLead, orgData, onClose, onSaved }) {
  const qc = useQueryClient();
  const { user } = useAuthStore();

  const defaultLineItem = { description: '', hsnCode: '', quantity: 1, unit: 'pcs', unitPrice: 0, gstRate: 18, discount: 0 };

  const { control, register, handleSubmit, setValue, formState: { errors } } = useForm({
    defaultValues: existingInv ? {
      ...existingInv,
      issueDate: existingInv.issueDate ? existingInv.issueDate.split('T')[0] : new Date().toISOString().split('T')[0],
      dueDate: existingInv.dueDate ? existingInv.dueDate.split('T')[0] : '',
      lineItems: existingInv.lineItems?.length ? existingInv.lineItems : [defaultLineItem],
      signatoryName: existingInv.signatoryName || user?.name || '',
    } : {
      type: 'invoice',
      status: 'draft',
      issueDate: new Date().toISOString().split('T')[0],
      dueDate: '',
      paymentTerms: 'Net 30',
      notes: '',
      terms: orgData?.invoiceTerms || 'Payment due within 30 days of invoice date.',
      signatoryName: user?.name || '',
      leadId: prefillLead?._id || '',
      client: {
        name: prefillLead?.name || '',
        email: prefillLead?.email || '',
        phone: prefillLead?.phone || '',
        address: prefillLead?.company || '',
        gstin: '',
        state: prefillLead?.state || '',
      },
      lineItems: prefillLead?.productInterest?.length
        ? prefillLead.productInterest.map(pi => ({ ...defaultLineItem, description: pi }))
        : [defaultLineItem],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'lineItems' });
  const totals = useTotals(control);

  const saveMutation = useMutation({
    mutationFn: (data) => existingInv
      ? api.put(`/finance/invoices/${existingInv._id}`, data)
      : api.post('/finance/invoices', data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['finance', 'invoices'] });
      toast.success(existingInv ? 'Invoice updated' : 'Invoice created');
      onSaved(res.data.invoice);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to save'),
  });

  const onSubmit = (data) => saveMutation.mutate(data);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-6 px-4">
      <div className="absolute inset-0 bg-gray-900/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-[#070c17] w-full max-w-4xl rounded-2xl shadow-2xl">

        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-[#1b2e4a]">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
            {existingInv ? `Edit ${existingInv.invoiceNumber}` : 'New Invoice'}
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-[#17263d]">
            <XMarkIcon className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6">

          {/* Type + Status */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">Invoice Type</label>
              <select {...register('type')} className="input">
                <option value="invoice">Tax Invoice</option>
                <option value="quotation">Quotation</option>
                <option value="proforma">Proforma Invoice</option>
                <option value="credit_note">Credit Note</option>
                <option value="debit_note">Debit Note</option>
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select {...register('status')} className="input">
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="paid">Paid</option>
                <option value="partially_paid">Partially Paid</option>
                <option value="overdue">Overdue</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div>
              <label className="label">Payment Terms</label>
              <select {...register('paymentTerms')} className="input">
                {['Immediate', 'Net 7', 'Net 15', 'Net 30', 'Net 45', 'Net 60', 'Custom'].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Issue Date</label>
              <input {...register('issueDate')} type="date" className="input" />
            </div>
            <div>
              <label className="label">Due Date</label>
              <input {...register('dueDate')} type="date" className="input" />
            </div>
          </div>

          {/* Client Info */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
              <DocumentTextIcon className="w-4 h-4" /> Client / Bill To
            </h3>
            {!existingInv && (
              <LeadPicker onSelect={(lead) => {
                setValue('client.name', lead.name || '');
                setValue('client.email', lead.email || '');
                setValue('client.phone', lead.phone || '');
                setValue('client.address', lead.company || '');
                setValue('client.state', lead.state || '');
                setValue('leadId', lead._id);
                if (lead.productInterest?.length) {
                  const items = lead.productInterest.map(pi => ({ ...defaultLineItem, description: pi }));
                  items.forEach((it, i) => {
                    if (i < fields.length) { Object.keys(it).forEach(k => setValue(`lineItems.${i}.${k}`, it[k])); }
                  });
                }
                toast.success(`Pre-filled from ${lead.name}`);
              }} />
            )}
            <input type="hidden" {...register('leadId')} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Client Name *</label>
                <input {...register('client.name', { required: 'Required' })} className="input" placeholder="Rajesh Exports Pvt Ltd" />
                {errors.client?.name && <p className="text-red-500 text-xs mt-1">{errors.client.name.message}</p>}
              </div>
              <div>
                <label className="label">Email</label>
                <input {...register('client.email')} type="email" className="input" placeholder="billing@client.com" />
              </div>
              <div>
                <label className="label">Phone</label>
                <input {...register('client.phone')} className="input" placeholder="+91 98765 43210" />
              </div>
              <div>
                <label className="label">GSTIN</label>
                <input {...register('client.gstin')} className="input placeholder:font-mono" placeholder="27AAAAA0000A1Z5" />
              </div>
              <div>
                <label className="label">State</label>
                <input {...register('client.state')} className="input" placeholder="Maharashtra" />
              </div>
              <div>
                <label className="label">Address</label>
                <input {...register('client.address')} className="input" placeholder="123, Business Park, Mumbai" />
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Line Items</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-[#0f1a2e] text-xs text-gray-500 uppercase">
                    <th className="text-left p-2 rounded-l-lg">Description *</th>
                    <th className="text-left p-2 w-24">HSN/SAC</th>
                    <th className="text-center p-2 w-16">Qty</th>
                    <th className="text-left p-2 w-20">Unit</th>
                    <th className="text-right p-2 w-24">Price (₹)</th>
                    <th className="text-right p-2 w-20">Disc (₹)</th>
                    <th className="text-center p-2 w-20">GST%</th>
                    <th className="text-right p-2 w-24">Total</th>
                    <th className="p-2 w-8 rounded-r-lg"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-[#1b2e4a]">
                  {fields.map((field, idx) => (
                    <LineItemRow
                      key={field.id}
                      idx={idx}
                      control={control}
                      register={register}
                      remove={remove}
                      canRemove={fields.length > 1}
                      setValue={setValue}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            <button
              type="button"
              onClick={() => append(defaultLineItem)}
              className="mt-3 flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium transition-colors"
            >
              <PlusIcon className="w-4 h-4" /> Add Item
            </button>

            {/* Totals */}
            <div className="mt-4 flex justify-end">
              <div className="w-64 bg-gray-50 dark:bg-[#0f1a2e] rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between text-gray-600 dark:text-gray-400">
                  <span>Subtotal</span><span className="font-medium">{INR(totals.subtotal)}</span>
                </div>
                {totals.totalDiscount > 0 && (
                  <div className="flex justify-between text-red-500">
                    <span>Discount</span><span>-{INR(totals.totalDiscount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-gray-600 dark:text-gray-400">
                  <span>GST</span><span className="font-medium">{INR(totals.totalGst)}</span>
                </div>
                <div className="flex justify-between font-bold text-base text-gray-900 dark:text-white border-t border-gray-200 dark:border-[#1b2e4a] pt-2 mt-1">
                  <span>Total</span><span>{INR(totals.total)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Notes + Terms */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Notes (visible to client)</label>
              <textarea {...register('notes')} rows={3} className="input resize-none" placeholder="Thank you for your business!" />
            </div>
            <div>
              <label className="label">Terms & Conditions</label>
              <textarea {...register('terms')} rows={3} className="input resize-none" placeholder="Payment due within 30 days..." />
            </div>
          </div>

          {/* Signatory */}
          <div className="border border-gray-200 dark:border-[#1b2e4a] rounded-xl p-4 bg-gray-50 dark:bg-[#0f1a2e]">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Authorized Signatory</h3>
            <div className="grid grid-cols-2 gap-4 items-start">
              <div>
                <label className="label">Signatory Name</label>
                <input
                  {...register('signatoryName')}
                  className="input"
                  placeholder="Type name to generate signature…"
                />
                <p className="text-xs text-gray-400 mt-1">Name will be converted to signature style</p>
              </div>
              <div>
                <label className="label text-gray-400 dark:text-gray-500">Signature Preview</label>
                <div className="border-2 border-dashed border-gray-300 dark:border-[#1b2e4a] rounded-lg px-5 py-3 bg-white dark:bg-[#070c17] min-h-[64px] flex flex-col justify-end">
                  <SignaturePreview control={control} />
                  <div className="border-t border-gray-300 dark:border-gray-600 mt-2 pt-1">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">Authorized Signatory</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-end pt-2 border-t border-gray-100 dark:border-[#1b2e4a]">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saveMutation.isPending} className="btn-primary disabled:opacity-50">
              {saveMutation.isPending ? 'Saving…' : existingInv ? 'Update Invoice' : 'Create Invoice'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Line Item Row ─────────────────────────────────────────────────────────────
function LineItemRow({ idx, control, register, remove, canRemove, setValue }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const qty = useWatch({ control, name: `lineItems.${idx}.quantity` }) || 0;
  const price = useWatch({ control, name: `lineItems.${idx}.unitPrice` }) || 0;
  const disc = useWatch({ control, name: `lineItems.${idx}.discount` }) || 0;
  const gstRate = useWatch({ control, name: `lineItems.${idx}.gstRate` }) || 0;

  const net = (Number(qty) * Number(price)) - Number(disc);
  const gstAmt = (net * Number(gstRate)) / 100;
  const total = net + gstAmt;

  const { data: productData, isLoading: productsLoading } = useQuery({
    queryKey: ['inv-picker', searchTerm],
    queryFn: () => api.get('/inventory/products', { params: { search: searchTerm || undefined, isSellable: 'true', limit: 10 } }).then(r => r.data),
    enabled: pickerOpen,
    staleTime: 30_000,
  });
  const products = productData?.data || [];

  const fillProduct = (p) => {
    setValue(`lineItems.${idx}.description`, p.name, { shouldValidate: true });
    setValue(`lineItems.${idx}.hsnCode`, p.hsnCode || '');
    setValue(`lineItems.${idx}.unit`, p.unit || 'pcs');
    setValue(`lineItems.${idx}.unitPrice`, p.sellingPrice || 0);
    setValue(`lineItems.${idx}.gstRate`, p.gstRate ?? 18);
    setPickerOpen(false);
    setSearchTerm('');
  };

  return (
    <tr className="relative">
      <td className="p-1.5">
        <div className="flex gap-1 items-center relative">
          <input {...register(`lineItems.${idx}.description`, { required: true })} className="input text-sm py-1.5 flex-1" placeholder="Product / Service" />
          <button
            type="button"
            title="Pick from inventory"
            onClick={() => setPickerOpen((v) => !v)}
            className={clsx(
              'p-1.5 rounded-lg border transition-colors flex-shrink-0',
              pickerOpen
                ? 'bg-blue-50 border-blue-300 text-blue-600 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-400'
                : 'border-slate-200 dark:border-[#1b2e4a] text-slate-400 hover:text-blue-600 hover:border-blue-300 dark:hover:border-blue-700'
            )}
          >
            <CubeIcon className="w-4 h-4" />
          </button>

          {pickerOpen && (
            <div className="absolute top-full left-0 z-50 w-80 bg-white dark:bg-[#0f1a2e] border border-gray-200 dark:border-[#1b2e4a] rounded-xl shadow-2xl mt-1 overflow-hidden">
              <div className="p-2 border-b border-gray-100 dark:border-[#1b2e4a]">
                <div className="relative">
                  <MagnifyingGlassIcon className="w-4 h-4 absolute left-2.5 top-2 text-gray-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search products by name or SKU..."
                    className="input text-sm py-1.5 pl-8 w-full"
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              </div>
              <div className="max-h-52 overflow-y-auto">
                {productsLoading && (
                  <div className="flex justify-center py-4">
                    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                {!productsLoading && products.length === 0 && (
                  <div className="p-4 text-sm text-gray-400 text-center">No products found</div>
                )}
                {products.map((p) => (
                  <button
                    key={p._id}
                    type="button"
                    onClick={() => fillProduct(p)}
                    className="w-full text-left px-3 py-2.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 border-b border-slate-50 dark:border-[#1b2e4a]/50 last:border-0 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm text-slate-900 dark:text-white">{p.name}</span>
                      <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">{INR(p.sellingPrice)}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-gray-400 font-mono">{p.sku}</span>
                      {p.hsnCode && <span className="text-xs text-gray-400">HSN: {p.hsnCode}</span>}
                      <span className={clsx('text-xs font-medium', p.currentStock <= p.minStockLevel ? 'text-red-500' : 'text-green-600')}>
                        Stock: {p.currentStock} {p.unit}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
              <div className="px-3 py-1.5 bg-gray-50 dark:bg-[#132035]/50 border-t border-gray-100 dark:border-[#1b2e4a]">
                <button type="button" onClick={() => setPickerOpen(false)} className="text-xs text-gray-400 hover:text-gray-600">Close</button>
              </div>
            </div>
          )}
        </div>
      </td>
      <td className="p-1.5">
        <input {...register(`lineItems.${idx}.hsnCode`)} className="input text-sm py-1.5 font-mono" placeholder="1234" />
      </td>
      <td className="p-1.5">
        <input {...register(`lineItems.${idx}.quantity`)} type="number" min="0" step="0.01" className="input text-sm py-1.5 text-center" />
      </td>
      <td className="p-1.5">
        <select {...register(`lineItems.${idx}.unit`)} className="input text-sm py-1.5">
          {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
      </td>
      <td className="p-1.5">
        <input {...register(`lineItems.${idx}.unitPrice`)} type="number" min="0" step="0.01" className="input text-sm py-1.5 text-right" placeholder="0.00" />
      </td>
      <td className="p-1.5">
        <input {...register(`lineItems.${idx}.discount`)} type="number" min="0" step="0.01" className="input text-sm py-1.5 text-right" placeholder="0" />
      </td>
      <td className="p-1.5">
        <select {...register(`lineItems.${idx}.gstRate`)} className="input text-sm py-1.5 text-center">
          {GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
        </select>
      </td>
      <td className="p-1.5 text-right">
        <span className="text-sm font-semibold text-gray-900 dark:text-white">{INR(total)}</span>
      </td>
      <td className="p-1.5">
        {canRemove && (
          <button type="button" onClick={() => remove(idx)} className="p-1 text-red-400 hover:text-red-600">
            <TrashIcon className="w-4 h-4" />
          </button>
        )}
      </td>
    </tr>
  );
}

// ── Invoice Preview Modal ─────────────────────────────────────────────────────
function InvoicePreview({ inv, orgData, onEdit, onClose }) {
  const org = orgData?.organization;
  const { user } = useAuthStore();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3">
      <div className="absolute inset-0 bg-gray-900/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex flex-col w-full max-w-[920px] rounded-2xl shadow-2xl overflow-hidden" style={{ maxHeight: '95vh' }}>

        {/* Toolbar */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 bg-slate-50 dark:bg-[#0f1a2e] border-b border-slate-200 dark:border-[#1b2e4a] print:hidden">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 font-medium transition-colors"
            >
              <ArrowLeftIcon className="w-4 h-4" /> Back
            </button>
            <div className="w-px h-4 bg-slate-200 dark:bg-[#132035]" />
            <span className={clsx('text-xs px-2 py-1 rounded-full font-semibold uppercase', STATUS_STYLES[inv.status])}>
              {inv.status?.replace('_', ' ')}
            </span>
            <span className="text-sm font-mono text-slate-500 dark:text-slate-400">{inv.invoiceNumber}</span>
          </div>
          <div className="flex items-center gap-2">
            {inv.client?.phone && (
              <a
                href={`https://wa.me/${inv.client.phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hi ${inv.client.name},\n\nPlease find your invoice ${inv.invoiceNumber} for ${INR(inv.totalAmount)}.\n\nDue Date: ${inv.dueDate ? format(new Date(inv.dueDate), 'dd MMM yyyy') : 'N/A'}\n\nThank you,\nBackero`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary gap-2 text-sm text-green-600 border-green-200 hover:bg-green-50 dark:border-green-800 dark:hover:bg-green-900/20"
              >
                <ChatBubbleLeftEllipsisIcon className="w-4 h-4" /> WhatsApp
              </a>
            )}
            <button
              onClick={() => printInvoice(inv, org, user)}
              className="btn-secondary gap-2 text-sm"
            >
              <ArrowDownTrayIcon className="w-4 h-4" /> Download PDF
            </button>
            {inv.status !== 'paid' && (
              <button onClick={onEdit} className="btn-secondary gap-2 text-sm">
                <PencilIcon className="w-4 h-4" /> Edit
              </button>
            )}
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-[#132035] transition-colors">
              <XMarkIcon className="w-5 h-5 text-slate-500" />
            </button>
          </div>
        </div>

        {/* Document Viewer */}
        <div className="flex-1 overflow-y-auto bg-slate-300 dark:bg-slate-700 py-6 px-4">
        <div className="max-w-[794px] mx-auto bg-white shadow-2xl text-gray-900" style={{ padding: '48px 52px', minHeight: '1050px' }}>

          {/* Header */}
          <div className="flex items-start justify-between pb-5 border-b-2 border-gray-800 mb-6">
            <div>
              <img src={backeroLogo} alt="Backero" className="h-12 max-w-[180px] object-contain mb-2" />
              <div className="font-bold text-sm text-gray-900 mb-1">{BACKERO.name}</div>
              <div className="text-xs text-gray-500 space-y-0.5 leading-relaxed">
                <div>{BACKERO.address}</div>
                {user?.phone && <div>📞 {user.phone}</div>}
                {user?.email && <div>✉ {user.email}</div>}
                <div className="font-mono">GSTIN: {BACKERO.gst}</div>
                <div>🌐 {BACKERO.website}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-4xl font-black text-blue-600 mb-1">
                {inv.type === 'quotation' ? 'QUOTATION' : inv.type === 'proforma' ? 'PROFORMA' : inv.type === 'credit_note' ? 'CREDIT NOTE' : inv.type === 'debit_note' ? 'DEBIT NOTE' : 'INVOICE'}
              </div>
              <div className="text-sm text-gray-500 font-mono">{inv.invoiceNumber}</div>
            </div>
          </div>

          {/* Parties + Meta */}
          {(() => {
            const intra = isIntraState(inv.client?.gstin, inv.client?.state);
            const totalCgst = intra ? (inv.totalGst || 0) / 2 : 0;
            const totalSgst = intra ? (inv.totalGst || 0) / 2 : 0;
            const totalIgst = !intra ? (inv.totalGst || 0) : 0;
            return (
              <>
                <div className="grid grid-cols-5 gap-4 mb-5">
                  <div className="col-span-2 bg-gray-50 rounded-xl p-3">
                    <p className="text-[9px] text-gray-400 uppercase tracking-widest font-bold mb-1.5">Bill To</p>
                    <p className="font-bold text-sm text-gray-900">{inv.client?.name}</p>
                    {inv.client?.address && <p className="text-xs text-gray-600 mt-0.5">{inv.client.address}</p>}
                    {inv.client?.state && <p className="text-xs text-gray-600">{inv.client.state}</p>}
                    {inv.client?.phone && <p className="text-xs text-gray-600">📞 {inv.client.phone}</p>}
                    {inv.client?.email && <p className="text-xs text-gray-600">✉ {inv.client.email}</p>}
                    {inv.client?.gstin && <p className="text-[9.5px] font-mono text-blue-600 mt-1 bg-blue-50 px-1.5 py-0.5 rounded inline-block">GSTIN: {inv.client.gstin}</p>}
                  </div>
                  <div className="col-span-2 grid grid-cols-2 gap-2">
                    {[
                      { label: 'Invoice Date', val: inv.issueDate ? format(new Date(inv.issueDate), 'dd MMM yyyy') : '—' },
                      { label: 'Due Date', val: inv.dueDate ? format(new Date(inv.dueDate), 'dd MMM yyyy') : '—' },
                      { label: 'Place of Supply', val: inv.client?.state || '—' },
                      { label: 'Payment Terms', val: inv.paymentTerms || 'Net 30' },
                    ].map(({ label, val }) => (
                      <div key={label} className="bg-gray-50 rounded-lg p-2">
                        <p className="text-[8.5px] text-gray-400 uppercase tracking-wider">{label}</p>
                        <p className="text-xs font-bold text-gray-800 mt-0.5">{val}</p>
                      </div>
                    ))}
                  </div>
                  <div className={clsx('rounded-xl p-3 text-center flex flex-col justify-center', intra ? 'bg-blue-50 border border-blue-100' : 'bg-purple-50 border border-purple-100')}>
                    <p className="text-[8.5px] uppercase tracking-wider font-bold mb-1" style={{ color: intra ? '#1d4ed8' : '#7c3aed' }}>GST Type</p>
                    <p className="text-xs font-black" style={{ color: intra ? '#1d4ed8' : '#7c3aed' }}>{intra ? 'CGST + SGST' : 'IGST'}</p>
                    <p className="text-[8.5px] mt-1" style={{ color: intra ? '#3b82f6' : '#a855f7' }}>{intra ? 'Intra-State (TN)' : 'Inter-State'}</p>
                  </div>
                </div>

                {/* Line Items */}
                <table className="w-full text-sm mb-5">
                  <thead>
                    <tr className="bg-gray-800 text-white text-[10px]">
                      <th className="text-left p-2 rounded-l-lg">#</th>
                      <th className="text-left p-2">Description</th>
                      <th className="text-center p-2 w-16">HSN</th>
                      <th className="text-center p-2 w-14">Qty</th>
                      <th className="text-right p-2 w-20">Rate</th>
                      <th className="text-right p-2 w-20">Taxable</th>
                      {intra ? (
                        <>
                          <th className="text-center p-2 w-16">CGST%</th>
                          <th className="text-right p-2 w-20">CGST</th>
                          <th className="text-center p-2 w-16">SGST%</th>
                          <th className="text-right p-2 w-20">SGST</th>
                        </>
                      ) : (
                        <>
                          <th className="text-center p-2 w-16">IGST%</th>
                          <th className="text-right p-2 w-20">IGST</th>
                        </>
                      )}
                      <th className="text-right p-2 w-24 rounded-r-lg">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(inv.lineItems || []).map((it, i) => {
                      const taxable = (Number(it.quantity) * Number(it.unitPrice)) - Number(it.discount || 0);
                      const halfRate = (Number(it.gstRate) || 0) / 2;
                      const halfAmt = taxable * halfRate / 100;
                      const igstAmt = taxable * (Number(it.gstRate) || 0) / 100;
                      return (
                        <tr key={i} className={clsx('text-xs', i % 2 === 0 ? 'bg-white' : 'bg-gray-50')}>
                          <td className="p-2 border-b border-gray-100 text-gray-400">{i + 1}</td>
                          <td className="p-2 border-b border-gray-100 font-medium">{it.description}</td>
                          <td className="p-2 border-b border-gray-100 text-center font-mono text-gray-400">{it.hsnCode || '—'}</td>
                          <td className="p-2 border-b border-gray-100 text-center">{it.quantity} {it.unit}</td>
                          <td className="p-2 border-b border-gray-100 text-right">{INR(it.unitPrice)}</td>
                          <td className="p-2 border-b border-gray-100 text-right font-medium">{INR(taxable)}</td>
                          {intra ? (
                            <>
                              <td className="p-2 border-b border-gray-100 text-center text-gray-500">{halfRate}%</td>
                              <td className="p-2 border-b border-gray-100 text-right text-blue-700">{INR(halfAmt)}</td>
                              <td className="p-2 border-b border-gray-100 text-center text-gray-500">{halfRate}%</td>
                              <td className="p-2 border-b border-gray-100 text-right text-blue-700">{INR(halfAmt)}</td>
                            </>
                          ) : (
                            <>
                              <td className="p-2 border-b border-gray-100 text-center text-gray-500">{Number(it.gstRate) || 0}%</td>
                              <td className="p-2 border-b border-gray-100 text-right text-purple-700">{INR(igstAmt)}</td>
                            </>
                          )}
                          <td className="p-2 border-b border-gray-100 text-right font-bold">{INR(it.total)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Totals block */}
                <div className="flex gap-5 mb-5 items-start">
                  {/* Amount in Words */}
                  <div className="flex-1 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                    <p className="text-[9px] font-bold text-amber-800 uppercase tracking-wider mb-1">Amount in Words (INR)</p>
                    <p className="text-xs font-bold text-amber-900 italic">{amountInWords(inv.totalAmount)}</p>
                  </div>
                  {/* Summary */}
                  <div className="w-56 border border-gray-200 rounded-xl overflow-hidden flex-shrink-0">
                    <div className="flex justify-between px-3 py-1.5 text-xs text-gray-600 border-b border-gray-100">
                      <span>Subtotal</span><span className="font-medium">{INR(inv.subtotal)}</span>
                    </div>
                    {inv.totalDiscount > 0 && (
                      <div className="flex justify-between px-3 py-1.5 text-xs text-red-500 border-b border-gray-100">
                        <span>Discount</span><span>-{INR(inv.totalDiscount)}</span>
                      </div>
                    )}
                    {intra ? (
                      <>
                        <div className="flex justify-between px-3 py-1.5 text-xs text-blue-700 border-b border-gray-100">
                          <span>CGST</span><span className="font-medium">{INR(totalCgst)}</span>
                        </div>
                        <div className="flex justify-between px-3 py-1.5 text-xs text-blue-700 border-b border-gray-100">
                          <span>SGST</span><span className="font-medium">{INR(totalSgst)}</span>
                        </div>
                      </>
                    ) : (
                      <div className="flex justify-between px-3 py-1.5 text-xs text-purple-700 border-b border-gray-100">
                        <span>IGST</span><span className="font-medium">{INR(totalIgst)}</span>
                      </div>
                    )}
                    <div className="flex justify-between px-3 py-2.5 bg-gray-800 text-white font-bold text-sm">
                      <span>Grand Total</span><span>{INR(inv.totalAmount)}</span>
                    </div>
                    {inv.paidAmount > 0 && (
                      <div className="flex justify-between px-3 py-1.5 bg-green-50 text-green-700 text-xs font-semibold border-b border-green-100">
                        <span>Amount Paid</span><span>{INR(inv.paidAmount)}</span>
                      </div>
                    )}
                    {inv.balanceAmount > 0 && (
                      <div className="flex justify-between px-3 py-1.5 bg-red-50 text-red-700 text-xs font-bold">
                        <span>Balance Due</span><span>{INR(inv.balanceAmount)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </>
            );
          })()}

          {/* Payment History */}
          {inv.paymentHistory?.length > 0 && (
            <div className="mb-5">
              <p className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Payment History</p>
              <div className="space-y-1.5">
                {inv.paymentHistory.map((p, i) => (
                  <div key={i} className="flex items-center justify-between bg-green-50 border border-green-100 rounded-lg px-3 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <CheckBadgeIcon className="w-4 h-4 text-green-500 flex-shrink-0" />
                      <span className="text-green-700 font-semibold">{INR(p.amount)}</span>
                      <span className="text-gray-500 text-xs">via {p.method}</span>
                      {p.reference && <span className="text-gray-400 text-xs font-mono">#{p.reference}</span>}
                    </div>
                    <span className="text-xs text-gray-400">{format(new Date(p.date), 'dd MMM yyyy')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes + Terms */}
          {inv.notes && (
            <div className="bg-amber-50 border-l-4 border-amber-400 px-4 py-3 rounded-r-lg mb-4 text-sm">
              <p className="text-xs font-bold text-amber-700 uppercase mb-1">Notes</p>
              <p className="text-gray-700">{inv.notes}</p>
            </div>
          )}
          {inv.terms && (
            <div className="bg-blue-50 border-l-4 border-blue-400 px-4 py-3 rounded-r-lg mb-6 text-sm">
              <p className="text-xs font-bold text-blue-700 uppercase mb-1">Terms & Conditions</p>
              <p className="text-gray-700">{inv.terms}</p>
            </div>
          )}

          {/* Footer: Bank + Signature */}
          <div className="flex items-end justify-between pt-5 border-t border-gray-200">
            <div className="flex gap-5 items-end">
              <div>
                {(org?.bankDetails?.bankName || org?.bankDetails?.accountNumber) ? (
                  <>
                    <p className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Bank Details</p>
                    <div className="text-sm text-gray-600 space-y-0.5">
                      {org.bankDetails.accountName && <p><span className="text-gray-400">A/c Name:</span> <strong>{org.bankDetails.accountName}</strong></p>}
                      {org.bankDetails.bankName && <p><span className="text-gray-400">Bank:</span> {org.bankDetails.bankName}{org.bankDetails.branch ? ` — ${org.bankDetails.branch}` : ''}</p>}
                      {org.bankDetails.accountNumber && <p><span className="text-gray-400">A/c No:</span> <strong className="font-mono">{org.bankDetails.accountNumber}</strong></p>}
                      {org.bankDetails.ifscCode && <p><span className="text-gray-400">IFSC:</span> {org.bankDetails.ifscCode}</p>}
                      {org.bankDetails.upiId && <p><span className="text-gray-400">UPI:</span> {org.bankDetails.upiId}</p>}
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-gray-400 italic">Configure bank details in Settings → Invoice</p>
                )}
              </div>
              {(() => {
                const bd = org?.bankDetails || {};
                if (!bd.upiId) return null;
                const payAmt = inv.balanceAmount > 0 ? inv.balanceAmount : inv.totalAmount;
                const upiUri = `upi://pay?pa=${bd.upiId}&pn=${encodeURIComponent(bd.accountName || BACKERO.name)}&am=${payAmt}&tn=${inv.invoiceNumber}&cu=INR`;
                return (
                  <div className="text-center flex-shrink-0">
                    <div className="border border-gray-200 rounded-lg p-1.5 bg-white inline-block">
                      <QRCode value={upiUri} size={96} />
                    </div>
                    <p className="text-xs text-gray-400 mt-1 font-medium">Scan to Pay via UPI</p>
                  </div>
                );
              })()}
            </div>
            <div className="text-center min-w-[200px]">
              {org?.signatureUrl
                ? <img src={org.signatureUrl} alt="Signature" className="max-h-16 max-w-[150px] object-contain mx-auto mb-1" />
                : <div className="h-14 flex items-end justify-center pb-1">
                    <span style={{ fontFamily: "'Brush Script MT', 'Dancing Script', cursive", fontSize: '34px', color: '#1e293b', lineHeight: 1 }}>
                      {inv.signatoryName || user?.name || ''}
                    </span>
                  </div>
              }
              <div className="border-t-2 border-gray-700 pt-2">
                <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">Authorized Signatory</p>
                <p className="text-xs text-gray-500 mt-0.5">{BACKERO.name}</p>
              </div>
            </div>
          </div>

          <p className="text-center text-xs text-gray-400 mt-6 pt-4 border-t border-dashed border-gray-200">
            This is a computer-generated document • Generated by Backero
          </p>
        </div>
        </div>
      </div>
    </div>
  );
}

// ── Payment Modal ─────────────────────────────────────────────────────────────
function PaymentModal({ inv, onClose }) {
  const qc = useQueryClient();
  const { register, handleSubmit } = useForm();
  const mutation = useMutation({
    mutationFn: (data) => api.patch(`/finance/invoices/${inv._id}/payment`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['finance', 'invoices'] }); toast.success('Payment recorded'); onClose(); },
    onError: () => toast.error('Failed to record payment'),
  });
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gray-900/60" onClick={onClose} />
      <div className="relative card w-full max-w-sm p-6">
        <h3 className="font-bold text-gray-900 dark:text-white mb-4">Record Payment</h3>
        <form onSubmit={handleSubmit(mutation.mutate)} className="space-y-3">
          <div>
            <label className="label">Amount Received (₹) *</label>
            <input {...register('amount', { required: true, valueAsNumber: true })} type="number" step="0.01" max={inv.balanceAmount} className="input" placeholder={inv.balanceAmount} />
          </div>
          <div>
            <label className="label">Payment Method</label>
            <select {...register('method')} className="input">
              {['Bank Transfer', 'UPI', 'Cash', 'Cheque', 'Card', 'Other'].map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Reference / UTR</label>
            <input {...register('reference')} className="input" placeholder="UTR123456" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" disabled={mutation.isPending} className="btn-primary flex-1 justify-center disabled:opacity-50">
              {mutation.isPending ? 'Saving…' : 'Record Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Invoice Card ─────────────────────────────────────────────────────────────
function InvoiceCard({ inv, orgData, user, onView, onEdit, onPay, onDelete }) {
  const isOverdue = inv.balanceAmount > 0 && inv.dueDate && new Date(inv.dueDate) < new Date() && inv.status !== 'paid' && inv.status !== 'cancelled';
  const overdueDays = isOverdue ? differenceInDays(new Date(), new Date(inv.dueDate)) : 0;
  const s = STATUS_CARD[inv.status] || STATUS_CARD.draft;
  return (
    <div
      className={clsx('rounded-2xl border-2 bg-white dark:bg-[#0d1b2e] overflow-hidden flex flex-col hover:shadow-xl transition-all duration-200 cursor-pointer group', isOverdue ? 'border-red-300 dark:border-red-800/60 shadow-red-100 dark:shadow-none' : s.border)}
      onClick={onView}
    >
      {/* Header accent */}
      <div className={clsx('px-4 py-2.5 flex items-center justify-between', s.accent)}>
        <span className="text-[10px] font-black tracking-widest text-gray-500 dark:text-gray-400 uppercase">{TYPE_LABEL[inv.type] || 'TAX INVOICE'}</span>
        <span className={clsx('text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide', s.badge)}>{(inv.status || '').replace('_', ' ')}</span>
      </div>

      {/* Invoice number */}
      <div className="px-4 pt-2.5 pb-0.5">
        <p className="font-mono text-[10px] text-gray-400 dark:text-gray-500">{inv.invoiceNumber}</p>
      </div>

      {/* Client */}
      <div className="px-4 pb-3">
        <p className="font-bold text-gray-900 dark:text-white text-sm leading-snug">{inv.client?.name || '—'}</p>
        {inv.client?.gstin && <p className="font-mono text-[9.5px] text-blue-500 mt-0.5">{inv.client.gstin}</p>}
        {!inv.client?.gstin && inv.client?.email && <p className="text-[10px] text-gray-400 mt-0.5">{inv.client.email}</p>}
      </div>

      <div className="mx-4 border-t border-gray-100 dark:border-[#1b2e4a]" />

      {/* Amount block */}
      <div className="px-4 py-3 flex items-end justify-between">
        <div>
          <p className="text-[9.5px] text-gray-400 mb-0.5 uppercase tracking-wide font-semibold">Total</p>
          <p className="text-xl font-black text-gray-900 dark:text-white leading-none">{INR(inv.totalAmount)}</p>
        </div>
        <div className="text-right">
          {inv.balanceAmount > 0 ? (
            <>
              <p className="text-[9.5px] text-gray-400 mb-0.5 uppercase tracking-wide font-semibold">Balance</p>
              <p className={clsx('text-base font-bold leading-none', isOverdue ? 'text-red-600' : 'text-orange-500')}>{INR(inv.balanceAmount)}</p>
            </>
          ) : (
            <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400 text-xs font-bold bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded-full">
              <CheckBadgeIcon className="w-3.5 h-3.5" /> Paid
            </span>
          )}
        </div>
      </div>

      {/* Due date */}
      {inv.dueDate && (
        <div className="px-4 pb-3 flex items-center gap-1.5">
          <ClockIcon className="w-3 h-3 text-gray-400 flex-shrink-0" />
          <span className="text-[10px] text-gray-500">Due {format(new Date(inv.dueDate), 'dd MMM yyyy')}</span>
          {isOverdue && (
            <span className="text-[9px] font-bold text-red-600 bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 rounded-full ml-1">
              {overdueDays}d overdue
            </span>
          )}
        </div>
      )}

      {/* Issue date small */}
      <div className="px-4 pb-2">
        <span className="text-[9.5px] text-gray-400">Issued {inv.issueDate ? format(new Date(inv.issueDate), 'dd MMM yyyy') : '—'}</span>
      </div>

      <div className="mt-auto border-t border-gray-100 dark:border-[#1b2e4a]" />

      {/* Action row */}
      <div className="px-2 py-1.5 flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
        <button onClick={onView} title="View" className="flex-1 flex flex-col items-center gap-0.5 py-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors text-[9px] font-semibold">
          <EyeIcon className="w-3.5 h-3.5" /><span>View</span>
        </button>
        {inv.status !== 'paid' && inv.status !== 'cancelled' && (
          <button onClick={onEdit} title="Edit" className="flex-1 flex flex-col items-center gap-0.5 py-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors text-[9px] font-semibold">
            <PencilIcon className="w-3.5 h-3.5" /><span>Edit</span>
          </button>
        )}
        {inv.balanceAmount > 0 && inv.status !== 'cancelled' && (
          <button onClick={onPay} title="Record Payment" className="flex-1 flex flex-col items-center gap-0.5 py-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors text-[9px] font-semibold">
            <BanknotesIcon className="w-3.5 h-3.5" /><span>Pay</span>
          </button>
        )}
        {inv.client?.phone && (
          <a
            href={`https://wa.me/${inv.client.phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hi ${inv.client.name}, your invoice ${inv.invoiceNumber} for ${INR(inv.totalAmount)} is due${inv.dueDate ? ' on ' + format(new Date(inv.dueDate), 'dd MMM yyyy') : ''}. Kindly process the payment. — ${BACKERO.name}`)}`}
            target="_blank" rel="noopener noreferrer" title="WhatsApp"
            className="flex-1 flex flex-col items-center gap-0.5 py-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors text-[9px] font-semibold"
          >
            <ChatBubbleLeftEllipsisIcon className="w-3.5 h-3.5" /><span>WA</span>
          </a>
        )}
        <button onClick={() => printInvoice(inv, orgData?.organization, user)} title="Print/Export" className="flex-1 flex flex-col items-center gap-0.5 py-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-[#132035] rounded-lg transition-colors text-[9px] font-semibold">
          <ArrowDownTrayIcon className="w-3.5 h-3.5" /><span>PDF</span>
        </button>
        {inv.status !== 'paid' && (
          <button onClick={onDelete} title="Delete" className="flex-1 flex flex-col items-center gap-0.5 py-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors text-[9px] font-semibold">
            <TrashIcon className="w-3.5 h-3.5" /><span>Del</span>
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main Invoices Page ────────────────────────────────────────────────────────
export default function Invoices() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [view, setView] = useState('list'); // 'list' | 'form' | 'preview'
  const [selectedInv, setSelectedInv] = useState(null);
  const [prefillLead, setPrefillLead] = useState(null);
  const [showPayment, setShowPayment] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [deletingId, setDeletingId] = useState(null);

  // Handle ?fromLead=xxx — fetch lead and open pre-filled form
  const fromLeadId = searchParams.get('fromLead');
  useEffect(() => {
    if (!fromLeadId) return;
    api.get(`/crm/leads/${fromLeadId}`).then(r => {
      setPrefillLead(r.data.lead || r.data.data);
      setSelectedInv(null);
      setView('form');
      setSearchParams({});
    }).catch(() => { toast.error('Lead not found'); setSearchParams({}); });
  }, [fromLeadId]);

  const { data, isLoading } = useQuery({
    queryKey: ['finance', 'invoices', statusFilter],
    queryFn: () => api.get('/finance/invoices', { params: statusFilter !== 'all' ? { status: statusFilter } : {} }).then(r => r.data),
  });

  const { data: statsData } = useQuery({
    queryKey: ['finance', 'invoices', 'stats'],
    queryFn: () => api.get('/finance/invoices/stats').then(r => r.data),
    staleTime: 30_000,
  });
  const stats = statsData?.data?.stats || statsData?.stats;

  const { data: orgData } = useQuery({
    queryKey: ['org', 'me'],
    queryFn: () => api.get('/organizations/me').then(r => r.data),
    staleTime: 60_000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/finance/invoices/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['finance', 'invoices'] }); toast.success('Invoice deleted'); setDeletingId(null); },
    onError: () => toast.error('Failed to delete'),
  });

  const invoices = data?.data || [];

  const computedStats = useMemo(() => {
    if (!invoices.length) return null;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      outstanding: {
        amount: invoices.filter(i => ['sent', 'partially_paid'].includes(i.status)).reduce((s, i) => s + (i.balanceAmount || 0), 0),
        count: invoices.filter(i => ['sent', 'partially_paid'].includes(i.status)).length,
      },
      paidThisMonth: {
        amount: invoices.filter(i => i.status === 'paid' && i.paidDate && new Date(i.paidDate) >= monthStart).reduce((s, i) => s + (i.totalAmount || 0), 0),
        count: invoices.filter(i => i.status === 'paid' && i.paidDate && new Date(i.paidDate) >= monthStart).length,
      },
      overdue: {
        amount: invoices.filter(i => i.status === 'overdue').reduce((s, i) => s + (i.balanceAmount || 0), 0),
        count: invoices.filter(i => i.status === 'overdue').length,
      },
      draftCount: invoices.filter(i => i.status === 'draft').length,
      totalCount: invoices.length,
    };
  }, [invoices]);

  const displayStats = stats || computedStats;

  const FILTER_TABS = [
    { key: 'all', label: 'All' },
    { key: 'draft', label: 'Draft' },
    { key: 'sent', label: 'Sent' },
    { key: 'paid', label: 'Paid' },
    { key: 'partially_paid', label: 'Partial' },
    { key: 'overdue', label: 'Overdue' },
  ];

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Invoices</h1>
          <p className="text-sm text-gray-500">{invoices.length} invoices</p>
        </div>
        <button
          onClick={() => { setSelectedInv(null); setPrefillLead(null); setView('form'); }}
          className="btn-primary gap-2"
        >
          <PlusIcon className="w-4 h-4" /> New Invoice
        </button>
      </div>

      {/* Stats Cards */}
      {displayStats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center flex-shrink-0">
              <ClockIcon className="w-5 h-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">Outstanding</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white">{INR(displayStats.outstanding.amount)}</p>
              <p className="text-xs text-gray-400">{displayStats.outstanding.count} invoices</p>
            </div>
          </div>
          <div className="card p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
              <CheckBadgeIcon className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">Paid This Month</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white">{INR(displayStats.paidThisMonth.amount)}</p>
              <p className="text-xs text-gray-400">{displayStats.paidThisMonth.count} invoices</p>
            </div>
          </div>
          <div className="card p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
              <ExclamationTriangleIcon className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">Overdue</p>
              <p className="text-lg font-bold text-red-600 dark:text-red-400">{INR(displayStats.overdue.amount)}</p>
              <p className="text-xs text-gray-400">{displayStats.overdue.count} invoices</p>
            </div>
          </div>
          <div className="card p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
              <DocumentTextIcon className="w-5 h-5 text-gray-500" />
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium">Drafts</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white">{displayStats.draftCount}</p>
              <p className="text-xs text-gray-400">of {displayStats.totalCount} total</p>
            </div>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-[#1b2e4a]">
        {FILTER_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={clsx(
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
              statusFilter === tab.key
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Invoice Card Grid */}
      {isLoading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : invoices.length === 0 ? (
        <div className="card p-16 text-center">
          <DocumentTextIcon className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
          <p className="text-gray-500 font-medium">No invoices yet</p>
          <p className="text-sm text-gray-400 mt-1">Click "New Invoice" to create your first one</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {invoices.map((inv) => (
            <InvoiceCard
              key={inv._id}
              inv={inv}
              orgData={orgData}
              user={user}
              onView={() => { setSelectedInv(inv); setView('preview'); }}
              onEdit={() => { setSelectedInv(inv); setPrefillLead(null); setView('form'); }}
              onPay={() => setShowPayment(inv)}
              onDelete={() => setDeletingId(inv._id)}
            />
          ))}
        </div>
      )}

      {/* Delete confirm */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/60" onClick={() => setDeletingId(null)} />
          <div className="relative card p-6 w-full max-w-sm text-center">
            <p className="font-semibold text-gray-900 dark:text-white mb-2">Delete this invoice?</p>
            <p className="text-sm text-gray-500 mb-4">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeletingId(null)} className="btn-secondary flex-1 justify-center">Cancel</button>
              <button onClick={() => deleteMutation.mutate(deletingId)} disabled={deleteMutation.isPending} className="flex-1 btn-primary bg-red-500 hover:bg-red-600 justify-center disabled:opacity-50">
                {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {view === 'form' && (
        <InvoiceForm
          existingInv={selectedInv}
          prefillLead={prefillLead}
          orgData={orgData?.organization}
          onClose={() => { setView('list'); setPrefillLead(null); }}
          onSaved={(inv) => { setSelectedInv(inv); setPrefillLead(null); setView('preview'); }}
        />
      )}

      {view === 'preview' && selectedInv && (
        <InvoicePreview
          inv={selectedInv}
          orgData={orgData}
          onEdit={() => setView('form')}
          onClose={() => setView('list')}
        />
      )}

      {showPayment && (
        <PaymentModal inv={showPayment} onClose={() => setShowPayment(null)} />
      )}
    </div>
  );
}
