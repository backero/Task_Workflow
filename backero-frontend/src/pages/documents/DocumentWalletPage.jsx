import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useDropzone } from 'react-dropzone';
import toast from 'react-hot-toast';
import {
  FolderIcon, PlusIcon, MagnifyingGlassIcon, XMarkIcon, TrashIcon,
  ArrowPathIcon, DocumentTextIcon, ArrowDownTrayIcon, ChevronLeftIcon, ChevronRightIcon,
  BellAlertIcon, ArrowUpTrayIcon, EnvelopeIcon, ClipboardDocumentIcon, PencilSquareIcon,
} from '@heroicons/react/24/outline';
import documentsApi from '../../api/documents';
import { useAuthStore } from '../../store/useAuthStore';
import { BASE_CATEGORIES, TEMPLATES } from './documentTemplates';
import { docStatus, catName, latestFile, parseFilename, buildDocumentsCsv, docSummaryText, copyToClipboard } from './documentWalletHelpers';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import './DocumentWalletPage.css';

const STATUS_BADGE = { expired: 'badge-red', soon: 'badge-yellow', ok: 'badge-green', none: 'badge-gray' };
const emptyForm = { name: '', category: '', docNo: '', issueDate: '', expiryDate: '', issuer: '', keeper: '', location: '', notes: '' };

