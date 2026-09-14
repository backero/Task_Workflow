import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { Plus, Search, Pencil, IdCard } from 'lucide-react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { Button, Card, Col, Drawer, Empty, Input, Row, Select, Space, Table, Tag, Typography } from 'antd';

const { Title, Text } = Typography;

const CATEGORIES = [
  { value: 'OFFICE', label: 'Office' },
  { value: 'FIELD', label: 'Field' },
];

function EmployeeDrawer({ open, onClose, editEmployee, departments, users }) {
  const qc = useQueryClient();
  const isEdit = !!editEmployee;
  const { register, handleSubmit, reset, control, watch, formState: { errors } } = useForm({
    defaultValues: { employee_code: '', full_name: '', phone: '', department_id: '', designation_id: '', category: 'OFFICE', date_of_joining: '', user_id: '' },
  });
  const departmentId = watch('department_id');

  const { data: designationsData } = useQuery({
    queryKey: ['designations', departmentId],
    queryFn: () => api.get('/employees/designations', { params: { department_id: departmentId } }).then((r) => r.data),
    enabled: !!departmentId,
  });
  const designations = designationsData?.designations || [];

  useEffect(() => {
    if (open) {
      reset(editEmployee
        ? {
            employee_code: editEmployee.employeeCode, full_name: editEmployee.fullName, phone: editEmployee.phone || '',
            department_id: editEmployee.departmentId?._id || editEmployee.departmentId || '',
            designation_id: editEmployee.designationId?._id || editEmployee.designationId || '',
            category: editEmployee.category, date_of_joining: editEmployee.dateOfJoining ? editEmployee.dateOfJoining.slice(0, 10) : '',
            user_id: editEmployee.userId?._id || editEmployee.userId || '',
          }
        : { employee_code: '', full_name: '', phone: '', department_id: '', designation_id: '', category: 'OFFICE', date_of_joining: '', user_id: '' }
      );
    }
  }, [open, editEmployee]);

  const mutation = useMutation({
    mutationFn: (data) => {
      const payload = {
        full_name: data.full_name, phone: data.phone || undefined,
        department_id: data.department_id, designation_id: data.designation_id,
        category: data.category, user_id: data.user_id || undefined,
      };
      if (isEdit) return api.patch(`/employees/${editEmployee._id}`, payload);
      return api.post('/employees', { ...payload, employee_code: data.employee_code, date_of_joining: data.date_of_joining });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] });
      toast.success(isEdit ? 'Employee updated' : 'Employee added');
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to save employee'),
  });

  return (
    <Drawer
      open={open} onClose={onClose} width={460}
      title={isEdit ? `Edit — ${editEmployee?.fullName}` : 'Add Employee'}
      footer={
        <Space style={{ width: '100%' }}>
          <Button style={{ flex: 1 }} onClick={onClose}>Cancel</Button>
          <Button type="primary" style={{ flex: 1 }} loading={mutation.isPending} onClick={handleSubmit(mutation.mutate)}>{isEdit ? 'Save Changes' : 'Add Employee'}</Button>
        </Space>
      }
    >
      <form onSubmit={handleSubmit(mutation.mutate)}>
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
          <Row gutter={12}>
            <Col span={12}>
              <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Employee Code *</Text>
              <Input
                {...register('employee_code', { required: 'Required' })}
                placeholder="EMP-001" disabled={isEdit} style={{ textTransform: 'uppercase' }}
                status={errors.employee_code ? 'error' : undefined}
              />
              {errors.employee_code && <Text type="danger" style={{ fontSize: 11 }}>{errors.employee_code.message}</Text>}
            </Col>
            <Col span={12}>
              <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Date of Joining *</Text>
              <Input type="date" {...register('date_of_joining', { required: 'Required' })} disabled={isEdit} status={errors.date_of_joining ? 'error' : undefined} />
            </Col>
          </Row>

          <div>
            <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Full Name *</Text>
            <Input {...register('full_name', { required: 'Required' })} placeholder="Priya Sharma" status={errors.full_name ? 'error' : undefined} />
            {errors.full_name && <Text type="danger" style={{ fontSize: 11 }}>{errors.full_name.message}</Text>}
          </div>

          <div>
            <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Phone</Text>
            <Input {...register('phone')} placeholder="9876543210" />
          </div>

          <Row gutter={12}>
            <Col span={12}>
              <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Department *</Text>
              <Controller
                name="department_id" control={control} rules={{ required: true }}
                render={({ field }) => (
                  <Select
                    {...field} style={{ width: '100%' }} placeholder="Select…"
                    onChange={(v) => field.onChange(v)}
                    options={departments.map((d) => ({ label: d.name, value: d._id }))}
                  />
                )}
              />
            </Col>
            <Col span={12}>
              <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Designation *</Text>
              <Controller
                name="designation_id" control={control} rules={{ required: true }}
                render={({ field }) => (
                  <Select
                    {...field} style={{ width: '100%' }} placeholder={departmentId ? 'Select…' : 'Pick a department first'}
                    disabled={!departmentId} options={designations.map((d) => ({ label: d.title, value: d._id }))}
                  />
                )}
              />
            </Col>
          </Row>

          <div>
            <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Category *</Text>
            <Controller
              name="category" control={control} rules={{ required: true }}
              render={({ field }) => <Select {...field} style={{ width: '100%' }} options={CATEGORIES} />}
            />
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>Field employees can be GPS-tracked during a work session; Office employees never are.</Text>
          </div>

          <div>
            <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Linked User Account</Text>
            <Controller
              name="user_id" control={control}
              render={({ field }) => (
                <Select
                  {...field} style={{ width: '100%' }} placeholder="— Unlinked —" allowClear
                  showSearch optionFilterProp="label"
                  options={users.map((u) => ({ label: `${u.firstName} ${u.lastName} (${u.email})`, value: u._id }))}
                />
              )}
            />
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>Lets this person sign in and see their own attendance/payroll.</Text>
          </div>
        </Space>
      </form>
    </Drawer>
  );
}

