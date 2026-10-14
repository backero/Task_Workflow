import React, { useRef, useState } from 'react';
import { ArrowDownTrayIcon, ArrowUpTrayIcon, XMarkIcon, CheckCircleIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';

function ResultsModal({ results, onClose }) {
  const hasErrors = results.errors?.length > 0;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-[#070c17] rounded-2xl shadow-modal w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-[#1b2e4a]">
          <h3 className="font-bold text-gray-900 dark:text-white text-lg">Import Results</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-[#17263d]">
            <XMarkIcon className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-xl">
              <p className="text-2xl font-bold text-green-600">{results.imported}</p>
              <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">Imported</p>
            </div>
            <div className="text-center p-3 bg-orange-50 dark:bg-orange-900/20 rounded-xl">
              <p className="text-2xl font-bold text-orange-600">{results.skipped}</p>
              <p className="text-xs text-orange-700 dark:text-orange-400 mt-0.5">Skipped</p>
            </div>
            <div className="text-center p-3 bg-gray-50 dark:bg-[#0f1a2e] rounded-xl">
              <p className="text-2xl font-bold text-gray-700 dark:text-gray-300">{results.imported + results.skipped}</p>
              <p className="text-xs text-gray-500 mt-0.5">Total Rows</p>
            </div>
          </div>

          {results.imported > 0 && (
            <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <CheckCircleIcon className="w-5 h-5 text-green-600 shrink-0" />
              <p className="text-sm text-green-700 dark:text-green-400">
                {results.imported} record{results.imported !== 1 ? 's' : ''} successfully imported.
              </p>
            </div>
          )}

          {/* Errors */}
          {hasErrors && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <ExclamationCircleIcon className="w-4 h-4 text-red-500" />
                <p className="text-sm font-medium text-red-600">{results.errors.length} issue{results.errors.length !== 1 ? 's' : ''} found</p>
              </div>
              <div className="space-y-1 max-h-48 overflow-y-auto rounded-lg border border-red-100 dark:border-red-900/30 p-3 bg-red-50 dark:bg-red-900/10">
                {results.errors.map((err, i) => (
                  <p key={i} className="text-xs text-red-600 dark:text-red-400">
                    {typeof err === 'string' ? err : err.message}
                  </p>
                ))}
              </div>
            </div>
          )}

          {results.imported === 0 && !hasErrors && (
            <p className="text-center text-gray-400 text-sm py-4">No records were imported.</p>
          )}
        </div>

        <div className="p-5 border-t border-gray-100 dark:border-[#1b2e4a]">
          <button onClick={onClose} className="btn-primary w-full justify-center py-2.5">Done</button>
        </div>
      </div>
    </div>
  );
}

export default function ImportButton({ templateUrl, importUrl, onSuccess, label = 'Import' }) {
  const fileRef = useRef();
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState(null);

  const downloadTemplate = async () => {
    try {
      const res = await api.get(templateUrl, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = templateUrl.includes('users') ? 'backero_team_template.xlsx' : 'backero_products_template.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to download template');
    }
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.csv')) {
      toast.error('Please upload an .xlsx or .csv file');
      return;
    }

    setUploading(true);
    const toastId = toast.loading(`Importing ${file.name}...`);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post(importUrl, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.dismiss(toastId);
      setResults(res.data);
      if (onSuccess) onSuccess();
    } catch (err) {
      toast.dismiss(toastId);
      toast.error(err.response?.data?.message || 'Import failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          onClick={downloadTemplate}
          className="btn-secondary gap-2 text-sm"
          title="Download template Excel file"
        >
          <ArrowDownTrayIcon className="w-4 h-4" />
          Template
        </button>

        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className={clsx('btn-secondary gap-2 text-sm', uploading && 'opacity-50 cursor-not-allowed')}
        >
          {uploading ? (
            <>
              <span className="w-4 h-4 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
              Importing...
            </>
          ) : (
            <>
              <ArrowUpTrayIcon className="w-4 h-4" />
              {label}
            </>
          )}
        </button>

        <input ref={fileRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={handleFile} />
      </div>

      {results && (
        <ResultsModal
          results={results}
          onClose={() => setResults(null)}
        />
      )}
    </>
  );
}
