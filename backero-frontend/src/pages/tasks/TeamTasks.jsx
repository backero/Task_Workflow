import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PlusIcon, BoltIcon } from '@heroicons/react/24/outline';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import { useAuthStore } from '../../store/useAuthStore';
import { format, isPast } from 'date-fns';
import { clsx } from 'clsx';
import { useQueryClient } from '@tanstack/react-query';
import TaskForm from './TaskForm';

const STATUS_COLORS = {
  'Pending': 'badge-gray', 'Assigned': 'badge-blue', 'In Progress': 'badge-yellow',
  'Approval Pending': 'badge-purple', 'Changes Requested': 'badge-red', 'Completed': 'badge-green',
};
const PRIORITY_COLORS = { critical: 'text-red-600', urgent: 'text-red-500', high: 'text-orange-600', medium: 'text-yellow-600', low: 'text-gray-400' };

export default function TeamTasks() {
  const [showForm, setShowForm] = useState(false);
  const [dept, setDept] = useState('');
  const [status, setStatus] = useState('');
  const { isManagerOrAbove } = useAuthStore();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['tasks', 'team', dept, status],
    queryFn: () => api.get('/tasks', { params: { limit: 50, department: dept || undefined, status: status || undefined } }).then((r) => r.data),
  });

  const tasks = data?.data || [];
  const DEPTS = ['', 'Marketing', 'Marketplace', 'Sales', 'Production', 'R&D', 'Operations', 'Accounts & Finance'];
  const STATUSES = ['', 'Pending', 'Assigned', 'In Progress', 'Approval Pending', 'Changes Requested', 'Completed', 'Cancelled'];

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Team Tasks</h1>
          <p className="text-gray-500 text-sm">{tasks.length} tasks</p>
        </div>
        {isManagerOrAbove() && (
          <button onClick={() => setShowForm(true)} className="btn-primary"><PlusIcon className="w-4 h-4" /> New Task</button>
        )}
      </div>
      <div className="flex gap-3">
        <select value={dept} onChange={(e) => setDept(e.target.value)} className="input w-auto">
          {DEPTS.map((d) => <option key={d} value={d}>{d || 'All Departments'}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="input w-auto">
          {STATUSES.map((s) => <option key={s} value={s}>{s || 'All Statuses'}</option>)}
        </select>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-[#0f1a2e]">
              <tr>
                <th className="text-left py-3 px-4 text-gray-500 font-medium">Task</th>
                <th className="text-left py-3 px-4 text-gray-500 font-medium">Assigned To</th>
                <th className="text-center py-3 px-4 text-gray-500 font-medium">Status</th>
                <th className="text-center py-3 px-4 text-gray-500 font-medium">Priority</th>
                <th className="text-center py-3 px-4 text-gray-500 font-medium">Progress</th>
                <th className="text-right py-3 px-4 text-gray-500 font-medium">Due Date</th>
                <th className="py-3 px-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-[#1b2e4a]">
              {tasks.map((task) => {
                const due = task.dueDate ? new Date(task.dueDate) : null;
                const isOverdue = due && isPast(due) && task.status !== 'Completed';
                return (
                  <tr key={task._id} className="hover:bg-gray-50 dark:hover:bg-[#17263d]/50">
                    <td className="py-3 px-4">
                      <p className="font-medium text-gray-900 dark:text-white">{task.title}</p>
                      <p className="text-xs text-gray-400">{task.department} {task.platform ? `• ${task.platform}` : ''}</p>
                    </td>
                    <td className="py-3 px-4">
                      {task.assignedTo ? (
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-brand-100 flex items-center justify-center">
                            <span className="text-brand-700 text-xs">{task.assignedTo.firstName?.[0]}</span>
                          </div>
                          <span className="text-gray-700 dark:text-gray-300">{task.assignedTo.firstName} {task.assignedTo.lastName}</span>
                        </div>
                      ) : <span className="text-gray-400">Unassigned</span>}
                    </td>
                    <td className="py-3 px-4 text-center"><span className={`badge ${STATUS_COLORS[task.status] || 'badge-gray'}`}>{task.status}</span></td>
                    <td className={`py-3 px-4 text-center font-medium text-xs ${PRIORITY_COLORS[task.priority]}`}>{task.priority?.toUpperCase()}</td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center gap-1 justify-center">
                        <div className="w-16 h-1.5 bg-gray-100 dark:bg-[#132035] rounded-full overflow-hidden">
                          <div className="h-full bg-brand-500 rounded-full" style={{ width: `${task.progress || 0}%` }} />
                        </div>
                        <span className="text-xs text-gray-400">{task.progress || 0}%</span>
                      </div>
                    </td>
                    <td className={clsx('py-3 px-4 text-right text-xs', isOverdue ? 'text-red-600 font-medium' : 'text-gray-500')}>
                      {due ? format(due, 'dd MMM yyyy') : '—'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => navigate(`/workflow/${task._id}`)}
                        title="Open Workflow"
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors"
                      >
                        <BoltIcon className="w-3.5 h-3.5" />
                        Workflow
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {tasks.length === 0 && <div className="text-center py-12 text-gray-400">No tasks found</div>}
        </div>
      )}
      {showForm && <TaskForm onClose={() => setShowForm(false)} onSuccess={() => { setShowForm(false); qc.invalidateQueries({ queryKey: ['tasks'] }); }} />}
    </div>
  );
}
