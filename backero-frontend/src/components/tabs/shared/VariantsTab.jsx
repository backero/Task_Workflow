import React from 'react';
import { Save, X } from 'lucide-react';

const UNITS = ['ml', 'g', 'kg', 'L', 'pcs', 'oz'];

export default function VariantsTab({ product, form, setForm, onSave, isPending }) {
  const variants = form.variants || [];

  function addVariant() {
    setForm(f => ({ ...f, variants: [...(f.variants || []), { name: '', weight: 0, unit: product.unit || 'ml', stock: 0, stockUnit: 'pcs', mrp: 0, sellingPrice: 0, b2bPrice: 0, costPrice: 0, size: 0, moq: 0, moqUnit: 'pcs' }] }));
  }
  function updateV(i, field, val) {
    setForm(f => { const v = [...(f.variants || [])]; v[i] = { ...v[i], [field]: val }; return { ...f, variants: v }; });
  }
  function removeV(i) { setForm(f => ({ ...f, variants: (f.variants || []).filter((_, idx) => idx !== i) })); }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-[#1b2e4a]">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 dark:bg-[#0f1a2e]">
            <tr>
              {['Variant', 'Weight', 'Unit', 'Size', 'Stock', 'MOQ', 'MOQ Unit', 'MRP (₹)', 'Selling (₹)', 'B2B (₹)', ''].map(h => (
                <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500 dark:text-gray-400">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {variants.map((v, i) => (
              <tr key={i} className="border-t border-gray-100 dark:border-[#1b2e4a]">
                <td className="px-2 py-1.5"><input value={v.name} onChange={e => updateV(i, 'name', e.target.value)} className="input text-xs w-24" placeholder="100ml" /></td>
                <td className="px-2 py-1.5"><input type="number" value={v.weight} onChange={e => updateV(i, 'weight', e.target.value)} className="input text-xs w-16" /></td>
                <td className="px-2 py-1.5">
                  <select value={v.unit} onChange={e => updateV(i, 'unit', e.target.value)} className="input text-xs w-14">
                    {UNITS.map(u => <option key={u}>{u}</option>)}
                  </select>
                </td>
                <td className="px-2 py-1.5"><input type="number" value={v.size ?? 0} onChange={e => updateV(i, 'size', e.target.value)} className="input text-xs w-16" placeholder="Size" /></td>
                <td className="px-2 py-1.5"><input type="number" value={v.stock} onChange={e => updateV(i, 'stock', e.target.value)} className="input text-xs w-16" /></td>
                <td className="px-2 py-1.5"><input type="number" value={v.moq ?? 0} onChange={e => updateV(i, 'moq', e.target.value)} className="input text-xs w-16" placeholder="MOQ" /></td>
                <td className="px-2 py-1.5"><input value={v.moqUnit ?? 'pcs'} onChange={e => updateV(i, 'moqUnit', e.target.value)} className="input text-xs w-16" placeholder="pcs" /></td>
                <td className="px-2 py-1.5"><input type="number" value={v.mrp} onChange={e => updateV(i, 'mrp', e.target.value)} className="input text-xs w-20" /></td>
                <td className="px-2 py-1.5"><input type="number" value={v.sellingPrice} onChange={e => updateV(i, 'sellingPrice', e.target.value)} className="input text-xs w-20" /></td>
                <td className="px-2 py-1.5"><input type="number" value={v.b2bPrice} onChange={e => updateV(i, 'b2bPrice', e.target.value)} className="input text-xs w-20" /></td>
                <td className="px-2 py-1.5"><button onClick={() => removeV(i)} className="text-red-400 hover:text-red-600"><X size={13} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!variants.length && <p className="text-xs text-gray-400 text-center py-6">No variants yet — add sizes below</p>}
      </div>
      <div className="flex gap-3">
        <button onClick={addVariant} className="btn-secondary text-sm">+ Add Variant</button>
        <button onClick={onSave} disabled={isPending} className="btn-primary text-sm disabled:opacity-50 ml-auto">{isPending ? 'Saving…' : <><Save size={13} className="inline -mt-0.5 mr-1" />Save Variants</>}</button>
      </div>
    </div>
  );
}
