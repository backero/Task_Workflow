import React, { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BellIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useNotificationStore } from '../../store/useNotificationStore';
import { formatDistanceToNow } from 'date-fns';
import api from '../../api/axios';
import { clsx } from 'clsx';

const PRIORITY_STYLES = {
  critical: 'border-l-red-500 bg-red-50 dark:bg-red-900/10',
  high: 'border-l-orange-500 bg-orange-50 dark:bg-orange-900/10',
  medium: 'border-l-blue-500 bg-blue-50 dark:bg-blue-900/10',
  low: 'border-l-gray-400',
};

const TYPE_ICONS = {
  task: '📋',
  approval: '✅',
  crm: '👤',
  inventory: '📦',
  production: '🏭',
  finance: '💰',
  system: '⚙️',
  escalation: '🚨',
  reminder: '⏰',
};

export default function NotificationCenter({ onClose }) {
  const { notifications, setNotifications, setUnreadCount, markRead, markAllRead } = useNotificationStore();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications?limit=30').then((r) => r.data),
  });

  useEffect(() => {
    if (data?.data) {
      setNotifications(data.data);
      setUnreadCount(data.unreadCount || 0);
    }
  }, [data]);

  const markReadMutation = useMutation({
    mutationFn: (id) => api.patch(`/notifications/${id}/read`),
    onSuccess: (_, id) => markRead(id),
  });

  const markAllMutation = useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onSuccess: () => markAllRead(),
  });

  return (
    <div className="card shadow-modal max-h-[480px] flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <BellIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          <h3 className="font-semibold text-gray-900 dark:text-white">Notifications</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => markAllMutation.mutate()}
            className="text-xs text-brand-600 hover:text-brand-700 font-medium"
          >
            Mark all read
          </button>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
            <XMarkIcon className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      </div>

      <div className="overflow-y-auto flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <BellIcon className="w-10 h-10 mb-2" />
            <p className="text-sm">No notifications</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {notifications.map((notif) => (
              <div
                key={notif._id}
                className={clsx(
                  'px-4 py-3 border-l-4 transition-colors cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50',
                  notif.isRead ? 'border-l-transparent' : PRIORITY_STYLES[notif.priority] || PRIORITY_STYLES.medium
                )}
                onClick={() => {
                  if (!notif.isRead) markReadMutation.mutate(notif._id);
                  if (notif.actionUrl) { window.location.href = notif.actionUrl; onClose(); }
                }}
              >
                <div className="flex items-start gap-3">
                  <span className="text-lg mt-0.5 flex-shrink-0">{TYPE_ICONS[notif.type] || '🔔'}</span>
                  <div className="flex-1 min-w-0">
                    <p className={clsx('text-sm font-medium', notif.isRead ? 'text-gray-600 dark:text-gray-400' : 'text-gray-900 dark:text-white')}>
                      {notif.title}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{notif.message}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                  {!notif.isRead && (
                    <div className="w-2 h-2 rounded-full bg-brand-500 mt-1.5 flex-shrink-0" />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
