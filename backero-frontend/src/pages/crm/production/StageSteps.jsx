import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import api from '../../../api/axios';
import { LockClosedIcon, TruckIcon } from '@heroicons/react/24/outline';
import { Card, PILL } from '../sampleTheme';

// The 8-stage production board, ported from the standalone Batch Tracker page so it can render
// inline inside SampleLeadDetail's Production tab — same API calls, same onSaved/onAdvanced ->
// invalidate pattern as before, restyled from Batch Tracker's gray/blue+dark-mode theme onto
// SampleProduction's cream/amber palette so the merged lead+order panel reads as one page.

export const STAGE_NAMES = ['Order', 'Work Assignment', 'Procurement', 'Ready for Product Approval', 'Bulk QC', 'Packaging', 'Final QC', 'Dispatch'];

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

// Job Creation Sheet — each spec has a Required/Not Required toggle + a target spec value.
// Once confirmed & locked, Bulk QC / Final QC only render the fields marked Required.
const QC_SPECS = [
  { key: 'qcPhysico', label: 'Physicochemical Tests', defaultSpec: 'As per IS standard' },
  { key: 'qcPh', label: 'pH Testing', defaultSpec: '4.5 - 6.0' },
  { key: 'qcViscosity', label: 'Viscosity', defaultSpec: '2000 - 8000 cP' },
  { key: 'qcDensity', label: 'Density', defaultSpec: '0.95 - 1.05 g/ml' },
  { key: 'qcMicrobial', label: 'Microbial Testing', defaultSpec: 'USP <61>' },
  { key: 'qcTpc', label: 'TPC (CFU/g)', defaultSpec: '< 1000' },
  { key: 'qcYm', label: 'Yeast & Mold', defaultSpec: '< 100' },
  { key: 'qcPathogen', label: 'Pathogen Test', defaultSpec: 'Absent' },
  { key: 'qcSensory', label: 'Sensory Evaluation', defaultSpec: 'As per standard' },
  { key: 'qcColor', label: 'Color Check', defaultSpec: 'Standard / Off' },
  { key: 'qcOdor', label: 'Odor Check', defaultSpec: 'Standard / Off' },
  { key: 'qcTexture', label: 'Texture Check', defaultSpec: 'Smooth / Lumpy' },
];
const LAB_SPECS = [
  { key: 'labStability', label: 'Stability Testing', defaultSpec: '40C / 75% RH' },
  { key: 'labAccelerated', label: 'Accelerated Stability', defaultSpec: '25C / 60% RH' },
  { key: 'labDuration', label: 'Stability Duration', defaultSpec: '6 months' },
  { key: 'labPreservative', label: 'Preservative Efficacy', defaultSpec: 'Pass USP <51>' },
  { key: 'labHeavyMetal', label: 'Heavy Metal Testing', defaultSpec: '< 10 ppm' },
  { key: 'labDermatological', label: 'Dermatological Test', defaultSpec: 'HRIPT Pass' },
  { key: 'labDocumentation', label: 'Lab Documentation', defaultSpec: 'Complete COA' },
  { key: 'labCoa', label: 'Certificate of Analysis', defaultSpec: 'Required per batch' },
  { key: 'labMethod', label: 'Test Method', defaultSpec: 'In-house + BP/USP' },
];
const FQC_SPECS = [
  { key: 'fqcWeight', label: 'Weight Check', defaultSpec: '+-5%' },
  { key: 'fqcSeal', label: 'Seal Integrity', defaultSpec: 'No leakage' },
  { key: 'fqcLeak', label: 'Leak Test', defaultSpec: 'Pass inverted 24h' },
  { key: 'fqcLabel', label: 'Label Verification', defaultSpec: '100% match to artwork' },
  { key: 'fqcPrint', label: 'Print Quality', defaultSpec: 'No smudge/cut' },
  { key: 'fqcCarton', label: 'Carton Condition', defaultSpec: 'No dent/crush' },
  { key: 'fqcAppearance', label: 'Appearance Check', defaultSpec: 'As per standard' },
  { key: 'fqcRelease', label: 'Release Criteria', defaultSpec: 'All tests pass' },
];

