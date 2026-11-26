import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Landmark, X, Play, Lock, LockOpen, Upload, FileDown } from 'lucide-react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { Alert, Button, Card, Col, Drawer, Empty, Input, Modal, Row, Select, Space, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';

async function downloadSlip(recordId, fileName) {
  try {
    const blob = await api.get(`/payroll/records/${recordId}/slip`, { responseType: 'blob' }).then((r) => r.data);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName; a.click();
    URL.revokeObjectURL(url);
  } catch {
    toast.error('Could not download payslip');
  }
}

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

const LINE_ITEM_FIELDS = [
  { key: 'dearness_allowance', label: 'Dearness Allowance' },
  { key: 'house_rent_allowance', label: 'HRA' },
  { key: 'telephone_reimbursement', label: 'Telephone Reimbursements' },
  { key: 'bonus', label: 'Bonus' },
  { key: 'lta', label: 'LTA' },
  { key: 'special_allowance', label: 'Special Allowance' },
  { key: 'income_tax', label: 'Income Tax' },
  { key: 'pf', label: 'Provident Fund' },
  { key: 'professional_tax', label: 'Professional Tax' },
  { key: 'esic', label: 'ESIC' },
];

const RECORD_KEY_BY_FIELD = {
  dearness_allowance: 'dearnessAllowance', house_rent_allowance: 'houseRentAllowance',
  telephone_reimbursement: 'telephoneReimbursement', bonus: 'bonus', lta: 'lta',
  special_allowance: 'specialAllowance', income_tax: 'incomeTax', pf: 'pf',
  professional_tax: 'professionalTax', esic: 'esic',
};

