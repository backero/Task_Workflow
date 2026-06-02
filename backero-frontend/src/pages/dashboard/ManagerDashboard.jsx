import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import {
  ClipboardDocumentListIcon, ExclamationTriangleIcon, ClockIcon, CheckCircleIcon,
  UserGroupIcon, CubeIcon, ArrowRightIcon, BoltIcon, ViewColumnsIcon,
  QuestionMarkCircleIcon, SparklesIcon,
} from '@heroicons/react/24/outline';
import api from '../../api/axios';
import { useAuthStore } from '../../store/useAuthStore';
import { format, isToday, isTomorrow, isPast, formatDistanceToNow } from 'date-fns';
import { clsx } from 'clsx';

// ── Timer ──────────────────────────────────────────────────────────────────────
function useElapsedMs(startDate, isRunning) {
  const [ms, setMs] = useState(() => startDate && isRunning ? Date.now() - new Date(startDate).getTime() : 0);
  useEffect(() => {
    if (!startDate || !isRunning) return;
    const start = new Date(startDate).getTime();
    const id = setInterval(() => setMs(Date.now() - start), 1000);
    return () => clearInterval(id);
  }, [startDate, isRunning]);
  return ms;
}
function formatDuration(ms) {
  if (!ms || ms <= 0) return null;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `<1m`;
}
function InProgressTimer({ startDate }) {
  const ms = useElapsedMs(startDate, true);
  const label = formatDuration(ms);
  if (!label) return null;
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-mono font-bold
                     bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400
                     px-1.5 py-0.5 rounded-lg">
      <ClockIcon className="w-3 h-3" />{label}
    </span>
  );
}

// ── Constants ──────────────────────────────────────────────────────────────────
const PRIORITY_COLORS = { critical: 'badge-red', urgent: 'badge-red', high: 'badge-orange', medium: 'badge-yellow', low: 'badge-gray' };
const STATUS_COLORS   = { 'Completed': 'badge-green', 'In Progress': 'badge-yellow', 'Assigned': 'badge-blue', 'Approval Pending': 'badge-purple', 'Changes Requested': 'badge-red', 'Pending': 'badge-gray' };
const STATUS_BAR_COLOR = { 'Completed': '#22c55e', 'In Progress': '#f97316', 'Assigned': '#3b82f6', 'Approval Pending': '#9333ea', 'Changes Requested': '#ef4444', 'Pending': '#94a3b8' };

const AVATAR_GRADS = [
  'linear-gradient(135deg,#3b82f6 0%,#1d4ed8 100%)',
  'linear-gradient(135deg,#8b5cf6 0%,#5b21b6 100%)',
  'linear-gradient(135deg,#14b8a6 0%,#0f766e 100%)',
  'linear-gradient(135deg,#f59e0b 0%,#b45309 100%)',
  'linear-gradient(135deg,#ec4899 0%,#9d174d 100%)',
  'linear-gradient(135deg,#22c55e 0%,#15803d 100%)',
  'linear-gradient(135deg,#f43f5e 0%,#9f1239 100%)',
  'linear-gradient(135deg,#06b6d4 0%,#0e7490 100%)',
];

const KPI_CFG = {
  blue:   { bg: 'bg-blue-50 dark:bg-blue-900/20',     icon: 'text-blue-600 dark:text-blue-400',     grad: 'linear-gradient(135deg,#3b82f6,#1d4ed8)' },
  red:    { bg: 'bg-red-50 dark:bg-red-900/20',       icon: 'text-red-600 dark:text-red-400',       grad: 'linear-gradient(135deg,#ef4444,#b91c1c)' },
  purple: { bg: 'bg-purple-50 dark:bg-purple-900/20', icon: 'text-purple-600 dark:text-purple-400', grad: 'linear-gradient(135deg,#a855f7,#7c3aed)' },
  green:  { bg: 'bg-emerald-50 dark:bg-emerald-900/20', icon: 'text-emerald-600 dark:text-emerald-400', grad: 'linear-gradient(135deg,#22c55e,#15803d)' },
  rose:   { bg: 'bg-rose-50 dark:bg-rose-900/20',     icon: 'text-rose-600 dark:text-rose-400',     grad: 'linear-gradient(135deg,#f43f5e,#9f1239)' },
  amber:  { bg: 'bg-amber-50 dark:bg-amber-900/20',   icon: 'text-amber-600 dark:text-amber-400',   grad: 'linear-gradient(135deg,#f59e0b,#b45309)' },
};

