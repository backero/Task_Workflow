import React, { useState, useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/axios';
import { useAuthStore } from '../../store/useAuthStore';
import toast from 'react-hot-toast';
import clsx from 'clsx';

const DEPARTMENTS = ['Marketing', 'Marketplace', 'Sales', 'Production', 'R&D', 'Operations', 'Accounts & Finance', 'HR', 'Management'];
const PRIORITIES = [
  { value: 'low',      label: 'Low',      color: 'text-gray-500' },
  { value: 'medium',   label: 'Medium',   color: 'text-blue-600' },
  { value: 'high',     label: 'High',     color: 'text-orange-500' },
  { value: 'critical', label: 'Critical', color: 'text-red-600' },
  { value: 'urgent',   label: 'Urgent',   color: 'text-red-700' },
];

const ROLE_LEVEL = { super_admin: 7, chairman: 6, founder: 5, admin: 4, manager: 3, team_lead: 2, member: 1 };

export default function CreateTaskModal({ onClose, onCreated }) {
  const { user } = useAuthStore();
  const isAdmin = (ROLE_LEVEL[user?.role] || 1) >= 4;
  const isManager = (ROLE_LEVEL[user?.role] || 1) === 3;

  const [form, setForm] = useState({
    title: '',
    description: '',
    department: isAdmin ? '' : (user?.department || ''),
    priority: 'medium',
    dueDate: '',
    estimatedHours: '',
    assignedTo: '',
  });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Fetch users filtered by department
  const deptParam = form.department || undefined;
  const { data: usersData } = useQuery({
    queryKey: ['users-assignable', deptParam],
    queryFn: () => api.get('/users', {
      params: { limit: 200, department: deptParam, isActive: true },
    }).then(r => r.data),
    enabled: true,
  });

  const allUsers = usersData?.data || [];
  // Managers can only see their own dept users
  const assignableUsers = isAdmin
    ? (deptParam ? allUsers : allUsers)
    : allUsers.filter(u => u.department === (user?.department || ''));

  // Reset assignee when department changes
  useEffect(() => { set('assignedTo', ''); }, [form.department]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return toast.error('Task title is required');
    if (!form.department) return toast.error('Department is required');
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        department: form.department,
        priority: form.priority,
        dueDate: form.dueDate || undefined,
        estimatedHours: form.estimatedHours ? Number(form.estimatedHours) : undefined,
        assignedTo: form.assignedTo || undefined,
      };
      const res = await api.post('/tasks', payload);
      toast.success('Task created! WhatsApp notification sent.');
      onCreated?.(res.data.task || res.data.data?.task);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create task');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-[#17263d] rounded-2xl shadow-2xl w-full max-w-lg border border-gray-100 dark:border-[#1b2e4a] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-indigo-600 to-purple-600">
          <h2 className="text-base font-bold text-white">Create New Task</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors">
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Task Title <span className="text-red-500">*</span></label>
            <input
              value={form.title}
              onChange={e => set('title', e.target.value)}
              className="w-full border border-gray-200 dark:border-[#1b2e4a] rounded-xl px-3.5 py-2.5 text-sm text-gray-900 dark:text-white dark:bg-[#0f1a2e] focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder-gray-400"
              placeholder="What needs to be done?"
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Description</label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              rows={3}
              className="w-full border border-gray-200 dark:border-[#1b2e4a] rounded-xl px-3.5 py-2.5 text-sm text-gray-900 dark:text-white dark:bg-[#0f1a2e] focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none placeholder-gray-400"
              placeholder="Detailed instructions (optional)…"
            />
          </div>

          {/* Department + Priority row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Department <span className="text-red-500">*</span></label>
              {isAdmin ? (
                <select
                  value={form.department}
                  onChange={e => set('department', e.target.value)}
                  className="w-full border border-gray-200 dark:border-[#1b2e4a] rounded-xl px-3.5 py-2.5 text-sm text-gray-900 dark:text-white dark:bg-[#0f1a2e] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select dept…</option>
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              ) : (
                <div className="w-full border border-gray-200 dark:border-[#1b2e4a] rounded-xl px-3.5 py-2.5 text-sm font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/30">
                  {user?.department || 'Not set'}
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Priority</label>
              <select
                value={form.priority}
                onChange={e => set('priority', e.target.value)}
                className="w-full border border-gray-200 dark:border-[#1b2e4a] rounded-xl px-3.5 py-2.5 text-sm text-gray-900 dark:text-white dark:bg-[#0f1a2e] focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          </div>

          {/* Assign to */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              Assign To
              {isManager && <span className="ml-1 text-[10px] text-gray-400 font-normal">(your department only)</span>}
            </label>
            <select
              value={form.assignedTo}
              onChange={e => set('assignedTo', e.target.value)}
              className="w-full border border-gray-200 dark:border-[#1b2e4a] rounded-xl px-3.5 py-2.5 text-sm text-gray-900 dark:text-white dark:bg-[#0f1a2e] focus:outline-none focus:ring-2 focus:ring-indigo-500"
              disabled={!form.department && isAdmin}
            >
              <option value="">Unassigned</option>
              {assignableUsers.map(u => (
                <option key={u._id} value={u._id}>
                  {u.firstName} {u.lastName} ({u.role?.replace('_', ' ')}{u.department ? ` · ${u.department}` : ''})
                </option>
              ))}
            </select>
            {isAdmin && !form.department && (
              <p className="text-[10px] text-gray-400 mt-1">Select a department first to filter assignees</p>
            )}
          </div>

          {/* Due date + Hours row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Due Date</label>
              <input
                type="date"
                value={form.dueDate}
                onChange={e => set('dueDate', e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full border border-gray-200 dark:border-[#1b2e4a] rounded-xl px-3.5 py-2.5 text-sm text-gray-900 dark:text-white dark:bg-[#0f1a2e] focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Est. Hours</label>
              <input
                type="number"
                min="0" step="0.5"
                value={form.estimatedHours}
                onChange={e => set('estimatedHours', e.target.value)}
                placeholder="0"
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Role hint */}
          <div className="bg-blue-50 rounded-xl p-3 text-[11px] text-blue-700 border border-blue-100">
            {isAdmin
              ? '👑 As Admin, you can assign tasks to anyone across all departments.'
              : `🎯 As Manager, you can assign tasks to members in your department (${user?.department || 'not set'}).`}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !form.title.trim() || !form.department}
              className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Creating…
                </>
              ) : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