export default function DocumentWalletPage() {
  const qc = useQueryClient();
  const isManagerOrAbove = useAuthStore((s) => s.isManagerOrAbove)();
  const companyName = useAuthStore((s) => s.user?.organizationId?.name) || 'Company';

  const [activeCat, setActiveCat] = useState('all');
  const [view, setView] = useState('docs'); // 'docs' | 'trash'
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortKey, setSortKey] = useState('status');
  const [sortDir, setSortDir] = useState(1);
  const [openDocId, setOpenDocId] = useState(null);
  const [newDocOpen, setNewDocOpen] = useState(false);
  const [editingDocId, setEditingDocId] = useState(null);
  const [newDocForm, setNewDocForm] = useState(emptyForm);
  const [newDocFiles, setNewDocFiles] = useState([]);
  const [newVersionDocId, setNewVersionDocId] = useState(null);
  const [newVersionForm, setNewVersionForm] = useState({ v: '', date: '', note: '', expiryDate: '' });
  const [newVersionFiles, setNewVersionFiles] = useState([]);
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [confirmState, setConfirmState] = useState(null); // { title, message, onConfirm }
  const [viewer, setViewer] = useState(null); // { files: [...], index }
  const [remindersPreview, setRemindersPreview] = useState(null);

  const { data: documents = [], isLoading, isError } = useQuery({
    queryKey: ['documents'],
    queryFn: documentsApi.list,
    onError: () => toast.error('Could not reach the Document Wallet backend'),
  });
  const { data: customCats = [] } = useQuery({ queryKey: ['documents', 'categories'], queryFn: documentsApi.getCategories });
  const { data: trash = [] } = useQuery({
    queryKey: ['documents', 'trash'],
    queryFn: documentsApi.listTrash,
    enabled: view === 'trash',
  });
  const { data: driveStatus } = useQuery({
    queryKey: ['documents', 'drive-status'],
    queryFn: documentsApi.driveStatus,
    enabled: isManagerOrAbove,
  });

  // ── Google Drive OAuth connect: read the redirect result once, then strip it from the URL ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('driveConnected');
    const error = params.get('driveError');
    if (!connected && !error) return;
    if (connected) { toast.success(`Google Drive connected as ${connected}`); qc.invalidateQueries({ queryKey: ['documents', 'drive-status'] }); }
    if (error) toast.error(`Google Drive connect failed: ${error}`);
    params.delete('driveConnected');
    params.delete('driveError');
    const rest = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (rest ? `?${rest}` : ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connectDrive = async () => {
    try {
      const url = await documentsApi.driveConnectUrl();
      window.location.href = url;
    } catch (err) {
      toast.error('Could not start Google Drive connection');
    }
  };

  const allCats = useMemo(() => [{ id: 'all', name: 'All documents' }, ...BASE_CATEGORIES, ...customCats], [customCats]);

  const invalidateDocs = () => qc.invalidateQueries({ queryKey: ['documents'] });
  const invalidateTrash = () => qc.invalidateQueries({ queryKey: ['documents', 'trash'] });

  const createMutation = useMutation({ mutationFn: documentsApi.create, onSuccess: invalidateDocs });
  const updateMutation = useMutation({ mutationFn: ({ id, payload }) => documentsApi.update(id, payload), onSuccess: invalidateDocs });
  const softDeleteMutation = useMutation({
    mutationFn: documentsApi.softDelete,
    onSuccess: () => { invalidateDocs(); invalidateTrash(); toast.success('Moved to Recycle Bin'); },
  });
  const restoreMutation = useMutation({
    mutationFn: documentsApi.restoreTrash,
    onSuccess: () => { invalidateDocs(); invalidateTrash(); toast.success('Restored'); },
  });
  const purgeMutation = useMutation({ mutationFn: documentsApi.purgeTrash, onSuccess: () => { invalidateTrash(); toast.success('Permanently deleted'); } });
  const emptyTrashMutation = useMutation({ mutationFn: documentsApi.emptyTrash, onSuccess: () => { invalidateTrash(); toast.success('Recycle Bin emptied'); } });
  const addCategoryMutation = useMutation({
    mutationFn: documentsApi.addCategory,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['documents', 'categories'] }); toast.success('Category added'); },
  });
  const deleteVersionFileMutation = useMutation({
    mutationFn: ({ docId, versionId, fileId }) => documentsApi.deleteVersionFile(docId, versionId, fileId),
    onSuccess: () => { invalidateDocs(); invalidateTrash(); toast.success('Moved to Recycle Bin'); },
  });

  const openDoc = documents.find((d) => d._id === openDocId) || null;

  // ── derived: filter + sort ──────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = documents;
    if (activeCat !== 'all') list = list.filter((d) => d.category === activeCat);
    if (statusFilter !== 'all') list = list.filter((d) => docStatus(d).k === statusFilter);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((d) => [d.name, d.docNo, d.issuer, d.keeper, d.notes].some((v) => (v || '').toLowerCase().includes(q)));
    }
    const statusRank = { expired: 0, soon: 1, ok: 2, none: 3 };
    const sorted = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'status') cmp = statusRank[docStatus(a).k] - statusRank[docStatus(b).k];
      else if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortKey === 'issue') cmp = (a.issueDate || '').localeCompare(b.issueDate || '');
      else if (sortKey === 'expiry') cmp = (a.expiryDate || '').localeCompare(b.expiryDate || '');
      return cmp * sortDir;
    });
    return sorted;
  }, [documents, activeCat, statusFilter, query, sortKey, sortDir]);

  const stats = useMemo(() => {
    const expired = documents.filter((d) => docStatus(d).k === 'expired').length;
    const soon = documents.filter((d) => docStatus(d).k === 'soon').length;
    const foldersInUse = new Set(documents.map((d) => d.category)).size;
    const filesInDrive = documents.reduce((s, d) => s + (d.versions || []).reduce((s2, v) => s2 + (v.files || []).length, 0), 0);
    const recent = [...documents].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).slice(0, 5);
    return { total: documents.length, foldersInUse, expired, soon, filesInDrive, recent };
  }, [documents]);

  const radarItems = useMemo(() => {
    return documents
      .filter((d) => ['expired', 'soon'].includes(docStatus(d).k))
      .sort((a, b) => (a.expiryDate || '').localeCompare(b.expiryDate || ''))
      .slice(0, 8);
  }, [documents]);

  const catCounts = useMemo(() => {
    const counts = {};
    documents.forEach((d) => { counts[d.category] = (counts[d.category] || 0) + 1; });
    return counts;
  }, [documents]);

  // ── drag & drop overlay → prefill new-doc modal ────────────────────────
  const onDrop = useCallback((accepted) => {
    if (!accepted.length) return;
    const file = accepted[0];
    const parsed = parseFilename(file.name);
    setNewDocForm({ ...emptyForm, name: parsed.name || file.name, category: parsed.category || '', docNo: parsed.docNo || '', issueDate: parsed.issueDate || '' });
    setNewDocFiles([file]);
    setNewDocOpen(true);
  }, []);
  const { getRootProps, isDragActive } = useDropzone({ onDrop, noClick: true, noKeyboard: true });

  // ── actions ─────────────────────────────────────────────────────────────
  const closeNewDocModal = () => {
    setNewDocOpen(false);
    setEditingDocId(null);
    setNewDocForm(emptyForm);
    setNewDocFiles([]);
  };

  const submitNewDoc = async (e) => {
    e.preventDefault();
    if (!newDocForm.name.trim() || !newDocForm.category) return toast.error('Name and category are required');
    try {
      if (editingDocId) {
        await updateMutation.mutateAsync({ id: editingDocId, payload: newDocForm });
        toast.success('Details updated');
      } else {
        const doc = await createMutation.mutateAsync(newDocForm);
        let failed = 0;
        for (const file of newDocFiles) {
          await documentsApi.uploadFile(doc._id, file).catch((err) => {
            failed += 1;
            toast.error(`"${file.name}" failed: ${err.response?.data?.message || err.message}`);
          });
        }
        invalidateDocs();
        if (failed && failed === newDocFiles.length) toast.error('Document created, but the file did not upload — check Document Wallet storage setup');
        else if (failed) toast.error(`Document created — ${failed} of ${newDocFiles.length} file(s) failed to upload`);
        else toast.success('Document created');
      }
      closeNewDocModal();
    } catch (err) {
      toast.error(err.response?.data?.message || `Could not ${editingDocId ? 'update' : 'create'} document`);
    }
  };

  const openEditDetails = (doc) => {
    setEditingDocId(doc._id);
    setNewDocForm({
      name: doc.name, category: doc.category, docNo: doc.docNo || '',
      issueDate: doc.issueDate ? doc.issueDate.slice(0, 10) : '',
      expiryDate: doc.expiryDate ? doc.expiryDate.slice(0, 10) : '',
      issuer: doc.issuer || '', keeper: doc.keeper || '', location: doc.location || '', notes: doc.notes || '',
    });
    setNewDocFiles([]);
    setNewDocOpen(true);
  };

  const downloadLatestFile = async (doc) => {
    const f = latestFile(doc);
    if (!f) return toast.error('No file attached yet');
    try {
      const blob = await documentsApi.fetchFileBlob(f.driveId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = f.name; a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Could not download file');
    }
  };

  const copyDetails = (doc) => {
    copyToClipboard(docSummaryText(doc, customCats, companyName))
      .then(() => toast.success('Details copied — paste into email / WhatsApp / anywhere'))
      .catch(() => toast.error('Copy failed — your browser blocked it'));
  };

  const shareViaEmail = async (doc) => {
    const f = latestFile(doc);
    const text = docSummaryText(doc, customCats, companyName);
    const subject = `${doc.name} — ${companyName} document`;
    if (!f) {
      window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
      toast('No file attached yet — opening email with document details');
      return;
    }
    try {
      const blob = await documentsApi.fetchFileBlob(f.driveId);
      const file = new File([blob], f.name, { type: f.type || blob.type });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: doc.name, text });
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = f.name; a.click();
      URL.revokeObjectURL(url);
      const body = `${text}\n\n(The file "${f.name}" was just downloaded — please attach it to this email.)`;
      window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      toast('File downloaded — attach it to the email that just opened');
    } catch {
      window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
      toast.error('Could not fetch file — opening email with details only');
    }
  };

  const applyTemplate = (idx) => {
    const t = TEMPLATES[idx];
    if (!t || !t.cat) return;
    setNewDocForm((f) => ({ ...f, name: f.name || t.label, category: t.cat, issuer: t.issuer || '', notes: t.notes || '' }));
  };

  const submitNewVersion = async (e) => {
    e.preventDefault();
    if (!newVersionDocId) return;
    try {
      const doc = await documentsApi.addVersion(newVersionDocId, newVersionForm);
      const newVersion = doc.versions[doc.versions.length - 1];
      let failed = 0;
      for (const file of newVersionFiles) {
        await documentsApi.uploadFile(newVersionDocId, file).catch((err) => {
          failed += 1;
          toast.error(`"${file.name}" failed: ${err.response?.data?.message || err.message}`);
        });
      }
      if (newVersionFiles.length && failed === newVersionFiles.length) {
        // every intended file failed — remove the now-empty version instead of leaving a "vX.0, no files" ghost
        await documentsApi.deleteVersion(newVersionDocId, newVersion._id).catch(() => {});
        toast.error('Version not added — the file did not upload. Check Document Wallet storage setup.');
      } else if (failed) {
        toast.error(`Version added — ${failed} of ${newVersionFiles.length} file(s) failed to upload`);
      } else {
        toast.success('Version added');
      }
      invalidateDocs();
      setNewVersionDocId(null);
      setNewVersionForm({ v: '', date: '', note: '', expiryDate: '' });
      setNewVersionFiles([]);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not add version');
    }
  };

  const openViewerForDoc = (doc, startFile) => {
    const files = [];
    (doc.versions || []).forEach((v) => (v.files || []).forEach((f) => files.push({ ...f, versionLabel: v.v })));
    const index = Math.max(0, files.findIndex((f) => f._id === startFile._id));
    setViewer({ files, index, blobUrl: null, loading: true });
  };

  useEffect(() => {
    if (!viewer) return;
    let revoked = false;
    const file = viewer.files[viewer.index];
    if (!file) return;
    setViewer((v) => (v ? { ...v, loading: true, blobUrl: null } : v));
    documentsApi.fetchFileBlob(file.driveId).then((blob) => {
      if (revoked) return;
      const url = URL.createObjectURL(blob);
      setViewer((v) => (v ? { ...v, blobUrl: url, loading: false } : v));
    }).catch(() => {
      toast.error('Could not load file preview');
      setViewer((v) => (v ? { ...v, loading: false } : v));
    });
    return () => { revoked = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer?.index, viewer?.files]);

  const closeViewer = () => {
    if (viewer?.blobUrl) URL.revokeObjectURL(viewer.blobUrl);
    setViewer(null);
  };

  const exportCsv = () => {
    const csv = buildDocumentsCsv(filtered, customCats);
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'document-wallet.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const loadRemindersPreview = async () => {
    try {
      const data = await documentsApi.remindersPreview(30);
      setRemindersPreview(data);
    } catch (err) {
      toast.error('Could not load reminders preview');
    }
  };

  const sendRemindersNow = async () => {
    try {
      const res = await documentsApi.remindersSendNow();
      toast.success(res.sent ? `Digest sent to ${res.recipients} recipient(s)` : 'Nothing due to send');
    } catch (err) {
      toast.error('Could not send reminders');
    }
  };

  if (isLoading) return <div className="p-8 text-sm text-[var(--t-sub)]">Loading Document Wallet…</div>;

  return (
    <div className="doc-wallet" {...getRootProps()}>
      {isDragActive && (
        <div className="doc-wallet-dropmask">
          <ArrowUpTrayIcon className="w-10 h-10" />
          <p>Drop a file to start a new document</p>
        </div>
      )}

      <header className="doc-wallet-header">
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2"><FolderIcon className="w-5 h-5" /> Document Wallet</h1>
          <p className="text-xs text-[var(--t-sub)]">Compliance & legal documents, with renewal tracking</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="doc-wallet-search">
            <MagnifyingGlassIcon className="w-4 h-4" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search documents…" />
          </div>
          <button className="btn-secondary" onClick={exportCsv}>Export CSV</button>
          {isManagerOrAbove && (
            <button className="btn-secondary" onClick={() => { loadRemindersPreview(); }}>
              <BellAlertIcon className="w-4 h-4" /> Reminders
            </button>
          )}
          {isManagerOrAbove && (
            driveStatus?.connected ? (
              <span className="btn-secondary" title={`Connected as ${driveStatus.connectedEmail}`} style={{ cursor: 'default' }}>
                <FolderIcon className="w-4 h-4" /> Drive: {driveStatus.connectedEmail}
              </span>
            ) : (
              <button className="btn-secondary" onClick={connectDrive}>
                <FolderIcon className="w-4 h-4" /> Connect Google Drive
              </button>
            )
          )}
          <button className="btn-primary" onClick={() => { setEditingDocId(null); setNewDocForm(emptyForm); setNewDocFiles([]); setNewDocOpen(true); }}>
            <PlusIcon className="w-4 h-4" /> New document
          </button>
        </div>
      </header>

      {isError && <div className="doc-wallet-error">⚠ Could not reach the backend — showing cached data if any.</div>}

      <div className="doc-wallet-body">
        <aside className="doc-wallet-sidebar">
          {allCats.map((c) => (
            <button
              key={c.id}
              className={`doc-wallet-cat ${activeCat === c.id && view === 'docs' ? 'active' : ''}`}
              onClick={() => { setActiveCat(c.id); setView('docs'); }}
            >
              <span>{c.name}</span>
              {c.id !== 'all' && <span className="doc-wallet-cat-count">{catCounts[c.id] || 0}</span>}
            </button>
          ))}
          {isManagerOrAbove && (
            <button className={`doc-wallet-cat ${view === 'trash' ? 'active' : ''}`} onClick={() => setView('trash')}>
              <span className="flex items-center gap-1"><TrashIcon className="w-3.5 h-3.5" /> Recycle Bin</span>
              <span className="doc-wallet-cat-count">{trash.length}</span>
            </button>
          )}
          {isManagerOrAbove && (
            <button className="doc-wallet-cat text-xs opacity-70" onClick={() => setAddCategoryOpen(true)}>
              <span className="flex items-center gap-1"><PlusIcon className="w-3.5 h-3.5" /> Add folder</span>
            </button>
          )}
        </aside>

        <main className="doc-wallet-main">
          {view === 'docs' && activeCat === 'all' && !query && statusFilter === 'all' && (
            <>
              <div className="doc-wallet-stats">
                <div className="stat-card"><div><div className="text-xs text-[var(--t-sub)]">Documents</div><div className="text-xl font-bold">{stats.total}</div></div></div>
                <div className="stat-card"><div><div className="text-xs text-[var(--t-sub)]">Folders in use</div><div className="text-xl font-bold">{stats.foldersInUse}</div></div></div>
                <div className="stat-card"><div><div className="text-xs text-[var(--t-sub)]">Expiring ≤90d</div><div className="text-xl font-bold text-amber-500">{stats.soon}</div></div></div>
                <div className="stat-card"><div><div className="text-xs text-[var(--t-sub)]">Expired</div><div className="text-xl font-bold text-red-500">{stats.expired}</div></div></div>
                <div className="stat-card"><div><div className="text-xs text-[var(--t-sub)]">Files in Drive</div><div className="text-xl font-bold">{stats.filesInDrive}</div></div></div>
              </div>

              {radarItems.length > 0 && (
                <div className="card doc-wallet-radar">
                  <h3 className="text-sm font-bold mb-2">Renewal radar</h3>
                  <ul>
                    {radarItems.map((d) => {
                      const s = docStatus(d);
                      return (
                        <li key={d._id} onClick={() => setOpenDocId(d._id)}>
                          <span className={`badge ${STATUS_BADGE[s.k]}`}>{s.label}</span>
                          <span className="doc-wallet-radar-name">{d.name}</span>
                          <span className="doc-wallet-radar-days">{s.days}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </>
          )}

          {view === 'docs' && (
            <>
              <div className="doc-wallet-chips">
                {['all', 'expired', 'soon', 'ok', 'none'].map((k) => (
                  <button key={k} className={`doc-wallet-chip ${statusFilter === k ? 'active' : ''}`} onClick={() => setStatusFilter(k)}>
                    {{ all: 'All', expired: 'Expired', soon: 'Expiring', ok: 'Valid', none: 'No expiry' }[k]}
                  </button>
                ))}
              </div>

              <table className="doc-wallet-table">
                <thead>
                  <tr>
                    <th onClick={() => { setSortKey('name'); setSortDir((d) => (sortKey === 'name' ? -d : 1)); }}>Name</th>
                    <th>Folder</th>
                    <th onClick={() => { setSortKey('expiry'); setSortDir((d) => (sortKey === 'expiry' ? -d : 1)); }}>Expiry</th>
                    <th onClick={() => { setSortKey('status'); setSortDir((d) => (sortKey === 'status' ? -d : 1)); }}>Status</th>
                    <th>Custodian</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((d) => {
                    const s = docStatus(d);
                    return (
                      <tr key={d._id} onClick={() => setOpenDocId(d._id)}>
                        <td className="font-medium">{d.name}</td>
                        <td className="text-[var(--t-sub)]">{catName(d.category, customCats)}</td>
                        <td className="text-[var(--t-sub)]">{d.expiryDate ? d.expiryDate.slice(0, 10) : '—'}</td>
                        <td><span className={`badge ${STATUS_BADGE[s.k]}`}>{s.label}</span></td>
                        <td className="text-[var(--t-sub)]">{d.keeper || '—'}</td>
                      </tr>
                    );
                  })}
                  {!filtered.length && (
                    <tr><td colSpan={5} className="text-center text-[var(--t-sub)] py-8">No documents match.</td></tr>
                  )}
                </tbody>
              </table>
            </>
          )}

          {view === 'trash' && (
            <>
              <div className="flex justify-end mb-2">
                {isManagerOrAbove && trash.length > 0 && (
                  <button
                    className="btn-secondary text-red-600"
                    onClick={() => setConfirmState({
                      title: 'Empty Recycle Bin?',
                      message: 'This permanently deletes every trashed document and file, including their Drive files. This cannot be undone.',
                      confirmLabel: 'Empty Recycle Bin',
                      onConfirm: () => { emptyTrashMutation.mutate(); setConfirmState(null); },
                    })}
                  >
                    Empty Recycle Bin
                  </button>
                )}
              </div>
              <table className="doc-wallet-table">
                <thead><tr><th>Item</th><th>Type</th><th>Deleted</th><th /></tr></thead>
                <tbody>
                  {trash.map((t) => (
                    <tr key={t._id}>
                      <td className="font-medium">{t.type === 'doc' ? t.doc?.name : `${t.docName} — ${t.file?.name}`}</td>
                      <td className="text-[var(--t-sub)]">{t.type === 'doc' ? 'Document' : 'File'}</td>
                      <td className="text-[var(--t-sub)]">{new Date(t.deletedAt).toLocaleDateString('en-IN')}</td>
                      <td className="flex gap-2 justify-end">
                        <button className="btn-secondary" onClick={() => restoreMutation.mutate(t._id)}><ArrowPathIcon className="w-3.5 h-3.5" /> Restore</button>
                        {isManagerOrAbove && (
                          <button
                            className="btn-secondary text-red-600"
                            onClick={() => setConfirmState({
                              title: 'Permanently delete?',
                              message: 'This cannot be undone — the file will also be removed from Google Drive.',
                              onConfirm: () => { purgeMutation.mutate(t._id); setConfirmState(null); },
                            })}
                          >
                            Purge
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!trash.length && <tr><td colSpan={4} className="text-center text-[var(--t-sub)] py-8">Recycle Bin is empty.</td></tr>}
                </tbody>
              </table>
            </>
          )}
        </main>
      </div>

      {/* ── Detail drawer ─────────────────────────────────────────────── */}
      {openDoc && createPortal(
        <div className="doc-wallet-drawer-overlay" onClick={() => setOpenDocId(null)}>
          <div className="doc-wallet-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="doc-wallet-drawer-head">
              <h2>{openDoc.name}</h2>
              <button onClick={() => setOpenDocId(null)}><XMarkIcon className="w-5 h-5" /></button>
            </div>
            <div className="doc-wallet-drawer-body">
              <div className="doc-wallet-meta-grid">
                <div><label>Folder</label><span>{catName(openDoc.category, customCats)}</span></div>
                <div><label>Doc No</label><span>{openDoc.docNo || '—'}</span></div>
                <div><label>Issue date</label><span>{openDoc.issueDate ? openDoc.issueDate.slice(0, 10) : '—'}</span></div>
                <div><label>Expiry date</label><span>{openDoc.expiryDate ? openDoc.expiryDate.slice(0, 10) : '—'}</span></div>
                <div><label>Issuer</label><span>{openDoc.issuer || '—'}</span></div>
                <div><label>Custodian</label><span>{openDoc.keeper || '—'}</span></div>
                <div><label>Location</label><span>{openDoc.location || '—'}</span></div>
              </div>
              {openDoc.notes && <p className="doc-wallet-notes">{openDoc.notes}</p>}

              <div className="doc-wallet-drawer-actions">
                <button className="btn-secondary" onClick={() => downloadLatestFile(openDoc)}>
                  <ArrowDownTrayIcon className="w-4 h-4" /> Download latest file
                </button>
                <button className="btn-secondary" onClick={() => { setNewVersionDocId(openDoc._id); setNewVersionForm({ v: '', date: new Date().toISOString().slice(0, 10), note: '', expiryDate: openDoc.expiryDate ? openDoc.expiryDate.slice(0, 10) : '' }); setNewVersionFiles([]); }}>
                  <ArrowUpTrayIcon className="w-4 h-4" /> New version
                </button>
                <button className="btn-secondary" onClick={() => shareViaEmail(openDoc)}>
                  <EnvelopeIcon className="w-4 h-4" /> Share via email
                </button>
                <button className="btn-secondary" onClick={() => copyDetails(openDoc)}>
                  <ClipboardDocumentIcon className="w-4 h-4" /> Copy details
                </button>
                <button className="btn-secondary" onClick={() => openEditDetails(openDoc)}>
                  <PencilSquareIcon className="w-4 h-4" /> Edit details
                </button>
                <button
                  className="btn-secondary text-red-600"
                  onClick={() => setConfirmState({
                    title: 'Delete document?',
                    message: 'Moves this document to the Recycle Bin — you can restore it later.',
                    onConfirm: () => { softDeleteMutation.mutate(openDoc._id); setOpenDocId(null); setConfirmState(null); },
                  })}
                >
                  <TrashIcon className="w-4 h-4" /> Delete
                </button>
              </div>

              <h3 className="text-sm font-bold mt-4 mb-2">Versions</h3>
              {(openDoc.versions || []).slice().reverse().map((v) => (
                <div key={v._id} className="doc-wallet-version">
                  <div className="doc-wallet-version-head">
                    <span className="font-semibold">{v.v}</span>
                    <span className="text-[var(--t-sub)]">{v.date || '—'}</span>
                  </div>
                  {v.note && <p className="text-xs text-[var(--t-sub)]">{v.note}</p>}
                  <ul className="doc-wallet-file-list">
                    {(v.files || []).map((f) => (
                      <li key={f._id}>
                        <DocumentTextIcon className="w-4 h-4" />
                        <span className="flex-1 truncate">{f.name}</span>
                        <button title="Preview" onClick={() => openViewerForDoc(openDoc, f)}><ArrowDownTrayIcon className="w-4 h-4" /></button>
                        <button
                          title="Delete file"
                          onClick={() => setConfirmState({
                            title: 'Delete file?',
                            message: `Moves "${f.name}" to the Recycle Bin.`,
                            onConfirm: () => { deleteVersionFileMutation.mutate({ docId: openDoc._id, versionId: v._id, fileId: f._id }); setConfirmState(null); },
                          })}
                        >
                          <XMarkIcon className="w-4 h-4" />
                        </button>
                      </li>
                    ))}
                    {!v.files?.length && <li className="text-[var(--t-sub)] text-xs">No files</li>}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* ── New document / edit details modal ───────────────────────────── */}
      {newDocOpen && createPortal(
        <div className="doc-wallet-modal-overlay" onClick={closeNewDocModal}>
          <form className="doc-wallet-modal" onClick={(e) => e.stopPropagation()} onSubmit={submitNewDoc}>
            <h3>{editingDocId ? 'Edit document details' : 'New document'}</h3>
            {!editingDocId && (
              <select onChange={(e) => applyTemplate(Number(e.target.value))} defaultValue="0">
                {TEMPLATES.map((t, i) => <option key={i} value={i}>{t.label}</option>)}
              </select>
            )}
            <input required placeholder="Document name" value={newDocForm.name} onChange={(e) => setNewDocForm({ ...newDocForm, name: e.target.value })} />
            <select required value={newDocForm.category} onChange={(e) => setNewDocForm({ ...newDocForm, category: e.target.value })}>
              <option value="">Select folder…</option>
              {[...BASE_CATEGORIES, ...customCats].map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input placeholder="Document number" value={newDocForm.docNo} onChange={(e) => setNewDocForm({ ...newDocForm, docNo: e.target.value })} />
            <div className="doc-wallet-modal-row">
              <label>Issue date<input type="date" value={newDocForm.issueDate} onChange={(e) => setNewDocForm({ ...newDocForm, issueDate: e.target.value })} /></label>
              <label>Expiry date<input type="date" value={newDocForm.expiryDate} onChange={(e) => setNewDocForm({ ...newDocForm, expiryDate: e.target.value })} /></label>
            </div>
            <input placeholder="Issuer" value={newDocForm.issuer} onChange={(e) => setNewDocForm({ ...newDocForm, issuer: e.target.value })} />
            <input placeholder="Custodian" value={newDocForm.keeper} onChange={(e) => setNewDocForm({ ...newDocForm, keeper: e.target.value })} />
            <input placeholder="Location" value={newDocForm.location} onChange={(e) => setNewDocForm({ ...newDocForm, location: e.target.value })} />
            <textarea placeholder="Notes" value={newDocForm.notes} onChange={(e) => setNewDocForm({ ...newDocForm, notes: e.target.value })} />
            {!editingDocId && (
              <>
                <input type="file" multiple onChange={(e) => setNewDocFiles([...e.target.files])} />
                {newDocFiles.length > 0 && <p className="text-xs text-[var(--t-sub)]">{newDocFiles.length} file(s) selected</p>}
              </>
            )}
            <div className="doc-wallet-modal-actions">
              <button type="button" className="btn-secondary" onClick={closeNewDocModal}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={createMutation.isPending || updateMutation.isPending}>{editingDocId ? 'Save' : 'Create'}</button>
            </div>
          </form>
        </div>,
        document.body,
      )}

      {/* ── New version modal ─────────────────────────────────────────── */}
      {newVersionDocId && createPortal(
        <div className="doc-wallet-modal-overlay" onClick={() => setNewVersionDocId(null)}>
          <form className="doc-wallet-modal" onClick={(e) => e.stopPropagation()} onSubmit={submitNewVersion}>
            <h3>Upload new version</h3>
            <input placeholder="Version label (auto-fills from file name, or type your own)" value={newVersionForm.v} onChange={(e) => setNewVersionForm({ ...newVersionForm, v: e.target.value })} />
            <input type="date" value={newVersionForm.date} onChange={(e) => setNewVersionForm({ ...newVersionForm, date: e.target.value })} />
            <textarea placeholder="Change note" value={newVersionForm.note} onChange={(e) => setNewVersionForm({ ...newVersionForm, note: e.target.value })} />
            <label>Updated expiry<input type="date" value={newVersionForm.expiryDate} onChange={(e) => setNewVersionForm({ ...newVersionForm, expiryDate: e.target.value })} /></label>
            <input type="file" multiple onChange={(e) => {
              const files = [...e.target.files];
              setNewVersionFiles(files);
              if (files.length && !newVersionForm.v.trim()) {
                setNewVersionForm((f) => ({ ...f, v: files[0].name.replace(/\.[^./]+$/, '') }));
              }
            }} />
            <div className="doc-wallet-modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setNewVersionDocId(null)}>Cancel</button>
              <button type="submit" className="btn-primary">Save version</button>
            </div>
          </form>
        </div>,
        document.body,
      )}

      {/* ── Add category modal ────────────────────────────────────────── */}
      {addCategoryOpen && createPortal(
        <div className="doc-wallet-modal-overlay" onClick={() => setAddCategoryOpen(false)}>
          <form
            className="doc-wallet-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => { e.preventDefault(); if (!newCategoryName.trim()) return; addCategoryMutation.mutate(newCategoryName); setNewCategoryName(''); setAddCategoryOpen(false); }}
          >
            <h3>Add folder</h3>
            <input required placeholder="Folder name" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} />
            <div className="doc-wallet-modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setAddCategoryOpen(false)}>Cancel</button>
              <button type="submit" className="btn-primary">Add</button>
            </div>
          </form>
        </div>,
        document.body,
      )}

      {/* ── Reminders preview panel ──────────────────────────────────── */}
      {remindersPreview && createPortal(
        <div className="doc-wallet-modal-overlay" onClick={() => setRemindersPreview(null)}>
          <div className="doc-wallet-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Renewal reminders (next {remindersPreview.threshold} days)</h3>
            <p className="text-xs text-[var(--t-sub)]">{remindersPreview.expired.length} expired, {remindersPreview.expiringSoon.length} expiring soon.</p>
            <ul className="doc-wallet-reminder-list">
              {[...remindersPreview.expired, ...remindersPreview.expiringSoon].map((e, i) => (
                <li key={i}><span>{e.name}</span><span className="text-[var(--t-sub)]">{e.folder}</span><span>{e.days < 0 ? `${Math.abs(e.days)}d overdue` : `${e.days}d left`}</span></li>
              ))}
              {!remindersPreview.expired.length && !remindersPreview.expiringSoon.length && <li className="text-[var(--t-sub)]">Nothing due.</li>}
            </ul>
            <div className="doc-wallet-modal-actions">
              <button className="btn-secondary" onClick={() => setRemindersPreview(null)}>Close</button>
              <button className="btn-primary" onClick={sendRemindersNow}>Send digest now</button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* ── File preview viewer ──────────────────────────────────────── */}
      {viewer && createPortal(
        <div className="doc-wallet-viewer-overlay" onClick={closeViewer}>
          <div className="doc-wallet-viewer" onClick={(e) => e.stopPropagation()}>
            <button className="doc-wallet-viewer-close" onClick={closeViewer}><XMarkIcon className="w-5 h-5" /></button>
            {viewer.index > 0 && (
              <button className="doc-wallet-viewer-nav left" onClick={() => setViewer((v) => ({ ...v, index: v.index - 1 }))}><ChevronLeftIcon className="w-6 h-6" /></button>
            )}
            {viewer.index < viewer.files.length - 1 && (
              <button className="doc-wallet-viewer-nav right" onClick={() => setViewer((v) => ({ ...v, index: v.index + 1 }))}><ChevronRightIcon className="w-6 h-6" /></button>
            )}
            <div className="doc-wallet-viewer-content">
              {viewer.loading && <p className="text-white">Loading…</p>}
              {!viewer.loading && viewer.blobUrl && (
                viewer.files[viewer.index].type?.startsWith('image/')
                  ? <img src={viewer.blobUrl} alt={viewer.files[viewer.index].name} />
                  : <iframe title="preview" src={viewer.blobUrl} />
              )}
            </div>
            <div className="doc-wallet-viewer-footer">
              <span>{viewer.files[viewer.index]?.name}</span>
              {viewer.blobUrl && <a className="btn-secondary" href={viewer.blobUrl} download={viewer.files[viewer.index]?.name}><ArrowDownTrayIcon className="w-4 h-4" /> Download</a>}
            </div>
          </div>
        </div>,
        document.body,
      )}

      {confirmState && (
        <ConfirmDialog
          open
          title={confirmState.title}
          message={confirmState.message}
          confirmLabel={confirmState.confirmLabel}
          onConfirm={confirmState.onConfirm}
          onCancel={() => setConfirmState(null)}
        />
      )}
    </div>
  );
}
