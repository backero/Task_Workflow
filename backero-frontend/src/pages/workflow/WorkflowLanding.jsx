import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, BoltIcon, MagnifyingGlassIcon, FunnelIcon } from '@heroicons/react/24/outline';
import api from '../../api/axios';
import { useAuthStore } from '../../store/useAuthStore';
import { useSocketStore } from '../../store/useSocketStore';
import { format, isPast } from 'date-fns';
import { clsx } from 'clsx';
import CreateTaskModal from '../../components/workflow/CreateTaskModal';

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

function TaskCard({ task, colors }) {
  const navigate = useNavigate();
  const due = task.dueDate ? new Date(task.dueDate) : null;
  const isOverdue = due && isPast(due) && task.status !== 'Completed';

  // Subtask completion count from populated subTasks array
  const subtasks = task.subTasks || [];
  const totalSubs = subtasks.length;
  const doneSubs = subtasks.filter(s => s.status === 'Completed').length;
  const inProgressSubs = subtasks.filter(s => s.status === 'In Progress').length;

  const progress = task.progress || 0;

  return (
    <div
      onClick={() => navigate(`/workflow/${task._id}`)}
      className={clsx(
        'bg-white rounded-xl border border-gray-200 border-l-4 shadow-sm cursor-pointer',
        'hover:shadow-md hover:border-gray-300 transition-all duration-150 group',
        PRIORITY_BORDER[task.priority] || 'border-l-slate-300',
      )}
    >
      {/* Top row: status + priority */}
      <div className="flex items-center justify-between px-3.5 pt-3 pb-1.5">
        <span className={clsx('text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1', STATUS_STYLE[task.status] || 'bg-gray-100 text-gray-600')}>
          <span className={clsx('w-1.5 h-1.5 rounded-full inline-block', STATUS_DOT[task.status] || 'bg-gray-400')} />
          {task.status}
        </span>
        <span className={clsx('text-[10px] uppercase font-semibold tracking-wide', PRIORITY_TEXT[task.priority] || 'text-gray-400')}>
          {task.priority}
        </span>
      </div>

      {/* Title */}
      <p className="px-3.5 text-sm font-semibold text-gray-900 leading-snug line-clamp-2 group-hover:text-brand-700 transition-colors mb-2">
        {task.title}
      </p>

      {/* Assignee */}
      <div className="px-3.5 mb-2.5">
        {task.assignedTo ? (
          <div className="flex items-center gap-1.5">
            <div className={clsx('w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0', colors.bg)}>
              {(task.assignedTo.firstName?.[0] || '') + (task.assignedTo.lastName?.[0] || '')}
            </div>
            <span className="text-[11px] text-gray-600 font-medium truncate max-w-[130px]">
              {task.assignedTo.firstName} {task.assignedTo.lastName}
            </span>
          </div>
        ) : (
          <span className="text-[11px] text-gray-400 italic">Unassigned</span>
        )}
      </div>

      {/* Subtask summary */}
      {totalSubs > 0 && (
        <div className={clsx('mx-3.5 mb-2.5 rounded-lg px-3 py-2', colors.light)}>
          <div className="flex items-center justify-between mb-1.5">
            <span className={clsx('text-[10px] font-bold', colors.text)}>Subtasks</span>
            <span className={clsx('text-[10px] font-semibold', colors.text)}>
              {doneSubs}/{totalSubs} done
            </span>
          </div>
          {/* Mini subtask status row */}
          <div className="flex gap-1 flex-wrap">
            {subtasks.slice(0, 6).map((s, i) => (
              <span
                key={i}
                className={clsx(
                  'w-2 h-2 rounded-full flex-shrink-0',
                  s.status === 'Completed'        ? 'bg-green-500' :
                  s.status === 'In Progress'      ? 'bg-yellow-400' :
                  s.status === 'Approval Pending' ? 'bg-indigo-400' :
                  s.status === 'Changes Requested'? 'bg-orange-400' :
                  s.status === 'Assigned'         ? 'bg-blue-400' :
                                                    'bg-gray-300'
                )}
                title={s.title || s.status}
              />
            ))}
            {totalSubs > 6 && (
              <span className={clsx('text-[9px] font-bold', colors.text)}>+{totalSubs - 6}</span>
            )}
          </div>
          {inProgressSubs > 0 && (
            <p className="text-[9px] text-yellow-600 font-medium mt-1">{inProgressSubs} in progress</p>
          )}
        </div>
      )}

      {/* Progress bar + due date */}
      <div className="px-3.5 pb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-gray-400">Progress</span>
          <div className="flex items-center gap-2">
            {due && (
              <span className={clsx('text-[10px] font-semibold', isOverdue ? 'text-red-600' : 'text-gray-400')}>
                {isOverdue ? '⚠ ' : '📅 '}{format(due, 'dd MMM')}
              </span>
            )}
            <span className={clsx('text-[10px] font-bold', task.status === 'Completed' ? 'text-green-600' : 'text-gray-700')}>
              {progress}%
            </span>
          </div>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
          <div
            className={clsx('h-full rounded-full transition-all', task.status === 'Completed' ? 'bg-green-500' : 'bg-brand-500')}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Department Column ─────────────────────────────────────────────────────────

function DeptColumn({ dept, tasks, colors }) {
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
          tasks.map(task => <TaskCard key={task._id} task={task} colors={colors} />)
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

// ── Main Component ────────────────────────────────────────────────────────────

export default function WorkflowLanding() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const { socket } = useSocketStore();

  const userLevel = ROLE_LEVEL[user?.role] || 1;
  const isAdmin = userLevel >= 4;
  const isManagerOrAbove = userLevel >= 3;

  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

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

  const params = { limit: 200, rootOnly: true };
  if (!isAdmin && user?.department) params.department = user.department;
  if (statusFilter) params.status = statusFilter;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['tasks', 'workflow-board', params],
    queryFn: () => api.get('/tasks', { params }).then(r => r.data),
    refetchInterval: 5 * 60 * 1000,
  });

  const allTasks = (data?.data || []).filter(t =>
    !search || t.title.toLowerCase().includes(search.toLowerCase())
  );

  const visibleDepts = isAdmin ? ALL_DEPTS : [user?.department].filter(Boolean);

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
                {isAdmin ? 'All departments' : user?.department} · {totalTasks} main task{totalTasks !== 1 ? 's' : ''}
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

            {/* New Task */}
            {isManagerOrAbove && (
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm"
              >
                <PlusIcon className="w-4 h-4" />
                New Task
              </button>
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
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Create task modal ── */}
      {showCreate && (
        <CreateTaskModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { refetch(); qc.invalidateQueries({ queryKey: ['tasks'] }); }}
        />
      )}
    </div>
  );
}
