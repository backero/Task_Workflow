import React, { useState, useEffect } from 'react';
import { Save, Copy, Trash2, Download, X } from 'lucide-react';
import toast from 'react-hot-toast';

function numF(v, d = 2) { return Number(v || 0).toFixed(d); }

export default function SavedQuotes({ productId, form, setForm, onLoad }) {
  const [quotes, setQuotes] = useState([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [quoteName, setQuoteName] = useState('');

  // Use a fallback key if productId is undefined (productId should be product._id)
  const storageKey = `quotes_${productId || 'default'}`;
  console.log('SavedQuotes: productId=', productId, 'storageKey=', storageKey);

  useEffect(() => {
    const savedQuotes = localStorage.getItem(storageKey);
    if (savedQuotes) {
      try {
        setQuotes(JSON.parse(savedQuotes));
      } catch (e) {
        console.error('Failed to load quotes:', e);
      }
    }
  }, [storageKey]);

  const saveQuote = () => {
    if (!quoteName.trim()) {
      toast.error('Please enter a quote name');
      return;
    }

    // Extract only form-related fields, not product metadata
    const formOnlyData = {
      formulation: form.formulation,
      productionOverhead: form.productionOverhead,
      standardAssumptions: form.standardAssumptions,
      rnd: form.rnd,
      containers: form.containers,
      packaging: form.packaging,
      costing: form.costing
    };

    console.log('Saving quote with data:', formOnlyData);

    const newQuote = {
      id: Date.now(),
      name: quoteName,
      date: new Date().toLocaleDateString('en-IN'),
      data: formOnlyData,
      total: calculateTotal(formOnlyData)
    };

    const updated = [...quotes, newQuote];
    setQuotes(updated);
    localStorage.setItem(storageKey, JSON.stringify(updated));

    setQuoteName('');
    setShowSaveDialog(false);
    toast.success('✓ Quote saved: ' + quoteName);
  };

  const loadQuote = (quote) => {
    console.log('Loading quote:', quote.name);
    console.log('Quote data structure:', quote.data);

    if (!quote.data) {
      toast.error('Quote data is corrupted');
      return;
    }

    try {
      // Create a deep copy of the quote data
      const loadedData = JSON.parse(JSON.stringify(quote.data));
      console.log('Deep copied data:', loadedData);

      // Set the form with the loaded data
      setForm(loadedData);

      // Scroll to top so user sees the form has changed
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 100);

      if (onLoad) onLoad();
      toast.success(`✓ Loaded: ${quote.name}`);
    } catch (e) {
      console.error('Error loading quote:', e);
      toast.error('Failed to load quote');
    }
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
    localStorage.setItem(storageKey, JSON.stringify(updated));
    toast.success('✓ Quote copied');
  };

  const deleteQuote = (id) => {
    if (window.confirm('Delete this quote?')) {
      const updated = quotes.filter(q => q.id !== id);
      setQuotes(updated);
      localStorage.setItem(storageKey, JSON.stringify(updated));
      toast.success('✓ Quote deleted');
    }
  };

  const calculateTotal = (f) => {
    try {
      const po = f.productionOverhead || {};
      const costing = f.costing || {};
      const margin = Number(costing.margins?.b2b || costing.margins?.b2c || 0);

      // Simple calculation: overhead + SA%
      const overhead = Number(po.electricity || 0) + Number(po.labor || 0) + Number(po.labTesting || 0) + Number(po.other || 0);
      const sa = f.standardAssumptions || {};
      const saPct = [sa.equipmentPct, sa.consumablesPct, sa.storagePct, sa.housekeepingPct, sa.adminPct, sa.wastagePct]
        .reduce((s, v) => s + (Number(v) || 0), 0);

      // Basic total: overhead + SA + margin
      const subtotal = overhead * (1 + saPct / 100);
      const total = subtotal * (1 + margin / 100);

      return isNaN(total) || !isFinite(total) ? 0 : total;
    } catch (e) {
      console.error('Error calculating total:', e);
      return 0;
    }
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
