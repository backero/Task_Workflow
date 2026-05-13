import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  ArrowTrendingUpIcon, BanknotesIcon,
  CheckCircleIcon, UserCircleIcon, ChartBarIcon,
} from '@heroicons/react/24/outline';
import { clsx } from 'clsx';
import { format, startOfWeek, addDays } from 'date-fns';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { useSocketStore } from '../../store/useSocketStore';

// ── Constants ─────────────────────────────────────────────────────────────────

const PLATFORMS = ['Amazon', 'Flipkart', 'Meesho', 'Myntra', 'JioMart', 'Snapdeal'];

const PLATFORM_META = {
  Amazon:   { color: '#FF9900', bg: '#fff7ed', text: '#b45309', initial: 'A' },
  Flipkart: { color: '#2874f0', bg: '#eff6ff', text: '#1d4ed8', initial: 'F' },
  Meesho:   { color: '#f43397', bg: '#fdf2f8', text: '#be185d', initial: 'M' },
  Myntra:   { color: '#ff3f6c', bg: '#fff1f2', text: '#be123c', initial: 'My' },
  JioMart:  { color: '#0077B6', bg: '#eff6ff', text: '#1e40af', initial: 'J' },
  Snapdeal: { color: '#e40046', bg: '#fff1f2', text: '#9f1239', initial: 'S' },
};

const STATUS_COLORS = {
  'Completed':        { dot: '#22c55e', badge: 'bg-green-100 text-green-700' },
  'In Progress':      { dot: '#eab308', badge: 'bg-yellow-100 text-yellow-800' },
  'Assigned':         { dot: '#3b82f6', badge: 'bg-blue-100 text-blue-700' },
  'Pending':          { dot: '#94a3b8', badge: 'bg-gray-100 text-gray-600' },
  'Approval Pending': { dot: '#6366f1', badge: 'bg-indigo-100 text-indigo-700' },
  'Reopened':         { dot: '#ef4444', badge: 'bg-red-100 text-red-700' },
};

const EMPTY_FORM = {
  totalSales: '', ctr: '', cvr: '', adSpend: '',
  adRevenue: '', returns: '', worstSkuCvr: '', notes: '',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getWeekDays() {
  const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(monday, i);
    return { label: format(d, 'EEE'), date: format(d, 'yyyy-MM-dd') };
  });
}

function groupByPlatform(tasks) {
  const map = {};
  PLATFORMS.forEach(p => { map[p] = []; });
  tasks.forEach(t => {
    const p = t.platform;
    if (p && map[p]) map[p].push(t);
    else if (!p) {
      // tasks without platform — skip from platform view but keep in all
    }
  });
  return map;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PlatformTab({ name, active, count, onClick }) {
  const meta = PLATFORM_META[name];
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap border',
        active ? 'text-white shadow-md border-transparent' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:shadow-sm',
      )}
      style={active ? { background: meta.color, borderColor: meta.color } : {}}
    >
      <span
        className="w-5 h-5 rounded-md flex items-center justify-center text-white text-[9px] font-black flex-shrink-0"
        style={{ background: meta.color }}
      >
        {meta.initial}
      </span>
      {name}
      {count > 0 && (
        <span className={clsx('text-[10px] font-bold rounded-full px-1.5 py-0.5', active ? 'bg-white/30 text-white' : 'bg-gray-100 text-gray-500')}>
          {count}
        </span>
      )}
    </button>
  );
}

