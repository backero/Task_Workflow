import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import api from '../api/axios'
import Layout from '../components/Layout'
import { useAuth } from '../context/AuthContext'
import { useOrg } from '../context/OrgContext'
import { useSocket } from '../context/SocketContext'

/* ─── Constants ─────────────────────────────────────────────────────────────── */

const PIE_COLORS = ['#6366f1', '#f59e0b', '#8b5cf6', '#10b981']

const STAT_CARDS = [
  { key: 'totalTasks',      label: 'Total Tasks',      icon: '📋', bg: 'bg-indigo-50',  text: 'text-indigo-600',  border: 'border-indigo-100' },
  { key: 'pendingTasks',    label: 'Pending Tasks',    icon: '⏳', bg: 'bg-amber-50',   text: 'text-amber-600',   border: 'border-amber-100'  },
  { key: 'completedTasks',  label: 'Completed',        icon: '✅', bg: 'bg-green-50',   text: 'text-green-600',   border: 'border-green-100'  },
  { key: 'overdueTasks',    label: 'Overdue',          icon: '🔴', bg: 'bg-red-50',     text: 'text-red-600',     border: 'border-red-100'    },
  { key: 'totalEmployees',  label: 'Total Employees',  icon: '👥', bg: 'bg-blue-50',    text: 'text-blue-600',    border: 'border-blue-100'   },
  { key: 'activeEmployees', label: 'Active Employees', icon: '🟢', bg: 'bg-teal-50',    text: 'text-teal-600',    border: 'border-teal-100'   },
  { key: 'inventoryAlerts', label: 'Inventory Alerts', icon: '📦', bg: 'bg-orange-50',  text: 'text-orange-600',  border: 'border-orange-100' },
  { key: 'netRevenue',      label: 'Net Revenue (₹)',  icon: '💰', bg: 'bg-purple-50',  text: 'text-purple-600',  border: 'border-purple-100' },
]

const ACTION_ICONS = {
  TASK_CREATED:        '➕',
  TASK_UPDATED:        '✏️',
  TASK_STATUS_CHANGED: '🔄',
  TASK_DELETED:        '🗑️',
  PROJECT_CREATED:     '📁',
  PROJECT_UPDATED:     '📝',
  MEMBER_ADDED:        '👤',
}

const PLACEHOLDER_REVENUE = [
  { month: 'Jan', revenue: 0, expenses: 0 },
  { month: 'Feb', revenue: 0, expenses: 0 },
  { month: 'Mar', revenue: 0, expenses: 0 },
  { month: 'Apr', revenue: 0, expenses: 0 },
  { month: 'May', revenue: 0, expenses: 0 },
  { month: 'Jun', revenue: 0, expenses: 0 },
]

/* ─── Sub-components ─────────────────────────────────────────────────────────── */

const StatCard = ({ label, value, icon, bg, text, border, pulse }) => (
  <div className={`bg-white rounded-2xl border ${border} shadow-sm p-4 flex items-center gap-4 hover:shadow-md transition-all duration-200 relative overflow-hidden`}>
    {pulse && (
      <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-green-400 animate-ping opacity-75" />
    )}
    <div className={`${bg} rounded-xl w-11 h-11 flex items-center justify-center text-lg flex-shrink-0`}>
      <span>{icon}</span>
    </div>
    <div className="min-w-0">
      <p className="text-xs text-gray-400 uppercase font-semibold tracking-wide truncate">{label}</p>
      <p className={`text-2xl font-bold ${text} mt-0.5`}>
        {value !== undefined ? value.toLocaleString('en-IN') : '—'}
      </p>
    </div>
  </div>
)

