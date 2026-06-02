import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery, useMutation } from '@tanstack/react-query';
import { XMarkIcon } from '@heroicons/react/24/outline';
import api from '../../api/axios';
import toast from 'react-hot-toast';

const DEPARTMENTS = ['Marketing', 'Marketplace', 'Sales', 'Production', 'R&D', 'Operations', 'Accounts & Finance', 'HR'];
const PRIORITIES = ['low', 'medium', 'high', 'critical', 'urgent'];
const PLATFORMS = ['Amazon', 'Flipkart', 'Meesho', 'Myntra', 'JioMart', 'Snapdeal'];
const TASK_TYPES = ['Instagram Reel', 'YouTube Video', 'Product Shoot', 'Ad Creative', 'Influencer Campaign', 'Listing Creation', 'SEO Optimization', 'Price Update', 'Campaign Setup', 'Quality Check', 'Production Run', 'Follow-up', 'General'];

export default function TaskForm({ onClose, onSuccess, initialData }) {
  const { register, handleSubmit, watch, formState: { errors } } = useForm({ defaultValues: initialData });
  const [loading, setLoading] = useState(false);

  const dept = watch('department');

  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users?limit=100').then((r) => r.data),
  });

  const users = usersData?.data || [];

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      if (initialData?._id) {
        await api.put(`/tasks/${initialData._id}`, data);
        toast.success('Task updated');
      } else {
        await api.post('/tasks', data);
        toast.success('Task created');
      }
      onSuccess?.();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save task');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative card w-full max-w-2xl shadow-modal max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-[#1b2e4a]">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">{initialData ? 'Edit Task' : 'Create New Task'}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-[#17263d]">
            <XMarkIcon className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div>
            <label className="label">Task Title *</label>
            <input {...register('title', { required: 'Title is required' })} className="input" placeholder="Describe the task clearly..." />
            {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title.message}</p>}
          </div>

          <div>
            <label className="label">Description</label>
            <textarea {...register('description')} rows={3} className="input resize-none" placeholder="Detailed instructions..." />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Department *</label>
              <select {...register('department', { required: 'Required' })} className="input">
                <option value="">Select Department</option>
                {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              {errors.department && <p className="text-red-500 text-xs mt-1">{errors.department.message}</p>}
            </div>
            <div>
              <label className="label">Task Type</label>
              <select {...register('taskType')} className="input">
                <option value="">Select Type</option>
                {TASK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {['Marketplace'].includes(dept) && (
            <div>
              <label className="label">Platform</label>
              <select {...register('platform')} className="input">
                <option value="">Select Platform</option>
                {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Assign To *</label>
              <select {...register('assignedTo', { required: 'Required' })} className="input">
                <option value="">Select Employee</option>
                {users.map((u) => <option key={u._id} value={u._id}>{u.firstName} {u.lastName} ({u.department})</option>)}
              </select>
              {errors.assignedTo && <p className="text-red-500 text-xs mt-1">{errors.assignedTo.message}</p>}
            </div>
            <div>
              <label className="label">Priority *</label>
              <select {...register('priority', { required: 'Required' })} className="input">
                {PRIORITIES.map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Due Date *</label>
              <input type="datetime-local" {...register('dueDate', { required: 'Required' })} className="input" />
              {errors.dueDate && <p className="text-red-500 text-xs mt-1">{errors.dueDate.message}</p>}
            </div>
            <div>
              <label className="label">Estimated Hours</label>
              <input type="number" min="0" step="0.5" {...register('estimatedHours')} className="input" placeholder="e.g. 4" />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1 justify-center">
              {loading ? 'Saving...' : (initialData ? 'Update Task' : 'Create Task')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
