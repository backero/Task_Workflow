import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import QRCode from 'react-qr-code';
import './RawMaterialsPage.css';

// ── Constants ─────────────────────────────────────────────────────────────────
const DB_KEY = 'rawMaterialDB_v8';

const hsnDataset = [
  {code:'3301',desc:'Essential oils (Lavender, Rose, Peppermint, etc.)'},
  {code:'3302',desc:'Odoriferous substances used for perfume / cosmetics'},
  {code:'3303',desc:'Perfumes and toilet waters'},
  {code:'3304',desc:'Beauty / make-up preparations & skin care'},
  {code:'3305',desc:'Hair preparations (shampoo, conditioner, dye)'},
  {code:'3306',desc:'Oral hygiene products (toothpaste, mouthwash)'},
  {code:'3307',desc:'Pre-shave, shaving, after-shave, deodorants'},
  {code:'3401',desc:'Soap; organic surface-active products'},
  {code:'3402',desc:'Organic surface-active agents (surfactants)'},
  {code:'3403',desc:'Lubricating preparations, cutting oils'},
  {code:'3404',desc:'Artificial waxes and prepared waxes'},
  {code:'3405',desc:'Polishes and creams, for leather, wood, etc.'},
  {code:'3501',desc:'Casein, caseinates, other casein derivatives'},
  {code:'3502',desc:'Albumins, albuminates, derivatives'},
  {code:'3503',desc:'Gelatin and derivatives, isinglass, glues'},
  {code:'3504',desc:'Peptones, other protein substances'},
  {code:'3505',desc:'Dextrins, glues based on starches'},
  {code:'3506',desc:'Prepared glues and adhesives'},
  {code:'3806',desc:'Rosin and resin acids, derivatives'},
  {code:'3808',desc:'Insecticides, rodenticides, fungicides, etc.'},
  {code:'3814',desc:'Organic composite solvents and thinners'},
  {code:'3822',desc:'Diagnostic / lab reagents on any backing'},
  {code:'3824',desc:'Chemical products and preparations, N.E.S.'},
  {code:'2901',desc:'Acyclic hydrocarbons (methane, propane, butane)'},
  {code:'2902',desc:'Cyclic hydrocarbons (benzene, toluene, xylene)'},
  {code:'2903',desc:'Halogenated derivatives of hydrocarbons'},
  {code:'2905',desc:'Acyclic alcohols and derivatives'},
  {code:'2906',desc:'Cyclic alcohols and derivatives'},
  {code:'2915',desc:'Saturated acyclic monocarboxylic acids'},
  {code:'2916',desc:'Unsaturated acyclic / cyclic monocarboxylic acids'},
  {code:'2922',desc:'Oxygen-function amino-compounds'},
  {code:'2933',desc:'Heterocyclic compounds with nitrogen'},
  {code:'2936',desc:'Vitamins and derivatives (unmixed)'},
  {code:'2937',desc:'Hormones and derivatives (steroids, peptides)'},
  {code:'2941',desc:'Antibiotics'},
  {code:'3003',desc:'Medicaments (not antibiotics, not vaccines)'},
  {code:'3004',desc:'Medicaments in measured doses / retail forms'},
  {code:'3006',desc:'Pharmaceutical goods (surgical sutures, bandages)'},
  {code:'1516',desc:'Animal / vegetable fats and oils, hydrogenated'},
  {code:'1520',desc:'Glycerol, crude; glycerol waters'},
  {code:'1521',desc:'Vegetable waxes, beeswax, other insect waxes'},
  {code:'2101',desc:'Extracts, essences, concentrates of coffee, tea'},
  {code:'2103',desc:'Sauces and preparations; mixed condiments'},
  {code:'2106',desc:'Food preparations not elsewhere specified'},
  {code:'2207',desc:'Ethyl alcohol (undenatured, >=80% alcohol)'},
  {code:'2208',desc:'Undenatured ethyl alcohol (<80%) + spirits'},
  {code:'1211',desc:'Plants and parts for perfumery, pharmacy, insecticides'},
  {code:'1301',desc:'Lac; natural gums, resins, gum-resins and oleoresins'},
  {code:'1302',desc:'Vegetable saps and extracts; pectates, agar-agar'},
  {code:'1401',desc:'Vegetable materials (bamboo, rattan, etc.)'},
  {code:'3101',desc:'Animal / vegetable fertilizers (guano, manure)'},
  {code:'3201',desc:'Tanning extracts of vegetable origin'},
  {code:'3202',desc:'Synthetic organic tanning substances'},
  {code:'3203',desc:'Coloring matter of vegetable or animal origin'},
  {code:'3204',desc:'Synthetic organic coloring matter'},
  {code:'3206',desc:'Other coloring matter, pigments, preparations'},
  {code:'3212',desc:'Pigments for ceramic, glass, enamel, etc.'},
];

const cosmeticCategories = ['Fragrance','Hydrosol','Essential Oil','Carrier Oil','Active Ingredients','Preservatives','Surfactants','Emulsifiers','Thickeners','Humectants','Butters','Vitamins','Peptides','Proteins','Wax Esters','Silicones','Botanical Extracts','Antioxidants','Sunscreen Agents','Exfoliants','pH Adjusters','Chelating Agents','Solubilizers','Colorants','Film Formers','Penetration Enhancers','Packaging Materials','Lab Equipment','Inorganic Pigments','Natural Colorants','Synthetic Dyes','Ceramic Pigments','Flavoring Extracts','Food Additives','Other'];

// ── Helpers ───────────────────────────────────────────────────────────────────
function generateCode(id) { return 'RM-' + String(id).padStart(4, '0'); }
function generateBatchId() { return 'BATCH-' + Math.random().toString(36).substr(2, 9).toUpperCase(); }
function getStock(m) { return (m.batches || []).reduce((sum, b) => sum + (parseFloat(b.quantity) || 0), 0); }
function getValue(m) { return getStock(m) * (parseFloat(m.unitPrice) || 0); }
function getStatus(m) {
  const stock = getStock(m); const min = parseFloat(m.minStockLevel) || 0;
  if (stock <= 0) return { label: 'Out', cls: 'tag-danger' };
  if (m.enableMinStock && stock <= min) return { label: 'Low', cls: 'tag-warning' };
  if (stock <= min * 2) return { label: 'Medium', cls: 'tag-warning' };
  return { label: 'OK', cls: 'tag-success' };
}
function isExpiringSoon(m) {
  const today = new Date(); const in30 = new Date(); in30.setDate(today.getDate() + 30);
  return (m.batches || []).some(b => { if (!b.expiryDate) return false; const e = new Date(b.expiryDate); return e <= in30 && e >= today; });
}
function isExpired(m) {
  const today = new Date();
  return (m.batches || []).some(b => { if (!b.expiryDate) return false; return new Date(b.expiryDate) < today; });
}
function getBatchExpInfo(expiryDate) {
  if (!expiryDate) return { cls: '', text: 'No expiry' };
  const exp = new Date(expiryDate); const today = new Date();
  const days = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));
  if (days < 0) return { cls: 'expired', text: `Expired (${Math.abs(days)}d ago)` };
  if (days <= 30) return { cls: 'near', text: `Expiring in ${days}d` };
  return { cls: '', text: `Exp: ${exp.toLocaleDateString('en-IN')}` };
}

