import { BASE_CATEGORIES } from './documentTemplates';

// Ported from the standalone Document Wallet app's status() (index.html:810-816).
// UI "expiring soon" threshold is intentionally 90 days here — distinct from the
// backend reminder digest's REMINDER_DAYS threshold (default 30). Don't conflate them.
export function docStatus(doc) {
  if (!doc.expiryDate) return { k: 'none', label: 'No expiry' };
  const days = Math.ceil((new Date(doc.expiryDate) - new Date(new Date().toDateString())) / 864e5);
  if (days < 0) return { k: 'expired', label: 'Expired', days: `${Math.abs(days)} d ago` };
  if (days <= 90) return { k: 'soon', label: 'Expiring', days: `${days} d left` };
  return { k: 'ok', label: 'Valid', days: `${days} d` };
}

export function catName(id, customCats) {
  const base = BASE_CATEGORIES.find((c) => c.id === id);
  if (base) return base.name;
  const custom = (customCats || []).find((c) => c.id === id);
  return custom ? custom.name : id;
}

export function latestFile(doc) {
  for (const v of doc.versions || []) {
    if (v.files && v.files.length) return v.files[0];
  }
  return null;
}

// Ported verbatim from parseFilename() (index.html:954-989) — autofills
// category/docNo/issueDate/name by pattern-matching the dropped/selected filename.
export function parseFilename(raw) {
  const res = { name: null, category: null, issueDate: null, docNo: null };
  let m;
  if ((m = raw.match(/\b\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]\b/i))) { res.docNo = m[0].toUpperCase(); res.category = 'tax'; } // GSTIN
  else if ((m = raw.match(/\b[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}\b/i))) { res.docNo = m[0].toUpperCase(); res.category = 'corp'; } // CIN
  else if ((m = raw.match(/\b\d{14}\b/))) { res.docNo = m[0]; res.category = 'licenses'; } // FSSAI no.
  else if ((m = raw.match(/\b[A-Z]{5}\d{4}\b[A-Z]\b/))) { res.docNo = m[0].toUpperCase(); res.category = 'hr'; } // PAN
  else if ((m = raw.match(/\b\d{8}\b/))) { res.docNo = m[0]; res.category = 'hr'; } // DIN

  if ((m = raw.match(/(\d{1,2})[.\-/](\d{1,2})[.\-/](20\d{2})/))) {
    res.issueDate = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  } else if ((m = raw.match(/(20\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})/))) {
    res.issueDate = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  } else if ((m = raw.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[.\- _]?(20\d{2})/i))) {
    const mon = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
    res.issueDate = `${m[2]}-${String(mon[m[1].slice(0, 3).toLowerCase()]).padStart(2, '0')}-01`;
  }

  if (!res.category) {
    const kw = [
      ['tax', /gst|gstr|gstin|\btax\b|\bitr\b|\btds\b|income[- ]?tax|\btan\b/i],
      ['corp', /incorporation|\bmoa\b|\baoa\b|share[- ]?cert|\bcin\b|\broc\b/i],
      ['resolutions', /resolution|\begm\b|\bagm\b|board[- ]?meeting|minutes|\bbm\b|resignation/i],
      ['banking', /bank|\bkvb\b|hdfc|icici|\bsbi\b|statement|cheque|net[- ]?banking|account[- ]?opening/i],
      ['cosmetic', /cosmetic|form[- ]?3[12]|cos[- ]?\d|tndcd|drug[- ]?control|iso[- ]?22716|legal[- ]?metrology/i],
      ['factory', /tnpcb|pollution|consent|fire[- ]?noc|shops?[- ]?(&|and)[- ]?estab|factory/i],
      ['licenses', /fssai|licen[cs]e|udyam|\bmsme\b|\biec\b|trade[- ]?licen[cs]e/i],
      ['legal', /agreement|rent|lease|insurance|contract|paytm|snapdeal|jio[- ]?mart|vendor|\bdeed\b/i],
      ['hr', /\bpan\b|aadha?r|\bdin\b|\bkyc\b|director|salary|appointment|\bepf\b|\besi\b/i],
      ['brand', /letter[- ]?head|\blogo\b|\bstamp\b|visiting|brand|trademark/i],
      ['archive', /\bbill|invoice|purchase|\bpo\b|receipt|\bold\b|waste/i],
    ];
    for (const [c, re] of kw) {
      if (re.test(raw)) { res.category = c; break; }
    }
  }

  let pretty = raw.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/\[\d+\]/g, ' ').replace(/\s{2,}/g, ' ').trim();
  if (pretty) res.name = pretty.replace(/(^|\s)\w/g, (c) => c.toUpperCase());
  return res;
}

// Ported from docSummaryText() (index.html:992-1009) — used by both "Copy details" and "Share via email".
export function docSummaryText(doc, customCats, companyName) {
  const s = docStatus(doc);
  const f = latestFile(doc);
  const fmt = (d) => (d ? d.slice(0, 10) : '—');
  const lines = [
    `Document: ${doc.name}`,
    `Doc No.: ${doc.docNo || '—'}`,
    `Folder: ${catName(doc.category, customCats)}`,
    `Issued: ${fmt(doc.issueDate)}`,
    `Expiry: ${fmt(doc.expiryDate)}`,
    `Status: ${s.label}${s.days ? ` (${s.days})` : ''}`,
    `Issuer: ${doc.issuer || '—'}`,
    `Custodian: ${doc.keeper || '—'}`,
    `Location: ${doc.location || '—'}`,
  ];
  if (doc.notes) lines.push(`Notes: ${doc.notes}`);
  if (f) lines.push(`Attachment: ${f.name}`);
  lines.push('', `— ${companyName || 'Company'} Document Wallet`);
  return lines.join('\n');
}

export function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); } finally { ta.remove(); }
  return Promise.resolve();
}

// CSV export of the currently-filtered table.
export function buildDocumentsCsv(docs, customCats) {
  const header = ['Name', 'Category', 'Doc No', 'Issue Date', 'Expiry Date', 'Issuer', 'Custodian', 'Location', 'Status', 'Notes'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = docs.map((d) => [
    d.name, catName(d.category, customCats), d.docNo, d.issueDate, d.expiryDate,
    d.issuer, d.keeper, d.location, docStatus(d).label, d.notes,
  ].map(esc).join(','));
  return [header.map(esc).join(','), ...rows].join('\n');
}
