import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  PlusIcon, PhoneIcon, XMarkIcon,
  CurrencyRupeeIcon, ClockIcon, CheckCircleIcon,
  ArrowRightIcon, TableCellsIcon, ArrowTopRightOnSquareIcon,
  ChartBarIcon, SparklesIcon,
} from '@heroicons/react/24/outline';
import api from '../../api/axios';
import { useAuthStore } from '../../store/useAuthStore';
import { clsx } from 'clsx';
import { format, isValid } from 'date-fns';
import GoogleSheetsPanel from '../../components/crm/GoogleSheetsPanel';
import ErrorBoundary from '../../components/common/ErrorBoundary';
import CreateLeadModal from './CreateLeadModal';
import { customerId } from '../../utils/leadHelpers';

const PIPELINE_STAGES = ['New Lead', 'Follow-up', 'In Progress', 'Ready to Dispatch', 'Payment Pending', 'Dispatched', 'Lost'];

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

// Display name overrides (internal value stays the same for MongoDB)
const STAGE_DISPLAY = { 'In Progress': 'Production' };
const stageLabel = (s) => STAGE_DISPLAY[s] || s;

const BATCH_STAGE_NAMES = ['Order', 'Work Assignment', 'Procurement', 'Weighing', 'Bulk QC', 'Packaging', 'Final QC', 'Dispatch'];

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
            <div className="flex items-center gap-1.5">
              <p className="font-bold text-[13px] text-gray-900 dark:text-white leading-snug line-clamp-1">{lead.name}</p>
              <span className="flex-shrink-0 font-mono text-[9px] font-bold text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-[#132035] px-1 py-0.5 rounded">{customerId(lead)}</span>
            </div>
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

        {/* Linked batch order status */}
        {lead.productionOrderId?.orderNumber && (
          <div className="flex items-center gap-1.5 mt-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-indigo-600 dark:text-indigo-300">
            🏭 {lead.productionOrderId.orderNumber} · {BATCH_STAGE_NAMES[lead.productionOrderId.stage] || lead.productionOrderId.status}
          </div>
        )}

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
  const stageCount = (stage) => pipeline.find((p) => p._id === stage)?.count || 0;

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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: 'Total Leads',       value: analyticsData?.totalLeads || 0,     icon: ChartBarIcon,               grad: 'linear-gradient(135deg,#112270 0%,#1e40af 100%)' },
          { label: 'In Process',        value: stageCount('In Progress'),          icon: ArrowRightIcon,             grad: 'linear-gradient(135deg,#3b82f6 0%,#1d4ed8 100%)' },
          { label: 'Follow-up',         value: stageCount('Follow-up'),            icon: ClockIcon,                  grad: 'linear-gradient(135deg,#f59e0b 0%,#b45309 100%)' },
          { label: 'Ready to Dispatch', value: stageCount('Ready to Dispatch'),    icon: ArrowTopRightOnSquareIcon,  grad: 'linear-gradient(135deg,#8b5cf6 0%,#5b21b6 100%)' },
          { label: 'Payment Pending',   value: analyticsData?.wonLeads || 0,       icon: SparklesIcon,               grad: 'linear-gradient(135deg,#16a34a 0%,#15803d 100%)' },
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
                        onClick={(l) => navigate(`/samples?open=${l._id}`)}
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
            onSelectLead={(id) => navigate(`/samples?open=${id}`)}
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
