import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  BoltIcon, ArrowTrendingUpIcon, ClockIcon, ExclamationTriangleIcon,
  CheckCircleIcon, UserGroupIcon, ChartBarIcon, ArrowRightIcon,
} from '@heroicons/react/24/outline';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isWithinInterval, isPast, subWeeks, startOfDay } from 'date-fns';
import { clsx } from 'clsx';
import api from '../../api/axios';

const STATUS_COLOR = {
  'Completed':         '#22c55e',
  'In Progress':       '#eab308',
  'Assigned':          '#3b82f6',
  'Pending':           '#94a3b8',
  'Approval Pending':  '#6366f1',
  'Changes Requested': '#f97316',
  'Reopened':          '#ef4444',
  'Cancelled':         '#6b7280',
};

const PRIORITY_COLOR = {
  critical: '#ef4444', urgent: '#f97316',
  high: '#f59e0b', medium: '#3b82f6', low: '#94a3b8',
};

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

function ring(pct, color, size = 72) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="currentColor" strokeWidth={8}
        className="text-slate-100 dark:text-slate-700" />
      <circle
        cx={size/2} cy={size/2} r={r} fill="none"
        stroke={color} strokeWidth={8}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ transition: 'stroke-dasharray 0.6s ease' }}
      />
      <text x={size/2} y={size/2 + 5} textAnchor="middle" fontSize={13} fontWeight="700" fill={color}>
        {pct}%
      </text>
    </svg>
  );
}

