import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PlusIcon, XMarkIcon, CheckIcon, PlayIcon, PaperAirplaneIcon,
  ArrowPathIcon, ChatBubbleLeftEllipsisIcon, ClockIcon, UserIcon,
  ExclamationTriangleIcon, CalendarIcon,
} from '@heroicons/react/24/outline';
import api from '../../api/axios';
import { useAuthStore } from '../../store/useAuthStore';
import { clsx } from 'clsx';
import { format, isPast, isToday, formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import TaskForm from './TaskForm';

const COLUMNS = [
  { key: 'Pending',          label: 'Pending',          color: 'bg-gray-100 dark:bg-[#0f1a2e]',         dot: 'bg-gray-400'   },
  { key: 'Assigned',         label: 'Assigned',          color: 'bg-blue-50 dark:bg-blue-900/20',       dot: 'bg-blue-500'   },
  { key: 'In Progress',      label: 'In Progress',       color: 'bg-yellow-50 dark:bg-yellow-900/20',   dot: 'bg-yellow-500' },
  { key: 'Approval Pending', label: 'Under Review',      color: 'bg-orange-50 dark:bg-orange-900/20',   dot: 'bg-orange-500' },
  { key: 'Completed',        label: 'Completed',         color: 'bg-green-50 dark:bg-green-900/20',     dot: 'bg-green-500'  },
];

const PRIORITY_BORDER = {
  critical: 'border-l-red-500',
  urgent:   'border-l-red-400',
  high:     'border-l-orange-500',
  medium:   'border-l-yellow-400',
  low:      'border-l-gray-300',
};

const PRIORITY_BADGE = {
  critical: 'bg-red-100 text-red-700',
  urgent:   'bg-red-50 text-red-600',
  high:     'bg-orange-100 text-orange-700',
  medium:   'bg-yellow-100 text-yellow-700',
  low:      'bg-gray-100 text-gray-500',
};

const DEPARTMENTS = ['Marketing', 'Marketplace', 'Sales', 'Production', 'R&D', 'Operations', 'Accounts & Finance'];

// ─────────────────────────────────────────────────────────────────────────────
// Task Detail Modal
// ─────────────────────────────────────────────────────────────────────────────
function TaskDetailModal({ taskId, onClose }) {
  const { user, isManagerOrAbove, ROLE_LEVEL } = useAuthStore();
  const qc = useQueryClient();
  const [updateText, setUpdateText] = useState('');
  const [progress, setProgress] = useState('');
  const [approvalNotes, setApprovalNotes] = useState('');
  const [showRejectBox, setShowRejectBox] = useState(false);
  const [activeTab, setActiveTab] = useState('updates'); // 'updates' | 'activity'

  const { data, isLoading } = useQuery({
    queryKey: ['task-detail', taskId],
    queryFn: () => api.get(`/tasks/${taskId}`).then((r) => r.data.task),
    enabled: !!taskId,
    staleTime: 10_000,
  });

  const task = data;

  // Fetch pending approval if status is Approval Pending
  const { data: approvalsData } = useQuery({
    queryKey: ['task-approvals', taskId],
    queryFn: () => api.get(`/tasks/${taskId}/approvals`).then((r) => r.data.approvals),
    enabled: !!taskId && task?.status === 'Approval Pending',
  });
  const pendingApproval = (approvalsData || []).find((a) => a.status === 'pending');

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['task-detail', taskId] });
    qc.invalidateQueries({ queryKey: ['tasks'] });
    qc.invalidateQueries({ queryKey: ['task-approvals', taskId] });
  };

  const startMutation = useMutation({
    mutationFn: () => api.post(`/tasks/${taskId}/start`),
    onSuccess: () => { toast.success('Task started — moved to In Progress'); invalidate(); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ content, progress: p }) =>
      api.post(`/tasks/${taskId}/daily-update`, { content, progress: p || undefined }),
    onSuccess: () => {
      toast.success('Update posted');
      setUpdateText('');
      setProgress('');
      invalidate();
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const requestCompletionMutation = useMutation({
    mutationFn: () => api.post(`/tasks/${taskId}/request-completion`, { notes: updateText || 'Requesting approval' }),
    onSuccess: () => {
      toast.success('Completion request submitted — waiting for manager review');
      setUpdateText('');
      invalidate();
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const approveMutation = useMutation({
    mutationFn: ({ approvalId, notes }) => api.post(`/approvals/${approvalId}/approve`, { reviewNotes: notes }),
    onSuccess: () => { toast.success('Task approved and marked Completed!'); invalidate(); },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ approvalId, notes }) => api.post(`/approvals/${approvalId}/reject`, { reviewNotes: notes }),
    onSuccess: () => {
      toast.success('Changes requested — task moved back to In Progress');
      setShowRejectBox(false);
      setApprovalNotes('');
      invalidate();
    },
    onError: (e) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const isAssignee = task?.assignedTo?._id === user?._id;
  const userLevel = { super_admin: 7, chairman: 6, founder: 5, admin: 4, manager: 3, team_lead: 2, member: 1 }[user?.role] || 1;
  // managers can only manage tasks in their own dept; admin+ can manage all
  const canManage = isManagerOrAbove() && (userLevel >= 4 || !user?.department || task?.department === user?.department);

  const dueDate = task?.dueDate ? new Date(task.dueDate) : null;
  const isOverdue = dueDate && isPast(dueDate) && task.status !== 'Completed';
  const isDueToday = dueDate && isToday(dueDate);

  const dailyUpdates = (task?.comments || []).filter((c) => c.type === 'daily_update');
  const activityLog = task?.activity || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative card w-full max-w-2xl shadow-modal max-h-[92vh] flex flex-col">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-3 p-5 border-b border-gray-200 dark:border-[#1b2e4a]">
          <div className="flex-1 min-w-0">
            {isLoading ? (
              <div className="h-5 w-48 bg-gray-200 dark:bg-[#132035] rounded animate-pulse" />
            ) : (
              <>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{task?.department}</span>
                  <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', PRIORITY_BADGE[task?.priority])}>
                    {task?.priority}
                  </span>
                  <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', {
                    'bg-blue-100 text-blue-700': task?.status === 'Assigned',
                    'bg-yellow-100 text-yellow-700': task?.status === 'In Progress',
                    'bg-orange-100 text-orange-700': task?.status === 'Approval Pending',
                    'bg-green-100 text-green-700': task?.status === 'Completed',
                    'bg-gray-100 text-gray-600': task?.status === 'Pending',
                  })}>
                    {task?.status}
                  </span>
                  {isOverdue && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-700 flex items-center gap-1">
                      <ExclamationTriangleIcon className="w-3 h-3" /> Overdue
                    </span>
                  )}
                </div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white leading-snug">{task?.title}</h2>
              </>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-[#17263d] flex-shrink-0">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center py-12">
            <div className="w-7 h-7 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : task ? (
          <div className="flex-1 overflow-y-auto">

            {/* ── Meta row ── */}
            <div className="px-5 py-4 grid grid-cols-2 gap-3 text-sm border-b border-gray-100 dark:border-[#1b2e4a]">
              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                <UserIcon className="w-4 h-4 flex-shrink-0" />
                <span className="text-gray-500">Assigned to:</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {task.assignedTo ? `${task.assignedTo.firstName} ${task.assignedTo.lastName}` : '—'}
                </span>
              </div>
              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                <UserIcon className="w-4 h-4 flex-shrink-0" />
                <span className="text-gray-500">By:</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {task.assignedBy ? `${task.assignedBy.firstName} ${task.assignedBy.lastName}` : '—'}
                </span>
              </div>
              {dueDate && (
                <div className={clsx('flex items-center gap-2', isOverdue ? 'text-red-600' : isDueToday ? 'text-orange-600' : 'text-gray-600 dark:text-gray-400')}>
                  <CalendarIcon className="w-4 h-4 flex-shrink-0" />
                  <span className="text-gray-500">Due:</span>
                  <span className="font-medium">{format(dueDate, 'dd MMM yyyy')}{isDueToday ? ' (Today)' : isOverdue ? ' (Overdue)' : ''}</span>
                </div>
              )}
              {task.platform && (
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                  <span className="text-gray-500">Platform:</span>
                  <span className="font-medium text-gray-900 dark:text-white">{task.platform}</span>
                </div>
              )}
            </div>

            {/* ── Description ── */}
            {task.description && (
              <div className="px-5 py-3 border-b border-gray-100 dark:border-[#1b2e4a]">
                <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{task.description}</p>
              </div>
            )}

            {/* ── Progress bar ── */}
            <div className="px-5 py-3 border-b border-gray-100 dark:border-[#1b2e4a]">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-gray-500">Progress</span>
                <span className="text-xs font-bold text-gray-900 dark:text-white">{task.progress || 0}%</span>
              </div>
              <div className="h-2 bg-gray-100 dark:bg-[#0f1a2e] rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand-500 rounded-full transition-all duration-500"
                  style={{ width: `${task.progress || 0}%` }}
                />
              </div>
            </div>

            {/* ── Status-specific action panel ── */}
            <div className="px-5 py-4 border-b border-gray-100 dark:border-[#1b2e4a]">

              {/* ASSIGNED → employee can start working */}
              {task.status === 'Assigned' && isAssignee && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-300 mb-3">
                    Ready to start this task?
                  </p>
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

              {/* IN PROGRESS → employee can post update + request completion */}
              {task.status === 'In Progress' && isAssignee && (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Post a progress update</p>
                  <textarea
                    value={updateText}
                    onChange={(e) => setUpdateText(e.target.value)}
                    placeholder="What did you work on? Any blockers?"
                    rows={3}
                    className="input w-full resize-none text-sm"
                  />
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 flex-1">
                      <label className="text-xs text-gray-500 whitespace-nowrap">Progress %</label>
                      <input
                        type="number"
                        min={0} max={100}
                        value={progress}
                        onChange={(e) => setProgress(e.target.value)}
                        placeholder={String(task.progress || 0)}
                        className="input w-20 text-sm py-1.5"
                      />
                    </div>
                    <button
                      onClick={() => updateMutation.mutate({ content: updateText, progress })}
                      disabled={!updateText.trim() || updateMutation.isPending}
                      className="btn-secondary flex items-center gap-1.5 text-sm"
                    >
                      <PaperAirplaneIcon className="w-4 h-4" />
                      {updateMutation.isPending ? 'Posting…' : 'Post Update'}
                    </button>
                    <button
                      onClick={() => requestCompletionMutation.mutate()}
                      disabled={requestCompletionMutation.isPending}
                      className="btn-primary flex items-center gap-1.5 text-sm"
                    >
                      <CheckIcon className="w-4 h-4" />
                      {requestCompletionMutation.isPending ? 'Submitting…' : 'Request Completion'}
                    </button>
                  </div>
                </div>
              )}

              {/* APPROVAL PENDING → manager can approve or request changes */}
              {task.status === 'Approval Pending' && canManage && pendingApproval && (
                <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl p-4 space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-orange-900 dark:text-orange-300">Completion requested by {task.assignedTo?.firstName}</p>
                    {pendingApproval.requestNotes && (
                      <p className="text-xs text-orange-700 dark:text-orange-400 mt-1 italic">"{pendingApproval.requestNotes}"</p>
                    )}
                  </div>

                  {showRejectBox ? (
                    <div className="space-y-2">
                      <textarea
                        value={approvalNotes}
                        onChange={(e) => setApprovalNotes(e.target.value)}
                        placeholder="Explain what changes are needed…"
                        rows={3}
                        className="input w-full resize-none text-sm"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => rejectMutation.mutate({ approvalId: pendingApproval._id, notes: approvalNotes })}
                          disabled={!approvalNotes.trim() || rejectMutation.isPending}
                          className="btn-danger flex items-center gap-1.5 text-sm"
                        >
                          <ArrowPathIcon className="w-4 h-4" />
                          {rejectMutation.isPending ? 'Sending…' : 'Request Changes'}
                        </button>
                        <button onClick={() => setShowRejectBox(false)} className="btn-secondary text-sm">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={() => approveMutation.mutate({ approvalId: pendingApproval._id, notes: '' })}
                        disabled={approveMutation.isPending}
                        className="btn-primary flex items-center gap-1.5 text-sm"
                      >
                        <CheckIcon className="w-4 h-4" />
                        {approveMutation.isPending ? 'Approving…' : 'Approve & Complete'}
                      </button>
                      <button
                        onClick={() => setShowRejectBox(true)}
                        className="btn-danger flex items-center gap-1.5 text-sm"
                      >
                        <ArrowPathIcon className="w-4 h-4" />
                        Request Changes
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* COMPLETED */}
              {task.status === 'Completed' && (
                <div className="flex items-center gap-3 text-green-700 dark:text-green-400">
                  <CheckIcon className="w-5 h-5" />
                  <span className="text-sm font-medium">
                    Completed {task.completedAt ? formatDistanceToNow(new Date(task.completedAt), { addSuffix: true }) : ''}
                  </span>
                </div>
              )}

              {/* PENDING (not yet assigned) — manager can see it's unassigned */}
              {task.status === 'Pending' && canManage && (
                <p className="text-sm text-gray-500 italic">This task is not yet assigned to anyone.</p>
              )}
            </div>

            {/* ── Tabs: Updates / Activity ── */}
            <div className="px-5 pt-4">
              <div className="flex gap-4 border-b border-gray-200 dark:border-[#1b2e4a] mb-4">
                {[['updates', 'Updates'], ['activity', 'Activity Log']].map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setActiveTab(key)}
                    className={clsx('pb-2 text-sm font-medium border-b-2 -mb-px transition-colors', activeTab === key
                      ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                    )}
                  >
                    {label} {key === 'updates' && dailyUpdates.length > 0 && <span className="ml-1 text-xs text-gray-400">({dailyUpdates.length})</span>}
                  </button>
                ))}
              </div>

              {/* Daily Updates */}
              {activeTab === 'updates' && (
                <div className="space-y-3 pb-5">
                  {dailyUpdates.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-6">No updates posted yet</p>
                  ) : (
                    [...dailyUpdates].reverse().map((upd, i) => (
                      <div key={upd._id || i} className="bg-gray-50 dark:bg-[#0f1a2e]/50 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                            {upd.author?.firstName} {upd.author?.lastName}
                          </span>
                          <div className="flex items-center gap-3">
                            {upd.progress !== undefined && (
                              <span className="text-xs text-brand-600 font-medium">{upd.progress}%</span>
                            )}
                            <span className="text-xs text-gray-400">
                              {upd.createdAt ? formatDistanceToNow(new Date(upd.createdAt), { addSuffix: true }) : ''}
                            </span>
                          </div>
                        </div>
                        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{upd.content}</p>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Activity Log */}
              {activeTab === 'activity' && (
                <div className="space-y-2 pb-5">
                  {activityLog.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-6">No activity yet</p>
                  ) : (
                    [...activityLog].reverse().map((act, i) => (
                      <div key={i} className="flex items-start gap-2.5 text-xs text-gray-500">
                        <div className="w-1.5 h-1.5 rounded-full bg-gray-300 mt-1.5 flex-shrink-0" />
                        <div>
                          <span className="text-gray-700 dark:text-gray-300 font-medium capitalize">
                            {typeof act.action === 'string' ? act.action.replace(/_/g, ' ') : act.action}
                          </span>
                          {act.performedBy && (
                            <span className="ml-1 text-gray-400">
                              by {act.performedBy.firstName} {act.performedBy.lastName}
                            </span>
                          )}
                          {act.createdAt && (
                            <span className="ml-2 text-gray-400">
                              {formatDistanceToNow(new Date(act.createdAt), { addSuffix: true })}
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center py-12 text-gray-400 text-sm">
            Task not found
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Task Card
// ─────────────────────────────────────────────────────────────────────────────
function TaskCard({ task, onClick }) {
  const dueDate = task.dueDate ? new Date(task.dueDate) : null;
  const isOverdue = dueDate && isPast(dueDate) && task.status !== 'Completed';
  const isDueToday = dueDate && isToday(dueDate);

  return (
    <div
      onClick={onClick}
      className={clsx(
        'bg-white dark:bg-[#070c17] rounded-lg border border-gray-200 dark:border-[#1b2e4a] p-3 border-l-4',
        'shadow-sm hover:shadow-md transition-all cursor-pointer hover:-translate-y-0.5 active:translate-y-0',
        PRIORITY_BORDER[task.priority] || 'border-l-gray-300'
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wide truncate">{task.department}</span>
        {task.platform && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 flex-shrink-0">{task.platform}</span>
        )}
      </div>

      <p className="text-sm font-semibold text-gray-900 dark:text-white line-clamp-2 mb-2">{task.title}</p>

      {task.progress > 0 && (
        <div className="mb-2">
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>Progress</span><span>{task.progress}%</span>
          </div>
          <div className="h-1.5 bg-gray-100 dark:bg-[#0f1a2e] rounded-full overflow-hidden">
            <div className="h-full bg-brand-500 rounded-full transition-all" style={{ width: `${task.progress}%` }} />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mt-1">
        <div className="flex items-center gap-1.5">
          {task.assignedTo && (
            <div className="w-5 h-5 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center flex-shrink-0">
              <span className="text-brand-700 dark:text-brand-400 text-xs font-semibold">
                {task.assignedTo.firstName?.[0]}
              </span>
            </div>
          )}
          {dueDate && (
            <span className={clsx('text-xs', isOverdue ? 'text-red-600 font-semibold' : isDueToday ? 'text-orange-600 font-medium' : 'text-gray-400')}>
              {isOverdue ? '⚠ Overdue' : isDueToday ? 'Due Today' : format(dueDate, 'dd MMM')}
            </span>
          )}
        </div>
        <span className={clsx('text-xs font-medium px-1.5 py-0.5 rounded', PRIORITY_BADGE[task.priority])}>
          {task.priority}
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KanbanView
// ─────────────────────────────────────────────────────────────────────────────
export default function KanbanView() {
  const [showForm, setShowForm] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [department, setDepartment] = useState('');
  const { isManagerOrAbove } = useAuthStore();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['tasks', { department }],
    queryFn: () =>
      api.get('/tasks', { params: { limit: 200, department: department || undefined } }).then((r) => r.data),
  });

  const tasks = data?.data || [];
  const grouped = COLUMNS.reduce((acc, col) => {
    acc[col.key] = tasks.filter((t) => t.status === col.key);
    return acc;
  }, {});

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="page-header flex-shrink-0">
        <div>
          <h1 className="page-title">Kanban Board</h1>
          <p className="text-gray-500 text-sm">{tasks.length} tasks total</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className="input w-auto"
          >
            <option value="">All Departments</option>
            {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          {isManagerOrAbove() && (
            <button onClick={() => setShowForm(true)} className="btn-primary">
              <PlusIcon className="w-4 h-4" /> New Task
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4 flex-1 min-h-0">
          {COLUMNS.map((col) => (
            <div key={col.key} className="flex-shrink-0 w-72 flex flex-col">
              <div className={clsx('rounded-xl p-3 flex-1 flex flex-col', col.color)}>
                {/* Column header */}
                <div className="flex items-center gap-2 mb-3">
                  <div className={clsx('w-2 h-2 rounded-full flex-shrink-0', col.dot)} />
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{col.label}</h3>
                  <span className="ml-auto text-xs font-medium text-gray-500 bg-white dark:bg-[#0f1a2e] rounded-full px-2 py-0.5">
                    {grouped[col.key]?.length || 0}
                  </span>
                </div>

                {/* Cards */}
                <div className="space-y-2 flex-1 overflow-y-auto min-h-[120px]">
                  <AnimatePresence>
                    {(grouped[col.key] || []).map((task) => (
                      <motion.div
                        key={task._id}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        layout
                      >
                        <TaskCard
                          task={task}
                          onClick={() => setSelectedTaskId(task._id)}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  {(grouped[col.key] || []).length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-6">No tasks</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Task Detail Modal */}
      <AnimatePresence>
        {selectedTaskId && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <TaskDetailModal
              taskId={selectedTaskId}
              onClose={() => setSelectedTaskId(null)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* New Task Form */}
      {showForm && (
        <TaskForm
          onClose={() => setShowForm(false)}
          onSuccess={() => {
            setShowForm(false);
            qc.invalidateQueries({ queryKey: ['tasks'] });
          }}
        />
      )}
    </div>
  );
}
