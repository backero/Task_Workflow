import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import api from '../../../api/axios';
import { LockClosedIcon, TruckIcon } from '@heroicons/react/24/outline';
import { Card, PILL } from '../sampleTheme';
import OrderSpecTabs, {
  Field, inputCls, primaryBtn, secondaryBtn,
  QC_SPECS, LAB_SPECS, FQC_SPECS, PKG_SPEC_FIELDS,
  SENSORY_KEYS, PHYSICO_KEYS, MICRO_KEYS, STABILITY_KEYS, byKeys,
} from './orderSpecFields';
import NewOrderModal from './NewOrderModal';

// The 8-stage production board, ported from the standalone Batch Tracker page so it can render
// inline inside SampleLeadDetail's Production tab — same API calls, same onSaved/onAdvanced ->
// invalidate pattern as before, restyled from Batch Tracker's gray/blue+dark-mode theme onto
// SampleProduction's cream/amber palette so the merged lead+order panel reads as one page.

export const STAGE_NAMES = ['Customer Details', 'Work Assignment', 'Procurement', 'Weighing', 'Bulk QC', 'Packaging', 'Final QC', 'Dispatch'];

export const STAGE_BUCKET_COLOR = (stage) => {
  if (stage <= 1) return PILL.gray;
  if (stage <= 3) return PILL.info;
  if (stage === 4) return PILL.purple;
  if (stage === 5) return PILL.warning;
  if (stage === 6) return 'bg-[#dde5ea] text-[#33526b]';
  return PILL.success;
};

const PRIORITY_STYLE = {
  Urgent: PILL.danger, High: PILL.warning, Normal: PILL.info, Low: PILL.gray,
};

// Backward/forward-safe: a spec with no explicit status is treated as Required (matches the HTML reference).
const isRequired = (crmSpec, key) => (crmSpec?.[key + 'Status'] || 'Required') === 'Required';
const specValue = (crmSpec, key, fallback) => crmSpec?.[key + 'Spec'] || fallback;

// ── STAGE BAR ─────────────────────────────────────────────────────────────────

// Customer Details (0) is shown in this bar — always unlocked once an order exists, sitting
// before Procurement — so the SPEC/QC sheet stays reachable for every order, not just brand-new
// ones. Work Assignment (1) stays a back-office setup step, hidden from this bar; if the order's
// actual current stage is still 1, that stage's form still renders below (see callers) even
// without a nav button for it, since it can't be skipped.
const TRACKED_STAGES = STAGE_NAMES.map((name, i) => ({ name, i })).filter(({ i }) => i === 0 || i >= 2);

export function StageBar({ order, viewStage, setViewStage }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1">
      {TRACKED_STAGES.map(({ name, i }, displayIndex) => {
        const done = i < order.stage;
        const active = i === viewStage;
        const locked = i > order.stage;
        return (
          <button key={name} disabled={locked} onClick={() => setViewStage(i)}
            className={clsx('flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap border transition-colors flex-shrink-0',
              active ? 'bg-[#f3e3c2] border-[#f2b23e] text-[#7a5a10]' :
              done ? 'bg-[#dce9d4] border-[#b9d2af] text-[#3a5f3c]' :
              locked ? 'bg-[#e7dfce] border-[#e2dac8] text-[#c2b9a3] cursor-not-allowed' :
              'bg-[#f0eadd] border-[#d3c9b4] text-[#6d5f4c]')}>
            <span className={clsx('w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0',
              done ? 'bg-[#5c8a5f] text-white' : active ? 'bg-[#f2b23e] text-[#2e241b]' : 'bg-[#e2dac8] text-[#6d5f4c]')}>
              {done ? '✓' : displayIndex + 1}
            </span>
            {name}
          </button>
        );
      })}
    </div>
  );
}

// ── STAGE 0: JOB CREATION SHEET (always-editable until confirmed & locked) ──

