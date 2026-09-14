import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useDropzone } from 'react-dropzone';
import toast from 'react-hot-toast';
import {
  Folder, Plus, Search, X, Trash2, RefreshCw, FileText, Download, ChevronLeft, ChevronRight,
  BellRing, Upload as UploadIcon, Mail, Clipboard, Pencil, Eye, TriangleAlert,
} from 'lucide-react';
import {
  Button, Card, Drawer, Empty, Input, Menu, Modal, Select, Space, Spin, Statistic, Tag, Typography, Upload,
} from 'antd';
import documentsApi from '../../api/documents';
import { useAuthStore } from '../../store/useAuthStore';
import { BASE_CATEGORIES, TEMPLATES } from './documentTemplates';
import { docStatus, catName, latestFile, parseFilename, buildDocumentsCsv, docSummaryText, copyToClipboard, fmtSize } from './documentWalletHelpers';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import './DocumentWalletPage.css';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const STATUS_COLOR = { expired: 'red', soon: 'gold', ok: 'green', none: 'default' };
const emptyForm = { name: '', category: '', docNo: '', issueDate: '', expiryDate: '', issuer: '', keeper: '', location: '', notes: '' };

export default function DocumentWalletPage() {
  const qc = useQueryClient();
  const isManagerOrAbove = useAuthStore((s) => s.isManagerOrAbove)();
  const isAdminOrAbove = useAuthStore((s) => s.isAdminOrAbove)();
  const companyName = useAuthStore((s) => s.user?.organizationId?.name) || 'Company';

  const [activeCat, setActiveCat] = useState('all');
  const [view, setView] = useState('docs'); // 'docs' | 'trash'
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
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

  // ── derived: filter + sort (status priority, then name) ─────────────────
  const filtered = useMemo(() => {
    let list = documents;
    if (activeCat !== 'all') list = list.filter((d) => d.category === activeCat);
    if (statusFilter !== 'all') list = list.filter((d) => docStatus(d).k === statusFilter);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((d) => [d.name, d.docNo, d.issuer, d.keeper, d.notes].some((v) => (v || '').toLowerCase().includes(q)));
    }
    const statusRank = { expired: 0, soon: 1, ok: 2, none: 3 };
    return [...list].sort((a, b) => statusRank[docStatus(a).k] - statusRank[docStatus(b).k] || a.name.localeCompare(b.name));
  }, [documents, activeCat, statusFilter, query]);

  const stats = useMemo(() => {
    const expired = documents.filter((d) => docStatus(d).k === 'expired').length;
    const soon = documents.filter((d) => docStatus(d).k === 'soon').length;
    const foldersInUse = new Set(documents.map((d) => d.category)).size;
    const allFiles = documents.flatMap((d) => (d.versions || []).flatMap((v) => v.files || []));
    const filesInDrive = allFiles.length;
    const storageBytes = allFiles.reduce((s, f) => s + (f.size || 0), 0);
    const recent = [...documents].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).slice(0, 5);
    return { total: documents.length, foldersInUse, expired, soon, filesInDrive, storageBytes, recent };
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

  // ── drag & drop overlay → prefill new-doc drawer ────────────────────────
  const onDrop = useCallback((accepted) => {
    if (!accepted.length) return;
    const file = accepted[0];
    const parsed = parseFilename(file.name);
    setNewDocForm({ ...emptyForm, name: parsed.name || file.name, category: parsed.category || '', docNo: parsed.docNo || '', issueDate: parsed.issueDate || '' });
    setNewDocFiles([{ uid: file.name, name: file.name, originFileObj: file }]);
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
        for (const f of newDocFiles) {
          await documentsApi.uploadFile(doc._id, f.originFileObj).catch((err) => {
            failed += 1;
            toast.error(`"${f.name}" failed: ${err.response?.data?.message || err.message}`);
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
      for (const f of newVersionFiles) {
        await documentsApi.uploadFile(newVersionDocId, f.originFileObj).catch((err) => {
          failed += 1;
          toast.error(`"${f.name}" failed: ${err.response?.data?.message || err.message}`);
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

  if (isLoading) return <div style={{ padding: 32 }}><Spin /></div>;

  const CAP = 15 * 1024 * 1024 * 1024; // 15GB — standard Google account quota
  const gaugePct = Math.min(100, (stats.storageBytes / CAP) * 100);
  const R = 52, C = Math.PI * R, gaugeOff = C * (1 - gaugePct / 100);

  const menuItems = [
    ...allCats.map((c) => ({ key: `cat:${c.id}`, label: <Space style={{ width: '100%', justifyContent: 'space-between' }}><span>{c.name}</span>{c.id !== 'all' && <Tag style={{ marginRight: 0 }}>{catCounts[c.id] || 0}</Tag>}</Space> })),
    ...(isAdminOrAbove ? [{ key: 'trash', label: <Space style={{ width: '100%', justifyContent: 'space-between' }}><Space size={6}><Trash2 size={13} />Recycle Bin</Space><Tag style={{ marginRight: 0 }}>{trash.length}</Tag></Space> }] : []),
  ];

  return (
    <div className="doc-wallet" {...getRootProps()}>
      {isDragActive && (
        <div className="doc-wallet-dropmask">
          <UploadIcon className="w-10 h-10" />
          <p>Drop a file to start a new document</p>
        </div>
      )}

      <header className="doc-wallet-header">
        <div>
          <Title level={4} style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: 8 }}><Folder size={18} /> Document Wallet</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>Compliance & legal documents, with renewal tracking</Text>
        </div>
        <Space wrap>
          <Input
            value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search documents…"
            prefix={<Search size={14} color="#9ca3af" />} style={{ width: 200 }}
          />
          <Button onClick={exportCsv}>Export CSV</Button>
          {isManagerOrAbove && (
            <Button icon={<BellRing size={14} />} onClick={loadRemindersPreview}>Reminders</Button>
          )}
          {isManagerOrAbove && (
            driveStatus?.connected ? (
              <Tag icon={<Folder size={12} style={{ marginRight: 4 }} />} color="green" title={`Connected as ${driveStatus.connectedEmail}`}>
                Drive: {driveStatus.connectedEmail}
              </Tag>
            ) : (
              <Button icon={<Folder size={14} />} onClick={connectDrive}>Connect Google Drive</Button>
            )
          )}
          <Button type="primary" icon={<Plus size={14} />} onClick={() => { setEditingDocId(null); setNewDocForm(emptyForm); setNewDocFiles([]); setNewDocOpen(true); }}>
            New document
          </Button>
        </Space>
      </header>

      {isError && (
        <div className="doc-wallet-error">
          <Space size={6}><TriangleAlert size={13} /> Could not reach the backend — showing cached data if any.</Space>
        </div>
      )}

      <div className="doc-wallet-body">
        <aside className="doc-wallet-sidebar">
          <Menu
            mode="inline"
            selectedKeys={[view === 'trash' ? 'trash' : `cat:${activeCat}`]}
            items={menuItems}
            onClick={({ key }) => {
              if (key === 'trash') setView('trash');
              else { setActiveCat(key.replace('cat:', '')); setView('docs'); }
            }}
            style={{ border: 'none' }}
          />
          {isManagerOrAbove && (
            <Button type="text" size="small" icon={<Plus size={13} />} style={{ marginTop: 8, color: 'var(--t-sub)' }} onClick={() => setAddCategoryOpen(true)}>
              Add folder
            </Button>
          )}
        </aside>

        <main className="doc-wallet-main">
          {view === 'docs' && activeCat === 'all' && !query && statusFilter === 'all' && (
            <>
              <div className="doc-wallet-stats">
                <Card size="small" className="stat-card"><Statistic title="Documents" value={stats.total} /></Card>
                <Card size="small" className="stat-card"><Statistic title="Folders in use" value={stats.foldersInUse} /></Card>
                <Card size="small" className="stat-card"><Statistic title="Expiring ≤90d" value={stats.soon} valueStyle={{ color: '#d97706' }} /></Card>
                <Card size="small" className="stat-card"><Statistic title="Expired" value={stats.expired} valueStyle={{ color: '#dc2626' }} /></Card>
                <Card size="small" className="stat-card doc-wallet-gauge-card">
                  <div className="text-xs text-[var(--t-sub)] mb-1">Storage used</div>
                  <div className="doc-wallet-gauge">
                    <svg viewBox="0 0 118 62">
                      <path d="M7 60 A52 52 0 0 1 111 60" fill="none" stroke="var(--b-default)" strokeWidth="9" strokeLinecap="round" />
                      <path d="M7 60 A52 52 0 0 1 111 60" fill="none" stroke="var(--zone)" strokeWidth="9" strokeLinecap="round"
                        strokeDasharray={C.toFixed(1)} strokeDashoffset={gaugeOff.toFixed(1)} />
                    </svg>
                    <div className="doc-wallet-gauge-value">{fmtSize(stats.storageBytes)}</div>
                  </div>
                  <div className="doc-wallet-gauge-cap">of 15 GB · {stats.filesInDrive} file{stats.filesInDrive === 1 ? '' : 's'}</div>
                </Card>
                {stats.recent.length > 0 && (
                  <Card size="small" className="stat-card doc-wallet-recent-card" style={{ flex: '2 1 240px' }}>
                    <div className="text-xs text-[var(--t-sub)] mb-1">Recently updated</div>
                    <div className="doc-wallet-recent">
                      {stats.recent.map((d) => (
                        <button key={d._id} className="doc-wallet-recent-item" onClick={() => setOpenDocId(d._id)}>
                          <Tag color="green" style={{ marginRight: 0 }}>{d.versions?.[d.versions.length - 1]?.v || 'v1.0'}</Tag>
                          <span className="n">{d.name}</span>
                          <span className="d">{d.updatedAt ? d.updatedAt.slice(0, 10) : ''}</span>
                        </button>
                      ))}
                    </div>
                  </Card>
                )}
              </div>

              {radarItems.length > 0 && (
                <Card size="small" className="doc-wallet-radar">
                  <Title level={5} style={{ marginBottom: 8 }}>Renewal radar</Title>
                  <ul>
                    {radarItems.map((d) => {
                      const s = docStatus(d);
                      return (
                        <li key={d._id} onClick={() => setOpenDocId(d._id)}>
                          <Tag color={STATUS_COLOR[s.k]}>{s.label}</Tag>
                          <span className="doc-wallet-radar-name">{d.name}</span>
                          <span className="doc-wallet-radar-days">{s.days}</span>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              )}
            </>
          )}

          {view === 'docs' && (
            <>
              <div className="doc-wallet-chips">
                {['all', 'expired', 'soon', 'ok', 'none'].map((k) => (
                  <Tag.CheckableTag key={k} checked={statusFilter === k} onChange={() => setStatusFilter(k)}>
                    {{ all: 'All', expired: 'Expired', soon: 'Expiring', ok: 'Valid', none: 'No expiry' }[k]}
                  </Tag.CheckableTag>
                ))}
              </div>

              {!filtered.length ? (
                <Card><Empty description="No documents match." /></Card>
              ) : (
                <Card size="small" styles={{ body: { padding: 0 } }}>
                  {filtered.map((d, i) => {
                    const s = docStatus(d);
                    const f = latestFile(d);
                    return (
                      <div
                        key={d._id}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderTop: i ? '1px solid #f0f0f0' : 'none', cursor: 'pointer' }}
                        onClick={() => setOpenDocId(d._id)}
                      >
                        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                          <Text strong style={{ fontSize: 13 }}>{d.name}</Text>
                        </div>
                        <Text type="secondary" style={{ fontSize: 12, flex: '0 0 120px' }}>{catName(d.category, customCats)}</Text>
                        <Text type="secondary" style={{ fontSize: 12, flex: '0 0 100px' }}>{d.expiryDate ? d.expiryDate.slice(0, 10) : '—'}</Text>
                        <Tag color={STATUS_COLOR[s.k]} style={{ flex: '0 0 auto' }}>{s.label}</Tag>
                        <Text type="secondary" style={{ fontSize: 12, flex: '0 0 100px' }}>{d.keeper || '—'}</Text>
                        <Space size={4} onClick={(e) => e.stopPropagation()} style={{ flex: '0 0 auto' }}>
                          <Button size="small" type="text" disabled={!f} title={f ? 'Preview latest file' : 'No file attached yet'} icon={<Eye size={13} />} onClick={() => { if (!f) return toast.error('No file attached yet'); openViewerForDoc(d, f); }} />
                          <Button size="small" type="text" title="Download latest file" icon={<Download size={13} />} onClick={() => downloadLatestFile(d)} />
                          <Button
                            size="small" type="text" title="Attach a new version" icon={<UploadIcon size={13} />}
                            onClick={() => {
                              setNewVersionDocId(d._id);
                              setNewVersionForm({ v: '', date: new Date().toISOString().slice(0, 10), note: '', expiryDate: d.expiryDate ? d.expiryDate.slice(0, 10) : '' });
                              setNewVersionFiles([]);
                            }}
                          />
                          <Button size="small" type="text" title="Share via email" icon={<Mail size={13} />} onClick={() => shareViaEmail(d)} />
                        </Space>
                      </div>
                    );
                  })}
                </Card>
              )}
            </>
          )}

          {view === 'trash' && (
            <>
              <div className="flex justify-end mb-2">
                {isAdminOrAbove && trash.length > 0 && (
                  <Button
                    danger
                    onClick={() => setConfirmState({
                      title: 'Empty Recycle Bin?',
                      message: 'This permanently deletes every trashed document and file, including their Drive files. This cannot be undone.',
                      confirmLabel: 'Empty Recycle Bin',
                      onConfirm: () => { emptyTrashMutation.mutate(); setConfirmState(null); },
                    })}
                  >
                    Empty Recycle Bin
                  </Button>
                )}
              </div>
              {!trash.length ? (
                <Card><Empty description="Recycle Bin is empty." /></Card>
              ) : (
                <Card size="small" styles={{ body: { padding: 0 } }}>
                  {trash.map((t, i) => (
                    <div key={t._id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderTop: i ? '1px solid #f0f0f0' : 'none' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Text strong style={{ fontSize: 13 }}>{t.type === 'doc' ? t.doc?.name : `${t.docName} — ${t.file?.name}`}</Text>
                      </div>
                      <Text type="secondary" style={{ fontSize: 12, flex: '0 0 90px' }}>{t.type === 'doc' ? 'Document' : 'File'}</Text>
                      <Text type="secondary" style={{ fontSize: 12, flex: '0 0 110px' }}>{new Date(t.deletedAt).toLocaleDateString('en-IN')}</Text>
                      <Space size={8}>
                        <Button size="small" icon={<RefreshCw size={13} />} onClick={() => restoreMutation.mutate(t._id)}>Restore</Button>
                        {isAdminOrAbove && (
                          <Button
                            size="small" danger
                            onClick={() => setConfirmState({
                              title: 'Permanently delete?',
                              message: 'This cannot be undone — the file will also be removed from Google Drive.',
                              onConfirm: () => { purgeMutation.mutate(t._id); setConfirmState(null); },
                            })}
                          >
                            Purge
                          </Button>
                        )}
                      </Space>
                    </div>
                  ))}
                </Card>
              )}
            </>
          )}
        </main>
      </div>

      {/* ── Detail drawer ─────────────────────────────────────────────── */}
      <Drawer
        title={openDoc?.name}
        open={!!openDoc}
        onClose={() => setOpenDocId(null)}
        width={480}
        closeIcon={<X size={18} />}
      >
        {openDoc && (
          <>
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

            <Space wrap style={{ marginBottom: 16 }}>
              <Button size="small" icon={<Download size={13} />} onClick={() => downloadLatestFile(openDoc)}>Download latest file</Button>
              <Button
                size="small" icon={<UploadIcon size={13} />}
                onClick={() => { setNewVersionDocId(openDoc._id); setNewVersionForm({ v: '', date: new Date().toISOString().slice(0, 10), note: '', expiryDate: openDoc.expiryDate ? openDoc.expiryDate.slice(0, 10) : '' }); setNewVersionFiles([]); }}
              >
                New version
              </Button>
              <Button size="small" icon={<Mail size={13} />} onClick={() => shareViaEmail(openDoc)}>Share via email</Button>
              <Button size="small" icon={<Clipboard size={13} />} onClick={() => copyDetails(openDoc)}>Copy details</Button>
              <Button size="small" icon={<Pencil size={13} />} onClick={() => openEditDetails(openDoc)}>Edit details</Button>
              <Button
                size="small" danger icon={<Trash2 size={13} />}
                onClick={() => setConfirmState({
                  title: 'Delete document?',
                  message: 'Moves this document to the Recycle Bin — you can restore it later.',
                  onConfirm: () => { softDeleteMutation.mutate(openDoc._id); setOpenDocId(null); setConfirmState(null); },
                })}
              >
                Delete
              </Button>
            </Space>

            <Title level={5} style={{ marginBottom: 8 }}>Versions</Title>
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
                      <FileText className="w-4 h-4" />
                      <span className="flex-1 truncate">{f.name}</span>
                      <button title="Preview" onClick={() => openViewerForDoc(openDoc, f)}><Eye className="w-4 h-4" /></button>
                      <button
                        title="Delete file"
                        onClick={() => setConfirmState({
                          title: 'Delete file?',
                          message: `Moves "${f.name}" to the Recycle Bin.`,
                          onConfirm: () => { deleteVersionFileMutation.mutate({ docId: openDoc._id, versionId: v._id, fileId: f._id }); setConfirmState(null); },
                        })}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                  {!v.files?.length && <li className="text-[var(--t-sub)] text-xs">No files</li>}
                </ul>
              </div>
            ))}
          </>
        )}
      </Drawer>

      {/* ── New document / edit details drawer ──────────────────────────── */}
      <Drawer
        title={editingDocId ? 'Edit document details' : 'New document'}
        open={newDocOpen}
        onClose={closeNewDocModal}
        width={420}
        closeIcon={<X size={18} />}
        footer={
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={closeNewDocModal}>Cancel</Button>
            <Button type="primary" loading={createMutation.isPending || updateMutation.isPending} onClick={submitNewDoc}>{editingDocId ? 'Save' : 'Create'}</Button>
          </Space>
        }
      >
        <form onSubmit={submitNewDoc}>
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            {!editingDocId && (
              <Select
                style={{ width: '100%' }} defaultValue={0} onChange={(v) => applyTemplate(Number(v))}
                options={TEMPLATES.map((t, i) => ({ label: t.label, value: i }))}
              />
            )}
            <Input required placeholder="Document name" value={newDocForm.name} onChange={(e) => setNewDocForm({ ...newDocForm, name: e.target.value })} />
            <Select
              style={{ width: '100%' }} placeholder="Select folder…" value={newDocForm.category || undefined}
              onChange={(v) => setNewDocForm({ ...newDocForm, category: v })}
              options={[...BASE_CATEGORIES, ...customCats].map((c) => ({ label: c.name, value: c.id }))}
            />
            <Input placeholder="Document number" value={newDocForm.docNo} onChange={(e) => setNewDocForm({ ...newDocForm, docNo: e.target.value })} />
            <div className="doc-wallet-modal-row">
              <label>Issue date<Input type="date" value={newDocForm.issueDate} onChange={(e) => setNewDocForm({ ...newDocForm, issueDate: e.target.value })} /></label>
              <label>Expiry date<Input type="date" value={newDocForm.expiryDate} onChange={(e) => setNewDocForm({ ...newDocForm, expiryDate: e.target.value })} /></label>
            </div>
            <Input placeholder="Issuer" value={newDocForm.issuer} onChange={(e) => setNewDocForm({ ...newDocForm, issuer: e.target.value })} />
            <Input placeholder="Custodian" value={newDocForm.keeper} onChange={(e) => setNewDocForm({ ...newDocForm, keeper: e.target.value })} />
            <Input placeholder="Location" value={newDocForm.location} onChange={(e) => setNewDocForm({ ...newDocForm, location: e.target.value })} />
            <TextArea placeholder="Notes" rows={3} value={newDocForm.notes} onChange={(e) => setNewDocForm({ ...newDocForm, notes: e.target.value })} />
            {!editingDocId && (
              <Upload multiple beforeUpload={() => false} fileList={newDocFiles} onChange={({ fileList }) => setNewDocFiles(fileList)}>
                <Button icon={<UploadIcon size={14} />}>Select files</Button>
              </Upload>
            )}
          </Space>
        </form>
      </Drawer>

      {/* ── New version drawer ────────────────────────────────────────── */}
      <Drawer
        title="Upload new version"
        open={!!newVersionDocId}
        onClose={() => setNewVersionDocId(null)}
        width={380}
        closeIcon={<X size={18} />}
        footer={
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={() => setNewVersionDocId(null)}>Cancel</Button>
            <Button type="primary" onClick={submitNewVersion}>Save version</Button>
          </Space>
        }
      >
        <form onSubmit={submitNewVersion}>
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <Input placeholder="Version label (auto-fills from file name, or type your own)" value={newVersionForm.v} onChange={(e) => setNewVersionForm({ ...newVersionForm, v: e.target.value })} />
            <Input type="date" value={newVersionForm.date} onChange={(e) => setNewVersionForm({ ...newVersionForm, date: e.target.value })} />
            <TextArea placeholder="Change note" rows={3} value={newVersionForm.note} onChange={(e) => setNewVersionForm({ ...newVersionForm, note: e.target.value })} />
            <label>Updated expiry<Input type="date" value={newVersionForm.expiryDate} onChange={(e) => setNewVersionForm({ ...newVersionForm, expiryDate: e.target.value })} /></label>
            <Upload
              multiple beforeUpload={() => false} fileList={newVersionFiles}
              onChange={({ fileList }) => {
                setNewVersionFiles(fileList);
                if (fileList.length && !newVersionForm.v.trim()) {
                  setNewVersionForm((f) => ({ ...f, v: fileList[0].name.replace(/\.[^./]+$/, '') }));
                }
              }}
            >
              <Button icon={<UploadIcon size={14} />}>Select files</Button>
            </Upload>
          </Space>
        </form>
      </Drawer>

      {/* ── Add category drawer ───────────────────────────────────────── */}
      <Drawer
        title="Add folder"
        open={addCategoryOpen}
        onClose={() => setAddCategoryOpen(false)}
        width={340}
        closeIcon={<X size={18} />}
        footer={
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={() => setAddCategoryOpen(false)}>Cancel</Button>
            <Button
              type="primary" disabled={!newCategoryName.trim()}
              onClick={() => { addCategoryMutation.mutate(newCategoryName); setNewCategoryName(''); setAddCategoryOpen(false); }}
            >
              Add
            </Button>
          </Space>
        }
      >
        <Input required placeholder="Folder name" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} />
      </Drawer>

      {/* ── Reminders preview modal ──────────────────────────────────── */}
      <Modal
        title={remindersPreview ? `Renewal reminders (next ${remindersPreview.threshold} days)` : ''}
        open={!!remindersPreview}
        onCancel={() => setRemindersPreview(null)}
        footer={
          <Space>
            <Button onClick={() => setRemindersPreview(null)}>Close</Button>
            <Button type="primary" onClick={sendRemindersNow}>Send digest now</Button>
          </Space>
        }
      >
        {remindersPreview && (
          <>
            <Text type="secondary" style={{ fontSize: 12 }}>{remindersPreview.expired.length} expired, {remindersPreview.expiringSoon.length} expiring soon.</Text>
            <ul className="doc-wallet-reminder-list">
              {[...remindersPreview.expired, ...remindersPreview.expiringSoon].map((e, i) => (
                <li key={i}><span>{e.name}</span><span className="text-[var(--t-sub)]">{e.folder}</span><span>{e.days < 0 ? `${Math.abs(e.days)}d overdue` : `${e.days}d left`}</span></li>
              ))}
              {!remindersPreview.expired.length && !remindersPreview.expiringSoon.length && <li className="text-[var(--t-sub)]">Nothing due.</li>}
            </ul>
          </>
        )}
      </Modal>

      {/* ── File preview viewer (pure lightbox, not a form) ─────────────── */}
      {viewer && (
        <div className="doc-wallet-viewer-overlay" onClick={closeViewer}>
          <div className="doc-wallet-viewer" onClick={(e) => e.stopPropagation()}>
            <button className="doc-wallet-viewer-close" onClick={closeViewer}><X className="w-5 h-5" /></button>
            {viewer.index > 0 && (
              <button className="doc-wallet-viewer-nav left" onClick={() => setViewer((v) => ({ ...v, index: v.index - 1 }))}><ChevronLeft className="w-6 h-6" /></button>
            )}
            {viewer.index < viewer.files.length - 1 && (
              <button className="doc-wallet-viewer-nav right" onClick={() => setViewer((v) => ({ ...v, index: v.index + 1 }))}><ChevronRight className="w-6 h-6" /></button>
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
              {viewer.blobUrl && <a className="btn-secondary" href={viewer.blobUrl} download={viewer.files[viewer.index]?.name}><Download className="w-4 h-4" /> Download</a>}
            </div>
          </div>
        </div>
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
