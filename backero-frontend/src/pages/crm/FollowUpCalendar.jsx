import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDaysIcon, PhoneIcon, CheckCircleIcon, ClockIcon,
  ExclamationCircleIcon, ChatBubbleLeftIcon, FunnelIcon,
} from '@heroicons/react/24/outline';
import api from '../../api/axios';
import { clsx } from 'clsx';
import { format, isToday, isTomorrow, isThisWeek, isPast, parseISO, startOfDay } from 'date-fns';
import toast from 'react-hot-toast';

const FOLLOWUP_ICONS = { call: '📞', whatsapp: '💬', meeting: '🤝', email: '✉️', demo: '🖥️', other: '📝' };

function groupByDate(leads) {
  const now = new Date();
  const groups = {
    overdue: [],
    today: [],
    tomorrow: [],
    thisWeek: [],
    later: [],
  };

  leads.forEach((lead) => {
    if (!lead.nextFollowUpAt) return;
    const date = new Date(lead.nextFollowUpAt);
    if (isPast(startOfDay(date)) && !isToday(date)) {
      groups.overdue.push(lead);
    } else if (isToday(date)) {
      groups.today.push(lead);
    } else if (isTomorrow(date)) {
      groups.tomorrow.push(lead);
    } else if (isThisWeek(date, { weekStartsOn: 1 })) {
      groups.thisWeek.push(lead);
    } else {
      groups.later.push(lead);
    }
  });

  return groups;
}

const GROUP_CONFIG = {
  overdue: {
    label: 'Overdue',
    icon: <ExclamationCircleIcon className="w-4 h-4" />,
    color: 'text-red-600 dark:text-red-400',
    bg: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
    badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    dot: 'bg-red-500',
  },
  today: {
    label: 'Today',
    icon: <ClockIcon className="w-4 h-4" />,
    color: 'text-orange-600 dark:text-orange-400',
    bg: 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800',
    badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
    dot: 'bg-orange-500',
  },
  tomorrow: {
    label: 'Tomorrow',
    icon: <CalendarDaysIcon className="w-4 h-4" />,
    color: 'text-yellow-600 dark:text-yellow-400',
    bg: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
    badge: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
    dot: 'bg-yellow-500',
  },
  thisWeek: {
    label: 'This Week',
    icon: <CalendarDaysIcon className="w-4 h-4" />,
    color: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    dot: 'bg-blue-500',
  },
  later: {
    label: 'Later',
    icon: <CalendarDaysIcon className="w-4 h-4" />,
    color: 'text-gray-600 dark:text-gray-400',
    bg: 'bg-gray-50 dark:bg-[#0f1a2e]/50 border-gray-200 dark:border-[#1b2e4a]',
    badge: 'bg-gray-100 text-gray-700 dark:bg-[#0f1a2e] dark:text-gray-300',
    dot: 'bg-gray-400',
  },
};

