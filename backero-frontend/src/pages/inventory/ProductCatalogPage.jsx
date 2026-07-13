import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { clsx } from 'clsx';
import QRCode from 'react-qr-code';
import api from '../../api/axios';

const CATEGORIES = ['Hair Care', 'Skin Care', 'Face Care', 'Body Care', 'Oral Care', "Men's Care", 'Baby Care', 'Sun Care', 'Makeup', 'Fragrance', 'Wellness', 'Professional', 'Other'];
const PRODUCT_TYPES = ['Shampoo', 'Conditioner', 'Hair Oil', 'Serum', 'Cream', 'Lotion', 'Face Wash', 'Mask', 'Scrub', 'Toner', 'Moisturizer', 'Cleanser', 'Soap', 'Body Wash', 'Sunscreen', 'Lip Balm', 'Deodorant', 'Perfume', 'Other'];
const UNITS = ['ml', 'g', 'kg', 'L', 'pcs', 'oz'];
const GST_RATES = [0, 5, 12, 18, 28];
const STATUSES = ['Active', 'Inactive', 'Draft', 'Archived'];
const TABS = ['Basic Info', 'Formulation', 'Variants', 'R&D & Overheads', 'Costing', 'Packaging', 'Marketplace', 'QR Code', 'Procedure', 'Documents', 'History'];

const ASSUMPTION_FIELDS = [
  { key: 'equipmentPct', label: 'Equipment (Mold/Tools)', max: 20, hint: '3-5% recommended' },
  { key: 'consumablesPct', label: 'Consumables (Small/MSME)', max: 10, hint: '1-2% recommended' },
  { key: 'storagePct', label: 'Storage (Warehouse)', max: 10, hint: '2-4% recommended' },
  { key: 'housekeepingPct', label: 'Housekeeping (Sanitization)', max: 10, hint: '1-2% recommended' },
  { key: 'adminPct', label: 'Admin (Admin STD)', max: 20, hint: '5-8% recommended' },
  { key: 'wastagePct', label: 'Wastage (Production)', max: 10, hint: '2-5% recommended' },
];

function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
}
const PLATFORMS = ['flipkart', 'amazon', 'meesho', 'snapdeal'];
const PLATFORM_ICONS = { flipkart: '🛒', amazon: '📦', meesho: '🏷️', snapdeal: '🔵' };

const defaultPackaging = () => ([
  { name: 'Primary Box', qty: 1, rate: 0, amount: 0, optional: false },
  { name: 'Label', qty: 1, rate: 0, amount: 0, optional: true },
  { name: 'Bubble Wrap', qty: 1, rate: 0, amount: 0, optional: true },
  { name: 'Shipping Label', qty: 1, rate: 0, amount: 0, optional: false },
]);

const emptyForm = () => ({
  code: '', name: '', category: '', subCategory: '', type: '', unit: 'ml', weight: '', gstRate: 18,
  hsnCode: '', shelfLife: '', status: 'Active', discontinuedDate: '', description: '',
  storage: '', certifications: '', barcode: '', image: null,
  formulation: { refWeight: 100, refUnit: 'ml', rows: [] },
  variants: [],
  standardAssumptions: { equipmentPct: 3, consumablesPct: 1, storagePct: 2, housekeepingPct: 1, adminPct: 5, wastagePct: 2, image: null, lastUpdated: null },
  rnd: { testing: 0, consumables: 0, samples: 0, overhead: 0, otherOverhead: 0, qc: 0, lifecycle: 1000, lastUpdated: null },
  rndDoc: { text: '', attachments: [], lastUpdated: null },
  researchGuide: { text: '', lastUpdated: null },
  procedure: { text: '', attachments: [], lastUpdated: null },
  documents: { coa: null, msds: null, registration: null, brochure: null },
  productionOverhead: { electricity: 0, labor: 0, labTesting: 0, other: 0, lastUpdated: null },
  packaging: { items: defaultPackaging(), charges: { machine: 0, shrinkWrap: 0, other: 0 } },
  costing: { margins: { exFactory: 10, dealer: 15, distributor: 20, retailer: 25, selling: 35, b2b: 20, b2c: 40 } },
  marketplace: {
    packaging: defaultPackaging(),
    fees: {
      flipkart: { commission: 15, fixed: 30, shipping: 50, collection: 2 },
      amazon: { commission: 15, fixed: 40, shipping: 50, fba: 3 },
      meesho: { commission: 0, shipping: 70, collection: 0, penalty: 2 },
      snapdeal: { commission: 12, fixed: 20, shipping: 50, collection: 1.5 },
    },
    margins: { flipkart: 25, amazon: 25, meesho: 30, snapdeal: 25 },
  },
});

function numF(v, d = 2) { return Number(v || 0).toFixed(d); }

function calcFormCost(product) {
  if (!product?.formulation?.rows?.length) return 0;
  return product.formulation.rows.reduce((sum, r) => sum + ((r.costPerKg || 0) * (r.percentage || 0) / 100), 0);
}

// Shared breakdown used by R&D & Overheads, Costing, and Marketplace tabs — mirrors
// product-catalog.html's recalcOverheads()/renderCosting()/renderMarketplace() formulas.
function calcOverheadBreakdown(product) {
  const refW = (product?.formulation?.refWeight) || product?.weight || 100;
  const formCost = calcFormCost(product) * refW / 1000;
  const sa = product?.standardAssumptions || {};
  const saPct = (sa.equipmentPct || 0) + (sa.consumablesPct || 0) + (sa.storagePct || 0) +
    (sa.housekeepingPct || 0) + (sa.adminPct || 0) + (sa.wastagePct || 0);
  const saAmount = formCost * saPct / 100;
  const rnd = product?.rnd || {};
  const lifecycle = rnd.lifecycle || 1000;
  const rndTotal = (rnd.testing || 0) + (rnd.consumables || 0) + (rnd.samples || 0) +
    (rnd.overhead || 0) + (rnd.otherOverhead || 0) + (rnd.qc || 0);
  const rndPerUnit = lifecycle > 0 ? rndTotal / lifecycle : 0;
  const po = product?.productionOverhead || {};
  const overheadTotal = (po.electricity || 0) + (po.labor || 0) + (po.labTesting || 0) + (po.other || 0);
  const overheadPerUnit = refW > 0 ? overheadTotal / refW : 0;
  const pkg = product?.packaging || {};
  const pkgCost = (pkg.items || []).filter(i => !i.optional).reduce((s, i) => s + (i.amount || i.qty * i.rate || 0), 0)
    + (pkg.charges?.machine || 0) + (pkg.charges?.shrinkWrap || 0) + (pkg.charges?.other || 0);
  return { refW, formCost, saPct, saAmount, rndTotal, lifecycle, rndPerUnit, overheadTotal, overheadPerUnit, pkgCost };
}

function calcTotalCostPerUnit(product) {
  if (!product) return 0;
  const b = calcOverheadBreakdown(product);
  return b.formCost + b.saAmount + b.overheadPerUnit + b.rndPerUnit + b.pkgCost;
}

