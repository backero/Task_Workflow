import React, { useState, useEffect } from 'react';
import { Save, Copy, Trash2, FolderOpen, X } from 'lucide-react';
import toast from 'react-hot-toast';

function numF(v, d = 2) { return Number(v || 0).toFixed(d); }

export default function SavedQuotes({ productId, form, setForm, onLoad }) {
  const [quotes, setQuotes] = useState([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [quoteName, setQuoteName] = useState('');

  const storageKey = `quotes_${productId || 'default'}`;

  useEffect(() => {
    loadQuotesFromStorage();
  }, [storageKey]);

  const loadQuotesFromStorage = () => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        console.log('Loaded quotes from storage:', parsed);
        setQuotes(parsed);
      }
    } catch (e) {
      console.error('Failed to load quotes:', e);
    }
  };

  const saveQuote = () => {
    if (!quoteName.trim()) {
      toast.error('Please enter a quote name');
      return;
    }

    try {
      // Save entire form as-is for complete restoration
      const newQuote = {
        id: Date.now(),
        name: quoteName,
        date: new Date().toLocaleDateString('en-IN'),
        data: JSON.parse(JSON.stringify(form)),  // Deep copy of entire form
        total: form.costing?.totalFinalCost || 0  // Use actual final cost from form
      };

      console.log('Saving quote:', newQuote);

      const updated = [...quotes, newQuote];
      setQuotes(updated);
      localStorage.setItem(storageKey, JSON.stringify(updated));

      setQuoteName('');
      setShowSaveDialog(false);
      toast.success('✓ Quote saved: ' + quoteName);
    } catch (error) {
      console.error('Error saving quote:', error);
      toast.error('Failed to save quote');
    }
  };

  const loadQuote = (quote) => {
    try {
      console.log('Loading quote:', quote.name);
      console.log('Quote data:', quote.data);

      if (!quote.data) {
        toast.error('Quote data is corrupted');
        return;
      }

      // Directly set the entire saved form
      const loadedData = JSON.parse(JSON.stringify(quote.data));
      console.log('Setting form to:', loadedData);

      setForm(loadedData);

      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 50);

      if (onLoad) onLoad();
      toast.success(`✓ Loaded: ${quote.name}`);
    } catch (e) {
      console.error('Error loading quote:', e);
      toast.error('Failed to load quote');
    }
  };

  const copyQuote = (quote) => {
    try {
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
    } catch (error) {
      console.error('Error copying quote:', error);
      toast.error('Failed to copy quote');
    }
  };

  const deleteQuote = (id) => {
    if (!window.confirm('Delete this quote?')) return;

    try {
      const updated = quotes.filter(q => q.id !== id);
      setQuotes(updated);
      localStorage.setItem(storageKey, JSON.stringify(updated));
      toast.success('✓ Quote deleted');
    } catch (error) {
      console.error('Error deleting quote:', error);
      toast.error('Failed to delete quote');
    }
  };

  return (
    <div className="space-y-4 w-full">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
          <Save size={16} className="text-blue-600 dark:text-blue-400" />
        </div>
        <h3 className="text-sm font-bold text-gray-900 dark:text-white">Saved Quotes</h3>
        {quotes.length > 0 && (
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
            {quotes.length} saved
          </span>
        )}
      </div>

      {/* Save Dialog */}
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
              autoFocus
            />
            <div className="flex gap-2">
              <button onClick={saveQuote} className="flex-1 px-4 py-2 bg-emerald-500 text-white rounded-lg font-semibold hover:bg-emerald-600">
                Save
              </button>
              <button onClick={() => setShowSaveDialog(false)} className="flex-1 px-4 py-2 bg-gray-200 dark:bg-[#1b2e4a] text-gray-900 dark:text-white rounded-lg font-semibold hover:bg-gray-300">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quotes Table */}
      {quotes.length > 0 ? (
        <div className="rounded-lg border border-gray-200 dark:border-[#1b2e4a] overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 dark:bg-[#0f1a2e] border-b border-gray-200 dark:border-[#1b2e4a]">
                <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-400">Quote Name</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-400">Date</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600 dark:text-gray-400">Total</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-600 dark:text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((quote, idx) => (
                <tr
                  key={quote.id}
                  className={`border-t border-gray-100 dark:border-[#1b2e4a] hover:bg-gray-50 dark:hover:bg-[#0f1a2e]/50 transition ${
                    idx % 2 === 0 ? 'bg-white dark:bg-[#1a2a3a]/50' : 'bg-gray-50 dark:bg-[#0f1a2e]'
                  }`}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900 dark:text-white">{quote.name}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{quote.date}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-mono font-bold text-gray-900 dark:text-white">₹{numF(quote.total)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-center">
                      <button
                        onClick={() => loadQuote(quote)}
                        className="p-1.5 rounded hover:bg-blue-100 dark:hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 transition"
                        title="Load Quote"
                      >
                        <FolderOpen size={14} />
                      </button>
                      <button
                        onClick={() => copyQuote(quote)}
                        className="p-1.5 rounded hover:bg-green-100 dark:hover:bg-green-500/20 text-green-600 dark:text-green-400 transition"
                        title="Copy"
                      >
                        <Copy size={14} />
                      </button>
                      <button
                        onClick={() => deleteQuote(quote.id)}
                        className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-500/20 text-red-600 dark:text-red-400 transition"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-8 px-4 rounded-lg border border-dashed border-gray-200 dark:border-[#1b2e4a]">
          <p className="text-sm text-gray-500 dark:text-gray-400">No saved quotes yet</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Click "Save Quote" to create one</p>
        </div>
      )}

      {/* Save Quote Button at Bottom */}
      <button
        onClick={() => setShowSaveDialog(true)}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold transition"
      >
        <Save size={16} /> Save Quote
      </button>
    </div>
  );
}
