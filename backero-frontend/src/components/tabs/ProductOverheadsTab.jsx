import React, { useState } from 'react';
import { Factory } from 'lucide-react';
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

  return (
    <div className="space-y-8">
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
    </div>
  );
}
