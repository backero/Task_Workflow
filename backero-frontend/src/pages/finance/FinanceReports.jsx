import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Card, Typography } from 'antd';
import api from '../../api/axios';

const { Title } = Typography;

export default function FinanceReports() {
  const { data } = useQuery({
    queryKey: ['finance', 'reports'],
    queryFn: () => api.get('/reports/financial-summary').then((r) => r.data.report),
  });

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const chartData = MONTHS.map((month, i) => {
    const income = data?.monthlyData?.find((d) => d._id?.month === i + 1 && d._id?.type === 'income')?.total || 0;
    const expense = data?.monthlyData?.find((d) => d._id?.month === i + 1 && d._id?.type === 'expense')?.total || 0;
    return { month, income, expense, profit: income - expense };
  });

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>Financial Reports</Title>
      <Card title={`Monthly P&L — ${data?.year || new Date().getFullYear()}`}>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
            <Tooltip formatter={(v) => `₹${v.toLocaleString('en-IN')}`} />
            <Legend />
            <Bar dataKey="income" fill="#22c55e" name="Income" radius={[4, 4, 0, 0]} />
            <Bar dataKey="expense" fill="#ef4444" name="Expense" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}