// ── Demo data ─────────────────────────────────────────────────────────────────
function makeDemoData(startId) {
  let id = startId;
  const demo = [
    {name:'Lavender Essential Oil',hsnCode:'3301',category:'Essential Oil',supplier:'Kerala Oils Ltd',location:'Warehouse A, Cold Storage 1',unit:'liter',unitPrice:850,gstRate:12,enableMinStock:true,minStockLevel:5,image:null,qcChecker:'A. Sharma',qcNumber:'QC-2026-001',refCheckNumber:'REF-001',qcPassed:true,qcNotes:'Color and aroma within spec. GC-MS verified.',batches:[{batchId:'BATCH-001',quantity:12,price:850,batchNumber:'LOT-2025-LV-01',expiryDate:'2027-03-15',receivedDate:'2025-01-10',notes:'Kerala Oils Ltd, Invoice: INV-2561'}]},
    {name:'Rose Hydrosol',hsnCode:'3301',category:'Hydrosol',supplier:'Floral Extracts India',location:'Warehouse A, Shelf B4',unit:'liter',unitPrice:320,gstRate:12,enableMinStock:true,minStockLevel:10,image:null,qcChecker:'R. Patel',qcNumber:'QC-2026-002',refCheckNumber:'REF-002',qcPassed:true,qcNotes:'pH 4.8, microbial test pass.',batches:[{batchId:'BATCH-002',quantity:25,price:320,batchNumber:'RH-2025-03',expiryDate:'2026-08-20',receivedDate:'2025-03-05',notes:'Floral Extracts India, Invoice: FE-882'}]},
    {name:'Hyaluronic Acid (1% Solution)',hsnCode:'2937',category:'Active Ingredients',supplier:'Bloomage Biotech',location:'Warehouse B, Lab Fridge 2',unit:'kg',unitPrice:4500,gstRate:18,enableMinStock:true,minStockLevel:2,image:null,qcChecker:'Dr. Mehta',qcNumber:'QC-2026-003',refCheckNumber:'REF-003',qcPassed:true,qcNotes:'Molecular weight confirmed at 1.5 MDa. COA attached.',batches:[{batchId:'BATCH-003',quantity:5,price:4500,batchNumber:'BB-HA-2025-001',expiryDate:'2027-01-30',receivedDate:'2025-02-12',notes:'Bloomage Biotech, Invoice: BB-3301'}]},
    {name:'Shea Butter (Refined)',hsnCode:'3301',category:'Butters',supplier:'Ghana Naturals',location:'Warehouse C, Ambient Storage',unit:'kg',unitPrice:650,gstRate:12,enableMinStock:true,minStockLevel:8,image:null,qcChecker:'P. Kumar',qcNumber:'QC-2026-004',refCheckNumber:'REF-004',qcPassed:true,qcNotes:'Melting point 38-42°C, odor neutral, free fatty acid <0.5%.',batches:[{batchId:'BATCH-004',quantity:20,price:650,batchNumber:'SB-GN-2024-88',expiryDate:'2026-06-10',receivedDate:'2024-11-20',notes:'Ghana Naturals, Invoice: GN-4412'},{batchId:'BATCH-005',quantity:15,price:670,batchNumber:'SB-GN-2025-01',expiryDate:'2026-12-15',receivedDate:'2025-01-18',notes:'Ghana Naturals, Invoice: GN-4450'}]},
    {name:'Sodium Lauryl Sulfate (SLS)',hsnCode:'3402',category:'Surfactants',supplier:'Galaxy Surfactants',location:'Warehouse D, Chemical Bay 3',unit:'kg',unitPrice:180,gstRate:18,enableMinStock:true,minStockLevel:15,image:null,qcChecker:'S. Reddy',qcNumber:'QC-2026-005',refCheckNumber:'REF-005',qcPassed:true,qcNotes:'Active matter 96%, pH 7.2, color clear.',batches:[{batchId:'BATCH-006',quantity:50,price:180,batchNumber:'SLS-GS-2025-112',expiryDate:'2027-02-28',receivedDate:'2025-04-10',notes:'Galaxy Surfactants, Invoice: GS-9901'}]},
    {name:'Vitamin E Acetate',hsnCode:'2936',category:'Vitamins',supplier:'DSM India',location:'Warehouse B, Lab Fridge 1',unit:'kg',unitPrice:2200,gstRate:18,enableMinStock:true,minStockLevel:3,image:null,qcChecker:'Dr. Rao',qcNumber:'QC-2026-006',refCheckNumber:'REF-006',qcPassed:true,qcNotes:'Purity 99.2% by HPLC. Tocopherol content verified.',batches:[{batchId:'BATCH-007',quantity:3,price:2200,batchNumber:'VE-DSM-2025-44',expiryDate:'2026-09-30',receivedDate:'2025-03-22',notes:'DSM India, Invoice: DSM-2025-1144'}]},
    {name:'Phenoxyethanol (Preservative)',hsnCode:'3824',category:'Preservatives',supplier:'Lonza India',location:'Warehouse D, Chemical Bay 1',unit:'kg',unitPrice:1200,gstRate:18,enableMinStock:true,minStockLevel:2,image:null,qcChecker:'M. Gupta',qcNumber:'QC-2026-007',refCheckNumber:'REF-007',qcPassed:true,qcNotes:'Assay 99.8%, melting point 88-91°C, COA matches.',batches:[{batchId:'BATCH-008',quantity:2,price:1200,batchNumber:'PH-LZ-2025-09',expiryDate:'2026-11-15',receivedDate:'2025-05-01',notes:'Lonza India, Invoice: LZ-5582'}]},
  ];
  const result = [];
  demo.forEach(d => {
    result.push({ id: id, code: generateCode(id), ...d, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    id++;
  });
  return { materials: result, nextId: id };
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function RawMaterials() {
  const [materials, setMaterials] = useState([]);
  const [nextId, setNextId] = useState(1);
  const [sortKey, setSortKey] = useState('code');
  const [sortDir, setSortDir] = useState(1);
  const [detailTarget, setDetailTarget] = useState(null);
  const [searchVal, setSearchVal] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterStock, setFilterStock] = useState('');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [showLowStockModal, setShowLowStockModal] = useState(false);
  const [showScanOverlay, setShowScanOverlay] = useState(false);
  const [scanText, setScanText] = useState('Scanning...');

  // Add/Edit form
  const [editId, setEditId] = useState('');
  const [form, setForm] = useState({
    materialCode: '', productName: '', hsnCode: '', category: '', supplier: '',
    location: '', unit: '', unitPrice: '', gstRate: '12', initialStock: '0',
    initialExpiry: '', initialBatchNumber: '', enableMinStock: true,
    enableLowStockAlert: true, minStockLevel: '10',
    qcChecker: '', qcNumber: '', refCheckNumber: '', qcPassed: false, qcNotes: '',
  });
  const [addModalTitle, setAddModalTitle] = useState('➕ Add New Raw Material');
  const [existingMatch, setExistingMatch] = useState(null);
  const [showExistingNotice, setShowExistingNotice] = useState(false);
  const [existingNoticeFound, setExistingNoticeFound] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const [showEditBatchSection, setShowEditBatchSection] = useState(false);
  const [hsnSuggestions, setHsnSuggestions] = useState([]);
  const [catSuggestions, setCatSuggestions] = useState([]);
  const [voiceStatus, setVoiceStatus] = useState('Click to record');
  const [voiceTranscript, setVoiceTranscript] = useState('(Voice transcript...)');
  const [isRecording, setIsRecording] = useState(false);

  // Edit batch inline
  const [editBatch, setEditBatch] = useState({ qty: '', number: '', expiry: '', received: '', price: '', notes: '' });

  // Batch modal
  const [batchTarget, setBatchTarget] = useState(null);
  const [batchModalForm, setBatchModalForm] = useState({ qty: '', price: '', number: '', expiry: '', received: '', notes: '' });

  // QR modal
  const [qrTarget, setQrTarget] = useState(null);

  // Low stock modal
  const [lowStockData, setLowStockData] = useState({ out: [], low: [] });

  // Toasts
  const [toasts, setToasts] = useState([]);

  // Dashboard computed values
  const [dashCostChange, setDashCostChange] = useState('+0.0%');
  const [dashCostChangeDir, setDashCostChangeDir] = useState('up');
  const [dashCostChangeSub, setDashCostChangeSub] = useState('↗ +0.0% vs last month');

  const recognitionRef = useRef(null);
  const tesseractWorkerRef = useRef(null);

  // Load external scripts (Tesseract, pdf.js)
  useEffect(() => {
    const loadScript = (src, onload) => {
      if (document.querySelector(`script[src="${src}"]`)) { if (onload) onload(); return; }
      const s = document.createElement('script');
      s.src = src;
      if (onload) s.onload = onload;
      document.head.appendChild(s);
    };
    loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
    loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', () => {
      if (window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    });
  }, []);

  // Load DB
  useEffect(() => { loadDB(); }, []);

  function loadDB() {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        const mats = data.materials || [];
        const nid = data.nextId || 1;
        if (mats.length) { setMaterials(mats); setNextId(nid); computeDashCost(mats); return; }
      }
    } catch (e) { showToast('Failed to load data', 'error'); }
    const { materials: demoMats, nextId: demoNextId } = makeDemoData(1);
    const saved = { materials: demoMats, nextId: demoNextId };
    localStorage.setItem(DB_KEY, JSON.stringify(saved));
    setMaterials(demoMats);
    setNextId(demoNextId);
    computeDashCost(demoMats);
    showToast('Demo data loaded: 7 materials', 'success');
  }

  function saveDB(mats, nid) {
    localStorage.setItem(DB_KEY, JSON.stringify({ materials: mats, nextId: nid }));
    computeDashCost(mats);
  }

  function computeDashCost(mats) {
    const total = mats.length;
    const avgCost = total > 0 ? mats.reduce((s, m) => s + (parseFloat(m.unitPrice) || 0), 0) / total : 0;
    const prevAvg = parseFloat(localStorage.getItem('prevAvgCost')) || avgCost;
    const change = prevAvg > 0 ? ((avgCost - prevAvg) / prevAvg * 100) : 0;
    localStorage.setItem('prevAvgCost', avgCost.toFixed(2));
    setDashCostChange((change >= 0 ? '+' : '') + change.toFixed(1) + '%');
    setDashCostChangeDir(change >= 0 ? 'up' : 'down');
    setDashCostChangeSub((change >= 0 ? '↗ +' : '↘ ') + Math.abs(change).toFixed(1) + '% vs last month');
  }

  // ── Toast ──────────────────────────────────────────────────────────────────
  function showToast(msg, type = '') {
    const id = Date.now() + Math.random();
    const icon = type === 'success' ? '✓ ' : type === 'error' ? '✗ ' : '⚠ ';
    setToasts(prev => [...prev, { id, msg: icon + msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }

  // ── Dashboard stats ────────────────────────────────────────────────────────
  const dashTotal = materials.length;
  const dashValue = useMemo(() => materials.reduce((s, m) => s + getValue(m), 0), [materials]);
  const dashLow = useMemo(() => materials.filter(m => m.enableMinStock && getStock(m) <= (parseFloat(m.minStockLevel) || 0)).length, [materials]);
  const dashExpiring = useMemo(() => materials.filter(m => isExpiringSoon(m) && !isExpired(m)).length, [materials]);

  // ── Sort + Filter ──────────────────────────────────────────────────────────
  const allCategories = useMemo(() => [...new Set(materials.map(m => m.category).filter(Boolean))].sort(), [materials]);

  const filtered = useMemo(() => {
    const s = searchVal.toLowerCase();
    let list = s
      ? materials.filter(m =>
          (m.name || '').toLowerCase().includes(s) ||
          (m.code || '').toLowerCase().includes(s) ||
          (m.category || '').toLowerCase().includes(s) ||
          (m.hsnCode || '').toLowerCase().includes(s) ||
          (m.supplier || '').toLowerCase().includes(s) ||
          (m.location || '').toLowerCase().includes(s)
        )
      : [...materials];
    if (filterCat) list = list.filter(m => m.category === filterCat);
    if (filterStock === 'out') list = list.filter(m => getStock(m) <= 0);
    else if (filterStock === 'low') list = list.filter(m => getStock(m) > 0 && m.enableMinStock && getStock(m) <= (parseFloat(m.minStockLevel) || 0));
    else if (filterStock === 'ok') list = list.filter(m => getStock(m) > (parseFloat(m.minStockLevel) || 0));
    list.sort((a, b) => {
      let va, vb;
      if (sortKey === 'stock') { va = getStock(a); vb = getStock(b); }
      else if (sortKey === 'status') { va = getStatus(a).label; vb = getStatus(b).label; }
      else { va = a[sortKey] || ''; vb = b[sortKey] || ''; }
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      return va < vb ? -sortDir : va > vb ? sortDir : 0;
    });
    return list;
  }, [materials, searchVal, sortKey, sortDir]);

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => d * -1);
    else { setSortKey(key); setSortDir(1); }
  }

  function sortIconFor(key) {
    if (sortKey !== key) return <span className="sort-icon">⇅</span>;
    return <span className={`sort-icon ${sortKey === key ? '' : ''}`} style={{ opacity: 1, color: 'var(--primary)' }}>{sortDir === 1 ? '▲' : '▼'}</span>;
  }

  // ── Expand row ─────────────────────────────────────────────────────────────
  // ── Form helpers ───────────────────────────────────────────────────────────
  function setF(field, value) { setForm(prev => ({ ...prev, [field]: value })); }

  function resetForm() {
    setForm({ materialCode: '', productName: '', hsnCode: '', category: '', supplier: '', location: '', unit: '', unitPrice: '', gstRate: '12', initialStock: '0', initialExpiry: '', initialBatchNumber: '', enableMinStock: true, enableLowStockAlert: true, minStockLevel: '10', qcChecker: '', qcNumber: '', refCheckNumber: '', qcPassed: false, qcNotes: '' });
    setEditId('');
    setImagePreview(null);
    setShowExistingNotice(false);
    setExistingMatch(null);
    setShowEditBatchSection(false);
    setEditBatch({ qty: '', number: '', expiry: '', received: '', price: '', notes: '' });
    setHsnSuggestions([]);
    setCatSuggestions([]);
    setVoiceTranscript('(Voice transcript...)');
    setVoiceStatus('Click to record');
  }

  function fillFormFromMaterial(m) {
    setForm(prev => ({
      ...prev,
      materialCode: m.code, productName: m.name, hsnCode: m.hsnCode || '',
      category: m.category || '', supplier: m.supplier || '', location: m.location || '',
      unit: m.unit || '', unitPrice: String(m.unitPrice || ''), gstRate: String(m.gstRate || 12),
      initialStock: '0', enableMinStock: m.enableMinStock, minStockLevel: String(m.minStockLevel || 0),
      enableLowStockAlert: true, qcChecker: m.qcChecker || '', qcNumber: m.qcNumber || '',
      refCheckNumber: m.refCheckNumber || '', qcPassed: m.qcPassed || false, qcNotes: m.qcNotes || '',
    }));
    setImagePreview(m.image || null);
  }

  // ── Open Add Modal ─────────────────────────────────────────────────────────
  function openAddModal() {
    resetForm();
    const code = generateCode(nextId);
    setForm(prev => ({ ...prev, materialCode: code }));
    setAddModalTitle('➕ Add New Raw Material');
    setEditId('');
    setShowAddModal(true);
  }

  // ── Edit material ──────────────────────────────────────────────────────────
  function editMaterial(id) {
    const m = materials.find(x => x.id === id); if (!m) return;
    resetForm();
    fillFormFromMaterial(m);
    setEditId(String(m.id));
    setAddModalTitle('✏️ Edit Material — ' + m.name);
    setShowEditBatchSection(true);
    setShowAddModal(true);
  }

  // ── Save material ──────────────────────────────────────────────────────────
  function saveMaterial(e) {
    e.preventDefault();
    const name = form.productName.trim();
    const category = form.category.trim();
    const unit = form.unit;
    const price = parseFloat(form.unitPrice) || 0;
    if (!name || !category || !unit || price <= 0) { showToast('Please fill all required fields', 'error'); return; }

    if (editId) {
      const mats = materials.map(m => {
        if (m.id !== parseInt(editId)) return m;
        return {
          ...m, name, hsnCode: form.hsnCode.trim(), category, supplier: form.supplier.trim(),
          location: form.location.trim(), unit, unitPrice: price, gstRate: parseInt(form.gstRate) || 0,
          enableMinStock: form.enableMinStock, minStockLevel: parseFloat(form.minStockLevel) || 0,
          qcChecker: form.qcChecker, qcNumber: form.qcNumber, refCheckNumber: form.refCheckNumber,
          qcPassed: form.qcPassed, qcNotes: form.qcNotes,
          ...(imagePreview ? { image: imagePreview } : {}),
          updatedAt: new Date().toISOString(),
        };
      });
      setMaterials(mats);
      saveDB(mats, nextId);
      showToast('Material updated: ' + name, 'success');
    } else {
      const existing = materials.find(m => m.name.toLowerCase() === name.toLowerCase());
      if (existing) { showToast('Material already exists: ' + existing.code + '. Click Edit to modify.', 'warning'); return; }
      const id = nextId;
      const code = generateCode(id);
      const newNextId = nextId + 1;
      const initialStock = parseFloat(form.initialStock) || 0;
      const batches = initialStock > 0 ? [{ batchId: generateBatchId(), quantity: initialStock, price, batchNumber: form.initialBatchNumber.trim() || 'LOT-' + code, expiryDate: form.initialExpiry || null, receivedDate: new Date().toISOString().split('T')[0], notes: 'Initial stock' }] : [];
      const newMat = {
        id, code, name, hsnCode: form.hsnCode.trim(), category, supplier: form.supplier.trim(),
        location: form.location.trim(), unit, unitPrice: price, gstRate: parseInt(form.gstRate) || 0,
        enableMinStock: form.enableMinStock, minStockLevel: parseFloat(form.minStockLevel) || 0,
        image: imagePreview || null, qcChecker: form.qcChecker, qcNumber: form.qcNumber,
        refCheckNumber: form.refCheckNumber, qcPassed: form.qcPassed, qcNotes: form.qcNotes,
        batches, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      const mats = [...materials, newMat];
      setMaterials(mats);
      setNextId(newNextId);
      saveDB(mats, newNextId);
      showToast('Material added: ' + name + ' (' + code + ')', 'success');
    }
    setShowAddModal(false);
    resetForm();
  }

  // ── Delete material ────────────────────────────────────────────────────────
  function deleteMaterial(id) {
    const m = materials.find(x => x.id === id);
    if (!m || !confirm('Delete ' + m.name + '?')) return;
    const mats = materials.filter(x => x.id !== id);
    setMaterials(mats);
    saveDB(mats, nextId);
    showToast('Deleted: ' + m.name, 'warning');
  }

  // ── Check existing material ────────────────────────────────────────────────
  function checkExistingMaterial(nameVal) {
    const name = (nameVal || form.productName).trim().toLowerCase();
    if (!name) { setShowExistingNotice(false); setExistingMatch(null); return; }
    const found = materials.find(m => m.name.toLowerCase() === name);
    if (found) {
      setExistingMatch(found);
      setAddModalTitle('➕ Add Batch to ' + found.name);
      setEditId(String(found.id));
      fillFormFromMaterial(found);
      setShowEditBatchSection(true);
      setShowExistingNotice(true);
      setExistingNoticeFound(true);
    } else {
      setExistingMatch(null);
      if (!editId) {
        setAddModalTitle('➕ Add New Raw Material');
        setEditId('');
        setForm(prev => ({ ...prev, materialCode: generateCode(nextId) }));
      }
      setShowEditBatchSection(false);
      setShowExistingNotice(false);
    }
  }

  function suggestHSN(val) {
    const v = val.trim().toLowerCase();
    if (!v) { setHsnSuggestions([]); return; }
    setHsnSuggestions(hsnDataset.filter(h => h.desc.toLowerCase().includes(v) || h.code.includes(v)).slice(0, 8));
  }

  function suggestCategory(val) {
    const v = val.toLowerCase();
    if (!v) { setCatSuggestions([]); return; }
    setCatSuggestions(cosmeticCategories.filter(c => c.toLowerCase().includes(v)));
  }

  // ── Inline batch (edit modal) ──────────────────────────────────────────────
  function addBatchInline() {
    if (!editId) { showToast('Save material first before adding batches', 'error'); return; }
    const m = materials.find(x => x.id === parseInt(editId)); if (!m) return;
    const qty = parseFloat(editBatch.qty);
    if (!qty || qty <= 0) { showToast('Enter valid quantity', 'error'); return; }
    const batchPrice = parseFloat(editBatch.price) || parseFloat(m.unitPrice) || 0;
    const batchNum = editBatch.number.trim() || 'LOT-' + m.code + '-' + (m.batches.length + 1);
    const newBatch = { batchId: generateBatchId(), quantity: qty, batchNumber: batchNum, price: batchPrice, expiryDate: editBatch.expiry || null, receivedDate: editBatch.received || new Date().toISOString().split('T')[0], notes: editBatch.notes || '' };
    const updatedBatches = [...m.batches, newBatch];
    const totalStock = updatedBatches.reduce((s, b) => s + (parseFloat(b.quantity) || 0), 0);
    let newUnitPrice = m.unitPrice;
    if (totalStock > 0) {
      const weightedSum = updatedBatches.reduce((s, b) => s + (parseFloat(b.quantity) || 0) * (parseFloat(b.price) || parseFloat(m.unitPrice) || 0), 0);
      newUnitPrice = parseFloat((weightedSum / totalStock).toFixed(2));
    }
    const mats = materials.map(x => x.id === m.id ? { ...x, batches: updatedBatches, unitPrice: newUnitPrice, updatedAt: new Date().toISOString() } : x);
    setMaterials(mats);
    saveDB(mats, nextId);
    setForm(prev => ({ ...prev, unitPrice: String(newUnitPrice) }));
    setEditBatch({ qty: '', number: '', expiry: '', received: '', price: '', notes: '' });
    showToast(`Batch added: +${qty} ${m.unit} at ₹${batchPrice.toLocaleString('en-IN')} (Avg: ₹${newUnitPrice.toLocaleString('en-IN')})`, 'success');
  }

  // ── Batch modal ────────────────────────────────────────────────────────────
  function openBatchModal(id) {
    const m = materials.find(x => x.id === id); if (!m) return;
    setBatchTarget(m);
    setBatchModalForm({ qty: '', price: '', number: '', expiry: '', received: '', notes: '' });
    setShowBatchModal(true);
  }

  function saveBatchFromModal() {
    const m = batchTarget; if (!m) return;
    const qty = parseFloat(batchModalForm.qty);
    if (!qty || qty <= 0) { showToast('Enter valid quantity', 'error'); return; }
    const batchPrice = parseFloat(batchModalForm.price) || parseFloat(m.unitPrice) || 0;
    const batchNum = batchModalForm.number.trim() || 'LOT-' + m.code + '-' + (m.batches.length + 1);
    const newBatch = { batchId: generateBatchId(), quantity: qty, batchNumber: batchNum, price: batchPrice, expiryDate: batchModalForm.expiry || null, receivedDate: batchModalForm.received || new Date().toISOString().split('T')[0], notes: batchModalForm.notes || '' };
    const updatedBatches = [...m.batches, newBatch];
    const totalStock = updatedBatches.reduce((s, b) => s + (parseFloat(b.quantity) || 0), 0);
    let newUnitPrice = m.unitPrice;
    if (totalStock > 0) {
      const ws = updatedBatches.reduce((s, b) => s + (parseFloat(b.quantity) || 0) * (parseFloat(b.price) || parseFloat(m.unitPrice) || 0), 0);
      newUnitPrice = parseFloat((ws / totalStock).toFixed(2));
    }
    const updatedM = { ...m, batches: updatedBatches, unitPrice: newUnitPrice, updatedAt: new Date().toISOString() };
    const mats = materials.map(x => x.id === m.id ? updatedM : x);
    setMaterials(mats);
    setBatchTarget(updatedM);
    saveDB(mats, nextId);
    setBatchModalForm({ qty: '', price: '', number: '', expiry: '', received: '', notes: '' });
    showToast(`Batch added: +${qty} ${m.unit} at ₹${batchPrice.toLocaleString('en-IN')} (Avg: ₹${newUnitPrice.toLocaleString('en-IN')})`, 'success');
  }

  // ── QR Modal ───────────────────────────────────────────────────────────────
  function openQRModal(id) {
    const m = materials.find(x => x.id === id); if (!m) return;
    setQrTarget(m);
    setShowQRModal(true);
  }

  // ── Low Stock Modal ────────────────────────────────────────────────────────
  function openLowStockModal() {
    const out = materials.filter(m => getStock(m) <= 0);
    const low = materials.filter(m => m.enableMinStock && getStock(m) <= (parseFloat(m.minStockLevel) || 0));
    setLowStockData({ out, low });
    setShowLowStockModal(true);
  }

  // ── Image preview ──────────────────────────────────────────────────────────
  function previewImage(e) {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => setImagePreview(ev.target.result);
    r.readAsDataURL(f);
  }

  // ── OCR / Bill scanning ────────────────────────────────────────────────────
  async function processBillImage(e) {
    const f = e.target.files[0]; if (!f) return;
    if (!window.Tesseract) { showToast('OCR engine not loaded yet, please wait', 'error'); return; }
    setShowScanOverlay(true); setScanText('Reading image...');
    try {
      if (!tesseractWorkerRef.current) {
        tesseractWorkerRef.current = await window.Tesseract.createWorker('eng');
      }
      const { data: { text } } = await tesseractWorkerRef.current.recognize(f);
      setShowScanOverlay(false);
      parseBillText(text);
      showToast('Bill scanned successfully', 'success');
    } catch (err) {
      setShowScanOverlay(false);
      showToast('OCR failed: ' + err.message, 'error');
    }
    e.target.value = '';
  }

  function parseBillText(text) {
    const find = (patterns) => { for (const p of patterns) { const m = text.match(p); if (m) return m[1].trim(); } return null; };
    const name = find([/product\s*name\s*[:\-]\s*(.+)/i,/item\s*[:\-]\s*(.+)/i,/description\s*[:\-]\s*(.+)/i,/name\s*[:\-]\s*(.+)/i,/^\s*([^\d\n]{3,60})\s*$/m]) || '';
    const hsn = find([/hsn\s*[:\-]?\s*(\d{4,8})/i,/hsn\s*code\s*[:\-]?\s*(\d{4,8})/i,/(\d{4,8})/]) || '';
    const price = find([/unit\s*price\s*[:\-]?\s*[$₹]?\s*([\d,.]+)/i,/price\s*[:\-]?\s*[$₹]?\s*([\d,.]+)/i,/rate\s*[:\-]?\s*[$₹]?\s*([\d,.]+)/i,/[$₹]\s*([\d,.]+)/]) || '';
    const gst = find([/gst\s*[:\-]?\s*(\d+)%?/i,/tax\s*[:\-]?\s*(\d+)%?/i,/(\d+)%\s*gst/i]) || '';
    const batch = find([/batch\s*[:\-]?\s*(.+)/i,/lot\s*[:\-]?\s*(.+)/i]) || '';
    const expiry = find([/exp\s*[:\-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,/expiry\s*[:\-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i]) || '';
    const qty = find([/qty\s*[:\-]?\s*(\d+)/i,/quantity\s*[:\-]?\s*(\d+)/i,/(\d+)\s*(kg|g|l|ml|pieces?|pcs?)/i]) || '';
    const supplier = find([/supplier\s*[:\-]\s*(.+)/i,/vendor\s*[:\-]\s*(.+)/i,/from\s*[:\-]\s*(.+)/i,/manufacturer\s*[:\-]\s*(.+)/i]) || '';

    setForm(prev => ({
      ...prev,
      ...(name ? { productName: name } : {}),
      ...(hsn ? { hsnCode: hsn } : {}),
      ...(price ? { unitPrice: price.replace(/,/g,'') } : {}),
      ...(gst ? { gstRate: gst.replace(/%/g,'') } : {}),
      ...(batch ? { initialBatchNumber: batch } : {}),
      ...(qty ? { initialStock: qty } : {}),
      ...(supplier ? { supplier } : {}),
      ...(expiry ? (() => { const parts = expiry.split(/[\/-]/); if (parts.length === 3) { let [d, mon, y] = parts; if (y.length===2) y='20'+y; return { initialExpiry: `${y}-${mon.padStart(2,'0')}-${d.padStart(2,'0')}` }; } return {}; })() : {}),
    }));

    const fl = text.toLowerCase();
    const cats = ['fragrance','hydrosol','essential oil','carrier oil','active ingredients','preservatives','surfactants','emulsifiers','thickeners','humectants','butters','vitamins','peptides','proteins','silicones','botanical extracts','antioxidants','sunscreen agents','exfoliants','ph adjusters','colorants'];
    for (const c of cats) { if (fl.includes(c)) { setForm(prev => ({ ...prev, category: c.charAt(0).toUpperCase() + c.slice(1) })); break; } }
    if (name) checkExistingMaterial(name);
  }

  // ── Voice input ────────────────────────────────────────────────────────────
  function toggleVoice() {
    if (!('webkitSpeechRecognition' in window)) { showToast('Voice input not supported in this browser', 'error'); return; }
    if (recognitionRef.current && recognitionRef.current.recognizing) {
      recognitionRef.current.stop(); return;
    }
    const rec = new window.webkitSpeechRecognition();
    rec.continuous = true; rec.interimResults = true; rec.lang = 'en-IN';
    rec.recognizing = true;
    rec.onresult = (e) => { let t = ''; for (let i = e.resultIndex; i < e.results.length; i++) { t += e.results[i][0].transcript; } setVoiceTranscript(t); };
    rec.onend = () => { setIsRecording(false); setVoiceStatus('Click to record'); rec.recognizing = false; };
    rec.onerror = () => { setIsRecording(false); setVoiceStatus('Error. Try again.'); rec.recognizing = false; };
    rec.start();
    recognitionRef.current = rec;
    setIsRecording(true);
    setVoiceStatus('Recording...');
  }

  // ── CSV Export ─────────────────────────────────────────────────────────────
  function exportCSV() {
    if (!materials.length) { showToast('No materials to export', 'error'); return; }
    const headers = ['ID','Code','Name','Category','HSN Code','Supplier','Location','Unit','Unit Price','GST Rate','Stock','Min Stock Level','Min Stock Enabled','Low Stock Alert','QC Checker','QC Number','Ref Check Number','QC Passed','QC Notes','Batch Count','Batch Details','Created At','Updated At'];
    const rows = materials.map(m => {
      const stock = getStock(m);
      const batchDetails = (m.batches || []).map(b => b.batchNumber + ' (' + b.quantity + ' ' + m.unit + ', exp: ' + (b.expiryDate || 'N/A') + ')').join('; ');
      return [m.id,m.code,m.name,m.category,m.hsnCode||'',m.supplier||'',m.location||'',m.unit,m.unitPrice,m.gstRate,stock,m.minStockLevel||0,m.enableMinStock?'Yes':'No','Yes',m.qcChecker||'',m.qcNumber||'',m.refCheckNumber||'',m.qcPassed?'Yes':'No',m.qcNotes||'',(m.batches||[]).length,batchDetails,m.createdAt,m.updatedAt].map(v => '"' + String(v).replace(/"/g,'""') + '"').join(',');
    });
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'raw-materials-' + new Date().toISOString().split('T')[0] + '.csv'; a.click(); URL.revokeObjectURL(url);
    showToast('CSV exported: ' + materials.length + ' materials', 'success');
  }

  // ── Bulk Import ────────────────────────────────────────────────────────────
  function bulkImport(e) {
    const f = e.target.files[0]; if (!f) return;
    const name = f.name.toLowerCase();
    if (name.endsWith('.csv')) importCSV(f);
    else if (name.endsWith('.pdf')) importPDF(f);
    else showToast('Please upload a CSV or PDF file', 'error');
    e.target.value = '';
  }

  function parseCSVLine(line) {
    const result = []; let current = ''; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]; const nx = line[i+1];
      if (ch === '"') { if (inQ && nx === '"') { current += '"'; i++; } else { inQ = !inQ; } }
      else if (ch === ',' && !inQ) { result.push(current.trim()); current = ''; }
      else { current += ch; }
    }
    result.push(current.trim());
    return result.map(v => v.replace(/^"|"$/g,'').trim());
  }

  function importCSV(file) {
    const r = new FileReader();
    r.onload = (ev) => {
      const lines = ev.target.result.split('\n').map(l => l.trim()).filter(l => l);
      if (!lines.length) { showToast('Empty CSV file', 'error'); return; }
      const headers = parseCSVLine(lines[0]);
      const idx = k => headers.indexOf(k);
      let added = 0, updated = 0;
      let mats = [...materials]; let nid = nextId;
      for (let i = 1; i < lines.length; i++) {
        const vals = parseCSVLine(lines[i]); if (!vals.length) continue;
        const name = vals[idx('Name')] || vals[0]; if (!name) continue;
        const price = parseFloat(vals[idx('Unit Price')]) || 0;
        const gst = parseInt(vals[idx('GST Rate')]) || 12;
        const stock = parseFloat(vals[idx('Stock')]) || 0;
        const minStock = parseFloat(vals[idx('Min Stock Level')]) || 0;
        const enableMin = (vals[idx('Min Stock Enabled')]||'').toLowerCase() === 'yes';
        const existing = mats.find(m => m.name.toLowerCase() === name.toLowerCase());
        if (existing) {
          const ei = mats.findIndex(m => m.id === existing.id);
          mats[ei] = { ...mats[ei], category: vals[idx('Category')]||mats[ei].category, hsnCode: vals[idx('HSN Code')]||mats[ei].hsnCode, supplier: vals[idx('Supplier')]||mats[ei].supplier, location: vals[idx('Location')]||mats[ei].location, unit: vals[idx('Unit')]||mats[ei].unit, unitPrice: price||mats[ei].unitPrice, gstRate: gst||mats[ei].gstRate, minStockLevel: minStock, enableMinStock: enableMin, qcChecker: vals[idx('QC Checker')]||mats[ei].qcChecker, qcNumber: vals[idx('QC Number')]||mats[ei].qcNumber, refCheckNumber: vals[idx('Ref Check Number')]||mats[ei].refCheckNumber, qcPassed: (vals[idx('QC Passed')]||'').toLowerCase()==='yes', qcNotes: vals[idx('QC Notes')]||mats[ei].qcNotes, updatedAt: new Date().toISOString() };
          if (stock > 0) mats[ei].batches.push({ batchId: generateBatchId(), quantity: stock, price: mats[ei].unitPrice, batchNumber: 'IMPORT-'+mats[ei].code, expiryDate: null, receivedDate: new Date().toISOString().split('T')[0], notes: 'Bulk import' });
          updated++;
        } else {
          const id = nid++; const code = generateCode(id);
          const batches = stock > 0 ? [{ batchId: generateBatchId(), quantity: stock, price: price||0, batchNumber: 'IMPORT-'+code, expiryDate: null, receivedDate: new Date().toISOString().split('T')[0], notes: 'Bulk import' }] : [];
          mats.push({ id, code, name, category: vals[idx('Category')]||'Uncategorized', hsnCode: vals[idx('HSN Code')]||'', supplier: vals[idx('Supplier')]||'', location: vals[idx('Location')]||'', unit: vals[idx('Unit')]||'piece', unitPrice: price, gstRate: gst, enableMinStock: enableMin, minStockLevel: minStock, image: null, qcChecker: vals[idx('QC Checker')]||'', qcNumber: vals[idx('QC Number')]||'', refCheckNumber: vals[idx('Ref Check Number')]||'', qcPassed: (vals[idx('QC Passed')]||'').toLowerCase()==='yes', qcNotes: vals[idx('QC Notes')]||'', batches, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
          added++;
        }
      }
      setMaterials(mats); setNextId(nid); saveDB(mats, nid);
      showToast('Import complete: ' + added + ' added, ' + updated + ' updated', 'success');
    };
    r.readAsText(file);
  }

  async function importPDF(file) {
    if (!window.pdfjsLib) { showToast('PDF.js not loaded yet', 'error'); return; }
    setShowScanOverlay(true); setScanText('Processing PDF...');
    const r = new FileReader();
    r.onload = async (ev) => {
      try {
        const pdf = await window.pdfjsLib.getDocument({ data: ev.target.result }).promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) { const page = await pdf.getPage(i); const tc = await page.getTextContent(); fullText += tc.items.map(t => t.str).join(' ') + '\n'; }
        setShowScanOverlay(false);
        parseBillText(fullText); showToast('PDF text extracted. Review and save.', 'success'); setShowAddModal(true);
      } catch (err) { setShowScanOverlay(false); showToast('PDF processing failed: ' + err.message, 'error'); }
    };
    r.readAsArrayBuffer(file);
  }

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') { setShowAddModal(false); setShowQRModal(false); setShowBatchModal(false); setShowLowStockModal(false); }
      if (e.ctrlKey && e.key === 'n') { e.preventDefault(); openAddModal(); }
      if (e.ctrlKey && e.key === 'e') { e.preventDefault(); exportCSV(); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [materials, nextId]);

  // ── Get current edited material for batch section ──────────────────────────
  const editedMaterial = editId ? materials.find(x => x.id === parseInt(editId)) : null;

  // ── QR data ────────────────────────────────────────────────────────────────
  const qrData = qrTarget ? JSON.stringify({ code: qrTarget.code, name: qrTarget.name, hsn: qrTarget.hsnCode || '', unit: qrTarget.unit, price: qrTarget.unitPrice, gst: qrTarget.gstRate, location: qrTarget.location || '', supplier: qrTarget.supplier || '' }) : '';

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="rm-page">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="header">
        <div className="brand">
          <div className="brand-icon">🧪</div>
          <div className="brand-text">
            <h1>Raw Material Inventory</h1>
            <span>BioTech / Cosmetic ERP — ISO 9001:2015</span>
          </div>
        </div>
        <div className="header-actions">
          <button className="btn btn-outline" onClick={exportCSV}>📥 Export CSV</button>
          <button className="btn btn-outline" onClick={() => document.getElementById('rm-bulkImportFile').click()}>📤 Bulk Import</button>
          <input type="file" id="rm-bulkImportFile" style={{ display: 'none' }} accept=".csv,.pdf" onChange={bulkImport} />
          <button className="btn btn-accent" onClick={openAddModal}>➕ Add Material</button>
        </div>
      </div>

      {/* ── Main ───────────────────────────────────────────────────────────── */}
      <div className="main">
        {/* Dashboard grid */}
        <div className="dashboard-grid">
          <div className="metric-card">
            <div className="left">
              <div className="label">Total Materials</div>
              <div className="value">{dashTotal}</div>
              <div className="change up">📦 Active SKUs</div>
            </div>
            <div className="icon-box purple">📦</div>
          </div>
          <div className="metric-card">
            <div className="left">
              <div className="label">Total Inventory Value</div>
              <div className="value">₹{dashValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
              <div className="change up">↗ +0.0%</div>
            </div>
            <div className="icon-box green">₹</div>
          </div>
          <div className="metric-card">
            <div className="left">
              <div className="label">Avg Cost Change (MoM)</div>
              <div className="value" style={{ color: dashCostChangeDir === 'up' ? 'var(--success)' : 'var(--danger)' }}>{dashCostChange}</div>
              <div className={`change ${dashCostChangeDir}`}>{dashCostChangeSub}</div>
            </div>
            <div className="icon-box blue">📊</div>
          </div>
          <div className="metric-card clickable" onClick={openLowStockModal} title="Click to view low stock materials">
            <div className="left">
              <div className="label">Low Stock Alerts</div>
              <div className="value">{dashLow}</div>
              <div className="change down">⚠️ Items below min</div>
            </div>
            <div className="icon-box red">⚠️</div>
          </div>
          <div className="metric-card">
            <div className="left">
              <div className="label">Expiring Soon</div>
              <div className="value">{dashExpiring}</div>
              <div className="change up">📅 Within 30 days</div>
            </div>
            <div className="icon-box orange">📅</div>
          </div>
        </div>

        {/* Materials table */}
        <div className="card">
          <div className="card-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
            <h2>📦 Materials Master</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginLeft: 'auto' }}>
              <div className="search-pill">
                <span className="search-icon">🔍</span>
                <input type="text" value={searchVal} onChange={e => setSearchVal(e.target.value)} placeholder="Search name, SKU, supplier, HSN..." />
              </div>
              <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                <option value="">All Categories</option>
                {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={filterStock} onChange={e => setFilterStock(e.target.value)} style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                <option value="">All Stock</option>
                <option value="ok">✅ In Stock</option>
                <option value="low">⚠️ Low Stock</option>
                <option value="out">🔴 Out of Stock</option>
              </select>
              {(filterCat || filterStock) && (
                <button onClick={() => { setFilterCat(''); setFilterStock(''); }} style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>✕ Clear</button>
              )}
            </div>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th onClick={() => handleSort('code')} className={sortKey==='code'?'sorted':''}>Code <span className="sort-icon">{sortKey==='code'?(sortDir===1?'▲':'▼'):'⇅'}</span></th>
                    <th onClick={() => handleSort('name')} className={sortKey==='name'?'sorted':''}>Name <span className="sort-icon">{sortKey==='name'?(sortDir===1?'▲':'▼'):'⇅'}</span></th>
                    <th onClick={() => handleSort('category')} className={sortKey==='category'?'sorted':''}>Category <span className="sort-icon">{sortKey==='category'?(sortDir===1?'▲':'▼'):'⇅'}</span></th>
                    <th onClick={() => handleSort('hsnCode')} className={sortKey==='hsnCode'?'sorted':''}>HSN <span className="sort-icon">{sortKey==='hsnCode'?(sortDir===1?'▲':'▼'):'⇅'}</span></th>
                    <th onClick={() => handleSort('unit')} className={sortKey==='unit'?'sorted':''}>Unit <span className="sort-icon">{sortKey==='unit'?(sortDir===1?'▲':'▼'):'⇅'}</span></th>
                    <th onClick={() => handleSort('unitPrice')} className={sortKey==='unitPrice'?'sorted':''}>Price <span className="sort-icon">{sortKey==='unitPrice'?(sortDir===1?'▲':'▼'):'⇅'}</span></th>
                    <th onClick={() => handleSort('gstRate')} className={sortKey==='gstRate'?'sorted':''}>GST <span className="sort-icon">{sortKey==='gstRate'?(sortDir===1?'▲':'▼'):'⇅'}</span></th>
                    <th onClick={() => handleSort('stock')} className={sortKey==='stock'?'sorted':''}>Stock <span className="sort-icon">{sortKey==='stock'?(sortDir===1?'▲':'▼'):'⇅'}</span></th>
                    <th onClick={() => handleSort('status')} className={sortKey==='status'?'sorted':''}>Status <span className="sort-icon">{sortKey==='status'?(sortDir===1?'▲':'▼'):'⇅'}</span></th>
                    <th style={{ width: '140px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={10} className="empty"><div className="icon">📦</div><h4>No materials found</h4><p>Try adjusting your search or add a new material.</p></td></tr>
                  ) : filtered.map(m => {
                    const stock = getStock(m);
                    const status = getStatus(m);
                    const stockClass = stock <= 0 ? 'stock-danger' : (m.enableMinStock && stock <= (parseFloat(m.minStockLevel)||0)) ? 'stock-low' : stock <= (parseFloat(m.minStockLevel)||0)*2 ? 'stock-medium' : 'stock-ok';
                    return (
                      <tr key={m.id}>
                          <td className="code-cell" onClick={() => setDetailTarget(m)} style={{ cursor: 'pointer' }}>{m.code}</td>
                          <td className="name-cell" onClick={() => setDetailTarget(m)} style={{ cursor: 'pointer' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {m.image ? (
                                <img src={m.image} alt="" style={{ width: 34, height: 34, borderRadius: 7, objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border)' }} />
                              ) : (
                                <div style={{ width: 34, height: 34, borderRadius: 7, background: 'var(--surface-alt, #f1f5f9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>🧪</div>
                              )}
                              {m.name}
                            </div>
                          </td>
                          <td><span className="tag tag-gray">{m.category}</span></td>
                          <td>{m.hsnCode || '-'}</td>
                          <td>{m.unit}</td>
                          <td>₹{(parseFloat(m.unitPrice)||0).toLocaleString('en-IN')}</td>
                          <td>{m.gstRate}%</td>
                          <td className={stockClass}>{stock.toLocaleString('en-IN')}</td>
                          <td><span className={`tag ${status.cls}`}>{status.label}</span></td>
                          <td className="actions">
                            <button className="batch-btn" title="Add Batch" onClick={() => openBatchModal(m.id)}>🧪</button>
                            <button className="qr-btn" title="Print QR" onClick={() => openQRModal(m.id)}>🔲</button>
                            <button className="edit-btn" title="Edit" onClick={() => editMaterial(m.id)}>✏️</button>
                            <button className="delete-btn" title="Delete" onClick={() => deleteMaterial(m.id)}>🗑️</button>
                          </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* ── Material Detail Modal ───────────────────────────────────────────── */}
      {detailTarget && (() => {
        const m = detailTarget;
        const stock = getStock(m);
        const status = getStatus(m);
        return (
          <div className="rm-modal-overlay" onClick={() => setDetailTarget(null)}>
            <div className="rm-modal" style={{ maxWidth: 820, maxHeight: '88vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
              <div className="rm-modal-header">
                <h2>📦 {m.name} <span style={{ fontSize: '13px', fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 6 }}>{m.code}</span></h2>
                <button className="rm-modal-close" onClick={() => setDetailTarget(null)}>&times;</button>
              </div>
              <div className="rm-modal-body" style={{ overflowY: 'auto', flex: 1 }}>
                <div className="detail-grid">
                  <div className="detail-left">
                    <div className="detail-section">
                      <h4>📋 Basic Info</h4>
                      <div className="detail-item"><span className="label">Category</span><span className="value">{m.category || '-'}</span></div>
                      <div className="detail-item"><span className="label">Supplier</span><span className="value">{m.supplier || '-'}</span></div>
                      <div className="detail-item"><span className="label">Location</span><span className="value">{m.location || '-'}</span></div>
                      <div className="detail-item"><span className="label">Unit Price</span><span className="value">₹{(parseFloat(m.unitPrice)||0).toLocaleString('en-IN')} / {m.unit}</span></div>
                      <div className="detail-item"><span className="label">GST Rate</span><span className="value">{m.gstRate}%</span></div>
                      <div className="detail-item"><span className="label">Current Stock</span><span className="value">{stock.toLocaleString('en-IN')} {m.unit} — <span className={`tag ${status.cls}`} style={{ fontSize: '11px', padding: '1px 7px' }}>{status.label}</span></span></div>
                      <div className="detail-item"><span className="label">Min Stock</span><span className="value">{m.enableMinStock ? (m.minStockLevel || 0) + ' ' + m.unit : 'Disabled'}</span></div>
                      <div className="detail-item"><span className="label">Inventory Value</span><span className="value">₹{getValue(m).toLocaleString('en-IN')}</span></div>
                      <div className="detail-item"><span className="label">Created</span><span className="value">{new Date(m.createdAt).toLocaleDateString('en-IN')}</span></div>
                    </div>
                    <div className="detail-section">
                      <h4>🖼️ Product Image</h4>
                      {m.image ? <img className="detail-img" src={m.image} alt="Product" /> : <div className="detail-img-placeholder">📷</div>}
                    </div>
                  </div>
                  <div className="detail-center">
                    <div className="detail-section">
                      <h4>🧪 Batches</h4>
                      {m.batches && m.batches.length > 0 ? m.batches.map((b, bi) => {
                        const { cls, text } = getBatchExpInfo(b.expiryDate);
                        return (
                          <div key={bi} className="detail-batch">
                            <span className="b-num">{b.batchNumber}</span>
                            <span className="b-qty">{b.quantity} {m.unit}</span>
                            <span className="b-price">@ ₹{b.price || m.unitPrice}</span>
                            <span className="b-date">Rcvd: {b.receivedDate ? new Date(b.receivedDate).toLocaleDateString('en-IN') : '-'}</span>
                            <span className={`b-exp ${cls}`}>{text}</span>
                          </div>
                        );
                      }) : <div style={{ color: 'var(--text-secondary)', fontSize: '12px', padding: '8px 0' }}>No batches recorded</div>}
                    </div>
                  </div>
                  <div className="detail-right">
                    <div className="detail-section">
                      <h4>🛡️ Quality Control (ISO 9001:2015)</h4>
                      <div className="detail-item"><span className="label">QC Checked By</span><span className="value">{m.qcChecker || '-'}</span></div>
                      <div className="detail-item"><span className="label">QC Number</span><span className="value">{m.qcNumber || '-'}</span></div>
                      <div className="detail-item"><span className="label">Reference Check</span><span className="value">{m.refCheckNumber || '-'}</span></div>
                      <div className="detail-item"><span className="label">QC Result</span><span className="value">{m.qcPassed ? <span className="detail-qc-badge pass">✓ PASS</span> : <span className="detail-qc-badge fail">✗ FAIL</span>}</span></div>
                      <div className="detail-item"><span className="label">Notes</span></div>
                      <div className="detail-notes">{m.qcNotes || 'No notes recorded'}</div>
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-sm" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 16px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }} onClick={() => { setDetailTarget(null); openBatchModal(m.id); }}>🧪 Add Batch</button>
                <button className="btn btn-sm" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 16px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }} onClick={() => { setDetailTarget(null); openQRModal(m.id); }}>🔲 QR Code</button>
                <button className="btn btn-sm" style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '6px 16px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }} onClick={() => { setDetailTarget(null); editMaterial(m.id); }}>✏️ Edit</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Add / Edit Modal ─────────────────────────────────────────────────── */}
      {showAddModal && (
        <div className="rm-modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="rm-modal" onClick={e => e.stopPropagation()}>
            <div className="rm-modal-header">
              <h2>{addModalTitle}</h2>
              <button className="rm-modal-close" onClick={() => setShowAddModal(false)}>&times;</button>
            </div>
            <div className="rm-modal-body">
              {/* Existing notice */}
              {showExistingNotice && (
                <div className={`rm-existing-notice ${existingNoticeFound ? 'found' : ''}`}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '18px' }}>✅</span>
                    <div><strong>Existing material found:</strong> Auto-populated fields. Add a new batch below or edit fields as needed.</div>
                  </div>
                </div>
              )}

              {/* OCR banner */}
              <div className="rm-ocr-banner">
                <div><strong>📄 Auto-populate from Bill / Label</strong> <span>Upload a photo of the product label or invoice to auto-fill fields</span></div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn btn-sm btn-success" style={{ background: '#10b981', color: 'white', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '5px 12px', borderRadius: '50px', border: 'none', fontSize: '11.5px', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }} onClick={() => document.getElementById('rm-billImage').click()}>🖼️ Scan Image</button>
                  <button className="btn btn-sm btn-outline" style={{ background: 'transparent', border: '1.5px solid #e2e8f0', color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '5px 12px', borderRadius: '50px', fontSize: '11.5px', cursor: 'pointer', fontWeight: 500, fontFamily: 'inherit' }} onClick={() => document.getElementById('rm-billImage').click()}>📁 Upload</button>
                  <input type="file" id="rm-billImage" accept="image/*" style={{ display: 'none' }} onChange={processBillImage} />
                </div>
              </div>

              {/* Form */}
              <form id="rm-materialForm" onSubmit={saveMaterial}>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Material Code</label>
                    <input type="text" value={form.materialCode} readOnly style={{ background: 'var(--surface)', fontWeight: 700, color: 'var(--primary)' }} />
                  </div>
                  <div className="form-group">
                    <label>Product Name <span className="req">*</span></label>
                    <input type="text" value={form.productName} required onChange={e => { setF('productName', e.target.value); checkExistingMaterial(e.target.value); suggestHSN(e.target.value); }} />
                  </div>
                  <div className="form-group">
                    <label>HSN Code</label>
                    <div className="rm-hsn-dropdown">
                      <input type="text" value={form.hsnCode} placeholder="Auto-identified or enter manually" onChange={e => { setF('hsnCode', e.target.value); suggestHSN(e.target.value); }} onBlur={() => setTimeout(() => setHsnSuggestions([]), 200)} />
                      {hsnSuggestions.length > 0 && (
                        <div className="rm-hsn-suggestions">
                          {hsnSuggestions.map(h => (
                            <div key={h.code} className="rm-hsn-suggestion" onMouseDown={() => { setF('hsnCode', h.code); setHsnSuggestions([]); }}>
                              <span className="code">{h.code}</span> — <span className="desc">{h.desc}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Category <span className="req">*</span></label>
                    <div className="rm-cat-dropdown">
                      <input type="text" value={form.category} required placeholder="Type or select category (e.g. Fragrance, Hydrosol)" onChange={e => { setF('category', e.target.value); suggestCategory(e.target.value); }} onBlur={() => setTimeout(() => setCatSuggestions([]), 200)} />
                      {catSuggestions.length > 0 && (
                        <div className="rm-cat-suggestions">
                          {catSuggestions.map(c => (
                            <div key={c} className="rm-cat-suggestion" onMouseDown={() => { setF('category', c); setCatSuggestions([]); }}>
                              <span className="name">{c}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Supplier Name</label>
                    <input type="text" value={form.supplier} placeholder="e.g., ABC Chemicals Pvt Ltd" onChange={e => setF('supplier', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Storage Location / Place <span className="req">*</span></label>
                    <input type="text" value={form.location} required placeholder="e.g., Warehouse A, Rack 12, Shelf B" onChange={e => setF('location', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Unit <span className="req">*</span></label>
                    <select value={form.unit} required onChange={e => setF('unit', e.target.value)}>
                      <option value="">Select</option>
                      <option value="kg">Kilogram (kg)</option>
                      <option value="liter">Liter (L)</option>
                      <option value="gram">Gram (g)</option>
                      <option value="ml">Milliliter (ml)</option>
                      <option value="piece">Piece</option>
                      <option value="box">Box</option>
                      <option value="drum">Drum</option>
                      <option value="bag">Bag</option>
                      <option value="meter">Meter</option>
                      <option value="bottle">Bottle</option>
                      <option value="can">Can</option>
                      <option value="jar">Jar</option>
                      <option value="tube">Tube</option>
                      <option value="sachet">Sachet</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Unit Price (₹) <span className="req">*</span></label>
                    <input type="number" value={form.unitPrice} step="0.01" min="0" required onChange={e => setF('unitPrice', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>GST Rate (%) <span className="req">*</span></label>
                    <select value={form.gstRate} required onChange={e => setF('gstRate', e.target.value)}>
                      <option value="0">0%</option>
                      <option value="5">5%</option>
                      <option value="12">12%</option>
                      <option value="18">18%</option>
                      <option value="28">28%</option>
                    </select>
                  </div>
                  {!editId && <>
                    <div className="form-group">
                      <label>Initial Stock</label>
                      <input type="number" value={form.initialStock} step="0.01" min="0" onChange={e => setF('initialStock', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>Initial Expiry</label>
                      <input type="date" value={form.initialExpiry} onChange={e => setF('initialExpiry', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>Initial Batch #</label>
                      <input type="text" value={form.initialBatchNumber} placeholder="e.g., LOT-2026-001" onChange={e => setF('initialBatchNumber', e.target.value)} />
                    </div>
                  </>}
                  <div className="form-group full">
                    <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                      <div className="checkbox-group">
                        <input type="checkbox" id="rm-enableMinStock" checked={form.enableMinStock} onChange={e => setF('enableMinStock', e.target.checked)} />
                        <label htmlFor="rm-enableMinStock">Enable Min Stock</label>
                      </div>
                      <div className="checkbox-group">
                        <input type="checkbox" id="rm-enableLowStockAlert" checked={form.enableLowStockAlert} onChange={e => setF('enableLowStockAlert', e.target.checked)} />
                        <label htmlFor="rm-enableLowStockAlert">Enable Low Stock Alert</label>
                      </div>
                    </div>
                  </div>
                  {form.enableMinStock && (
                    <div className="form-group">
                      <label>Min Stock Level</label>
                      <input type="number" value={form.minStockLevel} step="0.01" min="0" onChange={e => setF('minStockLevel', e.target.value)} />
                    </div>
                  )}
                  <div className="form-group">
                    <label>Product Image</label>
                    <div className="image-preview" onClick={() => document.getElementById('rm-productImage').click()}>
                      {imagePreview ? <img src={imagePreview} alt="preview" /> : <div className="placeholder">📷 Click to upload</div>}
                    </div>
                    <input type="file" id="rm-productImage" accept="image/*" style={{ display: 'none' }} onChange={previewImage} />
                  </div>
                  <div className="form-group half">
                    <label>Voice Input</label>
                    <div className="voice-recorder">
                      <button type="button" className={`mic-btn${isRecording ? ' recording' : ''}`} onClick={toggleVoice}>🎤</button>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{voiceStatus}</div>
                    </div>
                    <div className="voice-transcript">{voiceTranscript}</div>
                  </div>
                </div>

                {/* ISO QC Section */}
                <div className="iso-section">
                  <h4>🛡️ ISO 9001:2015 Quality Control</h4>
                  <div className="form-grid" style={{ marginTop: '10px' }}>
                    <div className="form-group">
                      <label>QC Checked By</label>
                      <input type="text" value={form.qcChecker} placeholder="Inspector name" onChange={e => setF('qcChecker', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>QC Number</label>
                      <input type="text" value={form.qcNumber} placeholder="QC-2026-001" onChange={e => setF('qcNumber', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>Reference Check #</label>
                      <input type="text" value={form.refCheckNumber} placeholder="REF-2026-001" onChange={e => setF('refCheckNumber', e.target.value)} />
                    </div>
                    <div className="form-group full">
                      <div className="checkbox-group">
                        <input type="checkbox" id="rm-qcPassed" checked={form.qcPassed} onChange={e => setF('qcPassed', e.target.checked)} />
                        <label htmlFor="rm-qcPassed">QC Passed / Approved</label>
                      </div>
                    </div>
                    <div className="form-group full">
                      <label>QC Notes</label>
                      <textarea value={form.qcNotes} placeholder="Quality observations..." onChange={e => setF('qcNotes', e.target.value)} />
                    </div>
                  </div>
                </div>

                {/* Batch section (edit / existing) */}
                {showEditBatchSection && editedMaterial && (
                  <div className="edit-batch-section">
                    <h4>🧪 Batch Management</h4>
                    <div className="edit-stock-display">
                      <div className="stock-label">Current Total Stock</div>
                      <div className="stock-value">{getStock(editedMaterial).toLocaleString('en-IN')} {editedMaterial.unit}</div>
                    </div>
                    <div className="edit-batch-list">
                      {(!editedMaterial.batches || editedMaterial.batches.length === 0)
                        ? <div style={{ color: 'var(--text-secondary)', fontSize: '12px', padding: '8px 0' }}>No batches recorded yet</div>
                        : editedMaterial.batches.map((b, bi) => {
                            const { cls, text } = getBatchExpInfo(b.expiryDate);
                            return (
                              <div key={bi} className="edit-batch-item">
                                <span className="b-num">{b.batchNumber}</span>
                                <span className="b-qty">{b.quantity} {editedMaterial.unit}</span>
                                <span className="b-price">@ ₹{b.price || editedMaterial.unitPrice}</span>
                                <span className="b-date">Rcvd: {b.receivedDate ? new Date(b.receivedDate).toLocaleDateString('en-IN') : '-'}</span>
                                <span className={`b-exp ${cls}`}>{text}</span>
                              </div>
                            );
                          })}
                    </div>
                    <div className="add-batch-inline">
                      <h5>➕ Add New Batch</h5>
                      <div className="form-grid" style={{ gridTemplateColumns: 'repeat(2,1fr)', gap: '10px' }}>
                        <div className="form-group">
                          <label>Quantity <span className="req">*</span></label>
                          <input type="number" value={editBatch.qty} step="0.01" min="0.01" placeholder="Qty" onChange={e => setEditBatch(p => ({ ...p, qty: e.target.value }))} />
                        </div>
                        <div className="form-group">
                          <label>Batch / Lot #</label>
                          <input type="text" value={editBatch.number} placeholder="LOT-2026-002" onChange={e => setEditBatch(p => ({ ...p, number: e.target.value }))} />
                        </div>
                        <div className="form-group">
                          <label>Expiry Date</label>
                          <input type="date" value={editBatch.expiry} onChange={e => setEditBatch(p => ({ ...p, expiry: e.target.value }))} />
                        </div>
                        <div className="form-group">
                          <label>Received Date</label>
                          <input type="date" value={editBatch.received} onChange={e => setEditBatch(p => ({ ...p, received: e.target.value }))} />
                        </div>
                      </div>
                      <div className="form-grid" style={{ gridTemplateColumns: 'repeat(2,1fr)', gap: '10px', marginTop: '10px' }}>
                        <div className="form-group">
                          <label>Unit Price for this Batch (₹) <span style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: 400 }}> — May differ from current price</span></label>
                          <input type="number" value={editBatch.price} step="0.01" min="0" placeholder="Leave blank to use current price" onChange={e => setEditBatch(p => ({ ...p, price: e.target.value }))} />
                        </div>
                        <div className="form-group">
                          <label>Notes (Supplier, Invoice Ref)</label>
                          <input type="text" value={editBatch.notes} placeholder="Supplier: ABC Ltd, Invoice: INV-2026-123" onChange={e => setEditBatch(p => ({ ...p, notes: e.target.value }))} />
                        </div>
                      </div>
                      <div style={{ marginTop: '10px' }}>
                        <button type="button" className="btn btn-sm btn-primary" onClick={addBatchInline}>➕ Add Batch</button>
                        <button type="button" className="btn btn-sm btn-outline" style={{ marginLeft: '8px' }} onClick={() => setEditBatch({ qty: '', number: '', expiry: '', received: '', price: '', notes: '' })}>Clear</button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="modal-footer-inner">
                  <button type="button" className="btn btn-outline" onClick={() => setShowAddModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary">💾 Save Material</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ── QR Print Modal ──────────────────────────────────────────────────── */}
      {showQRModal && qrTarget && (
        <div className="rm-modal-overlay" onClick={() => setShowQRModal(false)}>
          <div className="rm-modal rm-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="rm-modal-header">
              <h2>🔲 Print QR Label</h2>
              <button className="rm-modal-close" onClick={() => setShowQRModal(false)}>&times;</button>
            </div>
            <div className="rm-qr-modal-body">
              <QRCode value={qrData} size={220} fgColor="#0f172a" bgColor="#ffffff" />
              <div className="rm-qr-label">
                <div className="qr-name">{qrTarget.name}</div>
                <div className="qr-detail">
                  Code: {qrTarget.code}<br />
                  HSN: {qrTarget.hsnCode || '-'}<br />
                  Unit: {qrTarget.unit}<br />
                  Price: ₹{qrTarget.unitPrice}<br />
                  GST: {qrTarget.gstRate}%<br />
                  Location: {qrTarget.location || '-'}
                </div>
              </div>
            </div>
            <div className="rm-modal-footer">
              <button className="btn btn-primary" style={{ background: '#0f172a', color: 'white', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '50px', border: 'none', fontSize: '13px', cursor: 'pointer', fontWeight: 600 }} onClick={() => window.print()}>🖨️ Print Label</button>
              <button className="btn btn-outline" style={{ background: 'transparent', border: '1.5px solid #e2e8f0', color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '50px', fontSize: '13px', cursor: 'pointer', fontWeight: 500 }} onClick={() => setShowQRModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Batch Add Modal ──────────────────────────────────────────────────── */}
      {showBatchModal && batchTarget && (
        <div className="rm-modal-overlay" onClick={() => setShowBatchModal(false)}>
          <div className="rm-modal rm-modal-lg" onClick={e => e.stopPropagation()}>
            <div className="rm-modal-header">
              <h2>🧪 Add Batch to Material</h2>
              <button className="rm-modal-close" onClick={() => setShowBatchModal(false)}>&times;</button>
            </div>
            <div className="rm-modal-body">
              <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', marginBottom: '16px' }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', fontSize: '24px', color: '#94a3b8' }}>
                  {batchTarget.image ? <img src={batchTarget.image} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '📦'}
                </div>
                <div>
                  <strong style={{ fontSize: '15px' }}>{batchTarget.name}</strong>
                  <span style={{ color: '#64748b', fontSize: '12px', marginLeft: '10px' }}>({batchTarget.code} | HSN: {batchTarget.hsnCode || '-'})</span>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                    Current Total: <strong>{getStock(batchTarget)} {batchTarget.unit}</strong> | Location: <strong>{batchTarget.location || '-'}</strong> | Supplier: <strong>{batchTarget.supplier || '-'}</strong>
                  </div>
                </div>
              </div>
              <div className="form-grid" style={{ marginBottom: '14px' }}>
                <div className="form-group">
                  <label>Quantity to Add <span className="req">*</span></label>
                  <input type="number" value={batchModalForm.qty} step="0.01" min="0.01" onChange={e => setBatchModalForm(p => ({ ...p, qty: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Unit Price for this Batch (₹)</label>
                  <input type="number" value={batchModalForm.price} step="0.01" min="0" placeholder="Leave blank for current price" onChange={e => setBatchModalForm(p => ({ ...p, price: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Batch / Lot Number</label>
                  <input type="text" value={batchModalForm.number} placeholder="LOT-2026-002" onChange={e => setBatchModalForm(p => ({ ...p, number: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Expiry Date</label>
                  <input type="date" value={batchModalForm.expiry} onChange={e => setBatchModalForm(p => ({ ...p, expiry: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Received Date</label>
                  <input type="date" value={batchModalForm.received} onChange={e => setBatchModalForm(p => ({ ...p, received: e.target.value }))} />
                </div>
                <div className="form-group full">
                  <label>Notes (Supplier, Invoice Ref)</label>
                  <input type="text" value={batchModalForm.notes} placeholder="Supplier: ABC Ltd, Invoice: INV-2026-123" onChange={e => setBatchModalForm(p => ({ ...p, notes: e.target.value }))} />
                </div>
              </div>
              <h4 style={{ fontSize: '12px', marginBottom: '10px', color: '#0f172a', fontWeight: 700 }}>Existing Batches</h4>
              <div>
                {(!batchTarget.batches || !batchTarget.batches.length)
                  ? <div style={{ color: '#64748b', fontSize: '12px' }}>No batches yet</div>
                  : batchTarget.batches.map((b, bi) => {
                      const { cls, text } = getBatchExpInfo(b.expiryDate);
                      return (
                        <div key={bi} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #f1f5f9', fontSize: '12px', marginBottom: '6px' }}>
                          <span style={{ color: '#0f172a', fontWeight: 600, minWidth: '100px' }}>{b.batchNumber}</span>
                          <span style={{ fontWeight: 700, minWidth: '80px' }}>{b.quantity} {batchTarget.unit}</span>
                          <span style={{ color: '#10b981', fontWeight: 600, minWidth: '80px' }}>@ ₹{b.price || batchTarget.unitPrice}</span>
                          <span style={{ color: '#64748b', minWidth: '100px', fontSize: '11px' }}>Rcvd: {b.receivedDate ? new Date(b.receivedDate).toLocaleDateString('en-IN') : '-'}</span>
                          <span style={{ minWidth: '110px', fontSize: '11px', color: cls === 'expired' ? '#ef4444' : cls === 'near' ? '#f59e0b' : '#94a3b8', fontWeight: cls ? 600 : 400 }}>{text}</span>
                        </div>
                      );
                    })}
              </div>
            </div>
            <div className="rm-modal-footer">
              <button className="btn btn-primary" style={{ background: '#0f172a', color: 'white', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '50px', border: 'none', fontSize: '13px', cursor: 'pointer', fontWeight: 600 }} onClick={saveBatchFromModal}>➕ Add Batch</button>
              <button className="btn btn-outline" style={{ background: 'transparent', border: '1.5px solid #e2e8f0', color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '50px', fontSize: '13px', cursor: 'pointer', fontWeight: 500 }} onClick={() => setShowBatchModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Low Stock Modal ──────────────────────────────────────────────────── */}
      {showLowStockModal && (
        <div className="rm-modal-overlay" onClick={() => setShowLowStockModal(false)}>
          <div className="rm-modal rm-modal-lg" onClick={e => e.stopPropagation()}>
            <div className="rm-modal-header">
              <h2>⚠️ Low Stock Alerts</h2>
              <button className="rm-modal-close" onClick={() => setShowLowStockModal(false)}>&times;</button>
            </div>
            <div className="rm-modal-body">
              {!lowStockData.out.length && !lowStockData.low.length ? (
                <div className="empty"><div className="icon">📦</div><h4>All stock levels are healthy</h4><p>No materials are below minimum stock levels.</p></div>
              ) : (
                <div style={{ marginBottom: '20px' }}>
                  {lowStockData.out.length > 0 && (
                    <>
                      <h4 style={{ fontSize: '13px', marginBottom: '10px', color: '#ef4444' }}>🚫 Out of Stock ({lowStockData.out.length})</h4>
                      {lowStockData.out.map(m => (
                        <div key={m.id} className="rm-alert-item">
                          <div className="rm-alert-dot danger" />
                          <div><strong>{m.name}</strong> ({m.code}) <span style={{ color: '#64748b' }}>— Location: {m.location || '-'} | Supplier: {m.supplier || '-'}</span></div>
                          <span className="rm-alert-badge">OUT</span>
                        </div>
                      ))}
                    </>
                  )}
                  {lowStockData.low.length > 0 && (
                    <>
                      <h4 style={{ fontSize: '13px', margin: '16px 0 10px', color: '#f59e0b' }}>⚠️ Low Stock ({lowStockData.low.length})</h4>
                      {lowStockData.low.map(m => (
                        <div key={m.id} className="rm-alert-item">
                          <div className="rm-alert-dot warning" />
                          <div><strong>{m.name}</strong> ({m.code}) <span style={{ color: '#64748b' }}>— Stock: {getStock(m)} {m.unit} / Min: {m.minStockLevel} {m.unit} | Location: {m.location || '-'}</span></div>
                          <span className="rm-alert-badge">LOW</span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="rm-modal-footer">
              <button className="btn btn-outline" style={{ background: 'transparent', border: '1.5px solid #e2e8f0', color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '50px', fontSize: '13px', cursor: 'pointer', fontWeight: 500 }} onClick={() => setShowLowStockModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Scan overlay ─────────────────────────────────────────────────────── */}
      {showScanOverlay && (
        <div className="rm-scan-overlay">
          <div className="scan-spinner" />
          <div className="scan-text">{scanText}</div>
        </div>
      )}

      {/* ── Toast container ──────────────────────────────────────────────────── */}
      <div className="rm-toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`rm-toast ${t.type}`}>{t.msg}</div>
        ))}
      </div>
    </div>
  );
}
