import React, { useState, useEffect } from 'react';
import { Save, Copy, Trash2, FolderOpen, X } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';

function numF(v, d = 2) { return Number(v || 0).toFixed(d); }

const API_BASE = 'http://localhost:5000/api';

export default function SavedQuotes({ productId, form, setForm, onLoad }) {
  const [quotes, setQuotes] = useState([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [quoteName, setQuoteName] = useState('');
  const [loading, setLoading] = useState(false);

  // Fetch quotes from database on mount and when productId changes
  useEffect(() => {
    if (!productId) return;
    fetchQuotes();
  }, [productId]);

  const fetchQuotes = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE}/saved-quotes/${productId}`);
      console.log('Fetched quotes from database:', response.data);
      setQuotes(response.data.quotes || []);
    } catch (error) {
      console.error('Failed to fetch quotes:', error);
      // Fallback to localStorage if database fails
      const savedQuotes = localStorage.getItem(`quotes_${productId}`);
      if (savedQuotes) {
        try {
          setQuotes(JSON.parse(savedQuotes));
        } catch (e) {
          console.error('Failed to load quotes from localStorage:', e);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const saveQuote = async () => {
    if (!quoteName.trim()) {
      toast.error('Please enter a quote name');
      return;
    }

    try {
      setLoading(true);

      // Extract only form-related fields
      const formOnlyData = {
        formulation: form.formulation,
        productionOverhead: form.productionOverhead,
        standardAssumptions: form.standardAssumptions,
        rnd: form.rnd,
        containers: form.containers,
        packaging: form.packaging,
        costing: form.costing
      };

      const newQuote = {
        name: quoteName,
        date: new Date().toLocaleDateString('en-IN'),
        data: formOnlyData,
        total: calculateTotal(formOnlyData)
      };

      console.log('Saving quote to database:', newQuote);

      // Save to database
      const response = await axios.post(`${API_BASE}/saved-quotes/${productId}`, newQuote);
      console.log('Quote saved successfully:', response.data);

      // Update local quotes list
      setQuotes([...quotes, response.data.quote]);

      // Also save to localStorage as backup
      localStorage.setItem(`quotes_${productId}`, JSON.stringify([...quotes, response.data.quote]));

      setQuoteName('');
      setShowSaveDialog(false);
      toast.success('✓ Quote saved: ' + quoteName);
    } catch (error) {
      console.error('Error saving quote:', error);
      toast.error('Failed to save quote. Retrying locally...');

      // Fallback: save to localStorage only
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
      toast.success('✓ Quote saved locally');
    } finally {
      setLoading(false);
    }
  };

  const loadQuote = async (quote) => {
    try {
      console.log('Loading quote from database:', quote.name);

      // Fetch the specific quote from database to ensure we have latest data
      const response = await axios.get(`${API_BASE}/saved-quotes/${productId}/${quote._id || quote.id}`);
      const quoteData = response.data.quote;

      console.log('Quote data fetched from database:', quoteData.data);

      if (!quoteData.data) {
        toast.error('Quote data is corrupted');
        return;
      }

      // Set form with loaded data
      setForm(JSON.parse(JSON.stringify(quoteData.data)));

      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 50);

      if (onLoad) onLoad();
      toast.success(`✓ Loaded: ${quote.name}`);
    } catch (error) {
      console.error('Error loading quote:', error);

      // Fallback: load from localStorage
      if (quote.data) {
        setForm(JSON.parse(JSON.stringify(quote.data)));
        toast.success(`✓ Loaded (offline): ${quote.name}`);
      } else {
        toast.error('Failed to load quote');
      }
    }
  };

  const copyQuote = async (quote) => {
    try {
      setLoading(true);

      const copied = {
        name: `${quote.name} (Copy)`,
        date: new Date().toLocaleDateString('en-IN'),
        data: quote.data,
        total: quote.total
      };

      // Save copy to database
      const response = await axios.post(`${API_BASE}/saved-quotes/${productId}`, copied);

      // Update local list
      setQuotes([...quotes, response.data.quote]);

      // Also update localStorage
      localStorage.setItem(`quotes_${productId}`, JSON.stringify([...quotes, response.data.quote]));

      toast.success('✓ Quote copied');
    } catch (error) {
      console.error('Error copying quote:', error);
      toast.error('Failed to copy quote');
    } finally {
      setLoading(false);
    }
  };

  const deleteQuote = async (quoteId) => {
    if (!window.confirm('Delete this quote?')) return;

    try {
      setLoading(true);

      // Delete from database
      await axios.delete(`${API_BASE}/saved-quotes/${productId}/${quoteId}`);

      // Update local list
      const updated = quotes.filter(q => q._id !== quoteId && q.id !== quoteId);
      setQuotes(updated);

      // Update localStorage
      localStorage.setItem(`quotes_${productId}`, JSON.stringify(updated));

      toast.success('✓ Quote deleted');
    } catch (error) {
      console.error('Error deleting quote:', error);
      toast.error('Failed to delete quote');
    } finally {
      setLoading(false);
    }
  };

  const calculateTotal = (f) => {
    try {
      const po = f.productionOverhead || {};
      const costing = f.costing || {};
      const margin = Number(costing.margins?.b2b || costing.margins?.b2c || 0);

      const overhead = Number(po.electricity || 0) + Number(po.labor || 0) + Number(po.labTesting || 0) + Number(po.other || 0);
      const sa = f.standardAssumptions || {};
      const saPct = [sa.equipmentPct, sa.consumablesPct, sa.storagePct, sa.housekeepingPct, sa.adminPct, sa.wastagePct]
        .reduce((s, v) => s + (Number(v) || 0), 0);

      const subtotal = overhead * (1 + saPct / 100);
      const total = subtotal * (1 + margin / 100);

      return isNaN(total) || !isFinite(total) ? 0 : total;
    } catch (e) {
      console.error('Error calculating total:', e);
      return 0;
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
        {loading && <span className="text-xs text-blue-500">Loading...</span>}
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
              <button onClick={saveQuote} disabled={loading} className="flex-1 px-4 py-2 bg-emerald-500 text-white rounded-lg font-semibold hover:bg-emerald-600 disabled:bg-gray-400">
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
                  key={quote._id || quote.id}
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
                        disabled={loading}
                        className="p-1.5 rounded hover:bg-blue-100 dark:hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 transition disabled:opacity-50"
                        title="Load Quote"
                      >
                        <FolderOpen size={14} />
                      </button>
                      <button
                        onClick={() => copyQuote(quote)}
                        disabled={loading}
                        className="p-1.5 rounded hover:bg-green-100 dark:hover:bg-green-500/20 text-green-600 dark:text-green-400 transition disabled:opacity-50"
                        title="Copy"
                      >
                        <Copy size={14} />
                      </button>
                      <button
                        onClick={() => deleteQuote(quote._id || quote.id)}
                        disabled={loading}
                        className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-500/20 text-red-600 dark:text-red-400 transition disabled:opacity-50"
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
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold transition disabled:bg-gray-400"
      >
        <Save size={16} /> Save Quote
      </button>
    </div>
  );
}
