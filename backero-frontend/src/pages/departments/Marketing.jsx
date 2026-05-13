import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { PlusIcon } from '@heroicons/react/24/outline';
import api from '../../api/axios';

export default function MarketingDept() {
  const { data } = useQuery({
    queryKey: ['marketing', 'campaigns'],
    queryFn: () => api.get('/marketing/campaigns?limit=10').then((r) => r.data),
  });

  const { data: tasksData } = useQuery({
    queryKey: ['tasks', 'marketing'],
    queryFn: () => api.get('/tasks?department=Marketing&limit=20').then((r) => r.data),
  });

  const campaigns = data?.data || [];
  const tasks = tasksData?.data || [];

  const STATUS_FLOW = ['Idea', 'Script', 'Design', 'Review', 'Scheduled', 'Published'];

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ color: '#9333ea' }}>Marketing Department</h1>
          <p className="text-gray-500 text-sm">Campaign & Content Execution</p>
        </div>
        <Link to="/tasks/kanban?department=Marketing" className="btn-primary" style={{ background: '#9333ea' }}>
          <PlusIcon className="w-4 h-4" /> New Campaign Task
        </Link>
      </div>

      {/* Campaign pipeline */}
      <div className="card p-5">
        <h3 className="section-title">Campaign Pipeline</h3>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {STATUS_FLOW.map((stage) => {
            const stageCampaigns = campaigns.filter((c) => c.status === stage);
            return (
              <div key={stage} className="flex-shrink-0 w-44">
                <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-3 min-h-32">
                  <p className="text-xs font-semibold text-purple-700 dark:text-purple-400 mb-2">{stage} ({stageCampaigns.length})</p>
                  {stageCampaigns.map((c) => (
                    <div key={c._id} className="bg-white dark:bg-gray-900 rounded-lg p-2 mb-2 text-xs border border-purple-100">
                      <p className="font-medium text-gray-900 dark:text-white truncate">{c.name}</p>
                      <p className="text-gray-400">{c.platform}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Department tasks */}
      <div className="card p-5">
        <h3 className="section-title">Recent Tasks</h3>
        <div className="space-y-2">
          {tasks.slice(0, 8).map((task) => (
            <div key={task._id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-sm">
              <span className="w-2 h-2 rounded-full bg-purple-500 flex-shrink-0" />
              <span className="flex-1 text-gray-900 dark:text-white">{task.title}</span>
              <span className="text-gray-400">{task.assignedTo?.firstName}</span>
              <span className="badge badge-purple text-xs">{task.status}</span>
            </div>
          ))}
          {tasks.length === 0 && <p className="text-gray-400 text-sm text-center py-4">No tasks in Marketing</p>}
        </div>
      </div>
    </div>
  );
}
