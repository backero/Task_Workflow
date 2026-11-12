// Complete employee profile directory — read-side consolidation of data that
// already lives across /employees (identity/contact/photo) and /payroll
// (salary config + pay history). No new backend endpoints; this page is a
// richer presentation layer over what Attendance->Employees and Attendance->
// Payroll already expose piecemeal.
import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Mail, Phone, Building2, CalendarDays, Wallet, IdCard, User as UserIcon, Search, Pencil, Check, X as XIcon, Eye } from 'lucide-react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { Avatar, Card, Drawer, Empty, Input, Select, Space, Table, Tag, Typography, Button } from 'antd';
import dayjs from 'dayjs';
import { usePermissions } from '../../store/usePermissions';
import EmployeeFormDrawer from '../../components/attendance/EmployeeFormDrawer';

const { Title, Text } = Typography;

const INR = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function SalaryBlock({ employee, canManageSalary }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');

  const startEdit = () => { setValue(employee.basicMonthlySalary != null ? String(employee.basicMonthlySalary) : ''); setEditing(true); };

  const mutation = useMutation({
    mutationFn: () => api.put(`/payroll/config/${employee._id}`, { basic_monthly_salary: Number(value) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] });
      toast.success('Salary saved');
      setEditing(false);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to save salary'),
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Wallet size={16} color="#9ca3af" />
      {editing ? (
        <Space>
          <Input type="number" size="small" style={{ width: 140 }} value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
          <Button size="small" type="primary" icon={<Check size={12} />} loading={mutation.isPending} onClick={() => mutation.mutate()} />
          <Button size="small" icon={<XIcon size={12} />} onClick={() => setEditing(false)} />
        </Space>
      ) : (
        <Space>
          <Text strong>{employee.basicMonthlySalary != null ? INR(employee.basicMonthlySalary) : 'Not set'}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>/ month</Text>
          {canManageSalary && <Button size="small" type="text" icon={<Pencil size={12} />} onClick={startEdit} />}
        </Space>
      )}
    </div>
  );
}

const isPlaceholderEmail = (email) => !!email && email.endsWith('@backero.internal');

// Click-to-edit email cell for the row list — writes straight to the linked
// User's email (PUT /users/:id), which is where /employees resolves `email`
// from. Only editable when there's a linked user account to update.
function EmailCell({ employee, canEdit }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const placeholder = isPlaceholderEmail(employee.email);

  const startEdit = (ev) => {
    ev.stopPropagation();
    setValue(placeholder ? '' : (employee.email || ''));
    setEditing(true);
  };

  const mutation = useMutation({
    mutationFn: () => api.put(`/users/${employee.userId}`, { email: value.trim().toLowerCase() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] });
      toast.success('Email updated');
      setEditing(false);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to update email'),
  });

  if (!employee.userId) {
    return <Text type="secondary" style={{ fontSize: 13 }}>No linked user</Text>;
  }

  if (editing) {
    return (
      <Space size={6} onClick={(ev) => ev.stopPropagation()}>
        <Input
          size="small" type="email" autoFocus style={{ width: 190 }} value={value}
          onChange={(ev) => setValue(ev.target.value)}
          onPressEnter={() => value.trim() && mutation.mutate()}
          placeholder="real.email@gmail.com"
        />
        <Button size="small" type="primary" icon={<Check size={12} />} loading={mutation.isPending} disabled={!value.trim()} onClick={() => mutation.mutate()} />
        <Button size="small" icon={<XIcon size={12} />} onClick={(ev) => { ev.stopPropagation(); setEditing(false); }} />
      </Space>
    );
  }

  return (
    <Space size={6} onClick={canEdit ? startEdit : undefined} style={{ cursor: canEdit ? 'pointer' : 'default' }}>
      <Mail size={12} color="#9ca3af" />
      <Text style={{ fontSize: 13 }} ellipsis type={placeholder ? 'warning' : undefined}>{employee.email}</Text>
      {canEdit && <Pencil size={11} color="#9ca3af" />}
    </Space>
  );
}

