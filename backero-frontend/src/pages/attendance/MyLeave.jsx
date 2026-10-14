import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarOff } from 'lucide-react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { Button, Card, Col, Empty, Input, Modal, Row, Select, Space, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import HolidaysCard from '../../components/attendance/HolidaysCard';

const { Title, Text } = Typography;
const { TextArea } = Input;

const STATUS_COLOR = { PENDING: 'gold', APPROVED: 'green', REJECTED: 'red', CANCELLED: 'default' };

export default function MyLeave() {
  const qc = useQueryClient();
  const [applyOpen, setApplyOpen] = useState(false);
  const [form, setForm] = useState({ leave_type_id: '', start_date: '', end_date: '', reason: '' });

  const { data: typesData } = useQuery({ queryKey: ['leave-types'], queryFn: () => api.get('/leave/types').then((r) => r.data) });
  const types = typesData?.types || [];

  const { data: balancesData, isLoading: balancesLoading } = useQuery({
    queryKey: ['my-leave-balances'], queryFn: () => api.get('/leave/balances/me').then((r) => r.data),
  });
  const balances = balancesData?.balances || [];

  const { data: requestsData, isLoading: requestsLoading, isError } = useQuery({
    queryKey: ['my-leave-requests'], queryFn: () => api.get('/leave/requests/me').then((r) => r.data), retry: false,
  });
  const requests = requestsData?.requests || [];

  const closeApply = () => { setApplyOpen(false); setForm({ leave_type_id: '', start_date: '', end_date: '', reason: '' }); };

  const applyMutation = useMutation({
    mutationFn: (body) => api.post('/leave/requests', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-leave-requests'] });
      qc.invalidateQueries({ queryKey: ['my-leave-balances'] });
      toast.success('Leave request submitted');
      closeApply();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to submit request'),
  });

  const cancelMutation = useMutation({
    mutationFn: (id) => api.post(`/leave/requests/${id}/cancel`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-leave-requests'] });
      qc.invalidateQueries({ queryKey: ['my-leave-balances'] });
      toast.success('Leave request cancelled');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to cancel'),
  });

  const columns = [
    { title: 'Type', key: 'type', render: (_, r) => r.leaveTypeId?.name || '—' },
    { title: 'From', dataIndex: 'startDate', key: 'startDate', render: (v) => dayjs(v).format('DD MMM YYYY') },
    { title: 'To', dataIndex: 'endDate', key: 'endDate', render: (v) => dayjs(v).format('DD MMM YYYY') },
    { title: 'Days', dataIndex: 'workingDays', key: 'workingDays', align: 'center' },
    { title: 'Reason', dataIndex: 'reason', key: 'reason', ellipsis: true },
    { title: 'Status', dataIndex: 'status', key: 'status', align: 'center', render: (v) => <Tag color={STATUS_COLOR[v]}>{v}</Tag> },
    {
      title: '', key: 'actions', align: 'right',
      render: (_, r) => (r.status === 'PENDING' || r.status === 'APPROVED') ? (
        <Button size="small" danger loading={cancelMutation.isPending} onClick={() => cancelMutation.mutate(r._id)}>Cancel</Button>
      ) : null,
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title level={4} style={{ marginBottom: 0 }}>My Leave</Title>
          <Text type="secondary">Your leave balance and requests</Text>
        </div>
        <Button type="primary" onClick={() => setApplyOpen(true)}>Apply for Leave</Button>
      </div>

      {isError ? (
        <Card><Empty description="No employee profile is linked to your account yet — contact HR." /></Card>
      ) : (
        <>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            {balancesLoading ? <Col span={24}><Card loading size="small" /></Col> : balances.length === 0 ? (
              <Col span={24}><Card size="small"><Text type="secondary">No leave balance set yet — contact HR.</Text></Card></Col>
            ) : balances.map((b) => (
              <Col span={8} key={b._id}>
                <Card size="small">
                  <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>{b.leaveTypeId?.name}</Text>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{b.totalDays - b.usedDays}<Text type="secondary" style={{ fontSize: 13, fontWeight: 400 }}> / {b.totalDays} days left</Text></div>
                </Card>
              </Col>
            ))}
          </Row>

          <div style={{ marginBottom: 16 }}>
            <HolidaysCard />
          </div>

          <Card styles={{ body: { padding: 0 } }}>
            <Table
              rowKey="_id" columns={columns} dataSource={requests} loading={requestsLoading} pagination={false}
              locale={{ emptyText: <Empty image={<CalendarOff size={36} color="#d1d5db" style={{ margin: '0 auto' }} />} description="No leave requests yet" /> }}
            />
          </Card>
        </>
      )}

      <Modal open={applyOpen} onCancel={closeApply} footer={null} title="Apply for Leave" destroyOnClose>
        <Space direction="vertical" style={{ width: '100%', marginTop: 16 }} size={12}>
          <div>
            <Text style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Leave Type</Text>
            <Select
              style={{ width: '100%' }} placeholder="Select…" value={form.leave_type_id || undefined}
              onChange={(v) => setForm((f) => ({ ...f, leave_type_id: v }))}
              options={types.map((t) => ({ label: t.name, value: t._id }))}
            />
          </div>
          <Row gutter={8}>
            <Col span={12}>
              <Text style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>From</Text>
              <Input type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} />
            </Col>
            <Col span={12}>
              <Text style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>To</Text>
              <Input type="date" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} />
            </Col>
          </Row>
          <TextArea rows={3} placeholder="Reason" value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
          <Space style={{ width: '100%' }}>
            <Button style={{ flex: 1 }} onClick={closeApply}>Cancel</Button>
            <Button
              style={{ flex: 1 }} type="primary" loading={applyMutation.isPending}
              disabled={!form.leave_type_id || !form.start_date || !form.end_date || form.reason.trim().length < 3}
              onClick={() => applyMutation.mutate(form)}
            >
              Submit
            </Button>
          </Space>
        </Space>
      </Modal>
    </div>
  );
}
