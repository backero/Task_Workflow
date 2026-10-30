import React, { useState } from 'react';
import { Factory, FileEdit, TriangleAlert } from 'lucide-react';

function numF(v, d = 2) { return Number(v || 0).toFixed(d); }

function calcOverheadBreakdown(p) {
  const fm = p.formulation || {};
  const po = p.productionOverhead || {};
  const sa = p.standardAssumptions || {};
  const rnd = p.rnd || {};
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

  return { formCost, overheadTotal, overheadPerUnit, saPct, saAmount, rndTotal, rndPerUnit, refW };
}

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

const ASSUMPTION_FIELDS = [
  { key: 'equipmentPct', label: 'Equipment (Mold/Tools)', max: 20, hint: '3-5% recommended' },
  { key: 'consumablesPct', label: 'Consumables (Small/MSME)', max: 10, hint: '1-2% recommended' },
  { key: 'storagePct', label: 'Storage (Warehouse)', max: 10, hint: '2-4% recommended' },
  { key: 'housekeepingPct', label: 'Housekeeping (Sanitization)', max: 10, hint: '1-2% recommended' },
  { key: 'adminPct', label: 'Admin (Admin STD)', max: 20, hint: '5-8% recommended' },
  { key: 'wastagePct', label: 'Wastage (Production)', max: 10, hint: '2-5% recommended' },
];

export default function RndOverheadsTab({ product, form, setForm, onSave, isPending }) {
  const [selectedBatch, setSelectedBatch] = useState(null);
  const po = form.productionOverhead || {};
  const sa = form.standardAssumptions || {};
  const b = calcOverheadBreakdown({ ...product, ...form });

  const BATCH_SIZES = [
    { label: '3kg', value: 3000 },
    { label: '5kg', value: 5000 },
    { label: '7kg', value: 7000 },
    { label: '10kg', value: 10000 },
  ];

  const calculateBatchCost = (batchQtyGrams) => {
    const refW = b.refW || 100;
    const units = batchQtyGrams / refW;
    const totalOverheadForBatch = b.overheadTotal * units;
    const totalSAForBatch = b.saAmount * units;
    const totalRndForBatch = b.rndPerUnit * units;
    return {
      totalOverhead: totalOverheadForBatch,
      totalSA: totalSAForBatch,
      totalRnd: totalRndForBatch,
      totalAll: totalOverheadForBatch + totalSAForBatch + totalRndForBatch,
      units
    };
  };

  function setPO(f, v) { setForm(prev => ({ ...prev, productionOverhead: { ...prev.productionOverhead, [f]: v } })); }
  function setSA(f, v) { setForm(prev => ({ ...prev, standardAssumptions: { ...prev.standardAssumptions, [f]: v } })); }

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-3">
          <p className="text-sm font-bold text-gray-700 dark:text-gray-200 flex items-center gap-1.5"><Factory size={14} />Production Overhead</p>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-4">
          {[['electricity', 'Electricity (₹)'], ['labor', 'Production Labor (₹)'], ['labTesting', 'Lab Testing Cost (₹)'], ['other', 'Other Production Overhead (₹)']].map(([f, label]) => (
            <div key={f}><label className="label">{label}</label><input type="number" min="0" step="0.01" value={po[f] || 0} onChange={e => setPO(f, Number(e.target.value))} className="input text-xs w-full" /></div>
          ))}
        </div>
        <HighlightStrip items={[
          { label: 'Total Production Overhead', value: `₹${numF(b.overheadTotal)}` },
          { label: 'Per Unit', value: `₹${numF(b.overheadPerUnit, 4)}`, big: true },
          { label: 'Reference Weight', value: b.refW ? `${b.refW} ${form.formulation?.refUnit || form.unit || ''}` : '—' },
        ]} />
      </div>

      <hr className="border-gray-100 dark:border-[#1b2e4a]" />

      <div>
        <p className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-3 flex items-center gap-1.5"><FileEdit size={14} />Standard Assumptions (Industry STD%)</p>
        <div className="grid grid-cols-3 gap-4 mb-4">
          {ASSUMPTION_FIELDS.map(({ key, label, max, hint }) => (
            <div key={key}>
              <label className="label">{label} <span className="text-gray-400">%</span></label>
              <div className="flex items-center gap-2">
                <input type="range" min="0" max={max} step="0.5" value={sa[key] ?? 0} onChange={e => setSA(key, Number(e.target.value))} className="flex-1" />
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 w-10 text-right">{sa[key] ?? 0}%</span>
              </div>
              <p className="text-[10px] text-gray-400 mt-0.5">{hint}</p>
            </div>
          ))}
        </div>
        <div className="bg-slate-900 text-white rounded-xl px-6 py-4 mb-4 grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-slate-400 mb-1">Total Assumption %</p>
            <p className="text-lg font-bold">{b.saPct}%</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-1">Total Amount</p>
            <p className="text-lg font-bold text-amber-300">₹{numF(b.saAmount)}</p>
          </div>
        </div>
        {(b.saPct < 15 || b.saPct > 30) && (
          <div className="mt-3 flex items-start gap-2 text-xs bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40 rounded-lg px-3 py-2">
            <TriangleAlert size={13} /><span>Industry range for total indirect: 15% – 30%. Adjust sliders if your total is outside this range.</span>
          </div>
        )}
      </div>

    </div>
  );
}
