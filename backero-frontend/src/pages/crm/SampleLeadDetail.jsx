import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, formatDistanceToNowStrict } from 'date-fns';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import { FONT_IMPORT, PILL, SUB_STAGE_PILL, StatCard } from './SampleProduction';
import { customerId } from '../../utils/leadHelpers';
import EditKycModal from './EditKycModal';

// Full per-lead "Sample Development" window — mirrors the reference design's 7-tab customer
// window (Overview / Q&A / Products / Formulas / Samples / Payments / Approvals). Everything
// here reads/writes the same Lead record; customFormulas, productLinks and samples are new
// embedded arrays on Lead (see backero-backend/src/models/Lead.js), samples are versioned and
// chainable (a Rejected sample can spawn a new version via "New Version"). Colors/fonts match
// SampleProduction.jsx's cream palette, imported from there so both stay in sync.

const SUB_STAGES = ['Requested', 'In Lab', 'Sent', 'Feedback', 'Approved', 'Rejected'];
const TABS = ['Overview', 'Q&A', 'Products', 'Formulas', 'Samples', 'Payments', 'Approvals'];
const bodyFont = { fontFamily: "'Inter', -apple-system, sans-serif" };
const displayFont = { fontFamily: "'Fraunces', Georgia, serif" };
const inputCls = 'px-3 py-2 text-sm rounded-[10px] border-[1.5px] border-[#d3c9b4] bg-[#f0eadd] text-[#2e241b] focus:outline-none focus:border-[#968871] placeholder:text-[#968871]';
const accentBtn = 'inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#f2b23e] text-[#2e241b] text-xs font-bold hover:brightness-95 transition disabled:opacity-50';
const outlineBtn = 'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border-[1.5px] border-[#d3c9b4] text-[#6d5f4c] text-xs font-semibold hover:bg-[#e7dfce] hover:border-[#968871] hover:text-[#2e241b] transition';
const textLink = 'text-xs font-semibold text-[#4a3a29] hover:text-[#2e241b]';

// Shared by "Link from Catalog" (Formulas tab) and the Products-tab auto-link — maps a real
// CatalogProduct's Formulation & Procedure into this file's row shape (percent/conv/costPerUnit)
// so both entry points build an identical, one-time copy.
function mapCatalogFormulationToRows(detail) {
  const refWeight = detail.formulation?.refWeight || 100;
  return {
    refWeight,
    refUnit: detail.formulation?.refUnit || 'g',
    procedure: detail.procedure?.text || '',
    rows: (detail.formulation?.rows || []).map((r) => ({
      rawMaterialId: r.rawMaterialId || '',
      name: r.name,
      quantity: r.quantity || 0,
      percent: refWeight ? (((r.quantity || 0) / refWeight) * 100).toFixed(2) : '',
      conv: r.convFactor ?? 1,
      phase: r.phase || '',
      notes: r.notes || '',
      unit: r.unit || 'g',
      costPerUnit: r.costPerKg || 0,
    })),
  };
}

// A plain function (not a module-level object literal) so `PILL` — imported from SampleProduction,
// which circularly imports this file — is only read at call time, well after both modules have
// finished evaluating. Reading PILL.warning etc. at module-load time throws a temporal-dead-zone
// ReferenceError during that circular import and blanks the whole app.
function formulaVersionPillCls(status) {
  return { Draft: PILL.warning, 'In Testing': PILL.info, Accepted: PILL.success, Rejected: PILL.danger, Archived: PILL.gray }[status] || PILL.gray;
}

const QA_TOPICS = ['General', 'Product', 'Packaging', 'Formula', 'Designing', 'Pricing'];
const QA_STATUS_LABEL = { pending: 'Open', in_progress: 'In Progress', answered: 'Answered', closed: 'Closed' };

function qaTopicPillCls(topic) {
  return { General: PILL.gray, Product: PILL.info, Packaging: PILL.warning, Formula: PILL.purple, Designing: PILL.info, Pricing: PILL.success }[topic] || PILL.gray;
}

function qaStatusPillCls(status) {
  return { pending: PILL.warning, in_progress: PILL.info, answered: PILL.success, closed: PILL.gray }[status] || PILL.gray;
}

// Aging badge — green <24h, amber 1-3d, red >3d; "✓ done" once answered/closed. A plain
// Date.now() read (not memoized/ticking) — good enough since the Q&A tab re-renders on every
// query invalidation, which happens often enough to keep this close to live.
function qaAging(q) {
  if (q.status === 'answered' || q.status === 'closed') return { cls: 'bg-emerald-50 text-emerald-600', label: '✓ done' };
  const hours = Math.max(0, Math.floor((Date.now() - new Date(q.createdAt).getTime()) / 3600000));
  if (hours < 24) return { cls: 'bg-emerald-100 text-emerald-700', label: `${hours}h old` };
  const days = Math.floor(hours / 24);
  if (days <= 3) return { cls: 'bg-amber-100 text-amber-700', label: `${days}d old` };
  return { cls: 'bg-red-100 text-red-700', label: `${days}d old ⚠` };
}

function truncText(s, n) {
  s = String(s == null ? '' : s);
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}

// Deterministic narrative paragraph (no external/AI calls) — mirrors the reference's
// aiSummaryParagraph(): chronological walk through every query, noting what was asked and
// (if answered) who answered it, closing with an open-questions nudge or an all-clear.
function qaSummaryParagraph(queries, leadName) {
  const chron = [...queries].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  if (!chron.length) return 'No conversation yet — add the first query above.';
  let out = `Since ${format(new Date(chron[0].createdAt), 'dd MMM yyyy')}, ${leadName} has raised ${chron.length} quer${chron.length === 1 ? 'y' : 'ies'}.`;
  chron.forEach((q, i) => {
    const when = i === chron.length - 1 ? `Most recently (${format(new Date(q.createdAt), 'dd MMM yyyy')})` : `On ${format(new Date(q.createdAt), 'dd MMM yyyy')}`;
    if (q.answer) {
      const by = q.answeredBy ? `${q.answeredBy.firstName} ${q.answeredBy.lastName}` : 'the team';
      out += ` ${when} they asked about "${truncText(q.title, 90)}" — answered by ${by}: "${truncText(q.answer, 110)}".`;
    } else {
      out += ` ${when} they asked "${truncText(q.title, 90)}" — this is still awaiting a reply.`;
    }
  });
  const openCount = chron.filter((q) => q.status === 'pending' || q.status === 'in_progress').length;
  if (openCount > 0) out += ` ${openCount} question${openCount === 1 ? ' is' : 's are'} still open — a quick follow-up would keep the momentum.`;
  else out += ' All questions answered — the lead is warm for the next step.';
  return out;
}

