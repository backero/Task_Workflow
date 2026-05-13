import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FunnelIcon, ExclamationTriangleIcon, XMarkIcon, PaperAirplaneIcon,
  CheckCircleIcon, ClockIcon, ArrowPathIcon, ChatBubbleLeftIcon, ArrowUturnLeftIcon, PlayIcon,
} from '@heroicons/react/24/outline';
import api from '../../api/axios';
import { useAuthStore } from '../../store/useAuthStore';
import { format, isPast, isToday, formatDistanceToNow } from 'date-fns';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';

const STATUS_COLORS = {
  'Pending': 'badge-gray', 'Assigned': 'badge-blue', 'In Progress': 'badge-yellow',
  'Under Review': 'badge-purple', 'Approval Pending': 'badge-purple',
  'Changes Requested': 'badge-red', 'Completed': 'badge-green', 'Reopened': 'badge-orange',
};
const PRIORITY_BORDER = { critical: 'border-l-red-500', high: 'border-l-orange-400', medium: 'border-l-yellow-400', low: 'border-l-gray-300', urgent: 'border-l-red-400' };
const PRIORITY_TEXT   = { critical: 'text-red-600', high: 'text-orange-500', medium: 'text-yellow-600', low: 'text-gray-400', urgent: 'text-red-500' };

// ── Task Detail Drawer ────────────────────────────────────────────────────────

