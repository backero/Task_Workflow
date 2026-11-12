import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Pencil, IdCard, RefreshCw, User as UserIcon } from 'lucide-react';
import api from '../../api/axios';
import { Avatar, Button, Card, Col, Empty, Input, Modal, Row, Select, Space, Table, Tag, Typography } from 'antd';
import EmployeeFormDrawer from '../../components/attendance/EmployeeFormDrawer';

const { Title, Text } = Typography;

const CATEGORIES = [
  { value: 'OFFICE', label: 'Office' },
  { value: 'FIELD', label: 'Field' },
];

// Same code-generation convention as the existing POST /departments/seed endpoint.
function slugDepartmentCode(name) {
  return name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().substring(0, 6) || 'DEPT';
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
        <Space>
          <Avatar size={32} src={e.photo || undefined} icon={<UserIcon size={16} />} />
          <div>
            <Text strong>{e.fullName}</Text>
            {e.email && <div><Text type="secondary" style={{ fontSize: 12 }}>{e.email}</Text></div>}
          </div>
        </Space>
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

      <EmployeeFormDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} editEmployee={editEmployee} departments={departments} users={users} />
    </div>
  );
}
