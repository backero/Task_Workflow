import React from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/axios';
import { formatDistanceToNow } from 'date-fns';
import { Avatar, Card, Space, Table, Tag, Typography } from 'antd';

const { Title, Text } = Typography;

export default function EmployeeMonitoring() {
  const { data } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users?limit=50').then((r) => r.data),
  });

  const users = data?.data || [];

  const columns = [
    {
      title: 'Employee', key: 'employee',
      render: (_, user) => (
        <Space>
          <Avatar style={{ backgroundColor: '#669c2c1f', color: '#669c2c' }}>{user.firstName?.[0]}{user.lastName?.[0]}</Avatar>
          <div>
            <div><Text strong>{user.firstName} {user.lastName}</Text></div>
            <Text type="secondary" style={{ fontSize: 12 }}>{user.email}</Text>
          </div>
        </Space>
      ),
    },
    { title: 'Department', dataIndex: 'department', key: 'department', render: (v) => v || '—' },
    { title: 'Role', dataIndex: 'role', key: 'role', align: 'center', render: (v) => <Tag color="blue">{v?.replace('_', ' ')}</Tag> },
    { title: 'Status', dataIndex: 'isActive', key: 'isActive', align: 'center', render: (v) => <Tag color={v ? 'green' : 'default'}>{v ? 'Active' : 'Inactive'}</Tag> },
    {
      title: 'Last Active', dataIndex: 'lastActive', key: 'lastActive', align: 'right',
      render: (v) => <Text type="secondary" style={{ fontSize: 12 }}>{v ? formatDistanceToNow(new Date(v), { addSuffix: true }) : 'Never'}</Text>,
    },
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 0 }}>Team Status</Title>
      <Text type="secondary">{users.length} team members — online status &amp; last active</Text>
      <Card style={{ marginTop: 16 }} styles={{ body: { padding: 0 } }}>
        <Table rowKey="_id" columns={columns} dataSource={users} pagination={false} />
      </Card>
    </div>
  );
}
