import React, { useState } from 'react';
import { Factory, Star } from 'lucide-react';
import RndOverheadsTab from './RndOverheadsTab';
import CostingPackagingTab from './CostingPackagingTab';

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

export default function ProductOverheadsTab({ product, form, setForm, onSaveProductionOverheads, onSavePackaging, onSaveVariants, onSaveCosting, isPending }) {
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [batchUnit, setBatchUnit] = useState('g');
  const [roundToNearest100, setRoundToNearest100] = useState(false);
  const [showContainerGST, setShowContainerGST] = useState(false);

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
      const cost = (Number(r.costPerKg) || 0) * qty / 1000;
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
    const totalOverheadForBatch = overheadTotal * units;
    const totalSAForBatch = saAmount * units;
    const totalRndForBatch = rndPerUnit * units;
    return {
      totalOverhead: totalOverheadForBatch,
      totalSA: totalSAForBatch,
      totalRnd: totalRndForBatch,
      totalAll: totalOverheadForBatch + totalSAForBatch + totalRndForBatch,
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
          <p className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-4 flex items-center gap-1.5"><Factory size={14} />Containers & Labeling</p>
          <div className="space-y-3">
            {(form.containers || []).map((item, idx) => {
              const batchSize = selectedBatch || 1000;
              const amount = (Number(item.grams) || 0) * (Number(item.pricePerGram) || 0);
              const amountWithGST = showContainerGST ? amount * 1.18 : amount;
              return (
                <div key={idx} className="flex gap-3 items-end border border-gray-200 dark:border-[#1b2e4a] rounded-lg p-3">
                  <div className="flex-1"><label className="label text-xs">Item Name</label><input type="text" value={item.name || ''} onChange={e => { const c = [...(form.containers || [])]; c[idx].name = e.target.value; setForm(f => ({ ...f, containers: c })); }} className="input text-xs w-full" placeholder="e.g., Bottle, Label, Cap" /></div>
                  <div className="w-24"><label className="label text-xs">Grams/Batch</label><input type="number" step="0.1" value={item.grams || ''} onChange={e => { const c = [...(form.containers || [])]; c[idx].grams = Number(e.target.value) || 0; setForm(f => ({ ...f, containers: c })); }} className="input text-xs" /></div>
                  <div className="w-20"><label className="label text-xs">₹/gram</label><input type="number" step="0.01" value={item.pricePerGram || ''} onChange={e => { const c = [...(form.containers || [])]; c[idx].pricePerGram = Number(e.target.value) || 0; setForm(f => ({ ...f, containers: c })); }} className="input text-xs" /></div>
                  <div className="w-20"><label className="label text-xs">Amount</label><input type="text" readOnly value={numF(amountWithGST)} className="input text-xs bg-gray-50 dark:bg-[#0f1a2e] font-mono font-bold" /></div>
                  <button onClick={() => setForm(f => ({ ...f, containers: (f.containers || []).filter((_, i) => i !== idx) }))} className="text-red-500 hover:text-red-700 mb-1">✕</button>
                </div>
              );
            })}
            <button onClick={() => setForm(f => ({ ...f, containers: [...(f.containers || []), { name: '', grams: 0, pricePerGram: 0 }] }))} className="btn-secondary text-sm w-full">+ Add Container Item</button>
          </div>
          <div className="flex items-center gap-2 mt-3 p-2 bg-gray-50 dark:bg-[#0f1a2e] rounded">
            <input type="checkbox" checked={showContainerGST} onChange={e => setShowContainerGST(e.target.checked)} id="containerGST" className="w-4 h-4" />
            <label htmlFor="containerGST" className="text-xs font-semibold text-gray-700 dark:text-gray-200 cursor-pointer">Include GST (18%)</label>
          </div>
          <div className="mt-3 p-3 bg-slate-900 text-white rounded-lg text-sm font-bold flex justify-between">
            <span>Total Containers Cost:</span>
            <span>₹{numF((form.containers || []).reduce((s, item) => s + (Number(item.grams) || 0) * (Number(item.pricePerGram) || 0) * (showContainerGST ? 1.18 : 1), 0))}</span>
          </div>
        </div>

        <hr className="border-gray-100 dark:border-[#1b2e4a]" />

        <div>
          <CostingPackagingTab
            product={product}
            form={form}
            setForm={setForm}
            isPending={isPending}
            onSavePackaging={onSavePackaging}
            onSaveVariants={onSaveVariants}
            onSaveCosting={onSaveCosting}
          />
        </div>
      </div>

      {/* RIGHT COLUMN: Sticky Quote Summary */}
      <div className="lg:sticky lg:top-20 h-fit">
        <p className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-4 flex items-center gap-1.5"><Star size={14} fill="currentColor" />Final: Quote Summary</p>
        {(() => {
          const q = calculateQuoteSummary();
          return (
            <>
              <div className="bg-slate-900 text-white rounded-2xl px-6 py-4 mb-4">
                <p className="text-xs font-semibold text-slate-400 mb-2">QUOTE THIS AMOUNT (ONE-TIME)</p>
                <p className="text-4xl font-bold text-amber-300 mb-1">₹{numF(q.finalAmount)}</p>
                <p className="text-xs text-slate-400">raw ₹{numF(q.finalAmount - (q.finalAmount - (q.subtotalPerUnit + q.safetyBuffer)))} — rounded to nearest ₹100</p>
              </div>

              <div className="flex items-center gap-2 mb-4 p-3 bg-gray-50 dark:bg-[#0f1a2e] rounded-lg">
                <input
                  type="checkbox"
                  checked={roundToNearest100}
                  onChange={e => setRoundToNearest100(e.target.checked)}
                  className="w-4 h-4"
                  id="roundChk"
                />
                <label htmlFor="roundChk" className="text-xs font-semibold text-gray-700 dark:text-gray-200 cursor-pointer">
                  Round fee to nearest ₹100 (looks cleaner)
                </label>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center text-sm py-2 border-b border-gray-200 dark:border-[#1b2e4a]">
                  <div>
                    <p className="font-semibold text-gray-700 dark:text-gray-200">Ingredients Cost</p>
                    <p className="text-xs text-gray-400">from formulation</p>
                  </div>
                  <p className="font-mono font-bold text-gray-900 dark:text-white">₹{numF(q.formCost)}</p>
                </div>

                <div className="flex justify-between items-center text-sm py-2 border-b border-gray-200 dark:border-[#1b2e4a]">
                  <div>
                    <p className="font-semibold text-gray-700 dark:text-gray-200">Production Overhead</p>
                    <p className="text-xs text-gray-400">per unit</p>
                  </div>
                  <p className="font-mono font-bold text-gray-900 dark:text-white">₹{numF(q.overheadPerUnit, 4)}</p>
                </div>

                <div className="flex justify-between items-center text-sm py-2 border-b border-gray-200 dark:border-[#1b2e4a]">
                  <div>
                    <p className="font-semibold text-gray-700 dark:text-gray-200">Standard Assumptions</p>
                    <p className="text-xs text-gray-400">equipment, consumables, storage, etc.</p>
                  </div>
                  <p className="font-mono font-bold text-gray-900 dark:text-white">₹{numF(q.saAmount, 4)}</p>
                </div>

                <div className="flex justify-between items-center text-sm py-2 border-b border-gray-200 dark:border-[#1b2e4a]">
                  <div>
                    <p className="font-semibold text-gray-700 dark:text-gray-200">R&D Cost</p>
                    <p className="text-xs text-gray-400">per unit</p>
                  </div>
                  <p className="font-mono font-bold text-gray-900 dark:text-white">₹{numF(q.rndPerUnit, 4)}</p>
                </div>

                <div className="flex justify-between items-center text-sm py-2 border-b border-gray-200 dark:border-[#1b2e4a]">
                  <div>
                    <p className="font-semibold text-gray-700 dark:text-gray-200">Packaging Cost</p>
                    <p className="text-xs text-gray-400">materials & charges</p>
                  </div>
                  <p className="font-mono font-bold text-gray-900 dark:text-white">₹{numF(q.pkgCost, 4)}</p>
                </div>

                <div className="flex justify-between items-center text-sm py-3 bg-gray-100 dark:bg-[#0f1a2e] px-3 rounded-lg font-bold">
                  <p className="text-gray-700 dark:text-gray-200">Subtotal (all costs)</p>
                  <p className="font-mono text-gray-900 dark:text-white">₹{numF(q.subtotalPerUnit)}</p>
                </div>

                <div className="flex justify-between items-center text-sm py-2 border-b border-gray-200 dark:border-[#1b2e4a]">
                  <div>
                    <p className="font-semibold text-gray-700 dark:text-gray-200">Safety Buffer</p>
                    <p className="text-xs text-gray-400">10% on subtotal</p>
                  </div>
                  <p className="font-mono font-bold text-gray-900 dark:text-white">₹{numF(q.safetyBuffer)}</p>
                </div>
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}
