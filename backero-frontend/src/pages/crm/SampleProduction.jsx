import { useState, useEffect, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import api from '../../api/axios';
import { format, formatDistanceToNowStrict } from 'date-fns';
import SampleLeadDetail from './SampleLeadDetail';
import EditKycModal from './EditKycModal';
import { customerId, queryId } from '../../utils/leadHelpers';
import { FONT_IMPORT, Card, PILL, StatCard, SUB_STAGE_PILL } from './sampleTheme';
import {
  StageBar, StageOrder, StageWorkAssignment, StageProcurement, StageWeighing,
  StageBulkQC, StagePackaging, StageFinalQC, StageDispatch, STAGE_NAMES,
} from './production/StageSteps';

// Cross-customer work queue over the CRM's existing "Sample" pipeline stage —
// no new data model. Everything here reads/writes the same Lead record that
// LeadDetails.jsx already manages; this page just gives the lab/production
// team one place to see every sample in flight instead of opening leads one
// by one. "Send to Production" reuses the same link-production endpoint the
// CRM pipeline already uses to hand a lead off to Batch Tracker.
//
// Visual design intentionally mirrors the "Sample Development" reference file
// (design/sample production.html) — a warm cream/amber palette distinct from
// the rest of the app's blue theme, scoped entirely to this page via the
// FONT_IMPORT + hardcoded hex classes below (nothing global is touched).

export { FONT_IMPORT, Card, PILL, StatCard, SUB_STAGE_PILL, PROD_STAGE_TABS };
const displayFont = { fontFamily: "'Fraunces', Georgia, serif" };
const bodyFont = { fontFamily: "'Inter', -apple-system, sans-serif" };

const QA_TOPIC_PILL = { General: PILL.gray, Product: PILL.info, Packaging: PILL.warning, Formula: PILL.purple, Designing: PILL.info, Pricing: PILL.success };

// The 6 production-floor stages, broken out of the old combined "Track Production" board into
// their own top-level tabs — each just the orders currently sitting at that stage (STAGE_NAMES
// indices 2-7; Order/Work Assignment stay covered by Awaiting Production & Orders above).
const PROD_STAGE_TABS = [
  { key: 'procurement', label: 'Procurement', emoji: '📦', stage: 2, hint: 'Orders at Procurement — raw material availability check against the scaled formula.' },
  { key: 'weighing', label: 'Ready for Product Approval', emoji: '⚖️', stage: 3, hint: 'Orders at Ready for Product Approval (Weighing) — ingredient weigh-off and process steps, then a manager approves the batch to move on.' },
  { key: 'bulkqc', label: 'Bulk QC', emoji: '🧫', stage: 4, hint: 'Orders at Bulk QC — pass/fail against the locked Job Sheet specs.' },
  { key: 'packing', label: 'Packing', emoji: '🎁', stage: 5, hint: 'Orders at Packaging — fill, reject count, labeling.' },
  { key: 'finalqc', label: 'Final QC', emoji: '✅', stage: 6, hint: 'Orders at Final QC — release checks before dispatch.' },
  { key: 'dispatch', label: 'Dispatch', emoji: '🚚', stage: 7, hint: 'Orders at Dispatch — ready to ship or already shipped.' },
];

// Each stage tab's own function component — "Open" from that tab jumps straight to just this,
// no lead tabs, no cross-stage nav, since every order listed under a stage tab is guaranteed to
// currently be at that exact stage.
const PROD_STAGE_COMPONENT = {
  procurement: StageProcurement,
  weighing: StageWeighing,
  bulkqc: StageBulkQC,
  packing: StagePackaging,
  finalqc: StageFinalQC,
  dispatch: StageDispatch,
};

// Orders tab's "Edit" action — opens just the Order/Job Sheet function via StageFocusPanel,
// same as the stage tabs above, since there's no top-level tab for it anymore.
const ORDER_EDIT_TAB = { key: 'order', label: 'Edit Order', emoji: '✏️' };

const TABS = [
  { key: 'new', label: 'New Leads', emoji: '🆕', hint: 'Brand-new leads — no CRM stage move needed. Add a product, formula, or sample here and the lead promotes to Sample automatically.' },
  { key: 'qa', label: 'Q&A Inbox', emoji: '📥', hint: 'Every technical query raised for a lead currently in Sample — reply here or from the lead’s own Q&A tab.' },
  { key: 'sample', label: 'Samples', emoji: '🧪', hint: 'Leads currently being sampled — dispatch, feedback, invoicing happens on the lead itself.' },
  { key: 'payments', label: 'Payments', emoji: '💳', hint: 'R&D / sampling fee confirmation — a sample stays locked at "Requested" until this is confirmed.' },
  { key: 'awaiting', label: 'Awaiting Production', emoji: '⏳', hint: 'Sample approved (moved to In Progress) but not yet linked to a Batch Tracker order.' },
  { key: 'linked', label: 'Orders', emoji: '🧾', hint: 'Already handed off — tracked in Batch Tracker from here on.' },
  ...PROD_STAGE_TABS,
];

const FLOW_STEPS = ['Add customer (KYC)', 'Answer questions', 'Confirm payment', 'Make & track samples', 'Order to production'];
const SAMPLE_SUB_STAGES = ['Requested', 'In Lab', 'Sent', 'Feedback', 'Approved', 'Rejected'];

function toCsv(rows, columns) {
  const escape = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columns.map((c) => escape(c.label)).join(',');
  const lines = rows.map((r) => columns.map((c) => escape(c.value(r))).join(','));
  return [header, ...lines].join('\n');
}

function downloadCsv(filename, csv) {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function applySort(rows, accessors, sortState) {
  const acc = sortState.col && accessors[sortState.col];
  if (!acc) return rows;
  const sorted = [...rows].sort((a, b) => {
    const av = acc(a), bv = acc(b);
    if (typeof av === 'number' && typeof bv === 'number') return av - bv;
    return String(av).localeCompare(String(bv));
  });
  return sortState.dir === 'desc' ? sorted.reverse() : sorted;
}

function SortableTh({ label, sortKey, sortState, setSortState, className = '' }) {
  const active = sortState.col === sortKey;
  return (
    <th
      className={clsx('px-4 py-2.5 cursor-pointer select-none hover:text-[#2e241b]', className)}
      onClick={() => setSortState((s) => (s.col === sortKey ? { col: sortKey, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col: sortKey, dir: 'asc' }))}
    >
      {label}{active && <span className="ml-1">{sortState.dir === 'asc' ? '▲' : '▼'}</span>}
    </th>
  );
}

export default function SampleProduction() {
  const [tab, setTab] = useState('sample');
  const [search, setSearch] = useState('');
  const [openLeadId, setOpenLeadId] = useState(null);
  const [openLeadInitialTab, setOpenLeadInitialTab] = useState(null);
  const [sendLead, setSendLead] = useState(null);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [selectedCatalogProduct, setSelectedCatalogProduct] = useState(null);
  const [batchSizeKg, setBatchSizeKg] = useState(10);
  const [sampleStageFilter, setSampleStageFilter] = useState('');
  const [sortState, setSortState] = useState({ col: null, dir: 'asc' });

  // Payment confirm — captures the same audit-trail fields (mode/txn-ref/date/received-by/notes)
  // as the per-lead Payments tab, so confirming from this quick queue action doesn't skip them.
  const [payConfirmFor, setPayConfirmFor] = useState(null);
  const [payMode, setPayMode] = useState('upi');
  const [payTxnRef, setPayTxnRef] = useState('');
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payReceivedBy, setPayReceivedBy] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [showCreateLead, setShowCreateLead] = useState(false);
  const [qaSortKey, setQaSortKey] = useState('aging');
  const [qaSortDir, setQaSortDir] = useState('desc');

  // "Open"/"Edit" from a production-stage tab or the Orders tab — { orderId, stageTab, StageComponent }.
  const [focusStageOrder, setFocusStageOrder] = useState(null);

  // KYC edit modal — covers the fields the "Sample Development" reference keeps on this page
  // (not just name/phone/email, but preferredName/language/bestTime/teamSize/rapportNote too),
  // saved via the existing generic PUT /crm/leads/:id endpoint (applies whatever fields are sent).
  const [editKycLead, setEditKycLead] = useState(null);

  // Q&A "Connect Existing" — inline catalog-product picker per query row.
  const [connectingQueryId, setConnectingQueryId] = useState(null);
  const [connectCatalogSearch, setConnectCatalogSearch] = useState('');

  // Orders tab detail modal
  const [openOrderLead, setOpenOrderLead] = useState(null);
  // Production orders created directly (no CRM lead attached) — tracked here too, opened
  // through a lead-less stage panel since there's no lead to show tabs for.
  const [openOrderId, setOpenOrderId] = useState(null);
  const [orderQty, setOrderQty] = useState('');
  const [orderDeliveryDate, setOrderDeliveryDate] = useState('');
  const [orderMarginPct, setOrderMarginPct] = useState(30);

  // Orders tab dispatch confirmation modal
  const [dispatchLead, setDispatchLead] = useState(null);
  const [dispatchNote, setDispatchNote] = useState('');
  const [dispatchFile, setDispatchFile] = useState(null);

  const qc = useQueryClient();
  const navigate = useNavigate();

  // Arriving from CRM Pipeline's "move to Sample" / "move to Production" actions
  // (?open=<leadId>) — jump straight into that lead's detail instead of the list. Also
  // ?tab=<key> from the Dashboard's production stage strip — jump straight to that tab.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const openId = searchParams.get('open');
    const tabParam = searchParams.get('tab');
    if (openId || tabParam) {
      if (openId) setOpenLeadId(openId);
      if (tabParam && TABS.some((t) => t.key === tabParam)) setTab(tabParam);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams]);

  const { data, isLoading } = useQuery({
    queryKey: ['sample-production', 'leads'],
    queryFn: () => Promise.all([
      api.get('/crm/leads', { params: { status: 'Sample', limit: 200 } }).then((r) => r.data.data || r.data.leads || []),
      api.get('/crm/leads', { params: { status: 'In Progress', limit: 200 } }).then((r) => r.data.data || r.data.leads || []),
      // Production auto-moves a lead to "Ready to Dispatch" once its batch clears Final QC
      // (see production.routes.js) — it drops out of "In Progress" at that point, so the
      // Orders tab needs to keep tracking it here until the dispatch confirmation below.
      api.get('/crm/leads', { params: { status: 'Ready to Dispatch', limit: 200 } }).then((r) => r.data.data || r.data.leads || []),
    ]),
    refetchInterval: 60 * 1000,
  });
  const [sampleLeads, inProgressLeads, readyToDispatchLeads] = data || [[], [], []];
  const awaiting = inProgressLeads.filter((l) => !l.productionOrderId);
  const linked = [...inProgressLeads.filter((l) => l.productionOrderId), ...(readyToDispatchLeads || [])];

  // Orders created directly against Batch Tracker's old standalone flow (no CRM lead) — the
  // Orders tab's main table is lead-driven, so these need their own list underneath it. Also
  // backs each production-stage tab's list (every order at that stage, across all leads).
  const currentProdStageTab = PROD_STAGE_TABS.find((t) => t.key === tab);
  const { data: allProductionOrders } = useQuery({
    queryKey: ['production-orders'],
    queryFn: () => api.get('/production', { params: { limit: 200 } }).then((r) => r.data.data || []),
    enabled: tab === 'linked' || !!currentProdStageTab,
    refetchInterval: 60 * 1000,
  });
  const orphanOrders = (allProductionOrders || []).filter((o) => !o.leadId);

  const productionOrders = search
    ? (allProductionOrders || []).filter((o) => (o.orderNumber || '').toLowerCase().includes(search.toLowerCase()) || (o.customer || '').toLowerCase().includes(search.toLowerCase()) || (o.catalogProduct?.name || '').toLowerCase().includes(search.toLowerCase()))
    : (allProductionOrders || []);
  const currentProdStageOrders = currentProdStageTab ? productionOrders.filter((o) => o.stage === currentProdStageTab.stage) : [];

  const { data: newLeadsData } = useQuery({
    queryKey: ['sample-production', 'new-leads'],
    queryFn: () => Promise.all([
      api.get('/crm/leads', { params: { status: 'New Lead', limit: 200 } }).then((r) => r.data.data || r.data.leads || []),
      api.get('/crm/leads', { params: { status: 'Follow-up', limit: 200 } }).then((r) => r.data.data || r.data.leads || []),
    ]),
    refetchInterval: 60 * 1000,
  });
  const [newStatusLeads, followUpLeads] = newLeadsData || [[], []];
  const newLeads = [...newStatusLeads, ...followUpLeads];

  const { data: sampleQueries } = useQuery({
    queryKey: ['sample-production', 'queries'],
    queryFn: () => api.get('/crm/queries').then((r) => r.data.queries || []),
    refetchInterval: 60 * 1000,
  });

  const sampleLeadIds = new Set(sampleLeads.map((l) => l._id));
  const relevantQueries = (sampleQueries || []).filter((q) => sampleLeadIds.has(q.leadId?._id));
  const activeQueries = relevantQueries.filter((q) => q.status === 'pending' || q.status === 'in_progress').length;

  // Days since the lead entered its *current* sub-stage — used for the "aging" warnings below.
  // Falls back to createdAt if subStageHistory has no matching entry (e.g. still at the default
  // Requested stage it was created in).
  function daysInStage(l) {
    const current = l.sampleDetails?.subStage || 'Requested';
    const hist = l.sampleDetails?.subStageHistory || [];
    const entry = [...hist].reverse().find((h) => h.subStage === current);
    const enteredAt = entry?.enteredAt || l.createdAt;
    return Math.floor((Date.now() - new Date(enteredAt).getTime()) / 86400000);
  }

  const inLabLeads = sampleLeads.filter((l) => ['Requested', 'In Lab'].includes(l.sampleDetails?.subStage || 'Requested'));
  const samplesInLab = inLabLeads.length;
  const samplesInLabAging = inLabLeads.filter((l) => daysInStage(l) > 7);

  const awaitingFeedbackLeads = sampleLeads.filter((l) => ['Sent', 'Feedback'].includes(l.sampleDetails?.subStage));
  const awaitingFeedback = awaitingFeedbackLeads.length;
  const awaitingFeedbackAging = awaitingFeedbackLeads.filter((l) => daysInStage(l) > 7);

  const agingLeads = [...samplesInLabAging, ...awaitingFeedbackAging];

  const now = new Date();
  const approvedMTD = sampleLeads.filter((l) =>
    (l.sampleDetails?.subStageHistory || []).some((h) => {
      if (h.subStage !== 'Approved') return false;
      const d = new Date(h.enteredAt);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
  ).length;

  const paymentPendingLeads = sampleLeads.filter((l) => l.sampleDetails?.paymentStatus !== 'full_paid');
  const paymentPendingValue = paymentPendingLeads.reduce((sum, l) => sum + (l.sampleDetails?.chargeAmount || 0), 0);

  const rows = tab === 'sample' ? sampleLeads : tab === 'payments' ? sampleLeads : tab === 'new' ? newLeads : tab === 'awaiting' ? awaiting : linked;
  const filtered = search
    ? rows.filter((l) => (l.name || '').toLowerCase().includes(search.toLowerCase()) || (l.company || '').toLowerCase().includes(search.toLowerCase()))
    : rows;

  const stageChipCounts = SAMPLE_SUB_STAGES.reduce((acc, s) => {
    acc[s] = sampleLeads.filter((l) => (l.sampleDetails?.subStage || 'Requested') === s).length;
    return acc;
  }, {});
  const stageFiltered = tab === 'sample' && sampleStageFilter
    ? filtered.filter((l) => (l.sampleDetails?.subStage || 'Requested') === sampleStageFilter)
    : filtered;

  const sortAccessors = {
    kyc: {
      customerId: (l) => customerId(l), name: (l) => l.name || '', phone: (l) => l.phone || '', city: (l) => l.city || '',
      businessType: (l) => l.businessType || '', productInterest: (l) => (l.productInterest || []).join(', '),
    },
    shared: {
      name: (l) => l.name || '',
      stage: (l) => l.sampleDetails?.subStage || 'Requested',
      payment: (l) => (l.sampleDetails?.paymentStatus === 'full_paid' ? 1 : 0),
      custId: (l) => customerId(l),
      orderId: (l) => l.productionOrderId?.orderNumber || '',
      product: (l) => l.productionOrderId?.catalogProduct?.name || '',
      qty: (l) => l.productionOrderId?.batchSizeKg || 0,
      delivery: (l) => l.productionOrderId?.deliveryDate || '',
    },
  };
  const sortedKycRows = applySort(filtered, sortAccessors.kyc, sortState);
  const sortedRows = applySort(stageFiltered, sortAccessors.shared, sortState);

  const filteredQueries = search
    ? relevantQueries.filter((q) => (q.title || '').toLowerCase().includes(search.toLowerCase()) || (q.leadId?.name || '').toLowerCase().includes(search.toLowerCase()))
    : relevantQueries;

  const leadsById = new Map([...sampleLeads, ...inProgressLeads].map((l) => [l._id, l]));

  const exportCSV = () => {
    const dateStr = format(new Date(), 'yyyy-MM-dd');
    downloadCsv(`sample-dev-queries-${dateStr}.csv`, toCsv(relevantQueries, [
      { label: 'Query ID', value: (q) => q._id },
      { label: 'Customer', value: (q) => q.leadId?.name || '' },
      { label: 'Company', value: (q) => q.leadId?.company || '' },
      { label: 'Phone', value: (q) => q.leadId?.phone || '' },
      { label: 'Title', value: (q) => q.title },
      { label: 'Description', value: (q) => q.description },
      { label: 'Urgency', value: (q) => q.urgency },
      { label: 'Status', value: (q) => q.status },
      { label: 'Created', value: (q) => format(new Date(q.createdAt), 'yyyy-MM-dd HH:mm') },
      { label: 'Answer', value: (q) => q.answer || '' },
    ]));
    downloadCsv(`sample-dev-samples-${dateStr}.csv`, toCsv(sampleLeads, [
      { label: 'Customer', value: (l) => l.name },
      { label: 'Company', value: (l) => l.company || '' },
      { label: 'Phone', value: (l) => l.phone },
      { label: 'Product Interest', value: (l) => (l.productInterest || []).join('; ') },
      { label: 'Sample Stage', value: (l) => l.sampleDetails?.subStage || 'Requested' },
      { label: 'Payment Status', value: (l) => (l.sampleDetails?.paymentStatus === 'full_paid' ? 'Paid' : 'Pending') },
      { label: 'Charge Amount', value: (l) => l.sampleDetails?.chargeAmount || 0 },
      { label: 'Assigned To', value: (l) => (l.assignedTo ? `${l.assignedTo.firstName || ''} ${l.assignedTo.lastName || ''}`.trim() : '') },
      { label: 'Production Order', value: (l) => l.productionOrderId?.orderNumber || '' },
    ]));

    const sampleRows = sampleLeads.flatMap((l) => (l.samples || []).map((s) => ({ lead: l, sample: s })));
    downloadCsv(`sample-dev-sample-versions-${dateStr}.csv`, toCsv(sampleRows, [
      { label: 'Sample ID', value: ({ sample }) => sample.sampleId },
      { label: 'Customer', value: ({ lead }) => lead.name },
      { label: 'Query ID', value: ({ sample }) => sample.queryId || '' },
      { label: 'Formula ID', value: ({ sample }) => sample.formulaId || '' },
      { label: 'Version', value: ({ sample }) => sample.version },
      { label: 'Status', value: ({ sample }) => sample.status },
      { label: 'Packaging Confirmed', value: ({ sample }) => (sample.packagingConfirmed ? 'Yes' : 'No') },
      { label: 'Courier', value: ({ sample }) => sample.courier || '' },
      { label: 'Docket', value: ({ sample }) => sample.awb || '' },
      { label: 'Sent At', value: ({ sample }) => (sample.sentAt ? format(new Date(sample.sentAt), 'yyyy-MM-dd') : '') },
      { label: 'Chained From', value: ({ sample }) => sample.chainedFrom || '' },
      { label: 'Approved By', value: ({ sample }) => sample.approvedByContact || '' },
      { label: 'Rejected By', value: ({ sample }) => sample.rejectedByContact || '' },
      { label: 'Feedback Count', value: ({ sample }) => (sample.feedbackLog || []).length },
      { label: 'Created At', value: ({ sample }) => (sample.createdAt ? format(new Date(sample.createdAt), 'yyyy-MM-dd') : '') },
    ]));
  };

  const { data: catalogProducts } = useQuery({
    queryKey: ['catalog', 'products', 'all'],
    queryFn: () => api.get('/catalog/products').then((r) => r.data.products || []),
    enabled: !!sendLead || !!connectingQueryId,
    staleTime: 5 * 60 * 1000,
  });
  const activeCatalogProducts = (catalogProducts || []).filter((p) => p.status !== 'Discontinued');
  const catalogMatches = catalogSearch
    ? activeCatalogProducts.filter((p) => (p.name || '').toLowerCase().includes(catalogSearch.toLowerCase()) || (p.code || '').toLowerCase().includes(catalogSearch.toLowerCase()))
    : activeCatalogProducts;
  const connectCatalogMatches = connectCatalogSearch
    ? activeCatalogProducts.filter((p) => (p.name || '').toLowerCase().includes(connectCatalogSearch.toLowerCase()) || (p.code || '').toLowerCase().includes(connectCatalogSearch.toLowerCase()))
    : activeCatalogProducts;

  const sendToProduction = useMutation({
    mutationFn: ({ leadId, catalogProduct, batchSizeKg }) => api.post(`/crm/leads/${leadId}/link-production`, { mode: 'create', catalogProduct, batchSizeKg }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sample-production'] });
      qc.invalidateQueries({ queryKey: ['crm'] });
      qc.invalidateQueries({ queryKey: ['production-schedule'] });
      toast.success('Sent to Production — schedule it in Kitchen Schedule');
      setSendLead(null);
      setSelectedCatalogProduct(null);
      setCatalogSearch('');
      setBatchSizeKg(10);
      // The new order sits at Work Assignment (stage 1) — Kitchen Schedule's Tray is where
      // it gets a leader/support/date now, instead of the old inline Work Assignment form.
      navigate('/production/kitchen');
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to send to production'),
  });

  const confirmPayment = useMutation({
    mutationFn: ({ leadId, ...body }) => api.put(`/crm/leads/${leadId}/sample`, { paymentStatus: 'full_paid', ...body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sample-production'] });
      toast.success('Payment confirmed');
      setPayConfirmFor(null);
      setPayMode('upi'); setPayTxnRef(''); setPayDate(new Date().toISOString().slice(0, 10)); setPayReceivedBy(''); setPayNotes('');
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to confirm payment'),
  });

  const confirmDispatch = useMutation({
    mutationFn: ({ leadId, note, file }) => {
      const form = new FormData();
      if (note) form.append('note', note);
      if (file) form.append('file', file);
      return api.post(`/crm/leads/${leadId}/dispatch`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sample-production'] });
      qc.invalidateQueries({ queryKey: ['crm'] });
      toast.success('Dispatched — client notified');
      setDispatchLead(null);
      setDispatchNote('');
      setDispatchFile(null);
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to mark as dispatched'),
  });

  const [qaReplyDrafts, setQaReplyDrafts] = useState({});
  const answerQueryMutation = useMutation({
    mutationFn: ({ queryId, answer }) => api.put(`/crm/queries/${queryId}/reply`, { answer }),
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ['sample-production'] });
      setQaReplyDrafts((d) => ({ ...d, [vars.queryId]: '' }));
      toast.success('Reply sent');
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to reply'),
  });

  const updateLeadStatusMutation = useMutation({
    mutationFn: ({ leadId, status }) => api.put(`/crm/leads/${leadId}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sample-production'] });
      qc.invalidateQueries({ queryKey: ['crm'] });
      toast.success('Stage updated');
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to update stage'),
  });

  const deleteLeadMutation = useMutation({
    mutationFn: (leadId) => api.delete(`/crm/leads/${leadId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sample-production'] });
      qc.invalidateQueries({ queryKey: ['crm'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Lead deleted');
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to delete lead'),
  });

  const connectProductMutation = useMutation({
    mutationFn: ({ leadId, product }) => api.post(`/crm/leads/${leadId}/products`, { name: product.name, catalogProductId: product._id, productId: product.code }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sample-production'] });
      toast.success('Product connected');
      setConnectingQueryId(null);
      setConnectCatalogSearch('');
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to connect product'),
  });

  const { data: openOrderDetail } = useQuery({
    queryKey: ['production', 'order', openOrderLead?.productionOrderId?._id],
    queryFn: () => api.get(`/production/${openOrderLead.productionOrderId._id}`).then((r) => r.data.order || r.data.data),
    enabled: !!openOrderLead?.productionOrderId?._id,
  });
  useEffect(() => {
    if (openOrderDetail) {
      setOrderQty(String(openOrderDetail.plannedQuantity || openOrderDetail.batchSizeKg || ''));
      setOrderDeliveryDate(openOrderDetail.deliveryDate ? String(openOrderDetail.deliveryDate).slice(0, 10) : '');
    }
  }, [openOrderDetail]);

  const updateOrderMutation = useMutation({
    mutationFn: ({ orderId, body }) => api.patch(`/production/${orderId}/order`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sample-production'] });
      qc.invalidateQueries({ queryKey: ['production'] });
      toast.success('Order updated');
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed to update order'),
  });

  function agingBadge(q) {
    if (q.status !== 'pending' && q.status !== 'in_progress') return null;
    const hours = (Date.now() - new Date(q.createdAt).getTime()) / 3600000;
    const tone = hours > 48 ? PILL.danger : hours > 24 ? PILL.warning : PILL.gray;
    return <span className={clsx('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', tone)}>{formatDistanceToNowStrict(new Date(q.createdAt))} old</span>;
  }

  const qaSortAccessors = {
    aging: (q) => new Date(q.createdAt).getTime(),
    qid: (q) => queryId(q),
    custId: (q) => customerId(q.leadId),
    customer: (q) => q.leadId?.name || '',
    topic: (q) => q.topic || 'General',
    question: (q) => (q.title || '').toLowerCase(),
    asked: (q) => new Date(q.createdAt).getTime(),
    via: (q) => q.askedVia || '',
    status: (q) => q.status || '',
  };
  const sortedQueries = applySort(filteredQueries, qaSortAccessors, { col: qaSortKey, dir: qaSortDir });
  const qaSortState = { col: qaSortKey, dir: qaSortDir };
  const setQaSortState = (updater) => {
    const next = typeof updater === 'function' ? updater(qaSortState) : updater;
    setQaSortKey(next.col);
    setQaSortDir(next.dir);
  };

  const accentBtn = 'inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#f2b23e] text-[#2e241b] text-xs font-bold hover:brightness-95 transition disabled:opacity-50';
  const outlineBtn = 'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border-[1.5px] border-[#d3c9b4] text-[#6d5f4c] text-xs font-semibold hover:bg-[#e7dfce] hover:border-[#968871] hover:text-[#2e241b] transition';
  const textLink = 'text-xs font-semibold text-[#4a3a29] hover:text-[#2e241b]';
  const modalInputCls = 'px-3 py-2 text-sm rounded-[10px] border-[1.5px] border-[#d3c9b4] bg-white text-[#2e241b] focus:outline-none focus:border-[#968871] placeholder:text-[#968871]';

  return (
    <div className="space-y-5 -m-4 sm:-m-6 p-4 sm:p-6 bg-white min-h-[calc(100vh-4rem)]" style={bodyFont}>
      <style>{FONT_IMPORT}</style>

      <Card className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#f2b23e] flex items-center justify-center shadow-sm flex-shrink-0 text-lg">🧪</div>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-[#2e241b] leading-tight" style={displayFont}>Sample Development</h1>
          <p className="text-xs text-[#6d5f4c]">{sampleLeads.length} in sampling · {awaiting.length} awaiting production · {linked.length} linked</p>
        </div>
        <button onClick={exportCSV} className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border-[1.5px] border-[#d3c9b4] text-[#6d5f4c] text-xs font-semibold hover:bg-[#e7dfce] hover:border-[#968871] hover:text-[#2e241b] transition flex-shrink-0">
          📥 Export CSV
        </button>
      </Card>

      {agingLeads.length > 0 && (
        <div className="p-3 rounded-[10px] border border-[#e3b3ab] bg-[#f6e3e0] flex items-start gap-2">
          <span className="text-base leading-none">⚠️</span>
          <div className="text-xs text-[#8c3a30]">
            <span className="font-semibold">{agingLeads.length} sample{agingLeads.length === 1 ? '' : 's'} stalled over 7 days</span> — {agingLeads.map((l) => l.name).join(', ')}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard emoji="💬" iconTone="info" label="Active Queries" value={activeQueries} hint={`${activeQueries} open of ${relevantQueries.length} total`} />
        <StatCard emoji="🧪" iconTone="purple" label="Samples In Lab" value={samplesInLab} hint={samplesInLabAging.length > 0 ? `⚠️ ${samplesInLabAging.length} aging > 7d` : null} />
        <StatCard emoji="🔖" iconTone="warning" label="Awaiting Feedback" value={awaitingFeedback} valueTone="text-[#7a5a10]" hint={awaitingFeedbackAging.length > 0 ? `⚠️ ${awaitingFeedbackAging.length} aging > 7d` : null} />
        <StatCard emoji="✅" iconTone="success" label="Approved (MTD)" value={approvedMTD} valueTone="text-[#3a5f3c]" />
        <StatCard emoji="💳" iconTone="danger" label="R&D Payment Pending" value={paymentPendingLeads.length} hint={paymentPendingValue > 0 ? `₹${paymentPendingValue.toLocaleString('en-IN')} pending` : null} valueTone="text-[#8c3a30]" />
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="flex items-center gap-2 flex-wrap px-5 py-3 border-b border-[#e2dac8] bg-[#e7dfce] text-[11px] text-[#6d5f4c] font-semibold">
          <span className="uppercase tracking-wide text-[#968871]">How work flows:</span>
          {FLOW_STEPS.map((s, i) => (
            <span key={s} className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full border-[1.5px] border-[#d3c9b4] bg-[#f0eadd]">{s}</span>
              {i < FLOW_STEPS.length - 1 && <span className="text-[#968871]">→</span>}
            </span>
          ))}
        </div>

        <div className="flex gap-1 px-5 border-b border-[#e2dac8] flex-wrap">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setSortState({ col: null, dir: 'asc' }); }}
              className={clsx(
                'px-4 py-3 text-[13px] font-semibold border-b-[2.5px] transition-colors flex items-center gap-1.5',
                tab === t.key ? 'border-[#f2b23e] text-[#2e241b]' : 'border-transparent text-[#6d5f4c] hover:text-[#2e241b]'
              )}
            >
              <span>{t.emoji}</span>{t.label}
            </button>
          ))}
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-[#968871]">{TABS.find((t) => t.key === tab)?.hint}</p>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative max-w-sm flex-1 min-w-[220px]">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#968871] text-sm">🔍</span>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customer, company…"
                className="pl-9 pr-3 py-2 text-sm border-[1.5px] border-[#d3c9b4] rounded-full focus:outline-none focus:border-[#968871] w-full bg-[#e7dfce] text-[#2e241b] placeholder:text-[#968871]" />
            </div>
            {tab === 'new' && <button onClick={() => setShowCreateLead(true)} className={accentBtn}>+ New Lead</button>}
          </div>

          {tab === 'sample' && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setSampleStageFilter('')}
                className={clsx('px-3 py-1 rounded-full text-[11px] font-semibold border-[1.5px] transition-colors',
                  !sampleStageFilter ? 'bg-[#2e241b] border-[#2e241b] text-white' : 'border-[#d3c9b4] bg-[#e7dfce] text-[#6d5f4c] hover:border-[#968871]')}
              >
                All <span className="opacity-75 font-bold">{sampleLeads.length}</span>
              </button>
              {SAMPLE_SUB_STAGES.map((s) => (
                <button
                  key={s}
                  onClick={() => setSampleStageFilter(s)}
                  className={clsx('px-3 py-1 rounded-full text-[11px] font-semibold border-[1.5px] transition-colors',
                    sampleStageFilter === s ? 'bg-[#2e241b] border-[#2e241b] text-white' : 'border-[#d3c9b4] bg-[#e7dfce] text-[#6d5f4c] hover:border-[#968871]')}
                >
                  {s} <span className="opacity-75 font-bold">{stageChipCounts[s] || 0}</span>
                </button>
              ))}
            </div>
          )}

          {tab === 'new' && (
            <div className="overflow-x-auto rounded-[10px] border border-[#e2dac8]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#d3c9b4] text-left text-[11px] uppercase tracking-wide text-[#6d5f4c] bg-[#e7dfce]">
                    <SortableTh label="Customer ID" sortKey="customerId" sortState={sortState} setSortState={setSortState} />
                    <SortableTh label="Customer" sortKey="name" sortState={sortState} setSortState={setSortState} />
                    <SortableTh label="Phone" sortKey="phone" sortState={sortState} setSortState={setSortState} />
                    <SortableTh label="City" sortKey="city" sortState={sortState} setSortState={setSortState} />
                    <SortableTh label="Business Type" sortKey="businessType" sortState={sortState} setSortState={setSortState} />
                    <SortableTh label="Product Interest" sortKey="productInterest" sortState={sortState} setSortState={setSortState} />
                    <th className="px-4 py-2.5">Payment</th>
                    <th className="px-4 py-2.5">Assigned To</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && <tr><td colSpan={10} className="px-4 py-8 text-center text-[#968871] text-xs">Loading…</td></tr>}
                  {!isLoading && sortedKycRows.length === 0 && <tr><td colSpan={10} className="px-4 py-8 text-center text-[#968871] text-xs">No new leads right now.</td></tr>}
                  {sortedKycRows.map((l) => (
                    <tr key={l._id} className="border-b border-[#e2dac8] hover:bg-[#e7dfce]/60">
                      <td className="px-4 py-2.5 font-mono text-xs text-[#4a3a29] font-semibold">{customerId(l)}</td>
                      <td className="px-4 py-2.5">
                        <p className="text-[#2e241b] font-medium">{l.name}</p>
                        <p className="text-[#968871] text-xs">{l.company || '—'}</p>
                      </td>
                      <td className="px-4 py-2.5 text-[#6d5f4c] text-xs">{l.phone}</td>
                      <td className="px-4 py-2.5 text-[#6d5f4c] text-xs">{l.city || '—'}</td>
                      <td className="px-4 py-2.5 text-[#6d5f4c] text-xs">{l.businessType || '—'}</td>
                      <td className="px-4 py-2.5 text-[#6d5f4c] text-xs">{(l.productInterest || []).join(', ') || '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded-full', l.sampleDetails?.paymentStatus === 'full_paid' ? PILL.success : PILL.warning)}>
                          {l.sampleDetails?.paymentStatus === 'full_paid' ? 'Paid' : 'Pending'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-[#6d5f4c] text-xs">
                        {l.assignedTo ? `${l.assignedTo.firstName || ''} ${l.assignedTo.lastName || ''}`.trim() : 'Unassigned'}
                      </td>
                      <td className="px-4 py-2.5">
                        <select
                          value={l.status}
                          onChange={(e) => updateLeadStatusMutation.mutate({ leadId: l._id, status: e.target.value })}
                          disabled={updateLeadStatusMutation.isPending}
                          className={clsx('text-[10px] font-semibold px-2 py-1 rounded-full border-0 cursor-pointer disabled:opacity-50',
                            l.status === 'Follow-up' ? PILL.warning : PILL.gray)}
                        >
                          <option value="New Lead">New Lead</option>
                          <option value="Follow-up">Follow-up</option>
                        </select>
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <button
                          onClick={() => setEditKycLead(l)}
                          className={clsx(textLink, 'mr-3')}
                        >
                          Edit KYC
                        </button>
                        {l.productionOrderId && (
                          <button onClick={() => { setOpenLeadId(l._id); setOpenLeadInitialTab('Production'); }} className={clsx(textLink, 'mr-3')}>
                            🏭 Track Production →
                          </button>
                        )}
                        <button onClick={() => { setOpenLeadId(l._id); setOpenLeadInitialTab(null); }} className={clsx(textLink, 'mr-3')}>Open ▸</button>
                        <button
                          onClick={() => { if (window.confirm(`Delete lead "${l.name}"? This cannot be undone.`)) deleteLeadMutation.mutate(l._id); }}
                          disabled={deleteLeadMutation.isPending}
                          className="text-xs font-semibold text-[#8c3a30] hover:text-[#6b2c24] disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'qa' && (
            <div className="overflow-x-auto rounded-[10px] border border-[#e2dac8]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#d3c9b4] text-left text-[11px] uppercase tracking-wide text-[#6d5f4c] bg-[#e7dfce]">
                    <SortableTh label="Aging" sortKey="aging" sortState={qaSortState} setSortState={setQaSortState} />
                    <SortableTh label="Query ID" sortKey="qid" sortState={qaSortState} setSortState={setQaSortState} />
                    <SortableTh label="Client ID" sortKey="custId" sortState={qaSortState} setSortState={setQaSortState} />
                    <SortableTh label="Customer" sortKey="customer" sortState={qaSortState} setSortState={setQaSortState} />
                    <SortableTh label="Topic" sortKey="topic" sortState={qaSortState} setSortState={setQaSortState} />
                    <SortableTh label="Question" sortKey="question" sortState={qaSortState} setSortState={setQaSortState} />
                    <SortableTh label="Asked" sortKey="asked" sortState={qaSortState} setSortState={setQaSortState} />
                    <SortableTh label="Via" sortKey="via" sortState={qaSortState} setSortState={setQaSortState} />
                    <SortableTh label="Status" sortKey="status" sortState={qaSortState} setSortState={setQaSortState} />
                    <th className="px-4 py-2.5">Quick Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedQueries.length === 0 && (
                    <tr><td colSpan={10} className="px-4 py-8 text-center text-[#968871] text-xs">No queries for any Sample-stage lead right now.</td></tr>
                  )}
                  {sortedQueries.map((q) => {
                    const relatedLead = leadsById.get(q.leadId?._id);
                    const hasProduct = (relatedLead?.productLinks?.length || 0) > 0;
                    return (
                      <Fragment key={q._id}>
                        <tr className="border-b border-[#e2dac8] hover:bg-[#e7dfce]/60 align-top">
                          <td className="px-4 py-2.5 whitespace-nowrap">{agingBadge(q)}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <button
                              onClick={() => { setOpenLeadId(q.leadId?._id); setOpenLeadInitialTab('Q&A'); }}
                              title={`Open in ${customerId(q.leadId)} Q&A`}
                              className="font-mono font-bold text-[#4a3a29] hover:underline"
                            >
                              {queryId(q)}
                            </button>
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <button
                              onClick={() => { setOpenLeadId(q.leadId?._id); setOpenLeadInitialTab(null); }}
                              title={`Open ${customerId(q.leadId)}`}
                              className="font-mono font-bold text-[#4a3a29] hover:underline"
                            >
                              {customerId(q.leadId)}
                            </button>
                          </td>
                          <td className="px-4 py-2.5">
                            <p className="text-[#2e241b] font-medium whitespace-nowrap">{q.leadId?.name || 'Unknown lead'}</p>
                            <p className="text-[#968871] text-xs whitespace-nowrap">{q.leadId?.company || ''}</p>
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <span className={clsx('px-2 py-0.5 rounded-full font-semibold text-[11px]', QA_TOPIC_PILL[q.topic] || PILL.gray)}>{q.topic || 'General'}</span>
                          </td>
                          <td className="px-4 py-2.5 min-w-[260px] max-w-[360px]">
                            <p className="text-[#2e241b] font-medium">{q.title}</p>
                            {q.description && q.description !== q.title && <p className="text-[#6d5f4c] text-xs mt-0.5">{q.description}</p>}
                            {q.answer ? (
                              <div className={clsx('mt-1.5 p-2 rounded-lg text-xs text-[#2e241b]', PILL.success)}>
                                <p className="text-[10px] text-[#3a5f3c] font-semibold mb-0.5">{q.answeredBy ? `${q.answeredBy.firstName} ${q.answeredBy.lastName}` : 'Answered'}</p>
                                {q.answer}
                              </div>
                            ) : (
                              <div className="mt-1.5 flex items-center gap-1.5">
                                <input
                                  value={qaReplyDrafts[q._id] || ''}
                                  onChange={(e) => setQaReplyDrafts((d) => ({ ...d, [q._id]: e.target.value }))}
                                  placeholder="Type a reply…"
                                  className="px-2.5 py-1.5 text-xs rounded-[8px] border-[1.5px] border-[#d3c9b4] bg-[#f0eadd] flex-1 min-w-[120px] focus:outline-none focus:border-[#968871]"
                                />
                                <button
                                  onClick={() => {
                                    const answer = (qaReplyDrafts[q._id] || '').trim();
                                    if (!answer) { toast.error('Reply cannot be empty'); return; }
                                    answerQueryMutation.mutate({ queryId: q._id, answer });
                                  }}
                                  disabled={answerQueryMutation.isPending}
                                  className="px-3 py-1.5 rounded-full bg-[#f2b23e] text-[#2e241b] text-xs font-bold hover:brightness-95 transition disabled:opacity-50 whitespace-nowrap"
                                >
                                  Reply
                                </button>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-[#968871] text-xs whitespace-nowrap">{format(new Date(q.createdAt), 'dd MMM, hh:mm a')}</td>
                          <td className="px-4 py-2.5 text-[#968871] text-xs whitespace-nowrap">{q.askedVia || '—'}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <span className={clsx('px-2 py-0.5 rounded-full font-semibold text-[11px]', q.status === 'pending' ? PILL.warning : q.status === 'in_progress' ? PILL.info : PILL.success)}>{q.status.replace('_', ' ')}</span>
                            {q.convertedTo && <span className="ml-1 px-2 py-0.5 rounded-full font-semibold text-[11px] bg-[#e7dfce] text-[#4a3a29]">→ {q.convertedTo}</span>}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex flex-col items-start gap-1 whitespace-nowrap">
                              <button onClick={() => { setOpenLeadId(q.leadId?._id); setOpenLeadInitialTab('Products'); }} className={textLink}>🆕 Create Product</button>
                              <button onClick={() => { setConnectingQueryId((id) => id === q._id ? null : q._id); setConnectCatalogSearch(''); }} className={textLink}>🔗 Connect Existing</button>
                              <button
                                disabled={!hasProduct}
                                title={hasProduct ? '' : 'Link a product to this lead first'}
                                onClick={() => { setOpenLeadId(q.leadId?._id); setOpenLeadInitialTab('Formulas'); }}
                                className={clsx(textLink, !hasProduct && 'opacity-40 cursor-not-allowed')}
                              >
                                🧬 Create Formula
                              </button>
                              <button
                                disabled={!hasProduct}
                                title={hasProduct ? '' : 'Link a product to this lead first'}
                                onClick={() => { setOpenLeadId(q.leadId?._id); setOpenLeadInitialTab('Samples'); }}
                                className={clsx(textLink, !hasProduct && 'opacity-40 cursor-not-allowed')}
                              >
                                🧪 Create Sample
                              </button>
                              {relatedLead?.productionOrderId && (
                                <button onClick={() => { setOpenLeadId(q.leadId?._id); setOpenLeadInitialTab('Production'); }} className={textLink}>🏭 Track Production →</button>
                              )}
                              <button onClick={() => { setOpenLeadId(q.leadId?._id); setOpenLeadInitialTab(null); }} className={textLink}>Open lead ▸</button>
                            </div>
                          </td>
                        </tr>
                        {connectingQueryId === q._id && (
                          <tr className="border-b border-[#e2dac8]">
                            <td colSpan={10} className="p-2">
                              <div className="p-2 rounded-lg border-[1.5px] border-dashed border-[#d3c9b4] bg-[#e7dfce]">
                                <input
                                  value={connectCatalogSearch}
                                  onChange={(e) => setConnectCatalogSearch(e.target.value)}
                                  placeholder="Search catalog products to connect…"
                                  className={clsx(modalInputCls, 'w-full')}
                                />
                                {connectCatalogSearch && (
                                  <div className="mt-1 rounded-[10px] border border-[#d3c9b4] bg-white max-h-32 overflow-y-auto">
                                    {connectCatalogMatches.length === 0 && <div className="px-3 py-2 text-xs text-[#968871]">No products found</div>}
                                    {connectCatalogMatches.slice(0, 8).map((p) => (
                                      <button key={p._id} type="button"
                                        onClick={() => connectProductMutation.mutate({ leadId: q.leadId?._id, product: p })}
                                        className="w-full text-left px-3 py-2 text-xs hover:bg-[#e7dfce] flex justify-between">
                                        <span className="text-[#2e241b]">{p.name}</span>
                                        <span className="text-[#968871] font-mono">{p.code}</span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {(tab === 'sample' || tab === 'payments') && (
            <div className="overflow-x-auto rounded-[10px] border border-[#e2dac8]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#d3c9b4] text-left text-[11px] uppercase tracking-wide text-[#6d5f4c] bg-[#e7dfce]">
                    <SortableTh label="Customer" sortKey="name" sortState={sortState} setSortState={setSortState} />
                    <th className="px-4 py-2.5">Product Interest</th>
                    <SortableTh label="Sample Stage" sortKey="stage" sortState={sortState} setSortState={setSortState} />
                    <SortableTh label="Payment" sortKey="payment" sortState={sortState} setSortState={setSortState} />
                    {tab !== 'payments' && <th className="px-4 py-2.5">Assigned To</th>}
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && <tr><td colSpan={6} className="px-4 py-8 text-center text-[#968871] text-xs">Loading…</td></tr>}
                  {!isLoading && sortedRows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-[#968871] text-xs">Nothing here right now.</td></tr>}
                  {sortedRows.map((l) => (
                    <tr key={l._id} className="border-b border-[#e2dac8] hover:bg-[#e7dfce]/60">
                      <td className="px-4 py-2.5">
                        <p className="text-[#2e241b] font-medium">{l.name}</p>
                        <p className="text-[#968871] text-xs">{l.company || '—'}</p>
                      </td>
                      <td className="px-4 py-2.5 text-[#6d5f4c] text-xs">{(l.productInterest || []).join(', ') || '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded-full', SUB_STAGE_PILL[l.sampleDetails?.subStage] || SUB_STAGE_PILL.Requested)}>
                          {l.sampleDetails?.subStage || 'Requested'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded-full', l.sampleDetails?.paymentStatus === 'full_paid' ? PILL.success : PILL.warning)}>
                          {l.sampleDetails?.paymentStatus === 'full_paid' ? 'Paid' : 'Pending'}
                        </span>
                      </td>
                      {tab !== 'payments' && (
                        <td className="px-4 py-2.5 text-xs">
                          <span className="text-[#6d5f4c]">{l.assignedTo ? `${l.assignedTo.firstName || ''} ${l.assignedTo.lastName || ''}`.trim() : 'Unassigned'}</span>
                        </td>
                      )}
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        {tab === 'payments' && (
                          l.sampleDetails?.paymentStatus === 'full_paid'
                            ? <span className="text-xs text-[#3a5f3c] font-semibold mr-3">✓ Paid</span>
                            : (
                              <button onClick={() => setPayConfirmFor(l)} className={clsx(textLink, 'mr-3')}>
                                Confirm Payment
                              </button>
                            )
                        )}
                        {l.productionOrderId && (
                          <button onClick={() => { setOpenLeadId(l._id); setOpenLeadInitialTab('Production'); }} className={clsx(textLink, 'mr-3')}>
                            🏭 Track Production →
                          </button>
                        )}
                        <button onClick={() => { setOpenLeadId(l._id); setOpenLeadInitialTab(null); }} className={textLink}>Open ▸</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Awaiting Production / Orders — column set mirrors the reference design's single
              "Orders — Master Ledger" table (Customer ID, Order ID, Product, Qty, Delivery), split
              across our two tabs since Send to Production is a real manual step here (no order
              exists yet for "awaiting" rows), and Cost/Price-per-unit dropped since our real
              ProductionOrder/Batch Tracker record doesn't track those the way the static mock did. */}
          {(tab === 'awaiting' || tab === 'linked') && (
            <div className="overflow-x-auto rounded-[10px] border border-[#e2dac8]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#d3c9b4] text-left text-[11px] uppercase tracking-wide text-[#6d5f4c] bg-[#e7dfce]">
                    <SortableTh label="Customer ID" sortKey="custId" sortState={sortState} setSortState={setSortState} />
                    <SortableTh label="Order ID" sortKey="orderId" sortState={sortState} setSortState={setSortState} />
                    <SortableTh label="Customer" sortKey="name" sortState={sortState} setSortState={setSortState} />
                    <SortableTh label="Product" sortKey="product" sortState={sortState} setSortState={setSortState} />
                    <SortableTh label="Qty" sortKey="qty" sortState={sortState} setSortState={setSortState} />
                    <SortableTh label="Delivery" sortKey="delivery" sortState={sortState} setSortState={setSortState} />
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && <tr><td colSpan={7} className="px-4 py-8 text-center text-[#968871] text-xs">Loading…</td></tr>}
                  {!isLoading && sortedRows.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-[#968871] text-xs">Nothing here right now.</td></tr>}
                  {sortedRows.map((l) => (
                    <tr key={l._id} className="border-b border-[#e2dac8] hover:bg-[#e7dfce]/60">
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <button
                          onClick={() => { setOpenLeadId(l._id); setOpenLeadInitialTab(null); }}
                          title={`Open ${customerId(l)}`}
                          className="font-mono font-bold text-[#4a3a29] hover:underline"
                        >
                          {customerId(l)}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {l.productionOrderId?.orderNumber
                          ? <span className="font-mono font-bold text-[#4a3a29]">{l.productionOrderId.orderNumber}</span>
                          : <span className="text-[#968871]">—</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="text-[#2e241b] font-medium whitespace-nowrap">{l.name}</p>
                        <p className="text-[#968871] text-xs whitespace-nowrap">{l.company || '—'}</p>
                      </td>
                      <td className="px-4 py-2.5 text-[#6d5f4c] text-xs whitespace-nowrap">{l.productionOrderId?.catalogProduct?.name || '—'}</td>
                      <td className="px-4 py-2.5 text-[#6d5f4c] text-xs whitespace-nowrap">{l.productionOrderId?.batchSizeKg ? `${l.productionOrderId.batchSizeKg} kg` : '—'}</td>
                      <td className="px-4 py-2.5 text-[#6d5f4c] text-xs whitespace-nowrap">{l.productionOrderId?.deliveryDate || '—'}</td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        {tab === 'awaiting' && (
                          <button onClick={() => { setSendLead(l); setSelectedCatalogProduct(null); setCatalogSearch(''); setBatchSizeKg(10); }}
                            className={clsx(textLink, 'disabled:opacity-50 mr-3')}>
                            Send to Production →
                          </button>
                        )}
                        {tab === 'awaiting' && l.productionOrderId && (
                          <button onClick={() => { setOpenLeadId(l._id); setOpenLeadInitialTab('Production'); }} className={clsx(textLink, 'mr-3')}>
                            🏭 Track Production →
                          </button>
                        )}
                        {tab === 'linked' && (
                          <>
                            {l.productionOrderId && (
                              <button
                                onClick={() => setFocusStageOrder({ orderId: l.productionOrderId._id, stageTab: ORDER_EDIT_TAB, StageComponent: StageOrder })}
                                className={clsx(textLink, 'mr-3')}
                              >
                                ✏️ Edit
                              </button>
                            )}
                            <button
                              onClick={() => { setOpenOrderLead(l); setOrderQty(''); setOrderDeliveryDate(''); setOrderMarginPct(30); }}
                              className={clsx(textLink, 'mr-3')}
                            >
                              Order Detail
                            </button>
                            <button
                              onClick={() => { setOpenLeadId(l._id); setOpenLeadInitialTab('Production'); }}
                              className={clsx(textLink, 'mr-3')}
                            >
                              🏭 Track Production →
                            </button>
                            {l.status === 'Dispatched' ? (
                              <span className="text-xs text-[#3a5f3c] font-semibold">✓ Dispatched</span>
                            ) : (
                              <button
                                onClick={() => { setDispatchLead(l); setDispatchNote(''); setDispatchFile(null); }}
                                className={clsx(textLink, 'font-semibold')}
                              >
                                Confirm Dispatch
                              </button>
                            )}
                          </>
                        )}
                        <button onClick={() => { setOpenLeadId(l._id); setOpenLeadInitialTab(null); }} className={clsx(textLink, 'ml-3')}>Open ▸</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'linked' && orphanOrders.length > 0 && (
            <div className="mt-5">
              <p className="text-xs font-semibold text-[#6d5f4c] uppercase tracking-wide mb-2">Orders without a linked lead</p>
              <div className="overflow-x-auto rounded-[10px] border border-[#e2dac8]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#d3c9b4] text-left text-[11px] uppercase tracking-wide text-[#6d5f4c] bg-[#e7dfce]">
                      <th className="px-4 py-2.5">Order ID</th>
                      <th className="px-4 py-2.5">Customer</th>
                      <th className="px-4 py-2.5">Product</th>
                      <th className="px-4 py-2.5">Qty</th>
                      <th className="px-4 py-2.5">Delivery</th>
                      <th className="px-4 py-2.5">Stage</th>
                      <th className="px-4 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {orphanOrders.map((o) => (
                      <tr key={o._id} className="border-b border-[#e2dac8] hover:bg-[#e7dfce]/60">
                        <td className="px-4 py-2.5 font-mono font-bold text-[#4a3a29] whitespace-nowrap">{o.orderNumber}</td>
                        <td className="px-4 py-2.5 text-[#2e241b] whitespace-nowrap">{o.customer || '—'}</td>
                        <td className="px-4 py-2.5 text-[#6d5f4c] text-xs whitespace-nowrap">{o.catalogProduct?.name || '—'}</td>
                        <td className="px-4 py-2.5 text-[#6d5f4c] text-xs whitespace-nowrap">{o.batchSizeKg ? `${o.batchSizeKg} kg` : '—'}</td>
                        <td className="px-4 py-2.5 text-[#6d5f4c] text-xs whitespace-nowrap">{o.deliveryDate || '—'}</td>
                        <td className="px-4 py-2.5 text-xs whitespace-nowrap">{STAGE_NAMES[o.stage]}</td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          <button onClick={() => setOpenOrderId(o._id)} className={clsx(textLink)}>Track Production →</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {currentProdStageTab && (
            <div className="overflow-x-auto rounded-[10px] border border-[#e2dac8]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#d3c9b4] text-left text-[11px] uppercase tracking-wide text-[#6d5f4c] bg-[#e7dfce]">
                    <th className="px-4 py-2.5">Order ID</th>
                    <th className="px-4 py-2.5">Customer</th>
                    <th className="px-4 py-2.5">Product</th>
                    <th className="px-4 py-2.5">Qty</th>
                    <th className="px-4 py-2.5">Delivery</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {!allProductionOrders && <tr><td colSpan={6} className="px-4 py-8 text-center text-[#968871] text-xs">Loading…</td></tr>}
                  {allProductionOrders && currentProdStageOrders.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-[#968871] text-xs">No orders at {currentProdStageTab.label} right now.</td></tr>}
                  {currentProdStageOrders.map((o) => (
                    <tr
                      key={o._id}
                      onClick={() => setFocusStageOrder({ orderId: o._id, stageTab: currentProdStageTab, StageComponent: PROD_STAGE_COMPONENT[currentProdStageTab.key] })}
                      className="border-b border-[#e2dac8] hover:bg-[#e7dfce]/60 cursor-pointer"
                    >
                      <td className="px-4 py-2.5 font-mono font-bold text-[#4a3a29] whitespace-nowrap">{o.orderNumber}</td>
                      <td className="px-4 py-2.5 text-[#2e241b] whitespace-nowrap">{o.customer || '—'}</td>
                      <td className="px-4 py-2.5 text-[#6d5f4c] text-xs whitespace-nowrap">{o.catalogProduct?.name || '—'}</td>
                      <td className="px-4 py-2.5 text-[#6d5f4c] text-xs whitespace-nowrap">{o.batchSizeKg ? `${o.batchSizeKg} kg` : '—'}</td>
                      <td className="px-4 py-2.5 text-[#6d5f4c] text-xs whitespace-nowrap">{o.deliveryDate || '—'}</td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <span className={textLink}>Open →</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      {openOrderId && (
        <OrphanOrderPanel orderId={openOrderId} onClose={() => setOpenOrderId(null)} />
      )}

      {focusStageOrder && (
        <StageFocusPanel
          orderId={focusStageOrder.orderId}
          stageTab={focusStageOrder.stageTab}
          StageComponent={focusStageOrder.StageComponent}
          onClose={() => setFocusStageOrder(null)}
        />
      )}

      {openLeadId && (
        <SampleLeadDetail
          leadId={openLeadId}
          initialTab={openLeadInitialTab}
          onClose={() => { setOpenLeadId(null); setOpenLeadInitialTab(null); }}
        />
      )}

      {showCreateLead && <EditKycModal onClose={() => setShowCreateLead(false)} />}

      {sendLead && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={bodyFont}>
          <style>{FONT_IMPORT}</style>
          <div className="absolute inset-0 bg-[#2e241b]/50 backdrop-blur-sm" onClick={() => setSendLead(null)} />
          <div className="relative bg-white rounded-2xl shadow-[0_10px_40px_rgba(46,36,27,0.16)] w-full max-w-md border border-[#d3c9b4]">
            <div className="p-5 border-b border-[#e2dac8] bg-[#e7dfce] rounded-t-2xl">
              <h3 className="font-bold text-[#2e241b]" style={displayFont}>🏭 Send to Production</h3>
              <p className="text-xs text-[#6d5f4c] mt-0.5">{sendLead.name} — creates a Batch Tracker order pre-filled from this lead.</p>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1 block">Catalog product</label>
                <input
                  value={selectedCatalogProduct ? selectedCatalogProduct.name : catalogSearch}
                  onChange={(e) => { setCatalogSearch(e.target.value); setSelectedCatalogProduct(null); }}
                  placeholder="Search catalog products…"
                  className={clsx('px-3 py-2 text-sm rounded-[10px] border-[1.5px] border-[#d3c9b4] bg-[#fff] text-[#2e241b] focus:outline-none focus:border-[#968871] w-full')}
                />
                {catalogSearch && !selectedCatalogProduct && (
                  <div className="mt-1 rounded-[10px] border border-[#d3c9b4] bg-white max-h-32 overflow-y-auto">
                    {catalogMatches.length === 0 && <div className="px-3 py-2 text-xs text-[#968871]">No products found</div>}
                    {catalogMatches.slice(0, 8).map((p) => (
                      <button key={p._id} type="button" onClick={() => { setSelectedCatalogProduct(p); setCatalogSearch(''); }}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-[#e7dfce] flex justify-between">
                        <span className="text-[#2e241b]">{p.name}</span>
                        <span className="text-[#968871] font-mono">{p.code}</span>
                      </button>
                    ))}
                  </div>
                )}
                {selectedCatalogProduct && (
                  <p className="text-[11px] text-[#968871] mt-1">{selectedCatalogProduct.formulation?.rows?.length || 0} ingredient(s) in formulation</p>
                )}
              </div>
              <div>
                <label className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1 block">Batch size (kg)</label>
                <input type="number" min="0.1" step="0.1" value={batchSizeKg} onChange={(e) => setBatchSizeKg(e.target.value)}
                  className="px-3 py-2 text-sm rounded-[10px] border-[1.5px] border-[#d3c9b4] bg-white text-[#2e241b] focus:outline-none focus:border-[#968871] w-full" />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setSendLead(null)} className={clsx(outlineBtn, 'flex-1 justify-center')}>Cancel</button>
                <button
                  onClick={() => {
                    if (!selectedCatalogProduct) { toast.error('Select a catalog product'); return; }
                    if (!batchSizeKg || Number(batchSizeKg) <= 0) { toast.error('Enter a valid batch size'); return; }
                    sendToProduction.mutate({ leadId: sendLead._id, catalogProduct: selectedCatalogProduct._id, batchSizeKg: Number(batchSizeKg) });
                  }}
                  disabled={sendToProduction.isPending}
                  className={clsx(accentBtn, 'flex-1 justify-center')}
                >
                  {sendToProduction.isPending ? 'Sending…' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editKycLead && <EditKycModal lead={editKycLead} onClose={() => setEditKycLead(null)} />}

      {payConfirmFor && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={bodyFont}>
          <style>{FONT_IMPORT}</style>
          <div className="absolute inset-0 bg-[#2e241b]/50 backdrop-blur-sm" onClick={() => setPayConfirmFor(null)} />
          <div className="relative bg-white rounded-2xl shadow-[0_10px_40px_rgba(46,36,27,0.16)] w-full max-w-md border border-[#d3c9b4]">
            <div className="p-5 border-b border-[#e2dac8] bg-[#e7dfce] rounded-t-2xl">
              <h3 className="font-bold text-[#2e241b]" style={displayFont}>💳 Confirm R&D Payment</h3>
              <p className="text-xs text-[#6d5f4c] mt-0.5">{payConfirmFor.name} — ₹{(payConfirmFor.sampleDetails?.chargeAmount || 0).toLocaleString('en-IN')}</p>
            </div>
            <div className="p-5 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <select value={payMode} onChange={(e) => setPayMode(e.target.value)}
                  className="px-3 py-2 text-sm rounded-[10px] border-[1.5px] border-[#d3c9b4] bg-white text-[#2e241b] focus:outline-none focus:border-[#968871]">
                  <option value="upi">UPI</option>
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank Transfer</option>
                </select>
                <input value={payTxnRef} onChange={(e) => setPayTxnRef(e.target.value)} placeholder="Txn / Ref No."
                  className="px-3 py-2 text-sm rounded-[10px] border-[1.5px] border-[#d3c9b4] bg-white text-[#2e241b] focus:outline-none focus:border-[#968871]" />
                <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)}
                  className="px-3 py-2 text-sm rounded-[10px] border-[1.5px] border-[#d3c9b4] bg-white text-[#2e241b] focus:outline-none focus:border-[#968871]" />
                <input value={payReceivedBy} onChange={(e) => setPayReceivedBy(e.target.value)} placeholder="Received by"
                  className="px-3 py-2 text-sm rounded-[10px] border-[1.5px] border-[#d3c9b4] bg-white text-[#2e241b] focus:outline-none focus:border-[#968871]" />
              </div>
              <textarea value={payNotes} onChange={(e) => setPayNotes(e.target.value)} placeholder="Notes (optional)…" rows={2}
                className="w-full px-3 py-2 text-sm rounded-[10px] border-[1.5px] border-[#d3c9b4] bg-white text-[#2e241b] focus:outline-none focus:border-[#968871]" />
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setPayConfirmFor(null)} className={clsx(outlineBtn, 'flex-1 justify-center')}>Cancel</button>
                <button
                  onClick={() => confirmPayment.mutate({
                    leadId: payConfirmFor._id, paymentMode: payMode,
                    paymentTxnRef: payTxnRef.trim() || undefined, paidAt: payDate || undefined,
                    receivedBy: payReceivedBy.trim() || undefined, paymentNotes: payNotes.trim() || undefined,
                  })}
                  disabled={confirmPayment.isPending}
                  className={clsx(accentBtn, 'flex-1 justify-center')}
                >
                  {confirmPayment.isPending ? 'Confirming…' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {openOrderLead && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={bodyFont}>
          <style>{FONT_IMPORT}</style>
          <div className="absolute inset-0 bg-[#2e241b]/50 backdrop-blur-sm" onClick={() => setOpenOrderLead(null)} />
          <div className="relative bg-white rounded-2xl shadow-[0_10px_40px_rgba(46,36,27,0.16)] w-full max-w-md border border-[#d3c9b4]">
            <div className="p-5 border-b border-[#e2dac8] bg-[#e7dfce] rounded-t-2xl">
              <h3 className="font-bold text-[#2e241b]" style={displayFont}>🧾 Order Detail</h3>
              <p className="text-xs text-[#6d5f4c] mt-0.5">{openOrderLead.name} — {openOrderLead.productionOrderId?.orderNumber}</p>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1 block">Quantity</label>
                <input type="number" value={orderQty} onChange={(e) => setOrderQty(e.target.value)} className={clsx(modalInputCls, 'w-full')} />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1 block">Delivery date</label>
                <input type="date" value={orderDeliveryDate} onChange={(e) => setOrderDeliveryDate(e.target.value)} className={clsx(modalInputCls, 'w-full')} />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1 block">Margin %</label>
                <input type="number" value={orderMarginPct} onChange={(e) => setOrderMarginPct(e.target.value)} className={clsx(modalInputCls, 'w-full')} />
              </div>
              {openOrderDetail && (() => {
                const cost = openOrderDetail.estimatedCost || 0;
                const margin = Number(orderMarginPct) || 0;
                const suggestedPrice = margin < 100 ? cost / (1 - margin / 100) : cost;
                return (
                  <div className="flex items-center gap-4 flex-wrap text-xs px-3 py-2 rounded-lg bg-[#e7dfce]">
                    <span>Estimated cost: <strong>₹{cost.toFixed(2)}</strong></span>
                    <span>Suggested price: <strong>₹{suggestedPrice.toFixed(2)}</strong></span>
                  </div>
                );
              })()}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className={clsx(outlineBtn, 'flex-1 justify-center')}
                >
                  🖨️ Print
                </button>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(openOrderDetail || {}, null, 2));
                    toast.success('Order JSON copied');
                  }}
                  className={clsx(outlineBtn, 'flex-1 justify-center')}
                >
                  📋 Copy JSON
                </button>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setOpenOrderLead(null)} className={clsx(outlineBtn, 'flex-1 justify-center')}>Close</button>
                <button
                  onClick={() => {
                    const orderId = openOrderLead.productionOrderId?._id;
                    if (!orderId) return;
                    updateOrderMutation.mutate({
                      orderId,
                      body: { plannedQuantity: Number(orderQty) || undefined, deliveryDate: orderDeliveryDate || undefined },
                    });
                  }}
                  disabled={updateOrderMutation.isPending}
                  className={clsx(accentBtn, 'flex-1 justify-center')}
                >
                  {updateOrderMutation.isPending ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {dispatchLead && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={bodyFont}>
          <style>{FONT_IMPORT}</style>
          <div className="absolute inset-0 bg-[#2e241b]/50 backdrop-blur-sm" onClick={() => setDispatchLead(null)} />
          <div className="relative bg-white rounded-2xl shadow-[0_10px_40px_rgba(46,36,27,0.16)] w-full max-w-md border border-[#d3c9b4]">
            <div className="p-5 border-b border-[#e2dac8] bg-[#e7dfce] rounded-t-2xl">
              <h3 className="font-bold text-[#2e241b]" style={displayFont}>🚚 Confirm Dispatch</h3>
              <p className="text-xs text-[#6d5f4c] mt-0.5">{dispatchLead.name} — {dispatchLead.productionOrderId?.orderNumber}</p>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1 block">Note to client (optional)</label>
                <textarea
                  value={dispatchNote}
                  onChange={(e) => setDispatchNote(e.target.value)}
                  rows={3}
                  className={clsx(modalInputCls, 'w-full resize-none')}
                  placeholder="e.g. Tracking details, courier info…"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1 block">Proof (photo/video, optional)</label>
                <input
                  type="file"
                  accept="image/*,video/*"
                  onChange={(e) => setDispatchFile(e.target.files?.[0] || null)}
                  className="text-xs text-[#6d5f4c]"
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setDispatchLead(null)} className={clsx(outlineBtn, 'flex-1 justify-center')}>Cancel</button>
                <button
                  onClick={() => confirmDispatch.mutate({ leadId: dispatchLead._id, note: dispatchNote, file: dispatchFile })}
                  disabled={confirmDispatch.isPending}
                  className={clsx(accentBtn, 'flex-1 justify-center')}
                >
                  {confirmDispatch.isPending ? 'Dispatching…' : 'Confirm Dispatch'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Lead-less order view — same StageBar + stage forms as the Production tab inside
// SampleLeadDetail, minus the lead-side tabs since there's no Lead record behind this order.
function OrphanOrderPanel({ orderId, onClose }) {
  const qc = useQueryClient();
  const [viewStage, setViewStage] = useState(null);

  const { data: order, isLoading } = useQuery({
    queryKey: ['production-order', orderId],
    queryFn: () => api.get(`/production/${orderId}`).then((r) => r.data.order),
    refetchInterval: 15 * 1000,
  });

  const invalidateOrder = () => {
    qc.invalidateQueries({ queryKey: ['production-order', orderId] });
    qc.invalidateQueries({ queryKey: ['production-orders'] });
  };

  const stage = viewStage ?? order?.stage ?? 0;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={bodyFont}>
      <style>{FONT_IMPORT}</style>
      <div className="absolute inset-0 bg-[#2e241b]/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-[0_10px_40px_rgba(46,36,27,0.16)] w-full max-w-4xl border border-[#d3c9b4] flex flex-col" style={{ maxHeight: '90vh' }}>
        <div className="p-5 border-b border-[#e2dac8] bg-[#e7dfce] flex items-center justify-between flex-shrink-0 rounded-t-2xl">
          <div>
            <h3 className="font-bold text-[#2e241b]" style={displayFont}>{order?.orderNumber || 'Loading…'}</h3>
            <p className="text-xs text-[#6d5f4c]">{order?.customer || 'No linked CRM lead'} · {order?.catalogProduct?.name || '—'}</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-lg hover:bg-[#ddd3be] flex items-center justify-center text-[#968871] hover:text-[#2e241b] text-lg">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {isLoading || !order ? (
            <p className="text-sm text-[#968871] text-center py-8">Loading order…</p>
          ) : (
            <>
              <StageBar order={order} viewStage={stage} setViewStage={setViewStage} />
              {stage === 0 && <StageOrder order={order} onSaved={invalidateOrder} />}
              {stage === 1 && <StageWorkAssignment order={order} onSaved={invalidateOrder} />}
              {stage === 2 && <StageProcurement order={order} onAdvanced={invalidateOrder} />}
              {stage === 3 && <StageWeighing order={order} onSaved={invalidateOrder} />}
              {stage === 4 && <StageBulkQC order={order} onSaved={invalidateOrder} />}
              {stage === 5 && <StagePackaging order={order} onSaved={invalidateOrder} />}
              {stage === 6 && <StageFinalQC order={order} onSaved={invalidateOrder} />}
              {stage === 7 && <StageDispatch order={order} onSaved={invalidateOrder} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Opened from a production-stage tab (Procurement..Dispatch) — shows just that one stage's
// function, no lead tabs, no cross-stage StageBar. Every order listed under a stage tab is
// guaranteed to currently be at that exact stage, so there's nothing else to navigate to here.
function StageFocusPanel({ orderId, stageTab, StageComponent, onClose }) {
  const qc = useQueryClient();

  const { data: order, isLoading } = useQuery({
    queryKey: ['production-order', orderId],
    queryFn: () => api.get(`/production/${orderId}`).then((r) => r.data.order),
    refetchInterval: 15 * 1000,
  });

  const invalidateOrder = () => {
    qc.invalidateQueries({ queryKey: ['production-order', orderId] });
    qc.invalidateQueries({ queryKey: ['production-orders'] });
    qc.invalidateQueries({ queryKey: ['sample-production'] });
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={bodyFont}>
      <style>{FONT_IMPORT}</style>
      <div className="absolute inset-0 bg-[#2e241b]/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-[0_10px_40px_rgba(46,36,27,0.16)] w-full max-w-3xl border border-[#d3c9b4] flex flex-col" style={{ maxHeight: '90vh' }}>
        <div className="p-5 border-b border-[#e2dac8] bg-[#e7dfce] flex items-center justify-between flex-shrink-0 rounded-t-2xl">
          <div>
            <h3 className="font-bold text-[#2e241b]" style={displayFont}>{stageTab?.emoji} {stageTab?.label} — {order?.orderNumber || 'Loading…'}</h3>
            <p className="text-xs text-[#6d5f4c]">{order?.customer || 'No linked CRM lead'} · {order?.catalogProduct?.name || '—'}</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-lg hover:bg-[#ddd3be] flex items-center justify-center text-[#968871] hover:text-[#2e241b] text-lg">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {isLoading || !order ? (
            <p className="text-sm text-[#968871] text-center py-8">Loading order…</p>
          ) : (
            <StageComponent order={order} onSaved={invalidateOrder} onAdvanced={invalidateOrder} />
          )}
        </div>
      </div>
    </div>
  );
}
