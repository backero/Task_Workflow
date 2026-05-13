import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  BoltIcon, ArrowTrendingUpIcon, ClockIcon, ExclamationTriangleIcon,
  CheckCircleIcon, UserGroupIcon, ChartBarIcon,
} from '@heroicons/react/24/outline';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isWithinInterval, parseISO, isPast, subWeeks, startOfDay } from 'date-fns';
import { clsx } from 'clsx';
import api from '../../api/axios';

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function ring(pct, color, size = 72) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={8} />
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

// ── Main Component ────────────────────────────────────────────────────────────

export default function DeptDashboard({ dept, color, lightColor, textColor, borderColor, description, icon: Icon }) {
  const navigate = useNavigate();
  const deptParam = encodeURIComponent(dept);

  const { data: allTasksData, isLoading } = useQuery({
    queryKey: ['dept-dashboard', dept, 'all'],
    queryFn: () => api.get(`/tasks?department=${deptParam}&limit=300`).then(r => r.data),
    refetchInterval: 5 * 60 * 1000,
  });

  const tasks = useMemo(() => allTasksData?.data || [], [allTasksData]);

  // ── Date ranges ──────────────────────────────────────────────────────────────
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 }); // Mon
  const weekEnd   = endOfWeek(now,   { weekStartsOn: 1 }); // Sun
  const prevWeekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
  const prevWeekEnd   = endOfWeek(subWeeks(now, 1),   { weekStartsOn: 1 });

  const inThisWeek = (d) => d && isWithinInterval(new Date(d), { start: weekStart, end: weekEnd });
  const inPrevWeek = (d) => d && isWithinInterval(new Date(d), { start: prevWeekStart, end: prevWeekEnd });

  // ── Core stats ───────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total       = tasks.length;
    const completed   = tasks.filter(t => t.status === 'Completed').length;
    const inProgress  = tasks.filter(t => t.status === 'In Progress').length;
    const pending     = tasks.filter(t => ['Pending', 'Assigned'].includes(t.status)).length;
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

    return { total, completed, inProgress, pending, overdue, approval, completedThisWeek, completedPrevWeek, createdThisWeek, completionRate, onTimeRate, weekChange };
  }, [tasks]);

  // ── Weekly completion trend (Mon→Sun) ────────────────────────────────────────
  const weeklyTrend = useMemo(() => {
    const days = eachDayOfInterval({ start: weekStart, end: weekEnd });
    return days.map(day => {
      const dayStr = format(day, 'EEE');
      const dayStart = startOfDay(day);
      const dayEnd = new Date(dayStart.getTime() + 86400000 - 1);
      const completedOnDay = tasks.filter(t =>
        t.status === 'Completed' &&
        t.updatedAt &&
        isWithinInterval(new Date(t.updatedAt), { start: dayStart, end: dayEnd })
      ).length;
      const updatedOnDay = tasks.filter(t =>
        t.updatedAt &&
        isWithinInterval(new Date(t.updatedAt), { start: dayStart, end: dayEnd }) &&
        t.status !== 'Completed'
      ).length;
      return { day: dayStr, Completed: completedOnDay, Updated: updatedOnDay };
    });
  }, [tasks, weekStart, weekEnd]);

  // ── Status distribution ───────────────────────────────────────────────────────
  const statusDist = useMemo(() => {
    const map = {};
    tasks.forEach(t => { map[t.status] = (map[t.status] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value, color: STATUS_COLOR[name] || '#94a3b8' })).sort((a, b) => b.value - a.value);
  }, [tasks]);

  // ── Priority distribution ─────────────────────────────────────────────────────
  const priorityDist = useMemo(() => {
    const map = {};
    tasks.forEach(t => { map[t.priority] = (map[t.priority] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value, color: PRIORITY_COLOR[name] || '#94a3b8' }));
  }, [tasks]);

  // ── Team performance ─────────────────────────────────────────────────────────
  const teamPerf = useMemo(() => {
    const memberMap = {};
    tasks.forEach(t => {
      if (!t.assignedTo) return;
      const id = t.assignedTo._id;
      if (!memberMap[id]) {
        memberMap[id] = {
          id,
          name: `${t.assignedTo.firstName} ${t.assignedTo.lastName}`,
          total: 0, completed: 0, inProgress: 0, overdue: 0,
        };
      }
      memberMap[id].total++;
      if (t.status === 'Completed') memberMap[id].completed++;
      if (t.status === 'In Progress') memberMap[id].inProgress++;
      if (t.dueDate && isPast(new Date(t.dueDate)) && t.status !== 'Completed') memberMap[id].overdue++;
    });
    return Object.values(memberMap)
      .map(m => ({ ...m, rate: m.total > 0 ? Math.round((m.completed / m.total) * 100) : 0 }))
      .sort((a, b) => b.completed - a.completed)
      .slice(0, 8);
  }, [tasks]);

  // ── Overdue tasks list ────────────────────────────────────────────────────────
  const overdueTasks = useMemo(() =>
    tasks.filter(t => t.dueDate && isPast(new Date(t.dueDate)) && t.status !== 'Completed')
         .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
         .slice(0, 6),
  [tasks]);

  // ── Recent completions ────────────────────────────────────────────────────────
  const recentDone = useMemo(() =>
    tasks.filter(t => t.status === 'Completed')
         .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
         .slice(0, 5),
  [tasks]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-gray-200 rounded-full animate-spin mx-auto mb-3" style={{ borderTopColor: color }} />
          <p className="text-sm text-gray-500">Loading dashboard…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Page header ── */}
      <div className="rounded-2xl overflow-hidden shadow-sm border border-gray-200">
        <div className="px-6 py-5" style={{ background: `linear-gradient(135deg, ${color} 0%, ${color}cc 100%)` }}>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                <Icon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">{dept} Department</h1>
                <p className="text-sm text-white/75 mt-0.5">{description}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate('/workflow')}
                className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 text-white text-sm font-semibold rounded-xl transition-colors border border-white/30"
              >
                <BoltIcon className="w-4 h-4" />
                Open Workflow
              </button>
            </div>
          </div>
        </div>

        {/* Quick stat strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-gray-100 bg-white">
          {[
            { label: 'Total Tasks',      value: stats.total,             icon: '📋' },
            { label: 'Completed',        value: stats.completed,         icon: '✅' },
            { label: 'In Progress',      value: stats.inProgress,        icon: '🔄' },
            { label: 'Overdue',          value: stats.overdue,           icon: '⚠️', alert: stats.overdue > 0 },
          ].map(s => (
            <div key={s.label} className="px-5 py-3 text-center">
              <p className="text-2xl font-bold" style={s.alert ? { color: '#ef4444' } : { color }}>{s.value}</p>
              <p className="text-xs text-gray-500 font-medium mt-0.5">{s.icon} {s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── This week + performance rings ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* This week summary */}
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <ChartBarIcon className="w-4 h-4 text-gray-500" />
            <h3 className="text-sm font-bold text-gray-800">This Week ({format(weekStart, 'dd MMM')} – {format(weekEnd, 'dd MMM')})</h3>
          </div>
          <div className="grid grid-cols-3 gap-4 mb-5">
            <WeekStat label="Created" value={stats.createdThisWeek} color={color} />
            <WeekStat label="Completed" value={stats.completedThisWeek} color="#22c55e"
              sub={stats.weekChange !== 0 ? `${stats.weekChange > 0 ? '+' : ''}${stats.weekChange}% vs last week` : 'Same as last week'}
              subColor={stats.weekChange >= 0 ? '#16a34a' : '#dc2626'} />
            <WeekStat label="Pending Approval" value={stats.approval} color="#6366f1" />
          </div>

          {/* Weekly bar chart */}
          <ResponsiveContainer width="100%" height={130}>
            <BarChart data={weeklyTrend} barSize={14} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={20} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
              <Bar dataKey="Completed" fill="#22c55e" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Updated" fill={color} radius={[4, 4, 0, 0]} opacity={0.6} />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-1">
            <LegendDot color="#22c55e" label="Completed" />
            <LegendDot color={color} label="Updated/Active" opacity={0.6} />
          </div>
        </div>

        {/* Performance rings */}
        <div className="card p-5 flex flex-col justify-between">
          <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
            <ArrowTrendingUpIcon className="w-4 h-4 text-gray-500" />
            Performance
          </h3>
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              {ring(stats.completionRate, '#22c55e')}
              <div>
                <p className="text-sm font-bold text-gray-900">Completion Rate</p>
                <p className="text-xs text-gray-500">{stats.completed} of {stats.total} tasks done</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {ring(stats.onTimeRate, color)}
              <div>
                <p className="text-sm font-bold text-gray-900">On-Time Delivery</p>
                <p className="text-xs text-gray-500">Tasks completed before due date</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {ring(stats.total > 0 ? Math.round(((stats.total - stats.overdue) / stats.total) * 100) : 100, '#6366f1')}
              <div>
                <p className="text-sm font-bold text-gray-900">Health Score</p>
                <p className="text-xs text-gray-500">{stats.overdue} overdue task{stats.overdue !== 1 ? 's' : ''}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Status + Priority distributions ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Status breakdown */}
        <div className="card p-5">
          <h3 className="text-sm font-bold text-gray-800 mb-4">Task Status Breakdown</h3>
          {statusDist.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6">No tasks yet</p>
          ) : (
            <div className="space-y-2.5">
              {statusDist.map(s => (
                <div key={s.name}>
                  <div className="flex justify-between mb-1">
                    <span className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full inline-block flex-shrink-0" style={{ background: s.color }} />
                      {s.name}
                    </span>
                    <span className="text-xs font-bold text-gray-800">{s.value} <span className="text-gray-400 font-normal">({stats.total > 0 ? Math.round((s.value / stats.total) * 100) : 0}%)</span></span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${stats.total > 0 ? (s.value / stats.total) * 100 : 0}%`, background: s.color }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Priority distribution pie */}
        <div className="card p-5">
          <h3 className="text-sm font-bold text-gray-800 mb-2">Priority Distribution</h3>
          {priorityDist.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6">No tasks yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={priorityDist} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value">
                  {priorityDist.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(val) => [`${val} tasks`, '']} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Team performance ── */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <UserGroupIcon className="w-4 h-4 text-gray-500" />
          <h3 className="text-sm font-bold text-gray-800">Team Performance</h3>
        </div>
        {teamPerf.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-6">No assigned tasks yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 px-3 text-gray-500 font-semibold">Member</th>
                  <th className="text-center py-2 px-2 text-gray-500 font-semibold">Total</th>
                  <th className="text-center py-2 px-2 text-gray-500 font-semibold">Done</th>
                  <th className="text-center py-2 px-2 text-gray-500 font-semibold">Active</th>
                  <th className="text-center py-2 px-2 text-gray-500 font-semibold">Overdue</th>
                  <th className="text-left py-2 px-3 text-gray-500 font-semibold">Completion</th>
                </tr>
              </thead>
              <tbody>
                {teamPerf.map((m, i) => (
                  <tr key={m.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0" style={{ background: color }}>
                          {m.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <span className="font-semibold text-gray-800 truncate max-w-[110px]">{m.name}</span>
                        {i === 0 && <span className="text-[9px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full font-bold ml-1">TOP</span>}
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-center text-gray-700 font-medium">{m.total}</td>
                    <td className="py-2.5 px-2 text-center text-green-600 font-bold">{m.completed}</td>
                    <td className="py-2.5 px-2 text-center text-yellow-600 font-medium">{m.inProgress}</td>
                    <td className="py-2.5 px-2 text-center">
                      <span className={clsx('font-bold', m.overdue > 0 ? 'text-red-600' : 'text-gray-300')}>{m.overdue}</span>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${m.rate}%`, background: m.rate >= 70 ? '#22c55e' : m.rate >= 40 ? color : '#ef4444' }} />
                        </div>
                        <span className="text-gray-700 font-bold w-8 text-right">{m.rate}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Overdue + Recent ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Overdue tasks */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <ExclamationTriangleIcon className="w-4 h-4 text-red-500" />
            <h3 className="text-sm font-bold text-gray-800">Overdue Tasks</h3>
            {stats.overdue > 0 && (
              <span className="ml-auto text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                {stats.overdue} overdue
              </span>
            )}
          </div>
          {overdueTasks.length === 0 ? (
            <div className="flex flex-col items-center py-8">
              <CheckCircleIcon className="w-10 h-10 text-green-400 mb-2" />
              <p className="text-xs text-gray-400 font-medium">No overdue tasks! 🎉</p>
            </div>
          ) : (
            <div className="space-y-2">
              {overdueTasks.map(t => {
                const daysLate = Math.floor((Date.now() - new Date(t.dueDate)) / 86400000);
                return (
                  <div key={t._id}
                    onClick={() => navigate(`/workflow/${t._id}`)}
                    className="flex items-center gap-3 p-2.5 rounded-xl border border-red-100 bg-red-50 cursor-pointer hover:bg-red-100 transition-colors"
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-900 truncate">{t.title}</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">
                        {t.assignedTo ? `${t.assignedTo.firstName} ${t.assignedTo.lastName}` : 'Unassigned'}
                        {' · '}{format(new Date(t.dueDate), 'dd MMM')}
                      </p>
                    </div>
                    <span className="text-[10px] font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0">
                      {daysLate}d late
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent completions */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircleIcon className="w-4 h-4 text-green-500" />
            <h3 className="text-sm font-bold text-gray-800">Recently Completed</h3>
          </div>
          {recentDone.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-8">No completed tasks yet</p>
          ) : (
            <div className="space-y-2">
              {recentDone.map(t => (
                <div key={t._id}
                  onClick={() => navigate(`/workflow/${t._id}`)}
                  className="flex items-center gap-3 p-2.5 rounded-xl border border-green-100 bg-green-50 cursor-pointer hover:bg-green-100 transition-colors"
                >
                  <CheckCircleIcon className="w-4 h-4 text-green-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-900 truncate">{t.title}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      {t.assignedTo ? `${t.assignedTo.firstName} ${t.assignedTo.lastName}` : '—'}
                      {t.updatedAt ? ` · ${format(new Date(t.updatedAt), 'dd MMM, h:mm a')}` : ''}
                    </p>
                  </div>
                  <span className="text-[10px] font-bold text-green-600 bg-green-100 px-2 py-0.5 rounded-full flex-shrink-0">Done</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function WeekStat({ label, value, color, sub, subColor }) {
  return (
    <div className="text-center">
      <p className="text-2xl font-bold" style={{ color }}>{value}</p>
      <p className="text-[11px] text-gray-500 font-medium">{label}</p>
      {sub && <p className="text-[10px] font-semibold mt-0.5" style={{ color: subColor }}>{sub}</p>}
    </div>
  );
}

function LegendDot({ color, label, opacity = 1 }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: color, opacity }} />
      <span className="text-[11px] text-gray-500">{label}</span>
    </div>
  );
}
