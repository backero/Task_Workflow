import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import QRCode from 'react-qr-code';
import toast from 'react-hot-toast';
import api from '../../api/axios';

// ── Constants ──────────────────────────────────────────────────────────────

const HSN_DATASET = [
  { code: '3301', desc: 'Essential oils (Lavender, Rose, Peppermint, etc.)' },
  { code: '3302', desc: 'Odoriferous substances used for perfume / cosmetics' },
  { code: '3304', desc: 'Beauty / make-up preparations & skin care' },
  { code: '3305', desc: 'Hair preparations (shampoo, conditioner, dye)' },
  { code: '3402', desc: 'Organic surface-active agents (surfactants)' },
  { code: '3824', desc: 'Chemical products and preparations' },
  { code: '2936', desc: 'Vitamins and derivatives (unmixed)' },
  { code: '2937', desc: 'Hormones and derivatives' },
  { code: '1520', desc: 'Glycerol, crude; glycerol waters' },
  { code: '1521', desc: 'Vegetable waxes, beeswax, other insect waxes' },
  { code: '2207', desc: 'Ethyl alcohol (undenatured, >=80% alcohol)' },
  { code: '1302', desc: 'Vegetable saps and extracts; pectates, agar-agar' },
  { code: '3204', desc: 'Synthetic organic coloring matter' },
  { code: '3206', desc: 'Other coloring matter, pigments, preparations' },
];

const CATEGORIES = [
  'Fragrance', 'Hydrosol', 'Essential Oil', 'Carrier Oil', 'Active Ingredients',
  'Preservatives', 'Surfactants', 'Emulsifiers', 'Thickeners', 'Humectants',
  'Butters', 'Vitamins', 'Peptides', 'Proteins', 'Wax Esters', 'Silicones',
  'Botanical Extracts', 'Antioxidants', 'Sunscreen Agents', 'Exfoliants',
  'pH Adjusters', 'Chelating Agents', 'Solubilizers', 'Colorants',
  'Film Formers', 'Penetration Enhancers', 'Packaging Materials', 'Lab Equipment',
  'Natural Colorants', 'Flavoring Extracts', 'Food Additives', 'Other',
];

const UNITS = [
  { value: 'kg', label: 'Kilogram (kg)' },
  { value: 'liter', label: 'Liter (L)' },
  { value: 'gram', label: 'Gram (g)' },
  { value: 'ml', label: 'Milliliter (ml)' },
  { value: 'piece', label: 'Piece' },
  { value: 'box', label: 'Box' },
  { value: 'drum', label: 'Drum' },
  { value: 'bag', label: 'Bag' },
  { value: 'meter', label: 'Meter' },
  { value: 'bottle', label: 'Bottle' },
  { value: 'can', label: 'Can' },
  { value: 'jar', label: 'Jar' },
  { value: 'tube', label: 'Tube' },
  { value: 'sachet', label: 'Sachet' },
];

// ── Helpers ────────────────────────────────────────────────────────────────

function getStock(m) {
  if (m.batches?.length) return m.batches.reduce((s, b) => s + (parseFloat(b.quantity) || 0), 0);
  return parseFloat(m.currentStock) || 0;
}

function getStatus(m) {
  const stock = getStock(m);
  const min = parseFloat(m.minStockLevel) || 0;
  if (stock <= 0) return { label: 'Out', color: 'bg-red-500/15 text-red-400' };
  if (m.enableMinStock && stock <= min) return { label: 'Low', color: 'bg-amber-500/15 text-amber-400' };
  if (stock <= min * 2) return { label: 'Medium', color: 'bg-yellow-500/15 text-yellow-400' };
  return { label: 'OK', color: 'bg-emerald-500/15 text-emerald-400' };
}

function isExpiringSoon(m) {
  const today = new Date();
  const in30 = new Date(); in30.setDate(today.getDate() + 30);
  return (m.batches || []).some(b => {
    if (!b.expiryDate) return false;
    const e = new Date(b.expiryDate);
    return e >= today && e <= in30;
  });
}

function formatDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function batchExpClass(expiryDate) {
  if (!expiryDate) return { text: 'No expiry', cls: 'text-gray-400' };
  const days = Math.ceil((new Date(expiryDate) - new Date()) / 86400000);
  if (days < 0) return { text: `Expired (${Math.abs(days)}d ago)`, cls: 'text-red-400 font-semibold' };
  if (days <= 30) return { text: `Expiring in ${days}d`, cls: 'text-amber-400 font-semibold' };
  return { text: `Exp: ${formatDate(expiryDate)}`, cls: 'text-gray-400' };
}

// ── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({ label, value, icon, color, onClick }) {
  return (
    <div
      className={`card p-5 flex justify-between items-start ${onClick ? 'cursor-pointer hover:-translate-y-0.5 transition-transform' : ''}`}
      onClick={onClick}
    >
      <div>
        <p className="text-xs text-gray-400 font-medium mb-1">{label}</p>
        <p className="text-2xl font-bold text-gray-100">{value}</p>
      </div>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${color}`}>{icon}</div>
    </div>
  );
}

// ── Add/Edit Material Modal ─────────────────────────────────────────────────

const TABS = [
  { id: 'basic', label: 'Basic Info', icon: '📋' },
  { id: 'stock', label: 'Stock', icon: '📦' },
  { id: 'qc', label: 'Quality Control', icon: '🛡️' },
];

function MaterialModal({ onClose, onSuccess, initial }) {
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm({
    defaultValues: {
      name: initial?.name || '',
      hsnCode: initial?.hsnCode || '',
      category: initial?.category || '',
      supplier: initial?.supplier || '',
      warehouseLocation: initial?.warehouseLocation || '',
      unit: initial?.unit || '',
      costPrice: initial?.costPrice || '',
      gstRate: initial?.gstRate ?? 12,
      initialStock: '',
      initialExpiry: '',
      initialBatchNumber: '',
      enableMinStock: initial?.enableMinStock !== false,
      minStockLevel: initial?.minStockLevel || 0,
      qcChecker: initial?.qcChecker || '',
      qcNumber: initial?.qcNumber || '',
      refCheckNumber: initial?.refCheckNumber || '',
      qcPassed: initial?.qcPassed || false,
      qcNotes: initial?.qcNotes || '',
    },
  });

  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('basic');
  const [hsnSuggestions, setHsnSuggestions] = useState([]);
  const [catSuggestions, setCatSuggestions] = useState([]);
  const enableMinStock = watch('enableMinStock');

  function onHsnInput(e) {
    const v = e.target.value.toLowerCase();
    setHsnSuggestions(v ? HSN_DATASET.filter(h => h.desc.toLowerCase().includes(v) || h.code.includes(v)).slice(0, 5) : []);
  }

  function onCatInput(e) {
    const v = e.target.value.toLowerCase();
    setCatSuggestions(v ? CATEGORIES.filter(c => c.toLowerCase().includes(v)).slice(0, 5) : []);
  }

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      if (initial?._id) {
        await api.put(`/inventory/products/${initial._id}`, data);
        toast.success('Material updated');
      } else {
        await api.post('/inventory/products', { ...data, isRawMaterial: true, isFinishedGood: false });
        toast.success('Material added');
      }
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save');
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/70 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-2xl card shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 className="font-bold text-gray-100 text-base">
            {initial ? `Edit — ${initial.name}` : 'Add New Raw Material'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-200 text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-700 transition-colors">&times;</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700 px-6">
          {TABS.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-colors -mb-px ${
                activeTab === t.id
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="p-6">
            {/* Tab: Basic Info */}
            {activeTab === 'basic' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="label">Material Name <span className="text-red-400">*</span></label>
                    <input {...register('name', { required: true })} className="input" placeholder="e.g., Lavender Essential Oil" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="relative">
                    <label className="label">Category <span className="text-red-400">*</span></label>
                    <input {...register('category', { required: true })} className="input" placeholder="e.g., Essential Oil" onInput={onCatInput} autoComplete="off" />
                    {catSuggestions.length > 0 && (
                      <div className="absolute top-full left-0 right-0 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-20 max-h-40 overflow-y-auto">
                        {catSuggestions.map(c => (
                          <div key={c} className="px-3 py-2 hover:bg-gray-700 cursor-pointer text-xs text-gray-200" onClick={() => { setValue('category', c); setCatSuggestions([]); }}>{c}</div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="relative">
                    <label className="label">HSN Code</label>
                    <input {...register('hsnCode')} className="input" placeholder="e.g., 3301" onInput={onHsnInput} autoComplete="off" />
                    {hsnSuggestions.length > 0 && (
                      <div className="absolute top-full left-0 right-0 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-20 max-h-40 overflow-y-auto">
                        {hsnSuggestions.map(h => (
                          <div key={h.code} className="px-3 py-2 hover:bg-gray-700 cursor-pointer text-xs" onClick={() => { setValue('hsnCode', h.code); setHsnSuggestions([]); }}>
                            <span className="font-bold text-indigo-400">{h.code}</span> — <span className="text-gray-400">{h.desc}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Supplier</label>
                    <input {...register('supplier')} className="input" placeholder="e.g., ABC Chemicals Pvt Ltd" />
                  </div>
                  <div>
                    <label className="label">Storage Location <span className="text-red-400">*</span></label>
                    <input {...register('warehouseLocation', { required: true })} className="input" placeholder="e.g., Warehouse A, Rack 12" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="label">Unit <span className="text-red-400">*</span></label>
                    <select {...register('unit', { required: true })} className="input">
                      <option value="">Select unit</option>
                      {UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Unit Price (₹) <span className="text-red-400">*</span></label>
                    <input {...register('costPrice', { required: true, min: 0 })} type="number" step="0.01" className="input" placeholder="0.00" />
                  </div>
                  <div>
                    <label className="label">GST Rate (%)</label>
                    <select {...register('gstRate')} className="input">
                      {[0, 5, 12, 18, 28].map(r => <option key={r} value={r}>{r}%</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Tab: Stock */}
            {activeTab === 'stock' && (
              <div className="space-y-4">
                {!initial && (
                  <div className="p-4 rounded-xl bg-gray-700/30 border border-gray-600/50">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Opening Stock</p>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="label">Initial Stock</label>
                        <input {...register('initialStock')} type="number" step="0.01" min="0" className="input" placeholder="0" />
                      </div>
                      <div>
                        <label className="label">Batch / Lot #</label>
                        <input {...register('initialBatchNumber')} className="input" placeholder="LOT-2026-001" />
                      </div>
                      <div>
                        <label className="label">Expiry Date</label>
                        <input {...register('initialExpiry')} type="date" className="input" />
                      </div>
                    </div>
                  </div>
                )}
                <div className="p-4 rounded-xl bg-gray-700/30 border border-gray-600/50">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Stock Alert</p>
                  <div className="flex items-center gap-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input {...register('enableMinStock')} type="checkbox" className="w-4 h-4 accent-indigo-500" />
                      <span className="text-sm text-gray-300 font-medium">Enable Minimum Stock Alert</span>
                    </label>
                    <div className={`transition-opacity ${enableMinStock ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                      <input {...register('minStockLevel')} type="number" step="0.01" min="0" className="input w-36" placeholder="Min stock level" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab: Quality Control */}
            {activeTab === 'qc' && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="label">QC Checked By</label>
                    <input {...register('qcChecker')} className="input" placeholder="Inspector name" />
                  </div>
                  <div>
                    <label className="label">QC Number</label>
                    <input {...register('qcNumber')} className="input" placeholder="QC-2026-001" />
                  </div>
                  <div>
                    <label className="label">Reference Check #</label>
                    <input {...register('refCheckNumber')} className="input" placeholder="REF-2026-001" />
                  </div>
                </div>
                <div className="flex items-center gap-2 p-3 rounded-lg bg-gray-700/30">
                  <input {...register('qcPassed')} type="checkbox" id="qcPassed" className="w-4 h-4 accent-emerald-500" />
                  <label htmlFor="qcPassed" className="text-sm text-gray-300 cursor-pointer">QC Passed / Approved</label>
                </div>
                <div>
                  <label className="label">QC Notes</label>
                  <textarea {...register('qcNotes')} className="input resize-none" rows={4} placeholder="Quality observations, test results..." />
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-700">
            <div className="flex gap-1">
              {TABS.map((t, i) => (
                <button key={t.id} type="button" onClick={() => setActiveTab(t.id)}
                  className={`w-2 h-2 rounded-full transition-colors ${activeTab === t.id ? 'bg-indigo-500' : 'bg-gray-600 hover:bg-gray-500'}`} />
              ))}
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
              {activeTab !== 'qc' ? (
                <button type="button" onClick={() => setActiveTab(TABS[TABS.findIndex(t => t.id === activeTab) + 1].id)} className="btn btn-primary">
                  Next →
                </button>
              ) : (
                <button type="submit" disabled={loading} className="btn btn-primary">
                  {loading ? 'Saving...' : (initial ? 'Update Material' : 'Add Material')}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

// ── Add Batch Modal ─────────────────────────────────────────────────────────

function BatchModal({ material, onClose, onSuccess }) {
  const { register, handleSubmit, reset } = useForm();
  const [loading, setLoading] = useState(false);

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      await api.post('/inventory/stock-in', {
        productId: material._id,
        quantity: parseFloat(data.quantity),
        unitPrice: data.price ? parseFloat(data.price) : material.costPrice,
        batch: data.batchNumber || undefined,
        notes: data.notes || undefined,
      });
      toast.success('Batch added');
      reset();
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  const totalStock = getStock(material);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/70 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-2xl card shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <div>
            <h2 className="font-bold text-gray-100">Add Batch — {material.name}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{material.sku} · Current Stock: <span className="text-emerald-400 font-semibold">{totalStock} {material.unit}</span></p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-200 text-2xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-700 transition-colors">&times;</button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Quantity <span className="text-red-400">*</span></label>
              <input {...register('quantity', { required: true, min: 0.01 })} type="number" step="0.01" className="input" placeholder="0" />
            </div>
            <div>
              <label className="label">Unit Price (₹) <span className="text-xs text-gray-500">— may differ</span></label>
              <input {...register('price')} type="number" step="0.01" className="input" placeholder={`Current: ₹${material.costPrice}`} />
            </div>
            <div>
              <label className="label">Batch / Lot #</label>
              <input {...register('batchNumber')} className="input" placeholder="LOT-2026-002" />
            </div>
            <div>
              <label className="label">Expiry Date</label>
              <input {...register('expiryDate')} type="date" className="input" />
            </div>
            <div>
              <label className="label">Received Date</label>
              <input {...register('receivedDate')} type="date" className="input" />
            </div>
            <div>
              <label className="label">Notes</label>
              <input {...register('notes')} className="input" placeholder="Supplier, Invoice ref..." />
            </div>
          </div>

          {/* Existing batches */}
          {material.batches?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Existing Batches</p>
              <div className="space-y-1 max-h-36 overflow-y-auto">
                {material.batches.map((b, i) => {
                  const { text, cls } = batchExpClass(b.expiryDate);
                  return (
                    <div key={i} className="flex items-center gap-3 px-3 py-2 bg-gray-700/40 rounded-lg text-xs">
                      <span className="text-indigo-400 font-semibold w-28 truncate">{b.batchNumber || '-'}</span>
                      <span className="font-bold w-20">{b.quantity} {material.unit}</span>
                      <span className="text-emerald-400 w-20">₹{b.price || material.costPrice}</span>
                      <span className="text-gray-400 w-24">{formatDate(b.receivedDate)}</span>
                      <span className={`${cls} flex-1`}>{text}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-700">
            <button type="button" onClick={onClose} className="btn btn-ghost">Cancel</button>
            <button type="submit" disabled={loading} className="btn btn-primary">
              {loading ? 'Adding...' : 'Add Batch'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

// ── QR Modal ────────────────────────────────────────────────────────────────

function QRModal({ material, onClose }) {
  const qrData = JSON.stringify({
    code: material.sku,
    name: material.name,
    hsn: material.hsnCode || '',
    unit: material.unit,
    price: material.costPrice,
    gst: material.gstRate,
    location: material.warehouseLocation || '',
    supplier: material.supplier || '',
  });

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/70 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-sm card shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 className="font-bold text-gray-100">QR Label</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-200 text-2xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-700">&times;</button>
        </div>
        <div className="p-6 flex flex-col items-center gap-4">
          <div className="bg-white p-4 rounded-xl">
            <QRCode value={qrData} size={200} />
          </div>
          <div className="text-center">
            <p className="font-bold text-gray-100 text-base">{material.name}</p>
            <p className="text-xs text-gray-400 mt-1 space-y-0.5">
              <span className="block">Code: {material.sku}</span>
              <span className="block">HSN: {material.hsnCode || '-'} · Unit: {material.unit}</span>
              <span className="block">Price: ₹{material.costPrice} · GST: {material.gstRate}%</span>
              {material.warehouseLocation && <span className="block">Location: {material.warehouseLocation}</span>}
            </p>
          </div>
          <button className="btn btn-primary w-full" onClick={() => window.print()}>🖨️ Print Label</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Low Stock Modal ──────────────────────────────────────────────────────────

function LowStockModal({ materials, onClose }) {
  const outOfStock = materials.filter(m => getStock(m) <= 0);
  const lowStock = materials.filter(m => m.enableMinStock && getStock(m) > 0 && getStock(m) <= (m.minStockLevel || 0));

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/70 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-xl card shadow-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 flex-shrink-0">
          <h2 className="font-bold text-gray-100">⚠️ Low Stock Alerts</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-200 text-2xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-700">&times;</button>
        </div>
        <div className="p-6 overflow-y-auto">
          {outOfStock.length === 0 && lowStock.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-3">✅</div>
              <p className="text-gray-300 font-semibold">All stock levels are healthy</p>
            </div>
          ) : (
            <>
              {outOfStock.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-bold text-red-400 uppercase tracking-wider mb-2">🚫 Out of Stock ({outOfStock.length})</p>
                  {outOfStock.map(m => (
                    <div key={m._id} className="flex items-center gap-3 py-2 border-b border-gray-700/50 text-sm">
                      <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                      <span className="font-semibold text-gray-200">{m.name}</span>
                      <span className="text-gray-400 text-xs">({m.sku})</span>
                      <span className="ml-auto text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full font-bold">OUT</span>
                    </div>
                  ))}
                </div>
              )}
              {lowStock.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-2">⚠️ Low Stock ({lowStock.length})</p>
                  {lowStock.map(m => (
                    <div key={m._id} className="flex items-center gap-3 py-2 border-b border-gray-700/50 text-sm">
                      <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
                      <span className="font-semibold text-gray-200">{m.name}</span>
                      <span className="text-gray-400 text-xs">{getStock(m)} / min {m.minStockLevel} {m.unit}</span>
                      <span className="ml-auto text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full font-bold">LOW</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-700 flex-shrink-0">
          <button onClick={onClose} className="btn btn-ghost w-full">Close</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Expandable Detail Row ────────────────────────────────────────────────────

function DetailRow({ material }) {
  const stock = getStock(material);
  const value = stock * (material.costPrice || 0);

  return (
    <tr>
      <td colSpan={10} className="p-0 border-b border-gray-700/50">
        <div className="grid grid-cols-3 gap-5 p-5 bg-gray-800/50">
          {/* Basic Info */}
          <div>
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">📋 Basic Info</p>
            {[
              ['Supplier', material.supplier || '-'],
              ['Location', material.warehouseLocation || '-'],
              ['Min Stock', material.enableMinStock ? `${material.minStockLevel || 0} ${material.unit}` : 'Disabled'],
              ['Inventory Value', `₹${value.toLocaleString('en-IN')}`],
              ['Created', formatDate(material.createdAt)],
            ].map(([l, v]) => (
              <div key={l} className="flex justify-between py-1.5 border-b border-gray-700/30 text-xs">
                <span className="text-gray-400">{l}</span>
                <span className="font-medium text-gray-200">{v}</span>
              </div>
            ))}
          </div>

          {/* Batches */}
          <div>
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">🧪 Batches</p>
            {material.batches?.length > 0 ? material.batches.map((b, i) => {
              const { text, cls } = batchExpClass(b.expiryDate);
              return (
                <div key={i} className="grid grid-cols-3 gap-2 px-2 py-1.5 mb-1 bg-gray-700/30 rounded-lg text-xs">
                  <span className="text-indigo-400 font-semibold truncate">{b.batchNumber || '-'}</span>
                  <span className="font-bold">{b.quantity} {material.unit}</span>
                  <span className={cls}>{text}</span>
                </div>
              );
            }) : <p className="text-xs text-gray-500 py-2">No batches recorded</p>}
          </div>

          {/* QC */}
          <div>
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">🛡️ Quality Control</p>
            {[
              ['QC Checked By', material.qcChecker || '-'],
              ['QC Number', material.qcNumber || '-'],
              ['Ref Check #', material.refCheckNumber || '-'],
              ['QC Result', material.qcPassed
                ? <span className="text-emerald-400 font-bold">✓ PASS</span>
                : <span className="text-red-400 font-bold">✗ FAIL</span>
              ],
            ].map(([l, v]) => (
              <div key={l} className="flex justify-between py-1.5 border-b border-gray-700/30 text-xs">
                <span className="text-gray-400">{l}</span>
                <span className="font-medium text-gray-200">{v}</span>
              </div>
            ))}
            {material.qcNotes && (
              <p className="mt-2 text-xs text-gray-400 bg-gray-700/30 rounded-lg p-2 leading-relaxed">{material.qcNotes}</p>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function RawMaterials() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState(1);
  const [expandedId, setExpandedId] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [batchTarget, setBatchTarget] = useState(null);
  const [qrTarget, setQrTarget] = useState(null);
  const [showLowStock, setShowLowStock] = useState(false);

  const { data: mData, isLoading } = useQuery({
    queryKey: ['raw-materials', search],
    queryFn: () => api.get('/inventory/products', { params: { isRawMaterial: true, search, limit: 500 } })
      .then(r => r.data.data.products || r.data.data || []),
    staleTime: 30000,
  });

  const materials = mData || [];

  const stats = useMemo(() => {
    if (!materials.length) return null;
    const totalValue = materials.reduce((s, m) => s + getStock(m) * (m.costPrice || 0), 0);
    const lowStockCount = materials.filter(m => m.minStockLevel > 0 && getStock(m) <= m.minStockLevel).length;
    const expiringCount = materials.filter(isExpiringSoon).length;
    return { total: materials.length, totalValue, lowStockCount, expiringCount };
  }, [materials]);

  const sorted = useMemo(() => {
    return [...materials].sort((a, b) => {
      let va, vb;
      if (sortKey === 'stock') { va = getStock(a); vb = getStock(b); }
      else if (sortKey === 'status') { va = getStatus(a).label; vb = getStatus(b).label; }
      else { va = (a[sortKey] || ''); vb = (b[sortKey] || ''); }
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      return va < vb ? -sortDir : va > vb ? sortDir : 0;
    });
  }, [materials, sortKey, sortDir]);

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => d * -1);
    else { setSortKey(key); setSortDir(1); }
  }

  function SortIcon({ col }) {
    if (sortKey !== col) return <span className="text-gray-600 ml-1">⇅</span>;
    return <span className="text-indigo-400 ml-1">{sortDir === 1 ? '▲' : '▼'}</span>;
  }

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['raw-materials'] });
    queryClient.invalidateQueries({ queryKey: ['raw-material-stats'] });
  }

  async function handleDelete(m) {
    if (!confirm(`Delete "${m.name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/inventory/products/${m._id}`);
      toast.success('Deleted');
      refresh();
    } catch {
      toast.error('Delete failed');
    }
  }

  function exportCSV() {
    if (!materials.length) { toast.error('No materials to export'); return; }
    const headers = ['Code', 'Name', 'Category', 'HSN Code', 'Supplier', 'Location', 'Unit', 'Unit Price', 'GST Rate', 'Total Stock', 'Min Stock', 'QC Passed', 'QC Notes'];
    const rows = materials.map(m => [
      m.sku, m.name, m.category, m.hsnCode || '', m.supplier || '',
      m.warehouseLocation || '', m.unit, m.costPrice, m.gstRate,
      getStock(m), m.minStockLevel || 0,
      m.qcPassed ? 'Yes' : 'No', (m.qcNotes || '').replace(/"/g, '""'),
    ].map(v => `"${v}"`).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `raw-materials-${new Date().toISOString().split('T')[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast.success(`Exported ${materials.length} materials`);
  }

  return (
    <div className="p-6 space-y-5 max-w-screen-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-100">Raw Material Inventory</h1>
          <p className="text-sm text-gray-400 mt-0.5">ISO 9001:2015 — Batch & QC Tracking</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCSV} className="btn btn-ghost text-sm">📥 Export CSV</button>
          <button onClick={() => setShowAddModal(true)} className="btn btn-primary text-sm">+ Add Material</button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total Materials" value={stats?.total ?? '—'} icon="📦" color="bg-indigo-500/20" />
        <StatCard label="Inventory Value" value={stats ? `₹${(stats.totalValue || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—'} icon="₹" color="bg-emerald-500/20" />
        <StatCard label="Low Stock Alerts" value={stats?.lowStockCount ?? '—'} icon="⚠️" color="bg-red-500/20" onClick={() => setShowLowStock(true)} />
        <StatCard label="Expiring Soon" value={stats?.expiringCount ?? '—'} icon="📅" color="bg-amber-500/20" />
      </div>

      {/* Table Card */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <h2 className="font-semibold text-gray-100 text-sm">Materials Master</h2>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input pl-8 w-64 text-sm"
              placeholder="Search name, SKU, supplier, HSN..."
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-800/50">
              <tr>
                {[['sku', 'Code'], ['name', 'Name'], ['category', 'Category'], ['hsnCode', 'HSN'], ['unit', 'Unit'], ['costPrice', 'Price'], ['gstRate', 'GST'], ['stock', 'Stock'], ['status', 'Status']].map(([key, label]) => (
                  <th key={key} onClick={() => handleSort(key)} className="px-4 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-200 transition-colors whitespace-nowrap">
                    {label}<SortIcon col={key} />
                  </th>
                ))}
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider w-32">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">
              {isLoading ? (
                <tr><td colSpan={10} className="text-center py-12 text-gray-400">Loading...</td></tr>
              ) : sorted.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-12">
                  <div className="text-3xl mb-2 opacity-40">📦</div>
                  <p className="text-gray-400 font-medium">No materials found</p>
                  <p className="text-gray-500 text-xs mt-1">Add your first raw material to get started</p>
                </td></tr>
              ) : sorted.map(m => {
                const stock = getStock(m);
                const status = getStatus(m);
                const isExpanded = expandedId === m._id;
                const lowStock = m.enableMinStock && stock <= (m.minStockLevel || 0);

                return (
                  <React.Fragment key={m._id}>
                    <tr className="hover:bg-gray-700/20 transition-colors group">
                      <td className="px-4 py-3">
                        <button onClick={() => setExpandedId(isExpanded ? null : m._id)} className="font-bold text-indigo-400 hover:underline">{m.sku}</button>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => setExpandedId(isExpanded ? null : m._id)} className="font-semibold text-gray-200 hover:text-indigo-400 transition-colors text-left">{m.name}</button>
                      </td>
                      <td className="px-4 py-3"><span className="text-xs px-2 py-1 bg-gray-700/60 text-gray-300 rounded-full">{m.category}</span></td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{m.hsnCode || '-'}</td>
                      <td className="px-4 py-3 text-gray-300">{m.unit}</td>
                      <td className="px-4 py-3 text-gray-300">₹{(m.costPrice || 0).toLocaleString('en-IN')}</td>
                      <td className="px-4 py-3 text-gray-400">{m.gstRate}%</td>
                      <td className={`px-4 py-3 font-bold ${lowStock ? 'text-red-400' : 'text-emerald-400'}`}>{stock.toLocaleString('en-IN')}</td>
                      <td className="px-4 py-3"><span className={`text-xs px-2 py-1 rounded-full font-semibold ${status.color}`}>{status.label}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button title="Add Batch" onClick={() => setBatchTarget(m)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-600 text-amber-400 transition-colors">🧪</button>
                          <button title="QR Label" onClick={() => setQrTarget(m)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-600 text-blue-400 transition-colors">🔲</button>
                          <button title="Edit" onClick={() => setEditTarget(m)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-600 text-gray-400 transition-colors">✏️</button>
                          <button title="Delete" onClick={() => handleDelete(m)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-600 text-red-400 transition-colors">🗑️</button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && <DetailRow material={m} />}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {showAddModal && <MaterialModal onClose={() => setShowAddModal(false)} onSuccess={() => { setShowAddModal(false); refresh(); }} />}
      {editTarget && <MaterialModal initial={editTarget} onClose={() => setEditTarget(null)} onSuccess={() => { setEditTarget(null); refresh(); }} />}
      {batchTarget && <BatchModal material={batchTarget} onClose={() => setBatchTarget(null)} onSuccess={() => { setBatchTarget(null); refresh(); }} />}
      {qrTarget && <QRModal material={qrTarget} onClose={() => setQrTarget(null)} />}
      {showLowStock && <LowStockModal materials={materials} onClose={() => setShowLowStock(false)} />}
    </div>
  );
}
