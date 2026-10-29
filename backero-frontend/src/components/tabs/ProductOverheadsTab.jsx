import React, { useState, useEffect } from 'react';
import { Factory, Star } from 'lucide-react';
import RndOverheadsTab from './RndOverheadsTab';

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
  const [showContainerGST, setShowContainerGST] = useState(false);
  const [showFinalGST, setShowFinalGST] = useState(false);
  const [showQuoteGST, setShowQuoteGST] = useState(false);
  const [activeMarginType, setActiveMarginType] = useState('b2c');
  const [marginPercent, setMarginPercent] = useState(form.costing?.margins?.b2c || 0);

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
    const overheadPerUnit = refWInBaseUnit > 0 ? overheadTotal / refWInBaseUnit : 0;

    const saPct = [sa.equipmentPct, sa.consumablesPct, sa.storagePct, sa.housekeepingPct, sa.adminPct, sa.wastagePct].reduce((s, v) => s + (Number(v) || 0), 0);
    const saAmount = formCost * (saPct / 100);

    const lifecycle = rnd.lifecycle || 1000;
    const rndTotal = (Number(rnd.testing) || 0) + (Number(rnd.consumables) || 0) + (Number(rnd.samples) || 0) + (Number(rnd.overhead) || 0) + (Number(rnd.otherOverhead) || 0) + (Number(rnd.qc) || 0);
    const rndPerUnit = lifecycle > 0 ? rndTotal / lifecycle : 0;

    const units = refWInBaseUnit > 0 ? batchQtyInBaseUnit / refWInBaseUnit : 0;
    const totalFormCostForBatch = formCost * units;
    return {
      totalFormCost: totalFormCostForBatch,
      totalAll: totalFormCostForBatch,
      units,
      batchQtyInBaseUnit,
      unit
    };
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
    const saAmount = formCost * (saPct / 100);

    const lifecycle = rnd.lifecycle || 1000;
    const rndTotal = (Number(rnd.testing) || 0) + (Number(rnd.consumables) || 0) + (Number(rnd.samples) || 0) + (Number(rnd.overhead) || 0) + (Number(rnd.otherOverhead) || 0) + (Number(rnd.qc) || 0);
    const rndPerUnit = lifecycle > 0 ? rndTotal / lifecycle : 0;

    const pkgItems = pkg.items || [];
    const pkgCharges = pkg.charges || {};
    const pkgCost = pkgItems.reduce((s, i) => s + (Number(i.amount) || Number(i.qty) * Number(i.rate) || 0), 0) + Number(pkgCharges.machine || 0) + Number(pkgCharges.shrinkWrap || 0) + Number(pkgCharges.other || 0);

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
            <div className="grid grid-cols-3 gap-4 bg-slate-900 text-white rounded-2xl px-6 py-4">
              <div><p className="text-[11px] text-slate-300">Total Formulation Cost</p><p className="text-lg font-bold">₹{numF(formCost)}</p></div>
              <div><p className="text-[11px] text-slate-300">Reference Weight</p><p className="text-lg font-bold">{refW} {refUnit}</p></div>
              <div><p className="text-[11px] text-slate-300">Cost Per Unit</p><p className="text-lg font-bold">₹{numF(perUnit, 4)}</p></div>
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
                onChange={e => setSelectedBatch(e.target.value ? Number(e.target.value) : null)}
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
          />
        </div>

        <hr className="border-gray-100 dark:border-[#1b2e4a]" />

        <div>
          <p className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-4 flex items-center gap-1.5"><Factory size={14} />Total Cost Breakdown</p>
          {selectedBatch && (() => {
            const po = form.productionOverhead || {};
            const sa = form.standardAssumptions || {};
            const batchCost = calculateBatchCost(selectedBatch, batchUnit);
            const totalFormulation = batchCost.totalFormCost || 0;

            const overheadTotal = Number(po.electricity || 0) + Number(po.labor || 0) + Number(po.labTesting || 0) + Number(po.other || 0);
            const batchQtyInBaseUnit = convertToBaseUnit(selectedBatch, batchUnit);
            const totalOverheadForBatch = overheadTotal;

            const saPct = [sa.equipmentPct, sa.consumablesPct, sa.storagePct, sa.housekeepingPct, sa.adminPct, sa.wastagePct].reduce((s, v) => s + (Number(v) || 0), 0);
            const subtotal = totalFormulation + totalOverheadForBatch;
            const saAmount = subtotal * (saPct / 100);

            const totalWithSAAndOverhead = subtotal + saAmount;
            const perUnitFormulation = totalFormulation / batchQtyInBaseUnit;
            const perUnitSA = saAmount / batchQtyInBaseUnit;
            const perUnitOverhead = totalOverheadForBatch / batchQtyInBaseUnit;
            const perUnitCombined = totalWithSAAndOverhead / batchQtyInBaseUnit;

            let perAlternateUnit = perUnitCombined;
            let perAltFormulation = perUnitFormulation;
            let perAltSA = perUnitSA;
            let perAltOverhead = perUnitOverhead;
            let alternateLabel = batchUnit;

            // Add alternate unit conversions for common units
            if (batchUnit === 'L') {
              perAlternateUnit = perUnitCombined / 1000; // Convert L to ml
              perAltFormulation = perUnitFormulation / 1000;
              perAltSA = perUnitSA / 1000;
              perAltOverhead = perUnitOverhead / 1000;
              alternateLabel = 'ml';
            } else if (batchUnit === 'ml') {
              perAlternateUnit = perUnitCombined * 1000; // Convert ml to L
              perAltFormulation = perUnitFormulation * 1000;
              perAltSA = perUnitSA * 1000;
              perAltOverhead = perUnitOverhead * 1000;
              alternateLabel = 'L';
            } else if (batchUnit === 'kg') {
              perAlternateUnit = perUnitCombined / 1000; // Convert kg to g
              perAltFormulation = perUnitFormulation / 1000;
              perAltSA = perUnitSA / 1000;
              perAltOverhead = perUnitOverhead / 1000;
              alternateLabel = 'g';
            } else if (batchUnit === 'g') {
              perAlternateUnit = perUnitCombined * 1000; // Convert g to kg
              perAltFormulation = perUnitFormulation * 1000;
              perAltSA = perUnitSA * 1000;
              perAltOverhead = perUnitOverhead * 1000;
              alternateLabel = 'kg';
            }

            return (
              <div className="space-y-4">
                <HighlightStrip tone="dark" items={[
                  { label: 'Total Formulation Cost', value: `₹${numF(totalFormulation)}` },
                  { label: 'Production Overhead', value: `₹${numF(totalOverheadForBatch)}` },
                  { label: `Standard Assumptions (${saPct}%)`, value: `₹${numF(saAmount)}` },
                  { label: 'Combined Total', value: `₹${numF(totalWithSAAndOverhead)}`, big: true, accent: true },
                ]} />
                <HighlightStrip tone="dark" items={[
                  { label: `Per ${batchUnit} (Formulation)`, value: `₹${numF(perUnitFormulation, 4)}` },
                  { label: `Per ${batchUnit} (Overhead)`, value: `₹${numF(perUnitOverhead, 4)}` },
                  { label: `Per ${batchUnit} (SA)`, value: `₹${numF(perUnitSA, 4)}` },
                  { label: `Per ${batchUnit} (Total)`, value: `₹${numF(perUnitCombined, 4)}`, big: true, accent: true },
                ]} />
                <HighlightStrip tone="dark" items={[
                  { label: `Per ${alternateLabel} (Formulation)`, value: `₹${numF(perAltFormulation, 4)}` },
                  { label: `Per ${alternateLabel} (Overhead)`, value: `₹${numF(perAltOverhead, 4)}` },
                  { label: `Per ${alternateLabel} (SA)`, value: `₹${numF(perAltSA, 4)}` },
                  { label: `Per ${alternateLabel} (Total)`, value: `₹${numF(perAlternateUnit, 4)}`, big: true, accent: true },
                ]} />
              </div>
            );
          })()}
          {!selectedBatch && <p className="text-xs text-gray-400">Enter a batch quantity to see cost breakdown</p>}
        </div>

        <hr className="border-gray-100 dark:border-[#1b2e4a]" />

        <div>
          <p className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-4 flex items-center gap-1.5"><Factory size={14} />Containers & Labeling</p>
          {!selectedBatch && <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 rounded-lg text-xs border border-blue-200 dark:border-blue-800"><strong>Note:</strong> Enter a batch quantity above to calculate Pcs Needed and costs</div>}
          <div className="space-y-3">
            {(form.containers || []).map((item, idx) => {
              const batchQtyInBaseUnit = selectedBatch ? convertToBaseUnit(selectedBatch, batchUnit) : 0;
              const containerWeightInBaseUnit = convertToBaseUnit(Number(item.weight) || 0, item.unit || 'g');
              const costPerPiece = Number(item.costPerPiece) || 0;
              const unitsNeeded = containerWeightInBaseUnit > 0 ? batchQtyInBaseUnit / containerWeightInBaseUnit : 0;
              const amount = unitsNeeded * costPerPiece;
              const amountWithGST = showContainerGST ? amount * 1.18 : amount;
              return (
                <div key={idx} className="space-y-2 border border-gray-200 dark:border-[#1b2e4a] rounded-lg p-3">
                  <div className="flex gap-3">
                    <div className="flex-1"><label className="label text-xs">Item Name</label><input type="text" value={item.name || ''} onChange={e => { const c = [...(form.containers || [])]; c[idx].name = e.target.value; setForm(f => ({ ...f, containers: c })); }} className="input text-xs w-full" placeholder="e.g., Bottle, Label, Cap" /></div>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1"><label className="label text-xs">Weight of One Container</label><input type="number" step="0.1" value={item.weight || ''} onChange={e => { const c = [...(form.containers || [])]; c[idx].weight = Number(e.target.value) || 0; setForm(f => ({ ...f, containers: c })); }} className="input text-xs w-full" placeholder="e.g., 5, 0.5, 250" /></div>
                    <div className="w-20"><label className="label text-xs">Unit</label><select value={item.unit || 'g'} onChange={e => { const c = [...(form.containers || [])]; c[idx].unit = e.target.value; setForm(f => ({ ...f, containers: c })); }} className="input text-xs w-full"><option value="g">g</option><option value="kg">kg</option><option value="ml">ml</option><option value="L">L</option></select></div>
                    <div className="w-20"><label className="label text-xs">Pcs Needed</label><input type="text" readOnly value={selectedBatch ? numF(unitsNeeded, 0) : '—'} className="input text-xs bg-amber-50 dark:bg-amber-500/10 font-mono font-bold text-amber-700 dark:text-amber-300" /></div>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1"><label className="label text-xs">Cost per Piece (₹)</label><input type="number" step="0.01" value={item.costPerPiece || ''} onChange={e => { const c = [...(form.containers || [])]; c[idx].costPerPiece = Number(e.target.value) || 0; setForm(f => ({ ...f, containers: c })); }} className="input text-xs w-full" placeholder="₹ per piece" /></div>
                    <div className="w-28"><label className="label text-xs">Total ({selectedBatch ? batchUnit : '—'})</label><input type="text" readOnly value={selectedBatch ? numF(amountWithGST) : '—'} className="input text-xs bg-gray-50 dark:bg-[#0f1a2e] font-mono font-bold" /></div>
                    <button onClick={() => setForm(f => ({ ...f, containers: (f.containers || []).filter((_, i) => i !== idx) }))} className="text-red-500 hover:text-red-700">✕</button>
                  </div>
                </div>
              );
            })}
            <button onClick={() => setForm(f => ({ ...f, containers: [...(f.containers || []), { name: '', weight: 0, unit: 'g', costPerPiece: 0 }] }))} className="btn-secondary text-sm w-full">+ Add Container Item</button>
          </div>
          <div className="flex items-center gap-2 mt-3 p-2 bg-gray-50 dark:bg-[#0f1a2e] rounded">
            <input type="checkbox" checked={showContainerGST} onChange={e => setShowContainerGST(e.target.checked)} id="containerGST" className="w-4 h-4" />
            <label htmlFor="containerGST" className="text-xs font-semibold text-gray-700 dark:text-gray-200 cursor-pointer">Include GST (18%)</label>
          </div>
          <div className="mt-3 p-3 bg-slate-900 text-white rounded-lg text-sm font-bold flex justify-between">
            <span>Total Containers Cost:</span>
            <span>₹{selectedBatch ? numF((form.containers || []).reduce((s, item) => {
              const batchQtyInBaseUnit = convertToBaseUnit(selectedBatch, batchUnit);
              const containerWeightInBaseUnit = convertToBaseUnit(Number(item.weight) || 0, item.unit || 'g');
              const costPerPiece = Number(item.costPerPiece) || 0;
              const unitsNeeded = containerWeightInBaseUnit > 0 ? batchQtyInBaseUnit / containerWeightInBaseUnit : 0;
              const itemCost = unitsNeeded * costPerPiece * (showContainerGST ? 1.18 : 1);
              return s + itemCost;
            }, 0)) : '—'}</span>
          </div>
        </div>

        <hr className="border-gray-100 dark:border-[#1b2e4a]" />

        <div>
          <p className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-3 flex items-center gap-1.5"><Factory size={14} />Packaging & Labeling</p>
          <div className="space-y-4">
            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-[#1b2e4a]">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 dark:bg-[#0f1a2e]">
                  <tr>{['Item', 'Pcs', 'Rate (₹)', 'Amount (₹)', 'Optional', ''].map(h => <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {(form.packaging?.items || []).map((item, i) => (
                    <tr key={i} className="border-t border-gray-100 dark:border-[#1b2e4a]">
                      <td className="px-2 py-1.5"><input value={item.name} onChange={e => setForm(prev => { const it = [...(prev.packaging?.items || [])]; it[i] = { ...it[i], name: e.target.value }; return { ...prev, packaging: { ...prev.packaging, items: it } }; })} className="input text-xs w-32" /></td>
                      <td className="px-2 py-1.5"><input type="number" value={item.qty} onChange={e => setForm(prev => { const it = [...(prev.packaging?.items || [])]; it[i] = { ...it[i], qty: Number(e.target.value) }; return { ...prev, packaging: { ...prev.packaging, items: it } }; })} className="input text-sm font-bold w-24" /></td>
                      <td className="px-2 py-1.5"><input type="number" value={item.rate} onChange={e => setForm(prev => { const it = [...(prev.packaging?.items || [])]; it[i] = { ...it[i], rate: Number(e.target.value) }; return { ...prev, packaging: { ...prev.packaging, items: it } }; })} className="input text-xs w-20" /></td>
                      <td className="px-2 py-1.5"><input type="number" value={item.amount || item.qty * item.rate} onChange={e => setForm(prev => { const it = [...(prev.packaging?.items || [])]; it[i] = { ...it[i], amount: Number(e.target.value) }; return { ...prev, packaging: { ...prev.packaging, items: it } }; })} className="input text-xs w-20" /></td>
                      <td className="px-2 py-1.5"><input type="checkbox" checked={item.optional} onChange={e => setForm(prev => { const it = [...(prev.packaging?.items || [])]; it[i] = { ...it[i], optional: e.target.checked }; return { ...prev, packaging: { ...prev.packaging, items: it } }; })} className="w-4 h-4" /></td>
                      <td className="px-2 py-1.5"><button onClick={() => setForm(prev => ({ ...prev, packaging: { ...prev.packaging, items: prev.packaging?.items?.filter((_, idx) => idx !== i) } }))} className="text-red-400 hover:text-red-600">✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[['machine', 'Machine Charges'], ['shrinkWrap', 'Shrink Wrap'], ['other', 'Other']].map(([f, label]) => (
                <div key={f}><label className="label">{label} (₹)</label><input type="number" value={form.packaging?.charges?.[f] || 0} onChange={e => setForm(prev => ({ ...prev, packaging: { ...prev.packaging, charges: { ...prev.packaging?.charges, [f]: Number(e.target.value) } } }))} className="input" /></div>
              ))}
            </div>
            <div className="rounded-lg bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800/30 px-4 py-2">
              <p className="text-xs font-semibold text-green-700 dark:text-green-400">Total Packaging Cost: ₹{numF((form.packaging?.items || []).reduce((s, i) => s + (Number(i.amount) || Number(i.qty) * Number(i.rate) || 0), 0) + Number(form.packaging?.charges?.machine || 0) + Number(form.packaging?.charges?.shrinkWrap || 0) + Number(form.packaging?.charges?.other || 0))}</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setForm(prev => ({ ...prev, packaging: { ...prev.packaging, items: [...(prev.packaging?.items || []), { name: '', qty: 1, rate: 0, amount: 0, optional: false }] } }))} className="btn-secondary text-sm">+ Add Item</button>
              <button onClick={onSavePackaging} disabled={isPending} className="btn-primary text-sm disabled:opacity-50 ml-auto">{isPending ? 'Saving…' : '💾 Save Packaging'}</button>
            </div>
          </div>
        </div>
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

          // Total formulation cost for reference weight
          const totalFormCost = (fm.rows || []).reduce((s, r) => {
            const qty = refW * (Number(r.percentage) || 0) / 100 * (Number(r.convFactor) || 1);
            const cost = (Number(r.costPerKg) || 0) * qty;
            return s + cost;
          }, 0);

          // Total production overhead (not per unit)
          const totalOverhead = Number(po.electricity || 0) + Number(po.labor || 0) + Number(po.labTesting || 0) + Number(po.other || 0);

          // Standard assumptions percentage applied to formulation
          const saPct = [sa.equipmentPct, sa.consumablesPct, sa.storagePct, sa.housekeepingPct, sa.adminPct, sa.wastagePct].reduce((s, v) => s + (Number(v) || 0), 0);
          const saAmount = totalFormCost * (saPct / 100);

          // Containers cost (recalculate Pcs Needed since it's based on batch)
          const containersCost = selectedBatch ? (form.containers || []).reduce((s, item) => {
            const batchQtyBase = convertToBaseUnit(selectedBatch, batchUnit);
            const containerWtBase = convertToBaseUnit(Number(item.weight) || 0, item.unit || 'g');
            const pcsNeeded = containerWtBase > 0 ? Math.round(batchQtyBase / containerWtBase) : 0;
            const costPerPiece = Number(item.costPerPiece) || 0;
            return s + (costPerPiece * pcsNeeded);
          }, 0) : 0;

          // Packaging cost
          const pkgItems = pkg.items || [];
          const pkgCharges = pkg.charges || {};
          const pkgCostTotal = pkgItems.reduce((s, i) => s + (Number(i.amount) || Number(i.qty) * Number(i.rate) || 0), 0) + Number(pkgCharges.machine || 0) + Number(pkgCharges.shrinkWrap || 0) + Number(pkgCharges.other || 0);

          // Calculate subtotal before margin
          const subtotalBeforeMargin = totalFormCost + totalOverhead + saAmount + containersCost + pkgCostTotal;

          // Apply margin
          const marginAmount = subtotalBeforeMargin * (marginPercent / 100);
          const subtotalWithMargin = subtotalBeforeMargin + marginAmount;

          // Apply GST if enabled
          const finalAmount = showQuoteGST ? subtotalWithMargin * 1.18 : subtotalWithMargin;

          return (
            <>
              <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-[#1b2e4a] mb-4">
                <table className="w-full text-xs">
                  <tbody>
                    <tr className="border-b border-gray-200 dark:border-[#1b2e4a]">
                      <td className="px-3 py-2.5 font-semibold text-gray-700 dark:text-gray-300">Total Formulation Cost</td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-gray-900 dark:text-white">₹{numF(totalFormCost, 2)}</td>
                    </tr>
                    <tr className="border-b border-gray-200 dark:border-[#1b2e4a]">
                      <td className="px-3 py-2.5 font-semibold text-gray-700 dark:text-gray-300">Production Overhead</td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-gray-900 dark:text-white">₹{numF(totalOverhead, 2)}</td>
                    </tr>
                    <tr className="border-b border-gray-200 dark:border-[#1b2e4a]">
                      <td className="px-3 py-2.5 font-semibold text-gray-700 dark:text-gray-300">Standard Assumptions ({saPct.toFixed(1)}%)</td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-gray-900 dark:text-white">₹{numF(saAmount, 2)}</td>
                    </tr>
                    <tr className="border-b border-gray-200 dark:border-[#1b2e4a]">
                      <td className="px-3 py-2.5 font-semibold text-gray-700 dark:text-gray-300">Containers & Labeling</td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-gray-900 dark:text-white">₹{numF(containersCost, 2)}</td>
                    </tr>
                    <tr className="border-b border-gray-200 dark:border-[#1b2e4a]">
                      <td className="px-3 py-2.5 font-semibold text-gray-700 dark:text-gray-300">Packaging & Labeling</td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-gray-900 dark:text-white">₹{numF(pkgCostTotal, 2)}</td>
                    </tr>
                    <tr className="bg-gray-100 dark:bg-[#0f1a2e]">
                      <td className="px-3 py-2.5 font-bold text-gray-800 dark:text-gray-100">Subtotal</td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-gray-900 dark:text-white">₹{numF(subtotalBeforeMargin, 2)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-[#1b2e4a] mb-4 mt-4">
                <table className="w-full text-xs">
                  <tbody>
                    <tr className="border-b border-gray-200 dark:border-[#1b2e4a] bg-blue-50 dark:bg-blue-500/10">
                      <td className="px-3 py-2 font-semibold text-blue-700 dark:text-blue-300">Formulation</td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-blue-700 dark:text-blue-300">₹{numF(totalFormCost, 2)}</td>
                    </tr>
                    <tr className="border-b border-gray-200 dark:border-[#1b2e4a]">
                      <td className="px-3 py-2 font-semibold text-gray-700 dark:text-gray-300">Production Overhead</td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-gray-900 dark:text-white">₹{numF(totalOverhead, 2)}</td>
                    </tr>
                    <tr className="border-b border-gray-200 dark:border-[#1b2e4a]">
                      <td className="px-3 py-2 font-semibold text-gray-700 dark:text-gray-300">Standard Assumptions</td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-gray-900 dark:text-white">₹{numF(saAmount, 2)}</td>
                    </tr>
                    <tr className="border-b border-gray-200 dark:border-[#1b2e4a]">
                      <td className="px-3 py-2 font-semibold text-gray-700 dark:text-gray-300">Containers & Labeling</td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-gray-900 dark:text-white">₹{numF(containersCost, 2)}</td>
                    </tr>
                    <tr className="border-b border-gray-200 dark:border-[#1b2e4a]">
                      <td className="px-3 py-2 font-semibold text-gray-700 dark:text-gray-300">Packaging & Labeling</td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-gray-900 dark:text-white">₹{numF(pkgCostTotal, 2)}</td>
                    </tr>
                    <tr className="border-b border-gray-200 dark:border-[#1b2e4a] bg-amber-50 dark:bg-amber-500/10">
                      <td className="px-3 py-2 font-semibold text-amber-700 dark:text-amber-300">Subtotal (Before Margin)</td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-amber-700 dark:text-amber-300">₹{numF(subtotalBeforeMargin, 2)}</td>
                    </tr>
                    <tr className="border-b border-gray-200 dark:border-[#1b2e4a]">
                      <td className="px-3 py-2 font-semibold text-gray-700 dark:text-gray-300">Margin ({activeMarginType.toUpperCase()} {marginPercent}%)</td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-gray-900 dark:text-white">₹{numF(marginAmount, 2)}</td>
                    </tr>
                    <tr className="bg-slate-900 text-white">
                      <td className="px-3 py-2.5 font-bold">FINAL TOTAL</td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-amber-300 text-lg">₹{numF(subtotalWithMargin, 2)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

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

                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    checked={showQuoteGST}
                    onChange={e => setShowQuoteGST(e.target.checked)}
                    className="w-3 h-3"
                    id="quoteGSTChk"
                  />
                  <label htmlFor="quoteGSTChk" className="text-xs font-semibold text-gray-600 dark:text-gray-400 cursor-pointer">
                    Include GST (18%)
                  </label>
                </div>

                {showQuoteGST && (
                  <div className="flex justify-between items-center text-sm py-2 px-2 bg-amber-50 dark:bg-amber-500/10 rounded border border-amber-200 dark:border-amber-800/40">
                    <p className="font-semibold text-amber-700 dark:text-amber-300">Final with GST:</p>
                    <p className="font-mono font-bold text-amber-700 dark:text-amber-300">₹{numF(finalAmount, 2)}</p>
                  </div>
                )}
              </div>

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
          const costBreakdown = batchCost.totalAll || 0;

          const containersTotal = (form.containers || []).reduce((s, item) => {
            const batchQtyInBaseUnit = convertToBaseUnit(selectedBatch, batchUnit);
            const containerWeightInBaseUnit = convertToBaseUnit(Number(item.weight) || 0, item.unit || 'g');
            const costPerPiece = Number(item.costPerPiece) || 0;
            const unitsNeeded = containerWeightInBaseUnit > 0 ? batchQtyInBaseUnit / containerWeightInBaseUnit : 0;
            const itemCost = unitsNeeded * costPerPiece;
            return s + itemCost;
          }, 0);

          const pkgItems = form.packaging?.items || [];
          const pkgCharges = form.packaging?.charges || {};
          const packagingTotal = pkgItems.reduce((s, i) => s + (Number(i.amount) || Number(i.qty) * Number(i.rate) || 0), 0) + Number(pkgCharges.machine || 0) + Number(pkgCharges.shrinkWrap || 0) + Number(pkgCharges.other || 0);

          const subtotal = costBreakdown + containersTotal + packagingTotal;
          const withGST = showFinalGST ? subtotal * 1.18 : subtotal;

          return (
            <div className="space-y-2 p-3 bg-gray-50 dark:bg-[#0f1a2e] rounded-lg">
              <div className="flex justify-between text-xs"><span className="text-gray-600 dark:text-gray-400">Cost Breakdown:</span><span className="font-mono font-semibold">₹{numF(costBreakdown)}</span></div>
              <div className="flex justify-between text-xs"><span className="text-gray-600 dark:text-gray-400">Containers:</span><span className="font-mono font-semibold">₹{numF(containersTotal)}</span></div>
              <div className="flex justify-between text-xs"><span className="text-gray-600 dark:text-gray-400">Packaging:</span><span className="font-mono font-semibold">₹{numF(packagingTotal)}</span></div>
              <div className="border-t border-gray-200 dark:border-[#1b2e4a] pt-2 flex justify-between text-sm font-bold">
                <span className="text-gray-700 dark:text-gray-200">Subtotal:</span>
                <span className="font-mono">₹{numF(subtotal)}</span>
              </div>
              {showFinalGST && (
                <div className="flex justify-between text-xs bg-amber-50 dark:bg-amber-500/10 -mx-3 -mb-3 px-3 py-2 rounded-b-lg border-t border-amber-200 dark:border-amber-800/40">
                  <span className="text-amber-700 dark:text-amber-300 font-semibold">With GST (18%):</span>
                  <span className="font-mono font-bold text-amber-700 dark:text-amber-300">₹{numF(withGST)}</span>
                </div>
              )}
              <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-200 dark:border-[#1b2e4a]">
                <input
                  type="checkbox"
                  checked={showFinalGST}
                  onChange={e => setShowFinalGST(e.target.checked)}
                  className="w-3 h-3"
                  id="finalGSTChk"
                />
                <label htmlFor="finalGSTChk" className="text-xs font-semibold text-gray-600 dark:text-gray-400 cursor-pointer">
                  Include GST (18%)
                </label>
              </div>
            </div>
          );
        })()}
        {!selectedBatch && <p className="text-xs text-gray-400">Enter batch quantity to see cost breakdown</p>}
      </div>
    </div>
  );
}
