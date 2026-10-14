import React, { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { Button, DatePicker, Input, Modal, Select } from 'antd';
import dayjs from 'dayjs';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/useAuthStore';

const DEPARTMENTS = ['Marketing', 'Marketplace', 'Sales', 'Production', 'R&D', 'Operations', 'Accounts & Finance', 'HR'];
const PRIORITIES = ['low', 'medium', 'high', 'critical', 'urgent'];
const PLATFORMS = ['Amazon', 'Flipkart', 'Meesho', 'Myntra', 'JioMart', 'Snapdeal'];
const TASK_TYPES = ['Instagram Reel', 'YouTube Video', 'Product Shoot', 'Ad Creative', 'Influencer Campaign', 'Listing Creation', 'SEO Optimization', 'Price Update', 'Campaign Setup', 'Quality Check', 'Production Run', 'Follow-up', 'General'];

const ROLE_LEVEL = { super_admin: 7, chairman: 6, founder: 5, admin: 4, manager: 3, team_lead: 2, member: 1 };

export default function TaskForm({ onClose, onSuccess, initialData }) {
  const { register, handleSubmit, watch, control, formState: { errors } } = useForm({
    defaultValues: initialData ? { ...initialData, dueDate: initialData.dueDate ? dayjs(initialData.dueDate) : null } : {},
  });
  const [loading, setLoading] = useState(false);
  const { user: currentUser } = useAuthStore();

  const dept = watch('department');

  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users?limit=100').then((r) => r.data),
  });

  const allUsers = usersData?.data || [];
  const isManagerOnly = (ROLE_LEVEL[currentUser?.role] || 0) === ROLE_LEVEL['manager'];
  const users = isManagerOnly
    ? allUsers.filter((u) => u.department === currentUser?.department)
    : allUsers;

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      const payload = { ...data, dueDate: data.dueDate ? dayjs(data.dueDate).toISOString() : undefined };
      if (initialData?._id) {
        await api.put(`/tasks/${initialData._id}`, payload);
        toast.success('Task updated');
      } else {
        await api.post('/tasks', payload);
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
    <Modal
      open
      onCancel={onClose}
      title={initialData ? 'Edit Task' : 'Create New Task'}
      width={680}
      footer={null}
      destroyOnHidden
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" style={{ marginTop: 8 }}>
        <div>
          <label className="label">Task Title *</label>
          <Input {...register('title', { required: 'Title is required' })} placeholder="Describe the task clearly..." size="large" status={errors.title ? 'error' : ''} />
          {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title.message}</p>}
        </div>

        <div>
          <label className="label">Description</label>
          <Input.TextArea {...register('description')} rows={3} placeholder="Detailed instructions..." />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Department *</label>
            <Controller
              name="department"
              control={control}
              rules={{ required: 'Required' }}
              render={({ field }) => (
                <Select
                  {...field}
                  placeholder="Select Department"
                  style={{ width: '100%' }}
                  size="large"
                  status={errors.department ? 'error' : ''}
                  options={DEPARTMENTS.map((d) => ({ label: d, value: d }))}
                />
              )}
            />
            {errors.department && <p className="text-red-500 text-xs mt-1">{errors.department.message}</p>}
          </div>
          <div>
            <label className="label">Task Type</label>
            <Controller
              name="taskType"
              control={control}
              render={({ field }) => (
                <Select
                  {...field}
                  allowClear
                  placeholder="Select Type"
                  style={{ width: '100%' }}
                  size="large"
                  options={TASK_TYPES.map((t) => ({ label: t, value: t }))}
                />
              )}
            />
          </div>
        </div>

        {['Marketplace'].includes(dept) && (
          <div>
            <label className="label">Platform</label>
            <Controller
              name="platform"
              control={control}
              render={({ field }) => (
                <Select
                  {...field}
                  allowClear
                  placeholder="Select Platform"
                  style={{ width: '100%' }}
                  size="large"
                  options={PLATFORMS.map((p) => ({ label: p, value: p }))}
                />
              )}
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Assign To *</label>
            <Controller
              name="assignedTo"
              control={control}
              rules={{ required: 'Required' }}
              render={({ field }) => (
                <Select
                  {...field}
                  showSearch
                  placeholder="Select Employee"
                  style={{ width: '100%' }}
                  size="large"
                  status={errors.assignedTo ? 'error' : ''}
                  optionFilterProp="label"
                  options={users.map((u) => ({ label: `${u.firstName} ${u.lastName} (${u.department})`, value: u._id }))}
                />
              )}
            />
            {errors.assignedTo && <p className="text-red-500 text-xs mt-1">{errors.assignedTo.message}</p>}
          </div>
          <div>
            <label className="label">Priority *</label>
            <Controller
              name="priority"
              control={control}
              rules={{ required: 'Required' }}
              defaultValue="medium"
              render={({ field }) => (
                <Select
                  {...field}
                  style={{ width: '100%' }}
                  size="large"
                  options={PRIORITIES.map((p) => ({ label: p.charAt(0).toUpperCase() + p.slice(1), value: p }))}
                />
              )}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Due Date *</label>
            <Controller
              name="dueDate"
              control={control}
              rules={{ required: 'Required' }}
              render={({ field }) => (
                <DatePicker
                  {...field}
                  showTime
                  format="DD MMM YYYY, hh:mm A"
                  style={{ width: '100%' }}
                  size="large"
                  status={errors.dueDate ? 'error' : ''}
                />
              )}
            />
            {errors.dueDate && <p className="text-red-500 text-xs mt-1">{errors.dueDate.message}</p>}
          </div>
          <div>
            <label className="label">Estimated Hours</label>
            <Input type="number" min="0" step="0.5" {...register('estimatedHours')} placeholder="e.g. 4" size="large" />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <Button onClick={onClose} block size="large">Cancel</Button>
          <Button type="primary" htmlType="submit" loading={loading} block size="large">
            {initialData ? 'Update Task' : 'Create Task'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