function LineItemsDrawer({ record, onClose }) {
  const qc = useQueryClient();
  const [values, setValues] = useState({});

  useEffect(() => {
    if (record) {
      const next = {};
      LINE_ITEM_FIELDS.forEach(({ key }) => { next[key] = String(record[RECORD_KEY_BY_FIELD[key]] ?? 0); });
      setValues(next);
    }
  }, [record]);

  const mutation = useMutation({
    mutationFn: () => {
      const body = {};
      LINE_ITEM_FIELDS.forEach(({ key }) => { body[key] = Number(values[key] || 0); });
      return api.put(`/payroll/records/${record._id}/line-items`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll-records'] });
      toast.success('Payslip line items updated');
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to update line items'),
  });

  return (
    <Drawer
      open={!!record} onClose={onClose} width={380} closeIcon={<X size={18} />} title={record ? `Payslip Line Items — ${record.employeeFullName}` : ''}
      footer={
        <Space style={{ width: '100%' }}>
          <Button style={{ flex: 1 }} onClick={onClose}>Cancel</Button>
          <Button type="primary" style={{ flex: 1 }} loading={mutation.isPending} onClick={() => mutation.mutate()}>Save</Button>
        </Space>
      }
    >
      <Space direction="vertical" style={{ width: '100%' }} size={14}>
        <Text type="secondary" style={{ fontSize: 11 }}>
          These feed directly into the generated payslip PDF's Earnings/Deductions tables. Basic
          earnings and attendance-based deductions are computed automatically and not editable here.
        </Text>
        <Row gutter={[12, 12]}>
          {LINE_ITEM_FIELDS.map(({ key, label }) => (
            <Col span={12} key={key}>
              <Text strong style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>{label} (₹)</Text>
              <Input
                type="number" value={values[key] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
              />
            </Col>
          ))}
        </Row>
      </Space>
    </Drawer>
  );
}

function RejectCorrectionModal({ target, onClose }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');

  useEffect(() => { if (target) setReason(''); }, [target]);

  const mutation = useMutation({
    mutationFn: () => api.post(`/payroll/records/${target.recordId}/correct/${target.correctionId}/reject`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll-records'] });
      toast.success('Correction rejected');
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to reject'),
  });

  return (
    <Modal
      open={!!target} onCancel={onClose} title="Reject Correction Request"
      okText="Reject" okButtonProps={{ danger: true, loading: mutation.isPending, disabled: reason.trim().length < 5 }}
      onOk={() => mutation.mutate()}
    >
      <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>Explain why this correction request is being denied (min 5 characters).</Text>
      <Input.TextArea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for rejection" />
    </Modal>
  );
}

function ImportSalaryModal({ periodId, onClose }) {
  const qc = useQueryClient();
  const [file, setFile] = useState(null);

  useEffect(() => { if (periodId) setFile(null); }, [periodId]);

  const mutation = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append('file', file);
      return api.post(`/payroll/periods/${periodId}/import`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['payroll-periods'] });
      qc.invalidateQueries({ queryKey: ['payroll-records', periodId] });
      const { imported, skipped } = res.data;
      toast.success(`Imported ${imported} record(s)${skipped?.length ? `, skipped ${skipped.length}` : ''}`);
      if (skipped?.length) {
        Modal.warning({
          title: 'Some rows were skipped',
          content: (
            <ul style={{ maxHeight: 200, overflow: 'auto', paddingLeft: 18 }}>
              {skipped.map((s, i) => <li key={i}>Row {s.row}: {s.reason}</li>)}
            </ul>
          ),
        });
      }
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Import failed'),
  });

  return (
    <Modal
      open={!!periodId} onCancel={onClose} title="Import Paid Salaries"
      okText="Import" okButtonProps={{ loading: mutation.isPending, disabled: !file }}
      onOk={() => mutation.mutate()}
    >
      <Space direction="vertical" size={10} style={{ width: '100%' }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          Upload the Excel sheet of salaries already paid for this period. Matches employees by their Employee ID column —
          this marks the period as finalized once imported.
        </Text>
        <input
          type="file" accept=".xlsx,.csv"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
      </Space>
    </Modal>
  );
}

function ImportAttendanceModal({ open, onClose }) {
  const qc = useQueryClient();
  const [file, setFile] = useState(null);

  useEffect(() => { if (open) setFile(null); }, [open]);

  const mutation = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append('file', file);
      return api.post('/attendance/admin/import-sheet', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['payroll-records'] });
      const { employeesImported, daysImported, daysSkipped, employeesNotFound } = res.data;
      const issues = (daysSkipped?.length || 0) + (employeesNotFound?.length || 0);
      toast.success(`Imported ${daysImported} day(s) for ${employeesImported} employee(s)${issues ? `, ${issues} issue(s) — see details` : ''}`);
      if (issues) {
        Modal.warning({
          title: 'Some rows were not imported',
          width: 520,
          content: (
            <ul style={{ maxHeight: 300, overflow: 'auto', paddingLeft: 18 }}>
              {(employeesNotFound || []).map((s, i) => <li key={`nf-${i}`}>Row {s.row}: no employee named "{s.name}"</li>)}
              {(daysSkipped || []).map((s, i) => <li key={`ds-${i}`}>Row {s.row} ({s.name}), {s.date}: {s.reason}</li>)}
            </ul>
          ),
        });
      }
      onClose();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Import failed'),
  });

  return (
    <Modal
      open={open} onCancel={onClose} title="Import Attendance Sheet"
      okText="Import" okButtonProps={{ loading: mutation.isPending, disabled: !file }}
      onOk={() => mutation.mutate()}
    >
      <Space direction="vertical" size={10} style={{ width: '100%' }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          Upload a monthly attendance sheet (one row per employee, one column per calendar day
          — the usual Excel format). Employees are matched by name; each day's status (FD/HD/A/
          WO/H/SL/LWP/C) is written into the matching payroll period automatically. Days that
          already have real punch data are never overwritten.
        </Text>
        <input
          type="file" accept=".xlsx,.csv"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
      </Space>
    </Modal>
  );
}

