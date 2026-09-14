import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import QRCode from 'react-qr-code';
import api from '../../api/axios';
import {
  FlaskConical, Upload, Cloud, Download, Plus, Package, IndianRupee, BarChart3,
  AlertTriangle, CalendarClock, Search, TestTube2, QrCode, Pencil, Trash2, ImagePlus,
  MapPin, Save, CheckCircle2, XCircle, FileText, ChevronsUpDown, ChevronUp, ChevronDown,
  ClipboardList, ShieldCheck, Printer, Ban,
} from 'lucide-react';
import { Button, Card, Col, Drawer, Empty, Input, Modal, Row, Select, Space, Table, Tag, Typography } from 'antd';

const { Text, Title } = Typography;

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
  if (!b.expiryDate) return { text: 'No expiry', color: '#94a3b8' };
  const days = Math.ceil((new Date(b.expiryDate) - new Date()) / (1000 * 60 * 60 * 24));
  if (days < 0) return { text: `Expired (${Math.abs(days)}d ago)`, color: '#dc2626', bold: true };
  if (days <= 30) return { text: `Expiring in ${days}d`, color: '#d97706', bold: true };
  return { text: `Exp: ${new Date(b.expiryDate).toLocaleDateString('en-IN')}`, color: '#64748b' };
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

const STATUS_COLOR = { Out: 'red', Low: 'orange', Medium: 'gold', In: 'green' };

function StatusBadge({ m }) {
  return <Tag color={STATUS_COLOR[stockStatus(m)] || 'default'}>{stockStatus(m)}</Tag>;
}

