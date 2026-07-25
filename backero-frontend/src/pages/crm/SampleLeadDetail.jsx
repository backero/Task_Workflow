import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, formatDistanceToNowStrict } from 'date-fns';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import { FONT_IMPORT, PILL, SUB_STAGE_PILL } from './SampleProduction';

// Full per-lead "Sample Development" window — mirrors the reference design's 7-tab customer
// window (Overview / Q&A / Products / Formulas / Samples / Payments / Approvals). Everything
// here reads/writes the same Lead record; customFormulas, productLinks and samples are new
// embedded arrays on Lead (see backero-backend/src/models/Lead.js), samples are versioned and
// chainable (a Rejected sample can spawn a new version via "New Version"). Colors/fonts match
// SampleProduction.jsx's cream palette, imported from there so both stay in sync.

const SUB_STAGES = ['Requested', 'In Lab', 'Sent', 'Feedback', 'Approved', 'Rejected'];
const TABS = ['Overview', 'Q&A', 'Products', 'Formulas', 'Samples', 'Payments', 'Approvals'];
const bodyFont = { fontFamily: "'Inter', -apple-system, sans-serif" };
const displayFont = { fontFamily: "'Fraunces', Georgia, serif" };
const inputCls = 'px-3 py-2 text-sm rounded-[10px] border-[1.5px] border-[#d3c9b4] bg-[#f0eadd] text-[#2e241b] focus:outline-none focus:border-[#968871] placeholder:text-[#968871]';
const accentBtn = 'inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#f2b23e] text-[#2e241b] text-xs font-bold hover:brightness-95 transition disabled:opacity-50';
const outlineBtn = 'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border-[1.5px] border-[#d3c9b4] text-[#6d5f4c] text-xs font-semibold hover:bg-[#e7dfce] hover:border-[#968871] hover:text-[#2e241b] transition';
const textLink = 'text-xs font-semibold text-[#4a3a29] hover:text-[#2e241b]';