function PeriodRecords({ periodId, canManage, canFinalize }) {
  const qc = useQueryClient();
  const [correctingRecord, setCorrectingRecord] = useState(null);
  const [rejectingCorrection, setRejectingCorrection] = useState(null);
  const [editingLineItems, setEditingLineItems] = useState(null);

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
    {
      title: 'Slip', key: 'slip', align: 'center',
      render: (_, r) => (
        <Button
          size="small" type="text" icon={<FileDown size={14} />} title="Download Payslip"
          onClick={() => downloadSlip(r._id, `Payslip-${r.employeeCode}.pdf`)}
        />
      ),
    },
    ...(canManage ? [{
      title: 'Actions', key: 'actions', align: 'right',
      render: (_, r) => (
        r.pendingCorrection ? (
          <Space direction="vertical" size={4} align="end">
            <Text style={{ fontSize: 11 }} type="secondary">Pending → {INR(r.pendingCorrection.proposedBasicEarnings)} / {INR(r.pendingCorrection.proposedDeductions)}</Text>
            <Space size={8}>
              <Button
                size="small" type="primary" loading={approveMutation.isPending}
                onClick={() => approveMutation.mutate({ recordId: r._id, correctionId: r.pendingCorrection._id })}
              >
                Approve
              </Button>
              <Button size="small" danger onClick={() => setRejectingCorrection({ recordId: r._id, correctionId: r.pendingCorrection._id })}>Reject</Button>
            </Space>
          </Space>
        ) : (
          <Space size={8}>
            {!r.isFinalized && <Button size="small" onClick={() => setEditingLineItems(r)}>Edit Line Items</Button>}
            <Button size="small" onClick={() => setCorrectingRecord(r)}>Request Correction</Button>
          </Space>
        )
      ),
    }] : []),
  ];

  return (
    <>
      <Card size="small" styles={{ body: { padding: 0 } }} style={{ marginTop: 8 }}>
        <Table rowKey="_id" columns={columns} dataSource={records} loading={isLoading} pagination={false} locale={{ emptyText: <Empty description="No records generated yet" /> }} />
      </Card>
      {canManage && <CorrectionDrawer record={correctingRecord} onClose={() => setCorrectingRecord(null)} />}
      {canManage && <RejectCorrectionModal target={rejectingCorrection} onClose={() => setRejectingCorrection(null)} />}
      {canManage && <LineItemsDrawer record={editingLineItems} onClose={() => setEditingLineItems(null)} />}
    </>
  );
}

export default function Payroll() {
  const qc = useQueryClient();
  const [expandedId, setExpandedId] = useState(null);
  const [newPeriodOpen, setNewPeriodOpen] = useState(false);
  const [salaryOpen, setSalaryOpen] = useState(false);
  const [importingPeriodId, setImportingPeriodId] = useState(null);
  const [importingAttendance, setImportingAttendance] = useState(false);

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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll-periods'] });
      qc.invalidateQueries({ queryKey: ['payroll-records'] });
      toast.success('Period finalized');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to finalize'),
  });

  const reopenMutation = useMutation({
    mutationFn: (periodId) => api.post(`/payroll/periods/${periodId}/reopen`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll-periods'] });
      qc.invalidateQueries({ queryKey: ['payroll-records'] });
      toast.success('Period reopened');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to reopen'),
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
          {p.status === 'FINALIZED' && (
            <Button size="small" icon={<LockOpen size={12} />} loading={reopenMutation.isPending} onClick={() => reopenMutation.mutate(p._id)}>Reopen</Button>
          )}
          <Button size="small" icon={<Upload size={12} />} onClick={() => setImportingPeriodId(p._id)}>Import Paid Salaries</Button>
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
          <Button icon={<Upload size={14} />} onClick={() => setImportingAttendance(true)}>Import Attendance Sheet</Button>
          <Button onClick={() => setSalaryOpen(true)}>Set Employee Salary</Button>
          <Button type="primary" icon={<Plus size={14} />} onClick={() => setNewPeriodOpen(true)}>New Period</Button>
        </Space>
      </div>

      <Alert
        type="info" showIcon style={{ marginBottom: 16 }}
        message="Payroll workflow"
        description="Create the 21st–20th period, generate records after attendance is reviewed, then finalize. Finalized employees can download their payslip. For previously paid salaries, use Import Paid Salaries on the matching period."
      />

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
      <ImportSalaryModal periodId={importingPeriodId} onClose={() => setImportingPeriodId(null)} />
      <ImportAttendanceModal open={importingAttendance} onClose={() => setImportingAttendance(false)} />
    </div>
  );
}
