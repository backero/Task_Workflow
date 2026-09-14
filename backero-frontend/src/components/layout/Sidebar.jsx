import React, { useState } from 'react';
import companyLeaf from '../../assets/backero-leaf.png';
import companyWordmark from '../../assets/Backero.png';
import { NavLink } from 'react-router-dom';
import { Avatar, Menu, Typography } from 'antd';
import { useAuthStore } from '../../store/useAuthStore';
import { usePermissions } from '../../store/usePermissions';
import {
  Home, ClipboardList, Users, ShoppingBag,
  Box, Zap, BarChart3, Settings, Megaphone,
  Store, FlaskConical, Banknote, UsersRound,
  Wrench, Trophy, Sparkles, X,
} from 'lucide-react';

const { Text } = Typography;

// Same hover-expand geometry/easing as the Attendance Tracker admin-web
// sidebar (apps/admin-web/src/components/Layout.tsx) — collapsed rail
// floats above content (fixed position) rather than reflowing it, and
// width/min-width/max-width/box-shadow animate together so antd's own
// collapse snap doesn't fight the transition.
const SIDER_COLLAPSED_WIDTH = 72;
const SIDER_EXPANDED_WIDTH = 240;
const SIDER_TRANSITION =
  'width 0.3s cubic-bezier(0.4, 0, 0.2, 1), min-width 0.3s cubic-bezier(0.4, 0, 0.2, 1), max-width 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s ease';

function MenuIcon({ Icon }) {
  return <Icon size={16} />;
}

export { SIDER_COLLAPSED_WIDTH };

