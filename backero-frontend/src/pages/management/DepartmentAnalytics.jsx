import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../../api/axios';

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
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">Department Analytics</h1>
      </div>
      <div className="card p-6">
        <h3 className="section-title">Task Breakdown by Department</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="completed" fill="#22c55e" name="Completed" radius={[4, 4, 0, 0]} />
            <Bar dataKey="overdue" fill="#ef4444" name="Overdue" radius={[4, 4, 0, 0]} />
            <Bar dataKey="pending" fill="#3b82f6" name="Pending" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {(data || []).map((dept) => (
          <div key={dept._id} className="card p-4">
            <h4 className="font-semibold text-gray-900 dark:text-white mb-3">{dept._id}</h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Total</span><span className="font-medium">{dept.total}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Completed</span><span className="font-medium text-green-600">{dept.completed}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Overdue</span><span className="font-medium text-red-600">{dept.overdue}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Rate</span><span className="font-bold text-brand-600">{Math.round(dept.completionRate || 0)}%</span></div>
            </div>
            <div className="mt-3 h-2 bg-gray-100 dark:bg-[#0f1a2e] rounded-full overflow-hidden">
              <div className="h-full bg-brand-500 rounded-full" style={{ width: `${dept.completionRate || 0}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
