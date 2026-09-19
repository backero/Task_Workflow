import {
  CalendarOutlined,
  DashboardOutlined,
  DownOutlined,
  EnvironmentOutlined,
  HistoryOutlined,
  LogoutOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {Avatar, Dropdown, Flex, Layout as AntLayout, Menu, Typography} from 'antd';
import type {MenuProps} from 'antd';
import {useState} from 'react';
import type React from 'react';
import {Outlet, useLocation, useNavigate} from 'react-router-dom';

import {useAuth} from '../auth/useAuth';
import {neutral, primary, surface} from '../theme/palette';

const BASE_NAV_ITEMS = [
  {to: '/', label: 'Dashboard', icon: DashboardOutlined},
  {to: '/attendance-history', label: 'Attendance History', icon: HistoryOutlined},
  {to: '/holidays', label: 'Holidays', icon: CalendarOutlined},
  {to: '/profile', label: 'Profile', icon: UserOutlined},
];

// Field location tracking is only meaningful for FIELD-category employees —
// mirrors apps/mobile's FieldSessionScreen, which gates on the same field.
const FIELD_SESSION_NAV_ITEM = {to: '/field-session', label: 'Field Session', icon: EnvironmentOutlined};

const SIDER_COLLAPSED_WIDTH = 72;
const SIDER_EXPANDED_WIDTH = 240;

export default function Layout(): React.JSX.Element {
  const {currentUser, employee, logout} = useAuth();
  const {pathname} = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(true);

  const navItems =
    employee?.category === 'FIELD' ? [...BASE_NAV_ITEMS, FIELD_SESSION_NAV_ITEM] : BASE_NAV_ITEMS;

  const menuItems: MenuProps['items'] = navItems.map(item => ({
    key: item.to,
    icon: <item.icon />,
    label: item.label,
  }));

  const selectedKey = navItems.find(item => item.to !== '/' && pathname.startsWith(item.to))?.to ?? (pathname === '/' ? '/' : '');
  const displayName = employee?.full_name ?? currentUser?.email ?? '';
  const initial = displayName.charAt(0).toUpperCase();

  const profileMenuItems: MenuProps['items'] = [
    {
      key: 'account',
      disabled: true,
      label: (
        <div style={{padding: '4px 0'}}>
          <Typography.Text strong style={{display: 'block'}}>
            {displayName}
          </Typography.Text>
          {currentUser?.email && employee ? (
            <Typography.Text type="secondary" style={{fontSize: 12.5}}>
              {currentUser.email}
            </Typography.Text>
          ) : null}
        </div>
      ),
    },
    {type: 'divider'},
    {key: 'profile', icon: <UserOutlined />, label: 'View profile'},
    {key: 'logout', icon: <LogoutOutlined />, label: 'Log out', danger: true},
  ];

  return (
    <AntLayout style={{minHeight: '100vh'}}>
      {/* Fixed/overlay sider — permanently removed from document flow so
          expanding it on hover never reflows the outlet; it floats above
          the content instead (see the constant marginInlineStart on the
          sibling AntLayout below, sized to the shrunk width only). */}
      <AntLayout.Sider
        collapsed={collapsed}
        collapsedWidth={SIDER_COLLAPSED_WIDTH}
        width={SIDER_EXPANDED_WIDTH}
        theme="light"
        onMouseEnter={() => setCollapsed(false)}
        onMouseLeave={() => setCollapsed(true)}
        style={{
          position: 'fixed',
          insetInlineStart: 0,
          top: 0,
          height: '100vh',
          zIndex: 1100,
          display: 'flex',
          flexDirection: 'column',
          borderInlineEnd: `1px solid ${neutral[200]}`,
          // antd pins min-width/max-width to the same value as width on
          // every collapse toggle (both snap instantly), which clamps the
          // box and defeats a `transition: width` alone — all three must
          // animate together or the container visibly snaps.
          transition:
            'width 0.3s cubic-bezier(0.4, 0, 0.2, 1), min-width 0.3s cubic-bezier(0.4, 0, 0.2, 1), max-width 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s ease',
          boxShadow: collapsed ? 'none' : '4px 0 24px rgba(15, 23, 42, 0.12)',
        }}
      >
        {/* Both marks stay mounted, stacked in the same spot, and crossfade
            via opacity — avoids the abrupt pop-in/pop-out jolt a conditional
            mount would cause during the hover-expand transition. */}
        <div style={{position: 'relative', height: 72, flexShrink: 0}}>
          <img
            src="/logo-leaf.png"
            alt="Backero"
            style={{
              position: 'absolute',
              left: 16,
              top: '50%',
              transform: 'translateY(-50%)',
              height: 38,
              width: 38,
              objectFit: 'contain',
              opacity: collapsed ? 1 : 0,
              transition: 'opacity 0.2s ease',
            }}
          />
          <img
            src="/logo.png"
            alt="Backero"
            style={{
              position: 'absolute',
              left: 16,
              top: '50%',
              transform: 'translateY(-50%)',
              height: 32,
              objectFit: 'contain',
              opacity: collapsed ? 0 : 1,
              transition: 'opacity 0.2s ease',
            }}
          />
        </div>
        <Menu
          theme="light"
          mode="inline"
          inlineCollapsed={collapsed}
          items={menuItems}
          selectedKeys={[selectedKey]}
          onClick={({key}) => navigate(key)}
          style={{flex: 1, borderInlineEnd: 'none'}}
        />
      </AntLayout.Sider>

      <AntLayout style={{marginInlineStart: SIDER_COLLAPSED_WIDTH}}>
        <AntLayout.Header
          style={{
            background: surface,
            borderBottom: `1px solid ${neutral[200]}`,
            padding: '0 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <Typography.Text strong>{displayName}</Typography.Text>
          <div style={{flex: 1}} />
          <Dropdown
            menu={{
              items: profileMenuItems,
              onClick: ({key}) => {
                if (key === 'logout') void logout();
                if (key === 'profile') navigate('/profile');
              },
            }}
            trigger={['click']}
            placement="bottomRight"
          >
            <Flex align="center" gap={8} style={{cursor: 'pointer'}}>
              <Avatar size={28} style={{backgroundColor: primary.base}}>
                {initial}
              </Avatar>
              <DownOutlined style={{fontSize: 10, color: neutral[500]}} />
            </Flex>
          </Dropdown>
        </AntLayout.Header>

        <AntLayout.Content style={{padding: 16, background: neutral[50]}}>
          <Outlet />
        </AntLayout.Content>
      </AntLayout>
    </AntLayout>
  );
}
