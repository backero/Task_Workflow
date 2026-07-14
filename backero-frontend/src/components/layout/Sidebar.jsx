import React, { useState } from 'react';
import companyLogo from '../../assets/Backero.png';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';
import { usePermissions } from '../../store/usePermissions';
import {
  HomeIcon, ClipboardDocumentListIcon, UsersIcon, ShoppingBagIcon,
  CubeIcon, BoltIcon, ChartBarIcon, CogIcon, MegaphoneIcon,
  BuildingStorefrontIcon, BeakerIcon, BanknotesIcon,
  ChevronDownIcon, ChevronRightIcon, Bars3Icon, UserGroupIcon,
  WrenchScrewdriverIcon,
} from '@heroicons/react/24/outline';
import { clsx } from 'clsx';

function NavItem({ item, collapsed }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  if (item.children) {
    const isActive = item.children.some((c) => location.pathname.startsWith(c.to));
    return (
      <div>
        <button
          onClick={() => setOpen((p) => !p)}
          className={clsx('sidebar-link w-full', isActive ? 'sidebar-link-active' : 'sidebar-link-inactive')}
        >
          <item.icon className="flex-shrink-0" style={{ width: '16px', height: '16px' }} />
          {!collapsed && (
            <>
              <span className="flex-1 text-left truncate">{item.label}</span>
              {open
                ? <ChevronDownIcon className="w-3.5 h-3.5 flex-shrink-0 opacity-50" />
                : <ChevronRightIcon className="w-3.5 h-3.5 flex-shrink-0 opacity-50" />}
            </>
          )}
        </button>
        {!collapsed && open && (
          <div className="ml-7 mt-0.5 space-y-px" style={{ borderLeft: '1px solid rgba(255,255,255,0.08)', paddingLeft: '10px' }}>
            {item.children.map((child) => (
              <NavLink
                key={child.to}
                to={child.to}
                className={({ isActive }) =>
                  clsx('block py-1.5 px-2.5 rounded-md text-xs font-medium transition-all duration-150',
                    isActive
                      ? 'sidebar-child-active'
                      : 'sidebar-child-inactive')
                }
              >
                {child.label}
              </NavLink>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <NavLink
      to={item.to}
      end={item.exact}
      className={({ isActive }) => clsx('sidebar-link', isActive ? 'sidebar-link-active' : 'sidebar-link-inactive')}
      title={collapsed ? item.label : undefined}
    >
      <item.icon className="flex-shrink-0" style={{ width: '16px', height: '16px' }} />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </NavLink>
  );
}

export default function Sidebar({ collapsed, onToggle }) {
  const { user } = useAuthStore();
  const {
    can, isAdmin,
    canCRM, canInventory, canFinance,
    canManagement, canApprovals,
  } = usePermissions();

  const groups = [];

  groups.push({
    label: 'Overview',
    items: [{ label: 'Dashboard', to: '/', icon: HomeIcon, exact: true }],
  });

  const workItems = [
    { label: 'Workflow Builder', to: '/workflow', icon: BoltIcon },
  ];
  if (canApprovals) workItems.push({ label: 'Approval Queue', to: '/tasks/approvals', icon: ClipboardDocumentListIcon });
  if (canCRM) {
    workItems.push({
      label: 'CRM & Sales', icon: UsersIcon, children: [
        { label: 'Lead Pipeline', to: '/crm/pipeline' },
        { label: 'Technical Queries', to: '/crm/queries' },
      ],
    });
  }
  groups.push({ label: 'Work', items: workItems });

  const opsItems = [];
  if (canInventory) {
    opsItems.push({ label: 'Inventory', icon: CubeIcon, children: [
      { label: 'Products', to: '/inventory/products' },
      { label: 'Raw Materials', to: '/inventory/rawmaterials' },
      { label: 'Product Catalog', to: '/inventory/catalog' },
    ]});
  }
  if (canFinance) {
    opsItems.push({ label: 'Finance', icon: BanknotesIcon, children: [
      { label: 'Ledger', to: '/finance/ledger' },
      { label: 'Invoices', to: '/finance/invoices' },
      { label: 'Reports', to: '/finance/reports' },
    ]});
  }
  if (canInventory) {
    opsItems.push({ label: 'Production', icon: BeakerIcon, children: [
      { label: 'Dashboard',      to: '/departments/rnd' },
      { label: 'Record Usage',   to: '/production/usage' },
      { label: 'Batch Tracker',  to: '/production/batch-tracker' },
    ]});
  }
  if (opsItems.length > 0) groups.push({ label: 'Operations', items: opsItems });

  const deptItems = [];
  if (can('dept.marketing'))   deptItems.push({ label: 'Marketing',   to: '/departments/marketing',   icon: MegaphoneIcon });
  if (can('dept.marketplace')) deptItems.push({ label: 'Marketplace', to: '/departments/marketplace', icon: BuildingStorefrontIcon });
  if (can('dept.sales'))       deptItems.push({ label: 'Sales Dept',  to: '/departments/sales',       icon: ShoppingBagIcon });
  if (can('dept.rnd'))         deptItems.push({ label: 'Production', icon: CogIcon, children: [
    { label: 'Dashboard',       to: '/departments/rnd' },
    { label: 'Raw Materials',   to: '/inventory/rawmaterials' },
    { label: 'Product Catalog', to: '/inventory/catalog' },
  ]});
  if (can('dept.operations'))  deptItems.push({ label: 'Operations',  to: '/departments/operations',  icon: WrenchScrewdriverIcon });
  if (can('dept.hr'))          deptItems.push({ label: 'HR',          to: '/departments/hr',          icon: UserGroupIcon });
  if (deptItems.length > 0) groups.push({ label: 'Departments', items: deptItems });

  if (canManagement) {
    groups.push({
      label: 'Management',
      items: [
        { label: 'Team', to: '/management/team', icon: UserGroupIcon },
        { label: 'Employee Monitor', to: '/management/employees', icon: UsersIcon },
        { label: 'Dept Analytics', to: '/management/departments', icon: ChartBarIcon },
      ],
    });
  }

  return (
    <div
      className="flex flex-col h-full chrome-bg relative overflow-hidden"
      style={{ borderRight: '1px solid var(--b-chrome)' }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-3 px-4 h-14 flex-shrink-0 relative z-10"
        style={{ borderBottom: '1px solid var(--b-chrome)' }}
      >
        <div className="w-7 h-7 rounded-lg overflow-hidden flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <img src={companyLogo} alt="Logo" className="h-5 w-auto object-contain" />
        </div>
        {!collapsed && (
          <>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-white/90 leading-tight truncate">Backero</p>
              <p className="text-[10px] text-white/30 truncate">{user?.organizationId?.name || 'Enterprise'}</p>
            </div>
            <button
              onClick={onToggle}
              className="ml-auto p-1.5 rounded-md text-white/25 hover:text-white/60 hover:bg-white/6 transition-colors hidden lg:flex"
            >
              <Bars3Icon className="w-4 h-4" />
            </button>
          </>
        )}
        {collapsed && (
          <button onClick={onToggle} className="p-1 rounded-md text-white/25 hover:text-white/60 transition-colors hidden lg:flex">
            <Bars3Icon className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Department badge */}
      {!collapsed && !isAdmin && user?.department && (
        <div className="mx-3 mt-3 px-3 py-1.5 rounded-lg" style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.15)' }}>
          <p className="text-[11px] font-semibold text-blue-300/80 truncate">
            {user.department} · {user.role?.replace('_', ' ')}
          </p>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-5 relative z-10">
        {groups.map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <p className="text-[10px] font-semibold text-white/20 uppercase tracking-[0.12em] px-3 mb-1">
                {group.label}
              </p>
            )}
            <div className="space-y-px">
              {group.items.map((item) => (
                <NavItem key={item.label} item={item} collapsed={collapsed} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-2 pb-3 flex-shrink-0 relative z-10" style={{ borderTop: '1px solid var(--b-chrome)' }}>
        <div className="pt-3">
          <NavLink
            to="/settings"
            className={({ isActive }) => clsx('sidebar-link', isActive ? 'sidebar-link-active' : 'sidebar-link-inactive')}
          >
            <CogIcon className="flex-shrink-0" style={{ width: '16px', height: '16px' }} />
            {!collapsed && <span>Settings</span>}
          </NavLink>
        </div>
        {!collapsed && user && (
          <div className="mt-2 flex items-center gap-2.5 px-3 py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
              style={{ background: 'linear-gradient(135deg,#1d4ed8,#1e40af)' }}
            >
              {user.firstName?.[0]}{user.lastName?.[0]}
            </div>
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-white/75 truncate leading-tight">
                {user.firstName} {user.lastName}
              </p>
              <p className="text-[10px] text-white/30 capitalize">{user.role?.replace('_', ' ')}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
