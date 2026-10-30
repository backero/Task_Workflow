import React, { useState, useEffect } from 'react';
import { Factory, Star } from 'lucide-react';
import RndOverheadsTab from './RndOverheadsTab';
import SavedQuotes from '../SavedQuotes';

function numF(v, d = 2) { return Number(v || 0).toFixed(d); }

function HighlightStrip({ items, tone = 'light' }) {
  const isDark = tone === 'dark';
  return (
    <div style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0,1fr))` }} className={`grid gap-4 rounded-xl p-4 ${isDark ? 'bg-slate-900 text-white' : 'border border-gray-200 dark:border-[#1b2e4a]'}`}>
      {items.map((it, i) => (
        <div key={i}>
          <p className={`text-[11px] mb-1 ${isDark ? 'text-white/70' : 'text-gray-400'}`}>{it.label}</p>
          <p className={`font-bold ${it.big ? 'text-xl' : 'text-base'} ${isDark ? (it.accent ? 'text-amber-300' : 'text-white') : 'text-gray-800 dark:text-gray-100'}`}>{it.value}</p>
        </div>
      ))}
    </div>
  );
}

export default function ProductOverheadsTab({ product, form, setForm, onSaveProductionOverheads, onSavePackaging, isPending }) {
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [batchUnit, setBatchUnit] = useState('g');
  const [roundToNearest100, setRoundToNearest100] = useState(false);
  const [showFinalGST, setShowFinalGST] = useState(false);
  const [activeMarginType, setActiveMarginType] = useState('b2c');
  const [marginPercent, setMarginPercent] = useState(form.costing?.margins?.b2c || 0);
  const [saveStatus, setSaveStatus] = useState(null);
  const [customQty, setCustomQty] = useState('');
  const [customUnit, setCustomUnit] = useState('g');
  const [customResult, setCustomResult] = useState(null);

  useEffect(() => {
    if (!product?.id) return;

    const savedData = localStorage.getItem(`product_overheads_${product.id}`);

    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);

        setForm(prev => {
          const merged = { ...prev };

          if (parsed.productionOverhead) merged.productionOverhead = parsed.productionOverhead;
          if (parsed.standardAssumptions) merged.standardAssumptions = parsed.standardAssumptions;
          if (parsed.rnd) merged.rnd = parsed.rnd;
          if (parsed.containers) merged.containers = parsed.containers;
          if (parsed.packaging) merged.packaging = parsed.packaging;
          if (parsed.costing) merged.costing = parsed.costing;

          return merged;
        });

        if (parsed.selectedBatch) setSelectedBatch(parsed.selectedBatch);
        if (parsed.batchUnit) setBatchUnit(parsed.batchUnit);
      } catch (e) {
        console.error('Failed to load saved data:', e);
      }
    }
  }, [product?.id]);

  useEffect(() => {
    if (!product?.id) return;

    try {
      const autoSaveData = {
        productionOverhead: form.productionOverhead,
        standardAssumptions: form.standardAssumptions,
        rnd: form.rnd,
        containers: form.containers,
        packaging: form.packaging,
        costing: form.costing,
        selectedBatch: selectedBatch,
        batchUnit: batchUnit
      };

      const jsonString = JSON.stringify(autoSaveData);
      localStorage.setItem(`product_overheads_${product.id}`, jsonString);
      console.log(`Auto-saved data for product ${product.id}. Size: ${jsonString.length} bytes`);
    } catch (error) {
      console.error('Auto-save failed:', error);
      if (error.name === 'QuotaExceededError') {
        alert('Storage full! Unable to save data.');
      }
    }
  }, [form, selectedBatch, batchUnit, product?.id]);

  const saveAllData = async () => {
    try {
      setSaveStatus('saving');

      const dataToSave = {
        productionOverhead: form.productionOverhead,
        standardAssumptions: form.standardAssumptions,
        rnd: form.rnd,
        containers: form.containers,
        packaging: form.packaging,
        costing: form.costing,
        selectedBatch: selectedBatch,
        batchUnit: batchUnit
      };

      console.log('Saving data to localStorage:', dataToSave);
      localStorage.setItem(`product_overheads_${product?.id}`, JSON.stringify(dataToSave));
      console.log('Data saved successfully for product:', product?.id);

      if (onSaveProductionOverheads) {
        await onSaveProductionOverheads();
      }

      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (error) {
      console.error('Save failed:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus(null), 3000);
    }
  };

  const convertToBaseUnit = (qty, unit) => {
    const conversions = {
      'g': 1,
      'kg': 1000,
      'ml': 1,
      'L': 1000,
      'pcs': 1
    };
    return qty * (conversions[unit] || 1);
  };

  // Auto-sync: Use first container's Pcs Needed for ALL packaging items
  React.useEffect(() => {
    if (!selectedBatch || !form.containers?.length) return;

    const containers = form.containers;
    const firstContainer = containers[0];
    if (!firstContainer) return;

    const batchQtyBase = convertToBaseUnit(selectedBatch, batchUnit);
    const containerWtBase = convertToBaseUnit(Number(firstContainer.weight) || 0, firstContainer.unit || 'g');
    const mainPcsNeeded = containerWtBase > 0 ? Math.round(batchQtyBase / containerWtBase) : 0;

    const pkgItems = form.packaging?.items || [];
    if (pkgItems.length === 0 || mainPcsNeeded === 0) return;

    // Apply first container's Pcs Needed to ALL packaging items
    const updated = pkgItems.map(item => ({
      ...item,
      qty: mainPcsNeeded,
      amount: mainPcsNeeded * (item.rate || 0)
    }));

    setForm(prev => ({
      ...prev,
      packaging: { ...prev.packaging, items: updated }
    }));
  }, [selectedBatch, batchUnit, form.containers?.[0]?.weight, form.containers?.[0]?.unit]);

  const calculateBatchCost = (batchQty, unit) => {
    const b = { ...product, ...form };
    const fm = b.formulation || {};
    const po = b.productionOverhead || {};
    const sa = b.standardAssumptions || {};
    const rnd = b.rnd || {};
    const refW = Number(fm.refWeight) || 100;
    const refUnit = fm.refUnit || 'g';

    const batchQtyInBaseUnit = convertToBaseUnit(batchQty, unit);
    const refWInBaseUnit = convertToBaseUnit(refW, refUnit);

    const formCost = (fm.rows || []).reduce((s, r) => {
      const qty = refWInBaseUnit * (Number(r.percentage) || 0) / 100 * (Number(r.convFactor) || 1);
      const cost = (Number(r.costPerKg) || 0) * qty;
      return s + cost;
    }, 0);

    const overheadTotal = Number(po.electricity || 0) + Number(po.labor || 0) + Number(po.labTesting || 0) + Number(po.other || 0);
    const units = refWInBaseUnit > 0 ? batchQtyInBaseUnit / refWInBaseUnit : 0;
    const overheadPerUnit = units > 0 ? overheadTotal / units : 0;

    const saPct = [sa.equipmentPct, sa.consumablesPct, sa.storagePct, sa.housekeepingPct, sa.adminPct, sa.wastagePct].reduce((s, v) => s + (Number(v) || 0), 0);

    const lifecycle = rnd.lifecycle || 1000;
    const rndTotal = (Number(rnd.testing) || 0) + (Number(rnd.consumables) || 0) + (Number(rnd.samples) || 0) + (Number(rnd.overhead) || 0) + (Number(rnd.otherOverhead) || 0) + (Number(rnd.qc) || 0);
    const rndPerUnit = lifecycle > 0 ? rndTotal / lifecycle : 0;

    const totalFormCostForBatch = formCost * units;
    const totalOverheadCost = overheadTotal;
    const saAmount = (totalFormCostForBatch + totalOverheadCost) * (saPct / 100);

    return {
      totalFormCost: totalFormCostForBatch,
      totalOverheadCost: totalOverheadCost,
      saAmount: saAmount,
      totalAll: totalFormCostForBatch,
      units,
      batchQtyInBaseUnit,
      unit
    };
  };

  const computeFinalTotal = () => {
    if (!selectedBatch) return 0;

    const batchCost = calculateBatchCost(selectedBatch, batchUnit);
    const totalFormCost = batchCost.totalFormCost || 0;
    const totalOverheadCost = batchCost.totalOverheadCost || 0;
    const saAmount = batchCost.saAmount || 0;

    const containersTotal = (form.containers || []).reduce((s, item) => {
      const batchQtyBase = convertToBaseUnit(selectedBatch, batchUnit);
      const containerWtBase = convertToBaseUnit(Number(item.weight) || 0, item.unit || 'g');
      const pcsNeeded = containerWtBase > 0 ? Math.round(batchQtyBase / containerWtBase) : 0;
      const costPerPiece = Number(item.costPerPiece) || 0;
      const baseAmount = pcsNeeded * costPerPiece;
      const amount = item.gstIncluded ? baseAmount * 1.18 : baseAmount;
      return s + amount;
    }, 0);

    const pkgItems = form.packaging?.items || [];
    const pkgCharges = form.packaging?.charges || {};
    const packagingTotal = pkgItems.reduce((s, i) => {
      const baseAmount = Number(i.qty) * Number(i.rate) || 0;
      const amount = i.gstIncluded ? baseAmount * 1.18 : baseAmount;
      return s + amount;
    }, 0);
    const otherCharges = Number(pkgCharges.other || 0);

    const subtotalBeforeMargin = totalFormCost + totalOverheadCost + saAmount + containersTotal + packagingTotal + otherCharges;
    const marginAmount = subtotalBeforeMargin * (marginPercent / 100);
    return subtotalBeforeMargin + marginAmount;
  };

  const calculateQuoteSummary = () => {
    const b = { ...product, ...form };
    const fm = b.formulation || {};
    const po = b.productionOverhead || {};
    const sa = b.standardAssumptions || {};
    const rnd = b.rnd || {};
    const pkg = b.packaging || {};
    const refW = Number(fm.refWeight) || 100;

    const formCost = (fm.rows || []).reduce((s, r) => {
      const qty = refW * (Number(r.percentage) || 0) / 100 * (Number(r.convFactor) || 1);
      const cost = (Number(r.costPerKg) || 0) * qty / 1000;
      return s + cost;
    }, 0);

    const overheadTotal = Number(po.electricity || 0) + Number(po.labor || 0) + Number(po.labTesting || 0) + Number(po.other || 0);
    const overheadPerUnit = refW > 0 ? overheadTotal / refW : 0;

    const saPct = [sa.equipmentPct, sa.consumablesPct, sa.storagePct, sa.housekeepingPct, sa.adminPct, sa.wastagePct].reduce((s, v) => s + (Number(v) || 0), 0);
    const saAmount = (formCost + overheadPerUnit) * (saPct / 100);

    const lifecycle = rnd.lifecycle || 1000;
    const rndTotal = (Number(rnd.testing) || 0) + (Number(rnd.consumables) || 0) + (Number(rnd.samples) || 0) + (Number(rnd.overhead) || 0) + (Number(rnd.otherOverhead) || 0) + (Number(rnd.qc) || 0);
    const rndPerUnit = lifecycle > 0 ? rndTotal / lifecycle : 0;

    const pkgItems = pkg.items || [];
    const pkgCharges = pkg.charges || {};
    const pkgCost = pkgItems.reduce((s, i) => s + (Number(i.amount) || Number(i.qty) * Number(i.rate) || 0), 0) + Number(pkgCharges.machine || 0) + Number(pkgCharges.other || 0);

    const subtotalPerUnit = formCost + overheadPerUnit + saAmount + rndPerUnit + pkgCost;
    const safetyBuffer = subtotalPerUnit * 0.1;
    let finalAmount = subtotalPerUnit + safetyBuffer;

    if (roundToNearest100) {
      finalAmount = Math.round(finalAmount / 100) * 100;
    }

    return {
      formCost,
      overheadPerUnit,
      saAmount,
      rndPerUnit,
      pkgCost,
      subtotalPerUnit,
      safetyBuffer,
      finalAmount,
      refW
    };
  };

  const fm = { ...product, ...form }.formulation || {};
  const refW = Number(fm.refWeight) || 100;
  const refUnit = fm.refUnit || 'ml';
  const formCost = (fm.rows || []).reduce((s, r) => {
    const qty = refW * (Number(r.percentage) || 0) / 100 * (Number(r.convFactor) || 1);
    const costPerUnit = Number(r.costPerKg) || 0;
    const cost = costPerUnit * qty;
    return s + cost;
  }, 0);
  const perUnit = refW > 0 ? formCost / refW : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8">
      {/* LEFT COLUMN: Forms */}
      <div className="space-y-8">

        <div>
          <p className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-4 flex items-center gap-1.5"><Factory size={14} />Ingredients Price Summary</p>
          {fm.rows && fm.rows.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 bg-slate-900 text-white rounded-2xl px-6 py-4">
              <div><p className="text-[11px] text-slate-300">Total Formulation Cost</p><p className="text-lg font-bold">₹{numF(formCost)}</p></div>
            </div>
          ) : (
            <p className="text-xs text-gray-400">No formulation data. Add ingredients in Formulation & Procedure tab.</p>
          )}
        </div>

        <hr className="border-gray-100 dark:border-[#1b2e4a]" />

        <div>
          <p className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-4 flex items-center gap-1.5"><Factory size={14} />Batch Quantity Calculator</p>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="col-span-2">
              <label className="label">Enter Batch Quantity</label>
              <input
                type="number"
                min="0"
                step="100"
                value={selectedBatch || ''}
                onChange={e => {
                  const val = e.target.value ? Number(e.target.value) : null;
                  setSelectedBatch(val);
                  setForm(prev => ({ ...prev, costing: { ...prev.costing, selectedBatch: val } }));
                }}
                className="input text-sm w-full"
                placeholder="e.g., 3000, 5000, 10000"
              />
            </div>
            <div>
              <label className="label">Unit</label>
              <select
                value={batchUnit}
                onChange={e => setBatchUnit(e.target.value)}
                className="input text-sm w-full"
              >
                <option value="g">g (grams)</option>
                <option value="kg">kg</option>
                <option value="ml">ml</option>
                <option value="L">L</option>
                <option value="pcs">pcs</option>
              </select>
            </div>
          </div>
          {selectedBatch && (() => {
            const batchCost = calculateBatchCost(selectedBatch, batchUnit);
            return (
              <HighlightStrip tone="dark" items={[
                { label: `Batch Size`, value: `${selectedBatch} ${batchUnit}` },
                { label: 'Total Price for Batch', value: `₹${numF(batchCost.totalAll)}`, big: true, accent: true },
              ]} />
            );
          })()}
        </div>

        <hr className="border-gray-100 dark:border-[#1b2e4a]" />

        <div>
          <RndOverheadsTab
            product={product}
            form={form}
            setForm={setForm}
            onSave={onSaveProductionOverheads}
            isPending={isPending}
            selectedBatch={selectedBatch}
            batchUnit={batchUnit}
            calculateBatchCost={calculateBatchCost}
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-gray-700 dark:text-gray-200 flex items-center gap-1.5"><Factory size={14} />Containers</p>
            <div className="rounded-lg bg-slate-900 text-white px-4 py-2">
              <p className="text-xs font-semibold">Total: ₹{selectedBatch ? numF((form.containers || []).reduce((s, item) => {
                const batchQtyInBaseUnit = selectedBatch ? convertToBaseUnit(selectedBatch, batchUnit) : 0;
                const containerWeightInBaseUnit = convertToBaseUnit(Number(item.weight) || 0, item.unit || 'g');
                const costPerPiece = Number(item.costPerPiece) || 0;
                const unitsNeeded = containerWeightInBaseUnit > 0 ? Math.round(batchQtyInBaseUnit / containerWeightInBaseUnit) : 0;
                const baseAmount = unitsNeeded * costPerPiece;
                const itemCost = item.gstIncluded ? baseAmount * 1.18 : baseAmount;
                return s + itemCost;
              }, 0)) : '—'}</p>
            </div>
          </div>
          <div className="space-y-4">
            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-[#1b2e4a]">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 dark:bg-[#0f1a2e]">
                  <tr>{['Item', 'Weight', 'Unit', 'Pcs Needed', 'Rate (₹)', 'GST', 'Amount (₹)', ''].map(h => <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {(form.containers || []).map((item, idx) => {
                    const batchQtyInBaseUnit = selectedBatch ? convertToBaseUnit(selectedBatch, batchUnit) : 0;
                    const containerWeightInBaseUnit = convertToBaseUnit(Number(item.weight) || 0, item.unit || 'g');
                    const costPerPiece = Number(item.costPerPiece) || 0;
                    const unitsNeeded = selectedBatch && containerWeightInBaseUnit > 0 ? Math.round(batchQtyInBaseUnit / containerWeightInBaseUnit) : 0;
                    const baseAmount = unitsNeeded * costPerPiece;
                    const amount = item.gstIncluded ? baseAmount * 1.18 : baseAmount;
                    return (
                      <tr key={idx} className="border-t border-gray-100 dark:border-[#1b2e4a]">
                        <td className="px-2 py-1.5"><input value={item.name} onChange={e => { const c = [...(form.containers || [])]; c[idx].name = e.target.value; setForm(f => ({ ...f, containers: c })); }} className="input text-xs w-32" placeholder="e.g., Bottle" /></td>
                        <td className="px-2 py-1.5"><input type="number" step="0.1" value={item.weight || ''} onChange={e => { const c = [...(form.containers || [])]; c[idx].weight = Number(e.target.value) || 0; setForm(f => ({ ...f, containers: c })); }} className="input text-xs w-20" /></td>
                        <td className="px-2 py-1.5"><select value={item.unit || 'g'} onChange={e => { const c = [...(form.containers || [])]; c[idx].unit = e.target.value; setForm(f => ({ ...f, containers: c })); }} className="input text-xs w-16"><option value="g">g</option><option value="kg">kg</option><option value="ml">ml</option><option value="L">L</option></select></td>
                        <td className="px-2 py-1.5"><input type="text" readOnly value={selectedBatch ? numF(unitsNeeded, 0) : '—'} className="input text-xs bg-amber-50 dark:bg-amber-500/10 font-mono font-bold text-amber-700 dark:text-amber-300 w-20" /></td>
                        <td className="px-2 py-1.5"><input type="number" step="0.01" value={item.costPerPiece || ''} onChange={e => { const c = [...(form.containers || [])]; c[idx].costPerPiece = Number(e.target.value) || 0; setForm(f => ({ ...f, containers: c })); }} className="input text-xs w-20" /></td>
                        <td className="px-2 py-1.5"><input type="checkbox" checked={item.gstIncluded || false} onChange={e => { const c = [...(form.containers || [])]; c[idx].gstIncluded = e.target.checked; setForm(f => ({ ...f, containers: c })); }} className="w-4 h-4" /></td>
                        <td className="px-2 py-1.5"><input type="text" readOnly value={selectedBatch ? numF(amount) : '—'} className="input text-xs bg-gray-50 dark:bg-[#0f1a2e] font-mono font-bold w-24" /></td>
                        <td className="px-2 py-1.5"><button onClick={() => setForm(f => ({ ...f, containers: (f.containers || []).filter((_, i) => i !== idx) }))} className="text-red-400 hover:text-red-600">✕</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setForm(f => ({ ...f, containers: [...(f.containers || []), { name: '', weight: 0, unit: 'g', costPerPiece: 0 }] }))} className="btn-secondary text-sm">+ Add Container</button>
            </div>
          </div>
        </div>

        <hr className="border-gray-100 dark:border-[#1b2e4a]" />

        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-gray-700 dark:text-gray-200 flex items-center gap-1.5"><Factory size={14} />Packaging & Labeling</p>
            <div className="rounded-lg bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800/30 px-4 py-2">
              <p className="text-xs font-semibold text-green-700 dark:text-green-400">Total: ₹{numF((form.packaging?.items || []).reduce((s, i) => {
                const baseAmount = Number(i.qty) * Number(i.rate) || 0;
                const amount = i.gstIncluded ? baseAmount * 1.18 : baseAmount;
                return s + amount;
              }, 0))}</p>
            </div>
          </div>
          <div className="space-y-4">
            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-[#1b2e4a]">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 dark:bg-[#0f1a2e]">
                  <tr>{['Item', 'Pcs', 'Rate (₹)', 'GST', 'Amount (₹)', 'Optional', ''].map(h => <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {(form.packaging?.items || []).map((item, i) => {
                    const baseAmount = item.qty * item.rate;
                    const amount = item.gstIncluded ? baseAmount * 1.18 : baseAmount;
                    return (
                      <tr key={i} className="border-t border-gray-100 dark:border-[#1b2e4a]">
                        <td className="px-2 py-1.5"><input value={item.name} onChange={e => setForm(prev => { const it = [...(prev.packaging?.items || [])]; it[i] = { ...it[i], name: e.target.value }; return { ...prev, packaging: { ...prev.packaging, items: it } }; })} className="input text-xs w-32" /></td>
                        <td className="px-2 py-1.5"><input type="number" value={item.qty} onChange={e => setForm(prev => { const it = [...(prev.packaging?.items || [])]; it[i] = { ...it[i], qty: Number(e.target.value) }; return { ...prev, packaging: { ...prev.packaging, items: it } }; })} className="input text-sm font-bold w-24" /></td>
                        <td className="px-2 py-1.5"><input type="number" value={item.rate} onChange={e => setForm(prev => { const it = [...(prev.packaging?.items || [])]; it[i] = { ...it[i], rate: Number(e.target.value) }; return { ...prev, packaging: { ...prev.packaging, items: it } }; })} className="input text-xs w-20" /></td>
                        <td className="px-2 py-1.5"><input type="checkbox" checked={item.gstIncluded || false} onChange={e => setForm(prev => { const it = [...(prev.packaging?.items || [])]; it[i] = { ...it[i], gstIncluded: e.target.checked }; return { ...prev, packaging: { ...prev.packaging, items: it } }; })} className="w-4 h-4" /></td>
                        <td className="px-2 py-1.5"><input type="text" readOnly value={numF(amount)} className="input text-xs bg-gray-50 dark:bg-[#0f1a2e] font-mono font-bold w-24" /></td>
                        <td className="px-2 py-1.5"><input type="checkbox" checked={item.optional} onChange={e => setForm(prev => { const it = [...(prev.packaging?.items || [])]; it[i] = { ...it[i], optional: e.target.checked }; return { ...prev, packaging: { ...prev.packaging, items: it } }; })} className="w-4 h-4" /></td>
                        <td className="px-2 py-1.5"><button onClick={() => setForm(prev => ({ ...prev, packaging: { ...prev.packaging, items: prev.packaging?.items?.filter((_, idx) => idx !== i) } }))} className="text-red-400 hover:text-red-600">✕</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setForm(prev => ({ ...prev, packaging: { ...prev.packaging, items: [...(prev.packaging?.items || []), { name: '', qty: 1, rate: 0, amount: 0, optional: false, gstIncluded: false }] } }))} className="btn-secondary text-sm">+ Add Item</button>
            </div>
          </div>
        </div>

        <hr className="border-gray-100 dark:border-[#1b2e4a]" />

        <div>
          <p className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-3 flex items-center gap-1.5"><Factory size={14} />Other Charges</p>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div><label className="label">Other (₹)</label><input type="number" value={form.packaging?.charges?.other || 0} onChange={e => setForm(prev => ({ ...prev, packaging: { ...prev.packaging, charges: { ...prev.packaging?.charges, other: Number(e.target.value) } } }))} className="input" /></div>
            </div>
          </div>
        </div>

        <hr className="border-gray-100 dark:border-[#1b2e4a]" />

        {selectedBatch && (() => {
          const sa = form.standardAssumptions || {};
          const saPct = [sa.equipmentPct, sa.consumablesPct, sa.storagePct, sa.housekeepingPct, sa.adminPct, sa.wastagePct].reduce((s, v) => s + (Number(v) || 0), 0);

          const batchCalc = calculateBatchCost(selectedBatch, batchUnit);
          const saAmount = batchCalc.saAmount;

          return (
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-[#0f1a2e] rounded-lg mb-4">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Standard Assumptions ({saPct}%)</p>
              <p className="text-sm font-bold text-gray-900 dark:text-white font-mono">₹{numF(saAmount)}</p>
            </div>
          );
        })()}

        {selectedBatch && (() => {
          const batchCalc = calculateBatchCost(selectedBatch, batchUnit);
          const totalFormCost = batchCalc.totalFormCost;
          const totalOverheadCost = batchCalc.totalOverheadCost;
          const saAmount = batchCalc.saAmount;

          const containersCost = (form.containers || []).reduce((s, item) => {
            const batchQtyBase = convertToBaseUnit(selectedBatch, batchUnit);
            const containerWtBase = convertToBaseUnit(Number(item.weight) || 0, item.unit || 'g');
            const pcsNeeded = containerWtBase > 0 ? Math.round(batchQtyBase / containerWtBase) : 0;
            const costPerPiece = Number(item.costPerPiece) || 0;
            const baseAmount = pcsNeeded * costPerPiece;
            const amount = item.gstIncluded ? baseAmount * 1.18 : baseAmount;
            return s + amount;
          }, 0);

          const pkgItems = form.packaging?.items || [];
          const pkgCharges = form.packaging?.charges || {};
          const pkgCostTotal = pkgItems.reduce((s, i) => {
            const baseAmount = Number(i.qty) * Number(i.rate) || 0;
            const amount = i.gstIncluded ? baseAmount * 1.18 : baseAmount;
            return s + amount;
          }, 0) + Number(pkgCharges.other || 0);

          const subtotalBeforeMargin = totalFormCost + totalOverheadCost + saAmount + containersCost + pkgCostTotal;
          const marginAmount = subtotalBeforeMargin * (marginPercent / 100);
          const subtotalWithMargin = subtotalBeforeMargin + marginAmount;

          return (
            <div className="space-y-2 p-3 bg-gray-50 dark:bg-[#0f1a2e] rounded-lg mb-4">
              <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">Margin Settings</p>

              <div className="grid grid-cols-2 gap-2 mb-3">
                {[['b2b', 'B2B'], ['b2c', 'B2C']].map(([type, label]) => (
                  <button
                    key={type}
                    onClick={() => {
                      setActiveMarginType(type);
                      setMarginPercent(Number(form.costing?.margins?.[type]) || 0);
                    }}
                    className={`py-2 px-3 rounded text-xs font-semibold transition-all border ${
                      activeMarginType === type
                        ? 'bg-emerald-100 dark:bg-emerald-500/20 border-emerald-500 text-emerald-700 dark:text-emerald-300'
                        : 'bg-white dark:bg-[#1b2e4a] border-gray-200 dark:border-[#1b2e4a] text-gray-700 dark:text-gray-300 hover:border-gray-300'
                    }`}
                  >
                    {label}
                    <div className="text-[10px] text-gray-600 dark:text-gray-400 mt-0.5">
                      {form.costing?.margins?.[type] || 0}%
                    </div>
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={marginPercent}
                  onChange={e => {
                    const val = Number(e.target.value);
                    setMarginPercent(val);
                    setForm(prev => ({
                      ...prev,
                      costing: {
                        ...prev.costing,
                        margins: {
                          ...prev.costing?.margins,
                          [activeMarginType]: val
                        }
                      }
                    }));
                  }}
                  className="input text-sm w-16"
                  placeholder="0"
                />
                <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">% {activeMarginType.toUpperCase()}</span>
                <span className="text-xs font-mono font-bold text-gray-900 dark:text-white ml-auto">+ ₹{numF(marginAmount, 2)}</span>
              </div>

              <div className="flex justify-between items-center text-sm pt-2 border-t border-gray-200 dark:border-[#1b2e4a]">
                <p className="font-semibold text-gray-700 dark:text-gray-200">With Margin</p>
                <p className="font-mono font-bold text-gray-900 dark:text-white">₹{numF(subtotalWithMargin, 2)}</p>
              </div>
            </div>
          );
        })()}


        {/* Final Cost Summary Card */}
        {selectedBatch && (() => {
          const batchCalc = calculateBatchCost(selectedBatch, batchUnit);
          const totalFormCost = batchCalc.totalFormCost;
          const totalOverheadCost = batchCalc.totalOverheadCost;
          const saAmount = batchCalc.saAmount;

          const containersCost = (form.containers || []).reduce((s, item) => {
            const batchQtyBase = convertToBaseUnit(selectedBatch, batchUnit);
            const containerWtBase = convertToBaseUnit(Number(item.weight) || 0, item.unit || 'g');
            const pcsNeeded = containerWtBase > 0 ? Math.round(batchQtyBase / containerWtBase) : 0;
            const costPerPiece = Number(item.costPerPiece) || 0;
            const baseAmount = pcsNeeded * costPerPiece;
            const amount = item.gstIncluded ? baseAmount * 1.18 : baseAmount;
            return s + amount;
          }, 0);

          const pkgItems = form.packaging?.items || [];
          const pkgCharges = form.packaging?.charges || {};
          const pkgCostTotal = pkgItems.reduce((s, i) => {
            const baseAmount = Number(i.qty) * Number(i.rate) || 0;
            const amount = i.gstIncluded ? baseAmount * 1.18 : baseAmount;
            return s + amount;
          }, 0) + Number(pkgCharges.other || 0);

          const subtotalBeforeMargin = totalFormCost + totalOverheadCost + saAmount + containersCost + pkgCostTotal;
          const marginAmount = subtotalBeforeMargin * (marginPercent / 100);
          const subtotalWithMargin = subtotalBeforeMargin + marginAmount;
          const finalAmount = subtotalWithMargin;

          return (
            <>
            </>
          );
        })()}

        <hr className="border-gray-100 dark:border-[#1b2e4a]" />

        <div className="flex gap-3">
          <button
            onClick={saveAllData}
            disabled={isPending}
            className={`px-4 py-2 rounded-lg font-semibold text-xs transition-all ${
              saveStatus === 'saved'
                ? 'bg-green-500 text-white'
                : saveStatus === 'error'
                ? 'bg-red-500 text-white'
                : isPending
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-500 hover:bg-blue-600 text-white'
            }`}
          >
            {saveStatus === 'saved' ? '✓ Saved' : saveStatus === 'saving' ? 'Saving...' : saveStatus === 'error' ? '✗ Error' : '💾 Save All'}
          </button>
          {saveStatus && (
            <p className="text-xs text-gray-500 dark:text-gray-400 self-center">
              {saveStatus === 'saved' && 'All data saved successfully'}
              {saveStatus === 'error' && 'Failed to save data'}
            </p>
          )}
        </div>

        <SavedQuotes
          productId={product?._id}
          form={form}
          setForm={setForm}
          currentTotal={computeFinalTotal()}
          selectedBatch={selectedBatch}
          batchUnit={batchUnit}
          setSelectedBatch={setSelectedBatch}
          setBatchUnit={setBatchUnit}
        />
      </div>

      {/* RIGHT COLUMN: Sticky Quote Summary */}
      <div className="lg:sticky lg:top-20 h-fit">
        <p className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-3 flex items-center gap-1.5"><Star size={14} fill="currentColor" />Final: Cost Summary</p>

        {(() => {
          const b = { ...product, ...form };
          const fm = b.formulation || {};
          const po = b.productionOverhead || {};
          const sa = b.standardAssumptions || {};
          const pkg = b.packaging || {};
          const refW = Number(fm.refWeight) || 100;

          // Total formulation cost for batch (using calculateBatchCost from earlier in the component)
          const batchQtyInBaseUnit = convertToBaseUnit(selectedBatch, batchUnit);
          const batchCostCalc = calculateBatchCost(selectedBatch, batchUnit);
          const totalFormCost = batchCostCalc.totalFormCost || 0;
          const totalOverheadCost = batchCostCalc.totalOverheadCost || 0;
          const saAmount = batchCostCalc.saAmount || 0;

          // Containers cost (with per-item GST support)
          const containersCost = selectedBatch ? (form.containers || []).reduce((s, item) => {
            const batchQtyBase = batchQtyInBaseUnit;
            const containerWtBase = convertToBaseUnit(Number(item.weight) || 0, item.unit || 'g');
            const pcsNeeded = containerWtBase > 0 ? Math.round(batchQtyBase / containerWtBase) : 0;
            const costPerPiece = Number(item.costPerPiece) || 0;
            const baseAmount = pcsNeeded * costPerPiece;
            const amount = item.gstIncluded ? baseAmount * 1.18 : baseAmount;
            return s + amount;
          }, 0) : 0;

          // Packaging cost (with per-item GST support)
          const pkgItems = pkg.items || [];
          const pkgCharges = pkg.charges || {};
          const pkgCostTotal = pkgItems.reduce((s, i) => {
            const baseAmount = Number(i.qty) * Number(i.rate) || 0;
            const amount = i.gstIncluded ? baseAmount * 1.18 : baseAmount;
            return s + amount;
          }, 0) + Number(pkgCharges.other || 0);

          // Calculate subtotal before margin
          const subtotalBeforeMargin = totalFormCost + totalOverheadCost + saAmount + containersCost + pkgCostTotal;

          // Apply margin
          const marginAmount = subtotalBeforeMargin * (marginPercent / 100);
          const subtotalWithMargin = subtotalBeforeMargin + marginAmount;

          const finalAmount = subtotalWithMargin;

          return (
            <>

              <div className="bg-slate-900 text-white rounded-2xl px-6 py-4">
                <p className="text-xs font-semibold text-slate-400 mb-2">FINAL QUOTE AMOUNT</p>
                <p className="text-4xl font-bold text-amber-300">₹{numF(finalAmount, 2)}</p>
              </div>
            </>
          );
        })()}

        {/* Complete Cost Summary */}
        <hr className="border-gray-200 dark:border-[#1b2e4a] my-4" />
        <p className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-3 flex items-center gap-1.5"><Factory size={14} />Complete Cost Breakdown</p>
        {selectedBatch && (() => {
          const batchCost = calculateBatchCost(selectedBatch, batchUnit);
          const totalFormCost = batchCost.totalFormCost || 0;
          const totalOverheadCost = batchCost.totalOverheadCost || 0;
          const saAmount = batchCost.saAmount || 0;

          const containersTotal = (form.containers || []).reduce((s, item) => {
            const batchQtyInBaseUnit = convertToBaseUnit(selectedBatch, batchUnit);
            const containerWeightInBaseUnit = convertToBaseUnit(Number(item.weight) || 0, item.unit || 'g');
            const pcsNeeded = containerWeightInBaseUnit > 0 ? Math.round(batchQtyInBaseUnit / containerWeightInBaseUnit) : 0;
            const costPerPiece = Number(item.costPerPiece) || 0;
            const baseAmount = pcsNeeded * costPerPiece;
            const amount = item.gstIncluded ? baseAmount * 1.18 : baseAmount;
            return s + amount;
          }, 0);

          const pkgItems = form.packaging?.items || [];
          const pkgCharges = form.packaging?.charges || {};
          const packagingTotal = pkgItems.reduce((s, i) => {
            const baseAmount = Number(i.qty) * Number(i.rate) || 0;
            const amount = i.gstIncluded ? baseAmount * 1.18 : baseAmount;
            return s + amount;
          }, 0);
          const otherCharges = Number(pkgCharges.other || 0);

          const subtotalBeforeMargin = totalFormCost + totalOverheadCost + saAmount + containersTotal + packagingTotal + otherCharges;
          const marginAmount = subtotalBeforeMargin * (marginPercent / 100);
          const finalTotal = subtotalBeforeMargin + marginAmount;

          return (
            <div className="space-y-2 p-3 bg-gray-50 dark:bg-[#0f1a2e] rounded-lg text-xs">
              <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Formulation:</span><span className="font-mono font-semibold">₹{numF(totalFormCost)}</span></div>
              <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Production Overhead:</span><span className="font-mono font-semibold">₹{numF(totalOverheadCost)}</span></div>
              <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Standard Assumptions:</span><span className="font-mono font-semibold">₹{numF(saAmount)}</span></div>
              <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Containers:</span><span className="font-mono font-semibold">₹{numF(containersTotal)}</span></div>
              <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Packaging & Labeling:</span><span className="font-mono font-semibold">₹{numF(packagingTotal)}</span></div>
              <div className="flex justify-between"><span className="text-gray-600 dark:text-gray-400">Other Charges:</span><span className="font-mono font-semibold">₹{numF(otherCharges)}</span></div>
              <div className="border-t border-gray-200 dark:border-[#1b2e4a] pt-2 flex justify-between font-semibold">
                <span className="text-gray-700 dark:text-gray-200">Subtotal:</span>
                <span className="font-mono">₹{numF(subtotalBeforeMargin)}</span>
              </div>
              <div className="flex justify-between font-semibold"><span className="text-gray-700 dark:text-gray-200">Margin ({marginPercent}%):</span><span className="font-mono">₹{numF(marginAmount)}</span></div>
              <div className="border-t border-gray-200 dark:border-[#1b2e4a] pt-2 flex justify-between font-bold text-base">
                <span className="text-gray-900 dark:text-white">Final Total:</span>
                <span className="font-mono text-amber-600 dark:text-amber-400">₹{numF(finalTotal)}</span>
              </div>

              {(() => {
                const batchQtyBase = convertToBaseUnit(selectedBatch, batchUnit);
                const pricePerBaseUnit = batchQtyBase > 0 ? finalTotal / batchQtyBase : 0;
                const isVolume = batchUnit === 'ml' || batchUnit === 'L';
                const smallUnitLabel = isVolume ? 'ml' : 'g';
                const bigUnitLabel = isVolume ? 'L' : 'kg';

                return (
                  <div className="mt-3 pt-3 border-t border-gray-200 dark:border-[#1b2e4a] space-y-2">
                    <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">Unit Price Breakdown</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-white dark:bg-[#1b2e4a] border border-gray-200 dark:border-[#263a56] rounded-lg p-2 text-center">
                        <p className="text-[10px] text-gray-400">Per {smallUnitLabel}</p>
                        <p className="font-mono font-bold text-gray-900 dark:text-white text-sm">₹{numF(pricePerBaseUnit, 3)}</p>
                      </div>
                      <div className="bg-white dark:bg-[#1b2e4a] border border-gray-200 dark:border-[#263a56] rounded-lg p-2 text-center">
                        <p className="text-[10px] text-gray-400">Per {bigUnitLabel}</p>
                        <p className="font-mono font-bold text-gray-900 dark:text-white text-sm">₹{numF(pricePerBaseUnit * 1000, 2)}</p>
                      </div>
                    </div>

                    <div className="pt-1">
                      <label className="text-[10px] text-gray-400">Custom Qty</label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          min="0"
                          value={customQty}
                          onChange={e => setCustomQty(e.target.value)}
                          placeholder="e.g. 250"
                          className="input text-xs flex-1 min-w-0"
                        />
                        <select value={customUnit} onChange={e => setCustomUnit(e.target.value)} className="input text-xs w-16 shrink-0 px-1">
                          <option value="g">g</option>
                          <option value="kg">kg</option>
                          <option value="ml">ml</option>
                          <option value="L">L</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <button
                        onClick={() => {
                          const qtyBase = convertToBaseUnit(Number(customQty) || 0, customUnit);
                          setCustomResult({
                            qty: customQty,
                            unit: customUnit,
                            price: qtyBase * pricePerBaseUnit
                          });
                        }}
                        disabled={!customQty}
                        className="w-full px-3 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg text-xs font-semibold transition"
                      >
                        Get Price
                      </button>
                    </div>

                    {customResult && (
                      <div className="flex justify-between items-center text-xs pt-2 mt-1 border-t border-gray-100 dark:border-[#1b2e4a]">
                        <span className="text-gray-600 dark:text-gray-400">Price for {customResult.qty}{customResult.unit}:</span>
                        <span className="font-mono font-bold text-amber-600 dark:text-amber-400">₹{numF(customResult.price, 2)}</span>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          );
        })()}
        {!selectedBatch && <p className="text-xs text-gray-400">Enter batch quantity to see cost breakdown</p>}
      </div>
    </div>
  );
}
