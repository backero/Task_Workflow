import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import api from '../../api/axios';

const LS_KEY = 'rawMaterialDB_v8';
const CATEGORIES = ['All', 'Active Ingredients', 'Butters', 'Chemicals', 'Essential Oil', 'Hydrosol', 'Preservatives', 'Raw Materials', 'Raw chemicals', 'Surfactants', 'Vitamins'];

function totalStock(m) { return (m.batches || []).reduce((s, b) => s + (Number(b.quantity) || 0), 0); }
function stockStatus(m) {
  if (m._status) return m._status;
  const qty = totalStock(m);
  if (qty <= 0) return 'Out';
  if (m.enableMinStock && qty <= (m.minStockLevel || 0)) return 'Low';
  return 'In';
}
function statusColor(s) {
  if (s === 'Out') return 'bg-red-100 text-red-700';
  if (s === 'Low') return 'bg-amber-100 text-amber-700';
  return 'bg-emerald-100 text-emerald-700';
}

const emptyMat = () => ({
  code: '', name: '', hsnCode: '', category: 'Raw Materials', supplier: '', location: '',
  unit: 'kg', unitPrice: '', gstRate: 18, enableMinStock: false, minStockLevel: '',
  qcPassed: false, qcChecker: '', qcNotes: '', batches: [],
});
const emptyBatch = () => ({
  batchId: `BATCH-${Date.now()}`, batchNumber: '', quantity: '', price: '',
  receivedDate: '', expiryDate: '', notes: '',
});

