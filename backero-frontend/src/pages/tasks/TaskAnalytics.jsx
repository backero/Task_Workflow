import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import api from '../../api/axios';

const COLORS = ['#3b82f6', '#22c55e', '#f97316', '#ef4444', '#9333ea', '#06b6d4', '#f59e0b', '#ec4899'];

export default function TaskAnalytics() {
  const { data } = useQuery({
    queryKey: ['tasks', 'analytics'],
    queryFn: () => api.get('/tasks/analytics').then((r) => r.data.analytics),
  });

  const statusData = (data?.statusBreakdown || []).map((s) => ({ name: s._id, value: s.count }));
  const deptData = (data?.departmentBreakdown || []).map((d) => ({ name: d._id?.substring(0, 10), completed: d.completed, total: d.count }));

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">Task Analytics</h1>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Tasks', value: data?.totalTasks || 0 },
          { label: 'Completed', value: data?.completedTasks || 0 },
          { label: 'Completion Rate', value: `${data?.completionRate || 0}%` },
        ].map((s) => (
          <div key={s.label} className="card p-5 text-center">
            <p className="text-3xl font-bold text-gray-900 dark:text-white">{s.value}</p>
            <p className="text-sm text-gray-500">{s.label}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <h3 className="section-title">Status Breakdown</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart><Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}>
              {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie><Tooltip /><Legend /></PieChart>
          </ResponsiveContainer>
        </div>
        <div className="card p-5">
          <h3 className="section-title">Department Performance</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={deptData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="completed" fill="#22c55e" name="Completed" radius={[4, 4, 0, 0]} />
              <Bar dataKey="total" fill="#3b82f6" name="Total" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
