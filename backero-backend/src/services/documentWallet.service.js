const Document = require('../models/Document');
const Organization = require('../models/Organization');
const User = require('../models/User');
const { createNotification } = require('./notification.service');
const { sendDocumentExpiryReminderEmail } = require('./email.service');
const { ROLES } = require('../utils/constants');
const logger = require('../utils/logger');

// Mirrors frontend/src/pages/documents/documentTemplates.js's BASE_CATEGORIES —
// presentation-only labels for the reminder email, kept in sync by hand (same
// trade-off the original standalone app made in its reminders.js).
const CATEGORY_NAMES = {
  corp: 'Incorporation & ROC',
  resolutions: 'Resolutions & Minutes',
  tax: 'Tax & GST',
  banking: 'Banking & KYC',
  licenses: 'Licenses & Registrations',
  cosmetic: 'Cosmetic Regulatory',
  factory: 'Factory, TNPCB & Labour',
  legal: 'Legal, Rent & Insurance',
  hr: 'HR & Director KYC',
  brand: 'Brand & Stationery',
  archive: 'Archive',
};

// One blank stub per real TEMPLATES entry in the frontend (23 entries, minus the
// placeholder) — onboarding scaffolding only, no real historical data (see plan §4).
const SEED_TEMPLATES = [
  { name: 'Certificate of Incorporation', category: 'corp', issuer: 'Ministry of Corporate Affairs (MCA)', notes: 'CIN is printed on the certificate. Permanent validity.' },
  { name: 'MOA & AOA', category: 'corp', issuer: 'MCA / ROC', notes: 'As filed at incorporation; update after any alteration.' },
  { name: 'ROC Annual Filing (AOC-4 / MGT-7)', category: 'corp', issuer: 'Ministry of Corporate Affairs (MCA) / ROC', notes: "AOC-4 within 30 days of AGM; MGT-7 within 60 days. Register each year's filing as its own document — don't upload it as a new version of the Certificate of Incorporation." },
  { name: 'Company PAN Card', category: 'tax', issuer: 'Income Tax Department', notes: '10-character PAN.' },
  { name: 'TAN Allotment', category: 'tax', issuer: 'Income Tax Department', notes: 'Required for TDS deduction.' },
  { name: 'GST Registration Certificate (REG-06)', category: 'tax', issuer: 'GSTN / CBIC', notes: 'GSTR-1 & GSTR-3B monthly; GSTR-9 annual. Verify principal place of business.' },
  { name: 'Udyam (MSME) Registration', category: 'licenses', issuer: 'Ministry of MSME', notes: 'Permanent; update when turnover / investment class changes.' },
  { name: 'Cosmetic Manufacturing Licence (Form 32 / COS-8)', category: 'cosmetic', issuer: 'Tamil Nadu Drug Control Department (TNDCD)', notes: 'Apply in Form 31 / COS-2. Premises must meet Schedule M-II GMP. Keep retention-fee / renewal due date as expiry.' },
  { name: 'Cosmetic Loan Licence (Form 32-A / COS-3)', category: 'cosmetic', issuer: 'TNDCD', notes: 'For brands manufacturing at a third-party licensed facility. Attach the agreement with the manufacturer.' },
  { name: 'Cosmetic Import Registration (Form COS-1 / COS-3)', category: 'cosmetic', issuer: 'CDSCO via SUGAM portal', notes: 'Needs IEC, Free Sale Certificate, CoA per product. Track per-product registrations.' },
  { name: 'Cosmetic Wholesale / Retail Licence', category: 'cosmetic', issuer: 'TNDCD', notes: 'Required to stock / sell cosmetics from premises.' },
  { name: 'ISO 22716:2007 — Cosmetics GMP Certificate', category: 'cosmetic', issuer: 'Certification body', notes: '3-year cycle with annual surveillance audits — put surveillance date in expiry to get reminders.' },
  { name: 'TNPCB Consent to Establish / Operate', category: 'factory', issuer: 'Tamil Nadu Pollution Control Board', notes: 'Validity is printed on the consent order — renew before expiry. Keep both CTE and CTO.' },
  { name: 'TN Shops & Establishments Registration', category: 'factory', issuer: 'Labour Department, Govt of Tamil Nadu', notes: 'Registration under the TN Shops & Establishments Act.' },
  { name: 'Fire & Rescue Services NOC', category: 'factory', issuer: 'TN Fire & Rescue Services', notes: 'Typically renewed annually — set expiry to get a reminder.' },
  { name: 'Trade Licence (Local Body)', category: 'licenses', issuer: 'Municipal Corporation / Panchayat', notes: 'Annual renewal in most local bodies.' },
  { name: 'Legal Metrology — Packaged Commodities Registration', category: 'cosmetic', issuer: 'Department of Legal Metrology', notes: 'Required for MRP / label declarations on packaged cosmetics.' },
  { name: 'FSSAI Licence', category: 'licenses', issuer: 'FSSAI', notes: '14-digit number. Renewal before expiry via FoSCoS.' },
  { name: 'Import Export Code (IEC)', category: 'licenses', issuer: 'DGFT', notes: 'Permanent; update details annually on DGFT portal.' },
  { name: 'Trademark Registration Certificate', category: 'brand', issuer: 'CGPDTM (IP India)', notes: '10-year validity, renewable every 10 years.' },
  { name: 'EPF Registration', category: 'hr', issuer: 'EPFO', notes: 'Monthly PF returns & payment by the 15th.' },
  { name: 'ESI Registration', category: 'hr', issuer: 'ESIC', notes: 'Applicable at 10+ employees; monthly contribution.' },
  { name: 'Professional Tax Registration', category: 'tax', issuer: 'Commercial Taxes Department, TN', notes: 'Employer + employee PT registrations.' },
];