export default function RawMaterialsPage() {
  const qc = useQueryClient();
  const [search, setSearch]             = useState('');
  const [catFilter, setCatFilter]       = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedId, setSelectedId]     = useState(null);
  const [showForm, setShowForm]         = useState(false);
  const [editMat, setEditMat]           = useState(null);
  const [form, setForm]                 = useState(emptyMat());
  const [batchForm, setBatchForm]       = useState(null);
  const [batchData, setBatchData]       = useState(emptyBatch());
  const [expandedBatches, setExpandedBatches] = useState(false);
  const autoMigratedRef = useRef(false);

  // ── Fetch list ──────────────────────────────────────────────────────────────
  const { data, isLoading, isError } = useQuery({
    queryKey: ['rawmaterials', search, catFilter, statusFilter],
    queryFn: () => api.get('/rawmaterials', {
      params: {
        search:   search   || undefined,
        category: (catFilter   !== 'All') ? catFilter   : undefined,
        status:   (statusFilter !== 'All') ? statusFilter : undefined,
      },
    }).then(r => r.data),
    staleTime: 10000,
    retry: 1,
  });

  // ── Fallback to localStorage when backend unavailable ───────────────────────
  const lsAll = useMemo(() => {
    if (!isError) return null;
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return [];
      const { materials: items = [] } = JSON.parse(raw);
      return items.map(m => ({ ...m, _totalStock: totalStock(m), _status: stockStatus(m) }));
    } catch { return []; }
  }, [isError]);

  const materials = useMemo(() => {
    if (lsAll) {
      return lsAll.filter(m => {
        if (search && !m.name?.toLowerCase().includes(search.toLowerCase()) &&
            !m.code?.toLowerCase().includes(search.toLowerCase()) &&
            !m.supplier?.toLowerCase().includes(search.toLowerCase())) return false;
        if (catFilter !== 'All' && m.category !== catFilter) return false;
        if (statusFilter !== 'All' && stockStatus(m) !== statusFilter) return false;
        return true;
      });
    }
    return data?.materials || [];
  }, [data, lsAll, search, catFilter, statusFilter]);

  // ── Auto-migrate from localStorage on first empty load ──────────────────────
  useEffect(() => {
    if (!isLoading && !isError && materials.length === 0 && !autoMigratedRef.current && !search && catFilter === 'All') {
      autoMigratedRef.current = true;
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return;
        const { materials: lsItems = [] } = JSON.parse(raw);
        if (!lsItems.length) return;
        api.post('/rawmaterials/import', { materials: lsItems })
          .then(res => {
            qc.invalidateQueries({ queryKey: ['rawmaterials'] });
            const { created = 0 } = res.data?.data || res.data || {};
            if (created > 0) toast.success(`Synced ${created} raw materials to cloud`);
          })
          .catch(() => {});
      } catch {}
    }
  }, [isLoading, isError, materials.length]);

  // ── Stats query ─────────────────────────────────────────────────────────────
  const { data: statsData } = useQuery({
    queryKey: ['rawmaterials', 'stats'],
    queryFn: () => api.get('/rawmaterials/stats').then(r => r.data),
    staleTime: 15000,
    enabled: !isError,
  });
  const stats = useMemo(() => {
    if (lsAll) {
      const statuses = lsAll.map(m => stockStatus(m));
      return { total: lsAll.length, inStock: statuses.filter(s => s === 'In').length, low: statuses.filter(s => s === 'Low').length, out: statuses.filter(s => s === 'Out').length };
    }
    return statsData?.data || statsData || { total: 0, inStock: 0, low: 0, out: 0 };
  }, [lsAll, statsData]);

  // ── Mutations ────────────────────────────────────────────────────────────────
  const createMut = useMutation({
    mutationFn: data => api.post('/rawmaterials', data),
    onSuccess: () => { invalidate(); toast.success('Added'); closeForm(); },
    onError: e => toast.error(e?.response?.data?.message || 'Failed to add'),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => api.put(`/rawmaterials/${id}`, data),
    onSuccess: () => { invalidate(); toast.success('Updated'); closeForm(); },
    onError: e => toast.error(e?.response?.data?.message || 'Failed to update'),
  });
  const deleteMut = useMutation({
    mutationFn: id => api.delete(`/rawmaterials/${id}`),
    onSuccess: () => { invalidate(); toast.success('Deleted'); setSelectedId(null); },
    onError: () => toast.error('Failed to delete'),
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['rawmaterials'] });
  }

  const selected = materials.find(m => (m._id || m.id) === selectedId) || null;

  // ── local batch editing against selected ────────────────────────────────────
  const [localBatches, setLocalBatches] = useState([]);
  useEffect(() => { if (selected) setLocalBatches(selected.batches || []); }, [selectedId]);

  function openCreate() {
    const nextNum = String((data?.materials?.length || 0) + 1).padStart(4, '0');
    setForm({ ...emptyMat(), code: `RM-${nextNum}` });
    setEditMat(null); setShowForm(true);
  }
  function openEdit(m) { setForm({ ...emptyMat(), ...m }); setEditMat(m); setShowForm(true); }
  function closeForm() { setShowForm(false); setEditMat(null); }

  function saveMat() {
    if (!form.code || !form.name) { toast.error('Code and name are required'); return; }
    if (editMat) updateMut.mutate({ id: editMat._id || editMat.id, data: { ...form, batches: localBatches } });
    else createMut.mutate({ ...form });
  }

  function deleteMat(m) {
    if (!window.confirm('Delete this material?')) return;
    deleteMut.mutate(m._id || m.id);
  }

  function saveBatchesToServer(newBatches) {
    if (!selected) return;
    updateMut.mutate({ id: selected._id || selected.id, data: { ...selected, batches: newBatches } });
  }

  function openAddBatch() { setBatchData(emptyBatch()); setBatchForm(-1); }
  function openEditBatch(i) { setBatchData({ ...localBatches[i] }); setBatchForm(i); }

  function saveBatch() {
    if (!batchData.quantity) { toast.error('Quantity is required'); return; }
    const newBatches = [...localBatches];
    if (batchForm === -1) newBatches.push({ ...batchData, batchId: batchData.batchId || `BATCH-${Date.now()}` });
    else newBatches[batchForm] = batchData;
    setLocalBatches(newBatches);
    saveBatchesToServer(newBatches);
    setBatchForm(null);
  }

  function deleteBatch(i) {
    const newBatches = [...localBatches];
    newBatches.splice(i, 1);
    setLocalBatches(newBatches);
    saveBatchesToServer(newBatches);
  }

  // ── Export CSV ───────────────────────────────────────────────────────────────
  function exportCSV() {
    const allMats = data?.materials || [];
    const headers = ['Code','Name','Category','HSN Code','Supplier','Location','Unit','Unit Price (₹)','GST Rate (%)','Min Stock Enabled','Min Stock Level','QC Passed','QC Checker','Total Stock','Status'];
    const rows = allMats.map(m => [
      m.code, m.name, m.category, m.hsnCode || '',
      m.supplier || '', m.location || '', m.unit,
      m.unitPrice || 0, m.gstRate || 0,
      m.enableMinStock ? 'Yes' : 'No',
      m.enableMinStock ? (m.minStockLevel || 0) : '',
      m.qcPassed ? 'Yes' : 'No', m.qcChecker || '',
      totalStock(m), stockStatus(m),
    ]);
    const csv = [headers, ...rows]
      .map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `raw-materials-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
    toast.success(`Exported ${allMats.length} materials`);
  }

  const setF  = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setBF = (k, v) => setBatchData(b => ({ ...b, [k]: v }));

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full" style={{ minHeight: 'calc(100vh - 64px)' }}>

      {/* LEFT PANEL */}
      <div className={`flex flex-col border-r border-gray-200 bg-white ${selected ? 'w-[420px] flex-shrink-0' : 'flex-1'}`}>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2 p-3 border-b border-gray-200">
          {[
            { label: 'Total',    value: stats.total,   color: 'text-blue-600' },
            { label: 'In Stock', value: stats.inStock,  color: 'text-emerald-600' },
            { label: 'Low Stock',value: stats.low,     color: 'text-amber-600' },
            { label: 'Out',      value: stats.out,     color: 'text-red-600' },
          ].map(s => (
            <div key={s.label} className="text-center py-1.5 rounded-lg bg-gray-50">
              <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-gray-500">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="px-3 py-2 border-b border-gray-200 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-gray-900 text-sm">Raw Materials</h2>
            <div className="flex items-center gap-1.5">
              <button onClick={exportCSV} disabled={materials.length === 0} title="Export CSV"
                className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 font-semibold transition-colors disabled:opacity-40 flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                Export
              </button>
              <button onClick={openCreate} className="text-xs px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors">+ Add</button>
            </div>
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, code, supplier…" className="input text-xs w-full" />
          <div className="flex gap-2">
            <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className="input text-xs flex-1">
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input text-xs w-24">
              <option value="All">All Status</option>
              <option value="In">In Stock</option>
              <option value="Low">Low</option>
              <option value="Out">Out</option>
            </select>
          </div>
          <p className="text-[10px] text-gray-400">{materials.length} materials</p>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>
          ) : materials.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <p className="text-3xl mb-2">🧪</p>
              <p className="text-sm">No materials found</p>
            </div>
          ) : materials.map(m => {
            const qty = totalStock(m);
            const st  = stockStatus(m);
            const id  = m._id || m.id;
            return (
              <button key={id} onClick={() => { setSelectedId(id); setExpandedBatches(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 border-b border-gray-100 hover:bg-gray-50 text-left transition-colors ${selectedId === id ? 'bg-emerald-50 border-l-2 border-l-emerald-500' : ''}`}>
                <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center text-sm flex-shrink-0 font-bold text-emerald-700">
                  {m.name?.[0] || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-900 truncate">{m.name}</p>
                  <p className="text-[10px] text-gray-400">{m.code} · {m.category}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs font-semibold text-gray-700">{qty} {m.unit}</p>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${statusColor(st)}`}>{st}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* RIGHT DETAIL PANEL */}
      {selected ? (
        <div className="flex-1 overflow-y-auto bg-gray-50 p-4 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-base font-bold text-gray-900">{selected.name}</h2>
              <p className="text-xs text-gray-500">{selected.code} · {selected.category} · HSN: {selected.hsnCode || '—'}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => openEdit(selected)} className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-white font-semibold transition-colors">✏️ Edit</button>
              <button onClick={() => deleteMat(selected)} className="text-xs px-2.5 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 font-semibold transition-colors">🗑 Delete</button>
              <button onClick={() => setSelectedId(null)} className="text-xs px-2 py-1.5 rounded-lg text-gray-400 hover:text-gray-600">✕</button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Total Stock', value: `${totalStock(selected)} ${selected.unit}`, color: 'emerald' },
              { label: 'Unit Price',  value: `₹${selected.unitPrice || 0}/${selected.unit}`, color: 'blue' },
              { label: 'GST Rate',    value: `${selected.gstRate || 0}%`, color: 'purple' },
            ].map(c => (
              <div key={c.label} className={`rounded-xl p-3 bg-${c.color}-50 border border-${c.color}-100`}>
                <p className={`text-xs text-${c.color}-600 font-medium`}>{c.label}</p>
                <p className={`text-sm font-bold text-${c.color}-700 mt-0.5`}>{c.value}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-3.5 grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
            {[
              ['Supplier', selected.supplier], ['Location', selected.location],
              ['Min Stock', selected.enableMinStock ? `${selected.minStockLevel} ${selected.unit}` : 'Disabled'],
              ['QC', selected.qcPassed ? '✅ Passed' : '❌ Not passed'],
              ['QC Checker', selected.qcChecker], ['QC Ref', selected.qcNumber],
            ].map(([k, v]) => v ? (
              <div key={k}>
                <p className="text-gray-400 font-medium">{k}</p>
                <p className="text-gray-700 font-semibold">{v}</p>
              </div>
            ) : null)}
            {selected.qcNotes && (
              <div className="col-span-2">
                <p className="text-gray-400 font-medium">QC Notes</p>
                <p className="text-gray-700">{selected.qcNotes}</p>
              </div>
            )}
          </div>

          {/* Batches */}
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-gray-200">
              <button onClick={() => setExpandedBatches(e => !e)} className="text-xs font-bold text-gray-700 flex items-center gap-1">
                📦 Batches ({localBatches.length}) {expandedBatches ? '▲' : '▼'}
              </button>
              <button onClick={openAddBatch} className="text-xs px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-semibold hover:bg-emerald-100 transition-colors">+ Add Batch</button>
            </div>

            {batchForm !== null && (
              <div className="p-3.5 border-b border-gray-200 bg-emerald-50/50 space-y-2">
                <p className="text-xs font-bold text-emerald-700">{batchForm === -1 ? 'Add Batch' : 'Edit Batch'}</p>
                <div className="grid grid-cols-3 gap-2">
                  <div><label className="text-[10px] text-gray-500">Batch No.</label><input value={batchData.batchNumber} onChange={e => setBF('batchNumber', e.target.value)} className="input text-xs w-full mt-0.5" placeholder="LOT-2026-001" /></div>
                  <div><label className="text-[10px] text-gray-500">Quantity *</label><input type="number" value={batchData.quantity} onChange={e => setBF('quantity', e.target.value)} className="input text-xs w-full mt-0.5" /></div>
                  <div><label className="text-[10px] text-gray-500">Price (₹)</label><input type="number" value={batchData.price} onChange={e => setBF('price', e.target.value)} className="input text-xs w-full mt-0.5" /></div>
                  <div><label className="text-[10px] text-gray-500">Received Date</label><input type="date" value={batchData.receivedDate} onChange={e => setBF('receivedDate', e.target.value)} className="input text-xs w-full mt-0.5" /></div>
                  <div><label className="text-[10px] text-gray-500">Expiry Date</label><input type="date" value={batchData.expiryDate} onChange={e => setBF('expiryDate', e.target.value)} className="input text-xs w-full mt-0.5" /></div>
                  <div><label className="text-[10px] text-gray-500">Notes</label><input value={batchData.notes} onChange={e => setBF('notes', e.target.value)} className="input text-xs w-full mt-0.5" /></div>
                </div>
                <div className="flex gap-2">
                  <button onClick={saveBatch} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700">Save</button>
                  <button onClick={() => setBatchForm(null)} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500">Cancel</button>
                </div>
              </div>
            )}

            {(expandedBatches || batchForm !== null) && localBatches.length > 0 && (
              <div className="divide-y divide-gray-100">
                {localBatches.map((b, i) => (
                  <div key={b.batchId || i} className="px-3.5 py-2.5 flex items-center gap-3 text-xs">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-800">{b.batchNumber || b.batchId}</p>
                      <p className="text-gray-500">
                        Qty: <span className="font-bold text-emerald-600">{b.quantity} {selected.unit}</span>
                        {b.price ? ` · ₹${b.price}` : ''}
                        {b.receivedDate ? ` · Rcvd: ${b.receivedDate}` : ''}
                        {b.expiryDate   ? ` · Exp: ${b.expiryDate}`   : ''}
                      </p>
                      {b.notes && <p className="text-gray-400 truncate">{b.notes}</p>}
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => openEditBatch(i)} className="p-1 text-gray-400 hover:text-blue-500">✏️</button>
                      <button onClick={() => deleteBatch(i)}   className="p-1 text-gray-400 hover:text-red-500">🗑</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!expandedBatches && batchForm === null && localBatches.length > 0 && (
              <button onClick={() => setExpandedBatches(true)} className="w-full text-center py-2 text-xs text-gray-400 hover:text-gray-600">
                Show {localBatches.length} batch{localBatches.length !== 1 ? 'es' : ''}
              </button>
            )}
            {localBatches.length === 0 && batchForm === null && (
              <p className="text-center py-4 text-xs text-gray-400">No batches yet — add one above</p>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
          <p className="text-4xl mb-2">🧪</p>
          <p className="text-sm font-medium">Select a material to view details</p>
        </div>
      )}

      {/* ADD/EDIT MODAL */}
      {showForm && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl border border-gray-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h3 className="font-bold text-gray-900">{editMat ? 'Edit Material' : 'Add Material'}</h3>
              <button onClick={closeForm} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500 mb-1 block">Code *</label><input value={form.code} onChange={e => setF('code', e.target.value)} className="input text-sm w-full" /></div>
                <div><label className="text-xs text-gray-500 mb-1 block">Name *</label><input value={form.name} onChange={e => setF('name', e.target.value)} className="input text-sm w-full" /></div>
                <div><label className="text-xs text-gray-500 mb-1 block">Category</label>
                  <select value={form.category} onChange={e => setF('category', e.target.value)} className="input text-sm w-full">
                    {CATEGORIES.filter(c => c !== 'All').map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div><label className="text-xs text-gray-500 mb-1 block">HSN Code</label><input value={form.hsnCode} onChange={e => setF('hsnCode', e.target.value)} className="input text-sm w-full" /></div>
                <div><label className="text-xs text-gray-500 mb-1 block">Unit</label>
                  <select value={form.unit} onChange={e => setF('unit', e.target.value)} className="input text-sm w-full">
                    {['kg', 'g', 'liter', 'ml', 'pcs', 'L'].map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
                <div><label className="text-xs text-gray-500 mb-1 block">Unit Price (₹)</label><input type="number" value={form.unitPrice} onChange={e => setF('unitPrice', e.target.value)} className="input text-sm w-full" /></div>
                <div><label className="text-xs text-gray-500 mb-1 block">GST Rate (%)</label>
                  <select value={form.gstRate} onChange={e => setF('gstRate', Number(e.target.value))} className="input text-sm w-full">
                    {[0,5,12,18,28].map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>
                <div><label className="text-xs text-gray-500 mb-1 block">Supplier</label><input value={form.supplier} onChange={e => setF('supplier', e.target.value)} className="input text-sm w-full" /></div>
                <div className="col-span-2"><label className="text-xs text-gray-500 mb-1 block">Location</label><input value={form.location} onChange={e => setF('location', e.target.value)} className="input text-sm w-full" /></div>
                <div className="col-span-2">
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-600">
                    <input type="checkbox" checked={form.enableMinStock} onChange={e => setF('enableMinStock', e.target.checked)} className="rounded" />
                    Enable minimum stock alert
                  </label>
                  {form.enableMinStock && (
                    <input type="number" value={form.minStockLevel} onChange={e => setF('minStockLevel', e.target.value)} className="input text-sm w-full mt-1.5" placeholder={`Min stock (${form.unit})`} />
                  )}
                </div>
                <div><label className="text-xs text-gray-500 mb-1 block">QC Checker</label><input value={form.qcChecker} onChange={e => setF('qcChecker', e.target.value)} className="input text-sm w-full" /></div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-600">
                    <input type="checkbox" checked={form.qcPassed} onChange={e => setF('qcPassed', e.target.checked)} className="rounded" />
                    QC Passed
                  </label>
                </div>
                <div className="col-span-2"><label className="text-xs text-gray-500 mb-1 block">QC Notes</label><textarea value={form.qcNotes} onChange={e => setF('qcNotes', e.target.value)} className="input text-sm w-full" rows={2} /></div>
              </div>
            </div>
            <div className="flex gap-2 px-5 py-4 border-t border-gray-200">
              <button onClick={saveMat} disabled={createMut.isPending || updateMut.isPending}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 transition-colors">
                {(createMut.isPending || updateMut.isPending) ? 'Saving…' : editMat ? '💾 Save Changes' : '✅ Add Material'}
              </button>
              <button onClick={closeForm} className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  );
}