function TaskDrawer({ task: initialTask, onClose, onUpdated }) {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const bottomRef = useRef();
  const [updateText, setUpdateText] = useState('');
  const [progress, setProgress] = useState(initialTask.progress || 0);
  const [hours, setHours] = useState('');
  const [showCompletion, setShowCompletion] = useState(false);
  const [completionNotes, setCompletionNotes] = useState('');

  const { data: taskData } = useQuery({
    queryKey: ['task-detail', initialTask._id],
    queryFn: () => api.get(`/tasks/${initialTask._id}`).then((r) => r.data.task),
    refetchInterval: 15000,
  });
  const task = taskData || initialTask;

  const { data: approvalsData } = useQuery({
    queryKey: ['task-approvals', initialTask._id],
    queryFn: () => api.get(`/tasks/${initialTask._id}/approvals`).then((r) => r.data.approvals),
    enabled: ['Changes Requested', 'Approval Pending', 'Completed'].includes(task.status),
  });

  const lastRejection = approvalsData?.find((a) => a.status === 'rejected' || a.status === 'changes_requested');
  const pendingApproval = approvalsData?.find((a) => a.status === 'pending');

  const updates = (task.comments || []).filter((c) => c.type === 'daily_update');
  const canAct = ['Assigned', 'In Progress', 'Changes Requested', 'Reopened'].includes(task.status);

  useEffect(() => {
    setProgress(task.progress || 0);
  }, [task.progress]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [updates.length]);

  const startMutation = useMutation({
    mutationFn: () => api.post(`/tasks/${task._id}/start`),
    onSuccess: () => {
      toast.success('Task started — moved to In Progress');
      qc.invalidateQueries({ queryKey: ['task-detail', task._id] });
      qc.invalidateQueries({ queryKey: ['tasks', 'my'] });
      if (onUpdated) onUpdated();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const dailyMutation = useMutation({
    mutationFn: (payload) => api.post(`/tasks/${task._id}/daily-update`, payload),
    onSuccess: (res) => {
      setProgress(res.data.task?.progress ?? progress);
      setUpdateText('');
      setHours('');
      qc.invalidateQueries({ queryKey: ['task-detail', task._id] });
      qc.invalidateQueries({ queryKey: ['tasks', 'my'] });
      toast.success('Update posted!');
      if (onUpdated) onUpdated();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const completionMutation = useMutation({
    mutationFn: (notes) => api.post(`/tasks/${task._id}/request-completion`, { notes }),
    onSuccess: () => {
      toast.success('Submitted for review!');
      qc.invalidateQueries({ queryKey: ['tasks', 'my'] });
      setShowCompletion(false);
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const handlePostUpdate = () => {
    if (!updateText.trim()) return toast.error('Please write what you did today');
    dailyMutation.mutate({ content: updateText, progress, hoursWorked: hours ? Number(hours) : undefined });
  };

  const dueDate = task.dueDate ? new Date(task.dueDate) : null;
  const isOverdue = dueDate && isPast(dueDate) && task.status !== 'Completed';

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <motion.div
        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="relative w-full max-w-lg bg-white dark:bg-gray-900 flex flex-col h-full shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-gray-100 dark:border-gray-800">
          <div className="flex-1 min-w-0 pr-3">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={`badge ${STATUS_COLORS[task.status] || 'badge-gray'}`}>{task.status}</span>
              <span className={`text-xs font-bold ${PRIORITY_TEXT[task.priority]}`}>{task.priority?.toUpperCase()}</span>
              <span className="text-xs text-gray-400">{task.department}</span>
            </div>
            <h2 className="font-bold text-gray-900 dark:text-white text-base leading-snug">{task.title}</h2>
            <p className="text-xs text-gray-500 mt-1">
              Assigned by {task.assignedBy?.firstName} {task.assignedBy?.lastName}
              {dueDate && (
                <span className={clsx('ml-2', isOverdue ? 'text-red-500 font-semibold' : 'text-gray-400')}>
                  · {isOverdue ? 'Overdue' : 'Due'} {format(dueDate, 'dd MMM')}
                </span>
              )}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 flex-shrink-0">
            <XMarkIcon className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3">
          <div className="flex-1 h-2.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <div className="h-full bg-brand-500 rounded-full transition-all duration-500" style={{ width: `${task.progress || 0}%` }} />
          </div>
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 w-10 text-right">{task.progress || 0}%</span>
          {task.actualHours > 0 && (
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <ClockIcon className="w-3.5 h-3.5" />{task.actualHours}h
            </span>
          )}
        </div>

        {/* Description */}
        {task.description && (
          <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800">
            <p className="text-sm text-gray-600 dark:text-gray-400">{task.description}</p>
          </div>
        )}

        {/* Rejection feedback banner */}
        {task.status === 'Changes Requested' && lastRejection?.reviewNotes && (
          <div className="mx-5 mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
            <div className="flex items-start gap-2">
              <ArrowUturnLeftIcon className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-red-700 dark:text-red-400 mb-0.5">
                  Returned by {lastRejection.reviewedBy?.firstName} {lastRejection.reviewedBy?.lastName}
                  {task.rejectionCount > 1 && <span className="ml-1 text-red-500">(Round #{task.rejectionCount})</span>}
                </p>
                <p className="text-sm text-red-800 dark:text-red-300">{lastRejection.reviewNotes}</p>
              </div>
            </div>
          </div>
        )}

        {/* Work log */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {updates.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <ChatBubbleLeftIcon className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No updates yet — post your first daily update below</p>
            </div>
          ) : (
            updates.map((upd, i) => (
              <div key={upd._id || i} className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-brand-700 dark:text-brand-400 text-xs font-bold">
                    {upd.author?.firstName?.[0]}{upd.author?.lastName?.[0]}
                  </span>
                </div>
                <div className="flex-1 bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                      {upd.author?.firstName} {upd.author?.lastName}
                    </span>
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      {upd.hoursWorked > 0 && <span className="flex items-center gap-0.5"><ClockIcon className="w-3 h-3" />{upd.hoursWorked}h</span>}
                      {upd.progress !== undefined && <span className="text-brand-600 font-medium">{upd.progress}%</span>}
                      <span>{upd.createdAt ? formatDistanceToNow(new Date(upd.createdAt), { addSuffix: true }) : ''}</span>
                    </div>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{upd.content}</p>
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        {/* Action bar */}
        {task.status === 'Completed' ? (
          <div className="p-5 border-t border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2 justify-center text-green-600">
              <CheckCircleIcon className="w-5 h-5" />
              <span className="font-semibold">Task Completed</span>
            </div>
          </div>
        ) : task.status === 'Approval Pending' ? (
          <div className="p-5 border-t border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2 justify-center text-purple-600">
              <ArrowPathIcon className="w-4 h-4 animate-spin" />
              <span className="text-sm font-medium">Waiting for manager approval…</span>
            </div>
          </div>
        ) : canAct ? (
          <div className="border-t border-gray-100 dark:border-gray-800">
            {/* Start Working — shown when task is still in Assigned state */}
            {task.status === 'Assigned' && (
              <div className="p-4 border-b border-gray-100 dark:border-gray-800 bg-blue-50 dark:bg-blue-900/20">
                <p className="text-sm font-medium text-blue-900 dark:text-blue-300 mb-3">Ready to start? Click below to begin working.</p>
                <button
                  onClick={() => startMutation.mutate()}
                  disabled={startMutation.isPending}
                  className="btn-primary flex items-center gap-2"
                >
                  <PlayIcon className="w-4 h-4" />
                  {startMutation.isPending ? 'Starting…' : 'Start Working'}
                </button>
              </div>
            )}
            {/* Daily update form */}
            <div className="p-4 space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Post Today's Update</p>
              <textarea
                value={updateText}
                onChange={(e) => setUpdateText(e.target.value)}
                rows={2}
                className="input resize-none text-sm"
                placeholder="What did you work on today? Any blockers?"
              />
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Progress</span>
                    <span className="font-semibold text-brand-600">{progress}%</span>
                  </div>
                  <input
                    type="range" min="0" max="100" step="5" value={progress}
                    onChange={(e) => setProgress(Number(e.target.value))}
                    className="w-full accent-brand-600"
                  />
                </div>
                <div className="w-20">
                  <p className="text-xs text-gray-500 mb-1">Hours</p>
                  <input
                    type="number" min="0" max="24" step="0.5" value={hours}
                    onChange={(e) => setHours(e.target.value)}
                    className="input text-sm py-1.5"
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handlePostUpdate}
                  disabled={dailyMutation.isPending || !updateText.trim()}
                  className="btn-primary flex-1 justify-center py-2 gap-2 disabled:opacity-50"
                >
                  <PaperAirplaneIcon className="w-4 h-4" />
                  {dailyMutation.isPending ? 'Posting...' : 'Post Update'}
                </button>
                {progress === 100 && !pendingApproval && (
                  <button
                    onClick={() => setShowCompletion(true)}
                    className="btn-primary justify-center px-4 py-2 bg-green-600 hover:bg-green-700 gap-1.5"
                  >
                    <CheckCircleIcon className="w-4 h-4" />
                    Request Completion
                  </button>
                )}
              </div>
              {progress < 100 && canAct && !pendingApproval && (
                <button
                  onClick={() => setShowCompletion(true)}
                  className="w-full text-center text-xs text-gray-400 hover:text-green-600 py-1 transition-colors"
                >
                  Done with the task? → Request Completion
                </button>
              )}
            </div>
          </div>
        ) : null}
      </motion.div>

      {/* Completion modal */}
      <AnimatePresence>
        {showCompletion && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-10 flex items-center justify-center p-4"
          >
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-modal w-full max-w-sm p-6 space-y-4 relative z-20">
              <h3 className="font-bold text-gray-900 dark:text-white">
                Request Task Completion
                {task.rejectionCount > 0 && (
                  <span className="ml-2 text-sm font-normal text-orange-600">(Resubmission #{task.rejectionCount + 1})</span>
                )}
              </h3>
              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{task.title}</p>
              </div>
              {task.status === 'Changes Requested' && lastRejection?.reviewNotes && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                  <p className="text-xs font-semibold text-red-600 mb-0.5">Previous feedback to address:</p>
                  <p className="text-xs text-red-700 dark:text-red-300">{lastRejection.reviewNotes}</p>
                </div>
              )}
              <div>
                <label className="label">Summary of completed work</label>
                <textarea
                  value={completionNotes}
                  onChange={(e) => setCompletionNotes(e.target.value)}
                  rows={3} className="input resize-none"
                  placeholder="Describe what you completed, any attachments or proof of work..."
                />
              </div>
              <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg text-xs text-yellow-800 dark:text-yellow-300">
                Your manager will review this and mark it complete or send it back with feedback.
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowCompletion(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
                <button
                  onClick={() => completionMutation.mutate(completionNotes)}
                  disabled={completionMutation.isPending}
                  className="btn-primary flex-1 justify-center bg-green-600 hover:bg-green-700"
                >
                  {completionMutation.isPending ? 'Submitting...' : 'Submit for Review'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function MyTasks() {
  const [filter, setFilter] = useState('active');
  const [openTask, setOpenTask] = useState(null);
  const { user } = useAuthStore();
  const qc = useQueryClient();

  const params = {
    assignedTo: user._id,
    limit: 50,
    ...(filter === 'active'    ? { status: 'Assigned,In Progress,Changes Requested,Reopened' } : {}),
    ...(filter === 'pending'   ? { status: 'Approval Pending' } : {}),
    ...(filter === 'completed' ? { status: 'Completed' } : {}),
    ...(filter === 'overdue'   ? { isOverdue: 'true' } : {}),
  };

  const { data, isLoading } = useQuery({
    queryKey: ['tasks', 'my', filter],
    queryFn: () => api.get('/tasks', { params }).then((r) => r.data),
    refetchInterval: 30000,
  });

  const tasks = data?.data || [];

  const FILTERS = [
    { key: 'active',    label: 'Active' },
    { key: 'pending',   label: 'Pending Approval' },
    { key: 'overdue',   label: 'Overdue' },
    { key: 'completed', label: 'Completed' },
    { key: 'all',       label: 'All' },
  ];

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">My Tasks</h1>
          <p className="text-gray-500 text-sm">{tasks.length} tasks</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={clsx('px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              filter === f.key
                ? 'bg-brand-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-50'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : tasks.length === 0 ? (
        <div className="card p-12 text-center text-gray-400">
          <FunnelIcon className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p>No tasks in this filter</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => {
            const dueDate  = task.dueDate ? new Date(task.dueDate) : null;
            const isOverdue = dueDate && isPast(dueDate) && task.status !== 'Completed';
            const isDueToday = dueDate && isToday(dueDate);
            const lastUpdate = task.comments?.filter((c) => c.type === 'daily_update').slice(-1)[0];

            return (
              <motion.div
                key={task._id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => setOpenTask(task)}
                className={clsx(
                  'card p-4 cursor-pointer border-l-4 hover:shadow-md transition-shadow',
                  PRIORITY_BORDER[task.priority] || 'border-l-gray-200'
                )}
              >
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`badge ${STATUS_COLORS[task.status] || 'badge-gray'}`}>{task.status}</span>
                      <span className={`text-xs font-bold ${PRIORITY_TEXT[task.priority]}`}>{task.priority?.toUpperCase()}</span>
                      <span className="text-xs text-gray-400">{task.department}</span>
                    </div>
                    <h3 className="font-semibold text-gray-900 dark:text-white text-sm leading-snug">{task.title}</h3>

                    {/* Last update preview */}
                    {lastUpdate ? (
                      <p className="text-xs text-gray-500 mt-1 line-clamp-1 italic">
                        Last update: "{lastUpdate.content}"
                      </p>
                    ) : (
                      <p className="text-xs text-orange-500 mt-1">No updates posted yet</p>
                    )}

                    <div className="flex items-center gap-4 mt-2">
                      {dueDate && (
                        <span className={clsx('text-xs font-medium', isOverdue ? 'text-red-600' : isDueToday ? 'text-orange-500' : 'text-gray-400')}>
                          {isOverdue && <ExclamationTriangleIcon className="w-3 h-3 inline mr-0.5" />}
                          {isOverdue ? 'Overdue · ' : isDueToday ? 'Due Today · ' : 'Due '}{format(dueDate, 'dd MMM')}
                        </span>
                      )}
                      {task.actualHours > 0 && (
                        <span className="text-xs text-gray-400 flex items-center gap-0.5">
                          <ClockIcon className="w-3 h-3" />{task.actualHours}h logged
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Progress ring */}
                  <div className="flex-shrink-0 flex flex-col items-center gap-1">
                    <div className="relative w-12 h-12">
                      <svg className="w-12 h-12 -rotate-90" viewBox="0 0 36 36">
                        <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="3" className="text-gray-100 dark:text-gray-700" />
                        <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="3"
                          strokeDasharray={`${(task.progress || 0) * 0.942} 94.2`}
                          strokeLinecap="round"
                          className="text-brand-500 transition-all duration-500"
                        />
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-gray-700 dark:text-gray-300">
                        {task.progress || 0}%
                      </span>
                    </div>
                    <span className="text-xs text-brand-600 font-medium">Update</span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {openTask && (
          <TaskDrawer
            task={openTask}
            onClose={() => setOpenTask(null)}
            onUpdated={() => { qc.invalidateQueries({ queryKey: ['tasks', 'my'] }); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
