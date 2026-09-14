import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Pencil, XCircle, CheckCircle2, Box } from 'lucide-react';
import { useForm, Controller } from 'react-hook-form';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { Avatar, Button, Card, Col, Drawer, Empty, Input, Row, Select, Space, Table, Tag, Typography } from 'antd';
import ImportButton from '../../components/common/ImportButton';

const { Title, Text } = Typography;

const ROLES = [
  { value: 'member', label: 'Member', color: 'default' },
  { value: 'team_lead', label: 'Team Lead', color: 'blue' },
  { value: 'manager', label: 'Manager', color: 'purple' },
  { value: 'admin', label: 'Admin', color: 'orange' },
];

const DEPARTMENTS = ['Marketing', 'Marketplace', 'Sales', 'Production', 'R&D', 'Operations', 'Accounts & Finance'];

function roleColor(role) {
  return ROLES.find((r) => r.value === role)?.color || 'default';
}

function UserDrawer({ open, onClose, editUser }) {
  const qc = useQueryClient();
  const isEdit = !!editUser;
  const { register, handleSubmit, reset, control, formState: { errors } } = useForm({
    defaultValues: editUser
      ? { firstName: editUser.firstName, lastName: editUser.lastName, phone: editUser.phone, role: editUser.role, department: editUser.department, designation: editUser.designation, googleEmail: editUser.googleEmail || '' }
      : { role: 'member' },
  });

  React.useEffect(() => {
    if (open) {
      reset(editUser
        ? { firstName: editUser.firstName, lastName: editUser.lastName, phone: editUser.phone, role: editUser.role, department: editUser.department || '', designation: editUser.designation || '', googleEmail: editUser.googleEmail || '' }
        : { role: 'member', firstName: '', lastName: '', email: '', password: '', phone: '', department: '', designation: '', googleEmail: '' }
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

  return (
    <Drawer
      open={open} onClose={onClose} width={440}
      title={isEdit ? 'Edit Member' : 'Add New Member'}
      footer={
        <Space style={{ width: '100%' }}>
          <Button style={{ flex: 1 }} onClick={onClose}>Cancel</Button>
          <Button type="primary" style={{ flex: 1 }} loading={mutation.isPending} onClick={handleSubmit(mutation.mutate)}>{isEdit ? 'Save Changes' : 'Add Member'}</Button>
        </Space>
      }
    >
      <form id="user-form" onSubmit={handleSubmit(mutation.mutate)}>
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
          <Row gutter={12}>
            <Col span={12}>
              <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>First Name *</Text>
              <Input {...register('firstName', { required: 'Required' })} placeholder="Ravi" status={errors.firstName ? 'error' : undefined} />
              {errors.firstName && <Text type="danger" style={{ fontSize: 11 }}>{errors.firstName.message}</Text>}
            </Col>
            <Col span={12}>
              <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Last Name *</Text>
              <Input {...register('lastName', { required: 'Required' })} placeholder="Kumar" status={errors.lastName ? 'error' : undefined} />
              {errors.lastName && <Text type="danger" style={{ fontSize: 11 }}>{errors.lastName.message}</Text>}
            </Col>
          </Row>

          {!isEdit && (
            <div>
              <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Email Address *</Text>
              <Input
                {...register('email', { required: 'Email is required', pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Enter a valid email' } })}
                placeholder="employee@example.com" type="email" status={errors.email ? 'error' : undefined}
              />
              {errors.email && <Text type="danger" style={{ fontSize: 11 }}>{errors.email.message}</Text>}
            </div>
          )}

          {!isEdit && (
            <div>
              <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Password *</Text>
              <Input.Password
                {...register('password', { required: 'Password is required', minLength: { value: 8, message: 'Minimum 8 characters' } })}
                placeholder="Minimum 8 characters" status={errors.password ? 'error' : undefined}
              />
              {errors.password && <Text type="danger" style={{ fontSize: 11 }}>{errors.password.message}</Text>}
              <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>Employee will use this to sign in with email</Text>
            </div>
          )}

          <div>
            <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Mobile Number</Text>
            <Input
              addonBefore="+91"
              {...register('phone', { pattern: { value: /^\d{10}$/, message: 'Enter 10-digit number' } })}
              placeholder="98765 43210" inputMode="numeric" maxLength={10}
              status={errors.phone ? 'error' : undefined}
            />
            {errors.phone && <Text type="danger" style={{ fontSize: 11 }}>{errors.phone.message}</Text>}
          </div>

          <Row gutter={12}>
            <Col span={12}>
              <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Role *</Text>
              <Controller
                name="role" control={control} rules={{ required: true }} defaultValue="member"
                render={({ field }) => <Select {...field} style={{ width: '100%' }} options={ROLES.map((r) => ({ label: r.label, value: r.value }))} />}
              />
            </Col>
            <Col span={12}>
              <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Department</Text>
              <Controller
                name="department" control={control} defaultValue=""
                render={({ field }) => <Select {...field} style={{ width: '100%' }} options={[{ label: '— Select —', value: '' }, ...DEPARTMENTS.map((d) => ({ label: d, value: d }))]} />}
              />
            </Col>
          </Row>

          <div>
            <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Designation</Text>
            <Input {...register('designation')} placeholder="e.g. Sales Executive" />
          </div>

          <div>
            <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Google Email <Text type="secondary" style={{ fontWeight: 400 }}>(for Google login)</Text></Text>
            <Input
              {...register('googleEmail', { pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Enter a valid email' } })}
              placeholder="employee@gmail.com" type="email" status={errors.googleEmail ? 'error' : undefined}
            />
            {errors.googleEmail && <Text type="danger" style={{ fontSize: 11 }}>{errors.googleEmail.message}</Text>}
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>Employee will use this Gmail to sign in with Google</Text>
          </div>
        </Space>
      </form>
    </Drawer>
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
    mutationFn: ({ id, isActive }) => isActive ? api.patch(`/users/${id}/deactivate`) : api.patch(`/users/${id}/activate`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['team'] }); toast.success('Status updated'); },
    onError: () => toast.error('Failed to update status'),
  });

  const toggleInventory = useMutation({
    mutationFn: ({ id, permissions }) => {
      const has = (permissions || []).includes('inventory:write');
      const next = has ? (permissions || []).filter(p => p !== 'inventory:write') : [...(permissions || []), 'inventory:write'];
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

  const columns = [
    {
      title: 'Member', key: 'member',
      render: (_, u) => (
        <Space>
          <Avatar style={{ backgroundColor: '#a8781f1f', color: '#a8781f' }}>{u.firstName?.[0]}{u.lastName?.[0]}</Avatar>
          <div>
            <Text strong delete={!u.isActive} type={!u.isActive ? 'secondary' : undefined}>{u.firstName} {u.lastName}</Text>
            {u.designation && <div><Text type="secondary" style={{ fontSize: 12 }}>{u.designation}</Text></div>}
          </div>
        </Space>
      ),
    },
    { title: 'Phone', key: 'phone', render: (_, u) => <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>+91 {u.phone?.slice(-10)}</Text> },
    { title: 'Department', dataIndex: 'department', key: 'department', render: (v) => v || '—' },
    {
      title: 'Role', key: 'role', align: 'center',
      render: (_, u) => (
        <Space size={4}>
          <Tag color={roleColor(u.role)}>{u.role?.replace('_', ' ')}</Tag>
          {(u.permissions || []).includes('inventory:write') && <Tag color="cyan" icon={<Box size={10} style={{ marginRight: 2 }} />}>Inventory</Tag>}
        </Space>
      ),
    },
    { title: 'Status', dataIndex: 'isActive', key: 'isActive', align: 'center', render: (v) => <Tag color={v ? 'green' : 'default'}>{v ? 'Active' : 'Inactive'}</Tag> },
    {
      title: 'Actions', key: 'actions', align: 'right',
      render: (_, u) => (
        <Space size={4}>
          {['member', 'team_lead'].includes(u.role) && (
            <Button
              type="text" size="small" icon={<Box size={14} color={(u.permissions || []).includes('inventory:write') ? '#0891b2' : '#9ca3af'} />}
              title={(u.permissions || []).includes('inventory:write') ? 'Remove inventory access' : 'Grant inventory access'}
              onClick={() => toggleInventory.mutate({ id: u._id, permissions: u.permissions })}
            />
          )}
          <Button type="text" size="small" icon={<Pencil size={14} />} title="Edit" onClick={() => openEdit(u)} />
          <Button
            type="text" size="small"
            icon={u.isActive ? <XCircle size={14} color="#ef4444" /> : <CheckCircle2 size={14} color="#22c55e" />}
            title={u.isActive ? 'Deactivate' : 'Activate'}
            onClick={() => toggleActive.mutate({ id: u._id, isActive: u.isActive })}
          />
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title level={4} style={{ marginBottom: 0 }}>Team Management</Title>
          <Text type="secondary">Manage your employees, managers and admins</Text>
        </div>
        <Space>
          <ImportButton templateUrl="/users/import/template" importUrl="/users/import" onSuccess={() => qc.invalidateQueries({ queryKey: ['team'] })} label="Import" />
          <Button type="primary" icon={<Plus size={14} />} onClick={openAdd}>Add Member</Button>
        </Space>
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        {[
          { label: 'Total Members', value: stats.total, color: '#1f2937' },
          { label: 'Active', value: stats.active, color: '#16a34a' },
          { label: 'Admins & Managers', value: stats.admins, color: '#a8781f' },
          { label: 'Members', value: stats.members, color: '#6b7280' },
        ].map((s) => (
          <Col span={6} key={s.label}>
            <Card size="small">
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>{s.label}</Text>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
            </Card>
          </Col>
        ))}
      </Row>

      <Space style={{ marginBottom: 16, width: '100%' }} wrap>
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or phone..." prefix={<Search size={14} color="#9ca3af" />} style={{ width: 260 }} />
        <Select value={filterRole} onChange={setFilterRole} style={{ width: 160 }} options={[{ label: 'All Roles', value: '' }, ...ROLES.map((r) => ({ label: r.label, value: r.value }))]} />
        <Select value={filterDept} onChange={setFilterDept} style={{ width: 180 }} options={[{ label: 'All Departments', value: '' }, ...DEPARTMENTS.map((d) => ({ label: d, value: d }))]} />
      </Space>

      <Card styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="_id" columns={columns} dataSource={filtered} loading={isLoading} pagination={false}
          locale={{
            emptyText: (
              <Empty description="No members found">
                <Button type="primary" icon={<Plus size={14} />} onClick={openAdd}>Add First Member</Button>
              </Empty>
            ),
          }}
        />
      </Card>

      <UserDrawer open={modalOpen} onClose={() => setModalOpen(false)} editUser={editUser} />
    </div>
  );
}
