import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ClipboardDocumentListIcon, ExclamationTriangleIcon, CheckCircleIcon,
  ClockIcon, ArrowRightIcon, ChevronRightIcon,
} from '@heroicons/react/24/outline';
import api from '../../api/axios';
import { useAuthStore } from '../../store/useAuthStore';
import { format, isToday, isTomorrow, isPast, formatDistanceToNow } from 'date-fns';
import { clsx } from 'clsx';

const PRIORITY_COLORS = { critical: 'badge-red', urgent: 'badge-red', high: 'badge-orange', medium: 'badge-yellow', low: 'badge-gray' };
const STATUS_COLORS   = { 'Pending': 'badge-gray', 'Assigned': 'badge-blue', 'In Progress': 'badge-yellow', 'Approval Pending': 'badge-purple', 'Changes Requested': 'badge-red', 'Completed': 'badge-green' };

function getDueLabel(dueDate) {
  const d = new Date(dueDate);
  if (isPast(d) && !isToday(d)) return { label: 'OVERDUE', cls: 'text-red-600 font-bold', bg: 'bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30' };
  if (isToday(d))    return { label: 'Due Today',    cls: 'text-orange-600 font-semibold', bg: 'bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-900/30' };
  if (isTomorrow(d)) return { label: 'Due Tomorrow', cls: 'text-yellow-600 font-medium', bg: '' };
  return { label: format(d, 'dd MMM yyyy'), cls: 'text-gray-500', bg: '' };
}

