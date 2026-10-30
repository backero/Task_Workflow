import React, { useState, useEffect } from 'react';
import { Save, Copy, Trash2, Download, X } from 'lucide-react';
import toast from 'react-hot-toast';

function numF(v, d = 2) { return Number(v || 0).toFixed(d); }

export default function SavedQuotes({ productId, form, setForm, onLoad, selectedBatch, batchUnit }) {
  const [quotes, setQuotes] = useState([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [quoteName, setQuoteName] = useState('');

  useEffect(() => {
    const savedQuotes = localStorage.getItem(`quotes_${productId}`);
    if (savedQuotes) {
      try {
        setQuotes(JSON.parse(savedQuotes));
      } catch (e) {
        console.error('Failed to load quotes:', e);
      }
    }
  }, [productId]);

  const saveQuote = () => {
    if (!quoteName.trim()) {
      toast.error('Please enter a quote name');
      return;
    }

    const newQuote = {
      id: Date.now(),
      name: quoteName,
      date: new Date().toLocaleDateString('en-IN'),
      data: form,
      total: calculateTotal(form)
    };

    const updated = [...quotes, newQuote];
    setQuotes(updated);
    localStorage.setItem(`quotes_${productId}`, JSON.stringify(updated));

    setQuoteName('');
    setShowSaveDialog(false);
    toast.success('Quote saved successfully');
  };

  const loadQuote = (quote) => {
    setForm(quote.data);
    if (onLoad) onLoad();
    toast.success(`Loaded quote: ${quote.name}`);
  };

  const copyQuote = (quote) => {
    const copied = {
      ...quote,
      id: Date.now(),
      name: `${quote.name} (Copy)`,
      date: new Date().toLocaleDateString('en-IN')
    };

    const updated = [...quotes, copied];
    setQuotes(updated);
    localStorage.setItem(`quotes_${productId}`, JSON.stringify(updated));
    toast.success('Quote copied');
  };

  const deleteQuote = (id) => {
    if (window.confirm('Delete this quote?')) {
      const updated = quotes.filter(q => q.id !== id);
      setQuotes(updated);
      localStorage.setItem(`quotes_${productId}`, JSON.stringify(updated));
      toast.success('Quote deleted');
    }
  };

  const convertToBaseUnit = (qty, unit) => {
    const conversions = { 'g': 1, 'kg': 1000, 'ml': 1, 'L': 1000, 'pcs': 1 };
    return qty * (conversions[unit] || 1);
  };

  const calculateTotal = (f) => {
    if (!selectedBatch || !batchUnit) return 0;

    const fm = f.formulation || {};
    const po = f.productionOverhead || {};
    const sa = f.standardAssumptions || {};
    const refW = Number(fm.refWeight) || 100;

    // Formulation cost
    const formCost = (fm.rows || []).reduce((s, r) => {
      const qty = refW * (Number(r.percentage) || 0) / 100 * (Number(r.convFactor) || 1);
      const cost = (Number(r.costPerKg) || 0) * qty / 1000;
      return s + cost;
    }, 0);

    const batchQtyBase = convertToBaseUnit(selectedBatch, batchUnit);
    const perUnitFormCost = refW > 0 ? formCost : 0;
    const totalFormCost = perUnitFormCost * (batchQtyBase / refW);

    // Production overhead (batch total, not per-unit)
    const totalOverheadCost = Number(po.electricity || 0) + Number(po.labor || 0) + Number(po.labTesting || 0) + Number(po.other || 0);

    // Standard Assumptions
    const saPct = [sa.equipmentPct, sa.consumablesPct, sa.storagePct, sa.housekeepingPct, sa.adminPct, sa.wastagePct].reduce((s, v) => s + (Number(v) || 0), 0);
    const saAmount = (perUnitFormCost + (totalOverheadCost / 100)) * (saPct / 100);

    // Containers
    const containersCost = (f.containers || []).reduce((s, item) => {
      const containerWtBase = convertToBaseUnit(Number(item.weight) || 0, item.unit || 'g');
      const pcsNeeded = containerWtBase > 0 ? Math.round(batchQtyBase / containerWtBase) : 0;
      const costPerPiece = Number(item.costPerPiece) || 0;
      const baseAmount = pcsNeeded * costPerPiece;
      const amount = item.gstIncluded ? baseAmount * 1.18 : baseAmount;
      return s + amount;
    }, 0);

    // Packaging
    const pkgItems = f.packaging?.items || [];
    const pkgCharges = f.packaging?.charges || {};
    const packagingTotal = pkgItems.reduce((s, i) => {
      const baseAmount = Number(i.qty) * Number(i.rate) || 0;
      const amount = i.gstIncluded ? baseAmount * 1.18 : baseAmount;
      return s + amount;
    }, 0) + Number(pkgCharges.other || 0);

    // Subtotal before margin
    const subtotal = totalFormCost + totalOverheadCost + saAmount + containersCost + packagingTotal;

    // Apply margin
    const margin = f.costing?.margins?.b2b || f.costing?.margins?.b2c || 0;
    const marginAmount = subtotal * (margin / 100);

    return subtotal + marginAmount;
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-3 mb-4">
        <button
          onClick={() => setShowSaveDialog(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold transition"
        >
          <Save size={16} /> Save Quote
        </button>
      </div>

      {showSaveDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-[#0f1a2e] rounded-lg p-6 w-96">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg">Save Quote</h3>
              <button onClick={() => setShowSaveDialog(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-[#1b2e4a] rounded">
                <X size={20} />
              </button>
            </div>
            <input
              type="text"
              placeholder="Quote name (e.g., Client A - Spirulina)"
              value={quoteName}
              onChange={e => setQuoteName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 dark:border-[#1b2e4a] rounded-lg mb-4 bg-white dark:bg-[#1b2e4a] text-gray-900 dark:text-white"
              onKeyPress={e => e.key === 'Enter' && saveQuote()}
            />
            <div className="flex gap-2">
              <button onClick={saveQuote} className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg font-semibold hover:bg-blue-600">
                Save
              </button>
              <button onClick={() => setShowSaveDialog(false)} className="flex-1 px-4 py-2 bg-gray-200 dark:bg-[#1b2e4a] text-gray-900 dark:text-white rounded-lg font-semibold hover:bg-gray-300">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {quotes.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-[#1b2e4a]">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 dark:bg-[#0f1a2e]">
              <tr>
                {['Quote Name', 'Date', 'Total', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {quotes.map(quote => (
                <tr key={quote.id} className="border-t border-gray-100 dark:border-[#1b2e4a] hover:bg-gray-50 dark:hover:bg-[#1b2e4a]/50">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{quote.name}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{quote.date}</td>
                  <td className="px-4 py-3 font-mono font-bold text-gray-900 dark:text-white">₹{numF(quote.total)}</td>
                  <td className="px-4 py-3 flex gap-2">
                    <button onClick={() => loadQuote(quote)} className="text-blue-500 hover:text-blue-700 p-1" title="Load">
                      <Download size={16} />
                    </button>
                    <button onClick={() => copyQuote(quote)} className="text-green-500 hover:text-green-700 p-1" title="Copy">
                      <Copy size={16} />
                    </button>
                    <button onClick={() => deleteQuote(quote.id)} className="text-red-500 hover:text-red-700 p-1" title="Delete">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {quotes.length === 0 && (
        <p className="text-xs text-gray-400 text-center py-8">No saved quotes yet. Click "Save Quote" to create one.</p>
      )}
    </div>
  );
}
