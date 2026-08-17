import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import './RDPriceCalculator.css';

// ========== DATA (ported 1:1 from public/rd-price-calculator.html) ==========
const DB_KEY = 'rndPricingDB_v1';
const RM_KEY = 'rawMaterialDB_v8';
const CAT_KEY = 'productCatalogDB_v2';
const SD_KEY = 'sampleDevDB_v1';

const TIER_DEFS = {
  T0: { name: 'Copy or small change', desc: 'Customer gives a product to copy, OR a small tweak to our existing formula (smell / colour / one ingredient).', helper: 'Pick this if you already have a similar formula.', typical: 'Typical quote ₹5,000–₹8,000' },
  T1: { name: 'New formula on our proven base', desc: 'Customer\'s own actives / claims built on top of our proven base formula.', helper: 'Pick this if a base formula already works and we only add the customer\'s actives.', typical: 'Typical quote ₹7,000–₹12,000' },
  T2: { name: 'Fully new development', desc: 'Made from scratch. Quote this ONLY with a volume commitment from the customer.', helper: 'Pick this when nothing similar exists yet.', typical: 'Typical quote ₹12,000+' },
  T3: { name: 'Long research project', desc: 'Open-ended research with no fixed end product.', helper: 'Not priced here — quote a monthly retainer.', typical: 'Retainer — discuss scope' }
};
const GUARD_LOW = 5000, GUARD_HIGH = 20000;
const CORRECTION_CLAUSE = 'One correction round = one consolidated feedback cycle producing one new formula version and one sample set. A change of product concept/benchmark = new quote.';
const PAYMENT_TERMS = '100% advance, single payment, before lab work commences.';
const ASSUMPTION_DEFS = [
  { key: 'equipment', label: 'Equipment (Mold/Tools)', min: 0, max: 20, hint: '3-5% recommended' },
  { key: 'consumables', label: 'Consumables (Small/MSME)', min: 0, max: 10, hint: '1-2% recommended' },
  { key: 'storage', label: 'Storage (Warehouse)', min: 0, max: 10, hint: '2-4% recommended' },
  { key: 'housekeeping', label: 'Housekeeping (Sanitization)', min: 0, max: 10, hint: '1-2% recommended' },
  { key: 'admin', label: 'Admin (Admin STD)', min: 0, max: 20, hint: '5-8% recommended' },
  { key: 'wastage', label: 'Wastage (Production)', min: 0, max: 10, hint: '2-5% recommended' }
];

function defaultSettings() {
  return {
    hourlyRate: 50,
    hoursPerRound: 5,
    tiers: {
      T0: { baseHours: 5, includedCorrections: 2 },
      T1: { baseHours: 12, includedCorrections: 3 },
      T2: { baseHours: 30, includedCorrections: 4 },
      T3: { baseHours: 0, includedCorrections: 0 }
    },
    tests: [
      { name: 'Heavy Metals', price: 3500 },
      { name: 'Microbial (USP 61/62)', price: 2500 },
      { name: 'Preservative Efficacy Test (PET)', price: 6000 },
      { name: 'Stability (accelerated, 3-month)', price: 8000 },
      { name: 'Patch / Dermat test', price: 4000 },
      { name: 'Custom / other', price: 0 }
    ],
    consumablesOneTimePerBatch: 250,
    consumablesReusablePerBatch: 50,
    overheadPerLabDay: 400,
    sampleUnitsPerRound: 3,
    samplePackCostPerUnit: 80,
    courierPerRound: 350,
    contingency: 10,
    margin: 25,
    materialsLumpDefault: 600,
    trialBatchSizeDefault: 200,
    assumptions: { equipment: 3, consumables: 1, storage: 2, housekeeping: 1, admin: 5, wastage: 2 }
  };
}

// Backwards-compatible: old saved settings may lack new fields — fill from defaults.
function mergeSettings(saved) {
  const d = defaultSettings();
  if (!saved) return d;
  const s = Object.assign({}, d, saved);
  s.tiers = {};
  ['T0', 'T1', 'T2', 'T3'].forEach(k => { s.tiers[k] = Object.assign({}, d.tiers[k], (saved.tiers || {})[k] || {}); });
  s.tests = (saved.tests && saved.tests.length ? saved.tests : d.tests).map(t => ({ name: t.name, price: parseFloat(t.price) || 0 }));
  s.assumptions = Object.assign({}, d.assumptions, saved.assumptions || {});
  if (saved.consumablesOneTimePerBatch === undefined && saved.consumablesPerBatch !== undefined) {
    // Legacy single consumables field — keep the new split defaults (250/50)
    s.consumablesOneTimePerBatch = d.consumablesOneTimePerBatch;
    s.consumablesReusablePerBatch = d.consumablesReusablePerBatch;
  }
  return s;
}

// ========== HELPERS ==========
function fmtMoney(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function qtyToBaseUnits(qty, unit) {
  const u = (unit || '').toLowerCase();
  if (u === 'kg' || u === 'liter' || u === 'litre' || u === 'l') return qty / 1000; // qty entered in g/ml
  return qty; // g/ml/piece priced at face value
}
function formulaRowCost(r) { return qtyToBaseUnits(parseFloat(r.qty) || 0, r.unit) * (parseFloat(r.unitPrice) || 0); }
function testsSubtotalOf(testLines) { return testLines.reduce((s, t) => s + (t.checked ? (parseFloat(t.qty) || 0) * (parseFloat(t.price) || 0) : 0), 0); }
function assumptionsTotalPctOf(a) { return ASSUMPTION_DEFS.reduce((s, d) => s + (parseFloat(a[d.key]) || 0), 0); }

function seedDemoQuote(settings) {
  const today = new Date().toISOString().slice(0, 10);
  const a = defaultSettings().assumptions;
  return {
    id: 'RNDQ-0001', date: today,
    customer: 'Demo Cosmetics Pvt Ltd', product: 'Vitamin C Face Serum', category: 'Skin Care',
    tier: 'T1', fee: 19300, status: 'Quoted',
    inputs: {
      quoteDate: today, customer: 'Demo Cosmetics Pvt Ltd',
      product: 'Vitamin C Face Serum', category: 'Skin Care', firstOrderQty: 150, tier: 'T1',
      baseHours: 12, hoursPerRound: 5, includedCorrections: 3, hourlyRate: 50,
      matMode: 'estimate', materialsLump: 600, trialBatches: 3, trialBatchSize: 200, formulaRows: [],
      sampleUnits: 3, packCost: 80, courierCost: 350,
      testLines: [
        { name: 'Heavy Metals', qty: 1, price: 3500, checked: false },
        { name: 'Microbial (USP 61/62)', qty: 1, price: 2500, checked: false },
        { name: 'Preservative Efficacy Test (PET)', qty: 1, price: 6000, checked: false },
        { name: 'Stability (accelerated, 3-month)', qty: 1, price: 8000, checked: true },
        { name: 'Patch / Dermat test', qty: 1, price: 4000, checked: false },
        { name: 'Custom / other', qty: 1, price: 0, checked: false }
      ],
      consumablesOneTime: 250, consumablesReusable: 50, overheadPerDay: 400,
      assumptions: { equipment: a.equipment, consumables: a.consumables, storage: a.storage, housekeeping: a.housekeeping, admin: a.admin, wastage: a.wastage },
      contingency: 10, margin: 25, roundFee: true
    }
  };
}

function loadInitialData() {
  let settings = null, quotes = [], nextQuoteId = 1, seeded = false;
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      quotes = data.quotes || [];
      nextQuoteId = data.nextQuoteId || 1;
      settings = mergeSettings(data.settings);
    }
  } catch (e) { /* fall back to defaults below */ }
  if (!settings) settings = defaultSettings();
  if (!quotes.length) {
    quotes = [seedDemoQuote(settings)];
    nextQuoteId = 2;
    seeded = true;
  }
  if (seeded) {
    try { localStorage.setItem(DB_KEY, JSON.stringify({ settings, quotes, nextQuoteId })); } catch (e) { /* ignore */ }
  }

  let rawMaterials = [];
  try {
    const raw = localStorage.getItem(RM_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      rawMaterials = (data.materials || []).map(m => ({
        id: m.id || '', code: m.code || '', name: m.materialName || m.name || '',
        unit: m.unit || 'kg', unitPrice: parseFloat(m.unitPrice) || 0
      }));
    }
  } catch (e) { rawMaterials = []; }

  let catalogProducts = [];
  try {
    const raw = localStorage.getItem(CAT_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      catalogProducts = (data.products || []).map(p => ({
        code: p.code || '', name: p.name || '', category: p.category || '',
        formulation: p.formulation || null
      }));
    }
  } catch (e) { catalogProducts = []; }

  let devCustomers = [];
  try {
    const raw = localStorage.getItem(SD_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      devCustomers = (data.customers || []).map(c => ({ id: c.id || '', name: c.name || '', contact: c.contact || '' }));
    }
  } catch (e) { devCustomers = []; }

  return { settings, quotes, nextQuoteId, rawMaterials, catalogProducts, devCustomers };
}