function getDueLabel(dueDate) {
  const d = new Date(dueDate);
  if (isPast(d) && !isToday(d)) return { label: 'Overdue',      cls: 'text-red-600 dark:text-red-400 font-bold' };
  if (isToday(d))               return { label: 'Due Today',    cls: 'text-orange-600 dark:text-orange-400 font-semibold' };
  if (isTomorrow(d))            return { label: 'Due Tomorrow', cls: 'text-amber-600 dark:text-amber-400 font-medium' };
  return { label: format(d, 'dd MMM'), cls: 'text-slate-400 dark:text-slate-500' };
}

// ── KPI Card ───────────────────────────────────────────────────────────────────
function KPICard({ icon: Icon, label, value, sub, color = 'blue', to, alert }) {
  const cfg = KPI_CFG[color] || KPI_CFG.blue;
  const content = (
    <div className={clsx('kpi-card p-5 flex flex-col gap-3', to && 'cursor-pointer')}>
      <div className="flex items-start justify-between">
        <div className="w-11 h-11 rounded-2xl flex items-center justify-center shadow-sm" style={{ background: cfg.grad }}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        {alert > 0 && <span className="badge badge-red">{alert}</span>}
      </div>
      <div>
        <p className="text-2xl font-bold text-primary leading-none">{value}</p>
        <p className="text-sm font-semibold text-sub mt-1">{label}</p>
        {sub && <p className="text-xs text-muted mt-0.5">{sub}</p>}
      </div>
    </div>
  );
  return to ? <Link to={to}>{content}</Link> : content;
}

