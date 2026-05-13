import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import WorkflowTree from '../../components/workflow/WorkflowTree';
import { useWorkflowStore } from '../../store/useWorkflowStore';
import { format } from 'date-fns';
import clsx from 'clsx';
import api from '../../api/axios';

const STATUS_COLORS = {
  'Pending':          'bg-slate-100 text-slate-700',
  'Assigned':         'bg-blue-100 text-blue-700',
  'In Progress':      'bg-yellow-100 text-yellow-700',
  'Approval Pending': 'bg-indigo-100 text-indigo-700',
  'Completed':        'bg-green-100 text-green-700',
  'Reopened':         'bg-red-100 text-red-700',
};

export default function WorkflowView() {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const { rootTask, isLoading, graph } = useWorkflowStore();
  const [view, setView] = useState('workflow'); // 'workflow' | 'tree'

  const totalNodes = graph.nodes?.length || 0;
  const completedNodes = graph.nodes?.filter(n => n.data?.status === 'Completed').length || 0;
  const overallProgress = totalNodes > 0 ? Math.round((completedNodes / totalNodes) * 100) : 0;

  if (!taskId) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-400 text-sm">No task selected. Open a task's workflow from the task list.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden">
      {/* Top bar */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-1.5 text-gray-500 hover:text-gray-700 text-sm transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>

            <div className="h-5 w-px bg-gray-200" />

            <div>
              {rootTask && (
                <>
                  <h1 className="text-sm font-semibold text-gray-900 leading-tight">
                    {rootTask.title}
                  </h1>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded-full', STATUS_COLORS[rootTask.status] || 'bg-gray-100 text-gray-600')}>
                      {rootTask.status}
                    </span>
                    <span className="text-[10px] text-gray-400">{rootTask.department}</span>
                    {rootTask.dueDate && (
                      <span className="text-[10px] text-gray-400">
                        Due {format(new Date(rootTask.dueDate), 'dd MMM yyyy')}
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Overall progress */}
            {totalNodes > 0 && (
              <div className="flex items-center gap-2">
                <div className="w-32 bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full transition-all"
                    style={{ width: `${overallProgress}%` }}
                  />
                </div>
                <span className="text-xs font-semibold text-gray-700">{overallProgress}%</span>
                <span className="text-xs text-gray-400">({completedNodes}/{totalNodes} tasks)</span>
              </div>
            )}

            {/* View switcher */}
            <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setView('workflow')}
                className={clsx(
                  'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                  view === 'workflow' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700',
                )}
              >
                🌐 Workflow
              </button>
              <button
                onClick={() => setView('tree')}
                className={clsx(
                  'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                  view === 'tree' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700',
                )}
              >
                🌲 Tree
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        {view === 'workflow' ? (
          <WorkflowTree rootTaskId={taskId} />
        ) : (
          <TaskTreeListView taskId={taskId} />
        )}
      </div>
    </div>
  );
}

// ── Flat tree list view ───────────────────────────────────────────────────────

function TaskTreeListView({ taskId }) {
  const { tree, isLoading } = useWorkflowStore();

  if (isLoading) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
    </div>
  );

  if (!tree) return null;

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto space-y-2">
        <TaskTreeRow node={tree} depth={0} />
      </div>
    </div>
  );
}

const STATUS_BG = {
  'Completed':        'border-l-green-500 bg-green-50',
  'In Progress':      'border-l-yellow-500 bg-yellow-50',
  'Approval Pending': 'border-l-indigo-500 bg-indigo-50',
  'Reopened':         'border-l-red-500 bg-red-50',
  'Cancelled':        'border-l-gray-400 bg-gray-50',
};

function TaskTreeRow({ node, depth }) {
  const [collapsed, setCollapsed] = useState(false);
  const hasChildren = node.children?.length > 0;

  return (
    <div>
      <div
        className={clsx(
          'flex items-center gap-3 p-3 rounded-xl border-l-4 border border-gray-200 shadow-sm cursor-pointer hover:shadow-md transition-all',
          STATUS_BG[node.status] || 'bg-white border-l-slate-300',
        )}
        style={{ marginLeft: `${depth * 28}px` }}
      >
        {hasChildren && (
          <button onClick={() => setCollapsed(v => !v)} className="flex-shrink-0 text-gray-400 hover:text-gray-600">
            <svg className={clsx('w-3.5 h-3.5 transition-transform', collapsed && '-rotate-90')} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}
        {!hasChildren && <span className="w-3.5 h-3.5 flex-shrink-0" />}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-900 truncate">{node.title}</span>
            {node.isOverdue && node.status !== 'Completed' && (
              <span className="text-[10px] font-bold text-red-600 bg-red-100 px-1.5 rounded-full">OVERDUE</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-[10px] text-gray-500">{node.status}</span>
            {node.assignedTo && (
              <span className="text-[10px] text-gray-400">
                → {node.assignedTo.firstName} {node.assignedTo.lastName}
              </span>
            )}
            {node.dueDate && (
              <span className="text-[10px] text-gray-400">
                {format(new Date(node.dueDate), 'dd MMM')}
              </span>
            )}
          </div>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-16 bg-gray-200 rounded-full h-1.5 overflow-hidden">
            <div
              className={clsx('h-full rounded-full', node.status === 'Completed' ? 'bg-green-500' : 'bg-indigo-500')}
              style={{ width: `${node.progress || 0}%` }}
            />
          </div>
          <span className="text-[10px] font-bold text-gray-600 w-7 text-right">{node.progress || 0}%</span>
        </div>
      </div>

      {!collapsed && hasChildren && (
        <div className="mt-1 space-y-1">
          {node.children.map(child => (
            <TaskTreeRow key={child._id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
