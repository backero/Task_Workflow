import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, MagnifyingGlassIcon, PencilIcon, XCircleIcon, CheckCircleIcon, XMarkIcon, CubeIcon } from '@heroicons/react/24/outline';
import { useForm } from 'react-hook-form';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import ImportButton from '../../components/common/ImportButton';

const ROLES = [
  { value: 'member', label: 'Member', color: 'badge-gray' },
  { value: 'team_lead', label: 'Team Lead', color: 'badge-blue' },
  { value: 'manager', label: 'Manager', color: 'badge-purple' },
  { value: 'admin', label: 'Admin', color: 'badge-orange' },
];

const DEPARTMENTS = ['Marketing', 'Marketplace', 'Sales', 'Production', 'R&D', 'Operations', 'Accounts & Finance'];

function roleColor(role) {
  return ROLES.find((r) => r.value === role)?.color || 'badge-gray';
}

function Avatar({ user, size = 'md' }) {
  const sz = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm';
  return (
    <div className={`${sz} rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center flex-shrink-0`}>
      <span className="text-brand-700 dark:text-brand-400 font-bold">
        {user.firstName?.[0]}{user.lastName?.[0]}
      </span>
    </div>
  );
}

function UserModal({ open, onClose, editUser }) {
  const qc = useQueryClient();
  const isEdit = !!editUser;
  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    defaultValues: editUser
      ? { firstName: editUser.firstName, lastName: editUser.lastName, phone: editUser.phone, role: editUser.role, department: editUser.department, designation: editUser.designation, googleEmail: editUser.googleEmail || '' }
      : { role: 'member' },
  });

  React.useEffect(() => {
    if (open) {
      reset(editUser
        ? { firstName: editUser.firstName, lastName: editUser.lastName, phone: editUser.phone, role: editUser.role, department: editUser.department || '', designation: editUser.designation || '', googleEmail: editUser.googleEmail || '' }
        : { role: 'member', firstName: '', lastName: '', phone: '', department: '', designation: '', googleEmail: '' }
      );
    }
  }, [open, editUser]);

  const mutation = useMutation({
    mutationFn: (data) => isEdit
      ? api.put(`/users/${editUser._id}`, data)
      : api.post('/users', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team'] });
      toast.success(isEdit ? 'Member updated' : 'Member added successfully');
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-[#070c17] rounded-2xl shadow-modal w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-[#1b2e4a]">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">
            {isEdit ? 'Edit Member' : 'Add New Member'}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-[#17263d]">
            <XMarkIcon className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit(mutation.mutate)} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">First Name *</label>
              <input {...register('firstName', { required: 'Required' })} className="input" placeholder="Ravi" />
              {errors.firstName && <p className="text-red-500 text-xs mt-1">{errors.firstName.message}</p>}
            </div>
            <div>
              <label className="label">Last Name *</label>
              <input {...register('lastName', { required: 'Required' })} className="input" placeholder="Kumar" />
              {errors.lastName && <p className="text-red-500 text-xs mt-1">{errors.lastName.message}</p>}
            </div>
          </div>

          <div>
            <label className="label">Mobile Number *</label>
            <div className="flex gap-2">
              <span className="flex items-center px-3 bg-gray-100 dark:bg-[#0f1a2e] border border-gray-300 dark:border-[#1b2e4a] rounded-lg text-sm font-semibold text-gray-500 shrink-0">
                +91
              </span>
              <input
                {...register('phone', {
                  required: 'Phone is required',
                  pattern: { value: /^\d{10}$/, message: 'Enter 10-digit number' },
                })}
                className="input flex-1"
                placeholder="98765 43210"
                inputMode="numeric"
                maxLength={10}
                disabled={isEdit}
              />
            </div>
            {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone.message}</p>}
            {isEdit && <p className="text-xs text-gray-400 mt-1">Phone cannot be changed after creation</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Role *</label>
              <select {...register('role', { required: true })} className="input">
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Department</label>
              <select {...register('department')} className="input">
                <option value="">— Select —</option>
                {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Designation</label>
            <input {...register('designation')} className="input" placeholder="e.g. Sales Executive" />
          </div>

          <div>
            <label className="label">Google Email <span className="text-gray-400 font-normal">(for Google login)</span></label>
            <input
              {...register('googleEmail', {
                pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Enter a valid email' },
              })}
              className="input"
              placeholder="employee@gmail.com"
              type="email"
            />
            {errors.googleEmail && <p className="text-red-500 text-xs mt-1">{errors.googleEmail.message}</p>}
            <p className="text-xs text-gray-400 mt-1">Employee will use this Gmail to sign in with Google</p>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center py-2.5">Cancel</button>
            <button type="submit" disabled={mutation.isPending} className="btn-primary flex-1 justify-center py-2.5">
              {mutation.isPending ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving...
                </span>
              ) : (isEdit ? 'Save Changes' : 'Add Member')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function TeamManagement() {
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['team'],
    queryFn: () => api.get('/users?limit=100').then((r) => r.data),
  });

  const users = data?.data || [];

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    const matchSearch = !q || `${u.firstName} ${u.lastName} ${u.phone}`.toLowerCase().includes(q);
    const matchRole = !filterRole || u.role === filterRole;
    const matchDept = !filterDept || u.department === filterDept;
    return matchSearch && matchRole && matchDept;
  });

  const stats = {
    total: users.length,
    active: users.filter((u) => u.isActive).length,
    admins: users.filter((u) => ['admin', 'manager', 'team_lead'].includes(u.role)).length,
    members: users.filter((u) => u.role === 'member').length,
  };

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }) =>
      isActive ? api.patch(`/users/${id}/deactivate`) : api.patch(`/users/${id}/activate`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['team'] }); toast.success('Status updated'); },
    onError: () => toast.error('Failed to update status'),
  });

  const toggleInventory = useMutation({
    mutationFn: ({ id, permissions }) => {
      const has = (permissions || []).includes('inventory:write');
      const next = has
        ? (permissions || []).filter(p => p !== 'inventory:write')
        : [...(permissions || []), 'inventory:write'];
      return api.put(`/users/${id}`, { permissions: next });
    },
    onSuccess: (_, { permissions }) => {
      qc.invalidateQueries({ queryKey: ['team'] });
      const had = (permissions || []).includes('inventory:write');
      toast.success(had ? 'Inventory access removed' : 'Inventory access granted');
    },
    onError: () => toast.error('Failed to update permissions'),
  });

  const openAdd = () => { setEditUser(null); setModalOpen(true); };
  const openEdit = (u) => { setEditUser(u); setModalOpen(true); };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Team Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage your employees, managers and admins</p>
        </div>
        <div className="flex items-center gap-2">
          <ImportButton
            templateUrl="/users/import/template"
            importUrl="/users/import"
            onSuccess={() => qc.invalidateQueries({ queryKey: ['team'] })}
            label="Import"
          />
          <button onClick={openAdd} className="btn-primary gap-2">
            <PlusIcon className="w-4 h-4" />
            Add Member
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Members', value: stats.total, color: 'text-gray-900 dark:text-white' },
          { label: 'Active', value: stats.active, color: 'text-green-600' },
          { label: 'Admins & Managers', value: stats.admins, color: 'text-brand-600' },
          { label: 'Members', value: stats.members, color: 'text-gray-600 dark:text-gray-400' },
        ].map((s) => (
          <div key={s.label} className="card p-4">
            <p className="text-xs text-gray-500 mb-1">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9"
            placeholder="Search by name or phone..."
          />
        </div>
        <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)} className="input w-auto">
          <option value="">All Roles</option>
          {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)} className="input w-auto">
          <option value="">All Departments</option>
          {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-gray-400">Loading team...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-gray-400">No members found</p>
            <button onClick={openAdd} className="btn-primary mt-4 gap-2">
              <PlusIcon className="w-4 h-4" /> Add First Member
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-[#0f1a2e] border-b border-gray-200 dark:border-[#1b2e4a]">
                <tr>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">Member</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">Phone</th>
                  <th className="text-left py-3 px-4 text-gray-500 font-medium">Department</th>
                  <th className="text-center py-3 px-4 text-gray-500 font-medium">Role</th>
                  <th className="text-center py-3 px-4 text-gray-500 font-medium">Status</th>
                  <th className="text-right py-3 px-4 text-gray-500 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-[#1b2e4a]">
                {filtered.map((u) => (
                  <tr key={u._id} className="hover:bg-gray-50 dark:hover:bg-[#17263d]/50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <Avatar user={u} size="sm" />
                        <div>
                          <p className={clsx('font-medium', u.isActive ? 'text-gray-900 dark:text-white' : 'text-gray-400 line-through')}>
                            {u.firstName} {u.lastName}
                          </p>
                          {u.designation && <p className="text-xs text-gray-400">{u.designation}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-600 dark:text-gray-400 font-mono text-xs">
                      +91 {u.phone?.slice(-10)}
                    </td>
                    <td className="py-3 px-4 text-gray-600 dark:text-gray-400">{u.department || '—'}</td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5 flex-wrap">
                        <span className={`badge ${roleColor(u.role)} capitalize`}>
                          {u.role?.replace('_', ' ')}
                        </span>
                        {(u.permissions || []).includes('inventory:write') && (
                          <span className="badge badge-teal flex items-center gap-0.5">
                            <CubeIcon className="w-2.5 h-2.5" /> Inventory
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`badge ${u.isActive ? 'badge-green' : 'badge-gray'}`}>
                        {u.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-2">
                        {['member', 'team_lead'].includes(u.role) && (
                          <button
                            onClick={() => toggleInventory.mutate({ id: u._id, permissions: u.permissions })}
                            className={clsx(
                              'p-1.5 rounded transition-colors',
                              (u.permissions || []).includes('inventory:write')
                                ? 'bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 hover:bg-teal-100'
                                : 'text-gray-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 hover:text-teal-600'
                            )}
                            title={(u.permissions || []).includes('inventory:write') ? 'Remove inventory access' : 'Grant inventory access'}
                          >
                            <CubeIcon className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => openEdit(u)}
                          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-[#17263d] text-gray-500 hover:text-brand-600 transition-colors"
                          title="Edit"
                        >
                          <PencilIcon className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => toggleActive.mutate({ id: u._id, isActive: u.isActive })}
                          className={clsx(
                            'p-1.5 rounded transition-colors',
                            u.isActive
                              ? 'hover:bg-red-50 text-gray-400 hover:text-red-500'
                              : 'hover:bg-green-50 text-gray-400 hover:text-green-600'
                          )}
                          title={u.isActive ? 'Deactivate' : 'Activate'}
                        >
                          {u.isActive
                            ? <XCircleIcon className="w-4 h-4" />
                            : <CheckCircleIcon className="w-4 h-4" />
                          }
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <UserModal open={modalOpen} onClose={() => setModalOpen(false)} editUser={editUser} />
    </div>
  );
}
