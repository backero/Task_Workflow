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
  const [roundToNearest100, setRoundToNearest100] = useState(false);

  const calculateBatchCost = (batchQtyGrams) => {
    const b = { ...product, ...form };
    const fm = b.formulation || {};
    const po = b.productionOverhead || {};
    const sa = b.standardAssumptions || {};
    const rnd = b.rndDoc || {};
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

    const rndCost = Number(rnd.cost || rnd.investmentHours || 0);
    const rndPerUnit = refW > 0 ? rndCost / refW : 0;

    const units = batchQtyGrams / refW;
    const totalOverheadForBatch = overheadTotal * units;
    const totalSAForBatch = saAmount * units;
    const totalRndForBatch = rndPerUnit * units;
    return {
      totalOverhead: totalOverheadForBatch,
      totalSA: totalSAForBatch,
      totalRnd: totalRndForBatch,
      totalAll: totalOverheadForBatch + totalSAForBatch + totalRndForBatch,
      units
    };
  };

  const calculateQuoteSummary = () => {
    const b = { ...product, ...form };
    const fm = b.formulation || {};
    const po = b.productionOverhead || {};
    const sa = b.standardAssumptions || {};
    const rnd = b.rndDoc || {};
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

    const rndCost = Number(rnd.cost || rnd.investmentHours || 0);
    const rndPerUnit = refW > 0 ? rndCost / refW : 0;

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
    const cost = (Number(r.costPerKg) || 0) * qty / 1000;
    return s + cost;
  }, 0);
  const perUnit = refW > 0 ? formCost / refW : 0;

  return (
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
        <div className="mb-4">
          <label className="label">Enter Batch Quantity (grams)</label>
          <input
            type="number"
            min="0"
            step="100"
            value={selectedBatch || ''}
            onChange={e => setSelectedBatch(e.target.value ? Number(e.target.value) : null)}
            className="input text-sm w-full"
            placeholder="Enter quantity in grams (e.g., 3000, 5000, 10000)"
          />
        </div>
        {selectedBatch && (() => {
          const batchCost = calculateBatchCost(selectedBatch);
          return (
            <HighlightStrip tone="dark" items={[
              { label: `Batch Size`, value: `${(selectedBatch / 1000).toFixed(2)}g` },
              { label: 'Overhead Cost', value: `₹${numF(batchCost.totalOverhead)}` },
              { label: 'Standard Assumptions', value: `₹${numF(batchCost.totalSA)}` },
              { label: 'Total Batch Cost', value: `₹${numF(batchCost.totalAll)}`, big: true, accent: true },
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

      <hr className="border-gray-100 dark:border-[#1b2e4a]" />

      <div>
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
