import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck, Pencil, Check, X } from 'lucide-react';
import api from '../../api/axios';
import toast from 'react-hot-toast';
import { Button, Card, Col, Empty, Input, Row, Space, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { usePermissions } from '../../store/usePermissions';

const { Title, Text } = Typography;
const { TextArea } = Input;

const STATUS_COLOR = {
  PRESENT: 'green', ABSENT: 'red', LATE: 'gold', HALF_DAY: 'orange',
  ON_LEAVE: 'blue', HOLIDAY: 'purple', WEEK_OFF: 'default', MISSING_PUNCH: 'red', INCOMPLETE: 'volcano',
};

function ProfileCard() {
  const qc = useQueryClient();
  const [editingPhone, setEditingPhone] = useState(false);
  const [phone, setPhone] = useState('');

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['my-employee'],
    queryFn: () => api.get('/employees/me').then((r) => r.data),
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: (p) => api.patch('/employees/me', { phone: p }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['my-employee'] }); toast.success('Phone updated'); setEditingPhone(false); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to update'),
  });

  if (isLoading) return <Card size="small" loading />;
  if (isError) {
    return (
      <Card size="small">
        <Empty description={error.response?.data?.message || 'No employee profile is linked to your account yet — contact HR.'} />
      </Card>
    );
  }

  const employee = data.employee;
  return (
    <Card size="small">
      <Row gutter={16}>
        <Col span={6}><Text type="secondary" style={{ fontSize: 12 }}>Employee Code</Text><div><Text strong>{employee.employeeCode}</Text></div></Col>
        <Col span={6}><Text type="secondary" style={{ fontSize: 12 }}>Category</Text><div><Tag color={employee.category === 'FIELD' ? 'blue' : 'default'}>{employee.category}</Tag></div></Col>
        <Col span={6}><Text type="secondary" style={{ fontSize: 12 }}>Joined</Text><div><Text>{employee.dateOfJoining ? dayjs(employee.dateOfJoining).format('DD MMM YYYY') : '—'}</Text></div></Col>
        <Col span={6}>
          <Text type="secondary" style={{ fontSize: 12 }}>Phone</Text>
          {editingPhone ? (
            <Space size={4}>
              <Input size="small" value={phone} onChange={(e) => setPhone(e.target.value)} style={{ width: 120 }} />
              <Button size="small" type="primary" icon={<Check size={12} />} loading={mutation.isPending} onClick={() => mutation.mutate(phone)} />
              <Button size="small" icon={<X size={12} />} onClick={() => setEditingPhone(false)} />
            </Space>
          ) : (
            <div>
              <Text>{employee.phone || '—'}</Text>
              <Button type="text" size="small" icon={<Pencil size={12} />} onClick={() => { setPhone(employee.phone || ''); setEditingPhone(true); }} />
            </div>
          )}
        </Col>
      </Row>
    </Card>
  );
}

export default function MyAttendance() {
  const { hasPermission } = usePermissions();
  const [correctingId, setCorrectingId] = useState(null);
  const [reason, setReason] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['my-attendance'],
    queryFn: () => api.get('/attendance/me').then((r) => r.data),
    retry: false,
  });
  const rows = data?.attendance || [];

  const correctMutation = useMutation({
    mutationFn: ({ attendanceId, body }) => api.post(`/attendance/${attendanceId}/correct`, body),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['my-attendance'] });
      toast.success(res.data.correction ? 'Correction submitted for approval' : 'Correction applied');
      setCorrectingId(null); setReason(''); setCheckIn(''); setCheckOut('');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to request correction'),
  });

  const columns = [
    { title: 'Date', dataIndex: 'attendanceDate', key: 'attendanceDate', render: (v) => dayjs(v).format('DD MMM YYYY') },
    { title: 'Status', dataIndex: 'status', key: 'status', align: 'center', render: (v) => <Tag color={STATUS_COLOR[v] || 'default'}>{v || 'NO RECORD'}</Tag> },
    { title: 'Check-in', dataIndex: 'checkIn', key: 'checkIn', render: (v) => v ? dayjs(v).format('HH:mm') : '—' },
    { title: 'Check-out', dataIndex: 'checkOut', key: 'checkOut', render: (v) => v ? dayjs(v).format('HH:mm') : '—' },
    ...(hasPermission('attendance:correct') ? [{
      title: '', key: 'actions', align: 'right',
      render: (_, r) => <Button size="small" onClick={() => setCorrectingId(correctingId === r._id ? null : r._id)}>Request Correction</Button>,
    }] : []),
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 0 }}>My Attendance</Title>
      <Text type="secondary">Your own attendance history</Text>

      <div style={{ marginTop: 16, marginBottom: 16 }}><ProfileCard /></div>

      {isError ? (
        <Card><Empty description="No employee profile is linked to your account yet — contact HR." /></Card>
      ) : (
        <Card styles={{ body: { padding: 0 } }}>
          <Table
            rowKey="_id" columns={columns} dataSource={rows} loading={isLoading} pagination={false}
            locale={{ emptyText: <Empty image={<ClipboardCheck size={36} color="#d1d5db" style={{ margin: '0 auto' }} />} description="No attendance records yet" /> }}
            expandable={{
              expandedRowKeys: correctingId ? [correctingId] : [],
              expandIcon: () => null,
              expandedRowRender: (r) => (
                <Card size="small" style={{ maxWidth: 480 }}>
                  <Row gutter={8} style={{ marginBottom: 8 }}>
                    <Col span={12}>
                      <Text style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>New Check-in</Text>
                      <Input type="datetime-local" size="small" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
                    </Col>
                    <Col span={12}>
                      <Text style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>New Check-out</Text>
                      <Input type="datetime-local" size="small" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
                    </Col>
                  </Row>
                  <TextArea rows={2} placeholder="Reason (min 5 characters)" value={reason} onChange={(e) => setReason(e.target.value)} style={{ marginBottom: 8 }} />
                  <Button
                    size="small" type="primary" loading={correctMutation.isPending}
                    disabled={reason.trim().length < 5 || (!checkIn && !checkOut)}
                    onClick={() => correctMutation.mutate({ attendanceId: r._id, body: { reason, check_in: checkIn || undefined, check_out: checkOut || undefined } })}
                  >
                    Submit
                  </Button>
                </Card>
              ),
            }}
          />
        </Card>
      )}
    </div>
  );
}
