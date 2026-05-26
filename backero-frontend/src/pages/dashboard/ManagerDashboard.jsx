import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import {
  ClipboardDocumentListIcon, ExclamationTriangleIcon, ClockIcon, CheckCircleIcon,
  UserGroupIcon, CubeIcon, ArrowRightIcon, BellAlertIcon, BoltIcon, ViewColumnsIcon,
  QuestionMarkCircleIcon,
} from '@heroicons/react/24/outline';
import api from '../../api/axios';
import { useAuthStore } from '../../store/useAuthStore';
import { format, isToday, isTomorrow, isPast, formatDistanceToNow } from 'date-fns';
import { clsx } from 'clsx';

const PRIORITY_COLORS  = { critical: 'badge-red', urgent: 'badge-red', high: 'badge-orange', medium: 'badge-yellow', low: 'badge-gray' };
const STATUS_COLORS    = { 'Completed': 'badge-green', 'In Progress': 'badge-yellow', 'Assigned': 'badge-blue', 'Approval Pending': 'badge-purple', 'Changes Requested': 'badge-red', 'Pending': 'badge-gray' };
const STATUS_BAR_COLOR = { 'Completed': '#22c55e', 'In Progress': '#f97316', 'Assigned': '#3b82f6', 'Approval Pending': '#9333ea', 'Changes Requested': '#ef4444', 'Pending': '#94a3b8' };
const DEPT_COLORS      = ['#3b82f6', '#22c55e', '#f97316', '#9333ea', '#06b6d4', '#ec4899'];

function getDueLabel(dueDate) {
  const d = new Date(dueDate);
  if (isPast(d) && !isToday(d)) return { label: 'Overdue', cls: 'text-red-600 font-semibold' };
  if (isToday(d))   return { label: 'Due Today',    cls: 'text-orange-600 font-semibold' };
  if (isTomorrow(d)) return { label: 'Due Tomorrow', cls: 'text-yellow-600 font-medium' };
  return { label: format(d, 'dd MMM'), cls: 'text-gray-500' };
}