function MetricCard({ label, value, sub, icon, color, onClick }) {
  return (
    <Card hoverable={!!onClick} onClick={onClick} styles={{ body: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' } }}>
      <div>
        <Text type="secondary" style={{ fontSize: 12, fontWeight: 500 }}>{label}</Text>
        <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{value}</div>
        {sub && <Text type="secondary" style={{ fontSize: 11 }}>{sub}</Text>}
      </div>
      <div style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${color}14`, color, flexShrink: 0 }}>
        {icon}
      </div>
    </Card>
  );
}

const inputStyle = { fontSize: 13 };
function Field({ label, required, children, span }) {
  return (
    <Col span={span || 8}>
      <Text strong style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>{label}{required && <Text type="danger"> *</Text>}</Text>
      {children}
    </Col>
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

  // Drawer/Modal state
  const [showForm, setShowForm]       = useState(false);
  const [editMat, setEditMat]         = useState(null);
  const [form, setForm]               = useState(emptyForm());
  const [showQR, setShowQR]           = useState(null);      // material object
  const [showBatch, setShowBatch]     = useState(null);      // material object
  const [showLowStock, setShowLowStock] = useState(false);
  const [batchData, setBatchData]     = useState(emptyBatch());
  const [inlineBatches, setInlineBatches] = useState([]);    // for edit drawer

  // HSN / Category autocomplete
  const [hsnSuggestions, setHsnSuggestions] = useState([]);
  const [catSuggestions, setCatSuggestions] = useState([]);

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
    // Backend Product docs use costPrice/warehouseLocation; this page's forms, batches,
    // CSV import/export, and QR display all speak unitPrice/location — alias here once so
    // every read site below (and the edit form, which spreads `...m` straight into state)
    // gets a real value instead of undefined.
    return (data?.materials || []).map(m => ({
      ...m,
      unitPrice: m.unitPrice ?? m.costPrice,
      location: m.location ?? m.warehouseLocation,
    }));
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

  // The backend controller reads costPrice/warehouseLocation, not this form's
  // unitPrice/location — without this the material saves with price ₹0 every time.
  const toApiPayload = (d) => ({ ...d, costPrice: d.unitPrice, warehouseLocation: d.location });

  const createMut = useMutation({
    mutationFn: d => api.post('/inventory/raw-materials', toApiPayload(d)),
    onSuccess: () => { invalidate(); toast.success('Material added'); closeForm(); },
    onError: e => toast.error(e?.response?.data?.message || 'Failed to add'),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, d }) => api.put(`/inventory/raw-materials/${id}`, toApiPayload(d)),
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
    if (sortKey !== k) return <ChevronsUpDown size={12} style={{ opacity: 0.4, marginLeft: 4 }} />;
    return sortDir === 1 ? <ChevronUp size={12} style={{ marginLeft: 4 }} /> : <ChevronDown size={12} style={{ marginLeft: 4 }} />;
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
    toast('Bill upload received. Fill in fields manually or install Tesseract for OCR.');
    e.target.value = '';
  }

  // ── Inline batch (edit drawer) ─────────────────────────────────────────────────
  const [addBatchForm, setAddBatchForm] = useState(null); // null=hidden, object=open
  function addInlineBatch() {
    if (!addBatchForm || !addBatchForm.quantity) { toast.error('Enter quantity'); return; }
    const nb = { ...addBatchForm, batchId: addBatchForm.batchId || genBatchId(), price: parseFloat(addBatchForm.price) || parseFloat(form.unitPrice) || 0, batchNumber: addBatchForm.batchNumber || `LOT-${form.code}-${inlineBatches.length + 1}`, receivedDate: addBatchForm.receivedDate || new Date().toISOString().split('T')[0] };
    const updated = [...inlineBatches, nb];
    setInlineBatches(updated);
    setAddBatchForm(null);
    toast.success(`Batch added: +${nb.quantity} ${form.unit}`);
  }

  // ── Batch drawer ───────────────────────────────────────────────────────────────
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

  const columns = [
    { title: <span onClick={() => sort('code')} style={{ cursor: 'pointer' }}>CODE<SortIcon k="code" /></span>, dataIndex: 'code', key: 'code', render: (v, m) => <Text strong style={{ fontSize: 12, cursor: 'pointer' }} onClick={() => setExpandedId(expandedId === (m._id || m.id) ? null : (m._id || m.id))}>{v}</Text> },
    { title: <span onClick={() => sort('name')} style={{ cursor: 'pointer' }}>NAME<SortIcon k="name" /></span>, dataIndex: 'name', key: 'name', ellipsis: true, render: (v, m) => <Text strong style={{ cursor: 'pointer' }} onClick={() => setExpandedId(expandedId === (m._id || m.id) ? null : (m._id || m.id))}>{v}</Text> },
    { title: <span onClick={() => sort('category')} style={{ cursor: 'pointer' }}>CATEGORY<SortIcon k="category" /></span>, dataIndex: 'category', key: 'category', render: (v) => <Tag>{v}</Tag> },
    { title: 'HSN', dataIndex: 'hsnCode', key: 'hsnCode', render: (v) => <Text type="secondary" style={{ fontSize: 12 }}>{v || '—'}</Text> },
    { title: 'UNIT', dataIndex: 'unit', key: 'unit', render: (v) => <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text> },
    { title: <span onClick={() => sort('value')} style={{ cursor: 'pointer' }}>PRICE<SortIcon k="value" /></span>, key: 'price', render: (_, m) => <Text strong>₹{weightedAvgPrice(m).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</Text> },
    { title: 'GST', dataIndex: 'gstRate', key: 'gstRate', render: (v) => <Text type="secondary" style={{ fontSize: 12 }}>{v}%</Text> },
    {
      title: <span onClick={() => sort('stock')} style={{ cursor: 'pointer' }}>STOCK<SortIcon k="stock" /></span>, key: 'stock',
      render: (_, m) => {
        const qty = totalStock(m);
        const color = qty <= 0 ? '#dc2626' : (m.enableMinStock && qty <= (parseFloat(m.minStockLevel)||0)) ? '#ef4444' : qty <= (parseFloat(m.minStockLevel)||0)*2 ? '#d97706' : '#059669';
        return <Text style={{ color, fontWeight: 600, fontSize: 12 }}>{qty.toLocaleString('en-IN')}</Text>;
      },
    },
    { title: <span onClick={() => sort('status')} style={{ cursor: 'pointer' }}>STATUS<SortIcon k="status" /></span>, key: 'status', render: (_, m) => <StatusBadge m={m} /> },
    {
      title: 'ACTIONS', key: 'actions', width: 160,
      render: (_, m) => (
        <Space size={2}>
          <Button type="text" size="small" icon={<TestTube2 size={14} color="#d97706" />} title="Add Batch" onClick={() => { setShowBatch(m); setBatchData(emptyBatch()); }} />
          <Button type="text" size="small" icon={<QrCode size={14} color="#2563eb" />} title="Print QR" onClick={() => setShowQR(m)} />
          <Button type="text" size="small" icon={<Pencil size={14} />} title="Edit" onClick={() => openEdit(m)} />
          <Button type="text" size="small" icon={<Trash2 size={14} color="#ef4444" />} title="Delete" onClick={() => deleteMat(m)} />
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <Space>
          <div style={{ width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#2563eb14', color: '#2563eb' }}>
            <FlaskConical size={18} />
          </div>
          <div>
            <Title level={5} style={{ marginBottom: 0 }}>Raw Material Inventory</Title>
            <Text type="secondary" style={{ fontSize: 11 }}>BioTech / Cosmetic ERP — ISO 9001:2015</Text>
          </div>
        </Space>
        <Space wrap>
          <input ref={importInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={importCSV} />
          <Button icon={<Upload size={14} />} onClick={() => importInputRef.current?.click()}>Bulk Import</Button>
          <Button icon={<Cloud size={14} />} loading={syncing} onClick={syncLS}>Sync LS</Button>
          <Button icon={<Download size={14} />} onClick={exportCSV}>Export CSV</Button>
          <Button type="primary" icon={<Plus size={14} />} onClick={openCreate}>Add Material</Button>
        </Space>
      </div>

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col span={5}><MetricCard label="Total Materials" value={stats.total} sub="Active SKUs" icon={<Package size={18} />} color="#7c3aed" /></Col>
        <Col span={5}><MetricCard label="Total Inventory Value" value={`₹${stats.totalValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`} sub="Across all batches" icon={<IndianRupee size={18} />} color="#059669" /></Col>
        <Col span={5}>
          <MetricCard
            label="Avg Cost Change (MoM)"
            value={(stats.costChange >= 0 ? '+' : '') + stats.costChange.toFixed(1) + '%'}
            sub={(stats.costChange >= 0 ? 'Up' : 'Down') + ' vs last month'}
            icon={<BarChart3 size={18} />} color="#2563eb"
          />
        </Col>
        <Col span={5}><MetricCard label="Low Stock Alerts" value={stats.low} sub="Items below min" icon={<AlertTriangle size={18} />} color="#dc2626" onClick={() => setShowLowStock(true)} /></Col>
        <Col span={4}><MetricCard label="Expiring Soon" value={stats.expiring} sub="Within 30 days" icon={<CalendarClock size={18} />} color="#d97706" /></Col>
      </Row>

      <Card
        title={<Space size={8}><Package size={16} />Materials Master</Space>}
        extra={
          <Space>
            <Input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search name, SKU, supplier, HSN..."
              prefix={<Search size={14} color="#94a3b8" />}
              style={{ width: 280 }}
            />
            <Select value={catFilter} onChange={setCatFilter} style={{ width: 160 }}
              options={[{ label: 'All Categories', value: 'All' }, ...COSMETIC_CATEGORIES.map(c => ({ label: c, value: c }))]} />
            <Select value={statusFilter} onChange={setStatusFilter} style={{ width: 130 }}
              options={[{ label: 'All Status', value: 'All' }, { label: 'In Stock', value: 'In' }, { label: 'Low', value: 'Low' }, { label: 'Out', value: 'Out' }]} />
          </Space>
        }
        styles={{ body: { padding: 0 } }}
      >
        <Table
          rowKey={(m) => m._id || m.id}
          columns={columns}
          dataSource={sorted}
          loading={isLoading}
          pagination={false}
          locale={{ emptyText: <Empty description={<><Text strong>No materials found</Text><div><Text type="secondary" style={{ fontSize: 12 }}>Try adjusting your search or add a new material.</Text></div></>} /> }}
          expandable={{
            expandedRowKeys: expandedId ? [expandedId] : [],
            showExpandColumn: false,
            expandedRowRender: (m) => {
              const id = m._id || m.id;
              return (
                <Row gutter={24}>
                  <Col span={12}>
                    <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>Product Image</Text>
                    <div
                      onClick={() => document.getElementById(`rmImg-${id}`).click()}
                      style={{ width: 80, height: 80, border: '2px dashed #e2e8f0', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', overflow: 'hidden', background: '#fff', marginTop: 8, marginBottom: 16 }}
                    >
                      {m.image ? <img src={m.image} alt="Product" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <ImagePlus size={20} color="#94a3b8" />}
                    </div>
                    <input type="file" id={`rmImg-${id}`} accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = ev => updateMut.mutate({ id, d: { ...m, image: ev.target.result } }); r.readAsDataURL(f); e.target.value = ''; }} />

                    <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>Batches</Text>
                    {(m.batches || []).length === 0 ? (
                      <Text type="secondary" style={{ fontSize: 12 }}>No batches recorded</Text>
                    ) : (m.batches || []).map((b, i) => {
                      const exp = batchExpLabel(b);
                      const qcPass = !b.qcStatus || b.qcStatus === 'pass';
                      return (
                        <Card
                          key={b.batchId || i} size="small" style={{ marginBottom: 8, cursor: 'pointer' }}
                          onClick={() => setEditBatch({ mat: m, data: { ...b, totalPrice: b.totalPrice || (b.price && b.quantity ? parseFloat((b.price * b.quantity).toFixed(2)) : '') } })}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <Text strong style={{ fontSize: 12 }}>{b.batchNumber || b.batchId}</Text>
                            <Space size={4}>
                              <Tag color={qcPass ? 'green' : 'red'} icon={qcPass ? <CheckCircle2 size={11} /> : <XCircle size={11} />}>{qcPass ? 'QC Pass' : 'QC Fail'}</Tag>
                              <Pencil size={11} color="#94a3b8" />
                            </Space>
                          </div>
                          <Space size={12}>
                            <Text strong style={{ fontSize: 12 }}>{b.quantity} {m.unit}</Text>
                            <Text style={{ fontSize: 12, color: '#059669', fontWeight: 600 }}>₹{b.price || m.unitPrice}/unit</Text>
                            <Text style={{ fontSize: 12, color: exp.color, fontWeight: exp.bold ? 700 : 400 }}>{exp.text}</Text>
                          </Space>
                          <div style={{ marginTop: 4 }}>
                            <Text type="secondary" style={{ fontSize: 11 }}><MapPin size={10} style={{ marginRight: 2 }} />{b.location || '—'}</Text>
                          </div>
                          {b.qcCheckedBy && <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>Checked by: {b.qcCheckedBy}{b.qcDate ? ` · ${b.qcDate}` : ''}</Text>}
                        </Card>
                      );
                    })}
                  </Col>
                  <Col span={12}>
                    <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 8 }}><ClipboardList size={12} style={{ marginRight: 4 }} />Basic Info</Text>
                    {[['Supplier', m.supplier], ['Location', m.location], ['Min Stock', m.enableMinStock ? `${m.minStockLevel} ${m.unit}` : 'Disabled'], ['Inventory Value', `₹${inventoryValue(m).toLocaleString('en-IN', {maximumFractionDigits:0})}`]].map(([k,v]) => (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                        <Text type="secondary">{k}</Text>
                        <Text strong>{v || '—'}</Text>
                      </div>
                    ))}
                  </Col>
                </Row>
              );
            },
          }}
        />
      </Card>

      {/* ════════════ ADD / EDIT DRAWER ════════════ */}
      <Drawer
        open={showForm} onClose={closeForm} width={720}
        title={editMat ? `Edit Material — ${editMat.name}` : 'Add New Raw Material'}
        footer={
          <Space style={{ width: '100%' }}>
            <Button onClick={closeForm} style={{ flex: 1 }}>Cancel</Button>
            <Button type="primary" icon={<Save size={14} />} loading={createMut.isPending || updateMut.isPending} onClick={saveMat} style={{ flex: 1 }}>
              {editMat ? 'Save Changes' : 'Add Material'}
            </Button>
          </Space>
        }
      >
        <Space direction="vertical" style={{ width: '100%' }} size={20}>
          {/* OCR Banner */}
          <Card size="small" style={{ background: '#f0fdf4', borderColor: '#bbf7d0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <Text strong style={{ fontSize: 13, color: '#166534' }}><FileText size={13} style={{ marginRight: 4 }} />Auto-populate from Bill / Label</Text>
                <div><Text style={{ fontSize: 12, color: '#16a34a' }}>Upload a photo of the product label or invoice to auto-fill fields</Text></div>
              </div>
              <input type="file" id="billImageInput" accept="image/*" style={{ display: 'none' }} onChange={onBillImageChange} />
              <Button size="small" type="primary" style={{ background: '#059669' }} icon={<Upload size={12} />} onClick={() => document.getElementById('billImageInput').click()}>Upload Bill</Button>
            </div>
          </Card>

          <Row gutter={12}>
            <Field label="Material Code" span={8}><Input value={form.code} onChange={e => setF('code', e.target.value.toUpperCase())} style={{ fontWeight: 700 }} placeholder="Auto from name" /></Field>
            <Field label="Product Name" required span={8}>
              <Input value={form.name} onChange={e => {
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
              }} placeholder="e.g., Lavender Essential Oil" />
            </Field>
            <Field label="HSN Code" span={8}>
              <div style={{ position: 'relative' }}>
                <Input value={form.hsnCode} onChange={e => onHsnInput(e.target.value)} onBlur={() => setTimeout(() => setHsnSuggestions([]), 200)} placeholder="Auto-identified or enter manually" />
                {hsnSuggestions.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.1)', zIndex: 50, maxHeight: 200, overflowY: 'auto' }}>
                    {hsnSuggestions.map(h => (
                      <div key={h.code} onMouseDown={() => { setF('hsnCode', h.code); setHsnSuggestions([]); }} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f8fafc' }}>
                        <Text strong style={{ fontSize: 12 }}>{h.code}</Text> <Text type="secondary" style={{ fontSize: 12 }}>{h.desc}</Text>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Field>
          </Row>

          <Row gutter={12}>
            <Field label="Category" required span={8}>
              <div style={{ position: 'relative' }}>
                <Input value={form.category} onChange={e => onCatInput(e.target.value)} onBlur={() => setTimeout(() => setCatSuggestions([]), 200)} placeholder="Type or select category" />
                {catSuggestions.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.1)', zIndex: 50, maxHeight: 190, overflowY: 'auto' }}>
                    {catSuggestions.map(c => (
                      <div key={c} onMouseDown={() => { setF('category', c); setCatSuggestions([]); }} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600, borderBottom: '1px solid #f8fafc' }}>{c}</div>
                    ))}
                  </div>
                )}
              </div>
            </Field>
            <Field label="Supplier Name" span={8}><Input value={form.supplier} onChange={e => setF('supplier', e.target.value)} placeholder="e.g., ABC Chemicals Pvt Ltd" /></Field>
            <Field label="Storage Location" required span={8}><Input value={form.location} onChange={e => setF('location', e.target.value)} placeholder="e.g., Warehouse A, Rack 12" /></Field>
          </Row>

          <Row gutter={12}>
            <Field label="Unit" required span={8}><Select value={form.unit} onChange={v => setF('unit', v)} style={{ width: '100%' }} options={UNITS.map(u => ({ label: u, value: u }))} /></Field>
            <Field label="Unit Price (₹)" required span={8}><Input type="number" value={form.unitPrice} onChange={e => setF('unitPrice', e.target.value)} step="0.01" min="0" /></Field>
            <Field label="GST Rate (%)" span={8}><Select value={form.gstRate} onChange={v => setF('gstRate', v)} style={{ width: '100%' }} options={[0,5,12,18,28].map(r => ({ label: `${r}`, value: r }))} /></Field>
          </Row>

          {!editMat && (
            <Row gutter={12}>
              <Field label="Initial Stock" span={8}><Input type="number" value={form.initialStock} onChange={e => setF('initialStock', e.target.value)} step="0.01" min="0" /></Field>
              <Field label="Initial Expiry" span={8}><Input type="date" value={form.initialExpiry} onChange={e => setF('initialExpiry', e.target.value)} /></Field>
              <Field label="Initial Batch #" span={8}><Input value={form.initialBatchNumber} onChange={e => setF('initialBatchNumber', e.target.value)} placeholder="e.g., LOT-2026-001" /></Field>
            </Row>
          )}

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
              <input type="checkbox" checked={form.enableMinStock} onChange={e => setF('enableMinStock', e.target.checked)} />
              Enable Min Stock Alert
            </label>
            {form.enableMinStock && (
              <Input type="number" value={form.minStockLevel} onChange={e => setF('minStockLevel', e.target.value)} step="0.01" min="0" placeholder={`Min stock (${form.unit})`} style={{ marginTop: 8, maxWidth: 240 }} />
            )}
          </div>

          {/* QC Section */}
          <Card size="small" style={{ background: '#fafafa' }}>
            <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 12 }}><ShieldCheck size={13} style={{ marginRight: 4 }} />ISO 9001:2015 Quality Control</Text>
            <Row gutter={12}>
              <Field label="QC Checked By" span={8}><Input value={form.qcChecker} onChange={e => setF('qcChecker', e.target.value)} placeholder="Inspector name" /></Field>
              <Field label="QC Number" span={8}><Input value={form.qcNumber} onChange={e => setF('qcNumber', e.target.value)} placeholder="QC-2026-001" /></Field>
              <Field label="Reference Check #" span={8}><Input value={form.refCheckNumber} onChange={e => setF('refCheckNumber', e.target.value)} placeholder="REF-2026-001" /></Field>
              <Col span={24} style={{ marginTop: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                  <input type="checkbox" checked={form.qcPassed} onChange={e => setF('qcPassed', e.target.checked)} />
                  QC Passed / Approved
                </label>
              </Col>
              <Field label="QC Notes" span={24}><Input.TextArea value={form.qcNotes} onChange={e => setF('qcNotes', e.target.value)} rows={2} placeholder="Quality observations..." /></Field>
            </Row>
          </Card>

          {/* Batch Management (Edit mode) */}
          {editMat && (
            <Card size="small" style={{ background: '#fafafa' }}>
              <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 12 }}><TestTube2 size={13} style={{ marginRight: 4 }} />Batch Management</Text>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', borderRadius: 8, border: '1px solid #f1f5f9', padding: '10px 16px', marginBottom: 12 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>Current Total Stock</Text>
                <Text strong style={{ fontSize: 18 }}>{inlineBatches.reduce((s, b) => s + (parseFloat(b.quantity) || 0), 0).toLocaleString('en-IN')} {form.unit}</Text>
              </div>
              <Space direction="vertical" style={{ width: '100%' }} size={8}>
                {inlineBatches.map((b, i) => {
                  const exp = batchExpLabel(b);
                  return (
                    <Row key={b.batchId || i} gutter={8} style={{ background: '#fff', borderRadius: 8, border: '1px solid #f1f5f9', padding: '8px 12px', margin: 0 }} align="middle">
                      <Col span={5}><Text strong style={{ fontSize: 12 }} ellipsis>{b.batchNumber || b.batchId}</Text></Col>
                      <Col span={5}><Text strong style={{ fontSize: 12 }}>{b.quantity} {form.unit}</Text></Col>
                      <Col span={5}><Text style={{ fontSize: 12, color: '#059669', fontWeight: 600 }}>₹{b.price || form.unitPrice}</Text></Col>
                      <Col span={5}><Text type="secondary" style={{ fontSize: 12 }}>{b.receivedDate ? new Date(b.receivedDate).toLocaleDateString('en-IN') : '—'}</Text></Col>
                      <Col span={4}><Text style={{ fontSize: 12, color: exp.color, fontWeight: exp.bold ? 700 : 400 }}>{exp.text}</Text></Col>
                    </Row>
                  );
                })}
              </Space>
              {addBatchForm !== null ? (
                <Card size="small" style={{ marginTop: 12 }}>
                  <Text strong style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>Add New Batch</Text>
                  <Row gutter={12}>
                    <Field label="Quantity" required span={12}><Input type="number" value={addBatchForm.quantity} onChange={e => setAddBatchForm(f => ({...f, quantity: e.target.value}))} /></Field>
                    <Field label="Batch / Lot #" span={12}><Input value={addBatchForm.batchNumber} onChange={e => setAddBatchForm(f => ({...f, batchNumber: e.target.value}))} placeholder={`LOT-${form.code}-${inlineBatches.length + 1}`} /></Field>
                    <Field label="Expiry Date" span={12}><Input type="date" value={addBatchForm.expiryDate} onChange={e => setAddBatchForm(f => ({...f, expiryDate: e.target.value}))} /></Field>
                    <Field label="Received Date" span={12}><Input type="date" value={addBatchForm.receivedDate} onChange={e => setAddBatchForm(f => ({...f, receivedDate: e.target.value}))} /></Field>
                    <Field label="Unit Price for this Batch (₹)" span={12}><Input type="number" value={addBatchForm.price} onChange={e => setAddBatchForm(f => ({...f, price: e.target.value}))} placeholder="Leave blank to use current price" /></Field>
                    <Field label="Storage Location" span={12}><Input value={addBatchForm.location} onChange={e => setAddBatchForm(f => ({...f, location: e.target.value}))} placeholder={form.location || 'e.g. Warehouse A · Rack 12'} /></Field>
                    <Field label="Notes" span={24}><Input value={addBatchForm.notes} onChange={e => setAddBatchForm(f => ({...f, notes: e.target.value}))} placeholder="Supplier, Invoice Ref..." /></Field>
                  </Row>
                  <Space style={{ marginTop: 12 }}>
                    <Button size="small" type="primary" icon={<Plus size={12} />} onClick={addInlineBatch}>Add Batch</Button>
                    <Button size="small" onClick={() => setAddBatchForm(null)}>Clear</Button>
                  </Space>
                </Card>
              ) : (
                <Button style={{ marginTop: 12 }} icon={<Plus size={14} />} onClick={() => setAddBatchForm(emptyBatch())}>Add New Batch</Button>
              )}
            </Card>
          )}
        </Space>
      </Drawer>

      {/* ════════════ QR MODAL ════════════ */}
      <Modal
        open={!!showQR} onCancel={() => setShowQR(null)} footer={null} width={380}
        title={<Space size={8}><QrCode size={16} />Print QR Label</Space>}
      >
        {showQR && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '8px 0' }}>
            <div style={{ border: '2px solid #e2e8f0', borderRadius: 12, padding: 16, background: '#fff' }}>
              <QRCode value={qrValue(showQR)} size={200} level="M" />
            </div>
            <div style={{ textAlign: 'center' }}>
              <Text strong style={{ fontSize: 15 }}>{showQR.name}</Text>
              <div><Text type="secondary" style={{ fontSize: 12, lineHeight: 1.6 }}>
                Code: {showQR.code} · HSN: {showQR.hsnCode || '—'}<br />
                Unit: {showQR.unit} · Price: ₹{showQR.unitPrice} · GST: {showQR.gstRate}%<br />
                Location: {showQR.location || '—'}
              </Text></div>
            </div>
            <Space style={{ width: '100%' }}>
              <Button type="primary" icon={<Printer size={14} />} style={{ flex: 1 }} onClick={() => window.print()}>Print Label</Button>
              <Button style={{ flex: 1 }} onClick={() => setShowQR(null)}>Close</Button>
            </Space>
          </div>
        )}
      </Modal>

      {/* ════════════ BATCH ADD DRAWER ════════════ */}
      <Drawer
        open={!!showBatch} onClose={() => setShowBatch(null)} width={460}
        title={<Space size={8}><Pencil size={14} />Add Batch to Material</Space>}
        footer={
          <Space style={{ width: '100%' }}>
            <Button style={{ flex: 1 }} onClick={() => setShowBatch(null)}>Cancel</Button>
            <Button type="primary" style={{ flex: 1 }} loading={updateMut.isPending} onClick={saveBatchModal}>Add Batch</Button>
          </Space>
        }
      >
        {showBatch && (
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Card size="small" style={{ background: '#f6faff', borderColor: '#e5edf7' }}>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ width: 38, height: 38, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fef3c7', color: '#d97706', flexShrink: 0 }}><Package size={16} /></div>
                <div style={{ minWidth: 0 }}>
                  <Text strong style={{ fontSize: 13 }}>{showBatch.name} <Text type="secondary" style={{ fontSize: 11, fontWeight: 400 }}>({showBatch.code} | HSN: {showBatch.hsnCode||'—'})</Text></Text>
                  <div style={{ marginTop: 4 }}>
                    <Space size={4} wrap>
                      <Tag>Current: {totalStock(showBatch)} {showBatch.unit}</Tag>
                      {showBatch.location && <Tag>{showBatch.location}</Tag>}
                      {showBatch.supplier && <Tag>{showBatch.supplier}</Tag>}
                    </Space>
                  </div>
                </div>
              </div>
            </Card>

            <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>Batch Details</Text>

            <Row gutter={8}>
              <Field label="Quantity to Add" required span={12}>
                <Input type="number" value={batchData.quantity} onChange={e => { const q = e.target.value; const t = batchData.totalPrice; setBatchData(b => ({ ...b, quantity: q, price: q && t ? parseFloat((parseFloat(t)/parseFloat(q)).toFixed(4)) : '' })); }} step="0.01" min="0" placeholder="e.g. 100" />
              </Field>
              <Field label="Unit" span={12}>
                <Select value={batchData.unit || showBatch.unit} onChange={v => setBatchData(b => ({...b, unit: v}))} style={{ width: '100%' }} options={['kg','g','liter','ml','tonne','piece','box','drum','bag'].map(u => ({ label: u, value: u }))} />
              </Field>
            </Row>
            <Row gutter={8}>
              <Field label="Total Price (₹)" required span={12}>
                <Input type="number" value={batchData.totalPrice} onChange={e => { const t = e.target.value; const q = batchData.quantity; setBatchData(b => ({ ...b, totalPrice: t, price: q && t ? parseFloat((parseFloat(t)/parseFloat(q)).toFixed(4)) : '' })); }} step="0.01" min="0" placeholder="e.g. 5000" />
              </Field>
              <Field label="Unit Price (auto)" span={12}>
                <Input readOnly value={batchData.price ? `₹ ${batchData.price} / ${batchData.unit || showBatch.unit}` : ''} placeholder="₹ — / unit" style={{ color: '#059669', fontWeight: 600 }} />
              </Field>
            </Row>
            <Row gutter={8}>
              <Field label="Batch / Lot Number" span={12}><Input value={batchData.batchNumber} onChange={e => setBatchData(b => ({...b, batchNumber: e.target.value}))} placeholder={`LOT-${showBatch.code}-${(showBatch.batches?.length||0)+1}`} /></Field>
              <Field label="Received Date" span={12}><Input type="date" value={batchData.receivedDate} onChange={e => setBatchData(b => ({...b, receivedDate: e.target.value}))} /></Field>
            </Row>
            <Row gutter={8}>
              <Field label="Expiry Date" span={12}><Input type="date" value={batchData.expiryDate} onChange={e => setBatchData(b => ({...b, expiryDate: e.target.value}))} /></Field>
              <Field label="Storage Location" required span={12}><Input value={batchData.location} onChange={e => setBatchData(b => ({...b, location: e.target.value}))} placeholder={showBatch.location || 'e.g. Warehouse A · CS1'} /></Field>
            </Row>
            <Row gutter={8}>
              <Field label="Supplier Name" required span={12}><Input value={batchData.supplier} onChange={e => setBatchData(b => ({...b, supplier: e.target.value}))} placeholder={showBatch.supplier || 'e.g. Kerala Oils Ltd'} /></Field>
              <Field label="Supplier Invoice" span={12}><Input value={batchData.invoice} onChange={e => setBatchData(b => ({...b, invoice: e.target.value}))} placeholder="INV-2026-123" /></Field>
            </Row>

            <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>Quality Check</Text>
            <Card size="small" style={{ background: '#f0fdf4', borderStyle: 'dashed', borderColor: '#86efac' }}>
              <Text strong style={{ fontSize: 12, color: '#166534', display: 'block', marginBottom: 10 }}><CheckCircle2 size={13} style={{ marginRight: 4 }} />Mandatory before adding</Text>
              <Row gutter={8}>
                <Field label="QC Checked By" required span={12}>
                  <Select value={batchData.qcCheckedBy || undefined} onChange={v => setBatchData(b => ({...b, qcCheckedBy: v}))} style={{ width: '100%' }} placeholder="Select QC person"
                    options={['Ravi (QC Lead)', 'Priya (QC Analyst)', 'Karthik (Shift QC)', 'Divya (QC Manager)', 'Suresh (Sr. QC)'].map(v => ({ label: v, value: v }))} />
                </Field>
                <Field label="QC Check Date" required span={12}><Input type="date" value={batchData.qcDate} onChange={e => setBatchData(b => ({...b, qcDate: e.target.value}))} /></Field>
              </Row>
              <div style={{ marginTop: 8, marginBottom: 8 }}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>QC Status</Text>
                <Space.Compact style={{ width: '100%' }}>
                  <Button style={{ flex: 1 }} type={batchData.qcStatus === 'pass' ? 'primary' : 'default'} onClick={() => setBatchData(b => ({...b, qcStatus: 'pass'}))} icon={<CheckCircle2 size={12} />}>QC Pass</Button>
                  <Button style={{ flex: 1 }} danger type={batchData.qcStatus === 'fail' ? 'primary' : 'default'} onClick={() => setBatchData(b => ({...b, qcStatus: 'fail'}))} icon={<XCircle size={12} />}>QC Fail</Button>
                </Space.Compact>
                {batchData.qcStatus === 'fail' && <Text type="danger" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>If QC fails, batch is rejected and will not be added to inventory.</Text>}
                {batchData.qcStatus === 'pass' && <Text style={{ fontSize: 11, color: '#047857', display: 'block', marginTop: 4 }}>If QC fails, the batch is rejected and returned to the supplier — it will not be added to inventory.</Text>}
              </div>
              <Field label="QC Notes" span={24}><Input.TextArea value={batchData.qcNotes} onChange={e => setBatchData(b => ({...b, qcNotes: e.target.value}))} placeholder="e.g. COA verified, aroma OK…" rows={2} /></Field>
            </Card>

            {(showBatch.batches||[]).length > 0 && (
              <>
                <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>Existing Batches — {showBatch.batches.length} total</Text>
                <Space direction="vertical" style={{ width: '100%' }} size={6}>
                  {showBatch.batches.map((b, i) => {
                    const today = new Date();
                    const days = b.expiryDate ? Math.ceil((new Date(b.expiryDate) - today) / (1000*60*60*24)) : null;
                    const badgeColor = days === null ? 'default' : days < 0 ? 'red' : days <= 30 ? 'orange' : 'green';
                    const badgeTxt = days === null ? '' : days < 0 ? 'Expired' : days <= 30 ? 'Expiring' : 'Active';
                    const exp = batchExpLabel(b);
                    return (
                      <div key={b.batchId||i} style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #f1f5f9', background: '#fafbfc' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                          <Text strong style={{ fontSize: 12 }} ellipsis>{b.batchNumber||b.batchId}</Text>
                          <Text style={{ fontSize: 12 }}>{b.quantity} {showBatch.unit}</Text>
                          <Text strong style={{ fontSize: 12, color: '#059669' }}>₹{b.price||showBatch.unitPrice}</Text>
                          {badgeTxt && <Tag color={badgeColor} style={{ fontSize: 10 }}>{badgeTxt}</Tag>}
                        </div>
                        <Text type="secondary" style={{ fontSize: 11 }}>Rcvd: {b.receivedDate ? new Date(b.receivedDate).toLocaleDateString('en-IN') : '—'} · {exp.text}</Text>
                      </div>
                    );
                  })}
                </Space>
              </>
            )}
          </Space>
        )}
      </Drawer>

      {/* ════════════ BATCH EDIT DRAWER ════════════ */}
      <Drawer
        open={!!editBatch} onClose={() => setEditBatch(null)} width={460}
        title={<Space size={8}><Pencil size={14} />Edit Batch</Space>}
        footer={
          editBatch && (
            <Space style={{ width: '100%' }}>
              <Button style={{ flex: 1 }} onClick={() => setEditBatch(null)}>Cancel</Button>
              <Button
                type="primary" style={{ flex: 1 }} loading={updateBatchMut.isPending}
                icon={<Save size={14} />}
                onClick={() => { const { mat, data } = editBatch; updateBatchMut.mutate({ matId: mat._id||mat.id, batchId: data._id, d: { quantity: data.quantity, totalPrice: data.totalPrice, price: data.price, batchNumber: data.batchNumber, expiryDate: data.expiryDate||null, receivedDate: data.receivedDate||null, location: data.location, supplier: data.supplier, invoice: data.invoice, notes: data.notes, qcCheckedBy: data.qcCheckedBy, qcDate: data.qcDate, qcStatus: data.qcStatus, qcNotes: data.qcNotes } }); }}
              >
                Save Changes
              </Button>
            </Space>
          )
        }
      >
        {editBatch && (
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Card size="small" style={{ background: '#f6faff', borderColor: '#e5edf7' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ede9fe', color: '#7c3aed', flexShrink: 0 }}><Package size={14} /></div>
                <div style={{ minWidth: 0 }}>
                  <Text strong style={{ fontSize: 13 }} ellipsis>{editBatch.mat.name}</Text>
                  <div><Text type="secondary" style={{ fontSize: 11 }}>{editBatch.mat.code} · {editBatch.data.batchNumber || editBatch.data.batchId}</Text></div>
                </div>
              </div>
            </Card>

            <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>Batch Details</Text>
            <Row gutter={8}>
              <Field label="Batch / Lot #" span={12}><Input value={editBatch.data.batchNumber || ''} onChange={e => setEditBatch(s => ({...s, data: {...s.data, batchNumber: e.target.value}}))} /></Field>
              <Field label="Quantity" span={12}><Input type="number" value={editBatch.data.quantity || ''} onChange={e => { const q = e.target.value; const t = editBatch.data.totalPrice; setEditBatch(s => ({...s, data: {...s.data, quantity: q, price: q && t ? parseFloat((parseFloat(t)/parseFloat(q)).toFixed(4)) : s.data.price}})); }} /></Field>
              <Field label="Total Price (₹)" span={12}><Input type="number" value={editBatch.data.totalPrice || ''} onChange={e => { const t = e.target.value; const q = editBatch.data.quantity; setEditBatch(s => ({...s, data: {...s.data, totalPrice: t, price: q && t ? parseFloat((parseFloat(t)/parseFloat(q)).toFixed(4)) : s.data.price}})); }} /></Field>
              <Field label={`Unit Price (₹/${editBatch.mat.unit})`} span={12}><Input type="number" value={editBatch.data.price || ''} onChange={e => { const p = e.target.value; const q = editBatch.data.quantity; setEditBatch(s => ({...s, data: {...s.data, price: p, totalPrice: p && q ? parseFloat((parseFloat(p)*parseFloat(q)).toFixed(2)) : s.data.totalPrice}})); }} placeholder="e.g. 1250" style={{ color: '#059669', fontWeight: 600 }} /></Field>
              <Field label="Received Date" span={12}><Input type="date" value={editBatch.data.receivedDate || ''} onChange={e => setEditBatch(s => ({...s, data: {...s.data, receivedDate: e.target.value}}))} /></Field>
              <Field label="Expiry Date" span={12}><Input type="date" value={editBatch.data.expiryDate || ''} onChange={e => setEditBatch(s => ({...s, data: {...s.data, expiryDate: e.target.value}}))} /></Field>
              <Field label="Storage Location" span={12}><Input value={editBatch.data.location || ''} onChange={e => setEditBatch(s => ({...s, data: {...s.data, location: e.target.value}}))} placeholder={editBatch.mat.location || 'e.g. Warehouse A · Rack 12'} /></Field>
              <Field label="Supplier" span={12}><Input value={editBatch.data.supplier || ''} onChange={e => setEditBatch(s => ({...s, data: {...s.data, supplier: e.target.value}}))} placeholder={editBatch.mat.supplier || ''} /></Field>
              <Field label="Supplier Invoice" span={24}><Input value={editBatch.data.invoice || ''} onChange={e => setEditBatch(s => ({...s, data: {...s.data, invoice: e.target.value}}))} placeholder="INV-2026-123" /></Field>
            </Row>

            <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>Quality Check</Text>
            <Card size="small" style={{ background: '#f0fdf4', borderStyle: 'dashed', borderColor: '#86efac' }}>
              <Row gutter={8}>
                <Field label="QC Checked By" span={12}>
                  <Select value={editBatch.data.qcCheckedBy || undefined} onChange={v => setEditBatch(s => ({...s, data: {...s.data, qcCheckedBy: v}}))} style={{ width: '100%' }} placeholder="Select QC person"
                    options={['Ravi (QC Lead)', 'Priya (QC Analyst)', 'Karthik (Shift QC)', 'Divya (QC Manager)', 'Suresh (Sr. QC)'].map(v => ({ label: v, value: v }))} />
                </Field>
                <Field label="QC Check Date" span={12}><Input type="date" value={editBatch.data.qcDate || ''} onChange={e => setEditBatch(s => ({...s, data: {...s.data, qcDate: e.target.value}}))} /></Field>
              </Row>
              <div style={{ margin: '8px 0' }}>
                <Space.Compact style={{ width: '100%' }}>
                  <Button style={{ flex: 1 }} type={editBatch.data.qcStatus === 'pass' ? 'primary' : 'default'} onClick={() => setEditBatch(s => ({...s, data: {...s.data, qcStatus: 'pass'}}))} icon={<CheckCircle2 size={12} />}>QC Pass</Button>
                  <Button style={{ flex: 1 }} danger type={editBatch.data.qcStatus === 'fail' ? 'primary' : 'default'} onClick={() => setEditBatch(s => ({...s, data: {...s.data, qcStatus: 'fail'}}))} icon={<XCircle size={12} />}>QC Fail</Button>
                </Space.Compact>
              </div>
              <Field label="QC Notes" span={24}><Input.TextArea value={editBatch.data.qcNotes || ''} onChange={e => setEditBatch(s => ({...s, data: {...s.data, qcNotes: e.target.value}}))} rows={2} placeholder="e.g. COA verified, aroma OK…" /></Field>
            </Card>

            <Field label="Notes" span={24}><Input value={editBatch.data.notes || ''} onChange={e => setEditBatch(s => ({...s, data: {...s.data, notes: e.target.value}}))} placeholder="Any notes…" /></Field>
          </Space>
        )}
      </Drawer>

      {/* ════════════ LOW STOCK DRAWER ════════════ */}
      <Drawer
        open={showLowStock} onClose={() => setShowLowStock(false)} width={460}
        title={<Space size={8}><AlertTriangle size={16} color="#d97706" />Low Stock Alerts</Space>}
        footer={<Button block onClick={() => setShowLowStock(false)}>Close</Button>}
      >
        {outOfStockMats.length === 0 && lowStockMats.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <CheckCircle2 size={32} color="#22c55e" style={{ marginBottom: 8 }} />
            <div><Text strong>All stock levels are healthy</Text></div>
            <Text type="secondary" style={{ fontSize: 12 }}>No materials are below minimum stock levels.</Text>
          </div>
        ) : (
          <Space direction="vertical" style={{ width: '100%' }} size={20}>
            {outOfStockMats.length > 0 && (
              <div>
                <Text strong style={{ fontSize: 12, color: '#dc2626', display: 'block', marginBottom: 8 }}><Ban size={13} style={{ marginRight: 4 }} />Out of Stock ({outOfStockMats.length})</Text>
                <Space direction="vertical" style={{ width: '100%' }} size={0}>
                  {outOfStockMats.map(m => (
                    <div key={m._id||m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid #f8fafc', fontSize: 12 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
                      <div style={{ flex: 1 }}><Text strong>{m.name}</Text> <Text type="secondary">({m.code}) — {m.location||'—'}</Text></div>
                      <Tag color="red">OUT</Tag>
                    </div>
                  ))}
                </Space>
              </div>
            )}
            {lowStockMats.length > 0 && (
              <div>
                <Text strong style={{ fontSize: 12, color: '#d97706', display: 'block', marginBottom: 8 }}><AlertTriangle size={13} style={{ marginRight: 4 }} />Low Stock ({lowStockMats.length})</Text>
                <Space direction="vertical" style={{ width: '100%' }} size={0}>
                  {lowStockMats.map(m => (
                    <div key={m._id||m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid #f8fafc', fontSize: 12 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />
                      <div style={{ flex: 1 }}><Text strong>{m.name}</Text> <Text type="secondary">({m.code}) — Stock: {totalStock(m)} / Min: {m.minStockLevel} {m.unit}</Text></div>
                      <Tag color="orange">LOW</Tag>
                    </div>
                  ))}
                </Space>
              </div>
            )}
          </Space>
        )}
      </Drawer>
    </div>
  );
}
