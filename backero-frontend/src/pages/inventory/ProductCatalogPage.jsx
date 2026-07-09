import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { clsx } from 'clsx';
import api from '../../api/axios';

const CATEGORIES = ['Hair Care', 'Skin Care', 'Body Care', 'Lip Care', 'Nail Care', 'Fragrances', 'Men Care', 'Baby Care', 'Other'];
const UNITS = ['ml', 'g', 'kg', 'L', 'pcs', 'oz'];
const GST_RATES = [0, 5, 12, 18, 28];
const TABS = ['Basic Info', 'Formulation', 'Variants', 'Costing', 'Packaging', 'Marketplace', 'R&D'];
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
  standardAssumptions: { equipmentPct: 3, consumablesPct: 1, storagePct: 2, housekeepingPct: 1, adminPct: 5, wastagePct: 2 },
  rnd: { testing: 0, consumables: 0, samples: 0, overhead: 0, otherOverhead: 0, qc: 0, lifecycle: 1000, docText: '', researchGuide: '', procedure: '' },
  productionOverhead: { electricity: 0, labor: 0, labTesting: 0, other: 0 },
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

// ─── Formulation cost calculator ──────────────────────────────────────────────
function calcFormCost(product) {
  if (!product?.formulation?.rows?.length) return 0;
  return product.formulation.rows.reduce((sum, r) => sum + ((r.costPerKg || 0) * (r.percentage || 0) / 100), 0);
}