export function StageOrder({ order, onSaved }) {
  const [form, setForm] = useState({
    customer: order.customer || '', contact: order.contact || '', container: order.container || '',
    priority: order.priority || 'Normal', deliveryDate: order.deliveryDate || '', notes: order.notes || '',
  });
  const [crmSpec, setCrmSpec] = useState(order.crmSpec || {});
  const [busy, setBusy] = useState(false);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const locked = !!crmSpec.specsConfirmed;

  const patchSpec = (key, val) => setCrmSpec((c) => ({ ...c, [key]: val }));

  const save = async (extra = {}) => {
    setBusy(true);
    try {
      await api.patch(`/production/${order._id}/order`, { ...form, crmSpec: { ...crmSpec, ...extra } });
      toast.success('Order saved');
      onSaved();
    } catch (e) { toast.error(e.response?.data?.message || 'Save failed'); }
    finally { setBusy(false); }
  };

  const confirmJobSheet = () => {
    if (!window.confirm('Lock these specs? Bulk QC and Final QC will only show fields marked Required. Changing them later needs a manager.')) return;
    setCrmSpec((c) => ({ ...c, specsConfirmed: true, specsConfirmedAt: new Date().toISOString() }));
    save({ specsConfirmed: true, specsConfirmedAt: new Date().toISOString() });
  };

  const unlockJobSheet = () => {
    if (!window.confirm('Unlock this job sheet for editing? Bulk QC / Final QC already recorded under the previous specs are not affected — this only re-opens the fields for edits.')) return;
    setCrmSpec((c) => ({ ...c, specsConfirmed: false }));
    save({ specsConfirmed: false });
  };

  return (
    <div className="flex gap-4 items-start">
      <div className="w-52 flex-shrink-0">
        <p className="text-[10px] font-bold uppercase tracking-wide text-[#968871] mb-2">Products (from catalogue)</p>
        <div className="rounded-lg border-[1.5px] border-[#f2b23e] bg-[#f3e3c2] px-2.5 py-2">
          <p className="text-xs font-bold text-[#2e241b] truncate">{order.catalogProduct?.name || order.orderNumber}</p>
          <p className="text-[10px] text-[#968871] truncate">{order.catalogProduct?.code || order.batch}{order.batchSizeKg ? ` · ${order.batchSizeKg} kg` : ''}</p>
        </div>
        <button onClick={() => setShowAddProduct(true)} className="w-full mt-2 border-2 border-dashed border-[#968871] text-[#7a5a10] rounded-lg py-2 text-xs font-bold hover:bg-[#f3e3c2]">+ Add product</button>
        <p className="text-[9.5px] text-[#968871] mt-2 leading-relaxed">Adds a new product for {order.customer || 'this customer'} — becomes its own order &amp; job sheet, linked by the same order group.</p>
      </div>

      <div className="flex-1 min-w-0 space-y-4">
        {locked && (
          <Card className="border-[#b9d2af] bg-[#dce9d4] flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-bold text-[#3a5f3c]">🔒 Job Sheet Confirmed &amp; Locked</p>
              <p className="text-xs text-[#6d5f4c]">Confirmed {crmSpec.specsConfirmedAt ? new Date(crmSpec.specsConfirmedAt).toLocaleString('en-IN') : ''}</p>
            </div>
            <button onClick={unlockJobSheet} disabled={busy} className={secondaryBtn}>🔓 Unlock &amp; Edit</button>
          </Card>
        )}

        <OrderSpecTabs
          crmSpec={crmSpec}
          onChange={patchSpec}
          locked={locked}
          detailsContent={
            <Card>
              <h3 className="text-sm font-bold text-[#2e241b] mb-3">Client Profile</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Customer"><input disabled={locked} value={form.customer} onChange={(e) => setForm((f) => ({ ...f, customer: e.target.value }))} className={inputCls} /></Field>
                <Field label="Contact"><input disabled={locked} value={form.contact} onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))} className={inputCls} /></Field>
                <Field label="Container"><input disabled={locked} value={form.container} onChange={(e) => setForm((f) => ({ ...f, container: e.target.value }))} className={inputCls} /></Field>
                <Field label="Priority">
                  <select disabled={locked} value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} className={inputCls}>
                    {['Low', 'Normal', 'High', 'Urgent'].map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </Field>
                <Field label="Delivery Date"><input disabled={locked} type="date" value={form.deliveryDate} onChange={(e) => setForm((f) => ({ ...f, deliveryDate: e.target.value }))} className={inputCls} /></Field>
              </div>
              <div className="mt-3"><Field label="Notes"><textarea disabled={locked} rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className={inputCls} /></Field></div>
            </Card>
          }
        />

        <div className="flex items-center gap-3">
          <button onClick={() => save()} disabled={busy || locked} className={secondaryBtn}>{busy ? 'Saving…' : 'Save Draft'}</button>
          {!locked && (
            <button onClick={confirmJobSheet} disabled={busy} className={primaryBtn}>✅ Confirm Job Sheet & Lock Specs</button>
          )}
        </div>
      </div>

      {showAddProduct && (
        <NewOrderModal
          initialCustomerSearch={order.customer || ''}
          onClose={() => setShowAddProduct(false)}
          onCreated={() => { setShowAddProduct(false); toast.success('Added — new order created for this customer'); onSaved(); }}
        />
      )}
    </div>
  );
}

// ── STAGE 1: WORK ASSIGNMENT ──────────────────────────────────────────────────

