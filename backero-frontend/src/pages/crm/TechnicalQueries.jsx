import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';
import api from '../../api/axios';
import { format } from 'date-fns';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import {
  QuestionMarkCircleIcon, CheckCircleIcon, ClockIcon,
  ExclamationTriangleIcon, XMarkIcon, ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline';

const URGENCY_BADGE = {
  low: 'bg-gray-100 text-gray-600',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-red-100 text-red-700',
};

const STATUS_BADGE = {
  pending: 'bg-orange-100 text-orange-700',
  answered: 'bg-green-100 text-green-700',
  closed: 'bg-gray-100 text-gray-500',
};

export default function TechnicalQueries() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState('all');
  const [replyQuery, setReplyQuery] = useState(null);
  const [replyText, setReplyText] = useState('');

  const isAdmin = ['admin', 'founder', 'chairman', 'super_admin', 'manager', 'team_lead'].includes(user?.role);
  const canReplyQuery = (q) => isAdmin || q.assignedTo?._id === user?._id || (!q.assignedTo && user?.department === 'Production');

  const { data, isLoading } = useQuery({
    queryKey: ['crm', 'queries', statusFilter],
    queryFn: () => api.get(`/crm/queries${statusFilter !== 'all' ? `?status=${statusFilter}` : ''}`).then(r => r.data.queries),
  });

  const replyMutation = useMutation({
    mutationFn: ({ queryId, answer }) => api.put(`/crm/queries/${queryId}/reply`, { answer }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm', 'queries'] });
      toast.success('Reply sent — sales team has been notified');
      setReplyQuery(null);
      setReplyText('');
    },
    onError: () => toast.error('Failed to send reply'),
  });

  const queries = data || [];
  const pendingCount = queries.filter(q => q.status === 'pending').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Technical Queries</h1>
          <p className="text-sm text-gray-500 mt-1">Sales queries routed to Production for technical answers</p>
        </div>
        {pendingCount > 0 && (
          <span className="px-3 py-1.5 bg-orange-100 text-orange-700 rounded-full text-sm font-semibold">
            {pendingCount} pending
          </span>
        )}
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-[#0f1a2e] rounded-lg p-1 w-fit">
        {['all', 'pending', 'answered'].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={clsx(
              'px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize',
              statusFilter === s
                ? 'bg-white dark:bg-[#132035] text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Query list */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : queries.length === 0 ? (
        <div className="card p-16 text-center">
          <QuestionMarkCircleIcon className="w-12 h-12 mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">No queries found</p>
          <p className="text-sm text-gray-400 mt-1">
            {statusFilter === 'pending' ? 'All queries have been answered.' : 'No technical queries have been raised yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {queries.map(q => (
            <div key={q._id} className="card p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  {/* Header row */}
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', STATUS_BADGE[q.status] || 'bg-gray-100 text-gray-600')}>
                      {q.status === 'pending' ? 'Pending' : q.status === 'answered' ? 'Answered' : 'Closed'}
                    </span>
                    <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', URGENCY_BADGE[q.urgency] || 'bg-gray-100 text-gray-600')}>
                      {q.urgency} urgency
                    </span>
                    <span className="text-xs text-gray-400">
                      {format(new Date(q.createdAt), 'dd MMM yyyy, h:mm a')}
                    </span>
                  </div>

                  <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{q.title}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{q.description}</p>

                  {/* Lead info */}
                  {q.leadId && (
                    <button
                      onClick={() => navigate(`/crm/leads/${q.leadId._id}`)}
                      className="mt-2 flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium"
                    >
                      <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
                      Lead: {q.leadId.name}
                      {q.leadId.phone && <span className="text-gray-400 font-normal">· {q.leadId.phone}</span>}
                    </button>
                  )}

                  {/* Raised by / Assigned to */}
                  <div className="flex flex-wrap gap-x-4 mt-2">
                    <p className="text-xs text-gray-400">
                      Raised by <span className="font-medium text-gray-600 dark:text-gray-300">{q.raisedBy?.firstName} {q.raisedBy?.lastName}</span>
                    </p>
                    {q.assignedTo && (
                      <p className="text-xs text-blue-500">
                        Assigned to <span className="font-medium">{q.assignedTo.firstName} {q.assignedTo.lastName}</span>
                        {q.assignedTo.department && <span className="text-blue-400"> ({q.assignedTo.department})</span>}
                      </p>
                    )}
                  </div>

                  {/* Answer section */}
                  {q.status === 'answered' && q.answer && (
                    <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                      <div className="flex items-center gap-1.5 mb-1">
                        <CheckCircleIcon className="w-4 h-4 text-green-600" />
                        <span className="text-xs font-semibold text-green-700 dark:text-green-400">
                          Answered by {q.answeredBy?.firstName} {q.answeredBy?.lastName}
                          {q.answeredAt && <span className="font-normal"> · {format(new Date(q.answeredAt), 'dd MMM, h:mm a')}</span>}
                        </span>
                      </div>
                      <p className="text-sm text-green-800 dark:text-green-300 whitespace-pre-wrap">{q.answer}</p>
                    </div>
                  )}
                </div>

                {/* Reply button */}
                {canReplyQuery(q) && q.status === 'pending' && (
                  <button
                    onClick={() => { setReplyQuery(q); setReplyText(''); }}
                    className="btn-primary text-sm flex-shrink-0"
                  >
                    Reply
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reply modal */}
      {replyQuery && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={() => setReplyQuery(null)} />
          <div className="relative card w-full max-w-lg shadow-modal">
            <div className="p-5 border-b border-gray-200 dark:border-[#1b2e4a] flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white">Reply to Query</h3>
                <p className="text-sm text-gray-500 mt-0.5">{replyQuery.title}</p>
              </div>
              <button onClick={() => setReplyQuery(null)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#17263d]">
                <XMarkIcon className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Query context */}
              <div className="p-3 bg-gray-50 dark:bg-[#0f1a2e] rounded-lg">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Question</p>
                <p className="text-sm text-gray-700 dark:text-gray-300">{replyQuery.description}</p>
                <p className="text-xs text-gray-400 mt-2">Lead: <span className="font-medium">{replyQuery.leadName}</span></p>
              </div>

              <div>
                <label className="label">Your Answer *</label>
                <textarea
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  rows={5}
                  className="input resize-none"
                  placeholder="Provide a detailed technical answer for the sales team..."
                  autoFocus
                />
              </div>

              <div className="flex gap-3">
                <button type="button" onClick={() => setReplyQuery(null)} className="btn-secondary flex-1 justify-center">
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (!replyText.trim()) return toast.error('Enter an answer');
                    replyMutation.mutate({ queryId: replyQuery._id, answer: replyText });
                  }}
                  disabled={replyMutation.isPending}
                  className="btn-primary flex-1 justify-center disabled:opacity-50"
                >
                  {replyMutation.isPending ? 'Sending…' : 'Send Reply'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
