import React, { useState, useEffect, useRef } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { useWorkflowStore } from '../../store/useWorkflowStore';
import { useAuthStore } from '../../store/useAuthStore';
import api from '../../api/axios';
import ConfirmDialog from '../common/ConfirmDialog';

const STATUS_COLORS = {
  'Pending':           'text-slate-700 bg-slate-100 dark:bg-[#1b2e4a] dark:text-slate-300 border-slate-300 dark:border-[#1b2e4a]',
  'Assigned':          'text-blue-700 bg-blue-100 border-blue-300',
  'In Progress':       'text-yellow-700 bg-yellow-100 border-yellow-300',
  'Under Review':      'text-purple-700 bg-purple-100 border-purple-300',
  'Changes Requested': 'text-orange-700 bg-orange-100 border-orange-300',
  'Approval Pending':  'text-indigo-700 bg-indigo-100 border-indigo-300',
  'Completed':         'text-green-700 bg-green-100 border-green-300',
  'Reopened':          'text-red-700 bg-red-100 border-red-300',
  'Cancelled':         'text-gray-600 bg-gray-100 dark:bg-[#1b2e4a] dark:text-[#6a89b5] border-gray-300 dark:border-[#1b2e4a]',
};

const PRIORITY_COLORS = {
  critical: 'text-red-600', urgent: 'text-red-500',
  high: 'text-orange-500', medium: 'text-yellow-600', low: 'text-gray-400',
};

const MANAGER_ROLES = ['super_admin', 'chairman', 'founder', 'admin', 'manager', 'team_lead'];
const ADMIN_ROLES   = ['super_admin', 'chairman', 'founder', 'admin'];
const ROLE_LEVEL    = { super_admin: 7, chairman: 6, founder: 5, admin: 4, manager: 3, team_lead: 2, member: 1 };

