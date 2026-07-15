import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import api from '../../api/axios';
import {
  PlusIcon, MagnifyingGlassIcon, XMarkIcon, ArrowLeftIcon, TrashIcon,
  BeakerIcon, LockClosedIcon, TruckIcon,
} from '@heroicons/react/24/outline';

const STAGE_NAMES = ['Order', 'Procurement', 'Work Assignment', 'Weighing', 'Bulk QC', 'Packaging', 'Final QC', 'Dispatch'];
const PROCESS_STEPS = ['Water Phase Heating', 'Oil Phase Heating', 'Emulsification', 'Cooling Phase', 'Add Heat-Sensitives', 'In-Process QC Check', 'Final Mix', 'Transfer to Holding'];

const STAGE_BUCKET_COLOR = (stage) => {
  if (stage <= 1) return 'bg-gray-100 text-gray-600';
  if (stage <= 3) return 'bg-blue-100 text-blue-700';
  if (stage === 4) return 'bg-purple-100 text-purple-700';
  if (stage === 5) return 'bg-amber-100 text-amber-700';
  if (stage === 6) return 'bg-indigo-100 text-indigo-700';
  return 'bg-green-100 text-green-700';
};

const PRIORITY_STYLE = {
  Urgent: 'bg-red-100 text-red-700', High: 'bg-amber-100 text-amber-700',
  Normal: 'bg-blue-100 text-blue-700', Low: 'bg-gray-100 text-gray-500',
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

// Plain (non Required/Not-Required) packaging spec fields, grouped like the HTML reference.
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

// A fresh Job Sheet: every toggleable spec defaults to Required with its example spec value pre-filled.
function defaultCrmSpec() {
  const spec = {};
  [...QC_SPECS, ...LAB_SPECS, ...FQC_SPECS].forEach((s) => { spec[s.key + 'Status'] = 'Required'; spec[s.key + 'Spec'] = s.defaultSpec; });
  return spec;
}

function PlainSpecRow({ field, crmSpec, onChange, locked }) {
  return (
    <div className="py-1.5 border-b border-gray-50 dark:border-[#111b2e] last:border-none">
      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{field.label}</label>
      <input disabled={locked} value={crmSpec[field.key] || ''} placeholder={field.placeholder} onChange={(e) => onChange(field.key, e.target.value)}
        className="w-full text-xs border border-gray-200 dark:border-[#1b2e4a] rounded-lg px-2 py-1.5 bg-gray-50 dark:bg-[#0f1a2e] disabled:opacity-50" />
    </div>
  );
}

function Card({ children, className = '' }) {
  return <div className={clsx('bg-white dark:bg-[#070c17] rounded-2xl border border-gray-200 dark:border-[#1b2e4a] shadow-sm p-4', className)}>{children}</div>;
}

function Field({ label, children }) {
  return <div><label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</label>{children}</div>;
}

const inputCls = 'w-full px-3 py-2 text-sm border border-gray-200 dark:border-[#1b2e4a] rounded-lg bg-gray-50 dark:bg-[#0f1a2e] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500';

// ── DASHBOARD ────────────────────────────────────────────────────────────────

function Dashboard({ onOpen, onNew }) {
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['production-orders'],
    queryFn: () => api.get('/production', { params: { limit: 200 } }).then((r) => r.data),
    refetchInterval: 60 * 1000,
  });
  const orders = data?.data || [];

  const filtered = orders.filter((o) => {
    if (stageFilter !== '' && o.stage !== Number(stageFilter)) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return (o.orderNumber || '').toLowerCase().includes(s) || (o.customer || '').toLowerCase().includes(s) || (o.catalogProduct?.name || '').toLowerCase().includes(s);
  });

  const stageCounts = STAGE_NAMES.map((_, i) => orders.filter((o) => o.stage === i).length);
  const active = orders.filter((o) => o.status !== 'Completed' && o.status !== 'Cancelled').length;

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-[#070c17] rounded-2xl border border-gray-200 dark:border-[#1b2e4a] shadow-sm px-6 py-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center shadow-sm flex-shrink-0">
            <BeakerIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">Batch Tracker</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">{orders.length} production order{orders.length !== 1 ? 's' : ''} · full 8-stage lifecycle</p>
          </div>
        </div>
        <button onClick={onNew} className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl transition-colors">
          <PlusIcon className="w-4 h-4" /> New Order
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><p className="text-2xl font-bold text-gray-900 dark:text-white">{orders.length}</p><p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">Total Orders</p></Card>
        <Card><p className="text-2xl font-bold text-blue-600">{active}</p><p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">Active</p></Card>
        <Card><p className="text-2xl font-bold text-purple-600">{stageCounts[4]}</p><p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">In Bulk QC</p></Card>
        <Card><p className="text-2xl font-bold text-green-600">{stageCounts[7]}</p><p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">Dispatched</p></Card>
      </div>

      <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
        {STAGE_NAMES.map((name, i) => (
          <button key={name} onClick={() => setStageFilter(stageFilter === String(i) ? '' : String(i))}
            className={clsx('rounded-xl border p-2.5 text-center transition-colors',
              stageFilter === String(i) ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20' : 'border-gray-200 dark:border-[#1b2e4a] bg-white dark:bg-[#070c17] hover:border-brand-300')}>
            <p className="text-lg font-bold text-brand-600 font-mono">{stageCounts[i]}</p>
            <p className="text-[9px] text-gray-500 dark:text-gray-400 uppercase tracking-wide mt-0.5 leading-tight">{name}</p>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <MagnifyingGlassIcon className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search order #, customer, product…"
            className="pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 w-full bg-gray-50 dark:bg-[#0f1a2e] dark:border-[#1b2e4a]" />
        </div>
        {stageFilter !== '' && (
          <button onClick={() => setStageFilter('')} className="text-xs text-brand-600 font-semibold px-3 py-2">Clear stage filter ×</button>
        )}
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-[#1b2e4a] text-left text-[10px] uppercase tracking-wide text-gray-400">
                <th className="px-4 py-2.5">Order</th><th className="px-4 py-2.5">Product</th><th className="px-4 py-2.5">Customer</th>
                <th className="px-4 py-2.5">Priority</th><th className="px-4 py-2.5">Stage</th><th className="px-4 py-2.5">Delivery</th><th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-xs">Loading…</td></tr>}
              {!isLoading && filtered.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-xs">No orders match. Click "+ New Order" to create one.</td></tr>}
              {filtered.map((o) => (
                <tr key={o._id} onClick={() => onOpen(o._id)} className="border-b border-gray-50 dark:border-[#111b2e] cursor-pointer hover:bg-gray-50 dark:hover:bg-[#0f1a2e]">
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-700 dark:text-gray-300">{o.orderNumber}</td>
                  <td className="px-4 py-2.5 text-gray-900 dark:text-white">{o.catalogProduct?.name || '—'}</td>
                  <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400">{o.customer || '—'}</td>
                  <td className="px-4 py-2.5"><span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded-full', PRIORITY_STYLE[o.priority] || PRIORITY_STYLE.Normal)}>{o.priority || 'Normal'}</span></td>
                  <td className="px-4 py-2.5"><span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded-full', STAGE_BUCKET_COLOR(o.stage))}>{STAGE_NAMES[o.stage]}</span></td>
                  <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 text-xs">{o.deliveryDate || '—'}</td>
                  <td className="px-4 py-2.5 text-right"><span className="text-brand-600 text-xs font-semibold">Open →</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ── NEW ORDER MODAL ──────────────────────────────────────────────────────────

function NewOrderModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ catalogProduct: '', batchSizeKg: 10, customer: '', contact: '', container: '', priority: 'Normal', deliveryDate: '', plannedQuantity: '', unit: 'pcs' });
  const [crmSpec, setCrmSpec] = useState(defaultCrmSpec());
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const patchSpec = (key, val) => setCrmSpec((c) => ({ ...c, [key]: val }));

  const { data: catalogData } = useQuery({
    queryKey: ['catalog', 'products', 'all'],
    queryFn: () => api.get('/catalog/products').then((r) => r.data.products || []),
    staleTime: 5 * 60 * 1000,
  });
  const products = (catalogData || []).filter((p) => p.status !== 'Discontinued');
  const filtered = search ? products.filter((p) => (p.name || '').toLowerCase().includes(search.toLowerCase()) || (p.code || '').toLowerCase().includes(search.toLowerCase())) : products;
  const selected = products.find((p) => p._id === form.catalogProduct);

  const submit = async () => {
    if (!form.catalogProduct) { toast.error('Select a product from the catalog'); return; }
    if (!form.customer.trim()) { toast.error('Enter a customer name'); return; }
    if (!form.batchSizeKg || Number(form.batchSizeKg) <= 0) { toast.error('Enter a valid batch size'); return; }
    setBusy(true);
    try {
      const { data } = await api.post('/production', { ...form, batchSizeKg: Number(form.batchSizeKg), plannedQuantity: Number(form.plannedQuantity) || 0, crmSpec });
      toast.success(`Order ${data.order.orderNumber} created`);
      onCreated(data.order._id);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to create order');
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white dark:bg-[#070c17] rounded-2xl shadow-2xl w-full max-w-[1400px] flex flex-col" style={{ maxHeight: '95vh' }}>
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-[#1b2e4a] flex-shrink-0">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">+ New Production Order</h2>
          <button onClick={onClose}><XMarkIcon className="w-5 h-5 text-gray-400" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 min-h-0">
          <Field label="Product (from Product Catalog)">
            <input value={selected ? selected.name : search} onChange={(e) => { setSearch(e.target.value); setForm((f) => ({ ...f, catalogProduct: '' })); }}
              placeholder="Search catalog products…" className={inputCls} />
            {search && !selected && (
              <div className="mt-1 border border-gray-200 dark:border-[#1b2e4a] rounded-lg max-h-40 overflow-y-auto bg-white dark:bg-[#0f1a2e]">
                {filtered.length === 0 && <div className="px-3 py-2 text-xs text-gray-400">No products found</div>}
                {filtered.slice(0, 8).map((p) => (
                  <button key={p._id} onClick={() => { setForm((f) => ({ ...f, catalogProduct: p._id, container: f.container || p.unit })); setSearch(''); }}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-[#132035] flex justify-between">
                    <span className="text-gray-900 dark:text-gray-100">{p.name}</span>
                    <span className="text-gray-400 font-mono">{p.code}</span>
                  </button>
                ))}
              </div>
            )}
            {selected && (
              <p className="text-[11px] text-gray-400 mt-1">{selected.formulation?.rows?.length || 0} ingredient(s) in formulation · ref {selected.formulation?.refWeight || 100}{selected.formulation?.refUnit || 'g'}</p>
            )}
          </Field>

          <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5 mt-4 items-start">
            {/* LEFT — customer & order details */}
            <div className="grid grid-cols-2 lg:grid-cols-1 gap-3">
              <Field label="Customer"><input value={form.customer} onChange={(e) => setForm((f) => ({ ...f, customer: e.target.value }))} className={inputCls} placeholder="e.g. Nykaa" /></Field>
              <Field label="Contact"><input value={form.contact} onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))} className={inputCls} placeholder="Phone" /></Field>
              <Field label="Batch Size (kg)"><input type="number" min="0.1" step="0.1" value={form.batchSizeKg} onChange={(e) => setForm((f) => ({ ...f, batchSizeKg: e.target.value }))} className={inputCls} /></Field>
              <Field label="Planned Qty (units)"><input type="number" value={form.plannedQuantity} onChange={(e) => setForm((f) => ({ ...f, plannedQuantity: e.target.value }))} className={inputCls} placeholder="e.g. 200" /></Field>
              <Field label="Container"><input value={form.container} onChange={(e) => setForm((f) => ({ ...f, container: e.target.value }))} className={inputCls} placeholder="e.g. 50ml Jar" /></Field>
              <Field label="Priority">
                <select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} className={inputCls}>
                  {['Low', 'Normal', 'High', 'Urgent'].map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>
              <Field label="Delivery Date"><input type="date" value={form.deliveryDate} onChange={(e) => setForm((f) => ({ ...f, deliveryDate: e.target.value }))} className={inputCls} /></Field>
            </div>

            {/* RIGHT — Job Sheet spec grid, same as Stage 0 */}
            <div className="space-y-5 min-w-0">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">🎯 QC Requirements</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {[QC_SPECS.slice(0, 4), QC_SPECS.slice(4, 8), QC_SPECS.slice(8)].map((group, i) => (
                    <Card key={i}>{group.map((s) => <SpecSectionRow key={s.key} spec={s} crmSpec={crmSpec} onChange={patchSpec} locked={false} />)}</Card>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">🔬 Laboratory & Testing Requirements</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {[LAB_SPECS.slice(0, 3), LAB_SPECS.slice(3, 6), LAB_SPECS.slice(6)].map((group, i) => (
                    <Card key={i}>{group.map((s) => <SpecSectionRow key={s.key} spec={s} crmSpec={crmSpec} onChange={patchSpec} locked={false} />)}</Card>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">✅ Final QC Requirements</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {[FQC_SPECS.slice(0, 3), FQC_SPECS.slice(3, 6), FQC_SPECS.slice(6)].map((group, i) => (
                    <Card key={i}>{group.map((s) => <SpecSectionRow key={s.key} spec={s} crmSpec={crmSpec} onChange={patchSpec} locked={false} />)}</Card>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">📦 Packaging Specifications</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  <Card><p className="text-[10px] font-bold text-gray-400 uppercase mb-1">🧴 Container</p>{PKG_CONTAINER_FIELDS.map((f) => <PlainSpecRow key={f.key} field={f} crmSpec={crmSpec} onChange={patchSpec} locked={false} />)}</Card>
                  <Card><p className="text-[10px] font-bold text-gray-400 uppercase mb-1">📦 Primary Packaging</p>{PKG_PRIMARY_FIELDS.map((f) => <PlainSpecRow key={f.key} field={f} crmSpec={crmSpec} onChange={patchSpec} locked={false} />)}</Card>
                  <Card><p className="text-[10px] font-bold text-gray-400 uppercase mb-1">📦 Secondary Packaging</p>{PKG_SECONDARY_FIELDS.map((f) => <PlainSpecRow key={f.key} field={f} crmSpec={crmSpec} onChange={patchSpec} locked={false} />)}</Card>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-gray-200 dark:border-[#1b2e4a] flex-shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 dark:border-[#1b2e4a] rounded-xl text-sm font-semibold text-gray-600 dark:text-gray-300">Cancel</button>
          <button onClick={submit} disabled={busy} className="flex-1 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50">{busy ? 'Creating…' : 'Create Order & Start Procurement →'}</button>
        </div>
      </div>
    </div>
  );
}

// ── STAGE BAR ─────────────────────────────────────────────────────────────────

function StageBar({ order, viewStage, setViewStage }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1">
      {STAGE_NAMES.map((name, i) => {
        const done = i < order.stage;
        const active = i === viewStage;
        const locked = i > order.stage;
        return (
          <button key={name} disabled={locked} onClick={() => setViewStage(i)}
            className={clsx('flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap border transition-colors flex-shrink-0',
              active ? 'bg-brand-50 dark:bg-brand-900/20 border-brand-500 text-brand-700' :
              done ? 'bg-green-50 dark:bg-green-900/10 border-green-300 text-green-700' :
              locked ? 'bg-gray-50 dark:bg-[#0f1a2e] border-gray-100 dark:border-[#1b2e4a] text-gray-300 cursor-not-allowed' :
              'bg-white dark:bg-[#070c17] border-gray-200 dark:border-[#1b2e4a] text-gray-500')}>
            <span className={clsx('w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0',
              done ? 'bg-green-500 text-white' : active ? 'bg-brand-600 text-white' : 'bg-gray-200 dark:bg-[#1b2e4a] text-gray-500')}>
              {done ? '✓' : i + 1}
            </span>
            {name}
          </button>
        );
      })}
    </div>
  );
}

// ── ORDER DETAIL ─────────────────────────────────────────────────────────────

function OrderDetail({ id, onBack }) {
  const [viewStage, setViewStage] = useState(null);
  const qc = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['production-order', id],
    queryFn: () => api.get(`/production/${id}`).then((r) => r.data.order),
    refetchInterval: 15 * 1000,
    retry: 1,
  });

  if (isError) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-red-500 font-semibold mb-1">Couldn't load this order</p>
        <p className="text-xs text-gray-400 mb-4">{error?.response?.data?.message || error?.message || 'Unknown error'}</p>
        <div className="flex items-center justify-center gap-3">
          <button onClick={() => refetch()} className="text-xs font-semibold text-brand-600">Retry</button>
          <button onClick={onBack} className="text-xs font-semibold text-gray-500">← Back to Batch Tracker</button>
        </div>
      </div>
    );
  }
  if (isLoading || !data) return <div className="text-center py-16 text-gray-400 text-sm">Loading order…</div>;
  const order = data;
  const stage = viewStage ?? order.stage;

  const invalidate = () => { qc.invalidateQueries({ queryKey: ['production-order', id] }); qc.invalidateQueries({ queryKey: ['production-orders'] }); };

  const del = async () => {
    if (!window.confirm('Delete this production order? This cannot be undone.')) return;
    try { await api.delete(`/production/${id}`); toast.success('Order deleted'); onBack(); qc.invalidateQueries({ queryKey: ['production-orders'] }); }
    catch (e) { toast.error(e.response?.data?.message || 'Delete failed'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">
            <ArrowLeftIcon className="w-4 h-4" /> Batch Tracker
          </button>
          {order.leadId?.name && (
            <Link to="/crm/pipeline" className="flex items-center gap-1 text-xs font-semibold text-indigo-500 hover:text-indigo-700 bg-indigo-50 dark:bg-indigo-900/20 px-2.5 py-1 rounded-full">
              👤 {order.leadId.name} — back to lead
            </Link>
          )}
        </div>
        <button onClick={del} className="flex items-center gap-1.5 text-xs font-semibold text-red-500 hover:text-red-700 px-3 py-1.5 border border-red-200 rounded-lg">
          <TrashIcon className="w-3.5 h-3.5" /> Delete Order
        </button>
      </div>

      <Card>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
          <div>
            <h1 className="text-base font-bold text-gray-900 dark:text-white">{order.orderNumber} — {order.catalogProduct?.name || 'Product'}</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">Batch {order.batch} · {order.batchSizeKg || '—'}kg · Customer: {order.customer || '—'}</p>
          </div>
          <span className={clsx('text-[11px] font-semibold px-2.5 py-1 rounded-full', STAGE_BUCKET_COLOR(order.stage))}>{order.status}</span>
        </div>
      </Card>

      <StageBar order={order} viewStage={stage} setViewStage={setViewStage} />

      {stage === 0 && <StageOrder order={order} onSaved={invalidate} />}
      {stage === 1 && <StageProcurement order={order} onAdvanced={invalidate} />}
      {stage === 2 && <StageWorkAssignment order={order} onSaved={invalidate} />}
      {stage === 3 && <StageWeighing order={order} onSaved={invalidate} />}
      {stage === 4 && <StageBulkQC order={order} onSaved={invalidate} />}
      {stage === 5 && <StagePackaging order={order} onSaved={invalidate} />}
      {stage === 6 && <StageFinalQC order={order} onSaved={invalidate} />}
      {stage === 7 && <StageDispatch order={order} onSaved={invalidate} />}
    </div>
  );
}

// ── STAGE 0: JOB CREATION SHEET (always-editable until confirmed & locked) ──

function SpecSectionRow({ spec, crmSpec, onChange, locked }) {
  const status = crmSpec[spec.key + 'Status'] || 'Required';
  const value = crmSpec[spec.key + 'Spec'] ?? spec.defaultSpec;
  return (
    <div className="py-1.5 border-b border-gray-50 dark:border-[#111b2e] last:border-none">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-xs text-gray-500 dark:text-gray-400">{spec.label}</span>
        <select disabled={locked} value={status} onChange={(e) => onChange(spec.key + 'Status', e.target.value)}
          className="text-xs border border-gray-200 dark:border-[#1b2e4a] rounded-lg px-2 py-1 bg-gray-50 dark:bg-[#0f1a2e] disabled:opacity-50 flex-shrink-0">
          <option value="Required">Required</option>
          <option value="Not Required">Not Required</option>
        </select>
      </div>
      <input disabled={locked || status === 'Not Required'} value={value} onChange={(e) => onChange(spec.key + 'Spec', e.target.value)}
        className="w-full text-xs border border-gray-200 dark:border-[#1b2e4a] rounded-lg px-2 py-1.5 bg-gray-50 dark:bg-[#0f1a2e] disabled:opacity-40" />
    </div>
  );
}

function DynamicSpecFields({ category, crmSpec, onChange, locked }) {
  const list = crmSpec[category + 'Extra'] || [];
  const update = (list2) => onChange(category + 'Extra', list2);
  return (
    <div className="mt-2 space-y-2">
      {list.map((f, i) => (
        <div key={i} className="p-2 rounded-lg bg-gray-50 dark:bg-[#0f1a2e] space-y-1.5">
          <div className="flex items-center gap-2">
            <input disabled={locked} value={f.label} onChange={(e) => { const l = [...list]; l[i] = { ...l[i], label: e.target.value }; update(l); }}
              placeholder="Field label" className="text-xs border border-gray-200 dark:border-[#1b2e4a] rounded-lg px-2 py-1.5 bg-white dark:bg-[#070c17] flex-1 min-w-0" />
            <select disabled={locked} value={f.status || 'Required'} onChange={(e) => { const l = [...list]; l[i] = { ...l[i], status: e.target.value }; update(l); }}
              className="text-xs border border-gray-200 dark:border-[#1b2e4a] rounded-lg px-2 py-1.5 bg-white dark:bg-[#070c17] flex-shrink-0">
              <option value="Required">Required</option>
              <option value="Not Required">Not Required</option>
            </select>
            {!locked && <button onClick={() => update(list.filter((_, idx) => idx !== i))} className="text-red-400 text-sm flex-shrink-0 px-1">×</button>}
          </div>
          <input disabled={locked} value={f.spec} onChange={(e) => { const l = [...list]; l[i] = { ...l[i], spec: e.target.value }; update(l); }}
            placeholder="Spec value" className="w-full text-xs border border-gray-200 dark:border-[#1b2e4a] rounded-lg px-2 py-1.5 bg-white dark:bg-[#070c17]" />
        </div>
      ))}
      {!locked && (
        <button onClick={() => update([...list, { label: '', status: 'Required', spec: '' }])} className="text-xs font-semibold text-brand-600">+ Add More Spec</button>
      )}
    </div>
  );
}

function StageOrder({ order, onSaved }) {
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
        <Card className="border-green-300 bg-green-50 dark:bg-green-900/10">
          <p className="text-sm font-bold text-green-700">🔒 Job Sheet Confirmed & Locked</p>
          <p className="text-xs text-gray-500">Confirmed {crmSpec.specsConfirmedAt ? new Date(crmSpec.specsConfirmedAt).toLocaleString('en-IN') : ''}</p>
        </Card>
      )}

      <Card>
        <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3">Client Profile</h3>
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

      <div>
        <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">🎯 QC Requirements</h3>
        <Card>
          {QC_SPECS.map((s) => <SpecSectionRow key={s.key} spec={s} crmSpec={crmSpec} onChange={patchSpec} locked={locked} />)}
          <DynamicSpecFields category="qc" crmSpec={crmSpec} onChange={patchSpec} locked={locked} />
        </Card>
      </div>

      <div>
        <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">🔬 Laboratory & Testing Requirements</h3>
        <Card>
          {LAB_SPECS.map((s) => <SpecSectionRow key={s.key} spec={s} crmSpec={crmSpec} onChange={patchSpec} locked={locked} />)}
          <DynamicSpecFields category="lab" crmSpec={crmSpec} onChange={patchSpec} locked={locked} />
        </Card>
      </div>

      <div>
        <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">✅ Final QC Requirements</h3>
        <Card>
          {FQC_SPECS.map((s) => <SpecSectionRow key={s.key} spec={s} crmSpec={crmSpec} onChange={patchSpec} locked={locked} />)}
          <DynamicSpecFields category="fqc" crmSpec={crmSpec} onChange={patchSpec} locked={locked} />
        </Card>
      </div>

      <div>
        <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">📦 Packaging & Label Specifications</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Card><p className="text-[10px] font-bold text-gray-400 uppercase mb-1">🧴 Container</p>{PKG_CONTAINER_FIELDS.map((f) => <PlainSpecRow key={f.key} field={f} crmSpec={crmSpec} onChange={patchSpec} locked={locked} />)}</Card>
          <Card><p className="text-[10px] font-bold text-gray-400 uppercase mb-1">📦 Primary Packaging</p>{PKG_PRIMARY_FIELDS.map((f) => <PlainSpecRow key={f.key} field={f} crmSpec={crmSpec} onChange={patchSpec} locked={locked} />)}</Card>
          <Card><p className="text-[10px] font-bold text-gray-400 uppercase mb-1">📦 Secondary Packaging</p>{PKG_SECONDARY_FIELDS.map((f) => <PlainSpecRow key={f.key} field={f} crmSpec={crmSpec} onChange={patchSpec} locked={locked} />)}</Card>
        </div>
      </div>

      <div>
        <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">💰 Payment Specifications</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Card>{PAYMENT_FIELDS.slice(0, 2).map((f) => <PlainSpecRow key={f.key} field={f} crmSpec={crmSpec} onChange={patchSpec} locked={locked} />)}</Card>
          <Card>{PAYMENT_FIELDS.slice(2).map((f) => <PlainSpecRow key={f.key} field={f} crmSpec={crmSpec} onChange={patchSpec} locked={locked} />)}</Card>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={() => save()} disabled={busy || locked} className="px-4 py-2 bg-gray-100 dark:bg-[#1b2e4a] text-gray-700 dark:text-gray-200 text-sm font-semibold rounded-xl disabled:opacity-50">{busy ? 'Saving…' : 'Save Draft'}</button>
        {!locked ? (
          <button onClick={confirmJobSheet} disabled={busy} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50">✅ Confirm Job Sheet & Lock Specs</button>
        ) : (
          <span className="text-xs text-gray-400">Changes to locked specs require a manager to re-open this order.</span>
        )}
      </div>
    </div>
  );
}

// ── STAGE 1: PROCUREMENT ─────────────────────────────────────────────────────

function StageProcurement({ order, onAdvanced }) {
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
    try { await api.post(`/production/${order._id}/procurement/confirm`); toast.success('Procurement confirmed — advancing to Work Assignment'); onAdvanced(); }
    catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
    finally { setBusy(false); }
  };

  return (
    <Card>
      <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1">Formula & Raw Material Check</h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Scaled from Product Catalog for a {order.batchSizeKg || '—'}kg batch.</p>
      {rows.length === 0 ? (
        <p className="text-xs text-gray-400 py-4">No formulation ingredients found for this order's catalog product.</p>
      ) : (
        <table className="w-full text-xs">
          <thead><tr className="text-left text-[10px] uppercase text-gray-400 border-b border-gray-100 dark:border-[#1b2e4a]">
            <th className="py-1.5">Material</th><th className="py-1.5">Required</th><th className="py-1.5">In Stock</th><th className="py-1.5">Status</th>
          </tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-gray-50 dark:border-[#111b2e]">
                <td className="py-1.5 text-gray-900 dark:text-gray-100">{r.name}</td>
                <td className="py-1.5 font-mono">{r.targetQty} {r.unit}</td>
                <td className="py-1.5 font-mono">{r.stock} {r.unit}</td>
                <td className="py-1.5">{r.short ? <span className="text-red-600 font-semibold">Order More</span> : <span className="text-green-600 font-semibold">OK</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {shortRows.length > 0 && (
        <div className="mt-3 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">⚠ {shortRows.length} material(s) below required quantity — procure before proceeding.</div>
      )}
      <button onClick={confirm} disabled={busy} className="mt-4 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50">
        {busy ? 'Confirming…' : 'Formula Correct & Materials Available → Work Assignment'}
      </button>
    </Card>
  );
}

// ── STAGE 2: WORK ASSIGNMENT ──────────────────────────────────────────────────

function StageWorkAssignment({ order, onSaved }) {
  const wa = order.workAssignment || {};
  const [form, setForm] = useState({
    startDate: wa.startDate || '', endDate: wa.endDate || '', weighDate: wa.weighDate || '', prodDate: wa.prodDate || '', packDate: wa.packDate || '', qcDate: wa.qcDate || '', dispatchDate: wa.dispatchDate || order.deliveryDate || '',
    weighPerson: wa.weighPerson || '', prodPerson: wa.prodPerson || '', qcPerson: wa.qcPerson || '', packPerson: wa.packPerson || '', dispatchPerson: wa.dispatchPerson || '', supervisor: wa.supervisor || '',
  });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try { await api.patch(`/production/${order._id}/work-assignment`, form); toast.success('Work assigned — advancing to Weighing'); onSaved(); }
    catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
    finally { setBusy(false); }
  };

  const dateField = (key, label) => <Field label={label}><input type="date" value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} className={inputCls} /></Field>;
  const personField = (key, label) => <Field label={label}><input value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} className={inputCls} placeholder="Name" /></Field>;

  return (
    <Card>
      <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3">Production Schedule</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {dateField('startDate', 'Production Start')}{dateField('weighDate', 'Weighing Date')}{dateField('prodDate', 'Production Date')}
        {dateField('packDate', 'Packaging Date')}{dateField('qcDate', 'QC Target Date')}{dateField('dispatchDate', 'Dispatch Target')}
      </div>
      <h3 className="text-sm font-bold text-gray-900 dark:text-white mt-5 mb-3">Team Assignment</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {personField('weighPerson', 'Weighing In-charge')}{personField('prodPerson', 'Production In-charge')}{personField('qcPerson', 'QC In-charge')}
        {personField('packPerson', 'Packaging In-charge')}{personField('dispatchPerson', 'Dispatch In-charge')}{personField('supervisor', 'Supervisor')}
      </div>
      <button onClick={save} disabled={busy} className="mt-4 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50">{busy ? 'Saving…' : 'Confirm Schedule → Weighing'}</button>
    </Card>
  );
}

// ── STAGE 3: WEIGHING + PROCESS STEPS ─────────────────────────────────────────

function StageWeighing({ order, onSaved }) {
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
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">Ingredient Weighing</h3>
          <span className={clsx('text-[11px] font-semibold', allWeighed ? 'text-green-600' : 'text-amber-600')}>{weighedCount}/{order.ingredients.length}</span>
        </div>
        <table className="w-full text-xs">
          <thead><tr className="text-left text-[10px] uppercase text-gray-400 border-b border-gray-100 dark:border-[#1b2e4a]"><th className="py-1.5">Material</th><th className="py-1.5">Target</th><th className="py-1.5">Status</th><th className="py-1.5"></th></tr></thead>
          <tbody>
            {order.ingredients.map((ing, i) => (
              <tr key={i} className="border-b border-gray-50 dark:border-[#111b2e]">
                <td className="py-1.5 text-gray-900 dark:text-gray-100">{ing.name}</td>
                <td className="py-1.5 font-mono">{ing.targetQty} {ing.unit}</td>
                <td className="py-1.5">{ing.actualQty != null ? <span className="text-green-600 font-semibold">Weighed ({ing.actualQty}{ing.unit})</span> : <span className="text-amber-600 font-semibold">Pending</span>}</td>
                <td className="py-1.5 text-right">
                  {ing.actualQty == null && (
                    <button onClick={() => weigh(ing)} disabled={busyKey === ing.rawMaterialId} className="text-brand-600 font-semibold disabled:opacity-50">{busyKey === ing.rawMaterialId ? '…' : 'Mark Weighed'}</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">Process Steps</h3>
          <span className={clsx('text-[11px] font-semibold', allSteps ? 'text-green-600' : 'text-amber-600')}>{doneSteps}/{order.processSteps.length}</span>
        </div>
        <div className="space-y-1.5">
          {order.processSteps.map((step, i) => {
            const locked = !allWeighed || (i > 0 && !order.processSteps[i - 1].done);
            return (
              <div key={i} className={clsx('flex items-center justify-between px-3 py-2 rounded-lg border text-xs',
                step.done ? 'border-green-200 bg-green-50 dark:bg-green-900/10' : locked ? 'border-gray-100 dark:border-[#1b2e4a] opacity-50' : 'border-gray-200 dark:border-[#1b2e4a]')}>
                <span className="flex items-center gap-2 text-gray-800 dark:text-gray-200">
                  <span className={clsx('w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold', step.done ? 'bg-green-500 text-white' : 'bg-gray-200 dark:bg-[#1b2e4a] text-gray-500')}>{step.done ? '✓' : i + 1}</span>
                  {step.name}
                </span>
                {!step.done && !locked && (
                  <button onClick={() => completeStep(i)} disabled={busyKey === 'step' + i} className="text-brand-600 font-semibold disabled:opacity-50">{busyKey === 'step' + i ? '…' : 'Mark Complete'}</button>
                )}
                {locked && <LockClosedIcon className="w-3.5 h-3.5 text-gray-300" />}
              </div>
            );
          })}
        </div>
      </Card>

      {allWeighed && allSteps && (
        <Card className="border-green-300">
          <div className="flex items-center justify-between">
            <div><p className="text-sm font-bold text-green-700">✓ All weighing & process steps complete</p><p className="text-xs text-gray-500">Ready for Bulk QC</p></div>
            <button onClick={advance} disabled={busyKey === 'advance'} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50">{busyKey === 'advance' ? 'Advancing…' : 'Complete → Bulk QC'}</button>
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
    <Field label={<>{label} <span className="text-brand-500 font-normal">· Spec: {specValue(crmSpec, specKey, '—')}</span></>}>
      <input type={type} step={type === 'number' ? '0.1' : undefined} value={form[formKey]}
        onChange={(e) => setForm((f) => ({ ...f, [formKey]: e.target.value }))} className={inputCls} />
    </Field>
  );
}

function StageBulkQC({ order, onSaved }) {
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
      <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1">Bulk Quality Control</h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Fields shown are driven by the Job Sheet locked on Stage 0.</p>
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
        <button onClick={() => submit('PASS')} disabled={busy} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50">Pass → Packaging</button>
        <button onClick={() => submit('FAIL')} disabled={busy} className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold rounded-xl disabled:opacity-50">Fail / Hold</button>
      </div>
    </Card>
  );
}

// ── STAGE 5: PACKAGING ────────────────────────────────────────────────────────

function StagePackaging({ order, onSaved }) {
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
        <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3">Packaging Details</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="MRP (₹)"><input type="number" value={form.mrp} onChange={(e) => setForm((f) => ({ ...f, mrp: e.target.value }))} className={inputCls} /></Field>
          <Field label="Fill Weight/Unit (g)"><input type="number" value={form.fillWeight} onChange={(e) => setForm((f) => ({ ...f, fillWeight: e.target.value }))} className={inputCls} /></Field>
        </div>
        <p className="text-xs text-gray-400 mt-2">Batch weight: {batchGrams}g · Expected units: <strong className="text-brand-600">{expected ?? '—'}</strong></p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <Field label="Filled (units)"><input type="number" value={form.filled} onChange={(e) => setForm((f) => ({ ...f, filled: e.target.value }))} className={inputCls} /></Field>
          <Field label="Rejected"><input type="number" value={form.rejected} onChange={(e) => setForm((f) => ({ ...f, rejected: e.target.value }))} className={inputCls} /></Field>
        </div>
        <p className="text-xs text-gray-400 mt-2">Yield: <strong className="text-brand-600">{yieldPct}%</strong></p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
          <Field label="MFG Date"><input type="date" value={form.mfgDate} onChange={(e) => setForm((f) => ({ ...f, mfgDate: e.target.value }))} className={inputCls} /></Field>
          <Field label="EXP Date"><input type="date" value={form.expDate} onChange={(e) => setForm((f) => ({ ...f, expDate: e.target.value }))} className={inputCls} /></Field>
          <Field label="Units/Carton"><input type="number" value={form.cartonQty} onChange={(e) => setForm((f) => ({ ...f, cartonQty: e.target.value }))} className={inputCls} /></Field>
        </div>
        <p className="text-xs text-gray-400 mt-2">Total cartons: <strong className="text-brand-600">{totalCartons ?? '—'}</strong></p>
        <button onClick={submit} disabled={busy} className="mt-4 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50">{busy ? 'Saving…' : 'Packaging Complete → Final QC'}</button>
      </Card>
      <Card>
        <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3">Label Preview</h3>
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

function StageFinalQC({ order, onSaved }) {
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
      <Field key={field} label={<>{label} <span className="text-brand-500 font-normal">· Spec: {specValue(crmSpec, specKey, '—')}</span></>}>
        <select value={form[field]} onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))} className={inputCls}>
          <option value="">Select</option><option value="PASS">PASS</option><option value="FAIL">FAIL</option>
        </select>
      </Field>
    );
  };

  return (
    <Card>
      <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1">Final Quality Control</h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Batch {order.batch} · {p.filled || 0} units filled, {p.rejected || 0} rejected · fields driven by locked Job Sheet</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {Object.keys(FQC_SPEC_TO_FIELD).map((specKey) => selectField(specKey))}
      </div>
      <div className="mt-3"><Field label="Comments"><textarea rows={2} value={form.comment} onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))} className={inputCls} /></Field></div>
      <div className="flex gap-3 mt-4">
        <button onClick={() => submit(true)} disabled={busy} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50">Approve → Dispatch</button>
        <button onClick={() => submit(false)} disabled={busy} className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold rounded-xl disabled:opacity-50">Reject / Hold</button>
      </div>
    </Card>
  );
}

// ── STAGE 7: DISPATCH ─────────────────────────────────────────────────────────

function StageDispatch({ order, onSaved }) {
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
        <h3 className="text-sm font-bold text-gray-900 dark:text-white">Dispatch</h3>
        {already ? <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Dispatched</span> : <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Ready</span>}
      </div>
      <div className="grid grid-cols-4 gap-3 mb-4 text-xs">
        <div><p className="text-gray-400 uppercase text-[10px]">Batch Code</p><p className="font-mono font-semibold">{p.batchCode || '—'}</p></div>
        <div><p className="text-gray-400 uppercase text-[10px]">Units</p><p className="font-semibold">{p.filled || 0}</p></div>
        <div><p className="text-gray-400 uppercase text-[10px]">Rejects</p><p className="font-semibold">{p.rejected || 0}</p></div>
        <div><p className="text-gray-400 uppercase text-[10px]">Net Good</p><p className="font-semibold text-green-600">{(p.filled || 0) - (p.rejected || 0)}</p></div>
      </div>
      {already ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-green-50 dark:bg-green-900/10 border border-green-200 rounded-xl p-3">
          <div><p className="text-gray-400 uppercase text-[10px]">Carrier</p><p className="font-semibold">{order.dispatchRecord.carrier}</p></div>
          <div><p className="text-gray-400 uppercase text-[10px]">Tracking</p><p className="font-semibold">{order.dispatchRecord.tracking}</p></div>
          <div><p className="text-gray-400 uppercase text-[10px]">Date</p><p className="font-semibold">{order.dispatchRecord.date}</p></div>
          <div><p className="text-gray-400 uppercase text-[10px]">ETA</p><p className="font-semibold">{order.dispatchRecord.eta || '—'}</p></div>
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
          <button onClick={submit} disabled={busy} className="mt-4 flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50">
            <TruckIcon className="w-4 h-4" /> {busy ? 'Confirming…' : 'Confirm Dispatch'}
          </button>
        </>
      )}
    </Card>
  );
}

// ── ROOT ──────────────────────────────────────────────────────────────────────

export default function BatchTracker() {
  const [selectedId, setSelectedId] = useState(null);
  const [showNewOrder, setShowNewOrder] = useState(false);

  return (
    <div className="space-y-5">
      {selectedId
        ? <OrderDetail id={selectedId} onBack={() => setSelectedId(null)} />
        : <Dashboard onOpen={setSelectedId} onNew={() => setShowNewOrder(true)} />}
      {showNewOrder && (
        <NewOrderModal onClose={() => setShowNewOrder(false)} onCreated={(id) => { setShowNewOrder(false); setSelectedId(id); }} />
      )}
    </div>
  );
}
