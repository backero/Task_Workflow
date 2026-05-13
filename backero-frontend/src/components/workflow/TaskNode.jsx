import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';
import { format } from 'date-fns';
import clsx from 'clsx';

const STATUS_STYLES = {
  'Pending':          'bg-slate-100 text-slate-700 border-slate-300',
  'Assigned':         'bg-blue-100 text-blue-700 border-blue-300',
  'In Progress':      'bg-yellow-100 text-yellow-700 border-yellow-300',
  'Under Review':     'bg-purple-100 text-purple-700 border-purple-300',
  'Changes Requested':'bg-orange-100 text-orange-700 border-orange-300',
  'Approval Pending': 'bg-indigo-100 text-indigo-700 border-indigo-300',
  'Completed':        'bg-green-100 text-green-700 border-green-300',
  'Reopened':         'bg-red-100 text-red-700 border-red-300',
  'Cancelled':        'bg-gray-100 text-gray-500 border-gray-300',
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
  low:      'border-l-slate-400',
  medium:   'border-l-blue-400',
  high:     'border-l-orange-400',
  critical: 'border-l-red-500',
  urgent:   'border-l-red-700',
};

const PRIORITY_BADGE = {
  low:      'bg-slate-100 text-slate-600',
  medium:   'bg-blue-100 text-blue-600',
  high:     'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
  urgent:   'bg-red-200 text-red-800',
};

const PROGRESS_BAR = {
  'Completed':   'bg-green-500',
  'Cancelled':   'bg-gray-400',
  'Reopened':    'bg-red-500',
  'In Progress': 'bg-yellow-500',
  'Approval Pending': 'bg-indigo-500',
};

function getProgressColor(status) {
  return PROGRESS_BAR[status] || 'bg-blue-500';
}

function getInitials(user) {
  if (!user) return '?';
  return `${(user.firstName || '')[0] || ''}${(user.lastName || '')[0] || ''}`.toUpperCase();
}

const TaskNode = memo(({ data, selected }) => {
  const {
    title, status, priority, progress, assignedTo, dueDate,
    department, completionLocked, isOverdue, depth, childCount,
    estimatedHours, actualHours,
  } = data;

  const isRoot = depth === 0;
  const isCompleted = status === 'Completed';
  const isCancelled = status === 'Cancelled';

  return (
    <div
      className={clsx(
        'bg-white rounded-xl shadow-md border-l-4 border border-gray-200 transition-all duration-150 select-none',
        'w-[280px] cursor-pointer',
        PRIORITY_BORDER[priority] || 'border-l-gray-300',
        selected && 'ring-2 ring-indigo-500 shadow-lg',
        isRoot && 'shadow-lg',
        isCompleted && 'opacity-80',
        isCancelled && 'opacity-50',
      )}
    >
      {/* Target handle (top) */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-slate-400 !border-2 !border-white"
      />

      {/* Header */}
      <div className={clsx(
        'px-3 pt-3 pb-2',
        isRoot ? 'bg-gradient-to-r from-indigo-50 to-purple-50 rounded-t-xl' : '',
      )}>
        {/* Department + Priority row */}
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-semibold text-indigo-600 uppercase tracking-wider truncate max-w-[140px]">
            {department}
          </span>
          <div className="flex items-center gap-1">
            {isOverdue && !isCompleted && (
              <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full border border-red-200">
                OVERDUE
              </span>
            )}
            <span className={clsx('text-[10px] font-semibold px-1.5 py-0.5 rounded-full capitalize', PRIORITY_BADGE[priority])}>
              {priority}
            </span>
          </div>
        </div>

        {/* Title */}
        <h3 className={clsx(
          'font-semibold text-gray-900 leading-tight line-clamp-2',
          isRoot ? 'text-sm' : 'text-xs',
        )}>
          {title}
        </h3>
      </div>

      {/* Body */}
      <div className="px-3 pb-2 space-y-2">
        {/* Status */}
        <div className="flex items-center gap-1.5">
          <span className={clsx('w-2 h-2 rounded-full flex-shrink-0', STATUS_DOT[status] || 'bg-gray-400')} />
          <span className={clsx(
            'text-[11px] font-medium px-2 py-0.5 rounded-full border',
            STATUS_STYLES[status] || 'bg-gray-100 text-gray-600',
          )}>
            {status}
          </span>
          {completionLocked && !isCompleted && (
            <span title="Completion locked" className="ml-auto text-amber-500">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
            </span>
          )}
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-gray-500 font-medium">Progress</span>
            <span className={clsx('text-[11px] font-bold', isCompleted ? 'text-green-600' : 'text-gray-700')}>
              {progress}%
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
            <div
              className={clsx('h-full rounded-full transition-all duration-500', getProgressColor(status))}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Assignee + Due date */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {assignedTo ? (
              <>
                <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0">
                  {getInitials(assignedTo)}
                </div>
                <span className="text-[10px] text-gray-600 truncate max-w-[90px]">
                  {assignedTo.firstName} {assignedTo.lastName}
                </span>
              </>
            ) : (
              <span className="text-[10px] text-gray-400 italic">Unassigned</span>
            )}
          </div>

          {dueDate && (
            <span className={clsx(
              'text-[10px] font-medium',
              isOverdue && !isCompleted ? 'text-red-600' : 'text-gray-500',
            )}>
              {format(new Date(dueDate), 'dd MMM')}
            </span>
          )}
        </div>

        {/* Stats row */}
        {(childCount > 0 || estimatedHours) && (
          <div className="flex items-center gap-3 text-[10px] text-gray-500 pt-1 border-t border-gray-100">
            {childCount > 0 && (
              <span className="flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
                {childCount} subtask{childCount !== 1 ? 's' : ''}
              </span>
            )}
            {estimatedHours && (
              <span className="flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {actualHours ? `${actualHours}/` : ''}{estimatedHours}h
              </span>
            )}
          </div>
        )}
      </div>

      {/* Source handle (bottom) */}
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