function PayrollHistory({ employeeId, canViewPayroll }) {
  const { data: periodsData } = useQuery({
    queryKey: ['payroll-periods'],
    queryFn: () => api.get('/payroll/periods', { params: { limit: 50 } }).then((r) => r.data),
    enabled: canViewPayroll,
  });
  const periodById = Object.fromEntries((periodsData?.data || []).map((p) => [p._id, p]));

  const { data, isLoading } = useQuery({
    queryKey: ['payroll-records-employee', employeeId],
    queryFn: () => api.get(`/payroll/records/${employeeId}`).then((r) => r.data),
    enabled: canViewPayroll,
  });
  const records = data?.records || [];

  if (!canViewPayroll) return null;

  const columns = [
    {
      title: 'Period', key: 'period',
      render: (_, r) => {
        const p = periodById[r.payrollPeriodId];
        return p ? `${dayjs(p.periodStart).format('DD MMM')} — ${dayjs(p.periodEnd).format('DD MMM YYYY')}` : dayjs(r.createdAt).format('DD MMM YYYY');
      },
    },
    { title: 'Basic', dataIndex: 'basicEarnings', key: 'basicEarnings', align: 'right', render: INR },
    { title: 'Deductions', dataIndex: 'deductions', key: 'deductions', align: 'right', render: INR },
    { title: 'Net', dataIndex: 'netSalary', key: 'netSalary', align: 'right', render: (v) => <Text strong>{INR(v)}</Text> },
    { title: 'Status', dataIndex: 'isFinalized', key: 'isFinalized', align: 'center', render: (v) => <Tag color={v ? 'green' : 'default'}>{v ? 'Finalized' : 'Draft'}</Tag> },
  ];

  return (
    <div style={{ marginTop: 20 }}>
      <Text strong style={{ display: 'block', marginBottom: 8 }}>Payroll History</Text>
      <Table
        rowKey="_id" size="small" columns={columns} dataSource={records} loading={isLoading} pagination={false}
        locale={{ emptyText: <Empty description="No payroll records yet" /> }}
      />
    </div>
  );
}

// EmployeeFormDrawer is rendered as a React child here (not a sibling in the
// parent component) so antd's Drawer context treats it as nested and gives it
// a higher z-index automatically — two sibling Drawers both default to the
// same z-index, which made the Edit drawer randomly paint behind this one.
function ProfileDrawer({ employee, onClose, deptById, designationById, canManageSalary, canViewPayroll, canEdit, editOpen, onEdit, onEditClose, departments, users }) {
  if (!employee) return null;
  const deptName = deptById[employee.departmentId]?.name || deptById[employee.departmentId?._id]?.name || '—';
  const designationTitle = designationById[employee.designationId]?.title || designationById[employee.designationId?._id]?.title || '—';

  return (
    <Drawer
      open={!!employee} onClose={onClose} width={480} title="Employee Profile"
      extra={canEdit && <Button size="small" icon={<Pencil size={12} />} onClick={onEdit}>Edit</Button>}
    >
      <Space direction="vertical" style={{ width: '100%' }} size={20}>
        <Space align="center" size={16}>
          <Avatar size={72} src={employee.photo || undefined} icon={<UserIcon size={32} />} />
          <div>
            <Title level={5} style={{ marginBottom: 2 }}>{employee.fullName}</Title>
            <Space size={6}>
              <Text type="secondary" style={{ fontFamily: 'monospace', fontSize: 12 }}>{employee.employeeCode}</Text>
              <Tag color={employee.category === 'FIELD' ? 'blue' : 'default'}>{employee.category}</Tag>
            </Space>
          </div>
        </Space>

        <Card size="small" title="Contact & Role">
          <Space direction="vertical" size={10} style={{ width: '100%' }}>
            <Space><Building2 size={16} color="#9ca3af" /><Text>{deptName} · {designationTitle}</Text></Space>
            <Space><Phone size={16} color="#9ca3af" /><Text>{employee.phone || 'Not provided'}</Text></Space>
            <Space><Mail size={16} color="#9ca3af" /><Text>{employee.email || 'No linked user account'}</Text></Space>
            <Space><CalendarDays size={16} color="#9ca3af" /><Text>Joined {employee.dateOfJoining ? dayjs(employee.dateOfJoining).format('DD MMM YYYY') : '—'}</Text></Space>
          </Space>
        </Card>

        <Card size="small" title="Salary">
          <SalaryBlock employee={employee} canManageSalary={canManageSalary} />
        </Card>

        <PayrollHistory employeeId={employee._id} canViewPayroll={canViewPayroll} />
      </Space>

      {canEdit && (
        <EmployeeFormDrawer
          open={editOpen} onClose={onEditClose}
          editEmployee={employee} departments={departments} users={users}
        />
      )}
    </Drawer>
  );
}

