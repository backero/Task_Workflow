import React, { useState } from 'react';
import { Save, BarChart3, IndianRupee } from 'lucide-react';
import { clsx } from 'clsx';

function numF(v, d = 2) { return Number(v || 0).toFixed(d); }

function calcOverheadBreakdown(p) {
  const fm = p.formulation || {};
  const po = p.productionOverhead || {};
  const sa = p.standardAssumptions || {};
  const rnd = p.rndDoc || {};
  const pkg = p.packaging || {};
  const refW = Number(fm.refWeight) || 100;

  const formCost = (fm.rows || []).reduce((s, r) => {
    const qty = refW * (Number(r.percentage) || 0) / 100 * (Number(r.convFactor) || 1);
    const cost = (Number(r.costPerKg) || 0) * qty / 1000;
    return s + cost;
  }, 0);

  const pkgItems = pkg.items || [];
  const pkgCharges = pkg.charges || {};
  const pkgCost = pkgItems.reduce((s, i) => s + (Number(i.amount) || Number(i.qty) * Number(i.rate) || 0), 0) + Number(pkgCharges.machine || 0) + Number(pkgCharges.shrinkWrap || 0) + Number(pkgCharges.other || 0);

  const overheadTotal = Number(po.electricity || 0) + Number(po.labor || 0) + Number(po.labTesting || 0) + Number(po.other || 0);
  const overheadPerUnit = refW > 0 ? overheadTotal / refW : 0;

  const saPct = [sa.equipmentPct, sa.consumablesPct, sa.storagePct, sa.housekeepingPct, sa.adminPct, sa.wastagePct].reduce((s, v) => s + (Number(v) || 0), 0);
  const saAmount = formCost * (saPct / 100);

  const rndCost = Number(rnd.cost || rnd.investmentHours || 0);
  const rndPerUnit = refW > 0 ? rndCost / refW : 0;

  return {
    formCost, pkgCost, overheadTotal, overheadPerUnit, saPct, saAmount, rndCost, rndPerUnit, refW
  };
}

