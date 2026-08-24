import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, formatDistanceToNowStrict } from 'date-fns';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import { FONT_IMPORT, PILL, SUB_STAGE_PILL, StatCard } from './sampleTheme';
import { customerId } from '../../utils/leadHelpers';
import EditKycModal from './EditKycModal';
import { CreateCatalogProductModal } from './CreateCatalogProductModal';
import NewOrderModal from './production/NewOrderModal';
import {
  StageOrder, StageWorkAssignment, StageProcurement, StageWeighing,
  StageBulkQC, StagePackaging, StageFinalQC, StageDispatch, STAGE_NAMES,
} from './production/StageSteps';

// Full per-lead "Sample Development" window — mirrors the reference design's 7-tab customer
// window (Overview / Q&A / Products / Formulas / Samples / Payments / Approvals). Everything
// here reads/writes the same Lead record; customFormulas, productLinks and samples are new
// embedded arrays on Lead (see backero-backend/src/models/Lead.js), samples are versioned and
// chainable (a Rejected sample can spawn a new version via "New Version"). Colors/fonts match
// SampleProduction.jsx's cream palette, imported from there so both stay in sync.

const SUB_STAGES = ['Requested', 'In Lab', 'Sent', 'Feedback', 'Approved', 'Rejected'];
const TABS = ['Overview', 'Q&A', 'Products', 'Payments', 'Formulas', 'Samples', 'Approvals'];

// Overview tab's status chain, and the modal's own top-level tabs, continue into the production
// floor once a lead is linked to an order — same stages as SampleProduction.jsx's
// PROD_STAGE_TABS, plus the SPEC/QC sheet itself (stage 0, "Orders") and Work Assignment
// (stage 1, excluded from PROD_STAGE_TABS elsewhere) both getting their own top-level tab here.
// This array stays stage-ascending (0, 1, 2, ...) because the auto-jump-to-current-stage effect
// below picks "the last one reached" by array position — ORDER_JOURNEY_TAB_ORDER, further down,
// is the separate list that controls the actual left-to-right order shown in the tab bar.
const ORDER_JOURNEY_STAGES = [
  { stage: 0, label: 'Orders', emoji: '🪪' },
  { stage: 1, label: 'Work Assignment', emoji: '📋' },
  { stage: 2, label: 'Procurement', emoji: '📦' },
  { stage: 3, label: 'Weighing', emoji: '⚖️' },
  { stage: 4, label: 'Bulk QC', emoji: '🧫' },
  { stage: 5, label: 'Packaging', emoji: '🎁' },
  { stage: 6, label: 'Final QC', emoji: '✅' },
  { stage: 7, label: 'Dispatch', emoji: '🚚' },
];
// Work Assignment shows first in the tab bar — once payment is confirmed, filling its start
// date/team is the actual next action, before the Orders/Client-Profile tab's own content.
const ORDER_JOURNEY_TAB_ORDER = ['Work Assignment', 'Orders', 'Procurement', 'Weighing', 'Bulk QC', 'Packaging', 'Final QC', 'Dispatch'];
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
const QA_VIA = ['Phone Call', 'WhatsApp', 'Email', 'In-person', 'Other'];
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

// Deterministic short summary (no external/AI calls) — a couple of clear sentences regardless of
// how many queries exist, instead of narrating every single one (that grew unreadable once a
// lead had more than a handful of questions).
function qaSummaryParagraph(queries, leadName) {
  const chron = [...queries].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  if (!chron.length) return 'No conversation yet — add the first query above.';
  const answered = chron.filter((q) => q.answer).length;
  const open = chron.length - answered;
  const latest = chron[chron.length - 1];

  let out = `${leadName} has raised ${chron.length} quer${chron.length === 1 ? 'y' : 'ies'} since ${format(new Date(chron[0].createdAt), 'dd MMM')} — ${answered} answered, ${open} open.`;
  out += ` Most recent: "${truncText(latest.title, 70)}"${latest.answer ? ' — answered.' : ' — awaiting a reply.'}`;
  out += open > 0 ? ` ${open} question${open === 1 ? ' is' : 's are'} still open.` : ' All caught up.';
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
  const [maximized, setMaximized] = useState(false);

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
    <div className={clsx('fixed inset-0 z-[70] flex items-center justify-center bg-black/40', maximized ? 'p-0' : 'p-4')} onClick={onClose}>
      <div className={clsx('bg-[#f0eadd] shadow-2xl border border-[#d3c9b4] flex flex-col',
        maximized ? 'w-screen h-screen max-w-none rounded-none' : 'w-full max-w-lg rounded-2xl')} style={bodyFont} onClick={(e) => e.stopPropagation()}>
        <div className={clsx('flex items-center justify-between px-5 py-4 border-b border-[#e2dac8] bg-[#e7dfce] flex-shrink-0', !maximized && 'rounded-t-2xl')}>
          <h3 className="font-bold text-[#2e241b]" style={displayFont}>{product ? `🧴 Edit Product Link — ${product.productId}` : '➕ Link Product'}</h3>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setMaximized((m) => !m)} title={maximized ? 'Restore' : 'Maximize'} className="w-8 h-8 rounded-lg hover:bg-[#ddd3be] flex items-center justify-center text-[#968871] hover:text-[#2e241b] text-sm">{maximized ? '🗗' : '🗖'}</button>
            <button onClick={onClose} className="text-[#968871] hover:text-[#2e241b] text-xl leading-none">&times;</button>
          </div>
        </div>
        <div className={clsx('p-5 space-y-3', maximized && 'flex-1 overflow-y-auto')}>
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

// "Create Product" from a Q&A query — moved to its own leaf file (CreateCatalogProductModal.jsx)
// so StageSteps.jsx's Stage 0 panel can use it too without an import cycle (StageSteps.jsx is
// itself imported by this file). Re-imported here under the same name so every existing call
// site below keeps working unchanged.

