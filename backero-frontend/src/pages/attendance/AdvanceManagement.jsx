import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, HandCoins, X } from 'lucide-react';
import { Alert, Button, Card, Empty, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Tag, Typography } from 'antd';
import api from '../../api/axios';
import toast from 'react-hot-toast';

const { Title, Text } = Typography;
const money = (amount) => `₹${Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const statusColor = { PENDING: 'gold', APPROVED: 'green', REJECTED: 'red', CLOSED: 'blue' };
const field = (row, ...keys) => keys.map((key) => row?.[key]).find((value) => value !== undefined && value !== null);

export default function AdvanceManagement() {
  const queryClient = useQueryClient(); const [status, setStatus] = useState('PENDING'); const [target, setTarget] = useState(null); const [approvedAmount, setApprovedAmount] = useState(null); const [installment, setInstallment] = useState(null); const [note, setNote] = useState('');
  const { data, isLoading, isError } = useQuery({ queryKey: ['advances', status], queryFn: () => api.get('/advances', { params: { status: status || undefined } }).then((r) => r.data) });
  const advances = data?.advances || data?.data || [];
  const close = () => { setTarget(null); setApprovedAmount(null); setInstallment(null); setNote(''); };
  const decision = useMutation({ mutationFn: ({ action }) => api.post(`/advances/${target._id || target.id}/decision`, action === 'APPROVED' ? { decision: action, approved_amount: approvedAmount, monthly_installment: installment, note } : { decision: action, note }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['advances'] }); toast.success('Advance decision saved'); close(); }, onError: (error) => toast.error(error.response?.data?.message || 'Could not save decision') });
  const openApprove = (advance) => { setTarget(advance); setApprovedAmount(field(advance, 'requestedAmount', 'requested_amount', 'amount')); setInstallment(null); setNote(''); };
  const columns = [
    { title: 'Employee', key: 'employee', render: (_, row) => field(row, 'employeeName', 'employee_name') || row.employeeId?.fullName || '—' },
    { title: 'Requested', key: 'requested', render: (_, row) => <Text strong>{money(field(row, 'requestedAmount', 'requested_amount', 'amount'))}</Text> },
    { title: 'Reason', dataIndex: 'reason', ellipsis: true },
    { title: 'Recovery / balance', key: 'recovery', render: (_, row) => <span>{money(field(row, 'monthlyInstallment', 'monthly_installment'))} / {money(field(row, 'remainingBalance', 'remaining_balance'))}</span> },
    { title: 'Status', dataIndex: 'status', render: (value) => <Tag color={statusColor[value] || 'default'}>{value}</Tag> },
    { title: 'Decision', key: 'decision', render: (_, row) => row.status === 'PENDING' ? <Space><Button size="small" type="primary" icon={<Check size={13} />} onClick={() => openApprove(row)}>Approve</Button><Popconfirm title="Reject this advance request?" description="The employee will be notified of the decision." okText="Reject" okButtonProps={{ danger: true }} onConfirm={() => { setTarget(row); decision.mutate({ action: 'REJECTED' }); }}><Button size="small" danger icon={<X size={13} />}>Reject</Button></Popconfirm></Space> : '—' },
  ];
  return <main style={{ maxWidth: 1400, margin: '0 auto' }}><div style={{ marginBottom: 18 }}><Text type="secondary" style={{ letterSpacing: 1, fontSize: 11 }}>PAYROLL CONTROL / ADVANCES</Text><Title level={3} style={{ margin: '3px 0 4px' }}>Advance & Recovery</Title><Text type="secondary">Approve employee salary advances and set a clear monthly recovery amount.</Text></div><Alert type="info" showIcon style={{ marginBottom: 16 }} message="Payroll-safe recovery" description="Approval records the approved amount and instalment. Deductions are applied when a payroll period is finalized, not at request time." /><Card styles={{ body: { padding: 0 } }} title={<Space><HandCoins size={17} color="#4b7320" /><span>Requests</span></Space>} extra={<Select value={status} onChange={setStatus} style={{ width: 150 }} options={['PENDING', 'APPROVED', 'REJECTED', 'CLOSED'].map((value) => ({ value, label: value }))} allowClear placeholder="All statuses" />}>{isError ? <Empty style={{ padding: 36 }} description="Advance requests could not be loaded." /> : <Table rowKey={(row) => row._id || row.id} loading={isLoading} columns={columns} dataSource={advances} scroll={{ x: 900 }} pagination={false} locale={{ emptyText: <Empty description="No advance requests for this filter" /> }} />}</Card><Modal open={!!target} title="Approve salary advance" onCancel={close} okText="Confirm approval" okButtonProps={{ loading: decision.isPending, disabled: !approvedAmount || !installment }} onOk={() => decision.mutate({ action: 'APPROVED' })}><Space direction="vertical" style={{ width: '100%', marginTop: 8 }}><Text type="secondary">Confirm the approved amount and the monthly salary deduction before approval.</Text><div><Text strong>Approved amount</Text><InputNumber min={1} value={approvedAmount} onChange={setApprovedAmount} prefix="₹" style={{ width: '100%', marginTop: 5 }} /></div><div><Text strong>Monthly recovery</Text><InputNumber min={1} value={installment} onChange={setInstallment} prefix="₹" style={{ width: '100%', marginTop: 5 }} /></div><Input.TextArea rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional payroll note" /></Space></Modal></main>;
}