export function StageWorkAssignment({ order, onSaved }) {
  const wa = order.workAssignment || {};
  // Whoever this client is assigned to end-to-end (order.assignedTo, inherited from
  // Lead.assignedTo — set back at KYC) is the default in-charge for every stage below, so the
  // KYC assignee carries through to Dispatch with no extra picking — each field still stays
  // individually editable for the odd case where a different person covers just one stage.
  const ownerName = order.assignedTo ? `${order.assignedTo.firstName || ''} ${order.assignedTo.lastName || ''}`.trim() : '';
  const [form, setForm] = useState({
    startDate: wa.startDate || '', endDate: wa.endDate || '', weighDate: wa.weighDate || '', prodDate: wa.prodDate || '', packDate: wa.packDate || '', qcDate: wa.qcDate || '', dispatchDate: wa.dispatchDate || order.deliveryDate || '',
    weighPerson: wa.weighPerson || ownerName, prodPerson: wa.prodPerson || ownerName, qcPerson: wa.qcPerson || ownerName, packPerson: wa.packPerson || ownerName, dispatchPerson: wa.dispatchPerson || ownerName, supervisor: wa.supervisor || ownerName,
  });
  const [busy, setBusy] = useState(false);

  // ≥50% advance-payment gate — backend enforces this too (production.routes.js), this is just
  // the inline warning so staff see it before hitting Save instead of only after a 400 comes back.
  const inv = order.invoiceId;
  const paidPct = inv && inv.totalAmount > 0 ? Math.round((inv.paidAmount / inv.totalAmount) * 100) : 0;
  const paymentBlocked = order.stage === 1 && !!inv && paidPct < 50;

  // Team Assignment picks from real Production-department accounts instead of free text, so a
  // typo can't silently assign work to nobody — same "department: 'Production'" people Kitchen
  // Schedule's leader/support pickers already draw from.
  const { data: orgUsers } = useQuery({
    queryKey: ['users', 'org', 'all'],
    queryFn: () => api.get('/users', { params: { limit: 200 } }).then((r) => r.data.data || []),
    staleTime: 5 * 60 * 1000,
  });
  const productionUsers = (orgUsers || []).filter((u) => u.department === 'Production' && u.isActive !== false);
  const productionNames = new Set(productionUsers.map((u) => `${u.firstName || ''} ${u.lastName || ''}`.trim()));

  const save = async () => {
    setBusy(true);
    try { await api.patch(`/production/${order._id}/work-assignment`, form); toast.success('Work assigned — advancing to Procurement'); onSaved(); }
    catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
    finally { setBusy(false); }
  };

  const dateField = (key, label) => <Field label={label}><input type="date" value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} className={inputCls} /></Field>;
  // If the saved value isn't a current Production account (legacy free-typed name, or someone
  // deactivated/moved departments since), keep it selectable so saving doesn't silently wipe it.
  const personField = (key, label) => {
    const current = form[key];
    return (
      <Field label={label}>
        <select value={current} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} className={inputCls}>
          <option value="">— Unassigned —</option>
          {current && !productionNames.has(current) && <option value={current}>{current} (not in Production)</option>}
          {productionUsers.map((u) => {
            const name = `${u.firstName || ''} ${u.lastName || ''}`.trim();
            return <option key={u._id} value={name}>{name}</option>;
          })}
        </select>
      </Field>
    );
  };

  return (
    <Card>
      <h3 className="text-sm font-bold text-[#2e241b] mb-3">Production Schedule</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {dateField('startDate', 'Production Start')}{dateField('weighDate', 'Weighing Date')}{dateField('prodDate', 'Production Date')}
        {dateField('packDate', 'Packaging Date')}{dateField('qcDate', 'QC Target Date')}{dateField('dispatchDate', 'Dispatch Target')}
      </div>
      <h3 className="text-sm font-bold text-[#2e241b] mt-5 mb-3">Team Assignment</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {personField('weighPerson', 'Weighing In-charge')}{personField('prodPerson', 'Production In-charge')}{personField('qcPerson', 'QC In-charge')}
        {personField('packPerson', 'Packaging In-charge')}{personField('dispatchPerson', 'Dispatch In-charge')}{personField('supervisor', 'Supervisor')}
      </div>
      {paymentBlocked && (
        <p className="text-xs text-[#8c3a30] font-semibold mt-3 bg-[#f0d8d2] border border-[#e0b6ab] rounded-xl px-3 py-2">
          ⚠ Needs ≥50% advance payment confirmed before Procurement can start ({paidPct}% paid so far — {inv.invoiceNumber}).
        </p>
      )}
      <button onClick={save} disabled={busy || paymentBlocked} className={clsx(primaryBtn, 'mt-4')}>{busy ? 'Saving…' : paymentBlocked ? 'Awaiting Payment' : 'Confirm Schedule → Procurement'}</button>
    </Card>
  );
}

// ── STAGE 2: PROCUREMENT ─────────────────────────────────────────────────────

