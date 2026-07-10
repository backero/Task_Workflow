import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import {
  BeakerIcon, ArrowUpTrayIcon, ArrowDownTrayIcon,
  MagnifyingGlassIcon, XMarkIcon, ClockIcon,
  UserIcon, CubeIcon, ArrowPathIcon,
} from '@heroicons/react/24/outline';

const fmt = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

const totalStock = (m) =>
  Number(m.currentStock) || (m.batches || []).reduce((s, b) => s + (Number(b.quantity) || 0), 0);

export default function RecordUsage() {
  const navigate = useNavigate();
  const [materials, setMaterials] = useState([]);
  const [records, setRecords] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [logFilter, setLogFilter] = useState('all');

  // Return modal
  const [returnModal, setReturnModal] = useState(null);
  const [returnQty, setReturnQty] = useState('');
  const [returnNotes, setReturnNotes] = useState('');
  const [returnLoading, setReturnLoading] = useState(false);
  const [returnError, setReturnError] = useState('');

  const fetchAll = useCallback(async () => {
    try {
      const [matRes, recRes] = await Promise.all([
        api.get('/inventory/raw-materials'),
        api.get('/production-usage'),
      ]);
      setMaterials(matRes.data.materials || []);
      setRecords(recRes.data.records || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') { setReturnModal(null); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const openReturn = (record) => {
    const alreadyReturned = records
      .filter(r => r.type === 'return' && (r.returnOf?._id === record._id || r.returnOf === record._id))
      .reduce((s, r) => s + r.quantity, 0);
    setReturnModal({ ...record, maxReturnable: record.quantity - alreadyReturned });
    setReturnQty(''); setReturnNotes(''); setReturnError('');
  };

  const submitReturn = async () => {
    if (!returnQty || Number(returnQty) <= 0) { setReturnError('Enter a valid quantity'); return; }
    if (Number(returnQty) > returnModal.maxReturnable) { setReturnError(`Max returnable: ${returnModal.maxReturnable} ${returnModal.unit}`); return; }
    setReturnLoading(true); setReturnError('');
    try {
      const res = await api.post(`/production-usage/${returnModal._id}/return`, {
        quantity: Number(returnQty),
        notes: returnNotes.trim(),
      });
      if (res.data.material) setMaterials(prev => prev.map(m => m._id === res.data.material._id ? { ...m, ...res.data.material } : m));
      setRecords(prev => [res.data.record, ...prev]);
      setReturnModal(null);
    } catch (e) {
      setReturnError(e.response?.data?.message || 'Failed to record return');
    } finally {
      setReturnLoading(false);
    }
  };

  const filteredMaterials = materials.filter(m =>
    m.name?.toLowerCase().includes(search.toLowerCase()) ||
    m.code?.toLowerCase().includes(search.toLowerCase())
  );
  const filteredRecords = logFilter === 'all' ? records : records.filter(r => r.type === logFilter);
  const returnedQtyFor = (id) =>
    records.filter(r => r.type === 'return' && (r.returnOf?._id === id || r.returnOf === id))
           .reduce((s, r) => s + r.quantity, 0);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><ArrowPathIcon className="w-6 h-6 animate-spin text-gray-400" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <BeakerIcon className="w-5 h-5 text-orange-500" />
          Production Usage
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Record raw material usage and returns for production</p>
      </div>

      {/* Raw Materials Table */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-[#1b2e4a]">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <CubeIcon className="w-4 h-4" />Raw Materials
          </h2>
          <div className="relative">
            <MagnifyingGlassIcon className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..."
              className="pl-8 pr-3 py-1.5 text-xs bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-gray-700 dark:text-white/80 placeholder:text-gray-400 focus:outline-none focus:border-orange-400 w-44" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 dark:border-[#1b2e4a]">
                {['Code','Material','Category','Unit','Available Stock','Net Used',''].map(h => (
                  <th key={h} className="text-left text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide px-5 py-2.5 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredMaterials.length === 0
                ? <tr><td colSpan={7} className="text-center text-gray-400 py-10 text-sm">No materials found</td></tr>
                : filteredMaterials.map(m => {
                    const stock = totalStock(m);
                    const netUsed = records
                      .filter(r => String(r.materialId?._id || r.materialId) === String(m._id))
                      .reduce((s, r) => r.type === 'issue' ? s + r.quantity : s - r.quantity, 0);
                    const isLow = m.enableMinStock && stock > 0 && stock <= (m.minStockLevel || 0);
                    return (
                      <tr key={m._id} className="border-b border-gray-50 dark:border-[#1b2e4a]/60 hover:bg-gray-50 dark:hover:bg-white/3 transition-colors">
                        <td className="px-5 py-3 text-xs font-mono text-gray-400">{m.code}</td>
                        <td className="px-5 py-3">
                          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{m.name}</span>
                          {m.supplier && <span className="block text-xs text-gray-400 mt-0.5">{m.supplier}</span>}
                        </td>
                        <td className="px-5 py-3 text-xs text-gray-500">{m.category}</td>
                        <td className="px-5 py-3 text-xs text-gray-500">{m.unit}</td>
                        <td className="px-5 py-3">
                          <span className={`text-sm font-bold ${stock <= 0 ? 'text-red-500' : isLow ? 'text-yellow-500' : 'text-emerald-600 dark:text-emerald-400'}`}>{stock}</span>
                          <span className="text-xs text-gray-400 ml-1">{m.unit}</span>
                          {stock <= 0 && <span className="ml-2 text-[10px] bg-red-100 dark:bg-red-500/15 text-red-500 px-1.5 py-0.5 rounded">Out</span>}
                          {isLow && <span className="ml-2 text-[10px] bg-yellow-100 dark:bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 px-1.5 py-0.5 rounded">Low</span>}
                        </td>
                        <td className="px-5 py-3">
                          <span className="text-sm font-medium text-orange-500">{Math.max(0, netUsed)}</span>
                          <span className="text-xs text-gray-400 ml-1">{m.unit}</span>
                        </td>
                        <td className="px-5 py-3">
                          <button onClick={() => navigate(`/production/usage/${m._id}`)} disabled={stock <= 0}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-orange-50 dark:bg-orange-500/15 text-orange-600 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors border border-orange-200 dark:border-orange-500/20">
                            <ArrowUpTrayIcon className="w-3.5 h-3.5" />Record Usage
                          </button>
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Usage Log */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-[#1b2e4a]">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <ClockIcon className="w-4 h-4" />Usage Log
            <span className="text-xs text-gray-400 font-normal">({records.length} entries)</span>
          </h2>
          <div className="flex items-center gap-1">
            {['all','issue','return'].map(f => (
              <button key={f} onClick={() => setLogFilter(f)}
                className={`px-3 py-1 text-xs rounded-lg capitalize transition-colors ${logFilter === f ? 'bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}>
                {f}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 dark:border-[#1b2e4a]">
                {['#','Type','Material','Qty','Purpose','Taken By','Date & Time','Notes',''].map(h => (
                  <th key={h} className="text-left text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide px-5 py-2.5 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRecords.length === 0
                ? <tr><td colSpan={9} className="text-center text-gray-400 py-10 text-sm">No records yet</td></tr>
                : filteredRecords.map(r => {
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
                          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{r.materialName}</span>
                          <span className="block text-xs text-gray-400 mt-0.5">{r.materialCode}</span>
                        </td>
                        <td className="px-5 py-3">
                          <span className={`text-sm font-bold ${r.type === 'issue' ? 'text-orange-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                            {r.type === 'issue' ? '-' : '+'}{r.quantity}
                          </span>
                          <span className="text-xs text-gray-400 ml-1">{r.unit}</span>
                          {r.type === 'issue' && returned > 0 && <span className="block text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5">{returned} returned</span>}
                          {r.type === 'return' && r.returnOf && <span className="block text-[10px] text-gray-400 mt-0.5">← {r.returnOf.issueNumber || 'issue'}</span>}
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
                        <td className="px-5 py-3 text-xs text-gray-500 max-w-[140px] truncate">{r.notes || '—'}</td>
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

      {/* Return Modal */}
      {returnModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={() => setReturnModal(null)} />
          <div className="relative card w-full max-w-md shadow-modal p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <ArrowDownTrayIcon className="w-4 h-4 text-emerald-500" />Return to Stock
              </h3>
              <button onClick={() => setReturnModal(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="p-3 rounded-lg bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10">
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{returnModal.materialName}</p>
              <p className="text-xs text-gray-400 mt-0.5">{returnModal.issueNumber} · {returnModal.purpose}</p>
              <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-1">Max returnable: {returnModal.maxReturnable} {returnModal.unit}</p>
            </div>
            <div>
              <label className="label">Return Quantity ({returnModal.unit}) <span className="text-red-500">*</span></label>
              <input type="number" min="0.01" step="0.01" max={returnModal.maxReturnable} value={returnQty} onChange={e => setReturnQty(e.target.value)} placeholder={`Max: ${returnModal.maxReturnable}`} className="input" autoFocus />
            </div>
            <div>
              <label className="label">Notes (optional)</label>
              <textarea rows={2} value={returnNotes} onChange={e => setReturnNotes(e.target.value)} placeholder="Reason for return..." className="input resize-none" />
            </div>
            {returnError && <p className="text-xs text-red-600 bg-red-50 dark:bg-red-500/10 px-3 py-2 rounded-lg border border-red-200 dark:border-red-500/20">{returnError}</p>}
            <div className="flex gap-3 pt-1">
              <button onClick={() => setReturnModal(null)} className="flex-1 py-2 text-sm text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-white/10 rounded-lg hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">Cancel</button>
              <button onClick={submitReturn} disabled={returnLoading} className="flex-1 py-2 text-sm font-semibold text-white rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                {returnLoading ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <ArrowDownTrayIcon className="w-4 h-4" />}Confirm Return
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
