import React from 'react';
import { Save, X } from 'lucide-react';

function numF(v, d = 2) { return Number(v || 0).toFixed(d); }

export default function PackagingTab({ product, form, setForm, onSave, isPending }) {
  const items = form.packaging?.items || [];
  const charges = form.packaging?.charges || {};
  const totalPkg = items.reduce((s, i) => s + (Number(i.amount) || Number(i.qty) * Number(i.rate) || 0), 0) + Number(charges.machine || 0) + Number(charges.shrinkWrap || 0) + Number(charges.other || 0);

  function updateItem(i, f, v) { setForm(prev => { const it = [...(prev.packaging?.items || [])]; it[i] = { ...it[i], [f]: v }; return { ...prev, packaging: { ...prev.packaging, items: it } }; }); }
  function removeItem(i) { setForm(prev => ({ ...prev, packaging: { ...prev.packaging, items: prev.packaging?.items?.filter((_, idx) => idx !== i) } })); }
  function addItem() { setForm(prev => ({ ...prev, packaging: { ...prev.packaging, items: [...(prev.packaging?.items || []), { name: '', qty: 1, rate: 0, amount: 0, optional: false }] } })); }
  function setCharge(f, v) { setForm(prev => ({ ...prev, packaging: { ...prev.packaging, charges: { ...prev.packaging?.charges, [f]: Number(v) } } })); }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-[#1b2e4a]">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 dark:bg-[#0f1a2e]">
            <tr>{['Item', 'Qty', 'Rate (₹)', 'Amount (₹)', 'Optional', ''].map(h => <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500">{h}</th>)}</tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i} className="border-t border-gray-100 dark:border-[#1b2e4a]">
                <td className="px-2 py-1.5"><input value={item.name} onChange={e => updateItem(i, 'name', e.target.value)} className="input text-xs w-32" /></td>
                <td className="px-2 py-1.5"><input type="number" value={item.qty} onChange={e => updateItem(i, 'qty', Number(e.target.value))} className="input text-xs w-14" /></td>
                <td className="px-2 py-1.5"><input type="number" value={item.rate} onChange={e => updateItem(i, 'rate', Number(e.target.value))} className="input text-xs w-20" /></td>
                <td className="px-2 py-1.5"><input type="number" value={item.amount || item.qty * item.rate} onChange={e => updateItem(i, 'amount', Number(e.target.value))} className="input text-xs w-20" /></td>
                <td className="px-2 py-1.5"><input type="checkbox" checked={item.optional} onChange={e => updateItem(i, 'optional', e.target.checked)} className="w-4 h-4" /></td>
                <td className="px-2 py-1.5"><button onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600"><X size={13} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[['machine', 'Machine Charges'], ['shrinkWrap', 'Shrink Wrap'], ['other', 'Other']].map(([f, label]) => (
          <div key={f}><label className="label">{label} (₹)</label><input type="number" value={charges[f] || 0} onChange={e => setCharge(f, e.target.value)} className="input" /></div>
        ))}
      </div>
      <div className="rounded-lg bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800/30 px-4 py-2">
        <p className="text-xs font-semibold text-green-700 dark:text-green-400">Total Packaging Cost: ₹{numF(totalPkg)}</p>
      </div>
      <div className="flex gap-3">
        <button onClick={addItem} className="btn-secondary text-sm">+ Add Item</button>
        <button onClick={onSave} disabled={isPending} className="btn-primary text-sm disabled:opacity-50 ml-auto">{isPending ? 'Saving…' : <><Save size={13} className="inline -mt-0.5 mr-1" />Save Packaging</>}</button>
      </div>
    </div>
  );
}