function KPICard({ icon: Icon, label, value, sub, color = 'blue', to, alert }) {
  const card = (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className={clsx('card p-5 flex flex-col gap-3', to && 'hover:shadow-md cursor-pointer transition-shadow')}
    >
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-xl bg-${color}-100 dark:bg-${color}-900/30 flex items-center justify-center`}>
          <Icon className={`w-5 h-5 text-${color}-600 dark:text-${color}-400`} />
        </div>
        {alert > 0 && (
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">{alert}</span>
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

function SectionHead({ title, sub, to, toLabel = 'View all' }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <h3 className="font-bold text-gray-900 dark:text-white">{title}</h3>
        {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
      </div>
      {to && (
        <Link to={to} className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium">
          {toLabel} <ArrowRightIcon className="w-3 h-3" />
        </Link>
      )}
    </div>
  );
}

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
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const d            = data || {};
  const approvals    = d.pendingApprovals || [];
  const teamTasks    = d.teamTasks || [];
  const dueSoon      = d.dueSoonTasks || [];
  const teamPerf     = d.teamPerformance || [];
  const lowStock     = d.lowStockItems || [];
  const techQueries  = d.technicalQueries || { pendingCount: 0, recent: [] };

  const statusChartData = (d.taskStats || []).map((s) => ({
    name: s._id,
    count: s.count,
    fill: STATUS_BAR_COLOR[s._id] || '#94a3b8',
  }));

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Team Dashboard</h1>
          <p className="text-gray-500 text-sm">
            {greeting}, {user?.firstName}. {user?.department ? `${user.department} Department` : 'All Departments'} Overview
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/tasks/approvals" className="btn-secondary relative">
            Approvals
            {approvals.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                {approvals.length}
              </span>
            )}
          </Link>
          <Link to="/tasks/team" className="btn-primary">Team Tasks</Link>
        </div>
      </div>

      {/* Row 1: KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          icon={ClipboardDocumentListIcon} color="blue"
          label="Total Tasks" value={d.totalTasks || 0}
          sub={`${d.completedThisMonth || 0} completed this month`}
          to="/tasks/team"
        />
        <KPICard
          icon={ExclamationTriangleIcon} color="red"
          label="Overdue Tasks" value={d.overdueCount || 0}
          sub="Need immediate action"
          alert={d.overdueCount || 0}
          to="/tasks/team"
        />
        <KPICard
          icon={ClockIcon} color="purple"
          label="Pending Approvals" value={approvals.length}
          sub="Waiting for your review"
          alert={approvals.length}
          to="/tasks/approvals"
        />
        <KPICard
          icon={UserGroupIcon} color="green"
          label="Team Members" value={d.teamSize || 0}
          sub={user?.department ? `in ${user.department}` : 'across all depts'}
          to="/management/team"
        />
        <KPICard
          icon={QuestionMarkCircleIcon} color="rose"
          label="Pending Queries" value={techQueries.pendingCount}
          sub="Awaiting production reply"
          alert={techQueries.pendingCount}
          to="/crm/queries"
        />
      </div>

      {/* Row 2: Task Status Chart + Due Soon */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Task Status Chart */}
        <div className="card p-5">
          <SectionHead title="Task Status Breakdown" sub={`${d.totalTasks || 0} total tasks`} to="/tasks/analytics" toLabel="Analytics" />
          {statusChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={statusChartData} layout="vertical" margin={{ left: 20, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-gray-100 dark:stroke-gray-800" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={110} />
                <Tooltip formatter={(v) => [v, 'Tasks']} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {statusChartData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400">
              <ClipboardDocumentListIcon className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm">No tasks yet</p>
            </div>
          )}
        </div>

        {/* Due in Next 3 Days */}
        <div className="card p-5">
          <SectionHead
            title="Due in Next 3 Days"
            sub={`${dueSoon.length} task${dueSoon.length !== 1 ? 's' : ''} coming up`}
            to="/tasks/team"
            toLabel="All Tasks"
          />
          {dueSoon.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-400">
              <CheckCircleIcon className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm">No tasks due in the next 3 days</p>
            </div>
          ) : (
            <div className="space-y-2">
              {dueSoon.map((task) => {
                const due = task.dueDate ? getDueLabel(task.dueDate) : null;
                return (
                  <div key={task._id} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                    <div className="flex-1 min-w-0">
                      <button
                        onClick={() => toWorkflow(task)}
                        className="text-sm font-medium text-gray-900 dark:text-white hover:text-brand-600 dark:hover:text-brand-400 truncate text-left w-full transition-colors"
                      >
                        {task.title}
                      </button>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className={`badge ${PRIORITY_COLORS[task.priority] || 'badge-gray'}`}>{task.priority}</span>
                        {task.assignedTo && (
                          <span className="text-xs text-gray-500">{task.assignedTo.firstName} {task.assignedTo.lastName}</span>
                        )}
                        {due && <span className={`text-xs ${due.cls}`}>{due.label}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button onClick={() => toWorkflow(task)} title="Open in Workflow Builder"
                        className="p-1.5 rounded-lg hover:bg-brand-50 text-gray-400 hover:text-brand-600 transition-colors">
                        <BoltIcon className="w-4 h-4" />
                      </button>
                      <Link to="/tasks/kanban" title="Open Kanban Board"
                        className="p-1.5 rounded-lg hover:bg-indigo-50 text-gray-400 hover:text-indigo-600 transition-colors">
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

      {/* Row 3: Pending Approvals + Inventory Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Pending Approvals */}
        <div className="card p-5">
          <SectionHead
            title="Pending Approvals"
            sub={`${approvals.length} task${approvals.length !== 1 ? 's' : ''} waiting for review`}
            to="/tasks/approvals"
            toLabel="Review All"
          />
          {approvals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-400">
              <CheckCircleIcon className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm">No pending approvals — all clear!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {approvals.map((ap) => (
                <div key={ap._id} className="flex items-center gap-3 p-3 rounded-lg bg-orange-50 dark:bg-orange-900/10 border border-orange-100 dark:border-orange-900/30">
                  <div className="flex-1 min-w-0">
                    <button
                      onClick={() => ap.taskId && toWorkflow(ap.taskId)}
                      className="text-sm font-medium text-gray-900 dark:text-white hover:text-brand-600 truncate text-left w-full transition-colors"
                    >
                      {ap.taskId?.title}
                    </button>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className={`badge ${PRIORITY_COLORS[ap.taskId?.priority] || 'badge-gray'}`}>{ap.taskId?.priority}</span>
                      <span className="text-xs text-gray-500">{ap.requestedBy?.firstName} {ap.requestedBy?.lastName}</span>
                      <span className="text-xs text-gray-400">
                        {ap.requestedAt ? formatDistanceToNow(new Date(ap.requestedAt), { addSuffix: true }) : ''}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button onClick={() => ap.taskId && toWorkflow(ap.taskId)} title="Open in Workflow Builder"
                      className="p-1.5 rounded-lg hover:bg-brand-50 text-gray-400 hover:text-brand-600 transition-colors">
                      <BoltIcon className="w-4 h-4" />
                    </button>
                    <Link to="/tasks/kanban" title="Open Kanban Board"
                      className="p-1.5 rounded-lg hover:bg-indigo-50 text-gray-400 hover:text-indigo-600 transition-colors">
                      <ViewColumnsIcon className="w-4 h-4" />
                    </Link>
                    <Link to="/tasks/approvals" className="btn-primary text-xs px-3 py-1.5">Review</Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Inventory Low Stock */}
        <div className="card p-5">
          <SectionHead
            title="Low Stock Alerts"
            sub={lowStock.length > 0 ? `${lowStock.length} product${lowStock.length !== 1 ? 's' : ''} below minimum` : 'All stock levels healthy'}
            to="/inventory/alerts"
            toLabel="View Alerts"
          />
          {lowStock.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-400">
              <CubeIcon className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm">All products are well stocked</p>
            </div>
          ) : (
            <div className="space-y-2">
              {lowStock.map((product) => (
                <div key={product._id} className="flex items-center gap-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30">
                  <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                    <CubeIcon className="w-4 h-4 text-red-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{product.name}</p>
                    <p className="text-xs text-gray-500">{product.sku} · {product.category}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-red-600">{product.currentStock} {product.unit}</p>
                    <p className="text-xs text-gray-400">min: {product.minStockLevel}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Row 4: Team Performance */}
      <div className="card p-5">
        <SectionHead title="Team Performance" sub="Task completion by team member" to="/management/employees" />
        {teamPerf.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-gray-400">
            <UserGroupIcon className="w-10 h-10 mb-2 opacity-30" />
            <p className="text-sm">No task data for team yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-2 px-2 text-gray-500 font-medium">Employee</th>
                  <th className="text-center py-2 px-2 text-gray-500 font-medium">Total</th>
                  <th className="text-center py-2 px-2 text-gray-500 font-medium">In Progress</th>
                  <th className="text-center py-2 px-2 text-gray-500 font-medium">Completed</th>
                  <th className="text-center py-2 px-2 text-gray-500 font-medium">Overdue</th>
                  <th className="text-left py-2 px-2 text-gray-500 font-medium w-36">Completion Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {teamPerf.map((emp, i) => (
                  <tr key={emp._id || i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                          style={{ backgroundColor: DEPT_COLORS[i % DEPT_COLORS.length] }}
                        >
                          {emp.user?.firstName?.[0]}{emp.user?.lastName?.[0]}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{emp.user?.firstName} {emp.user?.lastName}</p>
                          <p className="text-xs text-gray-400">{emp.user?.department || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="text-center py-3 px-2 text-gray-700 dark:text-gray-300">{emp.total}</td>
                    <td className="text-center py-3 px-2 text-orange-600 font-medium">{emp.inProgress || 0}</td>
                    <td className="text-center py-3 px-2 text-green-600 font-medium">{emp.completed}</td>
                    <td className="text-center py-3 px-2">
                      {emp.overdue > 0
                        ? <span className="text-red-600 font-semibold">{emp.overdue}</span>
                        : <span className="text-gray-400">0</span>
                      }
                    </td>
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${emp.completionRate || 0}%`,
                              backgroundColor: DEPT_COLORS[i % DEPT_COLORS.length],
                            }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 w-8 flex-shrink-0">{Math.round(emp.completionRate || 0)}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Row 4b: Technical Queries */}
      <div className="card p-5">
        <SectionHead
          title="Technical Queries"
          sub={`${techQueries.pendingCount} pending queries from Sales team`}
          to="/crm/queries"
          toLabel="View All"
        />
        {techQueries.recent.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-gray-400">
            <QuestionMarkCircleIcon className="w-10 h-10 mb-2 opacity-30" />
            <p className="text-sm">No pending technical queries</p>
          </div>
        ) : (
          <div className="space-y-2">
            {techQueries.recent.map((q) => (
              <div key={q._id} className="flex items-start gap-3 p-3 rounded-lg bg-rose-50 dark:bg-rose-900/10 border border-rose-100 dark:border-rose-900/30">
                <QuestionMarkCircleIcon className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      q.urgency === 'high' ? 'bg-red-100 text-red-700' : q.urgency === 'medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'
                    }`}>{q.urgency}</span>
                    {q.leadName && <span className="text-xs text-gray-500">Lead: {q.leadName}</span>}
                  </div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{q.title}</p>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400 flex-wrap">
                    <span>By: {q.raisedBy?.firstName} {q.raisedBy?.lastName}</span>
                    {q.assignedTo ? (
                      <span>Assigned: {q.assignedTo.firstName} {q.assignedTo.lastName}</span>
                    ) : (
                      <span className="text-orange-500">Unassigned</span>
                    )}
                    <span>{q.createdAt ? formatDistanceToNow(new Date(q.createdAt), { addSuffix: true }) : ''}</span>
                  </div>
                </div>
                <Link to="/crm/queries" className="btn-primary text-xs px-3 py-1.5 flex-shrink-0">Reply</Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Row 5: All Active Team Tasks */}
      <div className="card p-5">
        <SectionHead title="Active Team Tasks" sub="Sorted by due date" to="/tasks/team" toLabel="Full Board" />
        {teamTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-gray-400">
            <CheckCircleIcon className="w-10 h-10 mb-2 opacity-30" />
            <p className="text-sm">No active tasks</p>
          </div>
        ) : (
          <div className="space-y-2">
            {teamTasks.map((task) => {
              const due = task.dueDate ? getDueLabel(task.dueDate) : null;
              return (
                <div
                  key={task._id}
                  className={clsx(
                    'flex items-center gap-3 p-3 rounded-lg transition-colors',
                    task.isOverdue
                      ? 'bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className={`badge ${STATUS_COLORS[task.status] || 'badge-gray'}`}>{task.status}</span>
                      <span className={`badge ${PRIORITY_COLORS[task.priority] || 'badge-gray'}`}>{task.priority}</span>
                    </div>
                    <button
                      onClick={() => toWorkflow(task)}
                      className="text-sm font-medium text-gray-900 dark:text-white hover:text-brand-600 dark:hover:text-brand-400 text-left transition-colors"
                    >
                      {task.title}
                    </button>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400 flex-wrap">
                      <span>{task.department}</span>
                      {task.assignedTo && (
                        <span>→ {task.assignedTo.firstName} {task.assignedTo.lastName}</span>
                      )}
                      {task.isOverdue && <span className="text-red-500 font-semibold">OVERDUE</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {due && <span className={`text-xs ${due.cls}`}>{due.label}</span>}
                    <button onClick={() => toWorkflow(task)} title="Open in Workflow Builder"
                      className="p-1.5 rounded-lg hover:bg-brand-50 text-gray-400 hover:text-brand-600 transition-colors">
                      <BoltIcon className="w-4 h-4" />
                    </button>
                    <Link to="/tasks/kanban" title="Open Kanban Board"
                      className="p-1.5 rounded-lg hover:bg-indigo-50 text-gray-400 hover:text-indigo-600 transition-colors">
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
