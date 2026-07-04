import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import QRCode from 'react-qr-code';
import toast from 'react-hot-toast';
import api from '../../api/axios';

// ── Constants ──────────────────────────────────────────────────────────────

const CATEGORIES = ['Hair Care','Skin Care','Face Care','Body Care','Oral Care',"Men's Care",'Baby Care','Sun Care','Makeup','Fragrance','Wellness','Professional','Other'];
const CAT_PREFIX = { 'Hair Care':'HC','Skin Care':'SK','Face Care':'FC','Body Care':'BC','Oral Care':'OC',"Men's Care":'MC','Baby Care':'BY','Sun Care':'SC','Makeup':'MK','Fragrance':'FR','Wellness':'WL','Professional':'PR','Other':'OT' };
const PRODUCT_TYPES = ['Shampoo','Conditioner','Hair Oil','Serum','Cream','Lotion','Face Wash','Mask','Scrub','Toner','Moisturizer','Cleanser','Soap','Body Wash','Sunscreen','Lip Balm','Deodorant','Perfume','Toothpaste','Hair Spray','Other'];
const STATUSES = ['Active','Inactive','Draft','Archived'];
const STATUS_COLORS = { Active:'bg-emerald-500/15 text-emerald-400', Inactive:'bg-gray-500/15 text-gray-400', Draft:'bg-blue-500/15 text-blue-400', Archived:'bg-red-500/15 text-red-400 line-through' };

const DETAIL_TABS = [
  { id:'overview',    label:'Overview',       icon:'📋' },
  { id:'formulation', label:'Formulation',    icon:'🧪' },
  { id:'overheads',   label:'R&D & Overhead', icon:'⚙️' },
  { id:'costing',     label:'Costing',        icon:'💰' },
  { id:'marketplace', label:'Marketplace',    icon:'🛒' },
  { id:'qr',          label:'QR Code',        icon:'🔲' },
  { id:'procedure',   label:'Procedure',      icon:'📝' },
  { id:'documents',   label:'Documents',      icon:'📄' },
  { id:'history',     label:'History',        icon:'🕐' },
];

// ── Defaults ───────────────────────────────────────────────────────────────

const DEF_FORMULATION = { refWeight: 100, refUnit: 'ml', rows: [] };
const DEF_STD_ASS = { equipmentPct: 3, consumablesPct: 1, storagePct: 2, housekeepingPct: 1, adminPct: 5, wastagePct: 2 };
const DEF_RND = { testing: 0, consumables: 0, samples: 0, overhead: 0, otherOverhead: 0, qc: 0, lifecycle: 1000 };
const DEF_PROD_OH = { electricity: 0, labor: 0, labTesting: 0, other: 0 };
const DEF_BOM_PKG = {
  items: [
    { name:'Individual Carton / Bottle', qty:1, rate:0, optional:false },
    { name:'Label', qty:1, rate:0, optional:true },
    { name:'Primary Box', qty:1, rate:0, optional:true },
    { name:'Batch Packing Box', qty:0.1, rate:0, optional:true },
    { name:'Shipment Packaging', qty:0.05, rate:0, optional:true },
  ],
  charges:{ machine:0, shrinkWrap:0, other:0 }
};
const DEF_COSTING = { margins:{ exFactory:10, dealer:15, distributor:20, retailer:25, selling:35, b2b:20, b2c:40 } };
const DEF_MARKETPLACE = {
  packaging:[
    { name:'Primary Box', qty:1, rate:0, optional:false },
    { name:'Bubble Wrap', qty:1, rate:0, optional:true },
    { name:'Shipping Label', qty:1, rate:0, optional:false },
  ],
  fees:{
    flipkart:{ commission:15, fixed:30, shipping:50, collection:2 },
    amazon:{ commission:15, fixed:40, shipping:50, fba:3 },
    meesho:{ commission:0, shipping:70, collection:0, penalty:2 },
    snapdeal:{ commission:12, fixed:20, shipping:50, collection:1.5 },
  },
  margins:{ flipkart:25, amazon:25, meesho:30, snapdeal:25 },
};

// ── Calculation helpers ────────────────────────────────────────────────────

