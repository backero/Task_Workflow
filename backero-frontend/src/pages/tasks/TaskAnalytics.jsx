import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Card, Col, Row, Statistic, Typography } from 'antd';
import api from '../../api/axios';

const { Title } = Typography;

const COLORS = ['#3b82f6', '#22c55e', '#f97316', '#ef4444', '#9333ea', '#06b6d4', '#f59e0b', '#ec4899'];

export default function TaskAnalytics() {
  const { data } = useQuery({
    queryKey: ['tasks', 'analytics'],
    queryFn: () => api.get('/tasks/analytics').then((r) => r.data.analytics),
  });

  const statusData = (data?.statusBreakdown || []).map((s) => ({ name: s._id, value: s.count }));
  const deptData = (data?.departmentBreakdown || []).map((d) => ({ name: d._id?.substring(0, 10), completed: d.completed, total: d.count }));

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Task Analytics</Title>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card><Statistic title="Total Tasks" value={data?.totalTasks || 0} /></Card>
        </Col>
        <Col span={8}>
          <Card><Statistic title="Completed" value={data?.completedTasks || 0} /></Card>
        </Col>
        <Col span={8}>
          <Card><Statistic title="Completion Rate" value={data?.completionRate || 0} suffix="%" /></Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Card title="Status Breakdown">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}>
                  {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col span={12}>
          <Card title="Department Performance">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={deptData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="completed" fill="#22c55e" name="Completed" radius={[4, 4, 0, 0]} />
                <Bar dataKey="total" fill="#3b82f6" name="Total" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