export default function SampleLeadDetail({ leadId, onClose }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState('Overview');

  // Q&A
  const [showRaiseForm, setShowRaiseForm] = useState(false);
  const [queryTitle, setQueryTitle] = useState('');
  const [queryDesc, setQueryDesc] = useState('');
  const [queryUrgency, setQueryUrgency] = useState('medium');
  const [replyDrafts, setReplyDrafts] = useState({});

  // Products
  const [showProductForm, setShowProductForm] = useState(false);
  const [prodSearch, setProdSearch] = useState('');
  const [selectedCatalogProduct, setSelectedCatalogProduct] = useState(null);
  const [prodBasis, setProdBasis] = useState('House Formula');
  const [prodPrice, setProdPrice] = useState('');

  // Formulas
  const [showFormulaForm, setShowFormulaForm] = useState(false);
  const [formulaName, setFormulaName] = useState('');
  const [formulaProductLink, setFormulaProductLink] = useState('');
  const [formulaCost, setFormulaCost] = useState('');
  const [rmSearch, setRmSearch] = useState('');
  const [formulaRows, setFormulaRows] = useState([]);

  // Move to Production — creates the Batch Tracker order in the same step, no separate
  // "Send to Production" visit required.
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [moveCatalogSearch, setMoveCatalogSearch] = useState('');
  const [moveSelectedCatalogProduct, setMoveSelectedCatalogProduct] = useState(null);
  const [moveBatchSizeKg, setMoveBatchSizeKg] = useState(10);

  const { data: catalogProducts } = useQuery({
    queryKey: ['catalog', 'products', 'all'],
    queryFn: () => api.get('/catalog/products').then((r) => r.data.products || []),
    enabled: showProductForm || showMoveModal,
    staleTime: 5 * 60 * 1000,
  });
  const catalogMatches = prodSearch
    ? (catalogProducts || []).filter((p) => (p.name || '').toLowerCase().includes(prodSearch.toLowerCase()) || (p.code || '').toLowerCase().includes(prodSearch.toLowerCase()))
    : (catalogProducts || []);
  const moveCatalogMatches = moveCatalogSearch
    ? (catalogProducts || []).filter((p) => (p.name || '').toLowerCase().includes(moveCatalogSearch.toLowerCase()) || (p.code || '').toLowerCase().includes(moveCatalogSearch.toLowerCase()))
    : (catalogProducts || []);

  const { data: rawMaterials } = useQuery({
    queryKey: ['inventory', 'raw-materials', 'all'],
    queryFn: () => api.get('/inventory/raw-materials').then((r) => r.data.materials || []),
    enabled: showFormulaForm,
    staleTime: 5 * 60 * 1000,
  });
  const rmMatches = rmSearch
    ? (rawMaterials || []).filter((m) => (m.name || '').toLowerCase().includes(rmSearch.toLowerCase()))
    : (rawMaterials || []);
  const formulaRowsCost = formulaRows.reduce((sum, r) => sum + (Number(r.quantity) || 0) * (Number(r.costPerUnit) || 0), 0);

  // Samples
  const [showSampleForm, setShowSampleForm] = useState(false);
  const [newSampleFormulaId, setNewSampleFormulaId] = useState('');
  const [newSampleChainedFrom, setNewSampleChainedFrom] = useState('');
  const [openSampleId, setOpenSampleId] = useState(null);
  const [rejectFor, setRejectFor] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [feedbackDraft, setFeedbackDraft] = useState('');

  const { data: lead, isLoading } = useQuery({
    queryKey: ['crm', 'lead', leadId],
    queryFn: () => api.get(`/crm/leads/${leadId}`).then((r) => r.data.lead),
    enabled: !!leadId,
  });

  const { data: queries } = useQuery({
    queryKey: ['crm', 'lead', leadId, 'queries'],
    queryFn: () => api.get(`/crm/leads/${leadId}/queries`).then((r) => r.data.queries),
    enabled: !!leadId,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['crm', 'lead', leadId] });
    qc.invalidateQueries({ queryKey: ['crm', 'lead', leadId, 'queries'] });
    qc.invalidateQueries({ queryKey: ['sample-production'] });
  };

  const raiseMutation = useMutation({
    mutationFn: (body) => api.post(`/crm/leads/${leadId}/query`, body),
    onSuccess: () => { toast.success('Query raised'); setQueryTitle(''); setQueryDesc(''); setShowRaiseForm(false); invalidate(); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to raise query'),
  });

  const replyMutation = useMutation({
    mutationFn: ({ queryId, answer }) => api.put(`/crm/queries/${queryId}/reply`, { answer }),
    onSuccess: (_r, vars) => { toast.success('Reply sent'); setReplyDrafts((d) => ({ ...d, [vars.queryId]: '' })); invalidate(); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to reply'),
  });

  const paymentMutation = useMutation({
    mutationFn: (body) => api.put(`/crm/leads/${leadId}/sample`, body),
    onSuccess: () => { toast.success('Payment status updated'); invalidate(); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to update payment'),
  });

  const linkProductMutation = useMutation({
    mutationFn: (body) => api.post(`/crm/leads/${leadId}/products`, body),
    onSuccess: () => { toast.success('Product linked'); setProdSearch(''); setSelectedCatalogProduct(null); setProdPrice(''); setShowProductForm(false); invalidate(); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to link product'),
  });

  const updateProductMutation = useMutation({
    mutationFn: ({ productId, ...body }) => api.put(`/crm/leads/${leadId}/products/${productId}`, body),
    onSuccess: () => { toast.success('Updated'); invalidate(); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to update'),
  });

  const createFormulaMutation = useMutation({
    mutationFn: (body) => api.post(`/crm/leads/${leadId}/formulas`, body),
    onSuccess: () => { toast.success('Formula created'); setFormulaName(''); setFormulaProductLink(''); setFormulaCost(''); setFormulaRows([]); setShowFormulaForm(false); invalidate(); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to create formula'),
  });

  const updateFormulaMutation = useMutation({
    mutationFn: ({ formulaId, ...body }) => api.put(`/crm/leads/${leadId}/formulas/${formulaId}`, body),
    onSuccess: () => { toast.success('Formula updated'); invalidate(); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to update formula'),
  });

  const createSampleMutation = useMutation({
    mutationFn: (body) => api.post(`/crm/leads/${leadId}/samples`, body),
    onSuccess: () => { toast.success('Sample created'); setShowSampleForm(false); setNewSampleFormulaId(''); setNewSampleChainedFrom(''); invalidate(); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to create sample'),
  });

  const updateSampleMutation = useMutation({
    mutationFn: ({ sampleId, ...body }) => api.put(`/crm/leads/${leadId}/samples/${sampleId}`, body),
    onSuccess: () => { toast.success('Sample updated'); invalidate(); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to update sample'),
  });

  const sampleStatusMutation = useMutation({
    mutationFn: ({ sampleId, ...body }) => api.put(`/crm/leads/${leadId}/samples/${sampleId}/status`, body),
    onSuccess: () => { toast.success('Sample status updated'); setRejectFor(null); setRejectReason(''); invalidate(); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to update status'),
  });

  const feedbackMutation = useMutation({
    mutationFn: ({ sampleId, text }) => api.post(`/crm/leads/${leadId}/samples/${sampleId}/feedback`, { text }),
    onSuccess: () => { toast.success('Feedback logged'); setFeedbackDraft(''); invalidate(); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to log feedback'),
  });

  const moveToProductionMutation = useMutation({
    mutationFn: async ({ catalogProduct, batchSizeKg }) => {
      await api.put(`/crm/leads/${leadId}`, { status: 'In Progress' });
      return api.post(`/crm/leads/${leadId}/link-production`, { mode: 'create', catalogProduct, batchSizeKg });
    },
    onSuccess: () => {
      toast.success('Moved to Production — batch order created in Batch Tracker');
      qc.invalidateQueries({ queryKey: ['crm'] });
      qc.invalidateQueries({ queryKey: ['sample-production'] });
      invalidate();
      setShowMoveModal(false);
      setMoveSelectedCatalogProduct(null);
      setMoveCatalogSearch('');
      setMoveBatchSizeKg(10);
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to move to Production'),
  });

  if (!leadId) return null;

  const sd = lead?.sampleDetails || {};
  const isPaid = sd.paymentStatus === 'full_paid';
  const samples = lead?.samples || [];
  const formulas = lead?.customFormulas || [];
  const products = lead?.productLinks || [];
  const pendingQueries = (queries || []).filter((q) => q.status === 'pending').length;
  const approvedSamples = samples.filter((s) => s.status === 'Approved');
  const openSample = samples.find((s) => s.sampleId === openSampleId);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={bodyFont}>
      <style>{FONT_IMPORT}</style>
      <div className="absolute inset-0 bg-[#2e241b]/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#f0eadd] rounded-2xl shadow-[0_10px_40px_rgba(46,36,27,0.16)] w-full max-w-4xl border border-[#d3c9b4] flex flex-col" style={{ maxHeight: '90vh' }}>
        <div className="p-5 border-b border-[#e2dac8] bg-[#e7dfce] flex items-center justify-between flex-shrink-0 rounded-t-2xl">
          <div>
            <h3 className="font-bold text-[#2e241b]" style={displayFont}>{lead?.name || 'Loading…'}</h3>
            <p className="text-xs text-[#6d5f4c]">{lead?.company || '—'} · {lead?.phone}</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-lg hover:bg-[#ddd3be] flex items-center justify-center text-[#968871] hover:text-[#2e241b] text-lg">✕</button>
        </div>

        <div className="flex gap-1 px-5 pt-3 border-b border-[#e2dac8] flex-shrink-0 overflow-x-auto">
          {TABS.map((t) => {
            const count = t === 'Q&A' ? (queries || []).length : t === 'Products' ? products.length : t === 'Formulas' ? formulas.length : t === 'Samples' ? samples.length : t === 'Approvals' ? approvedSamples.length : null;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={clsx(
                  'px-3 py-2 text-sm font-semibold border-b-[2.5px] -mb-px transition-colors whitespace-nowrap',
                  tab === t ? 'border-[#f2b23e] text-[#2e241b]' : 'border-transparent text-[#6d5f4c] hover:text-[#2e241b]'
                )}
              >
                {t}
                {t === 'Q&A' && pendingQueries > 0 && <span className={clsx('ml-1.5 px-1.5 py-0.5 rounded-full text-[10px]', PILL.warning)}>{pendingQueries}</span>}
                {count !== null && t !== 'Q&A' && <span className={clsx('ml-1.5 px-1.5 py-0.5 rounded-full text-[10px]', PILL.gray)}>{count}</span>}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {isLoading && <p className="text-sm text-[#968871] text-center py-8">Loading…</p>}

          {!isLoading && tab === 'Overview' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className={clsx('px-2.5 py-1 rounded-full font-semibold', PILL.gray)}>{lead?.status}</span>
                <span className="text-[#968871]">→</span>
                <span className={clsx('px-2.5 py-1 rounded-full font-semibold', SUB_STAGE_PILL[sd.subStage] || SUB_STAGE_PILL.Requested)}>{sd.subStage || 'Requested'}</span>
                <span className="text-[#968871]">→</span>
                <span className={clsx('px-2.5 py-1 rounded-full font-semibold', isPaid ? PILL.success : PILL.warning)}>
                  {isPaid ? 'Paid' : 'Payment Pending'}
                </span>
                {lead?.productionOrderId && (
                  <>
                    <span className="text-[#968871]">→</span>
                    <span className={clsx('px-2.5 py-1 rounded-full font-semibold', PILL.info)}>
                      {lead.productionOrderId.orderNumber || 'Linked to Production'}
                    </span>
                  </>
                )}
              </div>

              {approvedSamples.length > 0 && !lead?.productionOrderId && (
                <div className={clsx('p-3 rounded-[10px] border', 'bg-[#dce9d4] border-[#b9d2af]')}>
                  <p className="text-sm font-semibold text-[#3a5f3c]">✓ {approvedSamples.length} sample(s) approved — ready to send to production</p>
                  <p className="text-xs text-[#3a5f3c]/80 mt-0.5">Open the Approvals tab and move this lead to Production — the Batch Tracker order gets created in the same step.</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-[#968871] mb-0.5">Business Type</p><p className="text-[#2e241b]">{lead?.businessType || '—'}</p></div>
                <div><p className="text-xs text-[#968871] mb-0.5">City</p><p className="text-[#2e241b]">{lead?.city || '—'}</p></div>
                <div><p className="text-xs text-[#968871] mb-0.5">Product interest</p><p className="text-[#2e241b]">{(lead?.productInterest || []).join(', ') || '—'}</p></div>
                <div><p className="text-xs text-[#968871] mb-0.5">Estimated value</p><p className="text-[#2e241b]">₹{(lead?.estimatedValue || 0).toLocaleString('en-IN')}</p></div>
                <div><p className="text-xs text-[#968871] mb-0.5">Assigned to</p><p className="text-[#2e241b]">{lead?.assignedTo ? `${lead.assignedTo.firstName} ${lead.assignedTo.lastName}` : 'Unassigned'}</p></div>
                <div><p className="text-xs text-[#968871] mb-0.5">Queries · Products · Formulas · Samples</p><p className="text-[#2e241b]">{(queries || []).length} · {products.length} · {formulas.length} · {samples.length}</p></div>
              </div>

              {lead?.notes && (
                <div>
                  <p className="text-xs text-[#968871] mb-1">Notes</p>
                  <p className="text-sm text-[#4a3a29] whitespace-pre-wrap">{lead.notes}</p>
                </div>
              )}
            </div>
          )}

          {!isLoading && tab === 'Q&A' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-[#968871] uppercase tracking-wide">
                  {(queries || []).length} quer{(queries || []).length === 1 ? 'y' : 'ies'} · {pendingQueries} open
                </p>
                <button onClick={() => setShowRaiseForm((v) => !v)} className={outlineBtn}>+ Raise Query</button>
              </div>

              {showRaiseForm && (
                <div className="p-3 rounded-[10px] border-[1.5px] border-dashed border-[#d3c9b4] bg-[#e7dfce] space-y-2">
                  <input value={queryTitle} onChange={(e) => setQueryTitle(e.target.value)} placeholder="Query title" className={clsx(inputCls, 'w-full')} />
                  <textarea value={queryDesc} onChange={(e) => setQueryDesc(e.target.value)} placeholder="Describe the question…" rows={2} className={clsx(inputCls, 'w-full')} />
                  <div className="flex items-center gap-2">
                    <select value={queryUrgency} onChange={(e) => setQueryUrgency(e.target.value)} className={inputCls}>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                    <button
                      onClick={() => {
                        if (!queryTitle.trim() || !queryDesc.trim()) { toast.error('Title and description required'); return; }
                        raiseMutation.mutate({ title: queryTitle.trim(), description: queryDesc.trim(), urgency: queryUrgency });
                      }}
                      disabled={raiseMutation.isPending}
                      className={clsx(accentBtn, 'ml-auto')}
                    >
                      {raiseMutation.isPending ? 'Raising…' : 'Submit'}
                    </button>
                  </div>
                </div>
              )}

              {(queries || []).length === 0 && !showRaiseForm && (
                <p className="text-sm text-[#968871] text-center py-6">No queries raised for this lead yet.</p>
              )}

              {(queries || []).map((q) => (
                <div key={q._id} className="p-3 rounded-[10px] border border-[#e2dac8] space-y-2">
                  <div className="flex items-center gap-2 flex-wrap text-[11px]">
                    <span className={clsx('px-2 py-0.5 rounded-full font-semibold', q.status === 'pending' ? PILL.warning : PILL.success)}>
                      {q.status}
                    </span>
                    <span className="text-[#968871]">{format(new Date(q.createdAt), 'dd MMM, hh:mm a')}</span>
                    <span className="text-[#968871]">· {q.urgency} urgency</span>
                  </div>
                  <p className="text-sm font-semibold text-[#2e241b]">{q.title}</p>
                  <p className="text-sm text-[#6d5f4c]">{q.description}</p>
                  {q.answer ? (
                    <div className={clsx('p-2 rounded-lg text-sm text-[#2e241b]', PILL.success)}>
                      <p className="text-[11px] text-[#3a5f3c] font-semibold mb-0.5">
                        {q.answeredBy ? `${q.answeredBy.firstName} ${q.answeredBy.lastName}` : 'Answered'}
                      </p>
                      {q.answer}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <input
                        value={replyDrafts[q._id] || ''}
                        onChange={(e) => setReplyDrafts((d) => ({ ...d, [q._id]: e.target.value }))}
                        placeholder="Type a reply…"
                        className={clsx(inputCls, 'flex-1')}
                      />
                      <button
                        onClick={() => {
                          const answer = (replyDrafts[q._id] || '').trim();
                          if (!answer) { toast.error('Reply cannot be empty'); return; }
                          replyMutation.mutate({ queryId: q._id, answer });
                        }}
                        disabled={replyMutation.isPending}
                        className={accentBtn}
                      >
                        Reply
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {!isLoading && tab === 'Products' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-[#968871] uppercase tracking-wide">{products.length} linked</p>
                <button onClick={() => setShowProductForm((v) => !v)} className={outlineBtn}>+ Link Product</button>
              </div>

              {showProductForm && (
                <div className="p-3 rounded-[10px] border-[1.5px] border-dashed border-[#d3c9b4] bg-[#e7dfce] space-y-2">
                  <div>
                    <input
                      value={selectedCatalogProduct ? selectedCatalogProduct.name : prodSearch}
                      onChange={(e) => { setProdSearch(e.target.value); setSelectedCatalogProduct(null); }}
                      placeholder="Search Product Catalog, or type a new name…"
                      className={clsx(inputCls, 'w-full')}
                    />
                    {prodSearch && !selectedCatalogProduct && (
                      <div className="mt-1 rounded-[10px] border border-[#d3c9b4] bg-[#f0eadd] max-h-32 overflow-y-auto">
                        {catalogMatches.length === 0 && <div className="px-3 py-2 text-xs text-[#968871]">No catalog match — "Add" below will link it as free-text.</div>}
                        {catalogMatches.slice(0, 8).map((p) => {
                          const price = p.variants?.[0]?.sellingPrice || p.variants?.[0]?.mrp || 0;
                          return (
                            <button key={p._id} type="button"
                              onClick={() => { setSelectedCatalogProduct(p); setProdSearch(''); setProdPrice(price ? String(price) : ''); }}
                              className="w-full text-left px-3 py-2 text-xs hover:bg-[#e7dfce] flex justify-between">
                              <span className="text-[#2e241b]">{p.name}</span>
                              <span className="text-[#968871] font-mono">{p.code}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {selectedCatalogProduct && <p className="text-[11px] text-[#968871] mt-1">Linked to real catalog SKU {selectedCatalogProduct.code}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <select value={prodBasis} onChange={(e) => setProdBasis(e.target.value)} className={inputCls} disabled={!!selectedCatalogProduct}>
                      <option value="House Formula">House Formula</option>
                      <option value="Client Provided">Client Provided</option>
                      <option value="Catalog SKU">Catalog SKU</option>
                    </select>
                    <input value={prodPrice} onChange={(e) => setProdPrice(e.target.value)} type="number" placeholder="Approx price" className={clsx(inputCls, 'w-32')} />
                    <button
                      onClick={() => {
                        const name = selectedCatalogProduct ? selectedCatalogProduct.name : prodSearch.trim();
                        if (!name) { toast.error('Product name required'); return; }
                        linkProductMutation.mutate({
                          name,
                          productId: selectedCatalogProduct?.code,
                          catalogProductId: selectedCatalogProduct?._id,
                          basis: prodBasis,
                          approxPrice: Number(prodPrice) || 0,
                        });
                      }}
                      disabled={linkProductMutation.isPending}
                      className={clsx(accentBtn, 'ml-auto')}
                    >
                      {linkProductMutation.isPending ? 'Linking…' : 'Add'}
                    </button>
                  </div>
                </div>
              )}

              {products.length === 0 && !showProductForm && <p className="text-sm text-[#968871] text-center py-6">No products linked yet.</p>}

              {products.length > 0 && (
                <div className="overflow-x-auto rounded-[10px] border border-[#e2dac8]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wide text-[#6d5f4c] border-b border-[#d3c9b4] bg-[#e7dfce]">
                        <th className="px-3 py-2">Product ID</th><th className="px-3 py-2">Basis</th><th className="px-3 py-2">Approx Price</th>
                        <th className="px-3 py-2">Price Status</th><th className="px-3 py-2">Payment</th><th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((p) => (
                        <tr key={p.productId} className="border-b border-[#e2dac8]">
                          <td className="px-3 py-2"><span className="font-mono text-xs text-[#6d5f4c]">{p.productId}</span><p className="text-[#2e241b] font-medium">{p.name}</p></td>
                          <td className="px-3 py-2 text-xs text-[#6d5f4c]">{p.basis}</td>
                          <td className="px-3 py-2 text-xs">₹{p.approxPrice.toLocaleString('en-IN')}</td>
                          <td className="px-3 py-2">
                            <select value={p.priceStatus} onChange={(e) => updateProductMutation.mutate({ productId: p.productId, priceStatus: e.target.value })}
                              className="text-[10px] font-semibold rounded-full px-2 py-0.5 border border-[#d3c9b4] bg-[#f0eadd] text-[#4a3a29]">
                              <option value="Pending">Pending</option>
                              <option value="Accepted">Accepted</option>
                              <option value="Rejected">Rejected</option>
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded-full', p.paymentStatus === 'full_paid' ? PILL.success : PILL.warning)}>
                              {p.paymentStatus === 'full_paid' ? 'Paid' : 'Pending'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            {p.paymentStatus !== 'full_paid' && (
                              <button onClick={() => updateProductMutation.mutate({ productId: p.productId, paymentStatus: 'full_paid' })}
                                className={textLink}>Mark Paid</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {!isLoading && tab === 'Formulas' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-[#968871] uppercase tracking-wide">{formulas.length} custom formula(s)</p>
                <button onClick={() => setShowFormulaForm((v) => !v)} className={outlineBtn}>+ New Custom Formula</button>
              </div>

              {showFormulaForm && (
                <div className="p-3 rounded-[10px] border-[1.5px] border-dashed border-[#d3c9b4] bg-[#e7dfce] space-y-2">
                  <input value={formulaName} onChange={(e) => setFormulaName(e.target.value)} placeholder="Formula name, e.g. Vitamin C Serum 15% + Ferulic" className={clsx(inputCls, 'w-full')} />
                  <input value={formulaProductLink} onChange={(e) => setFormulaProductLink(e.target.value)} placeholder="Product link (optional)" className={clsx(inputCls, 'w-full')} />

                  <div>
                    <p className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1">Ingredients (from Raw Materials)</p>
                    {formulaRows.length > 0 && (
                      <div className="space-y-1 mb-2">
                        {formulaRows.map((r, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs bg-[#f0eadd] rounded-lg px-2 py-1.5 border border-[#d3c9b4]">
                            <span className="flex-1 text-[#2e241b]">{r.name}</span>
                            <input type="number" value={r.quantity} onChange={(e) => setFormulaRows((rows) => rows.map((row, ri) => ri === i ? { ...row, quantity: e.target.value } : row))}
                              className="w-20 px-2 py-1 rounded border border-[#d3c9b4] bg-white" />
                            <span className="text-[#968871] w-6">{r.unit}</span>
                            <span className="text-[#6d5f4c] w-16 text-right">₹{r.costPerUnit}/{r.unit}</span>
                            <button type="button" onClick={() => setFormulaRows((rows) => rows.filter((_, ri) => ri !== i))} className="text-[#8c3a30] hover:opacity-70">✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                    <input
                      value={rmSearch}
                      onChange={(e) => setRmSearch(e.target.value)}
                      placeholder="Search raw materials…"
                      className={clsx(inputCls, 'w-full')}
                    />
                    {rmSearch && (
                      <div className="mt-1 rounded-[10px] border border-[#d3c9b4] bg-[#f0eadd] max-h-32 overflow-y-auto">
                        {rmMatches.length === 0 && <div className="px-3 py-2 text-xs text-[#968871]">No raw material found.</div>}
                        {rmMatches.slice(0, 8).map((m) => (
                          <button key={m._id} type="button"
                            onClick={() => { setFormulaRows((rows) => [...rows, { rawMaterialId: m._id, name: m.name, quantity: 0, unit: m.unit || 'g', costPerUnit: m.costPrice || 0 }]); setRmSearch(''); }}
                            className="w-full text-left px-3 py-2 text-xs hover:bg-[#e7dfce] flex justify-between">
                            <span className="text-[#2e241b]">{m.name}</span>
                            <span className="text-[#968871]">₹{m.costPrice || 0}/{m.unit}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {formulaRows.length === 0 && (
                      <input value={formulaCost} onChange={(e) => setFormulaCost(e.target.value)} type="number" placeholder="Cost/unit (manual, if no ingredients)" className={clsx(inputCls, 'flex-1')} />
                    )}
                    {formulaRows.length > 0 && (
                      <p className="text-sm font-semibold text-[#2e241b]">Computed cost: ₹{formulaRowsCost.toFixed(2)}</p>
                    )}
                    <button
                      onClick={() => {
                        if (!formulaName.trim()) { toast.error('Formula name required'); return; }
                        createFormulaMutation.mutate({
                          name: formulaName.trim(),
                          productLink: formulaProductLink.trim(),
                          rows: formulaRows.length ? formulaRows.map((r) => ({ ...r, quantity: Number(r.quantity) || 0 })) : undefined,
                          costPerUnit: formulaRows.length ? undefined : Number(formulaCost) || 0,
                        });
                      }}
                      disabled={createFormulaMutation.isPending}
                      className={clsx(accentBtn, 'ml-auto')}
                    >
                      {createFormulaMutation.isPending ? 'Creating…' : 'Create'}
                    </button>
                  </div>
                </div>
              )}

              {formulas.length === 0 && !showFormulaForm && <p className="text-sm text-[#968871] text-center py-6">No custom formulas yet.</p>}

              {formulas.length > 0 && (
                <div className="overflow-x-auto rounded-[10px] border border-[#e2dac8]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wide text-[#6d5f4c] border-b border-[#d3c9b4] bg-[#e7dfce]">
                        <th className="px-3 py-2">Formula ID</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Product Link</th>
                        <th className="px-3 py-2">Version</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Cost/Unit</th><th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {formulas.map((f) => {
                        const latest = f.versions[f.versions.length - 1];
                        return (
                          <tr key={f.formulaId} className="border-b border-[#e2dac8]">
                            <td className="px-3 py-2 font-mono text-xs text-[#6d5f4c]">{f.formulaId}</td>
                            <td className="px-3 py-2 text-[#2e241b] font-medium">{f.name}</td>
                            <td className="px-3 py-2 text-xs text-[#968871]">{f.productLink || '—'}</td>
                            <td className="px-3 py-2 text-xs">V{f.currentVersion}</td>
                            <td className="px-3 py-2">
                              <select value={latest?.status} onChange={(e) => updateFormulaMutation.mutate({ formulaId: f.formulaId, status: e.target.value })}
                                className="text-[10px] font-semibold rounded-full px-2 py-0.5 border border-[#d3c9b4] bg-[#f0eadd] text-[#4a3a29]">
                                <option value="Draft">Draft</option>
                                <option value="In Testing">In Testing</option>
                                <option value="Accepted">Accepted</option>
                                <option value="Rejected">Rejected</option>
                              </select>
                            </td>
                            <td className="px-3 py-2 text-xs">
                              ₹{(latest?.costPerUnit || 0).toFixed(2)}
                              {latest?.rows?.length > 0 && <p className="text-[10px] text-[#968871]">{latest.rows.length} ingredient(s)</p>}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <button onClick={() => updateFormulaMutation.mutate({ formulaId: f.formulaId, bumpVersion: true })}
                                className={textLink}>+ Version</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {!isLoading && tab === 'Samples' && !openSample && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-[#968871] uppercase tracking-wide">{samples.length} sample(s)</p>
                <button onClick={() => setShowSampleForm((v) => !v)} className={outlineBtn}>+ New Sample</button>
              </div>

              {!isPaid && (
                <p className="text-[11px] text-[#7a5a10]">🔒 Confirm the R&D/sampling fee in the Payments tab before this sample can move past "Requested".</p>
              )}

              {showSampleForm && (
                <div className="p-3 rounded-[10px] border-[1.5px] border-dashed border-[#d3c9b4] bg-[#e7dfce] space-y-2">
                  <select value={newSampleFormulaId} onChange={(e) => setNewSampleFormulaId(e.target.value)} className={clsx(inputCls, 'w-full')}>
                    <option value="">— No formula linked —</option>
                    {formulas.map((f) => <option key={f.formulaId} value={f.formulaId}>{f.formulaId} — {f.name}</option>)}
                  </select>
                  <div className="flex items-center gap-2">
                    <select value={newSampleChainedFrom} onChange={(e) => setNewSampleChainedFrom(e.target.value)} className={clsx(inputCls, 'flex-1')}>
                      <option value="">— Fresh sample (not chained) —</option>
                      {samples.filter((s) => s.status === 'Rejected').map((s) => <option key={s.sampleId} value={s.sampleId}>Chain from {s.sampleId} (V{s.version}, Rejected)</option>)}
                    </select>
                    <button
                      onClick={() => createSampleMutation.mutate({ formulaId: newSampleFormulaId || undefined, chainedFrom: newSampleChainedFrom || undefined })}
                      disabled={createSampleMutation.isPending}
                      className={accentBtn}
                    >
                      {createSampleMutation.isPending ? 'Creating…' : 'Create'}
                    </button>
                  </div>
                </div>
              )}

              {samples.length === 0 && !showSampleForm && <p className="text-sm text-[#968871] text-center py-6">No samples yet.</p>}

              {samples.length > 0 && (
                <div className="overflow-x-auto rounded-[10px] border border-[#e2dac8]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wide text-[#6d5f4c] border-b border-[#d3c9b4] bg-[#e7dfce]">
                        <th className="px-3 py-2">Sample ID</th><th className="px-3 py-2">Formula/Version</th><th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Days in Stage</th><th className="px-3 py-2">Courier</th><th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {samples.map((s) => {
                        const formula = formulas.find((f) => f.formulaId === s.formulaId);
                        const lastEvent = s.timeline?.[s.timeline.length - 1];
                        return (
                          <tr key={s.sampleId} className="border-b border-[#e2dac8]">
                            <td className="px-3 py-2">
                              <p className="font-mono text-xs text-[#2e241b] font-medium">{s.sampleId}</p>
                              {s.chainedFrom && <p className="text-[10px] text-[#968871]">↻ from {s.chainedFrom}</p>}
                            </td>
                            <td className="px-3 py-2 text-xs text-[#6d5f4c]">{s.formulaId ? `${s.formulaId} V${s.version}` : `V${s.version}`}{formula && <p className="text-[10px] text-[#968871]">{formula.name}</p>}</td>
                            <td className="px-3 py-2"><span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded-full', SUB_STAGE_PILL[s.status])}>{s.status}</span></td>
                            <td className="px-3 py-2 text-xs">{lastEvent ? formatDistanceToNowStrict(new Date(lastEvent.at)) : '—'}</td>
                            <td className="px-3 py-2 text-xs text-[#6d5f4c]">{s.courier || '—'}</td>
                            <td className="px-3 py-2 text-right">
                              <button onClick={() => setOpenSampleId(s.sampleId)} className={textLink}>View ▸</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {!isLoading && tab === 'Samples' && openSample && (
            <div className="space-y-4">
              <button onClick={() => setOpenSampleId(null)} className={textLink}>← Back to samples</button>

              <div>
                <p className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1">Traceability Chain</p>
                <div className="flex items-center gap-1.5 flex-wrap text-xs">
                  <span className={clsx('px-2 py-1 rounded-lg font-mono', PILL.gray)}>{lead?.name}</span>
                  <span className="text-[#968871]">→</span>
                  {openSample.queryId && <><span className={clsx('px-2 py-1 rounded-lg font-mono', PILL.gray)}>Query</span><span className="text-[#968871]">→</span></>}
                  {openSample.formulaId && <><span className={clsx('px-2 py-1 rounded-lg font-mono', PILL.gray)}>{openSample.formulaId} · V{openSample.version}</span><span className="text-[#968871]">→</span></>}
                  <span className="px-2 py-1 rounded-lg bg-[#f2b23e] text-[#2e241b] font-mono font-semibold">{openSample.sampleId}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className={clsx('text-xs font-semibold px-2.5 py-1 rounded-full', SUB_STAGE_PILL[openSample.status])}>{openSample.status}</span>
                {SUB_STAGES.filter((s) => s !== openSample.status).map((s) => {
                  const locked = s !== 'Requested' && !isPaid;
                  return (
                    <button
                      key={s}
                      disabled={locked || sampleStatusMutation.isPending}
                      onClick={() => { if (s === 'Rejected') { setRejectFor(openSample.sampleId); return; } sampleStatusMutation.mutate({ sampleId: openSample.sampleId, status: s }); }}
                      className={clsx('text-xs font-semibold px-2.5 py-1 rounded-full border-[1.5px] transition-colors', locked ? 'opacity-30 cursor-not-allowed border-[#d3c9b4] text-[#968871]' : 'border-[#d3c9b4] hover:border-[#968871] text-[#6d5f4c] hover:text-[#2e241b]')}
                    >
                      {locked ? '🔒 ' : ''}{s}
                    </button>
                  );
                })}
              </div>
              {rejectFor === openSample.sampleId && (
                <div className="flex items-center gap-2">
                  <input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Reason for rejection…" className={clsx(inputCls, 'flex-1')} />
                  <button
                    onClick={() => { if (!rejectReason.trim()) { toast.error('Reason required'); return; } sampleStatusMutation.mutate({ sampleId: openSample.sampleId, status: 'Rejected', rejectionReason: rejectReason.trim() }); }}
                    className={accentBtn}
                  >
                    Confirm Reject
                  </button>
                </div>
              )}
              {openSample.status === 'Rejected' && openSample.rejectionReason && (
                <p className="text-xs text-[#8c3a30]">Reason: {openSample.rejectionReason}</p>
              )}
              {openSample.status === 'Rejected' && (
                <button
                  onClick={() => { setTab('Samples'); setOpenSampleId(null); setShowSampleForm(true); setNewSampleChainedFrom(openSample.sampleId); setNewSampleFormulaId(openSample.formulaId || ''); }}
                  className={textLink}
                >
                  + Create next version (chained)
                </button>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-2">Courier</p>
                    <div className="space-y-2">
                      <input
                        defaultValue={openSample.courier || ''}
                        onBlur={(e) => { if (e.target.value !== openSample.courier) updateSampleMutation.mutate({ sampleId: openSample.sampleId, courier: e.target.value }); }}
                        placeholder="Courier"
                        className={clsx(inputCls, 'w-full')}
                      />
                      <input
                        defaultValue={openSample.awb || ''}
                        onBlur={(e) => { if (e.target.value !== openSample.awb) updateSampleMutation.mutate({ sampleId: openSample.sampleId, awb: e.target.value }); }}
                        placeholder="Docket / AWB"
                        className={clsx(inputCls, 'w-full')}
                      />
                      <button
                        onClick={() => updateSampleMutation.mutate({ sampleId: openSample.sampleId, sentAt: new Date().toISOString() })}
                        disabled={updateSampleMutation.isPending || !!openSample.sentAt}
                        className={clsx(textLink, 'disabled:opacity-50')}
                      >
                        {openSample.sentAt ? `Sent ${format(new Date(openSample.sentAt), 'dd MMM yyyy')}` : 'Mark as Dispatched'}
                      </button>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-2">Confirmation</p>
                    <label className="flex items-center gap-2 text-sm text-[#4a3a29]">
                      <input type="checkbox" checked={openSample.packagingConfirmed} onChange={(e) => updateSampleMutation.mutate({ sampleId: openSample.sampleId, packagingConfirmed: e.target.checked })} />
                      Packaging confirmed by customer
                    </label>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-2">Feedback Log</p>
                    <div className="space-y-2 mb-2">
                      {(openSample.feedbackLog || []).map((f, i) => (
                        <div key={i} className="p-2 rounded-lg bg-[#e7dfce] text-xs">
                          <p className="font-semibold text-[#4a3a29]">{f.by} · {format(new Date(f.at), 'dd MMM, hh:mm a')}</p>
                          <p className="text-[#6d5f4c]">{f.text}</p>
                        </div>
                      ))}
                      {(!openSample.feedbackLog || openSample.feedbackLog.length === 0) && <p className="text-xs text-[#968871]">No feedback logged yet.</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <input value={feedbackDraft} onChange={(e) => setFeedbackDraft(e.target.value)} placeholder="Log customer feedback…" className={clsx(inputCls, 'flex-1')} />
                      <button
                        onClick={() => { if (!feedbackDraft.trim()) { toast.error('Feedback cannot be empty'); return; } feedbackMutation.mutate({ sampleId: openSample.sampleId, text: feedbackDraft.trim() }); }}
                        disabled={feedbackMutation.isPending}
                        className={accentBtn}
                      >
                        Log
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-2">Timeline</p>
                  <div className="space-y-2">
                    {[...(openSample.timeline || [])].reverse().map((t, i) => (
                      <div key={i} className="text-xs border-l-2 border-[#d3c9b4] pl-2">
                        <p className="font-semibold text-[#4a3a29]">{t.event}</p>
                        <p className="text-[#968871]">{format(new Date(t.at), 'dd MMM yyyy, hh:mm a')}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {!isLoading && tab === 'Payments' && (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-2">R&D / Sampling Payment</p>
                <div className="flex items-center gap-2">
                  <span className={clsx('px-2.5 py-1 rounded-full text-xs font-semibold', isPaid ? PILL.success : PILL.warning)}>
                    {isPaid ? 'R&D fee paid' : 'R&D fee pending'}
                  </span>
                  <span className="text-xs text-[#968871]">₹{(sd.chargeAmount || 0).toLocaleString('en-IN')}</span>
                  {!isPaid && (
                    <button onClick={() => paymentMutation.mutate({ paymentStatus: 'full_paid' })} disabled={paymentMutation.isPending}
                      className={clsx(textLink, 'ml-auto')}>
                      Mark as Paid
                    </button>
                  )}
                </div>
                {!isPaid && <p className="text-[11px] text-[#7a5a10] mt-1">Every sample for this customer stays locked at "Requested" until this is confirmed.</p>}
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-[#968871] mb-0.5">Courier</p><p className="text-[#2e241b]">{sd.courier || '—'}</p></div>
                <div><p className="text-xs text-[#968871] mb-0.5">Sent date</p><p className="text-[#2e241b]">{sd.sentDate ? format(new Date(sd.sentDate), 'dd MMM yyyy') : '—'}</p></div>
              </div>

              {products.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-2">Per-product payment</p>
                  <div className="space-y-1.5">
                    {products.map((p) => (
                      <div key={p.productId} className="flex items-center justify-between text-sm p-2 rounded-lg bg-[#e7dfce]">
                        <span className="text-[#2e241b]">{p.name} <span className="text-xs text-[#968871] font-mono">{p.productId}</span></span>
                        <span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded-full', p.paymentStatus === 'full_paid' ? PILL.success : PILL.warning)}>
                          {p.paymentStatus === 'full_paid' ? 'Paid' : 'Pending'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {!isLoading && tab === 'Approvals' && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-[#968871] uppercase tracking-wide">Approved → Production ({approvedSamples.length})</p>
              {approvedSamples.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-sm text-[#968871]">No approved samples yet</p>
                  <p className="text-xs text-[#968871] mt-1">Approve a sample in the Samples tab to unlock the move to Production.</p>
                </div>
              )}
              {approvedSamples.length > 0 && !lead?.productionOrderId && (
                <div className="p-3 rounded-[10px] border bg-[#dce9d4] border-[#b9d2af] flex items-center justify-between gap-3">
                  <p className="text-xs text-[#3a5f3c]">Ready to hand off — pick the catalog product and this moves the lead to Production and creates the Batch Tracker order in one step.</p>
                  <button
                    onClick={() => { setShowMoveModal(true); setMoveSelectedCatalogProduct(null); setMoveCatalogSearch(''); setMoveBatchSizeKg(10); }}
                    className={clsx(accentBtn, 'flex-shrink-0')}
                  >
                    Move to Production →
                  </button>
                </div>
              )}
              {approvedSamples.map((s) => (
                <div key={s.sampleId} className={clsx('flex items-center justify-between p-3 rounded-[10px] border', 'bg-[#dce9d4] border-[#b9d2af]')}>
                  <div>
                    <p className="text-sm font-semibold text-[#2e241b]">{s.sampleId} <span className="text-xs text-[#968871]">V{s.version}</span></p>
                    <p className="text-xs text-[#6d5f4c]">{s.formulaId || 'No formula linked'}</p>
                  </div>
                  {lead?.productionOrderId ? (
                    <span className="text-xs font-semibold text-[#33526b]">{lead.productionOrderId.orderNumber}</span>
                  ) : (
                    <span className="text-xs text-[#3a5f3c] font-semibold">{lead?.status === 'In Progress' ? 'In Production queue' : 'Approved'}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showMoveModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={bodyFont}>
          <div className="absolute inset-0 bg-[#2e241b]/50 backdrop-blur-sm" onClick={() => setShowMoveModal(false)} />
          <div className="relative bg-[#f0eadd] rounded-2xl shadow-[0_10px_40px_rgba(46,36,27,0.16)] w-full max-w-md border border-[#d3c9b4]">
            <div className="p-5 border-b border-[#e2dac8] bg-[#e7dfce] rounded-t-2xl">
              <h3 className="font-bold text-[#2e241b]" style={displayFont}>🏭 Move to Production</h3>
              <p className="text-xs text-[#6d5f4c] mt-0.5">{lead?.name} — moves the lead to Production and creates the Batch Tracker order together.</p>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1 block">Catalog product</label>
                <input
                  value={moveSelectedCatalogProduct ? moveSelectedCatalogProduct.name : moveCatalogSearch}
                  onChange={(e) => { setMoveCatalogSearch(e.target.value); setMoveSelectedCatalogProduct(null); }}
                  placeholder="Search catalog products…"
                  className={clsx(inputCls, 'w-full bg-white')}
                />
                {moveCatalogSearch && !moveSelectedCatalogProduct && (
                  <div className="mt-1 rounded-[10px] border border-[#d3c9b4] bg-white max-h-32 overflow-y-auto">
                    {moveCatalogMatches.length === 0 && <div className="px-3 py-2 text-xs text-[#968871]">No products found</div>}
                    {moveCatalogMatches.slice(0, 8).map((p) => (
                      <button key={p._id} type="button" onClick={() => { setMoveSelectedCatalogProduct(p); setMoveCatalogSearch(''); }}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-[#e7dfce] flex justify-between">
                        <span className="text-[#2e241b]">{p.name}</span>
                        <span className="text-[#968871] font-mono">{p.code}</span>
                      </button>
                    ))}
                  </div>
                )}
                {moveSelectedCatalogProduct && (
                  <p className="text-[11px] text-[#968871] mt-1">{moveSelectedCatalogProduct.formulation?.rows?.length || 0} ingredient(s) in formulation</p>
                )}
              </div>
              <div>
                <label className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1 block">Batch size (kg)</label>
                <input type="number" min="0.1" step="0.1" value={moveBatchSizeKg} onChange={(e) => setMoveBatchSizeKg(e.target.value)}
                  className={clsx(inputCls, 'w-full bg-white')} />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowMoveModal(false)} className={clsx(outlineBtn, 'flex-1 justify-center')}>Cancel</button>
                <button
                  onClick={() => {
                    if (!moveSelectedCatalogProduct) { toast.error('Select a catalog product'); return; }
                    if (!moveBatchSizeKg || Number(moveBatchSizeKg) <= 0) { toast.error('Enter a valid batch size'); return; }
                    moveToProductionMutation.mutate({ catalogProduct: moveSelectedCatalogProduct._id, batchSizeKg: Number(moveBatchSizeKg) });
                  }}
                  disabled={moveToProductionMutation.isPending}
                  className={clsx(accentBtn, 'flex-1 justify-center')}
                >
                  {moveToProductionMutation.isPending ? 'Moving…' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
