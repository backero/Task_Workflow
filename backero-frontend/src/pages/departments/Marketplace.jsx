import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  ChartBarIcon, ArrowTrendingUpIcon, BanknotesIcon,
  ExclamationTriangleIcon, CheckCircleIcon, ClockIcon,
} from '@heroicons/react/24/outline';
import { clsx } from 'clsx';
import { format, startOfWeek, addDays } from 'date-fns';
import api from '../../api/axios';
import toast from 'react-hot-toast';

const PLATFORMS = ['Amazon', 'Flipkart', 'Meesho', 'Myntra', 'JioMart', 'Snapdeal'];
const PLATFORM_COLORS = {
  Amazon:   '#FF9900',
  Flipkart: '#2874f0',
  Meesho:   '#f43397',
  Myntra:   '#ff3f6c',
  JioMart:  '#0077B6',
  Snapdeal: '#e40046',
};

const STATUS_COLORS = {
  'Completed':        'bg-green-100 text-green-700',
  'In Progress':      'bg-yellow-100 text-yellow-800',
  'Assigned':         'bg-blue-100 text-blue-700',
  'Pending':          'bg-gray-100 text-gray-600',
  'Approval Pending': 'bg-indigo-100 text-indigo-700',
  'Reopened':         'bg-red-100 text-red-700',
};

const EMPTY_FORM = {
  totalSales: '', ctr: '', cvr: '', adSpend: '',
  adRevenue: '', returns: '', worstSkuCvr: '', notes: '',
};

// ── Week-day labels Mon→Sun ───────────────────────────────────────────────────

function getWeekDays() {
  const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(monday, i);
    return { label: format(d, 'EEE'), date: format(d, 'yyyy-MM-dd'), full: d };
  });
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function MetricCard({ label, value, sub, icon: Icon, color }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
      <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', color)}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        <p className="text-lg font-bold text-gray-900 leading-tight">{value}</p>
        {sub && <p className="text-[11px] text-gray-400">{sub}</p>}
      </div>
    </div>
  );
}

// ── Weekly bar (single day) ───────────────────────────────────────────────────

