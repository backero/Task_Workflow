import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import {
  PlusIcon, XMarkIcon, PrinterIcon, PencilIcon,
  TrashIcon, EyeIcon, CheckCircleIcon, DocumentTextIcon,
  BanknotesIcon, ArrowDownTrayIcon, CubeIcon, MagnifyingGlassIcon,
  ArrowLeftIcon,
} from '@heroicons/react/24/outline';
import api from '../../api/axios';
import { clsx } from 'clsx';
import { format } from 'date-fns';
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

// ── PDF / Print ───────────────────────────────────────────────────────────────
function printInvoice(inv, org) {
  const fmtDate = (d) => d ? format(new Date(d), 'dd MMM yyyy') : '—';
  const rows = (inv.lineItems || []).map((it, i) => `
    <tr style="background:${i % 2 === 0 ? '#ffffff' : '#f8fafc'}">
      <td style="padding:9px 8px;border-bottom:1px solid #e2e8f0">${it.description}</td>
      <td style="padding:9px 8px;border-bottom:1px solid #e2e8f0;text-align:center">${it.hsnCode || '—'}</td>
      <td style="padding:9px 8px;border-bottom:1px solid #e2e8f0;text-align:center">${it.quantity} ${it.unit || ''}</td>
      <td style="padding:9px 8px;border-bottom:1px solid #e2e8f0;text-align:right">${INR(it.unitPrice)}</td>
      <td style="padding:9px 8px;border-bottom:1px solid #e2e8f0;text-align:right">${INR(it.discount || 0)}</td>
      <td style="padding:9px 8px;border-bottom:1px solid #e2e8f0;text-align:center">${it.gstRate || 0}%</td>
      <td style="padding:9px 8px;border-bottom:1px solid #e2e8f0;text-align:right">${INR(it.gstAmount)}</td>
      <td style="padding:9px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600">${INR(it.total)}</td>
    </tr>`).join('');

  const addr = org?.address
    ? [org.address.street, org.address.city, org.address.state, org.address.pincode].filter(Boolean).join(', ')
    : '';
  const bd = org?.bankDetails || {};

  const win = window.open('', '_blank', 'width=900,height=700');
  win.document.write(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${inv.invoiceNumber}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#1a1a1a;background:#fff}
  .page{width:210mm;min-height:297mm;padding:14mm;margin:0 auto}
  .header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:18px;border-bottom:3px solid #1e293b;margin-bottom:20px}
  .logo{height:60px;max-width:160px;object-fit:contain}
  .logo-placeholder{font-size:22px;font-weight:900;color:#1e293b;letter-spacing:-1px}
  .invoice-label{text-align:right}
  .invoice-label h1{font-size:26px;font-weight:900;color:#2563eb;letter-spacing:1px}
  .invoice-label .num{font-size:13px;color:#64748b;margin-top:4px;font-weight:600}
  .invoice-label .type{display:inline-block;background:#eff6ff;color:#2563eb;padding:2px 10px;border-radius:20px;font-size:10px;font-weight:700;letter-spacing:1px;margin-bottom:4px}
  .parties{display:flex;gap:40px;margin-bottom:18px}
  .party{flex:1}
  .party h3{font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;font-weight:700}
  .party .name{font-size:14px;font-weight:700;color:#1e293b;margin-bottom:4px}
  .party p{margin-bottom:2px;color:#475569;line-height:1.5}
  .party .gstin{font-size:10px;color:#64748b;margin-top:4px;font-family:monospace}
  .meta{display:flex;gap:20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;margin-bottom:20px}
  .meta-item label{font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:3px;font-weight:700}
  .meta-item .val{font-size:12px;font-weight:600;color:#1e293b}
  table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:20px}
  thead{background:#1e293b;color:#ffffff}
  th{padding:10px 8px;text-align:left;font-weight:700;font-size:10px;letter-spacing:0.5px}
  .totals-wrap{display:flex;justify-content:flex-end;margin-bottom:24px}
  .totals{width:280px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden}
  .t-row{display:flex;justify-content:space-between;padding:7px 14px;border-bottom:1px solid #f1f5f9}
  .t-row:last-child{border:none}
  .t-label{color:#64748b;font-size:11px}
  .t-val{font-weight:600;font-size:11px}
  .t-total{background:#1e293b;color:#ffffff;font-size:14px;font-weight:800;padding:10px 14px;display:flex;justify-content:space-between}
  .t-balance{background:#dcfce7;color:#166534;font-size:11px;font-weight:700;padding:7px 14px;display:flex;justify-content:space-between}
  .footer{display:flex;justify-content:space-between;align-items:flex-end;margin-top:20px;padding-top:16px;border-top:1px solid #e2e8f0}
  .bank h4{font-size:10px;font-weight:700;color:#1e293b;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px}
  .bank p{font-size:11px;color:#475569;margin-bottom:3px}
  .bank .val{font-weight:600;color:#1e293b}
  .sig{text-align:center;min-width:160px}
  .sig img{max-width:150px;max-height:70px;object-fit:contain;display:block;margin:0 auto 6px}
  .sig-line{border-top:1.5px solid #1e293b;padding-top:6px;font-size:10px;color:#475569;font-weight:700;letter-spacing:0.5px;display:inline-block;min-width:150px;text-align:center}
  .notes{background:#fffbeb;border-left:3px solid #f59e0b;padding:10px 14px;margin-bottom:14px;border-radius:0 6px 6px 0;font-size:11px}
  .notes h4{font-weight:700;margin-bottom:4px;color:#92400e;font-size:10px;text-transform:uppercase}
  .terms{background:#eff6ff;border-left:3px solid #2563eb;padding:10px 14px;border-radius:0 6px 6px 0;font-size:11px}
  .terms h4{font-weight:700;margin-bottom:4px;color:#1d4ed8;font-size:10px;text-transform:uppercase}
  .stamp{font-size:9px;color:#94a3b8;text-align:center;margin-top:20px;padding-top:10px;border-top:1px dashed #e2e8f0}
  @media print{
    body{print-color-adjust:exact;-webkit-print-color-adjust:exact}
    .page{padding:8mm}
  }
</style></head>
<body><div class="page">
  <div class="header">
    <div>
      ${org?.logo ? `<img src="${org.logo}" class="logo" alt="Logo" />` : `<div class="logo-placeholder">${org?.name || 'Company'}</div>`}
      <div style="margin-top:8px;font-size:11px;color:#475569">
        ${addr ? `<div>${addr}</div>` : ''}
        ${org?.phone ? `<div>📞 ${org.phone}</div>` : ''}
        ${org?.email ? `<div>✉ ${org.email}</div>` : ''}
        ${org?.gstNumber ? `<div style="font-family:monospace;font-size:10px;color:#64748b;margin-top:4px">GSTIN: ${org.gstNumber}</div>` : ''}
      </div>
    </div>
    <div class="invoice-label">
      <div class="type">${(inv.type || 'invoice').toUpperCase().replace('_', ' ')}</div>
      <h1>INVOICE</h1>
      <div class="num">${inv.invoiceNumber}</div>
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <h3>Bill To</h3>
      <div class="name">${inv.client?.name || ''}</div>
      ${inv.client?.address ? `<p>${inv.client.address}</p>` : ''}
      ${inv.client?.state ? `<p>${inv.client.state}</p>` : ''}
      ${inv.client?.phone ? `<p>📞 ${inv.client.phone}</p>` : ''}
      ${inv.client?.email ? `<p>✉ ${inv.client.email}</p>` : ''}
      ${inv.client?.gstin ? `<p class="gstin">GSTIN: ${inv.client.gstin}</p>` : ''}
    </div>
    <div class="party" style="text-align:right">
      <h3>Invoice Details</h3>
      <p><span style="color:#94a3b8">Status:</span> <strong>${(inv.status || '').toUpperCase()}</strong></p>
      <p><span style="color:#94a3b8">Payment Terms:</span> ${inv.paymentTerms || 'Net 30'}</p>
    </div>
  </div>

  <div class="meta">
    <div class="meta-item"><label>Issue Date</label><div class="val">${fmtDate(inv.issueDate)}</div></div>
    <div class="meta-item"><label>Due Date</label><div class="val">${fmtDate(inv.dueDate)}</div></div>
    ${inv.paidAmount > 0 ? `<div class="meta-item"><label>Paid</label><div class="val" style="color:#16a34a">${INR(inv.paidAmount)}</div></div>` : ''}
    ${inv.balanceAmount > 0 ? `<div class="meta-item"><label>Balance Due</label><div class="val" style="color:#dc2626">${INR(inv.balanceAmount)}</div></div>` : ''}
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th style="text-align:center">HSN/SAC</th>
        <th style="text-align:center">Qty</th>
        <th style="text-align:right">Unit Price</th>
        <th style="text-align:right">Discount</th>
        <th style="text-align:center">GST%</th>
        <th style="text-align:right">GST Amt</th>
        <th style="text-align:right">Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="totals-wrap">
    <div class="totals">
      <div class="t-row"><span class="t-label">Subtotal</span><span class="t-val">${INR(inv.subtotal)}</span></div>
      ${inv.totalDiscount > 0 ? `<div class="t-row"><span class="t-label">Discount</span><span class="t-val" style="color:#dc2626">-${INR(inv.totalDiscount)}</span></div>` : ''}
      <div class="t-row"><span class="t-label">GST</span><span class="t-val">${INR(inv.totalGst)}</span></div>
      <div class="t-total"><span>Total Amount</span><span>${INR(inv.totalAmount)}</span></div>
      ${inv.paidAmount > 0 ? `<div class="t-balance"><span>Balance Due</span><span>${INR(inv.balanceAmount)}</span></div>` : ''}
    </div>
  </div>

  ${inv.notes ? `<div class="notes"><h4>Notes</h4><p>${inv.notes}</p></div>` : ''}
  ${inv.terms ? `<div class="terms"><h4>Terms &amp; Conditions</h4><p>${inv.terms}</p></div>` : ''}

  <div class="footer">
    <div class="bank">
      ${(bd.bankName || bd.accountNumber) ? `
        <h4>Bank Details</h4>
        ${bd.accountName ? `<p>Account Name: <span class="val">${bd.accountName}</span></p>` : ''}
        ${bd.bankName ? `<p>Bank: <span class="val">${bd.bankName}${bd.branch ? ` — ${bd.branch}` : ''}</span></p>` : ''}
        ${bd.accountNumber ? `<p>Account No: <span class="val">${bd.accountNumber}</span></p>` : ''}
        ${bd.ifscCode ? `<p>IFSC: <span class="val">${bd.ifscCode}</span></p>` : ''}
        ${bd.upiId ? `<p>UPI: <span class="val">${bd.upiId}</span></p>` : ''}
      ` : '<p style="color:#94a3b8;font-size:11px">No bank details configured</p>'}
    </div>
    <div class="sig">
      ${org?.signatureUrl ? `<img src="${org.signatureUrl}" alt="Signature" />` : '<div style="height:60px"></div>'}
      <div class="sig-line">Authorized Signatory<br/><span style="font-weight:400">${org?.name || ''}</span></div>
    </div>
  </div>

  <div class="stamp">This is a computer-generated invoice. Generated by Backero — ${new Date().toLocaleString('en-IN')}</div>
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

// ── Invoice Form (Create / Edit) ──────────────────────────────────────────────
function InvoiceForm({ existingInv, orgData, onClose, onSaved }) {
  const qc = useQueryClient();

  const defaultLineItem = { description: '', hsnCode: '', quantity: 1, unit: 'pcs', unitPrice: 0, gstRate: 18, discount: 0 };

  const { control, register, handleSubmit, setValue, formState: { errors } } = useForm({
    defaultValues: existingInv ? {
      ...existingInv,
      issueDate: existingInv.issueDate ? existingInv.issueDate.split('T')[0] : new Date().toISOString().split('T')[0],
      dueDate: existingInv.dueDate ? existingInv.dueDate.split('T')[0] : '',
      lineItems: existingInv.lineItems?.length ? existingInv.lineItems : [defaultLineItem],
    } : {
      type: 'invoice',
      status: 'draft',
      issueDate: new Date().toISOString().split('T')[0],
      dueDate: '',
      paymentTerms: 'Net 30',
      notes: '',
      terms: orgData?.invoiceTerms || 'Payment due within 30 days of invoice date.',
      client: { name: '', email: '', phone: '', address: '', gstin: '', state: '' },
      lineItems: [defaultLineItem],
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
  const addr = org?.address
    ? [org.address.street, org.address.city, org.address.state, org.address.pincode].filter(Boolean).join(', ')
    : '';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-6 px-4">
      <div className="absolute inset-0 bg-gray-900/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-[#070c17] w-full max-w-4xl rounded-2xl shadow-2xl">

        {/* Toolbar */}
        <div className="flex items-center justify-between px-6 py-3 bg-slate-50 dark:bg-[#0f1a2e] border-b border-slate-200 dark:border-[#1b2e4a] print:hidden rounded-t-2xl">
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
            <button
              onClick={() => printInvoice(inv, org)}
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

        {/* Invoice Preview Body */}
        <div className="p-8 bg-white text-gray-900 overflow-x-auto">

          {/* Header */}
          <div className="flex items-start justify-between pb-5 border-b-2 border-gray-800 mb-6">
            <div>
              {org?.logo
                ? <img src={org.logo} alt="Logo" className="h-14 max-w-[160px] object-contain mb-2" />
                : <div className="text-2xl font-black text-gray-900 mb-1">{org?.name || 'Company Name'}</div>
              }
              <div className="text-xs text-gray-500 space-y-0.5">
                {addr && <div>{addr}</div>}
                {org?.phone && <div>📞 {org.phone}</div>}
                {org?.email && <div>✉ {org.email}</div>}
                {org?.gstNumber && <div className="font-mono">GSTIN: {org.gstNumber}</div>}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1 rounded-full font-bold uppercase tracking-wider inline-block mb-2">
                {(inv.type || 'invoice').replace('_', ' ')}
              </div>
              <div className="text-3xl font-black text-blue-600">INVOICE</div>
              <div className="text-sm text-gray-500 font-mono mt-1">{inv.invoiceNumber}</div>
            </div>
          </div>

          {/* Parties + Meta */}
          <div className="grid grid-cols-3 gap-6 mb-6">
            <div className="col-span-2">
              <p className="text-xs text-gray-400 uppercase tracking-wider font-bold mb-2">Bill To</p>
              <p className="font-bold text-base text-gray-900">{inv.client?.name}</p>
              {inv.client?.address && <p className="text-sm text-gray-600 mt-1">{inv.client.address}</p>}
              {inv.client?.state && <p className="text-sm text-gray-600">{inv.client.state}</p>}
              {inv.client?.phone && <p className="text-sm text-gray-600">📞 {inv.client.phone}</p>}
              {inv.client?.email && <p className="text-sm text-gray-600">✉ {inv.client.email}</p>}
              {inv.client?.gstin && <p className="text-xs font-mono text-gray-500 mt-1">GSTIN: {inv.client.gstin}</p>}
            </div>
            <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-2">
              <div><span className="text-gray-400 text-xs uppercase">Issue Date</span><p className="font-semibold">{inv.issueDate ? format(new Date(inv.issueDate), 'dd MMM yyyy') : '—'}</p></div>
              <div><span className="text-gray-400 text-xs uppercase">Due Date</span><p className="font-semibold">{inv.dueDate ? format(new Date(inv.dueDate), 'dd MMM yyyy') : '—'}</p></div>
              <div><span className="text-gray-400 text-xs uppercase">Terms</span><p className="font-semibold">{inv.paymentTerms || 'Net 30'}</p></div>
            </div>
          </div>

          {/* Line Items */}
          <table className="w-full text-sm mb-6">
            <thead>
              <tr className="bg-gray-800 text-white">
                <th className="text-left p-2.5 rounded-l-lg">Description</th>
                <th className="text-center p-2.5 w-20">HSN</th>
                <th className="text-center p-2.5 w-16">Qty</th>
                <th className="text-right p-2.5 w-24">Price</th>
                <th className="text-center p-2.5 w-16">GST%</th>
                <th className="text-right p-2.5 w-24 rounded-r-lg">Total</th>
              </tr>
            </thead>
            <tbody>
              {(inv.lineItems || []).map((it, i) => (
                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="p-2.5 border-b border-gray-100">{it.description}</td>
                  <td className="p-2.5 border-b border-gray-100 text-center text-xs font-mono text-gray-500">{it.hsnCode || '—'}</td>
                  <td className="p-2.5 border-b border-gray-100 text-center">{it.quantity} {it.unit}</td>
                  <td className="p-2.5 border-b border-gray-100 text-right">{INR(it.unitPrice)}</td>
                  <td className="p-2.5 border-b border-gray-100 text-center">{it.gstRate}%</td>
                  <td className="p-2.5 border-b border-gray-100 text-right font-semibold">{INR(it.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="flex justify-end mb-6">
            <div className="w-64">
              <div className="flex justify-between py-1.5 text-sm text-gray-600">
                <span>Subtotal</span><span className="font-medium">{INR(inv.subtotal)}</span>
              </div>
              {inv.totalDiscount > 0 && (
                <div className="flex justify-between py-1.5 text-sm text-red-500">
                  <span>Discount</span><span>-{INR(inv.totalDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between py-1.5 text-sm text-gray-600">
                <span>GST</span><span className="font-medium">{INR(inv.totalGst)}</span>
              </div>
              <div className="flex justify-between py-2.5 px-3 bg-gray-800 text-white rounded-lg font-bold text-base mt-1">
                <span>Total Amount</span><span>{INR(inv.totalAmount)}</span>
              </div>
              {inv.paidAmount > 0 && (
                <div className="flex justify-between py-1.5 px-3 bg-green-50 text-green-700 rounded-lg text-sm font-semibold mt-1">
                  <span>Balance Due</span><span>{INR(inv.balanceAmount)}</span>
                </div>
              )}
            </div>
          </div>

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
            <div className="text-center min-w-[160px]">
              {org?.signatureUrl
                ? <img src={org.signatureUrl} alt="Signature" className="max-h-16 max-w-[150px] object-contain mx-auto mb-2" />
                : <div className="h-12 mb-2" />
              }
              <div className="border-t-2 border-gray-700 pt-2">
                <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">Authorized Signatory</p>
                <p className="text-xs text-gray-500 mt-0.5">{org?.name || 'Company Name'}</p>
              </div>
            </div>
          </div>

          <p className="text-center text-xs text-gray-400 mt-6 pt-4 border-t border-dashed border-gray-200">
            This is a computer-generated invoice • Generated by Backero
          </p>
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

// ── Main Invoices Page ────────────────────────────────────────────────────────
export default function Invoices() {
  const qc = useQueryClient();
  const [view, setView] = useState('list'); // 'list' | 'form' | 'preview'
  const [selectedInv, setSelectedInv] = useState(null);
  const [showPayment, setShowPayment] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [deletingId, setDeletingId] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['finance', 'invoices', statusFilter],
    queryFn: () => api.get('/finance/invoices', { params: statusFilter !== 'all' ? { status: statusFilter } : {} }).then(r => r.data),
  });

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
          onClick={() => { setSelectedInv(null); setView('form'); }}
          className="btn-primary gap-2"
        >
          <PlusIcon className="w-4 h-4" /> New Invoice
        </button>
      </div>

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

      {/* Invoice List */}
      {isLoading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : invoices.length === 0 ? (
        <div className="card p-16 text-center">
          <DocumentTextIcon className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
          <p className="text-gray-500 font-medium">No invoices yet</p>
          <p className="text-sm text-gray-400 mt-1">Click "New Invoice" to create your first one</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-[#0f1a2e]">
              <tr>
                <th className="text-left py-3 px-4 text-slate-500 font-medium">Invoice #</th>
                <th className="text-left py-3 px-4 text-slate-500 font-medium">Client</th>
                <th className="text-center py-3 px-4 text-slate-500 font-medium">Status</th>
                <th className="text-right py-3 px-4 text-slate-500 font-medium">Amount</th>
                <th className="text-right py-3 px-4 text-slate-500 font-medium">Balance</th>
                <th className="text-right py-3 px-4 text-slate-500 font-medium">Due Date</th>
                <th className="py-3 px-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#1b2e4a]">
              {invoices.map((inv) => (
                <tr
                  key={inv._id}
                  className="hover:bg-slate-50 dark:hover:bg-[#17263d]/50 cursor-pointer transition-colors"
                  onClick={() => { setSelectedInv(inv); setView('preview'); }}
                >
                  <td className="py-3 px-4 font-mono text-xs text-gray-600 dark:text-gray-400">{inv.invoiceNumber}</td>
                  <td className="py-3 px-4">
                    <p className="font-medium text-gray-900 dark:text-white">{inv.client?.name}</p>
                    {inv.client?.email && <p className="text-xs text-gray-400">{inv.client.email}</p>}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={clsx('text-xs px-2.5 py-1 rounded-full font-semibold', STATUS_STYLES[inv.status])}>
                      {inv.status?.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-semibold text-gray-900 dark:text-white">{INR(inv.totalAmount)}</td>
                  <td className="py-3 px-4 text-right">
                    <span className={clsx('font-medium', inv.balanceAmount > 0 ? 'text-red-500' : 'text-green-500')}>
                      {inv.balanceAmount > 0 ? INR(inv.balanceAmount) : '✓ Paid'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right text-gray-500">
                    {inv.dueDate ? format(new Date(inv.dueDate), 'dd MMM yy') : '—'}
                  </td>
                  <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        title="View"
                        onClick={() => { setSelectedInv(inv); setView('preview'); }}
                        className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#132035] text-gray-400 hover:text-gray-700"
                      >
                        <EyeIcon className="w-4 h-4" />
                      </button>
                      {inv.status !== 'paid' && (
                        <button
                          title="Edit"
                          onClick={() => { setSelectedInv(inv); setView('form'); }}
                          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#132035] text-gray-400 hover:text-blue-600"
                        >
                          <PencilIcon className="w-4 h-4" />
                        </button>
                      )}
                      {inv.balanceAmount > 0 && inv.status !== 'cancelled' && (
                        <button
                          title="Record Payment"
                          onClick={() => setShowPayment(inv)}
                          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#132035] text-gray-400 hover:text-green-600"
                        >
                          <BanknotesIcon className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        title="Download PDF"
                        onClick={() => printInvoice(inv, orgData?.organization)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#132035] text-gray-400 hover:text-gray-700"
                      >
                        <ArrowDownTrayIcon className="w-4 h-4" />
                      </button>
                      {inv.status !== 'paid' && (
                        <button
                          title="Delete"
                          onClick={() => setDeletingId(inv._id)}
                          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#132035] text-gray-400 hover:text-red-600"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
          orgData={orgData?.organization}
          onClose={() => setView('list')}
          onSaved={(inv) => { setSelectedInv(inv); setView('preview'); }}
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
