import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Landmark, X, Play, Lock } from 'lucide-react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { Button, Card, Col, Drawer, Empty, Input, Row, Select, Space, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { TextArea } = Input;

const INR = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function NewPeriodDrawer({ open, onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ period_start: '', period_end: '' });

  const mutation = useMutation({
    mutationFn: (body) => api.post('/payroll/periods', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['payroll-periods'] }); toast.success('Payroll period created'); onClose(); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to create period'),
  });

  return (
    <Drawer
      open={open} onClose={onClose} width={360} closeIcon={<X size={18} />} title="New Payroll Period"
      footer={
        <Space style={{ width: '100%' }}>
          <Button style={{ flex: 1 }} onClick={onClose}>Cancel</Button>
          <Button type="primary" style={{ flex: 1 }} loading={mutation.isPending} disabled={!form.period_start || !form.period_end} onClick={() => mutation.mutate(form)}>Create</Button>
        </Space>
      }
    >
      <Space direction="vertical" style={{ width: '100%' }} size={16}>
        <div>
          <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Period Start *</Text>
          <Input type="date" value={form.period_start} onChange={(e) => setForm((f) => ({ ...f, period_start: e.target.value }))} />
        </div>
        <div>
          <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Period End *</Text>
          <Input type="date" value={form.period_end} onChange={(e) => setForm((f) => ({ ...f, period_end: e.target.value }))} />
        </div>
      </Space>
    </Drawer>
  );
}

