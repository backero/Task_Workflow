import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { CheckIcon, XMarkIcon, ArrowPathIcon, ClockIcon, ChatBubbleLeftIcon, CalendarDaysIcon } from '@heroicons/react/24/outline';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { formatDistanceToNow, format } from 'date-fns';
import { useAuthStore } from '../../store/useAuthStore';
import { clsx } from 'clsx';

const PRIORITY_COLORS = { critical: 'badge-red', urgent: 'badge-red', high: 'badge-orange', medium: 'badge-yellow', low: 'badge-gray' };

function ApprovalModal({ approval, onApprove, onReject, onClose }) {
  const [notes, setNotes] = useState('');
  const [action, setAction] = useState(null);

  const { data: taskDetail } = useQuery({
    queryKey: ['task-detail-approval', approval.taskId?._id],
    queryFn: () => api.get(`/tasks/${approval.taskId?._id}`).then((r) => r.data.task),
    enabled: !!approval.taskId?._id,
  });

  const dailyUpdates = (taskDetail?.comments || []).filter((c) => c.type === 'daily_update');

  const handleAction = () => {
    if (!action) return;
    if (action === 'reject' && !notes.trim()) return toast.error('Rejection reason is required');
    if (action === 'approve') onApprove(approval._id, notes);
    if (action === 'reject') onReject(approval._id, notes);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative card w-full max-w-xl shadow-modal max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-gray-200 dark:border-[#1b2e4a]">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Review Task Completion</h3>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">{approval.taskId?.title}</p>
            {approval.taskId?.description && (
              <p className="text-xs text-gray-500 mt-1">{approval.taskId?.description}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-gray-500">Requested by</span>
              <p className="font-medium">{approval.requestedBy?.firstName} {approval.requestedBy?.lastName}</p>
            </div>
            <div>
              <span className="text-gray-500">Department</span>
              <p className="font-medium">{approval.taskId?.department}</p>
            </div>
            <div>
              <span className="text-gray-500">Progress</span>
              <p className="font-medium">{approval.taskId?.progress || 0}%</p>
            </div>
            {approval.round > 1 && (
              <div>
                <span className="text-gray-500">Submission Round</span>
                <p className="font-medium text-orange-600">#{approval.round} (resubmitted)</p>
              </div>
            )}
          </div>

          {approval.requestNotes && (
            <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800">
              <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 mb-1">Employee's completion notes</p>
              <p className="text-sm text-gray-900 dark:text-white">{approval.requestNotes}</p>
            </div>
          )}

          {/* Daily updates history */}
          {dailyUpdates.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                <ChatBubbleLeftIcon className="w-3.5 h-3.5" />
                Daily Work Log ({dailyUpdates.length} updates)
              </p>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {dailyUpdates.map((upd, i) => (
                  <div key={upd._id || i} className="p-2.5 bg-gray-50 dark:bg-[#0f1a2e] rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        {upd.author?.firstName} {upd.author?.lastName}
                      </span>
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        {upd.hoursWorked > 0 && <span className="flex items-center gap-0.5"><ClockIcon className="w-3 h-3" />{upd.hoursWorked}h</span>}
                        {upd.progress !== undefined && <span className="text-brand-600 font-medium">{upd.progress}%</span>}
                        <span>{upd.createdAt ? formatDistanceToNow(new Date(upd.createdAt), { addSuffix: true }) : ''}</span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400">{upd.content}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="label">
              Review Notes {action === 'reject' && <span className="text-red-500">*</span>}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="input resize-none"
              placeholder={action === 'reject' ? 'Explain what needs to be corrected...' : 'Optional approval notes...'}
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setAction('reject')}
              className={clsx('flex-1 py-2 rounded-lg text-sm font-medium border-2 transition-colors', action === 'reject' ? 'bg-red-600 text-white border-red-600' : 'border-red-300 text-red-600 hover:bg-red-50')}
            >
              <XMarkIcon className="w-4 h-4 inline mr-1" />Reject
            </button>
            <button
              onClick={() => setAction('approve')}
              className={clsx('flex-1 py-2 rounded-lg text-sm font-medium border-2 transition-colors', action === 'approve' ? 'bg-green-600 text-white border-green-600' : 'border-green-300 text-green-600 hover:bg-green-50')}
            >
              <CheckIcon className="w-4 h-4 inline mr-1" />Approve
            </button>
          </div>

          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button onClick={handleAction} disabled={!action} className="btn-primary flex-1 justify-center">Confirm</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RejectPrompt({ onConfirm, onCancel }) {
  const [notes, setNotes] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative card w-full max-w-sm shadow-modal p-6 space-y-4">
        <h3 className="font-bold text-gray-900 dark:text-white">Reject &amp; Send Feedback</h3>
        <p className="text-sm text-gray-500">Provide a reason so the employee knows what to fix.</p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="input resize-none"
          placeholder="What needs to be corrected or improved?"
          autoFocus
        />
        <div className="flex gap-3">
          <button onClick={onCancel} className="btn-secondary flex-1 justify-center">Cancel</button>
          <button
            onClick={() => { if (!notes.trim()) return toast.error('Reason is required'); onConfirm(notes); }}
            className="btn-danger flex-1 justify-center"
          >
            Send Back
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ApprovalQueue() {
  const [selected, setSelected] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [activeTab, setActiveTab] = useState('completions');
  const { isManagerOrAbove } = useAuthStore();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['approvals'],
    queryFn: () => api.get('/approvals').then((r) => r.data),
    refetchInterval: 5 * 60 * 1000,
  });

  const { data: statsData } = useQuery({
    queryKey: ['approvals', 'stats'],
    queryFn: () => api.get('/approvals/stats').then((r) => r.data.stats),
  });

  const { data: extData, isLoading: extLoading } = useQuery({
    queryKey: ['extension-requests'],
    queryFn: () => api.get('/tasks/extension-requests').then((r) => r.data),
    refetchInterval: 5 * 60 * 1000,
    enabled: isManagerOrAbove(),
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, notes }) => api.post(`/approvals/${id}/approve`, { reviewNotes: notes }),
    onSuccess: () => { toast.success('Task approved!'); qc.invalidateQueries({ queryKey: ['approvals'] }); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, notes }) => api.post(`/approvals/${id}/reject`, { reviewNotes: notes }),
    onSuccess: () => { toast.success('Task returned with feedback'); qc.invalidateQueries({ queryKey: ['approvals'] }); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const reviewExtensionMutation = useMutation({
    mutationFn: ({ taskId, reqId, status }) => api.patch(`/tasks/${taskId}/extension-request/${reqId}`, { status }),
    onSuccess: (_, vars) => {
      toast.success(`Extension request ${vars.status}`);
      qc.invalidateQueries({ queryKey: ['extension-requests'] });
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const handleRejectConfirm = (notes) => {
    if (!rejectTarget) return;
    rejectMutation.mutate({ id: rejectTarget, notes });
    setRejectTarget(null);
  };

  const approvals = data?.data || [];
  const extensionTasks = extData?.tasks || [];
  const totalExtensions = extensionTasks.reduce((n, t) => n + t.extensionRequests.length, 0);

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Approval Queue</h1>
          <p className="text-gray-500 text-sm">{approvals.length} completions · {totalExtensions} extensions pending</p>
        </div>
      </div>

      {/* Stats */}
      {statsData && (
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Pending', value: statsData.pending, color: 'orange' },
            { label: 'Approved', value: statsData.approved, color: 'green' },
            { label: 'Rejected', value: statsData.rejected, color: 'red' },
            { label: 'My Requests', value: statsData.myRequests, color: 'blue' },
          ].map((s) => (
            <div key={s.label} className="card p-4 text-center">
              <p className={`text-2xl font-bold text-${s.color}-600`}>{s.value}</p>
              <p className="text-sm text-gray-500">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-[#1b2e4a]">
        {[
          { key: 'completions', label: 'Completion Requests', count: approvals.length },
          { key: 'extensions',  label: 'Extension Requests',  count: totalExtensions },
        ].map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={clsx(
              'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2',
              activeTab === key
                ? 'border-brand-600 text-brand-600 dark:text-brand-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            )}
          >
            {label}
            {count > 0 && (
              <span className={clsx(
                'text-xs px-1.5 py-0.5 rounded-full',
                activeTab === key ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-500'
              )}>{count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Completion approvals ── */}
      {activeTab === 'completions' && (
        isLoading ? (
          <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : approvals.length === 0 ? (
          <div className="card p-12 text-center">
            <CheckIcon className="w-12 h-12 text-green-400 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">All clear!</h3>
            <p className="text-gray-500 text-sm mt-1">No pending approvals</p>
          </div>
        ) : (
          <div className="space-y-3">
            {approvals.map((approval) => (
              <motion.div
                key={approval._id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="card p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`badge ${PRIORITY_COLORS[approval.taskId?.priority]}`}>{approval.taskId?.priority}</span>
                      <span className="badge badge-purple">Approval Pending</span>
                      <span className="text-xs text-gray-400">{approval.taskId?.department}</span>
                      {approval.round > 1 && (
                        <span className="text-xs text-orange-600 font-semibold">Round #{approval.round}</span>
                      )}
                    </div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">{approval.taskId?.title}</h3>
                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                      <span>By: <strong className="text-gray-700 dark:text-gray-300">{approval.requestedBy?.firstName} {approval.requestedBy?.lastName}</strong></span>
                      <span className="flex items-center gap-1">
                        <ClockIcon className="w-3.5 h-3.5" />
                        {formatDistanceToNow(new Date(approval.requestedAt), { addSuffix: true })}
                      </span>
                    </div>
                    {approval.requestNotes && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 italic line-clamp-2">"{approval.requestNotes}"</p>
                    )}
                  </div>
                  {isManagerOrAbove() && (
                    <div className="flex gap-2 flex-shrink-0">
                      <button onClick={() => setRejectTarget(approval._id)} className="btn-danger text-xs px-3 py-1.5">
                        <XMarkIcon className="w-3.5 h-3.5" /> Reject
                      </button>
                      <button onClick={() => setSelected(approval)} className="btn-secondary text-xs px-3 py-1.5">
                        Review
                      </button>
                      <button
                        onClick={() => approveMutation.mutate({ id: approval._id, notes: '' })}
                        className="btn-primary text-xs px-3 py-1.5 bg-green-600 hover:bg-green-700"
                      >
                        <CheckIcon className="w-3.5 h-3.5" /> Approve
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )
      )}

      {/* ── Extension requests ── */}
      {activeTab === 'extensions' && (
        extLoading ? (
          <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : extensionTasks.length === 0 ? (
          <div className="card p-12 text-center">
            <CalendarDaysIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">No pending extensions</h3>
            <p className="text-gray-500 text-sm mt-1">No team members have requested deadline extensions</p>
          </div>
        ) : (
          <div className="space-y-3">
            {extensionTasks.map((task) =>
              task.extensionRequests.map((ext) => (
                <motion.div
                  key={ext._id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="card p-5 hover:shadow-md transition-shadow border-l-4 border-l-orange-400"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`badge ${PRIORITY_COLORS[task.priority]}`}>{task.priority}</span>
                        <span className="badge badge-orange">Extension Requested</span>
                        <span className="text-xs text-gray-400">{task.department}</span>
                      </div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">{task.title}</h3>
                      <div className="flex items-center gap-4 mt-2 text-sm text-gray-500 flex-wrap">
                        <span>By: <strong className="text-gray-700 dark:text-gray-300">
                          {(ext.requestedBy?.firstName || task.assignedTo?.firstName)} {(ext.requestedBy?.lastName || task.assignedTo?.lastName)}
                        </strong></span>
                        {task.dueDate && (
                          <span className="flex items-center gap-1 text-red-500">
                            <ClockIcon className="w-3.5 h-3.5" />
                            Current: {format(new Date(task.dueDate), 'dd MMM yyyy')}
                          </span>
                        )}
                        {ext.requestedDueDate && (
                          <span className="flex items-center gap-1 text-green-600">
                            <CalendarDaysIcon className="w-3.5 h-3.5" />
                            Requested: {format(new Date(ext.requestedDueDate), 'dd MMM yyyy')}
                          </span>
                        )}
                      </div>
                      {ext.reason && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 italic">"{ext.reason}"</p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">
                        Requested {ext.requestedAt ? formatDistanceToNow(new Date(ext.requestedAt), { addSuffix: true }) : ''}
                      </p>
                    </div>
                    {isManagerOrAbove() && (
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => reviewExtensionMutation.mutate({ taskId: task._id, reqId: ext._id, status: 'rejected' })}
                          disabled={reviewExtensionMutation.isPending}
                          className="btn-danger text-xs px-3 py-1.5"
                        >
                          <XMarkIcon className="w-3.5 h-3.5" /> Reject
                        </button>
                        <button
                          onClick={() => reviewExtensionMutation.mutate({ taskId: task._id, reqId: ext._id, status: 'approved' })}
                          disabled={reviewExtensionMutation.isPending}
                          className="btn-primary text-xs px-3 py-1.5 bg-green-600 hover:bg-green-700"
                        >
                          <CheckIcon className="w-3.5 h-3.5" /> Approve
                        </button>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))
            )}
          </div>
        )
      )}

      {selected && (
        <ApprovalModal
          approval={selected}
          onApprove={(id, notes) => approveMutation.mutate({ id, notes })}
          onReject={(id, notes) => rejectMutation.mutate({ id, notes })}
          onClose={() => setSelected(null)}
        />
      )}

      {rejectTarget && (
        <RejectPrompt
          onConfirm={handleRejectConfirm}
          onCancel={() => setRejectTarget(null)}
        />
      )}
    </div>
  );
}