export default function RDPriceCalculator() {
  const [initial] = useState(loadInitialData);

  // ---- persisted DB ----
  const [settings, setSettings] = useState(initial.settings);
  const [quotes, setQuotes] = useState(initial.quotes);
  const [nextQuoteId, setNextQuoteId] = useState(initial.nextQuoteId);

  // ---- shared read-only DBs (loaded once) ----
  const [rawMaterials] = useState(initial.rawMaterials);
  const [catalogProducts] = useState(initial.catalogProducts);
  const [devCustomers] = useState(initial.devCustomers);

  // ---- Step 1: customer & product ----
  const [quoteNo, setQuoteNo] = useState(() => 'RNDQ-' + String(initial.nextQuoteId).padStart(4, '0'));
  const [quoteDate, setQuoteDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [firstOrderQty, setFirstOrderQty] = useState(150);
  const [customerSelect, setCustomerSelect] = useState('');
  const [customerText, setCustomerText] = useState('');
  const [productSelect, setProductSelect] = useState('');
  const [productText, setProductText] = useState('');
  const [productCategory, setProductCategory] = useState('');

  // ---- Step 2: type of work ----
  const [tier, setTier] = useState('T0');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pq1, setPq1] = useState(null);
  const [pq2, setPq2] = useState(null);
  const [pq3, setPq3] = useState(null);
  const [pickerResultTier, setPickerResultTier] = useState(null);

  // ---- Step 3: lab time ----
  const [baseHours, setBaseHours] = useState(initial.settings.tiers.T0.baseHours);
  const [hoursPerRound, setHoursPerRound] = useState(initial.settings.hoursPerRound);
  const [includedCorrections, setIncludedCorrections] = useState(initial.settings.tiers.T0.includedCorrections);
  const [hourlyRate, setHourlyRate] = useState(initial.settings.hourlyRate);

  // ---- Step 4: trial materials ----
  const [matMode, setMatMode] = useState('estimate');
  const [materialsLump, setMaterialsLump] = useState(initial.settings.materialsLumpDefault);
  const [trialBatches, setTrialBatchesState] = useState(initial.settings.tiers.T0.includedCorrections);
  const [trialBatchesF, setTrialBatchesF] = useState(initial.settings.tiers.T0.includedCorrections);
  const [trialBatchSize, setTrialBatchSize] = useState(initial.settings.trialBatchSizeDefault);
  const [formulaRows, setFormulaRows] = useState([]);

  // ---- Step 5: samples ----
  const [sampleUnits, setSampleUnits] = useState(initial.settings.sampleUnitsPerRound);
  const [packCost, setPackCost] = useState(initial.settings.samplePackCostPerUnit);
  const [courierCost, setCourierCost] = useState(initial.settings.courierPerRound);

  // ---- Step 6: lab tests ----
  const [testLines, setTestLines] = useState(() => initial.settings.tests.map(t => ({ name: t.name, qty: 1, price: t.price, checked: false, custom: false })));
  const [customTestName, setCustomTestName] = useState('');
  const [customTestQty, setCustomTestQty] = useState(1);
  const [customTestPrice, setCustomTestPrice] = useState('');

  // ---- Step 7: other costs & assumptions ----
  const [consumablesOneTime, setConsumablesOneTime] = useState(initial.settings.consumablesOneTimePerBatch);
  const [consumablesReusable, setConsumablesReusable] = useState(initial.settings.consumablesReusablePerBatch);
  const [overheadPerDay, setOverheadPerDay] = useState(initial.settings.overheadPerLabDay);
  const [assumptions, setAssumptions] = useState(initial.settings.assumptions);
  const [contingency, setContingency] = useState(initial.settings.contingency);
  const [margin, setMargin] = useState(initial.settings.margin);
  const [roundToggle, setRoundToggle] = useState(true);

  // ---- settings modal ----
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState(null);

  // ---- toasts ----
  const [toasts, setToasts] = useState([]);

  function showToast(msg, type) {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
  }

  function persistDb(next) {
    try { localStorage.setItem(DB_KEY, JSON.stringify(next)); } catch (e) { showToast('Failed to save data', 'error'); }
  }

  const hasCustomerDb = devCustomers.length > 0;
  const hasCatalogDb = catalogProducts.length > 0;
  const hasRmDb = rawMaterials.length > 0;

  function getCustomer() { return hasCustomerDb ? (customerSelect === '__custom' ? customerText.trim() : customerSelect) : customerText.trim(); }
  function getProduct() { return hasCatalogDb ? (productSelect === '__custom' ? productText.trim() : productSelect) : productText.trim(); }
  const selectedCatalogProduct = hasCatalogDb && productSelect && productSelect !== '__custom'
    ? (catalogProducts.find(x => x.name === productSelect) || null)
    : null;

  // ========== TIER / PICKER ==========
  function setTrialBatchesBoth(v) { setTrialBatchesState(v); setTrialBatchesF(v); }

  function handleTierChange(k, skipPrefill) {
    setTier(k);
    if (!skipPrefill && k !== 'T3') {
      const t = settings.tiers[k];
      setBaseHours(t.baseHours);
      setIncludedCorrections(t.includedCorrections);
      setTrialBatchesBoth(t.includedCorrections);
    }
  }
  function handleIncludedCorrectionsChange(e) {
    const v = parseFloat(e.target.value) || 0;
    setIncludedCorrections(v);
    setTrialBatchesBoth(v);
  }
  function handlePq(qNum, value) {
    const a = qNum === 1 ? value : pq1, b = qNum === 2 ? value : pq2, c = qNum === 3 ? value : pq3;
    if (qNum === 1) setPq1(value); else if (qNum === 2) setPq2(value); else setPq3(value);
    let resolved = null;
    if (a === 'yes') resolved = 'T0';
    else if (a === 'no' && b === 'yes') resolved = 'T1';
    else if (a === 'no' && b === 'no' && c === 'yes') resolved = 'T3';
    else if (a === 'no' && b === 'no' && c === 'no') resolved = 'T2';
    if (resolved) { handleTierChange(resolved); setPickerResultTier(resolved); }
    else setPickerResultTier(null);
  }

  // ========== TRIAL MATERIALS ==========
  const activeTrialBatches = matMode === 'formula' ? trialBatchesF : trialBatches;

  function handleTrialBatchesFChange(e) {
    const v = parseFloat(e.target.value) || 0;
    setTrialBatchesF(v);
    setTrialBatchesState(v);
  }
  function handleTrialBatchSizeChange(e) {
    const size = parseFloat(e.target.value) || 0;
    setTrialBatchSize(size);
    setFormulaRows(rows => rows.map(r => (r.pct !== undefined && r.pct !== null)
      ? { ...r, qty: Math.round(((parseFloat(r.pct) || 0) / 100) * size * 100) / 100 }
      : r));
  }
  function addFormulaRow() { setFormulaRows(rows => [...rows, { name: '', code: '', unit: 'kg', unitPrice: 0, qty: 0 }]); }
  function removeFormulaRow(i) { setFormulaRows(rows => rows.filter((_, idx) => idx !== i)); }
  function updateFormulaRow(i, patch) { setFormulaRows(rows => rows.map((r, idx) => idx === i ? { ...r, ...patch } : r)); }
  function handleFormulaMatPick(i, val) {
    const code = val.split(' — ')[0].trim();
    const m = rawMaterials.find(x => x.code === code) || rawMaterials.find(x => (x.code + ' — ' + x.name) === val);
    if (m) updateFormulaRow(i, { code: m.code, name: m.name, unit: m.unit, unitPrice: m.unitPrice, pct: undefined });
    else updateFormulaRow(i, { code: '', name: val, unit: 'kg', unitPrice: 0, pct: undefined });
  }
  function handleLoadProductFormula() {
    const p = selectedCatalogProduct;
    if (!p) { showToast('Pick a catalogue product in Step 1 first', 'warning'); return; }
    const f = p.formulation;
    let v = null;
    if (f && Array.isArray(f.versions) && f.versions.length) {
      v = f.versions.find(x => x.versionId === f.currentVersionId) ||
          f.versions.slice().sort((a, b) => (b.versionNo || 0) - (a.versionNo || 0))[0];
    } else if (f && Array.isArray(f.rows)) {
      v = f;
    }
    if (!v || !v.rows || !v.rows.length) { showToast('No formula rows found for "' + p.name + '"', 'warning'); return; }
    const size = trialBatchSize || settings.trialBatchSizeDefault || 200;
    const newRows = v.rows.map(r => {
      const pct = parseFloat(r.percentage) || 0;
      const rm = rawMaterials.find(m => (r.code && (m.code === r.code || m.id === r.code)) || (r.name && m.name === r.name));
      const unit = rm ? rm.unit : (['kg', 'l', 'liter', 'litre'].indexOf((r.unit || '').toLowerCase()) >= 0 ? r.unit : (r.unit || 'g'));
      return {
        name: (rm && rm.name) || r.name || '', code: rm ? (rm.code || r.code || '') : (r.code || ''),
        unit, unitPrice: rm ? rm.unitPrice : (parseFloat(r.unitPrice) || 0),
        pct, qty: Math.round((pct / 100) * size * 100) / 100
      };
    });
    setFormulaRows(newRows);
    setMatMode('formula');
    showToast('Loaded ' + newRows.length + ' ingredients from "' + p.name + '" (' + (v.versionId || 'formula') + ', batch ' + size + ' g)', 'success');
  }

  // ========== LAB TESTS ==========
  function addCustomTest() {
    const name = customTestName.trim() || 'Custom test';
    const qty = parseFloat(customTestQty) || 1;
    const price = parseFloat(customTestPrice) || 0;
    setTestLines(lines => [...lines, { name, qty, price, checked: true, custom: true }]);
    setCustomTestName('');
    setCustomTestPrice('');
  }
  function removeTestLine(i) { setTestLines(lines => lines.filter((_, idx) => idx !== i)); }

  // ========== QUOTE ENGINE ==========
  const batchCost = useMemo(() => formulaRows.reduce((s, r) => s + formulaRowCost(r), 0), [formulaRows]);
  const assPct = useMemo(() => assumptionsTotalPctOf(assumptions), [assumptions]);
  const externalTests = useMemo(() => testsSubtotalOf(testLines), [testLines]);

  const liveCalc = useMemo(() => {
    if (tier === 'T3') return null;
    const labHours = baseHours + Math.max(0, includedCorrections - 1) * hoursPerRound;
    const labourCost = labHours * hourlyRate;
    const materials = matMode === 'formula' ? batchCost * activeTrialBatches : materialsLump;
    const assumptionsAmount = materials * (assPct / 100);
    const perRoundSampleCost = sampleUnits * packCost + courierCost;
    const samplesCost = includedCorrections * perRoundSampleCost;
    const consumablesOneTimeCost = consumablesOneTime * activeTrialBatches;
    const consumablesReusableCost = consumablesReusable * activeTrialBatches;
    const labDays = Math.ceil(labHours / 6);
    const overhead = labDays * overheadPerDay;
    const subtotal = labourCost + materials + assumptionsAmount + samplesCost + consumablesOneTimeCost + consumablesReusableCost + overhead + externalTests;
    const contingencyPct = contingency / 100;
    const marginPct = margin / 100;
    const contingencyAmt = subtotal * contingencyPct;
    const rawFee = (subtotal + contingencyAmt) * (1 + marginPct);
    const fee = roundToggle ? Math.round(rawFee / 100) * 100 : rawFee;
    const perRoundMaterials = activeTrialBatches > 0 ? materials / activeTrialBatches : 0;
    const extraRound = (hoursPerRound * hourlyRate + perRoundMaterials + perRoundSampleCost) * (1 + marginPct);
    const perUnit = firstOrderQty > 0 ? fee / firstOrderQty : null;
    return {
      tier, labHours, labourCost, batchCost, materials, perRoundMaterials, perRoundSampleCost,
      assPct, assumptionsAmount, samplesCost, consumablesOneTimeCost, consumablesReusableCost,
      labDays, overhead, externalTests, subtotal, contingency: contingencyAmt, contingencyPct, marginPct,
      rawFee, fee, roundFee: roundToggle, extraRound, perUnit, firstOrderQty,
      includedCorrections, hourlyRate, sampleUnits, packCost, courier: courierCost,
      consumablesOneTime, consumablesReusable, trialBatches: activeTrialBatches, matMode
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tier, baseHours, includedCorrections, hoursPerRound, hourlyRate, matMode, batchCost, activeTrialBatches,
      materialsLump, assPct, sampleUnits, packCost, courierCost, consumablesOneTime, consumablesReusable,
      overheadPerDay, externalTests, contingency, margin, roundToggle, firstOrderQty]);

  // The original vanilla-JS recalcQuote() returns early on tier T3 WITHOUT clearing the still-visible
  // Step 3/4/6/7 number displays — they simply freeze at their last computed values. Replicate that with
  // a "last known good" snapshot instead of resetting those displays to zero when T3 is selected.
  const [frozenCalc, setFrozenCalc] = useState(liveCalc);
  useEffect(() => { if (liveCalc) setFrozenCalc(liveCalc); }, [liveCalc]);
  const displayCalc = liveCalc || frozenCalc;

  // ========== COLLECT / APPLY INPUTS ==========
  function collectInputs() {
    return {
      quoteDate, customer: getCustomer(), product: getProduct(), category: productCategory.trim(),
      firstOrderQty, tier,
      baseHours, hoursPerRound, includedCorrections, hourlyRate,
      matMode, materialsLump, trialBatches: activeTrialBatches, trialBatchSize,
      formulaRows: JSON.parse(JSON.stringify(formulaRows)),
      sampleUnits, packCost, courierCost,
      testLines: JSON.parse(JSON.stringify(testLines)),
      consumablesOneTime, consumablesReusable, overheadPerDay,
      assumptions: { ...assumptions },
      contingency, margin,
      roundFee: roundToggle
    };
  }

  function applyInputs(inp) {
    if (!inp) return;
    setQuoteDate(inp.quoteDate || '');
    if (hasCustomerDb && inp.customer && devCustomers.some(c => c.name === inp.customer)) {
      setCustomerSelect(inp.customer);
    } else {
      if (hasCustomerDb) setCustomerSelect('__custom');
      setCustomerText(inp.customer || '');
    }
    if (hasCatalogDb && inp.product && catalogProducts.some(p => p.name === inp.product)) {
      setProductSelect(inp.product);
    } else {
      if (hasCatalogDb) setProductSelect('__custom');
      setProductText(inp.product || '');
    }
    setProductCategory(inp.category || '');
    setFirstOrderQty(inp.firstOrderQty);
    setBaseHours(inp.baseHours);
    setHoursPerRound(inp.hoursPerRound);
    setIncludedCorrections(inp.includedCorrections);
    setHourlyRate(inp.hourlyRate);
    setMaterialsLump(inp.materialsLump);
    const tb = inp.trialBatches !== undefined ? inp.trialBatches : (inp.includedCorrections || 0);
    setTrialBatchesBoth(tb);
    setTrialBatchSize(inp.trialBatchSize !== undefined ? inp.trialBatchSize : settings.trialBatchSizeDefault);
    setFormulaRows(JSON.parse(JSON.stringify(inp.formulaRows || [])));
    setSampleUnits(inp.sampleUnits);
    setPackCost(inp.packCost);
    setCourierCost(inp.courierCost);
    if (inp.testLines && inp.testLines.length) setTestLines(JSON.parse(JSON.stringify(inp.testLines)));
    setConsumablesOneTime(inp.consumablesOneTime !== undefined ? inp.consumablesOneTime : settings.consumablesOneTimePerBatch);
    setConsumablesReusable(inp.consumablesReusable !== undefined ? inp.consumablesReusable : settings.consumablesReusablePerBatch);
    setOverheadPerDay(inp.overheadPerDay);
    const ia = inp.assumptions || {};
    setAssumptions({
      equipment: ia.equipment !== undefined ? ia.equipment : settings.assumptions.equipment,
      consumables: ia.consumables !== undefined ? ia.consumables : settings.assumptions.consumables,
      storage: ia.storage !== undefined ? ia.storage : settings.assumptions.storage,
      housekeeping: ia.housekeeping !== undefined ? ia.housekeeping : settings.assumptions.housekeeping,
      admin: ia.admin !== undefined ? ia.admin : settings.assumptions.admin,
      wastage: ia.wastage !== undefined ? ia.wastage : settings.assumptions.wastage
    });
    setContingency(inp.contingency !== undefined ? inp.contingency : settings.contingency);
    setMargin(inp.margin !== undefined ? inp.margin : settings.margin);
    if (inp.roundFee !== undefined) setRoundToggle(!!inp.roundFee);
    setMatMode(inp.matMode || 'estimate');
    setTier(inp.tier || 'T0'); // skipPrefill: fields above already carry the saved values
  }

  // ========== SAVED QUOTES ==========
  function saveQuote() {
    if (tier === 'T3') { showToast('Long research project is quoted as a retainer — not saved by calculator', 'warning'); return; }
    const calc = liveCalc;
    const inputs = collectInputs();
    const id = 'RNDQ-' + String(nextQuoteId).padStart(4, '0');
    const q = {
      id, date: inputs.quoteDate || new Date().toISOString().slice(0, 10),
      customer: inputs.customer || '—', product: inputs.product || '—', category: inputs.category,
      tier: inputs.tier, fee: calc.fee, status: 'Quoted', inputs
    };
    const newNextId = nextQuoteId + 1;
    const newQuotes = [...quotes, q];
    persistDb({ settings, quotes: newQuotes, nextQuoteId: newNextId });
    setQuotes(newQuotes);
    setNextQuoteId(newNextId);
    setQuoteNo('RNDQ-' + String(newNextId).padStart(4, '0'));
    showToast('Quote saved: ' + q.id + ' — ' + fmtMoney(q.fee), 'success');
  }
  function loadQuote(id) {
    const q = quotes.find(x => x.id === id);
    if (!q) return;
    applyInputs(q.inputs);
    showToast('Loaded ' + q.id + ' into calculator', 'success');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function deleteQuote(id) {
    if (!window.confirm('Delete quote ' + id + '?')) return;
    const newQuotes = quotes.filter(x => x.id !== id);
    persistDb({ settings, quotes: newQuotes, nextQuoteId });
    setQuotes(newQuotes);
    showToast('Deleted ' + id, 'warning');
  }
  function resetForm() {
    const s = settings;
    setQuoteDate(new Date().toISOString().slice(0, 10));
    if (hasCustomerDb) setCustomerSelect('');
    if (hasCatalogDb) setProductSelect('');
    setCustomerText('');
    setProductText('');
    setProductCategory('');
    setFirstOrderQty(150);
    setHourlyRate(s.hourlyRate);
    setHoursPerRound(s.hoursPerRound);
    setMaterialsLump(s.materialsLumpDefault);
    setTrialBatchSize(s.trialBatchSizeDefault);
    setSampleUnits(s.sampleUnitsPerRound);
    setPackCost(s.samplePackCostPerUnit);
    setCourierCost(s.courierPerRound);
    setConsumablesOneTime(s.consumablesOneTimePerBatch);
    setConsumablesReusable(s.consumablesReusablePerBatch);
    setOverheadPerDay(s.overheadPerLabDay);
    setAssumptions({ ...s.assumptions });
    setContingency(s.contingency);
    setMargin(s.margin);
    setRoundToggle(true);
    setPq1(null); setPq2(null); setPq3(null); setPickerResultTier(null);
    setFormulaRows([]);
    setTestLines(s.tests.map(t => ({ name: t.name, qty: 1, price: t.price, checked: false, custom: false })));
    setMatMode('estimate');
    setTier('T0');
    setBaseHours(s.tiers.T0.baseHours);
    setIncludedCorrections(s.tiers.T0.includedCorrections);
    setTrialBatchesBoth(s.tiers.T0.includedCorrections);
    showToast('Form reset to defaults', 'success');
  }

  // ========== COPY SUMMARY ==========
  function buildSummaryText() {
    const c = liveCalc;
    if (!c) return '';
    const inp = collectInputs();
    const selectedTests = testLines.filter(t => t.checked).map(t => t.name + ' × ' + t.qty + ' @ ' + fmtMoney(t.price)).join('; ');
    return [
      'BACKERO BioTech — R&D Quotation ' + quoteNo,
      'Date: ' + (inp.quoteDate || '-') + ' | Customer: ' + (inp.customer || '-') + ' | Product: ' + (inp.product || '-') + (inp.category ? ' (' + inp.category + ')' : ''),
      'Scope: ' + TIER_DEFS[c.tier].name + ' — ' + c.includedCorrections + ' correction rounds included (' + c.labHours + ' est. lab hours)',
      '',
      'Lab work: ' + fmtMoney(c.labourCost) + ' | Materials: ' + fmtMoney(c.materials) + ' | Factory extras (' + c.assPct + '%): ' + fmtMoney(c.assumptionsAmount),
      'Samples & courier: ' + fmtMoney(c.samplesCost) + ' | One-time items: ' + fmtMoney(c.consumablesOneTimeCost) + ' | Reusable wear: ' + fmtMoney(c.consumablesReusableCost),
      'Lab space & power: ' + fmtMoney(c.overhead) + ' | Outside tests: ' + fmtMoney(c.externalTests),
      'Subtotal: ' + fmtMoney(c.subtotal) + ' + Safety buffer ' + (c.contingencyPct * 100) + '% + Margin ' + (c.marginPct * 100) + '%',
      '',
      'QUOTE THIS AMOUNT (one-time): ' + fmtMoney(c.fee),
      'Extra correction round: ' + fmtMoney(c.extraRound) + ' / round',
      'First-order recovery: ' + (c.perUnit !== null ? fmtMoney(c.perUnit) + '/unit @ ' + c.firstOrderQty + ' pcs' : '—') + ' | @500: ' + fmtMoney(c.fee / 500) + ' | @1000: ' + fmtMoney(c.fee / 1000),
      selectedTests ? 'Outside tests: ' + selectedTests : 'Outside tests: none selected',
      'Payment: ' + PAYMENT_TERMS,
      CORRECTION_CLAUSE,
      'Validity: 30 days.'
    ].join('\n');
  }
  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); showToast('Summary copied to clipboard', 'success'); }
    catch (e) { showToast('Copy failed — select and copy manually', 'error'); }
    ta.remove();
  }
  function copySummary() {
    if (tier === 'T3') { showToast('Long research project is quoted as a retainer — nothing to copy', 'warning'); return; }
    const text = buildSummaryText();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => showToast('Summary copied to clipboard', 'success')).catch(() => fallbackCopy(text));
    } else fallbackCopy(text);
  }
  function printQuotation() {
    if (tier === 'T3') { showToast('Long research project is quoted as a retainer — nothing to print', 'warning'); return; }
    window.print();
  }

  // ========== SETTINGS MODAL ==========
  function openSettings() {
    setSettingsDraft(JSON.parse(JSON.stringify(settings)));
    setSettingsOpen(true);
  }
  function closeSettingsModal() { setSettingsOpen(false); }
  function updateDraftTier(k, field, value) {
    setSettingsDraft(d => ({ ...d, tiers: { ...d.tiers, [k]: { ...d.tiers[k], [field]: value } } }));
  }
  function updateDraftField(field, value) {
    setSettingsDraft(d => ({ ...d, [field]: value }));
  }
  function updateDraftAssumption(key, value) {
    setSettingsDraft(d => ({ ...d, assumptions: { ...d.assumptions, [key]: value } }));
  }
  function updateDraftTestPrice(i, value) {
    setSettingsDraft(d => ({ ...d, tests: d.tests.map((t, idx) => idx === i ? { ...t, price: value } : t) }));
  }
  function saveSettings() {
    const s = { ...settingsDraft, contingency: Math.min(25, settingsDraft.contingency), margin: Math.min(100, settingsDraft.margin) };
    persistDb({ settings: s, quotes, nextQuoteId });
    setSettings(s);
    setSettingsOpen(false);
    if (tier !== 'T3') {
      const t = s.tiers[tier];
      setBaseHours(t.baseHours);
      setIncludedCorrections(t.includedCorrections);
      setTrialBatchesBoth(t.includedCorrections);
    }
    setHourlyRate(s.hourlyRate);
    setHoursPerRound(s.hoursPerRound);
    showToast('Settings saved', 'success');
  }

  // ========== RENDER ==========
  return (
    <div className="rd-price-calculator">
      <div className="header">
        <div className="brand">
          <div className="brand-icon">🧮</div>
          <div className="brand-text">
            <h1>R&amp;D Price Calculator — Backero BioTech</h1>
            <span>BioTech / Cosmetic ERP</span>
          </div>
        </div>
        <div className="header-nav">
          <Link className="nav-link" to="/inventory/catalog">Product Catalogue</Link>
          <Link className="nav-link" to="/samples">Sample Flow</Link>
          <Link className="nav-link" to="/inventory/rawmaterials">Raw Materials</Link>
        </div>
        <div className="header-actions">
          <button className="btn btn-outline" onClick={openSettings}>⚙️ Settings</button>
        </div>
      </div>

      <div className="main">
        <div className={`db-banner${!hasRmDb ? ' show' : ''}`}><span className="icon">⚠️</span><span><strong>Raw Materials DB not found</strong> — enter material costs manually (formula mode will use manual prices).</span></div>
        <div className={`db-banner${!hasCatalogDb ? ' show' : ''}`}><span className="icon">ℹ️</span><span>Product Catalogue DB not found — type the product name yourself.</span></div>
        <div className={`db-banner${!hasCustomerDb ? ' show' : ''}`}><span className="icon">ℹ️</span><span>Sample Dev DB not found — type the customer name yourself.</span></div>

        <div className="layout-grid">
          <div className="left-col">

            {/* STEP 1: CUSTOMER & PRODUCT */}
            <div className="card">
              <div className="card-header"><h2><span className="step-no">1</span>Customer &amp; Product</h2><span className="tag tag-gray">{quoteNo}</span></div>
              <div className="card-body">
                <div className="form-grid">
                  <div className="form-group">
                    <label>Quote #</label>
                    <input type="text" readOnly value={quoteNo} style={{ background: 'var(--surface)', fontWeight: 700, color: 'var(--primary)' }} />
                    <div className="help">Fills in automatically — one number per quote.</div>
                  </div>
                  <div className="form-group">
                    <label>Date</label>
                    <input type="date" value={quoteDate} onChange={e => setQuoteDate(e.target.value)} />
                    <div className="help">Today's date is already filled in.</div>
                  </div>
                  <div className="form-group">
                    <label>How many pieces will the customer order first?</label>
                    <input type="number" min="0" step="1" value={firstOrderQty} onChange={e => setFirstOrderQty(parseFloat(e.target.value) || 0)} />
                    <div className="help">Their first order size, e.g. 150 bottles. Used to show the R&amp;D cost per piece.</div>
                  </div>
                  {hasCustomerDb ? (
                    <div className="form-group">
                      <label>Customer</label>
                      <select value={customerSelect} onChange={e => { setCustomerSelect(e.target.value); }}>
                        <option value="">— Select customer —</option>
                        {devCustomers.map(c => <option key={c.name} value={c.name}>{c.id ? c.id + ' — ' : ''}{c.name}</option>)}
                        <option value="__custom">✏️ Other (type manually)</option>
                      </select>
                      <div className="help">Pick the customer from the list.</div>
                    </div>
                  ) : (
                    <div className="form-group">
                      <label>Customer Name</label>
                      <input type="text" placeholder="e.g. Demo Cosmetics Pvt Ltd" value={customerText} onChange={e => setCustomerText(e.target.value)} />
                      <div className="help">Type the customer or company name.</div>
                    </div>
                  )}
                  {hasCustomerDb && customerSelect === '__custom' && (
                    <div className="form-group">
                      <label>Customer Name</label>
                      <input type="text" placeholder="e.g. Demo Cosmetics Pvt Ltd" value={customerText} onChange={e => setCustomerText(e.target.value)} autoFocus />
                      <div className="help">Type the customer or company name.</div>
                    </div>
                  )}
                  {hasCatalogDb ? (
                    <div className="form-group">
                      <label>Product (from catalogue)</label>
                      <select value={productSelect} onChange={e => {
                        const v = e.target.value;
                        setProductSelect(v);
                        if (v !== '__custom') {
                          const p = catalogProducts.find(x => x.name === v);
                          if (p && p.category) setProductCategory(p.category);
                        }
                      }}>
                        <option value="">— Select product —</option>
                        {catalogProducts.map(p => <option key={p.name} value={p.name}>{p.code ? p.code + ' — ' : ''}{p.name}</option>)}
                        <option value="__custom">✏️ Other (type manually)</option>
                      </select>
                      <div className="help">Pick the product if it is in our catalogue.</div>
                    </div>
                  ) : (
                    <div className="form-group">
                      <label>Product Name</label>
                      <input type="text" placeholder="e.g. Vitamin C Face Serum" value={productText} onChange={e => setProductText(e.target.value)} />
                      <div className="help">Type what we are making, e.g. "Vitamin C Face Serum".</div>
                    </div>
                  )}
                  {hasCatalogDb && productSelect === '__custom' && (
                    <div className="form-group">
                      <label>Product Name</label>
                      <input type="text" placeholder="e.g. Vitamin C Face Serum" value={productText} onChange={e => setProductText(e.target.value)} autoFocus />
                      <div className="help">Type what we are making, e.g. "Vitamin C Face Serum".</div>
                    </div>
                  )}
                  <div className="form-group">
                    <label>Product Category</label>
                    <input type="text" placeholder="e.g. Skin Care" value={productCategory} onChange={e => setProductCategory(e.target.value)} />
                    <div className="help">e.g. Skin Care, Hair Care. Fills in automatically if you picked a catalogue product.</div>
                  </div>
                </div>
              </div>
            </div>

            {/* STEP 2: TYPE OF WORK */}
            <div className="card">
              <div className="card-header"><h2><span className="step-no">2</span>Type of Work</h2></div>
              <div className="card-body">
                <div className="picker-box">
                  <button type="button" className="picker-toggle" onClick={() => setPickerOpen(o => !o)}>
                    💡 Not sure which type? Answer 3 quick questions
                    <span style={{ marginLeft: 'auto', fontWeight: 500, color: 'var(--text-muted)', fontSize: '11px' }}>{pickerOpen ? 'hide' : 'show'}</span>
                  </button>
                  <div className={`picker-body${pickerOpen ? '' : ' hidden'}`}>
                    <div className="picker-q">
                      <span className="q-text">1. Do you already have a formula or a product to copy (or only a small change like smell / colour)?</span>
                      <span className="q-opts">
                        <label><input type="radio" name="pq1" checked={pq1 === 'yes'} onChange={() => handlePq(1, 'yes')} /> Yes</label>
                        <label><input type="radio" name="pq1" checked={pq1 === 'no'} onChange={() => handlePq(1, 'no')} /> No</label>
                      </span>
                    </div>
                    <div className="picker-q">
                      <span className="q-text">2. Will we build it on one of our proven base formulas?</span>
                      <span className="q-opts">
                        <label><input type="radio" name="pq2" checked={pq2 === 'yes'} onChange={() => handlePq(2, 'yes')} /> Yes</label>
                        <label><input type="radio" name="pq2" checked={pq2 === 'no'} onChange={() => handlePq(2, 'no')} /> No</label>
                      </span>
                    </div>
                    <div className="picker-q">
                      <span className="q-text">3. Is it an open-ended research project with no fixed product at the end?</span>
                      <span className="q-opts">
                        <label><input type="radio" name="pq3" checked={pq3 === 'yes'} onChange={() => handlePq(3, 'yes')} /> Yes</label>
                        <label><input type="radio" name="pq3" checked={pq3 === 'no'} onChange={() => handlePq(3, 'no')} /> No</label>
                      </span>
                    </div>
                    {pickerResultTier && (
                      <div className="picker-result show">
                        ✅ We picked for you: <strong>{TIER_DEFS[pickerResultTier].name}</strong>
                        {pickerResultTier === 'T3' ? ' — quote a monthly retainer after a scope discussion (not priced here).' : ' — the hours below are pre-filled, you can just continue to Step 3.'}
                      </div>
                    )}
                  </div>
                </div>
                <div className="tier-grid">
                  {['T0', 'T1', 'T2', 'T3'].map(k => {
                    const t = settings.tiers[k];
                    const d = TIER_DEFS[k];
                    const meta = k === 'T3' ? 'Not priced here' : `${t.baseHours} h first version · ${t.includedCorrections} corrections included`;
                    return (
                      <label key={k} className={`tier-card${tier === k ? ' active' : ''}`}>
                        <input type="radio" name="tier" value={k} checked={tier === k} onChange={() => handleTierChange(k)} />
                        <span className="t-name">{d.name} <span className="t-code">({k})</span></span>
                        <span className="t-desc">{d.desc}</span>
                        <span className="t-desc" style={{ color: 'var(--text-muted)' }}>{d.helper}</span>
                        <span className="t-meta">{meta}</span>
                        <span className="t-band">{d.typical}</span>
                      </label>
                    );
                  })}
                </div>
                <div className={`tier-advisory${tier === 'T3' ? ' show' : ''}`}><span>💼</span><span><strong>Long research project</strong> has no fixed end — do NOT price it here. <strong>Quote a monthly retainer after a scope discussion</strong> with the customer.</span></div>
              </div>
            </div>

            {/* STEP 3: LAB TIME */}
            <div className="card">
              <div className="card-header"><h2><span className="step-no">3</span>Lab Time</h2><span className="tag tag-info">AI + 1 lab executive</span></div>
              <div className="card-body">
                <div className="info-note">🤖 The formula is made by AI + 1 lab executive — <strong>you only pay for the executive's working hours</strong> (AI time is free).</div>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Hours to make the first version</label>
                    <input type="number" min="0" step="0.5" value={baseHours} onChange={e => setBaseHours(parseFloat(e.target.value) || 0)} />
                    <div className="help">Filled in from the work type above — change only if this job is unusual.</div>
                  </div>
                  <div className="form-group">
                    <label>Hours for each correction round</label>
                    <input type="number" min="0" step="0.5" value={hoursPerRound} onChange={e => setHoursPerRound(parseFloat(e.target.value) || 0)} />
                    <div className="help">Default 5 hours per round of customer feedback.</div>
                  </div>
                  <div className="form-group">
                    <label>Correction rounds included in the price</label>
                    <input type="number" min="0" step="1" value={includedCorrections} onChange={handleIncludedCorrectionsChange} />
                    <div className="help">How many times we will remake the sample for free within this fee.</div>
                  </div>
                  <div className="form-group">
                    <label>Executive cost per lab hour (₹)</label>
                    <input type="number" min="0" step="10" value={hourlyRate} onChange={e => setHourlyRate(parseFloat(e.target.value) || 0)} />
                    <div className="help">Standard ₹50/hour for our lab executive. Do not change unless told.</div>
                  </div>
                </div>
                <div className="pricing-highlight" style={{ marginTop: '16px', marginBottom: 0 }}>
                  <div><div className="label">Total Lab Hours</div><div className="value">{displayCalc ? displayCalc.labHours.toLocaleString('en-IN') : '0'} h</div></div>
                  <div><div className="label">Lab Work Cost</div><div className="value">{fmtMoney(displayCalc ? displayCalc.labourCost : 0)}</div></div>
                  <div><div className="label">Lab-Days Needed (6 working h/day)</div><div className="value">{displayCalc ? displayCalc.labDays : 0}</div></div>
                </div>
              </div>
            </div>

            {/* STEP 4: TRIAL MATERIALS */}
            <div className="card">
              <div className="card-header"><h2><span className="step-no">4</span>Trial Materials</h2>
                <div className="mode-toggle">
                  <button className={matMode === 'estimate' ? 'active' : ''} onClick={() => setMatMode('estimate')}>💰 Rough estimate (₹)</button>
                  <button className={matMode === 'formula' ? 'active' : ''} onClick={() => setMatMode('formula')}>🧬 From the actual formula</button>
                </div>
              </div>
              <div className="card-body">
                {matMode === 'estimate' && (
                  <div>
                    <div className="info-note">💰 Easiest way — type one rough amount for all the raw materials needed for the trials.</div>
                    <div className="form-grid">
                      <div className="form-group">
                        <label>Rough materials cost for all trials (₹)</label>
                        <input type="number" min="0" step="50" value={materialsLump} onChange={e => setMaterialsLump(parseFloat(e.target.value) || 0)} />
                        <div className="help">One total guess, e.g. ₹600. Use this if the formula is not decided yet.</div>
                      </div>
                      <div className="form-group">
                        <label>How many trial batches will we make?</label>
                        <input type="number" min="0" step="1" value={trialBatches} onChange={e => setTrialBatchesState(parseFloat(e.target.value) || 0)} />
                        <div className="help">Normally same as the number of correction rounds — auto-filled.</div>
                      </div>
                    </div>
                  </div>
                )}
                {matMode === 'formula' && (
                  <div>
                    <div className="info-note">🧬 Most accurate way — use the real formula once it is decided. Each row is one ingredient; qty is per trial batch in <strong>g/ml</strong>. Materials priced per kg/L are auto-divided by 1000.</div>
                    <div className="form-grid" style={{ marginBottom: '12px' }}>
                      <div className="form-group">
                        <label>Trial batch size (g)</label>
                        <input type="number" min="0" step="10" value={trialBatchSize} onChange={handleTrialBatchSizeChange} />
                        <div className="help">Size of one trial batch, e.g. 200 g. Ingredient qty = ingredient % × this size.</div>
                      </div>
                      <div className="form-group">
                        <label>Use a catalogue product's formula</label>
                        <button type="button" className="btn btn-sm btn-primary" disabled={!selectedCatalogProduct} style={{ opacity: selectedCatalogProduct ? 1 : 0.5 }} onClick={handleLoadProductFormula}>📥 Load ingredients from this product's formula</button>
                        <div className="help">{selectedCatalogProduct ? `Will pull the latest formula of "${selectedCatalogProduct.name}" from the Product Catalogue.` : 'Pick a catalogue product in Step 1 first, then click to pull its latest formula rows here.'}</div>
                      </div>
                    </div>
                    <div className="table-wrap" style={{ marginBottom: '10px' }}>
                      <table className="formula-table">
                        <thead>
                          <tr>
                            {hasRmDb ? (
                              <>
                                <th>Material (Raw Materials DB)</th><th style={{ width: '110px' }}>Qty / batch (g/ml)</th><th style={{ width: '70px' }}>Unit</th><th style={{ width: '110px' }}>Price / unit</th><th style={{ width: '100px', textAlign: 'right' }}>Cost</th><th style={{ width: '36px' }}></th>
                              </>
                            ) : (
                              <>
                                <th>Material (manual)</th><th style={{ width: '110px' }}>Price / kg or L (₹)</th><th style={{ width: '110px' }}>Qty / batch (g/ml)</th><th style={{ width: '100px', textAlign: 'right' }}>Cost</th><th style={{ width: '36px' }}></th>
                              </>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {formulaRows.map((r, i) => {
                            const cost = formulaRowCost(r);
                            return (
                              <tr key={i}>
                                {hasRmDb ? (
                                  <>
                                    <td><input list="rmDatalist" placeholder="Search RM code / name…" defaultValue={r.code ? r.code + ' — ' + r.name : r.name} onChange={e => handleFormulaMatPick(i, e.target.value)} /></td>
                                    <td><input type="number" min="0" step="0.1" value={r.qty} onChange={e => updateFormulaRow(i, { qty: parseFloat(e.target.value) || 0 })} /></td>
                                    <td style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{r.unit || '—'}</td>
                                    <td style={{ fontSize: '11px' }}>{r.code ? fmtMoney(r.unitPrice) : '—'}</td>
                                    <td className="f-cost">{fmtMoney(cost)}</td>
                                    <td><button className="f-del" onClick={() => removeFormulaRow(i)}>🗑️</button></td>
                                  </>
                                ) : (
                                  <>
                                    <td><input placeholder="Material name" value={r.name} onChange={e => updateFormulaRow(i, { name: e.target.value })} /></td>
                                    <td><input type="number" min="0" step="0.01" value={r.unitPrice} onChange={e => updateFormulaRow(i, { unitPrice: parseFloat(e.target.value) || 0 })} /></td>
                                    <td><input type="number" min="0" step="0.1" value={r.qty} onChange={e => updateFormulaRow(i, { qty: parseFloat(e.target.value) || 0 })} /></td>
                                    <td className="f-cost">{fmtMoney(cost)}</td>
                                    <td><button className="f-del" onClick={() => removeFormulaRow(i)}>🗑️</button></td>
                                  </>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <button className="btn btn-sm btn-outline" onClick={addFormulaRow}>➕ Add Ingredient Row</button>
                      <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
                        <label style={{ whiteSpace: 'nowrap' }}>Trial batches:</label>
                        <input type="number" min="0" step="1" style={{ width: '90px' }} value={trialBatchesF} onChange={handleTrialBatchesFChange} />
                      </div>
                    </div>
                    <div className="pricing-highlight" style={{ marginTop: '14px', marginBottom: 0 }}>
                      <div><div className="label">Cost of One Trial Batch</div><div className="value">{fmtMoney(batchCost)}</div></div>
                      <div><div className="label">Total Trial Materials</div><div className="value">{fmtMoney(displayCalc && displayCalc.matMode === 'formula' ? displayCalc.materials : 0)}</div></div>
                    </div>
                  </div>
                )}
                <datalist id="rmDatalist">
                  {rawMaterials.map(m => <option key={m.code + m.name} value={m.code + ' — ' + m.name} />)}
                </datalist>
              </div>
            </div>

            {/* STEP 5: SAMPLES TO SEND */}
            <div className="card">
              <div className="card-header"><h2><span className="step-no">5</span>Samples You Send to the Customer</h2></div>
              <div className="card-body">
                <div className="info-note">📦 These costs are charged <strong>once per correction round</strong> — every time we make a new sample set and courier it.</div>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Sample pieces sent each time</label>
                    <input type="number" min="0" step="1" value={sampleUnits} onChange={e => setSampleUnits(parseFloat(e.target.value) || 0)} />
                    <div className="help">How many sample pieces do you send the customer each time? (like 3 bottles) Default 3.</div>
                  </div>
                  <div className="form-group">
                    <label>Cost to pack ONE sample piece (₹)</label>
                    <input type="number" min="0" step="10" value={packCost} onChange={e => setPackCost(parseFloat(e.target.value) || 0)} />
                    <div className="help">Empty jar/bottle + label + filling for one piece. Default ₹80.</div>
                  </div>
                  <div className="form-group">
                    <label>Courier charge for one shipment (₹)</label>
                    <input type="number" min="0" step="50" value={courierCost} onChange={e => setCourierCost(parseFloat(e.target.value) || 0)} />
                    <div className="help">What the courier company charges for one parcel. Default ₹350.</div>
                  </div>
                </div>
              </div>
            </div>

            {/* STEP 6: LAB TESTS */}
            <div className="card">
              <div className="card-header"><h2><span className="step-no">6</span>Lab Tests</h2></div>
              <div className="card-body">
                <div style={{ marginBottom: '14px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>Free — basic tests we do in our own lab:</div>
                  <div className="chip-list">
                    <span className="chip">✓ pH</span>
                    <span className="chip">✓ Viscosity</span>
                    <span className="chip">✓ Density</span>
                    <span className="chip">✓ Basic sensory / QC</span>
                  </div>
                </div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>Paid tests (done by outside labs) — tick only what the customer needs:</div>
                <div>
                  {testLines.map((t, i) => (
                    <div className="test-row" key={i}>
                      <input type="checkbox" checked={t.checked} onChange={e => setTestLines(lines => lines.map((x, idx) => idx === i ? { ...x, checked: e.target.checked } : x))} />
                      <span style={{ fontWeight: 600 }}>{t.name}</span>
                      <input type="number" min="0" step="1" title="Qty" value={t.qty} onChange={e => setTestLines(lines => lines.map((x, idx) => idx === i ? { ...x, qty: parseFloat(e.target.value) || 0 } : x))} />
                      <input type="number" min="0" step="100" title="Price (₹)" value={t.price} onChange={e => setTestLines(lines => lines.map((x, idx) => idx === i ? { ...x, price: parseFloat(e.target.value) || 0 } : x))} />
                      <span className="t-amount">
                        {t.checked ? fmtMoney(t.qty * t.price) : '—'}
                        {t.custom && <button className="t-del" onClick={() => removeTestLine(i)}>🗑️</button>}
                      </span>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '10px', flexWrap: 'wrap' }}>
                  <input type="text" placeholder="Custom test name" style={{ flex: 1, minWidth: '160px' }} value={customTestName} onChange={e => setCustomTestName(e.target.value)} />
                  <input type="number" min="0" step="1" style={{ width: '70px' }} title="Qty" value={customTestQty} onChange={e => setCustomTestQty(e.target.value)} />
                  <input type="number" min="0" step="100" placeholder="₹ Price" style={{ width: '110px' }} value={customTestPrice} onChange={e => setCustomTestPrice(e.target.value)} />
                  <button className="btn btn-sm btn-outline" onClick={addCustomTest}>➕ Add Custom Line</button>
                </div>
                <div className="pricing-highlight" style={{ marginTop: '14px', marginBottom: 0 }}>
                  <div><div className="label">Paid Tests Total</div><div className="value">{fmtMoney(displayCalc ? displayCalc.externalTests : 0)}</div></div>
                </div>
              </div>
            </div>

            {/* STEP 7: OTHER COSTS */}
            <div className="card">
              <div className="card-header"><h2><span className="step-no">7</span>Other Costs &amp; Assumptions</h2></div>
              <div className="card-body">
                <div className="form-grid" style={{ marginBottom: '16px' }}>
                  <div className="form-group">
                    <label>One-time use items per trial batch (₹)</label>
                    <input type="number" min="0" step="50" value={consumablesOneTime} onChange={e => setConsumablesOneTime(parseFloat(e.target.value) || 0)} />
                    <div className="help">Things thrown away after each batch: gloves, tissue, disposable pipettes. Default ₹250.</div>
                  </div>
                  <div className="form-group">
                    <label>Reusable items wear per trial batch (₹)</label>
                    <input type="number" min="0" step="10" value={consumablesReusable} onChange={e => setConsumablesReusable(parseFloat(e.target.value) || 0)} />
                    <div className="help">Wash-and-use items wearing out slowly: beakers, rods, jars. Default ₹50.</div>
                  </div>
                  <div className="form-group">
                    <label>Lab space &amp; power per lab-day (₹)</label>
                    <input type="number" min="0" step="50" value={overheadPerDay} onChange={e => setOverheadPerDay(parseFloat(e.target.value) || 0)} />
                    <div className="help">Rent, electricity etc. for one day of lab use. Default ₹400.</div>
                  </div>
                </div>

                <div className="settings-section" style={{ marginTop: '4px' }}>Standard assumptions (industry standard %)</div>
                <div className="info-note">🏭 Small extra % on the material cost that every factory adds — <strong>keep the recommended values if unsure</strong>.</div>
                <div className="form-grid" style={{ marginBottom: '14px' }}>
                  {ASSUMPTION_DEFS.map(d => (
                    <div className="form-group" key={d.key}>
                      <label>{d.label} %</label>
                      <div className="assumption-card">
                        <input type="range" min={d.min} max={d.max} step="0.5" value={assumptions[d.key]} onChange={e => setAssumptions(a => ({ ...a, [d.key]: parseFloat(e.target.value) }))} style={{ margin: 0 }} />
                        <span className="pct-display">{assumptions[d.key]}%</span><span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '6px' }}>→ {d.hint}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="pricing-highlight" style={{ marginBottom: '10px' }}>
                  <div><div className="label">Total Extra % on Materials</div><div className="value">{displayCalc ? displayCalc.assPct : assPct}%</div></div>
                  <div><div className="label">Extra Amount Added</div><div className="value">{fmtMoney(displayCalc ? displayCalc.assumptionsAmount : 0)}</div></div>
                </div>
                <div style={{ marginBottom: '16px' }}>
                  {displayCalc && ((displayCalc.assPct < 15 || displayCalc.assPct > 30) ? (
                    <div className="industry-warning"><span className="icon">⚠️</span><span>Industry range for total indirect % is 15%–30%. Your total is {displayCalc.assPct}% — adjust the sliders if this was not intentional.</span></div>
                  ) : (
                    <div className="band-ok"><span>✅</span><span>Total extra {displayCalc.assPct}% is inside the normal industry range (15%–30%).</span></div>
                  ))}
                </div>

                <div className="settings-section">Safety buffer &amp; margin</div>
                <div className="form-grid" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
                  <div className="form-group">
                    <label>Safety buffer % (for surprises)</label>
                    <div className="assumption-card">
                      <input type="range" min="0" max="25" step="0.5" value={contingency} onChange={e => setContingency(parseFloat(e.target.value))} style={{ margin: 0 }} />
                      <span className="pct-display">{contingency}%</span><span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '6px' }}>→ default 10%, keep it if unsure</span>
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Margin % (our profit)</label>
                    <div className="assumption-card">
                      <input type="range" min="0" max="100" step="1" value={margin} onChange={e => setMargin(parseFloat(e.target.value))} style={{ margin: 0 }} />
                      <span className="pct-display">{margin}%</span><span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '6px' }}>→ default 25%, on cost + buffer</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* SAVED QUOTES */}
            <div className="card">
              <div className="card-header"><h2>💾 Saved Quotes</h2><span className="tag tag-gray">{quotes.length} saved</span></div>
              <div className="card-body">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>Quote #</th><th>Date</th><th>Customer</th><th>Product</th><th>Type</th><th>Fee</th><th>Status</th><th style={{ width: '100px' }}>Actions</th></tr>
                    </thead>
                    <tbody>
                      {quotes.length === 0 ? (
                        <tr><td colSpan={8} className="empty"><div className="icon">💾</div><h4>No saved quotes yet</h4><p>Save a quote to see it here.</p></td></tr>
                      ) : (
                        quotes.slice().reverse().map(q => {
                          const statusClass = q.status === 'Accepted' ? 'tag-success' : q.status === 'Rejected' ? 'tag-danger' : 'tag-info';
                          const typeName = (TIER_DEFS[q.tier] || {}).name || q.tier;
                          return (
                            <tr key={q.id}>
                              <td style={{ fontWeight: 700, color: 'var(--primary)' }}>{q.id}</td>
                              <td>{q.date}</td>
                              <td>{q.customer}</td>
                              <td>{q.product}</td>
                              <td><span className="tag tag-gray">{typeName}</span></td>
                              <td style={{ fontWeight: 700 }}>{fmtMoney(q.fee)}</td>
                              <td><span className={`tag ${statusClass}`}>{q.status}</span></td>
                              <td className="actions">
                                <button className="load-btn" title="Load into calculator" onClick={() => loadQuote(q.id)}>📂</button>
                                <button className="delete-btn" title="Delete" onClick={() => deleteQuote(q.id)}>🗑️</button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

          </div>

          {/* FINAL: QUOTE SUMMARY SIDEBAR */}
          <div className="sidebar-sticky">
            <div className="card">
              <div className="card-header">
                <h2><span className="step-no">★</span>Final: Quote Summary</h2>
                {displayCalc && (displayCalc.fee < GUARD_LOW || displayCalc.fee > GUARD_HIGH) && <span className="tag tag-warning">⚠️ Outside ₹5k–₹20k</span>}
              </div>
              {tier !== 'T3' && liveCalc ? (
                <div className="card-body">
                  <div className="fee-hero">
                    <div className="label">Quote this amount (one-time)</div>
                    <div className="fee-value">{fmtMoney(liveCalc.fee)}</div>
                    <div className="fee-sub">{roundToggle ? 'raw ' + fmtMoney(liveCalc.rawFee) + ' — rounded to nearest ₹100' : 'unrounded (rounding off)'}</div>
                  </div>
                  <div className="checkbox-group" style={{ marginBottom: '14px' }}>
                    <input type="checkbox" id="roundToggle" checked={roundToggle} onChange={e => setRoundToggle(e.target.checked)} />
                    <label htmlFor="roundToggle">Round fee to nearest ₹100 (looks cleaner)</label>
                  </div>
                  <div className="table-wrap" style={{ border: 'none', marginBottom: '14px' }}>
                    <table className="breakdown-table">
                      <tbody>
                        {[
                          ['Lab work (executive hours)', liveCalc.labHours + ' h × ' + fmtMoney(liveCalc.hourlyRate) + '/h', liveCalc.labourCost],
                          ['Trial materials', matMode === 'formula' ? (fmtMoney(liveCalc.batchCost) + '/batch × ' + liveCalc.trialBatches + ' batches') : 'rough estimate (one amount)', liveCalc.materials],
                          ['Samples & courier', liveCalc.includedCorrections + ' rounds × (' + liveCalc.sampleUnits + ' × ' + fmtMoney(liveCalc.packCost) + ' + ' + fmtMoney(liveCalc.courier) + ')', liveCalc.samplesCost],
                          ['One-time use items (gloves, pipettes…)', liveCalc.trialBatches + ' batches × ' + fmtMoney(liveCalc.consumablesOneTime), liveCalc.consumablesOneTimeCost],
                          ['Reusable items wear (beakers, rods…)', liveCalc.trialBatches + ' batches × ' + fmtMoney(liveCalc.consumablesReusable), liveCalc.consumablesReusableCost],
                          ['Lab space & power', liveCalc.labDays + ' lab-days × ' + fmtMoney(overheadPerDay), liveCalc.overhead],
                          ['Standard factory extras', liveCalc.assPct + '% on materials', liveCalc.assumptionsAmount],
                          ['Paid outside lab tests', testLines.filter(t => t.checked).length + ' selected', liveCalc.externalTests]
                        ].map((r, i) => (
                          <tr key={i}><td>{r[0]}<div className="b-basis">{r[1]}</div></td><td className="b-amount">{fmtMoney(r[2])}</td></tr>
                        ))}
                        <tr className="b-subtotal"><td>Subtotal (all costs)</td><td className="b-amount">{fmtMoney(liveCalc.subtotal)}</td></tr>
                        <tr><td>Safety buffer ({liveCalc.contingencyPct * 100}%)<div className="b-basis">on subtotal</div></td><td className="b-amount">{fmtMoney(liveCalc.contingency)}</td></tr>
                        <tr><td>Margin ({liveCalc.marginPct * 100}%)<div className="b-basis">on subtotal + buffer</div></td><td className="b-amount">{fmtMoney((liveCalc.subtotal + liveCalc.contingency) * liveCalc.marginPct)}</td></tr>
                        <tr className="b-total"><td>R&amp;D Fee{roundToggle && <div className="b-basis">rounded to nearest ₹100</div>}</td><td className="b-amount">{fmtMoney(liveCalc.fee)}</td></tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="pricing-highlight" style={{ marginBottom: '14px' }}>
                    <div><div className="label">Price for each EXTRA correction round (after the included ones)</div><div className="value">{fmtMoney(liveCalc.extraRound)} / round</div></div>
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>R&amp;D cost recovered per piece</div>
                  <div className="recovery-grid" style={{ marginBottom: '10px' }}>
                    <div className="recovery-item"><div className="r-label">@ {(firstOrderQty || 0).toLocaleString('en-IN')} pcs</div><div className="r-value">{liveCalc.perUnit !== null ? fmtMoney(liveCalc.perUnit) + '/unit' : '—'}</div></div>
                    <div className="recovery-item"><div className="r-label">@ 500 pcs</div><div className="r-value">{fmtMoney(liveCalc.fee / 500)}/unit</div></div>
                    <div className="recovery-item"><div className="r-label">@ 1000 pcs</div><div className="r-value">{fmtMoney(liveCalc.fee / 1000)}/unit</div></div>
                  </div>
                  <div className="info-note" style={{ marginBottom: '14px' }}>💡 Recover the whole fee within the first order — customers reorder slowly.</div>
                  <div style={{ marginBottom: '16px' }}>
                    <div className="info-note" style={{ marginBottom: '8px' }}>💡 {TIER_DEFS[liveCalc.tier].typical} for "{TIER_DEFS[liveCalc.tier].name}".</div>
                    {(liveCalc.fee < GUARD_LOW || liveCalc.fee > GUARD_HIGH) ? (
                      <div className="industry-warning"><span className="icon">⚠️</span><span>{fmtMoney(liveCalc.fee)} is outside the usual <strong>₹5,000–₹20,000</strong> range — double-check the inputs before quoting.</span></div>
                    ) : (
                      <div className="band-ok"><span>✅</span><span>Inside the usual ₹5,000–₹20,000 quote range.</span></div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button className="btn btn-accent" onClick={saveQuote}>💾 Save Quote</button>
                    <button className="btn btn-primary" onClick={printQuotation}>🖨️ Print Quotation</button>
                    <button className="btn btn-outline" onClick={copySummary}>📋 Copy Summary</button>
                    <button className="btn btn-outline" onClick={resetForm}>🔄 Reset</button>
                  </div>
                </div>
              ) : (
                <div className="card-body">
                  <div className="tier-advisory show" style={{ marginTop: 0 }}><span>💼</span><span><strong>Long research project:</strong> quote a monthly retainer after a scope discussion. This type is not priced by the calculator.</span></div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* SETTINGS MODAL — portaled to <body> so it isn't trapped as position:fixed inside the
          app shell's transformed page-transition wrapper (transform creates a new containing
          block, which would otherwise pin the overlay far off-screen instead of centering it). */}
      {createPortal(
      <div className="rd-price-calculator">
      <div className={`modal-overlay${settingsOpen ? ' show' : ''}`}>
        <div className="modal">
          <div className="modal-header">
            <h2>⚙️ Calculator Settings &amp; Defaults</h2>
            <button className="modal-close" onClick={closeSettingsModal}>&times;</button>
          </div>
          <div className="modal-body">
            {settingsDraft && (
              <>
                <div className="settings-section">Work Types (default hours &amp; included corrections)</div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Type</th><th>Hours for First Version</th><th>Included Corrections</th></tr></thead>
                    <tbody>
                      {['T0', 'T1', 'T2'].map(k => (
                        <tr key={k}>
                          <td style={{ fontWeight: 700 }}>{TIER_DEFS[k].name} <span style={{ color: 'var(--text-muted)', fontWeight: 500, fontSize: '11px' }}>({k})</span></td>
                          <td><input type="number" min="0" step="0.5" style={{ width: '90px' }} value={settingsDraft.tiers[k].baseHours} onChange={e => updateDraftTier(k, 'baseHours', parseFloat(e.target.value) || 0)} /></td>
                          <td><input type="number" min="0" step="1" style={{ width: '80px' }} value={settingsDraft.tiers[k].includedCorrections} onChange={e => updateDraftTier(k, 'includedCorrections', parseFloat(e.target.value) || 0)} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="settings-section">Labour &amp; Effort</div>
                <div className="form-grid">
                  <div className="form-group"><label>Executive Cost per Lab Hour (₹)</label><input type="number" min="0" step="10" value={settingsDraft.hourlyRate} onChange={e => updateDraftField('hourlyRate', parseFloat(e.target.value) || 0)} /><div className="help">Standard ₹50/hour for the lab executive.</div></div>
                  <div className="form-group"><label>Hours per Correction Round</label><input type="number" min="0" step="0.5" value={settingsDraft.hoursPerRound} onChange={e => updateDraftField('hoursPerRound', parseFloat(e.target.value) || 0)} /></div>
                  <div className="form-group"><label>Default Materials Rough Estimate (₹)</label><input type="number" min="0" step="50" value={settingsDraft.materialsLumpDefault} onChange={e => updateDraftField('materialsLumpDefault', parseFloat(e.target.value) || 0)} /></div>
                  <div className="form-group"><label>Default Trial Batch Size (g)</label><input type="number" min="0" step="10" value={settingsDraft.trialBatchSizeDefault} onChange={e => updateDraftField('trialBatchSizeDefault', parseFloat(e.target.value) || 0)} /></div>
                </div>
                <div className="settings-section">Samples, Consumables &amp; Lab Running Cost</div>
                <div className="form-grid">
                  <div className="form-group"><label>Sample Pieces per Round</label><input type="number" min="0" step="1" value={settingsDraft.sampleUnitsPerRound} onChange={e => updateDraftField('sampleUnitsPerRound', parseFloat(e.target.value) || 0)} /></div>
                  <div className="form-group"><label>Pack Cost per Sample (₹)</label><input type="number" min="0" step="10" value={settingsDraft.samplePackCostPerUnit} onChange={e => updateDraftField('samplePackCostPerUnit', parseFloat(e.target.value) || 0)} /></div>
                  <div className="form-group"><label>Courier per Round (₹)</label><input type="number" min="0" step="50" value={settingsDraft.courierPerRound} onChange={e => updateDraftField('courierPerRound', parseFloat(e.target.value) || 0)} /></div>
                  <div className="form-group"><label>One-Time Use Items per Batch (₹)</label><input type="number" min="0" step="50" value={settingsDraft.consumablesOneTimePerBatch} onChange={e => updateDraftField('consumablesOneTimePerBatch', parseFloat(e.target.value) || 0)} /><div className="help">Gloves, tissue, disposable pipettes. Default ₹250.</div></div>
                  <div className="form-group"><label>Reusable Items Wear per Batch (₹)</label><input type="number" min="0" step="10" value={settingsDraft.consumablesReusablePerBatch} onChange={e => updateDraftField('consumablesReusablePerBatch', parseFloat(e.target.value) || 0)} /><div className="help">Beakers, rods, jars. Default ₹50.</div></div>
                  <div className="form-group"><label>Lab Space &amp; Power per Lab-Day (₹)</label><input type="number" min="0" step="50" value={settingsDraft.overheadPerLabDay} onChange={e => updateDraftField('overheadPerLabDay', parseFloat(e.target.value) || 0)} /></div>
                </div>
                <div className="settings-section">Standard Assumptions Defaults (% on materials)</div>
                <div className="form-grid">
                  {ASSUMPTION_DEFS.map(d => (
                    <div className="form-group" key={d.key}><label>{d.label} %</label><input type="number" min="0" step="0.5" value={settingsDraft.assumptions[d.key]} onChange={e => updateDraftAssumption(d.key, parseFloat(e.target.value) || 0)} /></div>
                  ))}
                </div>
                <div className="settings-section">Commercial Defaults (%)</div>
                <div className="form-grid">
                  <div className="form-group"><label>Safety Buffer % (0–25)</label><input type="number" min="0" max="25" step="0.5" value={settingsDraft.contingency} onChange={e => updateDraftField('contingency', parseFloat(e.target.value) || 0)} /></div>
                  <div className="form-group"><label>Margin % (0–100)</label><input type="number" min="0" max="100" step="1" value={settingsDraft.margin} onChange={e => updateDraftField('margin', parseFloat(e.target.value) || 0)} /></div>
                </div>
                <div className="settings-section">External Test Default Prices</div>
                <div className="form-grid">
                  {settingsDraft.tests.map((t, i) => (
                    <div className="form-group" key={i}><label>{t.name} (₹)</label><input type="number" min="0" step="100" value={t.price} onChange={e => updateDraftTestPrice(i, parseFloat(e.target.value) || 0)} /></div>
                  ))}
                </div>
                <div className="info-note" style={{ marginTop: '14px', marginBottom: 0 }}>ℹ️ Settings persist in <strong>rndPricingDB_v1</strong> and are applied as the new calculator defaults on save.</div>
              </>
            )}
          </div>
          <div className="modal-footer">
            <button className="btn btn-outline" onClick={closeSettingsModal}>Cancel</button>
            <button className="btn btn-primary" onClick={saveSettings}>💾 Save Settings</button>
          </div>
        </div>
      </div>
      </div>,
      document.body
      )}

      {/* TOASTS — also portaled to <body> for the same fixed-positioning reason as the modal. */}
      {createPortal(
      <div className="rd-price-calculator">
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type || ''}`}>
            {(t.type === 'success' ? '✅ ' : t.type === 'error' ? '❌ ' : '⚠️ ') + t.msg}
          </div>
        ))}
      </div>
      </div>,
      document.body
      )}

      {/* PRINT QUOTATION (rendered live from displayCalc, only visible via @media print) */}
      <div className="print-quote">
        {displayCalc && (() => {
          const c = displayCalc;
          const inp = collectInputs();
          const selectedTests = testLines.filter(t => t.checked);
          return (
            <>
              <div className="pq-head">
                <div className="pq-company"><h1>BACKERO BioTech</h1><span>BioTech / Cosmetic ERP — Cosmetic R&amp;D &amp; Manufacturing</span></div>
                <div className="pq-meta"><strong>Quotation {quoteNo}</strong><br />Date: {inp.quoteDate || '-'}<br />Valid for: 30 days</div>
              </div>
              <div className="pq-title">R&amp;D / Sampling Fee Quotation</div>
              <div className="pq-section"><h3>Client &amp; Product</h3>
                <table className="pq-table"><tbody>
                  <tr><td>Customer</td><td className="amt">{inp.customer || '—'}</td></tr>
                  <tr><td>Product</td><td className="amt">{inp.product || '—'}{inp.category ? ' (' + inp.category + ')' : ''}</td></tr>
                  <tr><td>Target first order</td><td className="amt">{(c.firstOrderQty || 0).toLocaleString('en-IN')} pcs</td></tr>
                </tbody></table>
              </div>
              <div className="pq-section"><h3>Scope of Work</h3>
                <table className="pq-table"><tbody>
                  <tr><td>Type of work</td><td className="amt">{TIER_DEFS[c.tier].name}</td></tr>
                  <tr><td>Included correction rounds</td><td className="amt">{c.includedCorrections}</td></tr>
                  <tr><td>Estimated lab effort</td><td className="amt">{c.labHours} executive hours ({c.labDays} lab-days)</td></tr>
                  <tr><td>In-house tests</td><td className="amt">pH, viscosity, density, basic sensory/QC — included (no charge)</td></tr>
                </tbody></table>
              </div>
              <div className="pq-section"><h3>Cost Basis (for reference)</h3>
                <table className="pq-table"><tbody>
                  <tr><td>Lab work ({c.labHours} executive hours × {fmtMoney(c.hourlyRate)}/h)</td><td className="amt">{fmtMoney(c.labourCost)}</td></tr>
                  <tr><td>Trial materials{matMode === 'formula' ? ' (' + c.trialBatches + ' trial batches)' : ' (estimate)'}</td><td className="amt">{fmtMoney(c.materials)}</td></tr>
                  <tr><td>Samples &amp; dispatch ({c.includedCorrections} rounds)</td><td className="amt">{fmtMoney(c.samplesCost)}</td></tr>
                  <tr><td>Consumables — one-time use items ({c.trialBatches} batches × {fmtMoney(c.consumablesOneTime)})</td><td className="amt">{fmtMoney(c.consumablesOneTimeCost)}</td></tr>
                  <tr><td>Consumables — reusable/washable items wear ({c.trialBatches} batches × {fmtMoney(c.consumablesReusable)})</td><td className="amt">{fmtMoney(c.consumablesReusableCost)}</td></tr>
                  <tr><td>Lab overhead ({c.labDays} lab-days)</td><td className="amt">{fmtMoney(c.overhead)}</td></tr>
                  <tr><td>Standard assumptions ({c.assPct}% on materials: equipment, consumables, storage, housekeeping, admin, wastage)</td><td className="amt">{fmtMoney(c.assumptionsAmount)}</td></tr>
                  <tr><td><strong>Subtotal</strong> (+ safety buffer {c.contingencyPct * 100}% + margin {c.marginPct * 100}%)</td><td className="amt"><strong>{fmtMoney(c.subtotal)}</strong></td></tr>
                </tbody></table>
              </div>
              <div className="pq-section"><h3>Chargeable External / Specialised Tests</h3>
                <table className="pq-table"><tbody>
                  {selectedTests.length ? (
                    <>
                      {selectedTests.map((t, i) => <tr key={i}><td>{t.name} × {t.qty}</td><td className="amt">{fmtMoney(t.qty * t.price)}</td></tr>)}
                      <tr><td><strong>External tests total</strong></td><td className="amt"><strong>{fmtMoney(c.externalTests)}</strong></td></tr>
                    </>
                  ) : (
                    <tr><td colSpan={2}>None selected — external/specialised tests billed at actuals if required.</td></tr>
                  )}
                </tbody></table>
              </div>
              <div className="pq-fee"><span className="f-label">R&amp;D Fee (one-time)</span><span className="f-val">{fmtMoney(c.fee)}</span></div>
              <table className="pq-table"><tbody>
                <tr><td>Extra correction round (beyond {c.includedCorrections} included)</td><td className="amt">{fmtMoney(c.extraRound)} / round</td></tr>
                <tr><td>R&amp;D recovery over first order</td><td className="amt">{c.perUnit !== null ? fmtMoney(c.perUnit) + ' / unit @ ' + c.firstOrderQty.toLocaleString('en-IN') + ' pcs' : '—'}</td></tr>
                <tr><td>Payment terms</td><td className="amt">{PAYMENT_TERMS}</td></tr>
              </tbody></table>
              <div className="pq-section" style={{ marginTop: '14px' }}><h3>Terms</h3>
                <div className="pq-clause"><strong>Correction round definition:</strong> {CORRECTION_CLAUSE}</div>
                <div className="pq-clause"><strong>Exclusions:</strong> External/specialised tests are billed at actuals unless listed above. Formulation by AI + 1 lab executive — only executive hours are billed.</div>
                <div className="pq-clause"><strong>Validity:</strong> This quotation is valid for 30 days from the date above.</div>
              </div>
              <div className="pq-sign"><div className="sig">For BACKERO BioTech</div><div className="sig">Client Acceptance</div></div>
            </>
          );
        })()}
      </div>
    </div>
  );
}