function calcTotalCostPerUnit(product) {
  if (!product) return 0;
  const refW = product.formulation?.refWeight || 100;
  const formCost = calcFormCost(product) * refW / 1000;
  const sa = product.standardAssumptions || {};
  const overheadPct = ((sa.equipmentPct || 0) + (sa.consumablesPct || 0) + (sa.storagePct || 0) +
    (sa.housekeepingPct || 0) + (sa.adminPct || 0) + (sa.wastagePct || 0)) / 100;
  const rnd = product.rnd || {};
  const lifecycle = rnd.lifecycle || 1000;
  const rndTotal = ((rnd.testing || 0) + (rnd.consumables || 0) + (rnd.samples || 0) +
    (rnd.overhead || 0) + (rnd.otherOverhead || 0) + (rnd.qc || 0));
  const rndPerUnit = lifecycle > 0 ? rndTotal / lifecycle : 0;
  const po = product.productionOverhead || {};
  const prodOverhead = (po.electricity || 0) + (po.labor || 0) + (po.labTesting || 0) + (po.other || 0);
  const pkg = product.packaging || {};
  const pkgCost = (pkg.items || []).filter(i => !i.optional).reduce((s, i) => s + (i.amount || i.qty * i.rate || 0), 0)
    + (pkg.charges?.machine || 0) + (pkg.charges?.shrinkWrap || 0) + (pkg.charges?.other || 0);
  return formCost * (1 + overheadPct) + rndPerUnit + prodOverhead + pkgCost;
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function ProductCatalogPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('Active');
  const [selectedId, setSelectedId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [activeTab, setActiveTab] = useState('Basic Info');
  const [form, setForm] = useState(emptyForm());
  const [importing, setImporting] = useState(false);

  const { data: listData, isLoading, isError } = useQuery({
    queryKey: ['catalog', search, categoryFilter, statusFilter],
    queryFn: () => api.get('/catalog/products', { params: { search: search || undefined, category: categoryFilter || undefined, status: statusFilter || undefined } }).then(r => r.data),
    staleTime: 10000,
    retry: 1,
  });

  // Fallback to localStorage when backend unavailable
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
    if (lsAll) {
      return lsAll.filter(p => {
        if (search && !p.name?.toLowerCase().includes(search.toLowerCase()) && !p.code?.toLowerCase().includes(search.toLowerCase())) return false;
        if (categoryFilter && p.category !== categoryFilter) return false;
        if (statusFilter && p.status !== statusFilter) return false;
        return true;
      });
    }
    return listData?.products || [];
  }, [listData, lsAll, search, categoryFilter, statusFilter]);

  // Auto-import from localStorage if backend catalog is empty
  const autoImportedRef = React.useRef(false);
  useEffect(() => {
    if (!isLoading && !isError && products.length === 0 && !autoImportedRef.current && !search && !categoryFilter) {
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

  function openCreate() { setForm(emptyForm()); setEditingProduct(null); setActiveTab('Basic Info'); setShowForm(true); }
  function openEdit(p) { setForm({ ...emptyForm(), ...p, formulation: p.formulation || { refWeight: p.weight || 100, refUnit: p.unit || 'ml', rows: [] } }); setEditingProduct(p); setActiveTab('Basic Info'); setShowForm(true); }
  function closeForm() { setShowForm(false); setEditingProduct(null); }

  function setF(field, val) { setForm(f => ({ ...f, [field]: val })); }

  function saveBasicInfo() {
    if (!form.code || !form.name || !form.category) { toast.error('Fill code, name and category'); return; }
    if (editingProduct) { updateMutation.mutate({ id: editingProduct._id, data: form }); }
    else { createMutation.mutate(form); }
  }

  function exportCSV() {
    const headers = ['Code','Name','Category','Sub Category','Type','Unit','Weight','GST Rate (%)','HSN Code','Shelf Life','Status','Description','Storage','Certifications','Barcode'];
    const rows = products.map(p => [
      p.code, p.name, p.category, p.subCategory || '', p.type || '',
      p.unit, p.weight || '', p.gstRate || 0, p.hsnCode || '',
      p.shelfLife || '', p.status, p.description || '',
      p.storage || '', p.certifications || '', p.barcode || '',
    ]);
    const csv = [headers, ...rows]
      .map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `product-catalog-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
    toast.success(`Exported ${products.length} products`);
  }

  // Import from localStorage
  async function importFromLocalStorage() {
    try {
      const raw = localStorage.getItem('productCatalogDB_v2');
      if (!raw) { toast.error('No catalog data found in localStorage'); return; }
      const data = JSON.parse(raw);
      const products = data.products || [];
      if (!products.length) { toast.error('No products to import'); return; }
      setImporting(true);
      const res = await api.post('/catalog/import', { products });
      qc.invalidateQueries({ queryKey: ['catalog'] });
      toast.success(`Imported ${res.data?.data?.created || 0} products, skipped ${res.data?.data?.skipped || 0} duplicates`);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Import failed');
    } finally { setImporting(false); }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  const { data: statsData } = useQuery({
    queryKey: ['catalog', 'stats'],
    queryFn: () => api.get('/catalog/stats').then(r => r.data),
    staleTime: 15000,
  });
  const stats = statsData || { total: 0, active: 0, discontinued: 0, byCategory: [] };

  // ── when selecting a product, sync form for tab editing ──────────────────────
  useEffect(() => {
    if (detail && !showForm) {
      setForm({ ...emptyForm(), ...detail });
    }
  }, [detail?._id]);

  return (
    <div className="flex h-full" style={{ minHeight: 'calc(100vh - 64px)' }}>

      {/* ── LEFT: Product List ─────────────────────────────────────────────── */}
      <div className={clsx('flex flex-col border-r border-gray-200 dark:border-[#1b2e4a] bg-white dark:bg-[#070c17]', selectedId ? 'w-80 flex-shrink-0' : 'flex-1')}>

        {/* Stats Dashboard */}
        {!selectedId && (
          <div className="border-b border-gray-200 dark:border-[#1b2e4a]">
            <div className="grid grid-cols-3 gap-px bg-gray-200 dark:bg-[#1b2e4a]">
              {[
                { label: 'Total', value: stats.total, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-white dark:bg-[#070c17]' },
                { label: 'Active', value: stats.active, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-white dark:bg-[#070c17]' },
                { label: 'Discontinued', value: stats.discontinued, color: 'text-red-500 dark:text-red-400', bg: 'bg-white dark:bg-[#070c17]' },
              ].map(s => (
                <div key={s.label} className={`${s.bg} text-center py-3`}>
                  <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400">{s.label}</p>
                </div>
              ))}
            </div>
            {stats.byCategory?.length > 0 && (
              <div className="px-4 py-2.5 flex flex-wrap gap-1.5">
                {stats.byCategory.map(c => (
                  <button key={c._id} onClick={() => setCategoryFilter(c._id === categoryFilter ? '' : c._id)}
                    className={clsx('text-[10px] px-2 py-0.5 rounded-full font-medium border transition-colors',
                      categoryFilter === c._id
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'border-gray-200 dark:border-[#1b2e4a] text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400'
                    )}>
                    {c._id} <span className="opacity-70">({c.count})</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200 dark:border-[#1b2e4a] space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-gray-900 dark:text-white text-sm">Product Catalog</h2>
            <div className="flex gap-1.5">
              <button onClick={exportCSV} disabled={products.length === 0} title="Export CSV" className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 dark:border-[#1b2e4a] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#0f1a2e] font-semibold transition-colors disabled:opacity-40 flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                Export
              </button>
              <button onClick={importFromLocalStorage} disabled={importing} className="text-xs px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 font-semibold hover:bg-amber-100 disabled:opacity-50 transition-colors">
                {importing ? 'Importing…' : '📥 Import'}
              </button>
              <button onClick={openCreate} className="text-xs px-2.5 py-1 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors">+ Add</button>
            </div>
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, SKU…" className="input text-xs w-full" />
          <div className="flex gap-2">
            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="input text-xs flex-1">
              <option value="">All Categories</option>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input text-xs w-28">
              <option value="">All</option>
              <option value="Active">Active</option>
              <option value="Discontinued">Discontinued</option>
            </select>
          </div>
          <p className="text-[10px] text-gray-400">{products.length} products</p>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
          ) : products.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <p className="text-3xl mb-2">📦</p>
              <p className="text-sm">No products found</p>
              <p className="text-xs mt-1">Use <strong>Import</strong> to pull from your existing catalog</p>
            </div>
          ) : (
            products.map(p => (
              <button
                key={p._id}
                onClick={() => { setSelectedId(p._id); setActiveTab('Basic Info'); }}
                className={clsx(
                  'w-full flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-[#1b2e4a] hover:bg-gray-50 dark:hover:bg-[#0f1a2e] text-left transition-colors',
                  selectedId === p._id && 'bg-blue-50 dark:bg-blue-900/20 border-l-2 border-l-blue-500'
                )}
              >
                {p.image ? (
                  <img src={p.image} alt={p.name} className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border border-gray-200 dark:border-[#1b2e4a]" />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/30 dark:to-purple-900/30 flex items-center justify-center flex-shrink-0 text-lg">🧴</div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">{p.name}</p>
                  <p className="text-[10px] text-gray-400 truncate">{p.code} · {p.category}</p>
                </div>
                <span className={clsx('text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0', p.status === 'Active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-500')}>{p.status}</span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── RIGHT: Detail Panel ────────────────────────────────────────────── */}
      {selectedId && detail && (
        <div className="flex-1 flex flex-col bg-gray-50 dark:bg-[#050b14] overflow-hidden">
          {/* Detail Header */}
          <div className="px-6 py-4 bg-white dark:bg-[#070c17] border-b border-gray-200 dark:border-[#1b2e4a] flex items-center gap-4">
            {/* Image */}
            <div className="relative group flex-shrink-0">
              {detail.image ? (
                <img src={detail.image} alt={detail.name} className="w-16 h-16 rounded-xl object-cover border border-gray-200 dark:border-[#1b2e4a]" />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/30 dark:to-purple-900/30 flex items-center justify-center text-2xl">🧴</div>
              )}
              <label className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-xl opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                <input type="file" accept="image/*" className="hidden" onChange={e => { if (e.target.files[0]) imgMutation.mutate({ id: detail._id, file: e.target.files[0] }); }} />
                <span className="text-white text-xs">📷</span>
              </label>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-gray-900 dark:text-white truncate">{detail.name}</h2>
              <p className="text-xs text-gray-400">{detail.code} · {detail.category} · {detail.unit}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button onClick={() => openEdit(detail)} className="text-xs px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-semibold hover:bg-blue-100 transition-colors">✏️ Edit</button>
              <button onClick={() => { if (window.confirm('Delete ' + detail.name + '?')) deleteMutation.mutate(detail._id); }} className="text-xs px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-500 font-semibold hover:bg-red-100 transition-colors">🗑️</button>
              <button onClick={() => setSelectedId(null)} className="text-gray-400 hover:text-gray-600 p-1">✕</button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-0 px-6 pt-3 bg-white dark:bg-[#070c17] border-b border-gray-200 dark:border-[#1b2e4a] overflow-x-auto">
            {TABS.map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} className={clsx('px-3 py-2 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors', activeTab === tab ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-400 hover:text-gray-600')}>
                {tab}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'Basic Info' && <BasicInfoTab product={detail} />}
            {activeTab === 'Formulation' && <FormulationTab product={detail} form={form} setForm={setForm} onSave={() => updateMutation.mutate({ id: detail._id, data: { formulation: form.formulation } })} isPending={isPending} />}
            {activeTab === 'Variants' && <VariantsTab product={detail} form={form} setForm={setForm} onSave={() => updateMutation.mutate({ id: detail._id, data: { variants: form.variants } })} isPending={isPending} />}
            {activeTab === 'Costing' && <CostingTab product={detail} form={form} setForm={setForm} onSave={() => updateMutation.mutate({ id: detail._id, data: { costing: form.costing, standardAssumptions: form.standardAssumptions, productionOverhead: form.productionOverhead } })} isPending={isPending} />}
            {activeTab === 'Packaging' && <PackagingTab product={detail} form={form} setForm={setForm} onSave={() => updateMutation.mutate({ id: detail._id, data: { packaging: form.packaging } })} isPending={isPending} />}
            {activeTab === 'Marketplace' && <MarketplaceTab product={detail} form={form} setForm={setForm} onSave={() => updateMutation.mutate({ id: detail._id, data: { marketplace: form.marketplace } })} isPending={isPending} />}
            {activeTab === 'R&D' && <RndTab product={detail} form={form} setForm={setForm} onSave={() => updateMutation.mutate({ id: detail._id, data: { rnd: form.rnd } })} isPending={isPending} />}
          </div>
        </div>
      )}

      {!selectedId && !isLoading && products.length > 0 && (
        <div className="flex-1 flex items-center justify-center text-gray-300 dark:text-gray-600">
          <div className="text-center">
            <p className="text-5xl mb-3">📦</p>
            <p className="text-sm">Select a product to view details</p>
          </div>
        </div>
      )}

      {/* ── Add/Edit Form Modal ────────────────────────────────────────────── */}
      {showForm && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeForm} />
          <div className="relative bg-white dark:bg-[#070c17] rounded-2xl shadow-2xl w-full max-w-2xl border border-gray-200 dark:border-[#1b2e4a] max-h-[90vh] flex flex-col">
            <div className="p-5 border-b border-gray-200 dark:border-[#1b2e4a] flex items-center justify-between">
              <h3 className="font-bold text-gray-900 dark:text-white">{editingProduct ? '✏️ Edit Product' : '+ New Product'}</h3>
              <button onClick={closeForm} className="text-gray-400 hover:text-gray-600 p-1">✕</button>
            </div>
            <div className="p-5 overflow-y-auto space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">SKU / Code *</label><input value={form.code} onChange={e => setF('code', e.target.value.toUpperCase())} className="input" placeholder="e.g. FG-HC-001" /></div>
                <div><label className="label">Product Name *</label><input value={form.name} onChange={e => setF('name', e.target.value)} className="input" placeholder="e.g. Turmeric Shampoo" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Category *</label>
                  <select value={form.category} onChange={e => setF('category', e.target.value)} className="input">
                    <option value="">Select…</option>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div><label className="label">Sub Category</label><input value={form.subCategory} onChange={e => setF('subCategory', e.target.value)} className="input" placeholder="e.g. Shampoo" /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="label">Unit</label>
                  <select value={form.unit} onChange={e => setF('unit', e.target.value)} className="input">
                    {UNITS.map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
                <div><label className="label">Ref. Weight</label><input type="number" value={form.weight} onChange={e => setF('weight', e.target.value)} className="input" placeholder="200" /></div>
                <div><label className="label">GST %</label>
                  <select value={form.gstRate} onChange={e => setF('gstRate', Number(e.target.value))} className="input">
                    {GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="label">HSN Code</label><input value={form.hsnCode} onChange={e => setF('hsnCode', e.target.value)} className="input" placeholder="3305" /></div>
                <div><label className="label">Shelf Life (months)</label><input type="number" value={form.shelfLife} onChange={e => setF('shelfLife', e.target.value)} className="input" placeholder="36" /></div>
                <div><label className="label">Status</label>
                  <select value={form.status} onChange={e => setF('status', e.target.value)} className="input">
                    <option value="Active">Active</option>
                    <option value="Discontinued">Discontinued</option>
                  </select>
                </div>
              </div>
              <div><label className="label">Description</label><textarea value={form.description} onChange={e => setF('description', e.target.value)} rows={2} className="input resize-none" placeholder="Product description…" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Storage Conditions</label><input value={form.storage} onChange={e => setF('storage', e.target.value)} className="input" placeholder="Cool, dry place" /></div>
                <div><label className="label">Certifications</label><input value={form.certifications} onChange={e => setF('certifications', e.target.value)} className="input" placeholder="Organic, Cruelty-Free" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Barcode</label><input value={form.barcode} onChange={e => setF('barcode', e.target.value)} className="input" placeholder="8901234567890" /></div>
                <div><label className="label">Type</label><input value={form.type} onChange={e => setF('type', e.target.value)} className="input" placeholder="e.g. Shampoo" /></div>
              </div>
            </div>
            <div className="p-5 border-t border-gray-200 dark:border-[#1b2e4a] flex gap-3">
              <button onClick={closeForm} className="btn-secondary flex-1 justify-center">Cancel</button>
              <button onClick={saveBasicInfo} disabled={isPending} className="btn-primary flex-1 justify-center disabled:opacity-50">
                {isPending ? 'Saving…' : editingProduct ? 'Update' : 'Create Product'}
              </button>
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  );
}

// ─── Basic Info Tab ────────────────────────────────────────────────────────────
function BasicInfoTab({ product: p }) {
  const cost = calcTotalCostPerUnit(p).toFixed(2);
  return (
    <div className="grid grid-cols-2 gap-6">
      <div className="space-y-3">
        <InfoRow label="SKU" value={p.code} mono />
        <InfoRow label="Name" value={p.name} />
        <InfoRow label="Category" value={p.category} />
        <InfoRow label="Sub Category" value={p.subCategory} />
        <InfoRow label="Type" value={p.type} />
        <InfoRow label="Unit" value={p.unit} />
        <InfoRow label="Reference Weight" value={p.weight ? `${p.weight} ${p.unit}` : '—'} />
      </div>
      <div className="space-y-3">
        <InfoRow label="GST Rate" value={`${p.gstRate}%`} />
        <InfoRow label="HSN Code" value={p.hsnCode} mono />
        <InfoRow label="Shelf Life" value={p.shelfLife ? `${p.shelfLife} months` : '—'} />
        <InfoRow label="Status" value={p.status} badge={p.status === 'Active' ? 'green' : 'gray'} />
        <InfoRow label="Storage" value={p.storage} />
        <InfoRow label="Certifications" value={p.certifications} />
        <InfoRow label="Barcode" value={p.barcode} mono />
        <InfoRow label="Est. Cost / Unit" value={cost > 0 ? `₹${cost}` : '—'} badge="blue" />
      </div>
      {p.description && (
        <div className="col-span-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Description</p>
          <p className="text-sm text-gray-700 dark:text-gray-300">{p.description}</p>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value, mono, badge }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-400 w-28 flex-shrink-0">{label}</span>
      {badge ? (
        <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', badge === 'green' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : badge === 'blue' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-gray-100 text-gray-500')}>{value}</span>
      ) : (
        <span className={clsx('text-xs text-gray-800 dark:text-gray-200', mono && 'font-mono')}>{value}</span>
      )}
    </div>
  );
}

// ─── Formulation Tab ───────────────────────────────────────────────────────────
function FormulationTab({ product, form, setForm, onSave, isPending }) {
  const rows = form.formulation?.rows || [];
  const totalPct = rows.reduce((s, r) => s + (Number(r.percentage) || 0), 0);
  const formCost = calcFormCost({ formulation: form.formulation });

  function addRow() {
    setForm(f => ({ ...f, formulation: { ...f.formulation, rows: [...(f.formulation?.rows || []), { name: '', percentage: 0, quantity: 0, unit: 'g', costPerKg: 0 }] } }));
  }
  function updateRow(i, field, val) {
    setForm(f => {
      const rows = [...(f.formulation?.rows || [])];
      rows[i] = { ...rows[i], [field]: val };
      return { ...f, formulation: { ...f.formulation, rows } };
    });
  }
  function removeRow(i) {
    setForm(f => ({ ...f, formulation: { ...f.formulation, rows: (f.formulation?.rows || []).filter((_, idx) => idx !== i) } }));
  }

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
                <td className="px-3 py-1.5"><input value={r.name} onChange={e => updateRow(i, 'name', e.target.value)} className="input text-xs w-36" placeholder="Ingredient name" /></td>
                <td className="px-3 py-1.5"><input type="number" value={r.percentage} onChange={e => updateRow(i, 'percentage', e.target.value)} className="input text-xs w-16" /></td>
                <td className="px-3 py-1.5"><span className="text-gray-500">{numF((form.formulation?.refWeight || 100) * (r.percentage || 0) / 100, 2)}</span></td>
                <td className="px-3 py-1.5"><input type="number" value={r.costPerKg} onChange={e => updateRow(i, 'costPerKg', e.target.value)} className="input text-xs w-20" /></td>
                <td className="px-3 py-1.5 text-blue-600 font-mono">₹{numF((r.costPerKg || 0) * (r.percentage || 0) / 100)}</td>
                <td className="px-3 py-1.5"><button onClick={() => removeRow(i)} className="text-red-400 hover:text-red-600">✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-3">
        <button onClick={addRow} className="btn-secondary text-sm">+ Add Ingredient</button>
        <button onClick={onSave} disabled={isPending} className="btn-primary text-sm disabled:opacity-50 ml-auto">{isPending ? 'Saving…' : '💾 Save Formulation'}</button>
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
  const costPerUnit = calcTotalCostPerUnit({ ...product, ...form });
  const margins = form.costing?.margins || {};
  const sa = form.standardAssumptions || {};
  const po = form.productionOverhead || {};

  function setSA(f, v) { setForm(prev => ({ ...prev, standardAssumptions: { ...prev.standardAssumptions, [f]: Number(v) } })); }
  function setPO(f, v) { setForm(prev => ({ ...prev, productionOverhead: { ...prev.productionOverhead, [f]: Number(v) } })); }
  function setMargin(f, v) { setForm(prev => ({ ...prev, costing: { ...prev.costing, margins: { ...prev.costing?.margins, [f]: Number(v) } } })); }

  function priceAtMargin(cost, pct) { return pct > 0 ? (cost / (1 - pct / 100)) : cost; }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-5">
        {/* Standard Assumptions */}
        <div className="rounded-xl border border-gray-200 dark:border-[#1b2e4a] p-4">
          <p className="text-xs font-bold text-gray-600 dark:text-gray-300 mb-3">Standard Overhead %</p>
          {[['equipmentPct', 'Equipment'], ['consumablesPct', 'Consumables'], ['storagePct', 'Storage'], ['housekeepingPct', 'Housekeeping'], ['adminPct', 'Admin'], ['wastagePct', 'Wastage']].map(([f, label]) => (
            <div key={f} className="flex items-center gap-3 mb-2">
              <label className="text-xs text-gray-500 w-28">{label}</label>
              <input type="number" step="0.1" value={sa[f] || 0} onChange={e => setSA(f, e.target.value)} className="input text-xs w-20" />
              <span className="text-xs text-gray-400">%</span>
            </div>
          ))}
        </div>
        {/* Production Overhead */}
        <div className="rounded-xl border border-gray-200 dark:border-[#1b2e4a] p-4">
          <p className="text-xs font-bold text-gray-600 dark:text-gray-300 mb-3">Production Overhead (₹ per batch)</p>
          {[['electricity', 'Electricity'], ['labor', 'Labor'], ['labTesting', 'Lab Testing'], ['other', 'Other']].map(([f, label]) => (
            <div key={f} className="flex items-center gap-3 mb-2">
              <label className="text-xs text-gray-500 w-28">{label}</label>
              <input type="number" value={po[f] || 0} onChange={e => setPO(f, e.target.value)} className="input text-xs w-24" />
            </div>
          ))}
        </div>
      </div>

      {/* Cost summary */}
      <div className="rounded-xl bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800/40 p-4">
        <p className="text-xs font-bold text-blue-700 dark:text-blue-300 mb-2">Estimated Cost / Unit: <span className="text-lg">₹{numF(costPerUnit)}</span></p>
      </div>

      {/* Margins */}
      <div className="rounded-xl border border-gray-200 dark:border-[#1b2e4a] p-4">
        <p className="text-xs font-bold text-gray-600 dark:text-gray-300 mb-3">Selling Price at Margin</p>
        <div className="grid grid-cols-2 gap-3">
          {[['exFactory', 'Ex-Factory'], ['dealer', 'Dealer'], ['distributor', 'Distributor'], ['retailer', 'Retailer'], ['selling', 'Selling Price'], ['b2b', 'B2B'], ['b2c', 'B2C']].map(([f, label]) => (
            <div key={f} className="flex items-center gap-2">
              <label className="text-xs text-gray-500 w-24">{label}</label>
              <input type="number" value={margins[f] || 0} onChange={e => setMargin(f, e.target.value)} className="input text-xs w-16" />
              <span className="text-xs text-gray-400">%</span>
              <span className="text-xs font-mono text-green-600 dark:text-green-400 ml-1">= ₹{numF(priceAtMargin(costPerUnit, margins[f] || 0))}</span>
            </div>
          ))}
        </div>
      </div>

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
  const costPerUnit = calcTotalCostPerUnit({ ...product, ...form });
  const margins = form.marketplace?.margins || {};
  const fees = form.marketplace?.fees || {};

  function setFee(platform, field, val) {
    setForm(prev => ({ ...prev, marketplace: { ...prev.marketplace, fees: { ...prev.marketplace?.fees, [platform]: { ...prev.marketplace?.fees?.[platform], [field]: Number(val) } } } }));
  }
  function setMgn(platform, val) {
    setForm(prev => ({ ...prev, marketplace: { ...prev.marketplace, margins: { ...prev.marketplace?.margins, [platform]: Number(val) } } }));
  }

  function calcPlatform(p) {
    const f = fees[p] || {};
    const margin = margins[p] || 0;
    const sellingPrice = margin > 0 ? costPerUnit / (1 - margin / 100) : costPerUnit;
    const totalFees = (sellingPrice * ((f.commission || 0) / 100)) + (f.fixed || 0) + (f.shipping || 0) + (f.collection || 0) + (f.fba || 0) + (f.penalty || 0);
    const netRevenue = sellingPrice - totalFees;
    const profit = netRevenue - costPerUnit;
    return { sellingPrice, totalFees, netRevenue, profit };
  }

  const FEE_FIELDS = {
    flipkart: [['commission', 'Commission %'], ['fixed', 'Fixed (₹)'], ['shipping', 'Shipping (₹)'], ['collection', 'Collection %']],
    amazon: [['commission', 'Commission %'], ['fixed', 'Fixed (₹)'], ['shipping', 'Shipping (₹)'], ['fba', 'FBA %']],
    meesho: [['commission', 'Commission %'], ['shipping', 'Shipping (₹)'], ['collection', 'Collection %'], ['penalty', 'Penalty %']],
    snapdeal: [['commission', 'Commission %'], ['fixed', 'Fixed (₹)'], ['shipping', 'Shipping (₹)'], ['collection', 'Collection %']],
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {PLATFORMS.map(p => {
          const calc = calcPlatform(p);
          return (
            <div key={p} className="rounded-xl border border-gray-200 dark:border-[#1b2e4a] p-4">
              <p className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-3">{PLATFORM_ICONS[p]} {p.charAt(0).toUpperCase() + p.slice(1)}</p>
              <div className="flex items-center gap-2 mb-3">
                <label className="text-xs text-gray-500 w-20">Margin %</label>
                <input type="number" value={margins[p] || 0} onChange={e => setMgn(p, e.target.value)} className="input text-xs w-16" />
              </div>
              {(FEE_FIELDS[p] || []).map(([f, label]) => (
                <div key={f} className="flex items-center gap-2 mb-2">
                  <label className="text-xs text-gray-500 w-20">{label}</label>
                  <input type="number" value={fees[p]?.[f] || 0} onChange={e => setFee(p, f, e.target.value)} className="input text-xs w-16" />
                </div>
              ))}
              <div className="mt-3 pt-2 border-t border-gray-100 dark:border-[#1b2e4a] space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-gray-400">Selling Price</span><span className="font-mono text-gray-700 dark:text-gray-300">₹{numF(calc.sellingPrice)}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Platform Fees</span><span className="font-mono text-red-500">-₹{numF(calc.totalFees)}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Net Revenue</span><span className="font-mono text-gray-700 dark:text-gray-300">₹{numF(calc.netRevenue)}</span></div>
                <div className="flex justify-between font-semibold"><span className={calc.profit >= 0 ? 'text-green-600' : 'text-red-500'}>Profit</span><span className={clsx('font-mono', calc.profit >= 0 ? 'text-green-600' : 'text-red-500')}>₹{numF(calc.profit)}</span></div>
              </div>
            </div>
          );
        })}
      </div>
      <button onClick={onSave} disabled={isPending} className="btn-primary text-sm disabled:opacity-50">{isPending ? 'Saving…' : '💾 Save Marketplace'}</button>
    </div>
  );
}

// ─── R&D Tab ───────────────────────────────────────────────────────────────────
function RndTab({ product, form, setForm, onSave, isPending }) {
  const rnd = form.rnd || {};
  const lifecycle = rnd.lifecycle || 1000;
  const total = (rnd.testing || 0) + (rnd.consumables || 0) + (rnd.samples || 0) + (rnd.overhead || 0) + (rnd.otherOverhead || 0) + (rnd.qc || 0);
  const perUnit = lifecycle > 0 ? total / lifecycle : 0;

  function setR(f, v) { setForm(prev => ({ ...prev, rnd: { ...prev.rnd, [f]: v } })); }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-gray-200 dark:border-[#1b2e4a] p-4 space-y-3">
          <p className="text-xs font-bold text-gray-600 dark:text-gray-300">R&D Costs (₹)</p>
          {[['testing', 'Testing'], ['consumables', 'Consumables'], ['samples', 'Samples'], ['overhead', 'Overhead'], ['otherOverhead', 'Other Overhead'], ['qc', 'QC']].map(([f, label]) => (
            <div key={f} className="flex items-center gap-3">
              <label className="text-xs text-gray-500 w-28">{label}</label>
              <input type="number" value={rnd[f] || 0} onChange={e => setR(f, Number(e.target.value))} className="input text-xs w-24" />
            </div>
          ))}
          <div className="flex items-center gap-3">
            <label className="text-xs text-gray-500 w-28">Product Lifecycle (units)</label>
            <input type="number" value={rnd.lifecycle || 1000} onChange={e => setR('lifecycle', Number(e.target.value))} className="input text-xs w-24" />
          </div>
          <div className="pt-2 border-t border-gray-100 dark:border-[#1b2e4a]">
            <p className="text-xs text-gray-400">Total R&D: <span className="text-blue-600 font-semibold">₹{numF(total)}</span></p>
            <p className="text-xs text-gray-400 mt-0.5">Per Unit: <span className="text-green-600 font-semibold">₹{numF(perUnit)}</span></p>
          </div>
        </div>
        <div className="space-y-3">
          <div><label className="label">R&D Documentation</label><textarea value={rnd.docText || ''} onChange={e => setR('docText', e.target.value)} rows={4} className="input resize-none text-xs" placeholder="Research notes, formulation history, test results…" /></div>
          <div><label className="label">Research Guide & References</label><textarea value={rnd.researchGuide || ''} onChange={e => setR('researchGuide', e.target.value)} rows={3} className="input resize-none text-xs" placeholder="Literature sources, patent references, safety assessments…" /></div>
        </div>
      </div>
      <div><label className="label">Manufacturing Procedure</label><textarea value={rnd.procedure || ''} onChange={e => setR('procedure', e.target.value)} rows={6} className="input resize-none text-sm" placeholder="Step-by-step manufacturing procedure…" /></div>
      <button onClick={onSave} disabled={isPending} className="btn-primary text-sm disabled:opacity-50">{isPending ? 'Saving…' : '💾 Save R&D'}</button>
    </div>
  );
}
