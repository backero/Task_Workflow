import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  TableCellsIcon, ArrowPathIcon, CheckCircleIcon,
  ExclamationCircleIcon, ChevronDownIcon, ChevronUpIcon,
  LinkIcon, EyeIcon, BoltIcon,
} from '@heroicons/react/24/outline';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';
import { clsx } from 'clsx';

// Extract spreadsheet ID and optional GID from a Google Sheets URL or raw ID
function parseSheetUrl(input) {
  const str = input.trim();
  const idMatch = str.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  const gidMatch = str.match(/[#&?]gid=(\d+)/);
  return {
    sheetId: idMatch ? idMatch[1] : str,
    sheetGid: gidMatch ? gidMatch[1] : '',
  };
}

export default function GoogleSheetsPanel({ onSynced }) {
  const [open, setOpen] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [sheetGid, setSheetGid] = useState('');
  const [sheetName, setSheetName] = useState('Sheet1');
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [writeBackEnabled, setWriteBackEnabled] = useState(false);
  const [preview, setPreview] = useState(null);
  const qc = useQueryClient();

  const { data: config = {}, isLoading } = useQuery({
    queryKey: ['sheets-config'],
    queryFn: () => api.get('/crm/sheets/config').then((r) => r.data.config ?? {}),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (config?.sheetId) setUrlInput(config.sheetId);
    if (config?.sheetGid !== undefined) setSheetGid(config.sheetGid || '');
    if (config?.sheetName) setSheetName(config.sheetName);
    if (config?.syncEnabled !== undefined) setSyncEnabled(config.syncEnabled);
    if (config?.writeBackEnabled !== undefined) setWriteBackEnabled(config.writeBackEnabled);
  }, [config?.sheetId, config?.sheetGid, config?.syncEnabled, config?.sheetName, config?.writeBackEnabled]);

  // Auto-extract GID when URL is pasted
  const handleUrlChange = (val) => {
    setUrlInput(val);
    const { sheetGid: extractedGid } = parseSheetUrl(val);
    if (extractedGid) setSheetGid(extractedGid);
  };

  const isConnected = !!config.sheetId;
  const lastSync = config.lastSyncedAt ? new Date(config.lastSyncedAt) : null;
  const lastResult = config.lastSyncResult || {};

  const saveMutation = useMutation({
    mutationFn: (payload) => api.put('/crm/sheets/config', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sheets-config'] });
      toast.success('Google Sheet connected!');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to save config'),
  });

  const previewMutation = useMutation({
    mutationFn: ({ sheetId, sheetGid: gid }) => api.post('/crm/sheets/preview', { sheetId, sheetGid: gid }),
    onSuccess: (res) => {
      setPreview(res.data);
      toast.success(`Sheet readable — ${res.data.totalRows} rows detected`);
    },
    onError: (err) => {
      setPreview(null);
      toast.error(err.response?.data?.message || 'Cannot read sheet — make sure it is public');
    },
  });

  const syncMutation = useMutation({
    mutationFn: () => api.post('/crm/sheets/sync'),
    onSuccess: (res) => {
      const r = res.data;
      qc.invalidateQueries({ queryKey: ['sheets-config'] });
      qc.invalidateQueries({ queryKey: ['crm'] });
      if (onSynced) onSynced();
      const msg = r.synced > 0
        ? `${r.synced} new lead${r.synced !== 1 ? 's' : ''} imported!`
        : 'All up to date — no new leads';
      toast.success(msg);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Sync failed'),
  });

  const handlePreview = () => {
    const { sheetId, sheetGid: gid } = parseSheetUrl(urlInput);
    if (!sheetId) return toast.error('Enter your Google Sheet URL first');
    previewMutation.mutate({ sheetId, sheetGid: gid || sheetGid });
  };

  const handleSave = () => {
    const { sheetId, sheetGid: gid } = parseSheetUrl(urlInput);
    if (!sheetId) return toast.error('Enter your Google Sheet URL or ID');
    saveMutation.mutate({
      sheetId,
      sheetGid: gid || sheetGid,
      sheetName: sheetName || 'Sheet1',
      syncEnabled,
      writeBackEnabled,
    });
  };

  return (
    <div className="card overflow-hidden">
      {/* Collapsed header */}
      <button
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-[#17263d]/50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className={clsx(
            'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
            isConnected ? 'bg-green-100 dark:bg-green-900/30' : 'bg-gray-100 dark:bg-[#0f1a2e]'
          )}>
            <TableCellsIcon className={clsx('w-4 h-4', isConnected ? 'text-green-600' : 'text-gray-500')} />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              Google Sheets ↔ CRM Sync
              {config.writeBackEnabled && config.syncEnabled && (
                <span className="ml-2 text-xs font-normal text-green-600">Bidirectional</span>
              )}
            </p>
            <p className="text-xs text-gray-500">
              {isLoading ? 'Loading…' : isConnected
                ? syncEnabled
                  ? lastSync
                    ? `Last synced ${formatDistanceToNow(lastSync, { addSuffix: true })}`
                    : 'Auto-sync enabled — waiting for first run'
                  : 'Connected · auto-sync off'
                : 'Not connected — click to set up'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isConnected && syncEnabled && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-green-600">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Live
            </span>
          )}
          {open ? <ChevronUpIcon className="w-4 h-4 text-gray-400" /> : <ChevronDownIcon className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {/* Expanded panel */}
      {open && (
        <div className="border-t border-gray-100 dark:border-[#1b2e4a] p-5 space-y-5">

          {/* Step 1: Make sheet public */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
            <p className="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-2 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center flex-shrink-0">1</span>
              Make your Google Sheet publicly readable
            </p>
            <ol className="text-xs text-blue-800 dark:text-blue-400 space-y-1 ml-7">
              <li>Open your Google Sheet → click <strong>Share</strong> (top right)</li>
              <li>Under "General access" → change to <strong>Anyone with the link</strong></li>
              <li>Set permission to <strong>Viewer</strong> → click <strong>Done</strong></li>
            </ol>
          </div>

          {/* Step 2: Paste URL */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-5 h-5 rounded-full bg-brand-500 text-white text-xs flex items-center justify-center flex-shrink-0">2</span>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Paste your Google Sheet URL</label>
            </div>
            <div className="flex gap-2">
              <input
                value={urlInput}
                onChange={(e) => handleUrlChange(e.target.value)}
                className="input flex-1 font-mono text-xs"
                placeholder="https://docs.google.com/spreadsheets/d/…/edit#gid=…"
              />
              <button
                onClick={handlePreview}
                disabled={!urlInput.trim() || previewMutation.isPending}
                className="btn-secondary gap-1.5 px-4 flex-shrink-0 disabled:opacity-50"
              >
                <EyeIcon className={clsx('w-4 h-4', previewMutation.isPending && 'animate-spin')} />
                {previewMutation.isPending ? 'Checking…' : 'Test'}
              </button>
            </div>

            {sheetGid && (
              <p className="text-xs text-gray-400 mt-1.5">
                <span className="text-green-600 font-medium">✓ Tab detected</span> — gid: {sheetGid}
              </p>
            )}
          </div>

          {/* Preview table */}
          {preview && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Preview — {preview.totalRows} rows detected
              </p>
              <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-[#1b2e4a]">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 dark:bg-[#0f1a2e]">
                    <tr>
                      {preview.headers.map((h, i) => (
                        <th key={i} className="px-3 py-2 text-left text-gray-600 dark:text-gray-400 whitespace-nowrap">
                          <span>{h.raw}</span>
                          {h.mapped && (
                            <span className="ml-1 text-green-600">→ {h.mapped}</span>
                          )}
                          {!h.mapped && (
                            <span className="ml-1 text-gray-400 italic">(ignored)</span>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.preview.map((row, ri) => (
                      <tr key={ri} className="border-t border-gray-100 dark:border-[#1b2e4a]">
                        {preview.headers.map((h, ci) => (
                          <td key={ci} className="px-3 py-1.5 text-gray-700 dark:text-gray-300 max-w-[140px] truncate">
                            {row[h.raw] || <span className="text-gray-300">—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mapped field summary */}
              <div className="mt-2 flex flex-wrap gap-2">
                {preview.headers.filter((h) => h.mapped).map((h) => (
                  <span key={h.raw} className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                    {h.raw} → {h.mapped}
                  </span>
                ))}
                {preview.headers.filter((h) => !h.mapped).length > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                    {preview.headers.filter((h) => !h.mapped).length} columns ignored
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Auto-sync toggle */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-5 h-5 rounded-full bg-brand-500 text-white text-xs flex items-center justify-center flex-shrink-0">3</span>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Settings</label>
            </div>
            <div
              className="flex items-center gap-3 cursor-pointer select-none"
              onClick={() => setSyncEnabled((p) => !p)}
            >
              <div className={clsx(
                'relative w-10 h-5 rounded-full transition-colors',
                syncEnabled ? 'bg-brand-600' : 'bg-slate-200 dark:bg-[#1b2e4a]'
              )}>
                <span className={clsx(
                  'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform',
                  syncEnabled ? 'translate-x-5' : 'translate-x-0.5'
                )} />
              </div>
              <div>
                <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">Auto-sync every 5 minutes</span>
                <p className="text-xs text-gray-400">New rows in your sheet appear in CRM automatically</p>
              </div>
            </div>
          </div>

          {/* Step 4: Write-back (CRM → Sheet) */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-5 h-5 rounded-full bg-brand-500 text-white text-xs flex items-center justify-center flex-shrink-0">4</span>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">CRM → Google Sheet (Write-back)</label>
            </div>

            {!config.writeBackAvailable ? (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
                <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-2">Requires Google Service Account</p>
                <ol className="text-xs text-amber-700 dark:text-amber-400 space-y-1 list-decimal ml-4">
                  <li>Go to <strong>Google Cloud Console</strong> → create a Service Account</li>
                  <li>Enable <strong>Google Sheets API</strong> for your project</li>
                  <li>Share your sheet with the service account email as <strong>Editor</strong></li>
                  <li>Add <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded">GOOGLE_SERVICE_ACCOUNT_EMAIL</code> and <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded">GOOGLE_PRIVATE_KEY</code> to your <code>.env</code></li>
                </ol>
              </div>
            ) : (
              <div className="space-y-2">
                <div
                  className="flex items-center gap-3 cursor-pointer select-none"
                  onClick={() => setWriteBackEnabled((p) => !p)}
                >
                  <div className={clsx(
                    'relative w-10 h-5 rounded-full transition-colors',
                    writeBackEnabled ? 'bg-green-600' : 'bg-slate-200 dark:bg-[#1b2e4a]'
                  )}>
                    <span className={clsx(
                      'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform',
                      writeBackEnabled ? 'translate-x-5' : 'translate-x-0.5'
                    )} />
                  </div>
                  <div>
                    <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">Push CRM leads back to Google Sheet</span>
                    <p className="text-xs text-gray-400">New or updated leads in CRM are written to your sheet automatically</p>
                  </div>
                </div>
                {writeBackEnabled && config.serviceAccountEmail && (
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2 text-xs text-green-700 dark:text-green-400">
                    Share your sheet with <strong>{config.serviceAccountEmail}</strong> as <strong>Editor</strong> to allow writing
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={handleSave}
              disabled={saveMutation.isPending || !urlInput.trim()}
              className="btn-primary gap-2 disabled:opacity-50"
            >
              <LinkIcon className="w-4 h-4" />
              {saveMutation.isPending ? 'Saving…' : isConnected ? 'Update' : 'Connect Sheet'}
            </button>
            {isConnected && (
              <button
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
                className="btn-secondary gap-2 disabled:opacity-50"
              >
                <BoltIcon className={clsx('w-4 h-4', syncMutation.isPending && 'animate-spin')} />
                {syncMutation.isPending ? 'Syncing…' : 'Sync Now'}
              </button>
            )}
          </div>

          {/* Last sync result */}
          {lastSync && (
            <div className={clsx(
              'rounded-lg p-3 text-xs flex items-start gap-2',
              lastResult.error
                ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                : 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
            )}>
              {lastResult.error
                ? <ExclamationCircleIcon className="w-4 h-4 shrink-0 mt-0.5" />
                : <CheckCircleIcon className="w-4 h-4 shrink-0 mt-0.5" />
              }
              <div>
                {lastResult.error
                  ? <><p className="font-semibold">Last sync failed</p><p className="mt-0.5 opacity-80">{lastResult.error}</p></>
                  : <p>
                      <strong>{lastResult.synced ?? 0} new</strong>
                      {lastResult.updated > 0 && <> · {lastResult.updated} updated</>}
                      {' · '}{lastResult.skipped ?? 0} already existed
                      {' · '}{lastResult.totalRows ?? 0} total rows
                      {' — '}{formatDistanceToNow(lastSync, { addSuffix: true })}
                    </p>
                }
              </div>
            </div>
          )}

          {/* Required columns hint */}
          <div className="text-xs text-gray-400 bg-gray-50 dark:bg-[#0f1a2e]/50 rounded-lg p-3">
            <p className="font-medium text-gray-500 mb-1">Required columns in your sheet:</p>
            <p><strong className="text-gray-600 dark:text-gray-300">name</strong> (or "Full Name", "Customer Name") and <strong className="text-gray-600 dark:text-gray-300">phone</strong> (or "Mobile", "Contact") are mandatory.</p>
            <p className="mt-1">Optional: email, company, city, state, product, notes, priority, value</p>
          </div>
        </div>
      )}
    </div>
  );
}
