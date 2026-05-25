import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PlusIcon, PhoneIcon, EnvelopeIcon, XMarkIcon, BuildingOfficeIcon,
  MapPinIcon, CurrencyRupeeIcon, UserIcon, ClockIcon, CheckCircleIcon,
  ArrowRightIcon, TableCellsIcon, CalendarDaysIcon, ChatBubbleLeftIcon,
  QuestionMarkCircleIcon,
} from '@heroicons/react/24/outline';
import api from '../../api/axios';
import { useAuthStore } from '../../store/useAuthStore';
import { clsx } from 'clsx';
import { format, formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import GoogleSheetsPanel from '../../components/crm/GoogleSheetsPanel';
import ErrorBoundary from '../../components/common/ErrorBoundary';

const PIPELINE_STAGES = ['New Lead', 'Follow-up', 'In Progress', 'Dispatched', 'Won', 'Lost'];

const STAGE_COLORS = {
  'New Lead': 'bg-gray-100 dark:bg-gray-800',
  'Follow-up': 'bg-yellow-50 dark:bg-yellow-900/20',
  'In Progress': 'bg-blue-50 dark:bg-blue-900/20',
  'Dispatched': 'bg-indigo-50 dark:bg-indigo-900/20',
  'Won': 'bg-green-50 dark:bg-green-900/20',
  'Lost': 'bg-red-50 dark:bg-red-900/20',
};
const STAGE_DOTS = {
  'New Lead': 'bg-gray-400',
  'Follow-up': 'bg-yellow-500',
  'In Progress': 'bg-blue-500',
  'Dispatched': 'bg-indigo-500',
  'Won': 'bg-green-500',
  'Lost': 'bg-red-500',
};
const STAGE_BADGE = {
  'New Lead': 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  'Follow-up': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  'In Progress': 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  'Dispatched': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  'Won': 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  'Lost': 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

const FOLLOWUP_TYPES = ['call', 'whatsapp', 'meeting', 'email', 'demo', 'other'];
const FOLLOWUP_ICONS = { call: '📞', whatsapp: '💬', meeting: '🤝', email: '✉️', demo: '🖥️', other: '📝' };

const SOURCES = ['Website Form', 'WhatsApp Chatbot', 'Google Sheets', 'Meta Ads', 'Manual Entry', 'Import', 'Referral'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];

// ── Lead Card ────────────────────────────────────────────────────────────────
function LeadCard({ lead, onClick }) {
  const hasPending = lead.pendingQueries > 0;
  const hasAnswered = lead.answeredQueries > 0;

  return (
    <div
      onClick={() => onClick(lead)}
      className={clsx(
        'bg-white dark:bg-gray-900 rounded-lg border p-3 cursor-pointer hover:shadow-md transition-all',
        hasPending
          ? 'border-amber-300 dark:border-amber-700 hover:border-amber-400'
          : 'border-gray-200 dark:border-gray-700 hover:border-brand-300 dark:hover:border-brand-700'
      )}
    >
      <div className="flex items-start justify-between mb-1">
        <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">{lead.name}</p>
        <span className={clsx(
          'ml-2 flex-shrink-0 text-xs px-1.5 py-0.5 rounded-full font-medium',
          lead.priority === 'critical' ? 'bg-red-100 text-red-700' :
          lead.priority === 'high' ? 'bg-orange-100 text-orange-700' :
          lead.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'
        )}>
          {lead.priority}
        </span>
      </div>
      {lead.company && <p className="text-xs text-gray-500 truncate">{lead.company}</p>}
      <div className="flex items-center gap-1 mt-2">
        <PhoneIcon className="w-3 h-3 text-gray-400 flex-shrink-0" />
        <span className="text-xs text-gray-500">{lead.phone}</span>
      </div>
      {lead.estimatedValue > 0 && (
        <p className="text-xs text-green-600 font-medium mt-1">₹{lead.estimatedValue.toLocaleString('en-IN')}</p>
      )}
      {lead.nextFollowUpAt && (
        <p className="text-xs text-orange-500 mt-1 flex items-center gap-1">
          <ClockIcon className="w-3 h-3" />
          {format(new Date(lead.nextFollowUpAt), 'dd MMM')}
        </p>
      )}
      {lead.assignedTo && (
        <div className="mt-2 flex items-center gap-1">
          <div className="w-4 h-4 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center flex-shrink-0">
            <span className="text-brand-700 dark:text-brand-300 text-xs font-bold">{lead.assignedTo.firstName?.[0]}</span>
          </div>
          <span className="text-xs text-gray-400">{lead.assignedTo.firstName}</span>
        </div>
      )}

      {/* Query badges */}
      {(hasPending || hasAnswered) && (
        <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-800 flex items-center gap-1.5 flex-wrap">
          {hasPending && (
            <span className="flex items-center gap-1 text-xs bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse inline-block" />
              {lead.pendingQueries} query pending
            </span>
          )}
          {hasAnswered && (
            <span className="flex items-center gap-1 text-xs bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full font-medium">
              ✓ {lead.answeredQueries} answered
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Lead Slide-Over Panel ────────────────────────────────────────────────────
function LeadSlideOver({ leadId, onClose, onUpdated }) {
  const qc = useQueryClient();
  const [showFollowUpForm, setShowFollowUpForm] = useState(false);
  const [showQueryForm, setShowQueryForm] = useState(false);
  const { register, handleSubmit, reset, formState: { errors } } = useForm();
  const { register: regQ, handleSubmit: handleQSubmit, reset: resetQ } = useForm();

  const { data: lead, isLoading } = useQuery({
    queryKey: ['crm', 'lead', leadId],
    queryFn: () => api.get(`/crm/leads/${leadId}`).then(r => r.data.lead),
    enabled: !!leadId,
  });

  const statusMutation = useMutation({
    mutationFn: (status) => api.put(`/crm/leads/${leadId}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm'] });
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

  const queryMutation = useMutation({
    mutationFn: (data) => api.post(`/crm/leads/${leadId}/query`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm', 'lead', leadId, 'queries'] });
      qc.invalidateQueries({ queryKey: ['crm'] });
      if (onUpdated) onUpdated();
      toast.success('Query sent — assignee has been notified');
      resetQ();
      setShowQueryForm(false);
    },
    onError: () => toast.error('Failed to raise query'),
  });

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
        className="fixed right-0 top-0 h-full w-full max-w-lg bg-white dark:bg-gray-900 shadow-2xl z-50 flex flex-col overflow-hidden"
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
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 flex-shrink-0">
            <XMarkIcon className="w-5 h-5 text-gray-500" />
          </button>
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
                    onClick={() => statusMutation.mutate(stage)}
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
                {lead.nextFollowUpAt && (
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
                  {[...lead.followUps].reverse().map((fu, idx) => (
                    <div key={idx} className="flex gap-3">
                      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-sm">
                        {FOLLOWUP_ICONS[fu.type] || '📝'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 capitalize">{fu.type}</span>
                          <span className="text-xs text-gray-400">
                            {format(new Date(fu.scheduledAt || fu.createdAt), 'dd MMM yyyy, h:mm a')}
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
                  onClick={() => { setShowQueryForm(p => !p); setShowFollowUpForm(false); }}
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
                            q.status === 'pending' ? 'bg-amber-100 text-amber-600' : 'bg-green-100 text-green-600'
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

              {/* Raise Query inline form */}
              <AnimatePresence>
                {showQueryForm && (
                  <motion.form
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    onSubmit={handleQSubmit(data => queryMutation.mutate(data))}
                    className="space-y-3 overflow-hidden"
                  >
                    <div>
                      <label className="label">Query Title *</label>
                      <input
                        {...regQ('title', { required: true })}
                        className="input text-sm"
                        placeholder="e.g. Formulation details for Product X"
                      />
                    </div>
                    <div>
                      <label className="label">Question *</label>
                      <textarea
                        {...regQ('description', { required: true })}
                        rows={3}
                        className="input resize-none text-sm"
                        placeholder="What does the customer want to know from Production?"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="label">Assign To *</label>
                        <select {...regQ('assignedTo', { required: true })} className="input text-sm">
                          <option value="">Select person</option>
                          {(usersData?.data || []).map(u => (
                            <option key={u._id} value={u._id}>
                              {u.firstName} {u.lastName}{u.department ? ` (${u.department})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="label">Urgency</label>
                        <select {...regQ('urgency')} defaultValue="medium" className="input text-sm">
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </select>
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={queryMutation.isPending}
                      className="w-full btn-primary justify-center text-sm disabled:opacity-50"
                    >
                      {queryMutation.isPending ? 'Sending…' : 'Send to Assignee'}
                    </button>
                  </motion.form>
                )}
              </AnimatePresence>

              {!leadQueries?.length && !showQueryForm && (
                <p className="text-xs text-gray-400 text-center py-2">No queries raised for this lead</p>
              )}
            </div>
          </div>
        )}
      </motion.div>
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
      <div className="page-header">
        <div>
          <h1 className="page-title">CRM Pipeline</h1>
          <p className="text-gray-500 text-sm">
            {analyticsData?.totalLeads || 0} total leads • {analyticsData?.conversionRate || 0}% conversion
          </p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary">
          <PlusIcon className="w-4 h-4" /> Add Lead
        </button>
      </div>

      {/* Google Sheets Sync Panel */}
      <ErrorBoundary>
        <GoogleSheetsPanel onSynced={() => qc.invalidateQueries({ queryKey: ['crm'] })} />
      </ErrorBoundary>

      {/* Quick stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Leads', value: analyticsData?.totalLeads || 0, color: 'blue' },
          { label: 'Won', value: analyticsData?.wonLeads || 0, color: 'green' },
          { label: 'Lost', value: analyticsData?.lostLeads || 0, color: 'red' },
          { label: 'Conversion', value: `${analyticsData?.conversionRate || 0}%`, color: 'purple' },
        ].map((s) => (
          <div key={s.label} className="card p-4">
            <p className={`text-2xl font-bold text-${s.color}-600`}>{s.value}</p>
            <p className="text-sm text-gray-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Kanban Pipeline */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {PIPELINE_STAGES.map((stage) => {
            const stagePipeline = pipeline.find((p) => p._id === stage);
            const count = stagePipeline?.count || 0;
            const value = stagePipeline?.totalValue || 0;

            return (
              <div key={stage} className="flex-shrink-0 w-60">
                <div className={clsx('rounded-xl p-3 min-h-[400px]', STAGE_COLORS[stage])}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className={clsx('w-2 h-2 rounded-full flex-shrink-0', STAGE_DOTS[stage])} />
                    <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300 truncate">{stage}</h3>
                    <span className="ml-auto text-xs bg-white dark:bg-gray-800 rounded-full px-1.5 py-0.5 font-medium">{count}</span>
                  </div>
                  {value > 0 && (
                    <p className="text-xs text-green-600 font-medium mb-2 px-1">₹{value.toLocaleString('en-IN')}</p>
                  )}
                  <div className="space-y-2">
                    {(grouped[stage] || []).slice(0, 8).map((lead) => (
                      <LeadCard
                        key={lead._id}
                        lead={lead}
                        onClick={(l) => setSelectedLeadId(l._id)}
                      />
                    ))}
                    {count > 8 && (
                      <p className="text-xs text-gray-400 text-center py-1">+{count - 8} more</p>
                    )}
                    {count === 0 && (
                      <p className="text-xs text-gray-400 text-center py-8 opacity-60">No leads</p>
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
