import React, { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Empty, List, Spin, Typography } from 'antd';
import { BellOutlined } from '@ant-design/icons';
import { useNotificationStore } from '../../store/useNotificationStore';
import { formatDistanceToNow } from 'date-fns';
import api from '../../api/axios';

const { Text } = Typography;

const PRIORITY_COLOR = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#3b82f6',
  low: '#94a3b8',
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
    <div style={{ maxHeight: 480, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10, borderBottom: '1px solid rgba(15,23,42,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BellOutlined />
          <Text strong>Notifications</Text>
        </div>
        <Button type="link" size="small" onClick={() => markAllMutation.mutate()} style={{ padding: 0 }}>
          Mark all read
        </Button>
      </div>

      <div style={{ overflowY: 'auto', flex: 1, marginTop: 4 }}>
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: 32 }}>
            <Spin />
          </div>
        ) : notifications.length === 0 ? (
          <Empty description="No notifications" style={{ padding: '24px 0' }} image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <List
            dataSource={notifications}
            renderItem={(notif) => (
              <List.Item
                key={notif._id}
                onClick={() => {
                  if (!notif.isRead) markReadMutation.mutate(notif._id);
                  if (notif.actionUrl) { window.location.href = notif.actionUrl; onClose(); }
                }}
                style={{
                  cursor: 'pointer',
                  padding: '10px 8px',
                  borderInlineStart: `3px solid ${notif.isRead ? 'transparent' : (PRIORITY_COLOR[notif.priority] || PRIORITY_COLOR.medium)}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%' }}>
                  <span style={{ fontSize: 17, flexShrink: 0 }}>{TYPE_ICONS[notif.type] || '🔔'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text strong={!notif.isRead} style={{ fontSize: 13, display: 'block' }}>{notif.title}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }} ellipsis>{notif.message}</Text>
                    <div>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        {formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true })}
                      </Text>
                    </div>
                  </div>
                  {!notif.isRead && <Badge color="#669c2c" />}
                </div>
              </List.Item>
            )}
          />
        )}
      </div>
    </div>
  );
}