function PlatformCard({ name, tasks, onSelect, active }) {
  const meta = PLATFORM_META[name];
  const total = tasks.length;
  const completed = tasks.filter(t => t.status === 'Completed').length;
  const inProgress = tasks.filter(t => t.status === 'In Progress').length;
  const overdue = tasks.filter(t => t.isOverdue && t.status !== 'Completed').length;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  // Unique members on this platform
  const members = [...new Map(
    tasks.filter(t => t.assignedTo).map(t => [t.assignedTo._id, t.assignedTo])
  ).values()];

  return (
    <button
      onClick={() => onSelect(name)}
      className={clsx(
        'text-left w-full rounded-2xl border-2 p-4 transition-all hover:shadow-lg',
        active ? 'shadow-lg' : 'bg-white border-gray-200 hover:border-gray-300',
      )}
      style={active ? { borderColor: meta.color, background: meta.bg } : {}}
    >
      {/* Platform header */}
      <div className="flex items-center gap-2.5 mb-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-black shadow-sm flex-shrink-0"
          style={{ background: meta.color }}
        >
          {meta.initial}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-gray-900">{name}</p>
          <p className="text-[10px] text-gray-400">{total} task{total !== 1 ? 's' : ''}</p>
        </div>
        {overdue > 0 && (
          <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full">
            {overdue} overdue
          </span>
        )}
      </div>

      {/* Members */}
      {members.length > 0 ? (
        <div className="flex items-center gap-1.5 mb-3 flex-wrap">
          {members.map(m => (
            <div
              key={m._id}
              className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full"
              style={{ background: meta.color + '22', color: meta.text }}
            >
              <UserCircleIcon className="w-3 h-3" />
              {m.firstName} {m.lastName}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-gray-400 mb-3 italic">Assign subtasks from Workflow builder →</p>
      )}

      {/* Progress bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${progress}%`, background: progress === 100 ? '#22c55e' : meta.color }}
          />
        </div>
        <span className="text-[11px] font-bold text-gray-700 w-8 text-right">{progress}%</span>
      </div>

      {/* Status dots */}
      {total > 0 && (
        <div className="flex items-center gap-2 mt-2">
          {completed > 0 && <span className="text-[10px] text-green-600 font-medium">{completed} done</span>}
          {inProgress > 0 && <span className="text-[10px] text-yellow-600 font-medium">{inProgress} active</span>}
          {(total - completed - inProgress) > 0 && (
            <span className="text-[10px] text-gray-400 font-medium">{total - completed - inProgress} pending</span>
          )}
        </div>
      )}
    </button>
  );
}

function TaskRow({ task, navigate }) {
  const meta = PLATFORM_META[task.platform] || PLATFORM_META.Amazon;
  const statusMeta = STATUS_COLORS[task.status] || { dot: '#94a3b8', badge: 'bg-gray-100 text-gray-600' };
  const subTasks = task.subTasks || [];
  const completedSubs = subTasks.filter(s => s.status === 'Completed').length;
  const progress = subTasks.length > 0 ? Math.round((completedSubs / subTasks.length) * 100) : 0;

  return (
    <div
      onClick={() => navigate(`/workflow/${task._id}`)}
      className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-orange-200 hover:bg-orange-50/30 cursor-pointer transition-all group"
    >
      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: statusMeta.dot }} />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-orange-700">
          {task.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className={clsx('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', statusMeta.badge)}>
            {task.status}
          </span>
          {task.assignedTo && (
            <span className="text-[10px] text-gray-400">
              → {task.assignedTo.firstName} {task.assignedTo.lastName}
            </span>
          )}
          {task.dueDate && (
            <span className={clsx('text-[10px] font-medium', task.isOverdue && task.status !== 'Completed' ? 'text-red-500' : 'text-gray-400')}>
              {task.isOverdue && task.status !== 'Completed' ? 'OVERDUE · ' : ''}
              {format(new Date(task.dueDate), 'dd MMM')}
            </span>
          )}
        </div>
      </div>

      {subTasks.length > 0 && (
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-14 bg-gray-200 rounded-full h-1.5 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${progress}%`, background: progress === 100 ? '#22c55e' : meta.color }} />
          </div>
          <span className="text-[10px] font-bold text-gray-500 w-7 text-right">{progress}%</span>
        </div>
      )}
    </div>
  );
}

function WeekBar({ label, value, maxVal, isToday }) {
  const pct = maxVal > 0 ? Math.min((value / maxVal) * 100, 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className={clsx('text-xs font-semibold w-8 flex-shrink-0', isToday ? 'text-orange-600' : 'text-gray-500')}>{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden relative">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #f97316, #fb923c)' }}
        />
        {value > 0 && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-bold text-gray-700">{value}%</span>
        )}
      </div>
      <span className={clsx('text-xs font-bold w-10 text-right flex-shrink-0', value > 0 ? 'text-orange-600' : 'text-gray-400')}>{value}%</span>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function MarketplaceDept() {
  const [activePlatform, setActivePlatform] = useState(null); // null = show all
  const [form, setForm] = useState(EMPTY_FORM);
  const [formSaved, setFormSaved] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { socket } = useSocketStore();

  // Real-time: invalidate tasks whenever any task is created/updated in the org
  const refreshTasks = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['marketplace', 'tasks'] });
    queryClient.invalidateQueries({ queryKey: ['marketplace', 'analytics'] });
  }, [queryClient]);

  useEffect(() => {
    if (!socket) return;
    socket.on('task_created', refreshTasks);
    socket.on('task_updated', refreshTasks);
    return () => {
      socket.off('task_created', refreshTasks);
      socket.off('task_updated', refreshTasks);
    };
  }, [socket, refreshTasks]);

  // All marketplace tasks (with subTasks populated)
  const { data: tasksData, isLoading: tasksLoading } = useQuery({
    queryKey: ['marketplace', 'tasks', 'all'],
    queryFn: () => api.get('/marketplace/tasks?limit=200').then(r => r.data),
    refetchInterval: 15000, // poll every 15 s as fallback
  });

  // Platform analytics
  const { data: analyticsData } = useQuery({
    queryKey: ['marketplace', 'analytics'],
    queryFn: () => api.get('/marketplace/analytics').then(r => r.data.analytics),
    refetchInterval: 15000,
  });

  // Today's pre-fill
  const { data: todayEntry } = useQuery({
    queryKey: ['marketplace', 'daily', 'today'],
    queryFn: () => api.get('/marketplace/daily/today').then(r => r.data.entry),
  });

  // Week data
  const { data: weekData } = useQuery({
    queryKey: ['marketplace', 'daily', 'week'],
    queryFn: () => api.get('/marketplace/daily/week').then(r => r.data),
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (todayEntry) {
      setForm({
        totalSales:  todayEntry.totalSales  ?? '',
        ctr:         todayEntry.ctr         ?? '',
        cvr:         todayEntry.cvr         ?? '',
        adSpend:     todayEntry.adSpend     ?? '',
        adRevenue:   todayEntry.adRevenue   ?? '',
        returns:     todayEntry.returns     ?? '',
        worstSkuCvr: todayEntry.worstSkuCvr ?? '',
        notes:       todayEntry.notes       || '',
      });
      setFormSaved(true);
    }
  }, [todayEntry]);

  const saveMutation = useMutation({
    mutationFn: (data) => api.post('/marketplace/daily', data).then(r => r.data),
    onSuccess: (responseData) => {
      toast.success('Numbers saved!');
      setFormSaved(true);
      // Invalidate + force-refetch both daily queries immediately
      queryClient.invalidateQueries({ queryKey: ['marketplace', 'daily'] });
      queryClient.refetchQueries({ queryKey: ['marketplace', 'daily', 'week'] });
      queryClient.refetchQueries({ queryKey: ['marketplace', 'daily', 'today'] });
    },
    onError: () => toast.error('Failed to save'),
  });

  const allTasks = useMemo(() => tasksData?.data || [], [tasksData]);
  const byPlatform = useMemo(() => groupByPlatform(allTasks), [allTasks]);
  const platformStats = analyticsData?.platformStats || [];

  const weekDays = getWeekDays();
  const weekEntries = weekData?.entries || [];
  const entryByDate = Object.fromEntries(
    weekEntries.map(e => [format(new Date(e.date), 'yyyy-MM-dd'), e])
  );
  const weekBars = weekDays.map(d => ({
    label: d.label,
    value: entryByDate[d.date] ? Number(entryByDate[d.date].cvr) : 0,
    isToday: d.date === format(new Date(), 'yyyy-MM-dd'),
  }));
  const maxCvr = Math.max(...weekBars.map(b => b.value), 1);

  const roas = form.adSpend > 0 ? (Number(form.adRevenue) / Number(form.adSpend)).toFixed(2) : null;
  const netRev = (form.adRevenue && form.adSpend) ? Number(form.adRevenue) - Number(form.adSpend) : null;

  const displayTasks = activePlatform ? byPlatform[activePlatform] || [] : allTasks;
  const totalCount = (p) => byPlatform[p]?.length || 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ color: '#f97316' }}>Marketplace Operations</h1>
          <p className="text-gray-500 text-sm">Platform-wise performance tracking · {allTasks.length} total tasks</p>
        </div>
        <span className="flex items-center gap-1.5 text-xs text-gray-400 font-medium">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          {format(new Date(), 'EEE, dd MMM yyyy')}
        </span>
      </div>

      {/* Platform navigation tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setActivePlatform(null)}
          className={clsx(
            'px-3 py-2 rounded-xl text-xs font-bold border transition-all',
            !activePlatform
              ? 'bg-gray-900 text-white border-gray-900 shadow-md'
              : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400',
          )}
        >
          All Platforms
        </button>
        {PLATFORMS.map(p => (
          <PlatformTab
            key={p}
            name={p}
            active={activePlatform === p}
            count={totalCount(p)}
            onClick={() => setActivePlatform(activePlatform === p ? null : p)}
          />
        ))}
      </div>

      {/* Platform overview grid (all view) or platform detail header */}
      {!activePlatform ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {PLATFORMS.map(p => (
            <PlatformCard
              key={p}
              name={p}
              tasks={byPlatform[p]}
              active={false}
              onSelect={setActivePlatform}
            />
          ))}
        </div>
      ) : (
        /* Platform detail banner */
        <div
          className="rounded-2xl p-5 border-2 flex items-center gap-5"
          style={{ background: PLATFORM_META[activePlatform].bg, borderColor: PLATFORM_META[activePlatform].color + '66' }}
        >
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-xl font-black shadow-lg flex-shrink-0"
            style={{ background: PLATFORM_META[activePlatform].color }}
          >
            {PLATFORM_META[activePlatform].initial}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-gray-900">{activePlatform}</h2>
            <div className="flex items-center gap-4 mt-1 flex-wrap text-sm">
              <span className="text-gray-600">{byPlatform[activePlatform]?.length || 0} tasks</span>
              {/* Members on this platform */}
              {[...new Map(
                (byPlatform[activePlatform] || [])
                  .filter(t => t.assignedTo)
                  .map(t => [t.assignedTo._id, t.assignedTo])
              ).values()].map(m => (
                <span key={m._id} className="flex items-center gap-1 font-semibold" style={{ color: PLATFORM_META[activePlatform].text }}>
                  <UserCircleIcon className="w-4 h-4" />
                  {m.firstName} {m.lastName}
                </span>
              ))}
            </div>
          </div>
          {/* Quick stats */}
          {(() => {
            const tasks = byPlatform[activePlatform] || [];
            const done = tasks.filter(t => t.status === 'Completed').length;
            const pct = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;
            const overdue = tasks.filter(t => t.isOverdue && t.status !== 'Completed').length;
            return (
              <div className="flex items-center gap-4 flex-shrink-0">
                <div className="text-center">
                  <p className="text-2xl font-black" style={{ color: PLATFORM_META[activePlatform].color }}>{pct}%</p>
                  <p className="text-[10px] text-gray-500">complete</p>
                </div>
                {overdue > 0 && (
                  <div className="text-center">
                    <p className="text-2xl font-black text-red-600">{overdue}</p>
                    <p className="text-[10px] text-gray-500">overdue</p>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Workflow tasks for selected platform / all */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-base">⚡</span>
            <h3 className="font-bold text-gray-900">
              {activePlatform ? `${activePlatform} Workflow Tasks` : 'All Marketplace Workflow Tasks'}
            </h3>
            <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full font-medium">
              {displayTasks.length} task{displayTasks.length !== 1 ? 's' : ''}
            </span>
          </div>
          {/* Live indicator */}
          <span className="flex items-center gap-1 text-[10px] text-green-600 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            Live
          </span>
        </div>

        {tasksLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : displayTasks.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <ChartBarIcon className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm font-medium text-gray-500">
              No {activePlatform ? `${activePlatform} ` : ''}tasks yet
            </p>
            <p className="text-xs mt-1">
              Open the Workflow builder → add a subtask → select <strong>{activePlatform || 'a platform'}</strong>
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {displayTasks.map(task => (
              <TaskRow key={task._id} task={task} navigate={navigate} />
            ))}
          </div>
        )}
      </div>

      {/* Daily entry + weekly progress */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* 📊 Daily form */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-lg">📊</span>
            <h3 className="font-bold text-gray-900">Enter Today's Numbers</h3>
            {formSaved && (
              <span className="ml-auto text-xs text-green-600 font-semibold flex items-center gap-1">
                <CheckCircleIcon className="w-3.5 h-3.5" /> Saved
              </span>
            )}
          </div>

          <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(form); }} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'totalSales', label: 'Total Sales Today', placeholder: 'e.g. 5', step: '1' },
                { key: 'ctr',        label: 'Overall CTR (%)',   placeholder: 'e.g. 1.12', step: '0.01' },
                { key: 'cvr',        label: 'Overall CVR (%)',   placeholder: 'e.g. 3.90', step: '0.01' },
                { key: 'returns',    label: 'Returns Count',     placeholder: 'e.g. 0', step: '1' },
                { key: 'adSpend',    label: 'Ad Spend (₹)',      placeholder: 'e.g. 100', step: '1' },
                { key: 'adRevenue',  label: 'Ad Revenue (₹)',    placeholder: 'e.g. 350', step: '1' },
              ].map(({ key, label, placeholder, step }) => (
                <div key={key}>
                  <label className="text-xs font-semibold text-gray-600 block mb-1">{label}</label>
                  <input
                    type="number" min="0" step={step} placeholder={placeholder}
                    value={form[key]}
                    onChange={e => { setForm(f => ({ ...f, [key]: e.target.value })); setFormSaved(false); }}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                </div>
              ))}
            </div>

            {/* Derived quick metrics */}
            {(roas || netRev !== null) && (
              <div className="flex gap-3 p-3 bg-orange-50 rounded-xl text-xs">
                {roas && (
                  <div className="flex-1 text-center">
                    <p className="text-gray-500">ROAS</p>
                    <p className="font-bold text-orange-700 text-base">{roas}×</p>
                  </div>
                )}
                {netRev !== null && (
                  <div className="flex-1 text-center border-l border-orange-100">
                    <p className="text-gray-500">Net Revenue</p>
                    <p className={clsx('font-bold text-base', netRev >= 0 ? 'text-green-600' : 'text-red-600')}>
                      ₹{Math.abs(netRev).toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">
                Worst-Performing SKU CVR Today (%)
              </label>
              <input
                type="number" step="0.01" min="0"
                placeholder="e.g. 1.5 — enter 0 if no ads running"
                value={form.worstSkuCvr}
                onChange={e => { setForm(f => ({ ...f, worstSkuCvr: e.target.value })); setFormSaved(false); }}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Notes / Anomalies Spotted</label>
              <textarea
                rows={2}
                placeholder="e.g. TRCCFW150 CTR dropped — check listing"
                value={form.notes}
                onChange={e => { setForm(f => ({ ...f, notes: e.target.value })); setFormSaved(false); }}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>

            <button
              type="submit"
              disabled={saveMutation.isPending}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white transition-all"
              style={{ background: saveMutation.isPending ? '#fdba74' : '#f97316' }}
            >
              {saveMutation.isPending
                ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : '💾'}
              {saveMutation.isPending ? 'Saving…' : "Save Today's Numbers"}
            </button>
          </form>
        </div>

        {/* 📈 Weekly CVR progress */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-lg">📈</span>
            <h3 className="font-bold text-gray-900">This Week's Progress</h3>
            <span className="ml-auto text-[10px] text-gray-400 font-medium">CVR % by day</span>
          </div>

          <div className="space-y-3">
            {weekBars.map(b => (
              <WeekBar key={b.label} label={b.label} value={b.value} maxVal={maxCvr} isToday={b.isToday} />
            ))}
          </div>

          {weekEntries.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-[11px] text-gray-400">Avg CVR</p>
                <p className="text-sm font-bold text-orange-600">
                  {(weekEntries.reduce((s, e) => s + e.cvr, 0) / weekEntries.length).toFixed(2)}%
                </p>
              </div>
              <div>
                <p className="text-[11px] text-gray-400">Total Sales</p>
                <p className="text-sm font-bold text-gray-800">
                  {weekEntries.reduce((s, e) => s + e.totalSales, 0)}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-gray-400">Total Returns</p>
                <p className="text-sm font-bold text-red-600">
                  {weekEntries.reduce((s, e) => s + e.returns, 0)}
                </p>
              </div>
            </div>
          )}

          {weekEntries.length === 0 && (
            <p className="text-center text-xs text-gray-400 mt-6">
              No data yet this week. Start by saving today's numbers.
            </p>
          )}

          {weekEntries.some(e => e.notes) && (
            <div className="mt-4 pt-3 border-t border-gray-100 space-y-2">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Anomaly Notes</p>
              {weekEntries.filter(e => e.notes).map((e, i) => (
                <div key={i} className="flex gap-2 text-xs">
                  <span className="text-gray-400 flex-shrink-0">{format(new Date(e.date), 'EEE')}</span>
                  <span className="text-gray-700">{e.notes}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
