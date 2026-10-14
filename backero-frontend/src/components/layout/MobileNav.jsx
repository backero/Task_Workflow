import React from 'react';
import { NavLink } from 'react-router-dom';
import { Badge } from 'antd';
import {
  HomeOutlined, ThunderboltOutlined, UnorderedListOutlined, SettingOutlined, MenuOutlined,
} from '@ant-design/icons';
import { useNotificationStore } from '../../store/useNotificationStore';

const TABS = [
  { label: 'Home',     to: '/',          icon: HomeOutlined,        exact: true },
  { label: 'Workflow', to: '/workflow',   icon: ThunderboltOutlined },
  { label: 'My Tasks', to: '/tasks/my',  icon: UnorderedListOutlined },
  { label: 'Settings', to: '/settings',  icon: SettingOutlined },
];

export default function MobileNav({ onMenuOpen }) {
  const { unreadCount } = useNotificationStore();

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-30 flex items-stretch"
      style={{
        height: 56,
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        background: '#fbfaf7',
        borderTop: '1px solid rgba(28,25,23,0.08)',
      }}
    >
      {TABS.map(({ label, to, icon: Icon, exact }) => (
        <NavLink
          key={to}
          to={to}
          end={exact}
          className="flex-1 flex flex-col items-center justify-center gap-0.5"
          style={({ isActive }) => ({
            fontSize: 10,
            fontWeight: 500,
            color: isActive ? '#669c2c' : '#6b6155',
          })}
        >
          <Icon style={{ fontSize: 18 }} />
          {label}
        </NavLink>
      ))}

      <button
        onClick={onMenuOpen}
        className="flex-1 flex flex-col items-center justify-center gap-0.5"
        style={{ fontSize: 10, fontWeight: 500, color: '#6b6155', background: 'none', border: 'none' }}
      >
        <Badge count={unreadCount} size="small" offset={[4, -2]}>
          <MenuOutlined style={{ fontSize: 18 }} />
        </Badge>
        More
      </button>
    </nav>
  );
}
