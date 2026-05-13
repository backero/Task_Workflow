import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { useWorkflowStore } from '../../store/useWorkflowStore';
import { useAuthStore } from '../../store/useAuthStore';
import api from '../../api/axios';

const STATUS_COLORS = {
  'Pending':           'text-slate-600 bg-slate-100',
  'Assigned':          'text-blue-600 bg-blue-100',
  'In Progress':       'text-yellow-700 bg-yellow-100',
  'Under Review':      'text-purple-600 bg-purple-100',
  'Changes Requested': 'text-orange-600 bg-orange-100',
  'Approval Pending':  'text-indigo-600 bg-indigo-100',
  'Completed':         'text-green-600 bg-green-100',
  'Reopened':          'text-red-600 bg-red-100',
  'Cancelled':         'text-gray-500 bg-gray-100',
};

const MANAGER_ROLES = ['super_admin', 'chairman', 'founder', 'admin', 'manager', 'team_lead'];

function ProgressSlider({ taskId, current, onUpdate }) {
  const [value, setValue] = useState(current);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdate(taskId, value);
      toast.success('Progress updated');
    } catch {
      toast.error('Failed to update progress');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-700">Progress: {value}%</span>
        <button
          onClick={handleSave}
          disabled={saving || value === current}
          className="text-xs px-2 py-1 bg-indigo-600 text-white rounded-lg disabled:opacity-40 hover:bg-indigo-700 transition-colors"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      <input
        type="range" min={0} max={100} step={5}
        value={value}
        onChange={e => setValue(Number(e.target.value))}
        className="w-full accent-indigo-600"
      />
      <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
        <div
          className="h-full bg-indigo-500 rounded-full transition-all"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

export default function TaskDetailPanel({ onAddSubtask }) {
  const { selectedNode, closeDetailPanel, requestCompletion, completeTask, rejectTask, reopenTask, updateProgress, checkCompletion } = useWorkflowStore();
  const { user } = useAuthStore();
  const [eligibility, setEligibility] = useState(null);
  const [pendingApproval, setPendingApproval] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [dependencies, setDependencies] = useState({ incoming: [], outgoing: [] });
  const [completionNotes, setCompletionNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const isManager = MANAGER_ROLES.includes(user?.role);
  const data = selectedNode?.data;
  const taskId = data?.id?.toString();

  useEffect(() => {
    if (!taskId) return;
    checkCompletion(taskId).then(setEligibility).catch(() => {});
    api.get(`/workflow/${taskId}/dependencies`).then(r => setDependencies(r.data.data)).catch(() => {});
    api.get(`/approvals?taskId=${taskId}&status=pending`).then(r => {
      setPendingApproval(r.data.data?.[0] || null);
    }).catch(() => {});
  }, [taskId]);

  if (!selectedNode || !data) return null;

  const handleRequestCompletion = async () => {
    setActionLoading(true);
    try {
      await requestCompletion(taskId, completionNotes);
      toast.success('Completion request submitted');
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleApprove = async () => {
    setActionLoading(true);
    try {
      await completeTask(taskId, pendingApproval?._id, completionNotes);
      toast.success('Task approved and completed!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!completionNotes.trim()) { toast.error('Please provide a reason for rejection'); return; }
    setActionLoading(true);
    try {
      await rejectTask(taskId, pendingApproval?._id, completionNotes);
      toast.success('Changes requested');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReopen = async () => {
    setActionLoading(true);
    try {
      await reopenTask(taskId, completionNotes || 'Task reopened by manager');
      toast.success('Task reopened');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="absolute top-0 right-0 h-full w-96 bg-white border-l border-gray-200 shadow-2xl z-20 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-purple-50">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={clsx('text-[11px] font-semibold px-2 py-0.5 rounded-full', STATUS_COLORS[data.status])}>
                {data.status}
              </span>
              {data.completionLocked && (
                <span className="text-amber-500" title="Completion locked">🔒</span>
              )}
            </div>
            <h2 className="text-sm font-semibold text-gray-900 leading-tight line-clamp-2">{data.title}</h2>
            <p className="text-xs text-indigo-600 mt-0.5 font-medium">{data.department}</p>
          </div>
          <button
            onClick={closeDetailPanel}
            className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100">
        {['overview', 'actions', 'deps'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={clsx(
              'flex-1 py-2 text-xs font-medium capitalize transition-colors',
              activeTab === tab
                ? 'text-indigo-600 border-b-2 border-indigo-600'
                : 'text-gray-500 hover:text-gray-700',
            )}
          >
            {tab === 'deps' ? 'Dependencies' : tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">

        {activeTab === 'overview' && (
          <>
            {/* Progress */}
            <div className="bg-gray-50 rounded-xl p-3">
              {data.childCount > 0 ? (
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-xs font-semibold text-gray-700">Auto Progress</span>
                    <span className="text-xs font-bold text-indigo-600">{data.progress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${data.progress}%` }} />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">Calculated from {data.childCount} subtask(s)</p>
                </div>
              ) : (
                <ProgressSlider taskId={taskId} current={data.progress} onUpdate={updateProgress} />
              )}
            </div>

            {/* Key info */}
            <div className="space-y-2">
              {data.assignedTo && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Assigned to</span>
                  <span className="text-xs font-medium text-gray-800">
                    {data.assignedTo.firstName} {data.assignedTo.lastName}
                  </span>
                </div>
              )}
              {data.dueDate && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Due date</span>
                  <span className={clsx('text-xs font-medium', data.isOverdue && data.status !== 'Completed' ? 'text-red-600' : 'text-gray-800')}>
                    {format(new Date(data.dueDate), 'dd MMM yyyy')}
                    {data.isOverdue && data.status !== 'Completed' && ' (OVERDUE)'}
                  </span>
                </div>
              )}
              {data.estimatedHours && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Hours</span>
                  <span className="text-xs font-medium text-gray-800">
                    {data.actualHours || 0}/{data.estimatedHours}h
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Priority</span>
                <span className="text-xs font-medium text-gray-800 capitalize">{data.priority}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Subtasks</span>
                <span className="text-xs font-medium text-gray-800">{data.childCount}</span>
              </div>
            </div>

            {/* Completion lock reasons */}
            {data.completionLocked && data.completionLockReasons?.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <p className="text-xs font-semibold text-amber-700 mb-1.5">🔒 Completion blocked:</p>
                <ul className="space-y-1">
                  {data.completionLockReasons.map((r, i) => (
                    <li key={i} className="text-[11px] text-amber-700 flex items-start gap-1">
                      <span className="mt-0.5 flex-shrink-0">•</span>
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Add subtask button (managers) */}
            {isManager && data.status !== 'Completed' && data.status !== 'Cancelled' && (
              <button
                onClick={() => onAddSubtask(taskId, data.title)}
                className="w-full py-2 border-2 border-dashed border-indigo-300 rounded-xl text-xs font-medium text-indigo-600 hover:bg-indigo-50 transition-colors"
              >
                + Add Subtask Here
              </button>
            )}
          </>
        )}

        {activeTab === 'actions' && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Notes / Reason</label>
              <textarea
                rows={3}
                value={completionNotes}
                onChange={e => setCompletionNotes(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                placeholder="Add a note for this action…"
              />
            </div>

            <div className="space-y-2">
              {/* Employee: request completion */}
              {data.status === 'In Progress' && !data.completionLocked && (
                <button
                  onClick={handleRequestCompletion}
                  disabled={actionLoading}
                  className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-xl transition-colors disabled:opacity-50"
                >
                  ✅ Submit for Completion
                </button>
              )}

              {/* Manager: approve */}
              {isManager && data.status === 'Approval Pending' && (
                <>
                  <button
                    onClick={handleApprove}
                    disabled={actionLoading}
                    className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-xl transition-colors disabled:opacity-50"
                  >
                    ✅ Approve & Complete
                  </button>
                  <button
                    onClick={handleReject}
                    disabled={actionLoading}
                    className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-medium rounded-xl transition-colors disabled:opacity-50"
                  >
                    🔄 Request Changes
                  </button>
                </>
              )}

              {/* Manager: reopen completed */}
              {isManager && data.status === 'Completed' && (
                <button
                  onClick={handleReopen}
                  disabled={actionLoading}
                  className="w-full py-2.5 bg-red-500 hover:bg-red-600 text-white text-xs font-medium rounded-xl transition-colors disabled:opacity-50"
                >
                  🔁 Reopen Task
                </button>
              )}

              {data.status === 'In Progress' && data.completionLocked && (
                <div className="text-center py-4 text-xs text-gray-400">
                  Complete all subtasks and resolve dependencies before submitting.
                </div>
              )}
            </div>

            {/* Eligibility status */}
            {eligibility && (
              <div className={clsx(
                'rounded-xl p-3 text-xs',
                eligibility.eligible ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200',
              )}>
                <p className={clsx('font-semibold mb-1', eligibility.eligible ? 'text-green-700' : 'text-red-700')}>
                  {eligibility.eligible ? '✅ Ready for completion' : '❌ Not ready yet'}
                </p>
                {!eligibility.eligible && eligibility.reasons?.map((r, i) => (
                  <p key={i} className="text-red-600 text-[11px]">• {r}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'deps' && (
          <div className="space-y-4">
            <div>
              <h4 className="text-xs font-semibold text-gray-700 mb-2">Blocks this task ({dependencies.incoming.length})</h4>
              {dependencies.incoming.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No incoming dependencies</p>
              ) : (
                <div className="space-y-2">
                  {dependencies.incoming.map(dep => (
                    <div key={dep._id} className="flex items-center justify-between p-2 bg-amber-50 border border-amber-200 rounded-lg">
                      <div>
                        <p className="text-xs font-medium text-gray-800">{dep.fromTask?.title}</p>
                        <p className="text-[10px] text-amber-700">{dep.fromTask?.status}</p>
                      </div>
                      <span className={clsx(
                        'w-2 h-2 rounded-full',
                        dep.fromTask?.status === 'Completed' ? 'bg-green-500' : 'bg-red-500',
                      )} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h4 className="text-xs font-semibold text-gray-700 mb-2">This task blocks ({dependencies.outgoing.length})</h4>
              {dependencies.outgoing.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No outgoing dependencies</p>
              ) : (
                <div className="space-y-2">
                  {dependencies.outgoing.map(dep => (
                    <div key={dep._id} className="p-2 bg-gray-50 border border-gray-200 rounded-lg">
                      <p className="text-xs font-medium text-gray-800">{dep.toTask?.title}</p>
                      <p className="text-[10px] text-gray-500">{dep.toTask?.status}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
