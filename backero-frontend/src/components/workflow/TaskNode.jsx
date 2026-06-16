import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';
import { format } from 'date-fns';
import clsx from 'clsx';

const STATUS_STYLES = {
  'Pending':          'bg-slate-100 dark:bg-[#1b2e4a] text-slate-700 dark:text-slate-300 border-slate-300 dark:border-[#1b2e4a]',
  'Assigned':         'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700',
  'In Progress':      'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 border-yellow-400 dark:border-yellow-700',
  'Under Review':     'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-700',
  'Changes Requested':'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-300 dark:border-orange-700',
  'Approval Pending': 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-700',
  'Completed':        'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-300 dark:border-green-700',
  'Reopened':         'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-300 dark:border-red-700',
  'Cancelled':        'bg-gray-100 dark:bg-[#1b2e4a] text-gray-500 dark:text-[#6a89b5] border-gray-300 dark:border-[#1b2e4a]',
};

const STATUS_DOT = {
  'Pending':          'bg-slate-400',
  'Assigned':         'bg-blue-500',
  'In Progress':      'bg-yellow-500',
  'Under Review':     'bg-purple-500',
  'Changes Requested':'bg-orange-500',
  'Approval Pending': 'bg-indigo-500',
  'Completed':        'bg-green-500',
  'Reopened':         'bg-red-500',
  'Cancelled':        'bg-gray-400',
};

const PRIORITY_BORDER = {
  low:      'border-l-slate-300',
  medium:   'border-l-blue-400',
  high:     'border-l-orange-400',
  critical: 'border-l-red-500',
  urgent:   'border-l-red-700',
};

const PRIORITY_COLORS = {
  low:      'text-slate-500 dark:text-slate-400',
  medium:   'text-blue-600 dark:text-blue-400',
  high:     'text-orange-600 dark:text-orange-400',
  critical: 'text-red-600 dark:text-red-400 font-bold',
  urgent:   'text-red-700 dark:text-red-400 font-bold',
};

const DEPT_HEADER = {
  Marketing:           'bg-purple-600',
  Marketplace:         'bg-orange-500',
  Sales:               'bg-green-600',
  Production:          'bg-blue-600',
  'R&D':               'bg-cyan-600',
  Operations:          'bg-indigo-600',
  'Accounts & Finance':'bg-emerald-600',
  HR:                  'bg-amber-500',
  Management:          'bg-slate-700',
};

const PROGRESS_COLOR = {
  'Completed':         'bg-green-500',
  'Cancelled':         'bg-gray-400',
  'Reopened':          'bg-red-400',
  'In Progress':       'bg-yellow-500',
  'Approval Pending':  'bg-indigo-500',
  'Changes Requested': 'bg-orange-400',
};

function getProgressColor(status) {
  return PROGRESS_COLOR[status] || 'bg-blue-500';
}

function getInitials(user) {
  if (!user) return '?';
  return `${(user.firstName || '')[0] || ''}${(user.lastName || '')[0] || ''}`.toUpperCase();
}