// ── Section head ───────────────────────────────────────────────────────────────
function SectionHead({ title, sub, to, toLabel = 'View all' }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="section-head">
        <div>
          <h3 className="font-bold text-primary text-[15px]">{title}</h3>
          {sub && <p className="text-xs text-muted mt-0.5">{sub}</p>}
        </div>
      </div>
      {to && (
        <Link to={to} className="flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400
                                  hover:text-blue-700 dark:hover:text-blue-300 transition-colors">
          {toLabel} <ArrowRightIcon className="w-3 h-3" />
        </Link>
      )}
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────────
function Empty({ icon: Icon, text }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon"><Icon className="w-6 h-6" /></div>
      <p className="text-sm text-muted">{text}</p>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function ManagerDashboard() {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const toWorkflow = (task) => {
    const parentId = task.parentTask?._id || task.parentTask;
    navigate(parentId ? `/workflow/${parentId}?view=dept` : `/workflow/${task._id}`);
  };

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'manager'],
    queryFn: () => api.get('/dashboard/manager').then((r) => r.data.dashboard),
    refetchInterval: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const d           = data || {};
  const approvals   = d.pendingApprovals || [];
  const teamTasks   = d.teamTasks || [];
  const dueSoon     = d.dueSoonTasks || [];
  const teamPerf    = d.teamPerformance || [];
  const lowStock    = d.lowStockItems || [];
  const techQueries = d.technicalQueries || { pendingCount: 0, recent: [] };

  const statusChartData = (d.taskStats || []).map((s) => ({
    name: s._id, count: s.count, fill: STATUS_BAR_COLOR[s._id] || '#94a3b8',
  }));

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="space-y-5 animate-page">

      {/* ── Hero header ── */}
      <div className="card overflow-hidden">
        <div className="relative px-6 py-5 overflow-hidden"
          style={{ background: 'linear-gradient(135deg,#1d4ed8 0%,#4f46e5 60%,#7c3aed 100%)' }}>
          <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-white/5" />
          <div className="absolute right-16 bottom-0 w-28 h-28 rounded-full bg-white/[0.04]" />
          <div className="relative flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-blue-200 text-sm font-medium mb-0.5 flex items-center gap-1.5">
                <SparklesIcon className="w-3.5 h-3.5" />
                {greeting}, {user?.firstName}
              </p>
              <h1 className="text-xl font-bold text-white leading-tight">Team Dashboard</h1>
              <p className="text-blue-200/70 text-sm mt-0.5">
                {user?.department ? `${user.department} Department` : 'All Departments'} · {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link to="/tasks/approvals" className="relative flex items-center gap-2 px-4 py-2 bg-white/15 hover:bg-white/25 text-white text-sm font-semibold rounded-xl border border-white/25 transition-colors">
                Approvals
                {approvals.length > 0 && (
                  <span className="w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                    {approvals.length}
                  </span>
                )}
              </Link>
              <Link to="/tasks/team" className="flex items-center gap-2 px-4 py-2 bg-white text-blue-700 text-sm font-bold rounded-xl hover:bg-blue-50 transition-colors shadow-sm">
                Team Tasks <ArrowRightIcon className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>

        {/* Quick stat strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-slate-100 dark:divide-[#1b2e4a]">
          {[
            { label: 'Total Tasks',   value: d.totalTasks || 0,    color: '#3b82f6' },
            { label: 'Completed',     value: d.completedThisMonth || 0, color: '#22c55e', sub: 'this month' },
            { label: 'Overdue',       value: d.overdueCount || 0,  color: d.overdueCount > 0 ? '#ef4444' : '#94a3b8' },
            { label: 'Need Approval', value: approvals.length,     color: approvals.length > 0 ? '#a855f7' : '#94a3b8' },
          ].map(s => (
            <div key={s.label} className="px-5 py-4 text-center">
              <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">{s.label}</p>
              {s.sub && <p className="text-[10px] text-slate-400">{s.sub}</p>}
            </div>
          ))}
        </div>
      </div>

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger">
        <KPICard icon={ClipboardDocumentListIcon} color="blue" label="Total Tasks" value={d.totalTasks || 0}
          sub={`${d.completedThisMonth || 0} completed this month`} to="/tasks/team" />
        <KPICard icon={ExclamationTriangleIcon} color="red" label="Overdue" value={d.overdueCount || 0}
          sub="Need immediate action" alert={d.overdueCount || 0} to="/tasks/team" />
        <KPICard icon={ClockIcon} color="purple" label="Pending Approvals" value={approvals.length}
          sub="Waiting for your review" alert={approvals.length} to="/tasks/approvals" />
        <KPICard icon={UserGroupIcon} color="green" label="Team Members" value={d.teamSize || 0}
          sub={user?.department ? `in ${user.department}` : 'across all depts'} to="/management/team" />
        <KPICard icon={QuestionMarkCircleIcon} color="rose" label="Pending Queries" value={techQueries.pendingCount}
          sub="Awaiting production reply" alert={techQueries.pendingCount} to="/crm/queries" />
      </div>

      {/* ── Status chart + Due soon ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        <div className="card p-5">
          <SectionHead title="Task Status Breakdown" sub={`${d.totalTasks || 0} total tasks`} to="/tasks/analytics" toLabel="Analytics" />
          {statusChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={statusChartData} layout="vertical" margin={{ left: 20, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} width={115} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(v) => [v, 'Tasks']}
                  contentStyle={{ fontSize: 11, borderRadius: 12, border: '1px solid rgba(148,163,184,0.2)', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}
                  cursor={{ fill: 'rgba(148,163,184,0.07)' }}
                />
                <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                  {statusChartData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Empty icon={ClipboardDocumentListIcon} text="No tasks yet" />
          )}
        </div>

        <div className="card p-5">
          <SectionHead title="Due in Next 3 Days"
            sub={`${dueSoon.length} task${dueSoon.length !== 1 ? 's' : ''} coming up`}
            to="/tasks/team" toLabel="All Tasks" />
          {dueSoon.length === 0 ? (
            <Empty icon={CheckCircleIcon} text="No tasks due in the next 3 days" />
          ) : (
            <div className="space-y-2">
              {dueSoon.map((task) => {
                const due = task.dueDate ? getDueLabel(task.dueDate) : null;
                return (
                  <div key={task._id}
                    className="flex items-center gap-3 p-3 rounded-2xl border border-slate-100 dark:border-[#1b2e4a]
                               bg-slate-50/60 dark:bg-[#0f1a2e]/60 hover:bg-white dark:hover:bg-[#17263d]/80
                               hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 cursor-pointer"
                    onClick={() => toWorkflow(task)}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{task.title}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className={`badge ${PRIORITY_COLORS[task.priority] || 'badge-gray'}`}>{task.priority}</span>
                        {task.assignedTo && (
                          <span className="text-xs text-slate-500 dark:text-slate-400">{task.assignedTo.firstName} {task.assignedTo.lastName}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {due && <span className={`text-xs ${due.cls}`}>{due.label}</span>}
                      <button onClick={(e) => { e.stopPropagation(); toWorkflow(task); }}
                        className="p-1.5 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-900/20 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                        <BoltIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Approvals + Low stock ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        <div className="card p-5">
          <SectionHead title="Pending Approvals"
            sub={`${approvals.length} task${approvals.length !== 1 ? 's' : ''} waiting`}
            to="/tasks/approvals" toLabel="Review All" />
          {approvals.length === 0 ? (
            <Empty icon={CheckCircleIcon} text="No pending approvals — all clear!" />
          ) : (
            <div className="space-y-2">
              {approvals.map((ap) => (
                <div key={ap._id}
                  className="flex items-center gap-3 p-3 rounded-2xl border border-amber-100 dark:border-amber-900/30
                             bg-amber-50/60 dark:bg-amber-900/10 hover:bg-amber-50 dark:hover:bg-amber-900/20
                             hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 cursor-pointer"
                  onClick={() => ap.taskId && toWorkflow(ap.taskId)}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{ap.taskId?.title}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className={`badge ${PRIORITY_COLORS[ap.taskId?.priority] || 'badge-gray'}`}>{ap.taskId?.priority}</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">{ap.requestedBy?.firstName} {ap.requestedBy?.lastName}</span>
                      <span className="text-xs text-slate-400">{ap.requestedAt ? formatDistanceToNow(new Date(ap.requestedAt), { addSuffix: true }) : ''}</span>
                    </div>
                  </div>
                  <Link to="/tasks/approvals" onClick={e => e.stopPropagation()}
                    className="btn-primary text-xs px-3 py-1.5 flex-shrink-0">Review</Link>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-5">
          <SectionHead title="Low Stock Alerts"
            sub={lowStock.length > 0 ? `${lowStock.length} product${lowStock.length !== 1 ? 's' : ''} below minimum` : 'All stock levels healthy'}
            to="/inventory/alerts" toLabel="View Alerts" />
          {lowStock.length === 0 ? (
            <Empty icon={CubeIcon} text="All products are well stocked" />
          ) : (
            <div className="space-y-2">
              {lowStock.map((p) => (
                <div key={p._id}
                  className="flex items-center gap-3 p-3 rounded-2xl border border-red-100 dark:border-red-900/30
                             bg-red-50/60 dark:bg-red-900/10 hover:bg-red-50 dark:hover:bg-red-900/20
                             transition-colors">
                  <div className="w-9 h-9 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                    <CubeIcon className="w-4 h-4 text-red-600 dark:text-red-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{p.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{p.sku} · {p.category}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-red-600 dark:text-red-400">{p.currentStock} {p.unit}</p>
                    <p className="text-[10px] text-slate-400">min: {p.minStockLevel}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Team performance ── */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-[#1b2e4a] flex items-center justify-between">
          <div className="section-head">
            <h3 className="font-bold text-primary text-[15px]">Team Performance</h3>
            <p className="text-xs text-muted mt-0.5">Task completion by member</p>
          </div>
          <Link to="/management/employees"
            className="flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 transition-colors">
            Full Report <ArrowRightIcon className="w-3 h-3" />
          </Link>
        </div>
        {teamPerf.length === 0 ? (
          <div className="p-5"><Empty icon={UserGroupIcon} text="No task data for team yet" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th className="text-center">Total</th>
                  <th className="text-center">Active</th>
                  <th className="text-center">Done</th>
                  <th className="text-center">Overdue</th>
                  <th>Completion</th>
                </tr>
              </thead>
              <tbody>
                {teamPerf.map((emp, i) => (
                  <tr key={emp._id || i}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-2xl flex items-center justify-center text-white text-xs font-black flex-shrink-0 shadow-sm"
                          style={{ background: AVATAR_GRADS[i % AVATAR_GRADS.length] }}>
                          {emp.user?.firstName?.[0]}{emp.user?.lastName?.[0]}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-white text-sm">
                            {emp.user?.firstName} {emp.user?.lastName}
                          </p>
                          <p className="text-[11px] text-slate-400">{emp.user?.department || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="text-center font-semibold text-slate-700 dark:text-slate-300">{emp.total}</td>
                    <td className="text-center font-semibold text-amber-600 dark:text-amber-400">{emp.inProgress || 0}</td>
                    <td className="text-center font-bold text-emerald-600 dark:text-emerald-400">{emp.completed}</td>
                    <td className="text-center">
                      <span className={clsx('font-bold', emp.overdue > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-300 dark:text-slate-600')}>
                        {emp.overdue || 0}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-slate-100 dark:bg-[#132035]/50 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${emp.completionRate || 0}%`,
                              background: emp.completionRate >= 70 ? '#22c55e' : emp.completionRate >= 40 ? '#3b82f6' : '#ef4444',
                            }} />
                        </div>
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200 w-9 text-right">
                          {Math.round(emp.completionRate || 0)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Technical queries ── */}
      <div className="card p-5">
        <SectionHead title="Technical Queries"
          sub={`${techQueries.pendingCount} pending from Sales team`}
          to="/crm/queries" toLabel="View All" />
        {techQueries.recent.length === 0 ? (
          <Empty icon={QuestionMarkCircleIcon} text="No pending technical queries" />
        ) : (
          <div className="space-y-2">
            {techQueries.recent.map((q) => (
              <div key={q._id}
                className="flex items-start gap-3 p-3 rounded-2xl border border-rose-100 dark:border-rose-900/30
                           bg-rose-50/60 dark:bg-rose-900/10 hover:bg-rose-50 dark:hover:bg-rose-900/20
                           hover:shadow-md hover:-translate-y-0.5 transition-all duration-150">
                <div className="w-8 h-8 rounded-2xl bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <QuestionMarkCircleIcon className="w-4 h-4 text-rose-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={clsx('badge', q.urgency === 'high' ? 'badge-red' : q.urgency === 'medium' ? 'badge-yellow' : 'badge-gray')}>
                      {q.urgency}
                    </span>
                    {q.leadName && <span className="text-xs text-slate-500 dark:text-slate-400">Lead: {q.leadName}</span>}
                  </div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{q.title}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-400 flex-wrap">
                    <span>By: {q.raisedBy?.firstName} {q.raisedBy?.lastName}</span>
                    {q.assignedTo
                      ? <span className="text-slate-500">→ {q.assignedTo.firstName} {q.assignedTo.lastName}</span>
                      : <span className="text-orange-500 font-semibold">Unassigned</span>
                    }
                    <span>{q.createdAt ? formatDistanceToNow(new Date(q.createdAt), { addSuffix: true }) : ''}</span>
                  </div>
                </div>
                <Link to="/crm/queries" className="btn-primary text-xs px-3 py-1.5 flex-shrink-0">Reply</Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Active team tasks ── */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-[#1b2e4a] flex items-center justify-between">
          <div className="section-head">
            <h3 className="font-bold text-primary text-[15px]">Active Team Tasks</h3>
            <p className="text-xs text-muted mt-0.5">Sorted by due date</p>
          </div>
          <Link to="/tasks/team" className="flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 transition-colors">
            Full Board <ArrowRightIcon className="w-3 h-3" />
          </Link>
        </div>
        {teamTasks.length === 0 ? (
          <div className="p-5"><Empty icon={CheckCircleIcon} text="No active tasks" /></div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-[#1b2e4a]">
            {teamTasks.map((task) => {
              const due = task.dueDate ? getDueLabel(task.dueDate) : null;
              return (
                <div key={task._id}
                  className={clsx(
                    'flex items-center gap-3 px-5 py-3 transition-all duration-150 cursor-pointer',
                    task.isOverdue
                      ? 'bg-red-50/50 dark:bg-red-900/10 hover:bg-red-50 dark:hover:bg-red-900/20'
                      : 'hover:bg-slate-50/80 dark:hover:bg-[#17263d]/40'
                  )}
                  onClick={() => toWorkflow(task)}>
                  {/* left accent bar for overdue */}
                  {task.isOverdue && <div className="w-1 h-full self-stretch rounded-full bg-red-500 flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className={`badge ${STATUS_COLORS[task.status] || 'badge-gray'}`}>{task.status}</span>
                      <span className={`badge ${PRIORITY_COLORS[task.priority] || 'badge-gray'}`}>{task.priority}</span>
                      {task.status === 'In Progress' && task.startDate && (
                        <InProgressTimer startDate={task.startDate} />
                      )}
                    </div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{task.title}</p>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-400 flex-wrap">
                      <span className="font-medium text-slate-500 dark:text-slate-400">{task.department}</span>
                      {task.assignedTo && (
                        <span>→ {task.assignedTo.firstName} {task.assignedTo.lastName}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {due && <span className={`text-xs whitespace-nowrap ${due.cls}`}>{due.label}</span>}
                    <button onClick={(e) => { e.stopPropagation(); toWorkflow(task); }}
                      className="p-1.5 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-900/20 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                      <BoltIcon className="w-4 h-4" />
                    </button>
                    <Link to="/tasks/kanban" onClick={e => e.stopPropagation()}
                      className="p-1.5 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                      <ViewColumnsIcon className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