function FollowUpCard({ lead, onDone, onLog }) {
  const [showQuickLog, setShowQuickLog] = useState(false);
  const [note, setNote] = useState('');

  const handleDone = () => {
    if (!note.trim()) {
      toast.error('Add a quick note before marking done');
      return;
    }
    onDone(lead._id, note);
    setNote('');
    setShowQuickLog(false);
  };

  return (
    <div className="bg-white dark:bg-[#070c17] rounded-xl border border-gray-200 dark:border-[#1b2e4a] p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="font-semibold text-gray-900 dark:text-white truncate">{lead.name}</p>
            <span className={clsx(
              'flex-shrink-0 text-xs px-1.5 py-0.5 rounded-full font-medium',
              lead.priority === 'critical' ? 'bg-red-100 text-red-700' :
              lead.priority === 'high' ? 'bg-orange-100 text-orange-700' :
              lead.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'
            )}>
              {lead.priority}
            </span>
          </div>
          {lead.company && <p className="text-xs text-gray-500 truncate mb-1">{lead.company}</p>}

          <div className="flex items-center gap-3 text-xs text-gray-500">
            <a
              href={`tel:${lead.phone}`}
              className="flex items-center gap-1 hover:text-green-600 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <PhoneIcon className="w-3.5 h-3.5" />
              {lead.phone}
            </a>
            <a
              href={`https://wa.me/91${lead.phone?.replace(/\D/g, '').slice(-10)}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 hover:text-green-600 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <ChatBubbleLeftIcon className="w-3.5 h-3.5" />
              WhatsApp
            </a>
          </div>

          {lead.notes && (
            <p className="text-xs text-gray-400 mt-1.5 line-clamp-2 italic">"{lead.notes}"</p>
          )}
        </div>

        <div className="flex-shrink-0 text-right">
          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
            {format(new Date(lead.nextFollowUpAt), 'dd MMM')}
          </p>
          <p className="text-xs text-gray-400">
            {format(new Date(lead.nextFollowUpAt), 'h:mm a')}
          </p>
          {lead.status && (
            <p className="text-xs text-gray-400 mt-1">{lead.status}</p>
          )}
        </div>
      </div>

      {/* Quick action buttons */}
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-[#1b2e4a]">
        <button
          onClick={() => setShowQuickLog(p => !p)}
          className={clsx(
            'flex-1 text-xs py-1.5 rounded-lg font-medium transition-colors flex items-center justify-center gap-1',
            showQuickLog
              ? 'bg-brand-600 text-white'
              : 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300 hover:bg-brand-100 dark:hover:bg-brand-900/30'
          )}
        >
          <CheckCircleIcon className="w-3.5 h-3.5" />
          Log & Done
        </button>
        {lead.assignedTo && (
          <p className="text-xs text-gray-400 flex-shrink-0">
            → {lead.assignedTo.firstName}
          </p>
        )}
      </div>

      {showQuickLog && (
        <div className="mt-2 flex gap-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="input flex-1 text-xs"
            placeholder="What happened? (e.g. Spoke with client, interested...)"
            onKeyDown={(e) => e.key === 'Enter' && handleDone()}
          />
          <button
            onClick={handleDone}
            className="btn-primary text-xs px-3 flex-shrink-0"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}

function EmptyGroup({ label }) {
  return (
    <div className="text-center py-6 text-gray-400">
      <CalendarDaysIcon className="w-6 h-6 mx-auto mb-1 opacity-40" />
      <p className="text-xs">No {label.toLowerCase()} follow-ups</p>
    </div>
  );
}

export default function FollowUpCalendar() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState('all');

  const { data, isLoading } = useQuery({
    queryKey: ['crm', 'followups'],
    queryFn: () =>
      api.get('/crm/leads', { params: { followUpOnly: 'true', limit: 200 } })
        .then(r => r.data.data || []),
    refetchInterval: 5 * 60 * 1000,
  });

  const logDoneMutation = useMutation({
    mutationFn: ({ leadId, note }) =>
      api.post(`/crm/leads/${leadId}/followup`, {
        scheduledAt: new Date().toISOString(),
        type: 'call',
        notes: note,
        outcome: note,
        isCompleted: true,
      }).then(() =>
        api.put(`/crm/leads/${leadId}`, { nextFollowUpAt: null })
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm', 'followups'] });
      qc.invalidateQueries({ queryKey: ['crm'] });
      toast.success('Follow-up marked as done');
    },
    onError: () => toast.error('Failed to update'),
  });

  const leads = data || [];
  const groups = groupByDate(leads);

  const totalToday = groups.today.length + groups.overdue.length;
  const totalAll = leads.length;

  const visibleGroups = filter === 'overdue'
    ? { overdue: groups.overdue }
    : filter === 'today'
    ? { today: groups.today }
    : groups;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Follow-up Calendar</h1>
          <p className="text-gray-500 text-sm">
            {totalAll} upcoming follow-ups
            {totalToday > 0 && (
              <span className="ml-2 text-orange-600 font-medium">• {totalToday} need attention today</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <FunnelIcon className="w-4 h-4 text-gray-400" />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="input text-sm"
          >
            <option value="all">All upcoming</option>
            <option value="overdue">Overdue only</option>
            <option value="today">Today only</option>
          </select>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { key: 'overdue', label: 'Overdue', count: groups.overdue.length, color: 'red' },
          { key: 'today', label: 'Today', count: groups.today.length, color: 'orange' },
          { key: 'tomorrow', label: 'Tomorrow', count: groups.tomorrow.length, color: 'yellow' },
          { key: 'thisWeek', label: 'This Week', count: groups.thisWeek.length, color: 'blue' },
        ].map(s => (
          <div
            key={s.key}
            onClick={() => setFilter(s.key === filter ? 'all' : s.key)}
            className={clsx(
              'card p-4 cursor-pointer transition-all',
              filter === s.key ? `ring-2 ring-${s.color}-500` : 'hover:shadow-md'
            )}
          >
            <p className={`text-2xl font-bold text-${s.color}-600`}>{s.count}</p>
            <p className="text-sm text-gray-500">{s.label}</p>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : totalAll === 0 ? (
        <div className="card p-16 text-center">
          <CalendarDaysIcon className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
          <p className="text-gray-500 font-medium">No follow-ups scheduled</p>
          <p className="text-sm text-gray-400 mt-1">When you log a follow-up with a next date, it appears here</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(visibleGroups).map(([key, groupLeads]) => {
            const config = GROUP_CONFIG[key];
            if (!config) return null;

            return (
              <div key={key}>
                {/* Group header */}
                <div className={clsx('flex items-center gap-2 px-4 py-2.5 rounded-xl border mb-3', config.bg)}>
                  <div className={clsx('w-2 h-2 rounded-full flex-shrink-0', config.dot)} />
                  <span className={clsx('font-semibold text-sm flex items-center gap-1.5', config.color)}>
                    {config.icon}
                    {config.label}
                  </span>
                  <span className={clsx('ml-auto text-xs px-2 py-0.5 rounded-full font-medium', config.badge)}>
                    {groupLeads.length}
                  </span>
                </div>

                {groupLeads.length === 0 ? (
                  filter === 'all' && <EmptyGroup label={config.label} />
                ) : (
                  <div className="space-y-3">
                    {groupLeads.map((lead) => (
                      <FollowUpCard
                        key={lead._id}
                        lead={lead}
                        onDone={(leadId, note) => logDoneMutation.mutate({ leadId, note })}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
