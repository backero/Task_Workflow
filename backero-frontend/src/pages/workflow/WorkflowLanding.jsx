import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, BoltIcon, MagnifyingGlassIcon, FunnelIcon, ChevronDownIcon, TrashIcon, ExclamationTriangleIcon, SparklesIcon, UserCircleIcon, XMarkIcon, ArrowPathIcon, ArrowDownTrayIcon, CloudArrowUpIcon, DocumentArrowDownIcon, CheckCircleIcon, ClockIcon, ArchiveBoxIcon } from '@heroicons/react/24/outline';
import api from '../../api/axios';
import { useAuthStore } from '../../store/useAuthStore';
import { useSocketStore } from '../../store/useSocketStore';
import { format, isPast } from 'date-fns';
import { clsx } from 'clsx';
import CreateTaskModal from '../../components/workflow/CreateTaskModal';
import ConfirmDialog from '../../components/common/ConfirmDialog';

// ── Constants ─────────────────────────────────────────────────────────────────

const ROLE_LEVEL = { super_admin: 7, chairman: 6, founder: 5, admin: 4, manager: 3, team_lead: 2, member: 1 };

const DEPT_COLORS = {
  Marketing:           { bg: 'bg-purple-600',  light: 'bg-purple-50',  border: 'border-purple-200', text: 'text-purple-700',  ring: 'ring-purple-200'  },
  Marketplace:         { bg: 'bg-orange-500',  light: 'bg-orange-50',  border: 'border-orange-200', text: 'text-orange-700',  ring: 'ring-orange-200'  },
  Sales:               { bg: 'bg-green-600',   light: 'bg-green-50',   border: 'border-green-200',  text: 'text-green-700',   ring: 'ring-green-200'   },
  Production:          { bg: 'bg-blue-600',    light: 'bg-blue-50',    border: 'border-blue-200',   text: 'text-blue-700',    ring: 'ring-blue-200'    },
  'R&D':               { bg: 'bg-cyan-600',    light: 'bg-cyan-50',    border: 'border-cyan-200',   text: 'text-cyan-700',    ring: 'ring-cyan-200'    },
  Operations:          { bg: 'bg-indigo-600',  light: 'bg-indigo-50',  border: 'border-indigo-200', text: 'text-indigo-700',  ring: 'ring-indigo-200'  },
  'Accounts & Finance':{ bg: 'bg-emerald-600', light: 'bg-emerald-50', border: 'border-emerald-200',text: 'text-emerald-700', ring: 'ring-emerald-200' },
  HR:                  { bg: 'bg-amber-500',   light: 'bg-amber-50',   border: 'border-amber-200',  text: 'text-amber-700',   ring: 'ring-amber-200'   },
  Management:          { bg: 'bg-slate-700',   light: 'bg-slate-50',   border: 'border-slate-200',  text: 'text-slate-700',   ring: 'ring-slate-200'   },
};

const STATUS_STYLE = {
  'Pending':          'bg-slate-100 text-slate-600',
  'Assigned':         'bg-blue-100 text-blue-700',
  'In Progress':      'bg-yellow-100 text-yellow-700',
  'Approval Pending': 'bg-indigo-100 text-indigo-700',
  'Changes Requested':'bg-orange-100 text-orange-700',
  'Completed':        'bg-green-100 text-green-700',
  'Reopened':         'bg-red-100 text-red-700',
  'Cancelled':        'bg-gray-100 text-gray-500',
};

const STATUS_DOT = {
  'Pending':          'bg-slate-400',
  'Assigned':         'bg-blue-500',
  'In Progress':      'bg-yellow-400',
  'Approval Pending': 'bg-indigo-500',
  'Changes Requested':'bg-orange-500',
  'Completed':        'bg-green-500',
  'Reopened':         'bg-red-500',
  'Cancelled':        'bg-gray-400',
};

const PRIORITY_BORDER = {
  critical: 'border-l-red-500', urgent: 'border-l-red-400',
  high: 'border-l-orange-400',  medium: 'border-l-blue-400', low: 'border-l-slate-300',
};

const PRIORITY_TEXT = {
  critical: 'text-red-600 font-bold', urgent: 'text-red-500 font-bold',
  high: 'text-orange-600', medium: 'text-blue-600', low: 'text-slate-400',
};

const ALL_DEPTS = ['Marketing','Marketplace','Sales','Production','R&D','Operations','Accounts & Finance','HR','Management'];

// ── Task Card ─────────────────────────────────────────────────────────────────

