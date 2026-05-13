import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/axios';
import { clsx } from 'clsx';

const PLATFORMS = ['Amazon', 'Flipkart', 'Meesho', 'Myntra', 'JioMart', 'Snapdeal'];
const PLATFORM_COLORS = { Amazon: '#FF9900', Flipkart: '#2874f0', Meesho: '#f43397', Myntra: '#ff3f6c', JioMart: '#0077B6', Snapdeal: '#e40046' };

export default function MarketplaceDept() {
  const [platform, setPlatform] = useState('');

  const { data: analyticsData } = useQuery({
    queryKey: ['marketplace', 'analytics'],
    queryFn: () => api.get('/marketplace/analytics').then((r) => r.data.analytics),
  });

  const { data: tasksData } = useQuery({
    queryKey: ['marketplace', 'tasks', platform],
    queryFn: () => api.get('/marketplace/tasks', { params: { platform: platform || undefined, limit: 20 } }).then((r) => r.data),
  });

  const tasks = tasksData?.data || [];
  const platformStats = analyticsData?.platformStats || [];

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ color: '#f97316' }}>Marketplace Operations</h1>
          <p className="text-gray-500 text-sm">Multi-platform management</p>
        </div>
      </div>

      {/* Platform Health Scores */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
        {PLATFORMS.map((p) => {
          const stat = platformStats.find((s) => s._id === p);
          const rate = stat?.completionRate || 0;
          return (
            <div key={p} className={clsx('card p-3 text-center cursor-pointer border-2 transition-all', platform === p ? 'border-orange-400' : 'border-transparent')}
              onClick={() => setPlatform(platform === p ? '' : p)}>
              <div className="w-8 h-8 rounded-lg mx-auto mb-2 flex items-center justify-center text-white text-xs font-bold" style={{ background: PLATFORM_COLORS[p] }}>
                {p[0]}
              </div>
              <p className="text-xs font-semibold text-gray-900 dark:text-white">{p}</p>
              <p className={clsx('text-xs font-bold', rate >= 70 ? 'text-green-600' : rate >= 40 ? 'text-yellow-600' : 'text-red-600')}>{Math.round(rate)}%</p>
              <p className="text-xs text-gray-400">{stat?.count || 0} tasks</p>
            </div>
          );
        })}
      </div>

      <div className="card p-5">
        <h3 className="section-title">{platform ? `${platform} Tasks` : 'All Marketplace Tasks'}</h3>
        <div className="space-y-2">
          {tasks.map((task) => (
            <div key={task._id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-sm">
              <div className="w-6 h-6 rounded text-white text-xs font-bold flex items-center justify-center" style={{ background: PLATFORM_COLORS[task.platform] || '#888' }}>
                {task.platform?.[0] || '?'}
              </div>
              <span className="flex-1 text-gray-900 dark:text-white">{task.title}</span>
              <span className="text-gray-400 text-xs">{task.assignedTo?.firstName}</span>
            </div>
          ))}
          {tasks.length === 0 && <p className="text-gray-400 text-sm text-center py-4">No tasks found</p>}
        </div>
      </div>
    </div>
  );
}
