import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area,
} from 'recharts';
import {
  ClipboardDocumentListIcon, UsersIcon, CubeIcon, BoltIcon, BanknotesIcon,
  ExclamationTriangleIcon, CheckCircleIcon, ClockIcon, ArrowTrendingUpIcon,
  ChartBarIcon, BuildingOfficeIcon, ShoppingCartIcon, BeakerIcon,
  ArrowRightIcon, BellAlertIcon, UserGroupIcon, DocumentTextIcon,
} from '@heroicons/react/24/outline';
import api from '../../api/axios';
import { useAuthStore } from '../../store/useAuthStore';
import { formatDistanceToNow, format } from 'date-fns';
import { clsx } from 'clsx';

const PRIORITY_COLORS = { critical: 'badge-red', urgent: 'badge-red', high: 'badge-orange', medium: 'badge-yellow', low: 'badge-gray' };
const STATUS_COLORS   = { 'Completed': 'badge-green', 'In Progress': 'badge-yellow', 'Assigned': 'badge-blue', 'Approval Pending': 'badge-purple', 'Changes Requested': 'badge-red', 'Pending': 'badge-gray' };
const DEPT_COLORS     = ['#3b82f6', '#22c55e', '#f97316', '#9333ea', '#06b6d4', '#ec4899', '#f59e0b', '#6366f1'];

const fmt = (n) => (n || 0).toLocaleString('en-IN');
const pct = (n) => `${Math.round(n || 0)}%`;

