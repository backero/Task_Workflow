import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import {
  ArrowLeftIcon, BeakerIcon, ArrowUpTrayIcon, ArrowDownTrayIcon,
  ArrowPathIcon, CheckIcon, ClockIcon, UserIcon,
} from '@heroicons/react/24/outline';

const fmt = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

const totalStock = (m) =>
  Number(m.currentStock) || (m.batches || []).reduce((s, b) => s + (Number(b.quantity) || 0), 0);

export default function RecordUsageForm() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [material, setMaterial] = useState(null);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  const [qty, setQty] = useState('');
  const [purpose, setPurpose] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Return state
  const [returnTarget, setReturnTarget] = useState(null);
  const [returnQty, setReturnQty] = useState('');
  const [returnNotes, setReturnNotes] = useState('');
  const [returnSubmitting, setReturnSubmitting] = useState(false);
  const [returnError, setReturnError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const [matRes, recRes] = await Promise.all([
          api.get('/inventory/raw-materials'),
          api.get(`/production-usage?materialId=${id}`),
        ]);
        const mat = (matRes.data.materials || []).find(m => m._id === id);
        setMaterial(mat || null);
        setRecords(recRes.data.records || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const submit = async (e) => {
    e.preventDefault();
    if (!qty || Number(qty) <= 0) { setError('Enter a valid quantity'); return; }
    if (Number(qty) > totalStock(material)) { setError(`Only ${totalStock(material)} ${material.unit} available`); return; }
    if (!purpose.trim()) { setError('Purpose is required'); return; }
    setSubmitting(true); setError('');
    try {
      const res = await api.post('/production-usage', {
        materialId: id,
        quantity: Number(qty),
        purpose: purpose.trim(),
        notes: notes.trim(),
      });
      setMaterial(prev => ({ ...prev, ...res.data.material }));
      setRecords(prev => [res.data.record, ...prev]);
      setQty(''); setPurpose(''); setNotes('');
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to record usage');
    } finally {
      setSubmitting(false);
    }
  };

  const openReturn = (record) => {
    const alreadyReturned = records
      .filter(r => r.type === 'return' && (r.returnOf?._id === record._id || r.returnOf === record._id))
      .reduce((s, r) => s + r.quantity, 0);
    setReturnTarget({ ...record, maxReturnable: record.quantity - alreadyReturned });
    setReturnQty(''); setReturnNotes(''); setReturnError('');
  };

  const submitReturn = async (e) => {
    e.preventDefault();
    if (!returnQty || Number(returnQty) <= 0) { setReturnError('Enter a valid quantity'); return; }
    if (Number(returnQty) > returnTarget.maxReturnable) { setReturnError(`Max returnable: ${returnTarget.maxReturnable} ${returnTarget.unit}`); return; }
    setReturnSubmitting(true); setReturnError('');
    try {
      const res = await api.post(`/production-usage/${returnTarget._id}/return`, {
        quantity: Number(returnQty),
        notes: returnNotes.trim(),
      });
      setMaterial(prev => ({ ...prev, ...res.data.material }));
      setRecords(prev => [res.data.record, ...prev]);
      setReturnTarget(null);
    } catch (e) {
      setReturnError(e.response?.data?.message || 'Failed to record return');
    } finally {
      setReturnSubmitting(false);
    }
  };

  const returnedQtyFor = (recId) =>
    records.filter(r => r.type === 'return' && (r.returnOf?._id === recId || r.returnOf === recId))
           .reduce((s, r) => s + r.quantity, 0);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><ArrowPathIcon className="w-6 h-6 animate-spin text-gray-400" /></div>;
  }

  if (!material) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500">Material not found.</p>
        <button onClick={() => navigate('/production/usage')} className="mt-4 text-sm text-orange-500 hover:underline">← Back to list</button>
      </div>
    );
  }

  const stock = totalStock(material);
  const isLow = material.enableMinStock && stock > 0 && stock <= (material.minStockLevel || 0);

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Back */}
      <button onClick={() => navigate('/production/usage')} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors">
        <ArrowLeftIcon className="w-4 h-4" /> Back to Production Usage
      </button>

      {/* Material Info */}
      <div className="card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BeakerIcon className="w-4 h-4 text-orange-500" />
              <span className="text-xs font-mono text-gray-400">{material.code}</span>
              <span className="text-xs text-gray-400">·</span>
              <span className="text-xs text-gray-500">{material.category}</span>
            </div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">{material.name}</h1>
            {material.supplier && <p className="text-sm text-gray-500 mt-0.5">Supplier: {material.supplier}</p>}
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Available Stock</p>
            <p className={`text-3xl font-bold ${stock <= 0 ? 'text-red-500' : isLow ? 'text-yellow-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
              {stock}
            </p>
            <p className="text-sm text-gray-400">{material.unit}</p>
            {stock <= 0 && <span className="inline-block mt-1 text-[10px] bg-red-100 dark:bg-red-500/15 text-red-500 px-2 py-0.5 rounded-full">Out of Stock</span>}
            {isLow && <span className="inline-block mt-1 text-[10px] bg-yellow-100 dark:bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 px-2 py-0.5 rounded-full">Low Stock</span>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Record Usage Form */}
        <div className="card p-5">
          <h2 className="text-base font-bold text-gray-800 dark:text-white flex items-center gap-2 mb-4">
            <ArrowUpTrayIcon className="w-4 h-4 text-orange-500" />
            Record Usage
          </h2>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="label">Quantity ({material.unit}) <span className="text-red-500">*</span></label>
              <input
                type="number" min="0.01" step="0.01" max={stock}
                value={qty} onChange={e => setQty(e.target.value)}
                placeholder={`Max: ${stock} ${material.unit}`}
                disabled={stock <= 0}
                className="input"
              />
            </div>
            <div>
              <label className="label">Purpose / Product Batch <span className="text-red-500">*</span></label>
              <input
                type="text" value={purpose} onChange={e => setPurpose(e.target.value)}
                placeholder="e.g. Shampoo Batch #12, Face Cream B-04"
                disabled={stock <= 0}
                className="input"
              />
            </div>
            <div>
              <label className="label">Notes (optional)</label>
              <textarea
                rows={3} value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Any additional notes about this usage..."
                disabled={stock <= 0}
                className="input resize-none"
              />
            </div>
            {error && <p className="text-xs text-red-600 bg-red-50 dark:bg-red-500/10 px-3 py-2 rounded-lg border border-red-200 dark:border-red-500/20">{error}</p>}
            {stock <= 0
              ? <p className="text-sm text-center text-red-500 py-2">This material is out of stock</p>
              : (
                <button type="submit" disabled={submitting}
                  className="w-full py-2.5 text-sm font-semibold text-white rounded-lg bg-orange-500 hover:bg-orange-400 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                  {submitting ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
                  Confirm Usage
                </button>
              )}
          </form>
        </div>

        {/* Return Form (shows when returnTarget is set) */}
        <div className="card p-5">
          {returnTarget ? (
            <>
              <h2 className="text-base font-bold text-gray-800 dark:text-white flex items-center gap-2 mb-1">
                <ArrowDownTrayIcon className="w-4 h-4 text-emerald-500" />Return to Stock
              </h2>
              <p className="text-xs text-gray-500 mb-4">Ref: {returnTarget.issueNumber} · {returnTarget.purpose}</p>
              <form onSubmit={submitReturn} className="space-y-4">
                <div>
                  <label className="label">Return Quantity ({returnTarget.unit}) <span className="text-red-500">*</span></label>
                  <input
                    type="number" min="0.01" step="0.01" max={returnTarget.maxReturnable}
                    value={returnQty} onChange={e => setReturnQty(e.target.value)}
                    placeholder={`Max: ${returnTarget.maxReturnable}`}
                    className="input" autoFocus
                  />
                  <p className="text-xs text-gray-400 mt-1">Max returnable: <span className="font-semibold text-emerald-600 dark:text-emerald-400">{returnTarget.maxReturnable} {returnTarget.unit}</span></p>
                </div>
                <div>
                  <label className="label">Notes (optional)</label>
                  <textarea rows={3} value={returnNotes} onChange={e => setReturnNotes(e.target.value)}
                    placeholder="Reason for return..." className="input resize-none" />
                </div>
                {returnError && <p className="text-xs text-red-600 bg-red-50 dark:bg-red-500/10 px-3 py-2 rounded-lg border border-red-200 dark:border-red-500/20">{returnError}</p>}
                <div className="flex gap-3">
                  <button type="button" onClick={() => setReturnTarget(null)}
                    className="flex-1 py-2 text-sm text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-white/10 rounded-lg hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                    Cancel
                  </button>
                  <button type="submit" disabled={returnSubmitting}
                    className="flex-1 py-2 text-sm font-semibold text-white rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                    {returnSubmitting ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
                    Confirm Return
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center">
              <ArrowDownTrayIcon className="w-8 h-8 text-gray-300 dark:text-gray-600 mb-2" />
              <p className="text-sm text-gray-400">Click <span className="font-medium text-emerald-600 dark:text-emerald-400">Return</span> on a usage entry below to return unused material to stock</p>
            </div>
          )}
        </div>
      </div>

      {/* Usage History for this material */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 dark:border-[#1b2e4a] flex items-center gap-2">
          <ClockIcon className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Usage History</h2>
          <span className="text-xs text-gray-400 font-normal">({records.length} entries)</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 dark:border-[#1b2e4a]">
                {['#','Type','Qty','Purpose','Taken By','Date & Time','Notes',''].map(h => (
                  <th key={h} className="text-left text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide px-5 py-2.5 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.length === 0
                ? <tr><td colSpan={8} className="text-center text-gray-400 py-10 text-sm">No usage records yet for this material</td></tr>
                : records.map(r => {
                    const returned = r.type === 'issue' ? returnedQtyFor(r._id) : 0;
                    const maxRet = r.type === 'issue' ? r.quantity - returned : 0;
                    return (
                      <tr key={r._id} className="border-b border-gray-50 dark:border-[#1b2e4a]/60 hover:bg-gray-50 dark:hover:bg-white/3 transition-colors">
                        <td className="px-5 py-3 text-xs font-mono text-gray-400">{r.issueNumber}</td>
                        <td className="px-5 py-3">
                          {r.type === 'issue'
                            ? <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-500/10 px-2 py-0.5 rounded-full border border-orange-200 dark:border-orange-500/20"><ArrowUpTrayIcon className="w-3 h-3" />Used</span>
                            : <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-500/20"><ArrowDownTrayIcon className="w-3 h-3" />Returned</span>}
                        </td>
                        <td className="px-5 py-3">
                          <span className={`text-sm font-bold ${r.type === 'issue' ? 'text-orange-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                            {r.type === 'issue' ? '-' : '+'}{r.quantity}
                          </span>
                          <span className="text-xs text-gray-400 ml-1">{r.unit}</span>
                          {r.type === 'issue' && returned > 0 && <span className="block text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5">{returned} returned</span>}
                        </td>
                        <td className="px-5 py-3 text-sm text-gray-600 dark:text-gray-300 max-w-[160px] truncate">{r.purpose || '—'}</td>
                        <td className="px-5 py-3">
                          <span className="flex items-center gap-1 text-sm text-gray-700 dark:text-gray-300">
                            <UserIcon className="w-3.5 h-3.5 text-gray-400" />
                            {r.takenBy ? `${r.takenBy.firstName} ${r.takenBy.lastName}` : '—'}
                          </span>
                          {r.takenBy?.role && <span className="block text-[10px] text-gray-400 capitalize mt-0.5">{r.takenBy.role.replace('_',' ')}</span>}
                        </td>
                        <td className="px-5 py-3 text-xs text-gray-500 whitespace-nowrap">{fmt(r.createdAt)}</td>
                        <td className="px-5 py-3 text-xs text-gray-500 max-w-[120px] truncate">{r.notes || '—'}</td>
                        <td className="px-5 py-3">
                          {r.type === 'issue' && maxRet > 0 && (
                            <button onClick={() => openReturn(r)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-emerald-50 dark:bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/22 transition-colors border border-emerald-200 dark:border-emerald-500/20 whitespace-nowrap">
                              <ArrowDownTrayIcon className="w-3 h-3" />Return
                            </button>
                          )}
                          {r.type === 'issue' && maxRet <= 0 && returned > 0 && <span className="text-[10px] text-gray-400">Fully returned</span>}
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