// "New Formula" popup — mirrors the reference's formulaModal. The reference's Type
// (Standard/Custom) and Customer ID fields don't apply here: this tab only ever creates
// formulas scoped to the customer whose window is already open, i.e. always "Custom" for an
// implicit, already-known Customer ID — so those two fields are omitted rather than shown
// disabled/redundant.
function NewFormulaModal({ products, saving, onClose, onSave }) {
  const [name, setName] = useState('');
  const [productId, setProductId] = useState('');
  const [maximized, setMaximized] = useState(false);

  return (
    <div className={clsx('fixed inset-0 z-[70] flex items-center justify-center bg-black/40', maximized ? 'p-0' : 'p-4')} onClick={onClose}>
      <div className={clsx('bg-[#f0eadd] shadow-2xl border border-[#d3c9b4] flex flex-col',
        maximized ? 'w-screen h-screen max-w-none rounded-none' : 'w-full max-w-lg rounded-2xl')} style={bodyFont} onClick={(e) => e.stopPropagation()}>
        <div className={clsx('flex items-center justify-between px-5 py-4 border-b border-[#e2dac8] bg-[#e7dfce] flex-shrink-0', !maximized && 'rounded-t-2xl')}>
          <h3 className="font-bold text-[#2e241b]" style={displayFont}>➕ New Formula</h3>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setMaximized((m) => !m)} title={maximized ? 'Restore' : 'Maximize'} className="w-8 h-8 rounded-lg hover:bg-[#ddd3be] flex items-center justify-center text-[#968871] hover:text-[#2e241b] text-sm">{maximized ? '🗗' : '🗖'}</button>
            <button onClick={onClose} className="text-[#968871] hover:text-[#2e241b] text-xl leading-none">&times;</button>
          </div>
        </div>
        <div className={clsx('p-5 space-y-3', maximized && 'flex-1 overflow-y-auto')}>
          <div>
            <label className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1 block">Formula Name <span className="text-[#b6453a]">*</span></label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Vitamin C Serum 15% + Ferulic" className={clsx(inputCls, 'w-full')} autoFocus />
          </div>
          <div>
            <label className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1 block">Product <span className="text-[#b6453a]">*</span></label>
            <select value={productId} onChange={(e) => setProductId(e.target.value)} className={clsx(inputCls, 'w-full')}>
              <option value="">— select product —</option>
              {(products || []).map((p) => <option key={p.productId} value={p.productId}>{p.productId} — {p.name}</option>)}
            </select>
            {(products || []).length === 0 && <p className="text-[11px] text-[#8c3a30] mt-1">No products linked yet — add one in the Products tab first.</p>}
            <p className="text-[10px] text-[#968871] mt-1">This formula, and every sample made from it, stays tied to this product — its own Payments-tab confirmation is what unlocks sampling for it.</p>
          </div>
          <div className="p-2.5 rounded-lg bg-[#dde5ea] text-[#33526b] text-[11px] flex gap-2">
            <span>ℹ️</span>
            <span>A <strong>V1 (Draft)</strong> version is created automatically. Build the ingredient composition in <strong>Product Catalog</strong> (its Formulation tab) and link it here from the Products tab, then request samples against specific versions.</span>
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className={clsx(outlineBtn, 'flex-1 justify-center')}>Cancel</button>
            <button
              onClick={() => {
                if (!name.trim()) { toast.error('Formula name is required'); return; }
                if (!productId) { toast.error('Select which product this formula is for'); return; }
                onSave({ name: name.trim(), productId });
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
function NewSampleModal({ formulas, products, saving, onClose, onSave, onGoToPayments, chainedFrom, initialFormulaId }) {
  const [formulaId, setFormulaId] = useState(initialFormulaId || '');
  const [versionNo, setVersionNo] = useState(() => {
    const f = formulas.find((x) => x.formulaId === initialFormulaId);
    const versions = (f?.versions || []).filter((v) => ['Draft', 'In Testing', 'Accepted'].includes(v.status));
    return versions.length ? String(versions[versions.length - 1].version) : '';
  });
  const formula = formulas.find((f) => f.formulaId === formulaId);
  const openVersions = (formula?.versions || []).filter((v) => ['Draft', 'In Testing', 'Accepted'].includes(v.status));
  // Gate is per-product now — this sample inherits its formula's product, so whether it can
  // proceed past "Requested" depends on THAT product's own payment, not the whole lead's.
  const product = formula ? (products || []).find((p) => p.productId === formula.productId) : null;
  const isPaid = product ? product.paymentStatus === 'full_paid' : false;

  function pickFormula(id) {
    setFormulaId(id);
    const f = formulas.find((x) => x.formulaId === id);
    const versions = (f?.versions || []).filter((v) => ['Draft', 'In Testing', 'Accepted'].includes(v.status));
    setVersionNo(versions.length ? String(versions[versions.length - 1].version) : '');
  }

  const [maximized, setMaximized] = useState(false);

  return (
    <div className={clsx('fixed inset-0 z-[70] flex items-center justify-center bg-black/40', maximized ? 'p-0' : 'p-4')} onClick={onClose}>
      <div className={clsx('bg-[#f0eadd] shadow-2xl border border-[#d3c9b4] flex flex-col',
        maximized ? 'w-screen h-screen max-w-none rounded-none' : 'w-full max-w-lg rounded-2xl')} style={bodyFont} onClick={(e) => e.stopPropagation()}>
        <div className={clsx('flex items-center justify-between px-5 py-4 border-b border-[#e2dac8] bg-[#e7dfce] flex-shrink-0', !maximized && 'rounded-t-2xl')}>
          <h3 className="font-bold text-[#2e241b]" style={displayFont}>➕ Request New Sample</h3>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setMaximized((m) => !m)} title={maximized ? 'Restore' : 'Maximize'} className="w-8 h-8 rounded-lg hover:bg-[#ddd3be] flex items-center justify-center text-[#968871] hover:text-[#2e241b] text-sm">{maximized ? '🗗' : '🗖'}</button>
            <button onClick={onClose} className="text-[#968871] hover:text-[#2e241b] text-xl leading-none">&times;</button>
          </div>
        </div>
        <div className={clsx('p-5 space-y-3', maximized && 'flex-1 overflow-y-auto')}>
          {formula && !isPaid && (
            <div className="p-2.5 rounded-lg bg-[#f0d8d2] text-[#8c3a30] text-[11px] flex gap-2">
              <span>🔒</span>
              <span><strong>Payment for {product?.name || formula.productId || 'this product'} is not confirmed</strong> — sampling is locked for it. Confirm it in the 💳 Payments tab first.</span>
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
            {formula && <p className="text-[10px] text-[#968871] mt-1">Product: {product?.name || formula.productId || '—'} {product && (product.paymentStatus === 'full_paid' ? '· ✓ paid' : '· ⏳ payment pending')}</p>}
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
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className={clsx(outlineBtn, 'flex-1 justify-center')}>Cancel</button>
            <button
              onClick={() => {
                if (!formulaId || !versionNo) { toast.error('Select a formula and version'); return; }
                if (!isPaid) { toast.error(`🔒 Sampling is locked for ${product?.name || 'this product'} — confirm its payment in the Payments tab first`); onGoToPayments(); return; }
                onSave({ formulaId, formulaVersionNo: Number(versionNo), productId: formula?.productId || undefined, chainedFrom: chainedFrom || undefined });
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
  const [maximized, setMaximized] = useState(false);

  return (
    <div className={clsx('fixed inset-0 z-[75] flex items-center justify-center bg-black/40', maximized ? 'p-0' : 'p-4')} onClick={onClose}>
      <div className={clsx('bg-[#f0eadd] shadow-2xl border border-[#d3c9b4] flex flex-col',
        maximized ? 'w-screen h-screen max-w-none rounded-none' : 'w-full max-w-sm rounded-2xl')} style={bodyFont} onClick={(e) => e.stopPropagation()}>
        <div className={clsx('flex items-center justify-between px-5 py-4 border-b border-[#e2dac8] bg-[#e7dfce] flex-shrink-0', !maximized && 'rounded-t-2xl')}>
          <h3 className="font-bold text-[#2e241b]" style={displayFont}>💰 Quote Price — {product.productId}</h3>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setMaximized((m) => !m)} title={maximized ? 'Restore' : 'Maximize'} className="w-8 h-8 rounded-lg hover:bg-[#ddd3be] flex items-center justify-center text-[#968871] hover:text-[#2e241b] text-sm">{maximized ? '🗗' : '🗖'}</button>
            <button onClick={onClose} className="text-[#968871] hover:text-[#2e241b] text-xl leading-none">&times;</button>
          </div>
        </div>
        <div className={clsx('p-5 space-y-3', maximized && 'flex-1 overflow-y-auto')}>
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
// sidebar and a right ingredient/procedure viewer, mirroring the reference design's
// formulaEditorModal exactly: version cards (status pill, date, change note, linked samples),
// Ref Weight/Unit + Change Note meta fields, and an ingredient table with no per-row QC/HSN
// expand panel (that lives in Product Catalog's own Formulation tab, not here).
// Read-only, by design — building/editing ingredients happens in Product Catalog's own
// Formulation tab. Once this formula is linked to a catalog product (catalogProductId), this
// fetches and shows that product's CURRENT live formulation — not a one-time copy taken when it
// was first linked — so edits made in Product Catalog show up here automatically with no
// separate sync step. A formula not yet linked to a catalog product has nothing to show here
// until one exists (see the "Link from Catalog" action on the Products tab).
function FormulaEditorModal({ formula, samples, rawMaterials, onClose }) {
  const versions = formula.versions || [];
  const [selectedVersion, setSelectedVersion] = useState(formula.currentVersion);
  const [maximized, setMaximized] = useState(false);

  const versionObj = versions.find((v) => v.version === selectedVersion) || versions[versions.length - 1];

  const { data: catalogProduct, isLoading: catalogLoading } = useQuery({
    queryKey: ['catalog', 'product', formula.catalogProductId],
    queryFn: () => api.get(`/catalog/products/${formula.catalogProductId}`).then((r) => r.data.product),
    enabled: !!formula.catalogProductId,
  });
  const catalogLinked = !!formula.catalogProductId;

  // Live source of truth when linked to a catalog product; otherwise this formula was never
  // built out in Product Catalog, so there's nothing beyond the name/product-link to show.
  const mappedFromCatalog = catalogProduct ? mapCatalogFormulationToRows(catalogProduct) : null;
  const refWeight = Number(mappedFromCatalog?.refWeight ?? formula.refWeight) || 100;
  const refUnit = mappedFromCatalog?.refUnit || formula.refUnit || 'g';
  const procedure = mappedFromCatalog?.procedure || versionObj?.procedure || '';
  const rows = (mappedFromCatalog?.rows || []).map((r) => ({ ...r, percent: refWeight ? (((Number(r.quantity) || 0) / refWeight) * 100).toFixed(2) : '', conv: r.conv ?? 1 }));

  const totalPct = rows.reduce((s, r) => s + (Number(r.percent) || 0), 0);
  const totalQty = rows.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  const totalAmount = rows.reduce((s, r) => s + (Number(r.quantity) || 0) * (Number(r.costPerUnit) || 0), 0);
  const costPerUnit = refWeight > 0 ? totalAmount / refWeight : 0;

  function matFor(rawMaterialId) { return (rawMaterials || []).find((m) => m._id === rawMaterialId) || null; }
  function samplesForVersion(v) { return (samples || []).filter((s) => s.formulaId === formula.formulaId && s.formulaVersionNo === v); }

  return (
    <div className={clsx('fixed inset-0 z-50 flex items-center justify-center bg-black/40', maximized ? 'p-0' : 'p-4')} onClick={onClose}>
      <div className={clsx('bg-[#f7f3ea] shadow-2xl w-full flex flex-col',
        maximized ? 'max-w-none rounded-none h-screen' : 'max-w-6xl rounded-2xl h-[90vh]')} style={bodyFont} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#d3c9b4] flex-shrink-0">
          <h2 className="text-base font-bold text-[#2e241b]" style={displayFont}>
            🧬 {formula.formulaId} — {formula.name} · V{selectedVersion} <span className="text-xs font-normal text-[#968871]">(view only)</span>
          </h2>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setMaximized((m) => !m)} title={maximized ? 'Restore' : 'Maximize'} className="w-8 h-8 rounded-lg hover:bg-[#e7dfce] flex items-center justify-center text-[#968871] hover:text-[#2e241b] text-sm">{maximized ? '🗗' : '🗖'}</button>
            <button onClick={onClose} className="text-[#968871] hover:text-[#2e241b] text-xl leading-none">&times;</button>
          </div>
        </div>

        <div className="flex-1 flex min-h-0">
          {/* Version sidebar */}
          <div className="w-64 flex-shrink-0 border-r border-[#d3c9b4] p-3 overflow-y-auto space-y-2">
            <p className="text-[10px] font-bold text-[#968871] uppercase tracking-wide px-1">Versions</p>
            {[...versions].sort((a, b) => a.version - b.version).map((v) => {
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
                </div>
              );
            })}
          </div>

          {/* Viewer main */}
          <div className="flex-1 min-w-0 p-4 overflow-y-auto space-y-3">
            {!catalogLinked && (
              <div className="p-2.5 rounded-lg bg-[#dde5ea] text-[#33526b] text-[11px] flex gap-2">
                <span>ℹ️</span>
                <span>Not linked to a Product Catalog item yet — the ingredient composition is built there. Use "🔗 Link from Catalog" on the Products tab, or add {formula.name} as a new Product Catalog item and build its Formulation there.</span>
              </div>
            )}
            {catalogLinked && catalogLoading && (
              <p className="text-xs text-[#968871]">Loading live formulation from Product Catalog…</p>
            )}

            <div className="grid grid-cols-4 gap-3">
              <div><label className="text-[10px] text-[#968871]">Ref Weight</label>
                <p className="text-sm text-[#2e241b] px-3 py-2 rounded-[10px] bg-[#e7dfce]">{refWeight}</p>
              </div>
              <div><label className="text-[10px] text-[#968871]">Ref Unit</label>
                <p className="text-sm text-[#2e241b] px-3 py-2 rounded-[10px] bg-[#e7dfce]">{refUnit}</p>
              </div>
              <div className="col-span-2"><label className="text-[10px] text-[#968871]">Change Note</label>
                <p className="text-sm text-[#2e241b] px-3 py-2 rounded-[10px] bg-[#e7dfce] truncate">{versionObj?.changeNote || '—'}</p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-[10px] border border-[#d3c9b4]">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wide text-[#6d5f4c] border-b border-[#d3c9b4] bg-[#e7dfce]">
                    <th className="px-2 py-2">#</th><th className="px-2 py-2">Code</th><th className="px-3 py-2">Ingredient</th>
                    <th className="px-2 py-2">Qty</th><th className="px-2 py-2">%</th><th className="px-2 py-2">Conv</th><th className="px-2 py-2">Unit</th>
                    <th className="px-2 py-2">Phase</th><th className="px-2 py-2">Notes</th>
                    <th className="px-2 py-2">Unit Price ₹</th><th className="px-2 py-2">Amount ₹</th>
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
                        <td className="px-2 py-1.5 text-[#2e241b]">{r.quantity}</td>
                        <td className="px-2 py-1.5 text-[#2e241b]">{r.percent}%</td>
                        <td className="px-2 py-1.5 text-[#2e241b]">{r.conv}</td>
                        <td className="px-2 py-1.5 text-[#968871]">{r.unit}</td>
                        <td className="px-2 py-1.5 text-[#2e241b]">{r.phase || '—'}</td>
                        <td className="px-2 py-1.5 text-[#2e241b]">{r.notes || '—'}</td>
                        <td className="px-2 py-1.5 text-[#2e241b]">₹{(Number(r.costPerUnit) || 0).toFixed(2)}</td>
                        <td className="px-2 py-1.5 text-[#33526b] font-mono">₹{amount.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && <tr><td colSpan={10} className="px-3 py-6 text-center text-[#968871]">No ingredients yet.</td></tr>}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-4 gap-3 bg-[#2e241b] text-[#f0eadd] rounded-2xl px-5 py-3">
              <div><p className="text-[10px] text-[#c9bfae]">Total %</p><p className="text-sm font-bold">{totalPct.toFixed(2)}%</p></div>
              <div><p className="text-[10px] text-[#c9bfae]">Total Qty</p><p className="text-sm font-bold">{totalQty.toFixed(2)} {refUnit}</p></div>
              <div><p className="text-[10px] text-[#c9bfae]">Batch Amount</p><p className="text-sm font-bold">₹{totalAmount.toFixed(2)}</p></div>
              <div><p className="text-[10px] text-[#c9bfae]">Cost / Unit</p><p className="text-sm font-bold">₹{costPerUnit.toFixed(4)}</p></div>
            </div>

            <div>
              <label className="text-[10px] text-[#968871]">Manufacturing Procedure</label>
              <p className="text-sm text-[#2e241b] whitespace-pre-wrap px-3 py-2 rounded-[10px] bg-[#e7dfce] min-h-[3rem]">{procedure || '—'}</p>
            </div>

            {/* R&D Documentation — read-only view of research notes + reference files. */}
            <div className="border-t border-[#d3c9b4] pt-3 space-y-2">
              <p className="text-xs font-bold text-[#4a3a29]">📝 R&amp;D Documentation</p>
              <div>
                <label className="text-[10px] text-[#968871]">Research Notes</label>
                <p className="text-sm text-[#2e241b] whitespace-pre-wrap px-3 py-2 rounded-[10px] bg-[#e7dfce] min-h-[3rem]">{formula.researchNotes || '—'}</p>
              </div>
              <div>
                <label className="text-[10px] text-[#968871] block mb-1">Reference Files</label>
                <div className="space-y-1">
                  {(formula.attachments || []).map((a) => (
                    <a key={a._id} href={a.url} target="_blank" rel="noreferrer"
                      className="flex items-center px-2.5 py-1.5 rounded-lg border border-[#d3c9b4] bg-white text-xs text-[#4a3a29] font-semibold hover:underline">
                      📎 {a.name}
                    </a>
                  ))}
                  {(formula.attachments || []).length === 0 && <p className="text-[11px] text-[#968871]">No files attached.</p>}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[#d3c9b4] flex-shrink-0">
          <button onClick={onClose} className={outlineBtn}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default function SampleLeadDetail({ leadId, onClose, initialTab }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  // 'Production' is a generic sentinel from callers that want "wherever this order currently is"
  // without knowing the exact stage — resolved to the real stage tab by the auto-jump effect below
  // once the order loads, so it can't be used as the starting tab itself.
  const [tab, setTab] = useState(initialTab && initialTab !== 'Production' ? initialTab : 'Overview');
  const [maximized, setMaximized] = useState(false);

  // Q&A — a lean composer mirroring the reference design: one Question box, Asked Via, Topic,
  // an optional catalog product link, and an optional Answer to log Q&A in one shot.
  const [showRaiseForm, setShowRaiseForm] = useState(false);
  const [queryDesc, setQueryDesc] = useState('');
  const [queryAskedVia, setQueryAskedVia] = useState('Phone Call');
  const [queryTopic, setQueryTopic] = useState('General');
  const [queryAnswerNow, setQueryAnswerNow] = useState('');
  const [queryCatalogSearch, setQueryCatalogSearch] = useState('');
  const [querySelectedCatalogProduct, setQuerySelectedCatalogProduct] = useState(null);
  const [replyDrafts, setReplyDrafts] = useState({});
  // Editing an existing query in place — mirrors the raise-form fields, seeded from the query
  // being edited, id-keyed so only one card shows its edit form at a time.
  const [editingQueryId, setEditingQueryId] = useState(null);
  const [editQueryDesc, setEditQueryDesc] = useState('');
  const [editQueryAskedVia, setEditQueryAskedVia] = useState('Phone Call');
  const [editQueryTopic, setEditQueryTopic] = useState('General');
  const questionFileInputs = useRef({});
  const replyFileInputs = useRef({});
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
  // "🆕 Create Product" from a Q&A query — creates a real Product Catalog entry (unlike the
  // ProductLinkModal above, which can only search/attach an existing one or a lead-only shadow link).
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);

  // Formulas — a dedicated "New Formula" popup (name + product link only); ingredients are
  // added afterwards in the dedicated Formula Editor modal (editorFormulaId), not inline here.
  const [showFormulaForm, setShowFormulaForm] = useState(false);
  const [editorFormulaId, setEditorFormulaId] = useState(null);

  const [showEditKyc, setShowEditKyc] = useState(false);

  // Follow-ups — logged from here only (Sample Production is the single place lead
  // touchpoints happen); each save also pings the client with a WhatsApp acknowledgment.
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const [followUpMaximized, setFollowUpMaximized] = useState(false);
  const [fuType, setFuType] = useState('call');
  const [fuNotes, setFuNotes] = useState('');
  const [fuNextAction, setFuNextAction] = useState('');
  const [fuScheduledAt, setFuScheduledAt] = useState('');

  const [viewStage, setViewStage] = useState(null);
  const [activeProductId, setActiveProductId] = useState(null);
  const [showAddProductInOrders, setShowAddProductInOrders] = useState(false);
  const autoJumpedToProductionRef = useRef(false);

  // Per-product quotation → payment → production (Approvals tab) — each approved sample gets
  // its own quotation/invoice and its own "send to production" gate, independent of every other
  // product on the same lead. This replaced the old whole-lead "Move to Production" flow, which
  // skipped quotation/payment tracking entirely and dropped straight into Kitchen Schedule.
  const [sendSampleFor, setSendSampleFor] = useState(null);
  const [sendSampleCatalogSearch, setSendSampleCatalogSearch] = useState('');
  const [sendSampleSelectedCatalog, setSendSampleSelectedCatalog] = useState(null);
  const [sendSampleBatchSizeKg, setSendSampleBatchSizeKg] = useState(10);
  const [sendSampleMaximized, setSendSampleMaximized] = useState(false);

  const { data: catalogProducts } = useQuery({
    queryKey: ['catalog', 'products', 'all'],
    queryFn: () => api.get('/catalog/products').then((r) => r.data.products || []),
    enabled: productModalOpen || showRaiseForm || quickCreateOpen || !!sendSampleFor,
    staleTime: 5 * 60 * 1000,
  });
  const sendSampleCatalogMatches = sendSampleCatalogSearch
    ? (catalogProducts || []).filter((p) => (p.name || '').toLowerCase().includes(sendSampleCatalogSearch.toLowerCase()) || (p.code || '').toLowerCase().includes(sendSampleCatalogSearch.toLowerCase()))
    : (catalogProducts || []);
  const queryCatalogMatches = queryCatalogSearch
    ? (catalogProducts || []).filter((p) => (p.name || '').toLowerCase().includes(queryCatalogSearch.toLowerCase()) || (p.code || '').toLowerCase().includes(queryCatalogSearch.toLowerCase()))
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
  // Which product's inline payment-entry form is open — payments are per-product now, so this
  // one shared form gets reused for whichever product row the user is currently recording.
  const [payingProductId, setPayingProductId] = useState(null);

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

  // Maximize/restore toggles for the stage-transition modals below.
  const [courierMaximized, setCourierMaximized] = useState(false);
  const [feedbackMaximized, setFeedbackMaximized] = useState(false);
  const [approveMaximized, setApproveMaximized] = useState(false);
  const [rejectMaximized, setRejectMaximized] = useState(false);

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

  // Once a lead is linked to production, its 8-stage order board renders right here in the
  // Production tab — reusing the same endpoints Batch Tracker used, just inline in this panel.
  // Falls back to a sample's own productionOrderId (the newer per-product gated flow) when the
  // lead-wide field was never set — otherwise this tab strip goes blank for orders created via
  // "Send to Production" on an individual approved sample instead of the old whole-lead flow.
  // activeProductId lets the Products sidebar (below) switch which product's own order is being
  // viewed — each product has its own separate order, moving at its own pace (a 45-day soap vs.
  // a 2-day shampoo), so without this only the first one found would ever be reachable here.
  const activeProductOrderId = activeProductId
    ? (lead?.samples || []).find((s) => s.productId === activeProductId && s.productionOrderId)?.productionOrderId
    : null;
  const sampleProductionOrderId = (lead?.samples || [])
    .map((s) => s.productionOrderId?._id || s.productionOrderId)
    .find(Boolean);
  const productionOrderId = (activeProductOrderId?._id || activeProductOrderId)
    || lead?.productionOrderId?._id || lead?.productionOrderId || sampleProductionOrderId || null;
  const { data: productionOrder, isLoading: productionOrderLoading } = useQuery({
    queryKey: ['production-order', productionOrderId],
    queryFn: () => api.get(`/production/${productionOrderId}`).then((r) => r.data.order),
    enabled: !!productionOrderId,
    refetchInterval: 15 * 1000,
  });

  // Leads opened later that already have a linked order land straight on its current production
  // stage tab instead of Overview — jump once per mount, don't fight the user if they navigate
  // away. Work Assignment (stage 1) has no top-level tab of its own, so it falls back to Order.
  useEffect(() => {
    if (!autoJumpedToProductionRef.current && productionOrderId && productionOrder && (!initialTab || initialTab === 'Production')) {
      const reached = ORDER_JOURNEY_STAGES.filter((s) => s.stage <= productionOrder.stage);
      const target = reached[reached.length - 1] || ORDER_JOURNEY_STAGES[0];
      setTab(target.label);
      setViewStage(productionOrder.stage);
      autoJumpedToProductionRef.current = true;
    }
  }, [productionOrderId, productionOrder, initialTab]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['crm', 'lead', leadId] });
    qc.invalidateQueries({ queryKey: ['crm', 'lead', leadId, 'queries'] });
    qc.invalidateQueries({ queryKey: ['sample-production'] });
  };

  const invalidateOrder = () => {
    qc.invalidateQueries({ queryKey: ['production-order', productionOrderId] });
    qc.invalidateQueries({ queryKey: ['production-orders'] });
    invalidate();
  };

  const raiseMutation = useMutation({
    mutationFn: (body) => api.post(`/crm/leads/${leadId}/query`, body),
    onSuccess: () => {
      toast.success('Query raised');
      setQueryDesc(''); setQueryAskedVia('Phone Call'); setQueryTopic('General'); setQueryAnswerNow('');
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

  const followUpMutation = useMutation({
    mutationFn: (body) => api.post(`/crm/leads/${leadId}/followup`, body),
    onSuccess: () => {
      toast.success('Follow-up logged');
      setShowFollowUpModal(false); setFuNotes(''); setFuNextAction(''); setFuScheduledAt('');
      invalidate();
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to save follow-up'),
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

  const editQueryMutation = useMutation({
    mutationFn: ({ queryId, body }) => api.put(`/crm/queries/${queryId}`, body),
    onSuccess: () => { toast.success('Query updated'); setEditingQueryId(null); invalidate(); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to update query'),
  });

  const deleteQueryMutation = useMutation({
    mutationFn: ({ queryId, deleted }) => api.put(`/crm/queries/${queryId}/delete`, { deleted }),
    onSuccess: (_r, vars) => { toast.success(vars.deleted ? 'Question struck through' : 'Question restored'); invalidate(); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to update query'),
  });

  const uploadQueryAttachmentMutation = useMutation({
    mutationFn: ({ queryId, file }) => {
      const fd = new FormData();
      fd.append('file', file);
      return api.post(`/crm/queries/${queryId}/attachment`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: () => { toast.success('Attachment added'); invalidate(); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to upload attachment'),
  });

  const removeQueryAttachmentMutation = useMutation({
    mutationFn: ({ queryId, attachmentId }) => api.delete(`/crm/queries/${queryId}/attachment`, { data: { attachmentId } }),
    onSuccess: () => invalidate(),
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to remove attachment'),
  });

  const uploadReplyAttachmentMutation = useMutation({
    mutationFn: ({ queryId, file }) => {
      const fd = new FormData();
      fd.append('file', file);
      return api.post(`/crm/queries/${queryId}/reply-attachment`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: () => { toast.success('Attachment added'); invalidate(); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to upload attachment'),
  });

  const removeReplyAttachmentMutation = useMutation({
    mutationFn: ({ queryId, attachmentId }) => api.delete(`/crm/queries/${queryId}/reply-attachment`, { data: { attachmentId } }),
    onSuccess: () => invalidate(),
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to remove attachment'),
  });

  // Stamps a query with the product it was linked to (unlocks the 🧪/🧬 icons) and/or the
  // "→ converted" badge — fired after a product/formula/sample created via a Q&A convert-icon
  // actually succeeds (see qaConvertQueryId).
  const linkQueryMutation = useMutation({
    mutationFn: ({ queryId, ...body }) => api.put(`/crm/queries/${queryId}/link`, body),
    onSuccess: () => invalidate(),
  });

  const linkProductMutation = useMutation({
    mutationFn: ({ convertIcon, ...body }) => api.post(`/crm/leads/${leadId}/products`, body).then((r) => r.data.lead),
    onSuccess: (updatedLead, variables) => {
      toast.success('Product linked');
      setProductModalOpen(false);
      if (qaConvertQueryId) {
        const created = updatedLead.productLinks[updatedLead.productLinks.length - 1];
        if (created) linkQueryMutation.mutate({ queryId: qaConvertQueryId, productLinkId: created._id, convertedTo: `${variables?.convertIcon || '🔗'} ${created.productId}` });
        setQaConvertQueryId(null);
      }
      invalidate();
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to link product'),
  });

  // Creates a real Product Catalog entry (POST /catalog/products) — not just a lead-local
  // "shadow" link — then links it to this lead/query via the mutation above so it shows up
  // both here and in the actual Product Catalog.
  const createCatalogProductMutation = useMutation({
    mutationFn: (body) => api.post('/catalog/products', body).then((r) => r.data.product),
    onSuccess: (created) => {
      setQuickCreateOpen(false);
      qc.invalidateQueries({ queryKey: ['catalog'] });
      linkProductMutation.mutate({ productId: created.code, name: created.name, basis: 'House Formula', catalogProductId: created._id, convertIcon: '🆕' });
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to create product'),
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

  // Fixes formulas created before per-product payments existed (no productId) — a one-off
  // manual re-link so old formulas/samples can benefit from per-product gating too.
  const linkFormulaProductMutation = useMutation({
    mutationFn: ({ formulaId, productId }) => api.put(`/crm/leads/${leadId}/formulas/${formulaId}`, { productId }),
    onSuccess: () => { toast.success('Formula linked to product'); invalidate(); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to link product'),
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
        productId: product.code,
        catalogProductId: detail._id,
        // An Active catalog product is already a proven, established recipe — no need to
        // re-run this lead's own Draft -> In Testing -> Accepted cycle on it. A Draft/Archived
        // catalog product still starts fresh at Draft, same as before.
        status: detail.status === 'Active' ? 'Accepted' : 'Draft',
        refWeight: mapped.refWeight,
        refUnit: mapped.refUnit,
        procedure: mapped.procedure || undefined,
        rows: mapped.rows.length ? mapped.rows.map((r) => ({ rawMaterialId: r.rawMaterialId, name: r.name, quantity: Number(r.quantity) || 0, unit: r.unit, costPerUnit: r.costPerUnit, phase: r.phase || undefined, notes: r.notes || undefined, conv: Number(r.conv) || 1 })) : undefined,
      });
    },
    onSuccess: () => { toast.success('Formula copied from catalog'); invalidate(); },
    onError: () => toast.error('Product linked, but failed to copy its formula'),
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

  const createQuotationMutation = useMutation({
    mutationFn: (sampleId) => api.post(`/crm/leads/${leadId}/samples/${sampleId}/quotation`),
    onSuccess: (res) => {
      toast.success('Quotation created — opening it in Finance to fill in the price and send it');
      invalidate();
      const invoiceId = res.data.invoice?._id || res.data.data?.invoice?._id;
      const returnTo = encodeURIComponent(`/samples?open=${leadId}&leadTab=Approvals`);
      navigate(`/finance/invoices?open=${invoiceId}&returnTo=${returnTo}`);
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to create quotation'),
  });

  const createInvoiceMutation = useMutation({
    mutationFn: (sampleId) => api.post(`/crm/leads/${leadId}/samples/${sampleId}/invoice`),
    onSuccess: (res) => {
      toast.success('Final invoice created');
      invalidate();
      const invoiceId = res.data.invoice?._id || res.data.data?.invoice?._id;
      const returnTo = encodeURIComponent(`/samples?open=${leadId}&leadTab=Approvals`);
      navigate(`/finance/invoices?open=${invoiceId}&returnTo=${returnTo}`);
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to create invoice'),
  });

  // "Send" a draft quotation right from Approvals — this was the recurring confusion: staff
  // would create a quotation and expect Create Invoice to unlock, not realizing it still had to
  // be marked Sent (a Status dropdown buried in Finance's full edit form) first.
  const sendQuotationMutation = useMutation({
    mutationFn: (invoiceId) => api.patch(`/finance/invoices/${invoiceId}/status`, { status: 'sent' }),
    onSuccess: () => { toast.success('Quotation marked as sent — Create Invoice is now unlocked'); invalidate(); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to send quotation'),
  });

  const linkSampleProductionMutation = useMutation({
    mutationFn: ({ sampleId, catalogProduct, batchSizeKg }) => api.post(`/crm/leads/${leadId}/samples/${sampleId}/link-production`, { catalogProduct, batchSizeKg }).then((r) => r.data),
    onSuccess: ({ lead: updatedLead, order }) => {
      toast.success('Sent to production — opening Orders');
      // Write the fresh lead straight into cache (it already has this sample's productionOrderId
      // set) instead of relying on invalidate()'s refetch to land before the tab switch below —
      // that race left the Orders tab briefly showing "not sent to production yet" right after
      // switching, since productionOrderId was still computed from the stale cached lead.
      if (updatedLead) qc.setQueryData(['crm', 'lead', leadId], (old) => (old ? { ...old, ...updatedLead } : updatedLead));
      if (order) qc.setQueryData(['production-order', order._id], order);
      qc.invalidateQueries({ queryKey: ['crm'] });
      qc.invalidateQueries({ queryKey: ['sample-production'] });
      qc.invalidateQueries({ queryKey: ['production-schedule'] });
      invalidate();
      setSendSampleFor(null);
      setSendSampleSelectedCatalog(null);
      setSendSampleCatalogSearch('');
      setSendSampleBatchSizeKg(10);
      // Land directly on the Client Profile (stage 0) for the order that was just created — no
      // separate "go find it in Orders" step. New orders start internally at stage 1 (Work
      // Assignment), so without this ref guard the auto-jump-to-current-stage effect below would
      // immediately fire and override viewStage back to 1, showing Production Schedule instead.
      autoJumpedToProductionRef.current = true;
      setActiveProductId(sendSampleFor.productId || null);
      setTab('Orders');
      setViewStage(0);
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to send to production'),
  });

  if (!leadId) return null;

  const sd = lead?.sampleDetails || {};
  // Legacy lead-wide flag — kept only as a fallback for samples that predate per-product
  // payments (no productId on the sample, e.g. its formula was never linked to a product).
  const isPaid = sd.paymentStatus === 'full_paid';
  const samples = lead?.samples || [];
  const formulas = lead?.customFormulas || [];
  const products = lead?.productLinks || [];
  // Resolves via the sample's own productId first; falls back to its formula's productId so a
  // sample made before its formula was linked to a product (or before this feature existed)
  // still reflects correctly the moment the formula gets linked — no per-sample backfill needed.
  const productForSample = (sample) => {
    if (sample.productId) return products.find((p) => p.productId === sample.productId);
    const formula = formulas.find((f) => f.formulaId === sample.formulaId);
    return formula?.productId ? products.find((p) => p.productId === formula.productId) : undefined;
  };
  // Each product moves through production entirely on its own — a 45-day soap and a 2-day
  // shampoo on the same lead shouldn't be tracked as one blob. Finds the one sample (if any)
  // that carried THIS product all the way to a real production order, so the Products tab can
  // show each product's own current stage instead of one shared status for the whole lead.
  const productionForProduct = (productId) => {
    const sample = samples.find((s) => s.productId === productId && s.productionOrderId);
    return sample ? { sample, order: sample.productionOrderId } : null;
  };
  const isSamplePaid = (sample) => {
    const p = productForSample(sample);
    return p ? p.paymentStatus === 'full_paid' : isPaid;
  };
  const pendingQueries = (queries || []).filter((q) => q.status === 'pending' || q.status === 'in_progress').length;
  const approvedSamples = samples.filter((s) => s.status === 'Approved');
  const openSample = samples.find((s) => s.sampleId === openSampleId);

  return (
    <div className={clsx('fixed inset-0 z-[70] flex items-center justify-center', maximized ? 'p-0' : 'p-4')} style={bodyFont}>
      <style>{FONT_IMPORT}</style>
      <div className="absolute inset-0 bg-[#2e241b]/50 backdrop-blur-sm" onClick={onClose} />
      <div className={clsx('relative bg-[#f0eadd] shadow-[0_10px_40px_rgba(46,36,27,0.16)] border border-[#d3c9b4] flex flex-col',
        maximized ? 'w-screen h-screen max-w-none rounded-none' : 'w-full max-w-4xl rounded-2xl')}
        style={maximized ? undefined : { maxHeight: '90vh' }}>
        <div className={clsx('p-5 border-b border-[#e2dac8] bg-[#e7dfce] flex items-center justify-between flex-shrink-0', !maximized && 'rounded-t-2xl')}>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-[#2e241b]" style={displayFont}>{lead?.name || 'Loading…'}</h3>
              {lead && <span className="font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#ddd3be] text-[#4a3a29]">{customerId(lead)}</span>}
            </div>
            <p className="text-xs text-[#6d5f4c]">{lead?.company || '—'} · {lead?.phone}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setMaximized((m) => !m)} title={maximized ? 'Restore' : 'Maximize'} className="w-9 h-9 rounded-lg hover:bg-[#ddd3be] flex items-center justify-center text-[#968871] hover:text-[#2e241b] text-base">{maximized ? '🗗' : '🗖'}</button>
            <button onClick={onClose} className="w-9 h-9 rounded-lg hover:bg-[#ddd3be] flex items-center justify-center text-[#968871] hover:text-[#2e241b] text-lg">✕</button>
          </div>
        </div>

        <div className="flex gap-1 px-5 pt-3 border-b border-[#e2dac8] flex-shrink-0 overflow-x-auto">
          {[...TABS, ...ORDER_JOURNEY_TAB_ORDER].map((t) => {
            const stageMeta = ORDER_JOURNEY_STAGES.find((s) => s.label === t);
            const actualStage = productionOrder?.stage;
            // Order (stage 0) is never locked — it's the entry point that shows the "Create
            // Order" button when no order exists yet. Every other stage still waits until the
            // order actually exists and has reached it.
            const locked = !!stageMeta && stageMeta.stage > 0 && (!productionOrderId || actualStage === undefined || stageMeta.stage > actualStage);
            const count = t === 'Q&A' ? (queries || []).length : t === 'Products' ? products.length : t === 'Formulas' ? formulas.length : t === 'Samples' ? samples.length : t === 'Approvals' ? approvedSamples.length : null;
            return (
              <button
                key={t}
                disabled={locked}
                onClick={() => { setTab(t); if (stageMeta) setViewStage(stageMeta.stage); }}
                title={locked ? `${t} — not reached yet` : undefined}
                className={clsx(
                  'px-3 py-2 text-sm font-semibold border-b-[2.5px] -mb-px transition-colors whitespace-nowrap',
                  locked ? 'border-transparent text-[#c2b9a3] cursor-not-allowed' :
                  tab === t ? 'border-[#f2b23e] text-[#2e241b]' : 'border-transparent text-[#6d5f4c] hover:text-[#2e241b]'
                )}
              >
                {stageMeta ? `${stageMeta.emoji} ${t}` : t}
                {t === 'Q&A' && pendingQueries > 0 && <span className={clsx('ml-1.5 px-1.5 py-0.5 rounded-full text-[10px]', PILL.warning)}>{pendingQueries}</span>}
                {count !== null && t !== 'Q&A' && <span className={clsx('ml-1.5 px-1.5 py-0.5 rounded-full text-[10px]', PILL.gray)}>{count}</span>}
                {!locked && stageMeta && actualStage === stageMeta.stage && <span className={clsx('ml-1.5 px-1.5 py-0.5 rounded-full text-[10px]', PILL.info)}>current</span>}
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

              {approvedSamples.length > 0 && !productionOrderId && (
                <div className={clsx('p-3 rounded-[10px] border', 'bg-[#dce9d4] border-[#b9d2af]')}>
                  <p className="text-sm font-semibold text-[#3a5f3c]">✓ {approvedSamples.length} sample(s) approved — ready to send to production</p>
                  <p className="text-xs text-[#3a5f3c]/80 mt-0.5">Open the Approvals tab and move this lead to Production — the order opens right here in the Production tab.</p>
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

              {/* End-to-end at a glance — every query ever asked for this customer, right here
                  next to their KYC fields, so "View Order" from a sample doesn't need further
                  digging into the Q&A tab to see the full history. */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-[#968871] uppercase tracking-wide">
                    Q&amp;A History {(queries || []).length > 0 && `(${queries.length})`}
                  </p>
                  {(queries || []).length > 0 && <button onClick={() => setTab('Q&A')} className={textLink}>Open full Q&amp;A ▸</button>}
                </div>
                {(queries || []).length === 0 ? (
                  <p className="text-xs text-[#968871]">No queries raised yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {[...queries].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map((q) => (
                      <div key={q._id} className={clsx('text-xs rounded-[10px] border border-[#e2dac8] bg-[#f0eadd] px-3 py-2', q.deleted && 'opacity-60')}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={clsx('px-1.5 py-0.5 rounded-full font-semibold', qaStatusPillCls(q.status))}>{QA_STATUS_LABEL[q.status] || q.status}</span>
                          <span className={clsx('px-1.5 py-0.5 rounded-full font-semibold', qaTopicPillCls(q.topic || 'General'))}>{q.topic || 'General'}</span>
                          <span className="text-[#968871]">{format(new Date(q.createdAt), 'dd MMM, hh:mm a')}</span>
                        </div>
                        <p className={clsx('text-[#2e241b] font-medium mt-1', q.deleted && 'line-through')}>{q.title}</p>
                        {q.answer && <p className={clsx('text-[#3a5f3c] mt-0.5', q.deleted && 'line-through')}>↳ {q.answer}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {lead?.notes && (
                <div>
                  <p className="text-xs text-[#968871] mb-1">Notes</p>
                  <p className="text-sm text-[#4a3a29] whitespace-pre-wrap">{lead.notes}</p>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-[#968871] uppercase tracking-wide">
                    Follow-ups {(lead?.followUps || []).length > 0 && `(${lead.followUps.length})`}
                  </p>
                  <button
                    onClick={() => { setFuType('call'); setFuNotes(''); setFuNextAction(''); setFuScheduledAt(''); setShowFollowUpModal(true); }}
                    className={outlineBtn}
                  >
                    + Log Follow-up
                  </button>
                </div>
                {(lead?.followUps || []).length === 0 ? (
                  <p className="text-xs text-[#968871]">No follow-ups logged yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {[...lead.followUps].reverse().slice(0, 5).map((fu, i) => (
                      <div key={i} className="text-xs rounded-[10px] border border-[#e2dac8] bg-[#f0eadd] px-3 py-2">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-[#2e241b] capitalize">{fu.type || 'call'}</span>
                          <span className="text-[#968871]">{fu.scheduledAt ? format(new Date(fu.scheduledAt), 'dd MMM, h:mm a') : ''}</span>
                        </div>
                        {fu.notes && <p className="text-[#4a3a29] mt-0.5">{fu.notes}</p>}
                        {fu.nextAction && <p className="text-[#968871] mt-0.5">Next: {fu.nextAction}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {!isLoading && ORDER_JOURNEY_STAGES.some((s) => s.label === tab) && !productionOrderId && (
            <div className="p-6 rounded-[10px] border border-dashed border-[#d3c9b4] bg-[#e7dfce] text-center space-y-3">
              <div>
                <p className="text-sm font-semibold text-[#6d5f4c]">🏭 Not sent to production yet</p>
                <p className="text-xs text-[#968871] mt-1">
                  Approve a sample in the Samples tab, then create its quotation and invoice in Approvals — sending it to production from there opens this Orders/Customer Details view automatically, with the customer's KYC details already filled in.
                </p>
              </div>
              <button onClick={() => setTab('Approvals')} className={accentBtn}>Go to Approvals →</button>
            </div>
          )}

          {!isLoading && ORDER_JOURNEY_STAGES.some((s) => s.label === tab) && productionOrderId && (
            <div className="space-y-4">
              {(productionOrderLoading || !productionOrder) ? (
                <p className="text-sm text-[#968871] text-center py-8">Loading order…</p>
              ) : (() => {
                // No inner stage bar here — the main tab strip above (Orders/Procurement/
                // Weighing/.../Dispatch) already does this exact navigation; having both was
                // just the same buttons twice. The Products sidebar, though, needs to be visible
                // across every stage (not just Orders) — each product moves through Orders ->
                // Dispatch entirely on its own pace, and this is the one place to switch between
                // them without losing your spot.
                const stage = viewStage ?? productionOrder.stage;
                return (
                  <div className="flex gap-4 items-start">
                    <div className="w-52 flex-shrink-0">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-[#968871] mb-2">Products (from catalogue)</p>
                      <div className="space-y-1.5">
                        {products.map((p) => {
                          const prodOrder = productionForProduct(p.productId)?.order;
                          const isCurrent = prodOrder && String(prodOrder._id) === String(productionOrder._id);
                          return (
                            <button
                              key={p.productId}
                              onClick={() => { if (prodOrder && !isCurrent) { setActiveProductId(p.productId); setViewStage(null); } }}
                              disabled={!prodOrder}
                              className={clsx('w-full text-left rounded-lg border-[1.5px] px-2.5 py-2 transition-colors',
                                isCurrent ? 'border-[#f2b23e] bg-[#f3e3c2]' : prodOrder ? 'border-[#d3c9b4] bg-white hover:bg-[#f0eadd]' : 'border-[#e2dac8] bg-[#f0eadd] opacity-60 cursor-not-allowed')}
                            >
                              <p className="text-xs font-bold text-[#2e241b] truncate">{p.name}</p>
                              <p className="text-[10px] text-[#968871] truncate">{prodOrder ? STAGE_NAMES[prodOrder.stage] || prodOrder.status : 'Not in production'}</p>
                            </button>
                          );
                        })}
                      </div>
                      <button onClick={() => setShowAddProductInOrders(true)} className="w-full mt-2 border-2 border-dashed border-[#968871] text-[#7a5a10] rounded-lg py-2 text-xs font-bold hover:bg-[#f3e3c2]">+ Add product</button>
                    </div>
                    <div className="flex-1 min-w-0 space-y-4">
                      {stage === 0 && <StageOrder order={productionOrder} onSaved={invalidateOrder} hideSidebar />}
                      {stage === 1 && <StageWorkAssignment order={productionOrder} onSaved={invalidateOrder} />}
                      {stage === 2 && <StageProcurement order={productionOrder} onAdvanced={invalidateOrder} />}
                      {stage === 3 && <StageWeighing order={productionOrder} onSaved={invalidateOrder} />}
                      {stage === 4 && <StageBulkQC order={productionOrder} onSaved={invalidateOrder} />}
                      {stage === 5 && <StagePackaging order={productionOrder} onSaved={invalidateOrder} />}
                      {stage === 6 && <StageFinalQC order={productionOrder} onSaved={invalidateOrder} />}
                      {stage === 7 && <StageDispatch order={productionOrder} onSaved={invalidateOrder} />}
                    </div>
                  </div>
                );
              })()}
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
                  <textarea value={queryDesc} onChange={(e) => setQueryDesc(e.target.value)} placeholder="What did the customer ask?" rows={2} className={clsx(inputCls, 'w-full')} />
                  <div className="grid grid-cols-2 gap-2">
                    <select value={queryAskedVia} onChange={(e) => setQueryAskedVia(e.target.value)} className={inputCls}>
                      {QA_VIA.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                    <select value={queryTopic} onChange={(e) => setQueryTopic(e.target.value)} className={inputCls}>
                      {QA_TOPICS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <input
                      value={querySelectedCatalogProduct ? querySelectedCatalogProduct.name : queryCatalogSearch}
                      onChange={(e) => { setQueryCatalogSearch(e.target.value); setQuerySelectedCatalogProduct(null); }}
                      placeholder="Linked product (optional)…"
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
                  <textarea value={queryAnswerNow} onChange={(e) => setQueryAnswerNow(e.target.value)} placeholder="Answer (optional — leave blank to keep it Open)…" rows={2} className={clsx(inputCls, 'w-full')} />
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setShowRaiseForm(false)} className={outlineBtn}>Cancel</button>
                    <button
                      onClick={() => {
                        if (!queryDesc.trim()) { toast.error('Question is required'); return; }
                        raiseMutation.mutate({
                          description: queryDesc.trim(),
                          askedVia: queryAskedVia,
                          topic: queryTopic,
                          linkedCatalogProductId: querySelectedCatalogProduct?._id,
                          answer: queryAnswerNow.trim() || undefined,
                        });
                      }}
                      disabled={raiseMutation.isPending}
                      className={clsx(accentBtn, 'ml-auto')}
                    >
                      {raiseMutation.isPending ? 'Saving…' : '💾 Save Query'}
                    </button>
                  </div>
                </div>
              )}

              {(queries || []).length === 0 && !showRaiseForm && (
                <p className="text-sm text-[#968871] text-center py-6">No queries raised for this lead yet.</p>
              )}

              {/* Newest first — most recent question/activity on top, older ones settle toward the bottom. */}
              {[...(queries || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map((q) => {
                const isOpen = q.status === 'pending' || q.status === 'in_progress';
                const hasProduct = !!q.linkedProductLinkId;
                const aging = qaAging(q);
                const isEditing = editingQueryId === q._id;
                return (
                  <div key={q._id} className={clsx('p-3 rounded-[10px] border border-[#e2dac8] space-y-2', q.deleted && 'opacity-60 bg-[#f0eadd]/60')}>
                    <div className="flex items-center gap-2 flex-wrap text-[11px]">
                      {q.deleted && <span className="px-2 py-0.5 rounded-full font-semibold bg-[#f0d8d2] text-[#8c3a30]">Deleted</span>}
                      <span className={clsx('px-2 py-0.5 rounded-full font-semibold', qaStatusPillCls(q.status))}>
                        {QA_STATUS_LABEL[q.status] || q.status}
                      </span>
                      <span className={clsx('px-2 py-0.5 rounded-full font-semibold', aging.cls)}>{aging.label}</span>
                      <span className={clsx('px-2 py-0.5 rounded-full font-semibold', qaTopicPillCls(q.topic || 'General'))}>{q.topic || 'General'}</span>
                      {q.convertedTo && <span className="px-2 py-0.5 rounded-full font-semibold bg-[#e7dfce] text-[#4a3a29]">→ {q.convertedTo}</span>}
                      <span className="text-[#968871]">{format(new Date(q.createdAt), 'dd MMM, hh:mm a')}</span>
                      {q.editedAt && <span className="text-[#968871] italic">(edited)</span>}
                      {q.askedVia && <span className="text-[#968871]">· 📞 {q.askedVia}</span>}
                      <span className="flex-1" />
                      {isOpen && (
                        <div className="flex items-center gap-1">
                          <button title="🆕 Create Product — add a new Product Catalog entry for this query" onClick={() => { setQaConvertQueryId(q._id); setQuickCreateOpen(true); }} className="w-6 h-6 rounded-full hover:bg-[#e7dfce] flex items-center justify-center">🆕</button>
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
                      <button
                        title="✏️ Edit question"
                        onClick={() => { setEditingQueryId(q._id); setEditQueryDesc(q.description || q.title || ''); setEditQueryAskedVia(q.askedVia || 'Phone Call'); setEditQueryTopic(q.topic || 'General'); }}
                        className="w-6 h-6 rounded-full hover:bg-[#e7dfce] flex items-center justify-center"
                      >✏️</button>
                      <button
                        title={q.deleted ? '↺ Restore question' : '🗑️ Delete question (strikes it through, reversible)'}
                        onClick={() => deleteQueryMutation.mutate({ queryId: q._id, deleted: !q.deleted })}
                        className="w-6 h-6 rounded-full hover:bg-[#f6e3e0] flex items-center justify-center"
                      >{q.deleted ? '↺' : '🗑️'}</button>
                    </div>

                    {isEditing ? (
                      <div className="p-2 rounded-lg border-[1.5px] border-dashed border-[#d3c9b4] bg-[#e7dfce] space-y-2">
                        <textarea value={editQueryDesc} onChange={(e) => setEditQueryDesc(e.target.value)} rows={2} className={clsx(inputCls, 'w-full')} />
                        <div className="grid grid-cols-2 gap-2">
                          <select value={editQueryAskedVia} onChange={(e) => setEditQueryAskedVia(e.target.value)} className={inputCls}>
                            {QA_VIA.map((v) => <option key={v} value={v}>{v}</option>)}
                          </select>
                          <select value={editQueryTopic} onChange={(e) => setEditQueryTopic(e.target.value)} className={inputCls}>
                            {QA_TOPICS.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => setEditingQueryId(null)} className={outlineBtn}>Cancel</button>
                          <button
                            onClick={() => {
                              if (!editQueryDesc.trim()) { toast.error('Question is required'); return; }
                              editQueryMutation.mutate({ queryId: q._id, body: { description: editQueryDesc.trim(), askedVia: editQueryAskedVia, topic: editQueryTopic } });
                            }}
                            disabled={editQueryMutation.isPending}
                            className={clsx(accentBtn, 'ml-auto')}
                          >
                            {editQueryMutation.isPending ? 'Saving…' : '💾 Save'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className={clsx('text-sm font-semibold text-[#2e241b]', q.deleted && 'line-through')}>{q.title}</p>
                        {q.description && q.description !== q.title && <p className={clsx('text-sm text-[#6d5f4c]', q.deleted && 'line-through')}>{q.description}</p>}
                      </>
                    )}

                    {(q.contactName || q.contactEmail || q.targetPrice || q.benchmarkNotes || q.packagingIntent || q.internalNotes) && (
                      <div className="text-[11px] text-[#6d5f4c] bg-[#e7dfce] rounded-lg p-2 space-y-0.5">
                        {q.contactName && <p>Contact: <span className="text-[#2e241b] font-medium">{q.contactName}</span>{q.contactEmail && ` · ${q.contactEmail}`}</p>}
                        {q.targetPrice > 0 && <p>Target price: ₹{q.targetPrice.toLocaleString('en-IN')}/unit</p>}
                        {q.packagingIntent && <p>Packaging: {q.packagingIntent}</p>}
                        {q.benchmarkNotes && <p>Benchmark: {q.benchmarkNotes}</p>}
                        {q.internalNotes && <p className="italic">Internal: {q.internalNotes}</p>}
                      </div>
                    )}

                    {/* Question attachments */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {(q.attachments || []).map((a) => (
                        <span key={a._id} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-[#d3c9b4] bg-white text-[11px] text-[#4a3a29] font-semibold">
                          <a href={a.url} target="_blank" rel="noreferrer" className="hover:underline">📎 {a.name}</a>
                          <button title="Remove attachment" onClick={() => removeQueryAttachmentMutation.mutate({ queryId: q._id, attachmentId: a._id })} className="text-[#968871] hover:text-[#8c3a30]">✕</button>
                        </span>
                      ))}
                      <input
                        type="file"
                        ref={(el) => { questionFileInputs.current[q._id] = el; }}
                        className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadQueryAttachmentMutation.mutate({ queryId: q._id, file: f }); e.target.value = ''; }}
                      />
                      <button
                        type="button"
                        onClick={() => questionFileInputs.current[q._id]?.click()}
                        disabled={uploadQueryAttachmentMutation.isPending}
                        className="text-[11px] font-semibold text-[#968871] hover:text-[#4a3a29] disabled:opacity-50"
                      >
                        📎 Attach file
                      </button>
                    </div>

                    {q.answer ? (
                      <div className={clsx('p-2 rounded-lg text-sm text-[#2e241b]', PILL.success, q.deleted && 'line-through')}>
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

                    {/* Reply attachments — independent of whether the text answer has been sent yet. */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {(q.answerAttachments || []).map((a) => (
                        <span key={a._id} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-[#d3c9b4] bg-white text-[11px] text-[#4a3a29] font-semibold">
                          <a href={a.url} target="_blank" rel="noreferrer" className="hover:underline">📎 {a.name}</a>
                          <button title="Remove attachment" onClick={() => removeReplyAttachmentMutation.mutate({ queryId: q._id, attachmentId: a._id })} className="text-[#968871] hover:text-[#8c3a30]">✕</button>
                        </span>
                      ))}
                      <input
                        type="file"
                        ref={(el) => { replyFileInputs.current[q._id] = el; }}
                        className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadReplyAttachmentMutation.mutate({ queryId: q._id, file: f }); e.target.value = ''; }}
                      />
                      <button
                        type="button"
                        onClick={() => replyFileInputs.current[q._id]?.click()}
                        disabled={uploadReplyAttachmentMutation.isPending}
                        className="text-[11px] font-semibold text-[#968871] hover:text-[#4a3a29] disabled:opacity-50"
                      >
                        📎 Attach to reply
                      </button>
                    </div>
                  </div>
                );
              })}

              <QaConversationSummary
                queries={queries}
                leadName={lead?.name || 'This customer'}
                onCreateProduct={() => { setQaConvertQueryId(null); setQuickCreateOpen(true); }}
                onMakeSample={() => { setTab('Samples'); setShowSampleForm(true); }}
                onStartFormula={() => { setTab('Formulas'); setShowFormulaForm(true); }}
              />
            </div>
          )}

          {!isLoading && tab === 'Products' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-[#968871] uppercase tracking-wide">{products.length} linked</p>
                <div className="flex items-center gap-2">
                  <button onClick={() => { setQaConvertQueryId(null); setQuickCreateOpen(true); }} className={outlineBtn}>🆕 Create Product</button>
                  <button onClick={() => { setProductModalEditing(null); setProductModalOpen(true); }} className={outlineBtn}>➕ Link Product</button>
                </div>
              </div>

              {products.length === 0 && <p className="text-sm text-[#968871] text-center py-6">No products linked yet — link a catalogue product, pricing then flows Quote → Accept.</p>}

              {products.length > 0 && (
                <div className="overflow-x-auto rounded-[10px] border border-[#e2dac8]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wide text-[#6d5f4c] border-b border-[#d3c9b4] bg-[#e7dfce]">
                        <th className="px-3 py-2">Product ID</th><th className="px-3 py-2">Basis</th><th className="px-3 py-2">Approx Price</th>
                        <th className="px-3 py-2">Price Status</th><th className="px-3 py-2">Payment</th><th className="px-3 py-2">Production</th><th className="px-3 py-2 w-28">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((p) => {
                        const production = productionForProduct(p.productId);
                        return (
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
                          <td className="px-3 py-2">
                            {production ? (
                              <button
                                onClick={() => { setTab('Orders'); setViewStage(production.order.stage); }}
                                className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#dde5ea] text-[#33526b] hover:brightness-95"
                                title={`${production.order.orderNumber} — click to open`}
                              >
                                {STAGE_NAMES[production.order.stage] || production.order.status} ▸
                              </button>
                            ) : (
                              <span className="text-[10px] text-[#968871]">Not in production</span>
                            )}
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
                        );
                      })}
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
                <p className="text-[11px] text-[#968871]">View only — ingredients are built in Product Catalog's Formulation tab and shown here live once linked. Start a new one from the Products tab.</p>
              </div>

              {formulas.length === 0 && <p className="text-sm text-[#968871] text-center py-6">No custom formulas yet.</p>}

              {formulas.length > 0 && (
                <div className="overflow-x-auto rounded-[10px] border border-[#e2dac8]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wide text-[#6d5f4c] border-b border-[#d3c9b4] bg-[#e7dfce]">
                        <th className="px-3 py-2">Formula ID</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Product</th>
                        <th className="px-3 py-2">Current V</th><th className="px-3 py-2">Version Status</th><th className="px-3 py-2">Cost/Unit</th><th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {formulas.map((f) => {
                        const latest = f.versions[f.versions.length - 1];
                        const linkedProduct = products.find((p) => p.productId === f.productId);
                        return (
                          <tr key={f.formulaId} className="border-b border-[#e2dac8] cursor-pointer hover:bg-[#e7dfce]/60" onClick={() => setEditorFormulaId(f.formulaId)}>
                            <td className="px-3 py-2 font-mono text-xs text-[#6d5f4c]">{f.formulaId}</td>
                            <td className="px-3 py-2 text-[#2e241b] font-medium">{f.name}</td>
                            <td className="px-3 py-2 text-xs" onClick={(e) => e.stopPropagation()}>
                              {linkedProduct ? (
                                <span className="text-[#968871]">
                                  {f.catalogProductId && <span title="Linked from Product Catalog" className="mr-1">🔗</span>}
                                  {linkedProduct.name}
                                </span>
                              ) : products.length > 0 ? (
                                <select
                                  defaultValue=""
                                  onChange={(e) => { if (e.target.value) linkFormulaProductMutation.mutate({ formulaId: f.formulaId, productId: e.target.value }); }}
                                  className="text-[10px] border border-[#8c3a30]/40 rounded px-1 py-0.5 bg-[#f0d8d2] text-[#8c3a30]"
                                >
                                  <option value="">🔗 Link product…</option>
                                  {products.map((p) => <option key={p.productId} value={p.productId}>{p.name}</option>)}
                                </select>
                              ) : (
                                <span className="text-[#8c3a30] font-semibold">Not linked</span>
                              )}
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
                              <button onClick={(e) => { e.stopPropagation(); setEditorFormulaId(f.formulaId); }} className={textLink}>👁️ View</button>
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
                  onClose={() => setEditorFormulaId(null)}
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

              {samples.length === 0 && <p className="text-sm text-[#968871] text-center py-6">No samples yet.</p>}

              {samples.length > 0 && (
                <div className="overflow-x-auto rounded-[10px] border border-[#e2dac8]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wide text-[#6d5f4c] border-b border-[#d3c9b4] bg-[#e7dfce]">
                        <th className="px-3 py-2">Sample ID</th><th className="px-3 py-2">Formula/Version</th><th className="px-3 py-2">Product</th><th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Days in Stage</th><th className="px-3 py-2">Courier</th><th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {samples.map((s) => {
                        const formula = formulas.find((f) => f.formulaId === s.formulaId);
                        const lastEvent = s.timeline?.[s.timeline.length - 1];
                        const product = productForSample(s);
                        const paid = isSamplePaid(s);
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
                            <td className="px-3 py-2 text-xs">
                              <p className="text-[#6d5f4c]">{product?.name || '—'}</p>
                              {!paid && <p className="text-[10px] text-[#8c3a30] font-semibold">🔒 payment pending</p>}
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
              <div className="flex items-center justify-between">
                <button onClick={() => setOpenSampleId(null)} className={textLink}>← Back to samples</button>
                <button onClick={() => setTab('Overview')} className={outlineBtn}>🧾 View Order — full KYC &amp; Q&amp;A history</button>
              </div>

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

              {!isSamplePaid(openSample) && (
                <p className="text-[11px] text-[#7a5a10]">🔒 Confirm payment for {productForSample(openSample)?.name || 'this product'} in the Payments tab before this sample can move past "Requested".</p>
              )}

              <div className="flex items-center gap-2 flex-wrap">
                <span className={clsx('text-xs font-semibold px-2.5 py-1 rounded-full', SUB_STAGE_PILL[openSample.status])}>{openSample.status}</span>
                {SUB_STAGES.filter((s) => s !== openSample.status).map((s) => {
                  const locked = s !== 'Requested' && !isSamplePaid(openSample);
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
              <p className="text-[11px] text-[#968871]">Payment is per product — whichever product is paid for, only that product's samples unlock past "Requested". The rest stay locked until their own payment is confirmed.</p>

              {products.length === 0 && <p className="text-sm text-[#968871] text-center py-6">No products linked yet — add one in the Products tab first.</p>}

              {products.map((p) => {
                const paid = p.paymentStatus === 'full_paid';
                const entering = payingProductId === p.productId;
                return (
                  <div key={p.productId} className="p-3 rounded-[10px] border border-[#e2dac8] bg-[#f0eadd] space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div>
                        <p className="text-sm font-semibold text-[#2e241b]">{p.name} <span className="text-xs text-[#968871] font-mono font-normal">{p.productId}</span></p>
                        <p className="text-xs text-[#968871]">₹{(p.chargeAmount || p.approxPrice || 0).toLocaleString('en-IN')}</p>
                      </div>
                      <span className={clsx('px-2.5 py-1 rounded-full text-xs font-semibold', paid ? PILL.success : PILL.warning)}>
                        {paid ? '✓ Paid' : '⏳ Pending'}
                      </span>
                    </div>

                    {paid ? (
                      <div className="grid grid-cols-2 gap-3 text-sm p-2.5 rounded-lg bg-[#e7dfce]">
                        <div><p className="text-xs text-[#968871] mb-0.5">Mode</p><p className="text-[#2e241b] capitalize">{(p.paymentMode || '—').replace('_', ' ')}</p></div>
                        <div><p className="text-xs text-[#968871] mb-0.5">Txn / Ref No.</p><p className="text-[#2e241b]">{p.paymentTxnRef || '—'}</p></div>
                        <div><p className="text-xs text-[#968871] mb-0.5">Paid on</p><p className="text-[#2e241b]">{p.paidAt ? format(new Date(p.paidAt), 'dd MMM yyyy') : '—'}</p></div>
                        <div><p className="text-xs text-[#968871] mb-0.5">Received by</p><p className="text-[#2e241b]">{p.receivedBy || '—'}</p></div>
                        {p.paymentNotes && <div className="col-span-2"><p className="text-xs text-[#968871] mb-0.5">Notes</p><p className="text-[#2e241b]">{p.paymentNotes}</p></div>}
                        <div className="col-span-2">
                          <button onClick={() => updateProductMutation.mutate({ productId: p.productId, paymentStatus: 'pending' })} disabled={updateProductMutation.isPending} className={textLink}>
                            Revoke payment
                          </button>
                        </div>
                      </div>
                    ) : entering ? (
                      <div className="p-2.5 rounded-lg border-[1.5px] border-dashed border-[#d3c9b4] bg-[#e7dfce] space-y-2">
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
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => setPayingProductId(null)} className={outlineBtn}>Cancel</button>
                          <button
                            onClick={() => updateProductMutation.mutate({
                              productId: p.productId, paymentStatus: 'full_paid', paymentMode: payMode,
                              paymentTxnRef: payTxnRef.trim() || undefined, paidAt: payDate || undefined,
                              receivedBy: payReceivedBy.trim() || undefined, paymentNotes: payNotes.trim() || undefined,
                            }, { onSuccess: () => setPayingProductId(null) })}
                            disabled={updateProductMutation.isPending}
                            className={accentBtn}
                          >
                            {updateProductMutation.isPending ? 'Confirming…' : '✅ Confirm Payment'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setPayingProductId(p.productId); setPayMode('upi'); setPayTxnRef(''); setPayDate(new Date().toISOString().slice(0, 10)); setPayReceivedBy(''); setPayNotes(''); }}
                        className={outlineBtn}
                      >
                        💳 Record Payment
                      </button>
                    )}
                  </div>
                );
              })}
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
              {approvedSamples.length > 0 && (
                <p className="text-[11px] text-[#968871]">Each product below gets its own Create Quotation → Create Invoice → Send to Production flow — independent of every other product on this lead.</p>
              )}
              {approvedSamples.map((s) => {
                const inv = s.invoiceId;
                const paidPct = inv && inv.totalAmount > 0 ? Math.round((inv.paidAmount / inv.totalAmount) * 100) : 0;
                // No payment wait here anymore — as soon as the final invoice exists (quotation
                // confirmed + invoiced), this product can move straight to Orders. The
                // ≥50% advance-payment gate now sits later, at Work Assignment → Procurement.
                const canSendToProduction = !!s.finalInvoiceId && !s.productionOrderId;
                return (
                  <div key={s.sampleId} className="p-3 rounded-[10px] border bg-[#dce9d4] border-[#b9d2af] space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[#2e241b]">{productForSample(s)?.name || s.sampleId}</p>
                        <p className="text-xs text-[#6d5f4c]">{s.sampleId}{s.formulaVersionNo && ` · V${s.formulaVersionNo}`} — {s.formulaId || 'No formula linked'}</p>
                      </div>
                      {s.productionOrderId ? (
                        <span className="text-xs font-semibold text-[#33526b]">{s.productionOrderId.orderNumber}</span>
                      ) : (
                        <span className="text-xs text-[#3a5f3c] font-semibold">Approved</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-3 flex-wrap pt-2 border-t border-[#b9d2af]">
                      {!inv && (
                        <button onClick={() => createQuotationMutation.mutate(s._id)} disabled={createQuotationMutation.isPending} className={accentBtn}>
                          📄 {createQuotationMutation.isPending ? 'Creating…' : 'Create Quotation'}
                        </button>
                      )}
                      {inv && (
                        <>
                          <div className="text-xs text-[#6d5f4c] flex items-center gap-2 flex-wrap">
                            <span className={clsx('font-semibold px-2 py-0.5 rounded-full text-[10px]', inv.status === 'paid' ? PILL.success : paidPct >= 50 ? PILL.warning : PILL.gray)}>
                              {inv.invoiceNumber} — {paidPct}% paid
                            </span>
                            <span>₹{(inv.paidAmount || 0).toLocaleString('en-IN')} / ₹{(inv.totalAmount || 0).toLocaleString('en-IN')}</span>
                          </div>
                          <div className="flex items-center gap-3 flex-wrap">
                            {!s.productionOrderId && (
                              <button
                                onClick={() => navigate(`/finance/invoices?open=${inv._id}&returnTo=${encodeURIComponent(`/samples?open=${leadId}&leadTab=Approvals`)}`)}
                                className={textLink}
                              >
                                ✏️ Rework Quotation
                              </button>
                            )}
                            {inv.status === 'draft' && !s.finalInvoiceId && (
                              <button onClick={() => sendQuotationMutation.mutate(inv._id)} disabled={sendQuotationMutation.isPending} className={accentBtn}>
                                📤 {sendQuotationMutation.isPending ? 'Sending…' : 'Send Quotation'}
                              </button>
                            )}
                            {inv.status !== 'draft' && inv.status !== 'cancelled' && !s.finalInvoiceId && (
                              <button onClick={() => createInvoiceMutation.mutate(s._id)} disabled={createInvoiceMutation.isPending} className={accentBtn}>
                                🧾 {createInvoiceMutation.isPending ? 'Creating…' : 'Create Invoice'}
                              </button>
                            )}
                            {s.finalInvoiceId && (
                              <button
                                onClick={() => navigate(`/finance/invoices?open=${s.finalInvoiceId._id}&returnTo=${encodeURIComponent(`/samples?open=${leadId}&leadTab=Approvals`)}`)}
                                className={textLink}
                              >
                                🧾 {s.finalInvoiceId.invoiceNumber}
                              </button>
                            )}
                            {canSendToProduction && (
                              <button
                                onClick={() => {
                                  // This sample is already tied to one specific product — no need
                                  // to search the catalog again, just confirm it.
                                  const linkedProduct = productForSample(s);
                                  const catalogMatch = linkedProduct?.catalogProductId
                                    ? (catalogProducts || []).find((p) => String(p._id) === String(linkedProduct.catalogProductId))
                                    : null;
                                  setSendSampleFor(s);
                                  setSendSampleSelectedCatalog(catalogMatch || null);
                                  setSendSampleCatalogSearch('');
                                  setSendSampleBatchSizeKg(10);
                                }}
                                className={accentBtn}
                              >
                                🏭 Send to Production →
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showEditKyc && lead && <EditKycModal lead={lead} onClose={() => { setShowEditKyc(false); invalidate(); }} />}

      {showAddProductInOrders && (
        <NewOrderModal
          initialCustomerSearch={lead?.name || ''}
          onClose={() => setShowAddProductInOrders(false)}
          onCreated={() => { setShowAddProductInOrders(false); toast.success('Added — new order created for this customer'); invalidate(); }}
        />
      )}

      {showFollowUpModal && (
        <div className={clsx('fixed inset-0 z-[70] flex items-center justify-center bg-black/40', followUpMaximized ? 'p-0' : 'p-4')} onClick={() => setShowFollowUpModal(false)}>
          <div className={clsx('bg-[#f0eadd] shadow-2xl border border-[#d3c9b4] flex flex-col',
            followUpMaximized ? 'w-screen h-screen max-w-none rounded-none' : 'w-full max-w-lg rounded-2xl')} style={bodyFont} onClick={(e) => e.stopPropagation()}>
            <div className={clsx('flex items-center justify-between px-5 py-4 border-b border-[#e2dac8] bg-[#e7dfce] flex-shrink-0', !followUpMaximized && 'rounded-t-2xl')}>
              <div>
                <h3 className="font-bold text-[#2e241b]" style={displayFont}>📞 Log Follow-up</h3>
                <p className="text-[11px] text-[#968871] mt-0.5">The client gets a WhatsApp acknowledgment when you save this.</p>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setFollowUpMaximized((m) => !m)} title={followUpMaximized ? 'Restore' : 'Maximize'} className="w-8 h-8 rounded-lg hover:bg-[#ddd3be] flex items-center justify-center text-[#968871] hover:text-[#2e241b] text-sm">{followUpMaximized ? '🗗' : '🗖'}</button>
                <button onClick={() => setShowFollowUpModal(false)} className="text-[#968871] hover:text-[#2e241b] text-xl leading-none">&times;</button>
              </div>
            </div>
            <div className={clsx('p-5 space-y-3', followUpMaximized && 'flex-1 overflow-y-auto')}>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1 block">Type</label>
                  <select value={fuType} onChange={(e) => setFuType(e.target.value)} className={clsx(inputCls, 'w-full')}>
                    {['call', 'whatsapp', 'meeting', 'email', 'demo', 'other'].map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1 block">Date & Time</label>
                  <input type="datetime-local" value={fuScheduledAt} onChange={(e) => setFuScheduledAt(e.target.value)} className={clsx(inputCls, 'w-full')} />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1 block">Notes / Outcome</label>
                <textarea value={fuNotes} onChange={(e) => setFuNotes(e.target.value)} rows={4} placeholder="What was discussed, how the client responded…" className={clsx(inputCls, 'w-full')} autoFocus />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1 block">Next action (optional — shared with the client)</label>
                <input value={fuNextAction} onChange={(e) => setFuNextAction(e.target.value)} placeholder="e.g. Share product catalog and pricing" className={clsx(inputCls, 'w-full')} />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowFollowUpModal(false)} className={outlineBtn}>Cancel</button>
                <span className="flex-1" />
                <button
                  onClick={() => {
                    if (!fuNotes.trim()) { toast.error('Add a note about this follow-up'); return; }
                    followUpMutation.mutate({
                      scheduledAt: fuScheduledAt ? new Date(fuScheduledAt).toISOString() : new Date().toISOString(),
                      type: fuType,
                      notes: fuNotes,
                      outcome: fuNotes,
                      nextAction: fuNextAction,
                    });
                  }}
                  disabled={followUpMutation.isPending}
                  className={accentBtn}
                >
                  {followUpMutation.isPending ? 'Saving…' : 'Save Follow-up'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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

      {quickCreateOpen && (
        <CreateCatalogProductModal
          nextCode={`FG-${String((catalogProducts?.length || 0) + 1).padStart(4, '0')}`}
          saving={createCatalogProductMutation.isPending}
          onClose={() => { setQuickCreateOpen(false); setQaConvertQueryId(null); }}
          onSave={(payload) => createCatalogProductMutation.mutate(payload)}
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
          products={products}
          saving={createFormulaMutation.isPending}
          onClose={() => setShowFormulaForm(false)}
          onSave={(payload) => createFormulaMutation.mutate(payload)}
        />
      )}

      {showSampleForm && (
        <NewSampleModal
          formulas={formulas}
          products={products}
          saving={createSampleMutation.isPending}
          chainedFrom={sampleChainSeed?.chainedFrom}
          initialFormulaId={sampleChainSeed?.formulaId}
          onClose={() => { setShowSampleForm(false); setSampleChainSeed(null); }}
          onGoToPayments={() => { setShowSampleForm(false); setSampleChainSeed(null); setTab('Payments'); }}
          onSave={(payload) => { createSampleMutation.mutate({ ...payload, queryId: qaConvertQueryId || undefined }); setSampleChainSeed(null); }}
        />
      )}

      {sendSampleFor && (
        <div className={clsx('fixed inset-0 z-[80] flex items-center justify-center', sendSampleMaximized ? 'p-0' : 'p-4')} style={bodyFont}>
          <div className="absolute inset-0 bg-[#2e241b]/50 backdrop-blur-sm" onClick={() => setSendSampleFor(null)} />
          <div className={clsx('relative bg-[#f0eadd] shadow-[0_10px_40px_rgba(46,36,27,0.16)] border border-[#d3c9b4]',
            sendSampleMaximized ? 'w-screen h-screen max-w-none rounded-none flex flex-col' : 'w-full max-w-md rounded-2xl')}>
            <div className={clsx('p-5 border-b border-[#e2dac8] bg-[#e7dfce] flex items-center justify-between flex-shrink-0', !sendSampleMaximized && 'rounded-t-2xl')}>
              <div>
                <h3 className="font-bold text-[#2e241b]" style={displayFont}>🏭 Send Product to Production</h3>
                <p className="text-xs text-[#6d5f4c] mt-0.5">{sendSampleFor.sampleId} — invoiced. Orders opens right after — the ≥50% advance is checked later, before Procurement starts.</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button onClick={() => setSendSampleMaximized((m) => !m)} title={sendSampleMaximized ? 'Restore' : 'Maximize'} className="w-9 h-9 rounded-lg hover:bg-[#ddd3be] flex items-center justify-center text-[#968871] hover:text-[#2e241b] text-base">{sendSampleMaximized ? '🗗' : '🗖'}</button>
                <button onClick={() => setSendSampleFor(null)} className="w-9 h-9 rounded-lg hover:bg-[#ddd3be] flex items-center justify-center text-[#968871] hover:text-[#2e241b] text-lg">✕</button>
              </div>
            </div>
            <div className={clsx('p-5 space-y-3', sendSampleMaximized && 'flex-1 overflow-y-auto')}>
              <div>
                <label className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1 block">Product</label>
                {sendSampleSelectedCatalog ? (
                  <>
                    <div className="w-full px-3 py-2 text-sm rounded-[10px] border-[1.5px] border-[#d3c9b4] bg-[#e7dfce] text-[#2e241b] font-semibold">
                      {sendSampleSelectedCatalog.name} <span className="text-xs text-[#968871] font-mono font-normal">{sendSampleSelectedCatalog.code}</span>
                    </div>
                    <p className="text-[11px] text-[#968871] mt-1">{sendSampleSelectedCatalog.formulation?.rows?.length || 0} ingredient(s) in formulation — already linked to this sample's product, nothing to pick.</p>
                  </>
                ) : (
                  <>
                    <input
                      value={sendSampleCatalogSearch}
                      onChange={(e) => { setSendSampleCatalogSearch(e.target.value); setSendSampleSelectedCatalog(null); }}
                      placeholder="Search catalog products…"
                      className={clsx(inputCls, 'w-full bg-white')}
                    />
                    <p className="text-[11px] text-[#8c3a30] mt-1">This sample's product isn't linked to a real catalog entry — pick the closest match.</p>
                    {sendSampleCatalogSearch && (
                      <div className="mt-1 rounded-[10px] border border-[#d3c9b4] bg-white max-h-32 overflow-y-auto">
                        {sendSampleCatalogMatches.length === 0 && <div className="px-3 py-2 text-xs text-[#968871]">No products found</div>}
                        {sendSampleCatalogMatches.slice(0, 8).map((p) => (
                          <button key={p._id} type="button" onClick={() => { setSendSampleSelectedCatalog(p); setSendSampleCatalogSearch(''); }}
                            className="w-full text-left px-3 py-2 text-xs hover:bg-[#e7dfce] flex justify-between">
                            <span className="text-[#2e241b]">{p.name}</span>
                            <span className="text-[#968871] font-mono">{p.code}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
              <div>
                <label className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1 block">Batch size (kg)</label>
                <input type="number" min="0.1" step="0.1" value={sendSampleBatchSizeKg} onChange={(e) => setSendSampleBatchSizeKg(e.target.value)}
                  className={clsx(inputCls, 'w-full bg-white')} />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setSendSampleFor(null)} className={clsx(outlineBtn, 'flex-1 justify-center')}>Cancel</button>
                <button
                  onClick={() => {
                    if (!sendSampleSelectedCatalog) { toast.error('Select a catalog product'); return; }
                    if (!sendSampleBatchSizeKg || Number(sendSampleBatchSizeKg) <= 0) { toast.error('Enter a valid batch size'); return; }
                    linkSampleProductionMutation.mutate({ sampleId: sendSampleFor._id, catalogProduct: sendSampleSelectedCatalog._id, batchSizeKg: Number(sendSampleBatchSizeKg) });
                  }}
                  disabled={linkSampleProductionMutation.isPending}
                  className={clsx(accentBtn, 'flex-1 justify-center')}
                >
                  {linkSampleProductionMutation.isPending ? 'Sending…' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {courierModalFor && (
        <div className={clsx('fixed inset-0 z-[80] flex items-center justify-center', courierMaximized ? 'p-0' : 'p-4')} style={bodyFont}>
          <div className="absolute inset-0 bg-[#2e241b]/50 backdrop-blur-sm" onClick={() => setCourierModalFor(null)} />
          <div className={clsx('relative bg-[#f0eadd] shadow-[0_10px_40px_rgba(46,36,27,0.16)] border border-[#d3c9b4]',
            courierMaximized ? 'w-screen h-screen max-w-none rounded-none flex flex-col' : 'w-full max-w-md rounded-2xl')}>
            <div className={clsx('p-5 border-b border-[#e2dac8] bg-[#e7dfce] flex items-center justify-between flex-shrink-0', !courierMaximized && 'rounded-t-2xl')}>
              <div>
                <h3 className="font-bold text-[#2e241b]" style={displayFont}>🚚 Dispatch Sample</h3>
                <p className="text-xs text-[#6d5f4c] mt-0.5">{courierModalFor} — record courier details to mark this sample Sent.</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button onClick={() => setCourierMaximized((m) => !m)} title={courierMaximized ? 'Restore' : 'Maximize'} className="w-9 h-9 rounded-lg hover:bg-[#ddd3be] flex items-center justify-center text-[#968871] hover:text-[#2e241b] text-base">{courierMaximized ? '🗗' : '🗖'}</button>
                <button onClick={() => setCourierModalFor(null)} className="w-9 h-9 rounded-lg hover:bg-[#ddd3be] flex items-center justify-center text-[#968871] hover:text-[#2e241b] text-lg">✕</button>
              </div>
            </div>
            <div className={clsx('p-5 space-y-3', courierMaximized && 'flex-1 overflow-y-auto')}>
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
        <div className={clsx('fixed inset-0 z-[80] flex items-center justify-center', feedbackMaximized ? 'p-0' : 'p-4')} style={bodyFont}>
          <div className="absolute inset-0 bg-[#2e241b]/50 backdrop-blur-sm" onClick={() => setFeedbackModalFor(null)} />
          <div className={clsx('relative bg-[#f0eadd] shadow-[0_10px_40px_rgba(46,36,27,0.16)] border border-[#d3c9b4]',
            feedbackMaximized ? 'w-screen h-screen max-w-none rounded-none flex flex-col' : 'w-full max-w-md rounded-2xl')}>
            <div className={clsx('p-5 border-b border-[#e2dac8] bg-[#e7dfce] flex items-center justify-between flex-shrink-0', !feedbackMaximized && 'rounded-t-2xl')}>
              <div>
                <h3 className="font-bold text-[#2e241b]" style={displayFont}>💬 Log Customer Feedback</h3>
                <p className="text-xs text-[#6d5f4c] mt-0.5">{feedbackModalFor} — moves this sample to "Feedback".</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button onClick={() => setFeedbackMaximized((m) => !m)} title={feedbackMaximized ? 'Restore' : 'Maximize'} className="w-9 h-9 rounded-lg hover:bg-[#ddd3be] flex items-center justify-center text-[#968871] hover:text-[#2e241b] text-base">{feedbackMaximized ? '🗗' : '🗖'}</button>
                <button onClick={() => setFeedbackModalFor(null)} className="w-9 h-9 rounded-lg hover:bg-[#ddd3be] flex items-center justify-center text-[#968871] hover:text-[#2e241b] text-lg">✕</button>
              </div>
            </div>
            <div className={clsx('p-5 space-y-3', feedbackMaximized && 'flex-1 overflow-y-auto')}>
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
        <div className={clsx('fixed inset-0 z-[80] flex items-center justify-center', approveMaximized ? 'p-0' : 'p-4')} style={bodyFont}>
          <div className="absolute inset-0 bg-[#2e241b]/50 backdrop-blur-sm" onClick={() => setApproveModalFor(null)} />
          <div className={clsx('relative bg-[#f0eadd] shadow-[0_10px_40px_rgba(46,36,27,0.16)] border border-[#d3c9b4]',
            approveMaximized ? 'w-screen h-screen max-w-none rounded-none flex flex-col' : 'w-full max-w-md rounded-2xl')}>
            <div className={clsx('p-5 border-b border-[#e2dac8] bg-[#e7dfce] flex items-center justify-between flex-shrink-0', !approveMaximized && 'rounded-t-2xl')}>
              <div>
                <h3 className="font-bold text-[#2e241b]" style={displayFont}>✅ Approve Sample</h3>
                <p className="text-xs text-[#6d5f4c] mt-0.5">
                  {approveModalFor}
                  {samples.find((s) => s.sampleId === approveModalFor)?.formulaId ? ' — the linked formula version will be marked Accepted.' : ''}
                </p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button onClick={() => setApproveMaximized((m) => !m)} title={approveMaximized ? 'Restore' : 'Maximize'} className="w-9 h-9 rounded-lg hover:bg-[#ddd3be] flex items-center justify-center text-[#968871] hover:text-[#2e241b] text-base">{approveMaximized ? '🗗' : '🗖'}</button>
                <button onClick={() => setApproveModalFor(null)} className="w-9 h-9 rounded-lg hover:bg-[#ddd3be] flex items-center justify-center text-[#968871] hover:text-[#2e241b] text-lg">✕</button>
              </div>
            </div>
            <div className={clsx('p-5 space-y-3', approveMaximized && 'flex-1 overflow-y-auto')}>
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
        <div className={clsx('fixed inset-0 z-[80] flex items-center justify-center', rejectMaximized ? 'p-0' : 'p-4')} style={bodyFont}>
          <div className="absolute inset-0 bg-[#2e241b]/50 backdrop-blur-sm" onClick={() => setRejectModalFor(null)} />
          <div className={clsx('relative bg-[#f0eadd] shadow-[0_10px_40px_rgba(46,36,27,0.16)] border border-[#d3c9b4]',
            rejectMaximized ? 'w-screen h-screen max-w-none rounded-none flex flex-col' : 'w-full max-w-md rounded-2xl')}>
            <div className={clsx('p-5 border-b border-[#e2dac8] bg-[#e7dfce] flex items-center justify-between flex-shrink-0', !rejectMaximized && 'rounded-t-2xl')}>
              <div>
                <h3 className="font-bold text-[#2e241b]" style={displayFont}>✕ Reject Sample</h3>
                <p className="text-xs text-[#6d5f4c] mt-0.5">{rejectModalFor}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button onClick={() => setRejectMaximized((m) => !m)} title={rejectMaximized ? 'Restore' : 'Maximize'} className="w-9 h-9 rounded-lg hover:bg-[#ddd3be] flex items-center justify-center text-[#968871] hover:text-[#2e241b] text-base">{rejectMaximized ? '🗗' : '🗖'}</button>
                <button onClick={() => setRejectModalFor(null)} className="w-9 h-9 rounded-lg hover:bg-[#ddd3be] flex items-center justify-center text-[#968871] hover:text-[#2e241b] text-lg">✕</button>
              </div>
            </div>
            <div className={clsx('p-5 space-y-3', rejectMaximized && 'flex-1 overflow-y-auto')}>
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