function TaskCard({ task, colors, canDelete, onDelete }) {
  const navigate  = useNavigate();
  const qc        = useQueryClient();
  const [open,          setOpen]          = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [renaming,      setRenaming]      = useState(false);
  const [renameVal,     setRenameVal]     = useState('');
  const renameRef = React.useRef(null);

  const startRename = (e) => {
    e.stopPropagation();
    setRenameVal(task.title);
    setRenaming(true);
    setTimeout(() => renameRef.current?.select(), 30);
  };

  const commitRename = async () => {
    const val = renameVal.trim();
    if (!val || val === task.title) { setRenaming(false); return; }
    try {
      await api.put(`/tasks/${task._id}`, { title: val });
      qc.invalidateQueries({ queryKey: ['tasks', 'workflow-board'] });
    } catch (e) { console.error(e); }
    setRenaming(false);
  };

  const due       = task.dueDate ? new Date(task.dueDate) : null;
  const isOverdue = due && isPast(due) && task.status !== 'Completed';
  const isDone    = task.status === 'Completed';
  const subtasks  = task.subTasks || [];
  const hasSubs   = subtasks.length > 0;
  const progress  = task.progress || 0;

  const initials = task.assignedTo
    ? ((task.assignedTo.firstName?.[0] || '') + (task.assignedTo.lastName?.[0] || '')).toUpperCase()
    : null;

  return (
    <>
    <div className={clsx('group bg-white rounded-xl border border-gray-200 border-l-4 shadow-sm transition-shadow hover:shadow-md', PRIORITY_BORDER[task.priority] || 'border-l-slate-300')}>

      {/* ── Main task row ── */}
      <div className="flex items-start gap-2 px-3 pt-3 pb-2">
        {/* Chevron toggle */}
        <div className="mt-0.5 w-4 flex-shrink-0" onClick={() => hasSubs && setOpen(p => !p)}>
          {hasSubs
            ? <ChevronDownIcon className={clsx('w-4 h-4 text-gray-400 transition-transform duration-200', !open && '-rotate-90')} />
            : <span className="w-4 block" />}
        </div>

        {/* Status dot */}
        <span className={clsx('w-2 h-2 rounded-full flex-shrink-0 mt-1', STATUS_DOT[task.status] || 'bg-gray-400')} />

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Title + status badge + actions */}
          <div className="flex items-start justify-between gap-2">
            {renaming ? (
              <input
                ref={renameRef}
                value={renameVal}
                onChange={e => setRenameVal(e.target.value)}
                onBlur={commitRename}
                onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(false); }}
                onClick={e => e.stopPropagation()}
                className="flex-1 text-xs font-semibold text-gray-900 border border-indigo-400 rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
              />
            ) : (
              <button
                onClick={() => {
                  const parentId = task.parentTask;
                  navigate(parentId ? `/workflow/${parentId}?view=dept` : `/workflow/${task._id}`);
                }}
                className="text-xs font-semibold text-gray-900 leading-snug flex-1 text-left hover:text-brand-600 transition-colors cursor-pointer">
                {task.title}
              </button>
            )}
            <div className="flex items-center gap-1 flex-shrink-0">
              <span className={clsx('text-[9px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap', STATUS_STYLE[task.status] || 'bg-gray-100 text-gray-600')}>
                {task.status}
              </span>
              {canDelete && !renaming && (
                <>
                  <button
                    onClick={startRename}
                    title="Rename task"
                    className="p-1 rounded-md bg-indigo-50 text-indigo-400 hover:bg-indigo-100 hover:text-indigo-600 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); setConfirmDelete(true); }}
                    title="Delete task"
                    className="p-1 rounded-md bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 transition-colors"
                  >
                    <TrashIcon className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Assignee + due + progress */}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {initials ? (
              <div className={clsx('w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0', colors.bg)} title={`${task.assignedTo.firstName} ${task.assignedTo.lastName}`}>
                {initials}
              </div>
            ) : (
              <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-[9px] text-gray-400">—</div>
            )}
            {due && (
              <span className={clsx('text-[10px] font-medium', isOverdue ? 'text-red-500' : 'text-gray-400')}>
                {isOverdue ? '⚠ ' : ''}{format(due, 'dd MMM')}
              </span>
            )}
            <span className={clsx('text-[10px] font-bold ml-auto', isDone ? 'text-green-600' : 'text-gray-600')}>{progress}%</span>
          </div>

          {/* Progress bar */}
          <div className="mt-1.5 w-full bg-gray-100 rounded-full h-1 overflow-hidden">
            <div className={clsx('h-full rounded-full transition-all', isDone ? 'bg-green-500' : 'bg-brand-500')} style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>

      {/* ── Subtask rows (expand/collapse) ── */}
      {hasSubs && open && (
        <div className="border-t border-gray-100">
          {subtasks.map((s, i) => {
            const sDue      = s.dueDate ? new Date(s.dueDate) : null;
            const sOverdue  = sDue && isPast(sDue) && s.status !== 'Completed';
            const sPct      = s.progress ?? (s.status === 'Completed' ? 100 : 0);
            const sInitials = s.assignedTo
              ? ((s.assignedTo.firstName?.[0] || '') + (s.assignedTo.lastName?.[0] || '')).toUpperCase()
              : null;
            return (
              <div key={i} className="flex items-start gap-2 pl-9 pr-3 py-2 border-b border-gray-50 last:border-b-0 hover:bg-gray-50/60">
                <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5', STATUS_DOT[s.status] || 'bg-gray-300')} />
                <div className="flex-1 min-w-0">
                  {/* Sub title + status */}
                  <div className="flex items-start justify-between gap-1">
                    <p className={clsx('text-[10px] font-medium leading-snug flex-1', s.status === 'Completed' ? 'line-through text-gray-400' : 'text-gray-700')}>
                      {s.title}
                    </p>
                    <span className={clsx('text-[9px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0 whitespace-nowrap', STATUS_STYLE[s.status] || 'bg-gray-100 text-gray-500')}>
                      {s.status}
                    </span>
                  </div>
                  {/* Assignee + due + progress */}
                  <div className="flex items-center gap-2 mt-1">
                    {sInitials ? (
                      <div className={clsx('w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold flex-shrink-0', colors.bg)} title={s.assignedTo ? `${s.assignedTo.firstName} ${s.assignedTo.lastName}` : ''}>
                        {sInitials}
                      </div>
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-[8px] text-gray-400">—</div>
                    )}
                    {sDue && (
                      <span className={clsx('text-[9px]', sOverdue ? 'text-red-500' : 'text-gray-400')}>
                        {sOverdue ? '⚠ ' : ''}{format(sDue, 'dd MMM')}
                      </span>
                    )}
                    <div className="flex-1 flex items-center gap-1.5 ml-auto">
                      <div className="flex-1 bg-gray-100 rounded-full h-1 overflow-hidden">
                        <div className={clsx('h-full rounded-full', s.status === 'Completed' ? 'bg-green-400' : 'bg-brand-400')} style={{ width: `${sPct}%` }} />
                      </div>
                      <span className="text-[9px] text-gray-400 font-semibold w-6 text-right">{sPct}%</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {/* Open workflow link at bottom when expanded */}
          <button
            onClick={() => {
              const parentId = task.parentTask;
              navigate(parentId ? `/workflow/${parentId}?view=dept` : `/workflow/${task._id}`);
            }}
            className={clsx('w-full text-[10px] font-semibold py-1.5 transition-colors rounded-b-xl', colors.light, colors.text, 'hover:opacity-80')}
          >
            Open Project →
          </button>
        </div>
      )}
    </div>

    <ConfirmDialog
      open={confirmDelete}
      title="Delete this task?"
      message={`"${task.title}" and all its subtasks will be permanently deleted. This cannot be undone.`}
      confirmLabel="Yes, Delete"
      confirmColor="red"
      onConfirm={() => { setConfirmDelete(false); onDelete?.(task._id, task.title); }}
      onCancel={() => setConfirmDelete(false)}
    />
    </>
  );
}

// ── Department Column ─────────────────────────────────────────────────────────

function DeptColumn({ dept, tasks, colors, canDelete, onDelete }) {
  const completed = tasks.filter(t => t.status === 'Completed').length;
  const inProgress = tasks.filter(t => t.status === 'In Progress').length;
  const overdue = tasks.filter(t => t.dueDate && isPast(new Date(t.dueDate)) && t.status !== 'Completed').length;

  return (
    <div className="flex-shrink-0 w-72 flex flex-col rounded-2xl overflow-hidden border border-gray-200 shadow-sm">
      {/* Column header */}
      <div className={clsx('px-4 pt-3.5 pb-3', colors.bg)}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-bold text-white truncate">{dept}</h3>
          <span className="text-xs font-bold text-white/90 bg-white/20 px-2 py-0.5 rounded-full">
            {tasks.length}
          </span>
        </div>
        <div className="flex items-center gap-3 text-[10px]">
          <span className="text-white/75">✅ {completed} done</span>
          {inProgress > 0 && <span className="text-yellow-200 font-semibold">🔄 {inProgress} active</span>}
          {overdue > 0 && <span className="text-red-200 font-semibold">⚠ {overdue} overdue</span>}
        </div>
      </div>

      {/* Task list */}
      <div className={clsx('flex-1 overflow-y-auto p-3 space-y-2.5', colors.light)} style={{ maxHeight: 'calc(100vh - 260px)' }}>
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10">
            <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center mb-2', colors.light)}>
              <BoltIcon className={clsx('w-5 h-5', colors.text)} />
            </div>
            <p className="text-xs text-gray-400 font-medium">No tasks yet</p>
          </div>
        ) : (
          tasks.map(task => <TaskCard key={task._id} task={task} colors={colors} canDelete={canDelete} onDelete={onDelete} />)
        )}
      </div>
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, color, icon }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3 flex items-center gap-3">
      <div className={clsx('w-9 h-9 rounded-lg flex items-center justify-center text-white text-sm font-bold flex-shrink-0', color)}>
        {icon}
      </div>
      <div>
        <p className="text-xl font-bold text-gray-900 leading-none">{value}</p>
        <p className="text-[11px] text-gray-500 font-medium mt-0.5">{label}</p>
      </div>
    </div>
  );
}