// ── Stat Card ───────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, color = 'blue', to, badge }) {
  const card = (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={clsx('card p-5 flex flex-col gap-3', to && 'hover:shadow-md transition-shadow cursor-pointer')}
    >
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-xl bg-${color}-100 dark:bg-${color}-900/30 flex items-center justify-center`}>
          <Icon className={`w-5 h-5 text-${color}-600 dark:text-${color}-400`} />
        </div>
        {badge !== undefined && (
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badge > 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>
            {badge > 0 ? badge : '✓'}
          </span>
        )}
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
        <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mt-0.5">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </motion.div>
  );
  return to ? <Link to={to}>{card}</Link> : card;
}

// ── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({ title, sub, to, toLabel }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <h3 className="font-bold text-gray-900 dark:text-white">{title}</h3>
        {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
      </div>
      {to && (
        <Link to={to} className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium">
          {toLabel || 'View all'} <ArrowRightIcon className="w-3 h-3" />
        </Link>
      )}
    </div>
  );
}

// ── Custom Tooltip ───────────────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 shadow text-xs">
      <p className="font-semibold text-gray-700 dark:text-gray-300 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: <strong>₹{fmt(p.value)}</strong></p>
      ))}
    </div>
  );
};

// ── Main Dashboard ───────────────────────────────────────────────────────────
export default function FounderDashboard() {
  const { user } = useAuthStore();

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'founder'],
    queryFn: () => api.get('/dashboard/founder').then((r) => r.data.dashboard),
    refetchInterval: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const d          = data || {};
  const company    = d.company || {};
  const crm        = d.crm || {};
  const finance    = d.finance || {};
  const depts      = d.departments || [];
  const topEmps    = d.topEmployees || [];
  const approvals  = d.pendingApprovals || [];
  const alerts     = d.recentAlerts || [];
  const recentTasks = d.recentTasks || [];

  // Charts
  const taskPieData = [
    { name: 'Completed',   value: company.completedTasks || 0,         color: '#22c55e' },
    { name: 'In Progress', value: company.inProgressTasks || 0,        color: '#f97316' },
    { name: 'Assigned',    value: company.pendingTasks || 0,           color: '#3b82f6' },
    { name: 'Approval',    value: company.approvalPendingTasks || 0,   color: '#9333ea' },
    { name: 'Overdue',     value: company.overdueTaskCount || 0,       color: '#ef4444' },
  ].filter((d) => d.value > 0);

  const deptBarData = depts.map((d) => ({
    name: d._id || 'Unknown',
    Total: d.total || 0,
    Done: d.completed || 0,
    Overdue: d.overdue || 0,
  }));

  const crmPipeData = [
    { name: 'New',        value: crm.newLeads || 0,    fill: '#3b82f6' },
    { name: 'Follow-up',  value: crm.followUp || 0,    fill: '#f97316' },
    { name: 'Interested', value: crm.interested || 0,  fill: '#9333ea' },
    { name: 'Won',        value: crm.wonLeads || 0,    fill: '#22c55e' },
    { name: 'Lost',       value: crm.lostLeads || 0,   fill: '#ef4444' },
  ].filter((d) => d.value > 0);

  const revenueData = (finance.revenueChart || []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Command Center</h1>
          <p className="text-gray-500 text-sm">
            {greeting}, {user?.firstName}. Here's your complete business overview.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{format(new Date(), 'EEEE, dd MMMM yyyy')}</span>
          <span className="badge badge-green flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
            Live
          </span>
        </div>
      </div>

      {/* ── Row 1: Primary KPIs ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={ClipboardDocumentListIcon} color="blue"
          label="Total Tasks" value={company.totalTasks || 0}
          sub={`${pct(company.completionRate)} completion rate`}
          to="/tasks/kanban"
        />
        <StatCard
          icon={CheckCircleIcon} color="green"
          label="Completed Tasks" value={company.completedTasks || 0}
          sub={`${company.inProgressTasks || 0} in progress`}
          to="/tasks/team"
        />
        <StatCard
          icon={ExclamationTriangleIcon} color="red"
          label="Overdue Tasks" value={company.overdueTaskCount || 0}
          sub="Need immediate attention"
          badge={company.overdueTaskCount || 0}
          to="/tasks/team"
        />
        <StatCard
          icon={ClockIcon} color="purple"
          label="Pending Approvals" value={company.pendingApprovalsCount || 0}
          sub="Waiting for your review"
          badge={company.pendingApprovalsCount || 0}
          to="/tasks/approvals"
        />
      </div>

      {/* ── Row 2: Secondary KPIs ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={UserGroupIcon} color="indigo"
          label="Active Employees" value={company.totalEmployees || 0}
          sub="Across all departments"
          to="/management/team"
        />
        <StatCard
          icon={UsersIcon} color="cyan"
          label="Total Leads" value={crm.totalLeads || 0}
          sub={`${pct(crm.conversionRate)} conversion rate`}
          to="/crm/pipeline"
        />
        <StatCard
          icon={CubeIcon} color="yellow"
          label="Total Products" value={d.inventory?.totalProducts || 0}
          sub={d.inventory?.lowStockCount > 0 ? `${d.inventory.lowStockCount} below minimum stock` : 'All stock levels healthy'}
          badge={d.inventory?.lowStockCount || 0}
          to="/inventory/products"
        />
        <StatCard
          icon={BoltIcon} color="orange"
          label="Active Production" value={d.production?.activeOrders || 0}
          sub="Orders in progress"
          to="/production/orders"
        />
      </div>

      {/* ── Row 3: Finance + Task Chart ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Finance Panel */}
        <div className="card p-5 space-y-4">
          <SectionHeader title="Finance Overview" sub="Income vs Expense" to="/finance/ledger" toLabel="Ledger" />

          <div className="space-y-2">
            <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-800">
              <span className="text-sm text-gray-500">Today's Income</span>
              <span className="font-semibold text-green-600">₹{fmt(finance.todayIncome)}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-800">
              <span className="text-sm text-gray-500">Today's Expense</span>
              <span className="font-semibold text-red-600">₹{fmt(finance.todayExpense)}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-800">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Today Net</span>
              <span className={`font-bold ${(finance.todayNet || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ₹{fmt(finance.todayNet)}
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-800">
              <span className="text-sm text-gray-500">This Month Income</span>
              <span className="font-semibold text-green-600">₹{fmt(finance.monthIncome)}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-800">
              <span className="text-sm text-gray-500">This Month Expense</span>
              <span className="font-semibold text-red-600">₹{fmt(finance.monthExpense)}</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Total Revenue</span>
              <span className="font-bold text-brand-600">₹{fmt(finance.totalRevenue)}</span>
            </div>
          </div>

          {(d.inventory?.totalStockValue > 0) && (
            <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-800">
              <span className="text-sm text-gray-500">Inventory Value</span>
              <span className="font-semibold text-indigo-600">₹{fmt(d.inventory?.totalStockValue)}</span>
            </div>
          )}

          {revenueData.length > 0 && (
            <div className="pt-2">
              <p className="text-xs text-gray-500 mb-2">Monthly Revenue Trend</p>
              <ResponsiveContainer width="100%" height={80}>
                <AreaChart data={revenueData}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="revenue" stroke="#3b82f6" fill="url(#revGrad)" strokeWidth={2} dot={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Task Status Donut */}
        <div className="card p-5">
          <SectionHeader title="Task Status Breakdown" sub={`${company.totalTasks || 0} total tasks`} to="/tasks/analytics" toLabel="Analytics" />
          {taskPieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={taskPieData} cx="50%" cy="50%"
                  innerRadius={55} outerRadius={85}
                  paddingAngle={3} dataKey="value"
                >
                  {taskPieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-xs text-gray-600 dark:text-gray-400">{v}</span>} />
                <Tooltip formatter={(v, n) => [v, n]} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400">
              <CheckCircleIcon className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm">No tasks yet</p>
            </div>
          )}
        </div>

        {/* CRM Pipeline */}
        <div className="card p-5">
          <SectionHeader title="CRM Pipeline" sub={`${crm.totalLeads || 0} leads · ${pct(crm.conversionRate)} win rate`} to="/crm/pipeline" toLabel="Pipeline" />
          {crmPipeData.length > 0 ? (
            <div className="space-y-3 mt-2">
              {crmPipeData.map((item) => (
                <div key={item.name}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-600 dark:text-gray-400">{item.name}</span>
                    <span className="font-semibold text-gray-800 dark:text-gray-200">{item.value}</span>
                  </div>
                  <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${crm.totalLeads > 0 ? (item.value / crm.totalLeads) * 100 : 0}%`, backgroundColor: item.fill }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400">
              <UsersIcon className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm">No leads yet</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Row 4: Department Performance ────────────────────────────────────── */}
      {deptBarData.length > 0 && (
        <div className="card p-5">
          <SectionHeader title="Department Performance" sub="Tasks by department — completed vs overdue" to="/management/departments" toLabel="Full Report" />
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={deptBarData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-gray-100 dark:stroke-gray-800" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-xs">{v}</span>} />
              <Bar dataKey="Total"   fill="#3b82f6" radius={[3, 3, 0, 0]} name="Total" />
              <Bar dataKey="Done"    fill="#22c55e" radius={[3, 3, 0, 0]} name="Completed" />
              <Bar dataKey="Overdue" fill="#ef4444" radius={[3, 3, 0, 0]} name="Overdue" />
            </BarChart>
          </ResponsiveContainer>

          {/* Department health mini cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3 mt-5">
            {depts.map((dept, i) => (
              <div key={dept._id || i} className="rounded-xl border border-gray-100 dark:border-gray-800 p-3 text-center">
                <div
                  className="w-8 h-8 rounded-full mx-auto mb-2 flex items-center justify-center text-white text-xs font-bold"
                  style={{ backgroundColor: DEPT_COLORS[i % DEPT_COLORS.length] }}
                >
                  {(dept._id || 'U')[0]}
                </div>
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300 line-clamp-1">{dept._id || 'Unknown'}</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white mt-1">{pct(dept.completionRate)}</p>
                <p className="text-xs text-gray-400">{dept.total} tasks</p>
                <div className="mt-2 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${dept.completionRate || 0}%`,
                      backgroundColor: DEPT_COLORS[i % DEPT_COLORS.length],
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Row 5: Pending Approvals + Top Performers ─────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Pending Approvals */}
        <div className="card p-5">
          <SectionHeader
            title="Pending Approvals"
            sub={`${approvals.length} task${approvals.length !== 1 ? 's' : ''} waiting for review`}
            to="/tasks/approvals"
            toLabel="Review All"
          />
          {approvals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-400">
              <CheckCircleIcon className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm">All approvals are clear!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {approvals.map((ap) => (
                <div key={ap._id} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{ap.taskId?.title}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className={`badge ${PRIORITY_COLORS[ap.taskId?.priority] || 'badge-gray'}`}>{ap.taskId?.priority}</span>
                      <span className="text-xs text-gray-500">{ap.requestedBy?.firstName} {ap.requestedBy?.lastName}</span>
                      <span className="text-xs text-gray-400">{ap.requestedAt ? formatDistanceToNow(new Date(ap.requestedAt), { addSuffix: true }) : ''}</span>
                    </div>
                  </div>
                  <Link to="/tasks/approvals" className="btn-primary text-xs px-3 py-1.5 flex-shrink-0">Review</Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Performers */}
        <div className="card p-5">
          <SectionHeader title="Top Performers" sub="Ranked by completed tasks" to="/management/employees" toLabel="All Employees" />
          {topEmps.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-400">
              <UserGroupIcon className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm">No task data yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {topEmps.map((emp, i) => (
                <div key={emp.userId || i} className="flex items-center gap-3">
                  <span className="w-5 text-xs font-bold text-gray-400 text-center">#{i + 1}</span>
                  <div className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center flex-shrink-0">
                    <span className="text-brand-700 dark:text-brand-400 text-xs font-bold">
                      {emp.firstName?.[0]}{emp.lastName?.[0]}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{emp.firstName} {emp.lastName}</span>
                      <span className="text-xs text-gray-500 flex-shrink-0 ml-2">{emp.completed}/{emp.total}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${emp.completionRate || 0}%`, backgroundColor: DEPT_COLORS[i % DEPT_COLORS.length] }}
                      />
                    </div>
                  </div>
                  <span className="text-sm font-bold text-gray-700 dark:text-gray-300 w-10 text-right flex-shrink-0">
                    {pct(emp.completionRate)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Row 6: Recent Tasks + Alerts ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Recent Tasks */}
        <div className="card p-5">
          <SectionHeader title="Recent Tasks" sub="Latest tasks across all departments" to="/tasks/team" toLabel="Team Tasks" />
          {recentTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-400">
              <ClipboardDocumentListIcon className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm">No tasks created yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentTasks.map((task) => (
                <div key={task._id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className={`badge ${STATUS_COLORS[task.status] || 'badge-gray'}`}>{task.status}</span>
                      <span className={`badge ${PRIORITY_COLORS[task.priority] || 'badge-gray'}`}>{task.priority}</span>
                    </div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{task.title}</p>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                      <span>{task.department}</span>
                      {task.assignedTo && <span>→ {task.assignedTo.firstName} {task.assignedTo.lastName}</span>}
                      {task.isOverdue && <span className="text-red-500 font-medium">Overdue</span>}
                    </div>
                  </div>
                  <span className="text-xs text-gray-400 flex-shrink-0">{task.createdAt ? formatDistanceToNow(new Date(task.createdAt), { addSuffix: true }) : ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Critical Alerts */}
        <div className="card p-5">
          <SectionHeader title="Critical Alerts" sub="High priority unread notifications" to="/settings" toLabel="All Notifications" />
          {alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-400">
              <BellAlertIcon className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm">No critical alerts</p>
            </div>
          ) : (
            <div className="space-y-2">
              {alerts.map((alert) => (
                <div key={alert._id} className="flex items-start gap-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30">
                  <BellAlertIcon className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{alert.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{alert.message}</p>
                    <p className="text-xs text-gray-400 mt-1">{alert.createdAt ? formatDistanceToNow(new Date(alert.createdAt), { addSuffix: true }) : ''}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Row 7: Quick Navigation ───────────────────────────────────────────── */}
      <div>
        <h3 className="font-bold text-gray-900 dark:text-white mb-4">Quick Navigation</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { label: 'Task Board',   sub: 'Kanban view',        icon: ClipboardDocumentListIcon, to: '/tasks/kanban',          color: 'blue'   },
            { label: 'CRM Pipeline', sub: 'Leads & follow-ups', icon: UsersIcon,                 to: '/crm/pipeline',          color: 'cyan'   },
            { label: 'Inventory',    sub: 'Products & stock',   icon: CubeIcon,                  to: '/inventory/products',    color: 'yellow' },
            { label: 'Production',   sub: 'Orders & batches',   icon: BoltIcon,                  to: '/production/orders',     color: 'orange' },
            { label: 'Finance',      sub: 'Ledger & invoices',  icon: BanknotesIcon,             to: '/finance/ledger',        color: 'green'  },
            { label: 'Team',         sub: 'Employees',          icon: UserGroupIcon,             to: '/management/team',       color: 'indigo' },
            { label: 'Approvals',    sub: 'Review queue',       icon: CheckCircleIcon,           to: '/tasks/approvals',       color: 'purple' },
            { label: 'Analytics',    sub: 'Task reports',       icon: ChartBarIcon,              to: '/tasks/analytics',       color: 'rose'   },
            { label: 'Departments',  sub: 'Dept overview',      icon: BuildingOfficeIcon,        to: '/management/departments', color: 'teal'  },
            { label: 'Settings',     sub: 'Org settings',       icon: DocumentTextIcon,          to: '/settings',              color: 'gray'   },
          ].map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="card p-4 flex flex-col gap-2 hover:shadow-md transition-all hover:-translate-y-0.5 group"
            >
              <div className={`w-9 h-9 rounded-xl bg-${item.color}-100 dark:bg-${item.color}-900/30 flex items-center justify-center group-hover:scale-110 transition-transform`}>
                <item.icon className={`w-5 h-5 text-${item.color}-600 dark:text-${item.color}-400`} />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{item.label}</p>
                <p className="text-xs text-gray-400">{item.sub}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

    </div>
  );
}
