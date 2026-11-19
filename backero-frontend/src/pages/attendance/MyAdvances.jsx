import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BanknoteArrowDown, CircleDollarSign, Plus } from 'lucide-react';
import { Alert, Button, Card, Col, Empty, Input, InputNumber, Modal, Row, Space, Statistic, Table, Tag, Typography } from 'antd';
import api from '../../api/axios';
import toast from 'react-hot-toast';

const { Title, Text, Paragraph } = Typography;
const money = (amount) => `₹${Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const statusColor = { PENDING: 'gold', APPROVED: 'green', REJECTED: 'red', CLOSED: 'blue' };
const field = (row, ...keys) => keys.map((key) => row?.[key]).find((value) => value !== undefined && value !== null);

export default function MyAdvances() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(null);
  const [reason, setReason] = useState('');
  const { data, isLoading, isError } = useQuery({ queryKey: ['my-advances'], queryFn: () => api.get('/advances/me').then((r) => r.data), retry: false });
  const advances = data?.advances || data?.data || [];
  const active = advances.filter((advance) => ['PENDING', 'APPROVED'].includes(field(advance, 'status')));
  const outstanding = advances.reduce((total, advance) => total + Number(field(advance, 'remainingBalance', 'remaining_balance') || 0), 0);
  const request = useMutation({
    mutationFn: () => api.post('/advances/me', { amount, reason }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['my-advances'] }); toast.success('Advance request submitted for approval'); setOpen(false); setAmount(null); setReason(''); },
    onError: (error) => toast.error(error.response?.data?.message || 'Could not submit advance request'),
  });
  const columns = [
    { title: 'Requested', key: 'requested', render: (_, row) => <Text strong>{money(field(row, 'requestedAmount', 'requested_amount', 'amount'))}</Text> },
    { title: 'Approved', key: 'approved', render: (_, row) => money(field(row, 'approvedAmount', 'approved_amount')) },
    { title: 'Monthly recovery', key: 'recovery', render: (_, row) => money(field(row, 'monthlyInstallment', 'monthly_installment')) },
    { title: 'Remaining', key: 'remaining', render: (_, row) => <Text>{money(field(row, 'remainingBalance', 'remaining_balance'))}</Text> },
    { title: 'Status', dataIndex: 'status', render: (status) => <Tag color={statusColor[status] || 'default'}>{status || 'PENDING'}</Tag> },
  ];
  return <main style={{ maxWidth: 1200, margin: '0 auto' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}><div><Text type="secondary" style={{ letterSpacing: 1, fontSize: 11 }}>PAYROLL / EMPLOYEE SELF SERVICE</Text><Title level={3} style={{ margin: '3px 0 4px' }}>Salary Advance</Title><Text type="secondary">Request an advance and follow its approval and monthly recovery.</Text></div><Button type="primary" icon={<Plus size={15} />} onClick={() => setOpen(true)}>Request advance</Button></div>
    <Alert type="info" showIcon style={{ marginBottom: 16 }} message="Recovery begins only after approval" description="An approved advance is deducted from salary when the applicable payroll period is finalized. Pending requests do not affect your salary." />
    <Row gutter={[12, 12]} style={{ marginBottom: 16 }}><Col xs={24} sm={12}><Card size="small" style={{ borderTop: '3px solid #4b7320' }}><Statistic title="Active requests" value={active.length} prefix={<CircleDollarSign size={18} color="#4b7320" />} /></Card></Col><Col xs={24} sm={12}><Card size="small" style={{ borderTop: '3px solid #c47a13' }}><Statistic title="Outstanding recovery" value={outstanding} precision={2} prefix="₹" /></Card></Col></Row>
    <Card styles={{ body: { padding: 0 } }}>{isError ? <Empty style={{ padding: 36 }} description="Your advance history could not be loaded. Please try again later." /> : <Table rowKey={(row) => row._id || row.id} loading={isLoading} columns={columns} dataSource={advances} scroll={{ x: 700 }} pagination={false} locale={{ emptyText: <Empty image={<BanknoteArrowDown size={36} color="#c7d2be" style={{ margin: '0 auto' }} />} description="No salary advance requests yet" /> }} />}</Card>
    <Modal open={open} title="Request salary advance" onCancel={() => setOpen(false)} okText="Send for approval" okButtonProps={{ loading: request.isPending, disabled: !amount || reason.trim().length < 5 }} onOk={() => request.mutate()} destroyOnClose><Space direction="vertical" size={12} style={{ width: '100%', marginTop: 10 }}><Paragraph type="secondary" style={{ margin: 0 }}>Enter the requested amount and why you need it. An administrator decides the approved amount and monthly recovery.</Paragraph><div><Text strong>Amount</Text><InputNumber aria-label="Advance amount" min={1} value={amount} onChange={setAmount} style={{ width: '100%', marginTop: 5 }} prefix="₹" /></div><div><Text strong>Reason</Text><Input.TextArea aria-label="Advance reason" rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Brief reason for this request" style={{ marginTop: 5 }} /></div></Space></Modal>
  </main>;
}
