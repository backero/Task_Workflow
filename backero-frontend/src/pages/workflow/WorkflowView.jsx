import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import WorkflowTree from '../../components/workflow/WorkflowTree';
import { useWorkflowStore } from '../../store/useWorkflowStore';
import { format } from 'date-fns';
import clsx from 'clsx';

const STATUS_COLORS = {
  'Pending':          'bg-slate-100 text-slate-700',
  'Assigned':         'bg-blue-100 text-blue-700',
  'In Progress':      'bg-yellow-100 text-yellow-800',
  'Approval Pending': 'bg-indigo-100 text-indigo-700',
  'Completed':        'bg-green-100 text-green-700',
  'Reopened':         'bg-red-100 text-red-700',
  'Changes Requested':'bg-orange-100 text-orange-700',
  'Cancelled':        'bg-gray-100 text-gray-500',
};

const DEPT_COLORS = {
  Marketing:           { bg: 'bg-purple-600', light: 'bg-purple-50', text: 'text-purple-700' },
  Marketplace:         { bg: 'bg-orange-500', light: 'bg-orange-50', text: 'text-orange-700' },
  Sales:               { bg: 'bg-green-600',  light: 'bg-green-50',  text: 'text-green-700'  },
  Production:          { bg: 'bg-blue-600',   light: 'bg-blue-50',   text: 'text-blue-700'   },
  'R&D':               { bg: 'bg-cyan-600',   light: 'bg-cyan-50',   text: 'text-cyan-700'   },
  Operations:          { bg: 'bg-indigo-600', light: 'bg-indigo-50', text: 'text-indigo-700' },
  'Accounts & Finance':{ bg: 'bg-emerald-600',light: 'bg-emerald-50',text: 'text-emerald-700'},
  HR:                  { bg: 'bg-amber-500',  light: 'bg-amber-50',  text: 'text-amber-700'  },
  Management:          { bg: 'bg-slate-700',  light: 'bg-slate-50',  text: 'text-slate-700'  },
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

  const dept = rootTask?.department;
  const deptC = DEPT_COLORS[dept] || DEPT_COLORS.Management;

  return (
    <div className="flex flex-col -m-4 lg:-m-6 bg-gray-50 overflow-hidden" style={{ height: 'calc(100vh - 64px)' }}>
      {/* Top bar */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-3 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {/* Back button */}
            <button
              onClick={() => navigate('/workflow')}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 font-medium transition-colors flex-shrink-0 px-2.5 py-1.5 rounded-lg hover:bg-gray-100"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Board
            </button>

            <div className="h-5 w-px bg-gray-200 flex-shrink-0" />

            {/* Task info */}
            {rootTask ? (
              <div className="flex items-center gap-3 min-w-0">
                {/* Dept color dot */}
                <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm', deptC.bg)}>
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <h1 className="text-sm font-bold text-gray-900 leading-tight truncate max-w-xs">
                    {rootTask.title}
                  </h1>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className={clsx('text-[10px] font-bold px-2 py-0.5 rounded-full', STATUS_COLORS[rootTask.status] || 'bg-gray-100 text-gray-600')}>
                      {rootTask.status}
                    </span>
                    <span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded-full', deptC.light, deptC.text)}>
                      {dept}
                    </span>
                    {rootTask.dueDate && (
                      <span className="text-[10px] text-gray-400 font-medium">
                        Due {format(new Date(rootTask.dueDate), 'dd MMM yyyy')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-8 w-48 bg-gray-100 rounded-lg animate-pulse" />
            )}
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            {/* Overall progress */}
            {totalNodes > 0 && (
              <div className="hidden md:flex items-center gap-2.5 bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5">
                <div className="flex flex-col items-end">
                  <span className="text-[10px] text-gray-400 font-medium">{completedNodes}/{totalNodes} tasks</span>
                  <span className="text-xs font-bold text-gray-800">{overallProgress}% done</span>
                </div>
                <div className="w-20 bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div
                    className={clsx('h-full rounded-full transition-all', overallProgress === 100 ? 'bg-green-500' : 'bg-indigo-500')}
                    style={{ width: `${overallProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* View switcher */}
            <div className="flex items-center bg-gray-100 rounded-xl p-0.5">
              <button
                onClick={() => setView('workflow')}
                className={clsx(
                  'px-3 py-1.5 text-xs font-semibold rounded-lg transition-all',
                  view === 'workflow' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700',
                )}
              >
                🌐 Canvas
              </button>
              <button
                onClick={() => setView('tree')}
                className={clsx(
                  'px-3 py-1.5 text-xs font-semibold rounded-lg transition-all',
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