export default function TaskDetailPanel({ onAddSubtask }) {
  const { selectedNode, closeDetailPanel, startTask, addUpdate, requestCompletion,
          completeTask, rejectTask, reopenTask, updateProgress: storeUpdateProgress, checkCompletion, deleteTask } = useWorkflowStore();
  const { user } = useAuthStore();

  const [activeTab, setActiveTab] = useState('info');
  const [taskDetail, setTaskDetail] = useState(null);
  const [eligibility, setEligibility] = useState(null);
  const [pendingApproval, setPendingApproval] = useState(null);
  const [loading, setLoading] = useState(false);

  // Updates form state
  const [updateText, setUpdateText] = useState('');
  const [sliderProgress, setSliderProgress] = useState(0);
  const [updateHours, setUpdateHours] = useState('');

  // Actions state
  const [actionNotes, setActionNotes] = useState('');
  const [manualProgress, setManualProgress] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [renamingTitle, setRenamingTitle] = useState(false);
  const [renameVal, setRenameVal] = useState('');
  const titleInputRef = useRef(null);

  const updatesEndRef = useRef(null);

  const isManager = MANAGER_ROLES.includes(user?.role);
  const data = selectedNode?.data;
  const taskId = data?.id?.toString();

  // Fetch full task detail whenever selected node changes
  useEffect(() => {
    if (!taskId) return;
    setTaskDetail(null);
    setEligibility(null);
    setPendingApproval(null);
    setActiveTab('info');

    Promise.all([
      api.get(`/tasks/${taskId}`).then(r => {
        setTaskDetail(r.data.task || r.data.data || r.data);
        setManualProgress(r.data.task?.progress || r.data.data?.progress || 0);
        setSliderProgress(r.data.task?.progress || r.data.data?.progress || 0);
      }).catch(() => {}),
      checkCompletion(taskId).then(setEligibility).catch(() => {}),
      api.get(`/approvals?taskId=${taskId}&status=pending`).then(r => {
        setPendingApproval(r.data.data?.[0] || null);
      }).catch(() => {}),
    ]);
  }, [taskId]);

  useEffect(() => {
    if (activeTab === 'updates') {
      setTimeout(() => updatesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }, [activeTab, taskDetail?.comments?.length]);

  if (!selectedNode || !data) return null;

  const updates = (taskDetail?.comments || []).filter(c => c.type === 'daily_update');
  const hasChildren = data.childCount > 0;
  const isAssignee = taskDetail?.assignedTo?._id?.toString() === user?._id?.toString()
    || data.assignedTo?._id?.toString() === user?._id?.toString();
  const canAct = isAssignee || isManager;

  // Approval authority: only the person who assigned the task can approve/reject it.
  // For root/main tasks (no parent): any admin-level user can approve.
  const isRootTask   = !taskDetail?.parentTask;
  const isAssigner   = taskDetail?.assignedBy?._id?.toString() === user?._id?.toString();
  const userIsAdmin  = ADMIN_ROLES.includes(user?.role);
  const isApprover   = isAssigner || (isRootTask && userIsAdmin);

  // ── Action handlers ──────────────────────────────────────────────────────────

  const withLoading = async (fn) => {
    setLoading(true);
    try { await fn(); }
    finally { setLoading(false); }
  };

  const handleStart = () => withLoading(async () => {
    await startTask(taskId);
    toast.success('Task started!');
  });

  const handlePostUpdate = () => withLoading(async () => {
    if (!updateText.trim()) { toast.error('Write what you did'); return; }
    await addUpdate(taskId, {
      content: updateText.trim(),
      progress: hasChildren ? undefined : sliderProgress,
      hoursWorked: updateHours ? Number(updateHours) : undefined,
    });
    setUpdateText('');
    setUpdateHours('');
    toast.success('Update posted!');
    // Refresh task detail
    const r = await api.get(`/tasks/${taskId}`);
    setTaskDetail(r.data.task || r.data.data || r.data);
  });

  const handleSaveProgress = () => withLoading(async () => {
    await storeUpdateProgress(taskId, manualProgress);
    toast.success('Progress saved');
  });

  const handleRequestCompletion = () => withLoading(async () => {
    await requestCompletion(taskId, actionNotes);
    toast.success('Submitted for review — manager notified via WhatsApp!');
    setActionNotes('');
  });

  const handleApprove = () => withLoading(async () => {
    await completeTask(taskId, pendingApproval?._id, actionNotes);
    toast.success('Task approved! Assignee notified via WhatsApp!');
    setActionNotes('');
  });

  const handleReject = () => withLoading(async () => {
    if (!actionNotes.trim()) { toast.error('Please provide a reason'); return; }
    await rejectTask(taskId, pendingApproval?._id, actionNotes);
    toast.success('Changes requested — assignee notified via WhatsApp!');
    setActionNotes('');
  });

  const handleReopen = () => withLoading(async () => {
    await reopenTask(taskId, actionNotes || 'Task reopened');
    toast.success('Task reopened');
    setActionNotes('');
  });

  const handleDelete = async () => {
    setConfirmDelete(false);
    await withLoading(async () => {
      await deleteTask(taskId);
      closeDetailPanel();
      toast.success('Task deleted');
    });
  };

  const startRenameTitle = () => {
    setRenameVal(data.title);
    setRenamingTitle(true);
    setTimeout(() => titleInputRef.current?.select(), 30);
  };

  const commitRenameTitle = async () => {
    const val = renameVal.trim();
    setRenamingTitle(false);
    if (!val || val === data.title) return;
    try {
      await api.put(`/tasks/${taskId}`, { title: val });
      await useWorkflowStore.getState().refreshGraph();
      toast.success('Task renamed');
    } catch { toast.error('Failed to rename'); }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="absolute top-0 right-0 h-full w-[400px] bg-white dark:bg-[#0f1a2e] border-l border-gray-200 dark:border-[#1b2e4a] shadow-2xl z-20 flex flex-col overflow-hidden">

      {/* ── Header ── */}
      <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex-shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <span className={clsx('text-[11px] font-semibold px-2 py-0.5 rounded-full border', STATUS_COLORS[data.status])}>
                {data.status}
              </span>
              <span className={clsx('text-[11px] font-bold uppercase', PRIORITY_COLORS[data.priority])}>
                {data.priority}
              </span>
              {data.completionLocked && data.status !== 'Completed' && (
                <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">🔒 Locked</span>
              )}
            </div>
            {renamingTitle ? (
              <input
                ref={titleInputRef}
                value={renameVal}
                onChange={e => setRenameVal(e.target.value)}
                onBlur={commitRenameTitle}
                onKeyDown={e => { if (e.key === 'Enter') commitRenameTitle(); if (e.key === 'Escape') setRenamingTitle(false); }}
                className="w-full text-sm font-bold text-gray-900 border border-indigo-400 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
              />
            ) : (
              <div className="flex items-start gap-1.5">
                <h2 className="text-sm font-bold text-gray-900 leading-snug line-clamp-2 flex-1">{data.title}</h2>
                {isManager && (
                  <button
                    onClick={startRenameTitle}
                    title="Rename task"
                    className="flex-shrink-0 mt-0.5 p-1 rounded-lg bg-indigo-100 text-indigo-500 hover:bg-indigo-200 hover:text-indigo-700 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                )}
              </div>
            )}
            <p className="text-[11px] text-indigo-500 font-medium mt-0.5">{data.department}</p>
          </div>
          <button onClick={closeDetailPanel} className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Progress bar */}
        <div className="mt-3">
          <div className="flex justify-between mb-1">
            <span className="text-[10px] text-gray-500 font-medium">Progress</span>
            <span className="text-[11px] font-bold text-indigo-600">{data.progress}%</span>
          </div>
          <div className="w-full bg-gray-100 dark:bg-[#1b2e4a] rounded-full h-2 overflow-hidden">
            <div
              className={clsx('h-full rounded-full transition-all duration-500', data.status === 'Completed' ? 'bg-green-500' : 'bg-indigo-500')}
              style={{ width: `${data.progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex border-b border-gray-100 flex-shrink-0">
        {[
          { id: 'info', label: 'Info' },
          { id: 'updates', label: `Updates${updates.length > 0 ? ` (${updates.length})` : ''}` },
          { id: 'actions', label: 'Actions' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              'flex-1 py-2.5 text-xs font-semibold transition-colors',
              activeTab === tab.id
                ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto">

        {/* ── INFO TAB ── */}
        {activeTab === 'info' && (
          <div className="p-4 space-y-4">
            {/* Key info rows */}
            <div className="bg-gray-50 dark:bg-[#132035] rounded-xl p-3 space-y-2.5">
              {data.assignedTo && (
                <InfoRow label="Assigned to">
                  <div className="flex items-center gap-1.5">
                    <div className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center text-white text-[9px] font-bold">
                      {(data.assignedTo.firstName?.[0] || '') + (data.assignedTo.lastName?.[0] || '')}
                    </div>
                    <span className="text-xs font-medium text-gray-800">{data.assignedTo.firstName} {data.assignedTo.lastName}</span>
                  </div>
                </InfoRow>
              )}
              {data.dueDate && (
                <InfoRow label="Due date">
                  <span className={clsx('text-xs font-medium', data.isOverdue && data.status !== 'Completed' ? 'text-red-600' : 'text-gray-800')}>
                    {format(new Date(data.dueDate), 'dd MMM yyyy')}
                    {data.isOverdue && data.status !== 'Completed' && ' ⚠'}
                  </span>
                </InfoRow>
              )}
              {data.estimatedHours && (
                <InfoRow label="Hours">
                  <span className="text-xs font-medium text-gray-800">{data.actualHours || 0} / {data.estimatedHours}h logged</span>
                </InfoRow>
              )}
              <InfoRow label="Subtasks">
                <span className="text-xs font-medium text-gray-800">{data.childCount} subtask{data.childCount !== 1 ? 's' : ''}</span>
              </InfoRow>
              <InfoRow label="Depth">
                <span className="text-xs font-medium text-gray-800">Level {(data.depth || 0) + 1}</span>
              </InfoRow>
            </div>

            {/* Description */}
            {taskDetail?.description && (
              <div className="bg-blue-50 rounded-xl p-3">
                <p className="text-[11px] text-gray-500 font-semibold mb-1">Description</p>
                <p className="text-xs text-gray-700 leading-relaxed">{taskDetail.description}</p>
              </div>
            )}

            {/* Completion lock reasons */}
            {data.completionLocked && data.completionLockReasons?.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <p className="text-xs font-semibold text-amber-700 mb-1.5">🔒 Blocked because:</p>
                <ul className="space-y-1">
                  {data.completionLockReasons.map((r, i) => (
                    <li key={i} className="text-[11px] text-amber-700">• {r}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Eligibility result */}
            {eligibility && (
              <div className={clsx('rounded-xl p-3 border text-xs', eligibility.eligible ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700')}>
                <p className="font-semibold mb-1">{eligibility.eligible ? '✅ Ready for completion' : '❌ Not ready yet'}</p>
                {!eligibility.eligible && eligibility.reasons?.map((r, i) => (
                  <p key={i} className="text-[11px]">• {r}</p>
                ))}
              </div>
            )}

            {/* Add subtask button (managers only) */}
            {isManager && !['Completed', 'Cancelled'].includes(data.status) && (
              <button
                onClick={() => onAddSubtask(taskId, data.title)}
                className="w-full py-2.5 border-2 border-dashed border-indigo-300 rounded-xl text-xs font-semibold text-indigo-600 hover:bg-indigo-50 transition-colors"
              >
                + Add Subtask Here
              </button>
            )}
          </div>
        )}

        {/* ── UPDATES TAB ── */}
        {activeTab === 'updates' && (
          <div className="flex flex-col h-full">
            {/* Updates list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0" style={{ maxHeight: canAct ? '340px' : undefined }}>
              {updates.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-3xl mb-2">📝</p>
                  <p className="text-xs text-gray-400">No updates yet. Be the first to post.</p>
                </div>
              ) : (
                updates.map((u, i) => (
                  <div key={i} className="bg-gray-50 dark:bg-[#132035] rounded-xl p-3 border border-gray-100 dark:border-[#1b2e4a]">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center text-white text-[9px] font-bold">
                          {(u.author?.firstName?.[0] || '') + (u.author?.lastName?.[0] || '?')}
                        </div>
                        <span className="text-[11px] font-semibold text-gray-800">
                          {u.author?.firstName} {u.author?.lastName}
                        </span>
                      </div>
                      <span className="text-[10px] text-gray-400">
                        {u.createdAt ? formatDistanceToNow(new Date(u.createdAt), { addSuffix: true }) : ''}
                      </span>
                    </div>
                    <p className="text-xs text-gray-700 leading-relaxed">{u.content}</p>
                    {u.hoursWorked && (
                      <p className="text-[10px] text-indigo-500 mt-1 font-medium">⏱ {u.hoursWorked}h logged</p>
                    )}
                  </div>
                ))
              )}
              <div ref={updatesEndRef} />
            </div>

            {/* Post update form */}
            {canAct && !['Completed', 'Cancelled'].includes(data.status) && (
              <div className="border-t border-gray-100 dark:border-[#1b2e4a] p-4 bg-gray-50 dark:bg-[#132035] space-y-3">
                <textarea
                  value={updateText}
                  onChange={e => setUpdateText(e.target.value)}
                  rows={3}
                  placeholder="What did you work on today?"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none bg-white dark:bg-[#0f1a2e]"
                />

                {/* Progress + hours for leaf tasks */}
                {!hasChildren && (
                  <div className="flex gap-2 items-center">
                    <div className="flex-1">
                      <div className="flex justify-between mb-1">
                        <span className="text-[10px] text-gray-500">Progress</span>
                        <span className="text-[10px] font-bold text-indigo-600">{sliderProgress}%</span>
                      </div>
                      <input
                        type="range" min={0} max={100} step={5}
                        value={sliderProgress}
                        onChange={e => setSliderProgress(Number(e.target.value))}
                        className="w-full accent-indigo-600"
                      />
                    </div>
                    <div className="w-20">
                      <p className="text-[10px] text-gray-500 mb-1">Hours</p>
                      <input
                        type="number" min={0} step={0.5}
                        value={updateHours}
                        onChange={e => setUpdateHours(e.target.value)}
                        placeholder="0"
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-center text-gray-900 dark:text-gray-100 bg-white dark:bg-[#0f1a2e] focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      />
                    </div>
                  </div>
                )}

                <button
                  onClick={handlePostUpdate}
                  disabled={loading || !updateText.trim()}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition-colors disabled:opacity-50"
                >
                  {loading ? 'Posting…' : '📤 Post Update'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── ACTIONS TAB ── */}
        {activeTab === 'actions' && (
          <div className="p-4 space-y-4">

            {/* Notes/reason textarea */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Notes / Reason</label>
              <textarea
                rows={3}
                value={actionNotes}
                onChange={e => setActionNotes(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-900 dark:text-gray-100 bg-white dark:bg-[#0f1a2e] focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                placeholder="Add a note (optional for approval, required for rejection)…"
              />
            </div>

            {/* ── MEMBER ACTIONS ── */}
            {!isManager && canAct && (
              <div className="space-y-2">
                {/* Start */}
                {['Pending', 'Assigned', 'Reopened'].includes(data.status) && (
                  <ActionButton onClick={handleStart} color="blue" disabled={loading}>
                    ▶ Start Task
                  </ActionButton>
                )}

                {/* Manual progress (leaf only) */}
                {['In Progress', 'Changes Requested'].includes(data.status) && !hasChildren && (
                  <div className="bg-gray-50 dark:bg-[#132035] rounded-xl p-3 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-xs font-semibold text-gray-700">Manual Progress</span>
                      <span className="text-xs font-bold text-indigo-600">{manualProgress}%</span>
                    </div>
                    <input
                      type="range" min={0} max={100} step={5}
                      value={manualProgress}
                      onChange={e => setManualProgress(Number(e.target.value))}
                      className="w-full accent-indigo-600"
                    />
                    <button
                      onClick={handleSaveProgress}
                      disabled={loading || manualProgress === data.progress}
                      className="w-full py-1.5 border border-indigo-300 text-indigo-600 text-xs font-medium rounded-lg hover:bg-indigo-50 transition-colors disabled:opacity-40"
                    >
                      Save Progress
                    </button>
                  </div>
                )}

                {/* Request completion */}
                {['In Progress', 'Changes Requested', 'Reopened'].includes(data.status) && (
                  eligibility?.eligible ? (
                    <ActionButton onClick={handleRequestCompletion} color="green" disabled={loading}>
                      ✅ Mark as Complete
                    </ActionButton>
                  ) : (
                    <div className="bg-gray-50 dark:bg-[#132035] border border-gray-200 dark:border-[#1b2e4a] rounded-xl p-3 text-center">
                      <p className="text-xs text-gray-500">Complete all subtasks before marking done</p>
                    </div>
                  )
                )}
              </div>
            )}

            {/* ── MANAGER ACTIONS ── */}
            {isManager && (
              <div className="space-y-2">

                {/* ── APPROVAL PENDING STATE ── */}
                {data.status === 'Approval Pending' && (
                  isApprover ? (
                    /* I assigned this task → I must approve/reject */
                    <>
                      <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2.5">
                        <p className="text-[11px] font-bold text-indigo-700">
                          ⏳ {isRootTask ? 'Main task awaiting your approval' : 'Subtask awaiting your approval'}
                        </p>
                        <p className="text-[10px] text-indigo-500 mt-0.5">
                          You assigned this task — review and approve or request changes.
                        </p>
                      </div>
                      <ActionButton onClick={handleApprove} color="green" disabled={loading}>
                        ✅ Approve & Complete
                      </ActionButton>
                      <ActionButton onClick={handleReject} color="orange" disabled={loading}>
                        🔄 Request Changes
                      </ActionButton>
                    </>
                  ) : (
                    /* Someone else is the approver — show who */
                    <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                      <p className="text-[11px] font-bold text-amber-700">⏳ Pending approval</p>
                      <p className="text-[10px] text-amber-600 mt-0.5">
                        {taskDetail?.assignedBy
                          ? `Awaiting approval from ${taskDetail.assignedBy.firstName} ${taskDetail.assignedBy.lastName}.`
                          : isRootTask ? 'Awaiting admin approval.' : 'Awaiting manager approval.'}
                      </p>
                    </div>
                  )
                )}

                {/* ── ACTIVE STATE: assignee submits for review ── */}
                {['In Progress', 'Assigned', 'Reopened', 'Changes Requested'].includes(data.status) && isAssignee && (
                  eligibility?.eligible ? (
                    <ActionButton onClick={handleRequestCompletion} color="indigo" disabled={loading}>
                      {isRootTask ? '📋 Submit to Admin for Approval' : '📋 Submit for Manager Approval'}
                    </ActionButton>
                  ) : (
                    <div className="bg-gray-50 dark:bg-[#132035] border border-gray-200 dark:border-[#1b2e4a] rounded-xl px-3 py-2 text-[11px] text-gray-500 dark:text-[#6a89b5] text-center">
                      Complete all subtasks before submitting
                    </div>
                  )
                )}

                {/* ── ACTIVE STATE: I assigned this task, waiting for assignee to submit ── */}
                {['In Progress', 'Assigned', 'Reopened'].includes(data.status) && isApprover && !isAssignee && eligibility?.eligible && (
                  <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2 text-[11px] text-green-700">
                    ✅ All subtasks complete — waiting for assignee to submit for review.
                  </div>
                )}

                {/* ── START: anyone with access can start ── */}
                {['Pending', 'Assigned', 'Reopened'].includes(data.status) && (isAssignee || isApprover) && data.status !== 'Reopened' && (
                  <ActionButton onClick={handleStart} color="blue" disabled={loading}>
                    ▶ Start Task
                  </ActionButton>
                )}

                {/* ── REOPEN: only the approver can reopen ── */}
                {data.status === 'Completed' && isApprover && (
                  <ActionButton onClick={handleReopen} color="red" disabled={loading}>
                    🔁 Reopen Task
                  </ActionButton>
                )}

                {/* ── ADD SUBTASK ── */}
                {!['Completed', 'Cancelled'].includes(data.status) && (
                  <button
                    onClick={() => { onAddSubtask(taskId, data.title); closeDetailPanel(); }}
                    className="w-full py-2.5 border-2 border-dashed border-indigo-300 rounded-xl text-xs font-semibold text-indigo-600 hover:bg-indigo-50 transition-colors"
                  >
                    + Add Subtask
                  </button>
                )}
              </div>
            )}

            {/* If user can't act */}
            {!canAct && (
              <div className="text-center py-6">
                <p className="text-xs text-gray-400">You are not assigned to this task.</p>
              </div>
            )}

            {/* ── DELETE (manager/admin only) ── */}
            {isManager && (
              <div className="pt-2 border-t border-gray-100">
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="w-full py-2 text-xs font-semibold text-red-600 border border-red-200 rounded-xl hover:bg-red-50 transition-colors flex items-center justify-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Delete Task
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this task?"
        message="This will permanently delete the task and all its subtasks. This action cannot be undone."
        confirmLabel="Yes, Delete"
        confirmColor="red"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

function InfoRow({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-gray-500 flex-shrink-0">{label}</span>
      <div className="text-right">{children}</div>
    </div>
  );
}

function ActionButton({ onClick, color = 'indigo', disabled, children }) {
  const colors = {
    blue:   'bg-blue-600 hover:bg-blue-700',
    green:  'bg-green-600 hover:bg-green-700',
    orange: 'bg-orange-500 hover:bg-orange-600',
    red:    'bg-red-500 hover:bg-red-600',
    indigo: 'bg-indigo-600 hover:bg-indigo-700',
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'w-full py-2.5 text-white text-xs font-semibold rounded-xl transition-colors disabled:opacity-50',
        colors[color],
      )}
    >
      {disabled ? (
        <span className="flex items-center justify-center gap-2">
          <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          Working…
        </span>
      ) : children}
    </button>
  );
}