export default function Employees() {
  const [search, setSearch] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editEmployee, setEditEmployee] = useState(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['employees', search, filterDept, filterCategory],
    queryFn: () => api.get('/employees', { params: { limit: 200, search: search || undefined, department_id: filterDept || undefined, category: filterCategory || undefined } }).then((r) => r.data),
  });
  const employees = data?.data || [];

  const { data: deptsData } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get('/departments').then((r) => r.data),
  });
  const departments = deptsData?.departments || [];
  const deptById = Object.fromEntries(departments.map((d) => [d._id, d]));

  const { data: usersData } = useQuery({
    queryKey: ['team'],
    queryFn: () => api.get('/users?limit=200').then((r) => r.data),
  });
  const users = usersData?.data || [];

  const stats = {
    total: employees.length,
    office: employees.filter((e) => e.category === 'OFFICE').length,
    field: employees.filter((e) => e.category === 'FIELD').length,
  };

  const openAdd = () => { setEditEmployee(null); setDrawerOpen(true); };
  const openEdit = (e) => { setEditEmployee(e); setDrawerOpen(true); };

  const columns = [
    { title: 'Code', dataIndex: 'employeeCode', key: 'employeeCode', render: (v) => <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</Text> },
    {
      title: 'Employee', key: 'employee',
      render: (_, e) => (
        <div>
          <Text strong>{e.fullName}</Text>
          {e.email && <div><Text type="secondary" style={{ fontSize: 12 }}>{e.email}</Text></div>}
        </div>
      ),
    },
    { title: 'Department', key: 'department', render: (_, e) => deptById[e.departmentId]?.name || deptById[e.departmentId?._id]?.name || '—' },
    { title: 'Category', dataIndex: 'category', key: 'category', align: 'center', render: (v) => <Tag color={v === 'FIELD' ? 'blue' : 'default'}>{v}</Tag> },
    { title: 'Joined', dataIndex: 'dateOfJoining', key: 'dateOfJoining', render: (v) => v ? new Date(v).toLocaleDateString('en-IN') : '—' },
    {
      title: 'Actions', key: 'actions', align: 'right',
      render: (_, e) => <Button type="text" size="small" icon={<Pencil size={14} />} title="Edit" onClick={() => openEdit(e)} />,
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title level={4} style={{ marginBottom: 0 }}>Employees</Title>
          <Text type="secondary">Employee directory for attendance, devices, and payroll</Text>
        </div>
        <Button type="primary" icon={<Plus size={14} />} onClick={openAdd}>Add Employee</Button>
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        {[
          { label: 'Total Employees', value: stats.total, color: '#1f2937' },
          { label: 'Office', value: stats.office, color: '#2563eb' },
          { label: 'Field', value: stats.field, color: '#0891b2' },
        ].map((s) => (
          <Col span={8} key={s.label}>
            <Card size="small">
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>{s.label}</Text>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
            </Card>
          </Col>
        ))}
      </Row>

      <Space style={{ marginBottom: 16, width: '100%' }} wrap>
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or code..." prefix={<Search size={14} color="#9ca3af" />} style={{ width: 260 }} />
        <Select value={filterDept || undefined} onChange={(v) => setFilterDept(v || '')} allowClear style={{ width: 200 }} placeholder="All Departments" options={departments.map((d) => ({ label: d.name, value: d._id }))} />
        <Select value={filterCategory || undefined} onChange={(v) => setFilterCategory(v || '')} allowClear style={{ width: 160 }} placeholder="All Categories" options={CATEGORIES} />
      </Space>

      <Card styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="_id" columns={columns} dataSource={employees} loading={isLoading} pagination={false}
          locale={{
            emptyText: (
              <Empty image={<IdCard size={40} color="#d1d5db" style={{ margin: '0 auto' }} />} description="No employees found">
                <Button type="primary" icon={<Plus size={14} />} onClick={openAdd}>Add First Employee</Button>
              </Empty>
            ),
          }}
        />
      </Card>

      <EmployeeDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} editEmployee={editEmployee} departments={departments} users={users} />
    </div>
  );
}
