import React from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/axios';

const RD_STAGES = ['Research', 'Sample Preparation', 'Testing', 'Review', 'Approval', 'Production Transfer'];

export default function RnDDept() {
  const { data } = useQuery({
    queryKey: ['tasks', 'rnd'],
    queryFn: () => api.get('/tasks?department=R%26D&limit=50').then((r) => r.data),
  });

  const tasks = data?.data || [];

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title" style={{ color: '#06b6d4' }}>R&D Department</h1>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        {RD_STAGES.map((stage) => {
          const count = tasks.filter((t) => t.taskType === stage).length;
          return (
            <div key={stage} className="card p-3 text-center bg-cyan-50 dark:bg-cyan-900/20">
              <p className="text-2xl font-bold text-cyan-700 dark:text-cyan-400">{count}</p>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{stage}</p>
            </div>
          );
        })}
      </div>
      <div className="card p-5">
        <h3 className="section-title">R&D Tasks</h3>
        <div className="space-y-2">
          {tasks.map((task) => (
            <div key={task._id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-sm">
              <span className="w-2 h-2 rounded-full bg-cyan-500" />
              <span className="flex-1 text-gray-900 dark:text-white">{task.title}</span>
              <span className="badge badge-blue text-xs">{task.status}</span>
            </div>
          ))}
          {tasks.length === 0 && <p className="text-gray-400 text-sm text-center py-4">No R&D tasks</p>}
        </div>
      </div>
    </div>
  );
}