export default function DeptDashboard({ dept, color, lightColor, textColor, borderColor, description, icon: Icon }) {
  const navigate = useNavigate();
  const deptParam = encodeURIComponent(dept);

  const { data: allTasksData, isLoading } = useQuery({
    queryKey: ['dept-dashboard', dept, 'all'],
    queryFn: () => api.get(`/tasks?department=${deptParam}&limit=300`).then(r => r.data),
    refetchInterval: 5 * 60 * 1000,
  });

  const tasks = useMemo(() => allTasksData?.data || [], [allTasksData]);

  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd   = endOfWeek(now,   { weekStartsOn: 1 });
  const prevWeekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
  const prevWeekEnd   = endOfWeek(subWeeks(now, 1),   { weekStartsOn: 1 });

  const inThisWeek = (d) => d && isWithinInterval(new Date(d), { start: weekStart, end: weekEnd });
  const inPrevWeek = (d) => d && isWithinInterval(new Date(d), { start: prevWeekStart, end: prevWeekEnd });

  const stats = useMemo(() => {
    const total       = tasks.length;
    const completed   = tasks.filter(t => t.status === 'Completed').length;
    const inProgress  = tasks.filter(t => t.status === 'In Progress').length;
    const overdue     = tasks.filter(t => t.dueDate && isPast(new Date(t.dueDate)) && t.status !== 'Completed').length;
    const approval    = tasks.filter(t => t.status === 'Approval Pending').length;
    const completedThisWeek = tasks.filter(t => t.status === 'Completed' && inThisWeek(t.updatedAt)).length;
    const completedPrevWeek = tasks.filter(t => t.status === 'Completed' && inPrevWeek(t.updatedAt)).length;
    const createdThisWeek   = tasks.filter(t => inThisWeek(t.createdAt)).length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    const onTimeRate = completed > 0
      ? Math.round((tasks.filter(t => t.status === 'Completed' && t.dueDate && new Date(t.updatedAt) <= new Date(t.dueDate)).length / completed) * 100)
      : 0;
    const weekChange = completedPrevWeek > 0
      ? Math.round(((completedThisWeek - completedPrevWeek) / completedPrevWeek) * 100)
      : completedThisWeek > 0 ? 100 : 0;
    return { total, completed, inProgress, overdue, approval, completedThisWeek, completedPrevWeek, createdThisWeek, completionRate, onTimeRate, weekChange };
  }, [tasks]);

  const weeklyTrend = useMemo(() => {
    const days = eachDayOfInterval({ start: weekStart, end: weekEnd });
    return days.map(day => {
      const dayStr = format(day, 'EEE');
      const dayStart = startOfDay(day);
      const dayEnd = new Date(dayStart.getTime() + 86400000 - 1);
      const completedOnDay = tasks.filter(t =>
        t.status === 'Completed' && t.updatedAt &&
        isWithinInterval(new Date(t.updatedAt), { start: dayStart, end: dayEnd })
      ).length;
      const updatedOnDay = tasks.filter(t =>
        t.updatedAt && isWithinInterval(new Date(t.updatedAt), { start: dayStart, end: dayEnd }) && t.status !== 'Completed'
      ).length;
      return { day: dayStr, Completed: completedOnDay, Active: updatedOnDay };
    });
  }, [tasks, weekStart, weekEnd]);

  const statusDist = useMemo(() => {
    const map = {};
    tasks.forEach(t => { map[t.status] = (map[t.status] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value, color: STATUS_COLOR[name] || '#94a3b8' })).sort((a, b) => b.value - a.value);
  }, [tasks]);

  const priorityDist = useMemo(() => {
    const map = {};
    tasks.forEach(t => { map[t.priority] = (map[t.priority] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value, color: PRIORITY_COLOR[name] || '#94a3b8' }));
  }, [tasks]);

  const teamPerf = useMemo(() => {
    const memberMap = {};
    tasks.forEach(t => {
      if (!t.assignedTo) return;
      const id = t.assignedTo._id;
      if (!memberMap[id]) {
        memberMap[id] = {
          id, name: `${t.assignedTo.firstName} ${t.assignedTo.lastName}`,
          total: 0, completed: 0, inProgress: 0, overdue: 0,
        };
      }
      memberMap[id].total++;
      if (t.status === 'Completed') memberMap[id].completed++;
      if (t.status === 'In Progress') memberMap[id].inProgress++;
      if (t.dueDate && isPast(new Date(t.dueDate)) && t.status !== 'Completed') memberMap[id].overdue++;
    });
    return Object.values(memberMap)
      .map((m, i) => ({ ...m, rate: m.total > 0 ? Math.round((m.completed / m.total) * 100) : 0, grad: AVATAR_GRADS[i % AVATAR_GRADS.length] }))
      .sort((a, b) => b.completed - a.completed)
      .slice(0, 8);
  }, [tasks]);

  const overdueTasks = useMemo(() =>
    tasks.filter(t => t.dueDate && isPast(new Date(t.dueDate)) && t.status !== 'Completed')
         .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)).slice(0, 6),
  [tasks]);

  const recentDone = useMemo(() =>
    tasks.filter(t => t.status === 'Completed')
         .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 5),
  [tasks]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-slate-200 rounded-full animate-spin mx-auto mb-3"
            style={{ borderTopColor: color }} />
          <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-page">

      {/* ── Page header ── */}
      <div className="card overflow-hidden">
        <div className="px-6 py-5 relative overflow-hidden"
          style={{ background: `linear-gradient(135deg, ${color}ee 0%, ${color}99 100%)` }}>
          {/* Decorative circle */}
          <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full opacity-10"
            style={{ background: '#fff' }} />
          <div className="absolute -right-4 bottom-0 w-24 h-24 rounded-full opacity-[0.07]"
            style={{ background: '#fff' }} />

          <div className="relative flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0 border border-white/25">
                <Icon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white leading-tight">{dept} Department</h1>
                <p className="text-sm text-white/70 mt-0.5">{description}</p>
              </div>
            </div>
            <button
              onClick={() => navigate('/workflow')}
              className="flex items-center gap-2 px-4 py-2 bg-white/15 hover:bg-white/25 text-white text-sm font-semibold rounded-xl transition-colors border border-white/25 backdrop-blur-sm"
            >
              <BoltIcon className="w-4 h-4" />
              Workflow
              <ArrowRightIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Quick stat strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-slate-100 dark:divide-[#1b2e4a]">
          {[
            { label: 'Total Tasks',  value: stats.total,      color: color },
            { label: 'Completed',    value: stats.completed,  color: '#22c55e' },
            { label: 'In Progress',  value: stats.inProgress, color: '#eab308' },
            { label: 'Overdue',      value: stats.overdue,    color: stats.overdue > 0 ? '#ef4444' : '#94a3b8', alert: stats.overdue > 0 },
          ].map(s => (
            <div key={s.label} className="px-5 py-4 text-center">
              <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── This week + performance ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        <div className="card p-5 lg:col-span-2">
          <h3 className="section-head text-sm font-bold text-slate-800 dark:text-white">
            This Week <span className="text-slate-400 dark:text-slate-500 font-normal ml-1 text-xs">
              {format(weekStart, 'dd MMM')} – {format(weekEnd, 'dd MMM')}
            </span>
          </h3>
          <div className="grid grid-cols-3 gap-4 mb-5">
            <WeekStat label="Created" value={stats.createdThisWeek} color={color} />
            <WeekStat label="Completed" value={stats.completedThisWeek} color="#22c55e"
              sub={stats.weekChange !== 0 ? `${stats.weekChange > 0 ? '+' : ''}${stats.weekChange}% vs last wk` : 'Same as last wk'}
              subColor={stats.weekChange >= 0 ? '#16a34a' : '#dc2626'} />
            <WeekStat label="Need Approval" value={stats.approval} color="#6366f1" />
          </div>
          <ResponsiveContainer width="100%" height={130}>
            <BarChart data={weeklyTrend} barSize={14} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.12)" />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={20} allowDecimals={false} />
              <Tooltip
                contentStyle={{ fontSize: 11, borderRadius: 12, border: '1px solid rgba(148,163,184,0.2)', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}
                cursor={{ fill: 'rgba(148,163,184,0.07)' }}
              />
              <Bar dataKey="Completed" fill="#22c55e" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Active" fill={color} radius={[4, 4, 0, 0]} opacity={0.55} />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-2">
            <LegendDot color="#22c55e" label="Completed" />
            <LegendDot color={color} label="Active" opacity={0.55} />
          </div>
        </div>

        <div className="card p-5">
          <h3 className="section-head text-sm font-bold text-slate-800 dark:text-white">Performance</h3>
          <div className="space-y-5 mt-2">
            {[
              { label: 'Completion Rate', sub: `${stats.completed} of ${stats.total} done`, pct: stats.completionRate, color: '#22c55e' },
              { label: 'On-Time Delivery', sub: 'Tasks done before due date', pct: stats.onTimeRate, color },
              { label: 'Health Score', sub: `${stats.overdue} overdue task${stats.overdue !== 1 ? 's' : ''}`,
                pct: stats.total > 0 ? Math.round(((stats.total - stats.overdue) / stats.total) * 100) : 100, color: '#6366f1' },
            ].map(p => (
              <div key={p.label} className="flex items-center gap-3">
                {ring(p.pct, p.color)}
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white leading-tight">{p.label}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{p.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Status + Priority ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        <div className="card p-5">
          <h3 className="section-head text-sm font-bold text-slate-800 dark:text-white">Status Breakdown</h3>
          {statusDist.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">No tasks yet</p>
          ) : (
            <div className="space-y-3 mt-1">
              {statusDist.map(s => (
                <div key={s.name}>
                  <div className="flex justify-between mb-1.5">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                      {s.name}
                    </span>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                      {s.value}
                      <span className="text-slate-400 font-normal ml-1">
                        ({stats.total > 0 ? Math.round((s.value / stats.total) * 100) : 0}%)
                      </span>
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-100 dark:bg-[#132035]/50 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${stats.total > 0 ? (s.value / stats.total) * 100 : 0}%`, background: s.color }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-5">
          <h3 className="section-head text-sm font-bold text-slate-800 dark:text-white">Priority Distribution</h3>
          {priorityDist.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">No tasks yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={priorityDist} cx="50%" cy="50%" innerRadius={48} outerRadius={76} paddingAngle={3} dataKey="value">
                  {priorityDist.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(val) => [`${val} tasks`, '']}
                  contentStyle={{ fontSize: 11, borderRadius: 12, border: '1px solid rgba(148,163,184,0.2)' }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Team performance ── */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-[#1b2e4a] flex items-center gap-2">
          <UserGroupIcon className="w-4 h-4 text-slate-500" />
          <h3 className="text-sm font-bold text-slate-800 dark:text-white">Team Performance</h3>
          <span className="ml-auto text-xs text-slate-400">{teamPerf.length} members</span>
        </div>
        {teamPerf.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><UserGroupIcon className="w-6 h-6" /></div>
            <p className="text-sm text-slate-500 dark:text-slate-400">No assigned tasks yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th className="text-center">Total</th>
                  <th className="text-center">Done</th>
                  <th className="text-center">Active</th>
                  <th className="text-center">Overdue</th>
                  <th>Completion</th>
                </tr>
              </thead>
              <tbody>
                {teamPerf.map((m, i) => (
                  <tr key={m.id}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-xl flex items-center justify-center text-white text-[10px] font-black flex-shrink-0 shadow-sm"
                          style={{ background: m.grad }}>
                          {m.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <span className="font-semibold text-slate-800 dark:text-slate-200 text-sm truncate max-w-[120px]">{m.name}</span>
                        {i === 0 && (
                          <span className="text-[9px] font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded-full">TOP</span>
                        )}
                      </div>
                    </td>
                    <td className="text-center font-semibold text-slate-700 dark:text-slate-300">{m.total}</td>
                    <td className="text-center font-bold text-emerald-600 dark:text-emerald-400">{m.completed}</td>
                    <td className="text-center font-semibold text-amber-600 dark:text-amber-400">{m.inProgress}</td>
                    <td className="text-center">
                      <span className={clsx('font-bold', m.overdue > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-300 dark:text-slate-600')}>
                        {m.overdue}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-slate-100 dark:bg-[#132035]/50 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${m.rate}%`, background: m.rate >= 70 ? '#22c55e' : m.rate >= 40 ? color : '#ef4444' }} />
                        </div>
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200 w-9 text-right">{m.rate}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Overdue + Recent completions ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <ExclamationTriangleIcon className="w-4 h-4 text-red-500" />
            <h3 className="text-sm font-bold text-slate-800 dark:text-white">Overdue Tasks</h3>
            {stats.overdue > 0 && (
              <span className="ml-auto badge badge-red">{stats.overdue} overdue</span>
            )}
          </div>
          {overdueTasks.length === 0 ? (
            <div className="empty-state py-8">
              <div className="empty-state-icon"><CheckCircleIcon className="w-6 h-6 text-emerald-500" /></div>
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">All clear!</p>
              <p className="text-xs text-slate-400 mt-0.5">No overdue tasks</p>
            </div>
          ) : (
            <div className="space-y-2">
              {overdueTasks.map(t => {
                const daysLate = Math.floor((Date.now() - new Date(t.dueDate)) / 86400000);
                return (
                  <div key={t._id} onClick={() => navigate(`/workflow/${t._id}`)}
                    className="flex items-center gap-3 p-3 rounded-2xl border border-red-100 dark:border-red-900/30
                               bg-red-50 dark:bg-red-900/10 cursor-pointer
                               hover:bg-red-100 dark:hover:bg-red-900/20
                               hover:shadow-md transition-all duration-150 hover:-translate-y-0.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">{t.title}</p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {t.assignedTo ? `${t.assignedTo.firstName} ${t.assignedTo.lastName}` : 'Unassigned'}
                        {' · '}{format(new Date(t.dueDate), 'dd MMM')}
                      </p>
                    </div>
                    <span className="text-[10px] font-bold text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 px-2 py-0.5 rounded-lg whitespace-nowrap flex-shrink-0">
                      {daysLate}d late
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircleIcon className="w-4 h-4 text-emerald-500" />
            <h3 className="text-sm font-bold text-slate-800 dark:text-white">Recently Completed</h3>
          </div>
          {recentDone.length === 0 ? (
            <div className="empty-state py-8">
              <div className="empty-state-icon"><ClockIcon className="w-6 h-6" /></div>
              <p className="text-sm text-slate-500 dark:text-slate-400">No completed tasks yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentDone.map(t => (
                <div key={t._id} onClick={() => navigate(`/workflow/${t._id}`)}
                  className="flex items-center gap-3 p-3 rounded-2xl border border-emerald-100 dark:border-emerald-900/30
                             bg-emerald-50 dark:bg-emerald-900/10 cursor-pointer
                             hover:bg-emerald-100 dark:hover:bg-emerald-900/20
                             hover:shadow-md transition-all duration-150 hover:-translate-y-0.5">
                  <CheckCircleIcon className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">{t.title}</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {t.assignedTo ? `${t.assignedTo.firstName} ${t.assignedTo.lastName}` : '—'}
                      {t.updatedAt ? ` · ${format(new Date(t.updatedAt), 'dd MMM, h:mm a')}` : ''}
                    </p>
                  </div>
                  <span className="badge badge-green flex-shrink-0">Done</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}

function WeekStat({ label, value, color, sub, subColor }) {
  return (
    <div className="text-center">
      <p className="text-2xl font-bold" style={{ color }}>{value}</p>
      <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">{label}</p>
      {sub && <p className="text-[10px] font-bold mt-0.5" style={{ color: subColor }}>{sub}</p>}
    </div>
  );
}

function LegendDot({ color, label, opacity = 1 }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: color, opacity }} />
      <span className="text-[11px] text-slate-500 dark:text-slate-400">{label}</span>
    </div>
  );
}