// Backward/forward-safe: a spec with no explicit status is treated as Required (matches the HTML reference).
const isRequired = (crmSpec, key) => (crmSpec?.[key + 'Status'] || 'Required') === 'Required';
const specValue = (crmSpec, key, fallback) => crmSpec?.[key + 'Spec'] || fallback;

const PKG_CONTAINER_FIELDS = [
  { key: 'pkgContainerType', label: 'Bottle/Container Type', placeholder: 'e.g. 50ml Amber Glass Jar' },
  { key: 'pkgCapacity', label: 'Capacity', placeholder: 'e.g. 50ml' },
  { key: 'pkgCap', label: 'Cap/Closure', placeholder: 'e.g. Gold Aluminium Wad Cap' },
  { key: 'pkgSeal', label: 'Seal Type', placeholder: 'e.g. Induction Seal' },
  { key: 'pkgLabel', label: 'Label Spec', placeholder: 'e.g. 50x30mm Digital Foil' },
  { key: 'pkgFillWeight', label: 'Net Fill Weight', placeholder: 'e.g. 50g +-2%' },
];
const PKG_PRIMARY_FIELDS = [
  { key: 'pkgMonoCarton', label: 'Mono Carton', placeholder: 'e.g. Matte Finish' },
  { key: 'pkgIndShrinkWrap', label: 'Individual Shrink Wrap', placeholder: 'e.g. PVC Film 40 micron' },
  { key: 'pkgLeaflet', label: 'Leaflet/Insert', placeholder: 'e.g. Product info leaflet' },
  { key: 'pkgInnerPacking', label: 'Inner Packing', placeholder: 'e.g. Individual silk pouch' },
];
const PKG_SECONDARY_FIELDS = [
  { key: 'pkgOuterCarton', label: 'Outer Carton (Master)', placeholder: 'e.g. 5-ply Corrugated' },
  { key: 'pkgUnitsPerCarton', label: 'Units per Carton', placeholder: 'e.g. 24' },
  { key: 'pkgOuterShrinkWrap', label: 'Shrink Wrap (Outer)', placeholder: 'e.g. Stretch Film 23 micron' },
  { key: 'pkgPalletInfo', label: 'Pallet Info', placeholder: 'e.g. 48 cartons per pallet' },
  { key: 'pkgSpecialHandling', label: 'Special Handling', placeholder: 'e.g. Fragile, This Side Up' },
];
const PAYMENT_FIELDS = [
  { key: 'paymentTerms', label: 'Payment Terms', placeholder: 'e.g. 30% Advance / 40% on QC / 30% on Dispatch' },
  { key: 'paymentMode', label: 'Payment Mode', placeholder: 'e.g. NEFT' },
  { key: 'creditPeriod', label: 'Credit Period', placeholder: 'e.g. Net 30 Days' },
  { key: 'gstTreatment', label: 'GST Treatment', placeholder: 'e.g. Regular GST (18%)' },
];

function Field({ label, children }) {
  return <div><label className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1 block">{label}</label>{children}</div>;
}

