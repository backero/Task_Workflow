import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  PlusIcon, PhoneIcon, EnvelopeIcon, XMarkIcon,
  MapPinIcon, CurrencyRupeeIcon, UserIcon, ClockIcon, CheckCircleIcon,
  ArrowRightIcon, TableCellsIcon, CalendarDaysIcon, ChatBubbleLeftIcon,
  QuestionMarkCircleIcon, ArrowTopRightOnSquareIcon, TrashIcon,
  ChartBarIcon, SparklesIcon, ArrowTrendingUpIcon, FunnelIcon, DocumentTextIcon,
} from '@heroicons/react/24/outline';
import api from '../../api/axios';
import { useAuthStore } from '../../store/useAuthStore';
import { clsx } from 'clsx';
import { format, isValid } from 'date-fns';
import toast from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import GoogleSheetsPanel from '../../components/crm/GoogleSheetsPanel';
import ErrorBoundary from '../../components/common/ErrorBoundary';

const PIPELINE_STAGES = ['New Lead', 'Follow-up', 'Sample', 'In Progress', 'Ready to Dispatch', 'Payment Pending', 'Dispatched', 'Lost'];

const STAGE_META = {
  'New Lead':          { grad: 'linear-gradient(135deg,#475569 0%,#1e293b 100%)', accent: '#94a3b8', badge: 'bg-slate-100 text-slate-600 dark:bg-[#132035] dark:text-slate-300'       },
  'Follow-up':         { grad: 'linear-gradient(135deg,#f59e0b 0%,#b45309 100%)', accent: '#f59e0b', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'   },
  'Sample':            { grad: 'linear-gradient(135deg,#d946ef 0%,#a21caf 100%)', accent: '#e879f9', badge: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300' },
  'In Progress':       { grad: 'linear-gradient(135deg,#3b82f6 0%,#1d4ed8 100%)', accent: '#60a5fa', badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'       },
  'Ready to Dispatch': { grad: 'linear-gradient(135deg,#8b5cf6 0%,#5b21b6 100%)', accent: '#a78bfa', badge: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300' },
  'Dispatched':        { grad: 'linear-gradient(135deg,#14b8a6 0%,#0f766e 100%)', accent: '#2dd4bf', badge: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300'       },
  'Payment Pending':   { grad: 'linear-gradient(135deg,#22c55e 0%,#15803d 100%)', accent: '#4ade80', badge: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'   },
  'Lost':              { grad: 'linear-gradient(135deg,#f43f5e 0%,#9f1239 100%)', accent: '#fb7185', badge: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'       },
};
const STAGE_BADGE = Object.fromEntries(Object.entries(STAGE_META).map(([k, v]) => [k, v.badge]));

const FOLLOWUP_TYPES = ['call', 'whatsapp', 'meeting', 'email', 'demo', 'other'];
const FOLLOWUP_ICONS = { call: '📞', whatsapp: '💬', meeting: '🤝', email: '✉️', demo: '🖥️', other: '📝' };

// Display name overrides (internal value stays the same for MongoDB)
const STAGE_DISPLAY = { 'In Progress': 'Production' };
const stageLabel = (s) => STAGE_DISPLAY[s] || s;

const LOST_REASONS = ['Price too high', 'Chose competitor', 'No budget', 'No response / Ghosted', 'Timeline mismatch', 'Product not suitable', 'Changed requirements', 'Other'];

const SOURCES = ['Website Form', 'WhatsApp Chatbot', 'Google Sheets', 'Meta Ads', 'Manual Entry', 'Import', 'Referral'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];

// ── Lead Card ────────────────────────────────────────────────────────────────
const PRIORITY_CFG = {
  critical: { dot: 'bg-red-500',    pill: 'bg-red-50 text-red-600 dark:bg-red-900/40 dark:text-red-400' },
  high:     { dot: 'bg-orange-500', pill: 'bg-orange-50 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400' },
  medium:   { dot: 'bg-yellow-400', pill: 'bg-yellow-50 text-yellow-600 dark:bg-yellow-900/40 dark:text-yellow-400' },
  low:      { dot: 'bg-gray-300',   pill: 'bg-gray-50 text-gray-500 dark:bg-[#132035]/50 dark:text-gray-400' },
};

function LeadCard({ lead, stage, onClick, onAddLog }) {
  const hasPending = lead.pendingQueries > 0;
  const hasAnswered = lead.answeredQueries > 0;
  const meta = STAGE_META[stage] || STAGE_META['New Lead'];
  const p = PRIORITY_CFG[lead.priority] || PRIORITY_CFG.low;
  const initials = (lead.name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const isOverdueFollowUp = lead.nextFollowUpAt && new Date(lead.nextFollowUpAt) < new Date()
    && (!lead.lastContactedAt || new Date(lead.lastContactedAt) < new Date(lead.nextFollowUpAt));

  return (
    <div
      onClick={() => onClick(lead)}
      className={clsx(
        'bg-white dark:bg-[#0f1a2e] rounded-2xl cursor-pointer select-none',
        'border border-gray-100/80 dark:border-[#1b2e4a]',
        'shadow-sm hover:shadow-xl dark:shadow-slate-900/50 dark:hover:shadow-slate-900/80',
        'transition-all duration-200 hover:-translate-y-1 active:translate-y-0',
        hasPending && 'ring-1 ring-amber-400/50 dark:ring-amber-500/40',
        isOverdueFollowUp && 'ring-1 ring-red-400/60 dark:ring-red-500/50',
        lead.isStale && !isOverdueFollowUp && 'ring-1 ring-orange-400/50 dark:ring-orange-500/40',
      )}
    >
      <div className="p-3.5">
        {/* Avatar + Name */}
        <div className="flex items-start gap-2.5 mb-2.5">
          <div
            className="w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center text-white text-[11px] font-black shadow-md"
            style={{ background: meta.grad }}
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <p className="font-bold text-[13px] text-gray-900 dark:text-white leading-snug line-clamp-1">{lead.name}</p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate mt-0.5">
              {lead.company || lead.phone}
            </p>
          </div>
          <span className={clsx('flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-bold flex items-center gap-0.5', p.pill)}>
            <span className={clsx('w-1.5 h-1.5 rounded-full', p.dot)} />
            {lead.priority[0].toUpperCase()}
          </span>
        </div>

        {/* Phone chip */}
        <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-[#132035]/60 rounded-lg px-2 py-1.5 text-[11px] text-gray-500 dark:text-gray-400">
          <PhoneIcon className="w-3 h-3 flex-shrink-0 text-gray-300 dark:text-slate-500" />
          {lead.phone}
          {lead.estimatedValue > 0 && (
            <span className="ml-auto font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
              <CurrencyRupeeIcon className="w-3 h-3" />
              {lead.estimatedValue.toLocaleString('en-IN')}
            </span>
          )}
        </div>

        {/* Stale / Overdue follow-up badges */}
        {(lead.isStale || isOverdueFollowUp) && (
          <div className="flex gap-1.5 mt-2">
            {lead.isStale && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-700/50 flex items-center gap-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse flex-shrink-0" />
                Stale
              </span>
            )}
            {isOverdueFollowUp && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-700/50 flex items-center gap-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                Follow-up overdue
              </span>
            )}
          </div>
        )}

        {/* Follow-up + assignee row */}
        {(lead.nextFollowUpAt && isValid(new Date(lead.nextFollowUpAt)) || lead.assignedTo) && (
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-50 dark:border-[#1b2e4a]">
            {lead.assignedTo && (
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-4 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-[8px] font-black leading-none">{lead.assignedTo.firstName?.[0]?.toUpperCase()}</span>
                </div>
                <span className="text-[11px] text-gray-400 dark:text-gray-500">{lead.assignedTo.firstName}</span>
              </div>
            )}
            {lead.nextFollowUpAt && isValid(new Date(lead.nextFollowUpAt)) && (
              <span className="ml-auto text-[10px] font-semibold text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 px-2 py-0.5 rounded-full flex items-center gap-0.5">
                <ClockIcon className="w-2.5 h-2.5" />
                {format(new Date(lead.nextFollowUpAt), 'dd MMM')}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Query section */}
      {(hasPending || hasAnswered) && (
        <div className="px-3.5 pb-3.5 space-y-1.5 border-t border-gray-50 dark:border-[#1b2e4a]">
          <div className="pt-2.5 space-y-1.5">
            {hasPending && (
              <span className="inline-flex items-center gap-1.5 text-[11px] bg-amber-50 dark:bg-amber-900/25 text-amber-700 dark:text-amber-400 px-2 py-1 rounded-lg font-semibold border border-amber-100/80 dark:border-amber-800/40">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
                {lead.pendingQueries} pending quer{lead.pendingQueries > 1 ? 'ies' : 'y'}
              </span>
            )}
            {hasAnswered && lead.answeredQueryList?.map((q, i) => (
              <div key={i} className="rounded-xl bg-emerald-50 dark:bg-emerald-900/15 px-2.5 py-2 text-[11px] border border-emerald-100 dark:border-emerald-800/30" onClick={(e) => e.stopPropagation()}>
                <p className="font-semibold text-gray-700 dark:text-gray-200 line-clamp-1 flex items-center gap-1">
                  <CheckCircleIcon className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                  {q.title}
                </p>
                {q.answer && <p className="mt-1 text-emerald-700 dark:text-emerald-400 line-clamp-2 pl-4">{q.answer}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Lead Slide-Over Panel ────────────────────────────────────────────────────
function LeadSlideOver({ leadId, onClose, onUpdated }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const isAdmin = ['admin', 'founder', 'chairman', 'super_admin'].includes(user?.role);
  const [showFollowUpForm, setShowFollowUpForm] = useState(false);
  const [showQueryForm, setShowQueryForm] = useState(false);
  const [updateText, setUpdateText] = useState('');
  const [followUpNote, setFollowUpNote] = useState('');
  const [pendingStage, setPendingStage] = useState(null);
  const [stageShiftReason, setStageShiftReason] = useState('');
  const [showLeadTimeModal, setShowLeadTimeModal] = useState(false);
  const [leadTimeDays, setLeadTimeDays] = useState('');
  const [queryItems, setQueryItems] = useState([{ id: 1, title: '', description: '', assignedTo: '', urgency: 'medium' }]);
  const [submittingQueries, setSubmittingQueries] = useState(false);
  const { register, handleSubmit, reset, formState: { errors } } = useForm();

  // Sample stage state
  const [sampleForm, setSampleForm] = useState({ product: '', quantity: '', sentDate: '', courier: '', chargeAmount: '', chargeBy: 'client', paymentStatus: 'pending', advanceAmount: '', paymentMode: 'upi' });
  const [activityText, setActivityText] = useState('');
  const [activityType, setActivityType] = useState('team'); // 'team' | 'client'
  const [imageUrl, setImageUrl] = useState('');
  const [showSampleModal, setShowSampleModal] = useState(false);
  const [samplePrepDays, setSamplePrepDays] = useState('');
  const [sampleProductInterest, setSampleProductInterest] = useState('');
  const [sampleEstimatedValue, setSampleEstimatedValue] = useState('');
  const [sampleDiscussed, setSampleDiscussed] = useState('');
  const [showLostModal, setShowLostModal] = useState(false);
  const [lostReason, setLostReason] = useState('');
  const [lostNotes, setLostNotes] = useState('');
  const [showDealValueModal, setShowDealValueModal] = useState(false);
  const [dealValueInput, setDealValueInput] = useState('');

  // Communication log
  const [showCommForm, setShowCommForm] = useState(false);
  const [commType, setCommType] = useState('call');
  const [commTitle, setCommTitle] = useState('');
  const [commContent, setCommContent] = useState('');
  const [commDate, setCommDate] = useState('');
  const [commImages, setCommImages] = useState([]);
  const [commPreviews, setCommPreviews] = useState([]);
  const [commAudios, setCommAudios] = useState([]);
  const [commAudioNames, setCommAudioNames] = useState([]);
  const [lightboxImg, setLightboxImg] = useState(null);

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/crm/leads/${leadId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm'] });
      toast.success('Lead deleted');
      onClose();
      if (onUpdated) onUpdated();
    },
    onError: () => toast.error('Failed to delete lead'),
  });

  const addQueryCard = () => setQueryItems(prev => [...prev, { id: Date.now(), title: '', description: '', assignedTo: '', urgency: 'medium' }]);
  const removeQueryCard = (id) => setQueryItems(prev => prev.length > 1 ? prev.filter(q => q.id !== id) : prev);
  const updateQueryCard = (id, field, value) => setQueryItems(prev => prev.map(q => q.id === id ? { ...q, [field]: value } : q));

  const { data: lead, isLoading } = useQuery({
    queryKey: ['crm', 'lead', leadId],
    queryFn: () => api.get(`/crm/leads/${leadId}`).then(r => r.data.lead),
    enabled: !!leadId,
  });

  const statusMutation = useMutation({
    mutationFn: (payload) => {
      const data = typeof payload === 'string' ? { status: payload } : payload;
      return api.put(`/crm/leads/${leadId}`, data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm', 'lead', leadId] });
      qc.refetchQueries({ queryKey: ['crm', 'pipeline'] });
      if (onUpdated) onUpdated();
      toast.success('Stage updated');
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to update stage'),
  });

  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users?limit=100').then(r => r.data),
  });

  const { data: leadQueries } = useQuery({
    queryKey: ['crm', 'lead', leadId, 'queries'],
    queryFn: () => api.get(`/crm/leads/${leadId}/queries`).then(r => r.data.queries),
    enabled: !!leadId,
  });

  const sendUpdateMutation = useMutation({
    mutationFn: (message) => api.post(`/crm/leads/${leadId}/send-update`, { message }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm', 'lead', leadId] });
      toast.success('Update sent via WhatsApp');
      setUpdateText('');
    },
    onError: () => toast.error('Failed to send update'),
  });

  const followUpMutation = useMutation({
    mutationFn: (data) => api.post(`/crm/leads/${leadId}/followup`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm', 'lead', leadId] });
      qc.invalidateQueries({ queryKey: ['crm'] });
      if (onUpdated) onUpdated();
      toast.success('Follow-up logged');
      reset();
      setShowFollowUpForm(false);
    },
    onError: () => toast.error('Failed to log follow-up'),
  });

  // Sample mutations
  const sampleMutation = useMutation({
    mutationFn: (data) => api.put(`/crm/leads/${leadId}/sample`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['crm', 'lead', leadId] }); toast.success('Sample details saved'); },
    onError: () => toast.error('Failed to save sample details'),
  });
  const activityMutation = useMutation({
    mutationFn: ({ text, type }) => api.post(`/crm/leads/${leadId}/sample/${type === 'team' ? 'team-update' : 'client-note'}`, { text }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['crm', 'lead', leadId] }); toast.success('Logged'); setActivityText(''); },
    onError: () => toast.error('Failed to log'),
  });
  const addImageMutation = useMutation({
    mutationFn: (data) => api.post(`/crm/leads/${leadId}/sample/image`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['crm', 'lead', leadId] }); toast.success('Image added'); setImageUrl(''); },
    onError: () => toast.error('Failed to add image'),
  });

  const sampleInvoiceMutation = useMutation({
    mutationFn: () => api.post(`/crm/leads/${leadId}/sample-invoice`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm', 'lead', leadId] });
      toast.success('Sample invoice created in Finance');
    },
    onError: (err) => toast.error(err?.response?.data?.message || 'Failed to create invoice'),
  });

  const commLogMutation = useMutation({
    mutationFn: (fd) => api.post(`/crm/leads/${leadId}/comm-log`, fd),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm', 'lead', leadId] });
      toast.success('Log saved');
      setShowCommForm(false);
      setCommType('call'); setCommTitle(''); setCommContent(''); setCommDate('');
      setCommImages([]); setCommPreviews([]); setCommAudios([]); setCommAudioNames([]);
    },
    onError: (err) => toast.error(err?.response?.data?.message || err?.message || 'Failed to save log'),
  });

  // Sync sample form when lead loads
  useEffect(() => {
    if (!lead?.sampleDetails) return;
    const sd = lead.sampleDetails;
    setSampleForm({
      product: sd.product || '',
      quantity: sd.quantity != null ? String(sd.quantity) : '',
      sentDate: sd.sentDate ? sd.sentDate.slice(0, 10) : '',
      courier: sd.courier || '',
      chargeAmount: sd.chargeAmount != null ? String(sd.chargeAmount) : '',
      chargeBy: sd.chargeBy || 'client',
      paymentStatus: sd.paymentStatus || 'pending',
      advanceAmount: sd.advanceAmount != null ? String(sd.advanceAmount) : '',
      paymentMode: sd.paymentMode || 'upi',
    });
  }, [lead?._id, lead?.sampleDetails?.paymentStatus, lead?.sampleDetails?.product]);


  const submitAllQueries = async () => {
    const valid = queryItems.filter(q => q.title.trim() && q.description.trim() && q.assignedTo);
    if (!valid.length) return toast.error('Fill title, question and assignee for at least one query');
    setSubmittingQueries(true);
    try {
      await Promise.all(valid.map(q => api.post(`/crm/leads/${leadId}/query`, { title: q.title, description: q.description, assignedTo: q.assignedTo, urgency: q.urgency })));
      qc.invalidateQueries({ queryKey: ['crm', 'lead', leadId, 'queries'] });
      qc.invalidateQueries({ queryKey: ['crm'] });
      if (onUpdated) onUpdated();
      toast.success(`${valid.length} quer${valid.length > 1 ? 'ies' : 'y'} sent`);
      setQueryItems([{ id: Date.now(), title: '', description: '', assignedTo: '', urgency: 'medium' }]);
      setShowQueryForm(false);
    } catch { toast.error('Failed to raise queries'); }
    finally { setSubmittingQueries(false); }
  };

  const onSubmitFollowUp = (data) => {
    followUpMutation.mutate({
      scheduledAt: data.scheduledAt || new Date().toISOString(),
      type: data.type || 'call',
      notes: data.notes || '',
      outcome: data.notes || '',
      nextAction: '',
    });

    if (data.nextFollowUpAt) {
      api.put(`/crm/leads/${leadId}`, { nextFollowUpAt: data.nextFollowUpAt }).then(() => {
        qc.invalidateQueries({ queryKey: ['crm'] });
      }).catch(() => {});
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="fixed right-0 top-0 h-full w-full max-w-xl bg-white dark:bg-[#070c17] shadow-2xl z-50 flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex-shrink-0">
          {/* Gradient accent bar */}
          <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg,#112270,#3b82f6,#22c55e)' }} />
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-[#1b2e4a]">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md" style={{ background: 'linear-gradient(135deg,#112270,#1a3a8a)' }}>
                <span className="text-white font-black text-sm">
                  {lead?.name?.[0]?.toUpperCase() || '?'}
                </span>
              </div>
              <div className="min-w-0">
                <h2 className="font-bold text-gray-900 dark:text-white truncate">{lead?.name || '…'}</h2>
                {lead?.company && <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{lead.company}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => { onClose(); navigate(`/crm/leads/${leadId}`); }}
                className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 px-2.5 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
              >
                <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
                Details
              </button>
              {(lead?.status === 'Payment Pending' || lead?.status === 'Dispatched') && (
                <button
                  onClick={() => { onClose(); navigate(`/finance/invoices?fromLead=${leadId}`); }}
                  className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors"
                >
                  <DocumentTextIcon className="w-3.5 h-3.5" />
                  Invoice
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={() => {
                    if (window.confirm(`Delete "${lead?.name}"? This cannot be undone.`)) {
                      deleteMutation.mutate();
                    }
                  }}
                  disabled={deleteMutation.isPending}
                  className="flex items-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400 px-2.5 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50"
                >
                  <TrashIcon className="w-3.5 h-3.5" />
                  Delete
                </button>
              )}
              <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-[#17263d] transition-colors">
                <XMarkIcon className="w-4 h-4 text-gray-400" />
              </button>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !lead ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">Lead not found</div>
        ) : (
          <div className="flex-1 overflow-y-auto">

            {/* Pipeline Stage Selector */}
            <div className="px-5 py-4 border-b border-gray-100 dark:border-[#1b2e4a]">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Move to stage</p>
              <div className="flex flex-wrap gap-2">
                {PIPELINE_STAGES.map((stage) => (
                  <button
                    key={stage}
                    onClick={() => {
                      if (lead.status === stage) return;
                      const currentIdx = PIPELINE_STAGES.indexOf(lead.status);
                      const nextIdx = PIPELINE_STAGES.indexOf(stage);
                      const BLOCKED_FROM_FOLLOWUP = ['In Progress', 'Ready to Dispatch', 'Dispatched', 'Payment Pending'];
                      if (lead.status === 'Follow-up' && BLOCKED_FROM_FOLLOWUP.includes(stage)) {
                        toast.error('Follow-up → Sample → Production order-la tha shift aganum');
                        return;
                      }
                      if (stage === 'Sample') {
                        setShowSampleModal(true);
                        setSamplePrepDays('');
                        setSampleProductInterest(lead.productInterest?.join(', ') || '');
                        setSampleEstimatedValue(lead.estimatedValue > 0 ? String(lead.estimatedValue) : '');
                        setSampleDiscussed('');
                        return;
                      }
                      if (stage === 'In Progress') {
                        if (!lead.sampleDetails?.sentDate) { toast.error('Fill in the sample Sent Date before moving to Production'); return; }
                        setShowLeadTimeModal(true);
                        setLeadTimeDays('');
                        return;
                      }
                      if (stage === 'Payment Pending') {
                        setDealValueInput(lead.dealValue ? String(lead.dealValue) : '');
                        setShowDealValueModal(true);
                        return;
                      }
                      if (stage === 'Lost') {
                        setLostReason(LOST_REASONS[0]);
                        setLostNotes('');
                        setShowLostModal(true);
                        return;
                      }
                      if (lead.status === 'New Lead' && stage !== 'New Lead') {
                        setPendingStage(stage);
                        setStageShiftReason('');
                        return;
                      }
                      statusMutation.mutate(stage);
                    }}
                    disabled={statusMutation.isPending}
                    className={clsx(
                      'text-xs px-3 py-1.5 rounded-full font-medium transition-all border-2',
                      lead.status === stage
                        ? 'border-brand-500 ' + STAGE_BADGE[stage] + ' ring-2 ring-brand-300 ring-offset-1'
                        : 'border-transparent ' + STAGE_BADGE[stage] + ' opacity-70 hover:opacity-100 hover:border-gray-300'
                    )}
                  >
                    {lead.status === stage && <span className="mr-1">✓</span>}
                    {stageLabel(stage)}
                  </button>
                ))}
              </div>
            </div>

            {/* Contact Info */}
            <div className="px-5 py-4 border-b border-gray-100 dark:border-[#1b2e4a] space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <a
                  href={`tel:${lead.phone}`}
                  className="flex items-center gap-2 p-2.5 rounded-lg bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors group"
                >
                  <PhoneIcon className="w-4 h-4 text-green-600 flex-shrink-0" />
                  <span className="text-sm text-green-700 dark:text-green-400 font-medium truncate">{lead.phone}</span>
                </a>
                {lead.phone && (
                  <a
                    href={`https://wa.me/91${lead.phone.replace(/\D/g, '').slice(-10)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors"
                  >
                    <ChatBubbleLeftIcon className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span className="text-sm text-emerald-700 dark:text-emerald-400 font-medium">WhatsApp</span>
                  </a>
                )}
              </div>

              {lead.email && (
                <a href={`mailto:${lead.email}`} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-brand-600 transition-colors">
                  <EnvelopeIcon className="w-4 h-4 flex-shrink-0" />
                  {lead.email}
                </a>
              )}

              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {(lead.city || lead.state) && (
                  <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                    <MapPinIcon className="w-4 h-4 flex-shrink-0" />
                    <span>{[lead.city, lead.state].filter(Boolean).join(', ')}</span>
                  </div>
                )}
                {lead.estimatedValue > 0 && (
                  <div className="flex items-center gap-1.5 text-green-600 font-medium">
                    <CurrencyRupeeIcon className="w-4 h-4 flex-shrink-0" />
                    <span>₹{lead.estimatedValue.toLocaleString('en-IN')}</span>
                  </div>
                )}
                {lead.source && (
                  <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 col-span-2">
                    <TableCellsIcon className="w-4 h-4 flex-shrink-0" />
                    <span>Source: {lead.source}</span>
                  </div>
                )}
                {lead.assignedTo && (
                  <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 col-span-2">
                    <UserIcon className="w-4 h-4 flex-shrink-0" />
                    <span>Assigned: {lead.assignedTo.firstName} {lead.assignedTo.lastName}</span>
                  </div>
                )}
              </div>

              {/* Priority badge */}
              <div className="flex items-center gap-2">
                <span className={clsx(
                  'text-xs px-2 py-1 rounded-full font-medium',
                  lead.priority === 'critical' ? 'bg-red-100 text-red-700' :
                  lead.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                  lead.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'
                )}>
                  {lead.priority} priority
                </span>
                {lead.nextFollowUpAt && isValid(new Date(lead.nextFollowUpAt)) && (
                  <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700 flex items-center gap-1">
                    <CalendarDaysIcon className="w-3 h-3" />
                    Follow-up: {format(new Date(lead.nextFollowUpAt), 'dd MMM yyyy')}
                  </span>
                )}
              </div>

              {lead.notes && (
                <div className="bg-gray-50 dark:bg-[#0f1a2e] rounded-lg p-3">
                  <p className="text-xs font-semibold text-gray-500 mb-1">Notes</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{lead.notes}</p>
                </div>
              )}

              {/* Follow-up conversation guide — shown only for Follow-up status leads */}
              {lead.status === 'Follow-up' && (() => {
                const lastFU = lead.followUps && lead.followUps.length > 0
                  ? [...lead.followUps].reverse()[0]
                  : null;
                return (
                  <div className="rounded-xl border-2 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-4 space-y-3">
                    <p className="text-xs font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wider flex items-center gap-1.5">
                      💬 Follow-up Guide — What to discuss
                    </p>

                    {lastFU?.nextAction ? (
                      <div>
                        <p className="text-xs text-blue-500 dark:text-blue-400 font-medium mb-1">Next action (from last log)</p>
                        <p className="text-sm text-blue-900 dark:text-blue-100 font-medium">{lastFU.nextAction}</p>
                      </div>
                    ) : null}

                    {lastFU?.notes ? (
                      <div>
                        <p className="text-xs text-blue-500 dark:text-blue-400 font-medium mb-1">Last conversation</p>
                        <p className="text-sm text-blue-800 dark:text-blue-200">{lastFU.notes}</p>
                      </div>
                    ) : null}

                    {lead.productInterest && lead.productInterest.length > 0 && (
                      <div>
                        <p className="text-xs text-blue-500 dark:text-blue-400 font-medium mb-1">Interested in</p>
                        <div className="flex flex-wrap gap-1.5">
                          {lead.productInterest.map((p, i) => (
                            <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200 font-medium">{p}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {!lastFU && !lead.productInterest?.length && (
                      <p className="text-sm text-blue-600 dark:text-blue-400">Ask about their requirement, budget, and timeline.</p>
                    )}

                    {lead.nextFollowUpAt && isValid(new Date(lead.nextFollowUpAt)) && (
                      <div className="pt-2 border-t border-blue-200 dark:border-blue-700">
                        <p className="text-xs text-blue-500 dark:text-blue-400">
                          Scheduled follow-up: <span className="font-semibold text-blue-700 dark:text-blue-300">{format(new Date(lead.nextFollowUpAt), 'dd MMM yyyy, h:mm a')}</span>
                        </p>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ── Full Sample Panel ── */}
              {lead.status === 'Sample' && (
                <div className="mt-3 border-t border-fuchsia-100 dark:border-fuchsia-900/50 pt-4 space-y-4">

                  {/* Deadline badge if prep days set */}
                  {lead.sampleDetails?.startedAt && lead.sampleDetails?.preparationDays && (() => {
                    const started = new Date(lead.sampleDetails.startedAt);
                    const deadline = new Date(started);
                    deadline.setDate(deadline.getDate() + lead.sampleDetails.preparationDays);
                    const daysLeft = Math.ceil((deadline - new Date()) / 86400000);
                    const overdue = daysLeft < 0;
                    return (
                      <div className={`rounded-xl px-3.5 py-2.5 flex items-center gap-2 border ${overdue ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' : 'bg-fuchsia-50 dark:bg-fuchsia-900/20 border-fuchsia-200 dark:border-fuchsia-800'}`}>
                        <span className="text-base">{overdue ? '⚠️' : '⏳'}</span>
                        <div>
                          <p className={`text-xs font-semibold ${overdue ? 'text-red-700 dark:text-red-300' : 'text-fuchsia-700 dark:text-fuchsia-300'}`}>
                            {overdue ? `Overdue by ${Math.abs(daysLeft)} day${Math.abs(daysLeft) !== 1 ? 's' : ''}` : `${daysLeft} day${daysLeft !== 1 ? 's' : ''} left for sample prep`}
                          </p>
                          <p className="text-xs text-gray-500">Deadline: {format(deadline, 'dd MMM yyyy')}</p>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Sample Details */}
                  <div className="rounded-xl border border-fuchsia-200 dark:border-fuchsia-800/60 bg-fuchsia-50/60 dark:bg-fuchsia-900/10 p-3.5 space-y-3">
                    <p className="text-xs font-bold text-fuchsia-700 dark:text-fuchsia-300 uppercase tracking-wider">📦 Sample Details</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Product</label>
                        <input value={sampleForm.product} onChange={e => setSampleForm(p => ({...p, product: e.target.value}))} className="input text-sm w-full" placeholder="Product name" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Quantity</label>
                        <input type="number" value={sampleForm.quantity} onChange={e => setSampleForm(p => ({...p, quantity: e.target.value}))} className="input text-sm w-full" placeholder="Qty" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Sent Date</label>
                        <input type="date" value={sampleForm.sentDate} onChange={e => setSampleForm(p => ({...p, sentDate: e.target.value}))} className="input text-sm w-full" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Courier / Mode</label>
                        <input value={sampleForm.courier} onChange={e => setSampleForm(p => ({...p, courier: e.target.value}))} className="input text-sm w-full" placeholder="e.g. Blue Dart" />
                      </div>
                    </div>
                  </div>

                  {/* Charges & Payment */}
                  <div className="rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50/50 dark:bg-amber-900/10 p-3.5 space-y-3">
                    <p className="text-xs font-bold text-amber-700 dark:text-amber-300 uppercase tracking-wider">💰 Charges & Payment</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Sample Charge (₹)</label>
                        <input type="number" value={sampleForm.chargeAmount} onChange={e => setSampleForm(p => ({...p, chargeAmount: e.target.value}))} className="input text-sm w-full" placeholder="0" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Paid by</label>
                        <select value={sampleForm.chargeBy} onChange={e => setSampleForm(p => ({...p, chargeBy: e.target.value}))} className="input text-sm w-full">
                          <option value="client">Client</option>
                          <option value="company">Company</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Payment Status</label>
                        <select value={sampleForm.paymentStatus} onChange={e => setSampleForm(p => ({...p, paymentStatus: e.target.value}))} className="input text-sm w-full">
                          <option value="pending">Pending</option>
                          <option value="advance_received">Advance Received</option>
                          <option value="full_paid">Full Paid</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Advance Received (₹)</label>
                        <input type="number" value={sampleForm.advanceAmount} onChange={e => setSampleForm(p => ({...p, advanceAmount: e.target.value}))} className="input text-sm w-full" placeholder="0" disabled={sampleForm.paymentStatus === 'pending'} />
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Payment Mode</label>
                        <select value={sampleForm.paymentMode} onChange={e => setSampleForm(p => ({...p, paymentMode: e.target.value}))} className="input text-sm w-full" disabled={sampleForm.paymentStatus === 'pending'}>
                          <option value="cash">Cash</option>
                          <option value="upi">UPI</option>
                          <option value="bank_transfer">Bank Transfer</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Save button */}
                  <button
                    onClick={() => sampleMutation.mutate(sampleForm)}
                    disabled={sampleMutation.isPending}
                    className="w-full py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50 transition-all active:scale-95"
                    style={{ background: 'linear-gradient(135deg,#d946ef,#a21caf)' }}
                  >
                    {sampleMutation.isPending ? 'Saving…' : '💾 Save Sample Details'}
                  </button>

                  {/* Create Sample Invoice */}
                  {lead.sampleDetails?.sampleInvoiceId ? (
                    <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 px-3.5 py-2.5 flex items-center gap-2 border border-emerald-200 dark:border-emerald-800/50">
                      <span className="text-emerald-600 dark:text-emerald-400 text-base">🧾</span>
                      <div>
                        <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Sample Invoice Created</p>
                        <p className="text-xs text-emerald-600 dark:text-emerald-400">₹{(lead.sampleDetails.chargeAmount || 0).toLocaleString('en-IN')} — visible in Finance → Invoices</p>
                      </div>
                    </div>
                  ) : (lead.sampleDetails?.chargeAmount > 0 && lead.sampleDetails?.chargeBy === 'client') ? (
                    <button
                      type="button"
                      onClick={() => sampleInvoiceMutation.mutate()}
                      disabled={sampleInvoiceMutation.isPending}
                      className="w-full py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50 transition-all active:scale-95"
                      style={{ background: 'linear-gradient(135deg,#10b981,#059669)' }}
                    >
                      {sampleInvoiceMutation.isPending ? 'Creating…' : '🧾 Create Sample Invoice'}
                    </button>
                  ) : null}

                  {/* Legacy finance entry */}
                  {lead.sampleDetails?.financeTransactionId && !lead.sampleDetails?.sampleInvoiceId && (
                    <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 px-3.5 py-2.5 flex items-center gap-2 border border-emerald-200 dark:border-emerald-800/50">
                      <span className="text-emerald-600 dark:text-emerald-400 text-base">✓</span>
                      <div>
                        <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Finance Entry Created</p>
                        <p className="text-xs text-emerald-600 dark:text-emerald-400">₹{(lead.sampleDetails.advanceAmount || 0).toLocaleString('en-IN')} recorded in Finance module</p>
                      </div>
                    </div>
                  )}

                  {/* Product Images */}
                  <div className="rounded-xl border border-gray-200 dark:border-[#1b2e4a] bg-gray-50/50 dark:bg-[#0f1a2e]/50 p-3.5 space-y-2">
                    <p className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider">🖼️ Product Images</p>
                    {lead.sampleDetails?.images?.length > 0 && (
                      <div className="flex gap-2 flex-wrap">
                        {lead.sampleDetails.images.map((img, i) => (
                          <a key={i} href={img.url} target="_blank" rel="noreferrer"
                            className="w-16 h-16 rounded-lg overflow-hidden border border-gray-200 dark:border-[#1b2e4a] bg-gray-100 dark:bg-[#132035] flex items-center justify-center hover:opacity-80 transition-opacity"
                          >
                            <img src={img.url} alt={img.name || `img${i+1}`} className="w-full h-full object-cover"
                              onError={e => { e.target.style.display='none'; e.target.parentNode.innerHTML='<span class="text-2xl">🖼️</span>'; }}
                            />
                          </a>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <input value={imageUrl} onChange={e => setImageUrl(e.target.value)} className="input text-sm flex-1" placeholder="Paste image URL…" />
                      <button
                        onClick={() => { if (imageUrl.trim()) addImageMutation.mutate({ url: imageUrl.trim(), name: 'Product image' }); }}
                        disabled={!imageUrl.trim() || addImageMutation.isPending}
                        className="px-3 py-2 rounded-xl bg-gray-200 dark:bg-[#1b2e4a] text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-[#243657] disabled:opacity-50 transition-colors flex-shrink-0"
                      >
                        + Add
                      </button>
                    </div>
                  </div>

                  {/* Activity Log — merged Team Updates + Client Says */}
                  <div className="rounded-xl border border-indigo-200 dark:border-indigo-800/50 bg-indigo-50/30 dark:bg-indigo-900/10 p-3.5 space-y-2">
                    <p className="text-xs font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider">📋 Activity Log</p>
                    {(() => {
                      const teamEntries = (lead.sampleDetails?.teamUpdates || []).map(u => ({ ...u, source: 'team' }));
                      const clientEntries = (lead.sampleDetails?.clientNotes || []).map(n => ({ ...n, source: 'client' }));
                      const all = [...teamEntries, ...clientEntries].sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt));
                      if (!all.length) return <p className="text-xs text-gray-400 italic">No activity yet</p>;
                      return (
                        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                          {all.map((entry, i) => (
                            <div key={i} className="bg-white dark:bg-[#0f1a2e] rounded-lg px-3 py-2 text-xs flex gap-2">
                              <span className={`mt-0.5 flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${entry.source === 'team' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'}`}>
                                {entry.source === 'team' ? 'Team' : 'Client'}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-gray-800 dark:text-gray-200">{entry.text}</p>
                                <p className="text-gray-400 mt-0.5">
                                  {entry.postedBy?.firstName ? `${entry.postedBy.firstName} · ` : ''}
                                  {entry.postedAt ? format(new Date(entry.postedAt), 'dd MMM, h:mm a') : ''}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                    {/* Type toggle + input */}
                    <div className="flex gap-1 mb-1">
                      <button onClick={() => setActivityType('team')} className={`text-[11px] px-2.5 py-1 rounded-full font-semibold transition-colors ${activityType === 'team' ? 'bg-blue-600 text-white' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'}`}>📝 Team Update</button>
                      <button onClick={() => setActivityType('client')} className={`text-[11px] px-2.5 py-1 rounded-full font-semibold transition-colors ${activityType === 'client' ? 'bg-emerald-600 text-white' : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'}`}>💬 Client Note</button>
                    </div>
                    <div className="flex gap-2">
                      <input
                        value={activityText}
                        onChange={e => setActivityText(e.target.value)}
                        className="input text-sm flex-1"
                        placeholder={activityType === 'team' ? 'e.g. Sample packed and ready…' : 'e.g. Client wants different size…'}
                        onKeyDown={e => { if (e.key === 'Enter' && activityText.trim()) activityMutation.mutate({ text: activityText.trim(), type: activityType }); }}
                      />
                      <button
                        onClick={() => { if (activityText.trim()) activityMutation.mutate({ text: activityText.trim(), type: activityType }); }}
                        disabled={!activityText.trim() || activityMutation.isPending}
                        className={`px-3 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors flex-shrink-0 ${activityType === 'team' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200' : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200'}`}
                      >
                        Log
                      </button>
                    </div>
                  </div>

                  {/* Outcome */}
                  <div className="rounded-xl border-2 border-fuchsia-200 dark:border-fuchsia-800 p-3.5 space-y-2">
                    <p className="text-xs font-bold text-fuchsia-700 dark:text-fuchsia-300 uppercase tracking-wider">✅ Client Outcome</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => { setShowLeadTimeModal(true); setLeadTimeDays(''); }}
                        disabled={statusMutation.isPending}
                        className="flex items-center justify-center gap-1 px-2 py-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 text-xs font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 disabled:opacity-50 transition-colors border-2 border-emerald-200 dark:border-emerald-700"
                      >
                        ✓ Approved → Production
                      </button>
                      <button
                        onClick={() => statusMutation.mutate('Follow-up')}
                        disabled={statusMutation.isPending}
                        className="flex items-center justify-center gap-1 px-2 py-2.5 rounded-xl bg-red-100 dark:bg-red-900/30 text-xs font-bold text-red-700 dark:text-red-300 hover:bg-red-200 disabled:opacity-50 transition-colors border-2 border-red-200 dark:border-red-700"
                      >
                        ✗ Rejected → Follow-up
                      </button>
                    </div>
                  </div>

                </div>
              )}

              {/* Follow-up internal note box */}
              {lead.status === 'Follow-up' && (
                <div className="mt-3 border-t border-blue-100 dark:border-blue-900 pt-3 space-y-2">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">📝 Log what was discussed</p>
                  {lead.followUps?.length > 0 && [...lead.followUps].reverse()[0]?.notes && (
                    <div className="bg-gray-50 dark:bg-[#0f1a2e] rounded-lg p-2.5">
                      <p className="text-xs text-gray-400 mb-0.5">Last note</p>
                      <p className="text-sm text-gray-700 dark:text-gray-300">{[...lead.followUps].reverse()[0].notes}</p>
                    </div>
                  )}
                  <textarea
                    value={followUpNote}
                    onChange={e => setFollowUpNote(e.target.value)}
                    rows={2}
                    className="input resize-none text-sm w-full"
                    placeholder="e.g. Customer said they need 2 more days to decide..."
                  />
                  <button
                    onClick={() => {
                      if (!followUpNote.trim()) return;
                      followUpMutation.mutate({
                        scheduledAt: new Date().toISOString(),
                        type: 'call',
                        notes: followUpNote.trim(),
                        outcome: followUpNote.trim(),
                        nextAction: '',
                      }, { onSuccess: () => setFollowUpNote('') });
                    }}
                    disabled={!followUpNote.trim() || followUpMutation.isPending}
                    className="btn-secondary w-full justify-center text-sm disabled:opacity-50"
                  >
                    {followUpMutation.isPending ? 'Saving…' : 'Save Note'}
                  </button>
                </div>
              )}
            </div>


            {/* Dispatch deadline badge for In Progress leads */}
            {lead.status === 'In Progress' && lead.leadTime && lead.inProgressAt && (() => {
              const deadline = new Date(lead.inProgressAt);
              deadline.setDate(deadline.getDate() + lead.leadTime);
              const today = new Date();
              const daysLeft = Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));
              return (
                <div className="px-5 py-3 border-b border-gray-100 dark:border-[#1b2e4a]">
                  <div className={clsx(
                    'rounded-lg px-3 py-2 flex items-center gap-2',
                    daysLeft < 0 ? 'bg-red-100 dark:bg-red-900/30' :
                    daysLeft <= 2 ? 'bg-orange-100 dark:bg-orange-900/30' :
                    'bg-teal-50 dark:bg-teal-900/20'
                  )}>
                    <span className="text-lg">{daysLeft < 0 ? '🚨' : daysLeft <= 2 ? '⚠️' : '🚚'}</span>
                    <div>
                      <p className={clsx('text-xs font-bold',
                        daysLeft < 0 ? 'text-red-700 dark:text-red-300' :
                        daysLeft <= 2 ? 'text-orange-700 dark:text-orange-300' :
                        'text-teal-700 dark:text-teal-300'
                      )}>
                        {daysLeft < 0
                          ? `Dispatch overdue by ${Math.abs(daysLeft)} day${Math.abs(daysLeft) !== 1 ? 's' : ''}`
                          : daysLeft === 0 ? 'Dispatch due today'
                          : `${daysLeft} day${daysLeft !== 1 ? 's' : ''} left to dispatch`}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Deadline: {format(deadline, 'dd MMM yyyy')} · Lead time: {lead.leadTime}d
                      </p>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Update box — In Progress only */}
            {lead.status === 'In Progress' && (
              <div className="px-5 py-4 border-b border-gray-100 dark:border-[#1b2e4a]">
                <p className="text-xs font-bold text-green-700 dark:text-green-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  📦 Send Update to Customer
                </p>

                {lead.lastUpdateText && (
                  <div className="mb-3 bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
                    <p className="text-xs text-green-600 dark:text-green-400 font-medium mb-1">
                      Last update {lead.lastUpdateAt ? `— ${format(new Date(lead.lastUpdateAt), 'dd MMM, h:mm a')}` : ''}
                    </p>
                    <p className="text-sm text-green-800 dark:text-green-200">{lead.lastUpdateText}</p>
                  </div>
                )}

                <textarea
                  value={updateText}
                  onChange={e => setUpdateText(e.target.value)}
                  rows={3}
                  className="input resize-none text-sm w-full"
                  placeholder="e.g. Your order has been packed and will be dispatched tomorrow..."
                />
                <button
                  onClick={() => { if (updateText.trim()) sendUpdateMutation.mutate(updateText.trim()); }}
                  disabled={!updateText.trim() || sendUpdateMutation.isPending}
                  className="mt-2 btn-primary w-full justify-center disabled:opacity-50"
                >
                  {sendUpdateMutation.isPending ? 'Sending…' : '📲 Send WhatsApp Update'}
                </button>
              </div>
            )}

            {/* Follow-Up History */}
            {lead.followUps && lead.followUps.length > 0 && (
              <div className="px-5 py-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  History ({lead.followUps.length})
                </p>
                <div className="space-y-3">
                  {[...lead.followUps].reverse().map((fu) => (
                    <div key={fu._id || fu.createdAt} className="flex gap-3">
                      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-100 dark:bg-[#0f1a2e] flex items-center justify-center text-sm">
                        {FOLLOWUP_ICONS[fu.type] || '📝'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 capitalize">{fu.type}</span>
                          <span className="text-xs text-gray-400">
                            {(() => { const d = new Date(fu.scheduledAt || fu.createdAt); return isValid(d) ? format(d, 'dd MMM yyyy, h:mm a') : '—'; })()}
                          </span>
                        </div>
                        {fu.notes && <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">{fu.notes}</p>}
                        {fu.performedBy && (
                          <p className="text-xs text-gray-400 mt-0.5">by {fu.performedBy.firstName} {fu.performedBy.lastName}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(!lead.followUps || lead.followUps.length === 0) && (
              <div className="px-5 py-6 text-center text-gray-400">
                <CalendarDaysIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No follow-ups logged yet</p>
                <p className="text-xs mt-1">No interactions recorded yet</p>
              </div>
            )}

            {/* ── Communication History ── */}
            <div className="px-5 py-4 border-t border-gray-100 dark:border-[#1b2e4a]">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                  <ChatBubbleLeftIcon className="w-3.5 h-3.5" />
                  What was discussed
                  {lead.communicationLogs?.length > 0 && <span className="text-blue-500">({lead.communicationLogs.length})</span>}
                </p>
                <button
                  onClick={() => { setShowCommForm(v => !v); setCommType('call'); setCommTitle(''); setCommContent(''); setCommDate(''); setCommImages([]); setCommPreviews([]); setCommAudios([]); setCommAudioNames([]); }}
                  className="text-xs px-2 py-0.5 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-semibold hover:bg-blue-100 transition-colors"
                >
                  {showCommForm ? 'Cancel' : '+ Add Log'}
                </button>
              </div>

              {/* Inline form */}
              {showCommForm && (
                <div className="space-y-2.5 mb-4 bg-gray-50 dark:bg-[#0f1a2e] rounded-xl p-3">
                  <div className="flex gap-2">
                    <select value={commType} onChange={e => setCommType(e.target.value)} className="input text-xs flex-shrink-0 w-36">
                      <option value="call">📞 Call</option>
                      <option value="whatsapp">💬 WhatsApp</option>
                      <option value="meeting">🤝 Meeting</option>
                      <option value="email">✉️ Email</option>
                      <option value="other">📝 Other</option>
                    </select>
                    <input type="datetime-local" value={commDate} onChange={e => setCommDate(e.target.value)} className="input text-xs flex-1" />
                  </div>
                  <input value={commTitle} onChange={e => setCommTitle(e.target.value)} className="input text-xs w-full" placeholder="Title (optional)" />
                  <textarea
                    value={commContent}
                    onChange={e => setCommContent(e.target.value)}
                    rows={4}
                    className="input text-xs w-full resize-none font-mono leading-relaxed"
                    placeholder={"Paste WhatsApp chat or type call notes…\n[10:32] Client: We need 500 units of lip balm\n[10:34] Us: Sure, let me check and revert…"}
                    autoFocus
                  />
                  {/* Attach row */}
                  <div className="flex gap-3">
                    <label className="flex items-center gap-1.5 cursor-pointer text-xs text-blue-500 hover:text-blue-600 font-medium">
                      <input type="file" accept="image/*" multiple className="hidden" onChange={e => {
                        const files = Array.from(e.target.files);
                        setCommImages(prev => [...prev, ...files]);
                        files.forEach(f => { const r = new FileReader(); r.onload = ev => setCommPreviews(prev => [...prev, { url: ev.target.result, name: f.name }]); r.readAsDataURL(f); });
                      }} />
                      📎 Photo
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer text-xs text-purple-500 hover:text-purple-600 font-medium">
                      <input type="file" accept="audio/*" multiple className="hidden" onChange={e => {
                        const files = Array.from(e.target.files);
                        setCommAudios(prev => [...prev, ...files]);
                        setCommAudioNames(prev => [...prev, ...files.map(f => f.name)]);
                      }} />
                      🎙️ Audio
                    </label>
                  </div>
                  {commPreviews.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {commPreviews.map((img, i) => (
                        <div key={i} className="relative group">
                          <img src={img.url} alt={img.name} onClick={() => setLightboxImg(img.url)} className="w-12 h-12 object-cover rounded-lg border border-gray-200 dark:border-[#1b2e4a] cursor-pointer" />
                          <button type="button" onClick={() => { setCommPreviews(p => p.filter((_, idx) => idx !== i)); setCommImages(p => p.filter((_, idx) => idx !== i)); }} className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                        </div>
                      ))}
                    </div>
                  )}
                  {commAudioNames.length > 0 && (
                    <div className="space-y-1">
                      {commAudioNames.map((name, i) => (
                        <div key={i} className="flex items-center gap-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg px-2.5 py-1.5 text-xs text-purple-700 dark:text-purple-300">
                          <span>🎙️ {name}</span>
                          <button type="button" onClick={() => { setCommAudios(p => p.filter((_, idx) => idx !== i)); setCommAudioNames(p => p.filter((_, idx) => idx !== i)); }} className="ml-auto text-red-400 hover:text-red-600">×</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => {
                      if (!commContent.trim() && !commImages.length && !commAudios.length) { toast.error('Add content, photo or audio'); return; }
                      const fd = new FormData();
                      fd.append('type', commType); fd.append('title', commTitle); fd.append('content', commContent);
                      if (commDate) fd.append('happenedAt', new Date(commDate).toISOString());
                      commImages.forEach(f => fd.append('files', f));
                      commAudios.forEach(f => fd.append('files', f));
                      commLogMutation.mutate(fd);
                    }}
                    disabled={commLogMutation.isPending}
                    className="btn-primary w-full justify-center text-sm disabled:opacity-50"
                  >
                    {commLogMutation.isPending ? 'Saving…' : 'Save Log'}
                  </button>
                </div>
              )}

              {/* Existing logs */}
              {lead.communicationLogs?.length > 0 ? (
                <div className="space-y-2.5">
                  {[...lead.communicationLogs].sort((a, b) => new Date(b.happenedAt) - new Date(a.happenedAt)).map((log, i) => {
                    const TYPE_ICON = { call: '📞', whatsapp: '💬', meeting: '🤝', email: '✉️', other: '📝' };
                    return (
                      <div key={log._id || i} className="rounded-xl border border-gray-100 dark:border-[#1b2e4a] p-3">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">{TYPE_ICON[log.type]} {log.type === 'whatsapp' ? 'WhatsApp' : log.type.charAt(0).toUpperCase() + log.type.slice(1)}</span>
                          <span className="text-xs text-gray-400">{format(new Date(log.happenedAt), 'dd MMM, h:mm a')}</span>
                        </div>
                        {log.title && <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1">{log.title}</p>}
                        {log.content && <p className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap bg-gray-50 dark:bg-[#0a1220] rounded-lg p-2 font-mono leading-relaxed">{log.content.length > 200 ? log.content.slice(0, 200) + '…' : log.content}</p>}
                        {log.images?.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {log.images.map((img, j) => (
                              <img key={j} src={img.url} alt={img.name} onClick={() => setLightboxImg(img.url)} className="w-12 h-12 object-cover rounded-lg border border-gray-200 dark:border-[#1b2e4a] cursor-pointer hover:opacity-80 transition-opacity" />
                            ))}
                          </div>
                        )}
                        {log.audioFiles?.length > 0 && (
                          <div className="space-y-1.5 mt-2">
                            {log.audioFiles.map((a, j) => (
                              <div key={j} className="rounded-lg bg-purple-50 dark:bg-purple-900/20 px-2.5 py-2 border border-purple-100 dark:border-purple-800/40">
                                <p className="text-[10px] text-purple-500 dark:text-purple-400 mb-1 font-medium">🎙️ {a.name}</p>
                                <audio controls src={a.url} className="w-full h-8" style={{ height: '32px' }} />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : !showCommForm && (
                <p className="text-xs text-gray-400 text-center py-3">No logs yet — add what was discussed in calls or chats</p>
              )}
            </div>

            {/* Lightbox */}
            {lightboxImg && (
              <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80" onClick={() => setLightboxImg(null)}>
                <img src={lightboxImg} alt="attachment" className="max-w-full max-h-full rounded-xl shadow-2xl" onClick={e => e.stopPropagation()} />
                <button onClick={() => setLightboxImg(null)} className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white"><XMarkIcon className="w-6 h-6" /></button>
              </div>
            )}

            {/* ── Technical Queries ── */}
            <div className="px-5 py-4 border-t border-gray-100 dark:border-[#1b2e4a]">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                  <QuestionMarkCircleIcon className="w-3.5 h-3.5" />
                  Technical Queries
                  {leadQueries?.length > 0 && (
                    <span className="ml-1 text-amber-500">({leadQueries.length})</span>
                  )}
                </p>
                <button
                  onClick={() => {
                    const next = !showQueryForm;
                    setShowQueryForm(next);
                    setShowFollowUpForm(false);
                    if (!next) setQueryItems([{ id: Date.now(), title: '', description: '', assignedTo: '', urgency: 'medium' }]);
                  }}
                  className={clsx(
                    'text-xs px-2.5 py-1 rounded-lg font-medium transition-colors',
                    showQueryForm
                      ? 'bg-amber-500 text-white'
                      : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 hover:bg-amber-100'
                  )}
                >
                  + Raise Query
                </button>
              </div>

              {/* Existing queries thread */}
              {leadQueries?.length > 0 && (
                <div className="space-y-3 mb-3">
                  {leadQueries.map(q => (
                    <div key={q._id} className="rounded-lg border border-gray-200 dark:border-[#1b2e4a] overflow-hidden text-xs">
                      {/* Question */}
                      <div className="bg-gray-50 dark:bg-[#0f1a2e] px-3 py-2">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-semibold text-gray-700 dark:text-gray-300">{q.title}</span>
                          <span className={clsx(
                            'px-1.5 py-0.5 rounded-full font-medium',
                            q.status === 'pending' ? 'bg-amber-100 text-amber-600' :
                            q.status === 'answered' ? 'bg-green-100 text-green-600' :
                            'bg-gray-100 text-gray-500'
                          )}>
                            {q.status}
                          </span>
                        </div>
                        <p className="text-gray-500 line-clamp-2">{q.description}</p>
                        {q.assignedTo && (
                          <p className="text-blue-500 mt-0.5">→ {q.assignedTo.firstName} {q.assignedTo.lastName}</p>
                        )}
                      </div>
                      {/* Answer */}
                      {q.status === 'answered' && q.answer ? (
                        <div className="bg-green-50 dark:bg-green-900/20 px-3 py-2 border-t border-green-100 dark:border-green-800">
                          <p className="text-green-700 dark:text-green-400 font-semibold mb-0.5">
                            {q.answeredBy?.firstName}: <span className="font-normal">{q.answer}</span>
                          </p>
                        </div>
                      ) : (
                        <div className="px-3 py-1.5 border-t border-gray-100 dark:border-[#1b2e4a] flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                          <span className="text-gray-400 italic">Waiting for reply…</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Raise Query multi-card form */}
              <AnimatePresence>
                {showQueryForm && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="space-y-3 overflow-hidden"
                  >
                    {queryItems.map((q, idx) => (
                      <div key={q.id} className="border border-amber-200 dark:border-amber-700 rounded-xl p-3 space-y-2 bg-amber-50/40 dark:bg-amber-900/10">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">Query {idx + 1}</span>
                          {queryItems.length > 1 && (
                            <button type="button" onClick={() => removeQueryCard(q.id)} className="text-xs text-red-400 hover:text-red-600">✕ Remove</button>
                          )}
                        </div>
                        <input
                          value={q.title}
                          onChange={e => updateQueryCard(q.id, 'title', e.target.value)}
                          className="input text-sm"
                          placeholder="Query title *"
                        />
                        <textarea
                          value={q.description}
                          onChange={e => updateQueryCard(q.id, 'description', e.target.value)}
                          rows={2}
                          className="input resize-none text-sm"
                          placeholder="Question / details *"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <select
                            value={q.assignedTo}
                            onChange={e => updateQueryCard(q.id, 'assignedTo', e.target.value)}
                            className="input text-sm"
                          >
                            <option value="">Assign to *</option>
                            {(usersData?.data || []).map(u => (
                              <option key={u._id} value={u._id}>{u.firstName} {u.lastName}{u.department ? ` (${u.department})` : ''}</option>
                            ))}
                          </select>
                          <select
                            value={q.urgency}
                            onChange={e => updateQueryCard(q.id, 'urgency', e.target.value)}
                            className="input text-sm"
                          >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                          </select>
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addQueryCard}
                      className="w-full text-xs border border-dashed border-amber-300 dark:border-amber-600 text-amber-600 dark:text-amber-400 rounded-xl py-2 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                    >
                      + Add Another Query
                    </button>
                    <button
                      type="button"
                      onClick={submitAllQueries}
                      disabled={submittingQueries}
                      className="w-full btn-primary justify-center text-sm disabled:opacity-50"
                    >
                      {submittingQueries ? 'Sending…' : (() => { const n = queryItems.filter(q => q.title.trim() && q.description.trim() && q.assignedTo).length; return n > 1 ? `Send ${n} Queries` : 'Send Query'; })()}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {!leadQueries?.length && !showQueryForm && (
                <p className="text-xs text-gray-400 text-center py-2">No queries raised for this lead</p>
              )}
            </div>
          </div>
        )}
      </motion.div>

      {/* Sample Prep Modal (→ Sample) */}
      {showSampleModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={() => setShowSampleModal(false)} />
          <div className="relative bg-white dark:bg-[#070c17] rounded-2xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-[#1b2e4a]">
            <div className="p-5 border-b border-gray-200 dark:border-[#1b2e4a] flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white">🧪 Moving to Sample Stage</h3>
                <p className="text-sm text-gray-500 mt-0.5">How many days do you need to prepare the sample?</p>
              </div>
              <button onClick={() => setShowSampleModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#17263d]">
                <XMarkIcon className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {/* What was discussed */}
              <div>
                <label className="label">What was discussed *</label>
                <textarea
                  value={sampleDiscussed}
                  onChange={e => setSampleDiscussed(e.target.value)}
                  rows={3}
                  className="input resize-none text-sm"
                  placeholder="e.g. Customer confirmed interest in lip balm, wants to see a sample before ordering 500 units…"
                  autoFocus
                />
              </div>
              {/* Product Interest — show always so user can fill/edit inline */}
              <div>
                <label className="label">Product Interest *</label>
                <input
                  value={sampleProductInterest}
                  onChange={e => setSampleProductInterest(e.target.value)}
                  className="input"
                  placeholder="e.g. Lip Balm, Face Cream (comma separated)"
                />
              </div>
              {/* Estimated Value */}
              <div>
                <label className="label">Estimated Value (₹) *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium text-sm">₹</span>
                  <input
                    type="number"
                    min="1"
                    value={sampleEstimatedValue}
                    onChange={e => setSampleEstimatedValue(e.target.value)}
                    className="input pl-7"
                    placeholder="e.g. 25000"
                  />
                </div>
              </div>
              <div>
                <label className="label">Sample Prep Time (days) *</label>
                <input
                  type="number"
                  min="1"
                  value={samplePrepDays}
                  onChange={e => setSamplePrepDays(e.target.value)}
                  className="input"
                  placeholder="e.g. 3"
                  autoFocus
                />
                {samplePrepDays && Number(samplePrepDays) > 0 && (
                  <p className="text-xs text-gray-400 mt-1">
                    Sample ready by: {format(new Date(Date.now() + Number(samplePrepDays) * 86400000), 'dd MMM yyyy')}
                  </p>
                )}
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowSampleModal(false)} className="btn-secondary flex-1 justify-center">
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (!sampleDiscussed.trim()) { toast.error('Enter what was discussed'); return; }
                    const piList = sampleProductInterest.split(',').map(s => s.trim()).filter(Boolean);
                    if (!piList.length) { toast.error('Enter at least one product interest'); return; }
                    if (!sampleEstimatedValue || Number(sampleEstimatedValue) <= 0) { toast.error('Enter estimated value'); return; }
                    if (!samplePrepDays || Number(samplePrepDays) < 1) { toast.error('Enter valid prep days'); return; }
                    const days = Number(samplePrepDays);
                    const startedAt = new Date().toISOString();
                    // Save product interest + estimated value if changed
                    const leadUpdates = {};
                    if (JSON.stringify(lead.productInterest || []) !== JSON.stringify(piList)) leadUpdates.productInterest = piList;
                    if (Number(sampleEstimatedValue) !== lead.estimatedValue) leadUpdates.estimatedValue = Number(sampleEstimatedValue);
                    if (Object.keys(leadUpdates).length) {
                      await api.put(`/crm/leads/${leadId}`, leadUpdates).catch(() => {});
                    }
                    // Save comm log
                    const fd = new FormData();
                    fd.append('type', 'call');
                    fd.append('content', sampleDiscussed.trim());
                    fd.append('happenedAt', new Date().toISOString());
                    await api.post(`/crm/leads/${leadId}/comm-log`, fd).catch(() => {});
                    // Move to Sample stage
                    statusMutation.mutate({ status: 'Sample' }, {
                      onSuccess: async () => {
                        try {
                          await api.put(`/crm/leads/${leadId}/sample`, { preparationDays: days, startedAt });
                          qc.invalidateQueries({ queryKey: ['crm', 'lead', leadId] });
                        } catch { /* prep save failed silently — status still moved */ }
                        setShowSampleModal(false);
                      }
                    });
                  }}
                  disabled={statusMutation.isPending}
                  className="btn-primary flex-1 justify-center disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg,#d946ef,#a21caf)' }}
                >
                  {statusMutation.isPending ? 'Moving…' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lead Time Modal (→ In Progress) */}
      {showLeadTimeModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={() => setShowLeadTimeModal(false)} />
          <div className="relative bg-white dark:bg-[#070c17] rounded-2xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-[#1b2e4a]">
            <div className="p-5 border-b border-gray-200 dark:border-[#1b2e4a] flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white">🏭 Moving to Production</h3>
                <p className="text-sm text-gray-500 mt-0.5">How many days to dispatch this order?</p>
              </div>
              <button onClick={() => setShowLeadTimeModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#17263d]">
                <XMarkIcon className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="label">Lead Time (days) *</label>
                <input
                  type="number"
                  min="1"
                  value={leadTimeDays}
                  onChange={e => setLeadTimeDays(e.target.value)}
                  className="input"
                  placeholder="e.g. 7"
                  autoFocus
                />
                {leadTimeDays && (
                  <p className="text-xs text-gray-400 mt-1">
                    Dispatch deadline: {format(new Date(Date.now() + Number(leadTimeDays) * 86400000), 'dd MMM yyyy')}
                  </p>
                )}
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowLeadTimeModal(false)} className="btn-secondary flex-1 justify-center">
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (!leadTimeDays || Number(leadTimeDays) < 1) { toast.error('Enter a valid lead time'); return; }
                    statusMutation.mutate(
                      { status: 'In Progress', leadTime: Number(leadTimeDays), inProgressAt: new Date().toISOString() },
                      { onSuccess: () => setShowLeadTimeModal(false) }
                    );
                  }}
                  disabled={statusMutation.isPending}
                  className="btn-primary flex-1 justify-center disabled:opacity-50"
                >
                  {statusMutation.isPending ? 'Moving…' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stage Shift Confirmation (New Lead → any other stage) */}
      {pendingStage && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={() => setPendingStage(null)} />
          <div className="relative bg-white dark:bg-[#070c17] rounded-2xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-[#1b2e4a]">
            <div className="p-5 border-b border-gray-200 dark:border-[#1b2e4a] flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white">Move to "{stageLabel(pendingStage)}"</h3>
                <p className="text-sm text-gray-500 mt-0.5">Why are you shifting this lead?</p>
              </div>
              <button onClick={() => setPendingStage(null)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#17263d]">
                <XMarkIcon className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="label">Reason for shifting *</label>
                <textarea
                  value={stageShiftReason}
                  onChange={(e) => setStageShiftReason(e.target.value)}
                  rows={3}
                  className="input resize-none"
                  placeholder={`e.g. Customer confirmed interest, moving to ${pendingStage}…`}
                  autoFocus
                />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setPendingStage(null)} className="btn-secondary flex-1 justify-center">
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (!stageShiftReason.trim()) { toast.error('Please provide a reason'); return; }
                    statusMutation.mutate(pendingStage, {
                      onSuccess: () => { setPendingStage(null); onClose(); },
                    });
                  }}
                  disabled={statusMutation.isPending}
                  className="btn-primary flex-1 justify-center disabled:opacity-50"
                >
                  {statusMutation.isPending ? 'Moving…' : `Move to ${stageLabel(pendingStage)}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lost Reason Modal */}
      {showLostModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={() => setShowLostModal(false)} />
          <div className="relative bg-white dark:bg-[#070c17] rounded-2xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-[#1b2e4a]">
            <div className="p-5 border-b border-gray-200 dark:border-[#1b2e4a] flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white">Mark as Lost</h3>
                <p className="text-sm text-gray-500 mt-0.5">Why is this lead being closed?</p>
              </div>
              <button onClick={() => setShowLostModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#17263d]">
                <XMarkIcon className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="label">Reason *</label>
                <select value={lostReason} onChange={e => setLostReason(e.target.value)} className="input">
                  {LOST_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Additional notes (optional)</label>
                <textarea value={lostNotes} onChange={e => setLostNotes(e.target.value)} rows={2} className="input resize-none" placeholder="e.g. Customer chose a local vendor…" />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowLostModal(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
                <button
                  onClick={() => {
                    statusMutation.mutate(
                      { status: 'Lost', lostReason, ...(lostNotes.trim() ? { notes: lostNotes.trim() } : {}) },
                      { onSuccess: () => setShowLostModal(false) }
                    );
                  }}
                  disabled={statusMutation.isPending}
                  className="flex-1 justify-center flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 transition-all"
                >
                  {statusMutation.isPending ? 'Moving…' : 'Confirm Lost'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Deal Value Modal (→ Payment Pending) */}
      {showDealValueModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={() => setShowDealValueModal(false)} />
          <div className="relative bg-white dark:bg-[#070c17] rounded-2xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-[#1b2e4a]">
            <div className="p-5 border-b border-gray-200 dark:border-[#1b2e4a] flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white">Confirm Deal Value</h3>
                <p className="text-sm text-gray-500 mt-0.5">Enter the final confirmed deal amount</p>
              </div>
              <button onClick={() => setShowDealValueModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#17263d]">
                <XMarkIcon className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="label">Deal Value (₹) *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium text-sm">₹</span>
                  <input
                    type="number"
                    min="1"
                    value={dealValueInput}
                    onChange={e => setDealValueInput(e.target.value)}
                    className="input pl-7"
                    placeholder="e.g. 50000"
                    autoFocus
                  />
                </div>
                {dealValueInput && Number(dealValueInput) > 0 && (
                  <p className="text-xs text-gray-400 mt-1">₹{Number(dealValueInput).toLocaleString('en-IN')}</p>
                )}
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowDealValueModal(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
                <button
                  onClick={() => {
                    if (!dealValueInput || Number(dealValueInput) <= 0) { toast.error('Enter a valid deal value'); return; }
                    statusMutation.mutate(
                      { status: 'Payment Pending', dealValue: Number(dealValueInput) },
                      { onSuccess: () => setShowDealValueModal(false) }
                    );
                  }}
                  disabled={statusMutation.isPending}
                  className="btn-primary flex-1 justify-center disabled:opacity-50"
                >
                  {statusMutation.isPending ? 'Moving…' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Create Lead Modal ────────────────────────────────────────────────────────
function CreateLeadModal({ onClose, onSuccess, onRefresh }) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm();
  const [loading, setLoading] = useState(false);

  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users?limit=100').then((r) => r.data),
  });

  const onSubmit = async (data, addAnother = false) => {
    setLoading(true);
    try {
      await api.post('/crm/leads', data);
      toast.success('Lead created');
      if (addAnother) {
        reset();
        if (onRefresh) onRefresh();
      } else {
        onSuccess();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-[#070c17] rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto border border-gray-100 dark:border-[#1b2e4a]">
        <div className="h-1 rounded-t-2xl" style={{ background: 'linear-gradient(90deg,#112270,#3b82f6,#22c55e)' }} />
        <div className="p-6 border-b border-gray-100 dark:border-[#1b2e4a] flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shadow-md" style={{ background: 'linear-gradient(135deg,#112270,#1a3a8a)' }}>
            <PlusIcon className="w-4.5 h-4.5 text-white" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Add New Lead</h3>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Full Name *</label>
              <input {...register('name', { required: 'Required' })} className="input" placeholder="John Doe" />
              {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
            </div>
            <div>
              <label className="label">Phone *</label>
              <input {...register('phone', { required: 'Required' })} className="input" placeholder="+91 98765..." />
              {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone.message}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Email</label>
              <input {...register('email')} type="email" className="input" placeholder="john@example.com" />
            </div>
            <div>
              <label className="label">Company</label>
              <input {...register('company')} className="input" placeholder="Acme Corp" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Source</label>
              <select {...register('source')} className="input">
                {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Priority</label>
              <select {...register('priority')} className="input">
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Assign To</label>
              <select {...register('assignedTo')} className="input">
                <option value="">Unassigned</option>
                {(usersData?.data || []).map((u) => (
                  <option key={u._id} value={u._id}>{u.firstName} {u.lastName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Estimated Value (₹)</label>
              <input {...register('estimatedValue')} type="number" className="input" placeholder="0" />
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea {...register('notes')} rows={2} className="input resize-none" placeholder="Any relevant notes..." />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button
              type="button"
              disabled={loading}
              onClick={handleSubmit((data) => onSubmit(data, true))}
              className="flex-1 justify-center flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border border-brand-300 dark:border-brand-700 text-brand-700 dark:text-brand-300 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-all disabled:opacity-50"
            >
              {loading ? 'Creating...' : '+ Add More'}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={handleSubmit((data) => onSubmit(data, false))}
              className="btn-primary flex-1 justify-center disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Stage Leads Modal ────────────────────────────────────────────────────────
function StageLeadsModal({ stage, onClose, onSelectLead }) {
  const [search, setSearch] = useState('');
  const meta = STAGE_META[stage] || STAGE_META['New Lead'];

  const { data, isLoading } = useQuery({
    queryKey: ['crm', 'leads', 'stage', stage],
    queryFn: () => api.get(`/crm/leads?status=${encodeURIComponent(stage)}&limit=200`).then(r => r.data),
    enabled: !!stage,
  });

  const leads = (data?.leads || data?.data || []).filter(l => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (l.name || '').toLowerCase().includes(q)
      || (l.phone || '').includes(q)
      || (l.company || '').toLowerCase().includes(q);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="relative bg-white dark:bg-[#070c17] rounded-t-3xl sm:rounded-2xl w-full sm:max-w-lg max-h-[85vh] flex flex-col shadow-2xl border border-gray-100 dark:border-[#1b2e4a] overflow-hidden"
      >
        {/* Gradient header */}
        <div className="flex-shrink-0 px-5 pt-5 pb-4" style={{ background: meta.grad }}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-base font-bold text-white">{stage}</h3>
              <p className="text-xs text-white/60 mt-0.5">{data?.pagination?.total || leads.length} leads in this stage</p>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl bg-white/20 hover:bg-white/30 transition-colors">
              <XMarkIcon className="w-4 h-4 text-white" />
            </button>
          </div>
          {/* Search */}
          <div className="relative">
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, phone, company…"
              className="w-full bg-white/20 placeholder-white/50 text-white text-sm rounded-xl px-3 py-2 outline-none border border-white/20 focus:border-white/50 transition-colors"
            />
          </div>
        </div>

        {/* Leads list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : leads.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">No leads found</div>
          ) : (
            leads.map(lead => {
              const p = PRIORITY_CFG[lead.priority] || PRIORITY_CFG.low;
              const initials = (lead.name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
              return (
                <button
                  key={lead._id}
                  onClick={() => { onSelectLead(lead._id); onClose(); }}
                  className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-[#0f1a2e] transition-colors border border-transparent hover:border-gray-100 dark:hover:border-[#1b2e4a]"
                >
                  <div
                    className="w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center text-white text-[10px] font-black"
                    style={{ background: meta.grad }}
                  >
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">{lead.name}</p>
                    <p className="text-xs text-gray-400 truncate">{lead.phone}{lead.company ? ` · ${lead.company}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {lead.estimatedValue > 0 && (
                      <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        ₹{lead.estimatedValue.toLocaleString('en-IN')}
                      </span>
                    )}
                    <span className={clsx('text-[10px] px-1.5 py-0.5 rounded-full font-bold flex items-center gap-0.5', p.pill)}>
                      <span className={clsx('w-1.5 h-1.5 rounded-full', p.dot)} />
                      {lead.priority?.[0]?.toUpperCase()}
                    </span>
                    <ArrowRightIcon className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600" />
                  </div>
                </button>
              );
            })
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ── Team Analytics View ───────────────────────────────────────────────────────
function TeamAnalyticsView() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['crm', 'analytics', 'rep'],
    queryFn: () => api.get('/crm/leads/analytics/rep').then(r => r.data.stats),
  });

  if (isLoading) return (
    <div className="flex justify-center py-16">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const rows = stats || [];

  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Team Performance — {rows.length} reps</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {rows.map((rep) => {
          const name = rep.user ? `${rep.user.firstName} ${rep.user.lastName}` : 'Unassigned';
          const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
          const conversion = rep.total > 0 ? Math.round((rep.won / rep.total) * 100) : 0;
          const active = rep.total - rep.won - rep.lost;
          return (
            <div key={rep._id} className="bg-white dark:bg-[#0f1a2e] rounded-2xl border border-gray-100 dark:border-[#1b2e4a] p-5 shadow-sm space-y-4">
              {/* Header */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-black shadow-md flex-shrink-0" style={{ background: 'linear-gradient(135deg,#112270,#1a3a8a)' }}>
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 dark:text-white truncate">{name}</p>
                  <p className="text-xs text-gray-400">{rep.total} total leads</p>
                </div>
                <span className={clsx('text-sm font-black px-2.5 py-1 rounded-full', conversion >= 30 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : conversion >= 15 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' : 'bg-gray-100 text-gray-600 dark:bg-[#132035] dark:text-gray-400')}>
                  {conversion}%
                </span>
              </div>
              {/* Conversion bar */}
              <div>
                <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                  <span>Conversion rate</span>
                  <span>{rep.won} won / {rep.total} total</span>
                </div>
                <div className="h-2 bg-gray-100 dark:bg-[#132035] rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${Math.min(conversion, 100)}%` }} />
                </div>
              </div>
              {/* Stats grid */}
              <div className="grid grid-cols-4 gap-2 text-center">
                {[
                  { label: 'Active', value: active, color: 'text-blue-600 dark:text-blue-400' },
                  { label: 'Won', value: rep.won, color: 'text-green-600 dark:text-green-400' },
                  { label: 'Lost', value: rep.lost, color: 'text-red-500 dark:text-red-400' },
                  { label: 'Stale', value: rep.stale, color: rep.stale > 0 ? 'text-orange-500 dark:text-orange-400' : 'text-gray-400' },
                ].map(s => (
                  <div key={s.label} className="bg-gray-50 dark:bg-[#132035]/60 rounded-xl p-2">
                    <p className={clsx('text-lg font-black leading-none', s.color)}>{s.value}</p>
                    <p className="text-[9px] text-gray-400 mt-0.5 font-semibold uppercase tracking-wide">{s.label}</p>
                  </div>
                ))}
              </div>
              {/* Alerts */}
              {(rep.overdueFollowUp > 0 || rep.stale > 0) && (
                <div className="flex gap-2 flex-wrap">
                  {rep.overdueFollowUp > 0 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-800/40 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                      {rep.overdueFollowUp} overdue follow-up{rep.overdueFollowUp > 1 ? 's' : ''}
                    </span>
                  )}
                  {rep.stale > 0 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border border-orange-100 dark:border-orange-800/40 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
                      {rep.stale} stale
                    </span>
                  )}
                </div>
              )}
              {/* Pipeline value */}
              {rep.totalValue > 0 && (
                <div className="pt-3 border-t border-gray-100 dark:border-[#1b2e4a] flex justify-between text-xs">
                  <span className="text-gray-400">Pipeline value</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">₹{rep.totalValue.toLocaleString('en-IN')}</span>
                </div>
              )}
            </div>
          );
        })}
        {rows.length === 0 && (
          <div className="col-span-3 text-center py-16 text-gray-400">
            <p className="text-sm">No leads assigned to any rep yet</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Pipeline Velocity View ────────────────────────────────────────────────────
function VelocityView() {
  const { data: velocity, isLoading } = useQuery({
    queryKey: ['crm', 'analytics', 'velocity'],
    queryFn: () => api.get('/crm/leads/analytics/velocity').then(r => r.data.velocity),
  });

  if (isLoading) return (
    <div className="flex justify-center py-16">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const rows = velocity || [];
  const maxDays = Math.max(...rows.map(r => r.avgDays), 1);

  const stageColor = (stage) => {
    const m = STAGE_META[stage];
    return m ? m.grad : 'linear-gradient(135deg,#94a3b8,#64748b)';
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Pipeline Velocity — Avg days per stage</p>
        <p className="text-xs text-gray-400 mt-0.5">Based on {rows.reduce((a, r) => a + r.count, 0)} stage transitions tracked</p>
      </div>
      {rows.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-sm">No stage history data yet.</p>
          <p className="text-xs mt-1">Stage transitions will be tracked from now on.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(r => (
            <div key={r._id} className="bg-white dark:bg-[#0f1a2e] rounded-xl border border-gray-100 dark:border-[#1b2e4a] p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{r._id}</span>
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  <span className="font-bold text-gray-700 dark:text-gray-300">{r.avgDays.toFixed(1)} days avg</span>
                  <span>{r.count} leads</span>
                </div>
              </div>
              <div className="h-3 bg-gray-100 dark:bg-[#132035] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${(r.avgDays / maxDays) * 100}%`, background: stageColor(r._id) }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Pipeline Page ────────────────────────────────────────────────────────
export default function LeadPipeline() {
  const [showForm, setShowForm] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState(null);
  const [stageModal, setStageModal] = useState(null);
  const [activeView, setActiveView] = useState('pipeline');
  const { isManagerOrAbove } = useAuthStore();
  const qc = useQueryClient();
  const navigate = useNavigate();


  const { data, isLoading } = useQuery({
    queryKey: ['crm', 'pipeline'],
    queryFn: () => api.get('/crm/leads/pipeline').then((r) => r.data),
    refetchInterval: 5 * 60 * 1000,
  });

  const { data: analyticsData } = useQuery({
    queryKey: ['crm', 'analytics'],
    queryFn: () => api.get('/crm/leads/analytics').then((r) => r.data.analytics),
  });

  const pipeline = data?.pipeline || [];

  const grouped = PIPELINE_STAGES.reduce((acc, stage) => {
    const stageData = pipeline.find((p) => p._id === stage);
    acc[stage] = stageData?.leads || [];
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      {/* ── Page Header ── */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">CRM Pipeline</h1>
          <span className="text-[11px] font-bold text-white px-2.5 py-1 rounded-full shadow-sm" style={{ background: 'linear-gradient(135deg,#112270,#1a3a8a)' }}>
            {analyticsData?.totalLeads || 0} leads
          </span>
          <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2.5 py-1 rounded-full border border-emerald-100 dark:border-emerald-800/40">
            {analyticsData?.conversionRate || 0}% conversion
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => navigate('/crm/leads')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold border border-gray-200 dark:border-[#1b2e4a] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#17263d] transition-all"
          >
            <TableCellsIcon className="w-4 h-4" /> Table
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white shadow-lg hover:shadow-xl transition-all duration-200 active:scale-95"
            style={{ background: 'linear-gradient(135deg, #112270 0%, #1a3a8a 100%)' }}
          >
            <PlusIcon className="w-4 h-4" /> Add Lead
          </button>
        </div>
      </div>

      {/* Google Sheets Sync Panel */}
      <ErrorBoundary>
        <GoogleSheetsPanel onSynced={() => qc.invalidateQueries({ queryKey: ['crm'] })} />
      </ErrorBoundary>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Leads',     value: analyticsData?.totalLeads || 0,           icon: ChartBarIcon,        grad: 'linear-gradient(135deg,#112270 0%,#1e40af 100%)' },
          { label: 'Payment Pending', value: analyticsData?.wonLeads || 0,             icon: SparklesIcon,        grad: 'linear-gradient(135deg,#16a34a 0%,#15803d 100%)' },
          { label: 'Lost',            value: analyticsData?.lostLeads || 0,            icon: XMarkIcon,           grad: 'linear-gradient(135deg,#e11d48 0%,#9f1239 100%)' },
          { label: 'Conversion',      value: `${analyticsData?.conversionRate || 0}%`, icon: ArrowTrendingUpIcon, grad: 'linear-gradient(135deg,#7c3aed 0%,#4c1d95 100%)' },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl p-5 shadow-lg overflow-hidden relative" style={{ background: s.grad }}>
            {/* Decorative circles */}
            <div className="absolute -right-5 -top-5 w-28 h-28 rounded-full bg-white/10 pointer-events-none" />
            <div className="absolute right-2 -bottom-6 w-16 h-16 rounded-full bg-white/5 pointer-events-none" />
            <div className="relative">
              <div className="flex items-start justify-between mb-3">
                <div className="w-9 h-9 rounded-xl bg-white/25 flex items-center justify-center shadow-sm">
                  <s.icon className="w-4.5 h-4.5 text-white" />
                </div>
              </div>
              <p className="text-[34px] font-black text-white tracking-tight tabular-nums leading-none">{s.value}</p>
              <p className="text-[10px] text-white/55 font-bold uppercase tracking-[0.12em] mt-2">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── View Tabs ── */}
      {isManagerOrAbove && (
        <div className="flex items-center gap-1 p-1 bg-gray-100 dark:bg-[#0f1a2e] rounded-xl border border-gray-200 dark:border-[#1b2e4a] w-fit">
          {[
            { id: 'pipeline', label: 'Pipeline' },
            { id: 'team', label: 'Team Analytics' },
            { id: 'velocity', label: 'Velocity' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveView(tab.id)}
              className={clsx(
                'px-4 py-1.5 rounded-lg text-sm font-semibold transition-all duration-150',
                activeView === tab.id
                  ? 'bg-white dark:bg-[#132035] text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Team Analytics ── */}
      {activeView === 'team' && isManagerOrAbove && <TeamAnalyticsView />}

      {/* ── Pipeline Velocity ── */}
      {activeView === 'velocity' && isManagerOrAbove && <VelocityView />}

      {/* ── Kanban Board ── */}
      {activeView === 'pipeline' && isLoading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : activeView === 'pipeline' && (
        <div className="flex gap-3 overflow-x-auto pb-6">
          {PIPELINE_STAGES.map((stage) => {
            const stagePipeline = pipeline.find((p) => p._id === stage);
            const count = stagePipeline?.count || 0;
            const value = stagePipeline?.totalValue || 0;
            const meta = STAGE_META[stage];

            return (
              <div key={stage} className="flex-shrink-0 w-[248px]">
                <div className="rounded-2xl flex flex-col min-h-[500px] overflow-hidden shadow-lg dark:shadow-slate-900/60 border border-white/10 bg-white dark:bg-[#0f1a2e]">

                  {/* Full gradient header */}
                  <div className="flex-shrink-0 px-4 pt-4 pb-3" style={{ background: meta.grad }}>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-[13px] font-bold text-white tracking-tight truncate flex-1">{stageLabel(stage)}</h3>
                      <span className="text-[11px] font-bold text-white/90 bg-white/20 rounded-full px-2.5 py-0.5 flex-shrink-0">
                        {count}
                      </span>
                    </div>
                    <p className="text-[11px] text-white/60 font-medium mt-1 flex items-center gap-0.5">
                      <CurrencyRupeeIcon className="w-3 h-3" />
                      {value > 0 ? value.toLocaleString('en-IN') : '—'}
                    </p>
                  </div>

                  {/* Cards area */}
                  <div className="flex-1 p-2 space-y-1.5 bg-gray-50/70 dark:bg-[#0f1a2e]">
                    {(grouped[stage] || []).slice(0, 8).map((lead) => (
                      <LeadCard
                        key={lead._id}
                        lead={lead}
                        stage={stage}
                        onClick={(l) => setSelectedLeadId(l._id)}
                      />
                    ))}
                    {count > 8 && (
                      <button
                        onClick={() => setStageModal(stage)}
                        className="w-full text-[11px] font-semibold text-gray-400 dark:text-gray-500 text-center py-2 rounded-xl border border-dashed border-gray-200 dark:border-[#1b2e4a] hover:border-gray-300 dark:hover:border-slate-500 hover:text-gray-600 dark:hover:text-gray-300 transition-all"
                      >
                        +{count - 8} more
                      </button>
                    )}
                    {count === 0 && (
                      <div className="flex flex-col items-center justify-center py-14 opacity-35 select-none">
                        <div className="w-8 h-8 rounded-full mb-2" style={{ background: meta.grad }} />
                        <p className="text-xs text-gray-400 dark:text-gray-500">No leads</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Stage Leads Modal */}
      <AnimatePresence>
        {stageModal && (
          <StageLeadsModal
            stage={stageModal}
            onClose={() => setStageModal(null)}
            onSelectLead={(id) => setSelectedLeadId(id)}
          />
        )}
      </AnimatePresence>

      {/* Lead Slide-Over */}
      <AnimatePresence>
        {selectedLeadId && (
          <LeadSlideOver
            leadId={selectedLeadId}
            onClose={() => setSelectedLeadId(null)}
            onUpdated={() => qc.invalidateQueries({ queryKey: ['crm'] })}
          />
        )}
      </AnimatePresence>

      {showForm && (
        <CreateLeadModal
          onClose={() => setShowForm(false)}
          onRefresh={() => qc.invalidateQueries({ queryKey: ['crm'] })}
          onSuccess={() => {
            setShowForm(false);
            qc.invalidateQueries({ queryKey: ['crm'] });
          }}
        />
      )}

    </div>
  );
}