// Journey Chain — one-glance strip on the Overview tab: Customer → Q&A → Product → Formula →
// Sample, each segment clickable to jump straight into that tab. Mirrors the reference's
// custJourneyChainHTML(); "everything on the Customer ID" in a single row instead of separate
// per-tab digging.
function JourneyChain({ lead, queries, products, formulas, samples, onJump }) {
  const list = queries || [];
  const answered = list.filter((q) => q.answer).length;
  const latestProduct = products?.[0];
  const latestFormula = formulas?.[formulas.length - 1];
  const latestSample = samples?.[samples.length - 1];

  function chip(emoji, label, onClick) {
    return (
      <button onClick={onClick} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full border border-[#d3c9b4] bg-[#f0eadd] hover:bg-[#e7dfce] hover:border-[#968871] text-[11px] font-semibold text-[#4a3a29] transition-colors">
        {emoji} {label}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {chip('👤', lead?.name || 'Customer', () => onJump('Overview'))}
      <span className="text-[#c9bfae]">→</span>
      {chip('💬', `${list.length} quer${list.length === 1 ? 'y' : 'ies'} · ${answered} answered`, () => onJump('Q&A'))}
      <span className="text-[#c9bfae]">→</span>
      {chip('📦', latestProduct ? `${latestProduct.name} · ₹${(latestProduct.approxPrice || 0).toLocaleString('en-IN')}` : 'No product yet', () => onJump('Products'))}
      <span className="text-[#c9bfae]">→</span>
      {chip('🧬', latestFormula ? `${latestFormula.formulaId} · V${latestFormula.currentVersion}` : 'No formula yet', () => onJump('Formulas'))}
      <span className="text-[#c9bfae]">→</span>
      {chip('🧪', latestSample ? `${latestSample.sampleId} · ${latestSample.status}` : 'No sample yet', () => onJump('Samples'))}
    </div>
  );
}

// Auto-generated Conversation Summary panel shown at the bottom of the Q&A tab — stats line,
// a copy-to-clipboard narrative, and a "what's next" action bar once questions are answered.
function QaConversationSummary({ queries, leadName, onCreateProduct, onMakeSample, onStartFormula }) {
  const list = queries || [];
  const [copied, setCopied] = useState(false);

  if (!list.length) {
    return (
      <div className="p-3 rounded-[10px] border border-dashed border-[#d3c9b4] bg-[#e7dfce]">
        <p className="text-xs font-bold text-[#6d5f4c] mb-1">📝 Conversation Summary</p>
        <p className="text-xs text-[#968871]">No conversation yet — add the first query above.</p>
      </div>
    );
  }

  const answered = list.filter((q) => q.answer).length;
  const open = list.length - answered;
  const lastIso = list.reduce((latest, q) => {
    const t = q.answeredAt || q.createdAt;
    return !latest || new Date(t) > new Date(latest) ? t : latest;
  }, null);
  const summary = qaSummaryParagraph(list, leadName);
  const allDone = open === 0;

  function copy() {
    const text = [
      `Conversation Summary — ${leadName}`,
      `${list.length} quer${list.length === 1 ? 'y' : 'ies'} · ${answered} answered · ${open} open`,
      summary,
    ].join('\n');
    navigator.clipboard.writeText(text).then(() => { setCopied(true); toast.success('Conversation summary copied'); setTimeout(() => setCopied(false), 1500); });
  }

  return (
    <div className="p-3 rounded-[10px] border border-[#d3c9b4] bg-[#f0eadd] space-y-2">
      <p className="text-[11px] text-[#6d5f4c]">
        💬 <span className="font-bold">{list.length}</span> quer{list.length === 1 ? 'y' : 'ies'} · ✅ <span className="font-bold">{answered}</span> answered · ⏳ <span className="font-bold">{open}</span> open
        {lastIso && <> · Last activity: <span className="font-bold">{format(new Date(lastIso), 'dd MMM, hh:mm a')}</span></>}
      </p>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-[#6d5f4c]">📝 Conversation Summary · auto summary</p>
        <button onClick={copy} className={outlineBtn}>{copied ? '✓ Copied' : '📋 Copy Summary'}</button>
      </div>
      <p className="text-xs text-[#4a3a29]">{summary}</p>
      <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-[#d3c9b4]">
        <span className="text-[11px] font-semibold text-[#968871]">{allDone ? "✅ All questions answered — what's next?" : 'Or turn this into:'}</span>
        <button onClick={onCreateProduct} className={outlineBtn}>🆕 Create Product</button>
        <button onClick={onCreateProduct} className={outlineBtn}>🔗 Connect Existing</button>
        <button onClick={onMakeSample} className={outlineBtn}>🧪 Make a Sample</button>
        <button onClick={onStartFormula} className={outlineBtn}>🧬 Start a Formula</button>
      </div>
    </div>
  );
}

const PRODUCT_BASIS_OPTIONS = ["Customer's Formula", 'House Formula', 'To Be Developed'];

// Dedicated "Link Product" popup — mirrors the reference's productModal exactly: Product ID
// (catalogue-mirror, autocompletes against the real catalog), Product Name, Formula Basis,
// Notes, and an info banner explaining pricing happens separately via the row's 💰/✓ actions
// (see QuotePriceModal below), not in this form. Doubles as the "✏️ Edit" modal when `product`
// is passed.
function ProductLinkModal({ product, catalogProducts, saving, onClose, onSave, onRemove }) {
  const [search, setSearch] = useState('');
  const [selectedCatalog, setSelectedCatalog] = useState(null);
  const [productId, setProductId] = useState(product?.productId || '');
  const [name, setName] = useState(product?.name || '');
  const [basis, setBasis] = useState(product?.basis || 'House Formula');
  const [notes, setNotes] = useState(product?.notes || '');

  const matches = search
    ? (catalogProducts || []).filter((p) => (p.name || '').toLowerCase().includes(search.toLowerCase()) || (p.code || '').toLowerCase().includes(search.toLowerCase()))
    : [];

  function pickCatalog(p) {
    setSelectedCatalog(p);
    setProductId(p.code);
    setName(p.name);
    setSearch('');
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-[#f0eadd] rounded-2xl shadow-2xl w-full max-w-lg border border-[#d3c9b4]" style={bodyFont} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e2dac8] bg-[#e7dfce] rounded-t-2xl">
          <h3 className="font-bold text-[#2e241b]" style={displayFont}>{product ? `🧴 Edit Product Link — ${product.productId}` : '➕ Link Product'}</h3>
          <button onClick={onClose} className="text-[#968871] hover:text-[#2e241b] text-xl leading-none">&times;</button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1 block">
              Product ID <span className="text-[#b6453a]">*</span> <span className="font-normal normal-case">(catalogue mirror)</span>
            </label>
            <input value={productId} onChange={(e) => { setProductId(e.target.value); setSearch(e.target.value); setSelectedCatalog(null); }}
              placeholder="e.g., FG-SC-001" className={clsx(inputCls, 'w-full')} />
            {search && !selectedCatalog && (
              <div className="mt-1 rounded-[10px] border border-[#d3c9b4] bg-white max-h-32 overflow-y-auto">
                {matches.length === 0 && <div className="px-3 py-2 text-xs text-[#968871]">No catalog match.</div>}
                {matches.slice(0, 8).map((p) => (
                  <button key={p._id} type="button" onClick={() => pickCatalog(p)} className="w-full text-left px-3 py-2 text-xs hover:bg-[#e7dfce] flex justify-between">
                    <span className="text-[#2e241b]">{p.name}</span>
                    <span className="text-[#968871] font-mono">{p.code}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1 block">Product Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Vitamin C Serum" className={clsx(inputCls, 'w-full')} />
          </div>
          <div>
            <label className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1 block">Formula Basis</label>
            <select value={basis} onChange={(e) => setBasis(e.target.value)} className={clsx(inputCls, 'w-full')}>
              {PRODUCT_BASIS_OPTIONS.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1 block">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              placeholder="Context — target price hints, packaging, decision makers..." className={clsx(inputCls, 'w-full')} />
          </div>
          <div className="p-2.5 rounded-lg bg-[#dde5ea] text-[#33526b] text-[11px] flex gap-2">
            <span>ℹ️</span>
            <span>Pricing happens from the row actions: <strong>💰 Quote Price</strong> → <strong>✓ Accept Price</strong>. Payment stays a CRM mirror.</span>
          </div>
          <div className="flex items-center gap-3 pt-1">
            {product && (
              <button type="button" onClick={() => { if (confirm(`Remove ${product.name} from this lead?`)) onRemove(product.productId); }}
                className="text-xs font-semibold text-[#8c3a30] hover:opacity-70 mr-auto">Remove product link</button>
            )}
            <button type="button" onClick={onClose} className={clsx(outlineBtn, product ? '' : 'flex-1 justify-center')}>Cancel</button>
            <button
              onClick={() => {
                if (!productId.trim()) { toast.error('Product ID is required'); return; }
                onSave({ productId: productId.trim(), name: name.trim(), basis, notes: notes.trim() || undefined, catalogProductId: selectedCatalog?._id });
              }}
              disabled={saving}
              className={clsx(accentBtn, product ? '' : 'flex-1 justify-center')}
            >
              {saving ? 'Saving…' : '💾 Save Product Link'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// "New Formula" popup — mirrors the reference's formulaModal. The reference's Type
// (Standard/Custom) and Customer ID fields don't apply here: this tab only ever creates
// formulas scoped to the customer whose window is already open, i.e. always "Custom" for an
// implicit, already-known Customer ID — so those two fields are omitted rather than shown
// disabled/redundant.
function NewFormulaModal({ saving, onClose, onSave }) {
  const [name, setName] = useState('');
  const [productLink, setProductLink] = useState('');

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-[#f0eadd] rounded-2xl shadow-2xl w-full max-w-lg border border-[#d3c9b4]" style={bodyFont} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e2dac8] bg-[#e7dfce] rounded-t-2xl">
          <h3 className="font-bold text-[#2e241b]" style={displayFont}>➕ New Formula</h3>
          <button onClick={onClose} className="text-[#968871] hover:text-[#2e241b] text-xl leading-none">&times;</button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1 block">Formula Name <span className="text-[#b6453a]">*</span></label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Vitamin C Serum 15% + Ferulic" className={clsx(inputCls, 'w-full')} autoFocus />
          </div>
          <div>
            <label className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1 block">Linked House Product <span className="font-normal normal-case">(cloned from — optional)</span></label>
            <input value={productLink} onChange={(e) => setProductLink(e.target.value)} placeholder="e.g., FG-SC-001" className={clsx(inputCls, 'w-full')} />
          </div>
          <div className="p-2.5 rounded-lg bg-[#dde5ea] text-[#33526b] text-[11px] flex gap-2">
            <span>ℹ️</span>
            <span>A <strong>V1 (Draft)</strong> version is created automatically. Build the ingredient composition in the formula editor, then request samples against specific versions.</span>
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className={clsx(outlineBtn, 'flex-1 justify-center')}>Cancel</button>
            <button
              onClick={() => {
                if (!name.trim()) { toast.error('Formula name is required'); return; }
                onSave({ name: name.trim(), productLink: productLink.trim() || undefined });
              }}
              disabled={saving}
              className={clsx(accentBtn, 'flex-1 justify-center')}
            >
              {saving ? 'Creating…' : '🧬 Create Formula'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// "Request New Sample" popup — mirrors the reference's sampleModal. Source Query and Customer ID
// don't apply here (this tab is already scoped to one known customer/lead), so those two fields
// are omitted rather than shown redundantly. The reference only ever chains a follow-up sample
// via the Reject flow's "clone & follow-up" action, so there's no visible "chain from" picker
// here either — but "+ Create next version (chained)" on a rejected sample's detail still needs
// to seed this modal, hence the (invisible) chainedFrom/initialFormulaId props.
function NewSampleModal({ formulas, isPaid, saving, onClose, onSave, onGoToPayments, chainedFrom, initialFormulaId }) {
  const [formulaId, setFormulaId] = useState(initialFormulaId || '');
  const [versionNo, setVersionNo] = useState(() => {
    const f = formulas.find((x) => x.formulaId === initialFormulaId);
    const versions = (f?.versions || []).filter((v) => ['Draft', 'In Testing'].includes(v.status));
    return versions.length ? String(versions[versions.length - 1].version) : '';
  });
  const [productId, setProductId] = useState('');
  const [notes, setNotes] = useState('');

  const formula = formulas.find((f) => f.formulaId === formulaId);
  const openVersions = (formula?.versions || []).filter((v) => ['Draft', 'In Testing'].includes(v.status));

  function pickFormula(id) {
    setFormulaId(id);
    const f = formulas.find((x) => x.formulaId === id);
    const versions = (f?.versions || []).filter((v) => ['Draft', 'In Testing'].includes(v.status));
    setVersionNo(versions.length ? String(versions[versions.length - 1].version) : '');
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-[#f0eadd] rounded-2xl shadow-2xl w-full max-w-lg border border-[#d3c9b4]" style={bodyFont} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e2dac8] bg-[#e7dfce] rounded-t-2xl">
          <h3 className="font-bold text-[#2e241b]" style={displayFont}>➕ Request New Sample</h3>
          <button onClick={onClose} className="text-[#968871] hover:text-[#2e241b] text-xl leading-none">&times;</button>
        </div>
        <div className="p-5 space-y-3">
          {!isPaid && (
            <div className="p-2.5 rounded-lg bg-[#f0d8d2] text-[#8c3a30] text-[11px] flex gap-2">
              <span>🔒</span>
              <span>This customer's <strong>R&amp;D / sampling payment is not confirmed</strong> — sampling is locked. Confirm it in the 💳 Payments tab first.</span>
            </div>
          )}
          {formulas.length === 0 && (
            <p className="text-xs text-[#8c3a30]">No formulas yet — create one in the Formulas tab first. A sample must be linked to a formula.</p>
          )}
          <div>
            <label className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1 block">Formula <span className="text-[#b6453a]">*</span></label>
            <select value={formulaId} onChange={(e) => pickFormula(e.target.value)} className={clsx(inputCls, 'w-full')}>
              <option value="">— select formula —</option>
              {formulas.map((f) => <option key={f.formulaId} value={f.formulaId}>{f.formulaId} — {f.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1 block">
              Formula Version <span className="text-[#b6453a]">*</span> <span className="font-normal normal-case">(Draft / In Testing)</span>
            </label>
            <select value={versionNo} onChange={(e) => setVersionNo(e.target.value)} disabled={!formulaId} className={clsx(inputCls, 'w-full disabled:opacity-50')}>
              {openVersions.length === 0
                ? <option value="">— no open version —</option>
                : openVersions.map((v) => <option key={v.version} value={v.version}>V{v.version} — {v.status}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1 block">Linked Product <span className="font-normal normal-case">(optional)</span></label>
            <input value={productId} onChange={(e) => setProductId(e.target.value)} placeholder="e.g., FG-SC-001" className={clsx(inputCls, 'w-full')} />
          </div>
          <div>
            <label className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1 block">Lab Notes</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g., 100g lab batch for panel test" className={clsx(inputCls, 'w-full')} />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className={clsx(outlineBtn, 'flex-1 justify-center')}>Cancel</button>
            <button
              onClick={() => {
                if (!isPaid) { toast.error("🔒 Sampling is locked — confirm this customer's R&D/sampling payment in the Payments tab first"); onGoToPayments(); return; }
                if (!formulaId || !versionNo) { toast.error('Select a formula and version'); return; }
                onSave({ formulaId, formulaVersionNo: Number(versionNo), productId: productId.trim() || undefined, notes: notes.trim() || undefined, chainedFrom: chainedFrom || undefined });
              }}
              disabled={saving}
              className={clsx(accentBtn, 'flex-1 justify-center')}
            >
              {saving ? 'Creating…' : '🧪 Create Sample Request'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// "💰 Quote Price" mini-modal — the reference deliberately splits pricing out of the Product
// Link modal into its own small popup, reached from the row action.
function QuotePriceModal({ product, saving, onClose, onSave }) {
  const [price, setPrice] = useState(product.approxPrice || '');
  const [note, setNote] = useState('');

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-[#f0eadd] rounded-2xl shadow-2xl w-full max-w-sm border border-[#d3c9b4]" style={bodyFont} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e2dac8] bg-[#e7dfce] rounded-t-2xl">
          <h3 className="font-bold text-[#2e241b]" style={displayFont}>💰 Quote Price — {product.productId}</h3>
          <button onClick={onClose} className="text-[#968871] hover:text-[#2e241b] text-xl leading-none">&times;</button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1 block">Approx Price (₹/unit) <span className="text-[#b6453a]">*</span></label>
            <input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g., 140" className={clsx(inputCls, 'w-full')} />
          </div>
          <div>
            <label className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1 block">Note <span className="font-normal normal-case">(optional — appended to notes)</span></label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="e.g., Quoted against 5L jerry can format..." className={clsx(inputCls, 'w-full')} />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className={clsx(outlineBtn, 'flex-1 justify-center')}>Cancel</button>
            <button
              onClick={() => {
                const n = Number(price);
                if (!(n > 0)) { toast.error('Enter a valid price'); return; }
                onSave({ approxPrice: n, note: note.trim() || undefined });
              }}
              disabled={saving}
              className={clsx(accentBtn, 'flex-1 justify-center')}
            >
              {saving ? 'Saving…' : '💰 Save Quote'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Dedicated Formula Editor — a modal-xl popup (not an inline row-expand) with a left version
// sidebar and a right ingredient/procedure editor, mirroring the reference design's
// formulaEditorModal exactly: version cards (status pill, date, change note, linked samples,
// per-version Archive), a "Clone to V(n+1)" action, Ref Weight/Unit + Change Note meta fields,
// and an ingredient table with no per-row QC/HSN expand panel (that lives in Product Catalog's
// own Formulation tab, not here).
function FormulaEditorModal({ formula, samples, rawMaterials, saving, onClose, onSaveVersion, onArchiveVersion, onCloneVersion }) {
  const versions = formula.versions || [];
  const [selectedVersion, setSelectedVersion] = useState(formula.currentVersion);
  const versionsLenRef = useRef(versions.length);

  useEffect(() => {
    if (versions.length !== versionsLenRef.current) {
      versionsLenRef.current = versions.length;
      setSelectedVersion(formula.currentVersion);
    }
  }, [versions.length, formula.currentVersion]);

  const versionObj = versions.find((v) => v.version === selectedVersion) || versions[versions.length - 1];
  const locked = versionObj && (versionObj.status === 'Accepted' || versionObj.status === 'Archived');

  const [rows, setRows] = useState([]);
  const [refWeight, setRefWeight] = useState(formula.refWeight || 100);
  const [refUnit, setRefUnit] = useState(formula.refUnit || 'g');
  const [changeNote, setChangeNote] = useState('');
  const [procedure, setProcedure] = useState('');
  const [showAddSearch, setShowAddSearch] = useState(false);
  const [addSearch, setAddSearch] = useState('');

  useEffect(() => {
    if (!versionObj) return;
    const rw = formula.refWeight || 100;
    setRows((versionObj.rows || []).map((r) => ({ ...r, percent: rw ? (((Number(r.quantity) || 0) / rw) * 100).toFixed(2) : '', conv: r.conv ?? 1 })));
    setRefWeight(rw);
    setRefUnit(formula.refUnit || 'g');
    setChangeNote(versionObj.changeNote || '');
    setProcedure(versionObj.procedure || '');
    setShowAddSearch(false);
    setAddSearch('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVersion, formula.formulaId]);

  function updateRow(i, patch) { setRows((rs) => rs.map((r, ri) => (ri === i ? { ...r, ...patch } : r))); }
  function removeRow(i) { setRows((rs) => rs.filter((_, ri) => ri !== i)); }
  function onPercentChange(i, val) {
    const conv = Number(rows[i]?.conv) || 1;
    const qty = ((Number(val) || 0) / 100) * (Number(refWeight) || 0) * conv;
    updateRow(i, { percent: val, quantity: qty.toFixed(3) });
  }
  function onConvChange(i, val) {
    const percent = Number(rows[i]?.percent) || 0;
    const qty = (percent / 100) * (Number(refWeight) || 0) * (Number(val) || 1);
    updateRow(i, { conv: val, quantity: qty.toFixed(3) });
  }
  function addRow(m) {
    setRows((rs) => [...rs, { rawMaterialId: m._id, name: m.name, quantity: 0, percent: '', conv: 1, phase: '', notes: '', unit: m.unit || 'g', costPerUnit: m.costPrice || 0 }]);
    setAddSearch('');
  }

  const addMatches = addSearch ? (rawMaterials || []).filter((m) => (m.name || '').toLowerCase().includes(addSearch.toLowerCase())) : [];
  const totalPct = rows.reduce((s, r) => s + (Number(r.percent) || 0), 0);
  const totalQty = rows.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  const totalAmount = rows.reduce((s, r) => s + (Number(r.quantity) || 0) * (Number(r.costPerUnit) || 0), 0);
  const costPerUnit = Number(refWeight) > 0 ? totalAmount / Number(refWeight) : 0;
  const pctWarning = totalPct > 100
    ? { cls: PILL.danger, text: `⚠ Total percentage exceeds 100% (${totalPct.toFixed(2)}%) — check composition before saving.` }
    : (totalPct > 0 && totalPct < 100)
      ? { cls: PILL.warning, text: `ℹ Total percentage is ${totalPct.toFixed(2)}% (target 100%).` }
      : null;

  function matFor(rawMaterialId) { return (rawMaterials || []).find((m) => m._id === rawMaterialId) || null; }
  function samplesForVersion(v) { return (samples || []).filter((s) => s.formulaId === formula.formulaId && s.formulaVersionNo === v); }

  const nextNo = Math.max(0, ...versions.map((v) => v.version)) + 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-[#f7f3ea] rounded-2xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col" style={bodyFont} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#d3c9b4] flex-shrink-0">
          <h2 className="text-base font-bold text-[#2e241b]" style={displayFont}>
            🧬 {formula.formulaId} — {formula.name} · V{selectedVersion}
          </h2>
          <button onClick={onClose} className="text-[#968871] hover:text-[#2e241b] text-xl leading-none">&times;</button>
        </div>

        <div className="flex-1 flex min-h-0">
          {/* Version sidebar */}
          <div className="w-64 flex-shrink-0 border-r border-[#d3c9b4] p-3 overflow-y-auto space-y-2">
            <p className="text-[10px] font-bold text-[#968871] uppercase tracking-wide px-1">Versions</p>
            {[...versions].sort((a, b) => a.version - b.version).map((v) => {
              const canArchive = ['Draft', 'In Testing'].includes(v.status) && v.version !== formula.currentVersion;
              const linked = samplesForVersion(v.version);
              return (
                <div key={v.version} onClick={() => setSelectedVersion(v.version)}
                  className={clsx('rounded-[10px] border p-2.5 cursor-pointer text-xs transition-colors',
                    v.version === selectedVersion ? 'border-[#968871] bg-[#e7dfce]' : 'border-[#d3c9b4] bg-white hover:bg-[#e7dfce]/60')}>
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-bold text-[#2e241b]">V{v.version}</span>
                    <span className={clsx('px-2 py-0.5 rounded-full font-semibold text-[10px]', formulaVersionPillCls(v.status))}>{v.status}</span>
                  </div>
                  <div className="text-[10px] text-[#968871] mt-1">
                    {v.createdAt ? format(new Date(v.createdAt), 'dd MMM yyyy') : ''}{v.changeNote ? ` · ${v.changeNote}` : ''}
                  </div>
                  {linked.length > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {linked.map((s) => <div key={s.sampleId} className="text-[10px] text-[#6d5f4c]">🧪 {s.sampleId} — {s.status}</div>)}
                    </div>
                  )}
                  {canArchive && (
                    <button onClick={(e) => { e.stopPropagation(); onArchiveVersion(v.version); }} className="mt-1.5 text-[10px] font-semibold text-[#8c3a30] hover:opacity-70">🗄 Archive</button>
                  )}
                </div>
              );
            })}
            <button
              onClick={() => onCloneVersion({ rows: versionObj?.rows || [], refUnit: formula.refUnit, procedure: versionObj?.procedure, changeNote: `Cloned from V${selectedVersion}` })}
              disabled={saving}
              className="w-full text-xs px-3 py-2 rounded-lg border border-[#d3c9b4] text-[#4a3a29] font-semibold hover:bg-[#e7dfce] disabled:opacity-50 transition-colors">
              ➕ Clone to V{nextNo}
            </button>
          </div>

          {/* Editor main */}
          <div className="flex-1 min-w-0 p-4 overflow-y-auto space-y-3">
            {locked && (
              <div className={clsx('px-3 py-2 rounded-lg text-xs font-semibold', versionObj.status === 'Accepted' ? PILL.success : PILL.gray)}>
                {versionObj.status === 'Accepted' ? '🔒 LOCKED — this version is Accepted. Use "Clone to V(n+1)" to iterate.' : '🗄 ARCHIVED — read-only historical version. Use "Clone to V(n+1)" to iterate.'}
              </div>
            )}

            <div className="grid grid-cols-4 gap-3">
              <div><label className="text-[10px] text-[#968871]">Ref Weight</label>
                <input type="number" min="0" disabled={locked} value={refWeight} onChange={(e) => setRefWeight(e.target.value)} className={clsx(inputCls, 'w-full disabled:opacity-50')} />
              </div>
              <div><label className="text-[10px] text-[#968871]">Ref Unit</label>
                <select disabled={locked} value={refUnit} onChange={(e) => setRefUnit(e.target.value)} className={clsx(inputCls, 'w-full disabled:opacity-50')}>
                  <option value="g">g</option><option value="kg">kg</option><option value="ml">ml</option><option value="L">L</option>
                </select>
              </div>
              <div className="col-span-2"><label className="text-[10px] text-[#968871]">Change Note</label>
                <input disabled={locked} value={changeNote} onChange={(e) => setChangeNote(e.target.value)} placeholder="e.g., Reduced tack, added ferulic 0.5%" className={clsx(inputCls, 'w-full disabled:opacity-50')} />
              </div>
            </div>

            <div className="overflow-x-auto rounded-[10px] border border-[#d3c9b4]">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wide text-[#6d5f4c] border-b border-[#d3c9b4] bg-[#e7dfce]">
                    <th className="px-2 py-2">#</th><th className="px-2 py-2">Code</th><th className="px-3 py-2">Ingredient</th>
                    <th className="px-2 py-2">%</th><th className="px-2 py-2">Conv</th><th className="px-2 py-2">Unit</th>
                    <th className="px-2 py-2">Phase</th><th className="px-2 py-2">Notes</th>
                    <th className="px-2 py-2">Unit Price ₹</th><th className="px-2 py-2">Amount ₹</th>
                    {!locked && <th className="px-2 py-2"></th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const mat = matFor(r.rawMaterialId);
                    const amount = (Number(r.quantity) || 0) * (Number(r.costPerUnit) || 0);
                    return (
                      <tr key={i} className="border-t border-[#e2dac8]">
                        <td className="px-2 py-1.5 text-[#968871]">{i + 1}</td>
                        <td className="px-2 py-1.5 font-mono text-[10px] text-[#968871]">{mat?.sku || mat?.code || '—'}</td>
                        <td className="px-3 py-1.5 text-[#2e241b]">{r.name}</td>
                        <td className="px-2 py-1.5">
                          <input type="number" disabled={locked} value={r.percent ?? ''} placeholder="%" onChange={(e) => onPercentChange(i, e.target.value)}
                            className="w-14 px-1.5 py-1 rounded border border-[#d3c9b4] bg-white disabled:opacity-50" />
                        </td>
                        <td className="px-2 py-1.5">
                          <input type="number" step="0.01" disabled={locked} value={r.conv ?? 1} onChange={(e) => onConvChange(i, e.target.value)}
                            className="w-14 px-1.5 py-1 rounded border border-[#d3c9b4] bg-white disabled:opacity-50" />
                        </td>
                        <td className="px-2 py-1.5 text-[#968871]">{r.unit}</td>
                        <td className="px-2 py-1.5">
                          <input disabled={locked} value={r.phase || ''} placeholder="A/B/C" onChange={(e) => updateRow(i, { phase: e.target.value })}
                            className="w-14 px-1.5 py-1 rounded border border-[#d3c9b4] bg-white disabled:opacity-50" />
                        </td>
                        <td className="px-2 py-1.5">
                          <input disabled={locked} value={r.notes || ''} placeholder="Notes" onChange={(e) => updateRow(i, { notes: e.target.value })}
                            className="w-20 px-1.5 py-1 rounded border border-[#d3c9b4] bg-white disabled:opacity-50" />
                        </td>
                        <td className="px-2 py-1.5">
                          <input type="number" disabled={locked} value={r.costPerUnit || 0} onChange={(e) => updateRow(i, { costPerUnit: e.target.value })}
                            className="w-16 px-1.5 py-1 rounded border border-[#d3c9b4] bg-white disabled:opacity-50" />
                        </td>
                        <td className="px-2 py-1.5 text-[#33526b] font-mono">₹{amount.toFixed(2)}</td>
                        {!locked && <td className="px-2 py-1.5"><button type="button" onClick={() => removeRow(i)} className="text-[#8c3a30] hover:opacity-70">✕</button></td>}
                      </tr>
                    );
                  })}
                  {rows.length === 0 && <tr><td colSpan={locked ? 10 : 11} className="px-3 py-6 text-center text-[#968871]">No ingredients yet.</td></tr>}
                </tbody>
              </table>
            </div>

            {!locked && (
              <div>
                <button type="button" onClick={() => setShowAddSearch((v) => !v)} className={outlineBtn}>➕ Add Ingredient Row</button>
                {showAddSearch && (
                  <div className="mt-1.5">
                    <input value={addSearch} onChange={(e) => setAddSearch(e.target.value)} placeholder="Search raw materials to add…" autoFocus className={clsx(inputCls, 'w-full')} />
                    <div className="mt-1 rounded-[10px] border border-[#d3c9b4] bg-white max-h-32 overflow-y-auto">
                      {addMatches.length === 0 && <div className="px-3 py-2 text-xs text-[#968871]">No raw material found.</div>}
                      {addMatches.slice(0, 8).map((m) => (
                        <button key={m._id} type="button" onClick={() => addRow(m)} className="w-full text-left px-3 py-2 text-xs hover:bg-[#e7dfce] flex justify-between">
                          <span className="text-[#2e241b]">{m.name}</span>
                          <span className="text-[#968871]">₹{m.costPrice || 0}/{m.unit}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {pctWarning && <div className={clsx('px-3 py-2 rounded-lg text-xs font-semibold', pctWarning.cls)}>{pctWarning.text}</div>}

            <div className="grid grid-cols-4 gap-3 bg-[#2e241b] text-[#f0eadd] rounded-2xl px-5 py-3">
              <div><p className="text-[10px] text-[#c9bfae]">Total %</p><p className="text-sm font-bold">{totalPct.toFixed(2)}%</p></div>
              <div><p className="text-[10px] text-[#c9bfae]">Total Qty</p><p className="text-sm font-bold">{totalQty.toFixed(2)} {refUnit}</p></div>
              <div><p className="text-[10px] text-[#c9bfae]">Batch Amount</p><p className="text-sm font-bold">₹{totalAmount.toFixed(2)}</p></div>
              <div><p className="text-[10px] text-[#c9bfae]">Cost / Unit</p><p className="text-sm font-bold">₹{costPerUnit.toFixed(4)}</p></div>
            </div>

            <div>
              <label className="text-[10px] text-[#968871]">Manufacturing Procedure</label>
              <textarea disabled={locked} value={procedure} onChange={(e) => setProcedure(e.target.value)} rows={4}
                placeholder="Phase-wise manufacturing procedure, temperatures, mixing times..." className={clsx(inputCls, 'w-full disabled:opacity-50')} />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[#d3c9b4] flex-shrink-0">
          <button onClick={onClose} className={outlineBtn}>Close</button>
          {!locked && (
            <button
              onClick={() => onSaveVersion({
                version: selectedVersion,
                refUnit, refWeight: Number(refWeight) || 100, procedure: procedure.trim() || undefined, changeNote: changeNote.trim() || undefined,
                rows: rows.map((r) => ({ rawMaterialId: r.rawMaterialId, name: r.name, quantity: Number(r.quantity) || 0, unit: r.unit, costPerUnit: Number(r.costPerUnit) || 0, phase: r.phase || undefined, notes: r.notes || undefined, conv: Number(r.conv) || 1 })),
              })}
              disabled={saving}
              className={accentBtn}
            >
              {saving ? 'Saving…' : '💾 Save Version'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SampleLeadDetail({ leadId, onClose, initialTab }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState(initialTab || 'Overview');

  // Q&A
  const [showRaiseForm, setShowRaiseForm] = useState(false);
  const [queryTitle, setQueryTitle] = useState('');
  const [queryDesc, setQueryDesc] = useState('');
  const [queryUrgency, setQueryUrgency] = useState('medium');
  const [queryTopic, setQueryTopic] = useState('General');
  const [queryContactName, setQueryContactName] = useState('');
  const [queryContactEmail, setQueryContactEmail] = useState('');
  const [queryTargetPrice, setQueryTargetPrice] = useState('');
  const [queryBenchmarkNotes, setQueryBenchmarkNotes] = useState('');
  const [queryPackagingIntent, setQueryPackagingIntent] = useState('');
  const [queryInternalNotes, setQueryInternalNotes] = useState('');
  const [queryCatalogSearch, setQueryCatalogSearch] = useState('');
  const [querySelectedCatalogProduct, setQuerySelectedCatalogProduct] = useState(null);
  const [replyDrafts, setReplyDrafts] = useState({});
  // Which query (if any) is being converted into a product/sample/formula right now — set when
  // a 🆕/🔗/🧪/🧬 convert-icon is clicked, consumed (and cleared) once the resulting
  // create-product/create-formula/create-sample mutation succeeds, to stamp the query's
  // linkedProductLinkId / convertedTo badge without a dedicated conversion modal.
  const [qaConvertQueryId, setQaConvertQueryId] = useState(null);

  // Products — dedicated Link/Edit modal + a separate Quote Price mini-modal (pricing is not
  // captured in the link form itself, matching the reference's productModal/quoteModal split).
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [productModalEditing, setProductModalEditing] = useState(null);
  const [quoteModalFor, setQuoteModalFor] = useState(null);

  // Formulas — a dedicated "New Formula" popup (name + product link only); ingredients are
  // added afterwards in the dedicated Formula Editor modal (editorFormulaId), not inline here.
  const [showFormulaForm, setShowFormulaForm] = useState(false);
  const [editorFormulaId, setEditorFormulaId] = useState(null);

  // Link Formula — one-time copy of a real Product Catalog product's Formulation & Procedure
  // into a new editable custom formula (not a live sync).
  const [showLinkFormulaPicker, setShowLinkFormulaPicker] = useState(false);
  const [linkFormulaSearch, setLinkFormulaSearch] = useState('');

  const [showEditKyc, setShowEditKyc] = useState(false);

  // Move to Production — creates the Batch Tracker order in the same step, no separate
  // "Send to Production" visit required.
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [moveCatalogSearch, setMoveCatalogSearch] = useState('');
  const [moveSelectedCatalogProduct, setMoveSelectedCatalogProduct] = useState(null);
  const [moveBatchSizeKg, setMoveBatchSizeKg] = useState(10);

  const { data: catalogProducts } = useQuery({
    queryKey: ['catalog', 'products', 'all'],
    queryFn: () => api.get('/catalog/products').then((r) => r.data.products || []),
    enabled: productModalOpen || showMoveModal || showRaiseForm || showLinkFormulaPicker,
    staleTime: 5 * 60 * 1000,
  });
  const moveCatalogMatches = moveCatalogSearch
    ? (catalogProducts || []).filter((p) => (p.name || '').toLowerCase().includes(moveCatalogSearch.toLowerCase()) || (p.code || '').toLowerCase().includes(moveCatalogSearch.toLowerCase()))
    : (catalogProducts || []);
  const queryCatalogMatches = queryCatalogSearch
    ? (catalogProducts || []).filter((p) => (p.name || '').toLowerCase().includes(queryCatalogSearch.toLowerCase()) || (p.code || '').toLowerCase().includes(queryCatalogSearch.toLowerCase()))
    : (catalogProducts || []);
  const linkFormulaMatches = linkFormulaSearch
    ? (catalogProducts || []).filter((p) => (p.name || '').toLowerCase().includes(linkFormulaSearch.toLowerCase()) || (p.code || '').toLowerCase().includes(linkFormulaSearch.toLowerCase()))
    : (catalogProducts || []);

  const { data: rawMaterials } = useQuery({
    queryKey: ['inventory', 'raw-materials', 'all'],
    queryFn: () => api.get('/inventory/raw-materials').then((r) => r.data.materials || []),
    enabled: !!editorFormulaId,
    staleTime: 5 * 60 * 1000,
  });

  // Payments — R&D/sampling fee audit trail captured alongside confirming the payment
  const [payMode, setPayMode] = useState('upi');
  const [payTxnRef, setPayTxnRef] = useState('');
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payReceivedBy, setPayReceivedBy] = useState('');
  const [payNotes, setPayNotes] = useState('');

  // Samples
  const [showSampleForm, setShowSampleForm] = useState(false);
  const [sampleChainSeed, setSampleChainSeed] = useState(null); // { chainedFrom, formulaId } | null
  const [openSampleId, setOpenSampleId] = useState(null);
  const [feedbackDraft, setFeedbackDraft] = useState('');

  // Stage-transition modals — dispatch/feedback/approve/reject each gate a subStage move
  // behind capturing the data the mockup requires for that step (courier info, feedback
  // text, packaging confirmation, rejection reason) instead of a bare status flip.
  const [courierModalFor, setCourierModalFor] = useState(null);
  const [courierName, setCourierName] = useState('');
  const [courierAwb, setCourierAwb] = useState('');
  const [courierSentDate, setCourierSentDate] = useState('');
  const [feedbackModalFor, setFeedbackModalFor] = useState(null);
  const [feedbackModalText, setFeedbackModalText] = useState('');
  const [approveModalFor, setApproveModalFor] = useState(null);
  const [approvePackaging, setApprovePackaging] = useState(false);
  const [approveContactName, setApproveContactName] = useState('');
  const [rejectModalFor, setRejectModalFor] = useState(null);
  const [rejectReasonModal, setRejectReasonModal] = useState('');
  const [rejectCloneFollowUp, setRejectCloneFollowUp] = useState(true);
  const [rejectContactName, setRejectContactName] = useState('');

  const { data: lead, isLoading } = useQuery({
    queryKey: ['crm', 'lead', leadId],
    queryFn: () => api.get(`/crm/leads/${leadId}`).then((r) => r.data.lead),
    enabled: !!leadId,
  });

  const { data: queries } = useQuery({
    queryKey: ['crm', 'lead', leadId, 'queries'],
    queryFn: () => api.get(`/crm/leads/${leadId}/queries`).then((r) => r.data.queries),
    enabled: !!leadId,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['crm', 'lead', leadId] });
    qc.invalidateQueries({ queryKey: ['crm', 'lead', leadId, 'queries'] });
    qc.invalidateQueries({ queryKey: ['sample-production'] });
  };

  const raiseMutation = useMutation({
    mutationFn: (body) => api.post(`/crm/leads/${leadId}/query`, body),
    onSuccess: () => {
      toast.success('Query raised');
      setQueryTitle(''); setQueryDesc(''); setQueryTopic('General'); setQueryContactName(''); setQueryContactEmail('');
      setQueryTargetPrice(''); setQueryBenchmarkNotes(''); setQueryPackagingIntent(''); setQueryInternalNotes('');
      setQueryCatalogSearch(''); setQuerySelectedCatalogProduct(null);
      setShowRaiseForm(false); invalidate();
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to raise query'),
  });

  const replyMutation = useMutation({
    mutationFn: ({ queryId, answer }) => api.put(`/crm/queries/${queryId}/reply`, { answer }),
    onSuccess: (_r, vars) => { toast.success('Reply sent'); setReplyDrafts((d) => ({ ...d, [vars.queryId]: '' })); invalidate(); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to reply'),
  });

  const startQueryMutation = useMutation({
    mutationFn: (queryId) => api.put(`/crm/queries/${queryId}/status`, { status: 'in_progress' }),
    onSuccess: () => invalidate(),
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to update query'),
  });

  const closeQueryMutation = useMutation({
    mutationFn: (queryId) => api.put(`/crm/queries/${queryId}/status`, { status: 'closed' }),
    onSuccess: () => { toast.success('Query closed'); invalidate(); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to close query'),
  });

  // Stamps a query with the product it was linked to (unlocks the 🧪/🧬 icons) and/or the
  // "→ converted" badge — fired after a product/formula/sample created via a Q&A convert-icon
  // actually succeeds (see qaConvertQueryId).
  const linkQueryMutation = useMutation({
    mutationFn: ({ queryId, ...body }) => api.put(`/crm/queries/${queryId}/link`, body),
    onSuccess: () => invalidate(),
  });

  const paymentMutation = useMutation({
    mutationFn: (body) => api.put(`/crm/leads/${leadId}/sample`, body),
    onSuccess: () => { toast.success('Payment status updated'); invalidate(); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to update payment'),
  });

  const linkProductMutation = useMutation({
    mutationFn: (body) => api.post(`/crm/leads/${leadId}/products`, body).then((r) => r.data.lead),
    onSuccess: (updatedLead) => {
      toast.success('Product linked');
      setProductModalOpen(false);
      if (qaConvertQueryId) {
        const created = updatedLead.productLinks[updatedLead.productLinks.length - 1];
        if (created) linkQueryMutation.mutate({ queryId: qaConvertQueryId, productLinkId: created._id, convertedTo: `🔗 ${created.productId}` });
        setQaConvertQueryId(null);
      }
      invalidate();
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to link product'),
  });

  const updateProductMutation = useMutation({
    mutationFn: ({ productId, ...body }) => api.put(`/crm/leads/${leadId}/products/${productId}`, body),
    onSuccess: () => {
      toast.success('Updated');
      setProductModalOpen(false); setProductModalEditing(null);
      setQuoteModalFor(null);
      invalidate();
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to update'),
  });

  const createFormulaMutation = useMutation({
    mutationFn: (body) => api.post(`/crm/leads/${leadId}/formulas`, body).then((r) => r.data.lead),
    onSuccess: (updatedLead) => {
      toast.success('Formula created');
      setShowFormulaForm(false);
      const created = updatedLead.customFormulas[updatedLead.customFormulas.length - 1];
      qc.setQueryData(['crm', 'lead', leadId], (old) => (old ? { ...old, ...updatedLead } : updatedLead));
      if (created) setEditorFormulaId(created.formulaId);
      if (qaConvertQueryId) {
        if (created) linkQueryMutation.mutate({ queryId: qaConvertQueryId, convertedTo: `🧬 ${created.formulaId}` });
        setQaConvertQueryId(null);
      }
      invalidate();
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to create formula'),
  });

  // "Link from Catalog" — fetches the full catalog product (list queries omit formulation/procedure
  // for payload size), copies its current Formulation & Procedure into a brand-new custom formula
  // (a one-time copy, same clone-then-diverge pattern as Product Catalog's own versioning), then
  // opens the Formula Editor modal on V1 so the user can keep refining it for this customer.
  const linkFormulaMutation = useMutation({
    mutationFn: async (product) => {
      const detail = await api.get(`/catalog/products/${product._id}`).then((r) => r.data.product);
      const mapped = mapCatalogFormulationToRows(detail);
      const updatedLead = await api.post(`/crm/leads/${leadId}/formulas`, {
        name: detail.name,
        productLink: detail.code,
        catalogProductId: detail._id,
        refWeight: mapped.refWeight,
        refUnit: mapped.refUnit,
        procedure: mapped.procedure || undefined,
        rows: mapped.rows.length ? mapped.rows.map((r) => ({ rawMaterialId: r.rawMaterialId, name: r.name, quantity: Number(r.quantity) || 0, unit: r.unit, costPerUnit: r.costPerUnit, phase: r.phase || undefined, notes: r.notes || undefined, conv: Number(r.conv) || 1 })) : undefined,
      }).then((r) => r.data.lead);
      return { updatedLead, code: detail.code };
    },
    onSuccess: ({ updatedLead, code }) => {
      toast.success(`Loaded formulation from ${code}`);
      setShowLinkFormulaPicker(false);
      setLinkFormulaSearch('');
      const created = updatedLead.customFormulas[updatedLead.customFormulas.length - 1];
      qc.setQueryData(['crm', 'lead', leadId], (old) => (old ? { ...old, ...updatedLead } : updatedLead));
      if (created) setEditorFormulaId(created.formulaId);
      invalidate();
    },
    onError: () => toast.error('Failed to load catalog formulation'),
  });

  // Products tab auto-link: when a real catalog SKU is linked there, silently copy its
  // Formulation & Procedure into a new formula too — same mapping as "Link from Catalog"
  // above, but fired from the Products tab so it must NOT touch the Formulas tab's form state.
  const autoLinkFormulaMutation = useMutation({
    mutationFn: async (product) => {
      const detail = await api.get(`/catalog/products/${product._id}`).then((r) => r.data.product);
      const mapped = mapCatalogFormulationToRows(detail);
      return api.post(`/crm/leads/${leadId}/formulas`, {
        name: detail.name,
        productLink: detail.code,
        catalogProductId: detail._id,
        refWeight: mapped.refWeight,
        refUnit: mapped.refUnit,
        procedure: mapped.procedure || undefined,
        rows: mapped.rows.length ? mapped.rows.map((r) => ({ rawMaterialId: r.rawMaterialId, name: r.name, quantity: Number(r.quantity) || 0, unit: r.unit, costPerUnit: r.costPerUnit, phase: r.phase || undefined, notes: r.notes || undefined, conv: Number(r.conv) || 1 })) : undefined,
      });
    },
    onSuccess: () => { toast.success('Formula copied from catalog'); invalidate(); },
    onError: () => toast.error('Product linked, but failed to copy its formula'),
  });

  const updateFormulaMutation = useMutation({
    mutationFn: ({ formulaId, ...body }) => api.put(`/crm/leads/${leadId}/formulas/${formulaId}`, body),
    onSuccess: (_data, vars) => {
      if (vars.bumpVersion) toast.success('Cloned to a new version');
      else if (vars.status === 'Archived') toast.success('Version archived');
      else toast.success('Formula version saved');
      invalidate();
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to update formula'),
  });

  const createSampleMutation = useMutation({
    mutationFn: (body) => api.post(`/crm/leads/${leadId}/samples`, body).then((r) => r.data.lead),
    onSuccess: (updatedLead) => {
      toast.success('Sample created');
      setShowSampleForm(false);
      if (qaConvertQueryId) {
        const created = updatedLead.samples[updatedLead.samples.length - 1];
        if (created) linkQueryMutation.mutate({ queryId: qaConvertQueryId, convertedTo: `🧪 ${created.sampleId}` });
        setQaConvertQueryId(null);
      }
      invalidate();
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to create sample'),
  });

  const updateSampleMutation = useMutation({
    mutationFn: ({ sampleId, ...body }) => api.put(`/crm/leads/${leadId}/samples/${sampleId}`, body),
    onSuccess: () => { toast.success('Sample updated'); invalidate(); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to update sample'),
  });

  const sampleStatusMutation = useMutation({
    mutationFn: ({ sampleId, ...body }) => api.put(`/crm/leads/${leadId}/samples/${sampleId}/status`, body),
    onSuccess: () => { toast.success('Sample status updated'); invalidate(); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to update status'),
  });

  const feedbackMutation = useMutation({
    mutationFn: ({ sampleId, text }) => api.post(`/crm/leads/${leadId}/samples/${sampleId}/feedback`, { text }),
    onSuccess: () => { toast.success('Feedback logged'); setFeedbackDraft(''); invalidate(); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to log feedback'),
  });

  const dispatchMutation = useMutation({
    mutationFn: async ({ sampleId, courier, awb, sentAt }) => {
      await api.put(`/crm/leads/${leadId}/samples/${sampleId}`, { courier, awb, sentAt });
      return api.put(`/crm/leads/${leadId}/samples/${sampleId}/status`, { status: 'Sent' });
    },
    onSuccess: () => { toast.success('Sample dispatched'); setCourierModalFor(null); invalidate(); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to dispatch sample'),
  });

  const feedbackTransitionMutation = useMutation({
    mutationFn: async ({ sampleId, text }) => {
      await api.post(`/crm/leads/${leadId}/samples/${sampleId}/feedback`, { text });
      return api.put(`/crm/leads/${leadId}/samples/${sampleId}/status`, { status: 'Feedback' });
    },
    onSuccess: () => { toast.success('Feedback logged'); setFeedbackModalFor(null); invalidate(); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to log feedback'),
  });

  const approveMutation = useMutation({
    mutationFn: async ({ sampleId, packagingConfirmed, formulaId, approvedByContact }) => {
      if (packagingConfirmed) await api.put(`/crm/leads/${leadId}/samples/${sampleId}`, { packagingConfirmed: true });
      await api.put(`/crm/leads/${leadId}/samples/${sampleId}/status`, { status: 'Approved', approvedByContact: approvedByContact || undefined });
      if (formulaId) await api.put(`/crm/leads/${leadId}/formulas/${formulaId}`, { status: 'Accepted' });
    },
    onSuccess: () => { toast.success('Sample approved'); setApproveModalFor(null); setApproveContactName(''); invalidate(); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to approve sample'),
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ sampleId, rejectionReason, cloneFollowUp, formulaId, rejectedByContact }) => {
      await api.put(`/crm/leads/${leadId}/samples/${sampleId}/status`, { status: 'Rejected', rejectionReason, rejectedByContact: rejectedByContact || undefined });
      if (cloneFollowUp) {
        if (formulaId) await api.put(`/crm/leads/${leadId}/formulas/${formulaId}`, { bumpVersion: true });
        await api.post(`/crm/leads/${leadId}/samples`, { formulaId: formulaId || undefined, chainedFrom: sampleId });
      }
    },
    onSuccess: () => { toast.success('Sample rejected'); setRejectModalFor(null); setRejectContactName(''); invalidate(); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to reject sample'),
  });

  const deleteProductMutation = useMutation({
    mutationFn: (productId) => api.delete(`/crm/leads/${leadId}/products/${productId}`),
    onSuccess: () => { toast.success('Product link removed'); setProductModalOpen(false); setProductModalEditing(null); invalidate(); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to remove product link'),
  });

  const moveToProductionMutation = useMutation({
    mutationFn: async ({ catalogProduct, batchSizeKg }) => {
      await api.put(`/crm/leads/${leadId}`, { status: 'In Progress' });
      return api.post(`/crm/leads/${leadId}/link-production`, { mode: 'create', catalogProduct, batchSizeKg });
    },
    onSuccess: () => {
      toast.success('Moved to Production — batch order created in Batch Tracker');
      qc.invalidateQueries({ queryKey: ['crm'] });
      qc.invalidateQueries({ queryKey: ['sample-production'] });
      invalidate();
      setShowMoveModal(false);
      setMoveSelectedCatalogProduct(null);
      setMoveCatalogSearch('');
      setMoveBatchSizeKg(10);
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to move to Production'),
  });

  if (!leadId) return null;

  const sd = lead?.sampleDetails || {};
  const isPaid = sd.paymentStatus === 'full_paid';
  const samples = lead?.samples || [];
  const formulas = lead?.customFormulas || [];
  const products = lead?.productLinks || [];
  const pendingQueries = (queries || []).filter((q) => q.status === 'pending' || q.status === 'in_progress').length;
  const approvedSamples = samples.filter((s) => s.status === 'Approved');
  const openSample = samples.find((s) => s.sampleId === openSampleId);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={bodyFont}>
      <style>{FONT_IMPORT}</style>
      <div className="absolute inset-0 bg-[#2e241b]/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#f0eadd] rounded-2xl shadow-[0_10px_40px_rgba(46,36,27,0.16)] w-full max-w-4xl border border-[#d3c9b4] flex flex-col" style={{ maxHeight: '90vh' }}>
        <div className="p-5 border-b border-[#e2dac8] bg-[#e7dfce] flex items-center justify-between flex-shrink-0 rounded-t-2xl">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-[#2e241b]" style={displayFont}>{lead?.name || 'Loading…'}</h3>
              {lead && <span className="font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#ddd3be] text-[#4a3a29]">{customerId(lead)}</span>}
            </div>
            <p className="text-xs text-[#6d5f4c]">{lead?.company || '—'} · {lead?.phone}</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-lg hover:bg-[#ddd3be] flex items-center justify-center text-[#968871] hover:text-[#2e241b] text-lg">✕</button>
        </div>

        <div className="flex gap-1 px-5 pt-3 border-b border-[#e2dac8] flex-shrink-0 overflow-x-auto">
          {TABS.map((t) => {
            const count = t === 'Q&A' ? (queries || []).length : t === 'Products' ? products.length : t === 'Formulas' ? formulas.length : t === 'Samples' ? samples.length : t === 'Approvals' ? approvedSamples.length : null;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={clsx(
                  'px-3 py-2 text-sm font-semibold border-b-[2.5px] -mb-px transition-colors whitespace-nowrap',
                  tab === t ? 'border-[#f2b23e] text-[#2e241b]' : 'border-transparent text-[#6d5f4c] hover:text-[#2e241b]'
                )}
              >
                {t}
                {t === 'Q&A' && pendingQueries > 0 && <span className={clsx('ml-1.5 px-1.5 py-0.5 rounded-full text-[10px]', PILL.warning)}>{pendingQueries}</span>}
                {count !== null && t !== 'Q&A' && <span className={clsx('ml-1.5 px-1.5 py-0.5 rounded-full text-[10px]', PILL.gray)}>{count}</span>}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {isLoading && <p className="text-sm text-[#968871] text-center py-8">Loading…</p>}

          {!isLoading && tab === 'Overview' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <JourneyChain lead={lead} queries={queries} products={products} formulas={formulas} samples={samples} onJump={setTab} />
                <button onClick={() => setShowEditKyc(true)} className={outlineBtn}>✏️ Edit KYC</button>
              </div>

              <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className={clsx('px-2.5 py-1 rounded-full font-semibold', PILL.gray)}>{lead?.status}</span>
                <span className="text-[#968871]">→</span>
                <span className={clsx('px-2.5 py-1 rounded-full font-semibold', SUB_STAGE_PILL[sd.subStage] || SUB_STAGE_PILL.Requested)}>{sd.subStage || 'Requested'}</span>
                <span className="text-[#968871]">→</span>
                <span className={clsx('px-2.5 py-1 rounded-full font-semibold', isPaid ? PILL.success : PILL.warning)}>
                  {isPaid ? 'Paid' : 'Payment Pending'}
                </span>
                {lead?.productionOrderId && (
                  <>
                    <span className="text-[#968871]">→</span>
                    <span className={clsx('px-2.5 py-1 rounded-full font-semibold', PILL.info)}>
                      {lead.productionOrderId.orderNumber || 'Linked to Production'}
                    </span>
                  </>
                )}
              </div>

              {approvedSamples.length > 0 && !lead?.productionOrderId && (
                <div className={clsx('p-3 rounded-[10px] border', 'bg-[#dce9d4] border-[#b9d2af]')}>
                  <p className="text-sm font-semibold text-[#3a5f3c]">✓ {approvedSamples.length} sample(s) approved — ready to send to production</p>
                  <p className="text-xs text-[#3a5f3c]/80 mt-0.5">Open the Approvals tab and move this lead to Production — the Batch Tracker order gets created in the same step.</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-[#968871] mb-0.5">Business Type</p><p className="text-[#2e241b]">{lead?.businessType || '—'}</p></div>
                <div><p className="text-xs text-[#968871] mb-0.5">City</p><p className="text-[#2e241b]">{lead?.city || '—'}</p></div>
                <div><p className="text-xs text-[#968871] mb-0.5">Product interest</p><p className="text-[#2e241b]">{(lead?.productInterest || []).join(', ') || '—'}</p></div>
                <div><p className="text-xs text-[#968871] mb-0.5">Estimated value</p><p className="text-[#2e241b]">₹{(lead?.estimatedValue || 0).toLocaleString('en-IN')}</p></div>
                <div><p className="text-xs text-[#968871] mb-0.5">Assigned to</p><p className="text-[#2e241b]">{lead?.assignedTo ? `${lead.assignedTo.firstName} ${lead.assignedTo.lastName}` : 'Unassigned'}</p></div>
                <div><p className="text-xs text-[#968871] mb-0.5">Queries · Products · Formulas · Samples</p><p className="text-[#2e241b]">{(queries || []).length} · {products.length} · {formulas.length} · {samples.length}</p></div>
              </div>

              {lead?.notes && (
                <div>
                  <p className="text-xs text-[#968871] mb-1">Notes</p>
                  <p className="text-sm text-[#4a3a29] whitespace-pre-wrap">{lead.notes}</p>
                </div>
              )}
            </div>
          )}

          {!isLoading && tab === 'Q&A' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-[#968871] uppercase tracking-wide">
                  {(queries || []).length} quer{(queries || []).length === 1 ? 'y' : 'ies'} · {pendingQueries} open
                </p>
                <button onClick={() => setShowRaiseForm((v) => !v)} className={outlineBtn}>+ Raise Query</button>
              </div>

              {showRaiseForm && (
                <div className="p-3 rounded-[10px] border-[1.5px] border-dashed border-[#d3c9b4] bg-[#e7dfce] space-y-2">
                  <input value={queryTitle} onChange={(e) => setQueryTitle(e.target.value)} placeholder="Query title" className={clsx(inputCls, 'w-full')} />
                  <textarea value={queryDesc} onChange={(e) => setQueryDesc(e.target.value)} placeholder="Describe the question…" rows={2} className={clsx(inputCls, 'w-full')} />
                  <div className="grid grid-cols-2 gap-2">
                    <input value={queryContactName} onChange={(e) => setQueryContactName(e.target.value)} placeholder="Contact person name" className={inputCls} />
                    <input value={queryContactEmail} onChange={(e) => setQueryContactEmail(e.target.value)} placeholder="Contact email" className={inputCls} />
                  </div>
                  <div>
                    <input
                      value={querySelectedCatalogProduct ? querySelectedCatalogProduct.name : queryCatalogSearch}
                      onChange={(e) => { setQueryCatalogSearch(e.target.value); setQuerySelectedCatalogProduct(null); }}
                      placeholder="Link a catalog product (optional)…"
                      className={clsx(inputCls, 'w-full')}
                    />
                    {queryCatalogSearch && !querySelectedCatalogProduct && (
                      <div className="mt-1 rounded-[10px] border border-[#d3c9b4] bg-[#f0eadd] max-h-32 overflow-y-auto">
                        {queryCatalogMatches.length === 0 && <div className="px-3 py-2 text-xs text-[#968871]">No catalog match.</div>}
                        {queryCatalogMatches.slice(0, 8).map((p) => (
                          <button key={p._id} type="button"
                            onClick={() => { setQuerySelectedCatalogProduct(p); setQueryCatalogSearch(''); }}
                            className="w-full text-left px-3 py-2 text-xs hover:bg-[#e7dfce] flex justify-between">
                            <span className="text-[#2e241b]">{p.name}</span>
                            <span className="text-[#968871] font-mono">{p.code}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input value={queryTargetPrice} onChange={(e) => setQueryTargetPrice(e.target.value)} type="number" placeholder="Target price (₹/unit)" className={inputCls} />
                    <input value={queryPackagingIntent} onChange={(e) => setQueryPackagingIntent(e.target.value)} placeholder="Packaging intent" className={inputCls} />
                  </div>
                  <textarea value={queryBenchmarkNotes} onChange={(e) => setQueryBenchmarkNotes(e.target.value)} placeholder="Benchmark / reference notes…" rows={2} className={clsx(inputCls, 'w-full')} />
                  <textarea value={queryInternalNotes} onChange={(e) => setQueryInternalNotes(e.target.value)} placeholder="Internal notes (not shared with customer)…" rows={2} className={clsx(inputCls, 'w-full')} />
                  <div className="flex items-center gap-2">
                    <select value={queryUrgency} onChange={(e) => setQueryUrgency(e.target.value)} className={inputCls}>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                    <select value={queryTopic} onChange={(e) => setQueryTopic(e.target.value)} className={inputCls}>
                      {QA_TOPICS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <button
                      onClick={() => {
                        if (!queryTitle.trim() || !queryDesc.trim()) { toast.error('Title and description required'); return; }
                        raiseMutation.mutate({
                          title: queryTitle.trim(),
                          description: queryDesc.trim(),
                          urgency: queryUrgency,
                          topic: queryTopic,
                          contactName: queryContactName.trim() || undefined,
                          contactEmail: queryContactEmail.trim() || undefined,
                          linkedCatalogProductId: querySelectedCatalogProduct?._id,
                          targetPrice: queryTargetPrice ? Number(queryTargetPrice) : undefined,
                          benchmarkNotes: queryBenchmarkNotes.trim() || undefined,
                          packagingIntent: queryPackagingIntent.trim() || undefined,
                          internalNotes: queryInternalNotes.trim() || undefined,
                        });
                      }}
                      disabled={raiseMutation.isPending}
                      className={clsx(accentBtn, 'ml-auto')}
                    >
                      {raiseMutation.isPending ? 'Raising…' : 'Submit'}
                    </button>
                  </div>
                </div>
              )}

              {(queries || []).length === 0 && !showRaiseForm && (
                <p className="text-sm text-[#968871] text-center py-6">No queries raised for this lead yet.</p>
              )}

              {(queries || []).map((q) => {
                const isOpen = q.status === 'pending' || q.status === 'in_progress';
                const hasProduct = !!q.linkedProductLinkId;
                const aging = qaAging(q);
                return (
                  <div key={q._id} className="p-3 rounded-[10px] border border-[#e2dac8] space-y-2">
                    <div className="flex items-center gap-2 flex-wrap text-[11px]">
                      <span className={clsx('px-2 py-0.5 rounded-full font-semibold', qaStatusPillCls(q.status))}>
                        {QA_STATUS_LABEL[q.status] || q.status}
                      </span>
                      <span className={clsx('px-2 py-0.5 rounded-full font-semibold', aging.cls)}>{aging.label}</span>
                      <span className={clsx('px-2 py-0.5 rounded-full font-semibold', qaTopicPillCls(q.topic || 'General'))}>{q.topic || 'General'}</span>
                      {q.convertedTo && <span className="px-2 py-0.5 rounded-full font-semibold bg-[#e7dfce] text-[#4a3a29]">→ {q.convertedTo}</span>}
                      <span className="text-[#968871]">{format(new Date(q.createdAt), 'dd MMM, hh:mm a')}</span>
                      <span className="text-[#968871]">· {q.urgency} urgency</span>
                      <span className="flex-1" />
                      {isOpen && (
                        <div className="flex items-center gap-1">
                          <button title="🆕 Create Product — make a new product for this query" onClick={() => { setQaConvertQueryId(q._id); setTab('Products'); setProductModalEditing(null); setProductModalOpen(true); }} className="w-6 h-6 rounded-full hover:bg-[#e7dfce] flex items-center justify-center">🆕</button>
                          <button title="🔗 Connect Existing — attach a catalog product to this query" onClick={() => { setQaConvertQueryId(q._id); setTab('Products'); setProductModalEditing(null); setProductModalOpen(true); }} className="w-6 h-6 rounded-full hover:bg-[#e7dfce] flex items-center justify-center">🔗</button>
                          <button
                            title={hasProduct ? '🧪 Create Sample' : '🔒 Create Sample — attach a product first (🆕 or 🔗)'}
                            onClick={hasProduct ? () => { setQaConvertQueryId(q._id); setTab('Samples'); setShowSampleForm(true); } : undefined}
                            className={clsx('w-6 h-6 rounded-full flex items-center justify-center', hasProduct ? 'hover:bg-[#e7dfce]' : 'opacity-30 cursor-not-allowed')}
                          >🧪</button>
                          <button
                            title={hasProduct ? '🧬 Create Formula' : '🔒 Create Formula — attach a product first (🆕 or 🔗)'}
                            onClick={hasProduct ? () => { setQaConvertQueryId(q._id); setTab('Formulas'); setShowFormulaForm(true); } : undefined}
                            className={clsx('w-6 h-6 rounded-full flex items-center justify-center', hasProduct ? 'hover:bg-[#e7dfce]' : 'opacity-30 cursor-not-allowed')}
                          >🧬</button>
                          {q.status === 'pending' && (
                            <button title="▶ Start working on this query" onClick={() => startQueryMutation.mutate(q._id)} className="w-6 h-6 rounded-full hover:bg-[#e7dfce] flex items-center justify-center">▶️</button>
                          )}
                        </div>
                      )}
                      {q.status === 'answered' && (
                        <button title="🔒 Customer satisfied — close this query" onClick={() => closeQueryMutation.mutate(q._id)} className="w-6 h-6 rounded-full hover:bg-[#e7dfce] flex items-center justify-center">✔️</button>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-[#2e241b]">{q.title}</p>
                    <p className="text-sm text-[#6d5f4c]">{q.description}</p>
                    {(q.contactName || q.contactEmail || q.targetPrice || q.benchmarkNotes || q.packagingIntent || q.internalNotes) && (
                      <div className="text-[11px] text-[#6d5f4c] bg-[#e7dfce] rounded-lg p-2 space-y-0.5">
                        {q.contactName && <p>Contact: <span className="text-[#2e241b] font-medium">{q.contactName}</span>{q.contactEmail && ` · ${q.contactEmail}`}</p>}
                        {q.targetPrice > 0 && <p>Target price: ₹{q.targetPrice.toLocaleString('en-IN')}/unit</p>}
                        {q.packagingIntent && <p>Packaging: {q.packagingIntent}</p>}
                        {q.benchmarkNotes && <p>Benchmark: {q.benchmarkNotes}</p>}
                        {q.internalNotes && <p className="italic">Internal: {q.internalNotes}</p>}
                      </div>
                    )}
                    {q.answer ? (
                      <div className={clsx('p-2 rounded-lg text-sm text-[#2e241b]', PILL.success)}>
                        <p className="text-[11px] text-[#3a5f3c] font-semibold mb-0.5">
                          {q.answeredBy ? `${q.answeredBy.firstName} ${q.answeredBy.lastName}` : 'Answered'}
                        </p>
                        {q.answer}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <input
                          value={replyDrafts[q._id] || ''}
                          onChange={(e) => setReplyDrafts((d) => ({ ...d, [q._id]: e.target.value }))}
                          placeholder="Type a reply…"
                          className={clsx(inputCls, 'flex-1')}
                        />
                        <button
                          onClick={() => {
                            const answer = (replyDrafts[q._id] || '').trim();
                            if (!answer) { toast.error('Reply cannot be empty'); return; }
                            replyMutation.mutate({ queryId: q._id, answer });
                          }}
                          disabled={replyMutation.isPending}
                          className={accentBtn}
                        >
                          Reply
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              <QaConversationSummary
                queries={queries}
                leadName={lead?.name || 'This customer'}
                onCreateProduct={() => { setTab('Products'); setProductModalEditing(null); setProductModalOpen(true); }}
                onMakeSample={() => { setTab('Samples'); setShowSampleForm(true); }}
                onStartFormula={() => { setTab('Formulas'); setShowFormulaForm(true); }}
              />
            </div>
          )}

          {!isLoading && tab === 'Products' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-[#968871] uppercase tracking-wide">{products.length} linked</p>
                <button onClick={() => { setProductModalEditing(null); setProductModalOpen(true); }} className={outlineBtn}>➕ Link Product</button>
              </div>

              {products.length === 0 && <p className="text-sm text-[#968871] text-center py-6">No products linked yet — link a catalogue product, pricing then flows Quote → Accept.</p>}

              {products.length > 0 && (
                <div className="overflow-x-auto rounded-[10px] border border-[#e2dac8]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wide text-[#6d5f4c] border-b border-[#d3c9b4] bg-[#e7dfce]">
                        <th className="px-3 py-2">Product ID</th><th className="px-3 py-2">Basis</th><th className="px-3 py-2">Approx Price</th>
                        <th className="px-3 py-2">Price Status</th><th className="px-3 py-2">Payment</th><th className="px-3 py-2 w-28">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((p) => (
                        <tr key={p.productId} className="border-b border-[#e2dac8]">
                          <td className="px-3 py-2 cursor-pointer" title="Edit product link" onClick={() => { setProductModalEditing(p); setProductModalOpen(true); }}>
                            <span className="font-mono text-xs text-[#6d5f4c]">{p.productId}</span><p className="text-[#2e241b] font-medium">{p.name}</p>
                          </td>
                          <td className="px-3 py-2 text-xs text-[#6d5f4c]">{p.basis || '—'}</td>
                          <td className="px-3 py-2 text-xs text-[#2e241b]">{p.approxPrice > 0 ? `₹${p.approxPrice.toLocaleString('en-IN')}` : '—'}</td>
                          <td className="px-3 py-2">
                            <span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded-full',
                              p.priceStatus === 'Accepted' ? PILL.success : p.priceStatus === 'Quoted' ? PILL.info : PILL.gray)}>
                              {p.priceStatus || 'Not quoted'}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded-full', p.paymentStatus === 'full_paid' ? PILL.success : PILL.warning)}>
                              {p.paymentStatus === 'full_paid' ? '✓ Paid' : '⏳ Pending'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            <button title="💰 Quote Price" onClick={() => setQuoteModalFor(p)} className="mr-2">💰</button>
                            {p.priceStatus === 'Quoted' && (
                              <button title="✓ Accept Price" onClick={() => updateProductMutation.mutate({ productId: p.productId, priceStatus: 'Accepted' })} className="mr-2">✓</button>
                            )}
                            <button title="Paid in CRM (mirror)" onClick={() => updateProductMutation.mutate({ productId: p.productId, paymentStatus: p.paymentStatus === 'full_paid' ? 'pending' : 'full_paid' })} className="mr-2">💳</button>
                            <button title="Edit" onClick={() => { setProductModalEditing(p); setProductModalOpen(true); }}>✏️</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {!isLoading && tab === 'Formulas' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-[#968871] uppercase tracking-wide">{formulas.length} custom formula(s)</p>
                <div className="flex items-center gap-2">
                  <button onClick={() => { setShowLinkFormulaPicker((v) => !v); setShowFormulaForm(false); }} className={outlineBtn}>🔗 Link from Catalog</button>
                  <button onClick={() => { setShowFormulaForm((v) => !v); setShowLinkFormulaPicker(false); }} className={outlineBtn}>+ New Custom Formula</button>
                </div>
              </div>

              {showLinkFormulaPicker && (
                <div className="p-3 rounded-[10px] border-[1.5px] border-dashed border-[#d3c9b4] bg-[#e7dfce] space-y-2">
                  <input
                    value={linkFormulaSearch}
                    onChange={(e) => setLinkFormulaSearch(e.target.value)}
                    placeholder="Search Product Catalog…"
                    className={clsx(inputCls, 'w-full')}
                  />
                  <div className="rounded-[10px] border border-[#d3c9b4] bg-[#f0eadd] max-h-40 overflow-y-auto">
                    {linkFormulaMatches.length === 0 && <div className="px-3 py-2 text-xs text-[#968871]">No catalog product found.</div>}
                    {linkFormulaMatches.slice(0, 8).map((p) => (
                      <button key={p._id} type="button"
                        onClick={() => linkFormulaMutation.mutate(p)}
                        disabled={linkFormulaMutation.isPending}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-[#e7dfce] flex justify-between disabled:opacity-50">
                        <span className="text-[#2e241b]">{p.name}</span>
                        <span className="text-[#968871] font-mono">{p.code}</span>
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-[#968871]">Copies the catalog product's current Formulation &amp; Procedure into a new editable custom formula (V1), then opens the Formula Editor — a one-time copy, won't stay synced if the catalog formula changes later.</p>
                </div>
              )}

              {formulas.length === 0 && <p className="text-sm text-[#968871] text-center py-6">No custom formulas yet.</p>}

              {formulas.length > 0 && (
                <div className="overflow-x-auto rounded-[10px] border border-[#e2dac8]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wide text-[#6d5f4c] border-b border-[#d3c9b4] bg-[#e7dfce]">
                        <th className="px-3 py-2">Formula ID</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Product Link</th>
                        <th className="px-3 py-2">Current V</th><th className="px-3 py-2">Version Status</th><th className="px-3 py-2">Cost/Unit</th><th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {formulas.map((f) => {
                        const latest = f.versions[f.versions.length - 1];
                        return (
                          <tr key={f.formulaId} className="border-b border-[#e2dac8] cursor-pointer hover:bg-[#e7dfce]/60" onClick={() => setEditorFormulaId(f.formulaId)}>
                            <td className="px-3 py-2 font-mono text-xs text-[#6d5f4c]">{f.formulaId}</td>
                            <td className="px-3 py-2 text-[#2e241b] font-medium">{f.name}</td>
                            <td className="px-3 py-2 text-xs text-[#968871]">
                              {f.catalogProductId && <span title="Linked from Product Catalog" className="mr-1">🔗</span>}
                              {f.productLink || '—'}
                            </td>
                            <td className="px-3 py-2 text-xs">V{f.currentVersion}</td>
                            <td className="px-3 py-2">
                              <span className={clsx('text-[10px] font-semibold rounded-full px-2 py-0.5', formulaVersionPillCls(latest?.status))}>{latest?.status}</span>
                            </td>
                            <td className="px-3 py-2 text-xs">
                              ₹{(latest?.costPerUnit || 0).toFixed(2)}
                              {latest?.rows?.length > 0 && <p className="text-[10px] text-[#968871]">{latest.rows.length} ingredient(s)</p>}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <button onClick={(e) => { e.stopPropagation(); setEditorFormulaId(f.formulaId); }} className={textLink}>✏️ Open Editor</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {editorFormulaId && formulas.find((f) => f.formulaId === editorFormulaId) && (
                <FormulaEditorModal
                  key={editorFormulaId}
                  formula={formulas.find((f) => f.formulaId === editorFormulaId)}
                  samples={samples}
                  rawMaterials={rawMaterials}
                  saving={updateFormulaMutation.isPending}
                  onClose={() => setEditorFormulaId(null)}
                  onSaveVersion={(payload) => updateFormulaMutation.mutate({ formulaId: editorFormulaId, ...payload })}
                  onArchiveVersion={(version) => updateFormulaMutation.mutate({ formulaId: editorFormulaId, version, status: 'Archived' })}
                  onCloneVersion={(payload) => updateFormulaMutation.mutate({ formulaId: editorFormulaId, bumpVersion: true, ...payload })}
                />
              )}
            </div>
          )}

          {!isLoading && tab === 'Samples' && !openSample && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-[#968871] uppercase tracking-wide">{samples.length} sample(s)</p>
                <button onClick={() => setShowSampleForm(true)} className={outlineBtn}>➕ Request New Sample</button>
              </div>

              {!isPaid && (
                <p className="text-[11px] text-[#7a5a10]">🔒 Confirm the R&D/sampling fee in the Payments tab before this sample can move past "Requested".</p>
              )}

              {samples.length === 0 && <p className="text-sm text-[#968871] text-center py-6">No samples yet.</p>}

              {samples.length > 0 && (
                <div className="overflow-x-auto rounded-[10px] border border-[#e2dac8]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wide text-[#6d5f4c] border-b border-[#d3c9b4] bg-[#e7dfce]">
                        <th className="px-3 py-2">Sample ID</th><th className="px-3 py-2">Formula/Version</th><th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Days in Stage</th><th className="px-3 py-2">Courier</th><th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {samples.map((s) => {
                        const formula = formulas.find((f) => f.formulaId === s.formulaId);
                        const lastEvent = s.timeline?.[s.timeline.length - 1];
                        return (
                          <tr key={s.sampleId} className="border-b border-[#e2dac8]">
                            <td className="px-3 py-2">
                              <p className="font-mono text-xs text-[#2e241b] font-medium">{s.sampleId}</p>
                              {s.chainedFrom && <p className="text-[10px] text-[#968871]">↻ from {s.chainedFrom}</p>}
                            </td>
                            <td className="px-3 py-2 text-xs text-[#6d5f4c]">
                              {s.formulaId ? `${s.formulaId}${s.formulaVersionNo ? ` V${s.formulaVersionNo}` : ''}` : '—'}
                              {formula && <p className="text-[10px] text-[#968871]">{formula.name}</p>}
                            </td>
                            <td className="px-3 py-2"><span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded-full', SUB_STAGE_PILL[s.status])}>{s.status}</span></td>
                            <td className="px-3 py-2 text-xs">{lastEvent ? formatDistanceToNowStrict(new Date(lastEvent.at)) : '—'}</td>
                            <td className="px-3 py-2 text-xs text-[#6d5f4c]">{s.courier || '—'}</td>
                            <td className="px-3 py-2 text-right">
                              <button onClick={() => setOpenSampleId(s.sampleId)} className={textLink}>View ▸</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {!isLoading && tab === 'Samples' && openSample && (
            <div className="space-y-4">
              <button onClick={() => setOpenSampleId(null)} className={textLink}>← Back to samples</button>

              <div>
                <p className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1">Traceability Chain</p>
                <div className="flex items-center gap-1.5 flex-wrap text-xs">
                  <span className={clsx('px-2 py-1 rounded-lg font-mono', PILL.gray)}>{lead?.name}</span>
                  <span className="text-[#968871]">→</span>
                  {openSample.queryId && <><span className={clsx('px-2 py-1 rounded-lg font-mono', PILL.gray)}>Query</span><span className="text-[#968871]">→</span></>}
                  {openSample.formulaId && <><span className={clsx('px-2 py-1 rounded-lg font-mono', PILL.gray)}>{openSample.formulaId}{openSample.formulaVersionNo ? ` · V${openSample.formulaVersionNo}` : ''}</span><span className="text-[#968871]">→</span></>}
                  <span className="px-2 py-1 rounded-lg bg-[#f2b23e] text-[#2e241b] font-mono font-semibold">{openSample.sampleId}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className={clsx('text-xs font-semibold px-2.5 py-1 rounded-full', SUB_STAGE_PILL[openSample.status])}>{openSample.status}</span>
                {SUB_STAGES.filter((s) => s !== openSample.status).map((s) => {
                  const locked = s !== 'Requested' && !isPaid;
                  return (
                    <button
                      key={s}
                      disabled={locked || sampleStatusMutation.isPending}
                      onClick={() => {
                        if (locked) return;
                        if (s === 'Sent') { setCourierModalFor(openSample.sampleId); setCourierName(openSample.courier || ''); setCourierAwb(openSample.awb || ''); setCourierSentDate(new Date().toISOString().slice(0, 10)); return; }
                        if (s === 'Feedback') { setFeedbackModalFor(openSample.sampleId); setFeedbackModalText(''); return; }
                        if (s === 'Approved') { setApproveModalFor(openSample.sampleId); setApprovePackaging(!!openSample.packagingConfirmed); return; }
                        if (s === 'Rejected') { setRejectModalFor(openSample.sampleId); setRejectReasonModal(''); setRejectCloneFollowUp(true); return; }
                        sampleStatusMutation.mutate({ sampleId: openSample.sampleId, status: s });
                      }}
                      className={clsx('text-xs font-semibold px-2.5 py-1 rounded-full border-[1.5px] transition-colors', locked ? 'opacity-30 cursor-not-allowed border-[#d3c9b4] text-[#968871]' : 'border-[#d3c9b4] hover:border-[#968871] text-[#6d5f4c] hover:text-[#2e241b]')}
                    >
                      {locked ? '🔒 ' : ''}{s}
                    </button>
                  );
                })}
              </div>
              {openSample.status === 'Rejected' && openSample.rejectionReason && (
                <p className="text-xs text-[#8c3a30]">Reason: {openSample.rejectionReason}{openSample.rejectedByContact && ` — rejected by ${openSample.rejectedByContact}`}</p>
              )}
              {openSample.status === 'Approved' && openSample.approvedByContact && (
                <p className="text-xs text-[#3a5f3c]">Approved by {openSample.approvedByContact}</p>
              )}
              {openSample.status === 'Rejected' && (
                <button
                  onClick={() => { setTab('Samples'); setOpenSampleId(null); setSampleChainSeed({ chainedFrom: openSample.sampleId, formulaId: openSample.formulaId || '' }); setShowSampleForm(true); }}
                  className={textLink}
                >
                  + Create next version (chained)
                </button>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-2">Courier</p>
                    {openSample.sentAt ? (
                      <div className="text-sm text-[#2e241b] space-y-0.5">
                        <p>{openSample.courier || '—'}{openSample.awb && <span className="text-xs text-[#968871]"> · AWB {openSample.awb}</span>}</p>
                        <p className="text-xs text-[#968871]">Sent {format(new Date(openSample.sentAt), 'dd MMM yyyy')}</p>
                      </div>
                    ) : (
                      <p className="text-xs text-[#968871]">Not dispatched yet — move this sample to "Sent" to record courier details.</p>
                    )}
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-2">Confirmation</p>
                    <label className="flex items-center gap-2 text-sm text-[#4a3a29]">
                      <input type="checkbox" checked={openSample.packagingConfirmed} onChange={(e) => updateSampleMutation.mutate({ sampleId: openSample.sampleId, packagingConfirmed: e.target.checked })} />
                      Packaging confirmed by customer
                    </label>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-2">Lab Notes</p>
                    <textarea
                      defaultValue={openSample.notes || ''}
                      onBlur={(e) => { if (e.target.value !== (openSample.notes || '')) updateSampleMutation.mutate({ sampleId: openSample.sampleId, notes: e.target.value }); }}
                      placeholder="Lab notes for this sample…"
                      rows={2}
                      className={clsx(inputCls, 'w-full')}
                    />
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-2">Feedback Log</p>
                    <div className="space-y-2 mb-2">
                      {(openSample.feedbackLog || []).map((f, i) => (
                        <div key={i} className="p-2 rounded-lg bg-[#e7dfce] text-xs">
                          <p className="font-semibold text-[#4a3a29]">{f.by} · {format(new Date(f.at), 'dd MMM, hh:mm a')}</p>
                          <p className="text-[#6d5f4c]">{f.text}</p>
                        </div>
                      ))}
                      {(!openSample.feedbackLog || openSample.feedbackLog.length === 0) && <p className="text-xs text-[#968871]">No feedback logged yet.</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <input value={feedbackDraft} onChange={(e) => setFeedbackDraft(e.target.value)} placeholder="Log customer feedback…" className={clsx(inputCls, 'flex-1')} />
                      <button
                        onClick={() => { if (!feedbackDraft.trim()) { toast.error('Feedback cannot be empty'); return; } feedbackMutation.mutate({ sampleId: openSample.sampleId, text: feedbackDraft.trim() }); }}
                        disabled={feedbackMutation.isPending}
                        className={accentBtn}
                      >
                        Log
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-2">Timeline</p>
                  <div className="space-y-2">
                    {[...(openSample.timeline || [])].reverse().map((t, i) => (
                      <div key={i} className="text-xs border-l-2 border-[#d3c9b4] pl-2">
                        <p className="font-semibold text-[#4a3a29]">{t.event}</p>
                        <p className="text-[#968871]">{format(new Date(t.at), 'dd MMM yyyy, hh:mm a')}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {!isLoading && tab === 'Payments' && (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-2">R&D / Sampling Payment</p>
                <div className="flex items-center gap-2">
                  <span className={clsx('px-2.5 py-1 rounded-full text-xs font-semibold', isPaid ? PILL.success : PILL.warning)}>
                    {isPaid ? 'R&D fee paid' : 'R&D fee pending'}
                  </span>
                  <span className="text-xs text-[#968871]">₹{(sd.chargeAmount || 0).toLocaleString('en-IN')}</span>
                  {isPaid && (
                    <button onClick={() => paymentMutation.mutate({ paymentStatus: 'pending' })} disabled={paymentMutation.isPending}
                      className={clsx(textLink, 'ml-auto')}>
                      Revoke payment
                    </button>
                  )}
                </div>
                {!isPaid && <p className="text-[11px] text-[#7a5a10] mt-1">Every sample for this customer stays locked at "Requested" until this is confirmed.</p>}
              </div>

              {!isPaid ? (
                <div className="p-3 rounded-[10px] border-[1.5px] border-dashed border-[#d3c9b4] bg-[#e7dfce] space-y-2">
                  <p className="text-xs font-semibold text-[#6d5f4c]">Enter payment details</p>
                  <div className="grid grid-cols-2 gap-2">
                    <select value={payMode} onChange={(e) => setPayMode(e.target.value)} className={inputCls}>
                      <option value="upi">UPI</option>
                      <option value="cash">Cash</option>
                      <option value="bank_transfer">Bank Transfer</option>
                    </select>
                    <input value={payTxnRef} onChange={(e) => setPayTxnRef(e.target.value)} placeholder="Txn / Ref No." className={inputCls} />
                    <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className={inputCls} />
                    <input value={payReceivedBy} onChange={(e) => setPayReceivedBy(e.target.value)} placeholder="Received by" className={inputCls} />
                  </div>
                  <textarea value={payNotes} onChange={(e) => setPayNotes(e.target.value)} placeholder="Notes (optional)…" rows={2} className={clsx(inputCls, 'w-full')} />
                  <button
                    onClick={() => paymentMutation.mutate({
                      paymentStatus: 'full_paid', paymentMode: payMode,
                      paymentTxnRef: payTxnRef.trim() || undefined, paidAt: payDate || undefined,
                      receivedBy: payReceivedBy.trim() || undefined, paymentNotes: payNotes.trim() || undefined,
                    })}
                    disabled={paymentMutation.isPending}
                    className={clsx(accentBtn, 'ml-auto')}
                  >
                    {paymentMutation.isPending ? 'Confirming…' : '✅ Confirm Payment'}
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 text-sm p-3 rounded-[10px] bg-[#e7dfce]">
                  <div><p className="text-xs text-[#968871] mb-0.5">Mode</p><p className="text-[#2e241b] capitalize">{(sd.paymentMode || '—').replace('_', ' ')}</p></div>
                  <div><p className="text-xs text-[#968871] mb-0.5">Txn / Ref No.</p><p className="text-[#2e241b]">{sd.paymentTxnRef || '—'}</p></div>
                  <div><p className="text-xs text-[#968871] mb-0.5">Paid on</p><p className="text-[#2e241b]">{sd.paidAt ? format(new Date(sd.paidAt), 'dd MMM yyyy') : '—'}</p></div>
                  <div><p className="text-xs text-[#968871] mb-0.5">Received by</p><p className="text-[#2e241b]">{sd.receivedBy || '—'}</p></div>
                  {sd.paymentNotes && <div className="col-span-2"><p className="text-xs text-[#968871] mb-0.5">Notes</p><p className="text-[#2e241b]">{sd.paymentNotes}</p></div>}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-[#968871] mb-0.5">Courier</p><p className="text-[#2e241b]">{sd.courier || '—'}</p></div>
                <div><p className="text-xs text-[#968871] mb-0.5">Sent date</p><p className="text-[#2e241b]">{sd.sentDate ? format(new Date(sd.sentDate), 'dd MMM yyyy') : '—'}</p></div>
              </div>

              {products.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-2">Per-product payment</p>
                  <div className="space-y-1.5">
                    {products.map((p) => (
                      <div key={p.productId} className="flex items-center justify-between text-sm p-2 rounded-lg bg-[#e7dfce]">
                        <span className="text-[#2e241b]">{p.name} <span className="text-xs text-[#968871] font-mono">{p.productId}</span></span>
                        <span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded-full', p.paymentStatus === 'full_paid' ? PILL.success : PILL.warning)}>
                          {p.paymentStatus === 'full_paid' ? 'Paid' : 'Pending'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {!isLoading && tab === 'Approvals' && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-[#968871] uppercase tracking-wide">Approved → Production ({approvedSamples.length})</p>
              {approvedSamples.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-sm text-[#968871]">No approved samples yet</p>
                  <p className="text-xs text-[#968871] mt-1">Approve a sample in the Samples tab to unlock the move to Production.</p>
                </div>
              )}
              {approvedSamples.length > 0 && !lead?.productionOrderId && (
                <div className="p-3 rounded-[10px] border bg-[#dce9d4] border-[#b9d2af] flex items-center justify-between gap-3">
                  <p className="text-xs text-[#3a5f3c]">Ready to hand off — pick the catalog product and this moves the lead to Production and creates the Batch Tracker order in one step.</p>
                  <button
                    onClick={() => { setShowMoveModal(true); setMoveSelectedCatalogProduct(null); setMoveCatalogSearch(''); setMoveBatchSizeKg(10); }}
                    className={clsx(accentBtn, 'flex-shrink-0')}
                  >
                    Move to Production →
                  </button>
                </div>
              )}
              {approvedSamples.map((s) => (
                <div key={s.sampleId} className={clsx('flex items-center justify-between p-3 rounded-[10px] border', 'bg-[#dce9d4] border-[#b9d2af]')}>
                  <div>
                    <p className="text-sm font-semibold text-[#2e241b]">{s.sampleId}{s.formulaVersionNo && <span className="text-xs text-[#968871]"> V{s.formulaVersionNo}</span>}</p>
                    <p className="text-xs text-[#6d5f4c]">{s.formulaId || 'No formula linked'}</p>
                  </div>
                  {lead?.productionOrderId ? (
                    <span className="text-xs font-semibold text-[#33526b]">{lead.productionOrderId.orderNumber}</span>
                  ) : (
                    <span className="text-xs text-[#3a5f3c] font-semibold">{lead?.status === 'In Progress' ? 'In Production queue' : 'Approved'}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showEditKyc && lead && <EditKycModal lead={lead} onClose={() => { setShowEditKyc(false); invalidate(); }} />}

      {productModalOpen && (
        <ProductLinkModal
          product={productModalEditing}
          catalogProducts={catalogProducts}
          saving={linkProductMutation.isPending || updateProductMutation.isPending || autoLinkFormulaMutation.isPending || deleteProductMutation.isPending}
          onClose={() => { setProductModalOpen(false); setProductModalEditing(null); }}
          onRemove={(productId) => deleteProductMutation.mutate(productId)}
          onSave={(payload) => {
            if (productModalEditing) {
              updateProductMutation.mutate({ productId: productModalEditing.productId, name: payload.name, basis: payload.basis, notes: payload.notes });
            } else {
              const catalogProduct = payload.catalogProductId ? (catalogProducts || []).find((p) => p._id === payload.catalogProductId) : null;
              const alreadyLinked = catalogProduct && formulas.some((f) => String(f.catalogProductId) === String(catalogProduct._id));
              linkProductMutation.mutate(payload, {
                onSuccess: () => {
                  if (catalogProduct && !alreadyLinked) autoLinkFormulaMutation.mutate(catalogProduct);
                },
              });
            }
          }}
        />
      )}

      {quoteModalFor && (
        <QuotePriceModal
          product={quoteModalFor}
          saving={updateProductMutation.isPending}
          onClose={() => setQuoteModalFor(null)}
          onSave={({ approxPrice, note }) => {
            updateProductMutation.mutate({
              productId: quoteModalFor.productId,
              priceStatus: 'Quoted',
              approxPrice,
              notes: note ? `${quoteModalFor.notes ? quoteModalFor.notes + ' | ' : ''}${note}` : undefined,
            });
          }}
        />
      )}

      {showFormulaForm && (
        <NewFormulaModal
          saving={createFormulaMutation.isPending}
          onClose={() => setShowFormulaForm(false)}
          onSave={(payload) => createFormulaMutation.mutate(payload)}
        />
      )}

      {showSampleForm && (
        <NewSampleModal
          formulas={formulas}
          isPaid={isPaid}
          saving={createSampleMutation.isPending}
          chainedFrom={sampleChainSeed?.chainedFrom}
          initialFormulaId={sampleChainSeed?.formulaId}
          onClose={() => { setShowSampleForm(false); setSampleChainSeed(null); }}
          onGoToPayments={() => { setShowSampleForm(false); setSampleChainSeed(null); setTab('Payments'); }}
          onSave={(payload) => { createSampleMutation.mutate({ ...payload, queryId: qaConvertQueryId || undefined }); setSampleChainSeed(null); }}
        />
      )}

      {showMoveModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={bodyFont}>
          <div className="absolute inset-0 bg-[#2e241b]/50 backdrop-blur-sm" onClick={() => setShowMoveModal(false)} />
          <div className="relative bg-[#f0eadd] rounded-2xl shadow-[0_10px_40px_rgba(46,36,27,0.16)] w-full max-w-md border border-[#d3c9b4]">
            <div className="p-5 border-b border-[#e2dac8] bg-[#e7dfce] rounded-t-2xl">
              <h3 className="font-bold text-[#2e241b]" style={displayFont}>🏭 Move to Production</h3>
              <p className="text-xs text-[#6d5f4c] mt-0.5">{lead?.name} — moves the lead to Production and creates the Batch Tracker order together.</p>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1 block">Catalog product</label>
                <input
                  value={moveSelectedCatalogProduct ? moveSelectedCatalogProduct.name : moveCatalogSearch}
                  onChange={(e) => { setMoveCatalogSearch(e.target.value); setMoveSelectedCatalogProduct(null); }}
                  placeholder="Search catalog products…"
                  className={clsx(inputCls, 'w-full bg-white')}
                />
                {moveCatalogSearch && !moveSelectedCatalogProduct && (
                  <div className="mt-1 rounded-[10px] border border-[#d3c9b4] bg-white max-h-32 overflow-y-auto">
                    {moveCatalogMatches.length === 0 && <div className="px-3 py-2 text-xs text-[#968871]">No products found</div>}
                    {moveCatalogMatches.slice(0, 8).map((p) => (
                      <button key={p._id} type="button" onClick={() => { setMoveSelectedCatalogProduct(p); setMoveCatalogSearch(''); }}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-[#e7dfce] flex justify-between">
                        <span className="text-[#2e241b]">{p.name}</span>
                        <span className="text-[#968871] font-mono">{p.code}</span>
                      </button>
                    ))}
                  </div>
                )}
                {moveSelectedCatalogProduct && (
                  <p className="text-[11px] text-[#968871] mt-1">{moveSelectedCatalogProduct.formulation?.rows?.length || 0} ingredient(s) in formulation</p>
                )}
              </div>
              <div>
                <label className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1 block">Batch size (kg)</label>
                <input type="number" min="0.1" step="0.1" value={moveBatchSizeKg} onChange={(e) => setMoveBatchSizeKg(e.target.value)}
                  className={clsx(inputCls, 'w-full bg-white')} />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowMoveModal(false)} className={clsx(outlineBtn, 'flex-1 justify-center')}>Cancel</button>
                <button
                  onClick={() => {
                    if (!moveSelectedCatalogProduct) { toast.error('Select a catalog product'); return; }
                    if (!moveBatchSizeKg || Number(moveBatchSizeKg) <= 0) { toast.error('Enter a valid batch size'); return; }
                    moveToProductionMutation.mutate({ catalogProduct: moveSelectedCatalogProduct._id, batchSizeKg: Number(moveBatchSizeKg) });
                  }}
                  disabled={moveToProductionMutation.isPending}
                  className={clsx(accentBtn, 'flex-1 justify-center')}
                >
                  {moveToProductionMutation.isPending ? 'Moving…' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {courierModalFor && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={bodyFont}>
          <div className="absolute inset-0 bg-[#2e241b]/50 backdrop-blur-sm" onClick={() => setCourierModalFor(null)} />
          <div className="relative bg-[#f0eadd] rounded-2xl shadow-[0_10px_40px_rgba(46,36,27,0.16)] w-full max-w-md border border-[#d3c9b4]">
            <div className="p-5 border-b border-[#e2dac8] bg-[#e7dfce] rounded-t-2xl">
              <h3 className="font-bold text-[#2e241b]" style={displayFont}>🚚 Dispatch Sample</h3>
              <p className="text-xs text-[#6d5f4c] mt-0.5">{courierModalFor} — record courier details to mark this sample Sent.</p>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1 block">Courier name</label>
                <input value={courierName} onChange={(e) => setCourierName(e.target.value)} placeholder="BlueDart / Delhivery…" className={clsx(inputCls, 'w-full bg-white')} />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1 block">Docket / AWB no.</label>
                <input value={courierAwb} onChange={(e) => setCourierAwb(e.target.value)} placeholder="AWB number" className={clsx(inputCls, 'w-full bg-white')} />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1 block">Sent date</label>
                <input type="date" value={courierSentDate} onChange={(e) => setCourierSentDate(e.target.value)} className={clsx(inputCls, 'w-full bg-white')} />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setCourierModalFor(null)} className={clsx(outlineBtn, 'flex-1 justify-center')}>Cancel</button>
                <button
                  onClick={() => {
                    if (!courierName.trim() || !courierAwb.trim()) { toast.error('Courier name and AWB are required'); return; }
                    dispatchMutation.mutate({ sampleId: courierModalFor, courier: courierName.trim(), awb: courierAwb.trim(), sentAt: courierSentDate ? new Date(courierSentDate).toISOString() : new Date().toISOString() });
                  }}
                  disabled={dispatchMutation.isPending}
                  className={clsx(accentBtn, 'flex-1 justify-center')}
                >
                  {dispatchMutation.isPending ? 'Dispatching…' : 'Mark as Sent'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {feedbackModalFor && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={bodyFont}>
          <div className="absolute inset-0 bg-[#2e241b]/50 backdrop-blur-sm" onClick={() => setFeedbackModalFor(null)} />
          <div className="relative bg-[#f0eadd] rounded-2xl shadow-[0_10px_40px_rgba(46,36,27,0.16)] w-full max-w-md border border-[#d3c9b4]">
            <div className="p-5 border-b border-[#e2dac8] bg-[#e7dfce] rounded-t-2xl">
              <h3 className="font-bold text-[#2e241b]" style={displayFont}>💬 Log Customer Feedback</h3>
              <p className="text-xs text-[#6d5f4c] mt-0.5">{feedbackModalFor} — moves this sample to "Feedback".</p>
            </div>
            <div className="p-5 space-y-3">
              <textarea value={feedbackModalText} onChange={(e) => setFeedbackModalText(e.target.value)} rows={4} placeholder="What did the customer say?" className={clsx(inputCls, 'w-full bg-white')} />
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setFeedbackModalFor(null)} className={clsx(outlineBtn, 'flex-1 justify-center')}>Cancel</button>
                <button
                  onClick={() => {
                    if (!feedbackModalText.trim()) { toast.error('Feedback cannot be empty'); return; }
                    feedbackTransitionMutation.mutate({ sampleId: feedbackModalFor, text: feedbackModalText.trim() });
                  }}
                  disabled={feedbackTransitionMutation.isPending}
                  className={clsx(accentBtn, 'flex-1 justify-center')}
                >
                  {feedbackTransitionMutation.isPending ? 'Saving…' : 'Log & Move to Feedback'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {approveModalFor && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={bodyFont}>
          <div className="absolute inset-0 bg-[#2e241b]/50 backdrop-blur-sm" onClick={() => setApproveModalFor(null)} />
          <div className="relative bg-[#f0eadd] rounded-2xl shadow-[0_10px_40px_rgba(46,36,27,0.16)] w-full max-w-md border border-[#d3c9b4]">
            <div className="p-5 border-b border-[#e2dac8] bg-[#e7dfce] rounded-t-2xl">
              <h3 className="font-bold text-[#2e241b]" style={displayFont}>✅ Approve Sample</h3>
              <p className="text-xs text-[#6d5f4c] mt-0.5">
                {approveModalFor}
                {samples.find((s) => s.sampleId === approveModalFor)?.formulaId ? ' — the linked formula version will be marked Accepted.' : ''}
              </p>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1 block">Approved by (customer contact, optional)</label>
                <input value={approveContactName} onChange={(e) => setApproveContactName(e.target.value)} placeholder="e.g. Priya Menon (Nykaa)" className={clsx(inputCls, 'w-full bg-white')} />
              </div>
              <label className="flex items-center gap-2 text-sm text-[#4a3a29]">
                <input type="checkbox" checked={approvePackaging} onChange={(e) => setApprovePackaging(e.target.checked)} />
                Packaging confirmed by customer
              </label>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setApproveModalFor(null)} className={clsx(outlineBtn, 'flex-1 justify-center')}>Cancel</button>
                <button
                  onClick={() => {
                    const s = samples.find((x) => x.sampleId === approveModalFor);
                    approveMutation.mutate({ sampleId: approveModalFor, packagingConfirmed: approvePackaging, formulaId: s?.formulaId, approvedByContact: approveContactName.trim() });
                  }}
                  disabled={approveMutation.isPending}
                  className={clsx(accentBtn, 'flex-1 justify-center')}
                >
                  {approveMutation.isPending ? 'Approving…' : 'Confirm Approve'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {rejectModalFor && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={bodyFont}>
          <div className="absolute inset-0 bg-[#2e241b]/50 backdrop-blur-sm" onClick={() => setRejectModalFor(null)} />
          <div className="relative bg-[#f0eadd] rounded-2xl shadow-[0_10px_40px_rgba(46,36,27,0.16)] w-full max-w-md border border-[#d3c9b4]">
            <div className="p-5 border-b border-[#e2dac8] bg-[#e7dfce] rounded-t-2xl">
              <h3 className="font-bold text-[#2e241b]" style={displayFont}>✕ Reject Sample</h3>
              <p className="text-xs text-[#6d5f4c] mt-0.5">{rejectModalFor}</p>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1 block">Rejection reason</label>
                <textarea value={rejectReasonModal} onChange={(e) => setRejectReasonModal(e.target.value)} rows={3} placeholder="Why was this sample rejected?" className={clsx(inputCls, 'w-full bg-white')} />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1 block">Rejected by (customer contact, optional)</label>
                <input value={rejectContactName} onChange={(e) => setRejectContactName(e.target.value)} placeholder="e.g. Priya Menon (Nykaa)" className={clsx(inputCls, 'w-full bg-white')} />
              </div>
              <label className="flex items-center gap-2 text-sm text-[#4a3a29]">
                <input type="checkbox" checked={rejectCloneFollowUp} onChange={(e) => setRejectCloneFollowUp(e.target.checked)} />
                Clone formula to a new version &amp; create a follow-up sample
              </label>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setRejectModalFor(null)} className={clsx(outlineBtn, 'flex-1 justify-center')}>Cancel</button>
                <button
                  onClick={() => {
                    if (!rejectReasonModal.trim()) { toast.error('Reason required'); return; }
                    const s = samples.find((x) => x.sampleId === rejectModalFor);
                    rejectMutation.mutate({ sampleId: rejectModalFor, rejectionReason: rejectReasonModal.trim(), cloneFollowUp: rejectCloneFollowUp, formulaId: s?.formulaId, rejectedByContact: rejectContactName.trim() });
                  }}
                  disabled={rejectMutation.isPending}
                  className={clsx(accentBtn, 'flex-1 justify-center')}
                >
                  {rejectMutation.isPending ? 'Rejecting…' : 'Confirm Reject'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