const f2 = (n, d = 2) => (parseFloat(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmt = (n, d = 2) => '₹' + f2(n, d);

function calcFormCosts(formulation) {
  const rows = formulation?.rows || [];
  const refWeight = parseFloat(formulation?.refWeight) || 100;
  let totalAmount = 0, totalPct = 0;
  rows.forEach(r => {
    const qty = ((parseFloat(r.percentage) || 0) / 100) * refWeight * (parseFloat(r.conversion) || 1);
    totalAmount += qty * (parseFloat(r.unitPrice) || 0);
    totalPct += parseFloat(r.percentage) || 0;
  });
  return { totalAmount, costPerUnit: refWeight > 0 ? totalAmount / refWeight : 0, totalPct, refWeight };
}

function calcBaseCost(draft) {
  const form = calcFormCosts(draft.formulation);
  const rw = form.refWeight;
  const oh = draft.productionOverhead || DEF_PROD_OH;
  const ohTotal = (oh.electricity||0) + (oh.labor||0) + (oh.labTesting||0) + (oh.other||0);
  const ohPerUnit = rw > 0 ? ohTotal / rw : 0;
  const rnd = draft.rnd || DEF_RND;
  const rndTotal = (rnd.testing||0) + (rnd.consumables||0) + (rnd.samples||0) + (rnd.overhead||0) + (rnd.otherOverhead||0) + (rnd.qc||0);
  const rndPerUnit = (rnd.lifecycle || 0) > 0 ? rndTotal / rnd.lifecycle : 0;
  const sa = draft.standardAssumptions || DEF_STD_ASS;
  const saPct = (sa.equipmentPct||0) + (sa.consumablesPct||0) + (sa.storagePct||0) + (sa.housekeepingPct||0) + (sa.adminPct||0) + (sa.wastagePct||0);
  const saPerUnit = rw > 0 ? (form.totalAmount * saPct / 100) / rw : 0;
  const pkg = draft.bomPackaging || DEF_BOM_PKG;
  const pkgItems = (pkg.items || []).reduce((s, i) => s + (i.qty||0)*(i.rate||0), 0);
  const pkgCharges = (pkg.charges?.machine||0) + (pkg.charges?.shrinkWrap||0) + (pkg.charges?.other||0);
  const pkgPerUnit = pkgItems + (rw > 0 ? pkgCharges / rw : 0);
  return { formCostPerUnit: form.costPerUnit, saPerUnit, ohPerUnit, rndPerUnit, pkgPerUnit, total: form.costPerUnit + saPerUnit + ohPerUnit + rndPerUnit + pkgPerUnit, rw, saPct, rndTotal, ohTotal };
}

function calcPlatform(baseCost, fees, margin) {
  const ded = ((fees.commission||0) + (fees.collection||0) + (fees.fba||0) + (fees.penalty||0)) / 100;
  const mPct = (margin||0) / 100;
  const fixed = fees.fixed || 0;
  const ship = fees.shipping || 0;
  const denom = 1 - ded - mPct;
  if (denom <= 0) return { minSelling: 0, sellerReceives: 0, netMargin: 0 };
  const minSelling = (baseCost + fixed + ship) / denom;
  const sellerReceives = minSelling * (1 - ded) - fixed - ship;
  return { minSelling, sellerReceives, netMargin: sellerReceives - baseCost };
}

function initDraft(p) {
  return {
    ...p,
    formulation: { ...DEF_FORMULATION, ...(p.formulation||{}), rows: JSON.parse(JSON.stringify((p.formulation?.rows)||[])) },
    standardAssumptions: { ...DEF_STD_ASS, ...(p.standardAssumptions||{}) },
    rnd: { ...DEF_RND, ...(p.rnd||{}) },
    productionOverhead: { ...DEF_PROD_OH, ...(p.productionOverhead||{}) },
    bomPackaging: {
      ...DEF_BOM_PKG, ...(p.bomPackaging||{}),
      items: JSON.parse(JSON.stringify(p.bomPackaging?.items || DEF_BOM_PKG.items)),
      charges: { ...DEF_BOM_PKG.charges, ...(p.bomPackaging?.charges||{}) },
    },
    costing: { ...DEF_COSTING, ...(p.costing||{}), margins: { ...DEF_COSTING.margins, ...(p.costing?.margins||{}) } },
    marketplace: {
      ...DEF_MARKETPLACE, ...(p.marketplace||{}),
      fees: {
        flipkart: { ...DEF_MARKETPLACE.fees.flipkart, ...(p.marketplace?.fees?.flipkart||{}) },
        amazon: { ...DEF_MARKETPLACE.fees.amazon, ...(p.marketplace?.fees?.amazon||{}) },
        meesho: { ...DEF_MARKETPLACE.fees.meesho, ...(p.marketplace?.fees?.meesho||{}) },
        snapdeal: { ...DEF_MARKETPLACE.fees.snapdeal, ...(p.marketplace?.fees?.snapdeal||{}) },
      },
      margins: { ...DEF_MARKETPLACE.margins, ...(p.marketplace?.margins||{}) },
      packaging: JSON.parse(JSON.stringify(p.marketplace?.packaging || DEF_MARKETPLACE.packaging)),
    },
    variants: JSON.parse(JSON.stringify(p.variants||[])),
    procedure: { text: '', attachments: [], ...(p.procedure||{}) },
    rndDoc: { text: '', attachments: [], lastUpdated: null, ...(p.rndDoc||{}) },
    researchGuide: { text: '', lastUpdated: null, ...(p.researchGuide||{}) },
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function statusBadge(status) {
  const cls = STATUS_COLORS[status] || STATUS_COLORS.Active;
  return <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${cls}`}>{status||'Active'}</span>;
}

// ── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({ label, value, icon, color }) {
  return (
    <div className="card p-5 flex justify-between items-start">
      <div><p className="text-xs text-gray-400 font-medium mb-1">{label}</p><p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p></div>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${color}`}>{icon}</div>
    </div>
  );
}

// ── Product Add/Edit Modal ─────────────────────────────────────────────────

const MODAL_TABS = [
  { id:'basic', label:'Basic Info', icon:'📋' }, { id:'pricing', label:'Pricing', icon:'💰' },
  { id:'variants', label:'Variants', icon:'🧴' }, { id:'more', label:'More Details', icon:'📝' },
];

function ProductModal({ onClose, onSuccess, initial }) {
  const [activeTab, setActiveTab] = useState('basic');
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit, control, watch, setValue } = useForm({
    defaultValues: {
      sku: initial?.sku||'', name: initial?.name||'', category: initial?.category||'',
      subCategory: initial?.subCategory||'', productType: initial?.productType||'',
      unit: initial?.unit||'ml', hsnCode: initial?.hsnCode||'', gstRate: initial?.gstRate??18,
      shelfLife: initial?.shelfLife||'', status: initial?.status||'Active',
      description: initial?.description||'', certifications: initial?.certifications||'',
      storageConditions: initial?.storageConditions||'', barcode: initial?.barcode||'',
      imageUrl: initial?.images?.[0]||'',
      costPrice: initial?.costPrice||'', sellingPrice: initial?.sellingPrice||'',
      mrp: initial?.mrp||'', minStockLevel: initial?.minStockLevel||0,
      variants: initial?.variants?.length ? initial.variants : [{ name:'', size:'', unit:'ml', moq:'', moqUnit:'pcs', sellingPrice:'', mrp:'' }],
    },
  });
  const { fields: variantFields, append: appendVariant, remove: removeVariant } = useFieldArray({ control, name:'variants' });

  const watchedName = watch('name');
  const watchedCategory = watch('category');
  const watchedImageUrl = watch('imageUrl');

  useEffect(() => {
    if (initial) return;
    if (!watchedName || watchedName.length < 2) return;
    const catCode = CAT_PREFIX[watchedCategory] || 'OT';
    const words = watchedName.trim().split(/\s+/).filter(Boolean);
    const initials = words.map(w => (w[0]||'').toUpperCase()).join('').slice(0, 4) || 'XX';
    const num = String(words.reduce((s, w) => s + (w.charCodeAt(0)||65), 0) % 900 + 100);
    setValue('sku', `${catCode}-${initials}-${num}`, { shouldValidate: false });
  }, [watchedName, watchedCategory]);

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      const { imageUrl, ...rest } = data;
      const payload = { ...rest, isRawMaterial: false, isFinishedGood: true, isSellable: true, images: imageUrl ? [imageUrl] : (initial?.images || []) };
      if (initial?._id) { await api.put(`/inventory/products/${initial._id}`, payload); toast.success('Product updated'); }
      else { await api.post('/inventory/products', payload); toast.success('Product added'); }
      onSuccess();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to save'); }
    finally { setLoading(false); }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/70 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-2xl card shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 className="font-bold text-gray-900 dark:text-gray-100 text-base">{initial ? `Edit — ${initial.name}` : 'Add New Product'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-2xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">&times;</button>
        </div>
        <div className="flex border-b border-gray-700 px-6">
          {MODAL_TABS.map(t => (
            <button key={t.id} type="button" onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-3 text-xs font-semibold border-b-2 transition-colors -mb-px ${activeTab === t.id ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="p-6 max-h-[60vh] overflow-y-auto">
            {activeTab === 'basic' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {!initial && <div><label className="label">SKU <span className="text-red-400">*</span><span className="ml-2 text-[10px] text-indigo-400 font-normal">auto-generated</span></label><input {...register('sku',{required:true})} className="input font-mono" placeholder="Auto-fills from name…" /></div>}
                  <div className={initial ? 'col-span-2' : ''}><label className="label">Product Name <span className="text-red-400">*</span></label><input {...register('name',{required:true})} className="input" /></div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div><label className="label">Category <span className="text-red-400">*</span></label><select {...register('category',{required:true})} className="input"><option value="">Select</option>{CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
                  <div><label className="label">Sub-Category</label><input {...register('subCategory')} className="input" /></div>
                  <div><label className="label">Product Type</label><select {...register('productType')} className="input"><option value="">Select</option>{PRODUCT_TYPES.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div><label className="label">Base Unit</label><select {...register('unit')} className="input">{['ml','g','L','kg','piece'].map(u=><option key={u} value={u}>{u}</option>)}</select></div>
                  <div><label className="label">HSN Code</label><input {...register('hsnCode')} className="input" /></div>
                  <div><label className="label">GST Rate</label><select {...register('gstRate')} className="input">{[0,5,12,18,28].map(r=><option key={r} value={r}>{r}%</option>)}</select></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="label">Status</label><select {...register('status')} className="input">{STATUSES.map(s=><option key={s} value={s}>{s}</option>)}</select></div>
                  <div><label className="label">Shelf Life (months)</label><input {...register('shelfLife')} type="number" min="0" className="input" /></div>
                </div>
                <div><label className="label">Description</label><textarea {...register('description')} className="input resize-none" rows={2} /></div>
                <div>
                  <label className="label">Product Image URL</label>
                  <input {...register('imageUrl')} className="input" placeholder="https://example.com/product.jpg" />
                  {watchedImageUrl && (
                    <div className="mt-2 rounded-xl overflow-hidden bg-gray-700/20 h-36 flex items-center justify-center">
                      <img src={watchedImageUrl} alt="Preview" className="max-h-full max-w-full object-contain" onError={e => { e.currentTarget.style.display='none'; }} />
                    </div>
                  )}
                </div>
              </div>
            )}
            {activeTab === 'pricing' && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div><label className="label">Cost Price (₹)</label><input {...register('costPrice')} type="number" step="0.01" className="input" /></div>
                  <div><label className="label">Selling Price (₹)</label><input {...register('sellingPrice')} type="number" step="0.01" className="input" /></div>
                  <div><label className="label">MRP (₹)</label><input {...register('mrp')} type="number" step="0.01" className="input" /></div>
                </div>
                <div><label className="label">Min Stock Level</label><input {...register('minStockLevel')} type="number" min="0" className="input w-40" /></div>
                <p className="text-xs text-indigo-300 bg-indigo-500/5 border border-indigo-500/20 rounded-lg p-3">💡 For full cost build-up (BOM + overheads + margins), open product detail → Formulation & Costing tabs.</p>
              </div>
            )}
            {activeTab === 'variants' && (
              <div className="space-y-3">
                <p className="text-xs text-gray-400">Add size variants (100ml, 200ml, 500ml…)</p>
                <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                  {variantFields.map((field, i) => (
                    <div key={field.id} className="grid grid-cols-7 gap-2 items-end p-2 bg-gray-700/30 rounded-lg">
                      <div><label className="label text-[10px]">Name</label><input {...register(`variants.${i}.name`)} className="input text-xs py-1.5" placeholder="100ml" /></div>
                      <div><label className="label text-[10px]">Size</label><input {...register(`variants.${i}.size`)} type="number" className="input text-xs py-1.5" /></div>
                      <div><label className="label text-[10px]">Unit</label><select {...register(`variants.${i}.unit`)} className="input text-xs py-1.5">{['ml','g','L','kg','pcs'].map(u=><option key={u} value={u}>{u}</option>)}</select></div>
                      <div><label className="label text-[10px]">MOQ</label><input {...register(`variants.${i}.moq`)} type="number" className="input text-xs py-1.5" /></div>
                      <div><label className="label text-[10px]">SP (₹)</label><input {...register(`variants.${i}.sellingPrice`)} type="number" step="0.01" className="input text-xs py-1.5" /></div>
                      <div><label className="label text-[10px]">MRP (₹)</label><input {...register(`variants.${i}.mrp`)} type="number" step="0.01" className="input text-xs py-1.5" /></div>
                      <button type="button" onClick={() => removeVariant(i)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-500/20 text-red-400 self-end">✕</button>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={() => appendVariant({ name:'', size:'', unit:'ml', moq:'', moqUnit:'pcs', sellingPrice:'', mrp:'' })} className="btn btn-ghost text-xs border border-gray-600 w-full">+ Add Variant</button>
              </div>
            )}
            {activeTab === 'more' && (
              <div className="space-y-4">
                <div><label className="label">Storage Conditions</label><input {...register('storageConditions')} className="input" /></div>
                <div><label className="label">Certifications</label><input {...register('certifications')} className="input" /></div>
                <div><label className="label">Barcode</label><input {...register('barcode')} className="input" /></div>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-700">
            <div className="flex gap-1">{MODAL_TABS.map(t => <button key={t.id} type="button" onClick={() => setActiveTab(t.id)} className={`w-2 h-2 rounded-full transition-colors ${activeTab === t.id ? 'bg-indigo-500' : 'bg-gray-600 hover:bg-gray-500'}`} />)}</div>
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
              {activeTab !== 'more'
                ? <button type="button" onClick={() => setActiveTab(MODAL_TABS[MODAL_TABS.findIndex(t=>t.id===activeTab)+1].id)} className="btn btn-primary">Next →</button>
                : <button type="submit" disabled={loading} className="btn btn-primary">{loading ? 'Saving…' : initial ? 'Update' : 'Add Product'}</button>
              }
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

// ── Quick QR Modal ─────────────────────────────────────────────────────────

function QRModal({ product, onClose }) {
  const qrData = JSON.stringify({ sku: product.sku, name: product.name, category: product.category, hsn: product.hsnCode||'', gst: product.gstRate, unit: product.unit, mrp: product.mrp });
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/70 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-sm card shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 className="font-bold text-gray-900 dark:text-gray-100">QR Label</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-2xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">&times;</button>
        </div>
        <div className="p-6 flex flex-col items-center gap-4">
          <div className="bg-white p-4 rounded-xl"><QRCode value={qrData} size={200} /></div>
          <div className="text-center">
            <p className="font-bold text-gray-900 dark:text-gray-100">{product.name}</p>
            <p className="text-xs text-gray-400 mt-1"><span className="block">SKU: {product.sku}</span><span className="block">HSN: {product.hsnCode||'-'} · GST: {product.gstRate}%</span>{product.mrp && <span className="block">MRP: ₹{product.mrp}</span>}</p>
          </div>
          <button className="btn btn-primary w-full" onClick={() => window.print()}>🖨️ Print Label</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Product Detail Modal (Phase 2) ─────────────────────────────────────────

function ProductDetailModal({ product, onClose, onSuccess }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [draft, setDraft] = useState(() => initDraft(product));
  const [saving, setSaving] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recTime, setRecTime] = useState('00:00');
  const [rmOpen, setRmOpen] = useState(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recTimerRef = useRef(null);

  const { data: rawMats = [] } = useQuery({
    queryKey: ['raw-materials-bom'],
    queryFn: () => api.get('/inventory/products', { params: { isRawMaterial: true, limit: 500 } })
      .then(r => r.data.data.products || r.data.data || []),
    staleTime: 60000,
  });

  const filteredMats = useMemo(() => {
    if (rmOpen === null) return [];
    const q = (draft.formulation.rows[rmOpen]?.name || '').toLowerCase().trim();
    if (!q) return rawMats.slice(0, 10);
    return rawMats.filter(m => m.name?.toLowerCase().includes(q) || m.sku?.toLowerCase().includes(q) || m.code?.toLowerCase().includes(q)).slice(0, 15);
  }, [rmOpen, draft.formulation.rows, rawMats]);

  const costs = useMemo(() => calcBaseCost(draft), [draft]);
  const formStats = useMemo(() => calcFormCosts(draft.formulation), [draft.formulation]);

  const setField = useCallback((path, value) => {
    setDraft(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      const parts = path.split('.');
      let obj = next;
      for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]];
      obj[parts[parts.length - 1]] = value;
      return next;
    });
  }, []);

  const numField = (path, val) => setField(path, parseFloat(val) || 0);

  async function handleSave() {
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const payload = JSON.parse(JSON.stringify(draft));
      if (payload.rnd) payload.rnd.lastUpdated = now;
      if (payload.productionOverhead) payload.productionOverhead.lastUpdated = now;
      if (payload.standardAssumptions) payload.standardAssumptions.lastUpdated = now;
      if (payload.rndDoc?.text) payload.rndDoc.lastUpdated = now;
      if (payload.researchGuide?.text) payload.researchGuide.lastUpdated = now;
      await api.put(`/inventory/products/${draft._id}`, payload);
      toast.success('Saved');
      onSuccess();
    } catch { toast.error('Save failed'); }
    finally { setSaving(false); }
  }

  function addFormRow() {
    setDraft(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      next.formulation.rows.push({ code:'', name:'', percentage:0, conversion:1, unit: next.formulation.refUnit||'ml', phase:'', notes:'', unitPrice:0, category:'', supplier:'', hsnCode:'', gstRate:0 });
      return next;
    });
  }
  function removeFormRow(i) {
    setDraft(prev => { const next = JSON.parse(JSON.stringify(prev)); next.formulation.rows.splice(i,1); return next; });
  }
  function setFormRow(i, field, val) {
    setDraft(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      next.formulation.rows[i][field] = ['percentage','conversion','unitPrice','gstRate'].includes(field) ? parseFloat(val)||0 : val;
      return next;
    });
  }
  function handleMatInput(i, name) {
    const mat = rawMats.find(m => m.name === name);
    if (!mat) return;
    setDraft(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      const r = next.formulation.rows[i];
      r.name = mat.name; r.code = mat.sku||mat.code||''; r.unit = mat.unit||next.formulation.refUnit;
      r.unitPrice = mat.costPrice||mat.unitPrice||0; r.category = mat.category||''; r.hsnCode = mat.hsnCode||''; r.gstRate = mat.gstRate||0; r.supplier = mat.supplier||'';
      return next;
    });
  }
  function selectRawMat(i, mat) {
    setDraft(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      const r = next.formulation.rows[i];
      r.name = mat.name; r.code = mat.sku||mat.code||''; r.unit = mat.unit||next.formulation.refUnit;
      r.unitPrice = mat.costPrice||mat.unitPrice||0; r.category = mat.category||''; r.hsnCode = mat.hsnCode||''; r.gstRate = mat.gstRate||0; r.supplier = mat.supplier||'';
      return next;
    });
    setRmOpen(null);
  }
  function autoGenMatCode(i, name) {
    const words = (name||'').trim().split(/\s+/).filter(Boolean);
    const initials = words.map(w => (w[0]||'').toUpperCase()).join('').slice(0, 4) || 'RM';
    const num = String(words.reduce((s, w) => s + (w.charCodeAt(0)||65), 0) % 900 + 100);
    const code = `RM-${initials}-${num}`;
    setFormRow(i, 'code', code);
    setRmOpen(null);
    toast.success(`Code generated: ${code}`);
  }

  function setPkgItem(pkgPath, i, field, val) {
    setDraft(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      const list = pkgPath.split('.').reduce((o,k) => o[k], next);
      list[i][field] = ['qty','rate'].includes(field) ? parseFloat(val)||0 : field==='optional' ? val : val;
      return next;
    });
  }
  function addPkgItem(pkgPath) {
    setDraft(prev => { const next = JSON.parse(JSON.stringify(prev)); const list = pkgPath.split('.').reduce((o,k)=>o[k], next); list.push({ name:'New Item', qty:1, rate:0, optional:false }); return next; });
  }
  function removePkgItem(pkgPath, i) {
    setDraft(prev => { const next = JSON.parse(JSON.stringify(prev)); const list = pkgPath.split('.').reduce((o,k)=>o[k], next); list.splice(i,1); return next; });
  }

  // ── Procedure handlers ───────────────────────────────────────────────────
  function addProcAttachment(type, name, data) {
    setDraft(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      if (!next.procedure) next.procedure = { text: '', attachments: [] };
      next.procedure.attachments.push({ type, name, data, createdAt: new Date().toISOString() });
      return next;
    });
  }
  function removeProcAttachment(i) {
    if (!confirm('Remove this attachment?')) return;
    setDraft(prev => { const next = JSON.parse(JSON.stringify(prev)); next.procedure.attachments.splice(i, 1); return next; });
  }
  function handleProcFile(e) {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => addProcAttachment('document', f.name, ev.target.result);
    r.readAsDataURL(f); e.target.value = '';
  }
  function handleProcVideo(e) {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => addProcAttachment('video', f.name, ev.target.result);
    r.readAsDataURL(f); e.target.value = '';
  }
  async function toggleAudio() {
    if (recording) { mediaRecorderRef.current?.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      audioChunksRef.current = [];
      rec.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        addProcAttachment('audio', `Recording ${new Date().toLocaleString()}`, url);
        clearInterval(recTimerRef.current); setRecTime('00:00'); setRecording(false);
        stream.getTracks().forEach(t => t.stop());
      };
      rec.start(); mediaRecorderRef.current = rec; setRecording(true);
      let s = 0;
      recTimerRef.current = setInterval(() => {
        s++;
        setRecTime(String(Math.floor(s/60)).padStart(2,'0') + ':' + String(s%60).padStart(2,'0'));
      }, 1000);
    } catch { toast.error('Microphone access denied'); }
  }

  // ── R&D Doc handlers ─────────────────────────────────────────────────────
  function handleRNDDocFile(e) {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => {
      setDraft(prev => {
        const next = JSON.parse(JSON.stringify(prev));
        if (!next.rndDoc) next.rndDoc = { text: '', attachments: [], lastUpdated: null };
        next.rndDoc.attachments.push({ type: 'document', name: f.name, data: ev.target.result, createdAt: new Date().toISOString() });
        return next;
      });
      toast.success('R&D document attached: ' + f.name);
    };
    r.readAsDataURL(f); e.target.value = '';
  }
  function removeRNDAttachment(i) {
    if (!confirm('Remove this R&D document?')) return;
    setDraft(prev => { const next = JSON.parse(JSON.stringify(prev)); next.rndDoc.attachments.splice(i, 1); return next; });
  }

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto bg-gray-900/70 backdrop-blur-sm" onClick={onClose}>
      <div className="flex min-h-full items-center justify-center p-4">
      <div className="relative w-full max-w-5xl card shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Sticky header + tabs + cost bar */}
        <div className="sticky top-0 z-10 rounded-t-2xl" style={{background:'var(--s-card)'}}>
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-gray-700">
            <div>
              <h2 className="font-bold text-gray-900 dark:text-gray-100">{draft.name}</h2>
              <p className="text-xs text-gray-400">{draft.sku} · {draft.category}{draft.productType ? ` · ${draft.productType}` : ''}</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleSave} disabled={saving} className="btn btn-primary text-xs">{saving ? 'Saving…' : '💾 Save All'}</button>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-2xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">&times;</button>
            </div>
          </div>
          {/* Tabs */}
          <div className="flex border-b border-gray-700 px-4 overflow-x-auto">
            {DETAIL_TABS.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-colors -mb-px whitespace-nowrap ${activeTab === t.id ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
          {/* Cost Summary Bar */}
          {(costs.total > 0 || formStats.totalAmount > 0) && (
            <div className="flex items-center gap-3 px-5 py-2 bg-indigo-500/5 border-b border-indigo-500/15 text-xs flex-wrap">
              <span className="text-gray-400 font-semibold">📊 Cost:</span>
              <span className="text-gray-500">Form Cost: <span className="text-indigo-300 font-bold">{fmt(formStats.totalAmount)}</span></span>
              <span className="text-gray-600">·</span>
              <span className="text-gray-500">Ref Wt: <span className="text-gray-200 font-semibold">{draft.formulation.refWeight} {draft.formulation.refUnit}</span></span>
              <span className="text-gray-600">·</span>
              <span className="text-gray-500">Cost/Unit: <span className="text-indigo-300 font-bold">{fmt(formStats.costPerUnit, 4)}</span></span>
              <span className="text-gray-600">·</span>
              <span className="text-gray-500">Total (with OH+Pkg): <span className="text-emerald-400 font-bold">{fmt(costs.total, 4)}</span></span>
            </div>
          )}
        </div>
        {/* Scrollable content */}
        <div className="p-5 max-h-[65vh] overflow-y-auto">

          {/* OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="grid grid-cols-3 gap-5">
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">📋 Basic Info</p>
                {[['SKU',draft.sku],['Category',draft.category],['Sub-Category',draft.subCategory||'-'],['Type',draft.productType||'-'],['Base Unit',draft.unit],['Shelf Life',draft.shelfLife?`${draft.shelfLife} months`:'-'],['Status',draft.status||'Active']].map(([l,v]) => (
                  <div key={l} className="flex justify-between py-1.5 border-b border-gray-700/30 text-xs"><span className="text-gray-400">{l}</span><span className="font-medium text-gray-700 dark:text-gray-200">{v}</span></div>
                ))}
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">💰 Pricing</p>
                {[['HSN Code',draft.hsnCode||'-'],['GST Rate',`${draft.gstRate}%`],['Cost Price',draft.costPrice?fmt(draft.costPrice):'-'],['Selling Price',draft.sellingPrice?fmt(draft.sellingPrice):'-'],['MRP',draft.mrp?fmt(draft.mrp):'-'],['BOM Cost/unit',costs.total>0?fmt(costs.total,4):'—']].map(([l,v]) => (
                  <div key={l} className="flex justify-between py-1.5 border-b border-gray-700/30 text-xs"><span className="text-gray-400">{l}</span><span className="font-medium text-gray-700 dark:text-gray-200">{v}</span></div>
                ))}
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">🧴 Variants</p>
                {draft.variants?.length ? draft.variants.map((v,i) => (
                  <div key={i} className="flex items-center justify-between px-2 py-2 bg-gray-700/30 rounded-lg text-xs mb-1">
                    <span className="font-semibold text-indigo-600 dark:text-indigo-300">{v.name||`${v.size}${v.unit}`}</span>
                    <span className="text-gray-500 dark:text-gray-400">MOQ: {v.moq||'-'}</span>
                    <span className="text-emerald-600 dark:text-emerald-400">{v.mrp?`₹${v.mrp}`:v.sellingPrice?`₹${v.sellingPrice}`:'-'}</span>
                  </div>
                )) : <p className="text-xs text-gray-500">No variants</p>}
                {draft.certifications && <div className="mt-3 p-2 bg-gray-100 dark:bg-gray-700/20 rounded-lg text-xs text-gray-700 dark:text-gray-300"><span className="font-semibold">Certs: </span>{draft.certifications}</div>}
                {draft.storageConditions && <div className="mt-1 p-2 bg-gray-100 dark:bg-gray-700/20 rounded-lg text-xs text-gray-700 dark:text-gray-300"><span className="font-semibold">Storage: </span>{draft.storageConditions}</div>}
              </div>
            </div>
          )}

          {/* FORMULATION */}
          {activeTab === 'formulation' && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-3 bg-gray-700/20 rounded-lg flex-wrap">
                <label className="text-xs text-gray-400 font-semibold whitespace-nowrap">Reference Weight:</label>
                <input type="number" value={draft.formulation.refWeight} onChange={e => setField('formulation.refWeight', parseFloat(e.target.value)||100)} className="input w-24 text-sm" />
                <select value={draft.formulation.refUnit} onChange={e => setField('formulation.refUnit', e.target.value)} className="input w-20 text-sm">
                  {['ml','g','L','kg'].map(u => <option key={u} value={u}>{u}</option>)}
                </select>
                <div className="ml-auto flex gap-4 text-xs">
                  <span className={`font-semibold ${Math.abs(formStats.totalPct-100)<0.01?'text-emerald-400':formStats.totalPct>100?'text-red-400':'text-amber-400'}`}>Total: {f2(formStats.totalPct,2)}%</span>
                  <span className="text-gray-400">Cost/unit: <span className="text-indigo-300 font-bold">{fmt(formStats.costPerUnit,4)}</span></span>
                  <span className="text-gray-500 dark:text-gray-400">Batch total: <span className="text-gray-800 dark:text-gray-200 font-semibold">{fmt(formStats.totalAmount)}</span></span>
                </div>
              </div>
              <div className="overflow-x-auto rounded-lg border border-gray-700">
                <table className="w-full text-xs">
                  <thead className="bg-gray-800/60">
                    <tr>{['#','Code','Material','%','Qty','Conv','Unit','Phase','Notes','₹/unit','Amount',''].map((h,i) => <th key={i} className="px-2 py-2 text-left text-gray-400 font-semibold whitespace-nowrap">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700/30">
                    {draft.formulation.rows.length === 0 && (
                      <tr><td colSpan={12} className="text-center py-8 text-gray-500">No ingredients yet. Click "+ Add Ingredient" to start.</td></tr>
                    )}
                    {draft.formulation.rows.map((r, i) => {
                      const qty = ((r.percentage||0)/100) * (draft.formulation.refWeight||100) * (r.conversion||1);
                      const amount = qty * (r.unitPrice||0);
                      return (
                        <tr key={i} className="hover:bg-gray-100 dark:hover:bg-gray-700/20">
                          <td className="px-2 py-1.5 text-gray-500 text-center">{i+1}</td>
                          <td className="px-1 py-1.5"><input value={r.code||''} onChange={e=>setFormRow(i,'code',e.target.value)} className="input text-xs py-1 w-20" placeholder="Code" /></td>
                          <td className="px-1 py-1.5">
                            <div className="relative">
                              <input
                                value={r.name||''}
                                onChange={e => { setFormRow(i,'name',e.target.value); setRmOpen(i); }}
                                onFocus={() => setRmOpen(i)}
                                onBlur={() => setTimeout(() => setRmOpen(null), 200)}
                                className="input text-xs py-1 w-44"
                                placeholder="Type material…"
                                autoComplete="off"
                              />
                              {rmOpen === i && (
                                <div className="absolute z-50 top-full left-0 mt-0.5 w-72 bg-gray-800 border border-gray-600 rounded-lg shadow-xl overflow-y-auto" style={{maxHeight:'200px'}}>
                                  {filteredMats.length === 0 ? (
                                    <div className="px-3 py-2.5 text-xs text-gray-400">
                                      No raw material found.
                                      {r.name && <button onMouseDown={()=>autoGenMatCode(i,r.name)} className="ml-1 text-indigo-400 hover:text-indigo-300 underline">Auto-generate code</button>}
                                    </div>
                                  ) : filteredMats.map(mat => (
                                    <button key={mat._id} onMouseDown={() => selectRawMat(i, mat)}
                                      className="w-full text-left px-3 py-2 text-xs hover:bg-gray-700 border-b border-gray-700/40 last:border-0">
                                      <p className="font-semibold text-gray-100">{mat.name}</p>
                                      <p className="text-gray-400 mt-0.5">{mat.sku||mat.code} · ₹{mat.costPrice||mat.unitPrice||0}/{mat.unit}{mat.category ? ` · ${mat.category}` : ''}</p>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-1 py-1.5"><input type="number" value={r.percentage||0} step="0.01" onChange={e=>setFormRow(i,'percentage',e.target.value)} className="input text-xs py-1 w-16" /></td>
                          <td className="px-2 py-1.5 text-indigo-300 font-semibold whitespace-nowrap">{f2(qty,3)}</td>
                          <td className="px-1 py-1.5"><input type="number" value={r.conversion||1} step="0.01" onChange={e=>setFormRow(i,'conversion',e.target.value)} className="input text-xs py-1 w-14" /></td>
                          <td className="px-1 py-1.5"><input value={r.unit||''} onChange={e=>setFormRow(i,'unit',e.target.value)} className="input text-xs py-1 w-14" /></td>
                          <td className="px-1 py-1.5"><input value={r.phase||''} onChange={e=>setFormRow(i,'phase',e.target.value)} className="input text-xs py-1 w-14" placeholder="A/B" /></td>
                          <td className="px-1 py-1.5"><input value={r.notes||''} onChange={e=>setFormRow(i,'notes',e.target.value)} className="input text-xs py-1 w-24" /></td>
                          <td className="px-1 py-1.5"><input type="number" value={r.unitPrice||0} step="0.01" onChange={e=>setFormRow(i,'unitPrice',e.target.value)} className="input text-xs py-1 w-20" /></td>
                          <td className="px-2 py-1.5 text-emerald-400 font-semibold whitespace-nowrap">{fmt(amount)}</td>
                          <td className="px-1 py-1.5"><button onClick={()=>removeFormRow(i)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-500/20 text-red-400">✕</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <button onClick={addFormRow} className="btn btn-ghost text-xs border border-gray-600">+ Add Ingredient</button>
              {draft.formulation.rows.length > 0 && (
                <div className="grid grid-cols-3 gap-3">
                  {[['Total Formulation Cost',fmt(formStats.totalAmount)],['Reference Weight',`${draft.formulation.refWeight} ${draft.formulation.refUnit}`],['Cost Per Unit',fmt(formStats.costPerUnit,4)]].map(([l,v]) => (
                    <div key={l} className="p-3 bg-gray-100 dark:bg-gray-700/20 rounded-lg text-center"><p className="text-xs text-gray-500 dark:text-gray-400">{l}</p><p className="text-lg font-bold text-indigo-600 dark:text-indigo-300 mt-1">{v}</p></div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* R&D & OVERHEADS */}
          {activeTab === 'overheads' && (
            <div className="grid grid-cols-2 gap-5">
              <div className="space-y-2 p-4 bg-gray-700/10 rounded-xl border border-gray-700">
                <p className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-3">⚖️ Standard Assumptions (% of formulation cost)</p>
                {[['Equipment Depreciation','equipmentPct'],['Consumables','consumablesPct'],['Storage','storagePct'],['Housekeeping','housekeepingPct'],['Admin & Management','adminPct'],['Wastage Allowance','wastagePct']].map(([label,key]) => (
                  <div key={key} className="flex items-center gap-3 text-xs">
                    <span className="text-gray-400 flex-1">{label}</span>
                    <input type="number" step="0.1" min="0" value={draft.standardAssumptions[key]||0} onChange={e=>numField(`standardAssumptions.${key}`,e.target.value)} className="input text-xs py-1 w-20 text-right" />
                    <span className="text-gray-500 w-4">%</span>
                  </div>
                ))}
                <div className="pt-2 border-t border-gray-700 flex justify-between text-xs"><span className="text-gray-400">Total Indirect</span><span className="font-bold text-amber-400">{costs.saPct.toFixed(1)}%</span></div>
                <div className="flex justify-between text-xs"><span className="text-gray-500 dark:text-gray-400">SA Amount / unit</span><span className="font-bold text-gray-800 dark:text-gray-200">{fmt(costs.saPerUnit,4)}</span></div>
              </div>
              <div className="space-y-2 p-4 bg-gray-700/10 rounded-xl border border-gray-700">
                <p className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-3">🔬 R&D Costs (amortized over lifecycle)</p>
                {[['Lab Testing (₹)','testing'],['R&D Consumables (₹)','consumables'],['Samples (₹)','samples'],['Overhead (₹)','overhead'],['Other Overhead (₹)','otherOverhead'],['QC Cost (₹)','qc']].map(([label,key]) => (
                  <div key={key} className="flex items-center gap-3 text-xs">
                    <span className="text-gray-400 flex-1">{label}</span>
                    <input type="number" step="1" min="0" value={draft.rnd[key]||0} onChange={e=>numField(`rnd.${key}`,e.target.value)} className="input text-xs py-1 w-28 text-right" />
                  </div>
                ))}
                <div className="flex items-center gap-3 text-xs"><span className="text-gray-400 flex-1">Lifecycle (batches)</span><input type="number" step="1" min="1" value={draft.rnd.lifecycle||1000} onChange={e=>numField('rnd.lifecycle',e.target.value)} className="input text-xs py-1 w-28 text-right" /></div>
                <div className="pt-2 border-t border-gray-700 space-y-1 text-xs">
                  <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Total R&D Cost</span><span className="font-bold text-gray-800 dark:text-gray-200">{fmt(costs.rndTotal)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Per Batch Amortized</span><span className="font-bold text-indigo-600 dark:text-indigo-300">{fmt(costs.rndPerUnit,4)}</span></div>
                </div>
              </div>
              <div className="space-y-2 p-4 bg-gray-700/10 rounded-xl border border-gray-700">
                <p className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-3">🏭 Production Overhead (per {draft.formulation.refWeight} {draft.formulation.refUnit} batch)</p>
                {[['Electricity (₹)','electricity'],['Labor (₹)','labor'],['Lab Testing (₹)','labTesting'],['Other (₹)','other']].map(([label,key]) => (
                  <div key={key} className="flex items-center gap-3 text-xs">
                    <span className="text-gray-400 flex-1">{label}</span>
                    <input type="number" step="0.01" min="0" value={draft.productionOverhead[key]||0} onChange={e=>numField(`productionOverhead.${key}`,e.target.value)} className="input text-xs py-1 w-28 text-right" />
                  </div>
                ))}
                <div className="pt-2 border-t border-gray-700 space-y-1 text-xs">
                  <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Total Overhead</span><span className="font-bold text-gray-800 dark:text-gray-200">{fmt(costs.ohTotal)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Per unit</span><span className="font-bold text-indigo-600 dark:text-indigo-300">{fmt(costs.ohPerUnit,4)}</span></div>
                </div>
              </div>
              <div className="space-y-2 p-4 bg-indigo-500/5 rounded-xl border border-indigo-500/20">
                <p className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-3">📊 Cost Summary (per unit)</p>
                {[['Formulation',costs.formCostPerUnit],['Std Assumptions',costs.saPerUnit],['Prod Overhead',costs.ohPerUnit],['R&D Amortized',costs.rndPerUnit],['Packaging',costs.pkgPerUnit]].map(([l,v]) => (
                  <div key={l} className="flex justify-between py-1 border-b border-gray-200 dark:border-gray-700/30 text-xs"><span className="text-gray-500 dark:text-gray-400">{l}</span><span className="text-gray-800 dark:text-gray-200">{fmt(v,4)}</span></div>
                ))}
                <div className="flex justify-between pt-2 font-bold"><span className="text-gray-700 dark:text-gray-300 text-sm">Total Cost / unit</span><span className="text-indigo-600 dark:text-indigo-300 text-base">{fmt(costs.total,4)}</span></div>
                <p className="text-[10px] text-gray-500">Ref: {draft.formulation.refWeight} {draft.formulation.refUnit} batch</p>
              </div>
            </div>
          )}

          {/* COSTING */}
          {activeTab === 'costing' && (
            <div className="space-y-5">
              <div className="grid grid-cols-4 gap-3">
                {[['Formulation',fmt(costs.formCostPerUnit,4),'bg-blue-500/15'],['Std Assumptions',fmt(costs.saPerUnit,4),'bg-amber-500/15'],['Overhead + R&D',fmt(costs.ohPerUnit+costs.rndPerUnit,4),'bg-purple-500/15'],['Input Total',fmt(costs.formCostPerUnit+costs.saPerUnit+costs.ohPerUnit+costs.rndPerUnit,4),'bg-indigo-500/15']].map(([l,v,bg]) => (
                  <div key={l} className={`p-3 rounded-lg ${bg} text-center`}><p className="text-[10px] text-gray-400">{l}</p><p className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-1">{v}</p></div>
                ))}
              </div>

              {/* Packaging */}
              <div>
                <div className="flex items-center justify-between mb-2"><p className="text-xs font-bold text-gray-700 dark:text-gray-300">📦 Packaging Items</p><button onClick={()=>addPkgItem('bomPackaging.items')} className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-400 dark:hover:text-indigo-300">+ Add Item</button></div>
                <div className="rounded-lg border border-gray-700 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-800/60"><tr><th className="px-3 py-2 text-left text-gray-400">Item</th><th className="px-3 py-2 text-gray-400">Qty</th><th className="px-3 py-2 text-gray-400">Rate ₹</th><th className="px-3 py-2 text-gray-400">Amount</th><th className="px-3 py-2 text-gray-400">Optional</th><th></th></tr></thead>
                    <tbody className="divide-y divide-gray-700/30">
                      {(draft.bomPackaging.items||[]).map((item, i) => (
                        <tr key={i} className="hover:bg-gray-100 dark:hover:bg-gray-700/20">
                          <td className="px-2 py-1.5"><input value={item.name||''} onChange={e=>setPkgItem('bomPackaging.items',i,'name',e.target.value)} className="input text-xs py-1 min-w-32" /></td>
                          <td className="px-2 py-1.5"><input type="number" step="0.01" value={item.qty||0} onChange={e=>setPkgItem('bomPackaging.items',i,'qty',e.target.value)} className="input text-xs py-1 w-16" /></td>
                          <td className="px-2 py-1.5"><input type="number" step="0.01" value={item.rate||0} onChange={e=>setPkgItem('bomPackaging.items',i,'rate',e.target.value)} className="input text-xs py-1 w-20" /></td>
                          <td className="px-3 py-1.5 text-emerald-400 font-semibold">{fmt((item.qty||0)*(item.rate||0))}</td>
                          <td className="px-3 py-1.5 text-center"><input type="checkbox" checked={!!item.optional} onChange={e=>setPkgItem('bomPackaging.items',i,'optional',e.target.checked)} /></td>
                          <td className="px-1 py-1.5"><button onClick={()=>removePkgItem('bomPackaging.items',i)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-500/20 text-red-400 text-xs">✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-3">
                  {[['Machine Charges','machine'],['Shrink Wrap','shrinkWrap'],['Other','other']].map(([l,k]) => (
                    <div key={k} className="flex items-center gap-2 text-xs"><span className="text-gray-400 flex-1">{l} ₹</span><input type="number" step="0.01" value={draft.bomPackaging.charges[k]||0} onChange={e=>numField(`bomPackaging.charges.${k}`,e.target.value)} className="input text-xs py-1 w-24 text-right" /></div>
                  ))}
                </div>
              </div>

              {/* Grand Total */}
              <div className="p-4 bg-indigo-500/5 border border-indigo-500/20 rounded-xl">
                <p className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-3">🏆 Grand Total Cost (per unit)</p>
                <div className="grid grid-cols-5 gap-2 text-center text-xs">
                  {[['Ingredients',costs.formCostPerUnit],['Std Assumptions',costs.saPerUnit],['Overhead',costs.ohPerUnit+costs.rndPerUnit],['Packaging',costs.pkgPerUnit],['Grand Total',costs.total]].map(([l,v],i) => (
                    <div key={l} className={`p-2 rounded-lg ${i===4?'bg-indigo-500/20 border border-indigo-500/30':'bg-gray-100 dark:bg-gray-700/30'}`}>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400">{l}</p><p className={`font-bold mt-1 ${i===4?'text-indigo-600 dark:text-indigo-300 text-base':'text-gray-800 dark:text-gray-200'}`}>{fmt(v,2)}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Margins */}
              <div>
                <p className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-3">📈 Pricing Margins (%)</p>
                <div className="grid grid-cols-4 gap-3">
                  {[['Ex-Factory','exFactory'],['Dealer','dealer'],['Distributor','distributor'],['Retailer','retailer'],['Selling','selling'],['B2B Direct','b2b'],['B2C Direct','b2c']].map(([l,k]) => (
                    <div key={k} className="flex items-center justify-between gap-2 text-xs p-2 bg-gray-700/20 rounded-lg">
                      <span className="text-gray-400">{l}</span>
                      <div className="flex items-center gap-1"><input type="number" step="1" min="0" value={draft.costing.margins[k]||0} onChange={e=>numField(`costing.margins.${k}`,e.target.value)} className="input text-xs py-1 w-16 text-right" /><span className="text-gray-500">%</span></div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Variant Pricing */}
              {draft.variants?.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-gray-300 mb-2">🧴 Variant Pricing (auto-calculated)</p>
                  <div className="overflow-x-auto rounded-lg border border-gray-700">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-800/60"><tr>{['Variant','Size','Prod Cost','Ex-Factory','Dealer','Distrib.','Retailer','Selling','B2B','B2C'].map(h=><th key={h} className="px-2 py-2 text-left text-gray-400 whitespace-nowrap">{h}</th>)}</tr></thead>
                      <tbody className="divide-y divide-gray-700/30">
                        {draft.variants.map((v,i) => {
                          const sizeRatio = costs.rw > 0 && parseFloat(v.size) > 0 ? parseFloat(v.size)/costs.rw : 1;
                          const pc = costs.total * sizeRatio;
                          const m = draft.costing.margins;
                          const eF = pc*(1+m.exFactory/100); const dl = eF*(1+m.dealer/100);
                          const di = dl*(1+m.distributor/100); const rt = di*(1+m.retailer/100);
                          const sl = rt*(1+m.selling/100); const b2b = pc*(1+m.b2b/100); const b2c = pc*(1+m.b2c/100);
                          return (
                            <tr key={i} className="hover:bg-gray-100 dark:hover:bg-gray-700/20">
                              <td className="px-2 py-2 font-semibold text-indigo-600 dark:text-indigo-300">{v.name||`${v.size}${v.unit}`}</td>
                              <td className="px-2 py-2 text-gray-500 dark:text-gray-400">{v.size} {v.unit}</td>
                              <td className="px-2 py-2 text-gray-800 dark:text-gray-200 font-semibold">{fmt(pc)}</td>
                              <td className="px-2 py-2 text-gray-700 dark:text-gray-300">{fmt(eF)}</td><td className="px-2 py-2 text-gray-700 dark:text-gray-300">{fmt(dl)}</td>
                              <td className="px-2 py-2 text-gray-700 dark:text-gray-300">{fmt(di)}</td><td className="px-2 py-2 text-gray-700 dark:text-gray-300">{fmt(rt)}</td>
                              <td className="px-2 py-2 text-emerald-400 font-bold">{fmt(sl)}</td>
                              <td className="px-2 py-2 text-blue-400">{fmt(b2b)}</td><td className="px-2 py-2 text-purple-400">{fmt(b2c)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* MARKETPLACE */}
          {activeTab === 'marketplace' && (() => {
            const mpPkgTotal = (draft.marketplace.packaging||[]).reduce((s,i)=>s+(i.qty||0)*(i.rate||0),0);
            const baseCost = costs.formCostPerUnit + costs.saPerUnit + costs.ohPerUnit + costs.rndPerUnit + mpPkgTotal;
            const platforms = [
              { key:'flipkart', label:'Flipkart 🛒', color:'bg-amber-500/10 border-amber-500/20', fields:[['Commission%','commission'],['Fixed Fee ₹','fixed'],['Shipping ₹','shipping'],['Collection%','collection']] },
              { key:'amazon', label:'Amazon 📦', color:'bg-orange-500/10 border-orange-500/20', fields:[['Commission%','commission'],['Fixed Fee ₹','fixed'],['Shipping ₹','shipping'],['FBA%','fba']] },
              { key:'meesho', label:'Meesho 🌸', color:'bg-pink-500/10 border-pink-500/20', fields:[['Commission%','commission'],['Shipping ₹','shipping'],['Collection%','collection'],['Penalty%','penalty']] },
              { key:'snapdeal', label:'Snapdeal 🔴', color:'bg-red-500/10 border-red-500/20', fields:[['Commission%','commission'],['Fixed Fee ₹','fixed'],['Shipping ₹','shipping'],['Collection%','collection']] },
            ];
            return (
              <div className="space-y-5">
                <div className="p-3 bg-gray-700/20 rounded-lg flex flex-wrap gap-4 text-xs items-center">
                  {[['Formulation',fmt(costs.formCostPerUnit,4)],['Std Ass',fmt(costs.saPerUnit,4)],['Overhead',fmt(costs.ohPerUnit,4)],['R&D',fmt(costs.rndPerUnit,4)],['MP Packaging',fmt(mpPkgTotal)]].map(([l,v])=>(
                    <span key={l} className="text-gray-500 dark:text-gray-400">{l}: <span className="text-gray-800 dark:text-gray-200 font-semibold">{v}</span></span>
                  ))}
                  <span className="font-bold text-indigo-600 dark:text-indigo-300 ml-auto">Base Cost: {fmt(baseCost)}</span>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2"><p className="text-xs font-bold text-gray-700 dark:text-gray-300">📦 Marketplace Packaging</p><button onClick={()=>addPkgItem('marketplace.packaging')} className="text-xs text-indigo-600 dark:text-indigo-400">+ Add</button></div>
                  <div className="rounded-lg border border-gray-700 overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-800/60"><tr><th className="px-3 py-2 text-left text-gray-400">Item</th><th className="px-3 py-2 text-gray-400">Qty</th><th className="px-3 py-2 text-gray-400">Rate ₹</th><th className="px-3 py-2 text-gray-400">Amount</th><th></th></tr></thead>
                      <tbody className="divide-y divide-gray-700/30">
                        {(draft.marketplace.packaging||[]).map((item,i) => (
                          <tr key={i}>
                            <td className="px-2 py-1.5"><input value={item.name||''} onChange={e=>setPkgItem('marketplace.packaging',i,'name',e.target.value)} className="input text-xs py-1 min-w-28" /></td>
                            <td className="px-2 py-1.5"><input type="number" step="0.01" value={item.qty||0} onChange={e=>setPkgItem('marketplace.packaging',i,'qty',e.target.value)} className="input text-xs py-1 w-16" /></td>
                            <td className="px-2 py-1.5"><input type="number" step="0.01" value={item.rate||0} onChange={e=>setPkgItem('marketplace.packaging',i,'rate',e.target.value)} className="input text-xs py-1 w-20" /></td>
                            <td className="px-3 py-1.5 text-emerald-400 font-semibold">{fmt((item.qty||0)*(item.rate||0))}</td>
                            <td className="px-1 py-1.5"><button onClick={()=>removePkgItem('marketplace.packaging',i)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-500/20 text-red-400 text-xs">✕</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {platforms.map(({ key, label, color, fields }) => {
                    const fees = draft.marketplace.fees[key];
                    const margin = draft.marketplace.margins[key];
                    const res = calcPlatform(baseCost, fees, margin);
                    return (
                      <div key={key} className={`p-4 rounded-xl border ${color} space-y-2`}>
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{label}</p>
                          <div className="text-right"><p className="text-[10px] text-gray-500 dark:text-gray-400">Min Selling Price</p><p className="text-base font-bold text-indigo-600 dark:text-indigo-300">{fmt(res.minSelling)}</p></div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          {fields.map(([fl,fk]) => (
                            <div key={fk} className="flex items-center gap-1"><span className="text-gray-400 w-24">{fl}</span><input type="number" step="0.1" value={fees[fk]||0} onChange={e=>{setDraft(prev=>{const next=JSON.parse(JSON.stringify(prev));next.marketplace.fees[key][fk]=parseFloat(e.target.value)||0;return next;});}} className="input text-xs py-0.5 w-16 text-right" /></div>
                          ))}
                          <div className="flex items-center gap-1"><span className="text-gray-400 w-24">Target Margin%</span><input type="number" step="1" value={margin||0} onChange={e=>{setDraft(prev=>{const next=JSON.parse(JSON.stringify(prev));next.marketplace.margins[key]=parseFloat(e.target.value)||0;return next;});}} className="input text-xs py-0.5 w-16 text-right" /></div>
                        </div>
                        <div className="pt-2 border-t border-gray-700/50 grid grid-cols-3 gap-2 text-xs text-center">
                          <div><p className="text-[10px] text-gray-400">Seller Receives</p><p className="font-semibold text-emerald-400">{fmt(res.sellerReceives)}</p></div>
                          <div><p className="text-[10px] text-gray-400">Net Margin</p><p className={`font-semibold ${res.netMargin>=0?'text-emerald-400':'text-red-400'}`}>{fmt(res.netMargin)}</p></div>
                          <div><p className="text-[10px] text-gray-400">Margin %</p><p className={`font-semibold ${res.netMargin>=0?'text-emerald-400':'text-red-400'}`}>{baseCost>0?f2(res.netMargin/baseCost*100,1):'0.00'}%</p></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* QR */}
          {activeTab === 'qr' && (
            <div className="flex flex-col items-center gap-5 py-4">
              <div className="bg-white p-5 rounded-2xl shadow-lg">
                <QRCode value={JSON.stringify({ sku:draft.sku, name:draft.name, category:draft.category, hsn:draft.hsnCode||'', gst:draft.gstRate, unit:draft.unit, mrp:draft.mrp })} size={220} />
              </div>
              <div className="text-center">
                <p className="font-bold text-gray-900 dark:text-gray-100 text-lg">{draft.name}</p>
                <p className="text-sm text-gray-400 mt-1">SKU: {draft.sku}</p>
                <p className="text-sm text-gray-400">HSN: {draft.hsnCode||'-'} · GST: {draft.gstRate}%</p>
                {draft.mrp && <p className="text-sm text-gray-400">MRP: ₹{draft.mrp}</p>}
                {draft.certifications && <p className="text-sm text-gray-400 mt-1">{draft.certifications}</p>}
              </div>
              <button className="btn btn-primary px-8" onClick={() => window.print()}>🖨️ Print Label</button>
            </div>
          )}

          {/* PROCEDURE */}
          {activeTab === 'procedure' && (
            <div className="space-y-6">
              {/* R&D Documentation */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold text-gray-700 dark:text-gray-300">📝 R&D Documentation</p>
                  <label className="btn btn-ghost text-xs border border-gray-600 cursor-pointer">
                    📎 Attach R&D Doc
                    <input type="file" accept=".pdf,.doc,.docx,.xlsx,.jpg,.png" className="hidden" onChange={handleRNDDocFile} />
                  </label>
                </div>
                <textarea
                  value={draft.rndDoc?.text || ''}
                  onChange={e => setField('rndDoc.text', e.target.value)}
                  rows={4}
                  placeholder="Enter R&D documentation, research notes, test results, formulation evolution, stability studies..."
                  className="input w-full resize-y text-xs"
                />
                <div className="space-y-2 mt-2">
                  {(draft.rndDoc?.attachments || []).map((att, i) => (
                    <div key={i} className="flex items-center gap-3 p-2.5 bg-gray-700/20 rounded-lg text-xs">
                      <span className="text-lg">📄</span>
                      <div className="flex-1">
                        <p className="font-semibold text-gray-800 dark:text-gray-200">{att.name}</p>
                        <p className="text-gray-400">{att.type} · {att.createdAt ? new Date(att.createdAt).toLocaleDateString('en-IN', {day:'2-digit',month:'short',year:'numeric'}) : '—'}</p>
                      </div>
                      <button onClick={() => removeRNDAttachment(i)} className="text-red-400 hover:text-red-300 p-1">🗑️</button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Research Guide */}
              <div>
                <p className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-3">🔬 Research Guide</p>
                <textarea
                  value={draft.researchGuide?.text || ''}
                  onChange={e => setField('researchGuide.text', e.target.value)}
                  rows={3}
                  placeholder="Research guide and methodology references: literature sources, patent references, ingredient research papers, regulatory guidelines..."
                  className="input w-full resize-y text-xs"
                />
              </div>

              {/* Manufacturing Procedure */}
              <div>
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <p className="text-xs font-bold text-gray-700 dark:text-gray-300">🏭 Manufacturing Procedure</p>
                  <div className="flex gap-2 flex-wrap">
                    <label className="btn btn-ghost text-xs border border-gray-600 cursor-pointer">
                      📎 Attach File
                      <input type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleProcFile} />
                    </label>
                    <label className="btn btn-ghost text-xs border border-gray-600 cursor-pointer">
                      🎬 Attach Video
                      <input type="file" accept="video/*" className="hidden" onChange={handleProcVideo} />
                    </label>
                    <button
                      className={`btn text-xs ${recording ? 'btn-danger' : 'btn-ghost border border-gray-600'}`}
                      onClick={toggleAudio}
                    >
                      {recording ? `⏹ Stop (${recTime})` : '🎙️ Record Audio'}
                    </button>
                  </div>
                </div>
                <textarea
                  value={draft.procedure?.text || ''}
                  onChange={e => setField('procedure.text', e.target.value)}
                  rows={7}
                  placeholder="Enter the manufacturing procedure step by step..."
                  className="input w-full resize-y text-xs"
                />
                <div className="space-y-2 mt-2">
                  {(draft.procedure?.attachments || []).map((att, i) => {
                    const icon = att.type === 'video' ? '🎬' : att.type === 'audio' ? '🎙️' : '📄';
                    return (
                      <div key={i} className="flex items-center gap-3 p-2.5 bg-gray-700/20 rounded-lg text-xs">
                        <span className="text-lg">{icon}</span>
                        <div className="flex-1">
                          <p className="font-semibold text-gray-800 dark:text-gray-200">{att.name}</p>
                          <p className="text-gray-400">{att.type} · {att.createdAt ? new Date(att.createdAt).toLocaleDateString('en-IN', {day:'2-digit',month:'short',year:'numeric'}) : '—'}</p>
                        </div>
                        <button onClick={() => removeProcAttachment(i)} className="text-red-400 hover:text-red-300 p-1">🗑️</button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* DOCUMENTS */}
          {activeTab === 'documents' && (
            <div className="space-y-5">
              <p className="text-xs font-bold text-gray-700 dark:text-gray-300">📄 Documents & Certificates</p>
              <div className="grid grid-cols-2 gap-5">
                {[
                  ['COA (Certificate of Analysis)', '.pdf'],
                  ['MSDS', '.pdf'],
                  ['Product Registration', '.pdf'],
                  ['Marketing Brochure', '.pdf,.jpg,.png'],
                ].map(([label, accept]) => (
                  <div key={label}>
                    <label className="text-xs font-semibold text-gray-400 mb-1.5 block">{label}</label>
                    <input type="file" accept={accept} className="input text-xs w-full" />
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 italic mt-2">Document uploads are stored for the current session. Use Save All to persist metadata.</p>
            </div>
          )}

          {/* HISTORY */}
          {activeTab === 'history' && (() => {
            const historyEntries = [];
            if (draft.createdAt) historyEntries.push({ date: draft.createdAt, action: 'Product created', detail: `SKU: ${draft.sku}` });
            if (draft.updatedAt && draft.updatedAt !== draft.createdAt) historyEntries.push({ date: draft.updatedAt, action: 'Product updated', detail: 'Last modification' });
            if (draft.rnd?.lastUpdated) historyEntries.push({ date: draft.rnd.lastUpdated, action: 'R&D costing updated', detail: `Lifecycle: ${draft.rnd.lifecycle || 1000} batches` });
            if (draft.productionOverhead?.lastUpdated) historyEntries.push({ date: draft.productionOverhead.lastUpdated, action: 'Production Overhead updated', detail: 'Manufacturing costs' });
            if (draft.standardAssumptions?.lastUpdated) historyEntries.push({ date: draft.standardAssumptions.lastUpdated, action: 'Standard Assumptions updated', detail: 'Indirect % adjusted' });
            if (draft.rndDoc?.lastUpdated) historyEntries.push({ date: draft.rndDoc.lastUpdated, action: 'R&D documentation updated', detail: 'Research notes modified' });
            if (draft.researchGuide?.lastUpdated) historyEntries.push({ date: draft.researchGuide.lastUpdated, action: 'Research guide updated', detail: 'Methodology references' });
            (draft.procedure?.attachments || []).forEach(att => {
              if (att.createdAt) historyEntries.push({ date: att.createdAt, action: 'Procedure attachment added', detail: att.name || 'Attachment' });
            });
            historyEntries.sort((a, b) => new Date(b.date) - new Date(a.date));

            const certs = [];
            if (draft.certifications) {
              draft.certifications.split(',').forEach(c => {
                const name = c.trim();
                if (name) certs.push({ name, type: 'Certification', source: 'Product Profile', date: draft.updatedAt || draft.createdAt || null });
              });
            }

            return (
              <div className="space-y-6">
                <div>
                  <p className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-3">🏅 Certificate History</p>
                  {certs.length === 0 ? (
                    <p className="text-xs text-gray-500 p-3 bg-gray-700/20 rounded-lg">No certificates or compliance documents on record.</p>
                  ) : (
                    <div className="space-y-2">
                      {certs.map((c, i) => {
                        const dateStr = c.date ? new Date(c.date).toLocaleDateString('en-IN', {day:'2-digit',month:'short',year:'numeric'}) : '—';
                        return (
                          <div key={i} className="flex items-center gap-3 p-2.5 bg-gray-700/20 rounded-lg text-xs">
                            <span className="text-lg">🏅</span>
                            <div className="flex-1">
                              <p className="font-semibold text-gray-800 dark:text-gray-200">{c.name}</p>
                              <p className="text-gray-400">{c.type} · Source: {c.source} · Added: {dateStr}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-3">🕐 Activity History</p>
                  {historyEntries.length === 0 ? (
                    <p className="text-xs text-gray-500 p-3 bg-gray-700/20 rounded-lg">No activity history recorded yet. Changes to R&D, overheads, and procedures are tracked after Save All.</p>
                  ) : (
                    <div className="space-y-2">
                      {historyEntries.map((h, i) => {
                        const dateStr = new Date(h.date).toLocaleDateString('en-IN', {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
                        return (
                          <div key={i} className="flex items-center gap-3 p-2.5 bg-gray-700/20 rounded-lg text-xs">
                            <span className="text-lg">🕐</span>
                            <div className="flex-1">
                              <p className="font-semibold text-gray-800 dark:text-gray-200">{h.action}</p>
                              <p className="text-gray-400">{h.detail} · {dateStr}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

        </div>
      </div>
      </div>
    </div>,
    document.body
  );
}

// ── Detail Row (inline expand) ─────────────────────────────────────────────

function DetailRow({ product, onOpenDetail }) {
  return (
    <tr>
      <td colSpan={8} className="p-0 border-b border-gray-200 dark:border-gray-700/50">
        <div className="grid grid-cols-3 gap-5 p-5 bg-gray-50 dark:bg-gray-800/50">
          <div>
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">📋 Product Info</p>
            {[['Sub-Category',product.subCategory||'-'],['Product Type',product.productType||'-'],['Shelf Life',product.shelfLife?`${product.shelfLife} months`:'-'],['Certifications',product.certifications||'-'],['Storage',product.storageConditions||'-'],['Barcode',product.barcode||'-']].map(([l,v]) => (
              <div key={l} className="flex justify-between py-1.5 border-b border-gray-700/30 text-xs"><span className="text-gray-400">{l}</span><span className="font-medium text-gray-700 dark:text-gray-200 text-right max-w-[60%] truncate">{v}</span></div>
            ))}
          </div>
          <div>
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">💰 Pricing</p>
            {[['Cost Price',product.costPrice?`₹${product.costPrice}`:'-'],['Selling Price',product.sellingPrice?`₹${product.sellingPrice}`:'-'],['MRP',product.mrp?`₹${product.mrp}`:'-'],['GST',`${product.gstRate}%`],['HSN Code',product.hsnCode||'-'],['Stock',`${product.currentStock||0} ${product.unit}`]].map(([l,v]) => (
              <div key={l} className="flex justify-between py-1.5 border-b border-gray-700/30 text-xs"><span className="text-gray-400">{l}</span><span className="font-medium text-gray-700 dark:text-gray-200">{v}</span></div>
            ))}
          </div>
          <div>
            {product.images?.[0] && (
              <div className="mb-3 rounded-xl overflow-hidden bg-gray-700/20 h-32">
                <img src={product.images[0]} alt={product.name} className="w-full h-full object-cover" />
              </div>
            )}
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">🧴 Variants</p>
            {product.variants?.length ? product.variants.map((v,i) => (
              <div key={i} className="flex items-center justify-between px-2 py-1.5 bg-gray-700/30 rounded-lg text-xs mb-1">
                <span className="font-semibold text-indigo-600 dark:text-indigo-300">{v.name||`${v.size}${v.unit}`}</span>
                <span className="text-gray-500 dark:text-gray-400">MOQ: {v.moq||'-'}</span>
                <span className="text-emerald-600 dark:text-emerald-400">{v.mrp?`₹${v.mrp}`:v.sellingPrice?`₹${v.sellingPrice}`:'-'}</span>
              </div>
            )) : <p className="text-xs text-gray-500 py-2">No variants</p>}
            <button onClick={() => onOpenDetail(product)} className="mt-3 w-full py-2 text-xs rounded-lg border border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10 transition-colors font-semibold">🧮 Open Full Details + BOM</button>
          </div>
        </div>
      </td>
    </tr>
  );
}

// ── Grid Card ──────────────────────────────────────────────────────────────

function ProductCard({ product, onEdit, onDetail, onQR, onDelete }) {
  return (
    <div className="card p-4 flex flex-col gap-3 hover:-translate-y-0.5 transition-transform">
      {product.images?.[0] ? (
        <div className="w-full h-28 rounded-lg bg-gray-700/30 overflow-hidden">
          <img src={product.images[0]} alt={product.name} className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="w-full h-28 rounded-lg bg-gray-700/30 flex items-center justify-center text-4xl">🧴</div>
      )}
      <div>
        <div className="flex items-start justify-between gap-1"><p className="text-xs text-gray-500 font-semibold">{product.sku}</p>{statusBadge(product.status||'Active')}</div>
        <p className="font-bold text-gray-900 dark:text-gray-100 text-sm mt-1 leading-tight">{product.name}</p>
        <p className="text-xs text-gray-400 mt-0.5">{product.category}{product.subCategory?` · ${product.subCategory}`:''}</p>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-indigo-400">{product.mrp?`₹${product.mrp}`:product.sellingPrice?`₹${product.sellingPrice}`:'—'}</span>
        <span className="text-xs text-gray-400">{product.variants?.length?`${product.variants.length} variants`:product.unit}</span>
      </div>
      <div className="flex gap-1 pt-1 border-t border-gray-200 dark:border-gray-700">
        <button onClick={()=>onEdit(product)} className="flex-1 py-1.5 text-xs rounded-lg bg-gray-100 dark:bg-gray-700/40 hover:bg-indigo-500/20 text-gray-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors font-medium">✏️ Edit</button>
        <button onClick={()=>onDetail(product)} className="flex-1 py-1.5 text-xs rounded-lg bg-gray-100 dark:bg-gray-700/40 hover:bg-amber-500/20 text-gray-600 dark:text-gray-300 hover:text-amber-600 dark:hover:text-amber-300 transition-colors font-medium">🧮 BOM</button>
        <button onClick={()=>onQR(product)} className="py-1.5 px-2 text-xs rounded-lg bg-gray-100 dark:bg-gray-700/40 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 transition-colors">🔲</button>
        <button onClick={()=>onDelete(product)} className="py-1.5 px-2 text-xs rounded-lg bg-gray-100 dark:bg-gray-700/40 hover:bg-red-500/20 text-red-500 dark:text-red-400 transition-colors">🗑️</button>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function ProductCatalog() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [view, setView] = useState('list');
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState(1);
  const [expandedId, setExpandedId] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [qrTarget, setQrTarget] = useState(null);
  const [detailTarget, setDetailTarget] = useState(null);

  const { data: rawData, isLoading } = useQuery({
    queryKey: ['product-catalog', search],
    queryFn: () => api.get('/inventory/products', { params: { isRawMaterial: false, search, limit: 500 } })
      .then(r => r.data.data.products || r.data.data || []),
    staleTime: 30000,
  });

  const allProducts = rawData || [];

  const products = useMemo(() => {
    let list = allProducts.filter(p => !p.isRawMaterial);
    if (filterCat) list = list.filter(p => p.category === filterCat);
    if (filterStatus) list = list.filter(p => (p.status||'Active') === filterStatus);
    return [...list].sort((a, b) => {
      let va = a[sortKey]||'', vb = b[sortKey]||'';
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      return va < vb ? -sortDir : va > vb ? sortDir : 0;
    });
  }, [allProducts, filterCat, filterStatus, sortKey, sortDir]);

  const stats = useMemo(() => {
    const list = allProducts.filter(p => !p.isRawMaterial);
    return { total: list.length, active: list.filter(p=>(p.status||'Active')==='Active').length, categories: new Set(list.map(p=>p.category).filter(Boolean)).size, variants: list.reduce((s,p)=>s+(p.variants?.length||0),0) };
  }, [allProducts]);

  const categories = useMemo(() => [...new Set(allProducts.filter(p=>!p.isRawMaterial).map(p=>p.category).filter(Boolean))].sort(), [allProducts]);

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => d*-1); else { setSortKey(key); setSortDir(1); }
  }

  function SortIcon({ col }) {
    if (sortKey !== col) return <span className="text-gray-600 ml-1">⇅</span>;
    return <span className="text-indigo-400 ml-1">{sortDir===1?'▲':'▼'}</span>;
  }

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['product-catalog'] });
    queryClient.invalidateQueries({ queryKey: ['raw-materials-bom'] });
  }

  async function handleDelete(p) {
    if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
    try { await api.delete(`/inventory/products/${p._id}`); toast.success('Deleted'); refresh(); }
    catch { toast.error('Delete failed'); }
  }

  function exportCSV() {
    if (!products.length) { toast.error('No products'); return; }
    const headers = ['SKU','Name','Category','Sub-Category','Type','Unit','HSN','GST','Cost','SP','MRP','Status','Shelf Life','Certifications'];
    const rows = products.map(p => [p.sku,p.name,p.category,p.subCategory||'',p.productType||'',p.unit,p.hsnCode||'',p.gstRate,p.costPrice||0,p.sellingPrice||0,p.mrp||0,p.status||'Active',p.shelfLife||'',p.certifications||''].map(v=>`"${v}"`).join(','));
    const blob = new Blob(['﻿'+[headers.join(','),...rows].join('\n')], { type:'text/csv;charset=utf-8;' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `product-catalog-${new Date().toISOString().split('T')[0]}.csv`; a.click();
    toast.success(`Exported ${products.length} products`);
  }

  return (
    <div className="p-6 space-y-5 max-w-screen-2xl mx-auto">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Product Catalog</h1><p className="text-sm text-gray-400 mt-0.5">Finished Goods — B2B Cosmetic Manufacturing</p></div>
        <div className="flex gap-2">
          <button onClick={exportCSV} className="btn btn-ghost text-sm">📥 Export CSV</button>
          <button onClick={() => setShowAddModal(true)} className="btn btn-primary text-sm">+ Add Product</button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total Products" value={stats.total} icon="📦" color="bg-purple-500/20" />
        <StatCard label="Active" value={stats.active} icon="✅" color="bg-emerald-500/20" />
        <StatCard label="Categories" value={stats.categories} icon="🏷️" color="bg-amber-500/20" />
        <StatCard label="Total Variants" value={stats.variants} icon="🧴" color="bg-blue-500/20" />
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700 flex-wrap gap-3">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">🧴 Products</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span><input value={search} onChange={e=>setSearch(e.target.value)} className="input pl-8 w-52 text-sm" placeholder="Search name, SKU…" /></div>
            <select value={filterCat} onChange={e=>setFilterCat(e.target.value)} className="input text-sm w-40"><option value="">All Categories</option>{categories.map(c=><option key={c} value={c}>{c}</option>)}</select>
            <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} className="input text-sm w-32"><option value="">All Status</option>{STATUSES.map(s=><option key={s} value={s}>{s}</option>)}</select>
            <div className="flex gap-1 bg-gray-700/40 p-1 rounded-lg border border-gray-600/50">
              <button onClick={()=>setView('list')} className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${view==='list'?'bg-gray-600 text-gray-100':'text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>☰ List</button>
              <button onClick={()=>setView('grid')} className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${view==='grid'?'bg-gray-600 text-gray-100':'text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>⊞ Grid</button>
            </div>
          </div>
        </div>

        {view === 'grid' && (
          <div className="p-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {isLoading ? <p className="col-span-5 text-center py-12 text-gray-400">Loading…</p>
            : products.length===0 ? <div className="col-span-5 text-center py-12"><div className="text-3xl mb-2 opacity-40">📦</div><p className="text-gray-400 font-medium">No products found</p></div>
            : products.map(p => <ProductCard key={p._id} product={p} onEdit={setEditTarget} onDetail={setDetailTarget} onQR={setQrTarget} onDelete={handleDelete} />)}
          </div>
        )}

        {view === 'list' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800/50">
                <tr>
                  {[['sku','SKU'],['name','Product Name'],['category','Category'],['productType','Type'],['sellingPrice','Price'],['currentStock','Stock'],['status','Status']].map(([key,label]) => (
                    <th key={key} onClick={()=>handleSort(key)} className="px-4 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 transition-colors whitespace-nowrap">
                      {label}<SortIcon col={key} />
                    </th>
                  ))}
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider w-32">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {isLoading ? <tr><td colSpan={8} className="text-center py-12 text-gray-400">Loading…</td></tr>
                : products.length===0 ? <tr><td colSpan={8} className="text-center py-12"><div className="text-3xl mb-2 opacity-40">📦</div><p className="text-gray-400 font-medium">No products found</p><p className="text-gray-500 text-xs mt-1">Add your first product</p></td></tr>
                : products.map(p => {
                  const isExpanded = expandedId === p._id;
                  return (
                    <React.Fragment key={p._id}>
                      <tr className="hover:bg-gray-100 dark:hover:bg-gray-700/20 transition-colors">
                        <td className="px-4 py-3"><button onClick={()=>setExpandedId(isExpanded?null:p._id)} className="font-bold text-indigo-400 hover:underline">{p.sku}</button></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            {p.images?.[0] ? (
                              <img src={p.images[0]} alt="" className="w-8 h-8 rounded-md object-cover flex-shrink-0 border border-gray-700/30" />
                            ) : (
                              <div className="w-8 h-8 rounded-md bg-gray-700/20 flex items-center justify-center text-sm flex-shrink-0">🧴</div>
                            )}
                            <button onClick={()=>setExpandedId(isExpanded?null:p._id)} className="font-semibold text-gray-800 dark:text-gray-200 hover:text-indigo-400 transition-colors text-left">{p.name}</button>
                          </div>
                        </td>
                        <td className="px-4 py-3"><span className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700/60 text-gray-600 dark:text-gray-300 rounded-full">{p.category}</span></td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">{p.productType||'-'}</td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{p.mrp?`₹${p.mrp}`:p.sellingPrice?`₹${p.sellingPrice}`:'—'}</td>
                        <td className="px-4 py-3 text-emerald-400 font-semibold">{p.currentStock||0} {p.unit}</td>
                        <td className="px-4 py-3">{statusBadge(p.status||'Active')}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button title="BOM / Full Details" onClick={()=>setDetailTarget(p)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-600 text-amber-400 transition-colors">🧮</button>
                            <button title="QR Label" onClick={()=>setQrTarget(p)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-600 text-purple-400 transition-colors">🔲</button>
                            <button title="Edit" onClick={()=>setEditTarget(p)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-600 text-gray-400 transition-colors">✏️</button>
                            <button title="Delete" onClick={()=>handleDelete(p)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-600 text-red-400 transition-colors">🗑️</button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && <DetailRow product={p} onOpenDetail={setDetailTarget} />}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAddModal && <ProductModal onClose={()=>setShowAddModal(false)} onSuccess={()=>{setShowAddModal(false);refresh();}} />}
      {editTarget && <ProductModal initial={editTarget} onClose={()=>setEditTarget(null)} onSuccess={()=>{setEditTarget(null);refresh();}} />}
      {qrTarget && <QRModal product={qrTarget} onClose={()=>setQrTarget(null)} />}
      {detailTarget && <ProductDetailModal product={detailTarget} onClose={()=>setDetailTarget(null)} onSuccess={()=>{setDetailTarget(null);refresh();}} />}
    </div>
  );
}
