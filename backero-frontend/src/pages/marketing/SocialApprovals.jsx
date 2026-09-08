import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { CheckIcon, XMarkIcon, PhotoIcon, FilmIcon, CalendarDaysIcon } from '@heroicons/react/24/outline';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';

const TABS = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

const PLATFORM_LABELS = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  twitter: 'X / Twitter',
  youtube: 'YouTube',
  other: 'Other',
};

function RequestCard({ request, onApprove, onReject, isMutating }) {
  const [rejecting, setRejecting] = useState(false);
  const [notes, setNotes] = useState('');

  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="badge-blue">{PLATFORM_LABELS[request.platform] || request.platform}</span>
          {request.campaignName && (
            <span className="ml-2 text-sm font-semibold text-gray-900 dark:text-white">{request.campaignName}</span>
          )}
        </div>
        {request.scheduledFor && (
          <div className="flex items-center gap-1 text-xs text-gray-400 flex-shrink-0">
            <CalendarDaysIcon className="w-3.5 h-3.5" />
            {format(new Date(request.scheduledFor), 'dd MMM, HH:mm')}
          </div>
        )}
      </div>

      {request.caption && (
        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{request.caption}</p>
      )}

      {request.mediaUrls?.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {request.mediaUrls.map((m, i) => (
            <a key={i} href={m.url} target="_blank" rel="noreferrer" className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200 dark:border-[#1b2e4a] bg-gray-50 dark:bg-[#0f1a2e] flex items-center justify-center">
              {m.type === 'video' ? (
                <FilmIcon className="w-6 h-6 text-gray-400" />
              ) : (
                <img src={m.url} alt="" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
              )}
            </a>
          ))}
        </div>
      )}

      {request.status === 'pending' && (
        <>
          {!rejecting ? (
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => onApprove(request._id)}
                disabled={isMutating}
                className="btn-primary flex-1 justify-center"
              >
                <CheckIcon className="w-4 h-4 inline mr-1" />Approve
              </button>
              <button
                onClick={() => setRejecting(true)}
                disabled={isMutating}
                className="btn-secondary flex-1 justify-center text-red-600 border-red-300 hover:bg-red-50"
              >
                <XMarkIcon className="w-4 h-4 inline mr-1" />Reject
              </button>
            </div>
          ) : (
            <div className="space-y-2 pt-1">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="input resize-none"
                placeholder="Why is this being rejected?"
                autoFocus
              />
              <div className="flex gap-2">
                <button onClick={() => { setRejecting(false); setNotes(''); }} className="btn-secondary flex-1 justify-center">Cancel</button>
                <button
                  onClick={() => {
                    if (!notes.trim()) return toast.error('Rejection reason is required');
                    onReject(request._id, notes);
                    setRejecting(false);
                    setNotes('');
                  }}
                  disabled={isMutating}
                  className="btn-danger flex-1 justify-center"
                >
                  Send Rejection
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {request.status !== 'pending' && (
        <div className={clsx('text-xs rounded-lg px-3 py-2 border',
          request.status === 'approved'
            ? 'text-green-700 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
            : 'text-red-700 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800')}
        >
          {request.status === 'approved' ? 'Approved' : 'Rejected'} by {request.reviewedBy?.firstName || 'Unknown'}
          {request.reviewNotes ? ` — ${request.reviewNotes}` : ''}
        </div>
      )}
    </div>
  );
}

export default function SocialApprovals() {
  const [tab, setTab] = useState('pending');
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['social-approvals', tab],
    queryFn: () => api.get('/social-approvals', { params: { status: tab, limit: 100 } }).then((r) => r.data.data || []),
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, reviewNotes }) => api.post(`/social-approvals/${id}/approve`, { reviewNotes }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['social-approvals'] }); toast.success('Approved'); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to approve'),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reviewNotes }) => api.post(`/social-approvals/${id}/reject`, { reviewNotes }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['social-approvals'] }); toast.success('Rejected'); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to reject'),
  });

  const isMutating = approveMutation.isPending || rejectMutation.isPending;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="page-header">
        <h1 className="page-title">Social Media Approvals</h1>
        <p className="text-sm text-gray-500 mt-1">Posts submitted by the social automation system, awaiting review.</p>
      </div>

      <div className="flex gap-1 border-b border-gray-200 dark:border-[#1b2e4a]">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx('px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
              tab === t.key ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-sm text-gray-400">Loading...</p>}

      {!isLoading && (!data || data.length === 0) && (
        <div className="empty-state">
          <PhotoIcon className="w-10 h-10 text-gray-300 mb-2" />
          <p className="text-sm text-gray-500">No {tab} requests.</p>
        </div>
      )}

      <div className="space-y-4">
        {data?.map((request) => (
          <RequestCard
            key={request._id}
            request={request}
            isMutating={isMutating}
            onApprove={(id) => approveMutation.mutate({ id })}
            onReject={(id, reviewNotes) => rejectMutation.mutate({ id, reviewNotes })}
          />
        ))}
      </div>
    </div>
  );
}
