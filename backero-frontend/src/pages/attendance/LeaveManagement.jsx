import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarOff, Check, X as XIcon } from 'lucide-react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { Button, Card, Col, Empty, Input, Modal, Row, Select, Space, Table, Tabs, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { usePermissions } from '../../store/usePermissions';

const { Title, Text } = Typography;

const STATUS_COLOR = { PENDING: 'gold', APPROVED: 'green', REJECTED: 'red', CANCELLED: 'default' };

// ── Requests tab ─────────────────────────────────────────────────────────────
function RequestsTab() {
  const qc = useQueryClient();
  const [filterStatus, setFilterStatus] = useState('PENDING');
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectNote, setRejectNote] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['leave-requests', filterStatus],
    queryFn: () => api.get('/leave/requests', { params: { status: filterStatus || undefined } }).then((r) => r.data),
  });
  const requests = data?.requests || [];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['leave-requests'] });
  };

  const approve = useMutation({
    mutationFn: (id) => api.post(`/leave/requests/${id}/approve`),
    onSuccess: () => { invalidate(); toast.success('Approved'); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to approve'),
  });
  const reject = useMutation({
    mutationFn: ({ id, note }) => api.post(`/leave/requests/${id}/reject`, { note }),
    onSuccess: () => { invalidate(); toast.success('Rejected'); setRejectTarget(null); setRejectNote(''); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to reject'),
  });

  const columns = [
    { title: 'Employee', key: 'employee', render: (_, r) => r.employeeId ? `${r.employeeId.fullName} (${r.employeeId.employeeCode})` : '—' },
    { title: 'Type', key: 'type', render: (_, r) => r.leaveTypeId?.name || '—' },
    { title: 'From', dataIndex: 'startDate', key: 'startDate', render: (v) => dayjs(v).format('DD MMM YYYY') },
    { title: 'To', dataIndex: 'endDate', key: 'endDate', render: (v) => dayjs(v).format('DD MMM YYYY') },
    { title: 'Days', dataIndex: 'workingDays', key: 'workingDays', align: 'center' },
    { title: 'Reason', dataIndex: 'reason', key: 'reason', ellipsis: true },
    { title: 'Status', dataIndex: 'status', key: 'status', align: 'center', render: (v) => <Tag color={STATUS_COLOR[v]}>{v}</Tag> },
    {
      title: '', key: 'actions', align: 'right',
      render: (_, r) => r.status === 'PENDING' ? (
        <Space>
          <Button size="small" type="primary" icon={<Check size={12} />} loading={approve.isPending} onClick={() => approve.mutate(r._id)}>Approve</Button>
          <Button size="small" danger icon={<XIcon size={12} />} onClick={() => setRejectTarget(r)}>Reject</Button>
        </Space>
      ) : null,
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Select
          value={filterStatus || undefined} allowClear placeholder="All statuses" style={{ width: 180 }}
          onChange={(v) => setFilterStatus(v || '')}
          options={['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].map((s) => ({ label: s, value: s }))}
        />
      </Space>
      <Card styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="_id" columns={columns} dataSource={requests} loading={isLoading} pagination={false}
          locale={{ emptyText: <Empty image={<CalendarOff size={36} color="#d1d5db" style={{ margin: '0 auto' }} />} description="No leave requests" /> }}
        />
      </Card>

      <Modal open={!!rejectTarget} onCancel={() => setRejectTarget(null)} footer={null} title="Reject Leave Request" destroyOnClose>
        <Space direction="vertical" style={{ width: '100%', marginTop: 16 }} size={12}>
          <Input.TextArea rows={3} placeholder="Reason for rejection (optional)" value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} />
          <Space style={{ width: '100%' }}>
            <Button style={{ flex: 1 }} onClick={() => setRejectTarget(null)}>Cancel</Button>
            <Button style={{ flex: 1 }} danger type="primary" loading={reject.isPending} onClick={() => reject.mutate({ id: rejectTarget._id, note: rejectNote })}>Reject</Button>
          </Space>
        </Space>
      </Modal>
    </div>
  );
}

// ── Balances tab ──────────────────────────────────────────────────────────────
function BalancesTab() {
  const qc = useQueryClient();
  const currentYear = new Date().getFullYear();
  const [form, setForm] = useState({ employee_id: '', leave_type_id: '', year: currentYear, total_days: '' });

  const { data: employeesData } = useQuery({ queryKey: ['employees-all'], queryFn: () => api.get('/employees', { params: { limit: 200 } }).then((r) => r.data) });
  const employees = employeesData?.data || [];
  const { data: typesData } = useQuery({ queryKey: ['leave-types'], queryFn: () => api.get('/leave/types').then((r) => r.data) });
  const types = typesData?.types || [];

  const { data: balancesData, refetch } = useQuery({
    queryKey: ['employee-leave-balances', form.employee_id, form.year],
    queryFn: () => api.get(`/leave/balances/${form.employee_id}`, { params: { year: form.year } }).then((r) => r.data),
    enabled: !!form.employee_id,
  });
  const balances = balancesData?.balances || [];

  const setBalance = useMutation({
    mutationFn: (body) => api.put('/leave/balances', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['employee-leave-balances'] }); refetch(); toast.success('Balance saved'); setForm((f) => ({ ...f, total_days: '' })); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to save balance'),
  });

  return (
    <Card size="small" title="Set Leave Balance" style={{ maxWidth: 640 }}>
      <Space direction="vertical" style={{ width: '100%' }} size={12}>
        <Row gutter={8}>
          <Col span={12}>
            <Text style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Employee</Text>
            <Select
              showSearch optionFilterProp="label" style={{ width: '100%' }} placeholder="Select employee…"
              value={form.employee_id || undefined} onChange={(v) => setForm((f) => ({ ...f, employee_id: v }))}
              options={employees.map((e) => ({ label: `${e.fullName} (${e.employeeCode})`, value: e._id }))}
            />
          </Col>
          <Col span={12}>
            <Text style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Year</Text>
            <Input type="number" value={form.year} onChange={(e) => setForm((f) => ({ ...f, year: Number(e.target.value) }))} />
          </Col>
        </Row>

        {form.employee_id && (
          <Space direction="vertical" style={{ width: '100%' }} size={4}>
            {balances.map((b) => (
              <Text key={b._id} style={{ fontSize: 12, display: 'block' }}>
                {b.leaveTypeId?.name}: {b.totalDays - b.usedDays} / {b.totalDays} days left
              </Text>
            ))}
          </Space>
        )}

        <Row gutter={8}>
          <Col span={12}>
            <Text style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Leave Type</Text>
            <Select
              style={{ width: '100%' }} placeholder="Select…" value={form.leave_type_id || undefined}
              onChange={(v) => setForm((f) => ({ ...f, leave_type_id: v }))}
              options={types.map((t) => ({ label: t.name, value: t._id }))}
            />
          </Col>
          <Col span={12}>
            <Text style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Total Days</Text>
            <Input type="number" value={form.total_days} onChange={(e) => setForm((f) => ({ ...f, total_days: e.target.value }))} />
          </Col>
        </Row>
        <Button
          type="primary" loading={setBalance.isPending}
          disabled={!form.employee_id || !form.leave_type_id || form.total_days === ''}
          onClick={() => setBalance.mutate(form)}
        >
          Save Balance
        </Button>
      </Space>
    </Card>
  );
}

// ── Types tab ─────────────────────────────────────────────────────────────────
function TypesTab() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', code: '', is_paid: true });

  const { data, isLoading } = useQuery({ queryKey: ['leave-types'], queryFn: () => api.get('/leave/types').then((r) => r.data) });
  const types = data?.types || [];

  const addType = useMutation({
    mutationFn: (body) => api.post('/leave/types', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leave-types'] }); toast.success('Leave type added'); setForm({ name: '', code: '', is_paid: true }); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to add leave type'),
  });

  return (
    <Card size="small" title="Leave Types" style={{ maxWidth: 520 }} loading={isLoading}>
      <Space direction="vertical" style={{ width: '100%' }} size={8}>
        {types.map((t) => (
          <div key={t._id} style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 13 }}>{t.name} ({t.code})</Text>
            <Tag color={t.isPaid ? 'green' : 'default'}>{t.isPaid ? 'Paid' : 'Unpaid'}</Tag>
          </div>
        ))}
        <Row gutter={8}>
          <Col span={12}><Input size="small" placeholder="Name (e.g. Casual Leave)" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></Col>
          <Col span={6}><Input size="small" placeholder="Code" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} /></Col>
          <Col span={6}>
            <Select
              size="small" style={{ width: '100%' }} value={form.is_paid}
              onChange={(v) => setForm((f) => ({ ...f, is_paid: v }))}
              options={[{ label: 'Paid', value: true }, { label: 'Unpaid', value: false }]}
            />
          </Col>
        </Row>
        <Button size="small" type="primary" loading={addType.isPending} disabled={!form.name || !form.code} onClick={() => addType.mutate(form)}>Add Type</Button>
      </Space>
    </Card>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function LeaveManagement() {
  const { hasPermission } = usePermissions();

  const tabItems = [
    ...(hasPermission('leave:approve') ? [{ key: 'requests', label: 'Requests', children: <RequestsTab /> }] : []),
    ...(hasPermission('leave:manage') ? [
      { key: 'balances', label: 'Balances', children: <BalancesTab /> },
      { key: 'types', label: 'Types', children: <TypesTab /> },
    ] : []),
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 0 }}>Leave Management</Title>
      <Text type="secondary">Requests, balances, and leave types</Text>
      <div style={{ marginTop: 16 }}>
        <Tabs items={tabItems} />
      </div>
    </div>
  );
}