const REMINDER_ROLES = [ROLES.MANAGER, ROLES.ADMIN, ROLES.FOUNDER, ROLES.CHAIRMAN, ROLES.SUPER_ADMIN];

function categoryName(id, customCats) {
  if (CATEGORY_NAMES[id]) return CATEGORY_NAMES[id];
  const custom = (customCats || []).find((c) => c.id === id);
  return custom ? custom.name : id;
}

function daysUntil(expiryDate) {
  const today = new Date(new Date().toDateString());
  const expiry = new Date(new Date(expiryDate).toDateString());
  return Math.ceil((expiry - today) / 864e5);
}

async function computeDueDocsForOrg(organizationId, thresholdDays = 30) {
  const [docs, org] = await Promise.all([
    Document.find({ organizationId, expiryDate: { $ne: null } }).select('name category keeper expiryDate').lean(),
    Organization.findById(organizationId).select('documentCategories').lean(),
  ]);
  const customCats = org?.documentCategories || [];
  const expired = [];
  const expiringSoon = [];
  for (const doc of docs) {
    const days = daysUntil(doc.expiryDate);
    const entry = { name: doc.name, folder: categoryName(doc.category, customCats), keeper: doc.keeper, expiryDate: doc.expiryDate, days };
    if (days < 0) expired.push(entry);
    else if (days <= thresholdDays) expiringSoon.push(entry);
  }
  expired.sort((a, b) => a.days - b.days);
  expiringSoon.sort((a, b) => a.days - b.days);
  return { threshold: thresholdDays, expired, expiringSoon };
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderRow(e, overdue) {
  const when = overdue ? `${Math.abs(e.days)} d overdue` : `${e.days} d left`;
  return `<tr>
    <td style="padding:6px 10px;border-bottom:1px solid #E8DFCE">${escapeHtml(e.name)}</td>
    <td style="padding:6px 10px;border-bottom:1px solid #E8DFCE;color:#6b6358">${escapeHtml(e.folder)}</td>
    <td style="padding:6px 10px;border-bottom:1px solid #E8DFCE;color:#6b6358">${escapeHtml(e.keeper || '—')}</td>
    <td style="padding:6px 10px;border-bottom:1px solid #E8DFCE;color:${overdue ? '#b42318' : '#8a4a1e'};font-weight:600;white-space:nowrap">${when}</td>
  </tr>`;
}

function buildDigestHtml({ orgName, threshold, expired, expiringSoon }) {
  const section = (title, rows, overdue) => {
    if (!rows.length) return '';
    return `<h3 style="font-family:Georgia,serif;color:#2B2620;margin:22px 0 8px">${title} (${rows.length})</h3>
      <table style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:13px">
        <tr style="text-align:left;color:#6b6358;font-size:11px;text-transform:uppercase">
          <th style="padding:6px 10px">Document</th><th style="padding:6px 10px">Folder</th>
          <th style="padding:6px 10px">Custodian</th><th style="padding:6px 10px">Due</th>
        </tr>
        ${rows.map((e) => renderRow(e, overdue)).join('')}
      </table>`;
  };
  return `<div style="font-family:sans-serif;color:#2B2620;max-width:640px">
    <h2 style="font-family:Georgia,serif;margin-bottom:4px">${escapeHtml(orgName)} — Document Wallet renewal digest</h2>
    <p style="color:#6b6358;font-size:12.5px;margin-top:0">Documents already expired, or expiring within ${threshold} days.</p>
    ${section('Expired', expired, true)}
    ${section('Expiring soon', expiringSoon, false)}
    ${(!expired.length && !expiringSoon.length) ? '<p style="color:#6b6358">Nothing due — all tracked documents are outside the renewal window.</p>' : ''}
  </div>`;
}

async function runDocumentExpiryRemindersForOrg(org, { force = false, io = null } = {}) {
  const threshold = parseInt(process.env.DOCUMENT_REMINDER_DAYS || '30', 10);
  const due = await computeDueDocsForOrg(org._id, threshold);
  const total = due.expired.length + due.expiringSoon.length;
  if (!total && !force) return { sent: false, reason: 'nothing due', total: 0 };

  const recipients = await User.find({
    organizationId: org._id,
    role: { $in: REMINDER_ROLES },
    isActive: true,
  }).select('firstName lastName email');

  const title = total
    ? `📄 ${total} document renewal${total === 1 ? '' : 's'} need attention`
    : '📄 Document Wallet — all clear';
  const message = total
    ? `${due.expired.length} expired, ${due.expiringSoon.length} expiring within ${threshold} days.`
    : 'All tracked documents are outside the renewal window.';
  const html = buildDigestHtml({ orgName: org.name, ...due });

  for (const recipient of recipients) {
    await createNotification({
      organizationId: org._id,
      recipient: recipient._id,
      title,
      message,
      type: 'reminder',
      priority: due.expired.length ? 'high' : 'medium',
      actionUrl: '/documents',
      channels: { inApp: true, whatsapp: true },
    }, io);

    if (recipient.email) {
      await sendDocumentExpiryReminderEmail(recipient.email, { orgName: org.name, html }).catch((err) =>
        logger.error(`[DocumentWallet] reminder email failed for ${recipient.email}: ${err.message}`));
    }
  }

  return { sent: true, total, recipients: recipients.length };
}

async function runDocumentExpiryReminders(io = null) {
  const orgs = await Organization.find({ isActive: true });
  for (const org of orgs) {
    try {
      await runDocumentExpiryRemindersForOrg(org, { force: false, io });
    } catch (err) {
      logger.error(`[DocumentWallet] reminder sweep failed for org ${org.name}: ${err.message}`);
    }
  }
}

// Idempotent — seeds 23 blank template stubs into a brand-new, empty Document
// Wallet so a new org isn't staring at a blank screen (see plan §4). Guarded so
// two concurrent requests can't double-seed.
async function maybeSeedDocumentWallet(organizationId, userId) {
  const org = await Organization.findOne({ _id: organizationId, 'settings.documentWalletSeeded': { $ne: true } });
  if (!org) return;

  const existingCount = await Document.countDocuments({ organizationId });
  if (existingCount > 0) {
    await Organization.updateOne({ _id: organizationId }, { $set: { 'settings.documentWalletSeeded': true } });
    return;
  }

  const guard = await Organization.updateOne(
    { _id: organizationId, 'settings.documentWalletSeeded': { $ne: true } },
    { $set: { 'settings.documentWalletSeeded': true } },
  );
  if (guard.modifiedCount === 0) return; // another request won the race

  const stubs = SEED_TEMPLATES.map((t) => ({
    organizationId,
    name: t.name,
    category: t.category,
    issuer: t.issuer,
    notes: t.notes,
    versions: [{ v: 'v1.0', date: '', note: 'Starter stub', files: [] }],
    createdBy: userId,
    updatedBy: userId,
  }));
  await Document.insertMany(stubs);
}

module.exports = {
  computeDueDocsForOrg,
  buildDigestHtml,
  runDocumentExpiryRemindersForOrg,
  runDocumentExpiryReminders,
  maybeSeedDocumentWallet,
  categoryName,
};