const DEPT_NAMES = ['Marketing','Marketplace','Sales','Production','R&D','Operations','Accounts & Finance','HR','Management'];
const PRIORITY_OPTS = ['critical','urgent','high','medium','low'];
const uid = () => Math.random().toString(36).slice(2);

// ── Dept Hub Modal — 2-step wizard ────────────────────────────────────────────
function DeptHubModal({ onClose, onCreated, prefill }) {
  const { user } = useAuthStore();
  const isManagerRole = (ROLE_LEVEL[user?.role] || 1) === 3;

  const [step, setStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [main, setMain] = useState({
    title: prefill?.title || '',
    description: prefill?.description || '',
    dueDate: prefill?.dueDate || '',
    priority: prefill?.priority || 'high',
  });
  const emptyRow = () => ({ id: uid(), dept: '', taskTitle: '', managerId: '', dueDate: '' });
  const [rows, setRows]     = useState([emptyRow()]);
  const [allUsers, setAll]  = useState([]);
  const [busy, setBusy]     = useState(false);
  const [err,  setErr]      = useState('');
  const setM = (k, v) => setMain(p => ({ ...p, [k]: v }));

  useEffect(() => {
    api.get('/users', { params: { limit: 300 } })
      .then(r => setAll(r.data?.data?.data || r.data?.data || []))
      .catch(() => {});
  }, []);

  const addRow    = () => setRows(p => [...p, emptyRow()]);
  const removeRow = id => setRows(p => p.filter(r => r.id !== id));
  const updateRow = (id, k, v) => setRows(p => p.map(r => r.id === id ? { ...r, [k]: v } : r));

  const managersFor = dept => {
    const mgrs = allUsers.filter(u => ['manager','team_lead','admin','founder','chairman','super_admin'].includes(u.role));
    const match = dept ? mgrs.filter(u => u.department === dept) : [];
    return match.length > 0 ? match : mgrs;
  };

  const goNext = () => {
    if (!main.title.trim()) return setErr('Project name is required');
    setErr(''); setStep(2);
  };

  const submit = async () => {
    const valid = rows.filter(r => r.dept && r.taskTitle.trim());
    if (!valid.length) return setErr('Add at least one department task');
    setBusy(true); setErr('');
    try {
      const res = await api.post('/tasks', {
        title: main.title.trim(), description: main.description || undefined,
        priority: main.priority, dueDate: main.dueDate || undefined,
        department: 'Management', status: 'Pending',
        isDeptHub: true,
      });
      const rootId = res.data?.data?.task?._id || res.data?.data?._id || res.data?.task?._id;
      for (const row of valid) {
        await api.post('/tasks', {
          title: row.taskTitle.trim(), department: row.dept,
          assignedTo: row.managerId || undefined, dueDate: row.dueDate || undefined,
          priority: main.priority, parentTask: rootId,
          status: row.managerId ? 'Assigned' : 'Pending',
        });
      }
      // If opened from a lead, link the lead to this project
      if (prefill?.leadId) {
        await api.post(`/crm/leads/${prefill.leadId}/convert-to-task`, {
          taskId: rootId,
          dueDate: main.dueDate || undefined,
        }).catch(() => {});
      }
      if (isManagerRole) {
        setSubmitted(true);
        setBusy(false);
      } else {
        onCreated(rootId);
      }
    } catch (e) {
      setErr(e?.response?.data?.message || 'Failed to create');
      setBusy(false);
    }
  };

  if (submitted) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm p-8 flex flex-col items-center text-center gap-4">
          <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
            <SparklesIcon className="w-8 h-8 text-amber-500" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 dark:text-white text-base">Sent for Admin Approval</h3>
            <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
              Your Dept Hub <span className="font-semibold text-gray-700">"{main.title}"</span> has been submitted.<br/>
              It will go live once an admin approves it.
            </p>
          </div>
          <button onClick={() => { onCreated(null); }} className="btn-primary w-full">Done</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-xl flex flex-col" style={{ maxHeight: '92vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center shadow">
              <SparklesIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-gray-900 dark:text-white text-sm">
                  {step === 1 ? 'New Cross-Dept Project' : 'Assign to Departments'}
                </h2>
                <span className="text-[10px] font-bold bg-brand-100 text-brand-600 px-2 py-0.5 rounded-full">Step {step}/2</span>
              </div>
              {step === 2 && <p className="text-[10px] text-gray-400 truncate max-w-xs">"{main.title}"</p>}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><XMarkIcon className="w-5 h-5" /></button>
        </div>

        {/* Step dots */}
        <div className="flex-shrink-0 px-6 pt-4">
          <div className="flex items-center gap-2">
            <div className={clsx('flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full', step >= 1 ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-400')}>
              <span className="w-4 h-4 rounded-full border-2 border-white/50 flex items-center justify-center text-[9px]">1</span> Project Details
            </div>
            <div className={clsx('h-px flex-1', step >= 2 ? 'bg-brand-400' : 'bg-gray-200')} />
            <div className={clsx('flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full', step >= 2 ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-400')}>
              <span className="w-4 h-4 rounded-full border-2 border-white/50 flex items-center justify-center text-[9px]">2</span> Dept Assignments
            </div>
          </div>
        </div>

        {step === 1 ? (
          <>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-xl">{err}</p>}
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">Project Name <span className="text-red-500">*</span></label>
                <input autoFocus value={main.title} onChange={e => setM('title', e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && goNext()}
                  placeholder="e.g. Launch New Soap — 2026"
                  className="input w-full text-sm font-semibold" />
                <p className="text-[10px] text-gray-400 mt-1">This project will be split across all departments you assign.</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">Description</label>
                <textarea value={main.description} onChange={e => setM('description', e.target.value)}
                  placeholder="Goal of this project…" rows={3} className="input w-full resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">Priority</label>
                  <select value={main.priority} onChange={e => setM('priority', e.target.value)} className="input w-full capitalize">
                    {PRIORITY_OPTS.map(p => <option key={p} value={p} className="capitalize">{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">Deadline</label>
                  <input type="date" value={main.dueDate} onChange={e => setM('dueDate', e.target.value)} className="input w-full" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
              <button onClick={onClose} className="btn-secondary">Cancel</button>
              <button onClick={goNext} disabled={!main.title.trim()} className="btn-primary flex-1 flex items-center justify-center gap-2">
                Next: Assign Departments <ChevronDownIcon className="w-4 h-4 -rotate-90" />
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3">
              {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-xl">{err}</p>}
              <p className="text-xs text-gray-500">For each department, set the task and assign the manager who will lead it.</p>
              {rows.map((row, idx) => (
                <div key={row.id} className={clsx('rounded-2xl border-2 p-4 space-y-3',
                  row.dept ? 'border-brand-200 bg-brand-50/30' : 'border-dashed border-gray-200 bg-white')}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-600">{row.dept || `Department ${idx + 1}`}</span>
                    {rows.length > 1 && (
                      <button onClick={() => removeRow(row.id)} className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-400">
                        <XMarkIcon className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 mb-1">Department *</label>
                      <select value={row.dept} onChange={e => updateRow(row.id, 'dept', e.target.value)} className="input w-full text-xs py-1.5">
                        <option value="">— Select —</option>
                        {DEPT_NAMES.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 mb-1">Due Date</label>
                      <input type="date" value={row.dueDate} onChange={e => updateRow(row.id, 'dueDate', e.target.value)} className="input w-full text-xs py-1.5" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 mb-1">Task for this Dept *</label>
                    <input value={row.taskTitle} onChange={e => updateRow(row.id, 'taskTitle', e.target.value)}
                      placeholder={row.dept ? `What does ${row.dept} need to do?` : 'Task title…'}
                      className="input w-full text-xs py-1.5" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 mb-1">Assign to Manager</label>
                    <select value={row.managerId} onChange={e => updateRow(row.id, 'managerId', e.target.value)} className="input w-full text-xs py-1.5">
                      <option value="">— Select manager —</option>
                      {managersFor(row.dept).map(m => (
                        <option key={m._id} value={m._id}>{m.firstName} {m.lastName}{m.designation ? ` · ${m.designation}` : ''}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
              <button onClick={addRow}
                className="w-full py-3 rounded-2xl border-2 border-dashed border-gray-200 text-xs font-semibold text-gray-400 hover:border-brand-400 hover:text-brand-500 flex items-center justify-center gap-2 transition-colors">
                <PlusIcon className="w-4 h-4" /> Add Another Department
              </button>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
              <button onClick={() => { setStep(1); setErr(''); }} className="btn-secondary flex items-center gap-1">
                <ChevronDownIcon className="w-4 h-4 rotate-90" /> Back
              </button>
              <button onClick={submit} disabled={busy || !rows.some(r => r.dept && r.taskTitle.trim())}
                className="btn-primary flex-1 flex items-center justify-center gap-2">
                {busy
                  ? <><ArrowPathIcon className="w-4 h-4 animate-spin" /> Submitting…</>
                  : isManagerRole
                    ? <><SparklesIcon className="w-4 h-4" /> Submit for Admin Approval</>
                    : <><SparklesIcon className="w-4 h-4" /> Create Project</>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Individual Task Modal ─────────────────────────────────────────────────────
function IndividualModal({ onClose, onCreated }) {
  const [form, setForm]       = useState({ title: '', description: '', department: '', assignedTo: '', priority: 'medium', dueDate: '' });
  const [members, setMembers] = useState([]);
  const [busy, setBusy]       = useState(false);
  const [err,  setErr]        = useState('');
  const [pendingApproval, setPendingApproval] = useState(false); // cross-manager assignment sent for approval
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => {
    if (!form.department) return setMembers([]);
    api.get('/users', { params: { department: form.department, limit: 100 } })
      .then(r => setMembers(r.data?.data?.data || r.data?.data || []))
      .catch(() => setMembers([]));
  }, [form.department]);

  const submit = async () => {
    if (!form.title.trim()) return setErr('Task title is required');
    if (!form.department)   return setErr('Select a department');
    setBusy(true); setErr('');
    try {
      const res = await api.post('/tasks', {
        title: form.title.trim(),
        description: form.description || undefined,
        department: form.department,
        assignedTo: form.assignedTo || undefined,
        priority: form.priority,
        dueDate: form.dueDate || undefined,
        status: form.assignedTo ? 'Assigned' : 'Pending',
      });
      const data = res.data?.data || {};
      if (data.pendingManagerAssignment) {
        // Cross-manager assignment → waiting for admin approval
        setPendingApproval(true);
        onCreated(); // refresh board (task won't appear until approved)
      } else {
        onCreated();
      }
    } catch (e) {
      setErr(e?.response?.data?.message || 'Failed to create');
      setBusy(false);
    }
  };

  // Success screen — sent for admin approval
  if (pendingApproval) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm p-8 flex flex-col items-center text-center gap-4">
          <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
            <UserCircleIcon className="w-8 h-8 text-blue-500" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 dark:text-white text-base">Sent for Admin Approval</h3>
            <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
              You assigned <span className="font-semibold text-gray-700">"{form.title}"</span> to a manager in another department.<br/>
              An admin will review and approve the assignment.<br/>
              <span className="text-blue-600 font-medium">The task will appear on the board only after approval.</span>
            </p>
          </div>
          <button onClick={onClose} className="btn-primary w-full">Done</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-green-500 flex items-center justify-center">
              <UserCircleIcon className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 dark:text-white text-sm">New Individual Task</h2>
              <p className="text-[10px] text-gray-400">Assign to a specific member</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><XMarkIcon className="w-5 h-5" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-xl">{err}</p>}
          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">Task Title <span className="text-red-500">*</span></label>
            <input autoFocus value={form.title} onChange={e => set('title', e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              placeholder="e.g. Design packaging label"
              className="input w-full" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">Description</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)}
              placeholder="Task details and instructions…" rows={2} className="input w-full resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">Department <span className="text-red-500">*</span></label>
              <select value={form.department} onChange={e => { set('department', e.target.value); set('assignedTo', ''); }} className="input w-full">
                <option value="">— Select —</option>
                {DEPT_NAMES.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">Member</label>
              <select value={form.assignedTo} onChange={e => set('assignedTo', e.target.value)} className="input w-full" disabled={!form.department}>
                <option value="">— Unassigned —</option>
                {members.map(m => (
                  <option key={m._id} value={m._id}>
                    {m.firstName} {m.lastName}{m.role === 'manager' ? ' (Manager)' : m.role === 'team_lead' ? ' (Lead)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">Priority</label>
              <select value={form.priority} onChange={e => set('priority', e.target.value)} className="input w-full capitalize">
                {PRIORITY_OPTS.map(p => <option key={p} value={p} className="capitalize">{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">Due Date</label>
              <input type="date" value={form.dueDate} onChange={e => set('dueDate', e.target.value)} className="input w-full" />
            </div>
          </div>
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={submit} disabled={busy || !form.title.trim() || !form.department} className="btn-primary flex-1 flex items-center justify-center gap-2">
            {busy ? <><ArrowPathIcon className="w-4 h-4 animate-spin" /> Creating…</> : <><UserCircleIcon className="w-4 h-4" /> Create</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Import Modal ──────────────────────────────────────────────────────────────

function ImportModal({ onClose, onImported }) {
  const { user } = useAuthStore();
  const [file,        setFile]        = useState(null);
  const [dragging,    setDragging]    = useState(false);
  const [importing,   setImporting]   = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [result,      setResult]      = useState(null); // { summary, results }
  const [err,         setErr]         = useState('');

  const handleFile = (f) => {
    if (!f) return;
    const ext = f.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'csv'].includes(ext)) { setErr('Only .xlsx and .csv files are accepted.'); return; }
    setFile(f); setErr(''); setResult(null);
  };

  const onDrop = (e) => {
    e.preventDefault(); setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const downloadTemplate = async () => {
    setDownloading(true);
    try {
      const token = useAuthStore.getState().token;
      const res = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/tasks/import/template`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = 'backero-task-import-template.xlsx';
      a.click(); URL.revokeObjectURL(url);
    } catch (e) {
      setErr('Failed to download template. Try again.');
    } finally { setDownloading(false); }
  };

  const submit = async () => {
    if (!file) return;
    setImporting(true); setErr('');
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await api.post('/tasks/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setResult(res.data?.data || res.data);
      onImported?.();
    } catch (e) {
      setErr(e?.response?.data?.message || 'Import failed. Check the file and try again.');
    } finally { setImporting(false); }
  };

  const statusLabel = { created: 'Created', pending_hub_approval: 'Pending Hub Approval', pending_assignment: 'Pending Assignment', failed: 'Failed' };
  const statusColor = { created: 'text-green-600 bg-green-50', pending_hub_approval: 'text-amber-600 bg-amber-50', pending_assignment: 'text-blue-600 bg-blue-50', failed: 'text-red-600 bg-red-50' };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col" style={{ maxHeight: '90vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow">
              <CloudArrowUpIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 dark:text-white text-sm">Bulk Task Import</h2>
              <p className="text-[10px] text-gray-400">Upload .xlsx or .csv — max 200 rows</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* Download template */}
          <div className="flex items-center justify-between bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3">
            <div>
              <p className="text-xs font-bold text-indigo-800">Step 1 — Download Template</p>
              <p className="text-[10px] text-indigo-500 mt-0.5">Fill in the template then upload it below</p>
            </div>
            <button
              onClick={downloadTemplate}
              disabled={downloading}
              className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50 flex-shrink-0">
              {downloading
                ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                : <DocumentArrowDownIcon className="w-3.5 h-3.5" />}
              {downloading ? 'Downloading…' : 'Download Template'}
            </button>
          </div>

          {/* File drop zone */}
          {!result && (
            <div>
              <p className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">Step 2 — Upload Filled File</p>
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => document.getElementById('import-file-input').click()}
                className={clsx(
                  'border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-colors',
                  dragging ? 'border-indigo-400 bg-indigo-50' : file ? 'border-green-300 bg-green-50' : 'border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/40'
                )}>
                <input
                  id="import-file-input"
                  type="file"
                  accept=".xlsx,.csv"
                  className="hidden"
                  onChange={e => handleFile(e.target.files[0])}
                />
                {file ? (
                  <>
                    <CheckCircleIcon className="w-8 h-8 text-green-500 mb-2" />
                    <p className="text-sm font-bold text-green-700">{file.name}</p>
                    <p className="text-[10px] text-green-500 mt-1">{(file.size / 1024).toFixed(1)} KB — click to change</p>
                  </>
                ) : (
                  <>
                    <CloudArrowUpIcon className="w-8 h-8 text-gray-300 mb-2" />
                    <p className="text-sm font-semibold text-gray-500">Drag & drop or click to browse</p>
                    <p className="text-[10px] text-gray-400 mt-1">.xlsx or .csv accepted</p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Rules reminder */}
          {!result && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 space-y-1.5">
              <p className="text-[10px] font-bold text-gray-600 uppercase tracking-wide">How approvals work</p>
              <div className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 flex-shrink-0" />
                <p className="text-[10px] text-gray-500"><span className="font-semibold text-amber-700">isDeptHub = true</span> by a Manager → Admin approval required</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 flex-shrink-0" />
                <p className="text-[10px] text-gray-500"><span className="font-semibold text-blue-700">Manager → another Manager</span> assignment → Admin approval required</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 mt-1.5 flex-shrink-0" />
                <p className="text-[10px] text-gray-500">All other tasks → Created immediately</p>
              </div>
            </div>
          )}

          {/* Error */}
          {err && <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-xl">{err}</p>}

          {/* Results */}
          {result && (
            <div className="space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-3 text-center">
                  <p className="text-xl font-black text-green-700">{result.summary?.imported ?? 0}</p>
                  <p className="text-[10px] font-semibold text-green-600 mt-0.5">Created</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-3 text-center">
                  <p className="text-xl font-black text-amber-700">{result.summary?.pendingApproval ?? 0}</p>
                  <p className="text-[10px] font-semibold text-amber-600 mt-0.5">Pending Approval</p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-3 text-center">
                  <p className="text-xl font-black text-red-700">{result.summary?.failed ?? 0}</p>
                  <p className="text-[10px] font-semibold text-red-600 mt-0.5">Failed</p>
                </div>
              </div>

              {/* Row-by-row results */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                  <p className="text-xs font-bold text-gray-600">Row Details ({result.results?.length} rows)</p>
                </div>
                <div className="max-h-52 overflow-y-auto divide-y divide-gray-100">
                  {(result.results || []).map((r, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] text-gray-400 font-mono flex-shrink-0">#{r.row}</span>
                        <p className="text-xs text-gray-700 truncate font-medium">{r.title}</p>
                        {r.pendingAssignee && (
                          <span className="text-[10px] text-blue-500 flex-shrink-0">→ {r.pendingAssignee}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={clsx('text-[10px] font-bold px-2 py-0.5 rounded-full', statusColor[r.status] || 'bg-gray-100 text-gray-500')}>
                          {statusLabel[r.status] || r.status}
                        </span>
                        {r.reason && <span className="text-[10px] text-red-400 max-w-[120px] truncate" title={r.reason}>{r.reason}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
          {result ? (
            <button onClick={onClose} className="btn-primary flex-1">Done</button>
          ) : (
            <>
              <button onClick={onClose} className="btn-secondary">Cancel</button>
              <button
                onClick={submit}
                disabled={!file || importing}
                className="btn-primary flex-1 flex items-center justify-center gap-2">
                {importing
                  ? <><ArrowPathIcon className="w-4 h-4 animate-spin" /> Importing…</>
                  : <><CloudArrowUpIcon className="w-4 h-4" /> Import Tasks</>}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function WorkflowLanding() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const { socket } = useSocketStore();

  const userLevel = ROLE_LEVEL[user?.role] || 1;
  const isAdmin = userLevel >= 4;
  const isManagerOrAbove = userLevel >= 3;

  // Pre-fill from lead conversion (navigate from LeadDetails with state.fromLead)
  const fromLead = location.state?.fromLead || null;

  const [showCreate,    setShowCreate]    = useState(false); // legacy, keep for safety
  const [showDeptHub,   setShowDeptHub]   = useState(!!fromLead); // auto-open if from lead
  const [leadPrefill,   setLeadPrefill]   = useState(fromLead ? { ...fromLead, leadId: fromLead.id } : null);
  const [showIndividual,setShowIndividual]= useState(false);
  const [showImport,    setShowImport]    = useState(false);
  const [newTaskOpen,   setNewTaskOpen]   = useState(false);
  const [statusFilter,  setStatusFilter]  = useState('');
  const [search,        setSearch]        = useState('');
  const [confirmDelAll, setConfirmDelAll] = useState(false);
  const [deletingAll,   setDeletingAll]   = useState(false);
  const [showArchived,  setShowArchived]  = useState(false);

  const handleDeleteAll = async () => {
    setDeletingAll(true);
    try {
      const res = await api.get('/tasks', { params: { limit: 200, rootOnly: 'true' } });
      const roots = res.data?.data?.data || res.data?.data || [];
      await Promise.all(roots.map(t => api.delete(`/tasks/${t._id}`).catch(() => {})));
      qc.invalidateQueries({ queryKey: ['tasks', 'workflow-board'] });
      setConfirmDelAll(false);
    } catch (e) {
      console.error(e);
    } finally { setDeletingAll(false); }
  };

  // Clear router state so refresh doesn't re-open the modal
  useEffect(() => {
    if (fromLead) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Real-time: refresh board when any task changes
  const refreshBoard = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['tasks', 'workflow-board'] });
  }, [qc]);

  useEffect(() => {
    if (!socket) return;
    socket.on('task_created', refreshBoard);
    socket.on('task_updated', refreshBoard);
    return () => {
      socket.off('task_created', refreshBoard);
      socket.off('task_updated', refreshBoard);
    };
  }, [socket, refreshBoard]);

  const [rejectModal, setRejectModal] = useState(null); // { taskId, title }
  const [rejectNote,  setRejectNote]  = useState('');
  const [hubBusy,     setHubBusy]     = useState(null); // taskId being processed

  const { data: pendingHubsData, refetch: refetchPendingHubs } = useQuery({
    queryKey: ['pending-hubs'],
    queryFn: () => api.get('/tasks', { params: { pendingHubApproval: 'true', limit: 50 } }).then(r => r.data),
    enabled: isAdmin,
    refetchInterval: 60 * 1000,
  });
  const pendingHubs = pendingHubsData?.data?.data || pendingHubsData?.data || [];

  const { data: pendingAssignData, refetch: refetchPendingAssign } = useQuery({
    queryKey: ['pending-manager-assignments'],
    queryFn: () => api.get('/tasks', { params: { pendingManagerAssignment: 'true', limit: 50 } }).then(r => r.data),
    enabled: isAdmin,
    refetchInterval: 60 * 1000,
  });
  const pendingAssignments = pendingAssignData?.data?.data || pendingAssignData?.data || [];

  const [assignRejectModal, setAssignRejectModal] = useState(null);
  const [assignRejectNote, setAssignRejectNote]   = useState('');
  const [assignBusy, setAssignBusy] = useState(null);

  const handleAssignApprove = async (taskId) => {
    setAssignBusy(taskId);
    try {
      await api.post(`/tasks/${taskId}/manager-assign-approve`);
      refetchPendingAssign();
      qc.invalidateQueries({ queryKey: ['tasks', 'workflow-board'] });
    } catch (e) { console.error(e); }
    finally { setAssignBusy(null); }
  };

  const handleAssignReject = async () => {
    if (!assignRejectModal) return;
    setAssignBusy(assignRejectModal.taskId);
    try {
      await api.post(`/tasks/${assignRejectModal.taskId}/manager-assign-reject`, { notes: assignRejectNote });
      setAssignRejectModal(null); setAssignRejectNote('');
      refetchPendingAssign();
    } catch (e) { console.error(e); }
    finally { setAssignBusy(null); }
  };

  const handleHubApprove = async (taskId) => {
    setHubBusy(taskId);
    try {
      await api.post(`/tasks/${taskId}/hub-approve`);
      refetchPendingHubs();
      qc.invalidateQueries({ queryKey: ['tasks', 'workflow-board'] });
    } catch (e) { console.error(e); }
    finally { setHubBusy(null); }
  };

  const handleHubReject = async () => {
    if (!rejectModal) return;
    setHubBusy(rejectModal.taskId);
    try {
      await api.post(`/tasks/${rejectModal.taskId}/hub-reject`, { notes: rejectNote });
      setRejectModal(null); setRejectNote('');
      refetchPendingHubs();
    } catch (e) { console.error(e); }
    finally { setHubBusy(null); }
  };

  const handleDeleteTask = async (taskId, title) => {
    try {
      await api.delete(`/tasks/${taskId}`);
      qc.invalidateQueries({ queryKey: ['tasks', 'workflow-board'] });
    } catch (e) { console.error('Delete failed', e); }
  };

  const params = { limit: 200 };
  if (statusFilter) params.status = statusFilter;
  if (showArchived) params.archived = 'true';

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['tasks', 'workflow-board', params],
    queryFn: () => api.get('/tasks', { params }).then(r => r.data),
    refetchInterval: 5 * 60 * 1000,
  });

  // All fetched tasks — build id→task map for dedup
  const rawTasks = data?.data || [];
  const taskIdSet = new Set(rawTasks.map(t => t._id));
  const taskMap   = new Map(rawTasks.map(t => [t._id, t]));

  // Show a task in the board if:
  // 1. It has no parent (root task), OR
  // 2. Its parent is NOT in the fetched result set (parent hidden by role filter), OR
  // 3. Its parent is in a DIFFERENT department column (cross-dept task — e.g. Production
  //    task whose root parent lives in the Management column should still show in Production).
  // Hide only when the parent is in the SAME department (avoids double-rendering subtasks).
  const allTasks = rawTasks.filter(t => {
    const parentId = t.parentTask?._id || t.parentTask;
    const passesSearch = !search || t.title.toLowerCase().includes(search.toLowerCase());
    if (!passesSearch) return false;
    if (!parentId) return true;                        // root task — always show
    if (!taskIdSet.has(parentId)) return true;         // parent not fetched — show
    const parent = taskMap.get(parentId);
    if (parent && parent.department !== t.department) return true; // cross-dept — show
    return false;                                      // same-dept child — hide (shown inside card)
  });

  const visibleDepts = ALL_DEPTS; // managers and above see all dept columns

  const tasksByDept = {};
  visibleDepts.forEach(d => { tasksByDept[d] = []; });
  allTasks.forEach(t => {
    if (tasksByDept[t.department] !== undefined) tasksByDept[t.department].push(t);
  });

  const totalTasks      = allTasks.length;
  const completedCount  = allTasks.filter(t => t.status === 'Completed').length;
  const inProgressCount = allTasks.filter(t => t.status === 'In Progress').length;
  const pendingApproval = allTasks.filter(t => t.status === 'Approval Pending').length;
  const overdueCount    = allTasks.filter(t => t.dueDate && isPast(new Date(t.dueDate)) && t.status !== 'Completed').length;

  return (
    <div className="space-y-5">

      {/* ── Archived mode banner ── */}
      {showArchived && (
        <div className="flex items-center gap-3 px-4 py-3 bg-indigo-50 border border-indigo-200 rounded-2xl">
          <ArchiveBoxIcon className="w-4 h-4 text-indigo-500 flex-shrink-0" />
          <p className="text-xs font-semibold text-indigo-700 flex-1">Showing archived (completed) tasks. Active tasks are hidden.</p>
          <button onClick={() => setShowArchived(false)} className="text-xs text-indigo-500 hover:text-indigo-700 font-semibold">
            Back to Active
          </button>
        </div>
      )}

      {/* ── Page header ── */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 shadow-sm px-6 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">

          {/* Title */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center shadow-sm flex-shrink-0">
              <BoltIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">Workflow Board</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                All departments · {totalTasks} main task{totalTasks !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Search */}
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search tasks…"
                className="pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 w-40 bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              />
            </div>

            {/* Status filter */}
            <div className="relative">
              <FunnelIcon className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="pl-8 pr-8 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 bg-gray-50 dark:bg-gray-800 dark:border-gray-700 text-gray-700 dark:text-gray-300"
              >
                <option value="">All Status</option>
                {['Pending','Assigned','In Progress','Approval Pending','Changes Requested','Completed','Reopened'].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Archived toggle — manager/admin only */}
            {isManagerOrAbove && (
              <button
                onClick={() => setShowArchived(p => !p)}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-2 border text-sm font-semibold rounded-xl transition-colors',
                  showArchived
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : 'border-gray-200 text-gray-500 hover:bg-gray-50',
                )}
              >
                <ArchiveBoxIcon className="w-4 h-4" />
                {showArchived ? 'Archived' : 'Archived'}
              </button>
            )}

            {/* Delete All — admin only */}
            {isAdmin && (
              confirmDelAll ? (
                <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-xl px-3 py-1.5">
                  <ExclamationTriangleIcon className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                  <span className="text-xs text-red-600 font-semibold whitespace-nowrap">Delete all tasks?</span>
                  <button onClick={handleDeleteAll} disabled={deletingAll}
                    className="text-xs px-2.5 py-1 rounded-lg bg-red-500 hover:bg-red-600 text-white font-bold disabled:opacity-50">
                    {deletingAll ? '…' : 'Yes, Delete All'}
                  </button>
                  <button onClick={() => setConfirmDelAll(false)}
                    className="text-xs px-2 py-1 rounded-lg bg-white border border-gray-200 text-gray-500 hover:bg-gray-50">
                    Cancel
                  </button>
                </div>
              ) : (
                <button onClick={() => setConfirmDelAll(true)}
                  className="flex items-center gap-1.5 px-3 py-2 border border-red-200 hover:bg-red-50 text-red-400 hover:text-red-600 text-sm font-semibold rounded-xl transition-colors">
                  <TrashIcon className="w-4 h-4" /> Delete All
                </button>
              )
            )}

            {/* New Task — split dropdown */}
            {isManagerOrAbove && (
              <div className="relative">
                <button onClick={() => setNewTaskOpen(p => !p)}
                  onBlur={() => setTimeout(() => setNewTaskOpen(false), 150)}
                  className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm">
                  <PlusIcon className="w-4 h-4" /> New Task <ChevronDownIcon className={clsx('w-3.5 h-3.5 transition-transform', newTaskOpen && 'rotate-180')} />
                </button>
                {newTaskOpen && (
                  <div className="absolute right-0 top-full mt-2 z-50 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden w-56">
                    <button onMouseDown={() => { setShowDeptHub(true); setNewTaskOpen(false); }}
                      className="w-full flex items-start gap-3 px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border-b border-gray-100 dark:border-gray-700">
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <SparklesIcon className="w-4 h-4 text-white" />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-bold text-gray-900 dark:text-white">Dept Hub</p>
                        <p className="text-[10px] text-gray-400 leading-snug">Cross-department project</p>
                      </div>
                    </button>
                    <button onMouseDown={() => { setShowIndividual(true); setNewTaskOpen(false); }}
                      className="w-full flex items-start gap-3 px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border-b border-gray-100 dark:border-gray-700">
                      <div className="w-8 h-8 rounded-xl bg-green-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <UserCircleIcon className="w-4 h-4 text-white" />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-bold text-gray-900 dark:text-white">Individual</p>
                        <p className="text-[10px] text-gray-400 leading-snug">Assign to a member</p>
                      </div>
                    </button>
                    <button onMouseDown={() => { setShowImport(true); setNewTaskOpen(false); }}
                      className="w-full flex items-start gap-3 px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                      <div className="w-8 h-8 rounded-xl bg-indigo-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <CloudArrowUpIcon className="w-4 h-4 text-white" />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-bold text-gray-900 dark:text-white">Import</p>
                        <p className="text-[10px] text-gray-400 leading-snug">Bulk import from Excel / CSV</p>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Tasks"      value={totalTasks}      color="bg-brand-600"   icon="📋" />
        <StatCard label="In Progress"      value={inProgressCount} color="bg-yellow-500"  icon="🔄" />
        <StatCard label="Completed"        value={completedCount}  color="bg-green-500"   icon="✅" />
        <StatCard label="Pending Approval" value={pendingApproval} color="bg-indigo-500"  icon="⏳" />
        {overdueCount > 0 && (
          <StatCard label="Overdue"        value={overdueCount}    color="bg-red-500"     icon="⚠️" />
        )}
      </div>

      {/* ── Pending Dept Hub Approvals (admin only) ── */}
      {isAdmin && pendingHubs.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-400 flex items-center justify-center flex-shrink-0">
              <SparklesIcon className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-amber-800">Pending Dept Hub Approvals</h3>
              <p className="text-[10px] text-amber-600">{pendingHubs.length} request{pendingHubs.length !== 1 ? 's' : ''} waiting for your review</p>
            </div>
          </div>
          <div className="space-y-2">
            {pendingHubs.map(hub => (
              <div key={hub._id} className="bg-white rounded-xl border border-amber-200 px-4 py-3 flex items-center justify-between gap-3 flex-wrap shadow-sm">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{hub.title}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    By {hub.assignedBy?.firstName} {hub.assignedBy?.lastName}
                    {hub.dueDate ? ` · Due ${format(new Date(hub.dueDate), 'dd MMM yyyy')}` : ''}
                    {' · '}<span className={clsx('font-semibold capitalize', hub.priority === 'critical' || hub.priority === 'urgent' ? 'text-red-500' : hub.priority === 'high' ? 'text-orange-500' : 'text-gray-500')}>{hub.priority}</span>
                  </p>
                  {hub.description && <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-1">{hub.description}</p>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleHubApprove(hub._id)}
                    disabled={!!hubBusy}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors">
                    {hubBusy === hub._id ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : '✓'} Approve
                  </button>
                  <button
                    onClick={() => { setRejectModal({ taskId: hub._id, title: hub.title }); setRejectNote(''); }}
                    disabled={!!hubBusy}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-red-50 border border-red-200 text-red-500 hover:text-red-600 text-xs font-bold rounded-lg transition-colors disabled:opacity-50">
                    ✕ Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Pending Manager Assignments (admin only) ── */}
      {isAdmin && pendingAssignments.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-500 flex items-center justify-center flex-shrink-0">
              <UserCircleIcon className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-blue-800">Pending Manager Assignments</h3>
              <p className="text-[10px] text-blue-600">{pendingAssignments.length} cross-manager assignment{pendingAssignments.length !== 1 ? 's' : ''} need your approval</p>
            </div>
          </div>
          <div className="space-y-2">
            {pendingAssignments.map(task => {
              const pm = task.pendingManagerAssignment || {};
              return (
                <div key={task._id} className="bg-white rounded-xl border border-blue-200 px-4 py-3 flex items-center justify-between gap-3 flex-wrap shadow-sm">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">{task.title}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      <span className="font-semibold text-gray-600">{task.assignedBy?.firstName} {task.assignedBy?.lastName}</span>
                      {' → '}
                      <span className="font-semibold text-blue-600">{pm.pendingAssignee?.firstName || '—'} {pm.pendingAssignee?.lastName || ''}</span>
                      {pm.pendingAssignee?.department && <span className="ml-1 text-gray-400">({pm.pendingAssignee.department})</span>}
                      {task.dueDate ? ` · Due ${format(new Date(task.dueDate), 'dd MMM')}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleAssignApprove(task._id)}
                      disabled={!!assignBusy}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors">
                      {assignBusy === task._id ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : '✓'} Approve
                    </button>
                    <button
                      onClick={() => { setAssignRejectModal({ taskId: task._id, title: task.title }); setAssignRejectNote(''); }}
                      disabled={!!assignBusy}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-red-50 border border-red-200 text-red-500 hover:text-red-600 text-xs font-bold rounded-lg transition-colors disabled:opacity-50">
                      ✕ Reject
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Reject assignment modal ── */}
      {assignRejectModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-bold text-gray-900 dark:text-white text-sm">Reject Assignment</h3>
            <p className="text-xs text-gray-500">Rejecting assignment for <span className="font-semibold text-gray-700">"{assignRejectModal.title}"</span>. The requesting manager will be notified.</p>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">Reason (optional)</label>
              <textarea
                value={assignRejectNote}
                onChange={e => setAssignRejectNote(e.target.value)}
                placeholder="Why is this assignment not approved?"
                rows={3}
                className="input w-full resize-none text-xs"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setAssignRejectModal(null)} className="btn-secondary flex-1 text-xs">Cancel</button>
              <button
                onClick={handleAssignReject}
                disabled={!!assignBusy}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-50">
                {assignBusy ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : null} Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reject hub modal ── */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-bold text-gray-900 dark:text-white text-sm">Reject Dept Hub</h3>
            <p className="text-xs text-gray-500">Rejecting <span className="font-semibold text-gray-700">"{rejectModal.title}"</span>. The manager will be notified.</p>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">Reason (optional)</label>
              <textarea
                value={rejectNote}
                onChange={e => setRejectNote(e.target.value)}
                placeholder="Tell the manager why this hub was rejected…"
                rows={3}
                className="input w-full resize-none text-xs"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setRejectModal(null)} className="btn-secondary flex-1 text-xs">Cancel</button>
              <button
                onClick={handleHubReject}
                disabled={!!hubBusy}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-50">
                {hubBusy ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : null} Reject Hub
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Board ── */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-500">Loading board…</p>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-4" style={{ minWidth: `${visibleDepts.length * 300}px` }}>
            {visibleDepts.map(dept => (
              <DeptColumn
                key={dept}
                dept={dept}
                tasks={tasksByDept[dept] || []}
                colors={DEPT_COLORS[dept] || DEPT_COLORS.Management}
                canDelete={isManagerOrAbove}
                onDelete={handleDeleteTask}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Dept Hub modal ── */}
      {showDeptHub && (
        <DeptHubModal
          prefill={leadPrefill}
          onClose={() => { setShowDeptHub(false); setLeadPrefill(null); }}
          onCreated={(id) => {
            setShowDeptHub(false);
            setLeadPrefill(null);
            refetch();
            qc.invalidateQueries({ queryKey: ['tasks'] });
            qc.invalidateQueries({ queryKey: ['crm'] });
            // If came from a lead, go to dept-workflow to see the project
            if (leadPrefill?.leadId) {
              navigate(`/dept-workflow?project=${id}`);
            } else if (id) {
              navigate(`/workflow/${id}`);
            }
          }}
        />
      )}

      {/* ── Individual task modal ── */}
      {showIndividual && (
        <IndividualModal
          onClose={() => setShowIndividual(false)}
          onCreated={() => {
            setShowIndividual(false);
            refetch();
            qc.invalidateQueries({ queryKey: ['tasks'] });
          }}
        />
      )}

      {/* ── Create task modal (legacy) ── */}
      {showCreate && (
        <CreateTaskModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { refetch(); qc.invalidateQueries({ queryKey: ['tasks'] }); }}
        />
      )}

      {/* ── Import modal ── */}
      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onImported={() => {
            qc.invalidateQueries({ queryKey: ['tasks'] });
            qc.invalidateQueries({ queryKey: ['pending-hubs'] });
            qc.invalidateQueries({ queryKey: ['pending-manager-assignments'] });
            refetch();
          }}
        />
      )}
    </div>
  );
}