export default function Sidebar({ variant = 'desktop', onNavigate, onClose }) {
  const { user } = useAuthStore();
  const {
    can, isAdmin,
    canCRM, canInventory, canFinance,
    canManagement, canApprovals,
  } = usePermissions();

  // Mobile overlay is always fully expanded (no hover-collapse); desktop
  // rail starts collapsed and expands on hover, mirroring the reference.
  const isMobile = variant === 'mobile';
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const collapsed = isMobile ? false : !hoverExpanded;

  const groups = [];

  groups.push({
    label: 'Overview',
    items: [{ label: 'Dashboard', to: '/', icon: Home, exact: true }],
  });

  const workItems = [
    { label: 'Workflow Builder', to: '/workflow', icon: Zap },
    { label: 'Tasks (New · Beta)', to: '/workflow-v2/login', icon: Sparkles },
  ];
  if (canApprovals) workItems.push({ label: 'Approval Queue', to: '/tasks/approvals', icon: ClipboardList });
  if (canCRM) {
    workItems.push({
      label: 'CRM & Sales', icon: Users, children: [
        { label: 'Lead Pipeline', to: '/crm/pipeline' },
        { label: 'Technical Queries', to: '/crm/queries' },
      ],
    });
  }
  groups.push({ label: 'Work', items: workItems });

  const opsItems = [];
  if (canInventory) {
    opsItems.push({ label: 'Inventory', icon: Box, children: [
      { label: 'Products', to: '/inventory/products' },
      { label: 'Raw Materials', to: '/inventory/rawmaterials' },
      { label: 'Product Catalog', to: '/inventory/catalog' },
    ]});
  }
  if (canFinance) {
    opsItems.push({ label: 'Finance', icon: Banknote, children: [
      { label: 'Ledger', to: '/finance/ledger' },
      { label: 'Invoices', to: '/finance/invoices' },
      { label: 'Reports', to: '/finance/reports' },
      { label: 'Documents', to: '/documents' },
    ]});
  }
  if (canInventory) {
    const productionChildren = [
      { label: 'Dashboard',      to: '/departments/rnd' },
      { label: 'Record Usage',   to: '/production/usage' },
      { label: 'Raw Materials',   to: '/inventory/rawmaterials' },
      { label: 'Product Catalog', to: '/inventory/catalog' },
    ];
    productionChildren.push({ label: 'Sample Production', to: '/samples' });
    productionChildren.push({ label: 'R&D Price Calculator', to: '/production/rd-price-calculator' });
    productionChildren.push({ label: 'Kitchen Schedule', to: '/production/kitchen' });
    opsItems.push({ label: 'Production', icon: FlaskConical, children: productionChildren });
  }
  if (opsItems.length > 0) groups.push({ label: 'Operations', items: opsItems });

  const deptItems = [];
  if (can('dept.marketing'))   deptItems.push({ label: 'Marketing', icon: Megaphone, children: [
    { label: 'Dashboard', to: '/departments/marketing' },
    { label: 'Social Approvals', to: '/marketing/social-approvals' },
    { label: 'Social Automation', to: '/marketing/automation' },
  ]});
  if (can('dept.marketplace')) deptItems.push({ label: 'Marketplace', to: '/departments/marketplace', icon: Store });
  if (can('dept.sales'))       deptItems.push({ label: 'Sales Dept',  to: '/departments/sales',       icon: ShoppingBag });
  if (can('dept.rnd'))         deptItems.push({ label: 'Production', icon: Settings, children: [
    { label: 'Dashboard',       to: '/departments/rnd' },
    { label: 'Raw Materials',   to: '/inventory/rawmaterials' },
    { label: 'Product Catalog', to: '/inventory/catalog' },
  ]});
  if (can('dept.operations'))  deptItems.push({ label: 'Operations',  to: '/departments/operations',  icon: Wrench });
  if (can('dept.hr'))          deptItems.push({ label: 'HR',          to: '/departments/hr',          icon: UsersRound });
  if (deptItems.length > 0) groups.push({ label: 'Departments', items: deptItems });

  if (canManagement) {
    groups.push({
      label: 'Management',
      items: [
        { label: 'Team', to: '/management/team', icon: UsersRound },
        { label: 'Employee Monitor', to: '/management/employees', icon: Users },
        { label: 'Dept Analytics', to: '/management/departments', icon: BarChart3 },
        { label: 'Team Rewards', to: '/management/team-rewards', icon: Trophy },
      ],
    });
  }

  const handleNavClick = () => onNavigate?.();

  // Collapsed rail: skip the group wrapper entirely rather than just blanking its label —
  // antd still renders an (empty) .ant-menu-item-group-title box for a null-label group,
  // which showed up as uneven gaps between icon clusters at every section boundary.
  const menuItems = groups.flatMap((group) => [
    ...(collapsed ? [] : [{ type: 'group', key: `group-${group.label}`, label: group.label }]),
    ...group.items.map((item) =>
      item.children
        ? {
            key: item.label,
            icon: <MenuIcon Icon={item.icon} />,
            label: item.label,
            children: item.children.map((child) => ({
              key: child.to,
              label: <NavLink to={child.to} onClick={handleNavClick}>{child.label}</NavLink>,
            })),
          }
        : {
            key: item.to,
            icon: <MenuIcon Icon={item.icon} />,
            label: <NavLink to={item.to} end={item.exact ? '' : undefined} onClick={handleNavClick}>{item.label}</NavLink>,
          }
    ),
  ]);

  const currentPath = window.location.pathname;
  const selectedKeys = menuItems
    .flatMap((i) => (i.children ? i.children.map((c) => c.key) : [i.key]))
    .filter((key) => key && (key === currentPath || (key !== '/' && currentPath.startsWith(key))));
  const openKeys = groups
    .flatMap((g) => g.items)
    .filter((item) => item.children?.some((c) => currentPath.startsWith(c.to)))
    .map((item) => item.label);

  return (
    <div
      onMouseEnter={() => !isMobile && setHoverExpanded(true)}
      onMouseLeave={() => !isMobile && setHoverExpanded(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: isMobile ? '100%' : (collapsed ? SIDER_COLLAPSED_WIDTH : SIDER_EXPANDED_WIDTH),
        minWidth: isMobile ? undefined : (collapsed ? SIDER_COLLAPSED_WIDTH : SIDER_EXPANDED_WIDTH),
        maxWidth: isMobile ? undefined : (collapsed ? SIDER_COLLAPSED_WIDTH : SIDER_EXPANDED_WIDTH),
        transition: isMobile ? undefined : SIDER_TRANSITION,
        background: '#fbfaf7',
        borderInlineEnd: '1px solid rgba(28,25,23,0.08)',
        boxShadow: !isMobile && !collapsed ? '4px 0 24px rgba(15,23,42,0.12)' : 'none',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Logo — both marks stay mounted and crossfade via opacity, same
          pattern as the reference, to avoid a pop-in/out jolt while hovering. */}
      <div style={{ position: 'relative', height: 72, flexShrink: 0, borderBottom: '1px solid rgba(28,25,23,0.08)' }}>
        <img
          src={companyLeaf}
          alt="Backero"
          style={{
            position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
            height: 38, width: 38, objectFit: 'contain',
            opacity: collapsed ? 1 : 0, transition: 'opacity 0.2s ease',
          }}
        />
        <img
          src={companyWordmark}
          alt="Backero"
          style={{
            position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
            height: 32, objectFit: 'contain',
            opacity: collapsed ? 0 : 1, transition: 'opacity 0.2s ease',
          }}
        />
        {isMobile && (
          <button
            onClick={onClose}
            style={{
              position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
              width: 30, height: 30, borderRadius: 8, border: 'none', background: 'rgba(15,23,42,0.05)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}
          >
            <X size={13} color="#6b6155" />
          </button>
        )}
      </div>

      {/* Department badge */}
      {!collapsed && !isAdmin && user?.department && (
        <div className="mx-3 mt-3 px-3 py-1.5 rounded-lg" style={{ background: 'rgba(168,120,31,0.1)', border: '1px solid rgba(168,120,31,0.18)' }}>
          <Text style={{ color: '#7c5a17', fontSize: 11, fontWeight: 600 }} ellipsis>
            {user.department} · {user.role?.replace('_', ' ')}
          </Text>
        </div>
      )}

      {/* Scoped Menu layout fixes: antd's built-in collapsed-icon centering assumes it owns
          the full inlineCollapsedWidth math, which breaks once we shrink/pad the container
          ourselves — so icon/label alignment is taken over explicitly with flex instead. */}
      <style>{`
        /* .backero-sidebar-nav repeated to out-specificity antd's own !important collapsed-mode
           rules, which otherwise silently win and leave .ant-menu-submenu-title unstyled (found
           by measuring actual icon centers: plain items landed at x=40, submenu items at x=16 —
           two different boxes, not just off-center by a few px). Outer .ant-menu-submenu (the li
           for a submenu) and .ant-menu-item (which IS the li for a plain item) get identical
           margin/width treatment first, so both box types are structurally the same size; the
           inner .ant-menu-submenu-title then just fills 100% of that box with zero extra margin,
           instead of carrying its own separate margin like before. */
        .backero-sidebar-nav.backero-sidebar-nav .ant-menu-item,
        .backero-sidebar-nav.backero-sidebar-nav .ant-menu-submenu {
          margin-inline: 8px !important;
          margin-block: 2px !important;
          width: ${collapsed ? `${SIDER_COLLAPSED_WIDTH - 16}px` : 'calc(100% - 16px)'} !important;
        }
        .backero-sidebar-nav.backero-sidebar-nav .ant-menu-submenu-title {
          margin: 0 !important;
          width: 100% !important;
        }
        .backero-sidebar-nav.backero-sidebar-nav .ant-menu-item,
        .backero-sidebar-nav.backero-sidebar-nav .ant-menu-submenu-title {
          display: flex; align-items: center;
          padding-inline: ${collapsed ? '0' : '14px'} !important;
          justify-content: ${collapsed ? 'center' : 'flex-start'};
        }
        .backero-sidebar-nav .ant-menu-item .ant-menu-item-icon,
        .backero-sidebar-nav .ant-menu-submenu-title .ant-menu-item-icon,
        .backero-sidebar-nav .ant-menu-item > svg,
        .backero-sidebar-nav .ant-menu-submenu-title > svg {
          flex-shrink: 0; font-size: 16px;
        }
        .backero-sidebar-nav .ant-menu-title-content {
          margin-inline-start: ${collapsed ? '0' : '12px'} !important;
          overflow: hidden; text-overflow: ellipsis;
        }
        ${collapsed ? `
        /* antd keeps the submenu dropdown arrow in the DOM (10px wide) even when collapsed,
           which skews justify-content:center left for any item with children — hide it here,
           it's meaningless in the icon-only rail anyway (clicking opens a flyout, not inline). */
        .backero-sidebar-nav.backero-sidebar-nav .ant-menu-submenu-arrow { display: none !important; }
        ` : ''}
      `}</style>

      {/* Navigation */}
      <div className="backero-sidebar-nav" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingBlock: 8 }}>
        <Menu
          theme="light"
          mode="inline"
          inlineCollapsed={collapsed}
          selectedKeys={selectedKeys}
          defaultOpenKeys={openKeys}
          items={menuItems}
          style={{ background: 'transparent', borderInlineEnd: 'none' }}
        />
      </div>

      {/* Footer */}
      <div className="backero-sidebar-nav px-2 pb-3 flex-shrink-0" style={{ borderTop: '1px solid rgba(28,25,23,0.08)' }}>
        <div className="pt-3">
          <Menu
            theme="light"
            mode="inline"
            inlineCollapsed={collapsed}
            selectedKeys={currentPath === '/settings' ? ['/settings'] : []}
            items={[{ key: '/settings', icon: <MenuIcon Icon={Settings} />, label: <NavLink to="/settings" onClick={handleNavClick}>Settings</NavLink> }]}
            style={{ background: 'transparent', borderInlineEnd: 'none' }}
          />
        </div>
        {!collapsed && user && (
          <div className="mt-2 flex items-center gap-2.5 px-3 py-2 rounded-lg" style={{ background: 'rgba(15,23,42,0.04)' }}>
            <Avatar
              size={28}
              src={user.avatar}
              style={{ background: 'linear-gradient(135deg,#7c5a17,#a8781f,#c2a35a)', flexShrink: 0, fontSize: 11, fontWeight: 700 }}
            >
              {user.firstName?.[0]}{user.lastName?.[0]}
            </Avatar>
            <div className="min-w-0">
              <Text style={{ fontSize: 12, fontWeight: 600, display: 'block' }} ellipsis>
                {user.firstName} {user.lastName}
              </Text>
              <Text type="secondary" style={{ fontSize: 10, textTransform: 'capitalize' }}>
                {user.role?.replace('_', ' ')}
              </Text>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