function SalaryDrawer({ open, onClose, employees }) {
  const qc = useQueryClient();
  const [employeeId, setEmployeeId] = useState('');
  const [salary, setSalary] = useState('');

  const { data } = useQuery({
    queryKey: ['payroll-config', employeeId],
    queryFn: () => api.get(`/payroll/config/${employeeId}`).then((r) => r.data),
    enabled: !!employeeId,
  });
  React.useEffect(() => { if (data) setSalary(String(data.basic_monthly_salary ?? '')); }, [data]);

  const mutation = useMutation({
    mutationFn: () => api.put(`/payroll/config/${employeeId}`, { basic_monthly_salary: Number(salary) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll-config', employeeId] });
      toast.success('Salary saved');
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to save'),
  });

  return (
    <Drawer
      open={open} onClose={onClose} width={360} closeIcon={<X size={18} />} title="Set Employee Salary"
      footer={
        <Space style={{ width: '100%' }}>
          <Button style={{ flex: 1 }} onClick={onClose}>Cancel</Button>
          <Button type="primary" style={{ flex: 1 }} loading={mutation.isPending} disabled={!employeeId || salary === ''} onClick={() => mutation.mutate()}>Save</Button>
        </Space>
      }
    >
      <Space direction="vertical" style={{ width: '100%' }} size={16}>
        <div>
          <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Employee</Text>
          <Select
            value={employeeId || undefined} onChange={setEmployeeId} style={{ width: '100%' }} placeholder="Select…"
            showSearch optionFilterProp="label" options={employees.map((e) => ({ label: `${e.fullName} (${e.employeeCode})`, value: e._id }))}
          />
        </div>
        <div>
          <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Basic Monthly Salary (₹)</Text>
          <Input type="number" value={salary} onChange={(e) => setSalary(e.target.value)} placeholder="30000" disabled={!employeeId} />
        </div>
      </Space>
    </Drawer>
  );
}

function CorrectionDrawer({ record, onClose }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const [basicEarnings, setBasicEarnings] = useState('');
  const [deductions, setDeductions] = useState('');

  React.useEffect(() => {
    if (record) { setBasicEarnings(String(record.basicEarnings ?? '')); setDeductions(String(record.deductions ?? '')); setReason(''); }
  }, [record]);

  const mutation = useMutation({
    mutationFn: () => api.post(`/payroll/records/${record._id}/correct`, {
      reason, proposed_basic_earnings: Number(basicEarnings), proposed_deductions: Number(deductions),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll-records'] });
      toast.success('Correction submitted for approval');
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to submit correction'),
  });

  return (
    <Drawer
      open={!!record} onClose={onClose} width={380} closeIcon={<X size={18} />} title={record ? `Correct — ${record.employeeFullName}` : ''}
      footer={
        <Space style={{ width: '100%' }}>
          <Button style={{ flex: 1 }} onClick={onClose}>Cancel</Button>
          <Button type="primary" style={{ flex: 1 }} loading={mutation.isPending} disabled={reason.trim().length < 5} onClick={() => mutation.mutate()}>Submit</Button>
        </Space>
      }
    >
      <Space direction="vertical" style={{ width: '100%' }} size={16}>
        <Row gutter={12}>
          <Col span={12}>
            <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Basic Earnings (₹)</Text>
            <Input type="number" value={basicEarnings} onChange={(e) => setBasicEarnings(e.target.value)} />
          </Col>
          <Col span={12}>
            <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Deductions (₹)</Text>
            <Input type="number" value={deductions} onChange={(e) => setDeductions(e.target.value)} />
          </Col>
        </Row>
        <div>
          <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Reason (min 5 characters) *</Text>
          <TextArea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <Text type="secondary" style={{ fontSize: 11 }}>This goes to approval — a different admin than the requester must approve it.</Text>
      </Space>
    </Drawer>
  );
}

function PeriodRecords({ periodId, canManage, canFinalize }) {
  const qc = useQueryClient();
  const [correctingRecord, setCorrectingRecord] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['payroll-records', periodId],
    queryFn: () => api.get(`/payroll/periods/${periodId}/records`).then((r) => r.data),
  });
  const records = data?.records || [];

  const approveMutation = useMutation({
    mutationFn: ({ recordId, correctionId }) => api.post(`/payroll/records/${recordId}/correct/${correctionId}/approve`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['payroll-records', periodId] }); toast.success('Correction approved'); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to approve'),
  });

  const columns = [
    { title: 'Code', dataIndex: 'employeeCode', key: 'employeeCode', render: (v) => <Text style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</Text> },
    { title: 'Employee', dataIndex: 'employeeFullName', key: 'employeeFullName' },
    { title: 'Basic Earnings', dataIndex: 'basicEarnings', key: 'basicEarnings', align: 'right', render: INR },
    { title: 'Deductions', dataIndex: 'deductions', key: 'deductions', align: 'right', render: INR },
    { title: 'Net Salary', dataIndex: 'netSalary', key: 'netSalary', align: 'right', render: (v) => <Text strong>{INR(v)}</Text> },
    { title: 'Status', dataIndex: 'isFinalized', key: 'isFinalized', align: 'center', render: (v) => <Tag color={v ? 'green' : 'default'}>{v ? 'Finalized' : 'Draft'}</Tag> },
    ...(canManage ? [{
      title: 'Actions', key: 'actions', align: 'right',
      render: (_, r) => <Button size="small" onClick={() => setCorrectingRecord(r)}>Request Correction</Button>,
    }] : []),
  ];

  return (
    <>
      <Card size="small" styles={{ body: { padding: 0 } }} style={{ marginTop: 8 }}>
        <Table rowKey="_id" columns={columns} dataSource={records} loading={isLoading} pagination={false} locale={{ emptyText: <Empty description="No records generated yet" /> }} />
      </Card>
      {canManage && <CorrectionDrawer record={correctingRecord} onClose={() => setCorrectingRecord(null)} />}
    </>
  );
}

export default function Payroll() {
  const qc = useQueryClient();
  const [expandedId, setExpandedId] = useState(null);
  const [newPeriodOpen, setNewPeriodOpen] = useState(false);
  const [salaryOpen, setSalaryOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['payroll-periods'],
    queryFn: () => api.get('/payroll/periods', { params: { limit: 50 } }).then((r) => r.data),
  });
  const periods = data?.data || [];

  const { data: empData } = useQuery({
    queryKey: ['employees-all'],
    queryFn: () => api.get('/employees', { params: { limit: 200 } }).then((r) => r.data),
  });
  const employees = empData?.data || [];

  const generateMutation = useMutation({
    mutationFn: (periodId) => api.post(`/payroll/periods/${periodId}/generate`),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['payroll-records'] });
      const { generated_count, skipped_employee_ids } = res.data;
      toast.success(`Generated ${generated_count} record(s)${skipped_employee_ids?.length ? `, skipped ${skipped_employee_ids.length} (no salary set)` : ''}`);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to generate'),
  });

  const finalizeMutation = useMutation({
    mutationFn: (periodId) => api.post(`/payroll/periods/${periodId}/finalize`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['payroll-periods'] }); toast.success('Period finalized'); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to finalize'),
  });

  const columns = [
    { title: 'Period', key: 'period', render: (_, p) => `${dayjs(p.periodStart).format('DD MMM')} — ${dayjs(p.periodEnd).format('DD MMM YYYY')}` },
    { title: 'Status', dataIndex: 'status', key: 'status', align: 'center', render: (v) => <Tag color={v === 'FINALIZED' ? 'green' : 'blue'}>{v}</Tag> },
    {
      title: 'Actions', key: 'actions', align: 'right',
      render: (_, p) => (
        <Space size={8}>
          <Button size="small" onClick={() => setExpandedId(expandedId === p._id ? null : p._id)}>{expandedId === p._id ? 'Hide Records' : 'View Records'}</Button>
          {p.status !== 'FINALIZED' && (
            <Button size="small" icon={<Play size={12} />} loading={generateMutation.isPending} onClick={() => generateMutation.mutate(p._id)}>Generate</Button>
          )}
          {p.status !== 'FINALIZED' && (
            <Button size="small" danger icon={<Lock size={12} />} loading={finalizeMutation.isPending} onClick={() => finalizeMutation.mutate(p._id)}>Finalize</Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title level={4} style={{ marginBottom: 0 }}>Payroll</Title>
          <Text type="secondary">Pay periods, records, and salary configuration</Text>
        </div>
        <Space>
          <Button onClick={() => setSalaryOpen(true)}>Set Employee Salary</Button>
          <Button type="primary" icon={<Plus size={14} />} onClick={() => setNewPeriodOpen(true)}>New Period</Button>
        </Space>
      </div>

      <Card styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="_id" columns={columns} dataSource={periods} loading={isLoading} pagination={false}
          locale={{
            emptyText: (
              <Empty image={<Landmark size={40} color="#d1d5db" style={{ margin: '0 auto' }} />} description="No payroll periods yet">
                <Button type="primary" icon={<Plus size={14} />} onClick={() => setNewPeriodOpen(true)}>Create First Period</Button>
              </Empty>
            ),
          }}
          expandable={{
            expandedRowKeys: expandedId ? [expandedId] : [],
            expandIcon: () => null,
            expandedRowRender: (p) => <PeriodRecords periodId={p._id} canManage canFinalize />,
          }}
        />
      </Card>

      <NewPeriodDrawer open={newPeriodOpen} onClose={() => setNewPeriodOpen(false)} />
      <SalaryDrawer open={salaryOpen} onClose={() => setSalaryOpen(false)} employees={employees} />
    </div>
  );
}
