import React, { useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Avatar, Dropdown, Layout, Menu, Tag, Typography } from 'antd';
import {
  AppstoreOutlined,
  CheckSquareOutlined,
  DashboardOutlined,
  LogoutOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { useWorkflowAuthStore } from '../../store/useWorkflowAuthStore';
import { brand } from '../../theme/workflowTheme';
import backeroLeaf from '../../assets/backero-leaf.png';
import backeroWordmarkLight from '../../assets/Backero2.png';

const { Header, Content } = Layout;
const { Text } = Typography;

// Same fixed/overlay + hover-expand geometry as components/layout/Sidebar.jsx
// (which itself mirrors the Attendance Tracker admin-web sidebar) — kept in
// sync deliberately so both areas of the app feel identical.
const SIDER_COLLAPSED_WIDTH = 72;
const SIDER_EXPANDED_WIDTH = 240;
const SIDER_TRANSITION =
  'width 0.3s cubic-bezier(0.4, 0, 0.2, 1), min-width 0.3s cubic-bezier(0.4, 0, 0.2, 1), max-width 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s ease';

const NAV_ITEMS = [
  { key: '/workflow-v2/kanban', icon: <AppstoreOutlined />, label: 'Kanban Board' },
  { key: '/workflow-v2/my-tasks', icon: <UnorderedListOutlined />, label: 'My Tasks' },
  { key: '/workflow-v2/approvals', icon: <CheckSquareOutlined />, label: 'Approval Queue' },
  { key: '/workflow-v2/analytics', icon: <DashboardOutlined />, label: 'Analytics' },
];

export default function WorkflowLayout() {
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const collapsed = !hoverExpanded;
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useWorkflowAuthStore();

  if (!isAuthenticated()) {
    return <Navigate to="/workflow-v2/login" replace />;
  }

  const activeKey = NAV_ITEMS.find((i) => location.pathname.startsWith(i.key))?.key;

  const userMenu = {
    items: [
      {
        key: 'logout',
        icon: <LogoutOutlined />,
        label: 'Sign out',
        onClick: () => {
          logout();
          navigate('/workflow-v2/login');
        },
      },
    ],
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* Fixed/overlay sider — floats above content on hover-expand instead
          of reflowing it (constant marginInlineStart on the sibling Layout
          below, sized to the collapsed width only). */}
      <div
        onMouseEnter={() => setHoverExpanded(true)}
        onMouseLeave={() => setHoverExpanded(false)}
        style={{
          position: 'fixed',
          insetInlineStart: 0,
          top: 0,
          height: '100vh',
          zIndex: 1100,
          width: collapsed ? SIDER_COLLAPSED_WIDTH : SIDER_EXPANDED_WIDTH,
          minWidth: collapsed ? SIDER_COLLAPSED_WIDTH : SIDER_EXPANDED_WIDTH,
          maxWidth: collapsed ? SIDER_COLLAPSED_WIDTH : SIDER_EXPANDED_WIDTH,
          transition: SIDER_TRANSITION,
          background: brand.chrome,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: collapsed ? 'none' : '4px 0 24px rgba(15,23,42,0.35)',
        }}
      >
        <div style={{ position: 'relative', height: 72, flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div
            style={{
              position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
              width: 38, height: 38, borderRadius: 8, background: '#fff', padding: 5,
              opacity: collapsed ? 1 : 0, transition: 'opacity 0.2s ease',
            }}
          >
            <img src={backeroLeaf} alt="Backero" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <img
            src={backeroWordmarkLight}
            alt="Backero"
            style={{
              position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
              height: 32, objectFit: 'contain',
              opacity: collapsed ? 0 : 1, transition: 'opacity 0.2s ease',
            }}
          />
        </div>
        <Menu
          theme="dark"
          mode="inline"
          inlineCollapsed={collapsed}
          selectedKeys={activeKey ? [activeKey] : []}
          style={{ background: 'transparent', borderInlineEnd: 'none', flex: 1 }}
          items={NAV_ITEMS.map((item) => ({
            key: item.key,
            icon: item.icon,
            label: <NavLink to={item.key}>{item.label}</NavLink>,
          }))}
        />
      </div>

      <Layout style={{ marginInlineStart: SIDER_COLLAPSED_WIDTH }}>
        <Header
          style={{
            background: brand.card,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 20px',
            borderBottom: '1px solid rgba(15,23,42,0.06)',
          }}
        >
          <Tag color="gold">Phase 1 preview — new backend</Tag>
          <Dropdown menu={userMenu} placement="bottomRight">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <Avatar style={{ background: brand.gradient }}>
                {user?.first_name?.[0]}
                {user?.last_name?.[0]}
              </Avatar>
              <div style={{ lineHeight: 1.2 }}>
                <Text style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>
                  {user?.first_name} {user?.last_name}
                </Text>
                <Text type="secondary" style={{ fontSize: 11, textTransform: 'capitalize' }}>
                  {user?.role?.replace('_', ' ')}
                </Text>
              </div>
            </div>
          </Dropdown>
        </Header>
        <Content style={{ margin: 20 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
