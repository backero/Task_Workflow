import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { Plus, Search, Pencil, IdCard, RefreshCw } from 'lucide-react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { Button, Card, Col, Drawer, Empty, Input, Modal, Row, Select, Space, Table, Tag, Typography } from 'antd';

const { Title, Text } = Typography;

const CATEGORIES = [
  { value: 'OFFICE', label: 'Office' },
  { value: 'FIELD', label: 'Field' },
];

// Best-effort match of a User's free-text department against the relational
// Department list — used to pre-fill (not auto-create) in the manual form.
function matchDepartmentId(departmentName, departments) {
  const name = (departmentName || '').trim().toLowerCase();
  if (!name) return '';
  const match = departments.find((d) => d.name.trim().toLowerCase() === name);
  return match?._id || '';
}

// Same code-generation convention as the existing POST /departments/seed endpoint.
function slugDepartmentCode(name) {
  return name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().substring(0, 6) || 'DEPT';
}

function EmployeeDrawer({ open, onClose, editEmployee, departments, users }) {
  const qc = useQueryClient();
  const isEdit = !!editEmployee;
  const { handleSubmit, reset, control, watch, setValue, formState: { errors } } = useForm({
    defaultValues: { employee_code: '', full_name: '', phone: '', department_id: '', designation_id: '', category: 'OFFICE', date_of_joining: '', user_id: '' },
  });
  const departmentId = watch('department_id');

  // Pick an existing User -> auto-fill their known details instead of
  // re-typing them; everything stays editable before submit.
  const handleLinkedUserChange = (userId) => {
    const user = users.find((u) => u._id === userId);
    if (!user) return;
    setValue('full_name', `${user.firstName} ${user.lastName}`.trim());
    if (user.phone) setValue('phone', user.phone);
    const matchedDept = matchDepartmentId(user.department, departments);
    if (matchedDept) setValue('department_id', matchedDept);
  };

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
              <Controller
                name="employee_code" control={control} rules={{ required: 'Required' }}
                render={({ field }) => (
                  <Input
                    {...field} placeholder="EMP-001" disabled={isEdit} style={{ textTransform: 'uppercase' }}
                    status={errors.employee_code ? 'error' : undefined}
                  />
                )}
              />
              {errors.employee_code && <Text type="danger" style={{ fontSize: 11 }}>{errors.employee_code.message}</Text>}
            </Col>
            <Col span={12}>
              <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Date of Joining *</Text>
              <Controller
                name="date_of_joining" control={control} rules={{ required: 'Required' }}
                render={({ field }) => (
                  <Input type="date" {...field} disabled={isEdit} status={errors.date_of_joining ? 'error' : undefined} />
                )}
              />
            </Col>
          </Row>

          <div>
            <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Full Name *</Text>
            <Controller
              name="full_name" control={control} rules={{ required: 'Required' }}
              render={({ field }) => (
                <Input {...field} placeholder="Priya Sharma" status={errors.full_name ? 'error' : undefined} />
              )}
            />
            {errors.full_name && <Text type="danger" style={{ fontSize: 11 }}>{errors.full_name.message}</Text>}
          </div>

          <div>
            <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Phone</Text>
            <Controller
              name="phone" control={control}
              render={({ field }) => <Input {...field} placeholder="9876543210" />}
            />
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
                  onChange={(v) => { field.onChange(v); if (v) handleLinkedUserChange(v); }}
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
  const [syncing, setSyncing] = useState(false);
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

  // Resolve (or auto-create) the Department/Designation for a free-text
  // User.department/designation pair, reusing the existing endpoints — no
  // new API. `departmentsCache`/`designationsCache` are mutated in place so
  // repeated matches within one sync run don't re-create the same record.
  const resolveDepartmentId = async (name, departmentsCache) => {
    const deptName = (name || '').trim() || 'Unassigned';
    const existing = departmentsCache.find((d) => d.name.trim().toLowerCase() === deptName.toLowerCase());
    if (existing) return existing._id;
    const res = await api.post('/departments', { name: deptName, code: slugDepartmentCode(deptName) });
    const created = res.data.department;
    departmentsCache.push(created);
    return created._id;
  };

  const resolveDesignationId = async (departmentId, title, designationsCache) => {
    const desigTitle = (title || '').trim() || 'Staff';
    if (!designationsCache[departmentId]) {
      const res = await api.get('/employees/designations', { params: { department_id: departmentId } });
      designationsCache[departmentId] = res.data.designations || [];
    }
    const list = designationsCache[departmentId];
    const existing = list.find((d) => d.title.trim().toLowerCase() === desigTitle.toLowerCase());
    if (existing) return existing._id;
    const res = await api.post('/employees/designations', { title: desigTitle, department_id: departmentId });
    list.push(res.data.designation);
    return res.data.designation._id;
  };

  const runSync = async (candidates, allEmployees, departmentsCache) => {
    setSyncing(true);
    let codeCounter = 0;
    for (const emp of allEmployees) {
      const m = /^EMP-(\d+)$/i.exec(emp.employeeCode || '');
      if (m) codeCounter = Math.max(codeCounter, parseInt(m[1], 10));
    }
    const designationsCache = {};
    const results = { created: 0, failed: [] };
    for (const user of candidates) {
      try {
        const departmentId = await resolveDepartmentId(user.department, departmentsCache);
        const designationId = await resolveDesignationId(departmentId, user.designation, designationsCache);
        codeCounter += 1;
        await api.post('/employees', {
          employee_code: `EMP-${String(codeCounter).padStart(3, '0')}`,
          full_name: `${user.firstName} ${user.lastName}`.trim(),
          phone: user.phone || undefined,
          department_id: departmentId,
          designation_id: designationId,
          category: 'OFFICE',
          date_of_joining: (user.createdAt || new Date().toISOString()).slice(0, 10),
          user_id: user._id,
        });
        results.created += 1;
      } catch (err) {
        results.failed.push({ user, reason: err.response?.data?.message || 'Failed to create employee.' });
      }
    }
    setSyncing(false);
    qc.invalidateQueries({ queryKey: ['employees'] });
    qc.invalidateQueries({ queryKey: ['departments'] });
    Modal.info({
      title: 'Sync complete',
      width: 480,
      content: (
        <div>
          <p>{results.created} employee record(s) created.</p>
          {results.failed.length > 0 && (
            <>
              <p>{results.failed.length} failed:</p>
              <ul style={{ maxHeight: 200, overflow: 'auto' }}>
                {results.failed.map((f, i) => (
                  <li key={i}>{f.user.firstName} {f.user.lastName}: {f.reason}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      ),
    });
  };

  const handleSyncFromUsers = async () => {
    const [usersRes, employeesRes, deptsRes] = await Promise.all([
      api.get('/users', { params: { limit: 200 } }),
      api.get('/employees', { params: { limit: 200 } }),
      api.get('/departments'),
    ]);
    const allUsers = usersRes.data.data || [];
    const allEmployees = employeesRes.data.data || [];
    const departmentsCache = [...(deptsRes.data.departments || [])];

    const linkedUserIds = new Set(allEmployees.filter((e) => e.userId).map((e) => String(e.userId?._id || e.userId)));
    const candidates = allUsers.filter((u) => u.isActive !== false && !linkedUserIds.has(String(u._id)));

    if (candidates.length === 0) {
      Modal.info({ title: 'Nothing to sync', content: 'Every active user already has a linked employee record.' });
      return;
    }

    Modal.confirm({
      title: 'Sync employees from users?',
      content: `This will create an Employee record for ${candidates.length} user(s) who don't have one yet — auto-creating any missing Department/Designation from their profile. You can review and edit each one afterwards. Continue?`,
      okText: 'Sync',
      onOk: () => runSync(candidates, allEmployees, departmentsCache),
    });
  };

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
        <Space>
          <Button icon={<RefreshCw size={14} />} loading={syncing} onClick={handleSyncFromUsers}>Sync from Users</Button>
          <Button type="primary" icon={<Plus size={14} />} onClick={openAdd}>Add Employee</Button>
        </Space>
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
