import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Receipt } from 'lucide-react';
import api from '../../api/axios';
import { Card, Empty, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const INR = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function MyPayroll() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['my-payroll'],
    queryFn: () => api.get('/payroll/records/me').then((r) => r.data),
    retry: false,
  });
  const records = data?.records || [];

  const columns = [
    { title: 'Basic Earnings', dataIndex: 'basicEarnings', key: 'basicEarnings', align: 'right', render: INR },
    { title: 'Deductions', dataIndex: 'deductions', key: 'deductions', align: 'right', render: INR },
    { title: 'Net Salary', dataIndex: 'netSalary', key: 'netSalary', align: 'right', render: (v) => <Text strong>{INR(v)}</Text> },
    { title: 'Status', dataIndex: 'isFinalized', key: 'isFinalized', align: 'center', render: (v) => <Tag color={v ? 'green' : 'default'}>{v ? 'Finalized' : 'Draft'}</Tag> },
    { title: 'Generated', dataIndex: 'createdAt', key: 'createdAt', render: (v) => v ? dayjs(v).format('DD MMM YYYY') : '—' },
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 0 }}>My Payroll</Title>
      <Text type="secondary">Your own payslip history</Text>

      <div style={{ marginTop: 16 }}>
        {isError ? (
          <Card><Empty description="No employee profile is linked to your account yet — contact HR." /></Card>
        ) : (
          <Card styles={{ body: { padding: 0 } }}>
            <Table
              rowKey="_id" columns={columns} dataSource={records} loading={isLoading} pagination={false}
              locale={{ emptyText: <Empty image={<Receipt size={36} color="#d1d5db" style={{ margin: '0 auto' }} />} description="No payroll records yet" /> }}
            />
          </Card>
        )}
      </div>
    </div>
  );
}
