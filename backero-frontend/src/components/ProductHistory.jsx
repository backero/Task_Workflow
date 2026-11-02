import React, { useState, useEffect } from 'react';
import { History, Loader } from 'lucide-react';
import { fetchProductHistory } from '../utils/historyTracker';

export default function ProductHistory({ productId }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (!productId) return;
    loadHistory();
  }, [productId, page]);

  const loadHistory = async () => {
    setLoading(true);
    const data = await fetchProductHistory(productId, 50, page * 50);
    setHistory(data.history || []);
    setTotal(data.total || 0);
    setLoading(false);
  };

  const formatValue = (value) => {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value).slice(0, 100);
  };

  const formatDate = (isoString) => {
    const date = new Date(isoString);
    return date.toLocaleString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <History size={20} className="text-blue-600" />
        <h3 className="text-lg font-bold text-gray-900">Change History</h3>
        <span className="text-sm text-gray-500">({total} changes)</span>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader size={20} className="animate-spin text-blue-600" />
        </div>
      )}

      {!loading && history.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          No changes tracked yet
        </div>
      )}

      {!loading && history.length > 0 && (
        <div className="space-y-3">
          {history.map((entry, idx) => (
            <div
              key={entry._id || idx}
              className="border border-gray-200 rounded-lg p-4 bg-white hover:shadow-sm transition"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">
                      {entry.fieldName}
                    </span>
                    <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700">
                      {entry.tabName}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {entry.userName || 'Unknown'} • {formatDate(entry.timestamp)}
                  </p>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex gap-4">
                  <div className="flex-1">
                    <p className="text-xs text-gray-500 font-semibold mb-1">
                      Old Value
                    </p>
                    <div className="bg-red-50 border border-red-200 rounded p-2 font-mono text-xs text-red-700 break-words">
                      {formatValue(entry.oldValue)}
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-gray-500 font-semibold mb-1">
                      New Value
                    </p>
                    <div className="bg-green-50 border border-green-200 rounded p-2 font-mono text-xs text-green-700 break-words">
                      {formatValue(entry.newValue)}
                    </div>
                  </div>
                </div>
              </div>

              {entry.changeDescription && (
                <p className="text-xs text-gray-600 mt-2 italic">
                  {entry.changeDescription}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > 50 && (
        <div className="flex justify-between items-center mt-6 pt-4 border-t">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-3 py-1.5 text-sm rounded border border-gray-300 disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-xs text-gray-500">
            Page {page + 1} of {Math.ceil(total / 50)}
          </span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={(page + 1) * 50 >= total}
            className="px-3 py-1.5 text-sm rounded border border-gray-300 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
