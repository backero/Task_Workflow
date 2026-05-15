import React, { useState } from 'react';
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
          <item.icon className={clsx('w-5 h-5 flex-shrink-0', isActive ? 'text-brand-600' : '')} />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">{item.label}</span>
              {open ? <ChevronDownIcon className="w-4 h-4" /> : <ChevronRightIcon className="w-4 h-4" />}
            </>
          )}
        </button>
        {!collapsed && open && (
          <div className="ml-8 mt-1 space-y-0.5 border-l-2 border-gray-200 dark:border-gray-700 pl-3">
            {item.children.map((child) => (
              <NavLink
                key={child.to}
                to={child.to}
                className={({ isActive }) =>
                  clsx('block py-1.5 px-2 rounded-md text-sm transition-colors',
                    isActive
                      ? 'text-brand-700 dark:text-brand-400 font-medium'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100')
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
      <item.icon className={clsx('w-5 h-5 flex-shrink-0', item.color || '')} />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </NavLink>
  );
}

export default function Sidebar({ collapsed, onToggle }) {
  const { user } = useAuthStore();
  const {
    can, isAdmin,
    canCRM, canInventory, canProduction, canFinance,
    canManagement, canApprovals,
  } = usePermissions();

  // ── Nav groups ──────────────────────────────────────────────────────────────
  const groups = [];

  // Overview — everyone
  groups.push({
    label: 'Overview',
    items: [{ label: 'Dashboard', to: '/', icon: HomeIcon, exact: true }],
  });

  // Work Management — Workflow Builder is primary
  const workItems = [
    { label: 'Workflow Builder', to: '/workflow', icon: BoltIcon, color: 'text-indigo-600' },
  ];
  if (canApprovals) {
    workItems.push({ label: 'Approval Queue', to: '/tasks/approvals', icon: ClipboardDocumentListIcon });
  }
  if (canCRM) {
    workItems.push({
      label: 'CRM & Sales', icon: UsersIcon, children: [
        { label: 'Lead Pipeline', to: '/crm/pipeline' },
        { label: 'Follow-up Calendar', to: '/crm/calendar' },
      ],
    });
  }
  groups.push({ label: 'Work Management', items: workItems });

  // Operations — only if at least one module is accessible
  const opsItems = [];
  if (canInventory) {
    opsItems.push({
      label: 'Inventory', icon: CubeIcon, children: [
        { label: 'Products', to: '/inventory/products' },
        { label: 'Stock Movements', to: '/inventory/movements' },
        { label: 'Low Stock Alerts', to: '/inventory/alerts' },
      ],
    });
  }
  if (canProduction) {
    opsItems.push({
      label: 'Production', icon: BoltIcon, children: [
        { label: 'Production Orders', to: '/production/orders' },
        { label: 'Quality Control', to: '/production/quality' },
        { label: 'Batch History', to: '/production/batches' },
      ],
    });
  }
  if (canFinance) {
    opsItems.push({
      label: 'Finance', icon: BanknotesIcon, children: [
        { label: 'Ledger', to: '/finance/ledger' },
        { label: 'Invoices', to: '/finance/invoices' },
        { label: 'Reports', to: '/finance/reports' },
      ],
    });
  }
  if (opsItems.length > 0) {
    groups.push({ label: 'Operations', items: opsItems });
  }

  // Departments — only show what the user can see
  const deptItems = [];
  if (can('dept.marketing'))   deptItems.push({ label: 'Marketing',   to: '/departments/marketing',   icon: MegaphoneIcon,           color: 'text-purple-600' });
  if (can('dept.marketplace')) deptItems.push({ label: 'Marketplace', to: '/departments/marketplace', icon: BuildingStorefrontIcon,   color: 'text-orange-600' });
  if (can('dept.sales'))       deptItems.push({ label: 'Sales Dept',  to: '/departments/sales',       icon: ShoppingBagIcon,          color: 'text-green-600' });
  if (can('dept.rnd'))         deptItems.push({ label: 'R&D',         to: '/departments/rnd',         icon: BeakerIcon,               color: 'text-cyan-600' });
  if (can('dept.operations'))  deptItems.push({ label: 'Operations',  to: '/departments/operations',  icon: WrenchScrewdriverIcon,    color: 'text-indigo-600' });
  if (can('dept.hr'))          deptItems.push({ label: 'HR',          to: '/departments/hr',          icon: UserGroupIcon,            color: 'text-amber-600' });
  if (deptItems.length > 0) {
    groups.push({ label: 'Departments', items: deptItems });
  }

  // Management — manager and above only
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
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-200 dark:border-gray-800">
        <div className="w-8 h-8 rounded-lg gradient-brand flex items-center justify-center flex-shrink-0">
          <span className="text-white font-bold text-sm">B</span>
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <h1 className="font-bold text-gray-900 dark:text-white text-base leading-none">Backero</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user?.organizationId?.name || 'Enterprise'}</p>
          </div>
        )}
        <button onClick={onToggle} className="ml-auto p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 hidden lg:block">
          <Bars3Icon className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {/* Department badge — shown for non-admin members */}
      {!collapsed && !isAdmin && user?.department && (
        <div className="mx-3 mt-3 px-3 py-1.5 bg-brand-50 dark:bg-brand-900/20 rounded-lg">
          <p className="text-xs font-medium text-brand-700 dark:text-brand-400 truncate">
            {user.department} · {user.role?.replace('_', ' ')}
          </p>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-4 mt-1">
        {groups.map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-3 mb-2">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavItem key={item.label} item={item} collapsed={collapsed} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* User section */}
      <div className="p-3 border-t border-gray-200 dark:border-gray-800">
        <NavLink to="/settings" className={({ isActive }) => clsx('sidebar-link', isActive ? 'sidebar-link-active' : 'sidebar-link-inactive')}>
          <CogIcon className="w-5 h-5 flex-shrink-0" />
          {!collapsed && <span>Settings</span>}
        </NavLink>
        {!collapsed && user && (
          <div className="mt-3 flex items-center gap-2 px-2">
            <div className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center flex-shrink-0">
              <span className="text-brand-700 dark:text-brand-400 font-semibold text-xs">
                {user.firstName?.[0]}{user.lastName?.[0]}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{user.firstName} {user.lastName}</p>
              <p className="text-xs text-gray-500 capitalize">{user.role?.replace('_', ' ')}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
