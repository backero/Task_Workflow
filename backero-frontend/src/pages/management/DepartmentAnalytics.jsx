import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, Col, Progress, Row, Typography } from 'antd';
import api from '../../api/axios';

const { Title, Text } = Typography;

export default function DepartmentAnalytics() {
  const { data } = useQuery({
    queryKey: ['reports', 'dept-productivity'],
    queryFn: () => api.get('/reports/department-productivity').then((r) => r.data.report),
  });

  const chartData = (data || []).map((d) => ({
    name: (d._id || 'Unknown').substring(0, 10),
    completed: d.completed,
    overdue: d.overdue,
    pending: d.pending,
    rate: Math.round(d.completionRate || 0),
  }));

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Department Analytics</Title>
      <Card title="Task Breakdown by Department" style={{ marginBottom: 16 }}>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="completed" fill="#22c55e" name="Completed" radius={[4, 4, 0, 0]} />
            <Bar dataKey="overdue" fill="#ef4444" name="Overdue" radius={[4, 4, 0, 0]} />
            <Bar dataKey="pending" fill="#3b82f6" name="Pending" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>
      <Row gutter={[16, 16]}>
        {(data || []).map((dept) => (
          <Col xs={24} lg={8} key={dept._id}>
            <Card>
              <Text strong style={{ display: 'block', marginBottom: 12 }}>{dept._id}</Text>
              <DeptStatRows dept={dept} />
              <Progress percent={dept.completionRate || 0} showInfo={false} style={{ marginTop: 12 }} />
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
}

function DeptStatRows({ dept }) {
  return (
    <div style={{ fontSize: 13 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}><Text type="secondary">Total</Text><Text strong>{dept.total}</Text></div>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}><Text type="secondary">Completed</Text><Text strong style={{ color: '#16a34a' }}>{dept.completed}</Text></div>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}><Text type="secondary">Overdue</Text><Text strong type="danger">{dept.overdue}</Text></div>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}><Text type="secondary">Rate</Text><Text strong style={{ color: '#669c2c' }}>{Math.round(dept.completionRate || 0)}%</Text></div>
    </div>
  );
}
