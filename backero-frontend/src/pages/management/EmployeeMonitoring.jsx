import React from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/axios';
import { formatDistanceToNow } from 'date-fns';

export default function EmployeeMonitoring() {
  const { data } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users?limit=50').then((r) => r.data),
  });

  const users = data?.data || [];

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">Employee Monitoring</h1>
        <p className="text-gray-500 text-sm">{users.length} employees</p>
      </div>
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-[#0f1a2e]">
            <tr>
              <th className="text-left py-3 px-4 text-gray-500 font-medium">Employee</th>
              <th className="text-left py-3 px-4 text-gray-500 font-medium">Department</th>
              <th className="text-center py-3 px-4 text-gray-500 font-medium">Role</th>
              <th className="text-center py-3 px-4 text-gray-500 font-medium">Status</th>
              <th className="text-right py-3 px-4 text-gray-500 font-medium">Last Active</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-[#1b2e4a]">
            {users.map((user) => (
              <tr key={user._id} className="hover:bg-gray-50 dark:hover:bg-[#17263d]/50">
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center">
                      <span className="text-brand-700 dark:text-brand-400 text-xs font-semibold">{user.firstName?.[0]}{user.lastName?.[0]}</span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{user.firstName} {user.lastName}</p>
                      <p className="text-xs text-gray-400">{user.email}</p>
                    </div>
                  </div>
                </td>
                <td className="py-3 px-4 text-gray-600 dark:text-gray-400">{user.department || '—'}</td>
                <td className="py-3 px-4 text-center">
                  <span className="badge badge-blue capitalize">{user.role?.replace('_', ' ')}</span>
                </td>
                <td className="py-3 px-4 text-center">
                  <span className={`badge ${user.isActive ? 'badge-green' : 'badge-gray'}`}>{user.isActive ? 'Active' : 'Inactive'}</span>
                </td>
                <td className="py-3 px-4 text-right text-gray-400 text-xs">
                  {user.lastActive ? formatDistanceToNow(new Date(user.lastActive), { addSuffix: true }) : 'Never'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