function StatCard({ icon: Icon, label, value, color = 'blue', to, sub }) {
  const inner = (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className={clsx('card p-5', to && 'hover:shadow-md cursor-pointer transition-shadow')}
    >
      <div className={`w-10 h-10 rounded-xl bg-${color}-100 dark:bg-${color}-900/30 flex items-center justify-center mb-3`}>
        <Icon className={`w-5 h-5 text-${color}-600 dark:text-${color}-400`} />
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </motion.div>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}

export default function EmployeeDashboard() {
  const { user } = useAuthStore();

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'employee'],
    queryFn: () => api.get('/dashboard/employee').then((r) => r.data.dashboard),
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const d        = data || {};
  const myTasks  = d.myTasks || [];
  const myLeads  = d.myLeads || [];

  // Separate overdue tasks from active tasks
  const overdueTasks  = myTasks.filter((t) => t.isOverdue);
  const activeTasks   = myTasks.filter((t) => !t.isOverdue);
  // Sort: today first, then by due date
  const sortedTasks   = [
    ...myTasks.filter((t) => t.dueDate && isToday(new Date(t.dueDate))),
    ...overdueTasks.filter((t) => !t.dueDate || !isToday(new Date(t.dueDate))),
    ...activeTasks.filter((t) => !t.dueDate || !isToday(new Date(t.dueDate))),
  ];
  // Remove duplicates (tasks that are both overdue and today already handled)
  const uniqueTasks = sortedTasks.filter((t, i, arr) => arr.findIndex((x) => x._id === t._id) === i);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">My Workspace</h1>
          <p className="text-gray-500 text-sm">
            {greeting}, {user?.firstName}!
            {user?.department && ` · ${user.department}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/tasks/my" className="btn-primary">My Tasks</Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={ClipboardDocumentListIcon} color="blue"
          label="Active Tasks" value={myTasks.length}
          sub="Not yet completed"
          to="/tasks/my"
        />
        <StatCard
          icon={ExclamationTriangleIcon} color="red"
          label="Overdue" value={d.overdueTasks || 0}
          sub="Need immediate attention"
          to="/tasks/my"
        />
        <StatCard
          icon={CheckCircleIcon} color="green"
          label="Done This Month" value={d.completedThisMonth || 0}
          sub="Tasks completed"
        />
        <StatCard
          icon={ClockIcon} color="purple"
          label="Pending Approval" value={d.pendingApprovals || 0}
          sub="Awaiting manager review"
          to="/tasks/my"
        />
      </div>

      {/* Overdue Banner */}
      {overdueTasks.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
          className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 rounded-xl p-4 flex items-center gap-3"
        >
          <ExclamationTriangleIcon className="w-5 h-5 text-red-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-800 dark:text-red-400">
              You have {overdueTasks.length} overdue task{overdueTasks.length > 1 ? 's' : ''}
            </p>
            <p className="text-xs text-red-600 dark:text-red-500 mt-0.5">
              {overdueTasks.map((t) => t.title).join(', ')}
            </p>
          </div>
          <Link to="/tasks/my" className="btn-primary text-xs px-3 py-1.5 flex-shrink-0 bg-red-600 hover:bg-red-700">
            View Now
          </Link>
        </motion.div>
      )}

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* My Tasks List */}
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white">My Active Tasks</h3>
              <p className="text-xs text-gray-500 mt-0.5">{myTasks.length} task{myTasks.length !== 1 ? 's' : ''} in progress</p>
            </div>
            <Link to="/tasks/my" className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium">
              View all <ArrowRightIcon className="w-3 h-3" />
            </Link>
          </div>

          {uniqueTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-gray-400">
              <CheckCircleIcon className="w-12 h-12 mb-2 opacity-30" />
              <p className="text-sm font-medium">No active tasks</p>
              <p className="text-xs mt-1">You're all caught up!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {uniqueTasks.map((task) => {
                const due = task.dueDate ? getDueLabel(task.dueDate) : null;
                const isChangesRequested = task.status === 'Changes Requested';
                return (
                  <Link
                    key={task._id}
                    to="/tasks/my"
                    className={clsx(
                      'flex items-start gap-3 p-3 rounded-lg transition-colors group block',
                      due?.bg || 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`badge ${STATUS_COLORS[task.status] || 'badge-gray'}`}>{task.status}</span>
                        <span className={`badge ${PRIORITY_COLORS[task.priority] || 'badge-gray'}`}>{task.priority}</span>
                        {isChangesRequested && (
                          <span className="text-xs text-red-600 font-semibold">Action needed</span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{task.title}</p>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                        <span>{task.department}</span>
                        {task.assignedBy && (
                          <span>from {task.assignedBy.firstName} {task.assignedBy.lastName}</span>
                        )}
                      </div>
                      {task.progress > 0 && (
                        <div className="mt-2 flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div className="h-full bg-brand-500 rounded-full" style={{ width: `${task.progress}%` }} />
                          </div>
                          <span className="text-xs text-gray-400">{task.progress}%</span>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      {due && <span className={`text-xs ${due.cls}`}>{due.label}</span>}
                      <ChevronRightIcon className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-6">

          {/* Quick Actions */}
          <div className="card p-5">
            <h3 className="font-bold text-gray-900 dark:text-white mb-3">Quick Actions</h3>
            <div className="space-y-2">
              {[
                { label: 'View My Tasks', sub: 'All tasks assigned to me', to: '/tasks/my', color: 'blue' },
                { label: 'Kanban Board', sub: 'Visual task board', to: '/tasks/kanban', color: 'purple' },
                { label: 'CRM Follow-ups', sub: 'My leads & clients', to: '/crm/pipeline', color: 'green' },
                { label: 'Calendar', sub: 'Due dates & follow-ups', to: '/tasks/calendar', color: 'orange' },
              ].map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group"
                >
                  <div className={`w-8 h-8 rounded-lg bg-${item.color}-100 dark:bg-${item.color}-900/30 flex items-center justify-center flex-shrink-0`}>
                    <div className={`w-2 h-2 rounded-full bg-${item.color}-500`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{item.label}</p>
                    <p className="text-xs text-gray-400">{item.sub}</p>
                  </div>
                  <ChevronRightIcon className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              ))}
            </div>
          </div>

          {/* Upcoming CRM Follow-ups */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-900 dark:text-white">My Follow-ups</h3>
              <Link to="/crm/calendar" className="text-xs text-brand-600 hover:text-brand-700 font-medium">Calendar</Link>
            </div>
            {myLeads.length === 0 ? (
              <div className="text-center py-6 text-gray-400">
                <p className="text-sm">No follow-ups scheduled</p>
              </div>
            ) : (
              <div className="space-y-2">
                {myLeads.map((lead) => (
                  <Link key={lead._id} to={`/crm/leads/${lead._id}`} className="block p-3 rounded-lg bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                    <p className="font-medium text-sm text-gray-900 dark:text-white">{lead.name}</p>
                    <p className="text-xs text-gray-500">{lead.phone}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="badge badge-blue text-xs">{lead.status}</span>
                      {lead.nextFollowUpAt && (
                        <span className="text-xs text-orange-600">
                          {formatDistanceToNow(new Date(lead.nextFollowUpAt), { addSuffix: true })}
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
