import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import QRCode from 'react-qr-code';
import api from '../../api/axios';

// ── Constants ─────────────────────────────────────────────────────────────────
const LS_KEY = 'rawMaterialDB_v8';

const HSN_DATASET = [
  { code: '3301', desc: 'Essential oils (Lavender, Rose, Peppermint, etc.)' },
  { code: '3302', desc: 'Odoriferous substances used for perfume / cosmetics' },
  { code: '3303', desc: 'Perfumes and toilet waters' },
  { code: '3304', desc: 'Beauty / make-up preparations & skin care' },
  { code: '3305', desc: 'Hair preparations (shampoo, conditioner, dye)' },
  { code: '3306', desc: 'Oral hygiene products (toothpaste, mouthwash)' },
  { code: '3307', desc: 'Pre-shave, shaving, after-shave, deodorants' },
  { code: '3401', desc: 'Soap; organic surface-active products' },
  { code: '3402', desc: 'Organic surface-active agents (surfactants)' },
  { code: '3404', desc: 'Artificial waxes and prepared waxes' },
  { code: '2936', desc: 'Vitamins and derivatives (unmixed)' },
  { code: '2937', desc: 'Hormones and derivatives (steroids, peptides)' },
  { code: '2941', desc: 'Antibiotics' },
  { code: '3824', desc: 'Chemical products and preparations, N.E.S.' },
  { code: '1520', desc: 'Glycerol, crude; glycerol waters' },
  { code: '1521', desc: 'Vegetable waxes, beeswax, other insect waxes' },
  { code: '3204', desc: 'Synthetic organic coloring matter' },
  { code: '3206', desc: 'Other coloring matter, pigments, preparations' },
  { code: '2207', desc: 'Ethyl alcohol (undenatured, >=80% alcohol)' },
  { code: '1302', desc: 'Vegetable saps and extracts; pectates, agar-agar' },
  { code: '1211', desc: 'Plants and parts for perfumery, pharmacy, insecticides' },
  { code: '1301', desc: 'Lac; natural gums, resins, gum-resins and oleoresins' },
  { code: '3202', desc: 'Synthetic organic tanning substances' },
  { code: '3203', desc: 'Coloring matter of vegetable or animal origin' },
  { code: '2905', desc: 'Acyclic alcohols and derivatives' },
  { code: '2906', desc: 'Cyclic alcohols and derivatives' },
  { code: '2916', desc: 'Unsaturated acyclic / cyclic monocarboxylic acids' },
  { code: '2922', desc: 'Oxygen-function amino-compounds' },
  { code: '3814', desc: 'Organic composite solvents and thinners' },
  { code: '3501', desc: 'Casein, caseinates, other casein derivatives' },
  { code: '3503', desc: 'Gelatin and derivatives, isinglass, glues' },
  { code: '3504', desc: 'Peptones, other protein substances' },
];

const COSMETIC_CATEGORIES = [
  'Fragrance', 'Hydrosol', 'Essential Oil', 'Carrier Oil', 'Active Ingredients',
  'Preservatives', 'Surfactants', 'Emulsifiers', 'Thickeners', 'Humectants',
  'Butters', 'Vitamins', 'Peptides', 'Proteins', 'Wax Esters', 'Silicones',
  'Botanical Extracts', 'Antioxidants', 'Sunscreen Agents', 'Exfoliants',
  'pH Adjusters', 'Chelating Agents', 'Solubilizers', 'Colorants',
  'Film Formers', 'Penetration Enhancers', 'Packaging Materials', 'Lab Equipment',
  'Inorganic Pigments', 'Natural Colorants', 'Synthetic Dyes', 'Ceramic Pigments',
  'Flavoring Extracts', 'Food Additives', 'Raw Materials', 'Raw chemicals', 'Other',
];

const UNITS = ['kg', 'liter', 'gram', 'ml', 'piece', 'box', 'drum', 'bag', 'meter', 'bottle', 'can', 'jar', 'tube', 'sachet'];

// ── Helpers ───────────────────────────────────────────────────────────────────
function totalStock(m) {
  if (m.currentStock !== undefined && m.currentStock !== null) return Number(m.currentStock) || 0;
  return (m.batches || []).reduce((s, b) => s + (Number(b.quantity) || 0), 0);
}
function weightedAvgPrice(m) {
  const batches = m.batches || [];
  const totalQty = batches.reduce((s, b) => s + (Number(b.quantity) || 0), 0);
  if (!totalQty) return parseFloat(m.costPrice) || parseFloat(m.unitPrice) || 0;
  const totalCost = batches.reduce((s, b) => s + (Number(b.quantity) || 0) * (Number(b.price) || 0), 0);
  return totalCost / totalQty;
}
function inventoryValue(m) {
  const batches = m.batches || [];
  const totalCost = batches.reduce((s, b) => s + (Number(b.quantity) || 0) * (Number(b.price) || 0), 0);
  return totalCost || totalStock(m) * (parseFloat(m.costPrice) || parseFloat(m.unitPrice) || 0);
}
function stockStatus(m) {
  if (m._status) return m._status;
  const qty = totalStock(m);
  if (qty <= 0) return 'Out';
  if (m.enableMinStock && qty <= (parseFloat(m.minStockLevel) || 0)) return 'Low';
  if (m.enableMinStock && qty <= (parseFloat(m.minStockLevel) || 0) * 2) return 'Medium';
  return 'In';
}
function isExpiringSoon(m) {
  const today = new Date(); const in30 = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
  return (m.batches || []).some(b => { if (!b.expiryDate) return false; const e = new Date(b.expiryDate); return e <= in30 && e >= today; });
}
function batchExpLabel(b) {
  if (!b.expiryDate) return { text: 'No expiry', cls: 'text-slate-400' };
  const days = Math.ceil((new Date(b.expiryDate) - new Date()) / (1000 * 60 * 60 * 24));
  if (days < 0) return { text: `Expired (${Math.abs(days)}d ago)`, cls: 'text-red-600 font-bold' };
  if (days <= 30) return { text: `Expiring in ${days}d`, cls: 'text-amber-600 font-semibold' };
  return { text: `Exp: ${new Date(b.expiryDate).toLocaleDateString('en-IN')}`, cls: 'text-slate-500' };
}
function genBatchId() { return 'BATCH-' + Math.random().toString(36).substr(2, 9).toUpperCase(); }

const emptyForm = () => ({
  code: '', name: '', hsnCode: '', category: 'Raw Materials', supplier: '', location: '',
  unit: 'kg', unitPrice: '', gstRate: 18, enableMinStock: true, minStockLevel: '10',
  qcPassed: false, qcChecker: '', qcNumber: '', refCheckNumber: '', qcNotes: '',
  initialStock: '', initialExpiry: '', initialBatchNumber: '', image: null, batches: [],
});
const emptyBatch = () => ({
  batchId: genBatchId(), batchNumber: '', quantity: '', totalPrice: '', price: '',
  receivedDate: '', expiryDate: '', location: '', supplier: '', invoice: '', notes: '',
  qcCheckedBy: '', qcDate: new Date().toISOString().split('T')[0], qcStatus: 'pass', qcNotes: '',
});

// ── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ m }) {
  const s = stockStatus(m);
  const map = { Out: 'bg-red-100 text-red-700', Low: 'bg-amber-100 text-amber-700', Medium: 'bg-amber-50 text-amber-600', In: 'bg-emerald-100 text-emerald-700' };
  return <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${map[s] || map.In}`}>{s}</span>;
}

// ── Metric card ───────────────────────────────────────────────────────────────
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

// ── Main component ────────────────────────────────────────────────────────────
export default function RawMaterialsPage() {
  const qc = useQueryClient();

  // Table state
  const [search, setSearch]           = useState('');
  const [catFilter, setCatFilter]     = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [sortKey, setSortKey]         = useState('code');
  const [sortDir, setSortDir]         = useState(1);
  const [expandedId, setExpandedId]   = useState(null);
  const [editBatch, setEditBatch] = useState(null); // { mat, data }

  // Modal state
  const [showForm, setShowForm]       = useState(false);
  const [editMat, setEditMat]         = useState(null);
  const [form, setForm]               = useState(emptyForm());
  const [showQR, setShowQR]           = useState(null);      // material object
  const [showBatch, setShowBatch]     = useState(null);      // material object
  const [showLowStock, setShowLowStock] = useState(false);
  const [batchData, setBatchData]     = useState(emptyBatch());
  const [inlineBatches, setInlineBatches] = useState([]);    // for edit modal

  // HSN / Category autocomplete
  const [hsnSuggestions, setHsnSuggestions] = useState([]);
  const [catSuggestions, setCatSuggestions] = useState([]);

  // Voice
  const [voiceStatus, setVoiceStatus] = useState('Click to record');
  const [voiceTranscript, setVoiceTranscript] = useState('(Voice transcript...)');
  const recognitionRef = useRef(null);

  // Image
  const [imagePreview, setImagePreview] = useState(null);

  // Import
  const importInputRef = useRef(null);
  const [syncing, setSyncing] = useState(false);
  const autoMigratedRef = useRef(false);

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data, isLoading, isError } = useQuery({
    queryKey: ['rawmaterials', search, catFilter, statusFilter],
    queryFn: () => api.get('/inventory/raw-materials', {
      params: {
        search:   search || undefined,
        category: catFilter !== 'All' ? catFilter : undefined,
        status:   statusFilter !== 'All' ? statusFilter : undefined,
      },
    }).then(r => r.data),
    staleTime: 10000, retry: 1,
  });

  const lsAll = useMemo(() => {
    if (!isError) return null;
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return [];
      const { materials: items = [] } = JSON.parse(raw);
      return items.map(m => ({ ...m, _status: stockStatus(m) }));
    } catch { return []; }
  }, [isError]);

  const materials = useMemo(() => {
    if (lsAll) {
      return lsAll.filter(m => {
        if (search && !m.name?.toLowerCase().includes(search.toLowerCase()) && !m.code?.toLowerCase().includes(search.toLowerCase()) && !m.supplier?.toLowerCase().includes(search.toLowerCase())) return false;
        if (catFilter !== 'All' && m.category !== catFilter) return false;
        if (statusFilter !== 'All' && stockStatus(m) !== statusFilter) return false;
        return true;
      });
    }
    return data?.materials || [];
  }, [data, lsAll, search, catFilter, statusFilter]);

  useEffect(() => {
    if (!isLoading && !isError && materials.length === 0 && !autoMigratedRef.current && !search && catFilter === 'All') {
      autoMigratedRef.current = true;
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return;
        const { materials: lsItems = [] } = JSON.parse(raw);
        if (!lsItems.length) return;
        api.post('/inventory/raw-materials/import', { materials: lsItems })
          .then(res => {
            qc.invalidateQueries({ queryKey: ['rawmaterials'] });
            const { created = 0 } = res.data?.data || res.data || {};
            if (created > 0) toast.success(`Synced ${created} raw materials to cloud`);
          }).catch(() => {});
      } catch {}
    }
  }, [isLoading, isError, materials.length]);

  const { data: statsData } = useQuery({
    queryKey: ['rawmaterials', 'stats'],
    queryFn: () => api.get('/inventory/raw-materials/stats').then(r => r.data),
    staleTime: 15000, enabled: !isError,
  });

  // Computed dashboard stats
  const stats = useMemo(() => {
    const all = lsAll || data?.materials || [];
    const total = lsAll ? lsAll.length : (statsData?.data?.total ?? statsData?.total ?? materials.length);
    const low   = lsAll ? lsAll.filter(m => m.enableMinStock && totalStock(m) <= (parseFloat(m.minStockLevel) || 0)).length : (statsData?.data?.low ?? statsData?.low ?? 0);
    const out   = lsAll ? lsAll.filter(m => totalStock(m) <= 0).length : (statsData?.data?.out ?? statsData?.out ?? 0);
    const inStock = lsAll ? lsAll.filter(m => totalStock(m) > 0 && !(m.enableMinStock && totalStock(m) <= (parseFloat(m.minStockLevel) || 0))).length : (statsData?.data?.inStock ?? statsData?.inStock ?? 0);
    const totalValue = all.reduce((s, m) => s + inventoryValue(m), 0);
    const expiring = all.filter(m => isExpiringSoon(m)).length;
    const avgCost = all.length > 0 ? all.reduce((s, m) => s + weightedAvgPrice(m), 0) / all.length : 0;
    const prevAvg = parseFloat(localStorage.getItem('prevAvgCost_rm')) || avgCost;
    const costChange = prevAvg > 0 ? ((avgCost - prevAvg) / prevAvg * 100) : 0;
    if (avgCost > 0) localStorage.setItem('prevAvgCost_rm', avgCost.toFixed(2));
    return { total, low, out, inStock, totalValue, expiring, costChange };
  }, [lsAll, data, statsData, materials]);

  // ── Mutations ────────────────────────────────────────────────────────────────
  const invalidate = () => qc.invalidateQueries({ queryKey: ['rawmaterials'] });

  const createMut = useMutation({
    mutationFn: d => api.post('/inventory/raw-materials', d),
    onSuccess: () => { invalidate(); toast.success('Material added'); closeForm(); },
    onError: e => toast.error(e?.response?.data?.message || 'Failed to add'),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, d }) => api.put(`/inventory/raw-materials/${id}`, d),
    onSuccess: () => { invalidate(); toast.success('Material updated'); closeForm(); },
    onError: e => toast.error(e?.response?.data?.message || 'Failed to update'),
  });
  const updateBatchMut = useMutation({
    mutationFn: ({ matId, batchId, d }) => api.put(`/inventory/raw-materials/${matId}/batches/${batchId}`, d),
    onSuccess: () => { invalidate(); toast.success('Batch updated'); setEditBatch(null); },
    onError: e => toast.error(e?.response?.data?.message || 'Failed to update batch'),
  });
  const addBatchMut = useMutation({
    mutationFn: ({ id, d }) => api.post(`/inventory/raw-materials/${id}/batches`, d),
    onSuccess: (_, { id }) => { invalidate(); toast.success('Batch added'); setShowBatch(null); setBatchData(emptyBatch()); setExpandedId(id); },
    onError: e => toast.error(e?.response?.data?.message || 'Failed to add batch'),
  });
  const deleteMut = useMutation({
    mutationFn: id => api.delete(`/inventory/raw-materials/${id}`),
    onSuccess: () => { invalidate(); toast.success('Deleted'); },
    onError: () => toast.error('Failed to delete'),
  });

  // ── Sort ──────────────────────────────────────────────────────────────────────
  const sorted = useMemo(() => {
    return [...materials].sort((a, b) => {
      let va, vb;
      if (sortKey === 'stock') { va = totalStock(a); vb = totalStock(b); }
      else if (sortKey === 'status') { va = stockStatus(a); vb = stockStatus(b); }
      else if (sortKey === 'value') { va = inventoryValue(a); vb = inventoryValue(b); }
      else { va = (a[sortKey] || ''); vb = (b[sortKey] || ''); }
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      return va < vb ? -sortDir : va > vb ? sortDir : 0;
    });
  }, [materials, sortKey, sortDir]);

  function sort(key) {
    if (sortKey === key) setSortDir(d => d * -1);
    else { setSortKey(key); setSortDir(1); }
  }
  function SortIcon({ k }) {
    if (sortKey !== k) return <span className="ml-1 opacity-30">⇅</span>;
    return <span className="ml-1 text-slate-900">{sortDir === 1 ? '▲' : '▼'}</span>;
  }

  // ── Form helpers ──────────────────────────────────────────────────────────────
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function openCreate() {
    const nextNum = String((data?.materials?.length || 0) + 1).padStart(4, '0');
    setForm({ ...emptyForm(), code: `RM-${nextNum}` });
    setEditMat(null); setImagePreview(null); setInlineBatches([]);
    setHsnSuggestions([]); setCatSuggestions([]); setShowForm(true);
  }
  function openEdit(m) {
    setForm({ ...emptyForm(), ...m, initialStock: '', initialExpiry: '', initialBatchNumber: '' });
    setEditMat(m); setImagePreview(m.image || null);
    setInlineBatches(m.batches || []);
    setHsnSuggestions([]); setCatSuggestions([]); setShowForm(true);
  }
  function closeForm() { setShowForm(false); setEditMat(null); setImagePreview(null); setInlineBatches([]); }

  function saveMat() {
    if (!form.name || !form.category || !form.unit || !form.unitPrice) {
      toast.error('Please fill all required fields'); return;
    }
    const payload = { ...form, image: imagePreview, batches: editMat ? inlineBatches : undefined };
    if (!editMat && form.initialStock > 0) {
      payload.batches = [{ batchId: genBatchId(), quantity: parseFloat(form.initialStock), price: parseFloat(form.unitPrice), batchNumber: form.initialBatchNumber || `LOT-${form.code}`, expiryDate: form.initialExpiry || null, receivedDate: new Date().toISOString().split('T')[0], notes: 'Initial stock' }];
    }
    if (editMat) updateMut.mutate({ id: editMat._id || editMat.id, d: payload });
    else createMut.mutate(payload);
  }

  function deleteMat(m) {
    if (!window.confirm(`Delete "${m.name}"?`)) return;
    deleteMut.mutate(m._id || m.id);
  }

  // ── HSN / Category autocomplete ───────────────────────────────────────────────
  function onHsnInput(val) {
    setF('hsnCode', val);
    if (!val) { setHsnSuggestions([]); return; }
    const v = val.toLowerCase();
    setHsnSuggestions(HSN_DATASET.filter(h => h.code.includes(v) || h.desc.toLowerCase().includes(v)).slice(0, 8));
  }
  function onCatInput(val) {
    setF('category', val);
    if (!val) { setCatSuggestions([]); return; }
    const v = val.toLowerCase();
    setCatSuggestions(COSMETIC_CATEGORIES.filter(c => c.toLowerCase().includes(v)));
  }

  // ── Image upload ──────────────────────────────────────────────────────────────
  function onImageChange(e) {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => setImagePreview(ev.target.result);
    r.readAsDataURL(f);
  }

  // ── Bill scan (OCR banner) ────────────────────────────────────────────────────
  function onBillImageChange(e) {
    const f = e.target.files[0]; if (!f) return;
    // Without tesseract.js installed, we prompt user to enter details manually
    toast('Bill upload received. Fill in fields manually or install Tesseract for OCR.', { icon: '📄' });
    e.target.value = '';
  }

  // ── Voice input ───────────────────────────────────────────────────────────────
  function toggleVoice() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast.error('Voice input not supported in this browser'); return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (recognitionRef.current && recognitionRef.current._running) {
      recognitionRef.current.stop(); return;
    }
    const rec = new SR();
    rec.continuous = true; rec.interimResults = true; rec.lang = 'en-IN';
    rec._running = true;
    rec.onresult = e => {
      let t = '';
      for (let i = e.resultIndex; i < e.results.length; i++) t += e.results[i][0].transcript;
      setVoiceTranscript(t);
    };
    rec.onend = () => { setVoiceStatus('Click to record'); rec._running = false; };
    rec.onerror = () => { setVoiceStatus('Error. Try again.'); rec._running = false; };
    rec.start();
    rec._running = true;
    recognitionRef.current = rec;
    setVoiceStatus('Recording...');
  }

  // ── Inline batch (edit modal) ─────────────────────────────────────────────────
  const [addBatchForm, setAddBatchForm] = useState(null); // null=hidden, object=open
  function addInlineBatch() {
    if (!addBatchForm || !addBatchForm.quantity) { toast.error('Enter quantity'); return; }
    const nb = { ...addBatchForm, batchId: addBatchForm.batchId || genBatchId(), price: parseFloat(addBatchForm.price) || parseFloat(form.unitPrice) || 0, batchNumber: addBatchForm.batchNumber || `LOT-${form.code}-${inlineBatches.length + 1}`, receivedDate: addBatchForm.receivedDate || new Date().toISOString().split('T')[0] };
    const updated = [...inlineBatches, nb];
    setInlineBatches(updated);
    setAddBatchForm(null);
    toast.success(`Batch added: +${nb.quantity} ${form.unit}`);
  }

  // ── Batch modal ───────────────────────────────────────────────────────────────
  function saveBatchModal() {
    if (!showBatch) return;
    const qty = parseFloat(batchData.quantity);
    const total = parseFloat(batchData.totalPrice);
    if (!qty || qty <= 0) { toast.error('Enter a valid quantity'); return; }
    if (!total || total <= 0) { toast.error('Enter total price'); return; }
    if (!batchData.supplier) { toast.error('Enter supplier name'); return; }
    if (!batchData.location) { toast.error('Enter storage location'); return; }
    if (!batchData.qcCheckedBy) { toast.error('Select QC person'); return; }
    if (!batchData.qcDate) { toast.error('Select QC check date'); return; }
    if (batchData.qcStatus === 'fail') {
      toast.error('QC Failed — batch rejected. Not added to inventory.');
      setBatchData(emptyBatch()); setShowBatch(null); return;
    }
    const unitPrice = parseFloat((total / qty).toFixed(4));
    const payload = {
      quantity: qty,
      totalPrice: total,
      price: unitPrice,
      batchNumber: batchData.batchNumber || `LOT-${showBatch.sku || showBatch.code}-${(showBatch.batches?.length || 0) + 1}`,
      receivedDate: batchData.receivedDate || new Date().toISOString().split('T')[0],
      expiryDate: batchData.expiryDate || null,
      location: batchData.location,
      supplier: batchData.supplier,
      invoice: batchData.invoice || '',
      notes: batchData.notes || '',
      qcCheckedBy: batchData.qcCheckedBy,
      qcDate: batchData.qcDate,
      qcStatus: batchData.qcStatus,
      qcNotes: batchData.qcNotes || '',
    };
    addBatchMut.mutate({ id: showBatch._id || showBatch.id, d: payload });
  }

  // ── Export CSV ────────────────────────────────────────────────────────────────
  function exportCSV() {
    const all = data?.materials || lsAll || [];
    if (!all.length) { toast.error('No materials to export'); return; }
    const headers = ['Code','Name','Category','HSN Code','Supplier','Location','Unit','Unit Price (₹)','GST Rate (%)','Min Stock Enabled','Min Stock Level','QC Passed','QC Checker','Total Stock','Status'];
    const rows = all.map(m => [m.code, m.name, m.category, m.hsnCode||'', m.supplier||'', m.location||'', m.unit, m.unitPrice||0, m.gstRate||0, m.enableMinStock?'Yes':'No', m.enableMinStock?(m.minStockLevel||0):'', m.qcPassed?'Yes':'No', m.qcChecker||'', totalStock(m), stockStatus(m)]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `raw-materials-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    toast.success(`Exported ${all.length} materials`);
  }

  // ── Import CSV ────────────────────────────────────────────────────────────────
  function parseCSVRow(line) {
    const result = []; let cur = ''; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
      else if (c === ',' && !inQ) { result.push(cur); cur = ''; }
      else cur += c;
    }
    result.push(cur);
    return result.map(s => s.trim().replace(/^"|"$/g, ''));
  }

  async function importCSV(e) {
    const file = e.target.files?.[0]; if (!file) return;
    e.target.value = '';
    const text = await file.text();
    try {
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) { toast.error('CSV has no data rows'); return; }
      const headers = parseCSVRow(lines[0].replace(/^﻿/, ''));
      const fi = pat => headers.findIndex(h => pat.test(h));
      const idx = { code: fi(/^code$/i), name: fi(/^name$/i), category: fi(/category/i), hsnCode: fi(/hsn/i), supplier: fi(/supplier/i), location: fi(/location/i), unit: fi(/^unit$/i), unitPrice: fi(/unit price/i), gstRate: fi(/gst rate/i), enableMinStock: fi(/min stock enabled/i), minStockLevel: fi(/min stock level/i), qcPassed: fi(/qc passed/i), qcChecker: fi(/qc checker/i) };
      const parsed = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVRow(lines[i]);
        const g = k => (idx[k] >= 0 ? cols[idx[k]] || '' : '');
        const code = g('code'); const name = g('name');
        if (!code || !name) continue;
        parsed.push({ code, name, category: g('category') || 'Raw Materials', hsnCode: g('hsnCode'), supplier: g('supplier'), location: g('location'), unit: g('unit') || 'kg', unitPrice: parseFloat(g('unitPrice')) || 0, gstRate: parseFloat(g('gstRate')) || 18, enableMinStock: g('enableMinStock').toLowerCase() === 'yes', minStockLevel: parseFloat(g('minStockLevel')) || 0, qcPassed: g('qcPassed').toLowerCase() === 'yes', qcChecker: g('qcChecker'), batches: [] });
      }
      if (!parsed.length) { toast.error('No valid rows found'); return; }
      try {
        const res = await api.post('/inventory/raw-materials/import', { materials: parsed });
        const { created = 0, skipped = 0 } = res.data?.data || res.data || {};
        qc.invalidateQueries({ queryKey: ['rawmaterials'] });
        toast.success(`Imported ${created} materials${skipped ? `, skipped ${skipped} duplicates` : ''}`);
      } catch {
        const existing = JSON.parse(localStorage.getItem(LS_KEY) || '{"materials":[]}');
        const existCodes = new Set((existing.materials || []).map(m => m.code));
        const newItems = parsed.filter(m => !existCodes.has(m.code));
        existing.materials = [...(existing.materials || []), ...newItems];
        localStorage.setItem(LS_KEY, JSON.stringify(existing));
        qc.invalidateQueries({ queryKey: ['rawmaterials'] });
        toast.success(`Saved ${newItems.length} materials locally`);
      }
    } catch { toast.error('Failed to parse CSV'); }
  }

  // ── Sync localStorage → backend ───────────────────────────────────────────────
  async function syncLS() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) { toast.error('No local data to sync'); return; }
      const { materials: lsItems = [] } = JSON.parse(raw);
      if (!lsItems.length) { toast.error('No materials to sync'); return; }
      setSyncing(true);
      const res = await api.post('/inventory/raw-materials/import', { materials: lsItems });
      const { created = 0, skipped = 0 } = res.data?.data || res.data || {};
      qc.invalidateQueries({ queryKey: ['rawmaterials'] });
      toast.success(`Synced ${created} materials, skipped ${skipped} duplicates`);
    } catch (e) { toast.error(e?.response?.data?.message || 'Sync failed'); }
    finally { setSyncing(false); }
  }

  // ── QR data ───────────────────────────────────────────────────────────────────
  function qrValue(m) {
    return JSON.stringify({ code: m.code, name: m.name, hsn: m.hsnCode || '', unit: m.unit, price: m.unitPrice, gst: m.gstRate, location: m.location || '', supplier: m.supplier || '' });
  }

  // ── Low stock data ────────────────────────────────────────────────────────────
  const lowStockMats = useMemo(() => {
    const all = lsAll || data?.materials || [];
    return all.filter(m => m.enableMinStock && totalStock(m) <= (parseFloat(m.minStockLevel) || 0) && totalStock(m) > 0);
  }, [lsAll, data]);
  const outOfStockMats = useMemo(() => {
    const all = lsAll || data?.materials || [];
    return all.filter(m => totalStock(m) <= 0);
  }, [lsAll, data]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') { setShowForm(false); setShowQR(null); setShowBatch(null); setShowLowStock(false); }
      if (e.ctrlKey && e.key === 'n') { e.preventDefault(); openCreate(); }
      if (e.ctrlKey && e.key === 'e') { e.preventDefault(); exportCSV(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────────
  const thCls = 'px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide cursor-pointer select-none whitespace-nowrap hover:text-slate-700 transition-colors';
  const inputCls = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 font-[Inter,sans-serif] bg-white transition-all';
  const labelCls = 'block text-xs font-semibold text-slate-700 mb-1';

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-200 px-8 py-3.5 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg" style={{ background: '#e5ff00' }}>🧪</div>
          <div>
            <h1 className="text-base font-bold text-slate-900">Raw Material Inventory</h1>
            <p className="text-[11px] text-slate-500">BioTech / Cosmetic ERP — ISO 9001:2015</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input ref={importInputRef} type="file" accept=".csv" className="hidden" onChange={importCSV} />
          <button onClick={() => importInputRef.current?.click()} className="text-sm px-4 py-2 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold transition-all">📤 Bulk Import</button>
          <button onClick={syncLS} disabled={syncing} className="text-sm px-4 py-2 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-semibold hover:bg-amber-100 disabled:opacity-50 transition-all">{syncing ? 'Syncing…' : '☁️ Sync LS'}</button>
          <button onClick={exportCSV} className="text-sm px-4 py-2 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold transition-all">📥 Export CSV</button>
          <button onClick={openCreate} className="text-sm px-4 py-2 rounded-full font-semibold text-slate-900 transition-all hover:brightness-95" style={{ background: '#e5ff00' }}>➕ Add Material</button>
        </div>
      </div>

      <div className="px-8 py-6 max-w-[1440px] mx-auto">

        {/* ── 5 Dashboard Metrics ── */}
        <div className="grid grid-cols-5 gap-4 mb-6">
          <MetricCard label="Total Materials" value={stats.total} sub="📦 Active SKUs" icon="📦" iconBg="bg-purple-100" />
          <MetricCard label="Total Inventory Value" value={`₹${stats.totalValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} sub="↗ Across all batches" icon="₹" iconBg="bg-emerald-100" />
          <MetricCard
            label="Avg Cost Change (MoM)"
            value={(stats.costChange >= 0 ? '+' : '') + stats.costChange.toFixed(1) + '%'}
            sub={(stats.costChange >= 0 ? '↗ Up' : '↘ Down') + ' vs last month'}
            icon="📊" iconBg="bg-blue-100"
          />
          <MetricCard label="Low Stock Alerts" value={stats.low} sub="⚠️ Items below min" icon="⚠️" iconBg="bg-red-100" onClick={() => setShowLowStock(true)} />
          <MetricCard label="Expiring Soon" value={stats.expiring} sub="📅 Within 30 days" icon="📅" iconBg="bg-amber-100" />
        </div>

        {/* ── Table Card ── */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {/* Card header */}
          <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
            <h2 className="text-sm font-bold text-slate-900">📦 Materials Master</h2>
            <div className="flex-1" />
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search name, SKU, supplier, HSN..."
                className="pl-9 pr-4 py-2 border border-slate-200 rounded-full text-sm w-80 bg-slate-50 focus:outline-none focus:border-slate-400 focus:bg-white transition-all"
              />
            </div>
            <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className="text-sm px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:outline-none">
              <option value="All">All Categories</option>
              {COSMETIC_CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="text-sm px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:outline-none">
              <option value="All">All Status</option>
              <option value="In">In Stock</option>
              <option value="Low">Low</option>
              <option value="Out">Out</option>
            </select>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-slate-50">
                <tr>
                  {[['code','Code'],['name','Name'],['category','Category'],['hsnCode','HSN'],['unit','Unit'],['unitPrice','Price'],['gstRate','GST'],['stock','Stock'],['status','Status']].map(([k,label]) => (
                    <th key={k} className={thCls} onClick={() => sort(k)}>
                      {label}<SortIcon k={k} />
                    </th>
                  ))}
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide w-36">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={10} className="text-center py-16 text-slate-400">Loading…</td></tr>
                ) : sorted.length === 0 ? (
                  <tr><td colSpan={10} className="text-center py-16">
                    <p className="text-4xl mb-2">📦</p>
                    <p className="text-sm font-semibold text-slate-600">No materials found</p>
                    <p className="text-xs text-slate-400 mt-1">Try adjusting your search or add a new material.</p>
                  </td></tr>
                ) : sorted.map(m => {
                  const id = m._id || m.id;
                  const expanded = expandedId === id;
                  const qty = totalStock(m);
                  const qtyColor = qty <= 0 ? 'text-red-600 font-bold' : (m.enableMinStock && qty <= (parseFloat(m.minStockLevel)||0)) ? 'text-red-500 font-bold' : qty <= (parseFloat(m.minStockLevel)||0)*2 ? 'text-amber-600' : 'text-emerald-600';
                  return [
                    <tr key={id} className={`border-b border-slate-50 hover:bg-slate-50/60 transition-colors ${expanded ? 'bg-slate-50' : ''}`}>
                      <td className="px-4 py-3 text-slate-900 font-bold text-xs cursor-pointer hover:underline" onClick={() => setExpandedId(expanded ? null : id)}>{m.code}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800 cursor-pointer hover:underline hover:text-slate-900 max-w-[180px] truncate" onClick={() => setExpandedId(expanded ? null : id)}>{m.name}</td>
                      <td className="px-4 py-3"><span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">{m.category}</span></td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{m.hsnCode || '—'}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{m.unit}</td>
                      <td className="px-4 py-3 text-slate-700 font-semibold">₹{weightedAvgPrice(m).toLocaleString('en-IN', {maximumFractionDigits: 2})}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{m.gstRate}%</td>
                      <td className={`px-4 py-3 text-xs ${qtyColor}`}>{qty.toLocaleString('en-IN')}</td>
                      <td className="px-4 py-3"><StatusBadge m={m} /></td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 items-center">
                          <button title="Add Batch" onClick={() => { setShowBatch(m); setBatchData(emptyBatch()); }} className="w-8 h-8 rounded-lg flex items-center justify-center text-amber-500 hover:bg-amber-50 transition-colors text-sm">🧪</button>
                          <button title="Print QR" onClick={() => setShowQR(m)} className="w-8 h-8 rounded-lg flex items-center justify-center text-blue-500 hover:bg-blue-50 transition-colors text-sm">🔲</button>
                          <button title="Edit" onClick={() => openEdit(m)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors text-sm">✏️</button>
                          <button title="Delete" onClick={() => deleteMat(m)} className="w-8 h-8 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-50 transition-colors text-sm">🗑️</button>
                        </div>
                      </td>
                    </tr>,
                    expanded && (
                      <tr key={`${id}-detail`} className="border-b border-slate-100">
                        <td colSpan={10} className="px-0 py-0">
                          <div className="bg-slate-50 px-6 py-5">
                            <div className="grid grid-cols-2 gap-6">
                              {/* LEFT: Image + Batches */}
                              <div>
                                <div className="mb-4">
                                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">🖼️ Product Image</p>
                                  <div onClick={() => document.getElementById(`rmImg-${id}`).click()} className="w-20 h-20 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center cursor-pointer overflow-hidden hover:border-slate-400 transition-colors bg-white">
                                    {m.image ? <img src={m.image} alt="Product" className="w-full h-full object-cover" /> : <span className="text-slate-400 text-[10px] text-center px-1">📷 Upload</span>}
                                  </div>
                                  <input type="file" id={`rmImg-${id}`} accept="image/*" className="hidden" onChange={e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = ev => updateMut.mutate({ id, d: { ...m, image: ev.target.result } }); r.readAsDataURL(f); e.target.value = ''; }} />
                                </div>
                                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-3">🧪 Batches</p>
                                {(m.batches || []).length === 0 ? (
                                  <p className="text-xs text-slate-400">No batches recorded</p>
                                ) : (m.batches || []).map((b, i) => {
                                  const exp = batchExpLabel(b);
                                  const qcPass = !b.qcStatus || b.qcStatus === 'pass';
                                  return (
                                    <div key={b.batchId || i} className="bg-white rounded-lg border border-slate-100 px-3 py-2 mb-2 cursor-pointer hover:border-slate-300 transition-colors" onClick={() => setEditBatch({ mat: m, data: { ...b, totalPrice: b.totalPrice || (b.price && b.quantity ? parseFloat((b.price * b.quantity).toFixed(2)) : '') } })}>
                                      <div className="flex items-center justify-between mb-1">
                                        <span className="text-slate-900 font-semibold text-xs truncate">{b.batchNumber || b.batchId}</span>
                                        <div className="flex items-center gap-1.5">
                                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${qcPass ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{qcPass ? '✓ QC Pass' : '✗ QC Fail'}</span>
                                          <span className="text-[10px] text-slate-400 hover:text-slate-600">✏️</span>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-3 text-xs text-slate-600">
                                        <span className="font-bold text-slate-700">{b.quantity} {m.unit}</span>
                                        <span className="text-emerald-600 font-semibold">₹{b.price || m.unitPrice}/unit</span>
                                        <span className={exp.cls}>{exp.text}</span>
                                      </div>
                                      <p className="text-[11px] text-slate-400 mt-1">📍 <span className="text-slate-600 font-medium">{b.location || '—'}</span></p>
                                      {b.qcCheckedBy && <p className="text-[11px] text-slate-400 mt-0.5">Checked by: <span className="text-slate-600 font-medium">{b.qcCheckedBy}</span>{b.qcDate ? ` · ${b.qcDate}` : ''}</p>}
                                    </div>
                                  );
                                })}
                              </div>
                              {/* RIGHT: Basic Info */}
                              <div>
                                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-3">📋 Basic Info</p>
                                {[['Supplier', m.supplier], ['Location', m.location], ['Min Stock', m.enableMinStock ? `${m.minStockLevel} ${m.unit}` : 'Disabled'], ['Inventory Value', `₹${inventoryValue(m).toLocaleString('en-IN', {maximumFractionDigits:0})}`]].map(([k,v]) => (
                                  <div key={k} className="flex justify-between text-xs py-1.5 border-b border-slate-100 last:border-0">
                                    <span className="text-slate-500">{k}</span>
                                    <span className="font-semibold text-slate-700">{v || '—'}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )
                  ];
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ════════════ ADD / EDIT MODAL ════════════ */}
      {showForm && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-3xl my-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50 rounded-t-2xl">
              <h2 className="text-base font-bold text-slate-900">{editMat ? `✏️ Edit Material — ${editMat.name}` : '➕ Add New Raw Material'}</h2>
              <button onClick={closeForm} className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 text-xl transition-all">✕</button>
            </div>
            <div className="px-6 py-5 overflow-y-auto max-h-[75vh] space-y-5">

              {/* OCR Banner */}
              <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex-wrap gap-3">
                <div>
                  <p className="text-sm font-bold text-emerald-800">📄 Auto-populate from Bill / Label</p>
                  <p className="text-xs text-emerald-600 mt-0.5">Upload a photo of the product label or invoice to auto-fill fields</p>
                </div>
                <div className="flex gap-2">
                  <input type="file" id="billImageInput" accept="image/*" className="hidden" onChange={onBillImageChange} />
                  <button onClick={() => document.getElementById('billImageInput').click()} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors">📁 Upload Bill</button>
                </div>
              </div>

              {/* Row 1: Code, Name, HSN */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={labelCls}>Material Code</label>
                  <input value={form.code} onChange={e => setF('code', e.target.value.toUpperCase())} className={`${inputCls} font-bold text-slate-900`} placeholder="Auto from name" />
                </div>
                <div>
                  <label className={labelCls}>Product Name <span className="text-red-500">*</span></label>
                  <input value={form.name} onChange={e => {
                    const name = e.target.value;
                    if (!editMat) {
                      const stop = new Set(['and','or','the','of','in','for','a','an','with','by','to']);
                      const words = name.trim().split(/\s+/).filter(w => w && !stop.has(w.toLowerCase()));
                      const initials = words.map(w => w[0].toUpperCase()).join('').slice(0, 6);
                      if (initials) {
                        const existing = (data?.materials || []).map(m => m.code);
                        let base = `RM-${initials}`, code = base, n = 1;
                        while (existing.includes(code)) code = `${base}-${String(n++).padStart(2,'0')}`;
                        setForm(f => ({ ...f, name, code }));
                      } else { setF('name', name); }
                    } else { setF('name', name); }
                  }} className={inputCls} placeholder="e.g., Lavender Essential Oil" />
                </div>
                <div className="relative">
                  <label className={labelCls}>HSN Code</label>
                  <input value={form.hsnCode} onChange={e => onHsnInput(e.target.value)} onBlur={() => setTimeout(() => setHsnSuggestions([]), 200)} className={inputCls} placeholder="Auto-identified or enter manually" />
                  {hsnSuggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 max-h-52 overflow-y-auto">
                      {hsnSuggestions.map(h => (
                        <button key={h.code} onMouseDown={() => { setF('hsnCode', h.code); setHsnSuggestions([]); }} className="w-full text-left px-3 py-2.5 hover:bg-slate-50 border-b border-slate-50 last:border-0">
                          <span className="text-xs font-bold text-slate-900">{h.code}</span>
                          <span className="text-xs text-slate-500 ml-2">{h.desc}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Row 2: Category, Supplier, Location */}
              <div className="grid grid-cols-3 gap-4">
                <div className="relative">
                  <label className={labelCls}>Category <span className="text-red-500">*</span></label>
                  <input value={form.category} onChange={e => onCatInput(e.target.value)} onBlur={() => setTimeout(() => setCatSuggestions([]), 200)} className={inputCls} placeholder="Type or select category" />
                  {catSuggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 max-h-48 overflow-y-auto">
                      {catSuggestions.map(c => (
                        <button key={c} onMouseDown={() => { setF('category', c); setCatSuggestions([]); }} className="w-full text-left px-3 py-2 hover:bg-slate-50 text-xs font-semibold text-slate-700 border-b border-slate-50 last:border-0">{c}</button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className={labelCls}>Supplier Name</label>
                  <input value={form.supplier} onChange={e => setF('supplier', e.target.value)} className={inputCls} placeholder="e.g., ABC Chemicals Pvt Ltd" />
                </div>
                <div>
                  <label className={labelCls}>Storage Location <span className="text-red-500">*</span></label>
                  <input value={form.location} onChange={e => setF('location', e.target.value)} className={inputCls} placeholder="e.g., Warehouse A, Rack 12" />
                </div>
              </div>

              {/* Row 3: Unit, Price, GST */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={labelCls}>Unit <span className="text-red-500">*</span></label>
                  <select value={form.unit} onChange={e => setF('unit', e.target.value)} className={inputCls}>
                    {UNITS.map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Unit Price (₹) <span className="text-red-500">*</span></label>
                  <input type="number" value={form.unitPrice} onChange={e => setF('unitPrice', e.target.value)} step="0.01" min="0" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>GST Rate (%)</label>
                  <select value={form.gstRate} onChange={e => setF('gstRate', Number(e.target.value))} className={inputCls}>
                    {[0,5,12,18,28].map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>
              </div>

              {/* Row 4: Initial Stock (add only) */}
              {!editMat && (
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className={labelCls}>Initial Stock</label>
                    <input type="number" value={form.initialStock} onChange={e => setF('initialStock', e.target.value)} step="0.01" min="0" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Initial Expiry</label>
                    <input type="date" value={form.initialExpiry} onChange={e => setF('initialExpiry', e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Initial Batch #</label>
                    <input value={form.initialBatchNumber} onChange={e => setF('initialBatchNumber', e.target.value)} className={inputCls} placeholder="e.g., LOT-2026-001" />
                  </div>
                </div>
              )}

              {/* Min Stock */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                  <input type="checkbox" checked={form.enableMinStock} onChange={e => setF('enableMinStock', e.target.checked)} className="rounded accent-slate-900" />
                  Enable Min Stock Alert
                </label>
                {form.enableMinStock && (
                  <input type="number" value={form.minStockLevel} onChange={e => setF('minStockLevel', e.target.value)} step="0.01" min="0" className={inputCls} placeholder={`Min stock (${form.unit})`} />
                )}
              </div>

              {/* QC Section */}
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50">
                <h4 className="text-xs font-bold text-slate-900 mb-3 flex items-center gap-1.5">🛡️ ISO 9001:2015 Quality Control</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className={labelCls}>QC Checked By</label>
                    <input value={form.qcChecker} onChange={e => setF('qcChecker', e.target.value)} className={inputCls} placeholder="Inspector name" />
                  </div>
                  <div>
                    <label className={labelCls}>QC Number</label>
                    <input value={form.qcNumber} onChange={e => setF('qcNumber', e.target.value)} className={inputCls} placeholder="QC-2026-001" />
                  </div>
                  <div>
                    <label className={labelCls}>Reference Check #</label>
                    <input value={form.refCheckNumber} onChange={e => setF('refCheckNumber', e.target.value)} className={inputCls} placeholder="REF-2026-001" />
                  </div>
                  <div className="col-span-3 flex items-center gap-2">
                    <input type="checkbox" id="qcPassedCk" checked={form.qcPassed} onChange={e => setF('qcPassed', e.target.checked)} className="rounded accent-slate-900" />
                    <label htmlFor="qcPassedCk" className="text-xs font-semibold text-slate-700 cursor-pointer">QC Passed / Approved</label>
                  </div>
                  <div className="col-span-3">
                    <label className={labelCls}>QC Notes</label>
                    <textarea value={form.qcNotes} onChange={e => setF('qcNotes', e.target.value)} className={`${inputCls} resize-none`} rows={2} placeholder="Quality observations..." />
                  </div>
                </div>
              </div>

              {/* Batch Management (Edit mode) */}
              {editMat && (
                <div className="border border-slate-200 rounded-xl p-4 bg-slate-50">
                  <h4 className="text-xs font-bold text-slate-900 mb-3 flex items-center gap-1.5">🧪 Batch Management</h4>
                  <div className="flex items-center justify-between mb-3 bg-white rounded-lg border border-slate-100 px-4 py-2.5">
                    <span className="text-xs text-slate-500 font-medium">Current Total Stock</span>
                    <span className="text-lg font-bold text-slate-900">{inlineBatches.reduce((s, b) => s + (parseFloat(b.quantity) || 0), 0).toLocaleString('en-IN')} {form.unit}</span>
                  </div>
                  <div className="space-y-2 mb-3">
                    {inlineBatches.map((b, i) => {
                      const exp = batchExpLabel(b);
                      return (
                        <div key={b.batchId || i} className="grid grid-cols-5 gap-2 text-xs bg-white rounded-lg border border-slate-100 px-3 py-2 items-center">
                          <span className="font-semibold text-slate-900 truncate">{b.batchNumber || b.batchId}</span>
                          <span className="font-bold text-slate-700">{b.quantity} {form.unit}</span>
                          <span className="text-emerald-600 font-semibold">₹{b.price || form.unitPrice}</span>
                          <span className="text-slate-500">{b.receivedDate ? new Date(b.receivedDate).toLocaleDateString('en-IN') : '—'}</span>
                          <span className={exp.cls}>{exp.text}</span>
                        </div>
                      );
                    })}
                  </div>
                  {addBatchForm !== null ? (
                    <div className="bg-white rounded-xl border border-slate-200 p-4">
                      <p className="text-xs font-bold text-slate-700 mb-3">➕ Add New Batch</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div><label className={labelCls}>Quantity <span className="text-red-500">*</span></label><input type="number" value={addBatchForm.quantity} onChange={e => setAddBatchForm(f => ({...f, quantity: e.target.value}))} className={inputCls} /></div>
                        <div><label className={labelCls}>Batch / Lot #</label><input value={addBatchForm.batchNumber} onChange={e => setAddBatchForm(f => ({...f, batchNumber: e.target.value}))} className={inputCls} placeholder={`LOT-${form.code}-${inlineBatches.length + 1}`} /></div>
                        <div><label className={labelCls}>Expiry Date</label><input type="date" value={addBatchForm.expiryDate} onChange={e => setAddBatchForm(f => ({...f, expiryDate: e.target.value}))} className={inputCls} /></div>
                        <div><label className={labelCls}>Received Date</label><input type="date" value={addBatchForm.receivedDate} onChange={e => setAddBatchForm(f => ({...f, receivedDate: e.target.value}))} className={inputCls} /></div>
                        <div><label className={labelCls}>Unit Price for this Batch (₹)</label><input type="number" value={addBatchForm.price} onChange={e => setAddBatchForm(f => ({...f, price: e.target.value}))} className={inputCls} placeholder="Leave blank to use current price" /></div>
                        <div><label className={labelCls}>Storage Location</label><input value={addBatchForm.location} onChange={e => setAddBatchForm(f => ({...f, location: e.target.value}))} className={inputCls} placeholder={form.location || 'e.g. Warehouse A · Rack 12'} /></div>
                        <div className="col-span-2"><label className={labelCls}>Notes</label><input value={addBatchForm.notes} onChange={e => setAddBatchForm(f => ({...f, notes: e.target.value}))} className={inputCls} placeholder="Supplier, Invoice Ref..." /></div>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button onClick={addInlineBatch} className="text-xs px-4 py-2 rounded-lg bg-slate-900 text-white font-semibold hover:bg-slate-800">➕ Add Batch</button>
                        <button onClick={() => setAddBatchForm(null)} className="text-xs px-4 py-2 rounded-lg border border-slate-200 text-slate-500">Clear</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setAddBatchForm(emptyBatch())} className="text-xs px-4 py-2 rounded-lg bg-white border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 transition-colors">➕ Add New Batch</button>
                  )}
                </div>
              )}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
              <button onClick={closeForm} className="px-5 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-500 hover:bg-slate-100 transition-colors">Cancel</button>
              <button onClick={saveMat} disabled={createMut.isPending || updateMut.isPending}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-900 disabled:opacity-60 transition-all hover:brightness-95"
                style={{ background: '#e5ff00' }}>
                {(createMut.isPending || updateMut.isPending) ? 'Saving…' : editMat ? '💾 Save Changes' : '✅ Add Material'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ════════════ QR MODAL ════════════ */}
      {showQR && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50 rounded-t-2xl">
              <h2 className="text-sm font-bold text-slate-900">🔲 Print QR Label</h2>
              <button onClick={() => setShowQR(null)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            <div className="p-6 flex flex-col items-center gap-4">
              <div className="border-2 border-slate-200 rounded-xl p-4 bg-white shadow-sm">
                <QRCode value={qrValue(showQR)} size={200} level="M" />
              </div>
              <div className="text-center">
                <p className="text-base font-bold text-slate-900">{showQR.name}</p>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                  Code: {showQR.code} · HSN: {showQR.hsnCode || '—'}<br />
                  Unit: {showQR.unit} · Price: ₹{showQR.unitPrice} · GST: {showQR.gstRate}%<br />
                  Location: {showQR.location || '—'}
                </p>
              </div>
            </div>
            <div className="flex gap-2 px-5 py-4 border-t border-slate-100">
              <button onClick={() => window.print()} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 transition-colors">🖨️ Print Label</button>
              <button onClick={() => setShowQR(null)} className="px-5 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">Close</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ════════════ BATCH ADD MODAL ════════════ */}
      {showBatch && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.45)' }}>
          <div className="bg-white rounded-[14px] w-full max-w-[400px] max-h-[92vh] flex flex-col shadow-2xl overflow-hidden" style={{ fontFamily: "'Inter','Segoe UI',system-ui,sans-serif" }}>

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100 bg-[#fbfcfe]">
              <div className="flex items-center gap-2 font-semibold text-[15px] text-slate-900">
                <span className="w-[22px] h-[22px] rounded-[7px] flex items-center justify-center text-white text-xs" style={{ background: 'linear-gradient(135deg,#34d399,#10b981)' }}>✎</span>
                Add Batch to Material
              </div>
              <button onClick={() => setShowBatch(null)} className="text-slate-400 hover:bg-slate-100 hover:text-slate-600 px-2 py-1 rounded-md text-lg transition-all">✕</button>
            </div>

            {/* Body */}
            <div className="px-4 py-3 overflow-y-auto flex-1 space-y-0" style={{ scrollbarWidth: 'thin' }}>

              {/* Product summary card */}
              <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-[10px] border border-[#e5edf7] mb-3" style={{ background: '#f6faff' }}>
                <div className="w-[38px] h-[38px] rounded-[8px] flex items-center justify-center text-lg flex-shrink-0" style={{ background: '#fef3c7', color: '#d97706' }}>📦</div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[13.5px] text-slate-900 mb-0.5 truncate">
                    {showBatch.name}
                    <span className="text-slate-400 font-normal text-[11.5px] ml-1">({showBatch.code} | HSN: {showBatch.hsnCode||'—'})</span>
                  </p>
                  <div className="flex flex-wrap gap-1 text-[10.5px] text-slate-500">
                    <span className="bg-white border border-slate-200 rounded px-1.5 py-0.5">Current: <strong>{totalStock(showBatch)} {showBatch.unit}</strong></span>
                    {showBatch.location && <span className="bg-white border border-slate-200 rounded px-1.5 py-0.5">{showBatch.location}</span>}
                    {showBatch.supplier && <span className="bg-white border border-slate-200 rounded px-1.5 py-0.5">{showBatch.supplier}</span>}
                  </div>
                </div>
              </div>

              {/* Section: Batch Details */}
              <div className="flex items-center gap-1.5 text-[11.5px] font-semibold tracking-wide uppercase text-slate-500 my-3">
                Batch Details
                <span className="flex-1 h-px bg-slate-100" />
              </div>

              <div className="grid grid-cols-2 gap-2 mb-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[11.5px] text-slate-500 font-medium">Quantity to Add <span className="text-red-500">*</span></label>
                  <input type="number" value={batchData.quantity} onChange={e => { const q = e.target.value; const t = batchData.totalPrice; setBatchData(b => ({ ...b, quantity: q, price: q && t ? parseFloat((parseFloat(t)/parseFloat(q)).toFixed(4)) : '' })); }} step="0.01" min="0" placeholder="e.g. 100" className="px-2.5 py-2 border border-slate-200 rounded-lg text-[13px] font-[inherit] focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 text-slate-900" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11.5px] text-slate-500 font-medium">Unit</label>
                  <select value={batchData.unit || showBatch.unit} onChange={e => setBatchData(b => ({...b, unit: e.target.value}))} className="px-2.5 py-2 border border-slate-200 rounded-lg text-[13px] font-[inherit] focus:outline-none focus:border-emerald-500 bg-white text-slate-900">
                    {['kg','g','liter','ml','tonne','piece','box','drum','bag'].map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[11.5px] text-slate-500 font-medium">Total Price (₹) <span className="text-red-500">*</span></label>
                  <input type="number" value={batchData.totalPrice} onChange={e => { const t = e.target.value; const q = batchData.quantity; setBatchData(b => ({ ...b, totalPrice: t, price: q && t ? parseFloat((parseFloat(t)/parseFloat(q)).toFixed(4)) : '' })); }} step="0.01" min="0" placeholder="e.g. 5000" className="px-2.5 py-2 border border-slate-200 rounded-lg text-[13px] font-[inherit] focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 text-slate-900" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11.5px] text-slate-500 font-medium">Unit Price <span className="text-[10.5px] text-slate-400 font-normal">auto-calculated</span></label>
                  <input type="text" value={batchData.price ? `₹ ${batchData.price} / ${batchData.unit || showBatch.unit}` : ''} readOnly placeholder="₹ — / unit" className="px-2.5 py-2 border border-slate-200 rounded-lg text-[13px] bg-slate-50 font-semibold text-emerald-600 cursor-default" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[11.5px] text-slate-500 font-medium">Batch / Lot Number</label>
                  <input value={batchData.batchNumber} onChange={e => setBatchData(b => ({...b, batchNumber: e.target.value}))} placeholder={`LOT-${showBatch.code}-${(showBatch.batches?.length||0)+1}`} className="px-2.5 py-2 border border-slate-200 rounded-lg text-[13px] font-[inherit] focus:outline-none focus:border-emerald-500 text-slate-900" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11.5px] text-slate-500 font-medium">Received Date</label>
                  <input type="date" value={batchData.receivedDate} onChange={e => setBatchData(b => ({...b, receivedDate: e.target.value}))} className="px-2.5 py-2 border border-slate-200 rounded-lg text-[13px] font-[inherit] focus:outline-none focus:border-emerald-500 text-slate-900" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[11.5px] text-slate-500 font-medium">Expiry Date</label>
                  <input type="date" value={batchData.expiryDate} onChange={e => setBatchData(b => ({...b, expiryDate: e.target.value}))} className="px-2.5 py-2 border border-slate-200 rounded-lg text-[13px] font-[inherit] focus:outline-none focus:border-emerald-500 text-slate-900" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11.5px] text-slate-500 font-medium">Storage Location <span className="text-red-500">*</span></label>
                  <input value={batchData.location} onChange={e => setBatchData(b => ({...b, location: e.target.value}))} placeholder={showBatch.location || 'e.g. Warehouse A · CS1'} className="px-2.5 py-2 border border-slate-200 rounded-lg text-[13px] font-[inherit] focus:outline-none focus:border-emerald-500 text-slate-900" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[11.5px] text-slate-500 font-medium">Supplier Name <span className="text-red-500">*</span></label>
                  <input value={batchData.supplier} onChange={e => setBatchData(b => ({...b, supplier: e.target.value}))} placeholder={showBatch.supplier || 'e.g. Kerala Oils Ltd'} className="px-2.5 py-2 border border-slate-200 rounded-lg text-[13px] font-[inherit] focus:outline-none focus:border-emerald-500 text-slate-900" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11.5px] text-slate-500 font-medium">Supplier Invoice</label>
                  <input value={batchData.invoice} onChange={e => setBatchData(b => ({...b, invoice: e.target.value}))} placeholder="INV-2026-123" className="px-2.5 py-2 border border-slate-200 rounded-lg text-[13px] font-[inherit] focus:outline-none focus:border-emerald-500 text-slate-900" />
                </div>
              </div>

              {/* Section: Quality Check */}
              <div className="flex items-center gap-1.5 text-[11.5px] font-semibold tracking-wide uppercase text-slate-500 mt-4 mb-2">
                Quality Check
                <span className="flex-1 h-px bg-slate-100" />
              </div>
              <div className="rounded-[10px] p-2.5 mb-3" style={{ background: '#f0fdf4', border: '1px dashed #86efac' }}>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800 mb-2">
                  <span className="w-4 h-4 rounded flex items-center justify-center text-white text-[10px]" style={{ background: '#10b981' }}>✓</span>
                  Mandatory before adding
                </div>

                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-[11.5px] text-slate-500 font-medium">QC Checked By <span className="text-red-500">*</span></label>
                    <select value={batchData.qcCheckedBy} onChange={e => setBatchData(b => ({...b, qcCheckedBy: e.target.value}))} className="px-2.5 py-2 border border-slate-200 rounded-lg text-[13px] font-[inherit] focus:outline-none focus:border-emerald-500 bg-white text-slate-900">
                      <option value="">Select QC person</option>
                      <option>Ravi (QC Lead)</option>
                      <option>Priya (QC Analyst)</option>
                      <option>Karthik (Shift QC)</option>
                      <option>Divya (QC Manager)</option>
                      <option>Suresh (Sr. QC)</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11.5px] text-slate-500 font-medium">QC Check Date <span className="text-red-500">*</span></label>
                    <input type="date" value={batchData.qcDate} onChange={e => setBatchData(b => ({...b, qcDate: e.target.value}))} className="px-2.5 py-2 border border-slate-200 rounded-lg text-[13px] font-[inherit] focus:outline-none focus:border-emerald-500 text-slate-900" />
                  </div>
                </div>

                <div className="flex flex-col gap-1 mb-2">
                  <label className="text-[11.5px] text-slate-500 font-medium">QC Status</label>
                  <div className="grid grid-cols-2 gap-1.5 p-0.5 rounded-lg" style={{ background: '#dcfce7', border: '1px solid #bbf7d0' }}>
                    <button type="button" onClick={() => setBatchData(b => ({...b, qcStatus: 'pass'}))}
                      className={`py-1.5 rounded-md text-[12.5px] font-medium transition-all ${batchData.qcStatus === 'pass' ? 'text-white shadow-sm' : 'text-slate-500 bg-transparent'}`}
                      style={batchData.qcStatus === 'pass' ? { background: '#10b981', boxShadow: '0 2px 4px rgba(16,185,129,.3)' } : {}}>
                      ✓ QC Pass
                    </button>
                    <button type="button" onClick={() => setBatchData(b => ({...b, qcStatus: 'fail'}))}
                      className={`py-1.5 rounded-md text-[12.5px] font-medium transition-all ${batchData.qcStatus === 'fail' ? 'bg-red-500 text-white shadow-sm' : 'text-slate-500 bg-transparent'}`}>
                      ✗ QC Fail
                    </button>
                  </div>
                  {batchData.qcStatus === 'fail' && (
                    <p className="text-[10.5px] text-red-600 mt-1">If QC fails, batch is <strong>rejected</strong> and will <strong>not</strong> be added to inventory.</p>
                  )}
                  {batchData.qcStatus === 'pass' && (
                    <p className="text-[10.5px] mt-1" style={{ color: '#047857' }}>If QC fails, the batch is rejected and returned to the supplier — it will <b>not</b> be added to inventory.</p>
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11.5px] text-slate-500 font-medium">QC Notes <span className="text-[10.5px] text-slate-400 font-normal">optional</span></label>
                  <textarea value={batchData.qcNotes} onChange={e => setBatchData(b => ({...b, qcNotes: e.target.value}))} placeholder="e.g. COA verified, aroma OK…" rows={2} className="px-2.5 py-2 border border-slate-200 rounded-lg text-[13px] font-[inherit] focus:outline-none focus:border-emerald-500 resize-none text-slate-900" />
                </div>
              </div>

              {/* Existing Batches */}
              {(showBatch.batches||[]).length > 0 && (
                <>
                  <div className="flex items-center gap-1.5 text-[11.5px] font-semibold tracking-wide uppercase text-slate-500 mt-2 mb-2">
                    Existing Batches
                    <span className="text-[11px] text-slate-400 normal-case tracking-normal font-normal">— {showBatch.batches.length} total</span>
                    <span className="flex-1 h-px bg-slate-100" />
                  </div>
                  <div className="space-y-1.5 mb-2">
                    {showBatch.batches.map((b, i) => {
                      const exp = batchExpLabel(b);
                      const today = new Date();
                      const days = b.expiryDate ? Math.ceil((new Date(b.expiryDate) - today) / (1000*60*60*24)) : null;
                      const badgeCls = days === null ? '' : days < 0 ? 'bg-red-100 text-red-700' : days <= 30 ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700';
                      const badgeTxt = days === null ? '' : days < 0 ? 'Expired' : days <= 30 ? 'Expiring' : 'Active';
                      return (
                        <div key={b.batchId||i} className="grid text-[11.5px] px-2.5 py-2 rounded-lg border border-slate-100 bg-[#fafbfc]" style={{ gridTemplateColumns: '1fr auto auto auto', gap: '6px', alignItems: 'center' }}>
                          <span className="font-semibold text-slate-900 truncate">{b.batchNumber||b.batchId}</span>
                          <span className="text-slate-600">{b.quantity} {showBatch.unit}</span>
                          <span className="font-semibold text-emerald-600">₹{b.price||showBatch.unitPrice}</span>
                          {badgeTxt && <span className={`text-[9.5px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide ${badgeCls}`}>{badgeTxt}</span>}
                          <span className="text-[10.5px] text-slate-400 col-span-4">Rcvd: {b.receivedDate ? new Date(b.receivedDate).toLocaleDateString('en-IN') : '—'} · {exp.text}</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="flex gap-2 px-4 py-3 border-t border-slate-100 bg-[#fbfcfe]">
              <button onClick={() => setShowBatch(null)} className="flex-1 py-2.5 rounded-[9px] text-[13.5px] font-semibold bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 transition-all font-[inherit]">Cancel</button>
              <button onClick={saveBatchModal} disabled={updateMut.isPending} className="flex-1 py-2.5 rounded-[9px] text-[13.5px] font-semibold text-white transition-all font-[inherit] disabled:opacity-60" style={{ background: '#0f172a' }}>
                {updateMut.isPending ? 'Adding…' : '+ Add Batch'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ════════════ BATCH EDIT MODAL ════════════ */}
      {editBatch && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.45)' }}>
          <div className="bg-white rounded-[14px] w-full max-w-[420px] max-h-[92vh] flex flex-col shadow-2xl overflow-hidden" style={{ fontFamily: "'Inter','Segoe UI',system-ui,sans-serif" }}>
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100 bg-[#fbfcfe]">
              <div className="flex items-center gap-2 font-semibold text-[15px] text-slate-900">
                <span className="w-[22px] h-[22px] rounded-[7px] flex items-center justify-center text-white text-xs" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>✎</span>
                Edit Batch
              </div>
              <button onClick={() => setEditBatch(null)} className="text-slate-400 hover:bg-slate-100 hover:text-slate-600 px-2 py-1 rounded-md text-lg transition-all">✕</button>
            </div>
            <div className="px-4 py-3 overflow-y-auto flex-1 space-y-2" style={{ scrollbarWidth: 'thin' }}>
              {/* Material info */}
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-[10px] border border-[#e5edf7] mb-2" style={{ background: '#f6faff' }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0" style={{ background: '#ede9fe', color: '#7c3aed' }}>📦</div>
                <div className="min-w-0">
                  <p className="font-semibold text-[13px] text-slate-900 truncate">{editBatch.mat.name}</p>
                  <p className="text-[11px] text-slate-400">{editBatch.mat.code} · {editBatch.data.batchNumber || editBatch.data.batchId}</p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide uppercase text-slate-500 mb-1">Batch Details <span className="flex-1 h-px bg-slate-100" /></div>

              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-slate-500 font-medium">Batch / Lot #</label>
                  <input value={editBatch.data.batchNumber || ''} onChange={e => setEditBatch(s => ({...s, data: {...s.data, batchNumber: e.target.value}}))} className="px-2.5 py-2 border border-slate-200 rounded-lg text-[13px] focus:outline-none focus:border-violet-500 text-slate-900" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-slate-500 font-medium">Quantity</label>
                  <input type="number" value={editBatch.data.quantity || ''} onChange={e => { const q = e.target.value; const t = editBatch.data.totalPrice; setEditBatch(s => ({...s, data: {...s.data, quantity: q, price: q && t ? parseFloat((parseFloat(t)/parseFloat(q)).toFixed(4)) : s.data.price}})); }} className="px-2.5 py-2 border border-slate-200 rounded-lg text-[13px] focus:outline-none focus:border-violet-500 text-slate-900" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-slate-500 font-medium">Total Price (₹)</label>
                  <input type="number" value={editBatch.data.totalPrice || ''} onChange={e => { const t = e.target.value; const q = editBatch.data.quantity; setEditBatch(s => ({...s, data: {...s.data, totalPrice: t, price: q && t ? parseFloat((parseFloat(t)/parseFloat(q)).toFixed(4)) : s.data.price}})); }} className="px-2.5 py-2 border border-slate-200 rounded-lg text-[13px] focus:outline-none focus:border-violet-500 text-slate-900" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-slate-500 font-medium">Unit Price (₹/{editBatch.mat.unit})</label>
                  <input type="number" value={editBatch.data.price || ''} onChange={e => { const p = e.target.value; const q = editBatch.data.quantity; setEditBatch(s => ({...s, data: {...s.data, price: p, totalPrice: p && q ? parseFloat((parseFloat(p)*parseFloat(q)).toFixed(2)) : s.data.totalPrice}})); }} placeholder="e.g. 1250" className="px-2.5 py-2 border border-slate-200 rounded-lg text-[13px] focus:outline-none focus:border-violet-500 font-semibold text-emerald-600 text-slate-900" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-slate-500 font-medium">Received Date</label>
                  <input type="date" value={editBatch.data.receivedDate || ''} onChange={e => setEditBatch(s => ({...s, data: {...s.data, receivedDate: e.target.value}}))} className="px-2.5 py-2 border border-slate-200 rounded-lg text-[13px] focus:outline-none focus:border-violet-500 text-slate-900" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-slate-500 font-medium">Expiry Date</label>
                  <input type="date" value={editBatch.data.expiryDate || ''} onChange={e => setEditBatch(s => ({...s, data: {...s.data, expiryDate: e.target.value}}))} className="px-2.5 py-2 border border-slate-200 rounded-lg text-[13px] focus:outline-none focus:border-violet-500 text-slate-900" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-slate-500 font-medium">Storage Location</label>
                  <input value={editBatch.data.location || ''} onChange={e => setEditBatch(s => ({...s, data: {...s.data, location: e.target.value}}))} placeholder={editBatch.mat.location || 'e.g. Warehouse A · Rack 12'} className="px-2.5 py-2 border border-slate-200 rounded-lg text-[13px] focus:outline-none focus:border-violet-500 text-slate-900" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-slate-500 font-medium">Supplier</label>
                  <input value={editBatch.data.supplier || ''} onChange={e => setEditBatch(s => ({...s, data: {...s.data, supplier: e.target.value}}))} placeholder={editBatch.mat.supplier || ''} className="px-2.5 py-2 border border-slate-200 rounded-lg text-[13px] focus:outline-none focus:border-violet-500 text-slate-900" />
                </div>
                <div className="flex flex-col gap-1 col-span-2">
                  <label className="text-[11px] text-slate-500 font-medium">Supplier Invoice</label>
                  <input value={editBatch.data.invoice || ''} onChange={e => setEditBatch(s => ({...s, data: {...s.data, invoice: e.target.value}}))} placeholder="INV-2026-123" className="px-2.5 py-2 border border-slate-200 rounded-lg text-[13px] focus:outline-none focus:border-violet-500 text-slate-900" />
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide uppercase text-slate-500 mt-3 mb-1">Quality Check <span className="flex-1 h-px bg-slate-100" /></div>
              <div className="rounded-[10px] p-2.5" style={{ background: '#f0fdf4', border: '1px dashed #86efac' }}>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-slate-500 font-medium">QC Checked By</label>
                    <select value={editBatch.data.qcCheckedBy || ''} onChange={e => setEditBatch(s => ({...s, data: {...s.data, qcCheckedBy: e.target.value}}))} className="px-2.5 py-2 border border-slate-200 rounded-lg text-[13px] focus:outline-none focus:border-violet-500 bg-white text-slate-900">
                      <option value="">Select QC person</option>
                      <option>Ravi (QC Lead)</option><option>Priya (QC Analyst)</option><option>Karthik (Shift QC)</option><option>Divya (QC Manager)</option><option>Suresh (Sr. QC)</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-slate-500 font-medium">QC Check Date</label>
                    <input type="date" value={editBatch.data.qcDate || ''} onChange={e => setEditBatch(s => ({...s, data: {...s.data, qcDate: e.target.value}}))} className="px-2.5 py-2 border border-slate-200 rounded-lg text-[13px] focus:outline-none focus:border-violet-500 text-slate-900" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1.5 p-0.5 rounded-lg mb-2" style={{ background: '#dcfce7', border: '1px solid #bbf7d0' }}>
                  <button type="button" onClick={() => setEditBatch(s => ({...s, data: {...s.data, qcStatus: 'pass'}}))} className={`py-1.5 rounded-md text-[12px] font-medium transition-all ${editBatch.data.qcStatus === 'pass' ? 'text-white shadow-sm' : 'text-slate-500'}`} style={editBatch.data.qcStatus === 'pass' ? { background: '#10b981' } : {}}>✓ QC Pass</button>
                  <button type="button" onClick={() => setEditBatch(s => ({...s, data: {...s.data, qcStatus: 'fail'}}))} className={`py-1.5 rounded-md text-[12px] font-medium transition-all ${editBatch.data.qcStatus === 'fail' ? 'bg-red-500 text-white shadow-sm' : 'text-slate-500'}`}>✗ QC Fail</button>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-slate-500 font-medium">QC Notes</label>
                  <textarea value={editBatch.data.qcNotes || ''} onChange={e => setEditBatch(s => ({...s, data: {...s.data, qcNotes: e.target.value}}))} rows={2} placeholder="e.g. COA verified, aroma OK…" className="px-2.5 py-2 border border-slate-200 rounded-lg text-[13px] focus:outline-none focus:border-violet-500 resize-none text-slate-900" />
                </div>
              </div>

              <div className="flex flex-col gap-1 mt-2">
                <label className="text-[11px] text-slate-500 font-medium">Notes</label>
                <input value={editBatch.data.notes || ''} onChange={e => setEditBatch(s => ({...s, data: {...s.data, notes: e.target.value}}))} placeholder="Any notes…" className="px-2.5 py-2 border border-slate-200 rounded-lg text-[13px] focus:outline-none focus:border-violet-500 text-slate-900" />
              </div>
            </div>
            <div className="flex gap-2 px-4 py-3 border-t border-slate-100 bg-[#fbfcfe]">
              <button onClick={() => setEditBatch(null)} className="px-4 py-2.5 rounded-[9px] text-[13px] font-semibold border border-slate-200 text-slate-500 hover:bg-slate-50">Cancel</button>
              <button onClick={() => { const { mat, data } = editBatch; updateBatchMut.mutate({ matId: mat._id||mat.id, batchId: data._id, d: { quantity: data.quantity, totalPrice: data.totalPrice, price: data.price, batchNumber: data.batchNumber, expiryDate: data.expiryDate||null, receivedDate: data.receivedDate||null, location: data.location, supplier: data.supplier, invoice: data.invoice, notes: data.notes, qcCheckedBy: data.qcCheckedBy, qcDate: data.qcDate, qcStatus: data.qcStatus, qcNotes: data.qcNotes } }); }} disabled={updateBatchMut.isPending} className="flex-1 py-2.5 rounded-[9px] text-[13px] font-semibold text-white disabled:opacity-60 transition-all" style={{ background: '#6366f1' }}>
                {updateBatchMut.isPending ? 'Saving…' : '💾 Save Changes'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ════════════ LOW STOCK MODAL ════════════ */}
      {showLowStock && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50 rounded-t-2xl">
              <h2 className="text-sm font-bold text-slate-900">⚠️ Low Stock Alerts</h2>
              <button onClick={() => setShowLowStock(false)} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
            </div>
            <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">
              {outOfStockMats.length === 0 && lowStockMats.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-3xl mb-2">✅</p>
                  <p className="text-sm font-semibold text-slate-700">All stock levels are healthy</p>
                  <p className="text-xs text-slate-400 mt-1">No materials are below minimum stock levels.</p>
                </div>
              ) : (
                <>
                  {outOfStockMats.length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs font-bold text-red-600 mb-2">🚫 Out of Stock ({outOfStockMats.length})</p>
                      {outOfStockMats.map(m => (
                        <div key={m._id||m.id} className="flex items-center gap-3 py-2.5 border-b border-slate-50 text-xs">
                          <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                          <div className="flex-1"><strong className="text-slate-800">{m.name}</strong> <span className="text-slate-400">({m.code}) — {m.location||'—'}</span></div>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">OUT</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {lowStockMats.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-amber-600 mb-2">⚠️ Low Stock ({lowStockMats.length})</p>
                      {lowStockMats.map(m => (
                        <div key={m._id||m.id} className="flex items-center gap-3 py-2.5 border-b border-slate-50 text-xs">
                          <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
                          <div className="flex-1"><strong className="text-slate-800">{m.name}</strong> <span className="text-slate-400">({m.code}) — Stock: {totalStock(m)} / Min: {m.minStockLevel} {m.unit}</span></div>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">LOW</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="px-5 py-4 border-t border-slate-100">
              <button onClick={() => setShowLowStock(false)} className="w-full py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">Close</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