// ─── Metric Card ───────────────────────────────────────────────────────────────
function MetricCard({ label, value, sub, icon, iconBg, onClick }) {
  return (
    <div onClick={onClick} className={`bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex justify-between items-start transition-all hover:-translate-y-0.5 hover:shadow-md ${onClick ? 'cursor-pointer' : ''}`}>
      <div className="flex flex-col gap-1.5">
        <p className="text-xs text-slate-500 font-medium">{label}</p>
        <p className="text-2xl font-bold text-slate-900 tracking-tight">{value}</p>
        {sub && <p className="text-[11px] text-slate-400">{sub}</p>}
      </div>
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl ${iconBg}`}>{icon}</div>
    </div>
  );
}

// ─── Status Badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    Active: 'bg-emerald-100 text-emerald-700',
    Inactive: 'bg-slate-100 text-slate-500',
    Draft: 'bg-amber-100 text-amber-700',
    Archived: 'bg-red-100 text-red-600',
    Discontinued: 'bg-gray-100 text-gray-500',
  };
  return <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${map[status] || map.Inactive}`}>{status}</span>;
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function ProductCatalogPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [view, setView] = useState('list');
  const [sortKey, setSortKey] = useState('code');
  const [sortDir, setSortDir] = useState(1);
  const [selectedId, setSelectedId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [activeTab, setActiveTab] = useState('Basic Info');
  const [form, setForm] = useState(emptyForm());
  const [importing, setImporting] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);

  const { data: listData, isLoading, isError } = useQuery({
    queryKey: ['catalog', search, categoryFilter, statusFilter],
    queryFn: () => api.get('/catalog/products', { params: { search: search || undefined, category: categoryFilter || undefined, status: statusFilter || undefined } }).then(r => r.data),
    staleTime: 10000,
    retry: 1,
  });

  const lsAll = useMemo(() => {
    if (!isError) return null;
    try {
      const raw = localStorage.getItem('productCatalogDB_v2');
      if (!raw) return [];
      const { products: items = [] } = JSON.parse(raw);
      return items;
    } catch { return []; }
  }, [isError]);

  const products = useMemo(() => {
    const list = lsAll ? lsAll.filter(p => {
      if (search && !p.name?.toLowerCase().includes(search.toLowerCase()) && !p.code?.toLowerCase().includes(search.toLowerCase())) return false;
      if (categoryFilter && p.category !== categoryFilter) return false;
      if (statusFilter && p.status !== statusFilter) return false;
      return true;
    }) : (listData?.products || []);
    return [...list].sort((a, b) => {
      let va, vb;
      if (sortKey === 'costPerUnit') { va = calcTotalCostPerUnit(a); vb = calcTotalCostPerUnit(b); }
      else { va = a[sortKey] || ''; vb = b[sortKey] || ''; }
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      return va < vb ? -sortDir : va > vb ? sortDir : 0;
    });
  }, [listData, lsAll, search, categoryFilter, statusFilter, sortKey, sortDir]);

  const autoImportedRef = React.useRef(false);
  useEffect(() => {
    if (!isLoading && !isError && products.length === 0 && !autoImportedRef.current && !search && !categoryFilter && !statusFilter) {
      autoImportedRef.current = true;
      try {
        const raw = localStorage.getItem('productCatalogDB_v2');
        if (!raw) return;
        const data = JSON.parse(raw);
        const lsProducts = data.products || [];
        if (!lsProducts.length) return;
        setImporting(true);
        api.post('/catalog/import', { products: lsProducts })
          .then(res => { qc.invalidateQueries({ queryKey: ['catalog'] }); toast.success(`Loaded ${res.data?.data?.created || lsProducts.length} products`); })
          .catch(() => {})
          .finally(() => setImporting(false));
      } catch {}
    }
  }, [isLoading, isError, products.length]);

  const { data: detailData } = useQuery({
    queryKey: ['catalog-detail', selectedId],
    queryFn: () => api.get(`/catalog/products/${selectedId}`).then(r => r.data),
    enabled: !!selectedId,
  });
  const detail = detailData?.product || null;

  const createMutation = useMutation({
    mutationFn: (data) => api.post('/catalog/products', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['catalog'] }); toast.success('Product created'); closeForm(); },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed to create'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => api.put(`/catalog/products/${id}`, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['catalog'] });
      qc.invalidateQueries({ queryKey: ['catalog-detail', id] });
      toast.success('Saved');
      if (showForm) closeForm();
    },
    onError: (e) => toast.error(e?.response?.data?.message || 'Failed to save'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/catalog/products/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['catalog'] }); toast.success('Deleted'); setSelectedId(null); },
    onError: () => toast.error('Failed to delete'),
  });

  const imgMutation = useMutation({
    mutationFn: ({ id, file }) => { const fd = new FormData(); fd.append('image', file); return api.post(`/catalog/products/${id}/image`, fd); },
    onSuccess: (_, { id }) => { qc.invalidateQueries({ queryKey: ['catalog-detail', id] }); qc.invalidateQueries({ queryKey: ['catalog'] }); toast.success('Image uploaded'); },
    onError: () => toast.error('Image upload failed'),
  });

  const attachMutation = useMutation({
    mutationFn: ({ id, file, kind }) => { const fd = new FormData(); fd.append('file', file); fd.append('kind', kind); return api.post(`/catalog/products/${id}/attachment`, fd); },
    onSuccess: (_, { id }) => { qc.invalidateQueries({ queryKey: ['catalog-detail', id] }); toast.success('Attachment uploaded'); },
    onError: (e) => toast.error(e?.response?.data?.message || 'Upload failed'),
  });

  const removeAttachMutation = useMutation({
    mutationFn: ({ id, kind, attachmentId }) => api.delete(`/catalog/products/${id}/attachment`, { data: { kind, attachmentId } }),
    onSuccess: (_, { id }) => { qc.invalidateQueries({ queryKey: ['catalog-detail', id] }); toast.success('Attachment removed'); },
    onError: () => toast.error('Failed to remove attachment'),
  });

  function openCreate() {
    const nextNum = String((listData?.products?.length || 0) + 1).padStart(4, '0');
    setForm({ ...emptyForm(), code: `FG-${nextNum}` });
    setEditingProduct(null); setActiveTab('Basic Info'); setImagePreview(null); setShowForm(true);
  }
  function openEdit(p) {
    setForm({ ...emptyForm(), ...p, formulation: p.formulation || { refWeight: p.weight || 100, refUnit: p.unit || 'ml', rows: [] } });
    setEditingProduct(p); setActiveTab('Basic Info'); setImagePreview(p.image || null); setShowForm(true);
  }
  function closeForm() { setShowForm(false); setEditingProduct(null); setImagePreview(null); }

  function openDetail(p) { setSelectedId(p._id); setActiveTab('Basic Info'); }
  function closeDetail() { setSelectedId(null); }

  function setF(field, val) { setForm(f => ({ ...f, [field]: val })); }

  function onImageChange(e) {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => setImagePreview(ev.target.result);
    r.readAsDataURL(f);
  }

  function saveBasicInfo() {
    if (!form.code || !form.name || !form.category) { toast.error('Fill code, name and category'); return; }
    const payload = { ...form, image: imagePreview };
    if (editingProduct) { updateMutation.mutate({ id: editingProduct._id, data: payload }); }
    else { createMutation.mutate(payload); }
  }

  function sort(key) {
    if (sortKey === key) setSortDir(d => d * -1);
    else { setSortKey(key); setSortDir(1); }
  }
  function SortIcon({ k }) {
    if (sortKey !== k) return <span className="ml-1 opacity-30">⇅</span>;
    return <span className="ml-1 text-slate-900">{sortDir === 1 ? '▲' : '▼'}</span>;
  }

  function exportCSV() {
    const headers = ['Code','Name','Category','Sub Category','Type','Unit','Weight','GST Rate (%)','HSN Code','Shelf Life','Status','Description','Storage','Certifications','Barcode'];
    const rows = products.map(p => [
      p.code, p.name, p.category, p.subCategory || '', p.type || '',
      p.unit, p.weight || '', p.gstRate || 0, p.hsnCode || '',
      p.shelfLife || '', p.status, p.description || '',
      p.storage || '', p.certifications || '', p.barcode || '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `product-catalog-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    toast.success(`Exported ${products.length} products`);
  }

  async function importFromLocalStorage() {
    try {
      const raw = localStorage.getItem('productCatalogDB_v2');
      if (!raw) { toast.error('No catalog data found in localStorage'); return; }
      const data = JSON.parse(raw);
      const rawProducts = data.products || [];
      if (!rawProducts.length) { toast.error('No products to import'); return; }
      setImporting(true);
      const res = await api.post('/catalog/import', { products: rawProducts });
      qc.invalidateQueries({ queryKey: ['catalog'] });
      toast.success(`Imported ${res.data?.data?.created || 0}, skipped ${res.data?.data?.skipped || 0} duplicates`);
    } catch (e) { toast.error(e?.response?.data?.message || 'Import failed'); }
    finally { setImporting(false); }
  }

  function importCSVFile() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.csv'; input.style.display = 'none';
    document.body.appendChild(input);
    input.onchange = async (e) => {
      document.body.removeChild(input);
      const file = e.target.files[0]; if (!file) return;
      const text = await file.text();
      const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
      if (lines.length < 2) { toast.error('Empty or invalid CSV'); return; }
      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
      const col = (name) => headers.indexOf(name);
      const codeCol = col('Code') !== -1 ? col('Code') : col('SKU');
      const nameCol = col('Name'); const catCol = col('Category');
      if (codeCol === -1 || nameCol === -1 || catCol === -1) { toast.error('Invalid CSV: need Code/SKU, Name, Category'); return; }
      const getVal = (arr, idx) => idx >= 0 ? (arr[idx] || '').trim().replace(/^"|"$/g, '') : '';
      const parsed = [];
      for (let i = 1; i < lines.length; i++) {
        const v = lines[i].split(',');
        const code = getVal(v, codeCol), name = getVal(v, nameCol), category = getVal(v, catCol);
        if (!code || !name || !category) continue;
        parsed.push({ code, name, category, subCategory: getVal(v, col('Sub Category')), type: getVal(v, col('Type')), unit: getVal(v, col('Unit')) || 'ml', weight: parseFloat(getVal(v, col('Weight'))) || 0, gstRate: parseInt(getVal(v, col('GST Rate (%)'))) || 18, hsnCode: getVal(v, col('HSN Code')), shelfLife: parseInt(getVal(v, col('Shelf Life'))) || 0, status: getVal(v, col('Status')) || 'Active', description: getVal(v, col('Description')), storage: getVal(v, col('Storage')), certifications: getVal(v, col('Certifications')), barcode: getVal(v, col('Barcode')) });
      }
      if (!parsed.length) { toast.error('No valid rows found'); return; }
      setImporting(true);
      try {
        const res = await api.post('/catalog/import', { products: parsed });
        qc.invalidateQueries({ queryKey: ['catalog'] });
        toast.success(`Imported ${res.data?.data?.created || 0}, skipped ${res.data?.data?.skipped || 0} duplicates`);
      } catch (err) { toast.error(err?.response?.data?.message || 'CSV import failed'); }
      finally { setImporting(false); }
    };
    input.click();
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  const { data: statsData } = useQuery({
    queryKey: ['catalog', 'stats'],
    queryFn: () => api.get('/catalog/stats').then(r => r.data),
    staleTime: 15000,
  });
  const stats = statsData || { total: 0, active: 0, discontinued: 0, byCategory: [] };

  useEffect(() => {
    if (detail && !showForm) {
      setForm({ ...emptyForm(), ...detail });
    }
  }, [detail?._id]);

  const inputCls = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 bg-white transition-all';
  const labelCls = 'block text-xs font-semibold text-slate-700 mb-1';
  const thCls = 'px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide cursor-pointer select-none whitespace-nowrap hover:text-slate-700 transition-colors';

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-200 px-8 py-3.5 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg bg-purple-100">📦</div>
          <div>
            <h1 className="text-base font-bold text-slate-900">Product Catalog</h1>
            <p className="text-[11px] text-slate-500">Finished Goods — Formulation & Costing</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={importCSVFile} disabled={importing} className="text-sm px-4 py-2 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold transition-all disabled:opacity-50">📤 Bulk Import</button>
          <button onClick={importFromLocalStorage} disabled={importing} className="text-sm px-4 py-2 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-semibold hover:bg-amber-100 disabled:opacity-50 transition-all">{importing ? 'Importing…' : '☁️ Sync LS'}</button>
          <button onClick={exportCSV} disabled={products.length === 0} className="text-sm px-4 py-2 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold transition-all disabled:opacity-40">📥 Export CSV</button>
          <button onClick={openCreate} className="text-sm px-4 py-2 rounded-full font-semibold text-slate-900 hover:brightness-95 transition-all" style={{ background: '#e5ff00' }}>➕ Add Product</button>
        </div>
      </div>

      <div className="px-8 py-6 max-w-[1440px] mx-auto">

        {/* ── 3 Metric Cards ── */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <MetricCard label="Total Products" value={stats.total} sub="📦 All SKUs" icon="📦" iconBg="bg-purple-100" />
          <MetricCard label="Active Products" value={stats.active} sub="✅ Live in catalog" icon="✅" iconBg="bg-emerald-100" />
          <MetricCard label="Categories" value={stats.byCategory?.length || 0} sub="🏷️ Product lines" icon="🏷️" iconBg="bg-orange-100" />
        </div>

        {/* ── Table Card ── */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">

          {/* Card header */}
          <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
            <h2 className="text-sm font-bold text-slate-900">📦 Products Master</h2>
            <div className="flex-1" />
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, SKU, category..." className="pl-9 pr-4 py-2 border border-slate-200 rounded-full text-sm w-64 bg-slate-50 focus:outline-none focus:border-slate-400 focus:bg-white transition-all" />
            </div>
            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="text-sm px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:outline-none">
              <option value="">All Categories</option>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="text-sm px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:outline-none">
              <option value="">All Status</option>
              {STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
            {/* View toggle */}
            <div className="flex border border-slate-200 rounded-lg overflow-hidden">
              <button onClick={() => setView('list')} className={`w-9 h-9 flex items-center justify-center text-sm transition-colors ${view === 'list' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`} title="List View">☰</button>
              <button onClick={() => setView('grid')} className={`w-9 h-9 flex items-center justify-center text-sm transition-colors ${view === 'grid' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`} title="Grid View">⊞</button>
            </div>
          </div>

          {/* ── List View ── */}
          {view === 'list' && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-slate-50">
                  <tr>
                    {[['code','SKU'],['name','Product Name'],['category','Category'],['type','Type'],['costPerUnit','Cost/Unit'],['status','Status']].map(([k,label]) => (
                      <th key={k} className={thCls} onClick={() => sort(k)}>{label}<SortIcon k={k} /></th>
                    ))}
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide w-40">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={7} className="text-center py-16 text-slate-400">Loading…</td></tr>
                  ) : products.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-16">
                      <p className="text-4xl mb-2">📦</p>
                      <p className="text-sm font-semibold text-slate-600">No products found</p>
                      <p className="text-xs text-slate-400 mt-1">Add a product or import from CSV</p>
                    </td></tr>
                  ) : products.map(p => {
                    const cost = calcTotalCostPerUnit(p);
                    return (
                      <tr key={p._id} className="border-b border-slate-50 hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            {p.image ? (
                              <img src={p.image} alt={p.name} className="w-8 h-8 rounded-lg object-cover border border-slate-200 flex-shrink-0" />
                            ) : (
                              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-100 to-blue-100 flex items-center justify-center text-sm flex-shrink-0">🧴</div>
                            )}
                            <span className="font-bold text-slate-900 text-xs font-mono">{p.code}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-800 max-w-[200px] truncate cursor-pointer hover:text-slate-900 hover:underline" onClick={() => openDetail(p)}>{p.name}</td>
                        <td className="px-4 py-3"><span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">{p.category}</span></td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{p.type || '—'}</td>
                        <td className="px-4 py-3 text-slate-700 font-semibold text-xs">{cost > 0 ? `₹${numF(cost)}` : '—'}</td>
                        <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <button title="View Details" onClick={() => openDetail(p)} className="w-8 h-8 rounded-lg flex items-center justify-center text-blue-500 hover:bg-blue-50 transition-colors text-sm">👁️</button>
                            <button title="Edit" onClick={() => openEdit(p)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors text-sm">✏️</button>
                            <button title="Delete" onClick={() => { if (window.confirm(`Delete "${p.name}"?`)) deleteMutation.mutate(p._id); }} className="w-8 h-8 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-50 transition-colors text-sm">🗑️</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Grid View ── */}
          {view === 'grid' && (
            <div className="p-6">
              {isLoading ? (
                <div className="text-center py-16 text-slate-400">Loading…</div>
              ) : products.length === 0 ? (
                <div className="text-center py-16">
                  <p className="text-4xl mb-2">📦</p>
                  <p className="text-sm font-semibold text-slate-600">No products found</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {products.map(p => {
                    const cost = calcTotalCostPerUnit(p);
                    return (
                      <div key={p._id} className="bg-white border border-slate-100 rounded-2xl overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer group" onClick={() => openDetail(p)}>
                        <div className="h-36 bg-gradient-to-br from-purple-50 to-blue-50 flex items-center justify-center overflow-hidden relative">
                          {p.image ? (
                            <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-4xl">🧴</span>
                          )}
                          <div className="absolute top-2 right-2"><StatusBadge status={p.status} /></div>
                        </div>
                        <div className="p-3">
                          <p className="text-xs font-mono text-slate-400 mb-0.5">{p.code}</p>
                          <p className="text-sm font-bold text-slate-900 truncate mb-1">{p.name}</p>
                          <p className="text-[11px] text-slate-500 mb-2">{p.category}{p.type ? ` · ${p.type}` : ''}</p>
                          {cost > 0 && <p className="text-xs font-bold text-emerald-600">₹{numF(cost)} / unit</p>}
                          <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={e => { e.stopPropagation(); openEdit(p); }} className="flex-1 text-xs py-1 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors font-semibold">Edit</button>
                            <button onClick={e => { e.stopPropagation(); if (window.confirm(`Delete "${p.name}"?`)) deleteMutation.mutate(p._id); }} className="w-7 flex items-center justify-center rounded-lg bg-red-50 text-red-400 hover:bg-red-100 transition-colors text-xs">🗑️</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ════════════ ADD / EDIT PRODUCT MODAL ════════════ */}
      {showForm && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-3xl my-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50 rounded-t-2xl">
              <h2 className="text-base font-bold text-slate-900">{editingProduct ? `✏️ Edit — ${editingProduct.name}` : '➕ Add New Product'}</h2>
              <button onClick={closeForm} className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 text-xl transition-all">✕</button>
            </div>

            <div className="px-6 py-5 overflow-y-auto max-h-[75vh] space-y-4">

              {/* Row 1: Code, Name, Category */}
              <div className="grid grid-cols-3 gap-4">
                <div><label className={labelCls}>SKU / Code <span className="text-red-500">*</span></label><input value={form.code} onChange={e => setF('code', e.target.value.toUpperCase())} className={inputCls} placeholder="e.g. FG-HC-001" /></div>
                <div><label className={labelCls}>Product Name <span className="text-red-500">*</span></label><input value={form.name} onChange={e => setF('name', e.target.value)} className={inputCls} placeholder="e.g. Turmeric Shampoo" /></div>
                <div><label className={labelCls}>Category <span className="text-red-500">*</span></label>
                  <select value={form.category} onChange={e => setF('category', e.target.value)} className={inputCls}>
                    <option value="">Select…</option>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {/* Row 2: Sub Category, Product Type, Status */}
              <div className="grid grid-cols-3 gap-4">
                <div><label className={labelCls}>Sub-Category</label><input value={form.subCategory} onChange={e => setF('subCategory', e.target.value)} className={inputCls} placeholder="e.g. Shampoo, Serum" /></div>
                <div><label className={labelCls}>Product Type</label>
                  <select value={form.type} onChange={e => setF('type', e.target.value)} className={inputCls}>
                    <option value="">Select…</option>
                    {PRODUCT_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div><label className={labelCls}>Status <span className="text-red-500">*</span></label>
                  <select value={form.status} onChange={e => setF('status', e.target.value)} className={inputCls}>
                    {STATUSES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              {/* Row 3: Unit, Ref Weight, GST */}
              <div className="grid grid-cols-3 gap-4">
                <div><label className={labelCls}>Base Unit <span className="text-red-500">*</span></label>
                  <select value={form.unit} onChange={e => setF('unit', e.target.value)} className={inputCls}>
                    {UNITS.map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
                <div><label className={labelCls}>Reference Weight / Volume</label><input type="number" value={form.weight} onChange={e => setF('weight', e.target.value)} className={inputCls} placeholder="e.g. 200" /></div>
                <div><label className={labelCls}>GST Rate (%)</label>
                  <select value={form.gstRate} onChange={e => setF('gstRate', Number(e.target.value))} className={inputCls}>
                    {GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                  </select>
                </div>
              </div>

              {/* Row 4: HSN, Shelf Life, Discontinued Date */}
              <div className="grid grid-cols-3 gap-4">
                <div><label className={labelCls}>HSN Code</label><input value={form.hsnCode} onChange={e => setF('hsnCode', e.target.value)} className={inputCls} placeholder="e.g. 3305" /></div>
                <div><label className={labelCls}>Shelf Life (months)</label><input type="number" value={form.shelfLife} onChange={e => setF('shelfLife', e.target.value)} className={inputCls} placeholder="e.g. 36" /></div>
                <div><label className={labelCls}>Discontinued Date</label><input type="date" value={form.discontinuedDate} onChange={e => setF('discontinuedDate', e.target.value)} className={inputCls} /></div>
              </div>

              {/* Row 5: Description + Image */}
              <div className="grid grid-cols-3 gap-4 items-start">
                <div className="col-span-2"><label className={labelCls}>Description</label><textarea value={form.description} onChange={e => setF('description', e.target.value)} rows={3} className={`${inputCls} resize-none`} placeholder="Product description, key claims, benefits..." /></div>
                <div>
                  <label className={labelCls}>Product Image</label>
                  <div onClick={() => document.getElementById('pcProdImgInput').click()} className="w-24 h-24 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center cursor-pointer overflow-hidden hover:border-slate-400 transition-colors bg-slate-50">
                    {imagePreview ? <img src={imagePreview} alt="Product" className="w-full h-full object-cover" /> : <span className="text-slate-400 text-xs text-center px-2">📷 Click to upload</span>}
                  </div>
                  <input type="file" id="pcProdImgInput" accept="image/*" className="hidden" onChange={onImageChange} />
                  {imagePreview && <button onClick={() => setImagePreview(null)} className="mt-1 text-[10px] text-red-400 hover:text-red-600">✕ Remove</button>}
                </div>
              </div>

              {/* Row 6: Storage, Certifications, Barcode */}
              <div className="grid grid-cols-3 gap-4">
                <div><label className={labelCls}>Storage Conditions</label><input value={form.storage} onChange={e => setF('storage', e.target.value)} className={inputCls} placeholder="Cool, dry place" /></div>
                <div><label className={labelCls}>Certifications</label><input value={form.certifications} onChange={e => setF('certifications', e.target.value)} className={inputCls} placeholder="Organic, Cruelty-Free, GMP" /></div>
                <div><label className={labelCls}>Barcode</label><input value={form.barcode} onChange={e => setF('barcode', e.target.value)} className={inputCls} placeholder="8901234567890" /></div>
              </div>

            </div>

            <div className="flex gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
              <button onClick={closeForm} className="px-5 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-500 hover:bg-slate-100 transition-colors">Cancel</button>
              <button onClick={saveBasicInfo} disabled={isPending} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-900 disabled:opacity-60 transition-all hover:brightness-95" style={{ background: '#e5ff00' }}>
                {isPending ? 'Saving…' : editingProduct ? '💾 Save Changes' : '✅ Create Product'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ════════════ DETAIL MODAL ════════════ */}
      {selectedId && detail && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-5xl my-4 shadow-2xl border border-slate-200 flex flex-col max-h-[92vh]">

            {/* Detail Header */}
            <div className="flex items-center gap-4 px-6 py-4 border-b border-slate-100 bg-slate-50 rounded-t-2xl flex-shrink-0">
              <div className="relative group flex-shrink-0">
                {detail.image ? (
                  <img src={detail.image} alt={detail.name} className="w-14 h-14 rounded-xl object-cover border border-slate-200" />
                ) : (
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-100 to-blue-100 flex items-center justify-center text-2xl">🧴</div>
                )}
                <label className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-xl opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                  <input type="file" accept="image/*" className="hidden" onChange={e => { if (e.target.files[0]) imgMutation.mutate({ id: detail._id, file: e.target.files[0] }); }} />
                  <span className="text-white text-xs">📷</span>
                </label>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-bold text-slate-900 truncate">{detail.name}</h2>
                <p className="text-xs text-slate-400">{detail.code} · {detail.category}{detail.type ? ` · ${detail.type}` : ''} · {detail.unit}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <StatusBadge status={detail.status} />
                <button onClick={() => { closeDetail(); openEdit(detail); }} className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 font-semibold hover:bg-slate-200 transition-colors">✏️ Edit</button>
                <button onClick={() => { if (window.confirm('Delete ' + detail.name + '?')) { deleteMutation.mutate(detail._id); closeDetail(); }}} className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-500 font-semibold hover:bg-red-100 transition-colors">🗑️</button>
                <button onClick={closeDetail} className="text-slate-400 hover:text-slate-600 p-1 text-xl">✕</button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-0 px-6 bg-white border-b border-slate-100 overflow-x-auto flex-shrink-0">
              {TABS.map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)} className={clsx('px-4 py-3 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors', activeTab === tab ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600')}>
                  {tab}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {activeTab === 'Basic Info' && <BasicInfoTab product={detail} />}
              {activeTab === 'Formulation' && <FormulationTab product={detail} form={form} setForm={setForm} onSave={() => updateMutation.mutate({ id: detail._id, data: { formulation: form.formulation } })} isPending={isPending} />}
              {activeTab === 'Variants' && <VariantsTab product={detail} form={form} setForm={setForm} onSave={() => updateMutation.mutate({ id: detail._id, data: { variants: form.variants } })} isPending={isPending} />}
              {activeTab === 'R&D & Overheads' && <RndOverheadsTab product={detail} form={form} setForm={setForm} onSave={() => updateMutation.mutate({ id: detail._id, data: { rnd: form.rnd, productionOverhead: form.productionOverhead, standardAssumptions: form.standardAssumptions } })} isPending={isPending} />}
              {activeTab === 'Costing' && <CostingTab product={detail} form={form} setForm={setForm} onSave={() => updateMutation.mutate({ id: detail._id, data: { costing: form.costing } })} isPending={isPending} />}
              {activeTab === 'Packaging' && <PackagingTab product={detail} form={form} setForm={setForm} onSave={() => updateMutation.mutate({ id: detail._id, data: { packaging: form.packaging } })} isPending={isPending} />}
              {activeTab === 'Marketplace' && <MarketplaceTab product={detail} form={form} setForm={setForm} onSave={() => updateMutation.mutate({ id: detail._id, data: { marketplace: form.marketplace } })} isPending={isPending} />}
              {activeTab === 'QR Code' && <QRCodeTab product={detail} />}
              {activeTab === 'Procedure' && <ProcedureTab product={detail} form={form} setForm={setForm} onSave={() => updateMutation.mutate({ id: detail._id, data: { rndDoc: form.rndDoc, researchGuide: form.researchGuide, procedure: form.procedure } })} isPending={isPending}
                onAttach={(file, kind) => attachMutation.mutate({ id: detail._id, file, kind })}
                onRemoveAttach={(kind, attachmentId) => removeAttachMutation.mutate({ id: detail._id, kind, attachmentId })} />}
              {activeTab === 'Documents' && <DocumentsTab product={detail}
                onAttach={(file, kind) => attachMutation.mutate({ id: detail._id, file, kind })}
                onRemoveAttach={(kind) => removeAttachMutation.mutate({ id: detail._id, kind })} />}
              {activeTab === 'History' && <HistoryTab product={detail} />}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ─── Basic Info Tab ────────────────────────────────────────────────────────────
function DetailSection({ icon, title, children }) {
  return (
    <div className="mb-5">
      <p className="text-xs font-bold text-gray-600 dark:text-gray-300 mb-2.5">{icon} {title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function BasicInfoTab({ product: p }) {
  const b = calcOverheadBreakdown(p);
  const formulationCost = b.formCost > 0 ? `${numF(b.formCost, 4)} / ${p.unit || 'unit'}` : '—';

  return (
    <div className="grid grid-cols-3 gap-6">
      <div>
        <DetailSection icon="🖼️" title="Product Image">
          {p.image ? (
            <img src={p.image} alt={p.name} className="w-28 h-28 rounded-xl object-cover border border-slate-200" />
          ) : (
            <div className="w-28 h-28 rounded-xl bg-gradient-to-br from-purple-100 to-blue-100 flex items-center justify-center text-3xl">🧴</div>
          )}
        </DetailSection>
        <DetailSection icon="📋" title="Basic Info">
          <InfoRow label="SKU" value={p.code} mono />
          <InfoRow label="Category" value={p.category} />
          <InfoRow label="Sub-Category" value={p.subCategory} />
          <InfoRow label="Type" value={p.type} />
        </DetailSection>
      </div>

      <div>
        <DetailSection icon="📐" title="Specifications">
          <InfoRow label="Base Unit" value={p.unit} />
          <InfoRow label="Reference Weight" value={p.weight ? `${p.weight} ${p.unit}` : '-'} />
          <InfoRow label="Shelf Life" value={p.shelfLife ? `${p.shelfLife} months` : '-'} />
          <InfoRow label="HSN" value={p.hsnCode} mono />
          <InfoRow label="GST" value={`${p.gstRate}%`} />
          <InfoRow label="Barcode" value={p.barcode} mono />
        </DetailSection>
      </div>

      <div>
        <DetailSection icon="💰" title="Cost Per Unit">
          <InfoRow label="Formulation Cost" value={formulationCost} accent />
        </DetailSection>
        <DetailSection icon="📅" title="Dates">
          <InfoRow label="Discontinued" value={p.discontinuedDate ? new Date(p.discontinuedDate).toLocaleDateString('en-IN') : '-'} />
          <InfoRow label="Status" value={p.status} badge={p.status === 'Active' ? 'green' : p.status === 'Draft' ? 'yellow' : 'gray'} />
        </DetailSection>
        <DetailSection icon="🏅" title="Certifications">
          <p className="text-xs text-gray-700 dark:text-gray-300">{p.certifications || 'None'}</p>
        </DetailSection>
      </div>

      {p.description && (
        <div className="col-span-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Description</p>
          <p className="text-sm text-gray-700 dark:text-gray-300">{p.description}</p>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value, mono, badge, accent }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-400 w-28 flex-shrink-0">{label}</span>
      {badge ? (
        <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', badge === 'green' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : badge === 'yellow' ? 'bg-amber-100 text-amber-700' : badge === 'blue' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-gray-100 text-gray-500')}>{value ?? '-'}</span>
      ) : (
        <span className={clsx('text-xs', mono && 'font-mono', accent ? 'text-base font-bold text-blue-600 dark:text-blue-400' : 'text-gray-800 dark:text-gray-200')}>{value ?? '-'}</span>
      )}
    </div>
  );
}

// ─── Ingredient Autocomplete Cell ──────────────────────────────────────────────
function IngredientCell({ row, index, rawMaterials, onUpdate }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(row.name || '');
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0, openUp: false });
  const inputRef = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    const h = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => { setQuery(row.name || ''); }, [row.name]);

  const suggestions = useMemo(() => {
    if (!query.trim()) return rawMaterials.slice(0, 8);
    const q = query.toLowerCase();
    return rawMaterials.filter(m => m.name.toLowerCase().includes(q)).slice(0, 8);
  }, [query, rawMaterials]);

  const isLinked = !!row.rawMaterialId;
  const exactMatch = rawMaterials.some(m => m.name.toLowerCase() === query.toLowerCase());

  const DROPDOWN_MAX_HEIGHT = 240;

  function openDropdown() {
    if (inputRef.current) {
      const r = inputRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - r.bottom;
      const openUp = spaceBelow < DROPDOWN_MAX_HEIGHT && r.top > spaceBelow;
      setDropPos({
        top: openUp ? r.top + window.scrollY - 2 : r.bottom + window.scrollY + 2,
        left: r.left + window.scrollX,
        width: 224,
        openUp,
      });
    }
    setOpen(true);
  }

  function select(mat) {
    onUpdate(index, { name: mat.name, rawMaterialId: mat._id, unit: mat.unit, costPerKg: mat.costPrice || 0 });
    setQuery(mat.name);
    setOpen(false);
  }

  function handleChange(e) {
    setQuery(e.target.value);
    onUpdate(index, { name: e.target.value, rawMaterialId: '' });
    openDropdown();
  }

  const dropdown = open ? createPortal(
    <div
      style={{
        position: 'fixed',
        left: dropPos.left, width: dropPos.width, zIndex: 9999,
        maxHeight: DROPDOWN_MAX_HEIGHT, overflowY: 'auto',
        ...(dropPos.openUp ? { bottom: window.innerHeight - dropPos.top, top: 'auto' } : { top: dropPos.top }),
      }}
      className="bg-white dark:bg-[#0d1b2e] border border-gray-200 dark:border-[#1b2e4a] rounded-lg shadow-xl">
      {suggestions.map(m => (
        <button key={m._id} onMouseDown={() => select(m)}
          className="w-full text-left px-3 py-1.5 text-xs hover:bg-orange-50 dark:hover:bg-orange-500/10 flex items-center justify-between gap-2">
          <span className="text-gray-800 dark:text-gray-200 truncate">{m.name}</span>
          <span className="text-gray-400 shrink-0">{m.unit} · {m.currentStock ?? 0}</span>
        </button>
      ))}
      {query.trim() && !exactMatch && (
        <div className="px-3 py-1.5 text-xs text-orange-500 border-t border-gray-100 dark:border-[#1b2e4a] flex items-center gap-1">
          <span className="font-bold">+</span> Create &quot;{query}&quot; as new raw material on save
        </div>
      )}
      {!suggestions.length && !query.trim() && (
        <div className="px-3 py-3 text-xs text-gray-400 text-center">No raw materials yet</div>
      )}
    </div>,
    document.body
  ) : null;

  return (
    <div ref={wrapRef} className="flex items-center gap-1">
      <input
        ref={inputRef}
        value={query}
        onChange={handleChange}
        onFocus={openDropdown}
        className="input text-xs w-40"
        placeholder="Type ingredient..."
      />
      {isLinked
        ? <span title="Linked to inventory" className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold select-none">●</span>
        : query.trim()
          ? <span title="Will be auto-created as raw material" className="text-[10px] text-orange-400 font-bold select-none">+</span>
          : null}
      {dropdown}
    </div>
  );
}

// ─── Formulation Tab ───────────────────────────────────────────────────────────
function FormulationTab({ product, form, setForm, onSave, isPending }) {
  const [resolving, setResolving] = useState(false);
  const rows = form.formulation?.rows || [];
  const totalPct = rows.reduce((s, r) => s + (Number(r.percentage) || 0), 0);
  const formCost = calcFormCost({ formulation: form.formulation });

  const { data: rmData } = useQuery({
    queryKey: ['raw-materials-list'],
    queryFn: () => api.get('/inventory/raw-materials').then(r => r.data.materials || []),
    staleTime: 60_000,
  });
  const rawMaterials = rmData || [];

  // Auto-sync: when raw materials load, update costPerKg for all linked rows
  useEffect(() => {
    if (!rawMaterials.length) return;
    setForm(f => {
      const rows = (f.formulation?.rows || []);
      if (!rows.some(r => r.rawMaterialId)) return f; // nothing linked, skip
      const updated = rows.map(r => {
        if (!r.rawMaterialId) return r;
        const mat = rawMaterials.find(m => m._id === r.rawMaterialId || m._id?.toString() === r.rawMaterialId);
        if (!mat) return r;
        const liveCost = mat.costPrice || 0;
        return liveCost !== Number(r.costPerKg) ? { ...r, costPerKg: liveCost } : r;
      });
      const changed = updated.some((r, i) => r !== rows[i]);
      return changed ? { ...f, formulation: { ...f.formulation, rows: updated } } : f;
    });
  }, [rawMaterials]);

  function addRow() {
    setForm(f => ({ ...f, formulation: { ...f.formulation, rows: [...(f.formulation?.rows || []), { name: '', rawMaterialId: '', percentage: 0, quantity: 0, unit: 'g', costPerKg: 0 }] } }));
  }
  function updateRow(i, fields) {
    setForm(f => {
      const rows = [...(f.formulation?.rows || [])];
      rows[i] = { ...rows[i], ...fields };
      return { ...f, formulation: { ...f.formulation, rows } };
    });
  }
  function removeRow(i) {
    setForm(f => ({ ...f, formulation: { ...f.formulation, rows: (f.formulation?.rows || []).filter((_, idx) => idx !== i) } }));
  }

  async function handleSave() {
    const unresolved = rows.filter(r => r.name?.trim() && !r.rawMaterialId);
    if (unresolved.length > 0) {
      setResolving(true);
      try {
        const res = await api.post('/catalog/resolve-ingredients', {
          ingredients: unresolved.map(r => ({ name: r.name, unit: r.unit, costPerKg: r.costPerKg })),
        });
        const resolved = res.data.ingredients || [];
        const resolvedMap = Object.fromEntries(resolved.map(r => [r.name.toLowerCase(), r]));
        setForm(f => {
          const newRows = (f.formulation?.rows || []).map(r => {
            if (!r.rawMaterialId && r.name?.trim()) {
              const match = resolvedMap[r.name.toLowerCase()];
              if (match) return { ...r, rawMaterialId: match.rawMaterialId, unit: match.unit, costPerKg: r.costPerKg || match.costPerKg };
            }
            return r;
          });
          return { ...f, formulation: { ...f.formulation, rows: newRows } };
        });
        const newCreated = resolved.filter(r => r.isNew).length;
        if (newCreated > 0) toast.success(`${newCreated} new raw material${newCreated > 1 ? 's' : ''} added to inventory`);
      } catch (e) {
        toast.error('Could not resolve some ingredients');
      } finally {
        setResolving(false);
      }
    }
    onSave();
  }

  const linkedCount = rows.filter(r => r.rawMaterialId).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div><label className="label">Ref. Batch Weight</label>
          <div className="flex gap-2">
            <input type="number" value={form.formulation?.refWeight || ''} onChange={e => setForm(f => ({ ...f, formulation: { ...f.formulation, refWeight: Number(e.target.value) } }))} className="input w-24" />
            <select value={form.formulation?.refUnit || 'ml'} onChange={e => setForm(f => ({ ...f, formulation: { ...f.formulation, refUnit: e.target.value } }))} className="input w-20">
              {UNITS.map(u => <option key={u}>{u}</option>)}
            </select>
          </div>
        </div>
        {rows.length > 0 && (
          <div className="text-xs text-gray-500 dark:text-gray-400">
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{linkedCount}</span>/{rows.length} linked to inventory
          </div>
        )}
        <div className="ml-auto text-right">
          <p className="text-xs text-gray-400">Total %</p>
          <p className={clsx('text-xl font-bold', Math.abs(totalPct - 100) < 0.1 ? 'text-green-600' : 'text-red-500')}>{numF(totalPct, 1)}%</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400">Form. Cost / kg</p>
          <p className="text-xl font-bold text-blue-600">₹{numF(formCost)}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-[#1b2e4a]">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 dark:bg-[#0f1a2e]">
            <tr>
              {['Ingredient', '%', 'Qty (g)', 'Cost/kg (₹)', 'Cost Contrib.', ''].map(h => (
                <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500 dark:text-gray-400">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-gray-100 dark:border-[#1b2e4a]">
                <td className="px-3 py-1.5">
                  <IngredientCell row={r} index={i} rawMaterials={rawMaterials} onUpdate={updateRow} />
                </td>
                <td className="px-3 py-1.5"><input type="number" value={r.percentage} onChange={e => updateRow(i, { percentage: e.target.value })} className="input text-xs w-16" /></td>
                <td className="px-3 py-1.5"><span className="text-gray-500">{numF((form.formulation?.refWeight || 100) * (r.percentage || 0) / 100, 2)}</span></td>
                <td className="px-3 py-1.5"><input type="number" value={r.costPerKg} onChange={e => updateRow(i, { costPerKg: e.target.value })} className="input text-xs w-20" /></td>
                <td className="px-3 py-1.5 text-blue-600 font-mono">₹{numF((r.costPerKg || 0) * (r.percentage || 0) / 100)}</td>
                <td className="px-3 py-1.5"><button onClick={() => removeRow(i)} className="text-red-400 hover:text-red-600">✕</button></td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">No ingredients yet. Click "+ Add Ingredient" to start.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={addRow} className="btn-secondary text-sm">+ Add Ingredient</button>
        <div className="text-[11px] text-gray-400 flex items-center gap-3">
          <span><span className="text-emerald-600 dark:text-emerald-400 font-bold">●</span> Linked to inventory</span>
          <span><span className="text-orange-400 font-bold">+</span> Will auto-create as raw material</span>
        </div>
        <button onClick={handleSave} disabled={isPending || resolving} className="btn-primary text-sm disabled:opacity-50 ml-auto">
          {resolving ? '🔗 Linking…' : isPending ? 'Saving…' : '💾 Save Formulation'}
        </button>
      </div>
    </div>
  );
}

// ─── Variants Tab ──────────────────────────────────────────────────────────────
function VariantsTab({ product, form, setForm, onSave, isPending }) {
  const variants = form.variants || [];

  function addVariant() {
    setForm(f => ({ ...f, variants: [...(f.variants || []), { name: '', weight: 0, unit: product.unit || 'ml', stock: 0, stockUnit: 'pcs', mrp: 0, sellingPrice: 0, b2bPrice: 0, costPrice: 0 }] }));
  }
  function updateV(i, field, val) {
    setForm(f => { const v = [...(f.variants || [])]; v[i] = { ...v[i], [field]: val }; return { ...f, variants: v }; });
  }
  function removeV(i) { setForm(f => ({ ...f, variants: (f.variants || []).filter((_, idx) => idx !== i) })); }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-[#1b2e4a]">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 dark:bg-[#0f1a2e]">
            <tr>
              {['Variant', 'Weight', 'Unit', 'Stock', 'MRP (₹)', 'Selling (₹)', 'B2B (₹)', ''].map(h => (
                <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500 dark:text-gray-400">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {variants.map((v, i) => (
              <tr key={i} className="border-t border-gray-100 dark:border-[#1b2e4a]">
                <td className="px-2 py-1.5"><input value={v.name} onChange={e => updateV(i, 'name', e.target.value)} className="input text-xs w-24" placeholder="100ml" /></td>
                <td className="px-2 py-1.5"><input type="number" value={v.weight} onChange={e => updateV(i, 'weight', e.target.value)} className="input text-xs w-16" /></td>
                <td className="px-2 py-1.5">
                  <select value={v.unit} onChange={e => updateV(i, 'unit', e.target.value)} className="input text-xs w-14">
                    {UNITS.map(u => <option key={u}>{u}</option>)}
                  </select>
                </td>
                <td className="px-2 py-1.5"><input type="number" value={v.stock} onChange={e => updateV(i, 'stock', e.target.value)} className="input text-xs w-16" /></td>
                <td className="px-2 py-1.5"><input type="number" value={v.mrp} onChange={e => updateV(i, 'mrp', e.target.value)} className="input text-xs w-20" /></td>
                <td className="px-2 py-1.5"><input type="number" value={v.sellingPrice} onChange={e => updateV(i, 'sellingPrice', e.target.value)} className="input text-xs w-20" /></td>
                <td className="px-2 py-1.5"><input type="number" value={v.b2bPrice} onChange={e => updateV(i, 'b2bPrice', e.target.value)} className="input text-xs w-20" /></td>
                <td className="px-2 py-1.5"><button onClick={() => removeV(i)} className="text-red-400 hover:text-red-600">✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!variants.length && <p className="text-xs text-gray-400 text-center py-6">No variants yet — add sizes below</p>}
      </div>
      <div className="flex gap-3">
        <button onClick={addVariant} className="btn-secondary text-sm">+ Add Variant</button>
        <button onClick={onSave} disabled={isPending} className="btn-primary text-sm disabled:opacity-50 ml-auto">{isPending ? 'Saving…' : '💾 Save Variants'}</button>
      </div>
    </div>
  );
}

// ─── Costing Tab ───────────────────────────────────────────────────────────────
function CostingTab({ product, form, setForm, onSave, isPending }) {
  const merged = { ...product, ...form };
  const b = calcOverheadBreakdown(merged);
  const totalInputPerUnit = b.formCost + b.saAmount + b.overheadPerUnit + b.rndPerUnit;
  const costPerUnit = totalInputPerUnit + b.pkgCost;
  const margins = form.costing?.margins || {};
  const variants = form.variants || [];
  const [showGST, setShowGST] = useState(false);
  const gstRate = (form.gstRate || 0) / 100;

  function setMargin(f, v) { setForm(prev => ({ ...prev, costing: { ...prev.costing, margins: { ...prev.costing?.margins, [f]: Number(v) } } })); }

  // Chained margin chain, matching product-catalog.html renderVariantPricing()
  function computeVariantPricing(v) {
    const refW = b.refW || 1;
    const sizeRatio = refW > 0 && Number(v.weight) > 0 ? Number(v.weight) / refW : 1;
    const productionCost = costPerUnit * sizeRatio;
    const exFactory = productionCost * (1 + (Number(margins.exFactory) || 0) / 100);
    const dealer = exFactory * (1 + (Number(margins.dealer) || 0) / 100);
    const distributor = dealer * (1 + (Number(margins.distributor) || 0) / 100);
    const retailer = distributor * (1 + (Number(margins.retailer) || 0) / 100);
    const selling = retailer * (1 + (Number(margins.selling) || 0) / 100);
    const b2b = productionCost * (1 + (Number(margins.b2b) || 0) / 100);
    const b2c = productionCost * (1 + (Number(margins.b2c) || 0) / 100);
    return { productionCost, exFactory, dealer, distributor, retailer, selling, b2b, b2c };
  }

  const firstVariantPricing = variants.length ? computeVariantPricing(variants[0]) : null;

  return (
    <div className="space-y-5">
      {/* Cost Inputs */}
      <div className="rounded-xl border border-gray-200 dark:border-[#1b2e4a] p-4 space-y-2">
        <p className="text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">📥 Cost Inputs</p>
        <div className="flex justify-between text-xs"><span className="text-gray-500">🧪 Ingredients Cost Per Unit (from Formulation)</span><span className="font-mono font-semibold">₹{numF(b.formCost, 4)}</span></div>
        <div className="flex justify-between text-xs bg-slate-900 text-white rounded-lg px-3 py-2 mt-2">
          <span className="text-white/80">📊 Total Input Cost Per Unit (Formulation + R&amp;D + Overheads)</span>
          <span className="font-mono font-bold text-amber-300">₹{numF(totalInputPerUnit, 4)}</span>
        </div>
      </div>

      {/* Unit Cost Summary */}
      <div>
        <p className="text-xs font-bold text-gray-600 dark:text-gray-300 mb-2">📊 Unit Cost Summary</p>
        <HighlightStrip tone="dark" items={[
          { label: 'Ingredients', value: `₹${numF(b.formCost)}` },
          { label: 'Packaging', value: `₹${numF(b.pkgCost)}` },
          { label: 'Overhead', value: `₹${numF(b.overheadPerUnit + b.saAmount)}` },
          { label: 'R&D Per Unit', value: `₹${numF(b.rndPerUnit)}` },
          { label: 'Grand Total / Unit', value: `₹${numF(costPerUnit)}`, big: true, accent: true },
        ]} />
      </div>

      {/* Margin Settings */}
      <div className="rounded-xl border border-gray-200 dark:border-[#1b2e4a] p-4">
        <p className="text-xs font-bold text-gray-600 dark:text-gray-300 mb-3">Margin Settings (%)</p>
        <div className="grid grid-cols-5 gap-3 mb-2">
          {[['exFactory', 'Ex-Factory'], ['dealer', 'Dealer'], ['distributor', 'Distributor'], ['retailer', 'Retailer'], ['selling', 'Selling']].map(([f, label]) => (
            <div key={f}><label className="text-[10px] text-gray-500">{label}</label><input type="number" step="0.1" value={margins[f] || 0} onChange={e => setMargin(f, e.target.value)} className="input text-xs w-full" /></div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[['b2b', 'B2B Margin (%)'], ['b2c', 'B2C Margin (%)']].map(([f, label]) => (
            <div key={f}><label className="text-[10px] text-gray-500">{label}</label><input type="number" step="0.1" value={margins[f] || 0} onChange={e => setMargin(f, e.target.value)} className="input text-xs w-full" /></div>
          ))}
        </div>
      </div>

      {/* GST toggle */}
      <div className="flex items-center gap-3 flex-wrap">
        <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-gray-600 dark:text-gray-300">
          <input type="checkbox" checked={showGST} onChange={e => setShowGST(e.target.checked)} className="w-4 h-4" />
          Show GST Inclusive Prices
        </label>
        <span className="text-[11px] text-gray-400">GST Rate: {form.gstRate || 0}%</span>
      </div>

      {/* Variant Pricing */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-[#1b2e4a]">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 dark:bg-[#0f1a2e]">
            <tr>{['Variant', 'Weight', 'Prod. Cost', 'Ex-Factory', 'Dealer', 'Dist.', 'Retail', 'Selling', 'B2B', 'B2C'].map(h => <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">{h}</th>)}</tr>
          </thead>
          <tbody>
            {variants.map((v, i) => {
              const p = computeVariantPricing(v);
              const isRef = Math.abs(Number(v.weight) - b.refW) < 0.001;
              return (
                <tr key={i} className={clsx('border-t border-gray-100 dark:border-[#1b2e4a]', isRef && 'bg-amber-50/60 dark:bg-amber-500/5')}>
                  <td className="px-3 py-1.5 font-semibold whitespace-nowrap">{v.name || '—'}{isRef && <span className="ml-1 text-amber-500" title="Reference weight">⭐</span>}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{v.weight} {v.unit}</td>
                  <td className="px-3 py-1.5 font-mono">₹{numF(p.productionCost)}</td>
                  <td className="px-3 py-1.5 font-mono">₹{numF(p.exFactory)}</td>
                  <td className="px-3 py-1.5 font-mono">₹{numF(p.dealer)}</td>
                  <td className="px-3 py-1.5 font-mono">₹{numF(p.distributor)}</td>
                  <td className="px-3 py-1.5 font-mono">₹{numF(p.retailer)}</td>
                  <td className="px-3 py-1.5 font-mono font-semibold">₹{numF(p.selling)}</td>
                  <td className="px-3 py-1.5 font-mono">₹{numF(p.b2b)}</td>
                  <td className="px-3 py-1.5 font-mono">₹{numF(p.b2c)}</td>
                </tr>
              );
            })}
            {!variants.length && <tr><td colSpan={10} className="px-3 py-6 text-center text-gray-400">No variants. Add sizes in the Variants tab.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* GST-inclusive panel */}
      {showGST && firstVariantPricing && (
        <div className="rounded-xl border border-gray-200 dark:border-[#1b2e4a] p-4">
          <p className="text-xs font-bold text-gray-600 dark:text-gray-300 mb-3">💰 GST Inclusive Prices (First Variant)</p>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="flex justify-between"><span className="text-gray-500">Ex-Factory (with GST)</span><span className="font-mono font-semibold">₹{numF(firstVariantPricing.exFactory * (1 + gstRate))}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Selling (with GST)</span><span className="font-mono font-semibold">₹{numF(firstVariantPricing.selling * (1 + gstRate))}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">B2C (with GST)</span><span className="font-mono font-semibold">₹{numF(firstVariantPricing.b2c * (1 + gstRate))}</span></div>
          </div>
          <p className="text-[10px] text-gray-400 mt-2">All calculations are done without GST. GST is added only for display purposes at the selected rate.</p>
        </div>
      )}

      <button onClick={onSave} disabled={isPending} className="btn-primary text-sm disabled:opacity-50">{isPending ? 'Saving…' : '💾 Save Costing'}</button>
    </div>
  );
}

// ─── Packaging Tab ─────────────────────────────────────────────────────────────
function PackagingTab({ product, form, setForm, onSave, isPending }) {
  const items = form.packaging?.items || [];
  const charges = form.packaging?.charges || {};
  const totalPkg = items.reduce((s, i) => s + (Number(i.amount) || Number(i.qty) * Number(i.rate) || 0), 0) + Number(charges.machine || 0) + Number(charges.shrinkWrap || 0) + Number(charges.other || 0);

  function updateItem(i, f, v) { setForm(prev => { const it = [...(prev.packaging?.items || [])]; it[i] = { ...it[i], [f]: v }; return { ...prev, packaging: { ...prev.packaging, items: it } }; }); }
  function removeItem(i) { setForm(prev => ({ ...prev, packaging: { ...prev.packaging, items: prev.packaging?.items?.filter((_, idx) => idx !== i) } })); }
  function addItem() { setForm(prev => ({ ...prev, packaging: { ...prev.packaging, items: [...(prev.packaging?.items || []), { name: '', qty: 1, rate: 0, amount: 0, optional: false }] } })); }
  function setCharge(f, v) { setForm(prev => ({ ...prev, packaging: { ...prev.packaging, charges: { ...prev.packaging?.charges, [f]: Number(v) } } })); }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-[#1b2e4a]">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 dark:bg-[#0f1a2e]">
            <tr>{['Item', 'Qty', 'Rate (₹)', 'Amount (₹)', 'Optional', ''].map(h => <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500">{h}</th>)}</tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i} className="border-t border-gray-100 dark:border-[#1b2e4a]">
                <td className="px-2 py-1.5"><input value={item.name} onChange={e => updateItem(i, 'name', e.target.value)} className="input text-xs w-32" /></td>
                <td className="px-2 py-1.5"><input type="number" value={item.qty} onChange={e => updateItem(i, 'qty', Number(e.target.value))} className="input text-xs w-14" /></td>
                <td className="px-2 py-1.5"><input type="number" value={item.rate} onChange={e => updateItem(i, 'rate', Number(e.target.value))} className="input text-xs w-20" /></td>
                <td className="px-2 py-1.5"><input type="number" value={item.amount || item.qty * item.rate} onChange={e => updateItem(i, 'amount', Number(e.target.value))} className="input text-xs w-20" /></td>
                <td className="px-2 py-1.5"><input type="checkbox" checked={item.optional} onChange={e => updateItem(i, 'optional', e.target.checked)} className="w-4 h-4" /></td>
                <td className="px-2 py-1.5"><button onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600">✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[['machine', 'Machine Charges'], ['shrinkWrap', 'Shrink Wrap'], ['other', 'Other']].map(([f, label]) => (
          <div key={f}><label className="label">{label} (₹)</label><input type="number" value={charges[f] || 0} onChange={e => setCharge(f, e.target.value)} className="input" /></div>
        ))}
      </div>
      <div className="rounded-lg bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800/30 px-4 py-2">
        <p className="text-xs font-semibold text-green-700 dark:text-green-400">Total Packaging Cost: ₹{numF(totalPkg)}</p>
      </div>
      <div className="flex gap-3">
        <button onClick={addItem} className="btn-secondary text-sm">+ Add Item</button>
        <button onClick={onSave} disabled={isPending} className="btn-primary text-sm disabled:opacity-50 ml-auto">{isPending ? 'Saving…' : '💾 Save Packaging'}</button>
      </div>
    </div>
  );
}

// ─── Marketplace Tab ───────────────────────────────────────────────────────────
function MarketplaceTab({ product, form, setForm, onSave, isPending }) {
  const merged = { ...product, ...form };
  const b = calcOverheadBreakdown(merged);
  const margins = form.marketplace?.margins || {};
  const fees = form.marketplace?.fees || {};
  const mpItems = form.marketplace?.packaging || [];

  function setFee(platform, field, val) {
    setForm(prev => ({ ...prev, marketplace: { ...prev.marketplace, fees: { ...prev.marketplace?.fees, [platform]: { ...prev.marketplace?.fees?.[platform], [field]: Number(val) } } } }));
  }
  function setMgn(platform, val) {
    setForm(prev => ({ ...prev, marketplace: { ...prev.marketplace, margins: { ...prev.marketplace?.margins, [platform]: Number(val) } } }));
  }
  function updateMPItem(i, field, val) {
    setForm(prev => { const items = [...(prev.marketplace?.packaging || [])]; items[i] = { ...items[i], [field]: field === 'name' ? val : Number(val) }; return { ...prev, marketplace: { ...prev.marketplace, packaging: items } }; });
  }
  function removeMPItem(i) { setForm(prev => ({ ...prev, marketplace: { ...prev.marketplace, packaging: (prev.marketplace?.packaging || []).filter((_, idx) => idx !== i) } })); }
  function addMPItem() { setForm(prev => ({ ...prev, marketplace: { ...prev.marketplace, packaging: [...(prev.marketplace?.packaging || []), { name: 'New Item', qty: 1, rate: 0, amount: 0, optional: false }] } })); }

  const mpPackagingTotal = mpItems.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.rate) || 0), 0);
  const baseCost = b.formCost + b.saAmount + b.overheadPerUnit + b.rndPerUnit + mpPackagingTotal;

  // Solves for the min selling price that clears all % deductions + fixed costs + target margin,
  // matching product-catalog.html recalcMarketplace()'s calcPlatform().
  function calcPlatform(p) {
    const f = fees[p] || {};
    const margin = (margins[p] || 0) / 100;
    const totalDeductions = ((f.commission || 0) + (f.collection || 0) + (f.fba || 0) + (f.penalty || 0)) / 100;
    const fixed = f.fixed || 0;
    const shipping = f.shipping || 0;
    const denom = 1 - totalDeductions - margin;
    const minSelling = denom > 0 ? (baseCost + fixed + shipping) / denom : 0;
    const sellerReceives = minSelling * (1 - totalDeductions) - fixed - shipping;
    const netMargin = sellerReceives - baseCost;
    return { minSelling, sellerReceives, netMargin };
  }

  const FEE_FIELDS = {
    flipkart: [['commission', 'Commission %'], ['fixed', 'Fixed (₹)'], ['shipping', 'Shipping (₹)'], ['collection', 'Collection %']],
    amazon: [['commission', 'Referral %'], ['fixed', 'Closing Fee (₹)'], ['shipping', 'Shipping (₹)'], ['fba', 'FBA/Storage %']],
    meesho: [['commission', 'Commission %'], ['shipping', 'Shipping (₹)'], ['collection', 'Collection %'], ['penalty', 'Penalty/RTO %']],
    snapdeal: [['commission', 'Commission %'], ['fixed', 'Fixed (₹)'], ['shipping', 'Shipping (₹)'], ['collection', 'Collection %']],
  };

  return (
    <div className="space-y-4">
      {/* Imported Costs */}
      <div className="rounded-xl border border-gray-200 dark:border-[#1b2e4a] p-4 space-y-1.5 text-xs">
        <p className="text-xs font-bold text-gray-600 dark:text-gray-300 mb-2">📥 Imported Costs</p>
        <div className="flex justify-between"><span className="text-gray-400">Ingredients Cost Per Unit</span><span className="font-mono">₹{numF(b.formCost, 4)}</span></div>
        <div className="flex justify-between"><span className="text-gray-400">Standard Assumptions Indirect Amount</span><span className="font-mono">₹{numF(b.saAmount, 4)}</span></div>
        <div className="flex justify-between"><span className="text-gray-400">Production Overhead Per Unit</span><span className="font-mono">₹{numF(b.overheadPerUnit, 4)}</span></div>
        <div className="flex justify-between"><span className="text-gray-400">R&D Cost Per Unit</span><span className="font-mono">₹{numF(b.rndPerUnit, 4)}</span></div>
      </div>

      {/* Marketplace Packaging */}
      <div className="rounded-xl border border-gray-200 dark:border-[#1b2e4a] p-4">
        <p className="text-xs font-bold text-gray-600 dark:text-gray-300 mb-3">📦 Marketplace Packaging &amp; Labeling</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr>{['Item', 'Qty', 'Rate (₹)', 'Amount (₹)', 'Optional', ''].map(h => <th key={h} className="px-2 py-1 text-left font-semibold text-gray-500">{h}</th>)}</tr></thead>
            <tbody>
              {mpItems.map((item, i) => (
                <tr key={i} className="border-t border-gray-100 dark:border-[#1b2e4a]">
                  <td className="px-2 py-1"><input value={item.name} onChange={e => updateMPItem(i, 'name', e.target.value)} className="input text-xs w-28" /></td>
                  <td className="px-2 py-1"><input type="number" value={item.qty} onChange={e => updateMPItem(i, 'qty', e.target.value)} className="input text-xs w-14" /></td>
                  <td className="px-2 py-1"><input type="number" value={item.rate} onChange={e => updateMPItem(i, 'rate', e.target.value)} className="input text-xs w-16" /></td>
                  <td className="px-2 py-1 font-mono">₹{numF((Number(item.qty) || 0) * (Number(item.rate) || 0))}</td>
                  <td className="px-2 py-1 text-center"><input type="checkbox" checked={!!item.optional} onChange={e => updateMPItem(i, 'optional', e.target.checked)} className="w-4 h-4" /></td>
                  <td className="px-2 py-1"><button onClick={() => removeMPItem(i)} className="text-red-400 hover:text-red-600">✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button onClick={addMPItem} className="btn-secondary text-xs mt-2">+ Add Marketplace Packaging Item</button>
      </div>

      <HighlightStrip items={[
        { label: 'Total Base Cost / Unit', value: `₹${numF(baseCost)}`, big: true },
        { label: 'Reference Weight', value: b.refW ? `${b.refW} ${form.formulation?.refUnit || form.unit || ''}` : '—' },
      ]} />

      <div className="grid grid-cols-2 gap-4">
        {PLATFORMS.map(p => {
          const calc = calcPlatform(p);
          return (
            <div key={p} className="rounded-xl border border-gray-200 dark:border-[#1b2e4a] p-4">
              <p className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-3">{PLATFORM_ICONS[p]} {p.charAt(0).toUpperCase() + p.slice(1)}</p>
              <div className="flex items-center gap-2 mb-3">
                <label className="text-xs text-gray-500 w-24">Margin %</label>
                <input type="number" value={margins[p] || 0} onChange={e => setMgn(p, e.target.value)} className="input text-xs w-16" />
              </div>
              {(FEE_FIELDS[p] || []).map(([f, label]) => (
                <div key={f} className="flex items-center gap-2 mb-2">
                  <label className="text-xs text-gray-500 w-24">{label}</label>
                  <input type="number" value={fees[p]?.[f] || 0} onChange={e => setFee(p, f, e.target.value)} className="input text-xs w-16" />
                </div>
              ))}
              <div className="mt-3 pt-2 border-t-2 border-gray-100 dark:border-[#1b2e4a] space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-gray-400">Min Selling Price</span><span className="font-mono text-gray-700 dark:text-gray-300">₹{numF(calc.minSelling)}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Seller Receives</span><span className="font-mono text-gray-700 dark:text-gray-300">₹{numF(calc.sellerReceives)}</span></div>
                <div className="flex justify-between font-semibold"><span className={calc.netMargin >= 0 ? 'text-green-600' : 'text-red-500'}>Net Margin</span><span className={clsx('font-mono', calc.netMargin >= 0 ? 'text-green-600' : 'text-red-500')}>₹{numF(calc.netMargin)}</span></div>
              </div>
            </div>
          );
        })}
      </div>
      <button onClick={onSave} disabled={isPending} className="btn-primary text-sm disabled:opacity-50">{isPending ? 'Saving…' : '💾 Save Marketplace'}</button>
    </div>
  );
}

// ─── Highlight strip (pricing-highlight equivalent) ─────────────────────────────
function HighlightStrip({ items, tone = 'light' }) {
  const isDark = tone === 'dark';
  return (
    <div className={clsx('grid gap-4 rounded-xl p-4', isDark ? 'bg-slate-900 text-white' : 'border border-gray-200 dark:border-[#1b2e4a]')}
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0,1fr))` }}>
      {items.map((it, i) => (
        <div key={i}>
          <p className={clsx('text-[11px] mb-1', isDark ? 'text-white/70' : 'text-gray-400')}>{it.label}</p>
          <p className={clsx('font-bold', it.big ? 'text-xl' : 'text-base', isDark ? (it.accent ? 'text-amber-300' : 'text-white') : 'text-gray-800 dark:text-gray-100')}>{it.value}</p>
        </div>
      ))}
    </div>
  );
}

function LastUpdatedBadge({ date, onChange }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
        🕐 Last updated: {fmtDate(date)}
      </span>
      <input type="date" value={date ? new Date(date).toISOString().split('T')[0] : ''} onChange={e => onChange(e.target.value ? new Date(e.target.value).toISOString() : null)}
        className="text-[11px] px-2 py-1 border border-gray-200 dark:border-[#1b2e4a] rounded-lg bg-white dark:bg-[#0d1b2e]" title="Edit last updated date" />
    </div>
  );
}

// ─── R&D & Overheads Tab ────────────────────────────────────────────────────────
function RndOverheadsTab({ product, form, setForm, onSave, isPending }) {
  const rnd = form.rnd || {};
  const po = form.productionOverhead || {};
  const sa = form.standardAssumptions || {};
  const b = calcOverheadBreakdown({ ...product, ...form });

  const lifecycle = rnd.lifecycle || 1000;

  function setR(f, v) { setForm(prev => ({ ...prev, rnd: { ...prev.rnd, [f]: v, lastUpdated: new Date().toISOString() } })); }
  function setRDate(v) { setForm(prev => ({ ...prev, rnd: { ...prev.rnd, lastUpdated: v } })); }
  function setPO(f, v) { setForm(prev => ({ ...prev, productionOverhead: { ...prev.productionOverhead, [f]: v, lastUpdated: new Date().toISOString() } })); }
  function setPODate(v) { setForm(prev => ({ ...prev, productionOverhead: { ...prev.productionOverhead, lastUpdated: v } })); }
  function setSA(f, v) { setForm(prev => ({ ...prev, standardAssumptions: { ...prev.standardAssumptions, [f]: v, lastUpdated: new Date().toISOString() } })); }

  function onImage(e) {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => setForm(prev => ({ ...prev, standardAssumptions: { ...prev.standardAssumptions, image: ev.target.result, lastUpdated: new Date().toISOString() } }));
    r.readAsDataURL(f);
  }

  return (
    <div className="space-y-6">
      {/* R&D Costing */}
      <div>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <p className="text-sm font-bold text-gray-700 dark:text-gray-200">🔬 R&D Costing</p>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500 whitespace-nowrap">Lifecycle (batches)</label>
              <input type="number" min="1" value={rnd.lifecycle || 1000} onChange={e => setR('lifecycle', Number(e.target.value) || 1)} className="input text-xs w-24" />
            </div>
            <LastUpdatedBadge date={rnd.lastUpdated} onChange={setRDate} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[['testing', 'R&D Testing Cost (₹)'], ['consumables', 'Chemical Consumables (₹)'], ['samples', 'Sample Cost (₹)'], ['overhead', 'R&D Overhead (₹)'], ['otherOverhead', 'Other R&D Overhead (₹)'], ['qc', 'Lab QC for R&D (₹)']].map(([f, label]) => (
            <div key={f}><label className="label">{label}</label><input type="number" min="0" step="0.01" value={rnd[f] || 0} onChange={e => setR(f, Number(e.target.value))} className="input text-xs w-full" /></div>
          ))}
        </div>
        <HighlightStrip items={[
          { label: 'Total R&D Cost', value: `₹${numF(b.rndTotal)}` },
          { label: 'Lifecycle Batches', value: lifecycle.toLocaleString('en-IN') },
          { label: 'R&D Cost Per Unit', value: `₹${numF(b.rndPerUnit, 4)}`, big: true },
        ]} />
      </div>

      <hr className="border-gray-100 dark:border-[#1b2e4a]" />

      {/* Production Overhead */}
      <div>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <p className="text-sm font-bold text-gray-700 dark:text-gray-200">🏭 Production Overhead</p>
          <LastUpdatedBadge date={po.lastUpdated} onChange={setPODate} />
        </div>
        <div className="grid grid-cols-2 gap-3 mb-4">
          {[['electricity', 'Electricity (₹)'], ['labor', 'Production Labor (₹)'], ['labTesting', 'Lab Testing Cost (₹)'], ['other', 'Other Production Overhead (₹)']].map(([f, label]) => (
            <div key={f}><label className="label">{label}</label><input type="number" min="0" step="0.01" value={po[f] || 0} onChange={e => setPO(f, Number(e.target.value))} className="input text-xs w-full" /></div>
          ))}
        </div>
        <HighlightStrip items={[
          { label: 'Total Production Overhead', value: `₹${numF(b.overheadTotal)}` },
          { label: 'Per Unit', value: `₹${numF(b.overheadPerUnit, 4)}`, big: true },
          { label: 'Reference Weight', value: b.refW ? `${b.refW} ${form.formulation?.refUnit || form.unit || ''}` : '—' },
        ]} />
      </div>

      <hr className="border-gray-100 dark:border-[#1b2e4a]" />

      {/* Standard Assumptions */}
      <div>
        <p className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-3">📝 Standard Assumptions (Industry STD%)</p>
        <div className="grid grid-cols-3 gap-4 mb-4">
          {ASSUMPTION_FIELDS.map(({ key, label, max, hint }) => (
            <div key={key}>
              <label className="label">{label} <span className="text-gray-400">%</span></label>
              <div className="flex items-center gap-2">
                <input type="range" min="0" max={max} step="0.5" value={sa[key] ?? 0} onChange={e => setSA(key, Number(e.target.value))} className="flex-1" />
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 w-10 text-right">{sa[key] ?? 0}%</span>
              </div>
              <p className="text-[10px] text-gray-400 mt-0.5">{hint}</p>
            </div>
          ))}
        </div>
        <HighlightStrip items={[
          { label: 'Total Indirect % on Material Cost', value: `${numF(b.saPct, 1)}%` },
          { label: 'Total Amount / Unit (at ref cost)', value: `₹${numF(b.saAmount, 4)}`, big: true },
          { label: 'Reference Weight', value: b.refW ? `${b.refW} ${form.formulation?.refUnit || form.unit || ''}` : '—' },
        ]} />
        {(b.saPct < 15 || b.saPct > 30) && (
          <div className="mt-3 flex items-start gap-2 text-xs bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40 rounded-lg px-3 py-2">
            <span>⚠️</span><span>Industry range for total indirect: 15% – 30%. Adjust sliders if your total is outside this range.</span>
          </div>
        )}
        <div className="mt-4">
          <label className="label">📷 Reference Image / Basis</label>
          <div onClick={() => document.getElementById('saImageInput').click()} className="w-full h-28 border-2 border-dashed border-gray-200 dark:border-[#1b2e4a] rounded-xl flex items-center justify-center cursor-pointer overflow-hidden bg-gray-50 dark:bg-[#0f1a2e] hover:border-gray-400 transition-colors">
            {sa.image ? <img src={sa.image} alt="Basis" className="w-full h-full object-cover" /> : <span className="text-xs text-gray-400">📷 Click to upload reference image / basis document</span>}
          </div>
          <input type="file" id="saImageInput" accept="image/*" className="hidden" onChange={onImage} />
        </div>
      </div>

      <hr className="border-gray-100 dark:border-[#1b2e4a]" />

      {/* Grand Total Summary */}
      <div>
        <p className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-3">📊 Total Overhead &amp; R&amp;D Cost Summary</p>
        <HighlightStrip tone="dark" items={[
          { label: 'R&D Cost Per Unit', value: `₹${numF(b.rndPerUnit, 4)}` },
          { label: 'Production Overhead Per Unit', value: `₹${numF(b.overheadPerUnit, 4)}` },
          { label: 'Standard Assumptions Per Unit', value: `₹${numF(b.saAmount, 4)}` },
          { label: 'Total Overhead & R&D Per Unit', value: `₹${numF(b.rndPerUnit + b.overheadPerUnit + b.saAmount, 4)}`, big: true, accent: true },
        ]} />
        <div className="mt-3">
          <HighlightStrip items={[
            { label: 'Total Cost for Product (at ref weight)', value: `₹${numF((b.rndPerUnit + b.overheadPerUnit + b.saAmount) * b.refW)}` },
            { label: 'Reference Weight', value: b.refW ? `${b.refW} ${form.formulation?.refUnit || form.unit || ''}` : '—' },
          ]} />
        </div>
      </div>

      <button onClick={onSave} disabled={isPending} className="btn-primary text-sm disabled:opacity-50">{isPending ? 'Saving…' : '💾 Save R&D & Overheads'}</button>
    </div>
  );
}

// ─── QR Code Tab ─────────────────────────────────────────────────────────────
function QRCodeTab({ product: p }) {
  const qrData = JSON.stringify({ code: p.code, name: p.name, category: p.category || '', unit: p.unit || '' });
  return (
    <div className="flex flex-col items-center gap-4 py-6">
      <p className="text-sm font-bold text-gray-700 dark:text-gray-200 self-start">🔲 Product QR Code</p>
      <div className="bg-white p-6 rounded-xl border border-gray-200 dark:border-[#1b2e4a]">
        <QRCode value={qrData} size={200} fgColor="#0f172a" bgColor="#ffffff" />
      </div>
      <div className="text-center text-sm">
        <p className="font-bold text-gray-800 dark:text-gray-100">{p.name}</p>
        <p className="text-gray-400">SKU: {p.code}</p>
        <p className="text-gray-400">{p.unit || ''}</p>
      </div>
      <button onClick={() => window.print()} className="btn-primary text-sm">🖨️ Print Label</button>
    </div>
  );
}

// ─── Attachment list (shared by Procedure tab) ──────────────────────────────────
function AttachmentList({ attachments, onRemove }) {
  if (!attachments?.length) return null;
  const icon = (t) => t === 'video' ? '🎬' : t === 'audio' ? '🎙️' : '📄';
  return (
    <div className="flex flex-col gap-2 mt-3">
      {attachments.map((a) => (
        <div key={a._id || a.url} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-gray-200 dark:border-[#1b2e4a] text-xs">
          <span className="text-lg">{icon(a.type)}</span>
          <div className="flex-1 min-w-0">
            <a href={a.url} target="_blank" rel="noreferrer" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline truncate block">{a.name || 'Attachment'}</a>
            <p className="text-gray-400">{a.type || 'file'} · {fmtDate(a.createdAt)}</p>
          </div>
          <button onClick={() => onRemove(a._id)} title="Remove" className="text-red-400 hover:text-red-600">🗑️</button>
        </div>
      ))}
    </div>
  );
}

// ─── Procedure Tab ───────────────────────────────────────────────────────────────
function ProcedureTab({ product, form, setForm, onSave, isPending, onAttach, onRemoveAttach }) {
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  function setText(field, val) { setForm(prev => ({ ...prev, [field]: { ...prev[field], text: val } })); }

  function onFile(kind) {
    return (e) => {
      const f = e.target.files[0]; if (!f) return;
      onAttach(f, kind);
      e.target.value = '';
    };
  }

  async function toggleAudioRecord() {
    if (recording) { mediaRecorderRef.current?.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const file = new File([blob], `Recording ${new Date().toLocaleString()}.webm`, { type: 'audio/webm' });
        onAttach(file, 'procedure');
        setRecording(false); setRecSeconds(0);
        clearInterval(timerRef.current);
        stream.getTracks().forEach(t => t.stop());
      };
      mediaRecorderRef.current = rec;
      rec.start();
      setRecording(true); setRecSeconds(0);
      timerRef.current = setInterval(() => setRecSeconds(s => s + 1), 1000);
    } catch { toast.error('Microphone access denied'); }
  }

  const mm = String(Math.floor(recSeconds / 60)).padStart(2, '0');
  const ss = String(recSeconds % 60).padStart(2, '0');

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-bold text-gray-700 dark:text-gray-200">📝 R&D Documentation</p>
          <div>
            <input type="file" id="rndDocFile" accept=".pdf,.doc,.docx,.xlsx,.jpg,.png" className="hidden" onChange={onFile('rndDoc')} />
            <button onClick={() => document.getElementById('rndDocFile').click()} className="btn-secondary text-xs">📎 Attach R&D Doc</button>
          </div>
        </div>
        <textarea value={form.rndDoc?.text || ''} onChange={e => setText('rndDoc', e.target.value)} rows={4} className="input resize-none text-xs w-full" placeholder="Research notes, formulation history, test results, stability studies…" />
        <AttachmentList attachments={product.rndDoc?.attachments} onRemove={(id) => onRemoveAttach('rndDoc', id)} />
      </div>

      <div>
        <p className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">🔬 Research Guide</p>
        <textarea value={form.researchGuide?.text || ''} onChange={e => setText('researchGuide', e.target.value)} rows={3} className="input resize-none text-xs w-full" placeholder="Literature sources, patent references, regulatory guidelines, safety assessments…" />
      </div>

      <div>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
          <p className="text-sm font-bold text-gray-700 dark:text-gray-200">🏭 Manufacturing Procedure</p>
          <div className="flex gap-2">
            <input type="file" id="procFile" accept=".pdf,.doc,.docx" className="hidden" onChange={onFile('procedure')} />
            <button onClick={() => document.getElementById('procFile').click()} className="btn-secondary text-xs">📎 Attach File</button>
            <input type="file" id="procVideo" accept="video/*" className="hidden" onChange={onFile('procedure')} />
            <button onClick={() => document.getElementById('procVideo').click()} className="btn-secondary text-xs">🎬 Attach Video</button>
            <button onClick={toggleAudioRecord} className="btn-secondary text-xs">{recording ? '⏹ Stop Recording' : '🎙️ Record Audio'}</button>
          </div>
        </div>
        <textarea value={form.procedure?.text || ''} onChange={e => setText('procedure', e.target.value)} rows={6} className="input resize-none text-sm w-full" placeholder="Step-by-step manufacturing procedure…" />
        {recording && (
          <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-800/40 text-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            <span className="font-semibold text-red-600 dark:text-red-400">Recording…</span>
            <span className="ml-auto text-gray-400">{mm}:{ss}</span>
          </div>
        )}
        <AttachmentList attachments={product.procedure?.attachments} onRemove={(id) => onRemoveAttach('procedure', id)} />
      </div>

      <button onClick={onSave} disabled={isPending} className="btn-primary text-sm disabled:opacity-50">{isPending ? 'Saving…' : '💾 Save Procedure'}</button>
    </div>
  );
}

// ─── Documents Tab ───────────────────────────────────────────────────────────────
function DocumentsTab({ product, onAttach, onRemoveAttach }) {
  const slots = [
    ['coa', 'COA (Certificate of Analysis)', '.pdf'],
    ['msds', 'MSDS', '.pdf'],
    ['registration', 'Product Registration', '.pdf'],
    ['brochure', 'Marketing Brochure', '.pdf,.jpg,.png'],
  ];
  const docs = product.documents || {};

  return (
    <div className="space-y-4">
      <p className="text-sm font-bold text-gray-700 dark:text-gray-200">📄 Documents &amp; Certificates</p>
      <div className="grid grid-cols-2 gap-4">
        {slots.map(([key, label, accept]) => {
          const doc = docs[key];
          return (
            <div key={key} className="rounded-xl border border-gray-200 dark:border-[#1b2e4a] p-4">
              <label className="label">{label}</label>
              {doc?.url ? (
                <div className="flex items-center gap-2 text-xs mt-1">
                  <a href={doc.url} target="_blank" rel="noreferrer" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline truncate flex-1">{doc.name || 'Document'}</a>
                  <span className="text-gray-400">{fmtDate(doc.uploadedAt)}</span>
                  <button onClick={() => onRemoveAttach(`documents.${key}`)} className="text-red-400 hover:text-red-600">🗑️</button>
                </div>
              ) : (
                <div className="mt-1">
                  <input type="file" id={`doc-${key}`} accept={accept} className="hidden" onChange={e => { const f = e.target.files[0]; if (f) onAttach(f, `documents.${key}`); e.target.value = ''; }} />
                  <button onClick={() => document.getElementById(`doc-${key}`).click()} className="btn-secondary text-xs">📎 Upload</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── History Tab ─────────────────────────────────────────────────────────────────
function HistoryTab({ product: p }) {
  const events = [...(p.history || [])];
  if (p.rnd?.lastUpdated) events.push({ action: 'R&D costing updated', date: p.rnd.lastUpdated, detail: `Lifecycle: ${p.rnd.lifecycle || 1000} batches` });
  if (p.productionOverhead?.lastUpdated) events.push({ action: 'Production Overhead updated', date: p.productionOverhead.lastUpdated, detail: 'Manufacturing costs' });
  if (p.standardAssumptions?.lastUpdated) events.push({ action: 'Standard Assumptions updated', date: p.standardAssumptions.lastUpdated, detail: 'Overhead % assumptions' });
  if (p.rndDoc?.lastUpdated) events.push({ action: 'R&D documentation updated', date: p.rndDoc.lastUpdated, detail: 'Research notes modified' });
  if (p.packaging?.lastUpdated) events.push({ action: 'Packaging updated', date: p.packaging.lastUpdated, detail: 'Packaging costs' });
  if (p.costing?.lastUpdated) events.push({ action: 'Costing updated', date: p.costing.lastUpdated, detail: 'Margins' });
  if (p.marketplace?.lastUpdated) events.push({ action: 'Marketplace updated', date: p.marketplace.lastUpdated, detail: 'Platform fees & margins' });
  events.sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div className="space-y-4">
      <p className="text-sm font-bold text-gray-700 dark:text-gray-200">🕐 Activity History</p>
      {!events.length ? (
        <p className="text-xs text-gray-400 bg-gray-50 dark:bg-[#0f1a2e] rounded-lg px-4 py-3">No activity history recorded yet. Changes to R&D, overhead, procedures, and documents will be tracked automatically.</p>
      ) : (
        <div className="space-y-2">
          {events.map((e, i) => (
            <div key={i} className="flex items-start gap-3 px-3 py-2 rounded-lg border border-gray-100 dark:border-[#1b2e4a] text-xs">
              <span className="text-gray-400 whitespace-nowrap">{fmtDate(e.date)}</span>
              <div>
                <p className="font-semibold text-gray-700 dark:text-gray-200">{e.action}</p>
                {e.detail && <p className="text-gray-400">{e.detail}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
