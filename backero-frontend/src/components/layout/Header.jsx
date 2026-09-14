import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, AutoComplete, Badge, Button, Dropdown, Input, Popover, Typography } from 'antd';
import {
  MenuOutlined, BellOutlined, SearchOutlined,
  LogoutOutlined, MobileOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '../../store/useAuthStore';
import { usePermissions } from '../../store/usePermissions';
import { useNotificationStore } from '../../store/useNotificationStore';
import NotificationCenter from '../common/NotificationCenter';
import { useQuery } from '@tanstack/react-query';
import api from '../../api/axios';

const { Text } = Typography;

export default function Header({ onMobileMenuToggle }) {
  const { user, logout } = useAuthStore();
  const { isAdmin } = usePermissions();
  const { unreadCount } = useNotificationStore();
  const [showNotifs, setShowNotifs] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const { data: waStatus } = useQuery({
    queryKey: ['wa-status-header'],
    queryFn: () => api.get('/whatsapp/status').then((r) => r.data),
    refetchInterval: 30000,
    staleTime: 20000,
    enabled: isAdmin,
    retry: false,
  });

  const { data: searchResults, isFetching: searching } = useQuery({
    queryKey: ['global-search', debouncedSearch],
    queryFn: () => api.get('/tasks', { params: { search: debouncedSearch, limit: 6 } }).then((r) => r.data),
    enabled: debouncedSearch.length >= 2,
    staleTime: 30000,
  });

  const handleLogout = async () => {
    try { await api.post('/auth/logout'); } catch {}
    logout();
    navigate('/login');
  };

  const waConnected = waStatus?.connected;
  const initials = `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`;

  const searchOptions = (searchResults?.data || []).map((task) => ({
    value: task._id,
    label: (
      <div style={{ padding: '4px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
              background: task.status === 'Completed' ? '#22c55e' : task.isOverdue ? '#ef4444' : '#3b82f6',
            }}
          />
          <Text ellipsis style={{ fontSize: 13, fontWeight: 500 }}>{task.title}</Text>
        </div>
        <Text type="secondary" style={{ fontSize: 11, marginLeft: 14 }}>
          {task.department} · {task.status}
        </Text>
      </div>
    ),
  }));

  const userMenuItems = [
    {
      key: 'info',
      label: (
        <div style={{ padding: '4px 4px 8px' }}>
          <Text strong style={{ display: 'block', fontSize: 13 }}>{user?.firstName} {user?.lastName}</Text>
          <Text type="secondary" style={{ fontSize: 12, textTransform: 'capitalize' }}>{user?.role?.replace('_', ' ')}</Text>
        </div>
      ),
      disabled: true,
    },
    { type: 'divider' },
    { key: 'logout', icon: <LogoutOutlined />, label: 'Sign Out', danger: true, onClick: handleLogout },
  ];

  return (
    <header
      className="relative z-20 h-14 flex-shrink-0 flex items-center px-4 lg:px-5 gap-3"
      style={{
        background: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(24px) saturate(200%)',
        borderBottom: '1px solid rgba(15,23,42,0.06)',
      }}
    >
      <Button
        type="text"
        className="lg:hidden"
        icon={<MenuOutlined />}
        onClick={onMobileMenuToggle}
      />

      {/* Global search */}
      <div className="flex-1 max-w-xs">
        <AutoComplete
          value={searchQuery}
          options={debouncedSearch.length >= 2 ? searchOptions : []}
          onChange={setSearchQuery}
          onSelect={(taskId) => { navigate(`/workflow/${taskId}`); setSearchQuery(''); }}
          notFoundContent={
            debouncedSearch.length >= 2
              ? (searching ? 'Searching…' : `No results for "${debouncedSearch}"`)
              : null
          }
          style={{ width: '100%' }}
        >
          <Input allowClear prefix={<SearchOutlined style={{ color: '#94a3b8' }} />} placeholder="Search…" />
        </AutoComplete>
      </div>

      <div className="flex items-center gap-1 ml-auto">
        {isAdmin && waStatus !== undefined && (
          <Button
            type="text"
            title={waConnected ? 'WhatsApp connected' : 'WhatsApp disconnected'}
            onClick={() => navigate('/settings/whatsapp')}
            icon={
              <Badge dot color={waConnected ? '#22c55e' : '#ef4444'} offset={[-2, 2]}>
                <MobileOutlined style={{ fontSize: 17 }} />
              </Badge>
            }
          />
        )}

        <Popover
          open={showNotifs}
          onOpenChange={setShowNotifs}
          trigger="click"
          placement="bottomRight"
          content={<div style={{ width: 380 }}><NotificationCenter onClose={() => setShowNotifs(false)} /></div>}
        >
          <Button type="text" icon={
            <Badge count={unreadCount} size="small" offset={[-2, 2]}>
              <BellOutlined style={{ fontSize: 17 }} />
            </Badge>
          } />
        </Popover>

        <div className="w-px h-5 mx-1.5" style={{ background: 'rgba(15,23,42,0.08)' }} />

        <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" trigger={['click']}>
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-black/5 transition-colors cursor-pointer">
            <Avatar size={28} src={user?.avatar} style={{ background: 'linear-gradient(135deg,#7c5a17,#a8781f,#c2a35a)', fontSize: 11, fontWeight: 700 }}>
              {initials}
            </Avatar>
            <div className="hidden sm:block text-left">
              <Text style={{ fontSize: 13, fontWeight: 600, display: 'block', lineHeight: 1.2 }}>{user?.firstName}</Text>
              <Text type="secondary" style={{ fontSize: 10, textTransform: 'capitalize', lineHeight: 1.2 }}>{user?.role?.replace('_', ' ')}</Text>
            </div>
          </div>
        </Dropdown>
      </div>
    </header>
  );
}