function WeekBar({ label, value, maxVal, isToday }) {
  const pct = maxVal > 0 ? Math.min((value / maxVal) * 100, 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className={clsx('text-xs font-semibold w-8 flex-shrink-0', isToday ? 'text-orange-600' : 'text-gray-500')}>
        {label}
      </span>
      <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden relative">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #f97316, #fb923c)' }}
        />
        {value > 0 && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-bold text-gray-700">
            {value}%
          </span>
        )}
      </div>
      <span className={clsx('text-xs font-bold w-10 text-right flex-shrink-0', value > 0 ? 'text-orange-600' : 'text-gray-400')}>
        {value}%
      </span>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function MarketplaceDept() {
  const [platform, setPlatform] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [saved, setSaved] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Platform analytics
  const { data: analyticsData } = useQuery({
    queryKey: ['marketplace', 'analytics'],
    queryFn: () => api.get('/marketplace/analytics').then(r => r.data.analytics),
  });

  // Today's pre-fill
  const { data: todayData } = useQuery({
    queryKey: ['marketplace', 'daily', 'today'],
    queryFn: () => api.get('/marketplace/daily/today').then(r => r.data.entry),
  });

  // This week's data
  const { data: weekData } = useQuery({
    queryKey: ['marketplace', 'daily', 'week'],
    queryFn: () => api.get('/marketplace/daily/week').then(r => r.data),
    refetchInterval: 30000,
  });

  // Workflow tasks
  const { data: tasksData } = useQuery({
    queryKey: ['marketplace', 'tasks', platform],
    queryFn: () => api.get('/marketplace/tasks', {
      params: { platform: platform || undefined, limit: 20, rootOnly: true },
    }).then(r => r.data),
  });

  // Pre-fill form when today's data loads
  useEffect(() => {
    if (todayData) {
      setForm({
        totalSales:  todayData.totalSales  ?? '',
        ctr:         todayData.ctr         ?? '',
        cvr:         todayData.cvr         ?? '',
        adSpend:     todayData.adSpend     ?? '',
        adRevenue:   todayData.adRevenue   ?? '',
        returns:     todayData.returns     ?? '',
        worstSkuCvr: todayData.worstSkuCvr ?? '',
        notes:       todayData.notes       || '',
      });
      setSaved(true);
    }
  }, [todayData]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: (data) => api.post('/marketplace/daily', data).then(r => r.data),
    onSuccess: () => {
      toast.success('Numbers saved!');
      setSaved(true);
      queryClient.invalidateQueries(['marketplace', 'daily']);
    },
    onError: () => toast.error('Failed to save. Try again.'),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    saveMutation.mutate(form);
  };

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const platformStats = analyticsData?.platformStats || [];
  const tasks = tasksData?.data || [];
  const weekDays = getWeekDays();
  const weekEntries = weekData?.entries || [];

  // Map week entries by date
  const entryByDate = {};
  weekEntries.forEach(e => {
    entryByDate[format(new Date(e.date), 'yyyy-MM-dd')] = e;
  });

  // Build weekly CVR data
  const weekBars = weekDays.map(d => {
    const entry = entryByDate[d.date];
    const isToday = d.date === format(new Date(), 'yyyy-MM-dd');
    return { label: d.label, value: entry ? Number(entry.cvr) : 0, isToday };
  });
  const maxCvr = Math.max(...weekBars.map(b => b.value), 1);

  // Today's derived metrics
  const roas = form.adSpend > 0 ? (Number(form.adRevenue) / Number(form.adSpend)).toFixed(2) : '—';
  const netRev = form.adRevenue && form.adSpend ? `₹${(Number(form.adRevenue) - Number(form.adSpend)).toLocaleString()}` : '—';
  const returnRate = form.totalSales > 0 ? `${((Number(form.returns) / Number(form.totalSales)) * 100).toFixed(1)}%` : '—';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ color: '#f97316' }}>Marketplace Operations</h1>
          <p className="text-gray-500 text-sm">Multi-platform performance & daily tracking</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400 font-medium">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          {format(new Date(), 'EEE, dd MMM yyyy')}
        </div>
      </div>

      {/* Platform health */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
        {PLATFORMS.map(p => {
          const stat = platformStats.find(s => s._id === p);
          const rate = stat?.completionRate || 0;
          return (
            <button
              key={p}
              onClick={() => setPlatform(platform === p ? '' : p)}
              className={clsx(
                'card p-3 text-center cursor-pointer border-2 transition-all hover:shadow-md',
                platform === p ? 'border-orange-400 shadow-md' : 'border-transparent',
              )}
            >
              <div className="w-8 h-8 rounded-lg mx-auto mb-2 flex items-center justify-center text-white text-xs font-bold"
                style={{ background: PLATFORM_COLORS[p] }}>
                {p[0]}
              </div>
              <p className="text-xs font-semibold text-gray-900 truncate">{p}</p>
              <p className={clsx('text-xs font-bold mt-0.5', rate >= 70 ? 'text-green-600' : rate >= 40 ? 'text-yellow-600' : 'text-red-600')}>
                {Math.round(rate)}%
              </p>
              <p className="text-[10px] text-gray-400">{stat?.count || stat?.total || 0} tasks</p>
            </button>
          );
        })}
      </div>

      {/* Derived metric cards (from today's saved form) */}
      {(form.adSpend || form.adRevenue) && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard label="Total Sales Today" value={form.totalSales || '—'} icon={ChartBarIcon} color="bg-orange-500" />
          <MetricCard label="ROAS" value={roas !== '—' ? `${roas}×` : '—'} sub="Ad Revenue / Spend" icon={ArrowTrendingUpIcon} color="bg-green-500" />
          <MetricCard label="Net Ad Revenue" value={netRev} sub="Revenue − Spend" icon={BanknotesIcon} color="bg-blue-500" />
          <MetricCard label="Return Rate" value={returnRate} sub={`${form.returns || 0} returns`} icon={ExclamationTriangleIcon} color="bg-red-500" />
        </div>
      )}

      {/* Daily form + Weekly progress */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* 📊 Daily Entry Form */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-lg">📊</span>
            <h3 className="font-bold text-gray-900">Enter Today's Numbers</h3>
            {saved && (
              <span className="ml-auto text-xs text-green-600 font-semibold flex items-center gap-1">
                <CheckCircleIcon className="w-3.5 h-3.5" /> Saved
              </span>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Total Sales Today</label>
                <input
                  type="number" min="0" placeholder="e.g. 5"
                  value={form.totalSales}
                  onChange={e => handleChange('totalSales', e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Overall CTR (%)</label>
                <input
                  type="number" step="0.01" min="0" placeholder="e.g. 1.12"
                  value={form.ctr}
                  onChange={e => handleChange('ctr', e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Overall CVR (%)</label>
                <input
                  type="number" step="0.01" min="0" placeholder="e.g. 3.90"
                  value={form.cvr}
                  onChange={e => handleChange('cvr', e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Returns Count</label>
                <input
                  type="number" min="0" placeholder="e.g. 0"
                  value={form.returns}
                  onChange={e => handleChange('returns', e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Ad Spend (₹)</label>
                <input
                  type="number" min="0" placeholder="e.g. 100"
                  value={form.adSpend}
                  onChange={e => handleChange('adSpend', e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1">Ad Revenue (₹)</label>
                <input
                  type="number" min="0" placeholder="e.g. 350"
                  value={form.adRevenue}
                  onChange={e => handleChange('adRevenue', e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">
                Worst-Performing SKU CVR Today (%)
              </label>
              <input
                type="number" step="0.01" min="0"
                placeholder="e.g. 1.5 — enter 0 if no ads running"
                value={form.worstSkuCvr}
                onChange={e => handleChange('worstSkuCvr', e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Notes / Anomalies Spotted</label>
              <textarea
                rows={2}
                placeholder="e.g. TRCCFW150 CTR dropped — check listing"
                value={form.notes}
                onChange={e => handleChange('notes', e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>

            <button
              type="submit"
              disabled={saveMutation.isPending}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold text-white transition-all"
              style={{ background: saveMutation.isPending ? '#fdba74' : '#f97316' }}
            >
              {saveMutation.isPending ? (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : '💾'}
              {saveMutation.isPending ? 'Saving…' : 'Save Today\'s Numbers'}
            </button>
          </form>
        </div>

        {/* 📈 This Week's Progress */}
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

          {/* Week summary */}
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
            <p className="text-center text-xs text-gray-400 mt-6">No data yet this week. Start by saving today's numbers.</p>
          )}

          {/* Notes log */}
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

      {/* Workflow Tasks */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">⚡</span>
            <h3 className="font-bold text-gray-900">
              {platform ? `${platform} Workflow Tasks` : 'Marketplace Workflow Tasks'}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            {PLATFORMS.map(p => (
              <button
                key={p}
                onClick={() => setPlatform(platform === p ? '' : p)}
                className={clsx(
                  'text-[10px] font-bold px-2 py-1 rounded-full border transition-all',
                  platform === p
                    ? 'text-white border-transparent'
                    : 'text-gray-500 border-gray-200 hover:border-gray-400',
                )}
                style={platform === p ? { background: PLATFORM_COLORS[p] } : {}}
              >
                {p[0]}
              </button>
            ))}
          </div>
        </div>

        {tasks.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <ClockIcon className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No workflow tasks found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {tasks.map(task => {
              const subTasks = task.subTasks || [];
              const completedSubs = subTasks.filter(s => s.status === 'Completed').length;
              const progress = subTasks.length > 0 ? Math.round((completedSubs / subTasks.length) * 100) : 0;

              return (
                <div
                  key={task._id}
                  onClick={() => navigate(`/workflow/${task._id}`)}
                  className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-orange-200 hover:bg-orange-50/40 cursor-pointer transition-all group"
                >
                  <div
                    className="w-7 h-7 rounded-lg text-white text-xs font-bold flex items-center justify-center flex-shrink-0"
                    style={{ background: PLATFORM_COLORS[task.platform] || '#f97316' }}
                  >
                    {(task.platform?.[0] || 'M')}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-orange-700">
                      {task.title}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={clsx('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', STATUS_COLORS[task.status] || 'bg-gray-100 text-gray-600')}>
                        {task.status}
                      </span>
                      {task.assignedTo && (
                        <span className="text-[10px] text-gray-400">
                          → {task.assignedTo.firstName} {task.assignedTo.lastName}
                        </span>
                      )}
                      {subTasks.length > 0 && (
                        <span className="text-[10px] text-gray-400">
                          {completedSubs}/{subTasks.length} subtasks
                        </span>
                      )}
                    </div>
                  </div>

                  {subTasks.length > 0 && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className="w-16 bg-gray-200 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${progress}%`,
                            background: progress === 100 ? '#22c55e' : '#f97316',
                          }}
                        />
                      </div>
                      <span className="text-[10px] font-bold text-gray-600 w-8 text-right">{progress}%</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