export function StageProcurement({ order, onAdvanced }) {
  const [busy, setBusy] = useState(false);
  const { data: rmData } = useQuery({
    queryKey: ['inventory', 'raw-materials', 'all'],
    queryFn: () => api.get('/inventory/raw-materials', { params: { limit: 500 } }).then((r) => r.data.materials || []),
  });
  const materials = rmData || [];
  const rows = order.ingredients.map((ing) => {
    const mat = materials.find((m) => m._id === ing.rawMaterialId);
    const stock = mat?.currentStock ?? 0;
    const shortfall = Math.max(0, ing.targetQty - stock);
    return { ...ing, stock, shortfall, short: shortfall > 0 };
  });
  const shortRows = rows.filter((r) => r.short);

  const confirm = async () => {
    setBusy(true);
    try { await api.post(`/production/${order._id}/procurement/confirm`); toast.success('Procurement confirmed — advancing to Weighing'); onAdvanced(); }
    catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
    finally { setBusy(false); }
  };

  return (
    <Card>
      <h3 className="text-sm font-bold text-[#2e241b] mb-1">Formula & Raw Material Check</h3>
      <p className="text-xs text-[#6d5f4c] mb-3">Scaled from Product Catalog for a {order.batchSizeKg || '—'}kg batch.</p>
      {rows.length === 0 ? (
        <p className="text-xs text-[#968871] py-4">No formulation ingredients found for this order's catalog product.</p>
      ) : (
        <table className="w-full text-xs">
          <thead><tr className="text-left text-[10px] uppercase text-[#968871] border-b border-[#e2dac8]">
            <th className="py-1.5">Material</th><th className="py-1.5">Required</th><th className="py-1.5">In Stock</th><th className="py-1.5">To Procure</th><th className="py-1.5">Status</th>
          </tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-[#e2dac8]">
                <td className="py-1.5 text-[#2e241b]">{r.name}</td>
                <td className="py-1.5 font-mono">{r.targetQty} {r.unit}</td>
                <td className="py-1.5 font-mono">{r.stock} {r.unit}</td>
                <td className="py-1.5 font-mono">{r.short ? <span className="text-red-600 font-semibold">{r.shortfall} {r.unit}</span> : '—'}</td>
                <td className="py-1.5">{r.short ? <span className="text-red-600 font-semibold">Order More</span> : <span className="text-[#3a5f3c] font-semibold">OK</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {shortRows.length > 0 && (
        <div className="mt-3 bg-[#f0d8d2] border border-[#e0b6ab] rounded-xl px-3 py-2 text-xs text-[#8c3a30]">
          ⚠ {shortRows.length} material(s) below required quantity — procure before proceeding, this blocks confirming until resolved:
          <ul className="mt-1 ml-4 list-disc">
            {shortRows.map((r, i) => <li key={i}>{r.name}: need {r.shortfall} {r.unit} more (have {r.stock}, need {r.targetQty})</li>)}
          </ul>
        </div>
      )}
      <button onClick={confirm} disabled={busy || shortRows.length > 0} title={shortRows.length > 0 ? 'Resolve the stock shortage above first' : undefined} className={clsx(primaryBtn, 'mt-4')}>
        {busy ? 'Confirming…' : shortRows.length > 0 ? 'Materials Short — Cannot Proceed' : 'Formula Correct & Materials Available → Weighing'}
      </button>
    </Card>
  );
}

// ── STAGE 3: WEIGHING + PROCESS STEPS ─────────────────────────────────────────

export function StageWeighing({ order, onSaved }) {
  const [busyKey, setBusyKey] = useState(null);
  const weighedCount = order.ingredients.filter((i) => i.actualQty != null).length;
  const allWeighed = order.ingredients.length > 0 && weighedCount === order.ingredients.length;
  const doneSteps = order.processSteps.filter((s) => s.done).length;
  const allSteps = order.processSteps.length > 0 && doneSteps === order.processSteps.length;

  const weigh = async (ing) => {
    setBusyKey(ing.rawMaterialId);
    try { await api.post(`/production/${order._id}/weighing`, { rawMaterialId: ing.rawMaterialId, actualQty: ing.targetQty }); toast.success(`${ing.name} weighed`); onSaved(); }
    catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
    finally { setBusyKey(null); }
  };

  const completeStep = async (index) => {
    setBusyKey('step' + index);
    try { await api.post(`/production/${order._id}/process-step`, { index }); toast.success('Step marked complete'); onSaved(); }
    catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
    finally { setBusyKey(null); }
  };

  const advance = async () => {
    setBusyKey('advance');
    try { await api.post(`/production/${order._id}/advance`); toast.success('Advanced to Bulk QC'); onSaved(); }
    catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
    finally { setBusyKey(null); }
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-[#2e241b]">Ingredient Weighing</h3>
          <span className={clsx('text-[11px] font-semibold', allWeighed ? 'text-[#3a5f3c]' : 'text-[#7a5a10]')}>{weighedCount}/{order.ingredients.length}</span>
        </div>
        <table className="w-full text-xs">
          <thead><tr className="text-left text-[10px] uppercase text-[#968871] border-b border-[#e2dac8]"><th className="py-1.5">Material</th><th className="py-1.5">Target</th><th className="py-1.5">Status</th><th className="py-1.5"></th></tr></thead>
          <tbody>
            {order.ingredients.map((ing, i) => (
              <tr key={i} className="border-b border-[#e2dac8]">
                <td className="py-1.5 text-[#2e241b]">{ing.name}</td>
                <td className="py-1.5 font-mono">{ing.targetQty} {ing.unit}</td>
                <td className="py-1.5">{ing.actualQty != null ? <span className="text-[#3a5f3c] font-semibold">Weighed ({ing.actualQty}{ing.unit})</span> : <span className="text-[#7a5a10] font-semibold">Pending</span>}</td>
                <td className="py-1.5 text-right">
                  {ing.actualQty == null && (
                    <button onClick={() => weigh(ing)} disabled={busyKey === ing.rawMaterialId} className="text-[#7a5a10] font-semibold disabled:opacity-50">{busyKey === ing.rawMaterialId ? '…' : 'Mark Weighed'}</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-[#2e241b]">Process Steps</h3>
          <span className={clsx('text-[11px] font-semibold', allSteps ? 'text-[#3a5f3c]' : 'text-[#7a5a10]')}>{doneSteps}/{order.processSteps.length}</span>
        </div>
        <div className="space-y-1.5">
          {order.processSteps.map((step, i) => {
            const locked = !allWeighed || (i > 0 && !order.processSteps[i - 1].done);
            return (
              <div key={i} className={clsx('flex items-center justify-between px-3 py-2 rounded-lg border text-xs',
                step.done ? 'border-[#b9d2af] bg-[#dce9d4]' : locked ? 'border-[#e2dac8] opacity-50' : 'border-[#d3c9b4]')}>
                <span className="flex items-center gap-2 text-[#2e241b]">
                  <span className={clsx('w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold', step.done ? 'bg-[#5c8a5f] text-white' : 'bg-[#e2dac8] text-[#6d5f4c]')}>{step.done ? '✓' : i + 1}</span>
                  {step.name}
                </span>
                {!step.done && !locked && (
                  <button onClick={() => completeStep(i)} disabled={busyKey === 'step' + i} className="text-[#7a5a10] font-semibold disabled:opacity-50">{busyKey === 'step' + i ? '…' : 'Mark Complete'}</button>
                )}
                {locked && <LockClosedIcon className="w-3.5 h-3.5 text-[#c2b9a3]" />}
              </div>
            );
          })}
        </div>
      </Card>

      {allWeighed && allSteps && (
        <Card className="border-[#b9d2af]">
          <div className="flex items-center justify-between">
            <div><p className="text-sm font-bold text-[#3a5f3c]">✓ All weighing & process steps complete</p><p className="text-xs text-[#6d5f4c]">Ready for Bulk QC</p></div>
            <button onClick={advance} disabled={busyKey === 'advance'} className={primaryBtn}>{busyKey === 'advance' ? 'Advancing…' : 'Complete → Bulk QC'}</button>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── STAGE 4: BULK QC ──────────────────────────────────────────────────────────

// Bulk QC is entirely fetched from Customer Details' Sensory Targets, Physicochemical, and QC
// Plan — Micro & Stability sections — no separate hand-maintained field list here anymore, so
// nothing can drift out of sync with what those sections actually contain. Fields with a
// `legacy` name keep writing to that existing ProductionOrder.bulkQC column (unchanged data
// shape for anything already saved); everything else goes into bulkQC.extra, keyed by its
// crmSpec key.
const BULK_QC_FIELDS = [
  ...byKeys(QC_SPECS, SENSORY_KEYS).map((s) => ({ spec: s, legacy: { qcColor: 'color', qcOdor: 'odor', qcTexture: 'texture', qcAppearance: 'appearance' }[s.key] })),
  ...byKeys(QC_SPECS, PHYSICO_KEYS).map((s) => ({ spec: s, legacy: { qcPh: 'ph', qcViscosity: 'viscosity', qcDensity: 'density' }[s.key] })),
  ...byKeys(QC_SPECS, MICRO_KEYS).map((s) => ({ spec: s, legacy: { qcTpc: 'tpc', qcYm: 'ym', qcPathogen: 'pathogen' }[s.key] })),
  ...byKeys(LAB_SPECS, STABILITY_KEYS).map((s) => ({ spec: s, legacy: { labStability: 'stability', labPreservative: 'preservative', labHeavyMetal: 'heavy' }[s.key] })),
];

function BulkQCField({ spec, legacy, crmSpec, form, setForm }) {
  const value = legacy ? (form[legacy] ?? '') : (form.extra?.[spec.key] ?? '');
  const onChange = (v) => {
    if (legacy) setForm((f) => ({ ...f, [legacy]: v }));
    else setForm((f) => ({ ...f, extra: { ...f.extra, [spec.key]: v } }));
  };
  return (
    <div className="rounded-lg border border-[#d3c9b4] bg-[#f0eadd] p-2.5">
      <label className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1 block">
        {spec.label} <span className="text-[#7a5a10] normal-case font-normal">· Spec: {specValue(crmSpec, spec.key, '—')}</span>
      </label>
      <input value={value} onChange={(e) => onChange(e.target.value)} className={clsx(inputCls, 'bg-white')} />
    </div>
  );
}

export function StageBulkQC({ order, onSaved }) {
  const crmSpec = order.crmSpec || {};
  const bq = order.bulkQC || {};
  const [form, setForm] = useState({
    ph: bq.ph ?? '', viscosity: bq.viscosity ?? '', density: bq.density ?? '', appearance: bq.appearance || '',
    color: bq.color || '', odor: bq.odor || '', texture: bq.texture || '', tpc: bq.tpc || '', ym: bq.ym || '',
    pathogen: bq.pathogen || '', heavy: bq.heavy || '', preservative: bq.preservative || '', stability: bq.stability || '',
    extra: bq.extra || {},
  });
  const [busy, setBusy] = useState(false);

  const submit = async (result) => {
    if (result === 'PASS' && isRequired(crmSpec, 'qcPh') && !form.ph) { toast.error('Enter pH value'); return; }
    setBusy(true);
    try {
      await api.post(`/production/${order._id}/bulk-qc`, { ...form, result });
      toast.success(result === 'PASS' ? 'Bulk QC passed — advancing to Packaging' : 'Batch held at Bulk QC');
      onSaved();
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
    finally { setBusy(false); }
  };

  return (
    <Card>
      <h3 className="text-sm font-bold text-[#2e241b] mb-1">Bulk Quality Control</h3>
      <p className="text-xs text-[#6d5f4c] mb-3">Fetched from Customer Details — Sensory Targets, Physicochemical, and QC Plan (Micro &amp; Stability). Spec values shown are the reference to cross-check the actual reading against.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {BULK_QC_FIELDS.map(({ spec, legacy }) => (
          <BulkQCField key={spec.key} spec={spec} legacy={legacy} crmSpec={crmSpec} form={form} setForm={setForm} />
        ))}
      </div>
      <div className="flex gap-3 mt-4">
        <button onClick={() => submit('PASS')} disabled={busy} className="px-4 py-2 bg-[#5c8a5f] hover:brightness-95 text-white text-sm font-semibold rounded-xl disabled:opacity-50">Pass → Packaging</button>
        <button onClick={() => submit('FAIL')} disabled={busy} className="px-4 py-2 bg-[#c0574a] hover:brightness-95 text-white text-sm font-semibold rounded-xl disabled:opacity-50">Fail / Hold</button>
      </div>
    </Card>
  );
}

// ── STAGE 5: PACKAGING ────────────────────────────────────────────────────────

export function StagePackaging({ order, onSaved }) {
  const p = order.packaging || {};
  const crmSpec = order.crmSpec || {};
  const pkgSpecRows = PKG_SPEC_FIELDS.filter((f) => crmSpec[f.key]);
  const pkgCustomRows = (crmSpec.pkgExtra || []).filter((c) => c.label || c.spec);
  const pkgAttachments = crmSpec.pkgAttachments || [];
  const batchGrams = (order.batchSizeKg || 0) * 1000;
  const [form, setForm] = useState({
    mrp: p.mrp || '', fillWeight: p.fillWeight || '', filled: p.filled || 0, rejected: p.rejected || 0,
    mfgDate: p.mfgDate || new Date().toISOString().slice(0, 10), expDate: p.expDate || '', batchCode: p.batchCode || `${order.batch}-PKG`, cartonQty: p.cartonQty || '',
  });
  const [busy, setBusy] = useState(false);

  const expected = form.fillWeight ? Math.floor(batchGrams / Number(form.fillWeight)) : null;
  const totalCartons = form.filled && form.cartonQty ? Math.ceil(Number(form.filled) / Number(form.cartonQty)) : null;
  const yieldPct = (Number(form.filled) + Number(form.rejected)) > 0 ? ((Number(form.filled) / (Number(form.filled) + Number(form.rejected))) * 100).toFixed(1) : '0.0';

  const submit = async () => {
    setBusy(true);
    try {
      await api.post(`/production/${order._id}/packaging`, { ...form, filled: Number(form.filled), rejected: Number(form.rejected), cartonQty: Number(form.cartonQty) || undefined, totalCartons: totalCartons || undefined });
      toast.success('Packaging complete — advancing to Final QC');
      onSaved();
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="text-sm font-bold text-[#2e241b] mb-3">📦 Packaging Specification <span className="text-xs font-normal text-[#968871]">— fetched from Customer Details</span></h3>
        {pkgSpecRows.length === 0 && pkgCustomRows.length === 0 ? (
          <p className="text-xs text-[#968871]">No packaging spec set in Customer Details yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {pkgSpecRows.map((f) => (
              <div key={f.key} className="rounded-lg border border-[#d3c9b4] bg-[#f0eadd] p-2.5">
                <p className="text-[10px] font-semibold text-[#968871] uppercase tracking-wide mb-1">{f.label}</p>
                <p className="text-xs font-semibold text-[#2e241b]">{crmSpec[f.key]}</p>
              </div>
            ))}
            {pkgCustomRows.map((c, i) => (
              <div key={i} className="rounded-lg border border-[#d3c9b4] bg-[#f0eadd] p-2.5">
                <p className="text-[10px] font-semibold text-[#968871] uppercase tracking-wide mb-1">{c.label || '—'}</p>
                <p className="text-xs font-semibold text-[#2e241b]">{c.spec || '—'}</p>
              </div>
            ))}
          </div>
        )}
        {pkgAttachments.length > 0 && (
          <div className="mt-2 pt-2 border-t border-[#e2dac8]">
            <p className="text-[10px] font-bold uppercase text-[#968871] mb-1">Attachments</p>
            {pkgAttachments.map((f, i) => <p key={i} className="text-xs text-[#2e241b]">{f.name}</p>)}
          </div>
        )}
      </Card>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <h3 className="text-sm font-bold text-[#2e241b] mb-3">Packaging Details</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="MRP (₹)"><input type="number" value={form.mrp} onChange={(e) => setForm((f) => ({ ...f, mrp: e.target.value }))} className={inputCls} /></Field>
          <Field label="Fill Weight/Unit (g)"><input type="number" value={form.fillWeight} onChange={(e) => setForm((f) => ({ ...f, fillWeight: e.target.value }))} className={inputCls} /></Field>
        </div>
        <p className="text-xs text-[#968871] mt-2">Batch weight: {batchGrams}g · Expected units: <strong className="text-[#7a5a10]">{expected ?? '—'}</strong></p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <Field label="Filled (units)"><input type="number" value={form.filled} onChange={(e) => setForm((f) => ({ ...f, filled: e.target.value }))} className={inputCls} /></Field>
          <Field label="Rejected"><input type="number" value={form.rejected} onChange={(e) => setForm((f) => ({ ...f, rejected: e.target.value }))} className={inputCls} /></Field>
        </div>
        <p className="text-xs text-[#968871] mt-2">Yield: <strong className="text-[#7a5a10]">{yieldPct}%</strong></p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
          <Field label="MFG Date"><input type="date" value={form.mfgDate} onChange={(e) => setForm((f) => ({ ...f, mfgDate: e.target.value }))} className={inputCls} /></Field>
          <Field label="EXP Date"><input type="date" value={form.expDate} onChange={(e) => setForm((f) => ({ ...f, expDate: e.target.value }))} className={inputCls} /></Field>
          <Field label="Units/Carton"><input type="number" value={form.cartonQty} onChange={(e) => setForm((f) => ({ ...f, cartonQty: e.target.value }))} className={inputCls} /></Field>
        </div>
        <p className="text-xs text-[#968871] mt-2">Total cartons: <strong className="text-[#7a5a10]">{totalCartons ?? '—'}</strong></p>
        <button onClick={submit} disabled={busy} className={clsx(primaryBtn, 'mt-4')}>{busy ? 'Saving…' : 'Packaging Complete → Final QC'}</button>
      </Card>
      <Card>
        <h3 className="text-sm font-bold text-[#2e241b] mb-3">Label Preview</h3>
        <div className="bg-[#f5f0e8] text-[#2C1810] rounded-lg p-4 border border-[#d4c5a9]">
          <p className="text-[11px] font-bold uppercase tracking-wide">{order.catalogProduct?.name?.split(' ')[0] || 'BACKERO'}</p>
          <p className="text-[10px] font-semibold mt-1">{order.catalogProduct?.name || 'Product'}</p>
          <div className="flex justify-between text-[8px] mt-2"><span>Batch: <strong>{form.batchCode}</strong></span><span>MFG: {form.mfgDate}</span></div>
          <div className="flex justify-between text-[8px]"><span>EXP: {form.expDate || '—'}</span><span>MRP: ₹{form.mrp || '—'}</span></div>
          <div className="text-[8px] mt-1">Net Wt: {form.fillWeight || '—'}g</div>
        </div>
      </Card>
      </div>
    </div>
  );
}

// ── STAGE 6: FINAL QC ─────────────────────────────────────────────────────────

// Job Sheet spec key -> { field on the finalQC form, label }
const FQC_SPEC_TO_FIELD = {
  fqcWeight: { field: 'weightCheck', label: 'Weight Check' },
  fqcSeal: { field: 'sealCheck', label: 'Seal Integrity' },
  fqcLeak: { field: 'leakCheck', label: 'Leak Test' },
  fqcLabel: { field: 'labelCheck', label: 'Label Verification' },
  fqcPrint: { field: 'printCheck', label: 'Print Quality' },
  fqcCarton: { field: 'cartonCheck', label: 'Carton Condition' },
  fqcAppearance: { field: 'visualCheck', label: 'Appearance Check' },
};

export function StageFinalQC({ order, onSaved }) {
  const crmSpec = order.crmSpec || {};
  const fq = order.finalQC || {};
  const [form, setForm] = useState({
    weightCheck: fq.weightCheck || '', visualCheck: fq.visualCheck || '', labelCheck: fq.labelCheck || '',
    sealCheck: fq.sealCheck || '', leakCheck: fq.leakCheck || '', printCheck: fq.printCheck || '', cartonCheck: fq.cartonCheck || '',
    comment: fq.comment || '', extra: fq.extra || {},
  });
  const [busy, setBusy] = useState(false);
  const p = order.packaging || {};

  const submit = async (approve) => {
    if (approve) {
      const missing = Object.entries(FQC_SPEC_TO_FIELD)
        .filter(([specKey]) => isRequired(crmSpec, specKey))
        .filter(([, { field }]) => !form[field])
        .map(([, { label }]) => label);
      if (missing.length) { toast.error(`Complete all Required checks: ${missing.join(', ')}`); return; }
    }
    setBusy(true);
    try {
      await api.post(`/production/${order._id}/final-qc`, { ...form, approve });
      toast.success(approve ? 'Final QC approved — ready for dispatch' : 'Batch rejected / held');
      onSaved();
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
    finally { setBusy(false); }
  };

  // Fetched straight from Customer Details' Final QC section (FQC_SPECS, all 8 items) — the
  // 7 with a named ProductionOrder.finalQC column keep using it; the remaining one
  // (fqcRelease) goes into finalQC.extra, same pattern as Bulk QC's extra map.
  const selectField = (spec) => {
    const mapped = FQC_SPEC_TO_FIELD[spec.key];
    const value = mapped ? form[mapped.field] : (form.extra?.[spec.key] ?? '');
    const onChange = (v) => {
      if (mapped) setForm((f) => ({ ...f, [mapped.field]: v }));
      else setForm((f) => ({ ...f, extra: { ...f.extra, [spec.key]: v } }));
    };
    return (
      <div key={spec.key} className="rounded-lg border border-[#d3c9b4] bg-[#f0eadd] p-2.5">
        <label className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1 block">
          {spec.label} <span className="text-[#7a5a10] normal-case font-normal">· Spec: {specValue(crmSpec, spec.key, '—')}</span>
        </label>
        <select value={value} onChange={(e) => onChange(e.target.value)} className={clsx(inputCls, 'bg-white')}>
          <option value="">Select</option><option value="PASS">PASS</option><option value="FAIL">FAIL</option>
        </select>
      </div>
    );
  };

  return (
    <Card>
      <h3 className="text-sm font-bold text-[#2e241b] mb-1">Final Quality Control</h3>
      <p className="text-xs text-[#6d5f4c] mb-3">Batch {order.batch} · {p.filled || 0} units filled, {p.rejected || 0} rejected · fetched from Customer Details — Final QC</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {FQC_SPECS.map((spec) => selectField(spec))}
      </div>
      <div className="mt-3"><Field label="Comments"><textarea rows={2} value={form.comment} onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))} className={inputCls} /></Field></div>
      <div className="flex gap-3 mt-4">
        <button onClick={() => submit(true)} disabled={busy} className="px-4 py-2 bg-[#5c8a5f] hover:brightness-95 text-white text-sm font-semibold rounded-xl disabled:opacity-50">Approve → Dispatch</button>
        <button onClick={() => submit(false)} disabled={busy} className="px-4 py-2 bg-[#c0574a] hover:brightness-95 text-white text-sm font-semibold rounded-xl disabled:opacity-50">Reject / Hold</button>
      </div>
    </Card>
  );
}

// ── STAGE 7: DISPATCH ─────────────────────────────────────────────────────────

export function StageDispatch({ order, onSaved }) {
  const already = order.dispatchRecord?.tracking;
  const [form, setForm] = useState({ carrier: 'Delhivery', tracking: '', date: new Date().toISOString().slice(0, 10), eta: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const p = order.packaging || {};

  const submit = async () => {
    setBusy(true);
    try { await api.post(`/production/${order._id}/dispatch`, form); toast.success('Batch dispatched'); onSaved(); }
    catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
    finally { setBusy(false); }
  };

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-[#2e241b]">Dispatch</h3>
        {already ? <span className={clsx('text-[11px] font-semibold px-2 py-0.5 rounded-full', PILL.success)}>Dispatched</span> : <span className={clsx('text-[11px] font-semibold px-2 py-0.5 rounded-full', PILL.info)}>Ready</span>}
      </div>
      <div className="grid grid-cols-4 gap-3 mb-4 text-xs">
        <div><p className="text-[#968871] uppercase text-[10px]">Batch Code</p><p className="font-mono font-semibold">{p.batchCode || '—'}</p></div>
        <div><p className="text-[#968871] uppercase text-[10px]">Units</p><p className="font-semibold">{p.filled || 0}</p></div>
        <div><p className="text-[#968871] uppercase text-[10px]">Rejects</p><p className="font-semibold">{p.rejected || 0}</p></div>
        <div><p className="text-[#968871] uppercase text-[10px]">Net Good</p><p className="font-semibold text-[#3a5f3c]">{(p.filled || 0) - (p.rejected || 0)}</p></div>
      </div>
      {already ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-[#dce9d4] border border-[#b9d2af] rounded-xl p-3">
          <div><p className="text-[#968871] uppercase text-[10px]">Carrier</p><p className="font-semibold">{order.dispatchRecord.carrier}</p></div>
          <div><p className="text-[#968871] uppercase text-[10px]">Tracking</p><p className="font-semibold">{order.dispatchRecord.tracking}</p></div>
          <div><p className="text-[#968871] uppercase text-[10px]">Date</p><p className="font-semibold">{order.dispatchRecord.date}</p></div>
          <div><p className="text-[#968871] uppercase text-[10px]">ETA</p><p className="font-semibold">{order.dispatchRecord.eta || '—'}</p></div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Carrier">
              <select value={form.carrier} onChange={(e) => setForm((f) => ({ ...f, carrier: e.target.value }))} className={inputCls}>
                {['Delhivery', 'BlueDart', 'DTDC', 'Self', 'Customer Pickup'].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Tracking #"><input value={form.tracking} onChange={(e) => setForm((f) => ({ ...f, tracking: e.target.value }))} className={inputCls} placeholder="AWB / LR number" /></Field>
            <Field label="Dispatch Date"><input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className={inputCls} /></Field>
            <Field label="Expected Delivery"><input type="date" value={form.eta} onChange={(e) => setForm((f) => ({ ...f, eta: e.target.value }))} className={inputCls} /></Field>
          </div>
          <div className="mt-3"><Field label="Notes"><textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className={inputCls} /></Field></div>
          <button onClick={submit} disabled={busy} className={clsx(primaryBtn, 'mt-4 flex items-center gap-1.5')}>
            <TruckIcon className="w-4 h-4" /> {busy ? 'Confirming…' : 'Confirm Dispatch'}
          </button>
        </>
      )}
    </Card>
  );
}

export { PRIORITY_STYLE };
