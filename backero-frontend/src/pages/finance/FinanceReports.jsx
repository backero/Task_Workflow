import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import api from '../../api/axios';

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
    <div className="space-y-6">
      <div className="page-header"><h1 className="page-title">Financial Reports</h1></div>
      <div className="card p-6">
        <h3 className="section-title">Monthly P&L - {data?.year || new Date().getFullYear()}</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} />
            <Tooltip formatter={(v) => `₹${v.toLocaleString('en-IN')}`} />
            <Legend />
            <Bar dataKey="income" fill="#22c55e" name="Income" radius={[4, 4, 0, 0]} />
            <Bar dataKey="expense" fill="#ef4444" name="Expense" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