// Job Sheet spec sections (QC/Lab/Final QC/Packaging/Payment) are long lists — collapsed by
// default so the stage 0 form isn't one giant always-expanded page; click the header to open.
function CollapsibleSection({ title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[#6d5f4c] mb-2 hover:text-[#2e241b]"
      >
        <span className={clsx('text-[10px] transition-transform', open && 'rotate-90')}>▸</span>
        {title}
      </button>
      {open && children}
    </div>
  );
}

const inputCls = 'w-full px-3 py-2 text-sm rounded-[10px] border-[1.5px] border-[#d3c9b4] bg-[#f0eadd] text-[#2e241b] focus:outline-none focus:border-[#968871] placeholder:text-[#968871] disabled:opacity-50';
const primaryBtn = 'px-4 py-2 bg-[#f2b23e] hover:brightness-95 text-[#2e241b] text-sm font-semibold rounded-xl disabled:opacity-50 transition';
const secondaryBtn = 'px-4 py-2 bg-[#e2dac8] hover:bg-[#d3c9b4] text-[#4a3a29] text-sm font-semibold rounded-xl disabled:opacity-50 transition';

function PlainSpecRow({ field, crmSpec, onChange, locked }) {
  return (
    <div className="py-1.5 border-b border-[#e2dac8] last:border-none">
      <label className="block text-xs text-[#6d5f4c] mb-1">{field.label}</label>
      <input disabled={locked} value={crmSpec[field.key] || ''} placeholder={field.placeholder} onChange={(e) => onChange(field.key, e.target.value)}
        className="w-full text-xs border border-[#d3c9b4] rounded-lg px-2 py-1.5 bg-[#f0eadd] disabled:opacity-50" />
    </div>
  );
}

function SpecSectionRow({ spec, crmSpec, onChange, locked }) {
  const status = crmSpec[spec.key + 'Status'] || 'Required';
  const value = crmSpec[spec.key + 'Spec'] ?? spec.defaultSpec;
  return (
    <div className="py-1.5 border-b border-[#e2dac8] last:border-none">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-xs text-[#6d5f4c]">{spec.label}</span>
        <select disabled={locked} value={status} onChange={(e) => onChange(spec.key + 'Status', e.target.value)}
          className="text-xs border border-[#d3c9b4] rounded-lg px-2 py-1 bg-[#f0eadd] disabled:opacity-50 flex-shrink-0">
          <option value="Required">Required</option>
          <option value="Not Required">Not Required</option>
        </select>
      </div>
      <input disabled={locked || status === 'Not Required'} value={value} onChange={(e) => onChange(spec.key + 'Spec', e.target.value)}
        className="w-full text-xs border border-[#d3c9b4] rounded-lg px-2 py-1.5 bg-[#f0eadd] disabled:opacity-40" />
    </div>
  );
}

function DynamicSpecFields({ category, crmSpec, onChange, locked }) {
  const list = crmSpec[category + 'Extra'] || [];
  const update = (list2) => onChange(category + 'Extra', list2);
  return (
    <div className="mt-2 space-y-2">
      {list.map((f, i) => (
        <div key={i} className="p-2 rounded-lg bg-[#e7dfce] space-y-1.5">
          <div className="flex items-center gap-2">
            <input disabled={locked} value={f.label} onChange={(e) => { const l = [...list]; l[i] = { ...l[i], label: e.target.value }; update(l); }}
              placeholder="Field label" className="text-xs border border-[#d3c9b4] rounded-lg px-2 py-1.5 bg-[#f0eadd] flex-1 min-w-0" />
            <select disabled={locked} value={f.status || 'Required'} onChange={(e) => { const l = [...list]; l[i] = { ...l[i], status: e.target.value }; update(l); }}
              className="text-xs border border-[#d3c9b4] rounded-lg px-2 py-1.5 bg-[#f0eadd] flex-shrink-0">
              <option value="Required">Required</option>
              <option value="Not Required">Not Required</option>
            </select>
            {!locked && <button onClick={() => update(list.filter((_, idx) => idx !== i))} className="text-red-500 text-sm flex-shrink-0 px-1">×</button>}
          </div>
          <input disabled={locked} value={f.spec} onChange={(e) => { const l = [...list]; l[i] = { ...l[i], spec: e.target.value }; update(l); }}
            placeholder="Spec value" className="w-full text-xs border border-[#d3c9b4] rounded-lg px-2 py-1.5 bg-[#f0eadd]" />
        </div>
      ))}
      {!locked && (
        <button onClick={() => update([...list, { label: '', status: 'Required', spec: '' }])} className="text-xs font-semibold text-[#7a5a10]">+ Add More Spec</button>
      )}
    </div>
  );
}

// ── STAGE BAR ─────────────────────────────────────────────────────────────────

// Order (0) and Work Assignment (1) are back-office setup steps, not shop-floor tracking —
// hidden from this bar so it only navigates the 6 production-floor stages. If the order's
// actual current stage is still 0/1, that stage's form still renders below (see callers)
// even without a nav button for it, since it can't be skipped.
const TRACKED_STAGES = STAGE_NAMES.map((name, i) => ({ name, i })).filter(({ i }) => i >= 2);

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

  return (
    <div className="space-y-4">
      {locked && (
        <Card className="border-[#b9d2af] bg-[#dce9d4]">
          <p className="text-sm font-bold text-[#3a5f3c]">🔒 Job Sheet Confirmed & Locked</p>
          <p className="text-xs text-[#6d5f4c]">Confirmed {crmSpec.specsConfirmedAt ? new Date(crmSpec.specsConfirmedAt).toLocaleString('en-IN') : ''}</p>
        </Card>
      )}

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

      <CollapsibleSection title="🎯 QC Requirements">
        <Card>
          {QC_SPECS.map((s) => <SpecSectionRow key={s.key} spec={s} crmSpec={crmSpec} onChange={patchSpec} locked={locked} />)}
          <DynamicSpecFields category="qc" crmSpec={crmSpec} onChange={patchSpec} locked={locked} />
        </Card>
      </CollapsibleSection>

      <CollapsibleSection title="🔬 Laboratory & Testing Requirements">
        <Card>
          {LAB_SPECS.map((s) => <SpecSectionRow key={s.key} spec={s} crmSpec={crmSpec} onChange={patchSpec} locked={locked} />)}
          <DynamicSpecFields category="lab" crmSpec={crmSpec} onChange={patchSpec} locked={locked} />
        </Card>
      </CollapsibleSection>

      <CollapsibleSection title="✅ Final QC Requirements">
        <Card>
          {FQC_SPECS.map((s) => <SpecSectionRow key={s.key} spec={s} crmSpec={crmSpec} onChange={patchSpec} locked={locked} />)}
          <DynamicSpecFields category="fqc" crmSpec={crmSpec} onChange={patchSpec} locked={locked} />
        </Card>
      </CollapsibleSection>

      <CollapsibleSection title="📦 Packaging & Label Specifications">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Card><p className="text-[10px] font-bold text-[#968871] uppercase mb-1">🧴 Container</p>{PKG_CONTAINER_FIELDS.map((f) => <PlainSpecRow key={f.key} field={f} crmSpec={crmSpec} onChange={patchSpec} locked={locked} />)}</Card>
          <Card><p className="text-[10px] font-bold text-[#968871] uppercase mb-1">📦 Primary Packaging</p>{PKG_PRIMARY_FIELDS.map((f) => <PlainSpecRow key={f.key} field={f} crmSpec={crmSpec} onChange={patchSpec} locked={locked} />)}</Card>
          <Card><p className="text-[10px] font-bold text-[#968871] uppercase mb-1">📦 Secondary Packaging</p>{PKG_SECONDARY_FIELDS.map((f) => <PlainSpecRow key={f.key} field={f} crmSpec={crmSpec} onChange={patchSpec} locked={locked} />)}</Card>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="💰 Payment Specifications">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Card>{PAYMENT_FIELDS.slice(0, 2).map((f) => <PlainSpecRow key={f.key} field={f} crmSpec={crmSpec} onChange={patchSpec} locked={locked} />)}</Card>
          <Card>{PAYMENT_FIELDS.slice(2).map((f) => <PlainSpecRow key={f.key} field={f} crmSpec={crmSpec} onChange={patchSpec} locked={locked} />)}</Card>
        </div>
      </CollapsibleSection>

      <div className="flex items-center gap-3">
        <button onClick={() => save()} disabled={busy || locked} className={secondaryBtn}>{busy ? 'Saving…' : 'Save Draft'}</button>
        {!locked ? (
          <button onClick={confirmJobSheet} disabled={busy} className={primaryBtn}>✅ Confirm Job Sheet & Lock Specs</button>
        ) : (
          <span className="text-xs text-[#968871]">Changes to locked specs require a manager to re-open this order.</span>
        )}
      </div>
    </div>
  );
}

// ── STAGE 1: WORK ASSIGNMENT ──────────────────────────────────────────────────

export function StageWorkAssignment({ order, onSaved }) {
  const wa = order.workAssignment || {};
  const [form, setForm] = useState({
    startDate: wa.startDate || '', endDate: wa.endDate || '', weighDate: wa.weighDate || '', prodDate: wa.prodDate || '', packDate: wa.packDate || '', qcDate: wa.qcDate || '', dispatchDate: wa.dispatchDate || order.deliveryDate || '',
    weighPerson: wa.weighPerson || '', prodPerson: wa.prodPerson || '', qcPerson: wa.qcPerson || '', packPerson: wa.packPerson || '', dispatchPerson: wa.dispatchPerson || '', supervisor: wa.supervisor || '',
  });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try { await api.patch(`/production/${order._id}/work-assignment`, form); toast.success('Work assigned — advancing to Procurement'); onSaved(); }
    catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
    finally { setBusy(false); }
  };

  const dateField = (key, label) => <Field label={label}><input type="date" value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} className={inputCls} /></Field>;
  const personField = (key, label) => <Field label={label}><input value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} className={inputCls} placeholder="Name" /></Field>;

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
      <button onClick={save} disabled={busy} className={clsx(primaryBtn, 'mt-4')}>{busy ? 'Saving…' : 'Confirm Schedule → Procurement'}</button>
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
    return { ...ing, stock, short: stock < ing.targetQty };
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
            <th className="py-1.5">Material</th><th className="py-1.5">Required</th><th className="py-1.5">In Stock</th><th className="py-1.5">Status</th>
          </tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-[#e2dac8]">
                <td className="py-1.5 text-[#2e241b]">{r.name}</td>
                <td className="py-1.5 font-mono">{r.targetQty} {r.unit}</td>
                <td className="py-1.5 font-mono">{r.stock} {r.unit}</td>
                <td className="py-1.5">{r.short ? <span className="text-red-600 font-semibold">Order More</span> : <span className="text-[#3a5f3c] font-semibold">OK</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {shortRows.length > 0 && (
        <div className="mt-3 bg-[#f0d8d2] border border-[#e0b6ab] rounded-xl px-3 py-2 text-xs text-[#8c3a30]">⚠ {shortRows.length} material(s) below required quantity — procure before proceeding.</div>
      )}
      <button onClick={confirm} disabled={busy} className={clsx(primaryBtn, 'mt-4')}>
        {busy ? 'Confirming…' : 'Formula Correct & Materials Available → Weighing'}
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

// One text/number field, shown only if the matching Job Sheet spec is Required.
function SpecDrivenField({ crmSpec, specKey, label, formKey, form, setForm, type = 'text' }) {
  if (!isRequired(crmSpec, specKey)) return null;
  return (
    <Field label={<>{label} <span className="text-[#7a5a10] font-normal">· Spec: {specValue(crmSpec, specKey, '—')}</span></>}>
      <input type={type} step={type === 'number' ? '0.1' : undefined} value={form[formKey]}
        onChange={(e) => setForm((f) => ({ ...f, [formKey]: e.target.value }))} className={inputCls} />
    </Field>
  );
}

export function StageBulkQC({ order, onSaved }) {
  const crmSpec = order.crmSpec || {};
  const [form, setForm] = useState({ ph: '', viscosity: '', density: '', appearance: '', color: '', odor: '', texture: '', tpc: '', ym: '', pathogen: '', heavy: '', preservative: '', stability: '', docs: '' });
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
      <p className="text-xs text-[#6d5f4c] mb-3">Fields shown are driven by the Job Sheet locked on Stage 0.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <SpecDrivenField crmSpec={crmSpec} specKey="qcPh" label="pH Value" formKey="ph" form={form} setForm={setForm} type="number" />
        <SpecDrivenField crmSpec={crmSpec} specKey="qcViscosity" label="Viscosity (cP)" formKey="viscosity" form={form} setForm={setForm} type="number" />
        <SpecDrivenField crmSpec={crmSpec} specKey="qcDensity" label="Density (g/ml)" formKey="density" form={form} setForm={setForm} type="number" />
        <Field label="Appearance"><input value={form.appearance} onChange={(e) => setForm((f) => ({ ...f, appearance: e.target.value }))} className={inputCls} placeholder="Uniform / Hazy" /></Field>
        <SpecDrivenField crmSpec={crmSpec} specKey="qcColor" label="Color" formKey="color" form={form} setForm={setForm} />
        <SpecDrivenField crmSpec={crmSpec} specKey="qcOdor" label="Odor" formKey="odor" form={form} setForm={setForm} />
        <SpecDrivenField crmSpec={crmSpec} specKey="qcTexture" label="Texture" formKey="texture" form={form} setForm={setForm} />
        <SpecDrivenField crmSpec={crmSpec} specKey="qcTpc" label="TPC (CFU/g)" formKey="tpc" form={form} setForm={setForm} />
        <SpecDrivenField crmSpec={crmSpec} specKey="qcYm" label="Yeast & Mold" formKey="ym" form={form} setForm={setForm} />
        <SpecDrivenField crmSpec={crmSpec} specKey="qcPathogen" label="Pathogens" formKey="pathogen" form={form} setForm={setForm} />
        <SpecDrivenField crmSpec={crmSpec} specKey="labHeavyMetal" label="Heavy Metals (ppm)" formKey="heavy" form={form} setForm={setForm} />
        <SpecDrivenField crmSpec={crmSpec} specKey="labPreservative" label="Preservative Efficacy" formKey="preservative" form={form} setForm={setForm} />
        <SpecDrivenField crmSpec={crmSpec} specKey="labStability" label="Stability" formKey="stability" form={form} setForm={setForm} />
        <SpecDrivenField crmSpec={crmSpec} specKey="labDocumentation" label="Documentation" formKey="docs" form={form} setForm={setForm} />
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
  const [form, setForm] = useState({ weightCheck: '', visualCheck: '', labelCheck: '', sealCheck: '', leakCheck: '', printCheck: '', cartonCheck: '', comment: '' });
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

  const selectField = (specKey) => {
    const { field, label } = FQC_SPEC_TO_FIELD[specKey];
    if (!isRequired(crmSpec, specKey)) return null;
    return (
      <Field key={field} label={<>{label} <span className="text-[#7a5a10] font-normal">· Spec: {specValue(crmSpec, specKey, '—')}</span></>}>
        <select value={form[field]} onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))} className={inputCls}>
          <option value="">Select</option><option value="PASS">PASS</option><option value="FAIL">FAIL</option>
        </select>
      </Field>
    );
  };

  return (
    <Card>
      <h3 className="text-sm font-bold text-[#2e241b] mb-1">Final Quality Control</h3>
      <p className="text-xs text-[#6d5f4c] mb-3">Batch {order.batch} · {p.filled || 0} units filled, {p.rejected || 0} rejected · fields driven by locked Job Sheet</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {Object.keys(FQC_SPEC_TO_FIELD).map((specKey) => selectField(specKey))}
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