const TaskNode = memo(({ data, selected }) => {
  const {
    title, status, priority, progress, assignedTo, dueDate,
    department, completionLocked, isOverdue, depth, childCount,
    estimatedHours, actualHours, canDelete, onDelete,
  } = data;

  const isRoot = depth === 0;
  const isCompleted = status === 'Completed';
  const isCancelled = status === 'Cancelled';
  const deptColor = DEPT_HEADER[department] || 'bg-slate-600';

  return (
    <div
      className={clsx(
        'group bg-white dark:bg-[#0f1a2e] rounded-xl shadow-md border border-gray-200 dark:border-[#1b2e4a] border-l-4 transition-all duration-150 select-none overflow-hidden',
        'w-[300px] cursor-pointer',
        PRIORITY_BORDER[priority] || 'border-l-slate-300',
        selected ? 'ring-2 ring-offset-1 ring-indigo-500 shadow-xl' : 'hover:shadow-lg',
        isCompleted && 'opacity-75',
        isCancelled && 'opacity-40',
      )}
    >
      {/* Target handle */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-slate-400 !border-2 !border-white"
      />

      {/* Dept color stripe (root nodes get full header, children get thin stripe) */}
      {isRoot ? (
        <div className={clsx('px-3 pt-2.5 pb-2 relative', deptColor)}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-white/80 uppercase tracking-wider truncate max-w-[140px]">
              {department}
            </span>
            <div className="flex items-center gap-1">
              {isOverdue && !isCompleted && (
                <span className="text-[9px] font-bold text-white bg-red-500 px-1.5 py-0.5 rounded-full">
                  OVERDUE
                </span>
              )}
              <span className={clsx(
                'text-[9px] font-bold uppercase text-white/90 bg-white/20 px-1.5 py-0.5 rounded-full',
              )}>
                {priority}
              </span>
              {canDelete && (
                <button
                  onClick={e => { e.stopPropagation(); onDelete?.(); }}
                  title="Delete task"
                  className="ml-1 w-6 h-6 flex items-center justify-center rounded-md bg-white/30 text-white hover:bg-red-500 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
          </div>
          <h3 className="text-sm font-bold text-white leading-snug line-clamp-2 mt-1">
            {title}
          </h3>
        </div>
      ) : (
        <>
          <div className={clsx('h-1 w-full', deptColor)} />
          <div className="px-3 pt-2.5 pb-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide truncate max-w-[150px]">
                {department}
              </span>
              <div className="flex items-center gap-1">
                {isOverdue && !isCompleted && (
                  <span className="text-[9px] font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 px-1.5 py-0.5 rounded-full">
                    OVERDUE
                  </span>
                )}
                <span className={clsx('text-[10px] font-semibold capitalize', PRIORITY_COLORS[priority] || 'text-gray-500 dark:text-gray-400')}>
                  {priority}
                </span>
                {canDelete && (
                  <button
                    onClick={e => { e.stopPropagation(); onDelete?.(); }}
                    title="Delete task"
                    className="ml-1 w-6 h-6 flex items-center justify-center rounded-md bg-red-50 text-red-400 hover:bg-red-500 hover:text-white transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
            <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100 leading-snug line-clamp-2">
              {title}
            </h3>
          </div>
        </>
      )}

      {/* Body */}
      <div className="px-3 pb-3 pt-2 space-y-2.5">
        {/* Status */}
        <div className="flex items-center gap-1.5">
          <span className={clsx('w-2 h-2 rounded-full flex-shrink-0', STATUS_DOT[status] || 'bg-gray-400')} />
          <span className={clsx(
            'text-[11px] font-semibold px-2 py-0.5 rounded-full border',
            STATUS_STYLES[status] || 'bg-gray-100 text-gray-600',
          )}>
            {status}
          </span>
          {completionLocked && !isCompleted && (
            <span title="Completion locked — subtasks pending" className="ml-auto text-amber-500">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
            </span>
          )}
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-gray-500 dark:text-gray-400">Progress</span>
            <span className={clsx('text-[11px] font-bold', isCompleted ? 'text-green-600 dark:text-green-400' : 'text-gray-700 dark:text-gray-300')}>
              {progress}%
            </span>
          </div>
          <div className="w-full bg-gray-100 dark:bg-[#1b2e4a] rounded-full h-1.5 overflow-hidden">
            <div
              className={clsx('h-full rounded-full transition-all duration-500', getProgressColor(status))}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Assignee + Due date */}
        <div className="flex items-center justify-between">
          {assignedTo ? (
            <div className="flex items-center gap-1.5">
              <div className={clsx('w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0', deptColor)}>
                {getInitials(assignedTo)}
              </div>
              <span className="text-[11px] text-gray-700 dark:text-gray-300 font-medium truncate max-w-[110px]">
                {assignedTo.firstName} {assignedTo.lastName}
              </span>
            </div>
          ) : (
            <span className="text-[11px] text-gray-400 italic">Unassigned</span>
          )}

          {dueDate && (
            <span className={clsx(
              'text-[10px] font-semibold px-2 py-0.5 rounded-full',
              isOverdue && !isCompleted
                ? 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/30'
                : 'text-gray-500 dark:text-[#6a89b5] bg-gray-50 dark:bg-[#132035]',
            )}>
              {isOverdue && !isCompleted ? '⚠ ' : ''}{format(new Date(dueDate), 'dd MMM')}
            </span>
          )}
        </div>

        {/* Stats row */}
        {(childCount > 0 || estimatedHours) && (
          <div className="flex items-center gap-3 pt-1.5 border-t border-gray-100 dark:border-[#1b2e4a] text-[10px] text-gray-500 dark:text-gray-400">
            {childCount > 0 && (
              <span className="flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16" />
                </svg>
                <span className="font-medium">{childCount}</span> subtask{childCount !== 1 ? 's' : ''}
              </span>
            )}
            {estimatedHours && (
              <span className="flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {actualHours ? `${actualHours}/` : ''}<span className="font-medium">{estimatedHours}h</span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Source handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-slate-400 !border-2 !border-white"
      />
    </div>
  );
});

TaskNode.displayName = 'TaskNode';
export default TaskNode;