export default function EmployeeDetails() {
  const { hasPermission, isAdmin } = usePermissions();
  const canManageSalary = isAdmin || hasPermission('payroll:manage_config');
  const canViewPayroll = canManageSalary || hasPermission('payroll:read');
  const canEdit = isAdmin || hasPermission('employee:manage');
  // Email lives on the linked User record; updating it goes through PUT
  // /users/:id, which the backend restricts to true admins (authorizeAdminOrAbove) —
  // stricter than the attendance employee:manage permission used for canEdit above.
  const canEditEmail = isAdmin;

  const [search, setSearch] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [selected, setSelected] = useState(null);
  const [editOpen, setEditOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['employees', search, filterDept],
    queryFn: () => api.get('/employees', { params: { limit: 200, search: search || undefined, department_id: filterDept || undefined } }).then((r) => r.data),
  });
  const employees = data?.data || [];

  // Keep the open profile drawer in sync after an edit/photo/salary save —
  // those all invalidate ['employees'], and `selected` would otherwise keep
  // showing the pre-edit snapshot until the drawer is re-opened.
  useEffect(() => {
    if (!selected) return;
    const updated = employees.find((e) => e._id === selected._id);
    if (updated && updated !== selected) setSelected(updated);
  }, [employees]);

  const { data: deptsData } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get('/departments').then((r) => r.data),
  });
  const departments = deptsData?.departments || [];
  const deptById = Object.fromEntries(departments.map((d) => [d._id, d]));

  const { data: designationsData } = useQuery({
    queryKey: ['designations'],
    queryFn: () => api.get('/employees/designations').then((r) => r.data),
  });
  const designationById = Object.fromEntries((designationsData?.designations || []).map((d) => [d._id, d]));

  const { data: usersData } = useQuery({
    queryKey: ['team'],
    queryFn: () => api.get('/users?limit=200').then((r) => r.data),
    enabled: canEdit,
  });
  const users = usersData?.data || [];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title level={4} style={{ marginBottom: 0 }}>Employee Details</Title>
          <Text type="secondary">Complete profile — contact info, department, and salary — for every employee</Text>
        </div>
      </div>

      <Space style={{ marginBottom: 16, width: '100%' }} wrap>
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or code..." prefix={<Search size={14} color="#9ca3af" />} style={{ width: 260 }} />
        <Select value={filterDept || undefined} onChange={(v) => setFilterDept(v || '')} allowClear style={{ width: 200 }} placeholder="All Departments" options={departments.map((d) => ({ label: d.name, value: d._id }))} />
      </Space>

      {!isLoading && employees.length === 0 && (
        <Empty image={<IdCard size={40} color="#d1d5db" style={{ margin: '0 auto' }} />} description="No employees found" style={{ marginTop: 40 }} />
      )}

      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        {employees.map((e) => {
          const deptName = deptById[e.departmentId]?.name || deptById[e.departmentId?._id]?.name || '—';
          const designationTitle = designationById[e.designationId]?.title || designationById[e.designationId?._id]?.title || '—';
          return (
            <Card key={e._id} size="small" hoverable onClick={() => setSelected(e)} styles={{ body: { padding: '14px 20px' } }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                <Space size={12} style={{ flex: '1 1 240px', minWidth: 0 }}>
                  <Avatar size={40} src={e.photo || undefined} icon={<UserIcon size={18} />} />
                  <div style={{ minWidth: 0 }}>
                    <Text strong style={{ display: 'block' }}>{e.fullName}</Text>
                    <Text type="secondary" style={{ fontFamily: 'monospace', fontSize: 11 }}>{e.employeeCode}</Text>
                  </div>
                </Space>

                <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                  <Text>{deptName}</Text>
                  <div><Text type="secondary" style={{ fontSize: 12 }}>{designationTitle}</Text></div>
                </div>

                <div style={{ flex: '0 0 90px' }}>
                  <Tag color={e.category === 'FIELD' ? 'blue' : 'default'}>{e.category}</Tag>
                </div>

                <div style={{ flex: '1 1 150px', minWidth: 0 }}>
                  <Space size={6}><Phone size={12} color="#9ca3af" /><Text style={{ fontSize: 13 }}>{e.phone || <Text type="secondary">Not provided</Text>}</Text></Space>
                </div>

                <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                  <EmailCell employee={e} canEdit={canEditEmail} />
                </div>

                <div style={{ flex: '0 0 130px', textAlign: 'right' }}>
                  <Text strong={e.basicMonthlySalary != null}>{e.basicMonthlySalary != null ? INR(e.basicMonthlySalary) : <Text type="secondary">Not set</Text>}</Text>
                </div>

                <Button type="text" size="small" icon={<Eye size={14} />} title="View Profile" onClick={(ev) => { ev.stopPropagation(); setSelected(e); }} />
              </div>
            </Card>
          );
        })}
      </Space>

      <ProfileDrawer
        employee={selected} onClose={() => setSelected(null)}
        deptById={deptById} designationById={designationById}
        canManageSalary={canManageSalary} canViewPayroll={canViewPayroll}
        canEdit={canEdit} editOpen={editOpen} onEdit={() => setEditOpen(true)} onEditClose={() => setEditOpen(false)}
        departments={departments} users={users}
      />
    </div>
  );
}
