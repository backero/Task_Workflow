import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  PlusIcon, PhoneIcon, EnvelopeIcon, XMarkIcon,
  MapPinIcon, CurrencyRupeeIcon, UserIcon, ClockIcon, CheckCircleIcon,
  ArrowRightIcon, TableCellsIcon, CalendarDaysIcon, ChatBubbleLeftIcon,
  QuestionMarkCircleIcon, ArrowTopRightOnSquareIcon,
  ChartBarIcon, SparklesIcon, ArrowTrendingUpIcon, FunnelIcon,
} from '@heroicons/react/24/outline';
import api from '../../api/axios';
import { useAuthStore } from '../../store/useAuthStore';
import { clsx } from 'clsx';
import { format, isValid } from 'date-fns';
import toast from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import GoogleSheetsPanel from '../../components/crm/GoogleSheetsPanel';
import ErrorBoundary from '../../components/common/ErrorBoundary';

const PIPELINE_STAGES = ['New Lead', 'Follow-up', 'In Progress', 'Ready to Dispatch', 'Dispatched', 'Payment Pending', 'Lost'];

const STAGE_META = {
  'New Lead':          { colBg: 'bg-slate-50 dark:bg-slate-800/60',          topBar: 'bg-slate-400',   dot: 'bg-slate-400',   cardBorder: 'border-l-slate-400',   badge: 'bg-slate-100 text-slate-600 dark:bg-slate-700/80 dark:text-slate-200',     val: 'text-slate-500 dark:text-slate-400'   },
  'Follow-up':         { colBg: 'bg-amber-50 dark:bg-amber-900/20',           topBar: 'bg-amber-400',   dot: 'bg-amber-400',   cardBorder: 'border-l-amber-400',   badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',     val: 'text-amber-600 dark:text-amber-400'   },
  'In Progress':       { colBg: 'bg-blue-50 dark:bg-blue-900/20',             topBar: 'bg-blue-600',    dot: 'bg-blue-500',    cardBorder: 'border-l-blue-500',    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',         val: 'text-blue-600 dark:text-blue-400'     },
  'Ready to Dispatch': { colBg: 'bg-violet-50 dark:bg-violet-900/20',         topBar: 'bg-violet-600',  dot: 'bg-violet-500',  cardBorder: 'border-l-violet-500',  badge: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300', val: 'text-violet-600 dark:text-violet-400' },
  'Dispatched':        { colBg: 'bg-teal-50 dark:bg-teal-900/20',             topBar: 'bg-teal-500',    dot: 'bg-teal-500',    cardBorder: 'border-l-teal-500',    badge: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',         val: 'text-teal-600 dark:text-teal-400'     },
  'Payment Pending':   { colBg: 'bg-green-50 dark:bg-green-900/20',           topBar: 'bg-green-500',   dot: 'bg-green-500',   cardBorder: 'border-l-green-500',   badge: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',     val: 'text-green-600 dark:text-green-400'   },
  'Lost':              { colBg: 'bg-rose-50 dark:bg-rose-900/20',             topBar: 'bg-rose-500',    dot: 'bg-rose-500',    cardBorder: 'border-l-rose-500',    badge: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',         val: 'text-rose-600 dark:text-rose-400'     },
};
const STAGE_BADGE = Object.fromEntries(Object.entries(STAGE_META).map(([k, v]) => [k, v.badge]));

const FOLLOWUP_TYPES = ['call', 'whatsapp', 'meeting', 'email', 'demo', 'other'];
const FOLLOWUP_ICONS = { call: '📞', whatsapp: '💬', meeting: '🤝', email: '✉️', demo: '🖥️', other: '📝' };

const SOURCES = ['Website Form', 'WhatsApp Chatbot', 'Google Sheets', 'Meta Ads', 'Manual Entry', 'Import', 'Referral'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];

// ── Lead Card ────────────────────────────────────────────────────────────────
const PRIORITY_CFG = {
  critical: { dot: 'bg-red-500',    pill: 'bg-red-50 text-red-600 dark:bg-red-900/40 dark:text-red-400' },
  high:     { dot: 'bg-orange-500', pill: 'bg-orange-50 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400' },
  medium:   { dot: 'bg-yellow-400', pill: 'bg-yellow-50 text-yellow-600 dark:bg-yellow-900/40 dark:text-yellow-400' },
  low:      { dot: 'bg-gray-300',   pill: 'bg-gray-50 text-gray-500 dark:bg-gray-700/50 dark:text-gray-400' },
};

function LeadCard({ lead, stage, onClick }) {
  const hasPending = lead.pendingQueries > 0;
  const hasAnswered = lead.answeredQueries > 0;
  const meta = STAGE_META[stage] || STAGE_META['New Lead'];
  const p = PRIORITY_CFG[lead.priority] || PRIORITY_CFG.low;

  return (
    <div
      onClick={() => onClick(lead)}
      className={clsx(
        'bg-white dark:bg-slate-900 rounded-xl border-l-[3px] cursor-pointer select-none',
        'border border-gray-100 dark:border-slate-700/50',
        'shadow-sm hover:shadow-md dark:hover:shadow-slate-900/60',
        'transition-all duration-150 ease-out hover:-translate-y-px active:translate-y-0',
        meta.cardBorder,
        hasPending && 'ring-1 ring-amber-300/70 dark:ring-amber-500/40',
      )}
    >
      <div className="p-3">
        {/* Name + priority */}
        <div className="flex items-start justify-between gap-2 mb-1">
          <p className="font-semibold text-[13px] text-gray-900 dark:text-white leading-snug line-clamp-1 flex-1">{lead.name}</p>
          <span className={clsx('flex-shrink-0 flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md font-semibold', p.pill)}>
            <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', p.dot)} />
            {lead.priority}
          </span>
        </div>

        {lead.company && <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate mb-2">{lead.company}</p>}

        {/* Phone */}
        <div className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
          <PhoneIcon className="w-3 h-3 text-gray-300 dark:text-gray-600 flex-shrink-0" />
          {lead.phone}
        </div>

        {/* Value + follow-up */}
        {(lead.estimatedValue > 0 || (lead.nextFollowUpAt && isValid(new Date(lead.nextFollowUpAt)))) && (
          <div className="flex items-center justify-between mt-1.5">
            {lead.estimatedValue > 0 && (
              <span className="text-[11px] font-bold text-green-600 dark:text-green-400 flex items-center gap-0.5">
                <CurrencyRupeeIcon className="w-3 h-3" />
                {lead.estimatedValue.toLocaleString('en-IN')}
              </span>
            )}
            {lead.nextFollowUpAt && isValid(new Date(lead.nextFollowUpAt)) && (
              <span className="text-[11px] text-orange-500 dark:text-orange-400 flex items-center gap-0.5 ml-auto">
                <ClockIcon className="w-3 h-3" />
                {format(new Date(lead.nextFollowUpAt), 'dd MMM')}
              </span>
            )}
          </div>
        )}

        {/* Assigned user */}
        {lead.assignedTo && (
          <div className="mt-2 flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center flex-shrink-0 shadow-sm">
              <span className="text-white text-[9px] font-bold leading-none">{lead.assignedTo.firstName?.[0]?.toUpperCase()}</span>
            </div>
            <span className="text-[11px] text-gray-400 dark:text-gray-500">{lead.assignedTo.firstName}</span>
          </div>
        )}
      </div>

      {/* Query section */}
      {(hasPending || hasAnswered) && (
        <div className="px-3 pb-3 pt-0 space-y-1.5 border-t border-gray-50 dark:border-slate-800 mt-0">
          <div className="pt-2 space-y-1.5">
            {hasPending && (
              <span className="inline-flex items-center gap-1.5 text-[11px] bg-amber-50 dark:bg-amber-900/25 text-amber-700 dark:text-amber-400 px-2 py-1 rounded-lg font-medium border border-amber-100 dark:border-amber-800/50">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
                {lead.pendingQueries} pending quer{lead.pendingQueries > 1 ? 'ies' : 'y'}
              </span>
            )}
            {hasAnswered && lead.answeredQueryList?.map((q, i) => (
              <div key={i} className="rounded-lg bg-green-50 dark:bg-green-900/15 px-2.5 py-2 text-[11px] border border-green-100 dark:border-green-800/40" onClick={(e) => e.stopPropagation()}>
                <p className="font-semibold text-gray-700 dark:text-gray-200 line-clamp-1">✓ {q.title}</p>
                {q.description && <p className="text-gray-400 dark:text-gray-500 mt-0.5 line-clamp-1">{q.description}</p>}
                {q.answer && (
                  <p className="mt-1 text-green-700 dark:text-green-400 line-clamp-2">
                    <span className="font-semibold">Ans: </span>{q.answer}
                  </p>
                )}
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
  const [showFollowUpForm, setShowFollowUpForm] = useState(false);
  const [showQueryForm, setShowQueryForm] = useState(false);
  const [pendingStage, setPendingStage] = useState(null);
  const [stageShiftReason, setStageShiftReason] = useState('');
  const [queryItems, setQueryItems] = useState([{ id: 1, title: '', description: '', assignedTo: '', urgency: 'medium' }]);
  const [submittingQueries, setSubmittingQueries] = useState(false);
  const { register, handleSubmit, reset, formState: { errors } } = useForm();

  const addQueryCard = () => setQueryItems(prev => [...prev, { id: Date.now(), title: '', description: '', assignedTo: '', urgency: 'medium' }]);
  const removeQueryCard = (id) => setQueryItems(prev => prev.length > 1 ? prev.filter(q => q.id !== id) : prev);
  const updateQueryCard = (id, field, value) => setQueryItems(prev => prev.map(q => q.id === id ? { ...q, [field]: value } : q));

  const { data: lead, isLoading } = useQuery({
    queryKey: ['crm', 'lead', leadId],
    queryFn: () => api.get(`/crm/leads/${leadId}`).then(r => r.data.lead),
    enabled: !!leadId,
  });

  const statusMutation = useMutation({
    mutationFn: (status) => api.put(`/crm/leads/${leadId}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm', 'lead', leadId] });
      qc.refetchQueries({ queryKey: ['crm', 'pipeline'] });
      if (onUpdated) onUpdated();
      toast.success('Stage updated');
    },
    onError: () => toast.error('Failed to update stage'),
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
        className="fixed right-0 top-0 h-full w-full max-w-xl bg-white dark:bg-gray-900 shadow-2xl z-50 flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center flex-shrink-0">
              <span className="text-brand-700 dark:text-brand-300 font-bold text-sm">
                {lead?.name?.[0]?.toUpperCase() || '?'}
              </span>
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-gray-900 dark:text-white truncate">{lead?.name || '…'}</h2>
              {lead?.company && <p className="text-xs text-gray-500 truncate">{lead.company}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => { onClose(); navigate(`/crm/leads/${leadId}`); }}
              className="flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700 px-2.5 py-1.5 rounded-lg hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors"
            >
              <ArrowTopRightOnSquareIcon className="w-4 h-4" />
              Full Details
            </button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
              <XMarkIcon className="w-5 h-5 text-gray-500" />
            </button>
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
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Move to stage</p>
              <div className="flex flex-wrap gap-2">
                {PIPELINE_STAGES.map((stage) => (
                  <button
                    key={stage}
                    onClick={() => {
                      if (lead?.status === 'New Lead' && stage !== 'New Lead') {
                        setPendingStage(stage);
                        setStageShiftReason('');
                      } else {
                        statusMutation.mutate(stage);
                      }
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
                    {stage}
                  </button>
                ))}
              </div>
            </div>

            {/* Contact Info */}
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 space-y-3">
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
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                  <p className="text-xs font-semibold text-gray-500 mb-1">Notes</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{lead.notes}</p>
                </div>
              )}
            </div>

            {/* Log Follow-Up */}
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800">
              <button
                onClick={() => setShowFollowUpForm(p => !p)}
                className={clsx(
                  'w-full flex items-center justify-between px-4 py-2.5 rounded-xl font-medium text-sm transition-colors',
                  showFollowUpForm
                    ? 'bg-brand-600 text-white'
                    : 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300 hover:bg-brand-100 dark:hover:bg-brand-900/30'
                )}
              >
                <span className="flex items-center gap-2">
                  <CheckCircleIcon className="w-4 h-4" />
                  Log Follow-Up / Update
                </span>
                <ArrowRightIcon className={clsx('w-4 h-4 transition-transform', showFollowUpForm && 'rotate-90')} />
              </button>

              <AnimatePresence>
                {showFollowUpForm && (
                  <motion.form
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    onSubmit={handleSubmit(onSubmitFollowUp)}
                    className="mt-3 space-y-3 overflow-hidden"
                  >
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="label">Type</label>
                        <select {...register('type')} className="input text-sm">
                          {FOLLOWUP_TYPES.map(t => (
                            <option key={t} value={t}>{FOLLOWUP_ICONS[t]} {t.charAt(0).toUpperCase() + t.slice(1)}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="label">Contact Date</label>
                        <input
                          {...register('scheduledAt')}
                          type="datetime-local"
                          defaultValue={new Date().toISOString().slice(0, 16)}
                          className="input text-sm"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="label">What happened / Notes</label>
                      <textarea
                        {...register('notes', { required: 'Add a note' })}
                        rows={2}
                        className="input resize-none text-sm"
                        placeholder="e.g. Discussed pricing, client is interested in premium plan..."
                      />
                      {errors.notes && <p className="text-red-500 text-xs mt-0.5">{errors.notes.message}</p>}
                    </div>

                    <div>
                      <label className="label">Next follow-up date (optional)</label>
                      <input {...register('nextFollowUpAt')} type="datetime-local" className="input text-sm" />
                      <p className="text-xs text-gray-400 mt-0.5">Sets a reminder on the CRM calendar</p>
                    </div>

                    <button
                      type="submit"
                      disabled={followUpMutation.isPending}
                      className="btn-primary w-full justify-center disabled:opacity-50"
                    >
                      {followUpMutation.isPending ? 'Saving…' : 'Save Follow-Up'}
                    </button>
                  </motion.form>
                )}
              </AnimatePresence>
            </div>

            {/* Follow-Up History */}
            {lead.followUps && lead.followUps.length > 0 && (
              <div className="px-5 py-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  History ({lead.followUps.length})
                </p>
                <div className="space-y-3">
                  {[...lead.followUps].reverse().map((fu) => (
                    <div key={fu._id || fu.createdAt} className="flex gap-3">
                      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-sm">
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
                <p className="text-xs mt-1">Click "Log Follow-Up" to record your first interaction</p>
              </div>
            )}

            {/* ── Technical Queries ── */}
            <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800">
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
                    <div key={q._id} className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden text-xs">
                      {/* Question */}
                      <div className="bg-gray-50 dark:bg-gray-800 px-3 py-2">
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
                        <div className="px-3 py-1.5 border-t border-gray-100 dark:border-gray-700 flex items-center gap-1.5">
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

      {/* Stage Shift Confirmation (New Lead → any other stage) */}
      {pendingStage && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={() => setPendingStage(null)} />
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-gray-700">
            <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white">Move to "{pendingStage}"</h3>
                <p className="text-sm text-gray-500 mt-0.5">Why are you shifting this lead?</p>
              </div>
              <button onClick={() => setPendingStage(null)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
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
                  {statusMutation.isPending ? 'Moving…' : `Move to ${pendingStage}`}
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
function CreateLeadModal({ onClose, onSuccess }) {
  const { register, handleSubmit, formState: { errors } } = useForm();
  const [loading, setLoading] = useState(false);

  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users?limit=100').then((r) => r.data),
  });

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      await api.post('/crm/leads', data);
      toast.success('Lead created');
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative card w-full max-w-lg shadow-modal max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
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
            <button type="submit" disabled={loading} className="btn-primary flex-1 justify-center">
              {loading ? 'Creating...' : 'Create Lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Pipeline Page ────────────────────────────────────────────────────────
export default function LeadPipeline() {
  const [showForm, setShowForm] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState(null);
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
    <div className="space-y-6">
      {/* ── Page Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">CRM Pipeline</h1>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
            {analyticsData?.totalLeads || 0} leads &nbsp;·&nbsp; {analyticsData?.conversionRate || 0}% conversion rate
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white shadow-md hover:shadow-lg transition-all duration-200 active:scale-95"
          style={{ background: 'linear-gradient(135deg, #112270 0%, #1a3a8a 100%)' }}
        >
          <PlusIcon className="w-4 h-4" /> Add Lead
        </button>
      </div>

      {/* Google Sheets Sync Panel */}
      <ErrorBoundary>
        <GoogleSheetsPanel onSynced={() => qc.invalidateQueries({ queryKey: ['crm'] })} />
      </ErrorBoundary>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Leads',     value: analyticsData?.totalLeads || 0,           icon: ChartBarIcon,        bar: '#112270', val: 'text-gray-800 dark:text-white'          },
          { label: 'Payment Pending', value: analyticsData?.wonLeads || 0,             icon: SparklesIcon,        bar: '#16a34a', val: 'text-green-700 dark:text-green-400'     },
          { label: 'Lost',            value: analyticsData?.lostLeads || 0,            icon: XMarkIcon,           bar: '#e11d48', val: 'text-rose-600 dark:text-rose-400'       },
          { label: 'Conversion',      value: `${analyticsData?.conversionRate || 0}%`, icon: ArrowTrendingUpIcon, bar: '#1a3a8a', val: 'text-blue-700 dark:text-blue-400'       },
        ].map((s) => (
          <div key={s.label} className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-gray-100 dark:border-slate-700/60 shadow-sm overflow-hidden relative">
            {/* top colour bar */}
            <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: s.bar }} />
            <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-3" style={{ background: s.bar }}>
              <s.icon className="w-4 h-4 text-white" />
            </div>
            <p className={clsx('text-[28px] font-black tracking-tight tabular-nums leading-none', s.val)}>{s.value}</p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 font-semibold uppercase tracking-widest mt-2">{s.label}</p>
          </div>
        ))}
      </div>

      {/* ── Kanban Board ── */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-6">
          {PIPELINE_STAGES.map((stage) => {
            const stagePipeline = pipeline.find((p) => p._id === stage);
            const count = stagePipeline?.count || 0;
            const value = stagePipeline?.totalValue || 0;
            const meta = STAGE_META[stage];

            return (
              <div key={stage} className="flex-shrink-0 w-[248px]">
                <div className={clsx(
                  'rounded-2xl flex flex-col min-h-[500px] overflow-hidden',
                  'border border-gray-100 dark:border-slate-700/50 shadow-sm dark:shadow-none',
                  meta.colBg,
                )}>
                  {/* Stage colour strip */}
                  <div className={clsx('h-[3px] w-full flex-shrink-0', meta.topBar)} />

                  {/* Column header */}
                  <div className="px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={clsx('w-2 h-2 rounded-full flex-shrink-0', meta.dot)} />
                        <h3 className="text-xs font-bold text-gray-700 dark:text-gray-100 truncate">{stage}</h3>
                      </div>
                      <span className="flex-shrink-0 text-xs font-bold bg-white dark:bg-slate-700 text-gray-500 dark:text-gray-300 rounded-full px-2 py-0.5 border border-gray-100 dark:border-slate-600 shadow-sm">
                        {count}
                      </span>
                    </div>
                    {value > 0 && (
                      <p className={clsx('text-[11px] font-bold mt-1.5 flex items-center gap-0.5', meta.val)}>
                        <CurrencyRupeeIcon className="w-3 h-3" />
                        {value.toLocaleString('en-IN')}
                      </p>
                    )}
                  </div>

                  {/* Separator */}
                  <div className="mx-3 h-px bg-black/5 dark:bg-white/5" />

                  {/* Cards */}
                  <div className="flex-1 p-2 space-y-1.5">
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
                        onClick={() => navigate(`/crm/leads?status=${encodeURIComponent(stage)}`)}
                        className="w-full text-[11px] font-semibold text-gray-500 dark:text-gray-400 text-center py-2 rounded-xl bg-white/50 dark:bg-white/5 hover:bg-white dark:hover:bg-white/10 border border-dashed border-gray-200 dark:border-slate-600 transition-all"
                      >
                        +{count - 8} more
                      </button>
                    )}
                    {count === 0 && (
                      <div className="flex flex-col items-center justify-center py-12 opacity-40 select-none">
                        <div className={clsx('w-6 h-6 rounded-full mb-2', meta.topBar, 'opacity-40')} />
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
          onSuccess={() => {
            setShowForm(false);
            qc.invalidateQueries({ queryKey: ['crm'] });
          }}
        />
      )}
    </div>
  );
}