function HighlightStrip({ items, tone = 'light' }) {
  const isDark = tone === 'dark';
  return (
    <div className={clsx('grid gap-4 rounded-xl p-4', isDark ? 'bg-slate-900 text-white' : 'border border-gray-200 dark:border-[#1b2e4a]')}
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0,1fr))` }}>
      {items.map((it, i) => (
        <div key={i}>
          <p className={clsx('text-[11px] mb-1', isDark ? 'text-white/70' : 'text-gray-400')}>{it.label}</p>
          <p className={clsx('font-bold', it.big ? 'text-xl' : 'text-base', isDark ? (it.accent ? 'text-amber-300' : 'text-white') : 'text-gray-800 dark:text-gray-100')}>{it.value}</p>
        </div>
      ))}
    </div>
  );
}

export default function CostingTab({ product, form, setForm, onSave, isPending }) {
  const merged = { ...product, ...form };
  const b = calcOverheadBreakdown(merged);
  const totalInputPerUnit = b.formCost + b.saAmount + b.overheadPerUnit + b.rndPerUnit;
  const costPerUnit = totalInputPerUnit + b.pkgCost;
  const margins = form.costing?.margins || {};
  const variants = form.variants || [];
  const [showGST, setShowGST] = useState(false);
  const gstRate = (form.gstRate || 0) / 100;

  function setMargin(f, v) { setForm(prev => ({ ...prev, costing: { ...prev.costing, margins: { ...prev.costing?.margins, [f]: Number(v) } } })); }

  function computeVariantPricing(v) {
    const refW = b.refW || 1;
    const sizeRatio = refW > 0 && Number(v.size) > 0 ? Number(v.size) / refW : 1;
    const productionCost = costPerUnit * sizeRatio;
    const exFactory = productionCost * (1 + (Number(margins.exFactory) || 0) / 100);
    const dealer = exFactory * (1 + (Number(margins.dealer) || 0) / 100);
    const distributor = dealer * (1 + (Number(margins.distributor) || 0) / 100);
    const retailer = distributor * (1 + (Number(margins.retailer) || 0) / 100);
    const selling = retailer * (1 + (Number(margins.selling) || 0) / 100);
    const b2b = productionCost * (1 + (Number(margins.b2b) || 0) / 100);
    const b2c = productionCost * (1 + (Number(margins.b2c) || 0) / 100);
    return { productionCost, exFactory, dealer, distributor, retailer, selling, b2b, b2c };
  }

  const firstVariantPricing = variants.length ? computeVariantPricing(variants[0]) : null;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-bold text-gray-600 dark:text-gray-300 mb-2 flex items-center gap-1"><BarChart3 size={12} />Unit Cost Summary</p>
        <HighlightStrip tone="dark" items={[
          { label: 'Ingredients', value: `₹${numF(b.formCost)}` },
          { label: 'Packaging', value: `₹${numF(b.pkgCost)}` },
          { label: 'Overhead', value: `₹${numF(b.overheadPerUnit)}` },
          { label: 'R&D Per Unit', value: `₹${numF(b.saAmount)}` },
          { label: 'Grand Total / Unit', value: `₹${numF(costPerUnit)}`, big: true, accent: true },
        ]} />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-gray-600 dark:text-gray-300">
          <input type="checkbox" checked={showGST} onChange={e => setShowGST(e.target.checked)} className="w-4 h-4" />
          Show GST Inclusive Prices
        </label>
        <span className="text-[11px] text-gray-400">GST Rate: {form.gstRate || 0}%</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-[#1b2e4a]">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 dark:bg-[#0f1a2e]">
            <tr>{['Variant', 'Size', 'Unit', 'MOQ', 'MOQ Unit', 'Prod. Cost', 'Ex-Factory', 'Dealer', 'Dist.', 'Retail', 'Selling', 'B2B', 'B2C'].map(h => <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500 dark:text-gray-400 whitespace-nowrap">{h}</th>)}</tr>
          </thead>
          <tbody>
            {variants.map((v, i) => {
              const p = computeVariantPricing(v);
              const isRef = Math.abs(Number(v.size) - b.refW) < 0.001;
              return (
                <tr key={i} className={clsx('border-t border-gray-100 dark:border-[#1b2e4a]', isRef && 'bg-amber-50/60 dark:bg-amber-500/5')}>
                  <td className="px-3 py-1.5 font-semibold whitespace-nowrap">{v.name || '—'}{isRef && <span className="ml-1 text-amber-500" title="Reference weight">⭐</span>}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{v.size ?? 0}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{v.unit}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{v.moq ?? 0}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{v.moqUnit || 'pcs'}</td>
                  <td className="px-3 py-1.5 font-mono">₹{numF(p.productionCost)}</td>
                  <td className="px-3 py-1.5 font-mono">₹{numF(p.exFactory)}</td>
                  <td className="px-3 py-1.5 font-mono">₹{numF(p.dealer)}</td>
                  <td className="px-3 py-1.5 font-mono">₹{numF(p.distributor)}</td>
                  <td className="px-3 py-1.5 font-mono">₹{numF(p.retailer)}</td>
                  <td className="px-3 py-1.5 font-mono font-semibold">₹{numF(p.selling)}</td>
                  <td className="px-3 py-1.5 font-mono">₹{numF(p.b2b)}</td>
                  <td className="px-3 py-1.5 font-mono">₹{numF(p.b2c)}</td>
                </tr>
              );
            })}
            {!variants.length && <tr><td colSpan={13} className="px-3 py-6 text-center text-gray-400">No variants. Add sizes in the Variants tab.</td></tr>}
          </tbody>
        </table>
      </div>

      {showGST && firstVariantPricing && (
        <div className="rounded-xl border border-gray-200 dark:border-[#1b2e4a] p-4">
          <p className="text-xs font-bold text-gray-600 dark:text-gray-300 mb-3 flex items-center gap-1"><IndianRupee size={12} />GST Inclusive Prices (First Variant)</p>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="flex justify-between"><span className="text-gray-500">Ex-Factory (with GST)</span><span className="font-mono font-semibold">₹{numF(firstVariantPricing.exFactory * (1 + gstRate))}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Selling (with GST)</span><span className="font-mono font-semibold">₹{numF(firstVariantPricing.selling * (1 + gstRate))}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">B2C (with GST)</span><span className="font-mono font-semibold">₹{numF(firstVariantPricing.b2c * (1 + gstRate))}</span></div>
          </div>
          <p className="text-[10px] text-gray-400 mt-2">All calculations are done without GST. GST is added only for display purposes at the selected rate.</p>
        </div>
      )}

      <button onClick={onSave} disabled={isPending} className="btn-primary text-sm disabled:opacity-50">{isPending ? 'Saving…' : <><Save size={13} className="inline -mt-0.5 mr-1" />Save Costing</>}</button>
    </div>
  );
}
