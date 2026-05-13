import React, { useState, useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useWorkflowStore } from '../../store/useWorkflowStore';
import { useAuthStore } from '../../store/useAuthStore';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import clsx from 'clsx';

const PRIORITIES = [
  { value: 'low',      label: 'Low',      color: 'text-gray-500' },
  { value: 'medium',   label: 'Medium',   color: 'text-blue-600' },
  { value: 'high',     label: 'High',     color: 'text-orange-500' },
  { value: 'critical', label: 'Critical', color: 'text-red-600' },
  { value: 'urgent',   label: 'Urgent',   color: 'text-red-700' },
];

const ROLE_LEVEL = { super_admin: 7, chairman: 6, founder: 5, admin: 4, manager: 3, team_lead: 2, member: 1 };

export default function AddSubtaskModal({ parentTaskId, parentTitle, parentDepartment, onClose }) {
  const { addSubtask } = useWorkflowStore();
  const { user } = useAuthStore();
  const isAdmin = (ROLE_LEVEL[user?.role] || 1) >= 4;

  const [form, setForm] = useState({
    title: '',
    description: '',
    priority: 'medium',
    assignedTo: '',
    dueDate: '',
    estimatedHours: '',
  });
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Fetch users filtered by the parent task's department
  useEffect(() => {
    setLoadingUsers(true);
    const dept = parentDepartment || user?.department;
    const params = { limit: 200, isActive: true };
    if (dept && !isAdmin) params.department = dept;
    else if (dept) params.department = dept; // admins also default to parent dept but can see all

    api.get('/users', { params })
      .then(r => setUsers(r.data.data || []))
      .catch(() => setUsers([]))
      .finally(() => setLoadingUsers(false));
  }, [parentDepartment, isAdmin, user?.department]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) { toast.error('Task title is required'); return; }
    setSaving(true);
    try {
      await addSubtask(parentTaskId, {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        priority: form.priority,
        assignedTo: form.assignedTo || undefined,
        dueDate: form.dueDate || undefined,
        estimatedHours: form.estimatedHours ? Number(form.estimatedHours) : undefined,
      });
      toast.success(form.assignedTo ? 'Subtask created & member notified via WhatsApp!' : 'Subtask created!');
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add subtask');
    } finally {
      setSaving(false);
    }
  };

  const dept = parentDepartment || user?.department;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md border border-gray-100 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-indigo-600 to-violet-600">
          <div>
            <h2 className="text-sm font-bold text-white">Add Subtask</h2>
            <p className="text-[11px] text-indigo-200 mt-0.5 truncate max-w-[260px]">
              Under: {parentTitle}
            </p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors flex-shrink-0">
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Task Title <span className="text-red-500">*</span>
            </label>
            <input
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="What needs to be done?"
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder-gray-400"
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Description</label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              rows={2}
              placeholder="Instructions or details (optional)…"
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none placeholder-gray-400"
            />
          </div>

          {/* Priority + Assign To */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Priority</label>
              <select
                value={form.priority}
                onChange={e => set('priority', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                {PRIORITIES.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Assign To
              </label>
              <select
                value={form.assignedTo}
                onChange={e => set('assignedTo', e.target.value)}
                disabled={loadingUsers}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white disabled:opacity-50"
              >
                <option value="">Unassigned</option>
                {users.map(u => (
                  <option key={u._id} value={u._id}>
                    {u.firstName} {u.lastName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Due Date + Hours */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">Due Date</label>
              <input
                type="date"
                value={form.dueDate}
                onChange={e => set('dueDate', e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Info banner */}
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 text-[11px] text-indigo-700">
            {dept
              ? `Showing members from ${dept} department. Assigned member will be notified via WhatsApp.`
              : 'Assigned member will be notified via WhatsApp.'}
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !form.title.trim()}
              className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Creating…
                </>
              ) : 'Add Subtask'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