const ChartCard = ({ title, subtitle, children }) => (
  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
    <div className="mb-4">
      <h3 className="font-semibold text-gray-800 text-sm">{title}</h3>
      {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
    </div>
    {children}
  </div>
)

const TaskPieChart = ({ tasks }) => {
  const data = [
    { name: 'To Do',       value: tasks.todo       || 0 },
    { name: 'In Progress', value: tasks.inProgress || 0 },
    { name: 'In Review',   value: tasks.inReview   || 0 },
    { name: 'Done',        value: tasks.completed  || 0 },
  ].filter(d => d.value > 0)

  if (!data.length) {
    return (
      <div className="h-52 flex flex-col items-center justify-center gap-2">
        <span className="text-3xl">📋</span>
        <p className="text-sm text-gray-400">No tasks yet</p>
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={210}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={82}
          paddingAngle={3}
          dataKey="value"
        >
          {data.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
        </Pie>
        <Tooltip formatter={(v, n) => [v, n]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  )
}

const WeeklyBarChart = ({ data }) => {
  if (!data.length) {
    return (
      <div className="h-52 flex items-center justify-center">
        <p className="text-sm text-gray-400">No data for this period</p>
      </div>
    )
  }
  return (
    <ResponsiveContainer width="100%" height={210}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
        <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="created"   name="Created"   fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Bar dataKey="completed" name="Completed" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  )
}

const EmployeeBarChart = ({ data }) => {
  if (!data.length) {
    return (
      <div className="h-52 flex flex-col items-center justify-center gap-2">
        <span className="text-3xl">👥</span>
        <p className="text-sm text-gray-400">No task assignments yet</p>
      </div>
    )
  }
  return (
    <ResponsiveContainer width="100%" height={210}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
        <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
        <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="total"     name="Assigned"  fill="#6366f1" radius={[0, 4, 4, 0]} maxBarSize={14} />
        <Bar dataKey="completed" name="Completed" fill="#10b981" radius={[0, 4, 4, 0]} maxBarSize={14} />
      </BarChart>
    </ResponsiveContainer>
  )
}

const RevenueBarChart = ({ data }) => (
  <ResponsiveContainer width="100%" height={210}>
    <BarChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
      <YAxis tick={{ fontSize: 11 }} />
      <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
      <Bar dataKey="revenue"  name="Revenue"  fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={28} />
      <Bar dataKey="expenses" name="Expenses" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={28} />
    </BarChart>
  </ResponsiveContainer>
)

const SkeletonCard = () => (
  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 animate-pulse">
    <div className="flex items-center gap-4">
      <div className="w-11 h-11 bg-gray-100 rounded-xl flex-shrink-0" />
      <div className="flex-1">
        <div className="h-2.5 bg-gray-100 rounded w-20 mb-2" />
        <div className="h-7 bg-gray-100 rounded w-12" />
      </div>
    </div>
  </div>
)

/* ─── Dashboard page ─────────────────────────────────────────────────────────── */

export default function Dashboard() {
  const { user } = useAuth()
  const { org } = useOrg()
  const { socket, connected } = useSocket() || {}

  const [overview, setOverview]     = useState(null)
  const [weeklyData, setWeekly]     = useState([])
  const [empData, setEmpData]       = useState([])
  const [monthlyFinance, setMonthly] = useState(PLACEHOLDER_REVENUE)
  const [activity, setActivity]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [lastUpdated, setUpdated]   = useState(null)

  const fetchOverview = useCallback(async () => {
    try {
      const res = await api.get('/dashboard/overview')
      const d = res.data.data
      setOverview(d)
      setActivity(d.recentActivity || [])
      setUpdated(new Date())
    } catch {}
  }, [])

  const fetchCharts = useCallback(async () => {
    try {
      const [wRes, eRes, fRes] = await Promise.all([
        api.get('/dashboard/weekly-tasks?days=7'),
        api.get('/dashboard/employee-performance'),
        api.get('/finance/monthly?months=6').catch(() => null),
      ])
      setWeekly(wRes.data.data.data || [])
      setEmpData(eRes.data.data.data || [])
      if (fRes) setMonthly(fRes.data.data.data || PLACEHOLDER_REVENUE)
    } catch {}
  }, [])

  useEffect(() => {
    Promise.all([fetchOverview(), fetchCharts()]).finally(() => setLoading(false))
  }, [fetchOverview, fetchCharts])

  // Real-time refresh on task and dashboard events
  useEffect(() => {
    if (!socket) return
    const refresh = () => { fetchOverview(); fetchCharts() }
    const events = ['dashboard:stats_updated', 'task:created', 'task:status_changed', 'task:deleted']
    events.forEach(e => socket.on(e, refresh))
    return () => events.forEach(e => socket.off(e, refresh))
  }, [socket, fetchOverview, fetchCharts])

  const t = overview?.tasks    || {}
  const e = overview?.employees || {}
  const f = overview?.finance  || {}

  const stats = {
    totalTasks:      t.total      ?? 0,
    pendingTasks:    t.pending    ?? 0,
    completedTasks:  t.completed  ?? 0,
    overdueTasks:    t.overdue    ?? 0,
    totalEmployees:  e.total      ?? 0,
    activeEmployees: e.active     ?? 0,
    inventoryAlerts: overview?.inventory?.alerts ?? 0,
    netRevenue:      (f.revenue   ?? 0) - (f.expenses ?? 0),
  }

  return (
    <Layout>
      {/* Welcome banner */}
      <div className="bg-gradient-to-r from-brand-600 via-purple-600 to-indigo-700 rounded-2xl p-6 mb-6 text-white">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-indigo-200 text-sm font-medium">Welcome back 👋</p>
            <h1 className="text-2xl font-bold mt-1">{user?.name || user?.phone}</h1>
            <p className="text-indigo-200 text-sm mt-1">
              {org?.name}&nbsp;·&nbsp;
              <span className="capitalize">{user?.role?.replace(/_/g, ' ')?.toLowerCase()}</span>
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium border ${connected ? 'bg-green-400/20 text-green-100 border-green-400/30' : 'bg-white/10 text-indigo-200 border-white/10'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-300 animate-pulse' : 'bg-gray-400'}`} />
              {connected ? 'Live' : 'Offline'}
            </div>
            {lastUpdated && (
              <p className="text-xs text-indigo-300">
                Updated {lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {loading
          ? [...Array(8)].map((_, i) => <SkeletonCard key={i} />)
          : STAT_CARDS.map(c => (
              <StatCard
                key={c.key}
                label={c.label}
                value={stats[c.key]}
                icon={c.icon}
                bg={c.bg}
                text={c.text}
                border={c.border}
                pulse={connected && (c.key === 'totalTasks' || c.key === 'pendingTasks')}
              />
            ))
        }
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <ChartCard title="Task Status Distribution" subtitle="Current snapshot of all tasks">
          <TaskPieChart tasks={t} />
        </ChartCard>
        <ChartCard title="Weekly Task Activity" subtitle="Created vs completed — last 7 days">
          <WeeklyBarChart data={weeklyData} />
        </ChartCard>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <ChartCard title="Employee Performance" subtitle="Task load per team member">
          <EmployeeBarChart data={empData} />
        </ChartCard>
        <ChartCard title="Revenue vs Expenses" subtitle="Monthly financial summary — last 6 months">
          <RevenueBarChart data={monthlyFinance} />
        </ChartCard>
      </div>

      {/* Activity feed */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-gray-800 text-sm">Recent Activity</h3>
            <p className="text-xs text-gray-400 mt-0.5">Live updates across your organisation</p>
          </div>
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400 animate-pulse' : 'bg-gray-300'}`} />
        </div>

        {activity.length === 0 ? (
          <div className="text-center py-10">
            <div className="text-4xl mb-3">📊</div>
            <p className="text-sm text-gray-400">No activity yet. Start creating tasks to see updates here.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {activity.map((item, i) => (
              <div key={item._id || i} className="flex items-start gap-3 py-3 hover:bg-gray-50 rounded-xl px-2 transition-colors">
                <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-sm flex-shrink-0 mt-0.5">
                  {ACTION_ICONS[item.action] || '•'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700 leading-snug">
                    <span className="font-medium">{item.userId?.name || item.userId?.phone || 'Someone'}</span>
                    {' '}{item.action?.replace(/_/g, ' ')?.toLowerCase()}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(item.createdAt).toLocaleString('en-IN', {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {activity.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-50">
            <Link to="/analytics" className="text-xs text-brand-600 hover:text-brand-700 font-medium">
              View full analytics →
            </Link>
          </div>
        )}
      </div>
    </Layout>
  )
}
