import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import WorkflowTree from '../../components/workflow/WorkflowTree';
import { useWorkflowStore } from '../../store/useWorkflowStore';
import { useAuthStore } from '../../store/useAuthStore';
import { usePermissions } from '../../store/usePermissions';
import api from '../../api/axios';
import { format, isPast } from 'date-fns';
import clsx from 'clsx';
import { ChevronDownIcon, ChevronRightIcon, PlusIcon, XMarkIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { CheckCircleIcon as CheckCircleSolid } from '@heroicons/react/24/solid';

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
  const [searchParams] = useSearchParams();
  const { rootTask, isLoading, graph, fetchWorkflowGraph } = useWorkflowStore();
  const [view, setView] = useState(searchParams.get('view') === 'dept' ? 'dept' : 'workflow');

  useEffect(() => {
    if (taskId) fetchWorkflowGraph(taskId);
  }, [taskId]);

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
    <div className="flex flex-col -m-4 lg:-m-6 bg-gray-50 dark:bg-[#020617] overflow-hidden" style={{ height: 'calc(100vh - 64px)' }}>
      {/* Top bar */}
      <div className="flex-shrink-0 bg-white dark:bg-[#0f172a] border-b border-gray-200 dark:border-[#1b2e4a] px-6 py-3 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {/* Back button */}
            <button
              onClick={() => navigate('/workflow')}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 font-medium transition-colors flex-shrink-0 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-[#1b2e4a]"
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
                  <h1 className="text-sm font-bold text-gray-900 dark:text-white leading-tight truncate max-w-xs">
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
              <div className="hidden md:flex items-center gap-2.5 bg-gray-50 dark:bg-[#0f1a2e] border border-gray-200 dark:border-[#1b2e4a] rounded-xl px-3 py-1.5">
                <div className="flex flex-col items-end">
                  <span className="text-[10px] text-gray-400 font-medium">{completedNodes}/{totalNodes} tasks</span>
                  <span className="text-xs font-bold text-gray-800 dark:text-gray-100">{overallProgress}% done</span>
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
            <div className="flex items-center bg-gray-100 dark:bg-[#0f1a2e] rounded-xl p-0.5">
              {[
                { key: 'workflow', label: '🌐 Canvas' },
                { key: 'tree',     label: '🌲 Tree'   },
                { key: 'dept',     label: '🏢 Dept Hub' },
              ].map(v => (
                <button
                  key={v.key}
                  onClick={() => setView(v.key)}
                  className={clsx(
                    'px-3 py-1.5 text-xs font-semibold rounded-lg transition-all',
                    view === v.key ? 'bg-white dark:bg-[#132035] shadow text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300',
                  )}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        {view === 'workflow' ? (
          <WorkflowTree rootTaskId={taskId} />
        ) : view === 'tree' ? (
          <TaskTreeListView taskId={taskId} />
        ) : (
          <DeptHubView />
        )}
      </div>
    </div>
  );
}

// ── Dept Hub view ────────────────────────────────────────────────────────────

const DEPT_HEADER_COLORS = {
  Marketing:           { bg: 'bg-purple-600', light: 'bg-purple-50',  border: 'border-purple-200', text: 'text-purple-700',  bar: 'bg-purple-500'  },
  Marketplace:         { bg: 'bg-orange-500', light: 'bg-orange-50',  border: 'border-orange-200', text: 'text-orange-700',  bar: 'bg-orange-500'  },
  Sales:               { bg: 'bg-green-600',  light: 'bg-green-50',   border: 'border-green-200',  text: 'text-green-700',   bar: 'bg-green-500'   },
  Production:          { bg: 'bg-blue-600',   light: 'bg-blue-50',    border: 'border-blue-200',   text: 'text-blue-700',    bar: 'bg-blue-500'    },
  'R&D':               { bg: 'bg-cyan-600',   light: 'bg-cyan-50',    border: 'border-cyan-200',   text: 'text-cyan-700',    bar: 'bg-cyan-500'    },
  Operations:          { bg: 'bg-indigo-600', light: 'bg-indigo-50',  border: 'border-indigo-200', text: 'text-indigo-700',  bar: 'bg-indigo-500'  },
  'Accounts & Finance':{ bg: 'bg-emerald-600',light: 'bg-emerald-50', border: 'border-emerald-200',text: 'text-emerald-700', bar: 'bg-emerald-500' },
  HR:                  { bg: 'bg-amber-500',  light: 'bg-amber-50',   border: 'border-amber-200',  text: 'text-amber-700',   bar: 'bg-amber-500'   },
  Management:          { bg: 'bg-slate-700',  light: 'bg-slate-50',   border: 'border-slate-200',  text: 'text-slate-700',   bar: 'bg-slate-500'   },
};
const dc = (d) => DEPT_HEADER_COLORS[d] || { bg: 'bg-gray-500', light: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-700', bar: 'bg-gray-400' };

const DSTATUS_DOT = {
  'Completed':'bg-green-500','In Progress':'bg-yellow-500','Assigned':'bg-blue-500',
  'Pending':'bg-slate-400','Overdue':'bg-red-500','Approval Pending':'bg-indigo-500',
  'Under Review':'bg-purple-500','Changes Requested':'bg-orange-500',
};
const DSTATUS_BADGE = {
  'Completed':'bg-green-100 text-green-700','In Progress':'bg-yellow-100 text-yellow-800',
  'Assigned':'bg-blue-100 text-blue-700','Pending':'bg-slate-100 text-slate-600',
  'Overdue':'bg-red-100 text-red-700','Approval Pending':'bg-indigo-100 text-indigo-700',
  'Under Review':'bg-purple-100 text-purple-700','Changes Requested':'bg-orange-100 text-orange-700',
};
const ALL_STATUSES = ['Pending','Assigned','In Progress','Under Review','Approval Pending','Completed'];

const calcDeptProgress = (node) => {
  const kids = node.children || [];
  if (kids.length === 0) return { done: node.status === 'Completed' ? 1 : 0, total: 1 };
  const agg = kids.map(calcDeptProgress);
  return { done: agg.reduce((s, x) => s + x.done, 0), total: agg.reduce((s, x) => s + x.total, 0) };
};
const dpct = (p) => p.total === 0 ? 0 : Math.round((p.done / p.total) * 100);

// ── Inline add form ───────────────────────────────────────────────────────────
function DeptInlineForm({ dept, onSave, onCancel }) {
  const [title,  setTitle]  = useState('');
  const [due,    setDue]    = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e?.stopPropagation();
    if (!title.trim()) return;
    setSaving(true);
    try { await onSave(title.trim(), due || undefined); }
    finally { setSaving(false); }
  };

  return (
    <div className="mt-2 p-2 rounded-lg border border-dashed border-brand-300 bg-brand-50 space-y-1.5" onClick={e => e.stopPropagation()}>
      <input
        autoFocus
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel(); }}
        placeholder="Task title…"
        className="w-full text-xs px-2 py-1.5 rounded border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-brand-400"
      />
      <input
        type="date" value={due} onChange={e => setDue(e.target.value)}
        className="w-full text-xs px-2 py-1.5 rounded border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-brand-400"
      />
      <div className="flex gap-1.5">
        <button onMouseDown={submit} disabled={saving || !title.trim()}
          className="flex-1 text-xs py-1 rounded bg-brand-600 text-white font-medium disabled:opacity-50 hover:bg-brand-700">
          {saving ? '…' : 'Add'}
        </button>
        <button onMouseDown={onCancel} className="px-2 text-gray-400 hover:text-gray-600">
          <XMarkIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── Task node (recursive, interactive) ───────────────────────────────────────
function DeptTaskNode({ node, depth = 0, canEdit, onStatusChange, onAddSubtask, onDelete, onRename }) {
  const [open,          setOpen]          = useState(depth < 1);
  const [addingHere,    setAddingHere]    = useState(false);
  const [statusOpen,    setStatusOpen]    = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [renaming,      setRenaming]      = useState(false);
  const [renameVal,     setRenameVal]     = useState('');
  const renameRef = React.useRef(null);

  const startRename = (e) => {
    e.stopPropagation();
    setRenameVal(node.title);
    setRenaming(true);
    setTimeout(() => renameRef.current?.select(), 30);
  };

  const commitRename = () => {
    const val = renameVal.trim();
    if (val && val !== node.title) onRename?.(node._id, val);
    setRenaming(false);
  };

  const hasKids   = (node.children || []).length > 0;
  const isDone    = node.status === 'Completed';
  const statusKey = node.isOverdue && !isDone ? 'Overdue' : node.status;
  const prog      = hasKids ? calcDeptProgress(node) : null;
  const initials  = node.assignedTo
    ? ((node.assignedTo.firstName?.[0] || '') + (node.assignedTo.lastName?.[0] || '')).toUpperCase()
    : null;

  return (
    <div className={clsx('rounded-lg border bg-white dark:bg-[#0f172a]', depth === 0 ? 'border-gray-200 dark:border-[#1b2e4a]' : 'border-gray-100 dark:border-[#1b2e4a] ml-4 mt-1.5')}>
      <div
        className={clsx('flex items-start gap-2 px-3 py-2 group', hasKids && 'cursor-pointer hover:bg-gray-50')}
        onClick={() => hasKids && setOpen(p => !p)}
      >
        {/* Chevron */}
        <div className="mt-0.5 w-4 flex-shrink-0">
          {hasKids
            ? (open ? <ChevronDownIcon className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRightIcon className="w-3.5 h-3.5 text-gray-400" />)
            : <span className="w-3.5 block" />}
        </div>

        <span className={clsx('w-2 h-2 rounded-full flex-shrink-0 mt-1.5', DSTATUS_DOT[statusKey] || 'bg-gray-400')} />

        <div className="flex-1 min-w-0">
          {renaming ? (
            <input
              ref={renameRef}
              value={renameVal}
              onChange={e => setRenameVal(e.target.value)}
              onBlur={commitRename}
              onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(false); }}
              onClick={e => e.stopPropagation()}
              className="w-full text-xs font-medium border border-indigo-400 rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
            />
          ) : (
            <p className={clsx('text-xs font-medium leading-snug', isDone ? 'line-through text-gray-400' : 'text-gray-800 dark:text-gray-100')}>
              {node.title}
            </p>
          )}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {initials && (
              <div className="w-5 h-5 rounded-full bg-brand-100 flex items-center justify-center text-[9px] font-bold text-brand-700 flex-shrink-0"
                title={`${node.assignedTo.firstName} ${node.assignedTo.lastName}`}>
                {initials}
              </div>
            )}
            {node.dueDate && (
              <span className={clsx('text-[10px]', node.isOverdue && !isDone ? 'text-red-500 font-medium' : 'text-gray-400')}>
                {format(new Date(node.dueDate), 'd MMM')}
              </span>
            )}

            {/* Status badge — clickable if canEdit */}
            {canEdit ? (
              <div className="relative">
                <button
                  onClick={e => { e.stopPropagation(); setStatusOpen(p => !p); }}
                  onBlur={() => setTimeout(() => setStatusOpen(false), 150)}
                  className={clsx('text-[10px] px-1.5 py-0.5 rounded-full font-medium cursor-pointer hover:opacity-80', DSTATUS_BADGE[statusKey] || 'bg-gray-100 text-gray-600')}
                >
                  {statusKey} ▾
                </button>
                {statusOpen && (
                  <div className="absolute left-0 top-full mt-1 z-50 bg-white dark:bg-[#0f1a2e] border border-gray-200 dark:border-[#1b2e4a] rounded-lg shadow-xl py-1 min-w-[150px]">
                    {ALL_STATUSES.map(s => (
                      <button key={s} onMouseDown={e => { e.preventDefault(); onStatusChange(node._id, s); setStatusOpen(false); }}
                        className={clsx('w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-[#1b2e4a] flex items-center gap-2', node.status === s ? 'font-bold text-brand-600' : 'text-gray-700 dark:text-gray-300')}>
                        <span className={clsx('w-2 h-2 rounded-full', DSTATUS_DOT[s] || 'bg-gray-400')} />
                        {s}
                        {node.status === s && <span className="ml-auto">✓</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <span className={clsx('text-[10px] px-1.5 py-0.5 rounded-full font-medium', DSTATUS_BADGE[statusKey] || 'bg-gray-100 text-gray-600')}>
                {statusKey}
              </span>
            )}
          </div>

          {hasKids && (
            <div className="mt-1.5 flex items-center gap-2">
              <div className="flex-1 bg-gray-200 rounded-full h-1 overflow-hidden">
                <div className={clsx('h-full rounded-full', isDone ? 'bg-green-400' : 'bg-brand-400')} style={{ width: `${dpct(prog)}%` }} />
              </div>
              <span className="text-[10px] text-gray-400 whitespace-nowrap">{dpct(prog)}%</span>
            </div>
          )}
        </div>

        {/* Actions (always visible if canEdit) */}
        {canEdit && !renaming && (
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button onClick={e => { e.stopPropagation(); setAddingHere(p => !p); setOpen(true); }}
              className="p-1 rounded-md bg-brand-50 text-brand-400 hover:bg-brand-100 hover:text-brand-600"
              title="Add subtask">
              <PlusIcon className="w-3.5 h-3.5" />
            </button>
            <button onClick={startRename}
              className="p-1 rounded-md bg-indigo-50 text-indigo-400 hover:bg-indigo-100 hover:text-indigo-600"
              title="Rename task">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button onClick={e => { e.stopPropagation(); setConfirmDelete(true); }}
              className="p-1 rounded-md bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600"
              title="Delete task">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Inline add subtask form */}
      {addingHere && (
        <div className="px-3 pb-2">
          <DeptInlineForm
            dept={node.department}
            onSave={async (title, due) => { await onAddSubtask(node._id, node.department, title, due); setAddingHere(false); }}
            onCancel={() => setAddingHere(false)}
          />
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this task?"
        message={`"${node.title}" and all its subtasks will be permanently deleted.`}
        confirmLabel="Yes, Delete"
        confirmColor="red"
        onConfirm={() => { setConfirmDelete(false); onDelete?.(node._id); }}
        onCancel={() => setConfirmDelete(false)}
      />

      {/* Children */}
      {hasKids && open && (
        <div className="px-2 pb-2 space-y-0">
          {node.children.map(child => (
            <DeptTaskNode key={child._id} node={child} depth={depth + 1}
              canEdit={canEdit} onStatusChange={onStatusChange} onAddSubtask={onAddSubtask} onDelete={onDelete} onRename={onRename} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Dept column ───────────────────────────────────────────────────────────────
function DeptHubColumn({ dept, nodes, cfg, canEdit, onAddTask, onStatusChange, onAddSubtask, onDelete, onRename }) {
  const [addingTask, setAddingTask] = useState(false);

  const allProg = nodes.reduce((acc, n) => {
    const p = calcDeptProgress(n); return { done: acc.done + p.done, total: acc.total + p.total };
  }, { done: 0, total: 0 });
  const progress = dpct(allProg);
  const allDone  = progress === 100;

  // Manager is the assignedTo of the first dept-level task in this column
  const manager = nodes[0]?.assignedTo;
  const managerInitials = manager
    ? ((manager.firstName?.[0] || '') + (manager.lastName?.[0] || '')).toUpperCase()
    : null;

  // Count total subtasks across all dept tasks
  const subtaskTotal = nodes.reduce((sum, n) => sum + (n.children || []).length, 0);

  return (
    <div className={clsx('flex-shrink-0 w-72 rounded-xl border-2 flex flex-col', cfg.border, allDone ? 'opacity-90' : '')}>
      {/* Header */}
      <div className={clsx('rounded-t-xl px-4 py-3', cfg.bg)}>
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold text-sm text-white">{dept}</span>
          <div className="flex items-center gap-1.5">
            {allDone && <CheckCircleSolid className="w-4 h-4 text-green-300" />}
            <span className="text-xs font-bold text-white">{progress}%</span>
          </div>
        </div>
        {/* Manager row */}
        {manager ? (
          <div className="flex items-center gap-1.5 mt-1.5">
            <div className="w-5 h-5 rounded-full bg-white/25 flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0">
              {managerInitials}
            </div>
            <span className="text-[10px] text-white/85 font-medium">{manager.firstName} {manager.lastName}</span>
            <span className="text-[10px] text-white/50 capitalize">{manager.role?.replace('_', ' ')}</span>
          </div>
        ) : (
          <p className="text-[10px] text-white/50 mt-1">No manager assigned</p>
        )}
        <div className="mt-2 w-full bg-white/25 rounded-full h-1.5 overflow-hidden">
          <div className="h-full rounded-full bg-white/80 transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
        <p className="text-[10px] text-white/70 mt-1">{allProg.done}/{allProg.total} tasks · {subtaskTotal} subtasks</p>
      </div>

      {/* Task list */}
      <div className="flex-1 p-3 space-y-2 overflow-y-auto max-h-[400px] bg-white dark:bg-[#0f172a]">
        {nodes.map(n => (
          <DeptTaskNode key={n._id} node={n} depth={0}
            canEdit={canEdit} onStatusChange={onStatusChange} onAddSubtask={onAddSubtask} onDelete={onDelete} onRename={onRename} />
        ))}
        {nodes.length === 0 && <p className="text-xs text-gray-400 italic text-center py-4">No tasks yet</p>}

        {addingTask && (
          <DeptInlineForm
            dept={dept}
            onSave={async (title, due) => { await onAddTask(dept, title, due); setAddingTask(false); }}
            onCancel={() => setAddingTask(false)}
          />
        )}
      </div>

      {/* Add task button */}
      {canEdit && (
        <div className={clsx('rounded-b-xl px-3 py-2 border-t', cfg.light, cfg.border.replace('border-', 'border-t-'))}>
          <button
            onClick={() => setAddingTask(p => !p)}
            className={clsx('w-full flex items-center justify-center gap-1.5 text-xs font-medium py-1.5 rounded-lg border transition-colors', cfg.border, cfg.light, cfg.text, 'hover:opacity-80')}
          >
            <PlusIcon className="w-3.5 h-3.5" />
            Add Task to {dept}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main Dept Hub view ────────────────────────────────────────────────────────
function DeptHubView() {
  const { tree, rootTask, isLoading, addSubtask, refreshGraph } = useWorkflowStore();
  const { isAdmin, isManager, dept: userDept } = usePermissions();
  const [toast, setToast] = useState(null);

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const handleStatusChange = async (taskId, newStatus) => {
    try {
      await api.put(`/tasks/${taskId}`, { status: newStatus });
      await refreshGraph();
      showToast(`Updated to "${newStatus}"`);
    } catch { showToast('Failed to update', false); }
  };

  const handleAddTask = async (dept, title, dueDate) => {
    try {
      await addSubtask(tree._id, { title, dueDate, department: dept, status: 'Pending' });
      showToast('Task added');
    } catch { showToast('Failed to add task', false); throw new Error('failed'); }
  };

  const handleAddSubtask = async (parentId, dept, title, dueDate) => {
    try {
      await addSubtask(parentId, { title, dueDate, department: dept, status: 'Pending' });
      showToast('Subtask added');
    } catch { showToast('Failed to add subtask', false); throw new Error('failed'); }
  };

  const handleDeleteTask = async (taskId) => {
    try {
      await api.delete(`/tasks/${taskId}`);
      await refreshGraph();
      showToast('Task deleted');
    } catch { showToast('Failed to delete', false); }
  };

  const handleRenameTask = async (taskId, newTitle) => {
    try {
      await api.put(`/tasks/${taskId}`, { title: newTitle });
      await refreshGraph();
      showToast('Renamed');
    } catch { showToast('Failed to rename', false); }
  };

  if (isLoading) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
    </div>
  );
  if (!tree) return null;

  // Group direct children by department
  const deptMap = {};
  (tree.children || []).forEach(node => {
    const d = node.department || 'Unassigned';
    if (!deptMap[d]) deptMap[d] = [];
    deptMap[d].push(node);
  });
  const depts = Object.keys(deptMap);

  const overallProg = calcDeptProgress(tree);
  const overallPct  = dpct(overallProg);

  if (depts.length === 0) return (
    <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
      <p className="text-sm font-medium">No department subtasks found.</p>
      <p className="text-xs">Add subtasks with department assignments and they'll appear here as columns.</p>
    </div>
  );

  // Build a map of deptTask → manager for display
  const deptManagerMap = {};
  (tree?.children || []).forEach(node => {
    const d = node.department || 'Unassigned';
    if (!deptManagerMap[d] && node.assignedTo) deptManagerMap[d] = node.assignedTo;
  });

  const deptTaskCountMap = {};
  (tree?.children || []).forEach(node => {
    const d = node.department || 'Unassigned';
    if (!deptTaskCountMap[d]) deptTaskCountMap[d] = { tasks: 0, subtasks: 0 };
    deptTaskCountMap[d].tasks += 1;
    deptTaskCountMap[d].subtasks += (node.children || []).length;
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toast */}
      {toast && (
        <div className={clsx('fixed top-4 right-4 z-[60] px-4 py-2 rounded-lg shadow-lg text-sm font-medium text-white', toast.ok ? 'bg-green-600' : 'bg-red-600')}>
          {toast.msg}
        </div>
      )}

      {/* ── Root project context banner ── */}
      <div className="flex-shrink-0 px-6 py-3 bg-gradient-to-r from-slate-800 to-slate-700 border-b border-slate-900 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-white/50 uppercase tracking-widest font-semibold">Cross-Department Project</p>
            <h2 className="text-sm font-bold text-white truncate">{tree?.title}</h2>
            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
              {rootTask?.assignedTo && (
                <span className="text-[10px] text-white/60">
                  Owner: {rootTask.assignedTo.firstName} {rootTask.assignedTo.lastName}
                </span>
              )}
              {!rootTask?.assignedTo && rootTask?.assignedBy && (
                <span className="text-[10px] text-white/60">
                  Created by {rootTask.assignedBy.firstName} {rootTask.assignedBy.lastName}
                </span>
              )}
              {rootTask?.dueDate && (
                <span className="text-[10px] text-white/60">
                  · Deadline {format(new Date(rootTask.dueDate), 'dd MMM yyyy')}
                </span>
              )}
              {rootTask?.priority && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/10 text-white/80 capitalize">
                  {rootTask.priority}
                </span>
              )}
            </div>
          </div>
        </div>
        {/* Dept summary chips */}
        <div className="flex gap-2 flex-wrap">
          {depts.map(d => {
            const mgr = deptManagerMap[d];
            const counts = deptTaskCountMap[d] || {};
            const cfg = dc(d);
            return (
              <div key={d} className={clsx('flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border', cfg.light, cfg.border)}>
                <span className={clsx('text-[10px] font-bold', cfg.text)}>{d === 'Accounts & Finance' ? 'Finance' : d}</span>
                {mgr && (
                  <>
                    <span className="text-gray-300 text-[10px]">·</span>
                    <span className="text-[10px] text-gray-500">{mgr.firstName} {mgr.lastName}</span>
                  </>
                )}
                <span className="text-[10px] text-gray-400">· {counts.subtasks || 0} subtasks</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Overall progress strip */}
      <div className="flex-shrink-0 px-6 py-3 bg-white dark:bg-[#0f172a] border-b border-gray-200 dark:border-[#1b2e4a] flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-gray-200 rounded-full h-2.5 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500" style={{ width: `${overallPct}%` }} />
            </div>
            <span className="text-sm font-bold text-gray-700 dark:text-gray-300 whitespace-nowrap">{overallPct}% Overall</span>
            <span className="text-xs text-gray-400 whitespace-nowrap">{overallProg.done}/{overallProg.total} tasks</span>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {depts.map(d => {
            const p   = dpct(deptMap[d].reduce((a, n) => { const c = calcDeptProgress(n); return { done: a.done + c.done, total: a.total + c.total }; }, { done:0, total:0 }));
            const cfg = dc(d);
            return (
              <span key={d} className={clsx('text-[10px] font-semibold px-2.5 py-1 rounded-full border flex items-center gap-1', cfg.light, cfg.border, cfg.text)}>
                {d === 'Accounts & Finance' ? 'Finance' : d} <span className="font-bold">{p}%</span>
                {p === 100 && <CheckCircleSolid className="w-3 h-3 text-green-500" />}
              </span>
            );
          })}
        </div>
      </div>

      {/* Dept columns */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex gap-4 p-6 h-full items-start">
          {depts.map(dept => {
            const canEdit = isAdmin || (isManager && dept === userDept);
            return (
              <DeptHubColumn
                key={dept}
                dept={dept}
                nodes={deptMap[dept]}
                cfg={dc(dept)}
                canEdit={canEdit}
                onAddTask={handleAddTask}
                onStatusChange={handleStatusChange}
                onAddSubtask={handleAddSubtask}
                onDelete={handleDeleteTask}
                onRename={handleRenameTask}
              />
            );
          })}
        </div>
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
          'flex items-center gap-3 p-3 rounded-xl border-l-4 border border-gray-200 dark:border-[#1b2e4a] shadow-sm cursor-pointer hover:shadow-md transition-all',
          STATUS_BG[node.status] || 'bg-white dark:bg-[#0f172a] border-l-slate-300',
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
            <span className="text-xs font-semibold text-gray-900 dark:text-white truncate">{node.title}</span>
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
          <span className="text-[10px] font-bold text-gray-600 dark:text-gray-400 w-7 text-right">{node.progress || 0}%</span>
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
